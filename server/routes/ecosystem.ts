import { Router } from 'express';
import { developerPlatform } from '../../developer/platform';
import { DeveloperContext } from '../../developer/types';

export const ecosystemRouter = Router();
function context(req: any): DeveloperContext { return { organizationId: req.organizationId || 'org_core_1', projectId: (req.headers['x-project-id'] as string) || 'proj_ecommerce_1', environmentId: (req.headers['x-environment-id'] as string) || 'env_proj_ecommerce_1_production', userId: req.user?.id || 'usr_owner_1', role: req.user?.role || 'owner', requestId: req.headers['x-request-id'] as string | undefined, ip: req.ip, userAgent: req.headers['user-agent'] }; }
function fail(res: any, error: any) { const message = error?.message || 'Ecosystem operation failed.'; const status = /not found/i.test(message) ? 404 : /invalid|required|unsupported|requires/i.test(message) ? 400 : 500; return res.status(status).json({ error: { code: status === 404 ? 'ECOSYSTEM_NOT_FOUND' : 'ECOSYSTEM_ERROR', message } }); }

ecosystemRouter.get('/api/ecosystem/overview', (req, res) => res.json(developerPlatform.overview(context(req))));
ecosystemRouter.get('/api/ecosystem/sdks', (_req, res) => res.json(developerPlatform.sdk.list()));
ecosystemRouter.post('/api/ecosystem/sdks/generate', (req, res) => { try { return res.status(201).json(developerPlatform.generateSdk(context(req), req.body?.target, req.body?.version)); } catch (error) { return fail(res, error); } });
ecosystemRouter.get('/api/ecosystem/templates', (_req, res) => res.json(developerPlatform.templates.list()));
ecosystemRouter.post('/api/ecosystem/templates', (req, res) => { try { return res.status(201).json(developerPlatform.createTemplate(context(req), req.body)); } catch (error) { return fail(res, error); } });
ecosystemRouter.get('/api/ecosystem/marketplace', (req, res) => res.json(developerPlatform.marketplace.list(req.query.category as any)));
ecosystemRouter.post('/api/ecosystem/marketplace', (req, res) => { try { return res.status(201).json(developerPlatform.marketplace.publish(req.body)); } catch (error) { return fail(res, error); } });
ecosystemRouter.get('/api/ecosystem/plugins', (req, res) => res.json(developerPlatform.plugins.list(context(req))));
ecosystemRouter.get('/api/ecosystem/plugins/catalog', (_req, res) => res.json(developerPlatform.pluginCatalog()));
ecosystemRouter.post('/api/ecosystem/plugins/install', (req, res) => { try { return res.status(201).json(developerPlatform.installPlugin(context(req), req.body)); } catch (error) { return fail(res, error); } });
ecosystemRouter.delete('/api/ecosystem/plugins/:id', (req, res) => { try { return developerPlatform.removePlugin(context(req), req.params.id) ? res.status(204).end() : res.status(404).end(); } catch (error) { return fail(res, error); } });
ecosystemRouter.get('/api/ecosystem/documentation', (req, res) => res.json(req.query.search ? developerPlatform.docs.search(String(req.query.search)) : developerPlatform.docs.list(req.query.section as any)));
ecosystemRouter.get('/api/ecosystem/extensions', (_req, res) => res.json(developerPlatform.extensions));
ecosystemRouter.post('/api/ecosystem/generate', (req, res) => { try { return res.status(201).json(developerPlatform.generateCode(context(req), req.body)); } catch (error) { return fail(res, error); } });
ecosystemRouter.post('/api/ecosystem/playground', async (req, res) => { try { return res.json(await developerPlatform.executePlayground(context(req), req.body)); } catch (error) { return fail(res, error); } });
ecosystemRouter.get('/api/ecosystem/updates', (_req, res) => res.json({ cli: { current: '1.0.0', latest: '1.0.0', available: false }, sdk: { current: '1.0.0', latest: '1.0.0', available: false } }));
