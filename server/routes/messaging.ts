import { Router } from 'express';
import { ApiGateway, ApiGatewayRequest } from '../apiEngine/apiGateway';
import { messagingEngine, MessagingContext } from '../platform/messagingEngine';

export const messagingDataRouter = Router();
export const messagingManagementRouter = Router();

messagingDataRouter.use('/messaging/v1', ApiGateway.corsAndHeadersMiddleware, ApiGateway.gatewayMiddleware);

function dataContext(req: ApiGatewayRequest): MessagingContext {
  const ctx = req.apiContext;
  if (!ctx) throw new Error('Messaging API context is unavailable.');
  return {
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    environmentId: ctx.environmentId,
    userId: ctx.userId,
    role: ctx.callerRole,
    requestId: ctx.requestId,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

function managementContext(req: any): MessagingContext {
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
  const detail = error?.message || 'Messaging operation failed.';
  const status = /not found/i.test(detail) ? 404 : /not configured|unavailable/i.test(detail) ? 503 : /required|invalid|cannot|must be|at most/i.test(detail) ? 400 : 500;
  const message = status >= 500 && status !== 503 && process.env.NODE_ENV === 'production' ? 'Messaging operation failed.' : detail;
  return res.status(status).json({ error: { code: status === 404 ? 'MESSAGING_NOT_FOUND' : status === 503 ? 'MESSAGING_PROVIDER_UNAVAILABLE' : 'MESSAGING_ERROR', message } });
}

messagingDataRouter.post('/messaging/v1/devices', async (req: ApiGatewayRequest, res) => {
  try {
    return res.status(201).json(await messagingEngine.registerDevice(dataContext(req), {
      token: String(req.body?.token || ''),
      platform: String(req.body?.platform || ''),
      locale: req.body?.locale ? String(req.body.locale) : undefined,
      timezone: req.body?.timezone ? String(req.body.timezone) : undefined,
      metadata: req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : undefined,
    }));
  } catch (error) { return fail(res, error); }
});

messagingDataRouter.delete('/messaging/v1/devices/:deviceId', async (req: ApiGatewayRequest, res) => {
  try {
    return await messagingEngine.removeDevice(dataContext(req), req.params.deviceId)
      ? res.status(204).end()
      : res.status(404).json({ error: { code: 'MESSAGING_NOT_FOUND', message: 'Push device was not found.' } });
  } catch (error) { return fail(res, error); }
});

messagingManagementRouter.get('/api/messaging/status', (_req, res) => {
  res.json({ provider: 'fcm', configured: messagingEngine.configured() });
});

messagingManagementRouter.get('/api/messaging/devices', async (req, res) => {
  try { return res.json(await messagingEngine.listDevices(managementContext(req))); }
  catch (error) { return fail(res, error); }
});

messagingManagementRouter.get('/api/messaging/messages', async (req, res) => {
  try { return res.json(await messagingEngine.listMessages(managementContext(req))); }
  catch (error) { return fail(res, error); }
});

messagingManagementRouter.post('/api/messaging/messages', async (req, res) => {
  try {
    return res.status(201).json(await messagingEngine.createMessage(managementContext(req), {
      title: req.body?.title ? String(req.body.title) : undefined,
      body: String(req.body?.body || ''),
      data: req.body?.data && typeof req.body.data === 'object' ? req.body.data : undefined,
      audience: req.body?.audience && typeof req.body.audience === 'object' ? req.body.audience : undefined,
      scheduledAt: req.body?.scheduledAt ? String(req.body.scheduledAt) : undefined,
    }));
  } catch (error) { return fail(res, error); }
});

messagingManagementRouter.post('/api/messaging/messages/:messageId/send', async (req, res) => {
  try { return res.json(await messagingEngine.send(managementContext(req), req.params.messageId)); }
  catch (error) { return fail(res, error); }
});

messagingManagementRouter.delete('/api/messaging/messages/:messageId', async (req, res) => {
  try {
    return await messagingEngine.cancel(managementContext(req), req.params.messageId)
      ? res.status(204).end()
      : res.status(409).json({ error: { code: 'MESSAGING_NOT_CANCELLABLE', message: 'Only queued messages can be cancelled.' } });
  } catch (error) { return fail(res, error); }
});
