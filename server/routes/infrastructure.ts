import { Router } from 'express';
import { infrastructureEngine } from '../infrastructure/infrastructureEngine';
import { InfrastructureContext, ServiceName } from '../infrastructure/types';

export const infrastructureRouter = Router();
function context(req: any): InfrastructureContext { return { organizationId: req.organizationId || 'org_core_1', projectId: (req.headers['x-project-id'] as string) || 'proj_ecommerce_1', environmentId: (req.headers['x-environment-id'] as string) || 'env_proj_ecommerce_1_production', userId: req.user?.id || 'usr_owner_1', role: req.user?.role || 'owner', requestId: req.headers['x-request-id'] as string | undefined, ip: req.ip, userAgent: req.headers['user-agent'] }; }
function fail(res: any, error: any) { const detail = error?.message || 'Infrastructure operation failed.'; const status = /not found/i.test(detail) ? 404 : /only|invalid|unknown|required|must/i.test(detail) ? 400 : 500; const message = status >= 500 && process.env.NODE_ENV === 'production' ? 'Infrastructure operation failed.' : detail; return res.status(status).json({ error: { code: status === 404 ? 'INFRASTRUCTURE_NOT_FOUND' : 'INFRASTRUCTURE_ERROR', message } }); }

infrastructureRouter.get('/api/infrastructure/overview', (_req, res) => res.json(infrastructureEngine.overview()));
infrastructureRouter.get('/api/infrastructure/regions', (_req, res) => res.json(infrastructureEngine.regions.list()));
infrastructureRouter.get('/api/infrastructure/regions/project', (req, res) => res.json(infrastructureEngine.regions.placement(context(req))));
infrastructureRouter.patch('/api/infrastructure/regions/project', (req, res) => { try { return res.json(infrastructureEngine.regions.setPlacement(context(req), req.body || {})); } catch (error) { return fail(res, error); } });
infrastructureRouter.get('/api/infrastructure/nodes', (req, res) => res.json(infrastructureEngine.nodes.list(req.query.region as string | undefined)));
infrastructureRouter.post('/api/infrastructure/nodes', (req, res) => { try { return res.status(201).json(infrastructureEngine.addNode(context(req), req.body)); } catch (error) { return fail(res, error); } });
infrastructureRouter.get('/api/infrastructure/services', (req, res) => res.json(infrastructureEngine.services.list(req.query.service as ServiceName | undefined, req.query.region as string | undefined)));
infrastructureRouter.get('/api/infrastructure/deployments', (req, res) => res.json(infrastructureEngine.deployments.list(context(req))));
infrastructureRouter.post('/api/infrastructure/deployments', async (req, res) => { try { return res.status(201).json(await infrastructureEngine.deploy(context(req), req.body)); } catch (error) { return fail(res, error); } });
infrastructureRouter.post('/api/infrastructure/deployments/:id/rollback', async (req, res) => { try { return res.json(await infrastructureEngine.rollback(context(req), req.params.id)); } catch (error) { return fail(res, error); } });
infrastructureRouter.get('/api/infrastructure/scaling', (_req, res) => res.json({ policies: infrastructureEngine.autoscaler.listPolicies(), decisions: infrastructureEngine.autoscaler.listDecisions() }));
infrastructureRouter.post('/api/infrastructure/scaling/evaluate', (req, res) => { try { return res.json(infrastructureEngine.evaluateScaling(context(req), req.body?.service, req.body?.metrics || {})); } catch (error) { return fail(res, error); } });
infrastructureRouter.get('/api/infrastructure/replication', (req, res) => res.json(infrastructureEngine.replication.list(context(req))));
infrastructureRouter.post('/api/infrastructure/replication', (req, res) => { try { return res.status(201).json(infrastructureEngine.configureReplication(context(req), req.body)); } catch (error) { return fail(res, error); } });
infrastructureRouter.get('/api/infrastructure/cache', (req, res) => res.json(infrastructureEngine.cache.stats(req.query.namespace as string | undefined)));
infrastructureRouter.post('/api/infrastructure/cache', (req, res) => { try { infrastructureEngine.cache.set(String(req.body?.namespace), String(req.body?.key), req.body?.value, Number(req.body?.ttlMs) || 30_000); return res.status(204).end(); } catch (error) { return fail(res, error); } });
infrastructureRouter.delete('/api/infrastructure/cache', (req, res) => { try { return res.json({ removed: infrastructureEngine.cache.invalidate(String(req.query.namespace || ''), req.query.key as string | undefined) }); } catch (error) { return fail(res, error); } });
infrastructureRouter.get('/api/infrastructure/networking', (_req, res) => res.json(infrastructureEngine.network.getConfig()));
infrastructureRouter.patch('/api/infrastructure/networking', (req, res) => { try { return res.json(infrastructureEngine.network.update(req.body || {})); } catch (error) { return fail(res, error); } });
infrastructureRouter.post('/api/infrastructure/route', (req, res) => { try { return res.json(infrastructureEngine.network.route(context(req), req.body?.service)); } catch (error) { return fail(res, error); } });
infrastructureRouter.get('/api/infrastructure/health', (_req, res) => res.json(infrastructureEngine.health.check()));
infrastructureRouter.get('/api/infrastructure/metrics', (req, res) => { const nodes = infrastructureEngine.nodes.list(req.query.region as string | undefined); return res.json(nodes.map((node) => ({ nodeId: node.id, region: node.region, cpuUsage: node.cpuUsage, memoryUsage: node.memoryUsage, storageUsage: node.storageUsage, networkUsage: node.networkUsage, activeConnections: node.activeConnections, runningFunctions: node.runningFunctions }))); });
infrastructureRouter.get('/api/infrastructure/failovers', (req, res) => res.json(infrastructureEngine.failover.list(context(req))));
infrastructureRouter.post('/api/infrastructure/failover/node/:id', (req, res) => { try { return res.json(infrastructureEngine.failNode(context(req), req.params.id, req.body?.reason)); } catch (error) { return fail(res, error); } });
infrastructureRouter.post('/api/infrastructure/failover/region/:region', (req, res) => { try { return res.json(infrastructureEngine.failRegion(context(req), req.params.region, req.body?.reason)); } catch (error) { return fail(res, error); } });
