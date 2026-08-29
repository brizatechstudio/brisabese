import crypto from 'node:crypto';
import { NextFunction, Request, Response, Router } from 'express';
import { verifyJwt } from '../auth/jwt';
import { db } from '../db/database';
import { controlRepository } from '../db/controlRepository';
import { realAuthRepository } from '../auth/realAuthRepository';
import { config } from '../config';
import { redisClient } from '../redis';
import { functionEngine } from '../functions/functionEngine';
import { persistentFunctionEngine } from '../functions/persistentFunctionEngine';
import { functionTemplates } from '../functions/templates';
import { FunctionOperationContext, FunctionVersion } from '../functions/types';
import { classifyFunctionRoute } from '../functions/routePlane';
import { resolveControlPlaneCredential, roleAllows } from '../middleware/auth';

export const functionsRouter = Router();

interface FunctionRequest extends Request { functionContext?: FunctionOperationContext; }
const activeEngine = (): any => config.testMode ? functionEngine : persistentFunctionEngine;

const invocationLimits = new Map<string, { count: number; resetAt: number }>();

function rawApiKey(req: Request): string | undefined {
  const apiKey = (req.headers.apikey as string) || (req.headers['x-apikey'] as string);
  if (apiKey) return apiKey;
  const bearer = req.headers.authorization;
  const token = bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : '';
  return /^(bb_pub_|bb_sec_|bb_srv_)/.test(token) ? token : undefined;
}

async function validScope(organizationId: string, projectId: string, environmentId: string): Promise<boolean> {
  if (config.testMode) {
    const project = db.getProjectById(projectId);
    return Boolean(project && project.organization_id === organizationId && db.getEnvironmentsByProject(projectId).some((environment) => environment.id === environmentId));
  }
  const [project, environment] = await Promise.all([controlRepository.getProject(projectId), controlRepository.getEnvironment(environmentId)]);
  return Boolean(project && environment && project.organization_id === organizationId && environment.project_id === projectId);
}

async function gateway(req: FunctionRequest, res: Response, next: NextFunction): Promise<void> {
  if (!config.functions.enabled) {
    res.status(403).json({ error: { code: 'FUNCTIONS_DISABLED', message: 'Functions are disabled until an isolated execution backend is configured.' } });
    return;
  }
  const requestId = (req.headers['x-request-id'] as string) || `fnreq_${crypto.randomBytes(8).toString('hex')}`;
  let organizationId = 'org_core_1';
  let projectId = 'proj_ecommerce_1';
  let environmentId = 'env_proj_ecommerce_1_production';
  let userId: string | undefined;
  let role = 'anonymous';
  let sessionId: string | undefined;
  let claims: Record<string, unknown> | undefined;
  const apiKey = rawApiKey(req);
  const authorization = req.headers.authorization;
  const routePlane = classifyFunctionRoute(req.originalUrl);
  try {
  if (routePlane === 'management') {
    if (apiKey) { res.status(403).json({ error: { code: 'FUNCTION_MANAGEMENT_FORBIDDEN', message: 'Data-plane API keys cannot manage Functions.' } }); return; }
    if (!authorization?.startsWith('Bearer ')) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'An administrative session is required for Function management.' } }); return; }
    const admin = await resolveControlPlaneCredential(
      authorization.slice(7).trim(),
      req.headers['x-project-id'] as string | undefined,
      req.headers['x-environment-id'] as string | undefined,
    );
    if (!admin || !admin.organizationId || !admin.projectId || !admin.environmentId || !roleAllows(admin.role, req.method === 'GET' ? 'read' : 'write')) {
      res.status(403).json({ error: { code: 'FUNCTION_MANAGEMENT_FORBIDDEN', message: 'Function management scope is denied.' } });
      return;
    }
    organizationId = admin.organizationId; projectId = admin.projectId; environmentId = admin.environmentId; userId = admin.user.id; role = admin.role;
    res.setHeader('X-Request-ID', requestId);
    req.functionContext = { organizationId, projectId, environmentId, userId, role, requestId, ip: req.ip, userAgent: req.headers['user-agent'] };
    next();
    return;
  }
  if (apiKey) {
    const key = config.testMode ? db.findApiKeyByRawKey(apiKey) : await controlRepository.findApiKeyByRawKey(apiKey);
    if (!key) { res.status(401).json({ error: { code: 'INVALID_API_KEY', message: 'Invalid or revoked API key.' } }); return; }
    const project = config.testMode ? db.getProjectById(key.project_id) : await controlRepository.getProject(key.project_id);
    if (!project || !key.environment_id || !await validScope(project.organization_id, key.project_id, key.environment_id)) { res.status(401).json({ error: { code: 'INVALID_API_KEY', message: 'API key has no valid function scope.' } }); return; }
    organizationId = project.organization_id; projectId = key.project_id; environmentId = key.environment_id;
    role = key.type === 'service' ? 'service' : key.type === 'secret' ? 'authenticated' : 'anonymous';
  } else if (authorization?.startsWith('Bearer ')) {
    try {
      const token = verifyJwt(authorization.slice(7).trim());
      const project = config.testMode ? db.getProjectById(token.project_id) : await controlRepository.getProject(token.project_id);
      if (!project || !await validScope(project.organization_id, token.project_id, token.environment_id)) throw new Error('JWT function scope is invalid.');
      const [session, user] = config.testMode ? [undefined, undefined] : await Promise.all([realAuthRepository.findSession(token.session_id), realAuthRepository.findUserById(token.sub)]);
      if (!config.testMode && (!session || session.user_id !== token.sub || session.project_id !== token.project_id || session.environment_id !== token.environment_id || !user || user.project_id !== token.project_id || user.environment_id !== token.environment_id || user.status !== 'active')) throw new Error('JWT function session is invalid or revoked.');
      organizationId = project.organization_id; projectId = token.project_id; environmentId = token.environment_id; userId = token.sub;
      sessionId = typeof token.session_id === 'string' ? token.session_id : undefined;
      claims = Object.fromEntries(Object.entries(token).filter(([key]) => !['sub', 'role', 'project_id', 'environment_id', 'session_id', 'iat', 'exp', 'iss', 'aud'].includes(key)));
      role = token.role === 'owner' || token.role === 'admin' ? 'admin' : 'authenticated';
    } catch (error: any) { res.status(401).json({ error: { code: 'INVALID_JWT', message: config.production ? 'Invalid or expired JWT.' : error.message || 'Invalid JWT.' } }); return; }
  } else {
    const requestedProject = (req.headers['x-project-id'] as string) || (req.query.project as string);
    const requestedEnvironment = (req.headers['x-environment-id'] as string) || (req.query.environment as string);
    if (!requestedProject || !requestedEnvironment) { res.status(400).json({ error: { code: 'FUNCTION_SCOPE_REQUIRED', message: 'project and environment are required for public Function invocation.' } }); return; }
    const project = config.testMode ? db.getProjectById(requestedProject) : await controlRepository.getProject(requestedProject);
    if (!project || !await validScope(project.organization_id, requestedProject, requestedEnvironment)) { res.status(400).json({ error: { code: 'INVALID_FUNCTION_SCOPE', message: 'Function scope is invalid.' } }); return; }
    organizationId = project.organization_id; projectId = requestedProject; environmentId = requestedEnvironment;
  }
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  req.functionContext = { organizationId, projectId, environmentId, userId, role, sessionId, claims, requestId, ip: req.ip, userAgent: req.headers['user-agent'] };
  next();
  } catch {
    res.status(503).json({ error: { code: 'FUNCTION_AUTH_UNAVAILABLE', message: 'Function authentication dependencies are unavailable.' } });
  }
}

functionsRouter.use(['/api/functions', '/functions/v1'], (req, res, next) => { void gateway(req as FunctionRequest, res, next); });

function context(req: FunctionRequest): FunctionOperationContext { return req.functionContext!; }
function sendError(res: Response, status: number, code: string, message: string) { return res.status(status).json({ error: { code, message } }); }
function handleControlError(res: Response, error: any) {
  const message = error?.message || 'Function operation failed.';
  const status = /not found/i.test(message) ? 404 : /only owner|invalid|already exists|required/i.test(message) ? 400 : 500;
  return sendError(res, status, status === 404 ? 'FUNCTION_NOT_FOUND' : 'FUNCTION_ERROR', status >= 500 && process.env.NODE_ENV === 'production' ? 'Function operation failed.' : message);
}

async function rateLimit(req: Request, res: Response): Promise<boolean> {
  const key = `${req.ip}:${req.params.slug || ''}`;
  try {
    let count: number;
    if (config.testMode) {
      const now = Date.now(); const current = invocationLimits.get(key) || { count: 0, resetAt: now + 60_000 };
      if (current.resetAt <= now) { current.count = 0; current.resetAt = now + 60_000; }
      current.count += 1; invocationLimits.set(key, current); count = current.count;
    } else count = await redisClient.increment(`rate:function:${crypto.createHash('sha256').update(key).digest('hex')}`, 60);
    res.setHeader('X-RateLimit-Limit', '120'); res.setHeader('X-RateLimit-Remaining', Math.max(0, 120 - count));
    if (count > 120) { sendError(res, 429, 'RATE_LIMITED', 'Function invocation limit exceeded.'); return false; }
    return true;
  } catch {
    sendError(res, 503, 'RATE_LIMIT_UNAVAILABLE', 'Function rate limiting dependency is unavailable.');
    return false;
  }
}

// Control plane. Unit fixtures retain the synchronous in-memory engine; every
// normal server request awaits the PostgreSQL-backed engine.
functionsRouter.get('/api/functions', async (req: FunctionRequest, res) => res.json(await activeEngine().listFunctions(context(req))));
functionsRouter.get('/api/functions/templates/list', (_req: FunctionRequest, res) => res.json(functionTemplates));
functionsRouter.get('/api/functions/health', async (_req: FunctionRequest, res) => {
  try {
    const engine = activeEngine();
    return res.json(typeof engine.health === 'function' ? await engine.health(false) : { status: 'ok', details: { runtime: config.testMode ? 'memory' : 'persistent' } });
  } catch (error) { return handleControlError(res, error); }
});
functionsRouter.post('/api/functions', async (req: FunctionRequest, res) => {
  try { return res.status(201).json(await activeEngine().createFunction(context(req), req.body || {})); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.get('/api/functions/:id', async (req: FunctionRequest, res) => {
  const item = await activeEngine().getFunctionDefinition(context(req), req.params.id);
  if (!item) return sendError(res, 404, 'FUNCTION_NOT_FOUND', 'Function not found.');
  const versions = await activeEngine().listVersions(context(req), item.id);
  const current = versions.find((version: FunctionVersion) => version.version === item.currentVersion);
  return res.json({ ...item, code: current?.code || '', versions, metrics: await activeEngine().getMetrics(context(req), item.id) });
});
functionsRouter.patch('/api/functions/:id', async (req: FunctionRequest, res) => {
  try { return res.status(201).json(await activeEngine().updateFunction(context(req), req.params.id, req.body || {})); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.delete('/api/functions/:id', async (req: FunctionRequest, res) => {
  try { return await activeEngine().deleteFunction(context(req), req.params.id) ? res.status(204).end() : sendError(res, 404, 'FUNCTION_NOT_FOUND', 'Function not found.'); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.get('/api/functions/:id/versions', async (req: FunctionRequest, res) => {
  try { return res.json(await activeEngine().listVersions(context(req), req.params.id)); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.post('/api/functions/:id/deploy', async (req: FunctionRequest, res) => {
  try { return res.json(await activeEngine().deployFunction(context(req), req.params.id, req.body?.version)); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.post('/api/functions/:id/rollback', async (req: FunctionRequest, res) => {
  try { return res.json(await activeEngine().rollbackFunction(context(req), req.params.id, Number(req.body?.version))); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.get('/api/functions/:id/logs', async (req: FunctionRequest, res) => {
  try { return res.json(await activeEngine().listLogs(context(req), req.params.id, Number(req.query.limit) || 100)); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.get('/api/functions/:id/metrics', async (req: FunctionRequest, res) => {
  try { return res.json(await activeEngine().getMetrics(context(req), req.params.id)); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.post('/api/functions/:id/invoke', async (req: FunctionRequest, res) => {
  try {
    const ctx = context(req);
    const result = await activeEngine().execute(ctx, req.params.id, { method: String(req.body?.method || 'POST').toUpperCase(), path: `/api/functions/${req.params.id}/invoke`, headers: req.headers, query: {}, body: req.body?.body ?? req.body, userId: ctx.userId, role: ctx.role, source: 'internal', requestId: ctx.requestId });
    return res.status(result.status).json(result.body ?? null);
  } catch (error: any) { return sendError(res, error?.code === 'FUNCTION_TIMEOUT' ? 504 : 500, error?.code || 'FUNCTION_EXECUTION_FAILED', error?.message || 'Function execution failed.'); }
});
functionsRouter.get('/api/functions/secrets/list', async (req: FunctionRequest, res) => {
  try { return res.json(await activeEngine().listSecrets(context(req))); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.put('/api/functions/secrets/:name', async (req: FunctionRequest, res) => {
  try { return res.status(201).json(await activeEngine().setSecret(context(req), req.params.name, String(req.body?.value || ''))); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.delete('/api/functions/secrets/:name', async (req: FunctionRequest, res) => {
  try { return await activeEngine().deleteSecret(context(req), req.params.name) ? res.status(204).end() : sendError(res, 404, 'SECRET_NOT_FOUND', 'Secret not found.'); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.get('/api/functions/environment/list', async (req: FunctionRequest, res) => {
  try { return res.json(await activeEngine().listEnvironment(context(req))); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.put('/api/functions/environment/:name', async (req: FunctionRequest, res) => {
  try { return res.json(await activeEngine().setEnvironment(context(req), req.params.name, String(req.body?.value || ''))); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.delete('/api/functions/environment/:name', async (req: FunctionRequest, res) => {
  try { return await activeEngine().deleteEnvironment(context(req), req.params.name) ? res.status(204).end() : sendError(res, 404, 'ENVIRONMENT_VARIABLE_NOT_FOUND', 'Environment variable not found.'); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.get('/api/functions/:id/crons', async (req: FunctionRequest, res) => res.json(await activeEngine().listCrons(context(req), req.params.id)));
functionsRouter.post('/api/functions/:id/crons', async (req: FunctionRequest, res) => {
  try { return res.status(201).json(await activeEngine().createCron(context(req), req.params.id, String(req.body?.expression || ''))); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.patch('/api/functions/:id/crons/:cronId', async (req: FunctionRequest, res) => {
  try { return res.json(await activeEngine().setCronEnabled(context(req), req.params.id, req.params.cronId, Boolean(req.body?.enabled))); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.delete('/api/functions/:id/crons/:cronId', async (req: FunctionRequest, res) => {
  try { return await activeEngine().deleteCron(context(req), req.params.id, req.params.cronId) ? res.status(204).end() : sendError(res, 404, 'CRON_NOT_FOUND', 'Cron schedule not found.'); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.get('/api/functions/queues/list', async (req: FunctionRequest, res) => res.json(await activeEngine().listQueues(context(req))));
functionsRouter.post('/api/functions/queues', async (req: FunctionRequest, res) => {
  try { return res.status(201).json(await activeEngine().createQueue(context(req), String(req.body?.name || ''))); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.get('/api/functions/queues/:queue/jobs', async (req: FunctionRequest, res) => res.json(await activeEngine().listJobs(context(req), req.params.queue)));
functionsRouter.post('/api/functions/queues/:queue/jobs', async (req: FunctionRequest, res) => {
  try { return res.status(201).json(await activeEngine().enqueue(context(req), req.params.queue, String(req.body?.functionId || ''), req.body?.payload, req.body?.options || {})); }
  catch (error) { return handleControlError(res, error); }
});
functionsRouter.post('/api/functions/queues/:queue/jobs/:jobId/retry', async (req: FunctionRequest, res) => {
  try { return res.json(await activeEngine().retryJob(context(req), req.params.queue, req.params.jobId)); }
  catch (error) { return handleControlError(res, error); }
});

functionsRouter.get('/functions/v1/openapi', async (req: FunctionRequest, res) => {
  const paths: Record<string, any> = {};
  for (const definition of await activeEngine().listFunctions(context(req))) {
    if (definition.status !== 'active' || definition.access === 'internal') continue;
    const operation = { summary: definition.name, operationId: `function_${definition.slug}`, responses: { 200: { description: 'Function response' }, 500: { description: 'Function execution failed' } }, ...(definition.access === 'public' ? {} : { security: [{ bearerAuth: [] }, { apiKey: [] }] }) };
    paths[`/functions/v1/${definition.slug}`] = { get: operation, post: operation, put: operation, patch: operation, delete: operation, options: operation };
  }
  res.json({ openapi: '3.0.3', info: { title: 'BrisaBase Functions API', version: 'v1' }, paths, components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' }, apiKey: { type: 'apiKey', in: 'header', name: 'apikey' } } } });
});

// Data plane: automatic endpoint /functions/v1/:slug, supporting every HTTP method including OPTIONS.
functionsRouter.all('/functions/v1/:slug', async (req: FunctionRequest, res) => {
  if (!await rateLimit(req, res)) return;
  const ctx = context(req);
  const definition = await activeEngine().getFunctionDefinition(ctx, req.params.slug);
  if (!definition) return sendError(res, 404, 'FUNCTION_NOT_FOUND', 'Function not found.');
  const allowed = definition.access === 'public' || (definition.access === 'authenticated' && ctx.role !== 'anonymous') || (definition.access === 'service' && ctx.role === 'service');
  if (!allowed) return sendError(res, definition.access === 'authenticated' ? 401 : 403, 'FORBIDDEN', 'Function access policy denied this invocation.');
  try {
    const result = await activeEngine().execute(ctx, definition.id, { method: req.method, path: req.path, headers: req.headers, query: req.query, body: req.body, userId: ctx.userId, role: ctx.role, source: 'http', requestId: ctx.requestId });
    for (const [name, value] of Object.entries(result.headers || {})) if (!['connection', 'transfer-encoding', 'content-length'].includes(name.toLowerCase())) res.setHeader(name, String(value));
    if (result.body === undefined) return res.status(result.status).end();
    return typeof result.body === 'string' ? res.status(result.status).send(result.body) : res.status(result.status).json(result.body);
  } catch (error: any) {
    return sendError(res, error?.code === 'FUNCTION_TIMEOUT' ? 504 : 500, error?.code || 'FUNCTION_EXECUTION_FAILED', error?.message || 'Function execution failed.');
  }
});
