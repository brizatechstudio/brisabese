import { Router } from 'express';
import { ApiGateway, ApiGatewayRequest } from '../apiEngine/apiGateway';
import { advancedPlatformEngine, AdvancedContext } from '../platform/advancedPlatformEngine';

export const advancedDataRouter = Router();
export const advancedManagementRouter = Router();

advancedDataRouter.use(['/config/v1','/experiments/v1','/analytics/v1','/quality/v1','/search/v1','/ai/v1'], ApiGateway.corsAndHeadersMiddleware, ApiGateway.gatewayMiddleware);

function dataContext(req: ApiGatewayRequest): AdvancedContext {
  const ctx=req.apiContext;if(!ctx)throw new Error('Advanced platform API context is unavailable.');
  return {organizationId:ctx.organizationId,projectId:ctx.projectId,environmentId:ctx.environmentId,userId:ctx.userId,role:ctx.securityRole||ctx.callerRole,requestId:ctx.requestId,ip:req.ip,userAgent:req.headers['user-agent']};
}
function managementContext(req:any):AdvancedContext {
  if(!req.organizationId||!req.projectId||!req.environmentId||!req.user?.id||!req.user?.role)throw new Error('Authenticated organization, project, environment and user scope are required.');
  return {organizationId:req.organizationId,projectId:req.projectId,environmentId:req.environmentId,userId:req.user.id,role:req.user.role,requestId:req.headers['x-request-id'],ip:req.ip,userAgent:req.headers['user-agent']};
}
function attrs(input:any):Record<string,unknown>{return input&&typeof input==='object'&&!Array.isArray(input)?input:{};}
function fail(res:any,error:unknown,code='ADVANCED_PLATFORM_ERROR'){
  const detail=error instanceof Error?error.message:'Advanced platform operation failed.';
  const bad=/required|invalid|must|at most|too large|outside|not part|cannot|requires|between|total 10000|private|reserved|HTTPS/i.test(detail);
  const missing=/not found|disabled/i.test(detail);
  const unavailable=/not configured|unavailable|provider failed/i.test(detail);
  const status=missing?404:unavailable?503:bad?400:500;
  const message=status===500&&process.env.NODE_ENV==='production'?'Advanced platform operation failed.':detail;
  return res.status(status).json({error:{code,message}});
}

// Public/data-plane evaluation and telemetry.
advancedDataRouter.post('/config/v1/evaluate',async(req:ApiGatewayRequest,res)=>{try{const ctx=dataContext(req);const subjectId=String(req.body?.subjectId||ctx.userId||'').trim().slice(0,255);if(!subjectId)throw new Error('subjectId is required for anonymous configuration evaluation.');return res.json(await advancedPlatformEngine.evaluateConfig(ctx,subjectId,attrs(req.body?.attributes)));}catch(error){return fail(res,error,'CONFIG_EVALUATION_ERROR');}});
advancedDataRouter.post('/experiments/v1/:key/assign',async(req:ApiGatewayRequest,res)=>{try{const ctx=dataContext(req);const subjectId=String(req.body?.subjectId||ctx.userId||'').trim().slice(0,255);if(!subjectId)throw new Error('subjectId is required for anonymous experiment assignment.');return res.json(await advancedPlatformEngine.assignExperiment(ctx,req.params.key,subjectId,attrs(req.body?.attributes)));}catch(error){return fail(res,error,'EXPERIMENT_ASSIGNMENT_ERROR');}});
advancedDataRouter.post('/analytics/v1/events',async(req:ApiGatewayRequest,res)=>{try{const ctx=dataContext(req);return res.status(202).json(await advancedPlatformEngine.ingestAnalytics(ctx,Array.isArray(req.body)?req.body:req.body?.events,ctx.userId));}catch(error){return fail(res,error,'ANALYTICS_INGEST_ERROR');}});
advancedDataRouter.post('/quality/v1/events',async(req:ApiGatewayRequest,res)=>{try{const ctx=dataContext(req);return res.status(202).json(await advancedPlatformEngine.ingestQuality(ctx,Array.isArray(req.body)?req.body:req.body?.events,ctx.userId));}catch(error){return fail(res,error,'QUALITY_INGEST_ERROR');}});
advancedDataRouter.post('/search/v1/:indexKey/query',async(req:ApiGatewayRequest,res)=>{try{return res.json(await advancedPlatformEngine.search(dataContext(req),req.params.indexKey,req.body||{}));}catch(error){return fail(res,error,'SEARCH_ERROR');}});
advancedDataRouter.post('/ai/v1/:providerKey/generate',async(req:ApiGatewayRequest,res)=>{try{return res.json(await advancedPlatformEngine.aiGenerate(dataContext(req),req.params.providerKey,req.body||{}));}catch(error){return fail(res,error,'AI_GATEWAY_ERROR');}});
advancedDataRouter.post('/ai/v1/:providerKey/embeddings',async(req:ApiGatewayRequest,res)=>{try{return res.json(await advancedPlatformEngine.aiEmbed(dataContext(req),req.params.providerKey,req.body?.input));}catch(error){return fail(res,error,'AI_EMBEDDING_ERROR');}});
advancedDataRouter.post('/ai/v1/rag',async(req:ApiGatewayRequest,res)=>{try{return res.json(await advancedPlatformEngine.rag(dataContext(req),req.body||{}));}catch(error){return fail(res,error,'AI_RAG_ERROR');}});

// Segments / Remote Config / Flags.
advancedManagementRouter.get('/api/advanced/segments',async(req,res)=>{try{return res.json(await advancedPlatformEngine.listSegments(managementContext(req)));}catch(error){return fail(res,error);}});
advancedManagementRouter.post('/api/advanced/segments',async(req,res)=>{try{return res.status(201).json(await advancedPlatformEngine.saveSegment(managementContext(req),req.body||{}));}catch(error){return fail(res,error);}});
advancedManagementRouter.delete('/api/advanced/segments/:id',async(req,res)=>{try{return await advancedPlatformEngine.removeSegment(managementContext(req),req.params.id)?res.status(204).end():res.status(404).json({error:{code:'SEGMENT_NOT_FOUND',message:'Segment not found.'}});}catch(error){return fail(res,error);}});
advancedManagementRouter.get('/api/advanced/config',async(req,res)=>{try{return res.json(await advancedPlatformEngine.listRemoteConfig(managementContext(req)));}catch(error){return fail(res,error);}});
advancedManagementRouter.put('/api/advanced/config/:key',async(req,res)=>{try{return res.json(await advancedPlatformEngine.saveRemoteConfig(managementContext(req),{...req.body,key:req.params.key}));}catch(error){return fail(res,error);}});
advancedManagementRouter.delete('/api/advanced/config/:key',async(req,res)=>{try{return await advancedPlatformEngine.removeRemoteConfig(managementContext(req),req.params.key)?res.status(204).end():res.status(404).json({error:{code:'CONFIG_NOT_FOUND',message:'Remote Config parameter not found.'}});}catch(error){return fail(res,error);}});
advancedManagementRouter.get('/api/advanced/flags',async(req,res)=>{try{return res.json(await advancedPlatformEngine.listFlags(managementContext(req)));}catch(error){return fail(res,error);}});
advancedManagementRouter.put('/api/advanced/flags/:key',async(req,res)=>{try{return res.json(await advancedPlatformEngine.saveFlag(managementContext(req),{...req.body,key:req.params.key}));}catch(error){return fail(res,error);}});
advancedManagementRouter.delete('/api/advanced/flags/:key',async(req,res)=>{try{return await advancedPlatformEngine.removeFlag(managementContext(req),req.params.key)?res.status(204).end():res.status(404).json({error:{code:'FLAG_NOT_FOUND',message:'Feature flag not found.'}});}catch(error){return fail(res,error);}});

// Experiments and analytics.
advancedManagementRouter.get('/api/advanced/experiments',async(req,res)=>{try{return res.json(await advancedPlatformEngine.listExperiments(managementContext(req)));}catch(error){return fail(res,error);}});
advancedManagementRouter.post('/api/advanced/experiments',async(req,res)=>{try{return res.status(201).json(await advancedPlatformEngine.saveExperiment(managementContext(req),req.body||{}));}catch(error){return fail(res,error);}});
advancedManagementRouter.post('/api/advanced/experiments/:id/status',async(req,res)=>{try{const item=await advancedPlatformEngine.setExperimentStatus(managementContext(req),req.params.id,String(req.body?.status||''),req.body?.winnerVariant?String(req.body.winnerVariant):undefined);return item?res.json(item):res.status(404).json({error:{code:'EXPERIMENT_NOT_FOUND',message:'Experiment not found.'}});}catch(error){return fail(res,error);}});
advancedManagementRouter.get('/api/advanced/experiments/:id/metrics',async(req,res)=>{try{const item=await advancedPlatformEngine.experimentMetrics(managementContext(req),req.params.id);return item?res.json(item):res.status(404).json({error:{code:'EXPERIMENT_NOT_FOUND',message:'Experiment not found.'}});}catch(error){return fail(res,error);}});
advancedManagementRouter.get('/api/advanced/analytics/overview',async(req,res)=>{try{return res.json(await advancedPlatformEngine.analyticsOverview(managementContext(req),Number(req.query.days)||30));}catch(error){return fail(res,error);}});
advancedManagementRouter.post('/api/advanced/analytics/funnel',async(req,res)=>{try{return res.json(await advancedPlatformEngine.analyticsFunnel(managementContext(req),req.body?.events,Number(req.body?.days)||30));}catch(error){return fail(res,error);}});
advancedManagementRouter.post('/api/advanced/analytics/retention',async(req,res)=>{try{return res.json(await advancedPlatformEngine.analyticsRetention(managementContext(req),String(req.body?.firstEvent||''),String(req.body?.returnEvent||''),Number(req.body?.days)||30));}catch(error){return fail(res,error);}});

// App Quality / Distribution.
advancedManagementRouter.get('/api/advanced/quality/overview',async(req,res)=>{try{return res.json(await advancedPlatformEngine.qualityOverview(managementContext(req),Number(req.query.days)||30));}catch(error){return fail(res,error);}});
advancedManagementRouter.get('/api/advanced/quality/events',async(req,res)=>{try{return res.json(await advancedPlatformEngine.listQualityEvents(managementContext(req),Number(req.query.limit)||200));}catch(error){return fail(res,error);}});
advancedManagementRouter.get('/api/advanced/distribution',async(req,res)=>{try{return res.json(await advancedPlatformEngine.listDistribution(managementContext(req)));}catch(error){return fail(res,error);}});
advancedManagementRouter.post('/api/advanced/distribution',async(req,res)=>{try{return res.status(201).json(await advancedPlatformEngine.createDistribution(managementContext(req),req.body||{}));}catch(error){return fail(res,error);}});

// Search / Vector / AI.
advancedManagementRouter.get('/api/advanced/search/indexes',async(req,res)=>{try{return res.json(await advancedPlatformEngine.listSearchIndexes(managementContext(req)));}catch(error){return fail(res,error);}});
advancedManagementRouter.post('/api/advanced/search/indexes',async(req,res)=>{try{return res.status(201).json(await advancedPlatformEngine.saveSearchIndex(managementContext(req),req.body||{}));}catch(error){return fail(res,error);}});
advancedManagementRouter.put('/api/advanced/search/indexes/:key/documents',async(req,res)=>{try{return res.json(await advancedPlatformEngine.upsertSearchDocuments(managementContext(req),req.params.key,req.body?.documents));}catch(error){return fail(res,error);}});
advancedManagementRouter.delete('/api/advanced/search/indexes/:key/documents/:documentId',async(req,res)=>{try{return await advancedPlatformEngine.deleteSearchDocument(managementContext(req),req.params.key,req.params.documentId)?res.status(204).end():res.status(404).json({error:{code:'SEARCH_DOCUMENT_NOT_FOUND',message:'Search document not found.'}});}catch(error){return fail(res,error);}});
advancedManagementRouter.post('/api/advanced/search/indexes/:key/query',async(req,res)=>{try{return res.json(await advancedPlatformEngine.search(managementContext(req),req.params.key,req.body||{}));}catch(error){return fail(res,error);}});
advancedManagementRouter.get('/api/advanced/ai/providers',async(req,res)=>{try{return res.json(await advancedPlatformEngine.listAiProviders(managementContext(req)));}catch(error){return fail(res,error);}});
advancedManagementRouter.put('/api/advanced/ai/providers/:key',async(req,res)=>{try{return res.json(await advancedPlatformEngine.saveAiProvider(managementContext(req),{...req.body,key:req.params.key}));}catch(error){return fail(res,error);}});
advancedManagementRouter.delete('/api/advanced/ai/providers/:id',async(req,res)=>{try{return await advancedPlatformEngine.removeAiProvider(managementContext(req),req.params.id)?res.status(204).end():res.status(404).json({error:{code:'AI_PROVIDER_NOT_FOUND',message:'AI provider not found.'}});}catch(error){return fail(res,error);}});
advancedManagementRouter.get('/api/advanced/ai/usage',async(req,res)=>{try{return res.json(await advancedPlatformEngine.aiUsage(managementContext(req),Number(req.query.days)||30));}catch(error){return fail(res,error);}});
advancedManagementRouter.post('/api/advanced/ai/generate',async(req,res)=>{try{return res.json(await advancedPlatformEngine.aiGenerate(managementContext(req),String(req.body?.providerKey||''),req.body||{}));}catch(error){return fail(res,error,'AI_GATEWAY_ERROR');}});
advancedManagementRouter.post('/api/advanced/ai/embeddings',async(req,res)=>{try{return res.json(await advancedPlatformEngine.aiEmbed(managementContext(req),String(req.body?.providerKey||''),req.body?.input));}catch(error){return fail(res,error,'AI_EMBEDDING_ERROR');}});
advancedManagementRouter.post('/api/advanced/ai/rag',async(req,res)=>{try{return res.json(await advancedPlatformEngine.rag(managementContext(req),req.body||{}));}catch(error){return fail(res,error,'AI_RAG_ERROR');}});

// Advanced Messaging.
advancedManagementRouter.get('/api/advanced/messaging/templates',async(req,res)=>{try{return res.json(await advancedPlatformEngine.listTemplates(managementContext(req)));}catch(error){return fail(res,error);}});
advancedManagementRouter.post('/api/advanced/messaging/templates',async(req,res)=>{try{return res.status(201).json(await advancedPlatformEngine.saveTemplate(managementContext(req),req.body||{}));}catch(error){return fail(res,error);}});
advancedManagementRouter.get('/api/advanced/messaging/campaigns',async(req,res)=>{try{return res.json(await advancedPlatformEngine.listCampaigns(managementContext(req)));}catch(error){return fail(res,error);}});
advancedManagementRouter.post('/api/advanced/messaging/campaigns',async(req,res)=>{try{return res.status(201).json(await advancedPlatformEngine.createCampaign(managementContext(req),req.body||{}));}catch(error){return fail(res,error);}});
advancedManagementRouter.post('/api/advanced/messaging/campaigns/:id/send',async(req,res)=>{try{return res.json(await advancedPlatformEngine.sendCampaign(managementContext(req),req.params.id));}catch(error){return fail(res,error);}});
advancedManagementRouter.delete('/api/advanced/messaging/campaigns/:id',async(req,res)=>{try{return await advancedPlatformEngine.cancelCampaign(managementContext(req),req.params.id)?res.status(204).end():res.status(409).json({error:{code:'CAMPAIGN_NOT_CANCELLABLE',message:'Only queued campaigns can be cancelled.'}});}catch(error){return fail(res,error);}});
