import crypto from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import { resolveTxt } from 'node:dns/promises';
import { isIP } from 'node:net';
import { postgres } from '../db/postgres';
import { controlRepository } from '../db/controlRepository';
import { realStorageEngine } from '../storage/realStorageEngine';
import { StorageOpContext } from '../storage/types';
import { config } from '../config';

export type HostingContext = {
  organizationId: string;
  projectId: string;
  environmentId: string;
  userId: string;
  role: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

export type HostingFileInput = {
  path: string;
  contentBase64: string;
  mimeType?: string;
  cacheControl?: string;
};

const MANAGE_ROLES = new Set(['owner', 'admin', 'developer', 'service']);
const SYSTEM_BUCKET = 'bb-hosting';
const MAX_FILES = 500;
const MAX_DEPLOY_BYTES = 25 * 1024 * 1024;

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

function slug(value: string): string {
  const output = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  if (!output || output.length < 2) throw new Error('A valid hosting site name/slug is required.');
  return output;
}

function safePath(value: string): string {
  const normalized = path.posix.normalize(`/${value}`).replace(/^\/+/, '');
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) throw new Error('Invalid hosting file path.');
  if (normalized.length > 512) throw new Error('Hosting file path is too long.');
  return normalized;
}


function routePath(value: string): string {
  const raw = String(value || '').trim();
  if (raw === '/' || raw === '') return 'index.html';
  return safePath(raw);
}

function hostname(value: string): string {
  const output = value.trim().toLowerCase().replace(/\.$/, '');
  if (!output || output.length > 253 || isIP(output) || output === 'localhost' || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(output)) throw new Error('A valid public hostname is required.');
  return output;
}


function redirectTarget(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Redirect target is required.');
  if (raw.startsWith('/')) {
    const normalized = path.posix.normalize(raw);
    if (!normalized.startsWith('/') || normalized.includes('/../')) throw new Error('Invalid redirect target.');
    return normalized;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('invalid');
    return url.toString();
  } catch {
    throw new Error('Redirect targets must be local paths or public HTTPS URLs.');
  }
}

function defaultCacheControl(filePath: string): string {
  if (filePath === 'index.html') return 'no-cache';
  const base = path.posix.basename(filePath);
  if (/[._-][a-f0-9]{8,}(?:[._-]|\.)/i.test(base)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=300, stale-while-revalidate=60';
}

function hostingConfig(value: any): { redirects: Array<{ from: string; to: string; status?: number }>; rewrites: Array<{ from: string; to: string }>; publicEnv: Record<string,string> } {
  const source = value && typeof value === 'object' ? value : {};
  const redirects = Array.isArray(source.redirects) ? source.redirects.slice(0,100).map((item:any)=>({ from:routePath(String(item.from||'')), to:redirectTarget(String(item.to||'').slice(0,2048)), status:[301,302,307,308].includes(Number(item.status))?Number(item.status):308 })).filter((item:any)=>item.to) : [];
  const rewrites = Array.isArray(source.rewrites) ? source.rewrites.slice(0,100).map((item:any)=>({ from:routePath(String(item.from||'')), to:routePath(String(item.to||'')) })) : [];
  const publicEnv: Record<string,string> = {};
  if (source.publicEnv && typeof source.publicEnv === 'object') for (const [key,val] of Object.entries(source.publicEnv).slice(0,100)) { if (/^(?:PUBLIC_|VITE_)[A-Z][A-Z0-9_]{0,57}$/.test(key)) publicEnv[key]=String(val).slice(0,4096); }
  return { redirects, rewrites, publicEnv };
}

function mimeFor(filePath: string, supplied?: string): string {
  if (supplied && supplied !== 'application/octet-stream' && /^[\w.+-]+\/[\w.+-]+$/.test(supplied)) return supplied;
  const extension = path.posix.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.pdf': 'application/pdf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  } as Record<string, string>)[extension] || 'application/octet-stream';
}

function site(row: any) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    activeDeploymentId: row.active_deployment_id || undefined,
    customDomain: row.custom_domain || undefined,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || { redirects: [], rewrites: [], publicEnv: {} }),
    builtInUrl: config.publicUrl(`/hosting/v1/${encodeURIComponent(row.project_id)}/${encodeURIComponent(row.environment_id)}/${encodeURIComponent(row.slug)}/`),
    createdBy: row.created_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function deployment(row: any) {
  return {
    id: row.id,
    siteId: row.site_id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    version: Number(row.version),
    status: row.status,
    manifest: row.manifest || {},
    fileCount: Number(row.file_count || 0),
    sizeBytes: Number(row.size_bytes || 0),
    createdBy: row.created_by || undefined,
    createdAt: row.created_at,
    activatedAt: row.activated_at || undefined,
  };
}

export class HostingEngine {
  private assertManage(ctx: HostingContext): void {
    if (!MANAGE_ROLES.has(ctx.role)) throw new Error('Hosting management requires developer, admin, owner, or service role.');
  }

  private storageContext(ctx: Pick<HostingContext, 'organizationId' | 'projectId' | 'environmentId' | 'userId' | 'role' | 'requestId' | 'ip' | 'userAgent'>): StorageOpContext {
    return {
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      environmentId: ctx.environmentId,
      userId: ctx.userId,
      role: ctx.role,
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    } as StorageOpContext;
  }

  private async ensureBucket(ctx: HostingContext): Promise<void> {
    const storageCtx = this.storageContext(ctx);
    const buckets = await realStorageEngine.listBuckets(storageCtx);
    if (!buckets.some((item) => item.name === SYSTEM_BUCKET)) {
      await realStorageEngine.createBucket(storageCtx, {
        name: SYSTEM_BUCKET,
        isPublic: false,
        fileSizeLimit: 10 * 1024 * 1024,
        versioningEnabled: false,
      });
    }
  }

  private async assertScope(ctx: HostingContext): Promise<void> {
    const [project, environment] = await Promise.all([
      controlRepository.getProject(ctx.projectId),
      controlRepository.getEnvironment(ctx.environmentId),
    ]);
    if (!project || project.organization_id !== ctx.organizationId) throw new Error('Hosting project scope is invalid.');
    if (!environment || environment.project_id !== ctx.projectId) throw new Error('Hosting environment scope is invalid.');
  }

  public async listSites(ctx: HostingContext): Promise<any[]> {
    this.assertManage(ctx);
    await this.assertScope(ctx);
    const rows = await postgres.query<any>(
      'SELECT * FROM hosting_sites WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 ORDER BY created_at DESC',
      [ctx.organizationId, ctx.projectId, ctx.environmentId],
    );
    return rows.map(site);
  }

  public async createSite(ctx: HostingContext, input: { name: string; slug?: string }): Promise<any> {
    this.assertManage(ctx);
    await this.assertScope(ctx);
    await this.ensureBucket(ctx);
    const value = slug(input.slug || input.name);
    const row = (await postgres.query<any>(
      `INSERT INTO hosting_sites(id,organization_id,project_id,environment_id,name,slug,status,created_by)
       VALUES($1,$2,$3,$4,$5,$6,'active',$7) RETURNING *`,
      [id('site'), ctx.organizationId, ctx.projectId, ctx.environmentId, input.name.trim() || value, value, ctx.userId],
    ))[0];
    await controlRepository.logAudit({
      organization_id: ctx.organizationId,
      project_id: ctx.projectId,
      environment_id: ctx.environmentId,
      user_id: ctx.userId,
      action: 'hosting.site_created',
      resource_type: 'hosting_site',
      resource_id: row.id,
      metadata: { slug: row.slug },
      ip_address: ctx.ip,
      user_agent: ctx.userAgent,
    });
    return site(row);
  }

  private async scopedSite(ctx: HostingContext, siteId: string): Promise<any | null> {
    return (await postgres.query<any>(
      'SELECT * FROM hosting_sites WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND environment_id=$4',
      [siteId, ctx.organizationId, ctx.projectId, ctx.environmentId],
    ))[0] || null;
  }

  public async listDeployments(ctx: HostingContext, siteId: string): Promise<any[]> {
    this.assertManage(ctx);
    const current = await this.scopedSite(ctx, siteId);
    if (!current) throw new Error('Hosting site not found.');
    return (await postgres.query<any>('SELECT * FROM hosting_deployments WHERE site_id=$1 ORDER BY version DESC', [siteId])).map(deployment);
  }

  public async startDeployment(ctx: HostingContext, siteId: string): Promise<any> {
    this.assertManage(ctx); const current=await this.scopedSite(ctx,siteId); if(!current)throw new Error('Hosting site not found.'); await this.ensureBucket(ctx);
    const versionRow=(await postgres.query<{version:string}>('SELECT coalesce(max(version),0)+1 AS version FROM hosting_deployments WHERE site_id=$1',[siteId]))[0]; const version=Number(versionRow?.version||1); const deploymentId=id('deploy');
    const row=(await postgres.query<any>(`INSERT INTO hosting_deployments(id,site_id,organization_id,project_id,environment_id,version,status,manifest,file_count,size_bytes,created_by) VALUES($1,$2,$3,$4,$5,$6,'uploading','{}'::jsonb,0,0,$7) RETURNING *`,[deploymentId,siteId,ctx.organizationId,ctx.projectId,ctx.environmentId,version,ctx.userId]))[0]; return deployment(row);
  }

  public async uploadDeploymentFile(ctx: HostingContext, siteId:string, deploymentId:string, filePathInput:string, content:Buffer, suppliedMime?:string, cacheControl?:string):Promise<any>{
    this.assertManage(ctx); const current=await this.scopedSite(ctx,siteId); if(!current)throw new Error('Hosting site not found.'); const filePath=safePath(filePathInput); if(!content.length)throw new Error('Hosting file is empty.'); if(content.length>10*1024*1024)throw new Error('Hosting file exceeds the 10 MB per-file limit.');
    const row=(await postgres.query<any>(`SELECT * FROM hosting_deployments WHERE id=$1 AND site_id=$2 AND status='uploading'`,[deploymentId,siteId]))[0]; if(!row)throw new Error('Hosting deployment is not accepting files.'); const manifest=typeof row.manifest==='string'?JSON.parse(row.manifest):row.manifest||{}; const existing=manifest[filePath]; const nextCount=Number(row.file_count||0)+(existing?0:1); const nextBytes=Number(row.size_bytes||0)-Number(existing?.size||0)+content.length; if(nextCount>MAX_FILES)throw new Error(`A deployment may contain at most ${MAX_FILES} files.`); if(nextBytes>MAX_DEPLOY_BYTES)throw new Error(`Hosting deployment exceeds the ${MAX_DEPLOY_BYTES} byte limit.`);
    const mimeType=mimeFor(filePath,suppliedMime); const storageCtx=this.storageContext(ctx); await realStorageEngine.upload(storageCtx,SYSTEM_BUCKET,`sites/${siteId}/${deploymentId}/${filePath}`,content,mimeType.split(';')[0],{cacheControl:cacheControl||defaultCacheControl(filePath)}); manifest[filePath]={mimeType,size:content.length,cacheControl}; await postgres.execute(`UPDATE hosting_deployments SET manifest=$2,file_count=$3,size_bytes=$4 WHERE id=$1`,[deploymentId,JSON.stringify(manifest),nextCount,nextBytes]); return {path:filePath,size:content.length,mimeType};
  }

  public async finalizeDeployment(ctx:HostingContext,siteId:string,deploymentId:string,activate=true):Promise<any>{
    this.assertManage(ctx); if(!await this.scopedSite(ctx,siteId))throw new Error('Hosting site not found.'); const row=(await postgres.query<any>(`SELECT * FROM hosting_deployments WHERE id=$1 AND site_id=$2 AND status='uploading'`,[deploymentId,siteId]))[0]; if(!row)throw new Error('Hosting deployment is not uploadable.'); const manifest=typeof row.manifest==='string'?JSON.parse(row.manifest):row.manifest||{}; if(!manifest['index.html'])throw new Error('Static Hosting deployment requires index.html.'); await postgres.execute(`UPDATE hosting_deployments SET status='ready' WHERE id=$1`,[deploymentId]); if(activate)return this.activate(ctx,siteId,deploymentId); return deployment((await postgres.query<any>('SELECT * FROM hosting_deployments WHERE id=$1',[deploymentId]))[0]);
  }

  public async deploy(ctx: HostingContext, siteId: string, files: HostingFileInput[]): Promise<any> {
    this.assertManage(ctx);
    const current = await this.scopedSite(ctx, siteId);
    if (!current) throw new Error('Hosting site not found.');
    if (!Array.isArray(files) || files.length === 0) throw new Error('At least one hosting file is required.');
    if (files.length > MAX_FILES) throw new Error(`A deployment may contain at most ${MAX_FILES} files.`);

    const prepared = files.map((item) => {
      const filePath = safePath(String(item.path || ''));
      let content: Buffer;
      try { content = Buffer.from(String(item.contentBase64 || ''), 'base64'); }
      catch { throw new Error(`Invalid base64 content for '${filePath}'.`); }
      if (!content.length) throw new Error(`Hosting file '${filePath}' is empty.`);
      return { path: filePath, content, mimeType: mimeFor(filePath, item.mimeType), cacheControl: item.cacheControl };
    });
    const totalBytes = prepared.reduce((sum, item) => sum + item.content.length, 0);
    if (totalBytes > MAX_DEPLOY_BYTES) throw new Error(`Hosting deployment exceeds the ${MAX_DEPLOY_BYTES} byte limit.`);
    if (!prepared.some((item) => item.path === 'index.html')) throw new Error('Static Hosting deployment requires index.html.');

    await this.ensureBucket(ctx);
    const versionRow = (await postgres.query<{ version: string }>('SELECT coalesce(max(version),0)+1 AS version FROM hosting_deployments WHERE site_id=$1', [siteId]))[0];
    const version = Number(versionRow?.version || 1);
    const deploymentId = id('deploy');
    const storageCtx = this.storageContext(ctx);
    await postgres.execute(
      `INSERT INTO hosting_deployments(id,site_id,organization_id,project_id,environment_id,version,status,created_by)
       VALUES($1,$2,$3,$4,$5,$6,'uploading',$7)`,
      [deploymentId, siteId, ctx.organizationId, ctx.projectId, ctx.environmentId, version, ctx.userId],
    );

    const manifest: Record<string, { mimeType: string; size: number; cacheControl?: string }> = {};
    try {
      for (const file of prepared) {
        await realStorageEngine.upload(
          storageCtx,
          SYSTEM_BUCKET,
          `sites/${siteId}/${deploymentId}/${file.path}`,
          file.content,
          file.mimeType.split(';')[0],
          { cacheControl: file.cacheControl || defaultCacheControl(file.path) },
        );
        manifest[file.path] = { mimeType: file.mimeType, size: file.content.length, cacheControl: file.cacheControl };
      }
      await postgres.execute(
        `UPDATE hosting_deployments SET status='ready',manifest=$2,file_count=$3,size_bytes=$4 WHERE id=$1`,
        [deploymentId, JSON.stringify(manifest), prepared.length, totalBytes],
      );
      await this.activate(ctx, siteId, deploymentId);
    } catch (error) {
      await postgres.execute(`UPDATE hosting_deployments SET status='failed' WHERE id=$1`, [deploymentId]);
      throw error;
    }

    return deployment((await postgres.query<any>('SELECT * FROM hosting_deployments WHERE id=$1', [deploymentId]))[0]);
  }

  public async activate(ctx: HostingContext, siteId: string, deploymentId: string): Promise<any> {
    this.assertManage(ctx);
    const current = await this.scopedSite(ctx, siteId);
    if (!current) throw new Error('Hosting site not found.');
    const target = (await postgres.query<any>('SELECT * FROM hosting_deployments WHERE id=$1 AND site_id=$2', [deploymentId, siteId]))[0];
    if (!target || !['ready', 'active', 'superseded'].includes(target.status)) throw new Error('Hosting deployment is not ready for activation.');
    await postgres.transaction(async (client) => {
      await client.query(`UPDATE hosting_deployments SET status='superseded' WHERE site_id=$1 AND status='active' AND id<>$2`, [siteId, deploymentId]);
      await client.query(`UPDATE hosting_deployments SET status='active',activated_at=now() WHERE id=$1`, [deploymentId]);
      await client.query(`UPDATE hosting_sites SET active_deployment_id=$2,status='active',updated_at=now() WHERE id=$1`, [siteId, deploymentId]);
    });
    await controlRepository.logAudit({
      organization_id: ctx.organizationId,
      project_id: ctx.projectId,
      environment_id: ctx.environmentId,
      user_id: ctx.userId,
      action: 'hosting.deployment_activated',
      resource_type: 'hosting_deployment',
      resource_id: deploymentId,
      metadata: { siteId, version: Number(target.version) },
      ip_address: ctx.ip,
      user_agent: ctx.userAgent,
    });
    return deployment((await postgres.query<any>('SELECT * FROM hosting_deployments WHERE id=$1', [deploymentId]))[0]);
  }

  public async updateConfig(ctx: HostingContext, siteId: string, input: unknown): Promise<any> {
    this.assertManage(ctx);
    const current = await this.scopedSite(ctx, siteId);
    if (!current) throw new Error('Hosting site not found.');
    const next = hostingConfig(input);
    const row = (await postgres.query<any>('UPDATE hosting_sites SET config=$2,updated_at=now() WHERE id=$1 RETURNING *', [siteId, JSON.stringify(next)]))[0];
    await controlRepository.logAudit({ organization_id:ctx.organizationId,project_id:ctx.projectId,environment_id:ctx.environmentId,user_id:ctx.userId,action:'hosting.config_updated',resource_type:'hosting_site',resource_id:siteId,metadata:{redirects:next.redirects.length,rewrites:next.rewrites.length,publicEnvKeys:Object.keys(next.publicEnv)},ip_address:ctx.ip,user_agent:ctx.userAgent });
    return site(row);
  }

  public async listDomains(ctx: HostingContext, siteId: string): Promise<any[]> {
    this.assertManage(ctx); if (!await this.scopedSite(ctx,siteId)) throw new Error('Hosting site not found.');
    return postgres.query<any>('SELECT id,site_id,hostname,status,tls_status,verified_at,created_at,updated_at FROM hosting_domains WHERE site_id=$1 ORDER BY created_at DESC',[siteId]);
  }

  public async addDomain(ctx: HostingContext, siteId: string, value: string): Promise<any> {
    this.assertManage(ctx); if (!config.hosting.customDomainsEnabled) throw new Error('Custom hosting domains are disabled.');
    if (!await this.scopedSite(ctx,siteId)) throw new Error('Hosting site not found.');
    const domain=hostname(value); const token=`bb-domain-verification=${crypto.randomBytes(24).toString('base64url')}`;
    const row=(await postgres.query<any>(`INSERT INTO hosting_domains(id,site_id,organization_id,project_id,environment_id,hostname,verification_token,status,tls_status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'pending','pending',$8) RETURNING *`,[id('domain'),siteId,ctx.organizationId,ctx.projectId,ctx.environmentId,domain,token,ctx.userId]))[0];
    await controlRepository.logAudit({ organization_id:ctx.organizationId,project_id:ctx.projectId,environment_id:ctx.environmentId,user_id:ctx.userId,action:'hosting.domain_added',resource_type:'hosting_domain',resource_id:row.id,metadata:{hostname:domain},ip_address:ctx.ip,user_agent:ctx.userAgent });
    return { ...row, dnsRecord: { type:'TXT', name:`_brisabase.${domain}`, value:token } };
  }

  public async verifyDomain(ctx: HostingContext, siteId: string, domainId: string): Promise<any> {
    this.assertManage(ctx);
    const row=(await postgres.query<any>('SELECT * FROM hosting_domains WHERE id=$1 AND site_id=$2 AND organization_id=$3 AND project_id=$4 AND environment_id=$5',[domainId,siteId,ctx.organizationId,ctx.projectId,ctx.environmentId]))[0];
    if(!row) throw new Error('Hosting domain not found.');
    const records=await resolveTxt(`_brisabase.${row.hostname}`).catch(()=>[] as string[][]);
    const values=records.map((parts)=>parts.join(''));
    if(!values.includes(row.verification_token)) throw new Error('DNS verification TXT record was not found yet.');
    const updated=(await postgres.query<any>(`UPDATE hosting_domains SET status='verified',tls_status='pending',verified_at=now(),updated_at=now() WHERE id=$1 RETURNING *`,[domainId]))[0];
    await controlRepository.logAudit({ organization_id:ctx.organizationId,project_id:ctx.projectId,environment_id:ctx.environmentId,user_id:ctx.userId,action:'hosting.domain_verified',resource_type:'hosting_domain',resource_id:domainId,metadata:{hostname:row.hostname},ip_address:ctx.ip,user_agent:ctx.userAgent });
    return updated;
  }

  public async removeDomain(ctx: HostingContext, siteId: string, domainId: string): Promise<boolean> {
    this.assertManage(ctx);
    const rows=await postgres.query<any>('DELETE FROM hosting_domains WHERE id=$1 AND site_id=$2 AND organization_id=$3 AND project_id=$4 AND environment_id=$5 RETURNING id,hostname',[domainId,siteId,ctx.organizationId,ctx.projectId,ctx.environmentId]);
    if(rows[0]) await controlRepository.logAudit({ organization_id:ctx.organizationId,project_id:ctx.projectId,environment_id:ctx.environmentId,user_id:ctx.userId,action:'hosting.domain_removed',resource_type:'hosting_domain',resource_id:domainId,metadata:{hostname:rows[0].hostname},ip_address:ctx.ip,user_agent:ctx.userAgent });
    return Boolean(rows[0]);
  }

  public async domainAuthorized(value: string): Promise<boolean> {
    let domain:string; try{domain=hostname(value);}catch{return false;}
    const row=(await postgres.query<any>(`SELECT d.id FROM hosting_domains d JOIN hosting_sites s ON s.id=d.site_id WHERE lower(d.hostname)=lower($1) AND d.status='verified' AND s.status='active' LIMIT 1`,[domain]))[0];
    return Boolean(row);
  }

  public async disable(ctx: HostingContext, siteId: string): Promise<boolean> {
    this.assertManage(ctx);
    const current = await this.scopedSite(ctx, siteId);
    if (!current) return false;
    await postgres.execute(`UPDATE hosting_sites SET status='disabled',updated_at=now() WHERE id=$1`, [siteId]);
    return true;
  }

  private async resolveDeployment(siteRow: any, deploymentId: string, requestedPath: string): Promise<{ stream: Readable; mimeType: string; size: number; cacheControl: string; etag?: string; redirect?: { location: string; status: number } } | null> {
    const deploymentRow=(await postgres.query<any>('SELECT * FROM hosting_deployments WHERE id=$1 AND site_id=$2 AND status IN (\'ready\',\'active\',\'superseded\')',[deploymentId,siteRow.id]))[0];
    if(!deploymentRow) return null;
    const cfg=hostingConfig(typeof siteRow.config==='string'?JSON.parse(siteRow.config):siteRow.config);
    const raw=safePath(requestedPath||'index.html');
    const redirect=cfg.redirects.find((item)=>item.from===raw); if(redirect) return { redirect:{location:redirect.to,status:redirect.status||308} } as any;
    const rewrite=cfg.rewrites.find((item)=>item.from===raw); const filePath=rewrite?.to||raw;
    if(filePath==='_brisabase/env.js') {
      const content=Buffer.from(`window.__BRISABASE_PUBLIC_ENV__=${JSON.stringify(cfg.publicEnv)};`,'utf8');
      return { stream:Readable.from(content),mimeType:'text/javascript; charset=utf-8',size:content.length,cacheControl:'no-store' };
    }
    const manifest=typeof deploymentRow.manifest==='string'?JSON.parse(deploymentRow.manifest):deploymentRow.manifest||{};
    const chosen=manifest[filePath]?filePath:(!path.posix.extname(filePath)&&manifest['index.html']?'index.html':filePath); const meta=manifest[chosen]; if(!meta)return null;
    const project=await controlRepository.getProject(siteRow.project_id); const environment=await controlRepository.getEnvironment(siteRow.environment_id); if(!project||!environment||environment.project_id!==siteRow.project_id)return null;
    const storageCtx:StorageOpContext={organizationId:project.organization_id,projectId:siteRow.project_id,environmentId:siteRow.environment_id,userId:'hosting-public',role:'service',bypassRls:true} as StorageOpContext;
    const result=await realStorageEngine.stream(storageCtx,SYSTEM_BUCKET,`sites/${siteRow.id}/${deploymentId}/${chosen}`); if(!result)return null;
    return {stream:result.stream,mimeType:String(meta.mimeType||result.object.mimeType||'application/octet-stream'),size:result.object.size,cacheControl:String(meta.cacheControl||defaultCacheControl(chosen)),etag:result.object.etag};
  }

  public async resolvePublic(projectId: string, environmentId: string, siteSlug: string, requestedPath: string) {
    const current=(await postgres.query<any>(`SELECT s.* FROM hosting_sites s WHERE s.project_id=$1 AND s.environment_id=$2 AND s.slug=$3 AND s.status='active' AND s.active_deployment_id IS NOT NULL`,[projectId,environmentId,siteSlug]))[0]; if(!current)return null;
    return this.resolveDeployment(current,current.active_deployment_id,requestedPath);
  }

  public async resolvePreview(projectId:string,environmentId:string,siteSlug:string,deploymentId:string,requestedPath:string){
    const current=(await postgres.query<any>(`SELECT s.* FROM hosting_sites s WHERE s.project_id=$1 AND s.environment_id=$2 AND s.slug=$3 AND s.status='active'`,[projectId,environmentId,siteSlug]))[0]; if(!current)return null;
    return this.resolveDeployment(current,deploymentId,requestedPath);
  }

  public async resolveCustomDomain(value:string,requestedPath:string){
    let domain:string; try{domain=hostname(value);}catch{return null;}
    const current=(await postgres.query<any>(`SELECT s.*,d.id AS hosting_domain_id,d.tls_status AS hosting_tls_status FROM hosting_domains d JOIN hosting_sites s ON s.id=d.site_id WHERE lower(d.hostname)=lower($1) AND d.status='verified' AND s.status='active' AND s.active_deployment_id IS NOT NULL LIMIT 1`,[domain]))[0]; if(!current)return null;
    if(current.hosting_tls_status!=='active') await postgres.execute(`UPDATE hosting_domains SET tls_status='active',updated_at=now() WHERE id=$1 AND status='verified'`,[current.hosting_domain_id]).catch(()=>undefined);
    return this.resolveDeployment(current,current.active_deployment_id,requestedPath);
  }

}

export const hostingEngine = new HostingEngine();
