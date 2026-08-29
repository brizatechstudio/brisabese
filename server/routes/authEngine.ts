import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db/database';
import { authDatabase, AuthUserRow } from '../db/authDatabase';
import {
  hashPassword,
  verifyPassword,
  generateRandomToken,
  hashToken,
  encryptSecret,
  decryptSecret,
  normalizeEmail,
} from '../auth/cryptoUtils';
import { signJwt, verifyJwt, JwtPayload } from '../auth/jwt';
import { generateTotpSecret, verifyTotpCode, generateMfaRecoveryCodes } from '../auth/mfa';
import { getOAuthProvider } from '../auth/oauth';
import { emailService } from '../auth/emailService';
import { authRateLimiter, sensitiveActionRateLimiter } from '../auth/rateLimiter';
import { logger } from '../logger';

export const authEngineRouter = Router();

/**
 * Management endpoints are addressed by project and environment in the URL.
 * The authentication middleware binds those values after validating a token
 * or API key, so a path cannot be used to escape the authenticated scope.
 */
function managementScopeGuard(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  const managementRoles = ['owner', 'admin', 'developer', 'service'];
  if (!user || !managementRoles.includes(user.role)) {
    return res.status(403).json({ error: 'Management access is required' });
  }

  const scopedProjectId = req.headers['x-project-id'] as string | undefined;
  const scopedEnvironmentId = req.headers['x-environment-id'] as string | undefined;
  const { projectId, environmentId } = req.params;
  if (
    (scopedProjectId && scopedProjectId !== projectId) ||
    (scopedEnvironmentId && scopedEnvironmentId !== environmentId)
  ) {
    return res.status(403).json({ error: 'Requested resource is outside the authenticated scope' });
  }

  next();
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

function recordAudit(action: string, req: Request, details: {
  userId?: string;
  projectId?: string;
  environmentId?: string;
  resourceId?: string;
  metadata?: any;
}) {
  try {
    db.logAudit({
      organization_id: (req.headers['x-organization-id'] as string) || 'org_core_1',
      project_id: details.projectId || (req.headers['x-project-id'] as string) || 'proj_main_1',
      environment_id: details.environmentId || (req.headers['x-environment-id'] as string) || 'env_prod_1',
      user_id: details.userId || 'system',
      action,
      resource_type: 'auth',
      resource_id: details.resourceId,
      metadata: details.metadata,
      ip_address: req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1',
      user_agent: req.headers['user-agent'],
    });
  } catch (err) {
    logger.error('Erro ao registrar log de auditoria de auth:', err);
  }
}

// ----------------------------------------------------
// PUBLIC AUTH API (APPLICATIONS & END USERS)
// ----------------------------------------------------

// POST /api/auth/signup
authEngineRouter.post('/api/auth/signup', async (req: Request, res: Response): Promise<void> => {
  const {
    email,
    password,
    display_name,
    project_id = 'proj_main_1',
    environment_id = 'env_prod_1',
    user_metadata,
  } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'E-mail e senha são obrigatórios.' } });
    return;
  }

  const rateCheck = authRateLimiter.check(`signup:${req.ip}`);
  if (!rateCheck.allowed) {
    res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: `Muitas tentativas. Tente novamente em ${rateCheck.retryAfterSeconds}s.` } });
    return;
  }

  const settings = authDatabase.getSettings(project_id, environment_id);
  if (!settings.allow_signups) {
    res.status(403).json({ error: { code: 'SIGNUPS_DISABLED', message: 'Novos cadastros estão desativados para este ambiente.' } });
    return;
  }

  if (password.length < settings.minimum_password_length) {
    res.status(400).json({
      error: { code: 'PASSWORD_TOO_SHORT', message: `A senha deve conter no mínimo ${settings.minimum_password_length} caracteres.` },
    });
    return;
  }

  const normEmail = normalizeEmail(email);
  const existingUser = authDatabase.findUserByEmail(project_id, environment_id, normEmail);
  if (existingUser) {
    authRateLimiter.recordFailure(`signup:${req.ip}`);
    res.status(409).json({ error: { code: 'USER_EXISTS', message: 'Um usuário com este e-mail já existe.' } });
    return;
  }

  const pwdHash = hashPassword(password);
  const isPending = settings.require_email_verification;

  const newUser = authDatabase.createUser({
    project_id,
    environment_id,
    email: normEmail,
    email_verified: !isPending,
    display_name: display_name || normEmail.split('@')[0],
    password_hash: pwdHash,
    role: 'user',
    status: isPending ? 'pending' : 'active',
    provider: 'email',
    user_metadata: user_metadata || {},
    app_metadata: {},
  });

  // Create Identity
  authDatabase.createIdentity({
    user_id: newUser.id,
    project_id,
    environment_id,
    provider: 'email',
    provider_user_id: newUser.id,
    provider_email: newUser.email,
  });

  recordAudit('auth.signup', req, {
    userId: newUser.id,
    projectId: project_id,
    environmentId: environment_id,
    metadata: { email: newUser.email, provider: 'email' },
  });

  if (isPending) {
    const verificationToken = generateRandomToken(32);
    const tokenHash = hashToken(verificationToken);
    authDatabase.createVerificationToken({
      user_id: newUser.id,
      project_id,
      environment_id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 86400000 * 2).toISOString(), // 48h
    });

    await emailService.sendVerificationEmail(newUser.email, verificationToken);

    res.status(201).json({
      user: {
        id: newUser.id,
        email: newUser.email,
        email_verified: false,
        display_name: newUser.display_name,
        status: newUser.status,
      },
      message: 'Usuário cadastrado com sucesso. Um e-mail de verificação foi enviado.',
    });
    return;
  }

  // Create Session
  const session = authDatabase.createSession({
    user_id: newUser.id,
    project_id,
    environment_id,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    device_name: 'Navegador Web',
    expires_at: new Date(Date.now() + settings.session_lifetime_seconds * 1000).toISOString(),
  });

  const accessToken = signJwt(
    {
      sub: newUser.id,
      project_id,
      environment_id,
      session_id: session.id,
      role: newUser.role,
      email: newUser.email,
    },
    settings.jwt_access_lifetime_seconds
  );

  const rawRefreshToken = generateRandomToken(32);
  const familyId = `fam_${crypto.randomUUID()}`;
  authDatabase.createRefreshToken({
    session_id: session.id,
    token_hash: hashToken(rawRefreshToken),
    user_id: newUser.id,
    project_id,
    environment_id,
    family_id: familyId,
    expires_at: new Date(Date.now() + settings.refresh_token_lifetime_seconds * 1000).toISOString(),
  });

  res.status(201).json({
    user: {
      id: newUser.id,
      email: newUser.email,
      email_verified: newUser.email_verified,
      display_name: newUser.display_name,
      avatar_url: newUser.avatar_url,
      role: newUser.role,
      created_at: newUser.created_at,
    },
    session: {
      access_token: accessToken,
      refresh_token: rawRefreshToken,
      expires_in: settings.jwt_access_lifetime_seconds,
      token_type: 'Bearer',
      session_id: session.id,
    },
  });
});

// POST /api/auth/login
authEngineRouter.post('/api/auth/login', async (req: Request, res: Response): Promise<void> => {
  const {
    email,
    password,
    project_id = 'proj_main_1',
    environment_id = 'env_prod_1',
    totp_code,
  } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'E-mail e senha são obrigatórios.' } });
    return;
  }

  const rateKey = `login:${req.ip}:${email}`;
  const rateCheck = authRateLimiter.check(rateKey);
  if (!rateCheck.allowed) {
    recordAudit('auth.login_failed', req, {
      projectId: project_id,
      environmentId: environment_id,
      metadata: { email, reason: 'rate_limited' },
    });
    res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: `Muitas tentativas incorretas. Bloqueado por ${rateCheck.retryAfterSeconds}s.` } });
    return;
  }

  const user = authDatabase.findUserByEmail(project_id, environment_id, email);
  if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
    authRateLimiter.recordFailure(rateKey);
    recordAudit('auth.login_failed', req, {
      projectId: project_id,
      environmentId: environment_id,
      metadata: { email, reason: 'invalid_credentials' },
    });
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.' } });
    return;
  }

  if (user.status === 'disabled' || user.status === 'banned') {
    res.status(403).json({ error: { code: 'ACCOUNT_BLOCKED', message: 'Sua conta está desativada ou banida.' } });
    return;
  }

  const settings = authDatabase.getSettings(project_id, environment_id);
  const mfaFactors = authDatabase.findMfaFactorsByUserId(user.id);

  if (settings.require_mfa || mfaFactors.length > 0) {
    if (!totp_code) {
      res.status(200).json({
        mfa_required: true,
        message: 'Código MFA TOTP é obrigatório para concluir o login.',
      });
      return;
    }

    let mfaValid = false;
    for (const factor of mfaFactors) {
      const secret = decryptSecret(factor.secret_encrypted);
      if (verifyTotpCode(secret, totp_code)) {
        mfaValid = true;
        break;
      }
    }

    if (!mfaValid) {
      // Try recovery code
      const codeHash = hashToken(totp_code);
      mfaValid = authDatabase.verifyAndConsumeRecoveryCode(user.id, codeHash);
    }

    if (!mfaValid) {
      authRateLimiter.recordFailure(rateKey);
      recordAudit('auth.mfa_failed', req, { userId: user.id, projectId: project_id, environmentId: environment_id });
      res.status(401).json({ error: { code: 'INVALID_MFA_CODE', message: 'Código MFA / Recuperação inválido.' } });
      return;
    }
  }

  authRateLimiter.reset(rateKey);

  // Update last sign in
  authDatabase.updateUser(user.id, { last_sign_in_at: new Date().toISOString() });

  // Create Session
  const session = authDatabase.createSession({
    user_id: user.id,
    project_id,
    environment_id,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    device_name: 'Navegador Web',
    expires_at: new Date(Date.now() + settings.session_lifetime_seconds * 1000).toISOString(),
  });

  const accessToken = signJwt(
    {
      sub: user.id,
      project_id,
      environment_id,
      session_id: session.id,
      role: user.role,
      email: user.email,
    },
    settings.jwt_access_lifetime_seconds
  );

  const rawRefreshToken = generateRandomToken(32);
  const familyId = `fam_${crypto.randomUUID()}`;
  authDatabase.createRefreshToken({
    session_id: session.id,
    token_hash: hashToken(rawRefreshToken),
    user_id: user.id,
    project_id,
    environment_id,
    family_id: familyId,
    expires_at: new Date(Date.now() + settings.refresh_token_lifetime_seconds * 1000).toISOString(),
  });

  recordAudit('auth.login', req, {
    userId: user.id,
    projectId: project_id,
    environmentId: environment_id,
    metadata: { session_id: session.id },
  });

  res.json({
    user: {
      id: user.id,
      email: user.email,
      email_verified: user.email_verified,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      role: user.role,
      status: user.status,
      last_sign_in_at: user.last_sign_in_at,
    },
    session: {
      access_token: accessToken,
      refresh_token: rawRefreshToken,
      expires_in: settings.jwt_access_lifetime_seconds,
      token_type: 'Bearer',
      session_id: session.id,
    },
  });
});

// POST /api/auth/logout
authEngineRouter.post('/api/auth/logout', async (req: Request, res: Response): Promise<void> => {
  const token = getBearerToken(req);
  if (token) {
    try {
      const payload = verifyJwt(token);
      authDatabase.revokeSession(payload.session_id);
      recordAudit('auth.logout', req, { userId: payload.sub, projectId: payload.project_id, environmentId: payload.environment_id });
    } catch {
      // Ignored
    }
  }
  res.json({ message: 'Sessão encerrada com sucesso.' });
});

// POST /api/auth/logout-all
authEngineRouter.post('/api/auth/logout-all', async (req: Request, res: Response): Promise<void> => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token de acesso não fornecido.' } });
    return;
  }

  try {
    const payload = verifyJwt(token);
    const count = authDatabase.revokeAllUserSessions(payload.sub);
    recordAudit('auth.logout_all', req, { userId: payload.sub, projectId: payload.project_id, environmentId: payload.environment_id, metadata: { revoked_count: count } });
    res.json({ message: `Todas as ${count} sessões do usuário foram revogadas.` });
  } catch (err: any) {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: err.message } });
  }
});

// GET /api/auth/user
authEngineRouter.get('/api/auth/user', async (req: Request, res: Response): Promise<void> => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token de acesso não fornecido.' } });
    return;
  }

  try {
    const payload = verifyJwt(token);
    const session = authDatabase.findSessionById(payload.session_id);
    if (!session) {
      res.status(401).json({ error: { code: 'SESSION_REVOKED', message: 'Sessão revogada ou expirada.' } });
      return;
    }

    const user = authDatabase.findUserById(payload.sub);
    if (!user || user.status === 'disabled' || user.status === 'banned') {
      res.status(403).json({ error: { code: 'USER_DISABLED', message: 'Usuário desativado ou banido.' } });
      return;
    }

    authDatabase.touchSession(session.id);

    res.json({
      id: user.id,
      email: user.email,
      email_verified: user.email_verified,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      role: user.role,
      status: user.status,
      provider: user.provider,
      user_metadata: user.user_metadata,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
    });
  } catch (err: any) {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: err.message } });
  }
});

// POST /api/auth/refresh
authEngineRouter.post('/api/auth/refresh', async (req: Request, res: Response): Promise<void> => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Refresh token é obrigatório.' } });
    return;
  }

  const tokenHash = hashToken(refresh_token);
  const existingToken = authDatabase.findRefreshTokenByHash(tokenHash);

  if (!existingToken) {
    res.status(401).json({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token inválido.' } });
    return;
  }

  // Token reuse detection on revoked token -> Revoke entire token family
  if (existingToken.revoked_at) {
    logger.warn(`[Security Alert] Reutilização de refresh token revogado detectada. Revogando família: ${existingToken.family_id}`);
    authDatabase.revokeRefreshTokenFamily(existingToken.family_id);
    authDatabase.revokeSession(existingToken.session_id);
    recordAudit('auth.session_revoked', req, {
      userId: existingToken.user_id,
      projectId: existingToken.project_id,
      environmentId: existingToken.environment_id,
      metadata: { reason: 'token_reuse_detected', family_id: existingToken.family_id },
    });
    res.status(401).json({ error: { code: 'TOKEN_REUSE_DETECTED', message: 'Sessão revogada por motivos de segurança.' } });
    return;
  }

  if (new Date(existingToken.expires_at).getTime() < Date.now()) {
    res.status(401).json({ error: { code: 'EXPIRED_REFRESH_TOKEN', message: 'Refresh token expirado.' } });
    return;
  }

  const session = authDatabase.findSessionById(existingToken.session_id);
  if (!session) {
    res.status(401).json({ error: { code: 'SESSION_EXPIRED', message: 'Sessão associada foi revogada.' } });
    return;
  }

  const user = authDatabase.findUserById(existingToken.user_id);
  if (!user || user.status === 'disabled' || user.status === 'banned') {
    res.status(403).json({ error: { code: 'USER_DISABLED', message: 'Usuário desativado.' } });
    return;
  }

  // Rotate Refresh Token
  authDatabase.revokeRefreshToken(existingToken.id);

  const settings = authDatabase.getSettings(existingToken.project_id, existingToken.environment_id);
  const newRawRefreshToken = generateRandomToken(32);

  authDatabase.createRefreshToken({
    session_id: session.id,
    token_hash: hashToken(newRawRefreshToken),
    user_id: user.id,
    project_id: existingToken.project_id,
    environment_id: existingToken.environment_id,
    family_id: existingToken.family_id,
    expires_at: new Date(Date.now() + settings.refresh_token_lifetime_seconds * 1000).toISOString(),
  });

  const newAccessToken = signJwt(
    {
      sub: user.id,
      project_id: existingToken.project_id,
      environment_id: existingToken.environment_id,
      session_id: session.id,
      role: user.role,
      email: user.email,
    },
    settings.jwt_access_lifetime_seconds
  );

  recordAudit('auth.refresh', req, {
    userId: user.id,
    projectId: existingToken.project_id,
    environmentId: existingToken.environment_id,
  });

  res.json({
    access_token: newAccessToken,
    refresh_token: newRawRefreshToken,
    expires_in: settings.jwt_access_lifetime_seconds,
    token_type: 'Bearer',
  });
});

// POST /api/auth/verify-email
authEngineRouter.post('/api/auth/verify-email', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.body;
  if (!token) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Token de verificação é obrigatório.' } });
    return;
  }

  const tokenHash = hashToken(token);
  const vt = authDatabase.findVerificationTokenByHash(tokenHash);

  if (!vt) {
    res.status(400).json({ error: { code: 'INVALID_OR_EXPIRED_TOKEN', message: 'Token de verificação inválido ou expirado.' } });
    return;
  }

  authDatabase.markVerificationTokenUsed(vt.id);
  authDatabase.updateUser(vt.user_id, { email_verified: true, status: 'active' });

  recordAudit('auth.email_verified', req, { userId: vt.user_id, projectId: vt.project_id, environmentId: vt.environment_id });

  res.json({ message: 'E-mail verificado com sucesso. Sua conta está ativa.' });
});

// POST /api/auth/resend-verification
authEngineRouter.post('/api/auth/resend-verification', async (req: Request, res: Response): Promise<void> => {
  const { email, project_id = 'proj_main_1', environment_id = 'env_prod_1' } = req.body;
  if (!email) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'E-mail é obrigatório.' } });
    return;
  }

  const rateCheck = sensitiveActionRateLimiter.check(`resend:${email}`);
  if (!rateCheck.allowed) {
    res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Aguarde antes de solicitar novo e-mail.' } });
    return;
  }

  sensitiveActionRateLimiter.recordFailure(`resend:${email}`);

  const user = authDatabase.findUserByEmail(project_id, environment_id, email);
  if (user && !user.email_verified) {
    const rawToken = generateRandomToken(32);
    authDatabase.createVerificationToken({
      user_id: user.id,
      project_id,
      environment_id,
      token_hash: hashToken(rawToken),
      expires_at: new Date(Date.now() + 86400000 * 2).toISOString(),
    });
    await emailService.sendVerificationEmail(user.email, rawToken);
  }

  // Generic message to prevent email enumeration
  res.json({ message: 'Se o e-mail for válido e não verificado, um novo link de confirmação foi enviado.' });
});

// POST /api/auth/password-reset/request
authEngineRouter.post('/api/auth/password-reset/request', async (req: Request, res: Response): Promise<void> => {
  const { email, project_id = 'proj_main_1', environment_id = 'env_prod_1' } = req.body;
  if (!email) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'E-mail é obrigatório.' } });
    return;
  }

  const user = authDatabase.findUserByEmail(project_id, environment_id, email);
  if (user) {
    const rawToken = generateRandomToken(32);
    authDatabase.createPasswordResetToken({
      user_id: user.id,
      project_id,
      environment_id,
      token_hash: hashToken(rawToken),
      expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour
    });

    await emailService.sendPasswordResetEmail(user.email, rawToken);
    recordAudit('auth.password_reset_requested', req, { userId: user.id, projectId: project_id, environmentId: environment_id });
  }

  // Generic response for privacy
  res.json({ message: 'Se o e-mail estiver cadastrado, as instruções para redefinição de senha foram enviadas.' });
});

// POST /api/auth/password-reset/confirm
authEngineRouter.post('/api/auth/password-reset/confirm', async (req: Request, res: Response): Promise<void> => {
  const { token, new_password } = req.body;
  if (!token || !new_password) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Token e nova senha são obrigatórios.' } });
    return;
  }

  const tokenHash = hashToken(token);
  const prt = authDatabase.findPasswordResetTokenByHash(tokenHash);
  if (!prt) {
    res.status(400).json({ error: { code: 'INVALID_OR_EXPIRED_TOKEN', message: 'Token de redefinição inválido ou expirado.' } });
    return;
  }

  const settings = authDatabase.getSettings(prt.project_id, prt.environment_id);
  if (new_password.length < settings.minimum_password_length) {
    res.status(400).json({ error: { code: 'PASSWORD_TOO_SHORT', message: `Senha deve ter no mínimo ${settings.minimum_password_length} caracteres.` } });
    return;
  }

  authDatabase.markPasswordResetTokenUsed(prt.id);
  authDatabase.updateUser(prt.user_id, { password_hash: hashPassword(new_password) });
  authDatabase.revokeAllUserSessions(prt.user_id);

  recordAudit('auth.password_reset_completed', req, { userId: prt.user_id, projectId: prt.project_id, environmentId: prt.environment_id });

  res.json({ message: 'Senha redefinida com sucesso. Todas as sessões anteriores foram encerradas.' });
});

// POST /api/auth/password/change
authEngineRouter.post('/api/auth/password/change', async (req: Request, res: Response): Promise<void> => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token de acesso não fornecido.' } });
    return;
  }

  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Senha atual e nova senha são obrigatórias.' } });
    return;
  }

  try {
    const payload = verifyJwt(token);
    const user = authDatabase.findUserById(payload.sub);
    if (!user || !user.password_hash || !verifyPassword(current_password, user.password_hash)) {
      res.status(400).json({ error: { code: 'INVALID_CURRENT_PASSWORD', message: 'A senha atual está incorreta.' } });
      return;
    }

    const settings = authDatabase.getSettings(payload.project_id, payload.environment_id);
    if (new_password.length < settings.minimum_password_length) {
      res.status(400).json({ error: { code: 'PASSWORD_TOO_SHORT', message: `Mínimo de ${settings.minimum_password_length} caracteres.` } });
      return;
    }

    authDatabase.updateUser(user.id, { password_hash: hashPassword(new_password) });
    authDatabase.revokeAllUserSessions(user.id);

    recordAudit('auth.password_changed', req, { userId: user.id, projectId: payload.project_id, environmentId: payload.environment_id });

    res.json({ message: 'Senha alterada com sucesso. Todas as outras sessões foram encerradas.' });
  } catch (err: any) {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: err.message } });
  }
});

// OAUTH ROUTES
authEngineRouter.get('/api/auth/oauth/:provider', async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.params;
  const { project_id = 'proj_main_1', environment_id = 'env_prod_1', redirect_url } = req.query as any;

  try {
    const providersConfig = authDatabase.getProviders(project_id, environment_id);
    const provConfig = providersConfig.find((p) => p.id === provider);

    if (!provConfig || !provConfig.enabled) {
      res.status(400).json({ error: { code: 'PROVIDER_DISABLED', message: `O provedor ${provider} não está ativado.` } });
      return;
    }

    const oauth = getOAuthProvider(provider, provConfig.client_id, provConfig.client_secret_encrypted);
    const state = JSON.stringify({ project_id, environment_id, redirect_url });
    const authUrl = await oauth.getAuthorizationUrl(state, provConfig.redirect_url);

    res.redirect(authUrl);
  } catch (err: any) {
    res.status(500).json({ error: { code: 'OAUTH_ERROR', message: err.message } });
  }
});

authEngineRouter.get('/api/auth/oauth/:provider/callback', async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.params;
  const { code, state } = req.query as any;

  let projectId = 'proj_main_1';
  let environmentId = 'env_prod_1';

  if (state) {
    try {
      const parsed = JSON.parse(state);
      if (parsed.project_id) projectId = parsed.project_id;
      if (parsed.environment_id) environmentId = parsed.environment_id;
    } catch {
      // Ignore
    }
  }

  try {
    const providersConfig = authDatabase.getProviders(projectId, environmentId);
    const provConfig = providersConfig.find((p) => p.id === provider);

    const oauth = getOAuthProvider(provider, provConfig?.client_id, provConfig?.client_secret_encrypted);
    const identity = await oauth.handleCallback(code, provConfig?.redirect_url || 'https://api.brisabase.dev/auth/v1/oauth/callback');

    // Find existing identity or user
    let existingIdentity = authDatabase.findIdentityByProviderAndId(projectId, environmentId, provider as any, identity.providerUserId);
    let user: AuthUserRow | null = null;

    if (existingIdentity) {
      user = authDatabase.findUserById(existingIdentity.user_id);
    } else {
      user = authDatabase.findUserByEmail(projectId, environmentId, identity.email);
    }

    if (!user) {
      user = authDatabase.createUser({
        project_id: projectId,
        environment_id: environmentId,
        email: identity.email,
        email_verified: true,
        display_name: identity.displayName,
        avatar_url: identity.avatarUrl,
        provider: provider as any,
        role: 'user',
        status: 'active',
        user_metadata: identity.metadata || {},
        app_metadata: {},
      });
    }

    if (!existingIdentity) {
      authDatabase.createIdentity({
        user_id: user.id,
        project_id: projectId,
        environment_id: environmentId,
        provider: provider as any,
        provider_user_id: identity.providerUserId,
        provider_email: identity.email,
        metadata: identity.metadata,
      });
      recordAudit('auth.identity_linked', req, { userId: user.id, projectId, environmentId, metadata: { provider } });
    }

    const settings = authDatabase.getSettings(projectId, environmentId);
    const session = authDatabase.createSession({
      user_id: user.id,
      project_id: projectId,
      environment_id: environmentId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      device_name: `${provider} OAuth Login`,
      expires_at: new Date(Date.now() + settings.session_lifetime_seconds * 1000).toISOString(),
    });

    const accessToken = signJwt(
      {
        sub: user.id,
        project_id: projectId,
        environment_id: environmentId,
        session_id: session.id,
        role: user.role,
        email: user.email,
      },
      settings.jwt_access_lifetime_seconds
    );

    const rawRefreshToken = generateRandomToken(32);
    authDatabase.createRefreshToken({
      session_id: session.id,
      token_hash: hashToken(rawRefreshToken),
      user_id: user.id,
      project_id: projectId,
      environment_id: environmentId,
      family_id: `fam_${crypto.randomUUID()}`,
      expires_at: new Date(Date.now() + settings.refresh_token_lifetime_seconds * 1000).toISOString(),
    });

    recordAudit('auth.oauth_login', req, { userId: user.id, projectId, environmentId, metadata: { provider } });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        role: user.role,
        provider: user.provider,
      },
      session: {
        access_token: accessToken,
        refresh_token: rawRefreshToken,
        expires_in: settings.jwt_access_lifetime_seconds,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'OAUTH_FAILED', message: err.message } });
  }
});

// MFA API
authEngineRouter.post('/api/auth/mfa/enroll', async (req: Request, res: Response): Promise<void> => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token não fornecido.' } });
    return;
  }

  try {
    const payload = verifyJwt(token);
    const { secret, otpauthUrl } = generateTotpSecret();
    const encryptedSecret = encryptSecret(secret);

    const factor = authDatabase.createMfaFactor({
      user_id: payload.sub,
      project_id: payload.project_id,
      environment_id: payload.environment_id,
      type: 'totp',
      secret_encrypted: encryptedSecret,
    });

    res.json({
      factor_id: factor.id,
      secret,
      otpauth_url: otpauthUrl,
      message: 'Escaneie o QR code com seu aplicativo autenticador e confirme com um código.',
    });
  } catch (err: any) {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: err.message } });
  }
});

authEngineRouter.post('/api/auth/mfa/verify', async (req: Request, res: Response): Promise<void> => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token não fornecido.' } });
    return;
  }

  const { factor_id, code } = req.body;
  if (!factor_id || !code) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Factor ID e código são obrigatórios.' } });
    return;
  }

  try {
    const payload = verifyJwt(token);
    const factors = authDatabase.findMfaFactorsByUserId(payload.sub);
    const targetFactor = factors.find((f) => f.id === factor_id) || factors[0];

    if (!targetFactor) {
      res.status(404).json({ error: { code: 'MFA_FACTOR_NOT_FOUND', message: 'Fator MFA não encontrado.' } });
      return;
    }

    const secret = decryptSecret(targetFactor.secret_encrypted);
    if (!verifyTotpCode(secret, code)) {
      res.status(400).json({ error: { code: 'INVALID_TOTP_CODE', message: 'Código TOTP incorreto.' } });
      return;
    }

    authDatabase.verifyMfaFactor(targetFactor.id);

    // Generate Recovery Codes
    const { rawCodes, hashedCodes } = generateMfaRecoveryCodes(10);
    authDatabase.setMfaRecoveryCodes(payload.sub, targetFactor.id, hashedCodes);

    recordAudit('auth.mfa_enabled', req, { userId: payload.sub, projectId: payload.project_id, environmentId: payload.environment_id });

    res.json({
      message: 'MFA ativado com sucesso!',
      recovery_codes: rawCodes,
    });
  } catch (err: any) {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: err.message } });
  }
});

authEngineRouter.post('/api/auth/mfa/disable', async (req: Request, res: Response): Promise<void> => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token não fornecido.' } });
    return;
  }

  try {
    const payload = verifyJwt(token);
    authDatabase.disableMfaFactorsForUser(payload.sub);
    recordAudit('auth.mfa_disabled', req, { userId: payload.sub, projectId: payload.project_id, environmentId: payload.environment_id });
    res.json({ message: 'MFA desativado com sucesso.' });
  } catch (err: any) {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: err.message } });
  }
});

// ----------------------------------------------------
// BRISABASE MANAGEMENT API (ADMIN CONSOLE TABS)
// ----------------------------------------------------

authEngineRouter.use(
  '/api/projects/:projectId/environments/:environmentId/auth',
  managementScopeGuard,
);

// GET /api/projects/:projectId/environments/:environmentId/auth/users
authEngineRouter.get('/api/projects/:projectId/environments/:environmentId/auth/users', (req: Request, res: Response) => {
  const { projectId, environmentId } = req.params;
  const { search = '' } = req.query as any;

  const users = authDatabase.listUsers(projectId, environmentId, search);
  res.json(users);
});

// POST /api/projects/:projectId/environments/:environmentId/auth/users
authEngineRouter.post('/api/projects/:projectId/environments/:environmentId/auth/users', (req: Request, res: Response): void => {
  const { projectId, environmentId } = req.params;
  const { name, email, role = 'user', provider = 'email', password } = req.body;

  if (!email) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'E-mail é obrigatório.' } });
    return;
  }

  try {
    const newUser = authDatabase.createUser({
      project_id: projectId,
      environment_id: environmentId,
      email,
      email_verified: true,
      display_name: name || email.split('@')[0],
      password_hash: password ? hashPassword(password) : undefined,
      role,
      status: 'active',
      provider,
      user_metadata: {},
      app_metadata: {},
    });

    recordAudit('auth.admin_user_created', req, { userId: newUser.id, projectId, environmentId, metadata: { email } });

    res.status(201).json(newUser);
  } catch (err: any) {
    res.status(400).json({ error: { code: 'CREATE_FAILED', message: err.message } });
  }
});

// PATCH /api/projects/:projectId/environments/:environmentId/auth/users/:userId/status
authEngineRouter.patch('/api/projects/:projectId/environments/:environmentId/auth/users/:userId/status', (req: Request, res: Response): void => {
  const { userId } = req.params;
  const { status } = req.body;

  try {
    const updated = authDatabase.updateUser(userId, { status });
    if (status === 'disabled' || status === 'banned') {
      authDatabase.revokeAllUserSessions(userId);
    }
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: { code: 'UPDATE_FAILED', message: err.message } });
  }
});

// DELETE /api/projects/:projectId/environments/:environmentId/auth/users/:userId
authEngineRouter.delete('/api/projects/:projectId/environments/:environmentId/auth/users/:userId', (req: Request, res: Response) => {
  const { userId } = req.params;
  authDatabase.deleteUser(userId);
  res.status(204).send();
});

// GET /api/projects/:projectId/environments/:environmentId/auth/providers
authEngineRouter.get('/api/projects/:projectId/environments/:environmentId/auth/providers', (req: Request, res: Response) => {
  const { projectId, environmentId } = req.params;
  const providers = authDatabase.getProviders(projectId, environmentId);
  res.json(providers);
});

// PATCH /api/projects/:projectId/environments/:environmentId/auth/providers/:providerId
authEngineRouter.patch('/api/projects/:projectId/environments/:environmentId/auth/providers/:providerId', (req: Request, res: Response): void => {
  const { projectId, environmentId, providerId } = req.params;
  const { enabled, clientId, clientSecret } = req.body;

  try {
    const updated = authDatabase.updateProvider(projectId, environmentId, providerId, {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(clientId !== undefined ? { client_id: clientId } : {}),
      ...(clientSecret ? { client_secret_encrypted: encryptSecret(clientSecret) } : {}),
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: { code: 'PROVIDER_UPDATE_FAILED', message: err.message } });
  }
});

// GET /api/projects/:projectId/environments/:environmentId/auth/sessions
authEngineRouter.get('/api/projects/:projectId/environments/:environmentId/auth/sessions', (req: Request, res: Response) => {
  const { projectId, environmentId } = req.params;
  const sessions = authDatabase.listSessions(projectId, environmentId);
  res.json(sessions);
});

// POST /api/projects/:projectId/environments/:environmentId/auth/sessions/:sessionId/revoke
authEngineRouter.post('/api/projects/:projectId/environments/:environmentId/auth/sessions/:sessionId/revoke', (req: Request, res: Response): void => {
  const { sessionId } = req.params;
  const revoked = authDatabase.revokeSession(sessionId);
  if (!revoked) {
    res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Sessão não encontrada.' } });
    return;
  }
  res.json({ message: 'Sessão revogada com sucesso.' });
});

// GET /api/projects/:projectId/environments/:environmentId/auth/settings
authEngineRouter.get('/api/projects/:projectId/environments/:environmentId/auth/settings', (req: Request, res: Response) => {
  const { projectId, environmentId } = req.params;
  const settings = authDatabase.getSettings(projectId, environmentId);
  res.json(settings);
});

// PATCH /api/projects/:projectId/environments/:environmentId/auth/settings
authEngineRouter.patch('/api/projects/:projectId/environments/:environmentId/auth/settings', (req: Request, res: Response) => {
  const { projectId, environmentId } = req.params;
  const updated = authDatabase.updateSettings(projectId, environmentId, req.body);
  res.json(updated);
});
