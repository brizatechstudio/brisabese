import crypto from 'node:crypto';
import { Router, raw } from 'express';
import { hostingEngine, HostingContext } from '../platform/hostingEngine';
import { config } from '../config';

export const hostingPublicRouter = Router();
export const hostingManagementRouter = Router();
export const hostingCustomDomainRouter = Router();
export const hostingInternalRouter = Router();

function context(req: any): HostingContext {
  if (!req.organizationId || !req.projectId || !req.environmentId || !req.user?.id || !req.user?.role) throw new Error('Authenticated organization, project, environment, and user scope are required.');
  return { organizationId:req.organizationId,projectId:req.projectId,environmentId:req.environmentId,userId:req.user.id,role:req.user.role,requestId:req.headers['x-request-id'] as string|undefined,ip:req.ip,userAgent:req.headers['user-agent'] };
}
function fail(res:any,error:any){ const detail=error?.message||'Hosting operation failed.'; const status=/not found/i.test(detail)?404:/already|unique|duplicate/i.test(detail)?409:/requires|required|invalid|exceeds|at most|disabled|verification/i.test(detail)?400:500; const message=status>=500&&process.env.NODE_ENV==='production'?'Hosting operation failed.':detail; return res.status(status).json({error:{code:status===404?'HOSTING_NOT_FOUND':status===409?'HOSTING_CONFLICT':'HOSTING_ERROR',message}}); }

function serve(res:any,value:any){
  if(value?.redirect){ res.redirect(value.redirect.status,value.redirect.location); return; }
  res.status(200); res.setHeader('Content-Type',value.mimeType); res.setHeader('Content-Length',String(value.size)); res.setHeader('Cache-Control',value.cacheControl); res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','strict-origin-when-cross-origin'); res.setHeader('Content-Security-Policy',"object-src 'none'; base-uri 'self'; frame-ancestors 'self'"); if(value.etag)res.setHeader('ETag',value.etag); value.stream.on('error',()=>res.destroy()); value.stream.pipe(res);
}

hostingPublicRouter.get('/hosting/v1/:projectId/:environmentId/:siteSlug',(req,res)=>res.redirect(308,`${req.originalUrl.replace(/\?.*$/,'').replace(/\/$/,'')}/${req.url.includes('?')?`?${req.url.split('?')[1]}`:''}`));
hostingPublicRouter.get('/hosting/v1/:projectId/:environmentId/:siteSlug/_deploy/:deploymentId/*',async(req,res)=>{try{const value=await hostingEngine.resolvePreview(req.params.projectId,req.params.environmentId,req.params.siteSlug,req.params.deploymentId,String((req.params as any)[0]||'index.html'));if(!value)return res.status(404).type('text/plain').send('Not found.');serve(res,value);return undefined;}catch{return res.status(404).type('text/plain').send('Not found.');}});
hostingPublicRouter.get('/hosting/v1/:projectId/:environmentId/:siteSlug/*',async(req,res)=>{try{const value=await hostingEngine.resolvePublic(req.params.projectId,req.params.environmentId,req.params.siteSlug,String((req.params as any)[0]||'index.html'));if(!value)return res.status(404).type('text/plain').send('Not found.');serve(res,value);return undefined;}catch{return res.status(404).type('text/plain').send('Not found.');}});

// This middleware runs before the BrisaBase SPA. It only consumes requests for
// DNS-verified custom hosting domains; the admin/API hostname falls through.
hostingCustomDomainRouter.use(async(req,res,next)=>{
  if(!config.hosting.enabled||!config.hosting.customDomainsEnabled||!['GET','HEAD'].includes(req.method))return next();
  const host=String(req.headers.host||'').split(':')[0].toLowerCase();
  if(!host||host===new URL(config.appUrl||'http://localhost').hostname||host===new URL(config.storagePublicUrl||'http://localhost').hostname)return next();
  try{const value=await hostingEngine.resolveCustomDomain(host,req.path.replace(/^\/+/, '')||'index.html');if(!value)return next();serve(res,value);return undefined;}catch{return next();}
});

function operatorAuthorized(req:any):boolean{
  const expected=String(config.hosting.caddyAskToken||''); const received=String(req.query?.token||''); if(Buffer.byteLength(expected)<32||Buffer.byteLength(received)<32)return false;
  const a=crypto.createHash('sha256').update(expected).digest(); const b=crypto.createHash('sha256').update(received).digest(); return crypto.timingSafeEqual(a,b);
}
hostingInternalRouter.get('/internal/hosting/domain-authorized',async(req,res)=>{if(!operatorAuthorized(req))return res.status(401).end();const domain=String(req.query?.domain||'');return res.status(await hostingEngine.domainAuthorized(domain)?200:404).end();});

hostingManagementRouter.get('/api/hosting/sites',async(req,res)=>{try{return res.json(await hostingEngine.listSites(context(req)));}catch(e){return fail(res,e);}});
hostingManagementRouter.post('/api/hosting/sites',async(req,res)=>{try{return res.status(201).json(await hostingEngine.createSite(context(req),{name:String(req.body?.name||''),slug:req.body?.slug?String(req.body.slug):undefined}));}catch(e){return fail(res,e);}});
hostingManagementRouter.patch('/api/hosting/sites/:siteId/config',async(req,res)=>{try{return res.json(await hostingEngine.updateConfig(context(req),req.params.siteId,req.body||{}));}catch(e){return fail(res,e);}});
hostingManagementRouter.get('/api/hosting/sites/:siteId/deployments',async(req,res)=>{try{return res.json(await hostingEngine.listDeployments(context(req),req.params.siteId));}catch(e){return fail(res,e);}});
hostingManagementRouter.post('/api/hosting/sites/:siteId/deployments/start',async(req,res)=>{try{return res.status(201).json(await hostingEngine.startDeployment(context(req),req.params.siteId));}catch(e){return fail(res,e);}});
hostingManagementRouter.put('/api/hosting/sites/:siteId/deployments/:deploymentId/files', raw({type:'application/octet-stream',limit:'10mb'}), async(req:any,res)=>{try{return res.status(201).json(await hostingEngine.uploadDeploymentFile(context(req),req.params.siteId,req.params.deploymentId,String(req.query.path||''),Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0),String(req.headers['x-file-mime']||''),req.headers['x-cache-control']?String(req.headers['x-cache-control']):undefined));}catch(e){return fail(res,e);}});
hostingManagementRouter.post('/api/hosting/sites/:siteId/deployments/:deploymentId/finalize',async(req,res)=>{try{return res.json(await hostingEngine.finalizeDeployment(context(req),req.params.siteId,req.params.deploymentId,req.body?.activate!==false));}catch(e){return fail(res,e);}});
hostingManagementRouter.post('/api/hosting/sites/:siteId/deployments',async(req,res)=>{try{return res.status(201).json(await hostingEngine.deploy(context(req),req.params.siteId,Array.isArray(req.body?.files)?req.body.files:[]));}catch(e){return fail(res,e);}});
hostingManagementRouter.post('/api/hosting/sites/:siteId/deployments/:deploymentId/activate',async(req,res)=>{try{return res.json(await hostingEngine.activate(context(req),req.params.siteId,req.params.deploymentId));}catch(e){return fail(res,e);}});
hostingManagementRouter.get('/api/hosting/sites/:siteId/domains',async(req,res)=>{try{return res.json(await hostingEngine.listDomains(context(req),req.params.siteId));}catch(e){return fail(res,e);}});
hostingManagementRouter.post('/api/hosting/sites/:siteId/domains',async(req,res)=>{try{return res.status(201).json(await hostingEngine.addDomain(context(req),req.params.siteId,String(req.body?.hostname||'')));}catch(e){return fail(res,e);}});
hostingManagementRouter.post('/api/hosting/sites/:siteId/domains/:domainId/verify',async(req,res)=>{try{return res.json(await hostingEngine.verifyDomain(context(req),req.params.siteId,req.params.domainId));}catch(e){return fail(res,e);}});
hostingManagementRouter.delete('/api/hosting/sites/:siteId/domains/:domainId',async(req,res)=>{try{return await hostingEngine.removeDomain(context(req),req.params.siteId,req.params.domainId)?res.status(204).end():res.status(404).json({error:{code:'HOSTING_NOT_FOUND',message:'Hosting domain was not found.'}});}catch(e){return fail(res,e);}});
hostingManagementRouter.delete('/api/hosting/sites/:siteId',async(req,res)=>{try{return await hostingEngine.disable(context(req),req.params.siteId)?res.status(204).end():res.status(404).json({error:{code:'HOSTING_NOT_FOUND',message:'Hosting site was not found.'}});}catch(e){return fail(res,e);}});
