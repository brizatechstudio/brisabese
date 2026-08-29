import crypto from 'node:crypto';
import { Request, Response, Router } from 'express';
import { signJwt, verifyJwt } from '../auth/jwt';
import { hashPasswordAsync, verifyPasswordAsync, hashToken, generateRandomToken, normalizeEmail } from '../auth/cryptoUtils';
import { generateTotpSecret, verifyTotpCode, generateMfaRecoveryCodes } from '../auth/mfa';
import { adminAuthRepository, AdminUser } from '../auth/adminAuthRepository';
import { redisClient } from '../redis';
import { config } from '../config';
import { emailService } from '../auth/emailService';
import { controlRepository } from '../db/controlRepository';
import { enterpriseEngine } from '../enterprise/enterpriseEngine';
import { CONTROL_PLANE_ENVIRONMENT, CONTROL_PLANE_PROJECT } from '../middleware/auth';

export const adminAuthRouter = Router();

type AdminRequest = Request & { adminUser?: AdminUser; adminSessionId?: string };

function publicUser(user: AdminUser) {
  return { id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url, status: user.status, role: user.role, mfa_enabled: user.mfa_enabled, created_at: user.created_at, last_login_at: user.last_login_at };
}

function send(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

async function rate(key: string, limit: number, windowSeconds = 60): Promise<boolean> {
  return (await redisClient.increment(`rate:admin:${crypto.createHash('sha256').update(key).digest('hex')}`, windowSeconds)) <= limit;
}

function bearer(req: Request): string | null {
  const value = req.headers.authorization;
  return value?.startsWith('Bearer ') ? value.slice(7).trim() : null;
}

async function issue(user: AdminUser, req: Request, authMethod = 'password', organizationId?: string) {
  const expiresAt = new Date(Date.now() + config.auth.jwtRefreshTokenTtlSeconds * 1000).toISOString();
  const { session, refreshToken } = await adminAuthRepository.createSession({
    user_id: user.id,
    expires_at: expiresAt,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    auth_method: authMethod,
    organization_id: organizationId,
  });
  const accessToken = signJwt({
    sub: user.id,
    project_id: CONTROL_PLANE_PROJECT,
    environment_id: CONTROL_PLANE_ENVIRONMENT,
    session_id: session.id,
    role: user.role,
    email: user.email,
    token_use: 'control_plane',
  }, config.auth.jwtAccessTokenTtlSeconds);
  return { access_token: accessToken, refresh_token: refreshToken, expires_in: config.auth.jwtAccessTokenTtlSeconds, token_type: 'Bearer', session_id: session.id, user: publicUser(user) };
}

const REFRESH_COOKIE = 'brisabase_admin_refresh';
function cookie(req: Request, name: string): string | null {
  const source = String(req.headers.cookie || '');
  for (const part of source.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}
function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, { httpOnly: true, secure: config.cookies.secure, sameSite: config.cookies.sameSite as 'strict' | 'lax' | 'none', domain: config.cookies.domain, path: '/api/admin/auth', maxAge: config.auth.jwtRefreshTokenTtlSeconds * 1000 });
}
function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: config.cookies.secure, sameSite: config.cookies.sameSite as 'strict' | 'lax' | 'none', domain: config.cookies.domain, path: '/api/admin/auth' });
}

function verifyControlPlaneJwt(token: string) {
  const payload = verifyJwt(token);
  if (payload.token_use !== 'control_plane' || payload.project_id !== CONTROL_PLANE_PROJECT || payload.environment_id !== CONTROL_PLANE_ENVIRONMENT) {
    throw new Error('Token is not an administrative session.');
  }
  return payload;
}

function validBootstrapToken(req: Request): boolean {
  const expected = config.auth.bootstrapToken;
  const supplied = String(req.headers['x-admin-bootstrap-token'] || req.body?.bootstrap_token || '');
  if (!expected || !supplied) return false;
  const expectedHash = hashToken(expected); const suppliedHash = hashToken(supplied);
  return crypto.timingSafeEqual(Buffer.from(expectedHash, 'hex'), Buffer.from(suppliedHash, 'hex'));
}

// POST /api/admin/auth/signup — create a BrisaBase admin user
adminAuthRouter.post('/api/admin/auth/signup', async (req, res) => {
  try {
    if (!await rate(`signup:${req.ip}`, 5, 3_600)) return send(res, 429, 'RATE_LIMIT_EXCEEDED', 'Too many signup attempts.');
    const email = normalizeEmail(String(req.body?.email || ''));
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || email.split('@')[0]);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, 'INVALID_EMAIL', 'A valid email is required.');
    if (password.length < 12) return send(res, 400, 'PASSWORD_TOO_SHORT', 'Password must contain at least 12 characters.');
    const bootstrap = await adminAuthRepository.countPasswordUsers() === 0;
    if (bootstrap && !validBootstrapToken(req)) return send(res, 403, 'BOOTSTRAP_TOKEN_REQUIRED', 'A valid one-time bootstrap token is required to create the first owner.');
    const existing = await adminAuthRepository.findUserByEmail(email);
    if (existing?.password_hash) return send(res, 409, 'USER_EXISTS', 'A user with this email already exists.');
    if (existing && !bootstrap) return send(res, 409, 'USER_EXISTS', 'A passwordless invitation can only be claimed through an organization invitation flow.');
    const user = existing
      ? await adminAuthRepository.claimPasswordlessUser(existing.id, { name, password, role: 'owner' })
      : await adminAuthRepository.createUser({ email, name, password, role: bootstrap ? 'owner' : 'viewer' });
    if (!user) return send(res, 409, 'USER_EXISTS', 'The account could not be initialized.');
    if (bootstrap && !existing) {
      await controlRepository.createOrganization({
        name: `${name || 'BrisaBase'} Organization`,
        slug: `brisabase-${user.id.slice(-12)}`,
        owner_id: user.id,
      });
    }
    res.status(201).json({
      user: publicUser(user),
      message: bootstrap ? 'Owner account and initial organization created.' : 'Account created. An organization administrator must grant you access.',
    });
  } catch (error: any) {
    send(res, 500, 'ADMIN_AUTH_ERROR', error?.message || 'Unable to create the account.');
  }
});

// POST /api/admin/auth/login — authenticate a BrisaBase admin user
adminAuthRouter.post('/api/admin/auth/login', async (req, res) => {
  try {
    const email = normalizeEmail(String(req.body?.email || ''));
    const password = String(req.body?.password || '');
    if (!email || !password) return send(res, 400, 'INVALID_INPUT', 'email and password are required.');
    if (!await rate(`login:${req.ip}:${email}`, 10, 300)) return send(res, 429, 'RATE_LIMIT_EXCEEDED', 'Too many login attempts.');
    const user = await adminAuthRepository.findUserByEmail(email);
    if (!user || !user.password_hash || !await verifyPasswordAsync(password, user.password_hash)) return send(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    if (user.status === 'blocked' || user.status === 'inactive') return send(res, 403, 'ACCOUNT_BLOCKED', 'This account is disabled.');
    if (user.mfa_enabled) {
      const totpCode = String(req.body?.totp_code || '');
      if (!totpCode) {
        return res.status(200).json({ mfa_required: true, message: 'MFA code is required.', user_id: user.id });
      }
      const secret = await adminAuthRepository.getMfaSecret(user.id);
      let mfaValid = secret ? verifyTotpCode(secret, totpCode) : false;
      if (!mfaValid) {
        mfaValid = await adminAuthRepository.verifyAndConsumeRecoveryCode(user.id, hashToken(totpCode));
      }
      if (!mfaValid) return send(res, 401, 'INVALID_MFA_CODE', 'Invalid MFA or recovery code.');
    }
    await adminAuthRepository.updateUser(user.id, { last_login_at: new Date().toISOString() });
    const updated = (await adminAuthRepository.findUserById(user.id))!;
    const session = await issue(updated, req);
    setRefreshCookie(res, session.refresh_token);
    res.json(session);
  } catch (error: any) {
    send(res, 500, 'ADMIN_AUTH_ERROR', error?.message || 'Unable to sign in.');
  }
});

// POST /api/admin/auth/sso/exchange — one-time enterprise SSO ticket exchange.
adminAuthRouter.post('/api/admin/auth/sso/exchange', async (req, res) => {
  try {
    const ticket = String(req.body?.ticket || '');
    if (!ticket) return send(res, 400, 'INVALID_INPUT', 'ticket is required.');
    const exchange = await enterpriseEngine.consumeSsoTicket(ticket);
    if (!exchange?.userId || !exchange?.organizationId || !exchange?.authMethod) return send(res, 401, 'INVALID_SSO_TICKET', 'SSO ticket is invalid or expired.');
    const user = await adminAuthRepository.findUserById(exchange.userId);
    if (!user || user.status !== 'active') return send(res, 403, 'ACCOUNT_BLOCKED', 'This account is disabled.');
    await adminAuthRepository.updateUser(user.id, { last_login_at: new Date().toISOString() });
    const updated = (await adminAuthRepository.findUserById(user.id))!;
    const session = await issue(updated, req, exchange.authMethod, exchange.organizationId);
    setRefreshCookie(res, session.refresh_token);
    res.json({ ...session, organization_id: exchange.organizationId });
  } catch { send(res, 401, 'INVALID_SSO_TICKET', 'SSO ticket is invalid or expired.'); }
});

// POST /api/admin/auth/refresh — rotate refresh token
adminAuthRouter.post('/api/admin/auth/refresh', async (req, res) => {
  try {
    const refreshToken = String(req.body?.refresh_token || cookie(req, REFRESH_COOKIE) || '');
    if (!refreshToken) return send(res, 400, 'INVALID_INPUT', 'refresh_token is required.');
    const record = await adminAuthRepository.findRefreshToken(hashToken(refreshToken));
    if (!record) return send(res, 401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token.');
    const [session, user] = await Promise.all([
      adminAuthRepository.findSession(record.session_id),
      adminAuthRepository.findUserById(record.user_id),
    ]);
    if (!session || !user || user.status !== 'active') return send(res, 401, 'SESSION_EXPIRED', 'Session is no longer active.');
    await adminAuthRepository.revokeRefreshToken(record.id);
    await adminAuthRepository.revokeSession(session.id);
    const newSession = await adminAuthRepository.createSession({ user_id: user.id, expires_at: new Date(Date.now() + config.auth.jwtRefreshTokenTtlSeconds * 1000).toISOString(), ip_address: req.ip, user_agent: req.headers['user-agent'], auth_method: session.auth_method || 'password', organization_id: session.organization_id });
    setRefreshCookie(res, newSession.refreshToken);
    res.json({
      access_token: signJwt({ sub: user.id, project_id: CONTROL_PLANE_PROJECT, environment_id: CONTROL_PLANE_ENVIRONMENT, session_id: newSession.session.id, role: user.role, email: user.email, token_use: 'control_plane' }, config.auth.jwtAccessTokenTtlSeconds),
      refresh_token: newSession.refreshToken,
      expires_in: config.auth.jwtAccessTokenTtlSeconds,
      token_type: 'Bearer',
      session_id: newSession.session.id,
    });
  } catch (error: any) {
    send(res, 401, 'INVALID_REFRESH_TOKEN', error?.message || 'Invalid or expired refresh token.');
  }
});

// GET /api/admin/auth/me — current admin user
adminAuthRouter.get('/api/admin/auth/me', async (req: AdminRequest, res) => {
  try {
    const token = bearer(req);
    if (!token) return send(res, 401, 'UNAUTHORIZED', 'Token is required.');
    const payload = verifyControlPlaneJwt(token);
    const [session, user] = await Promise.all([
      adminAuthRepository.findSession(payload.session_id),
      adminAuthRepository.findUserById(payload.sub),
    ]);
    if (!session) return send(res, 401, 'SESSION_REVOKED', 'Session is revoked or expired.');
    if (!user || user.status === 'blocked' || user.status === 'inactive') return send(res, 403, 'USER_DISABLED', 'User is disabled.');
    await adminAuthRepository.touchSession(session.id);
    res.json(publicUser(user));
  } catch {
    send(res, 401, 'INVALID_TOKEN', 'Invalid or expired token.');
  }
});

// POST /api/admin/auth/logout — revoke current session
adminAuthRouter.post('/api/admin/auth/logout', async (req, res) => {
  const token = bearer(req);
  if (token) {
    try {
      const payload = verifyControlPlaneJwt(token);
      await adminAuthRepository.revokeSession(payload.session_id);
    } catch { /* logout remains idempotent */ }
  }
  clearRefreshCookie(res);
  res.json({ message: 'Session closed.' });
});

// POST /api/admin/auth/logout-all — revoke all sessions for the user
adminAuthRouter.post('/api/admin/auth/logout-all', async (req, res) => {
  try {
    const token = bearer(req);
    if (!token) return send(res, 401, 'UNAUTHORIZED', 'Token is required.');
    const payload = verifyControlPlaneJwt(token);
    const count = await adminAuthRepository.revokeUserSessions(payload.sub);
    clearRefreshCookie(res);
    res.json({ message: `Revoked ${count} sessions.` });
  } catch {
    send(res, 401, 'INVALID_TOKEN', 'Invalid or expired token.');
  }
});

// POST /api/admin/auth/password-reset/request
adminAuthRouter.post('/api/admin/auth/password-reset/request', async (req, res) => {
  try {
    const email = normalizeEmail(String(req.body?.email || ''));
    const user = await adminAuthRepository.findUserByEmail(email);
    if (user) {
      const token = generateRandomToken(32);
      await adminAuthRepository.updateUser(user.id, {});
      // Store reset token in Redis with 1h TTL
      await redisClient.set(`admin:reset:${hashToken(token)}`, { user_id: user.id }, 3600);
      await emailService.sendPasswordResetEmail(user.email, token, config.publicUrl('/reset-password'));
      if (process.env.NODE_ENV !== 'production') {
        res.json({ message: 'If the account exists, reset instructions were sent.', dev_token: token });
        return;
      }
    }
    res.json({ message: 'If the account exists, reset instructions were sent.' });
  } catch {
    res.json({ message: 'If the account exists, reset instructions were sent.' });
  }
});

// POST /api/admin/auth/password-reset/confirm
adminAuthRouter.post('/api/admin/auth/password-reset/confirm', async (req, res) => {
  try {
    const token = String(req.body?.token || '');
    const newPassword = String(req.body?.new_password || '');
    if (!token || newPassword.length < 12) return send(res, 400, 'INVALID_INPUT', 'token and a password of at least 12 characters are required.');
    const record = await redisClient.get(`admin:reset:${hashToken(token)}`) as { user_id: string } | null;
    if (!record?.user_id) return send(res, 400, 'INVALID_OR_EXPIRED_TOKEN', 'Invalid or expired reset token.');
    await adminAuthRepository.updateUser(record.user_id, { password_hash: await hashPasswordAsync(newPassword) });
    await adminAuthRepository.revokeUserSessions(record.user_id);
    await redisClient.del(`admin:reset:${hashToken(token)}`);
    res.json({ message: 'Password reset completed.' });
  } catch {
    send(res, 400, 'INVALID_OR_EXPIRED_TOKEN', 'Invalid or expired reset token.');
  }
});

// POST /api/admin/auth/mfa/setup — generate TOTP secret
adminAuthRouter.post('/api/admin/auth/mfa/setup', async (req: AdminRequest, res) => {
  try {
    const token = bearer(req);
    if (!token) return send(res, 401, 'UNAUTHORIZED', 'Token is required.');
    const payload = verifyControlPlaneJwt(token);
    const user = await adminAuthRepository.findUserById(payload.sub);
    if (!user) return send(res, 404, 'USER_NOT_FOUND', 'User not found.');
    const { secret, otpauthUrl } = generateTotpSecret();
    await adminAuthRepository.setMfaSecret(user.id, secret);
    res.json({ secret, otpauth_url: otpauthUrl });
  } catch {
    send(res, 401, 'INVALID_TOKEN', 'Invalid or expired token.');
  }
});

// POST /api/admin/auth/mfa/enable — verify TOTP and enable MFA
adminAuthRouter.post('/api/admin/auth/mfa/enable', async (req: AdminRequest, res) => {
  try {
    const token = bearer(req);
    if (!token) return send(res, 401, 'UNAUTHORIZED', 'Token is required.');
    const payload = verifyControlPlaneJwt(token);
    const user = await adminAuthRepository.findUserById(payload.sub);
    if (!user) return send(res, 404, 'USER_NOT_FOUND', 'User not found.');
    const code = String(req.body?.totp_code || '');
    const secret = await adminAuthRepository.getMfaSecret(user.id);
    if (!secret || !verifyTotpCode(secret, code)) return send(res, 401, 'INVALID_MFA_CODE', 'Invalid TOTP code.');
    await adminAuthRepository.enableMfa(user.id);
    const { rawCodes, hashedCodes } = generateMfaRecoveryCodes();
    await adminAuthRepository.createRecoveryCodes(user.id, hashedCodes);
    res.json({ message: 'MFA enabled.', recovery_codes: rawCodes });
  } catch {
    send(res, 401, 'INVALID_TOKEN', 'Invalid or expired token.');
  }
});

// POST /api/admin/auth/mfa/disable
adminAuthRouter.post('/api/admin/auth/mfa/disable', async (req: AdminRequest, res) => {
  try {
    const token = bearer(req);
    if (!token) return send(res, 401, 'UNAUTHORIZED', 'Token is required.');
    const payload = verifyControlPlaneJwt(token);
    const user = await adminAuthRepository.findUserById(payload.sub);
    if (!user) return send(res, 404, 'USER_NOT_FOUND', 'User not found.');
    const code = String(req.body?.totp_code || '');
    const secret = await adminAuthRepository.getMfaSecret(user.id);
    if (!secret || !verifyTotpCode(secret, code)) return send(res, 401, 'INVALID_MFA_CODE', 'Invalid TOTP code.');
    await adminAuthRepository.disableMfa(user.id);
    res.json({ message: 'MFA disabled.' });
  } catch {
    send(res, 401, 'INVALID_TOKEN', 'Invalid or expired token.');
  }
});

// POST /api/admin/auth/mfa/recovery-codes — regenerate recovery codes
adminAuthRouter.post('/api/admin/auth/mfa/recovery-codes', async (req: AdminRequest, res) => {
  try {
    const token = bearer(req);
    if (!token) return send(res, 401, 'UNAUTHORIZED', 'Token is required.');
    const payload = verifyControlPlaneJwt(token);
    const user = await adminAuthRepository.findUserById(payload.sub);
    if (!user) return send(res, 404, 'USER_NOT_FOUND', 'User not found.');
    const { rawCodes, hashedCodes } = generateMfaRecoveryCodes();
    await adminAuthRepository.createRecoveryCodes(user.id, hashedCodes);
    res.json({ recovery_codes: rawCodes });
  } catch {
    send(res, 401, 'INVALID_TOKEN', 'Invalid or expired token.');
  }
});
