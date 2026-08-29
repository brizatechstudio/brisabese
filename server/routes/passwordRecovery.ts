import { Request, Response, Router } from 'express';
import { controlRepository } from '../db/controlRepository';
import { postgres } from '../db/postgres';
import { realAuthRepository } from '../auth/realAuthRepository';
import { emailService } from '../auth/emailService';
import { generateRandomToken, hashPasswordAsync, hashToken, normalizeEmail } from '../auth/cryptoUtils';
import { redisClient } from '../redis';
import { logger } from '../logger';

export const passwordRecoveryRouter = Router();

const genericMessage = 'If the account exists, reset instructions were sent.';

type ResetRecord = {
  id: string;
  user_id: string;
  project_id: string;
  environment_id: string;
};

function send(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

function bodyScope(req: Request): { projectId: string; environmentId: string } | null {
  const projectId = req.body?.project_id || req.headers['x-project-id'];
  const environmentId = req.body?.environment_id || req.headers['x-environment-id'];
  return typeof projectId === 'string' && typeof environmentId === 'string'
    ? { projectId, environmentId }
    : null;
}

async function validScope(scope: { projectId: string; environmentId: string }): Promise<boolean> {
  const [project, environment] = await Promise.all([
    controlRepository.getProject(scope.projectId),
    controlRepository.getEnvironment(scope.environmentId),
  ]);
  return Boolean(project && environment && environment.project_id === project.id);
}

async function withinRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const count = await redisClient.increment(`rate:auth:${hashToken(key)}`, windowSeconds);
  return count <= limit;
}

/**
 * Password-reset requests deliberately return the same public response whether
 * the account exists, SMTP is unavailable, or the request has been rate-limited.
 * This prevents the endpoint from becoming an account-enumeration oracle while
 * still allowing operators to diagnose provider failures through internal logs.
 */
passwordRecoveryRouter.post('/api/auth/password-reset/request', async (req: Request, res: Response) => {
  const scoped = bodyScope(req);
  const emailValue = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
  if (!scoped || !emailValue) {
    send(res, 400, 'INVALID_INPUT', 'email, project_id, and environment_id are required.');
    return;
  }

  if (!await validScope(scoped)) {
    send(res, 400, 'INVALID_SCOPE', 'Project and environment scope is invalid.');
    return;
  }

  try {
    const allowed = await withinRateLimit(`password-reset:${req.ip}:${emailValue}`, 5, 3_600);
    if (!allowed) {
      res.json({ message: genericMessage });
      return;
    }

    const user = await realAuthRepository.findUserByEmail(scoped.projectId, scoped.environmentId, emailValue);
    if (!user) {
      res.json({ message: genericMessage });
      return;
    }

    const mailHealth = await emailService.healthCheck();
    if (mailHealth.status !== 'ok' || mailHealth.disabled) {
      logger.warn('Password reset email was not attempted because SMTP is unavailable.', {
        projectId: scoped.projectId,
        environmentId: scoped.environmentId,
      });
      res.json({ message: genericMessage });
      return;
    }

    const token = generateRandomToken(32);
    await realAuthRepository.createPasswordResetToken(
      user.id,
      user.project_id,
      user.environment_id,
      hashToken(token),
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    );
    await emailService.sendPasswordResetEmail(user.email, token);
    res.json({ message: genericMessage });
  } catch (error) {
    logger.warn('Password reset request could not be delivered.', {
      projectId: scoped.projectId,
      environmentId: scoped.environmentId,
      reason: error instanceof Error ? error.message : String(error),
    });
    // Keep the response opaque even when SMTP or persistence is temporarily down.
    res.json({ message: genericMessage });
  }
});

/**
 * Reset confirmation is transactional. Password policy is checked before the
 * one-time token is claimed, so a typo/short password does not burn the link.
 * Once claimed, password replacement and revocation of sessions/refresh tokens
 * commit atomically; any failure rolls the token claim back as well.
 */
passwordRecoveryRouter.post('/api/auth/password-reset/confirm', async (req: Request, res: Response) => {
  const rawToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const newPassword = typeof req.body?.new_password === 'string' ? req.body.new_password : '';
  if (!rawToken || !newPassword) {
    send(res, 400, 'INVALID_INPUT', 'token and new_password are required.');
    return;
  }

  const tokenHash = hashToken(rawToken);
  try {
    if (!await withinRateLimit(`password-reset-confirm:${req.ip}:${tokenHash}`, 10, 900)) {
      send(res, 429, 'RATE_LIMIT_EXCEEDED', 'Too many password reset attempts.');
      return;
    }

    const record = (await postgres.query<ResetRecord>(
      `SELECT id,user_id,project_id,environment_id
         FROM auth_password_reset_tokens
        WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()
        LIMIT 1`,
      [tokenHash],
    ))[0];
    if (!record) {
      send(res, 400, 'INVALID_OR_EXPIRED_TOKEN', 'Invalid or expired reset token.');
      return;
    }

    const settings = await realAuthRepository.settings(record.project_id, record.environment_id);
    if (newPassword.length < settings.minimum_password_length) {
      send(res, 400, 'PASSWORD_TOO_SHORT', `Password must have at least ${settings.minimum_password_length} characters.`);
      return;
    }

    // Hash outside the DB transaction so the intentionally expensive password
    // KDF does not hold a PostgreSQL connection/row lock while it runs.
    const passwordHash = await hashPasswordAsync(newPassword);

    const completed = await postgres.transaction(async (client) => {
      const claimed = await client.query<ResetRecord>(
        `UPDATE auth_password_reset_tokens
            SET used_at=now()
          WHERE id=$1 AND token_hash=$2 AND used_at IS NULL AND expires_at > now()
          RETURNING id,user_id,project_id,environment_id`,
        [record.id, tokenHash],
      );
      const active = claimed.rows[0];
      if (!active) return false;

      const user = await client.query<{ id: string }>(
        `UPDATE auth_users
            SET password_hash=$2,updated_at=now()
          WHERE id=$1 AND project_id=$3 AND environment_id=$4
          RETURNING id`,
        [active.user_id, passwordHash, active.project_id, active.environment_id],
      );
      if (!user.rows[0]) throw new Error('Password reset user is outside the token scope.');

      await client.query(
        'UPDATE auth_sessions SET revoked_at=now(),updated_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
        [active.user_id],
      );
      await client.query(
        'UPDATE auth_refresh_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
        [active.user_id],
      );
      // A successful password change invalidates older reset emails for the same
      // account so only the newest completed recovery can remain authoritative.
      await client.query(
        'UPDATE auth_password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',
        [active.user_id],
      );
      return true;
    });

    if (!completed) {
      send(res, 400, 'INVALID_OR_EXPIRED_TOKEN', 'Invalid or expired reset token.');
      return;
    }

    res.json({ message: 'Password reset completed.' });
  } catch (error) {
    logger.error('Password reset confirmation failed.', {
      reason: error instanceof Error ? error.message : String(error),
    });
    send(res, 500, 'AUTH_ERROR', 'Password reset could not be completed. Please try again.');
  }
});
