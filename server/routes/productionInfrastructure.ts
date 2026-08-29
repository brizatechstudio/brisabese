import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../config';
import { productionInfrastructureEngine, ProductionInfrastructureContext } from '../infrastructure/productionInfrastructureEngine';

export const productionInfrastructureRouter = Router();
export const publicStatusRouter = Router();

function context(req:any): ProductionInfrastructureContext {
  if (!req.organizationId || !req.projectId || !req.environmentId || !req.user?.id || !req.user?.role) throw new Error('Authenticated infrastructure scope is required.');
  return { organizationId:req.organizationId,projectId:req.projectId,environmentId:req.environmentId,userId:req.user.id,role:req.user.role };
}
function fail(res:any,error:any){ const detail=error?.message||'Infrastructure operation failed.'; const status=/not found/i.test(detail)?404:/requires|required|invalid/i.test(detail)?400:500; return res.status(status).json({error:{code:'INFRASTRUCTURE_RUNTIME_ERROR',message:status>=500&&process.env.NODE_ENV==='production'?'Infrastructure operation failed.':detail}}); }

productionInfrastructureRouter.get('/api/infrastructure/overview', async(req,res)=>{ try{return res.json(await productionInfrastructureEngine.overview(context(req)));}catch(e){return fail(res,e);} });
productionInfrastructureRouter.get('/api/infrastructure/regions', (req,res)=>{ try{return res.json([{code:process.env.BRISABASE_REGION||'local-1',name:process.env.BRISABASE_REGION||'local-1',continent:'configured',zones:[],status:'healthy',latencyMs:0}]);}catch(e){return fail(res,e);} });
productionInfrastructureRouter.get('/api/infrastructure/nodes', async(req,res)=>{ try{return res.json(await productionInfrastructureEngine.instances(context(req)));}catch(e){return fail(res,e);} });
productionInfrastructureRouter.get('/api/infrastructure/services', async(req,res)=>{ try{return res.json(await productionInfrastructureEngine.services(context(req)));}catch(e){return fail(res,e);} });
productionInfrastructureRouter.get('/api/infrastructure/deployments', async(req,res)=>{ try{return res.json(await productionInfrastructureEngine.deployments(context(req)));}catch(e){return fail(res,e);} });
productionInfrastructureRouter.get('/api/infrastructure/scaling', async(req,res)=>{ try{const nodes=await productionInfrastructureEngine.instances(context(req));return res.json({mode:'external-orchestrator',replicasObserved:nodes.length,statelessApi:true,policies:[],decisions:[]});}catch(e){return fail(res,e);} });
productionInfrastructureRouter.get('/api/infrastructure/replication', async(req,res)=>{ try{context(req);return res.json([{resource:'database',status:'provider-managed-or-external',configured:process.env.BRISABASE_PRODUCTION_TIER==='ha'},{resource:'redis',status:'provider-managed-or-external',configured:process.env.BRISABASE_PRODUCTION_TIER==='ha'},{resource:'storage',status:'provider-managed-or-external',configured:process.env.BRISABASE_PRODUCTION_TIER==='ha'}]);}catch(e){return fail(res,e);} });
productionInfrastructureRouter.get('/api/infrastructure/networking', (req,res)=>{ try{context(req);return res.json(productionInfrastructureEngine.networking());}catch(e){return fail(res,e);} });
productionInfrastructureRouter.get('/api/infrastructure/health', async(req,res)=>{ try{context(req);return res.json(await productionInfrastructureEngine.health());}catch(e){return fail(res,e);} });
productionInfrastructureRouter.get('/api/infrastructure/incidents', async(req,res)=>{ try{return res.json(await productionInfrastructureEngine.incidents(context(req)));}catch(e){return fail(res,e);} });
productionInfrastructureRouter.post('/api/infrastructure/incidents', async(req,res)=>{ try{return res.status(201).json(await productionInfrastructureEngine.createIncident(context(req),req.body||{}));}catch(e){return fail(res,e);} });
productionInfrastructureRouter.patch('/api/infrastructure/incidents/:id', async(req,res)=>{ try{return res.json(await productionInfrastructureEngine.updateIncident(context(req),req.params.id,req.body||{}));}catch(e){return fail(res,e);} });


function platformOperatorAuthorized(req:any): boolean {
  const expected=String(config.infrastructure.operationsToken||'');
  const auth=String(req.headers.authorization||'');
  if(Buffer.byteLength(expected,'utf8')<32||!auth.startsWith('Bearer ')) return false;
  const received=auth.slice(7).trim();
  const a=crypto.createHash('sha256').update(expected).digest();
  const b=crypto.createHash('sha256').update(received).digest();
  return crypto.timingSafeEqual(a,b);
}

publicStatusRouter.post('/internal/infrastructure/incidents', async(req,res)=>{
  if(!platformOperatorAuthorized(req)) return res.status(401).json({error:{code:'OPERATIONS_OPERATOR_UNAUTHORIZED',message:'Operations operator authentication failed.'}});
  try{return res.status(201).json(await productionInfrastructureEngine.createPlatformIncident(req.body||{}));}catch(e){return fail(res,e);}
});
publicStatusRouter.patch('/internal/infrastructure/incidents/:id', async(req,res)=>{
  if(!platformOperatorAuthorized(req)) return res.status(401).json({error:{code:'OPERATIONS_OPERATOR_UNAUTHORIZED',message:'Operations operator authentication failed.'}});
  try{return res.json(await productionInfrastructureEngine.updatePlatformIncident(req.params.id,req.body||{}));}catch(e){return fail(res,e);}
});

publicStatusRouter.get('/status', async(_req,res)=>{ try{return res.json(await productionInfrastructureEngine.publicStatus());}catch{return res.status(503).json({name:'BrisaBase',status:'unhealthy'});} });
