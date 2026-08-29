import { Request, Response, Router } from 'express';
import { db } from '../db/database';
import { securityEngine } from '../security/securityEngine';
import { SecurityContext } from '../security/types';

export const securityRouter = Router();

function context(req: Request): SecurityContext {
  const projectId = (req.headers['x-project-id'] as string) || 'proj_ecommerce_1';
  const environmentId = (req.headers['x-environment-id'] as string) || 'env_proj_ecommerce_1_production';
  const project = db.getProjectById(projectId);
  if (!project || !db.getEnvironmentsByProject(project.id).some((environment) => environment.id === environmentId)) throw new Error('Invalid project or environment scope.');
  const rawClaims = req.headers['x-security-claims'];
  let claims: Record<string, unknown> | undefined;
  if (typeof rawClaims === 'string') { try { claims = JSON.parse(rawClaims); } catch { throw new Error('x-security-claims must be valid JSON.'); } }
  return { organizationId: project.organization_id, projectId, environmentId, userId: (req as any).user?.id || 'usr_owner_1', role: (req as any).user?.role || 'owner', claims, ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.headers['x-request-id'] as string | undefined };
}

function fail(res: Response, error: any) {
  const message = error?.message || 'Security operation failed.';
  const status = /not found/i.test(message) ? 404 : /only|invalid|must remain/i.test(message) ? 403 : 400;
  return res.status(status).json({ error: { code: status === 404 ? 'POLICY_NOT_FOUND' : 'SECURITY_ERROR', message } });
}

securityRouter.get('/api/security/policies', (req, res) => {
  try { return res.json(securityEngine.listPolicies(context(req), { resourceType: req.query.resourceType as any, resource: req.query.resource as string | undefined })); }
  catch (error) { return fail(res, error); }
});
securityRouter.post('/api/security/policies', (req, res) => {
  try { return res.status(201).json(securityEngine.createPolicy(context(req), req.body || {})); }
  catch (error) { return fail(res, error); }
});
securityRouter.patch('/api/security/policies/:id', (req, res) => {
  try { return res.json(securityEngine.updatePolicy(context(req), req.params.id, req.body || {})); }
  catch (error) { return fail(res, error); }
});
securityRouter.delete('/api/security/policies/:id', (req, res) => {
  try { return securityEngine.deletePolicy(context(req), req.params.id) ? res.status(204).end() : res.status(404).json({ error: { code: 'POLICY_NOT_FOUND', message: 'Policy not found.' } }); }
  catch (error) { return fail(res, error); }
});
securityRouter.post('/api/security/test-policy', (req, res) => {
  try { return res.json(securityEngine.testPolicy(context(req), req.body || {})); }
  catch (error) { return fail(res, error); }
});
securityRouter.post('/api/security/simulate', (req, res) => {
  try {
    const manager = context(req);
    const simulated: SecurityContext = { ...manager, ...(req.body?.context || {}), organizationId: manager.organizationId, projectId: manager.projectId, environmentId: manager.environmentId, bypassRls: false };
    return res.json(securityEngine.simulate(manager, simulated, req.body?.input || {}));
  } catch (error) { return fail(res, error); }
});
