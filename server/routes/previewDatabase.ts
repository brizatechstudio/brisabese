import { Router } from 'express';
import { previewDatabaseEngine, PreviewContext } from '../platform/previewDatabaseEngine';

export const previewDatabaseRouter = Router();

function context(req: any): PreviewContext {
  if (!req.organizationId || !req.projectId || !req.environmentId || !req.user?.id || !req.user?.role) {
    throw new Error('Authenticated organization, project, environment, and user scope are required.');
  }
  return {
    organizationId: req.organizationId,
    projectId: req.projectId,
    environmentId: req.environmentId,
    userId: req.user.id,
    role: req.user.role,
    requestId: req.headers['x-request-id'] as string | undefined,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

function fail(res: any, error: any) {
  const detail = error?.message || 'Preview Database operation failed.';
  const status = /not found/i.test(detail) ? 404 : /already exists/i.test(detail) ? 409 : /requires|invalid|required|scope/i.test(detail) ? 400 : 500;
  const message = status >= 500 && process.env.NODE_ENV === 'production' ? 'Preview Database operation failed.' : detail;
  return res.status(status).json({ error: { code: status === 404 ? 'PREVIEW_NOT_FOUND' : status === 409 ? 'PREVIEW_EXISTS' : 'PREVIEW_ERROR', message } });
}

previewDatabaseRouter.get('/api/previews', async (req, res) => {
  try { return res.json(await previewDatabaseEngine.list(context(req))); }
  catch (error) { return fail(res, error); }
});

previewDatabaseRouter.post('/api/previews', async (req, res) => {
  try {
    return res.status(201).json(await previewDatabaseEngine.create(context(req), {
      branchName: String(req.body?.branchName || ''),
      sourceEnvironmentId: req.body?.sourceEnvironmentId ? String(req.body.sourceEnvironmentId) : undefined,
      includeData: Boolean(req.body?.includeData),
      ttlHours: req.body?.ttlHours === undefined ? undefined : Number(req.body.ttlHours),
    }));
  } catch (error) { return fail(res, error); }
});

previewDatabaseRouter.get('/api/previews/:id', async (req, res) => {
  try {
    const value = await previewDatabaseEngine.get(context(req), req.params.id);
    return value ? res.json(value) : res.status(404).json({ error: { code: 'PREVIEW_NOT_FOUND', message: 'Preview Database was not found.' } });
  } catch (error) { return fail(res, error); }
});

previewDatabaseRouter.delete('/api/previews/:id', async (req, res) => {
  try {
    return await previewDatabaseEngine.remove(context(req), req.params.id)
      ? res.status(204).end()
      : res.status(404).json({ error: { code: 'PREVIEW_NOT_FOUND', message: 'Preview Database was not found.' } });
  } catch (error) { return fail(res, error); }
});

previewDatabaseRouter.post('/api/previews/cleanup/expired', async (req, res) => {
  try { return res.json({ expired: await previewDatabaseEngine.expireDue(context(req)) }); }
  catch (error) { return fail(res, error); }
});
