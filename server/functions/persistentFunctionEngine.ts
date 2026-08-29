import { createHash, randomUUID } from 'node:crypto';
import { postgres } from '../db/postgres';
import { controlRepository } from '../db/controlRepository';
import { realProjectDatabase } from '../db/realProjectDatabase';
import { realAuthRepository } from '../auth/realAuthRepository';
import { encryptSecret, decryptSecret } from '../auth/cryptoUtils';
import { realStorageEngine } from '../storage/realStorageEngine';
import { realtimeEngine } from '../realtime/realtimeEngine';
import { redisClient } from '../redis';
import { securityEngine } from '../security/securityEngine';
import { SecurityContext } from '../security/types';
import { observability } from '../observability';
import { config } from '../config';
import { logger } from '../logger';
import { functionRuntime } from './functionRuntime';
import {
  CreateFunctionInput, FunctionAccess, FunctionCronJob, FunctionDefinition, FunctionExecution, FunctionExecutionRequest,
  FunctionExecutionResponse, FunctionLimits, FunctionLog, FunctionMetrics, FunctionOperationContext, FunctionQueue,
  FunctionQueueJob, FunctionSecret, FunctionVersion,
} from './types';

const DEFAULT_LIMITS: FunctionLimits = { timeoutMs: 15_000, memoryMb: 128, cpuProfile: 'shared' };
const ALLOWED_TIMEOUTS = new Set([5_000, 15_000, 30_000, 60_000]);
const ALLOWED_MEMORY = new Set([128, 256, 512, 1024]);
const id = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
const time = (value: unknown) => new Date(value as string | number | Date).toISOString();
const json = <T>(value: unknown, fallback: T): T => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') { try { return JSON.parse(value) as T; } catch { return fallback; } }
  return value as T;
};
const normaliseSlug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const defaultCode = (name: string) => `export default async (req, ctx) => ({ status: 200, body: { message: "Hello from ${name}" } });`;

function definition(row: any): FunctionDefinition {
  return {
    id: row.id, organizationId: row.organization_id, projectId: row.project_id, environmentId: row.environment_id,
    name: row.name, slug: row.slug, runtime: row.runtime, status: row.status, access: row.access,
    executionMode: row.execution_mode, limits: { ...DEFAULT_LIMITS, ...json<Partial<FunctionLimits>>(row.limits, {}) } as FunctionLimits,
    currentVersion: row.current_version === null || row.current_version === undefined ? null : Number(row.current_version),
    createdAt: time(row.created_at), updatedAt: time(row.updated_at), createdBy: row.created_by || 'system', updatedBy: row.updated_by || 'system',
  };
}
function version(row: any): FunctionVersion {
  return { id: row.id, functionId: row.function_id, version: Number(row.version), code: row.source, status: row.status, createdAt: time(row.created_at), createdBy: row.created_by || 'system', changeSummary: row.change_summary || undefined };
}
function queue(row: any): FunctionQueue {
  return { id: row.id, organizationId: row.organization_id, projectId: row.project_id, environmentId: row.environment_id, name: row.name, createdAt: time(row.created_at) };
}
function job(row: any): FunctionQueueJob {
  return {
    id: row.id, queueId: row.queue_id, functionId: row.function_id, payload: json(row.payload, {}), status: row.status,
    attempts: Number(row.attempts), maxAttempts: Number(row.max_attempts), priority: Number(row.priority), availableAt: time(row.available_at),
    lastError: row.error || undefined, createdAt: time(row.created_at), updatedAt: time(row.updated_at),
  };
}
function cron(row: any): FunctionCronJob {
  return { id: row.id, functionId: row.function_id, expression: row.cron_expression, enabled: Boolean(row.enabled), lastRunAt: row.last_run_at ? time(row.last_run_at) : undefined, createdAt: time(row.created_at), createdBy: row.created_by || 'system' };
}

/**
 * PostgreSQL-backed Functions control plane. It intentionally has no cache of
 * durable objects: every definition, version, secret, schedule, job, log and
 * execution is scoped and read from the persistent store.
 */
export class PersistentFunctionEngine {
  private schedulerTimer: NodeJS.Timeout | null = null;
  private queueTimer: NodeJS.Timeout | null = null;
  private started = false;
  private schedulerReady = false;
  private readonly workerId = `fnworker_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  private readonly runningJobs = new Set<string>(); // execution-only lease state, never durable state

  public async start(): Promise<void> {
    if (this.started) return;
    const health = await this.health(false);
    if (health.status !== 'ok') throw new Error(`[BRISABASE FUNCTIONS ERROR] Persistent Functions dependencies are unavailable: ${health.reason || 'unknown error'}.`);
    await postgres.execute("UPDATE function_jobs SET status='queued', locked_at=NULL, locked_by=NULL, updated_at=now() WHERE status='processing'");
    await redisClient.subscribe('functions:queue:ready', () => { void this.processQueue(); });
    this.started = true;
    this.schedulerReady = true;
    this.schedulerTimer = setInterval(() => void this.runScheduledJobs(), 1_000);
    this.queueTimer = setInterval(() => void this.processQueue(), 250);
    this.schedulerTimer.unref(); this.queueTimer.unref();
    await this.processQueue();
  }

  public async stop(): Promise<void> {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    if (this.queueTimer) clearInterval(this.queueTimer);
    this.schedulerTimer = null; this.queueTimer = null; this.schedulerReady = false; this.started = false;
  }

  public async health(requireStarted = true): Promise<{ status: 'ok' | 'degraded'; reason?: string; details: Record<string, unknown> }> {
    const database = await postgres.healthCheck();
    const redis = await redisClient.healthCheck();
    let tables = false; let queue = false; let reason: string | undefined;
    try {
      const required = ['functions', 'function_versions', 'function_deployments', 'function_secrets', 'function_variables', 'function_schedules', 'function_queues', 'function_jobs', 'function_execution_logs'];
      const rows = await postgres.query<{ relation: string | null }>('SELECT to_regclass($1) AS relation', ['public.functions']);
      const checks = await Promise.all(required.map((name) => postgres.query<{ relation: string | null }>('SELECT to_regclass($1) AS relation', [`public.${name}`])));
      tables = Boolean(rows[0]?.relation) && checks.every((items) => Boolean(items[0]?.relation));
      const probe = `functions:health:${this.workerId}`;
      await redisClient.set(probe, { checkedAt: new Date().toISOString() }, 10);
      await redisClient.del(probe);
      await postgres.query<{ count: string }>("SELECT count(*)::text AS count FROM function_jobs WHERE status IN ('queued','processing','dead_letter')");
      queue = true;
    } catch (error: any) { reason = error?.message || 'Functions persistence probe failed.'; }
    const runtime = await functionRuntime.healthCheck();
    const execution = runtime.status === 'ok';
    const scheduler = !requireStarted || (this.started && this.schedulerReady && Boolean(this.schedulerTimer));
    if (database.status !== 'ok') reason = reason || 'PostgreSQL is unavailable.';
    else if (redis.status !== 'ok') reason = reason || 'Redis is unavailable.';
    else if (!tables) reason = reason || 'Functions migrations are missing.';
    else if (!queue) reason = reason || 'Persistent queue probe failed.';
    else if (!scheduler) reason = reason || 'Functions scheduler is not running.';
    else if (!execution) reason = reason || runtime.reason || 'Function execution plane is unavailable.';
    return { status: !reason ? 'ok' : 'degraded', reason, details: { database, redis, migrations: tables, queue, scheduler, execution, runtime } };
  }

  private assertManage(ctx: FunctionOperationContext): void {
    if (!['owner', 'admin', 'service', 'service_role'].includes(ctx.role)) throw new Error('Only owner/admin/service roles can manage functions.');
  }
  private validateLimits(limits?: Partial<FunctionLimits>): FunctionLimits {
    const resolved = { ...DEFAULT_LIMITS, ...limits } as FunctionLimits;
    if (!ALLOWED_TIMEOUTS.has(resolved.timeoutMs)) throw new Error('timeoutMs must be one of 5000, 15000, 30000 or 60000.');
    if (!ALLOWED_MEMORY.has(resolved.memoryMb)) throw new Error('memoryMb must be one of 128, 256, 512 or 1024.');
    if (!['shared', 'standard', 'performance'].includes(resolved.cpuProfile)) throw new Error('Invalid CPU profile.');
    return resolved;
  }
  private async audit(ctx: FunctionOperationContext, action: string, resourceType: string, resourceId: string, metadata?: Record<string, unknown>): Promise<void> {
    await controlRepository.logAudit({ organization_id: ctx.organizationId, project_id: ctx.projectId, environment_id: ctx.environmentId, user_id: ctx.userId || 'system', action, resource_type: resourceType, resource_id: resourceId, metadata: { ...metadata, requestId: ctx.requestId }, ip_address: ctx.ip, user_agent: ctx.userAgent });
  }
  private async find(ctx: FunctionOperationContext, idOrSlug: string): Promise<FunctionDefinition | null> {
    const rows = await postgres.query<any>('SELECT * FROM functions WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 AND (id=$4 OR slug=$4)', [ctx.organizationId, ctx.projectId, ctx.environmentId, idOrSlug]);
    return rows[0] ? definition(rows[0]) : null;
  }

  public async createFunction(ctx: FunctionOperationContext, input: CreateFunctionInput): Promise<FunctionDefinition> {
    this.assertManage(ctx);
    const name = String(input.name || '').trim(); const slug = normaliseSlug(input.slug || name);
    if (!name || !slug || slug.length > 80) throw new Error('Function name/slug is invalid.');
    if (await this.find(ctx, slug)) throw new Error(`Function '${slug}' already exists in this environment.`);
    const now = new Date().toISOString(); const limits = this.validateLimits(input.limits); const definitionId = id('fn'); const versionId = id('fnv');
    const record: FunctionDefinition = { id: definitionId, organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId, name, slug, runtime: 'nodejs20', status: 'draft', access: input.access || 'authenticated', executionMode: input.executionMode || 'user', limits, currentVersion: null, createdAt: now, updatedAt: now, createdBy: ctx.userId || 'system', updatedBy: ctx.userId || 'system' };
    const source = input.code?.trim() || defaultCode(name);
    await postgres.transaction(async (client) => {
      await client.query('INSERT INTO functions(id,organization_id,project_id,environment_id,slug,name,status,runtime,entrypoint,access,execution_mode,limits,current_version,created_by,updated_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL,$13,$13,$14,$14)', [record.id, record.organizationId, record.projectId, record.environmentId, record.slug, record.name, record.status, record.runtime, 'default', record.access, record.executionMode, JSON.stringify(record.limits), record.createdBy, now]);
      await client.query('INSERT INTO function_versions(id,function_id,version,source,entrypoint,runtime,checksum,status,change_summary,created_by,created_at) VALUES($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10)', [versionId, record.id, source, 'default', record.runtime, createHash('sha256').update(source).digest('hex'), 'draft', input.changeSummary || null, record.createdBy, now]);
    });
    await this.audit(ctx, 'function.created', 'function', record.id, { slug, version: 1 }); return record;
  }
  public async listFunctions(ctx: FunctionOperationContext): Promise<FunctionDefinition[]> {
    return (await postgres.query<any>('SELECT * FROM functions WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 ORDER BY updated_at DESC', [ctx.organizationId, ctx.projectId, ctx.environmentId])).map(definition);
  }
  public async getFunctionDefinition(ctx: FunctionOperationContext, idOrSlug: string): Promise<FunctionDefinition | null> { return this.find(ctx, idOrSlug); }
  public async listVersions(ctx: FunctionOperationContext, idOrSlug: string): Promise<FunctionVersion[]> {
    const item = await this.find(ctx, idOrSlug); if (!item) throw new Error('Function not found.');
    return (await postgres.query<any>('SELECT * FROM function_versions WHERE function_id=$1 ORDER BY version DESC', [item.id])).map(version);
  }
  public async updateFunction(ctx: FunctionOperationContext, idOrSlug: string, input: { code: string; changeSummary?: string; access?: FunctionAccess; limits?: Partial<FunctionLimits> }): Promise<FunctionVersion> {
    this.assertManage(ctx); const item = await this.find(ctx, idOrSlug); if (!item) throw new Error('Function not found.');
    if (typeof input.code !== 'string' || !input.code.trim()) throw new Error('Function code is required.');
    const next = (await postgres.query<{ version: number }>('SELECT COALESCE(MAX(version),0)+1 AS version FROM function_versions WHERE function_id=$1', [item.id]))[0].version;
    const now = new Date().toISOString(); const limits = this.validateLimits(input.limits ? { ...item.limits, ...input.limits } : item.limits); const versionId = id('fnv');
    await postgres.transaction(async (client) => {
      await client.query('INSERT INTO function_versions(id,function_id,version,source,entrypoint,runtime,checksum,status,change_summary,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [versionId, item.id, next, input.code.trim(), 'default', item.runtime, createHash('sha256').update(input.code.trim()).digest('hex'), 'draft', input.changeSummary || null, ctx.userId || 'system', now]);
      await client.query('UPDATE functions SET access=$2,limits=$3,updated_at=$4,updated_by=$5 WHERE id=$1', [item.id, input.access || item.access, JSON.stringify(limits), now, ctx.userId || 'system']);
    });
    await this.audit(ctx, 'function.updated', 'function', item.id, { version: next });
    return { id: versionId, functionId: item.id, version: next, code: input.code.trim(), status: 'draft', createdAt: now, createdBy: ctx.userId || 'system', changeSummary: input.changeSummary };
  }
  private async deploy(ctx: FunctionOperationContext, idOrSlug: string, requestedVersion?: number, rollback = false): Promise<FunctionDefinition> {
    this.assertManage(ctx); const item = await this.find(ctx, idOrSlug); if (!item) throw new Error('Function not found.');
    const versions = await this.listVersions(ctx, item.id); const target = requestedVersion === undefined ? versions[0] : versions.find((candidate) => candidate.version === requestedVersion);
    if (!target) throw new Error('Function version not found.'); const now = new Date().toISOString(); const deploymentId = id('fnd');
    await postgres.transaction(async (client) => {
      const current = await client.query<{ id: string }>("SELECT id FROM function_deployments WHERE function_id=$1 AND environment_id=$2 AND status='active' ORDER BY deployed_at DESC LIMIT 1", [item.id, item.environmentId]);
      await client.query("UPDATE function_versions SET status='superseded' WHERE function_id=$1 AND status='published'", [item.id]);
      await client.query("UPDATE function_versions SET status='published' WHERE id=$1", [target.id]);
      await client.query("UPDATE function_deployments SET status='superseded' WHERE function_id=$1 AND environment_id=$2 AND status='active'", [item.id, item.environmentId]);
      await client.query('UPDATE functions SET current_version=$2,status=$3,updated_at=$4,updated_by=$5 WHERE id=$1', [item.id, target.version, 'active', now, ctx.userId || 'system']);
      await client.query('INSERT INTO function_deployments(id,function_id,version_id,environment_id,status,deployed_at,deployed_by,rollback_of) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [deploymentId, item.id, target.id, item.environmentId, 'active', now, ctx.userId || 'system', rollback ? current.rows[0]?.id || null : null]);
    });
    const deployed = (await this.find(ctx, item.id))!; await this.audit(ctx, rollback ? 'function.rolled_back' : 'function.deployed', 'function', item.id, { version: target.version, deploymentId }); return deployed;
  }
  public async deployFunction(ctx: FunctionOperationContext, idOrSlug: string, requestedVersion?: number): Promise<FunctionDefinition> { return this.deploy(ctx, idOrSlug, requestedVersion); }
  public async rollbackFunction(ctx: FunctionOperationContext, idOrSlug: string, requestedVersion: number): Promise<FunctionDefinition> { return this.deploy(ctx, idOrSlug, requestedVersion, true); }
  public async deleteFunction(ctx: FunctionOperationContext, idOrSlug: string): Promise<boolean> {
    this.assertManage(ctx); const item = await this.find(ctx, idOrSlug); if (!item) return false;
    await postgres.execute('DELETE FROM functions WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND environment_id=$4', [item.id, ctx.organizationId, ctx.projectId, ctx.environmentId]); await this.audit(ctx, 'function.deleted', 'function', item.id, { slug: item.slug }); return true;
  }

  public async setSecret(ctx: FunctionOperationContext, name: string, value: string): Promise<Omit<FunctionSecret, 'encryptedValue'>> {
    this.assertManage(ctx); const normalised = name.trim().toUpperCase(); if (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(normalised) || !value) throw new Error('Secret name or value is invalid.');
    const existing = await postgres.query<any>('SELECT * FROM function_secrets WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 AND function_id IS NULL AND name=$4', [ctx.organizationId, ctx.projectId, ctx.environmentId, normalised]); const now = new Date().toISOString(); const secretId = existing[0]?.id || id('sec');
    if (existing[0]) await postgres.execute('UPDATE function_secrets SET encrypted_value=$2,updated_at=$3,updated_by=$4 WHERE id=$1', [secretId, encryptSecret(value), now, ctx.userId || 'system']);
    else await postgres.execute('INSERT INTO function_secrets(id,function_id,organization_id,project_id,environment_id,name,encrypted_value,created_at,updated_at,updated_by) VALUES($1,NULL,$2,$3,$4,$5,$6,$7,$7,$8)', [secretId, ctx.organizationId, ctx.projectId, ctx.environmentId, normalised, encryptSecret(value), now, ctx.userId || 'system']);
    await this.audit(ctx, existing[0] ? 'secret.updated' : 'secret.created', 'secret', secretId, { name: normalised }); return { id: secretId, organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId, name: normalised, createdAt: existing[0] ? time(existing[0].created_at) : now, updatedAt: now, updatedBy: ctx.userId || 'system' };
  }
  public async listSecrets(ctx: FunctionOperationContext): Promise<Array<Omit<FunctionSecret, 'encryptedValue'>>> {
    this.assertManage(ctx); return (await postgres.query<any>('SELECT id,organization_id,project_id,environment_id,name,created_at,updated_at,updated_by FROM function_secrets WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 AND function_id IS NULL ORDER BY name', [ctx.organizationId, ctx.projectId, ctx.environmentId])).map((row) => ({ id: row.id, organizationId: row.organization_id, projectId: row.project_id, environmentId: row.environment_id, name: row.name, createdAt: time(row.created_at), updatedAt: time(row.updated_at), updatedBy: row.updated_by || 'system' }));
  }
  public async deleteSecret(ctx: FunctionOperationContext, name: string): Promise<boolean> {
    this.assertManage(ctx); const normalised = name.trim().toUpperCase(); const rows = await postgres.query<{ id: string }>('DELETE FROM function_secrets WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 AND function_id IS NULL AND name=$4 RETURNING id', [ctx.organizationId, ctx.projectId, ctx.environmentId, normalised]); if (rows[0]) await this.audit(ctx, 'secret.deleted', 'secret', rows[0].id, { name: normalised }); return Boolean(rows[0]);
  }
  private async resolveSecrets(ctx: FunctionOperationContext): Promise<Record<string, string>> {
    const rows = await postgres.query<{ name: string; encrypted_value: string }>('SELECT name,encrypted_value FROM function_secrets WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 AND function_id IS NULL', [ctx.organizationId, ctx.projectId, ctx.environmentId]); return Object.fromEntries(rows.map((row) => [row.name, decryptSecret(row.encrypted_value)]));
  }
  public async listEnvironment(ctx: FunctionOperationContext): Promise<Record<string, string>> { this.assertManage(ctx); return this.resolveEnvironment(ctx); }
  private async resolveEnvironment(ctx: FunctionOperationContext): Promise<Record<string, string>> {
    const rows = await postgres.query<{ name: string; value: string }>('SELECT name,value FROM function_variables WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 AND function_id IS NULL', [ctx.organizationId, ctx.projectId, ctx.environmentId]); return Object.fromEntries(rows.map((row) => [row.name, row.value]));
  }
  public async deleteEnvironment(ctx: FunctionOperationContext, name: string): Promise<boolean> {
    this.assertManage(ctx);
    const normalised = name.trim().toUpperCase();
    if (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(normalised)) throw new Error('Environment variable name is invalid.');
    const rows = await postgres.query<{ id: string }>('DELETE FROM function_variables WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 AND function_id IS NULL AND name=$4 RETURNING id', [ctx.organizationId, ctx.projectId, ctx.environmentId, normalised]);
    if (rows[0]) await this.audit(ctx, 'function.environment_deleted', 'environment_variable', normalised, { name: normalised });
    return Boolean(rows[0]);
  }

  public async setEnvironment(ctx: FunctionOperationContext, name: string, value: string): Promise<{ name: string; value: string }> {
    this.assertManage(ctx); const normalised = name.trim().toUpperCase(); if (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(normalised)) throw new Error('Environment variable name is invalid.'); const now = new Date().toISOString();
    await postgres.execute('INSERT INTO function_variables(id,function_id,organization_id,project_id,environment_id,name,value,created_at,updated_at,updated_by) VALUES($1,NULL,$2,$3,$4,$5,$6,$7,$7,$8) ON CONFLICT (project_id,environment_id,name) WHERE function_id IS NULL DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by', [id('var'), ctx.organizationId, ctx.projectId, ctx.environmentId, normalised, String(value), now, ctx.userId || 'system']); await this.audit(ctx, 'function.environment_updated', 'environment_variable', normalised, { name: normalised }); return { name: normalised, value: String(value) };
  }

  private async writeLog(ctx: FunctionOperationContext, item: FunctionDefinition, versionId: string, versionNumber: number, executionId: string, level: FunctionLog['level'], message: string, data: unknown, secretValues: string[]): Promise<void> {
    let text: string; try { text = typeof message === 'string' ? message : JSON.stringify(message); } catch { text = String(message); }
    for (const secret of secretValues) if (secret) text = text.split(secret).join('[REDACTED]'); text = text.slice(0, 8192);
    await postgres.execute('INSERT INTO function_execution_logs(id,function_id,version_id,organization_id,project_id,environment_id,request_id,execution_id,record_type,level,message,data,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', [id('flog'), item.id, versionId, ctx.organizationId, ctx.projectId, ctx.environmentId, ctx.requestId || null, executionId, 'log', level, text, data === undefined ? null : JSON.stringify(data), new Date().toISOString()]);
  }
  public async listLogs(ctx: FunctionOperationContext, idOrSlug: string, limit = 100): Promise<FunctionLog[]> {
    const item = await this.find(ctx, idOrSlug); if (!item) throw new Error('Function not found.'); const rows = await postgres.query<any>('SELECT l.*,v.version FROM function_execution_logs l LEFT JOIN function_versions v ON v.id=l.version_id WHERE l.function_id=$1 AND l.organization_id=$2 AND l.project_id=$3 AND l.environment_id=$4 ORDER BY l.created_at DESC LIMIT $5', [item.id, ctx.organizationId, ctx.projectId, ctx.environmentId, Math.min(Math.max(limit, 1), 1000)]); return rows.map((row) => ({ id: row.id, functionId: row.function_id, version: Number(row.version || 0), executionId: row.execution_id, level: row.level || (row.status === 'error' ? 'error' : 'info'), message: row.message || row.error || `Execution ${row.status || 'recorded'}.`, data: json(row.data, undefined), createdAt: time(row.created_at) }));
  }
  public async getMetrics(ctx: FunctionOperationContext, idOrSlug: string): Promise<FunctionMetrics> {
    const item = await this.find(ctx, idOrSlug); if (!item) throw new Error('Function not found.'); const rows = await postgres.query<any>("SELECT count(*)::int AS invocations,count(*) FILTER (WHERE status='error')::int AS errors,count(*) FILTER (WHERE status='timeout')::int AS timeouts,coalesce(round(avg(duration_ms)),0)::int AS average FROM function_execution_logs WHERE function_id=$1 AND record_type='execution'", [item.id]); const values = rows[0] || {}; const invocations = Number(values.invocations || 0); const errors = Number(values.errors || 0); const timeouts = Number(values.timeouts || 0); return { invocations, errors, timeouts, avgDurationMs: Number(values.average || 0), successRate: invocations ? Number((((invocations - errors - timeouts) / invocations) * 100).toFixed(2)) : 100, configuredMemoryMb: item.limits.memoryMb, cpuProfile: item.limits.cpuProfile };
  }

  public async execute(ctx: FunctionOperationContext, idOrSlug: string, request: FunctionExecutionRequest): Promise<FunctionExecutionResponse> {
    const item = await this.find(ctx, idOrSlug); if (!item || item.status !== 'active' || !item.currentVersion) throw new Error('Function is not deployed.');
    const versions = await postgres.query<any>('SELECT * FROM function_versions WHERE function_id=$1 AND version=$2', [item.id, item.currentVersion]); const current = versions[0]; if (!current) throw new Error('Deployed function version is unavailable.'); const currentVersion = version(current);
    const [secrets, env] = await Promise.all([this.resolveSecrets(ctx), this.resolveEnvironment(ctx)]); const secretValues = Object.values(secrets); const executionId = id('fexec'); const startedAt = new Date().toISOString(); const started = Date.now(); const pendingLogs: Promise<void>[] = [];
    const addLog = (level: FunctionLog['level'], value: unknown) => { const task = this.writeLog(ctx, item, currentVersion.id, currentVersion.version, executionId, level, typeof value === 'string' ? value : JSON.stringify(value), undefined, secretValues); pendingLogs.push(task); return task; };
    await addLog('info', `Invocation started (${request.source}).`);
    const securityContext: SecurityContext = { organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId, userId: item.executionMode === 'service' ? `function:${item.id}` : request.userId || ctx.userId, role: item.executionMode === 'service' ? 'service' : request.role || ctx.role, sessionId: ctx.sessionId, claims: ctx.claims, ip: ctx.ip, userAgent: ctx.userAgent, requestId: request.requestId || ctx.requestId, bypassRls: item.executionMode === 'service' };
    const span = observability.traces.startSpan('function.execute', 'functions', { functionId: item.id, version: currentVersion.version, source: request.source }, { organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId, userId: securityContext.userId, requestId: request.requestId || ctx.requestId, service: 'functions' });
    try {
      const response = await functionRuntime.execute({ code: currentVersion.code, request, limits: item.limits, env, secrets, project: { id: ctx.projectId, environmentId: ctx.environmentId }, organization: { id: ctx.organizationId } }, { handleRpc: (action, args) => this.handleRuntimeRpc(ctx, item, request, securityContext, action, args), onLog: (level, args) => { void addLog(level, args.map((part) => typeof part === 'string' ? part : JSON.stringify(part)).join(' ')); } });
      const durationMs = Date.now() - started; await Promise.all(pendingLogs); await this.recordExecution(ctx, item, currentVersion, executionId, request, 'success', durationMs, response.status, undefined, startedAt); observability.metric('functions.invocations', 1, 'counter', { status: 'success' }, { organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId, userId: securityContext.userId, requestId: request.requestId || ctx.requestId, service: 'functions' }); observability.metric('functions.duration_ms', durationMs, 'histogram', { status: 'success' }, { organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId, service: 'functions' }); observability.traces.endSpan(span); await addLog('info', `HTTP ${response.status} completed in ${durationMs}ms.`); await this.audit(ctx, 'function.executed', 'function', item.id, { executionId, version: currentVersion.version, source: request.source, durationMs, status: response.status }); return response;
    } catch (error: any) {
      const timeout = error?.code === 'FUNCTION_TIMEOUT'; let safeError = error?.message || String(error); for (const secret of secretValues) if (secret) safeError = safeError.split(secret).join('[REDACTED]'); const durationMs = Date.now() - started; await Promise.all(pendingLogs); await this.recordExecution(ctx, item, currentVersion, executionId, request, timeout ? 'timeout' : 'error', durationMs, undefined, safeError, startedAt); observability.metric('functions.invocations', 1, 'counter', { status: timeout ? 'timeout' : 'error' }, { organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId, userId: securityContext.userId, requestId: request.requestId || ctx.requestId, service: 'functions' }); observability.metric(timeout ? 'functions.timeouts' : 'functions.failures', 1, 'counter', {}, { organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId, service: 'functions' }); observability.traces.endSpan(span, error); await addLog('error', safeError); await this.audit(ctx, timeout ? 'function.timeout' : 'function.failed', 'function', item.id, { executionId, version: currentVersion.version, source: request.source, durationMs }); throw error;
    }
  }
  private async recordExecution(ctx: FunctionOperationContext, item: FunctionDefinition, current: FunctionVersion, executionId: string, request: FunctionExecutionRequest, status: FunctionExecution['status'], durationMs: number, responseStatus: number | undefined, error: string | undefined, startedAt: string): Promise<void> {
    await postgres.execute('INSERT INTO function_execution_logs(id,function_id,version_id,organization_id,project_id,environment_id,request_id,execution_id,record_type,source,status,response_status,duration_ms,memory_mb,error,started_at,completed_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),now())', [id('fexec_log'), item.id, current.id, ctx.organizationId, ctx.projectId, ctx.environmentId, request.requestId || ctx.requestId || null, executionId, 'execution', request.source, status, responseStatus || null, durationMs, item.limits.memoryMb, error || null, startedAt]);
  }

  private async handleRuntimeRpc(ctx: FunctionOperationContext, item: FunctionDefinition, request: FunctionExecutionRequest, security: SecurityContext, action: string, args: any): Promise<any> {
    const scope = { organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId };
    if (action === 'database.select') {
      const result = await realProjectDatabase.getRows(scope, String(args.table).toLowerCase(), { limit: Math.min(Math.max(Number(args.limit) || 100, 1), 1000), sortField: args.order?.field, sortOrder: args.order?.ascending === false ? 'desc' : 'asc' });
      const match = (row: any) => (args.filters || []).every((filter: any) => { const value = row[filter.field]; const expected = filter.value; if (filter.operator === 'eq') return value === expected; if (filter.operator === 'neq') return value !== expected; if (filter.operator === 'gt') return value > expected; if (filter.operator === 'gte') return value >= expected; if (filter.operator === 'lt') return value < expected; if (filter.operator === 'lte') return value <= expected; return false; });
      return result.rows.filter(match).filter((row) => securityEngine.evaluate(security, 'table', String(args.table), 'SELECT', row).allowed);
    }
    if (action === 'database.insert') { if (!securityEngine.evaluate(security, 'table', String(args.table), 'INSERT', undefined, args.values).allowed) throw new Error('RLS denied database insert.'); return realProjectDatabase.insertRow(scope, String(args.table), args.values); }
    if (action === 'database.update') { const existing = await realProjectDatabase.getRow(scope, String(args.table), args.id); if (!existing) throw new Error('Database record not found.'); if (!securityEngine.evaluate(security, 'table', String(args.table), 'UPDATE', existing, { ...existing, ...args.values }).allowed) throw new Error('RLS denied database update.'); return realProjectDatabase.updateRow(scope, String(args.table), args.id, args.values); }
    if (action === 'database.delete') { const existing = await realProjectDatabase.getRow(scope, String(args.table), args.id); if (!existing) return false; if (!securityEngine.evaluate(security, 'table', String(args.table), 'DELETE', existing).allowed) throw new Error('RLS denied database delete.'); return realProjectDatabase.deleteRow(scope, String(args.table), args.id); }
    if (action === 'auth.getUser') return request.userId ? realAuthRepository.findUserById(request.userId) : null;
    if (action === 'storage.upload') { const raw = args.data?.__binary ? Buffer.from(args.data.__binary) : Buffer.from(typeof args.data === 'string' ? args.data : JSON.stringify(args.data ?? '')); const result = await realStorageEngine.upload({ ...ctx, role: security.role }, String(args.bucket), String(args.path), raw, args.options?.contentType || 'application/octet-stream', args.options || {}); const { storageKey: _internal, ...safe } = result; return safe; }
    if (action === 'storage.download') { const result = await realStorageEngine.stream({ ...ctx, role: security.role }, String(args.bucket), String(args.path)); if (!result) throw new Error('Storage object not found.'); const chunks: Buffer[] = []; for await (const chunk of result.stream) chunks.push(Buffer.from(chunk)); const { storageKey: _internal, ...safe } = result.object; return { object: safe, base64: Buffer.concat(chunks).toString('base64') }; }
    if (action === 'storage.signedUrl') { const bucket = String(args.bucket); const path = String(args.path); if (!await realStorageEngine.object({ ...ctx, role: security.role }, bucket, path)) throw new Error('Storage object not found.'); const token = realStorageEngine.signedToken({ ...ctx, role: security.role }, bucket, path, 'read', Number(args.expiresIn || 3600)); const encoded = path.split('/').map(encodeURIComponent).join('/'); return { signedUrl: config.publicUrl(`/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encoded}?token=${encodeURIComponent(token.token)}`, 'storage'), expiresAt: token.expiresAt }; }
    if (action === 'storage.publicUrl') return { publicUrl: `/storage/v1/object/public/${encodeURIComponent(String(args.bucket))}/${String(args.path).split('/').map(encodeURIComponent).join('/')}?project=${encodeURIComponent(ctx.projectId)}&environment=${encodeURIComponent(ctx.environmentId)}` };
    if (action === 'realtime.broadcast') return { sent: realtimeEngine.publishChannelEvent(ctx.projectId, ctx.environmentId, String(args.channel), String(args.event), args.payload) };
    if (action === 'queue.enqueue') return this.enqueue(ctx, String(args.queue), item.id, args.payload, args.options || {});
    throw new Error(`Runtime capability '${action}' is not available.`);
  }

  public async createCron(ctx: FunctionOperationContext, idOrSlug: string, expression: string): Promise<FunctionCronJob> {
    this.assertManage(ctx); const item = await this.find(ctx, idOrSlug); if (!item) throw new Error('Function not found.'); if (!this.isValidCron(expression)) throw new Error('Invalid 5-field cron expression.'); const now = new Date().toISOString(); const record = { id: id('cron'), functionId: item.id, expression, enabled: true, createdAt: now, createdBy: ctx.userId || 'system' }; await postgres.execute('INSERT INTO function_schedules(id,function_id,organization_id,project_id,environment_id,cron_expression,enabled,timezone,created_at,updated_at,created_by) VALUES($1,$2,$3,$4,$5,$6,TRUE,$7,$8,$8,$9)', [record.id, item.id, ctx.organizationId, ctx.projectId, ctx.environmentId, expression, 'UTC', now, record.createdBy]); await this.audit(ctx, 'function.cron_created', 'cron', record.id, { functionId: item.id, expression }); return record;
  }
  public async listCrons(ctx: FunctionOperationContext, idOrSlug?: string): Promise<FunctionCronJob[]> {
    const item = idOrSlug ? await this.find(ctx, idOrSlug) : null; if (idOrSlug && !item) throw new Error('Function not found.'); const rows = await postgres.query<any>(`SELECT * FROM function_schedules WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3${item ? ' AND function_id=$4' : ''} ORDER BY created_at DESC`, item ? [ctx.organizationId, ctx.projectId, ctx.environmentId, item.id] : [ctx.organizationId, ctx.projectId, ctx.environmentId]); return rows.map(cron);
  }
  public async setCronEnabled(ctx: FunctionOperationContext, idOrSlug: string, cronId: string, enabled: boolean): Promise<FunctionCronJob> {
    this.assertManage(ctx);
    const item = await this.find(ctx, idOrSlug); if (!item) throw new Error('Function not found.');
    const rows = await postgres.query<any>('UPDATE function_schedules SET enabled=$6,updated_at=now() WHERE id=$1 AND function_id=$2 AND organization_id=$3 AND project_id=$4 AND environment_id=$5 RETURNING *', [cronId, item.id, ctx.organizationId, ctx.projectId, ctx.environmentId, Boolean(enabled)]);
    if (!rows[0]) throw new Error('Cron schedule not found.');
    await this.audit(ctx, enabled ? 'function.cron_enabled' : 'function.cron_disabled', 'cron', cronId, { functionId: item.id });
    return cron(rows[0]);
  }
  public async deleteCron(ctx: FunctionOperationContext, idOrSlug: string, cronId: string): Promise<boolean> {
    this.assertManage(ctx);
    const item = await this.find(ctx, idOrSlug); if (!item) throw new Error('Function not found.');
    const rows = await postgres.query<{ id: string }>('DELETE FROM function_schedules WHERE id=$1 AND function_id=$2 AND organization_id=$3 AND project_id=$4 AND environment_id=$5 RETURNING id', [cronId, item.id, ctx.organizationId, ctx.projectId, ctx.environmentId]);
    if (!rows[0]) return false;
    await this.audit(ctx, 'function.cron_deleted', 'cron', cronId, { functionId: item.id });
    return true;
  }
  public async createQueue(ctx: FunctionOperationContext, name: string): Promise<FunctionQueue> {
    this.assertManage(ctx); const normalised = normaliseSlug(name); if (!normalised) throw new Error('Queue name is invalid.'); const existing = await postgres.query<any>('SELECT * FROM function_queues WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 AND name=$4', [ctx.organizationId, ctx.projectId, ctx.environmentId, normalised]); if (existing[0]) return queue(existing[0]); const now = new Date().toISOString(); const record = { id: id('queue'), organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId, name: normalised, createdAt: now }; await postgres.execute('INSERT INTO function_queues(id,organization_id,project_id,environment_id,name,created_at) VALUES($1,$2,$3,$4,$5,$6)', [record.id, record.organizationId, record.projectId, record.environmentId, record.name, now]); await this.audit(ctx, 'function.queue_created', 'queue', record.id, { name: normalised }); return record;
  }
  public async enqueue(ctx: FunctionOperationContext, queueName: string, functionId: string, payload: unknown, options: { delayMs?: number; priority?: number; maxAttempts?: number } = {}): Promise<FunctionQueueJob> {
    const item = await this.find(ctx, functionId); if (!item) throw new Error('Queue target function is invalid.'); const queueDef = await this.createQueue({ ...ctx, role: 'service' }, queueName); const now = new Date(); const availableAt = new Date(now.getTime() + Math.min(Math.max(Number(options.delayMs) || 0, 0), 7 * 86_400_000)).toISOString(); const record = { id: id('job'), queueId: queueDef.id, functionId: item.id, payload, status: 'queued' as const, attempts: 0, maxAttempts: Math.min(Math.max(Number(options.maxAttempts) || 3, 1), 10), priority: Math.min(Math.max(Number(options.priority) || 0, -10), 10), availableAt, createdAt: now.toISOString(), updatedAt: now.toISOString() }; await postgres.execute('INSERT INTO function_jobs(id,queue_id,function_id,organization_id,project_id,environment_id,status,attempts,max_attempts,priority,payload,available_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)', [record.id, record.queueId, record.functionId, ctx.organizationId, ctx.projectId, ctx.environmentId, record.status, record.attempts, record.maxAttempts, record.priority, JSON.stringify(payload ?? {}), record.availableAt, record.createdAt]); await redisClient.publish('functions:queue:ready', { jobId: record.id, environmentId: ctx.environmentId }); return record;
  }
  public async listQueues(ctx: FunctionOperationContext): Promise<FunctionQueue[]> { return (await postgres.query<any>('SELECT * FROM function_queues WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 ORDER BY name', [ctx.organizationId, ctx.projectId, ctx.environmentId])).map(queue); }
  public async listJobs(ctx: FunctionOperationContext, queueName?: string): Promise<FunctionQueueJob[]> { const rows = await postgres.query<any>(`SELECT j.* FROM function_jobs j LEFT JOIN function_queues q ON q.id=j.queue_id WHERE j.organization_id=$1 AND j.project_id=$2 AND j.environment_id=$3${queueName ? ' AND q.name=$4' : ''} ORDER BY j.created_at DESC`, queueName ? [ctx.organizationId, ctx.projectId, ctx.environmentId, normaliseSlug(queueName)] : [ctx.organizationId, ctx.projectId, ctx.environmentId]); return rows.map(job); }
  public async retryJob(ctx: FunctionOperationContext, queueName: string, jobId: string): Promise<FunctionQueueJob> {
    this.assertManage(ctx);
    const rows = await postgres.query<any>("UPDATE function_jobs j SET status='queued',attempts=0,error=NULL,available_at=now(),started_at=NULL,completed_at=NULL,failed_at=NULL,locked_at=NULL,locked_by=NULL,updated_at=now() FROM function_queues q WHERE j.queue_id=q.id AND j.id=$1 AND j.organization_id=$2 AND j.project_id=$3 AND j.environment_id=$4 AND q.name=$5 AND j.status='dead_letter' RETURNING j.*", [jobId, ctx.organizationId, ctx.projectId, ctx.environmentId, normaliseSlug(queueName)]);
    if (!rows[0]) throw new Error('Dead-letter job not found.');
    await redisClient.publish('functions:queue:ready', { jobId, environmentId: ctx.environmentId });
    await this.audit(ctx, 'function.job_retried', 'job', jobId, { queue: normaliseSlug(queueName) });
    return job(rows[0]);
  }
  private async claimNextJob(): Promise<any | null> {
    if (this.runningJobs.size >= config.functions.maxConcurrentExecutions) return null;
    return postgres.transaction(async (client) => { const claimed = await client.query<any>("WITH next AS (SELECT id FROM function_jobs WHERE status='queued' AND available_at<=now() ORDER BY priority DESC,created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE function_jobs j SET status='processing',attempts=j.attempts+1,started_at=now(),locked_at=now(),locked_by=$1,updated_at=now() FROM next WHERE j.id=next.id RETURNING j.*", [this.workerId]); return claimed.rows[0] || null; });
  }
  private async processQueue(): Promise<void> {
    if (!this.started) return; const next = await this.claimNextJob().catch((error) => { logger.error('Persistent Functions queue claim failed:', error); return null; }); if (!next || this.runningJobs.has(next.id)) return; this.runningJobs.add(next.id); try { const item = await this.find({ organizationId: next.organization_id, projectId: next.project_id, environmentId: next.environment_id, role: 'service' }, next.function_id); if (!item) throw new Error('Target function no longer exists.'); const queueName = (await postgres.query<{ name: string }>('SELECT name FROM function_queues WHERE id=$1', [next.queue_id]))[0]?.name || 'default'; await this.execute({ organizationId: item.organizationId, projectId: item.projectId, environmentId: item.environmentId, role: 'service', userId: `queue:${queueName}` }, item.id, { method: 'QUEUE', path: `queue://${queueName}`, headers: {}, query: {}, body: json(next.payload, {}), role: 'service', source: 'queue' }); await postgres.execute("UPDATE function_jobs SET status='completed',completed_at=now(),locked_at=NULL,locked_by=NULL,updated_at=now() WHERE id=$1", [next.id]); } catch (error: any) { const attempts = Number(next.attempts); const terminal = attempts >= Number(next.max_attempts); const message = String(error?.message || error).slice(0, 8192); if (terminal) await postgres.execute("UPDATE function_jobs SET status='dead_letter',failed_at=now(),error=$2,locked_at=NULL,locked_by=NULL,updated_at=now() WHERE id=$1", [next.id, message]); else await postgres.execute("UPDATE function_jobs SET status='queued',available_at=$2,error=$3,locked_at=NULL,locked_by=NULL,updated_at=now() WHERE id=$1", [next.id, new Date(Date.now() + Math.min(60_000, 1_000 * 2 ** Math.max(0, attempts - 1))).toISOString(), message]); } finally { this.runningJobs.delete(next.id); }
  }
  private isValidCron(expression: string): boolean { const parts = expression.trim().split(/\s+/); const ranges: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]]; return parts.length === 5 && parts.every((part, index) => { const [min, max] = ranges[index]; if (part === '*') return true; if (/^\*\/\d+$/.test(part)) return Number(part.slice(2)) >= 1 && Number(part.slice(2)) <= max - min + 1; return /^\d+(,\d+)*$/.test(part) && part.split(',').every((value) => Number(value) >= min && Number(value) <= max); }); }
  private cronMatches(field: string, value: number): boolean { return field === '*' || (field.startsWith('*/') ? value % Number(field.slice(2)) === 0 : field.split(',').some((entry) => Number(entry) === value)); }
  private async runScheduledJobs(): Promise<void> {
    if (!this.started || !this.schedulerReady) return; const now = new Date(); const rows = await postgres.query<any>('SELECT * FROM function_schedules WHERE enabled=TRUE');
    for (const schedule of rows) { const fields = String(schedule.cron_expression).split(/\s+/); if (fields.length !== 5 || ![this.cronMatches(fields[0], now.getUTCMinutes()), this.cronMatches(fields[1], now.getUTCHours()), this.cronMatches(fields[2], now.getUTCDate()), this.cronMatches(fields[3], now.getUTCMonth() + 1), this.cronMatches(fields[4], now.getUTCDay())].every(Boolean)) continue; const claimed = await postgres.query<{ id: string }>("UPDATE function_schedules SET last_run_at=$2,updated_at=$2 WHERE id=$1 AND (last_run_at IS NULL OR date_trunc('minute',last_run_at)<date_trunc('minute',$2::timestamptz)) RETURNING id", [schedule.id, now.toISOString()]); if (!claimed[0]) continue; try { await this.enqueue({ organizationId: schedule.organization_id, projectId: schedule.project_id, environmentId: schedule.environment_id, role: 'service', userId: 'cron' }, 'scheduled', schedule.function_id, { scheduleId: schedule.id }, { maxAttempts: 3 }); } catch (error) { logger.error('Persistent scheduled Function enqueue failed:', error); } }
  }
}

export const persistentFunctionEngine = new PersistentFunctionEngine();
