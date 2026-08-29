import { Router } from 'express';
import { postgres } from '../db/postgres';
import { observability } from '../observability';

export const realObservabilityRouter = Router();
function scope(req: any): { organizationId: string; projectId: string; environmentId: string } { if (!req.organizationId || !req.projectId || !req.environmentId) throw new Error('Authenticated observability scope is required.'); return { organizationId: req.organizationId, projectId: req.projectId, environmentId: req.environmentId }; }
function alertInput(body: any): any {
  const channels = body?.channels === undefined ? ['webhook'] : body.channels;
  if (!Array.isArray(channels) || channels.length !== 1 || channels[0] !== 'webhook') throw new Error('Only the durable webhook alert channel is available in the real runtime.');
  return { name: body?.name, metric: body?.metric, operator: body?.operator, threshold: Number(body?.threshold), severity: body?.severity || 'warning', channels, enabled: body?.enabled !== false };
}
function alertError(res: any, error: unknown): any { return res.status(400).json({ error: { code: 'ALERT_ERROR', message: error instanceof Error ? error.message : 'Unable to manage alert rule.' } }); }

async function logs(req: any, limit = 200): Promise<any[]> {
  const values: unknown[] = []; const terms: string[] = [];
  const add = (column: string, value: unknown) => { if (value !== undefined && value !== '') { values.push(value); terms.push(`${column}=$${values.length}`); } };
  const current = scope(req); add('project_id', current.projectId); add('environment_id', current.environmentId); add('level', req.query.level); add('service', req.query.service); add('request_id', req.query.requestId); add('trace_id', req.query.traceId);
  if (req.query.search) { values.push(`%${String(req.query.search)}%`); terms.push(`(message ILIKE $${values.length} OR event ILIKE $${values.length})`); }
  values.push(Math.min(Math.max(Number(req.query.limit) || limit, 1), 10_000));
  return postgres.query(`SELECT id,created_at AS timestamp,level,service,event,message,metadata,organization_id AS "organizationId",project_id AS "projectId",environment_id AS "environmentId",user_id AS "userId",request_id AS "requestId",trace_id AS "traceId",span_id AS "spanId" FROM observability_logs${terms.length ? ` WHERE ${terms.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT $${values.length}`, values);
}

realObservabilityRouter.get('/api/observability/overview', async (req, res) => res.json(await observability.persistentOverview(scope(req))));
realObservabilityRouter.get('/api/observability/logs', async (req, res) => res.json(await logs(req)));
realObservabilityRouter.get('/api/observability/metrics', async (req, res) => { const current = scope(req); res.json({ points: await observability.metrics.queryPersistent({ name: req.query.name as string, ...current, since: req.query.since as string, limit: Number(req.query.limit) || 500 }), summary: await observability.metrics.summaryPersistent(current) }); });
realObservabilityRouter.get('/api/observability/traces', async (req, res) => res.json(await observability.traces.listPersistent({ ...scope(req), requestId: req.query.requestId as string, traceId: req.query.traceId as string, limit: Number(req.query.limit) || 100 })));
realObservabilityRouter.get('/api/observability/traces/:traceId', async (req, res) => { const trace = await observability.traces.getPersistent(req.params.traceId, scope(req)); return trace ? res.json(trace) : res.status(404).json({ error: { code: 'TRACE_NOT_FOUND', message: 'Trace not found.' } }); });
realObservabilityRouter.get('/api/observability/alerts', (req, res) => { const current = scope(req); res.json({ rules: observability.alerts.list(current), events: observability.alerts.listEvents(100, current) }); });
realObservabilityRouter.post('/api/observability/alerts', async (req, res) => { try { const rule = observability.createAlert({ ...alertInput(req.body), ...scope(req), userId: (req as any).user?.id, service: 'observability' }); try { await observability.alerts.persist(rule); } catch (error) { observability.alerts.remove(rule.id); throw error; } return res.status(201).json(rule); } catch (error) { return alertError(res, error); } });
realObservabilityRouter.patch('/api/observability/alerts/:id', async (req, res) => { try { const current = scope(req); const previous = observability.alerts.get(req.params.id); if (!previous || previous.projectId !== current.projectId || previous.environmentId !== current.environmentId) return res.status(404).json({ error: { code: 'ALERT_NOT_FOUND', message: 'Alert rule not found.' } }); const allowed = alertInput({ ...previous, ...req.body }); const updated = observability.alerts.update(previous.id, allowed); try { await observability.alerts.persist(updated); } catch (error) { observability.alerts.update(previous.id, previous); throw error; } return res.json(updated); } catch (error) { return alertError(res, error); } });
realObservabilityRouter.delete('/api/observability/alerts/:id', async (req, res) => { try { const current = scope(req); const rule = observability.alerts.get(req.params.id); if (!rule || rule.projectId !== current.projectId || rule.environmentId !== current.environmentId) return res.status(404).json({ error: { code: 'ALERT_NOT_FOUND', message: 'Alert rule not found.' } }); await observability.alerts.removePersistent(rule.id); observability.alerts.remove(rule.id); return res.status(204).end(); } catch (error) { return alertError(res, error); } });
realObservabilityRouter.get('/api/observability/health', async (_req, res) => res.json(await observability.checkHealth()));
realObservabilityRouter.get('/api/observability/retention', (_req, res) => res.json(observability.retention.get()));
realObservabilityRouter.patch('/api/observability/retention', async (req, res) => { if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: { code: 'GLOBAL_RETENTION_FORBIDDEN', message: 'Global telemetry retention is configured by the operator, not by a tenant session.' } }); try { const policy = observability.retention.set(req.body || {}); return res.json({ policy, pruned: await observability.flushPersistentRetention() }); } catch (error: any) { return res.status(400).json({ error: { code: 'RETENTION_ERROR', message: error?.message || 'Unable to update retention.' } }); } });
realObservabilityRouter.get('/api/observability/export/prometheus', async (req, res) => res.type('text/plain').send(observability.exporters.prometheus(await observability.metrics.queryPersistent({ ...scope(req), limit: 10_000 }))));
realObservabilityRouter.get('/api/observability/export/otlp', async (req, res) => res.json(observability.exporters.otlp(await logs(req, 10_000), await observability.traces.listPersistent({ ...scope(req), limit: 10_000 }), await observability.metrics.queryPersistent({ ...scope(req), limit: 10_000 }))));
