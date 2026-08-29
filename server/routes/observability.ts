import { Router } from 'express';
import { observability } from '../observability';

export const observabilityRouter = Router();

function scope(req: any) { return { organizationId: req.organizationId || 'org_core_1', projectId: (req.headers['x-project-id'] as string) || 'proj_ecommerce_1', environmentId: (req.headers['x-environment-id'] as string) || 'env_proj_ecommerce_1_production', userId: req.user?.id, service: 'observability' }; }
function error(res: any, err: any) { return res.status(400).json({ error: { code: 'OBSERVABILITY_ERROR', message: err?.message || 'Observability operation failed.' } }); }

observabilityRouter.get('/api/observability/overview', async (_req, res) => res.json(await observability.dashboard.overview()));
observabilityRouter.get('/api/observability/logs', (req, res) => res.json(observability.listLogs({ level: req.query.level as string, service: req.query.service as string, projectId: req.query.projectId as string, requestId: req.query.requestId as string, traceId: req.query.traceId as string, search: req.query.search as string, limit: Number(req.query.limit) || 200 })));
observabilityRouter.get('/api/observability/metrics', (req, res) => res.json({ points: observability.metrics.query({ name: req.query.name as string, projectId: req.query.projectId as string, since: req.query.since as string, limit: Number(req.query.limit) || 500 }), summary: observability.metrics.summary() }));
observabilityRouter.get('/api/observability/traces', (req, res) => res.json(observability.traces.list({ projectId: req.query.projectId as string, requestId: req.query.requestId as string, traceId: req.query.traceId as string, limit: Number(req.query.limit) || 100 })));
observabilityRouter.get('/api/observability/traces/:traceId', (req, res) => { const trace = observability.traces.get(req.params.traceId); return trace ? res.json(trace) : res.status(404).json({ error: { code: 'TRACE_NOT_FOUND', message: 'Trace not found.' } }); });
observabilityRouter.get('/api/observability/alerts', (_req, res) => res.json({ rules: observability.alerts.list(), events: observability.alerts.listEvents() }));
observabilityRouter.post('/api/observability/alerts', (req: any, res) => { try { return res.status(201).json(observability.createAlert({ ...req.body, ...scope(req), channels: req.body?.channels || [] })); } catch (err) { return error(res, err); } });
observabilityRouter.patch('/api/observability/alerts/:id', (req, res) => { try { return res.json(observability.alerts.update(req.params.id, req.body || {})); } catch (err) { return error(res, err); } });
observabilityRouter.delete('/api/observability/alerts/:id', (req, res) => res.status(observability.alerts.remove(req.params.id) ? 204 : 404).end());
observabilityRouter.get('/api/observability/health', async (_req, res) => res.json(await observability.checkHealth()));
observabilityRouter.get('/api/observability/retention', (_req, res) => res.json(observability.retention.get()));
observabilityRouter.patch('/api/observability/retention', (req, res) => { try { const policy = observability.retention.set(req.body || {}); const pruned = observability.flushRetention(); return res.json({ policy, pruned }); } catch (err) { return error(res, err); } });
observabilityRouter.get('/api/observability/export/prometheus', (_req, res) => { res.type('text/plain').send(observability.exporters.prometheus(observability.metrics.query({ limit: 10_000 }))); });
observabilityRouter.get('/api/observability/export/otlp', (_req, res) => res.json(observability.exporters.otlp(observability.listLogs({ limit: 10_000 }), observability.traces.list({ limit: 10_000 }), observability.metrics.query({ limit: 10_000 }))));
