import { Request, Response, Router } from 'express';
import { webhookEngine } from '../webhooks/webhookEngine';

export const webhooksRouter = Router();
type ScopedRequest = Request & { organizationId?: string; projectId?: string; environmentId?: string; user?: { id: string; role: string } };
function context(req: ScopedRequest) {
  if (!req.organizationId || !req.projectId || !req.environmentId) throw new Error('Authenticated webhook scope is required.');
  return { organizationId:req.organizationId, projectId:req.projectId, environmentId:req.environmentId, userId:req.user?.id };
}
function fail(res: Response, error: unknown, status = 400) { res.status(status).json({ error:{ code:'WEBHOOK_ERROR', message:error instanceof Error?error.message:'Webhook operation failed.' } }); }

webhooksRouter.get('/api/webhooks', async (req:ScopedRequest,res)=>{ try { res.json(await webhookEngine.list(context(req))); } catch(error){ fail(res,error); } });
webhooksRouter.post('/api/webhooks', async (req:ScopedRequest,res)=>{ try { res.status(201).json(await webhookEngine.create(context(req), { name:req.body?.name, targetUrl:req.body?.targetUrl || req.body?.target_url, events:req.body?.events, customHeaders:req.body?.customHeaders || req.body?.custom_headers, maxAttempts:req.body?.maxAttempts || req.body?.max_attempts, timeoutMs:req.body?.timeoutMs || req.body?.timeout_ms })); } catch(error){ fail(res,error); } });
webhooksRouter.patch('/api/webhooks/:id', async (req:ScopedRequest,res)=>{ try { const value=await webhookEngine.update(context(req),req.params.id,{ name:req.body?.name,targetUrl:req.body?.targetUrl||req.body?.target_url,events:req.body?.events,customHeaders:req.body?.customHeaders||req.body?.custom_headers,active:req.body?.active,maxAttempts:req.body?.maxAttempts||req.body?.max_attempts,timeoutMs:req.body?.timeoutMs||req.body?.timeout_ms }); if(!value)return fail(res,new Error('Webhook not found.'),404); res.json(value); } catch(error){ fail(res,error); } });
webhooksRouter.delete('/api/webhooks/:id', async (req:ScopedRequest,res)=>{ try { if(!await webhookEngine.remove(context(req),req.params.id))return fail(res,new Error('Webhook not found.'),404); res.status(204).end(); } catch(error){ fail(res,error); } });
webhooksRouter.post('/api/webhooks/:id/rotate-secret', async (req:ScopedRequest,res)=>{ try { res.json({ secret:await webhookEngine.rotateSecret(context(req),req.params.id) }); } catch(error){ fail(res,error); } });
webhooksRouter.post('/api/webhooks/:id/test', async (req:ScopedRequest,res)=>{ try { const d=await webhookEngine.test(context(req),req.params.id); res.json({ success:d.status==='delivered',statusCode:d.responseStatus||0,responseTimeMs:d.responseTimeMs||0,message:d.status==='delivered'?'Webhook test delivered.':d.lastError||d.status,delivery:d }); } catch(error){ fail(res,error); } });
webhooksRouter.get('/api/webhooks/deliveries/history', async (req:ScopedRequest,res)=>{ try { res.json(await webhookEngine.listDeliveries(context(req),typeof req.query.webhookId==='string'?req.query.webhookId:undefined,Number(req.query.limit)||100)); } catch(error){ fail(res,error); } });
webhooksRouter.post('/api/webhooks/deliveries/:id/replay', async (req:ScopedRequest,res)=>{ try { res.status(201).json(await webhookEngine.replay(context(req),req.params.id)); } catch(error){ fail(res,error); } });
