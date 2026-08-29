import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db, ApiKeyRow } from '../db/database';
import { verifyJwt } from '../auth/jwt';
import { CallerRole } from './permissionEngine';
import { SecurityContext } from '../security/types';
import { applyCors } from '../middleware/cors';
import { controlRepository } from '../db/controlRepository';
import { redisClient } from '../redis';
import { config } from '../config';
import { realAuthRepository } from '../auth/realAuthRepository';
import { localBillingEngine } from '../billing/localBillingEngine';

export interface ApiContext {
  organizationId: string;
  projectId: string;
  environmentId: string;
  callerRole: CallerRole;
  securityRole?: string;
  apiKey?: ApiKeyRow;
  userId?: string;
  sessionId?: string;
  apiKeyType?: 'public' | 'secret' | 'service';
  claims?: Record<string, unknown>;
  requestId: string;
}

export interface ApiGatewayRequest extends Request {
  apiContext?: ApiContext;
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_WINDOW_SECONDS = RATE_LIMIT_WINDOW_MS / 1000;

function rateLimitHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function incrementRateLimit(key: string): Promise<number> {
  return redisClient.increment(key, RATE_LIMIT_WINDOW_SECONDS);
}

function applyRateLimitHeaders(res: Response, limit: number, count: number): void {
  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
  res.setHeader('X-RateLimit-Reset', Math.ceil((Date.now() + RATE_LIMIT_WINDOW_MS) / 1000));
}

function rateLimited(res: Response): void {
  res.status(429).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Limite de requisições excedido. Tente novamente em alguns segundos.',
    },
  });
}

export class ApiGateway {
  /** Translates an externally authenticated request into the one security shape used by every engine. */
  public static toSecurityContext(ctx: ApiContext, req?: Request): SecurityContext {
    return {
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      environmentId: ctx.environmentId,
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      role: ctx.securityRole || ctx.callerRole,
      apiKeyType: ctx.apiKeyType,
      claims: ctx.claims,
      ip: req?.ip,
      userAgent: req?.headers['user-agent'],
      requestId: ctx.requestId,
      // A service key is an explicit privileged credential; callers must still opt in to a bypass.
      bypassRls: ctx.callerRole === 'service' && req?.headers['x-brisabase-service-bypass'] === 'true',
    };
  }
  /**
   * Middleware for CORS and Security Headers
   */
  public static corsAndHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!applyCors(req, res)) { res.status(403).json({ error: { code: 'CORS_ORIGIN_DENIED', message: 'Origin is not allowed.' } }); return; }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  }

  /**
   * Context Resolution & Auth Gateway
   */
  public static async gatewayMiddleware(req: ApiGatewayRequest, res: Response, next: NextFunction): Promise<void> {
    const requestId = (req.headers['x-request-id'] as string) || `req_${crypto.randomBytes(8).toString('hex')}`;
    const authHeader = req.headers['authorization'];
    res.setHeader('X-Request-ID', requestId);

    // Layer 1: pre-authentication abuse protection is keyed only by the trusted
    // Express client IP. Unvalidated tenant headers must never influence this
    // key, otherwise an attacker can rotate x-project-id to bypass the limit.
    const maxRequestsPerMinute = config.rateLimits.apiRequestsPerMinute;
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
    let preAuthCount: number;
    try {
      preAuthCount = await incrementRateLimit(`rate:api:preauth:${rateLimitHash(clientIp)}`);
    } catch (error) { next(error); return; }
    applyRateLimitHeaders(res, maxRequestsPerMinute, preAuthCount);
    if (preAuthCount > maxRequestsPerMinute) {
      rateLimited(res);
      return;
    }

    // Extract API Key from headers (apikey, x-apikey or Bearer token)
    let rawApiKey = (req.headers['apikey'] as string) || (req.headers['x-apikey'] as string);

    if (!rawApiKey && authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token.startsWith('bb_pub_') || token.startsWith('bb_sec_') || token.startsWith('bb_srv_')) {
        rawApiKey = token;
      }
    }

    let callerRole: CallerRole = 'anonymous';
    let securityRole: string = 'anonymous';
    let apiKeyObj: ApiKeyRow | undefined;
    let userId: string | undefined;
    let sessionId: string | undefined;
    let claims: Record<string, unknown> | undefined;

    const requestedProjectId = req.headers['x-project-id'] as string | undefined;
    const requestedEnvironmentId = req.headers['x-environment-id'] as string | undefined;
    const requestedOrganizationId = req.headers['x-organization-id'] as string | undefined;
    let projId = requestedProjectId || '';
    let envId = requestedEnvironmentId || '';
    let orgId = '';

    // 1. Validate API Key if provided
    if (rawApiKey) {
      const foundKey = config.testMode ? db.findApiKeyByRawKey(rawApiKey) : await controlRepository.findApiKeyByRawKey(rawApiKey);
      if (!foundKey) {
        res.status(401).json({
          error: {
            code: 'INVALID_API_KEY',
            message: 'A chave de API fornecida é inválida ou foi revogada.',
          },
        });
        return;
      }

      apiKeyObj = foundKey;
      if ((requestedProjectId && requestedProjectId !== foundKey.project_id)
        || (foundKey.environment_id && requestedEnvironmentId && requestedEnvironmentId !== foundKey.environment_id)) {
        res.status(401).json({ error: { code: 'INVALID_API_KEY_SCOPE', message: 'The requested project or environment does not match the API key scope.' } });
        return;
      }
      projId = foundKey.project_id;
      if (foundKey.environment_id) {
        envId = foundKey.environment_id;
      }

      const proj = config.testMode ? db.getProjectById(projId) : await controlRepository.getProject(projId);
      if (!proj || !envId) {
        res.status(401).json({ error: { code: 'INVALID_API_KEY_SCOPE', message: 'The API key has no valid project and environment scope.' } });
        return;
      }
      if (requestedOrganizationId && requestedOrganizationId !== proj.organization_id) {
        res.status(401).json({ error: { code: 'INVALID_API_KEY_SCOPE', message: 'The requested organization does not match the API key scope.' } });
        return;
      }
      const environment = config.testMode ? db.getEnvironmentsByProject(projId).find((item) => item.id === envId) : await controlRepository.getEnvironment(envId);
      if (!environment || environment.project_id !== projId) {
        res.status(401).json({ error: { code: 'INVALID_API_KEY_SCOPE', message: 'The API key environment is outside its project scope.' } });
        return;
      }
      orgId = proj.organization_id;

      if (foundKey.type === 'service') callerRole = 'service';
      else if (foundKey.type === 'secret') callerRole = 'authenticated';
      else callerRole = 'anonymous';
      securityRole = callerRole;
    }

    // 2. Validate JWT if provided in Bearer header (and not raw API Key)
    if (authHeader && authHeader.startsWith('Bearer ') && !rawApiKey) {
      const jwtToken = authHeader.substring(7).trim();
      try {
        const payload = verifyJwt(jwtToken);
        if ((req.headers['x-project-id'] && req.headers['x-project-id'] !== payload.project_id) || (req.headers['x-environment-id'] && req.headers['x-environment-id'] !== payload.environment_id)) throw new Error('JWT scope does not match the requested project or environment.');
        userId = payload.sub;
        sessionId = typeof payload.session_id === 'string' ? payload.session_id : undefined;
        claims = Object.fromEntries(Object.entries(payload).filter(([key]) => !['sub', 'role', 'project_id', 'environment_id', 'session_id', 'iat', 'exp', 'iss', 'aud'].includes(key)));

        // Isolation Check: If JWT explicitly belongs to project A, restrict to project A
        if (payload.project_id) projId = payload.project_id;
        if (payload.environment_id) envId = payload.environment_id;

        const proj = config.testMode ? db.getProjectById(projId) : await controlRepository.getProject(projId);
        const environment = config.testMode ? db.getEnvironmentsByProject(projId).find((item) => item.id === envId) : await controlRepository.getEnvironment(envId);
        if (!proj || !environment || environment.project_id !== projId) throw new Error('JWT project or environment scope is invalid.');
        if (!config.testMode) {
          const [session, user] = await Promise.all([realAuthRepository.findSession(String(payload.session_id || '')), realAuthRepository.findUserById(payload.sub)]);
          if (!session || session.user_id !== payload.sub || session.project_id !== projId || session.environment_id !== envId || !user || user.project_id !== projId || user.environment_id !== envId || user.status !== 'active') throw new Error('JWT session is invalid or revoked.');
        }
        orgId = proj.organization_id;

        callerRole = payload.role === 'admin' || payload.role === 'owner' ? 'admin' : 'authenticated';
        securityRole = String(payload.role || 'authenticated');
      } catch (err: any) {
        res.status(401).json({
          error: {
            code: 'INVALID_JWT',
            message: err.message || 'Token JWT inválido ou expirado.',
          },
        });
        return;
      }
    }

    if (!projId || !envId) {
      res.status(400).json({ error: { code: 'PROJECT_SCOPE_REQUIRED', message: 'Project and environment scope are required.' } });
      return;
    }
    if (!orgId) {
      const project = config.testMode ? db.getProjectById(projId) : await controlRepository.getProject(projId);
      const environment = config.testMode ? db.getEnvironmentsByProject(projId).find((item) => item.id === envId) : await controlRepository.getEnvironment(envId);
      if (!project || !environment || environment.project_id !== projId) {
        res.status(400).json({ error: { code: 'INVALID_PROJECT_SCOPE', message: 'Project or environment scope is invalid.' } });
        return;
      }
      orgId = project.organization_id;
    }

    // Layer 2: after authentication/scope resolution, rate-limit a stable
    // server-validated tenant/principal identity. Raw x-project-id values are
    // deliberately excluded from the key until they have been resolved above.
    const principal = apiKeyObj
      ? `api-key:${apiKeyObj.id}`
      : userId
        ? `user:${userId}`
        : `anonymous-ip:${clientIp}`;
    const scopedKey = `${orgId}:${projId}:${envId}:${principal}`;
    let scopedCount: number;
    try {
      scopedCount = await incrementRateLimit(`rate:api:scope:${rateLimitHash(scopedKey)}`);
    } catch (error) { next(error); return; }
    applyRateLimitHeaders(res, maxRequestsPerMinute, scopedCount);
    if (scopedCount > maxRequestsPerMinute) {
      try {
        if (config.testMode) {
          db.logAudit({ organization_id: orgId, project_id: projId, environment_id: envId, user_id: userId || principal, action: 'api.rate_limited', resource_type: 'api', metadata: { ip: clientIp, path: req.path, layer: 'validated_scope' } });
        } else {
          await controlRepository.logAudit({ organization_id: orgId, project_id: projId, environment_id: envId, user_id: userId || principal, action: 'api.rate_limited', resource_type: 'api', metadata: { ip: clientIp, path: req.path, layer: 'validated_scope' }, ip_address: clientIp, user_agent: req.headers['user-agent'] });
        }
      } catch {
        // Rate limiting remains fail-closed even if optional audit persistence fails.
      }
      rateLimited(res);
      return;
    }

    // Meter authenticated/anonymous REST requests against the organization's plan.
    // Paid plans use overage billing; the Free plan is fail-closed at its monthly API quota.
    if (!config.testMode) {
      try { await localBillingEngine.meterApiRequest(orgId, requestId); }
      catch (error: any) {
        if (error?.code === 'PLAN_LIMIT_EXCEEDED') {
          res.status(429).json({ error: { code: 'PLAN_LIMIT_EXCEEDED', message: error.message, metric: error.metric, used: error.used, limit: error.limit } });
          return;
        }
        next(error); return;
      }
    }

    // Attach resolved context to request
    req.apiContext = {
      organizationId: orgId,
      projectId: projId,
      environmentId: envId,
      callerRole,
      securityRole,
      apiKey: apiKeyObj,
      userId,
      sessionId,
      apiKeyType: apiKeyObj?.type,
      claims,
      requestId,
    };

    next();
  }
}
