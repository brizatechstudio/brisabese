import { Router, Request, Response } from 'express';
import { realtimeEngine } from '../realtime/realtimeEngine';
import { channelManager } from '../realtime/channelManager';
import { subscriptionManager } from '../realtime/subscriptionManager';
import { postgresCdc } from '../realtime/postgresCdc';
import { RealtimePermissionEngine } from '../realtime/authorization';
import { RealtimeCdcEvent, RealtimeConnection } from '../realtime/types';

export const realtimeRouter = Router();

type ScopedRequest = Request & { organizationId?: string; projectId?: string; environmentId?: string; user?: { id: string; role: string } };

function getContext(req: ScopedRequest) {
  // The trusted scope comes exclusively from the authenticated credential
  // (JWT or API key) set by authMiddleware. Arbitrary client headers are never
  // used to escape the authenticated project/environment scope.
  const orgId = req.organizationId || '';
  const projId = req.projectId || '';
  const envId = req.environmentId || '';
  if (!orgId || !projId || !envId) {
    throw new Error('Authenticated organization, project, and environment scope are required.');
  }
  return { orgId, projId, envId };
}

function fail(res: Response, error: unknown, status = 400): void {
  res.status(status).json({ error: error instanceof Error ? error.message : 'Realtime request failed.' });
}

// GET /api/realtime/status
realtimeRouter.get('/api/realtime/status', async (req: ScopedRequest, res: Response) => {
  try {
    getContext(req);
    const status = await realtimeEngine.getStatus();
    const cdcStatus = postgresCdc.getStatus();
    res.json({
      ...status,
      cdc: cdcStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    fail(res, error, 401);
  }
});

// GET /api/realtime/metrics
realtimeRouter.get('/api/realtime/metrics', (req: ScopedRequest, res: Response) => {
  try {
    const { projId, envId } = getContext(req);
    const metrics = realtimeEngine.getMetrics();
    metrics.activeConnections = realtimeEngine.connectionManager.getActiveConnectionsCount(projId, envId);
    metrics.activeChannels = channelManager.getActiveChannelsCount(projId, envId);
    metrics.subscriptionsCount = subscriptionManager.getCount(projId, envId);
    // Throughput/error counters are process-wide diagnostics; tenant-sensitive live counts above are strictly scoped.
    metrics.eventsPerSecond = 0;
    metrics.messagesPerSecond = 0;
    metrics.broadcastsPerSecond = 0;
    metrics.averageLatencyMs = 0;
    metrics.totalEventsProcessed = 0;
    metrics.errorsCount = 0;
    res.json(metrics);
  } catch (error) {
    fail(res, error, 401);
  }
});

// GET /api/realtime/channels
realtimeRouter.get('/api/realtime/channels', (req: ScopedRequest, res: Response) => {
  try {
    const { projId, envId } = getContext(req);
    const channels = channelManager.listChannels(projId, envId);
    res.json(channels);
  } catch (error) {
    fail(res, error, 401);
  }
});

// GET /api/realtime/connections
realtimeRouter.get('/api/realtime/connections', (req: ScopedRequest, res: Response) => {
  try {
    const { projId, envId } = getContext(req);
    const connections = realtimeEngine.connectionManager.getConnections(projId, envId).map((c: RealtimeConnection) => ({
      id: c.id,
      projectId: c.projectId,
      environmentId: c.environmentId,
      userId: c.userId,
      role: c.role,
      channels: Array.from(c.channels),
      connectedAt: c.connectedAt,
      lastSeen: c.lastSeen,
      ip: c.ip,
      userAgent: c.userAgent,
      isAlive: c.isAlive,
    }));
    res.json(connections);
  } catch (error) {
    fail(res, error, 401);
  }
});

// GET /api/realtime/events
realtimeRouter.get('/api/realtime/events', (req: ScopedRequest, res: Response) => {
  try {
    const { projId, envId } = getContext(req);
    const logs = realtimeEngine.getEventLog(projId, envId);
    res.json(logs);
  } catch (error) {
    fail(res, error, 401);
  }
});

// GET /api/realtime/subscriptions
realtimeRouter.get('/api/realtime/subscriptions', (req: ScopedRequest, res: Response) => {
  try {
    const { projId, envId } = getContext(req);
    const subs = subscriptionManager.listSubscriptions(projId, envId);
    res.json(subs);
  } catch (error) {
    fail(res, error, 401);
  }
});

// GET /api/realtime/tables/:tableName/settings
realtimeRouter.get('/api/realtime/tables/:tableName/settings', (req: ScopedRequest, res: Response) => {
  try {
    const { projId, envId } = getContext(req);
    const settings = realtimeEngine.publicationManager.getTableSettings(projId, envId, req.params.tableName);
    res.json(settings);
  } catch (error) {
    fail(res, error, 401);
  }
});

// PATCH /api/realtime/tables/:tableName/settings
realtimeRouter.patch('/api/realtime/tables/:tableName/settings', (req: ScopedRequest, res: Response) => {
  try {
    const { projId, envId } = getContext(req);
    const settings = realtimeEngine.publicationManager.setTableSettings(projId, envId, req.params.tableName, req.body);
    res.json(settings);
  } catch (error) {
    fail(res, error, 401);
  }
});

// POST /api/realtime/emit — Test endpoint to simulate a CDC event
realtimeRouter.post('/api/realtime/emit', async (req: ScopedRequest, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const { schema = 'public', table, event = 'INSERT', new: newRow, old: oldRow } = req.body;

    if (!table) {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Tabela é obrigatória.' } });
      return;
    }

    const cdcEvent: RealtimeCdcEvent = {
      eventId: `evt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      organizationId: orgId,
      projectId: projId,
      environmentId: envId,
      schema,
      table,
      operation: event,
      new: newRow || null,
      old: oldRow || null,
      transactionId: `tx_${Date.now().toString(36)}`,
    };

    await realtimeEngine.ingestCdcEvent(cdcEvent);
    res.status(201).json({ success: true, eventId: cdcEvent.eventId });
  } catch (error) {
    fail(res, error, 401);
  }
});

// GET /api/realtime/presence/:channel
realtimeRouter.get('/api/realtime/presence/:channel', (req: ScopedRequest, res: Response) => {
  try {
    const { projId, envId } = getContext(req);
    const states = realtimeEngine.presenceManager.getPresenceState(projId, envId, req.params.channel);
    res.json(states);
  } catch (error) {
    fail(res, error, 401);
  }
});