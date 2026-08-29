import { randomUUID } from 'node:crypto';
import { db } from '../db/database';
import { authDatabase } from '../db/authDatabase';
import { projectDbManager } from '../db/projectDatabase';
import { SchemaIntrospectionService } from '../apiEngine/schemaIntrospection';
import { SafeQueryBuilder } from '../apiEngine/queryBuilder';
import { encryptSecret, decryptSecret } from '../auth/cryptoUtils';
import { storageEngine } from '../storage/storageEngine';
import { realtimeEngine } from '../realtime/realtimeEngine';
import { logger } from '../logger';
import { functionRuntime } from './functionRuntime';
import { securityEngine } from '../security/securityEngine';
import { SecurityContext } from '../security/types';
import { observability } from '../observability';
import {
  CreateFunctionInput, FunctionAccess, FunctionCronJob, FunctionDefinition, FunctionExecution, FunctionExecutionRequest,
  FunctionExecutionResponse, FunctionLimits, FunctionLog, FunctionMetrics, FunctionOperationContext, FunctionQueue,
  FunctionQueueJob, FunctionSecret, FunctionVersion,
} from './types';

const DEFAULT_LIMITS: FunctionLimits = { timeoutMs: 15_000, memoryMb: 128, cpuProfile: 'shared' };
const ALLOWED_TIMEOUTS = new Set([5_000, 15_000, 30_000, 60_000]);
const ALLOWED_MEMORY = new Set([128, 256, 512, 1024]);

function scopeKey(ctx: Pick<FunctionOperationContext, 'organizationId' | 'projectId' | 'environmentId'>): string {
  return `${ctx.organizationId}:${ctx.projectId}:${ctx.environmentId}`;
}

function normaliseSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function defaultCode(name: string): string {
  return `export default async (req, ctx) => ({ status: 200, body: { message: "Hello from ${name}" } });`;
}

export class FunctionEngine {
  private functions = new Map<string, FunctionDefinition>();
  private versions = new Map<string, FunctionVersion[]>();
  private secrets = new Map<string, FunctionSecret>();
  private logs = new Map<string, FunctionLog[]>();
  private executions = new Map<string, FunctionExecution[]>();
  private cronJobs = new Map<string, FunctionCronJob>();
  private queues = new Map<string, FunctionQueue>();
  private jobs = new Map<string, FunctionQueueJob>();
  private schedulerTimer: NodeJS.Timeout | null = null;
  private queueTimer: NodeJS.Timeout | null = null;
  private runningJobs = new Set<string>();

  public start(): void {
    if (this.schedulerTimer) return;
    this.schedulerTimer = setInterval(() => void this.runScheduledJobs(), 1_000);
    this.queueTimer = setInterval(() => void this.processQueue(), 250);
    this.schedulerTimer.unref();
    this.queueTimer.unref();
  }

  public stop(): void {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    if (this.queueTimer) clearInterval(this.queueTimer);
    this.schedulerTimer = null;
    this.queueTimer = null;
  }

  private assertManage(ctx: FunctionOperationContext): void {
    if (!['owner', 'admin', 'service', 'service_role'].includes(ctx.role)) throw new Error('Only owner/admin/service roles can manage functions.');
  }

  private getFunction(ctx: FunctionOperationContext, idOrSlug: string): FunctionDefinition | null {
    return Array.from(this.functions.values()).find((item) => item.organizationId === ctx.organizationId && item.projectId === ctx.projectId && item.environmentId === ctx.environmentId && (item.id === idOrSlug || item.slug === idOrSlug)) || null;
  }

  private validateLimits(limits?: Partial<FunctionLimits>): FunctionLimits {
    const resolved = { ...DEFAULT_LIMITS, ...limits };
    if (!ALLOWED_TIMEOUTS.has(resolved.timeoutMs)) throw new Error('timeoutMs must be one of 5000, 15000, 30000 or 60000.');
    if (!ALLOWED_MEMORY.has(resolved.memoryMb)) throw new Error('memoryMb must be one of 128, 256, 512 or 1024.');
    if (!['shared', 'standard', 'performance'].includes(resolved.cpuProfile)) throw new Error('Invalid CPU profile.');
    return resolved;
  }

  private audit(ctx: FunctionOperationContext, action: string, resourceType: string, resourceId: string, metadata?: Record<string, unknown>): void {
    db.logAudit({
      organization_id: ctx.organizationId, project_id: ctx.projectId, environment_id: ctx.environmentId,
      user_id: ctx.userId || 'system', action, resource_type: resourceType, resource_id: resourceId,
      metadata: { ...metadata, requestId: ctx.requestId }, ip_address: ctx.ip, user_agent: ctx.userAgent,
    });
  }

  public createFunction(ctx: FunctionOperationContext, input: CreateFunctionInput): FunctionDefinition {
    this.assertManage(ctx);
    const name = input.name.trim();
    const slug = normaliseSlug(input.slug || name);
    if (!name || !slug || slug.length > 80) throw new Error('Function name/slug is invalid.');
    if (this.getFunction(ctx, slug)) throw new Error(`Function '${slug}' already exists in this environment.`);
    const now = new Date().toISOString();
    const definition: FunctionDefinition = {
      id: `fn_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId,
      name, slug, runtime: 'nodejs20', status: 'draft', access: input.access || 'authenticated', executionMode: input.executionMode || 'user', limits: this.validateLimits(input.limits),
      currentVersion: null, createdAt: now, updatedAt: now, createdBy: ctx.userId || 'system', updatedBy: ctx.userId || 'system',
    };
    const initial: FunctionVersion = { id: `fnv_${randomUUID().replace(/-/g, '').slice(0, 20)}`, functionId: definition.id, version: 1, code: input.code?.trim() || defaultCode(name), status: 'draft', createdAt: now, createdBy: ctx.userId || 'system', changeSummary: input.changeSummary };
    this.functions.set(definition.id, definition);
    this.versions.set(definition.id, [initial]);
    this.audit(ctx, 'function.created', 'function', definition.id, { slug, version: 1 });
    return definition;
  }

  public listFunctions(ctx: FunctionOperationContext): FunctionDefinition[] {
    return Array.from(this.functions.values()).filter((item) => item.organizationId === ctx.organizationId && item.projectId === ctx.projectId && item.environmentId === ctx.environmentId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Exports deployable state including already-encrypted secrets, never plaintext values. */
  public exportBackupState(ctx: FunctionOperationContext): Record<string, unknown> {
    const definitions = this.listFunctions(ctx);
    const ids = new Set(definitions.map((item) => item.id));
    const clone = (value: unknown) => JSON.parse(JSON.stringify(value));
    return clone({ functions: definitions, versions: Array.from(this.versions.entries()).filter(([id]) => ids.has(id)), secrets: Array.from(this.secrets.values()).filter((item) => item.organizationId === ctx.organizationId && item.projectId === ctx.projectId && item.environmentId === ctx.environmentId), crons: Array.from(this.cronJobs.values()).filter((item) => ids.has(item.functionId)), queues: Array.from(this.queues.values()).filter((item) => item.organizationId === ctx.organizationId && item.projectId === ctx.projectId && item.environmentId === ctx.environmentId), jobs: Array.from(this.jobs.values()).filter((item) => ids.has(item.functionId)) });
  }

  public restoreBackupState(ctx: FunctionOperationContext, state: any, options: { functionId?: string } = {}): void {
    this.assertManage(ctx);
    if (!state || !Array.isArray(state.functions)) throw new Error('Invalid functions backup state.');
    const scoped = (item: FunctionDefinition) => item.organizationId === ctx.organizationId && item.projectId === ctx.projectId && item.environmentId === ctx.environmentId;
    const targetIds = new Set((options.functionId ? state.functions.filter((item: FunctionDefinition) => item.id === options.functionId) : state.functions).map((item: FunctionDefinition) => item.id));
    if (options.functionId && targetIds.size === 0) throw new Error('Function is not present in the backup.');
    for (const [id, definition] of this.functions) if (scoped(definition) && (!options.functionId || id === options.functionId)) { this.functions.delete(id); this.versions.delete(id); this.logs.delete(id); this.executions.delete(id); }
    for (const definition of state.functions as FunctionDefinition[]) if (targetIds.has(definition.id)) this.functions.set(definition.id, JSON.parse(JSON.stringify(definition)));
    for (const [id, versions] of state.versions || []) if (targetIds.has(id)) this.versions.set(id, JSON.parse(JSON.stringify(versions)));
    if (!options.functionId) {
      for (const [id, secret] of this.secrets) if (secret.organizationId === ctx.organizationId && secret.projectId === ctx.projectId && secret.environmentId === ctx.environmentId) this.secrets.delete(id);
      for (const secret of state.secrets || []) this.secrets.set(secret.id, JSON.parse(JSON.stringify(secret)));
    }
    for (const [id, cron] of this.cronJobs) if (targetIds.has(cron.functionId)) this.cronJobs.delete(id);
    for (const cron of state.crons || []) if (targetIds.has(cron.functionId)) this.cronJobs.set(cron.id, JSON.parse(JSON.stringify(cron)));
    for (const [id, job] of this.jobs) if (targetIds.has(job.functionId)) this.jobs.delete(id);
    for (const job of state.jobs || []) if (targetIds.has(job.functionId)) this.jobs.set(job.id, JSON.parse(JSON.stringify(job)));
    for (const queue of state.queues || []) this.queues.set(queue.id, JSON.parse(JSON.stringify(queue)));
  }

  public getFunctionDefinition(ctx: FunctionOperationContext, idOrSlug: string): FunctionDefinition | null {
    return this.getFunction(ctx, idOrSlug);
  }

  public listVersions(ctx: FunctionOperationContext, idOrSlug: string): FunctionVersion[] {
    const definition = this.getFunction(ctx, idOrSlug);
    if (!definition) throw new Error('Function not found.');
    return [...(this.versions.get(definition.id) || [])].sort((a, b) => b.version - a.version);
  }

  public updateFunction(ctx: FunctionOperationContext, idOrSlug: string, input: { code: string; changeSummary?: string; access?: FunctionAccess; limits?: Partial<FunctionLimits> }): FunctionVersion {
    this.assertManage(ctx);
    const definition = this.getFunction(ctx, idOrSlug);
    if (!definition) throw new Error('Function not found.');
    if (typeof input.code !== 'string' || !input.code.trim()) throw new Error('Function code is required.');
    const versions = this.versions.get(definition.id) || [];
    const now = new Date().toISOString();
    const version: FunctionVersion = { id: `fnv_${randomUUID().replace(/-/g, '').slice(0, 20)}`, functionId: definition.id, version: Math.max(0, ...versions.map((item) => item.version)) + 1, code: input.code, status: 'draft', createdAt: now, createdBy: ctx.userId || 'system', changeSummary: input.changeSummary };
    versions.push(version);
    this.versions.set(definition.id, versions);
    definition.access = input.access || definition.access;
    definition.limits = this.validateLimits(input.limits ? { ...definition.limits, ...input.limits } : definition.limits);
    definition.updatedAt = now;
    definition.updatedBy = ctx.userId || 'system';
    this.functions.set(definition.id, definition);
    this.audit(ctx, 'function.updated', 'function', definition.id, { version: version.version });
    return version;
  }

  public deployFunction(ctx: FunctionOperationContext, idOrSlug: string, requestedVersion?: number): FunctionDefinition {
    this.assertManage(ctx);
    const definition = this.getFunction(ctx, idOrSlug);
    if (!definition) throw new Error('Function not found.');
    const versions = this.versions.get(definition.id) || [];
    const target = requestedVersion === undefined ? versions.at(-1) : versions.find((item) => item.version === requestedVersion);
    if (!target) throw new Error('Function version not found.');
    for (const version of versions) if (version.status === 'published') version.status = 'superseded';
    target.status = 'published';
    definition.currentVersion = target.version;
    definition.status = 'active';
    definition.updatedAt = new Date().toISOString();
    definition.updatedBy = ctx.userId || 'system';
    this.functions.set(definition.id, definition);
    this.audit(ctx, 'function.deployed', 'function', definition.id, { version: target.version });
    return definition;
  }

  public rollbackFunction(ctx: FunctionOperationContext, idOrSlug: string, version: number): FunctionDefinition {
    const deployed = this.deployFunction(ctx, idOrSlug, version);
    this.audit(ctx, 'function.rolled_back', 'function', deployed.id, { version });
    return deployed;
  }

  public deleteFunction(ctx: FunctionOperationContext, idOrSlug: string): boolean {
    this.assertManage(ctx);
    const definition = this.getFunction(ctx, idOrSlug);
    if (!definition) return false;
    this.functions.delete(definition.id);
    this.versions.delete(definition.id);
    this.logs.delete(definition.id);
    this.executions.delete(definition.id);
    for (const [id, cron] of this.cronJobs) if (cron.functionId === definition.id) this.cronJobs.delete(id);
    this.audit(ctx, 'function.deleted', 'function', definition.id, { slug: definition.slug });
    return true;
  }

  public setSecret(ctx: FunctionOperationContext, name: string, value: string): Omit<FunctionSecret, 'encryptedValue'> {
    this.assertManage(ctx);
    const normalised = name.trim().toUpperCase();
    if (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(normalised) || !value) throw new Error('Secret name or value is invalid.');
    const existing = Array.from(this.secrets.values()).find((item) => item.organizationId === ctx.organizationId && item.projectId === ctx.projectId && item.environmentId === ctx.environmentId && item.name === normalised);
    const now = new Date().toISOString();
    const secret: FunctionSecret = existing
      ? { ...existing, encryptedValue: encryptSecret(value), updatedAt: now, updatedBy: ctx.userId || 'system' }
      : { id: `sec_${randomUUID().replace(/-/g, '').slice(0, 20)}`, organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId, name: normalised, encryptedValue: encryptSecret(value), createdAt: now, updatedAt: now, updatedBy: ctx.userId || 'system' };
    this.secrets.set(secret.id, secret);
    this.audit(ctx, existing ? 'secret.updated' : 'secret.created', 'secret', secret.id, { name: normalised });
    const { encryptedValue: _encryptedValue, ...safe } = secret;
    return safe;
  }

  public listSecrets(ctx: FunctionOperationContext): Array<Omit<FunctionSecret, 'encryptedValue'>> {
    this.assertManage(ctx);
    return Array.from(this.secrets.values()).filter((item) => item.organizationId === ctx.organizationId && item.projectId === ctx.projectId && item.environmentId === ctx.environmentId).map(({ encryptedValue: _encryptedValue, ...safe }) => safe);
  }

  public deleteSecret(ctx: FunctionOperationContext, name: string): boolean {
    this.assertManage(ctx);
    const normalised = name.trim().toUpperCase();
    const secret = Array.from(this.secrets.values()).find((item) => item.organizationId === ctx.organizationId && item.projectId === ctx.projectId && item.environmentId === ctx.environmentId && item.name === normalised);
    if (!secret) return false;
    this.secrets.delete(secret.id);
    this.audit(ctx, 'secret.deleted', 'secret', secret.id, { name: normalised });
    return true;
  }

  private resolveSecrets(ctx: FunctionOperationContext): Record<string, string> {
    const values: Record<string, string> = {};
    for (const secret of this.secrets.values()) {
      if (secret.organizationId === ctx.organizationId && secret.projectId === ctx.projectId && secret.environmentId === ctx.environmentId) values[secret.name] = decryptSecret(secret.encryptedValue);
    }
    return values;
  }

  private resolveEnvironment(ctx: FunctionOperationContext): Record<string, string> {
    const env: Record<string, string> = {};
    for (const setting of db.getSettings(ctx.projectId, ctx.environmentId)) {
      if (setting.key.startsWith('FUNCTION_ENV_')) env[setting.key.slice('FUNCTION_ENV_'.length)] = setting.value;
    }
    return env;
  }

  public listEnvironment(ctx: FunctionOperationContext): Record<string, string> {
    this.assertManage(ctx);
    return this.resolveEnvironment(ctx);
  }

  public deleteEnvironment(ctx: FunctionOperationContext, name: string): boolean {
    this.assertManage(ctx);
    const normalised = name.trim().toUpperCase();
    if (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(normalised)) throw new Error('Environment variable name is invalid.');
    const deleted = db.deleteSetting(ctx.projectId, `FUNCTION_ENV_${normalised}`, ctx.environmentId);
    if (deleted) this.audit(ctx, 'function.environment_deleted', 'environment_variable', normalised, { name: normalised });
    return deleted;
  }

  public setEnvironment(ctx: FunctionOperationContext, name: string, value: string): { name: string; value: string } {
    this.assertManage(ctx);
    const normalised = name.trim().toUpperCase();
    if (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(normalised)) throw new Error('Environment variable name is invalid.');
    db.setSetting(ctx.projectId, `FUNCTION_ENV_${normalised}`, String(value), ctx.environmentId);
    this.audit(ctx, 'function.environment_updated', 'environment_variable', normalised, { name: normalised });
    return { name: normalised, value: String(value) };
  }

  private writeLog(definition: FunctionDefinition, version: number, executionId: string, level: FunctionLog['level'], message: string, data?: unknown, secretValues: string[] = []): void {
    const redact = (value: unknown): unknown => {
      let text: string;
      try { text = typeof value === 'string' ? value : JSON.stringify(value); } catch { text = String(value); }
      for (const secret of secretValues) if (secret) text = text.split(secret).join('[REDACTED]');
      return text.length > 8_192 ? `${text.slice(0, 8_192)}…` : text;
    };
    const list = this.logs.get(definition.id) || [];
    list.unshift({ id: `flog_${randomUUID().replace(/-/g, '').slice(0, 20)}`, functionId: definition.id, version, executionId, level, message: String(redact(message)), data: data === undefined ? undefined : redact(data), createdAt: new Date().toISOString() });
    this.logs.set(definition.id, list.slice(0, 1_000));
  }

  public listLogs(ctx: FunctionOperationContext, idOrSlug: string, limit = 100): FunctionLog[] {
    const definition = this.getFunction(ctx, idOrSlug);
    if (!definition) throw new Error('Function not found.');
    return (this.logs.get(definition.id) || []).slice(0, Math.min(Math.max(limit, 1), 1_000));
  }

  public getMetrics(ctx: FunctionOperationContext, idOrSlug: string): FunctionMetrics {
    const definition = this.getFunction(ctx, idOrSlug);
    if (!definition) throw new Error('Function not found.');
    const executions = this.executions.get(definition.id) || [];
    const errors = executions.filter((item) => item.status === 'error').length;
    const timeouts = executions.filter((item) => item.status === 'timeout').length;
    const invocations = executions.length;
    return { invocations, errors, timeouts, avgDurationMs: invocations ? Math.round(executions.reduce((sum, item) => sum + item.durationMs, 0) / invocations) : 0, successRate: invocations ? Number((((invocations - errors - timeouts) / invocations) * 100).toFixed(2)) : 100, configuredMemoryMb: definition.limits.memoryMb, cpuProfile: definition.limits.cpuProfile };
  }

  public async execute(ctx: FunctionOperationContext, idOrSlug: string, request: FunctionExecutionRequest): Promise<FunctionExecutionResponse> {
    const definition = this.getFunction(ctx, idOrSlug);
    if (!definition || definition.status !== 'active' || !definition.currentVersion) throw new Error('Function is not deployed.');
    const version = (this.versions.get(definition.id) || []).find((item) => item.version === definition.currentVersion);
    if (!version) throw new Error('Deployed function version is unavailable.');
    const executionId = `fexec_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const startedAt = Date.now();
    const secrets = this.resolveSecrets(ctx);
    const secretValues = Object.values(secrets);
    this.writeLog(definition, version.version, executionId, 'info', `Invocation started (${request.source}).`, undefined, secretValues);
    const securityContext: SecurityContext = {
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      environmentId: ctx.environmentId,
      userId: definition.executionMode === 'service' ? `function:${definition.id}` : request.userId || ctx.userId,
      role: definition.executionMode === 'service' ? 'service' : request.role || ctx.role,
      sessionId: ctx.sessionId,
      claims: ctx.claims,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: request.requestId || ctx.requestId,
      bypassRls: definition.executionMode === 'service',
    };
    const traceSpan = observability.traces.startSpan('function.execute', 'functions', { functionId: definition.id, version: version.version, source: request.source }, { organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId, userId: securityContext.userId, requestId: request.requestId || ctx.requestId, service: 'functions' });
    try {
      const response = await functionRuntime.execute({ code: version.code, request, limits: definition.limits, env: this.resolveEnvironment(ctx), secrets, project: { id: ctx.projectId, environmentId: ctx.environmentId }, organization: { id: ctx.organizationId } }, {
        handleRpc: (action, args) => this.handleRuntimeRpc(ctx, definition, request, securityContext, action, args),
        onLog: (level, args) => this.writeLog(definition, version.version, executionId, level, args.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' '), undefined, secretValues),
      });
      const execution: FunctionExecution = { id: executionId, functionId: definition.id, version: version.version, source: request.source, status: 'success', responseStatus: response.status, durationMs: Date.now() - startedAt, memoryMb: definition.limits.memoryMb, cpuProfile: definition.limits.cpuProfile, createdAt: new Date().toISOString() };
      this.recordExecution(execution);
      observability.metric('functions.invocations', 1, 'counter', { status: 'success' }, { organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId, userId: securityContext.userId, requestId: request.requestId || ctx.requestId, service: 'functions' });
      observability.metric('functions.duration_ms', execution.durationMs, 'histogram', { status: 'success' }, { organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId, service: 'functions' });
      observability.traces.endSpan(traceSpan);
      this.writeLog(definition, version.version, executionId, 'info', `HTTP ${response.status} completed in ${execution.durationMs}ms.`, undefined, secretValues);
      this.audit(ctx, 'function.executed', 'function', definition.id, { executionId, version: version.version, source: request.source, durationMs: execution.durationMs, status: response.status });
      return response;
    } catch (error: any) {
      const timeout = error?.code === 'FUNCTION_TIMEOUT';
      const execution: FunctionExecution = { id: executionId, functionId: definition.id, version: version.version, source: request.source, status: timeout ? 'timeout' : 'error', durationMs: Date.now() - startedAt, memoryMb: definition.limits.memoryMb, cpuProfile: definition.limits.cpuProfile, error: error?.message || String(error), createdAt: new Date().toISOString() };
      this.recordExecution(execution);
      observability.metric('functions.invocations', 1, 'counter', { status: timeout ? 'timeout' : 'error' }, { organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId, userId: securityContext.userId, requestId: request.requestId || ctx.requestId, service: 'functions' });
      observability.metric(timeout ? 'functions.timeouts' : 'functions.failures', 1, 'counter', {}, { organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId, service: 'functions' });
      observability.traces.endSpan(traceSpan, error);
      this.writeLog(definition, version.version, executionId, 'error', execution.error!, undefined, secretValues);
      this.audit(ctx, timeout ? 'function.timeout' : 'function.failed', 'function', definition.id, { executionId, version: version.version, source: request.source, durationMs: execution.durationMs });
      throw error;
    }
  }

  private recordExecution(execution: FunctionExecution): void {
    const list = this.executions.get(execution.functionId) || [];
    list.unshift(execution);
    this.executions.set(execution.functionId, list.slice(0, 10_000));
  }

  private async handleRuntimeRpc(ctx: FunctionOperationContext, definition: FunctionDefinition, request: FunctionExecutionRequest, securityContext: SecurityContext, action: string, args: any): Promise<any> {
    if (action === 'database.select') {
      const resource = SchemaIntrospectionService.getResource(ctx.organizationId, ctx.projectId, ctx.environmentId, String(args.table).toLowerCase());
      if (!resource) throw new Error('Database resource not found or not exposed.');
      const query: Record<string, string> = { select: args.columns || '*', ...(args.limit ? { limit: String(args.limit) } : {}) };
      if (args.order?.field) query.order = `${args.order.field}.${args.order.ascending === false ? 'desc' : 'asc'}`;
      for (const filter of args.filters || []) query[filter.field] = `${filter.operator}.${String(filter.value)}`;
      return SafeQueryBuilder.executeSelect(ctx.organizationId, ctx.projectId, ctx.environmentId, resource, SafeQueryBuilder.parseQueryParams(query, resource), securityContext).data;
    }
    if (action === 'database.insert') {
      const decision = securityEngine.evaluate(securityContext, 'table', String(args.table), 'INSERT', undefined, args.values);
      if (!decision.allowed) throw new Error('RLS denied database insert.');
      return projectDbManager.insertRow(ctx.organizationId, ctx.projectId, ctx.environmentId, String(args.table), args.values, request.requestId);
    }
    if (action === 'database.update') {
      const table = String(args.table); const id = String(args.id);
      const existing = projectDbManager.getRow(ctx.organizationId, ctx.projectId, ctx.environmentId, table, id);
      if (!existing) throw new Error('Database record not found.');
      const decision = securityEngine.evaluate(securityContext, 'table', table, 'UPDATE', existing, { ...existing, ...args.values });
      if (!decision.allowed) throw new Error('RLS denied database update.');
      return projectDbManager.updateRow(ctx.organizationId, ctx.projectId, ctx.environmentId, table, id, args.values, request.requestId);
    }
    if (action === 'database.delete') {
      const table = String(args.table); const id = String(args.id);
      const existing = projectDbManager.getRow(ctx.organizationId, ctx.projectId, ctx.environmentId, table, id);
      if (!existing) return false;
      const decision = securityEngine.evaluate(securityContext, 'table', table, 'DELETE', existing);
      if (!decision.allowed) throw new Error('RLS denied database delete.');
      return projectDbManager.deleteRow(ctx.organizationId, ctx.projectId, ctx.environmentId, table, id, request.requestId);
    }
    if (action === 'auth.getUser') return request.userId ? authDatabase.findUserById(request.userId) : null;
    if (action === 'storage.upload') {
      const raw = args.data?.__binary ? Buffer.from(args.data.__binary) : Buffer.from(typeof args.data === 'string' ? args.data : JSON.stringify(args.data ?? ''));
      const result = await storageEngine.uploadObject({ ...ctx, ...securityContext }, String(args.bucket), String(args.path), raw, args.options?.contentType || 'application/octet-stream', args.options || {});
      if (!result.success) throw new Error(result.error?.message || 'Storage upload failed.');
      const { storageKey: _storageKey, ...safe } = result.data!;
      return safe;
    }
    if (action === 'storage.download') {
      const result = await storageEngine.getObject({ ...ctx, ...securityContext }, String(args.bucket), String(args.path));
      if (!result.success || !result.data) throw new Error(result.error?.message || 'Storage download failed.');
      return { object: { ...result.data.object, storageKey: undefined }, base64: result.data.content.toString('base64') };
    }
    if (action === 'storage.signedUrl') {
      const result = storageEngine.createSignedUrl({ ...ctx, ...securityContext }, String(args.bucket), String(args.path), Number(args.expiresIn || 3600));
      if (!result.success) throw new Error(result.error?.message || 'Unable to create signed URL.');
      return result.data;
    }
    if (action === 'storage.publicUrl') return { publicUrl: `/storage/v1/object/public/${encodeURIComponent(String(args.bucket))}/${String(args.path).split('/').map(encodeURIComponent).join('/')}?project=${encodeURIComponent(ctx.projectId)}&environment=${encodeURIComponent(ctx.environmentId)}` };
    if (action === 'realtime.broadcast') return { sent: realtimeEngine.publishChannelEvent(ctx.projectId, ctx.environmentId, String(args.channel), String(args.event), args.payload) };
    if (action === 'queue.enqueue') return this.enqueue(ctx, String(args.queue), definition.id, args.payload, args.options || {});
    throw new Error(`Runtime capability '${action}' is not available.`);
  }

  public createCron(ctx: FunctionOperationContext, idOrSlug: string, expression: string): FunctionCronJob {
    this.assertManage(ctx);
    const definition = this.getFunction(ctx, idOrSlug);
    if (!definition) throw new Error('Function not found.');
    if (!this.isValidCron(expression)) throw new Error('Invalid 5-field cron expression.');
    const cron: FunctionCronJob = { id: `cron_${randomUUID().replace(/-/g, '').slice(0, 20)}`, functionId: definition.id, expression, enabled: true, createdAt: new Date().toISOString(), createdBy: ctx.userId || 'system' };
    this.cronJobs.set(cron.id, cron);
    this.audit(ctx, 'function.cron_created', 'cron', cron.id, { functionId: definition.id, expression });
    return cron;
  }

  public listCrons(ctx: FunctionOperationContext, idOrSlug?: string): FunctionCronJob[] {
    const definition = idOrSlug ? this.getFunction(ctx, idOrSlug) : null;
    return Array.from(this.cronJobs.values()).filter((cron) => !definition || cron.functionId === definition.id);
  }

  public setCronEnabled(ctx: FunctionOperationContext, idOrSlug: string, cronId: string, enabled: boolean): FunctionCronJob {
    this.assertManage(ctx);
    const definition = this.getFunction(ctx, idOrSlug);
    const cron = this.cronJobs.get(cronId);
    if (!definition || !cron || cron.functionId !== definition.id) throw new Error('Cron schedule not found.');
    cron.enabled = Boolean(enabled);
    this.audit(ctx, cron.enabled ? 'function.cron_enabled' : 'function.cron_disabled', 'cron', cronId, { functionId: definition.id });
    return cron;
  }

  public deleteCron(ctx: FunctionOperationContext, idOrSlug: string, cronId: string): boolean {
    this.assertManage(ctx);
    const definition = this.getFunction(ctx, idOrSlug);
    const cron = this.cronJobs.get(cronId);
    if (!definition || !cron || cron.functionId !== definition.id) return false;
    this.cronJobs.delete(cronId);
    this.audit(ctx, 'function.cron_deleted', 'cron', cronId, { functionId: definition.id });
    return true;
  }

  public createQueue(ctx: FunctionOperationContext, name: string): FunctionQueue {
    this.assertManage(ctx);
    const normalised = normaliseSlug(name);
    if (!normalised) throw new Error('Queue name is invalid.');
    const existing = Array.from(this.queues.values()).find((queue) => queue.organizationId === ctx.organizationId && queue.projectId === ctx.projectId && queue.environmentId === ctx.environmentId && queue.name === normalised);
    if (existing) return existing;
    const queue: FunctionQueue = { id: `queue_${randomUUID().replace(/-/g, '').slice(0, 20)}`, organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId, name: normalised, createdAt: new Date().toISOString() };
    this.queues.set(queue.id, queue);
    this.audit(ctx, 'function.queue_created', 'queue', queue.id, { name: normalised });
    return queue;
  }

  public enqueue(ctx: FunctionOperationContext, queueName: string, functionId: string, payload: unknown, options: { delayMs?: number; priority?: number; maxAttempts?: number } = {}): FunctionQueueJob {
    const queue = this.createQueue({ ...ctx, role: 'service' }, queueName);
    const definition = this.functions.get(functionId);
    if (!definition || definition.organizationId !== ctx.organizationId || definition.projectId !== ctx.projectId || definition.environmentId !== ctx.environmentId) throw new Error('Queue target function is invalid.');
    const now = new Date();
    const job: FunctionQueueJob = { id: `job_${randomUUID().replace(/-/g, '').slice(0, 20)}`, queueId: queue.id, functionId, payload, status: 'queued', attempts: 0, maxAttempts: Math.min(Math.max(Number(options.maxAttempts) || 3, 1), 10), priority: Math.min(Math.max(Number(options.priority) || 0, -10), 10), availableAt: new Date(now.getTime() + Math.min(Math.max(Number(options.delayMs) || 0, 0), 7 * 24 * 60 * 60 * 1000)).toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() };
    this.jobs.set(job.id, job);
    return job;
  }

  public listQueues(ctx: FunctionOperationContext): FunctionQueue[] {
    return Array.from(this.queues.values()).filter((queue) => queue.organizationId === ctx.organizationId && queue.projectId === ctx.projectId && queue.environmentId === ctx.environmentId);
  }

  public listJobs(ctx: FunctionOperationContext, queueName?: string): FunctionQueueJob[] {
    const queues = new Set(this.listQueues(ctx).filter((queue) => !queueName || queue.name === queueName).map((queue) => queue.id));
    return Array.from(this.jobs.values()).filter((job) => queues.has(job.queueId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public retryJob(ctx: FunctionOperationContext, queueName: string, jobId: string): FunctionQueueJob {
    this.assertManage(ctx);
    const job = this.jobs.get(jobId);
    const queue = job ? this.queues.get(job.queueId) : null;
    if (!job || !queue || queue.organizationId !== ctx.organizationId || queue.projectId !== ctx.projectId || queue.environmentId !== ctx.environmentId || queue.name !== normaliseSlug(queueName) || job.status !== 'dead_letter') throw new Error('Dead-letter job not found.');
    job.status = 'queued'; job.attempts = 0; job.lastError = undefined; job.availableAt = new Date().toISOString(); job.updatedAt = new Date().toISOString();
    this.audit(ctx, 'function.job_retried', 'job', jobId, { queue: queue.name });
    return job;
  }

  private async processQueue(): Promise<void> {
    const now = Date.now();
    const next = Array.from(this.jobs.values()).filter((job) => job.status === 'queued' && Date.parse(job.availableAt) <= now && !this.runningJobs.has(job.id)).sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))[0];
    if (!next) return;
    const definition = this.functions.get(next.functionId);
    const queue = this.queues.get(next.queueId);
    if (!definition || !queue) { next.status = 'dead_letter'; next.lastError = 'Target function or queue no longer exists.'; return; }
    this.runningJobs.add(next.id);
    next.status = 'processing'; next.attempts += 1; next.updatedAt = new Date().toISOString();
    const ctx: FunctionOperationContext = { organizationId: definition.organizationId, projectId: definition.projectId, environmentId: definition.environmentId, role: 'service', userId: `queue:${queue.name}` };
    try {
      await this.execute(ctx, definition.id, { method: 'QUEUE', path: `queue://${queue.name}`, headers: {}, query: {}, body: next.payload, role: 'service', source: 'queue' });
      next.status = 'completed'; next.updatedAt = new Date().toISOString();
    } catch (error: any) {
      next.lastError = error?.message || String(error);
      if (next.attempts >= next.maxAttempts) next.status = 'dead_letter';
      else { next.status = 'queued'; next.availableAt = new Date(Date.now() + Math.min(60_000, 1_000 * 2 ** (next.attempts - 1))).toISOString(); }
      next.updatedAt = new Date().toISOString();
    } finally { this.runningJobs.delete(next.id); }
  }

  private isValidCron(expression: string): boolean {
    const parts = expression.trim().split(/\s+/);
    const ranges: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
    return parts.length === 5 && parts.every((part, index) => {
      const [min, max] = ranges[index];
      if (part === '*') return true;
      if (/^\*\/\d+$/.test(part)) return Number(part.slice(2)) >= 1 && Number(part.slice(2)) <= max - min + 1;
      return /^\d+(,\d+)*$/.test(part) && part.split(',').every((value) => Number(value) >= min && Number(value) <= max);
    });
  }

  private cronFieldMatches(field: string, value: number): boolean {
    if (field === '*') return true;
    if (field.startsWith('*/')) return value % Number(field.slice(2)) === 0;
    return field.split(',').some((entry) => Number(entry) === value);
  }

  private async runScheduledJobs(): Promise<void> {
    const now = new Date();
    const minuteKey = now.toISOString().slice(0, 16);
    for (const cron of this.cronJobs.values()) {
      if (!cron.enabled || cron.lastRunAt?.slice(0, 16) === minuteKey) continue;
      const [minute, hour, day, month, weekDay] = cron.expression.split(/\s+/);
      if (![this.cronFieldMatches(minute, now.getUTCMinutes()), this.cronFieldMatches(hour, now.getUTCHours()), this.cronFieldMatches(day, now.getUTCDate()), this.cronFieldMatches(month, now.getUTCMonth() + 1), this.cronFieldMatches(weekDay, now.getUTCDay())].every(Boolean)) continue;
      const definition = this.functions.get(cron.functionId);
      if (!definition) continue;
      cron.lastRunAt = now.toISOString();
      try { await this.execute({ organizationId: definition.organizationId, projectId: definition.projectId, environmentId: definition.environmentId, role: 'service', userId: 'cron' }, definition.id, { method: 'CRON', path: `cron://${cron.id}`, headers: {}, query: {}, role: 'service', source: 'cron' }); }
      catch (error) { logger.error('Scheduled function execution failed:', error); }
    }
  }
}

export const functionEngine = new FunctionEngine();
