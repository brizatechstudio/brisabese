import os from 'node:os';
import crypto from 'node:crypto';
import { postgres } from '../db/postgres';
import { redisClient } from '../redis';
import { realStorageEngine } from '../storage/realStorageEngine';
import { persistentFunctionEngine } from '../functions/persistentFunctionEngine';
import { config } from '../config';

export type ProductionInfrastructureContext = {
  organizationId: string;
  projectId: string;
  environmentId: string;
  userId: string;
  role: string;
};

const MANAGE = new Set(['owner','admin','service']);
const EDIT = new Set(['owner','admin','developer','service']);

function incidentId(): string { return `inc_${crypto.randomUUID().replace(/-/g,'').slice(0,20)}`; }

export class ProductionInfrastructureEngine {
  private timer: NodeJS.Timeout | null = null;
  private readonly startedAt = new Date().toISOString();
  private readonly instanceId = config.infrastructure.instanceId || `bb_${os.hostname().replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,60)}_${process.pid}`;

  public async start(): Promise<void> {
    await this.heartbeat('healthy');
    if (!this.timer) {
      this.timer = setInterval(() => void this.heartbeat('healthy').catch(() => undefined), 15_000);
      this.timer.unref();
    }
  }

  public async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.heartbeat('stopped').catch(() => undefined);
  }

  private async heartbeat(status: 'healthy'|'stopped'): Promise<void> {
    if (config.testMode) return;
    await postgres.execute(
      `INSERT INTO runtime_instances(id,release,region,hostname,status,metadata,started_at,last_heartbeat_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,now())
       ON CONFLICT(id) DO UPDATE SET release=EXCLUDED.release,region=EXCLUDED.region,hostname=EXCLUDED.hostname,status=EXCLUDED.status,metadata=EXCLUDED.metadata,last_heartbeat_at=now()`,
      [this.instanceId, config.release || 'development', config.infrastructure.region, os.hostname(), status, JSON.stringify({ pid: process.pid, deploymentMode: config.deploymentMode, productionTier: config.infrastructure.productionTier }), this.startedAt],
    );
  }

  private assertView(ctx: ProductionInfrastructureContext): void {
    if (!EDIT.has(ctx.role)) throw new Error('Infrastructure visibility requires developer, admin, owner, or service role.');
  }
  private assertManage(ctx: ProductionInfrastructureContext): void {
    if (!MANAGE.has(ctx.role)) throw new Error('Infrastructure management requires admin, owner, or service role.');
  }

  public async health() {
    const [database, redis, storage, functions] = await Promise.all([
      postgres.healthCheck(), redisClient.healthCheck(), config.storage.enabled ? realStorageEngine.health() : Promise.resolve({ status: 'disabled', provider: 'disabled' } as any),
      config.functions.enabled ? persistentFunctionEngine.health(false) : Promise.resolve({ status: 'disabled', details: {} } as any),
    ]);
    const services = [database.status, redis.status, storage.status, functions.status].filter((value) => value !== 'disabled');
    const status = services.every((value) => value === 'ok') ? 'healthy' : services.some((value) => value === 'ok') ? 'degraded' : 'unhealthy';
    return { status, checkedAt: new Date().toISOString(), database, redis, storage, functions, backup: { enabled: config.backup.enabled, restoreCertified: config.backup.certified, pitrEnabled: config.backup.pitrEnabled, pitrProvider: config.backup.pitrProvider || null }, hosting: { enabled: config.hosting.enabled, customDomainsEnabled: config.hosting.customDomainsEnabled } };
  }

  public async instances(ctx: ProductionInfrastructureContext) {
    this.assertView(ctx);
    if (config.testMode) return [{ id: this.instanceId, release: config.release, region: config.infrastructure.region, hostname: os.hostname(), status: 'healthy', started_at: this.startedAt, last_heartbeat_at: new Date().toISOString() }];
    await postgres.execute(`UPDATE runtime_instances SET status='degraded' WHERE status='healthy' AND last_heartbeat_at < now() - interval '45 seconds'`);
    await postgres.execute(`UPDATE runtime_instances SET status='stopped' WHERE status IN ('healthy','degraded') AND last_heartbeat_at < now() - interval '5 minutes'`);
    return postgres.query<any>(`SELECT * FROM runtime_instances WHERE last_heartbeat_at > now() - interval '10 minutes' ORDER BY last_heartbeat_at DESC`);
  }

  public async overview(ctx: ProductionInfrastructureContext) {
    this.assertView(ctx);
    const [health, instances] = await Promise.all([this.health(), this.instances(ctx)]);
    const healthy = instances.filter((item:any)=>item.status==='healthy').length;
    const degraded = instances.filter((item:any)=>item.status==='degraded').length;
    const offline = instances.filter((item:any)=>['stopped','draining'].includes(item.status)).length;
    return {
      mode: 'production-runtime',
      deploymentMode: config.deploymentMode,
      productionTier: config.infrastructure.productionTier,
      release: config.release,
      regions: [{ code: config.infrastructure.region, name: config.infrastructure.region, continent: 'configured', status: health.status === 'unhealthy' ? 'degraded' : 'healthy', zones: [], latencyMs: 0 }],
      cluster: { healthy, degraded, offline, replicasObserved: instances.length },
      health,
      capabilities: {
        statelessApiHorizontalScaling: true,
        distributedRealtime: true,
        distributedRateLimiting: true,
        externalDatabaseHaRequiredForHaTier: config.infrastructure.productionTier === 'ha',
        externalRedisHaRequiredForHaTier: config.infrastructure.productionTier === 'ha',
        externalObjectStorageReplicationRequiredForHaTier: config.infrastructure.productionTier === 'ha',
        embeddedMultiAzProvisioning: false,
      },
      networking: this.networking(),
    };
  }

  public networking() {
    return {
      publicTls: config.production,
      trustProxy: config.trustProxy,
      functionsPrivatePlane: config.functions.enabled,
      customDomainOnDemandTls: config.hosting.customDomainsEnabled,
      appUrl: config.appUrl,
      storagePublicUrl: config.storagePublicUrl,
      region: config.infrastructure.region,
    };
  }

  public async services(ctx: ProductionInfrastructureContext) {
    this.assertView(ctx);
    const health = await this.health();
    const rows = [
      ['database', health.database], ['redis', health.redis], ['storage', health.storage], ['functions', health.functions],
      ['backup', health.backup], ['hosting', health.hosting], ['realtime', { enabled: config.realtime.enabled }], ['observability', { enabled: config.observability.enabled }],
    ];
    return rows.map(([service, details]) => ({ id: String(service), service, region: config.infrastructure.region, status: (details as any).status === 'degraded' ? 'degraded' : (details as any).status === 'disabled' || (details as any).enabled === false ? 'offline' : 'healthy', endpoint: service === 'storage' ? config.storagePublicUrl : config.appUrl, version: config.release, activeConnections: 0, details }));
  }

  public async deployments(ctx: ProductionInfrastructureContext) {
    this.assertView(ctx);
    const instances = await this.instances(ctx);
    const groups = new Map<string, any>();
    for (const item of instances) {
      const key = `${item.release}:${item.region}`;
      const current = groups.get(key) || { id: key, service: 'api', version: item.release, strategy: 'external-orchestrator', provider: config.deploymentMode, author: 'runtime', status: 'completed', replicas: 0, startedAt: item.started_at };
      current.replicas += 1; groups.set(key,current);
    }
    return Array.from(groups.values());
  }

  public async incidents(ctx: ProductionInfrastructureContext) {
    this.assertView(ctx);
    return postgres.query<any>(`SELECT * FROM operations_incidents WHERE (project_id IS NULL OR (project_id=$1 AND environment_id=$2)) ORDER BY started_at DESC LIMIT 100`, [ctx.projectId, ctx.environmentId]);
  }

  public async createIncident(ctx: ProductionInfrastructureContext, input: { title: string; summary?: string; severity?: string }) {
    this.assertManage(ctx);
    const title = String(input.title || '').trim(); if (!title) throw new Error('Incident title is required.');
    const severity = ['info','minor','major','critical'].includes(String(input.severity)) ? String(input.severity) : 'minor';
    const row = (await postgres.query<any>(`INSERT INTO operations_incidents(id,organization_id,project_id,environment_id,title,summary,severity,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'investigating',$8) RETURNING *`, [incidentId(),ctx.organizationId,ctx.projectId,ctx.environmentId,title,String(input.summary||''),severity,ctx.userId]))[0];
    return row;
  }

  public async updateIncident(ctx: ProductionInfrastructureContext, id: string, patch: { status?: string; summary?: string }) {
    this.assertManage(ctx);
    const status = patch.status && ['investigating','identified','monitoring','resolved'].includes(patch.status) ? patch.status : undefined;
    const rows = await postgres.query<any>(`UPDATE operations_incidents SET status=COALESCE($4,status),summary=COALESCE($5,summary),resolved_at=CASE WHEN $4='resolved' THEN now() WHEN $4 IS NOT NULL AND $4<>'resolved' THEN NULL ELSE resolved_at END,updated_at=now() WHERE id=$1 AND project_id=$2 AND environment_id=$3 RETURNING *`, [id,ctx.projectId,ctx.environmentId,status||null,patch.summary === undefined ? null : String(patch.summary)]);
    if (!rows[0]) throw new Error('Incident not found.'); return rows[0];
  }

  public async createPlatformIncident(input: { title: string; summary?: string; severity?: string }, createdBy = 'operator') {
    const title = String(input.title || '').trim();
    if (!title) throw new Error('Incident title is required.');
    const severity = ['info','minor','major','critical'].includes(String(input.severity)) ? String(input.severity) : 'minor';
    return (await postgres.query<any>(
      `INSERT INTO operations_incidents(id,organization_id,project_id,environment_id,title,summary,severity,status,created_by)
       VALUES($1,NULL,NULL,NULL,$2,$3,$4,'investigating',$5) RETURNING *`,
      [incidentId(), title, String(input.summary || ''), severity, createdBy],
    ))[0];
  }

  public async updatePlatformIncident(id: string, patch: { status?: string; summary?: string }) {
    const status = patch.status && ['investigating','identified','monitoring','resolved'].includes(patch.status) ? patch.status : undefined;
    const rows = await postgres.query<any>(
      `UPDATE operations_incidents SET status=COALESCE($2,status),summary=COALESCE($3,summary),
       resolved_at=CASE WHEN $2='resolved' THEN now() WHEN $2 IS NOT NULL AND $2<>'resolved' THEN NULL ELSE resolved_at END,updated_at=now()
       WHERE id=$1 AND project_id IS NULL AND environment_id IS NULL RETURNING *`,
      [id, status || null, patch.summary === undefined ? null : String(patch.summary)],
    );
    if (!rows[0]) throw new Error('Incident not found.');
    return rows[0];
  }

  public async publicStatus() {
    const health = await this.health();
    const incidents = config.testMode ? [] : await postgres.query<any>(`SELECT id,title,summary,severity,status,started_at,resolved_at,updated_at FROM operations_incidents WHERE project_id IS NULL AND environment_id IS NULL AND status <> 'resolved' ORDER BY started_at DESC LIMIT 20`);
    return { name: 'BrisaBase', status: health.status, release: config.release, checkedAt: health.checkedAt, services: { database: health.database.status, redis: health.redis.status, storage: health.storage.status, functions: health.functions.status, backup: config.backup.enabled ? 'enabled' : 'disabled', hosting: config.hosting.enabled ? 'enabled' : 'disabled' }, incidents };
  }
}

export const productionInfrastructureEngine = new ProductionInfrastructureEngine();
