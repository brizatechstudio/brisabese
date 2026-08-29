import { randomUUID } from 'node:crypto';
import { AlertEngine } from './alerts';
import { ObservabilityDashboard } from './dashboard';
import { ObservabilityEventBus } from './eventBus';
import { ObservabilityExporters } from './exporters';
import { HealthEngine } from './health';
import { MetricsEngine } from './metrics';
import { RetentionEngine } from './retention';
import { sanitizeTelemetry } from './sanitizer';
import { TraceEngine } from './tracing';
import { AlertRule, MetricPoint, ObservabilityLevel, StructuredLog, TelemetryContext } from './types';
import { postgres } from '../db/postgres';
import { config } from '../config';
import { AlertWebhookDispatcher } from './alertWebhook';

function inferService(path = ''): string { if (path.includes('/storage')) return 'storage'; if (path.includes('/functions')) return 'functions'; if (path.includes('/realtime')) return 'realtime'; if (path.includes('/auth')) return 'auth'; if (path.includes('/security')) return 'security'; if (path.includes('/database')) return 'database'; return 'api'; }

export class ObservabilityEngine {
  public readonly bus = new ObservabilityEventBus();
  public readonly retention = new RetentionEngine();
  public readonly metrics = new MetricsEngine(() => this.retention.get().maxEntries);
  public readonly traces = new TraceEngine(() => this.retention.get().maxEntries);
  public readonly alerts = new AlertEngine(() => this.retention.get().maxEntries);
  public readonly health = new HealthEngine();
  public readonly exporters = new ObservabilityExporters();
  public readonly alertWebhook = new AlertWebhookDispatcher(config.observability.alertWebhookUrl, config.observability.alertWebhookToken, config.observability.exportTimeoutMs);
  private logs: StructuredLog[] = [];
  private lastCpu = process.cpuUsage();
  private lastCpuAt = Date.now();
  private retentionTimer: NodeJS.Timeout | null = null;
  private persistenceStarted = false;
  public readonly dashboard = new ObservabilityDashboard(this.metrics, this.alerts, this.health, () => this.logs, () => this.traces.list({ limit: 10_000 }));

  constructor() {
    this.bus.subscribe<MetricPoint>('metric', ({ payload }) => { for (const alert of this.alerts.evaluate(payload)) this.bus.publish('alert', alert); });
    this.bus.subscribe<any>('alert', ({ payload }) => { if (this.alerts.get(payload.ruleId)?.channels.includes('webhook')) this.alertWebhook.enqueue(payload); });
    this.health.register('observability', () => ({ status: this.alerts.persistence().lastError || this.alertWebhook.status().lastError ? 'degraded' : 'healthy', details: { buffers: { logs: this.logs.length, metrics: this.metrics.query({ limit: 10_000 }).length, traces: this.traces.list({ limit: 10_000 }).length }, alerts: this.alerts.persistence(), webhook: this.alertWebhook.status() } }));
    const sampler = setInterval(() => this.sampleProcessMetrics(), 10_000);
    sampler.unref();
  }
  /** Starts durable telemetry after PostgreSQL has finished migrations. */
  public async start(): Promise<void> {
    if (config.testMode || this.persistenceStarted) return;
    await this.alerts.hydrate();
    this.alertWebhook.start(this.alerts.listEvents(100).filter((event) => event.status === 'open' && this.alerts.get(event.ruleId)?.channels.includes('webhook')));
    const probe = this.traces.startSpan('observability.persistence_probe', 'observability', { operation: 'startup' }, { service: 'observability' });
    this.traces.endSpan(probe);
    this.metric('observability.persistence_probe', 1, 'counter', { operation: 'startup' }, { service: 'observability', traceId: probe.traceId, spanId: probe.id });
    this.persistenceStarted = true;
    await Promise.all([this.metrics.flush(), this.traces.flush()]);
    const status = await this.persistenceHealth();
    if (status.status !== 'ok') { this.persistenceStarted = false; throw new Error(`[BRISABASE OBSERVABILITY ERROR] ${status.reason || 'Persistent telemetry is unavailable.'}`); }
    this.retentionTimer = setInterval(() => void this.flushPersistentRetention().catch(() => undefined), 60 * 60 * 1000);
    this.retentionTimer.unref();
  }
  public async stop(): Promise<void> { if (this.retentionTimer) clearInterval(this.retentionTimer); this.retentionTimer = null; this.alertWebhook.stop(); await this.alerts.flush(); this.persistenceStarted = false; }
  public async persistenceHealth(): Promise<{ status: 'ok' | 'degraded'; reason?: string; details: Record<string, unknown> }> {
    const database = await postgres.healthCheck(); let migrations = false; let queryable = false; let reason: string | undefined;
    try {
      const names = ['observability_logs', 'observability_metrics', 'observability_traces', 'observability_alert_rules', 'observability_alert_events'];
      const checks = await Promise.all(names.map((name) => postgres.query<{ relation: string | null }>('SELECT to_regclass($1) AS relation', [`public.${name}`])));
      migrations = checks.every((rows) => Boolean(rows[0]?.relation));
      if (migrations) { await postgres.query('SELECT 1 FROM observability_metrics LIMIT 1'); await postgres.query('SELECT 1 FROM observability_traces LIMIT 1'); queryable = true; }
    } catch (error: any) { reason = error?.message || 'Persistent telemetry query failed.'; }
    const metrics = this.metrics.persistence(); const traces = this.traces.persistence(); const alerts = this.alerts.persistence();
    if (database.status !== 'ok') reason = reason || 'PostgreSQL is unavailable.';
    else if (!migrations) reason = reason || 'Observability migrations are missing.';
    else if (!queryable) reason = reason || 'Observability tables are not queryable.';
    else if (!metrics.ready) reason = reason || metrics.lastError || 'Metric persistence has not completed.';
    else if (!traces.ready) reason = reason || traces.lastError || 'Trace persistence has not completed.';
    else if (!alerts.ready) reason = reason || String(alerts.lastError || 'Alert persistence has not completed.');
    else if (!this.persistenceStarted && !config.testMode) reason = reason || 'Observability persistence lifecycle is not running.';
    return { status: reason ? 'degraded' : 'ok', reason, details: { database, migrations, queryable, metrics, traces, alerts, alertWebhook: this.alertWebhook.status(), retentionScheduler: Boolean(this.retentionTimer) } };
  }
  private sampleProcessMetrics(): void {
    const now = Date.now(); const cpu = process.cpuUsage(this.lastCpu); const elapsedMs = Math.max(1, now - this.lastCpuAt);
    this.lastCpu = process.cpuUsage(); this.lastCpuAt = now;
    this.metric('platform.cpu_pct', Number((((cpu.user + cpu.system) / 1_000) / elapsedMs * 100).toFixed(2)), 'gauge', { process: 'server' }, { service: 'observability' });
    const memory = process.memoryUsage();
    this.metric('platform.memory_rss_bytes', memory.rss, 'gauge', { process: 'server' }, { service: 'observability' });
    this.metric('platform.memory_heap_bytes', memory.heapUsed, 'gauge', { process: 'server' }, { service: 'observability' });
  }
  public context(): TelemetryContext { return this.traces.current(); }
  public run<T>(context: TelemetryContext, callback: () => T): T { return this.traces.run(context, callback); }
  public beginRequest(input: { method: string; path: string; requestId?: string; context?: TelemetryContext }): { context: TelemetryContext; span: ReturnType<TraceEngine['startSpan']> } {
    const context: TelemetryContext = { ...input.context, requestId: input.requestId || `req_${randomUUID().replace(/-/g, '').slice(0, 16)}`, service: inferService(input.path) };
    const trace = this.traces.startTrace(`${input.method} ${input.path}`, context.service!, context); const span = this.traces.startSpan('http.request', context.service!, { method: input.method, path: input.path }, { ...context, traceId: trace.traceId });
    return { context: { ...context, traceId: trace.traceId, spanId: span.id }, span };
  }
  public endRequest(span: ReturnType<TraceEngine['startSpan']>, statusCode: number): void { this.traces.endSpan(span, statusCode >= 500 ? new Error(`HTTP ${statusCode}`) : undefined); const context = this.context(); this.metrics.increment('api.requests', { service: span.service, status: String(statusCode) }, { ...context, traceId: span.traceId }); this.metrics.observe('api.latency_ms', span.durationMs || 0, { service: span.service, status: String(statusCode) }, { ...context, traceId: span.traceId }); if (statusCode >= 400) this.metrics.increment('api.errors', { service: span.service, status: String(statusCode) }, context); }
  public log(level: ObservabilityLevel, event: string, message: string, metadata?: Record<string, unknown>, context: TelemetryContext = this.context()): StructuredLog {
    const log: StructuredLog = { id: `log_${randomUUID().replace(/-/g, '').slice(0, 20)}`, timestamp: new Date().toISOString(), level, service: context.service || 'platform', event, message, metadata: sanitizeTelemetry(metadata || {}), ...context };
    this.logs.push(log); const excess = this.logs.length - this.retention.get().maxEntries; if (excess > 0) this.logs.splice(0, excess);
    if (!config.testMode) void postgres.execute('INSERT INTO observability_logs(id,organization_id,project_id,environment_id,user_id,request_id,trace_id,span_id,level,service,event,message,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', [log.id,log.organizationId || null,log.projectId || null,log.environmentId || null,log.userId || null,log.requestId || null,log.traceId || null,log.spanId || null,log.level,log.service,log.event || null,log.message,JSON.stringify(log.metadata || {}),log.timestamp]).catch(() => undefined);
    this.bus.publish('log', log); return log;
  }
  public metric(name: string, value: number, kind: MetricPoint['kind'] = 'counter', tags: Record<string, string> = {}, context: TelemetryContext = this.context()): MetricPoint { const metric = this.metrics.record(name, value, kind, tags, context); this.bus.publish('metric', metric); return metric; }
  public withSpan<T>(name: string, service: string, callback: () => T, metadata?: Record<string, unknown>): T { return this.traces.withSpan(name, service, callback, metadata); }
  public async checkHealth(service?: string): Promise<any> {
    const results = service ? [await this.health.check(service)] : await this.health.checkAll();
    for (const result of results) {
      this.bus.publish('health', result);
      this.metric('health.check_latency_ms', result.latencyMs, 'histogram', { service: result.service, status: result.status }, { service: 'observability' });
      this.log(result.status === 'unhealthy' ? 'error' : result.status === 'degraded' ? 'warning' : 'info', 'health.checked', `Health check for ${result.service}: ${result.status}.`, { latencyMs: result.latencyMs }, { service: 'observability' });
    }
    return service ? results[0] : results;
  }
  public listLogs(filters: { level?: string; service?: string; projectId?: string; requestId?: string; traceId?: string; search?: string; limit?: number } = {}): StructuredLog[] { const needle = filters.search?.toLowerCase(); return this.logs.filter((log) => (!filters.level || log.level === filters.level) && (!filters.service || log.service === filters.service) && (!filters.projectId || log.projectId === filters.projectId) && (!filters.requestId || log.requestId === filters.requestId) && (!filters.traceId || log.traceId === filters.traceId) && (!needle || `${log.message} ${log.event}`.toLowerCase().includes(needle))).slice(-(filters.limit || 200)).reverse(); }
  public createAlert(input: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>): AlertRule { const rule = this.alerts.create(input); this.log('info', 'alert.created', `Alert '${rule.name}' created.`, { metric: rule.metric }); return rule; }
  public flushRetention(): Record<string, number> { const policy = this.retention.get(); const results = { logs: this.pruneLogs(this.retention.before(policy.logsDays)), metrics: this.metrics.prune(this.retention.before(policy.metricsDays)), traces: this.traces.prune(this.retention.before(policy.tracesDays)), alerts: this.alerts.prune(this.retention.before(policy.alertsDays)) }; this.log('info', 'log.retained', 'Retention sweep completed.', results); return results; }
  public async flushPersistentRetention(): Promise<Record<string, number>> {
    const policy = this.retention.get(); const memory = this.flushRetention();
    if (config.testMode) return memory;
    const [logs, metrics, traces, alerts] = await Promise.all([
      postgres.query<{ id: string }>('DELETE FROM observability_logs WHERE created_at < $1 RETURNING id', [new Date(this.retention.before(policy.logsDays)).toISOString()]),
      this.metrics.prunePersistent(this.retention.before(policy.metricsDays)),
      this.traces.prunePersistent(this.retention.before(policy.tracesDays)),
      this.alerts.prunePersistent(this.retention.before(policy.alertsDays)),
    ]);
    return { ...memory, logs: logs.length, metrics, traces, alerts };
  }
  public async persistentOverview(scope: { projectId?: string; environmentId?: string } = {}): Promise<Record<string, unknown>> {
    const values: unknown[] = []; const terms: string[] = [];
    if (scope.projectId) { values.push(scope.projectId); terms.push(`project_id=$${values.length}`); }
    if (scope.environmentId) { values.push(scope.environmentId); terms.push(`environment_id=$${values.length}`); }
    const where = terms.length ? ` WHERE ${terms.join(' AND ')}` : '';
    const [summary, logs, traces, health] = await Promise.all([
      this.metrics.summaryPersistent(scope),
      postgres.query<{ count: string; errors: string }>(`SELECT count(*)::text AS count,count(*) FILTER (WHERE level IN ('error','critical'))::text AS errors FROM observability_logs${where}`, values),
      postgres.query<{ count: string }>(`SELECT count(DISTINCT trace_id)::text AS count FROM observability_traces${where}`, values),
      this.health.checkAll(),
    ]);
    return { generatedAt: new Date().toISOString(), metrics: summary, errors: Number(logs[0]?.errors || 0), logs: Number(logs[0]?.count || 0), traces: Number(traces[0]?.count || 0), alerts: this.alerts.listEvents(20, scope), health };
  }
  private pruneLogs(before: number): number { const size = this.logs.length; this.logs = this.logs.filter((log) => Date.parse(log.timestamp) >= before); return size - this.logs.length; }
}

export const observability = new ObservabilityEngine();
export * from './types';
