import { randomUUID } from 'node:crypto';
import { postgres } from '../db/postgres';
import { config } from '../config';
import { MetricPoint, TelemetryContext } from './types';
import { sanitizeTelemetry } from './sanitizer';

function point(row: any): MetricPoint {
  return {
    id: row.id, timestamp: new Date(row.timestamp).toISOString(), name: row.name, value: Number(row.value), kind: row.kind,
    tags: typeof row.labels === 'string' ? JSON.parse(row.labels) : (row.labels || {}), organizationId: row.organization_id || undefined,
    projectId: row.project_id || undefined, environmentId: row.environment_id || undefined, requestId: row.request_id || undefined,
    traceId: row.trace_id || undefined, spanId: row.span_id || undefined,
  };
}

export class MetricsEngine {
  private points: MetricPoint[] = [];
  private readonly pending = new Set<Promise<void>>();
  private lastPersistenceError: string | undefined;
  private lastPersistedAt: string | undefined;
  constructor(private readonly maxEntries: () => number) {}

  public record(name: string, value: number, kind: MetricPoint['kind'] = 'counter', tags: Record<string, string> = {}, context: TelemetryContext = {}): MetricPoint {
    const metric: MetricPoint = { id: `met_${randomUUID().replace(/-/g, '').slice(0, 20)}`, timestamp: new Date().toISOString(), name, value: Number.isFinite(value) ? value : 0, kind, tags: sanitizeTelemetry(tags), ...context };
    this.points.push(metric); this.trim(); if (!config.testMode) this.persist(metric); return metric;
  }
  public increment(name: string, tags?: Record<string, string>, context?: TelemetryContext): MetricPoint { return this.record(name, 1, 'counter', tags, context); }
  public observe(name: string, value: number, tags?: Record<string, string>, context?: TelemetryContext): MetricPoint { return this.record(name, value, 'histogram', tags, context); }
  public gauge(name: string, value: number, tags?: Record<string, string>, context?: TelemetryContext): MetricPoint { return this.record(name, value, 'gauge', tags, context); }
  public query(filters: { name?: string; projectId?: string; since?: string; limit?: number } = {}): MetricPoint[] { return this.points.filter((item) => (!filters.name || item.name === filters.name) && (!filters.projectId || item.projectId === filters.projectId) && (!filters.since || item.timestamp >= filters.since!)).slice(-(filters.limit || 500)).reverse(); }
  public summary(): Record<string, { count: number; total: number; average: number; latest: number }> { return this.summarize(this.points); }
  public async queryPersistent(filters: { name?: string; projectId?: string; environmentId?: string; since?: string; limit?: number } = {}): Promise<MetricPoint[]> {
    const values: unknown[] = []; const terms: string[] = [];
    const add = (column: string, value: unknown) => { if (value !== undefined && value !== '') { values.push(value); terms.push(`${column}=$${values.length}`); } };
    add('name', filters.name); add('project_id', filters.projectId); add('environment_id', filters.environmentId); if (filters.since) { values.push(filters.since); terms.push(`timestamp >= $${values.length}`); }
    values.push(Math.min(Math.max(filters.limit || 500, 1), 10_000));
    return (await postgres.query<any>(`SELECT * FROM observability_metrics${terms.length ? ` WHERE ${terms.join(' AND ')}` : ''} ORDER BY timestamp DESC LIMIT $${values.length}`, values)).map(point);
  }
  public async summaryPersistent(filters: { projectId?: string; environmentId?: string } = {}): Promise<Record<string, { count: number; total: number; average: number; latest: number }>> { return this.summarize(await this.queryPersistent({ ...filters, limit: 10_000 })); }
  public async flush(): Promise<void> { await Promise.all([...this.pending]); }
  public persistence(): { ready: boolean; lastError?: string; lastPersistedAt?: string; pending: number } { return { ready: !this.lastPersistenceError && Boolean(this.lastPersistedAt), lastError: this.lastPersistenceError, lastPersistedAt: this.lastPersistedAt, pending: this.pending.size }; }
  public prune(before: number): number { const initial = this.points.length; this.points = this.points.filter((item) => Date.parse(item.timestamp) >= before); return initial - this.points.length; }
  public async prunePersistent(before: number): Promise<number> { const rows = await postgres.query<{ id: string }>('DELETE FROM observability_metrics WHERE timestamp < $1 RETURNING id', [new Date(before).toISOString()]); return rows.length; }

  private persist(metric: MetricPoint): void {
    const task = postgres.execute('INSERT INTO observability_metrics(id,organization_id,project_id,environment_id,request_id,trace_id,span_id,name,value,kind,labels,timestamp) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [metric.id, metric.organizationId || null, metric.projectId || null, metric.environmentId || null, metric.requestId || null, metric.traceId || null, metric.spanId || null, metric.name, metric.value, metric.kind, JSON.stringify(metric.tags), metric.timestamp]).then(() => { this.lastPersistenceError = undefined; this.lastPersistedAt = new Date().toISOString(); }).catch((error: any) => { this.lastPersistenceError = error?.message || 'Metric persistence failed.'; }).finally(() => this.pending.delete(task));
    this.pending.add(task);
  }
  private summarize(items: MetricPoint[]): Record<string, { count: number; total: number; average: number; latest: number }> {
    const data: Record<string, { count: number; total: number; average: number; latest: number }> = {};
    for (const item of [...items].reverse()) { const current = data[item.name] || { count: 0, total: 0, average: 0, latest: 0 }; current.count += 1; current.total += item.value; current.average = Number((current.total / current.count).toFixed(2)); current.latest = item.value; data[item.name] = current; }
    return data;
  }
  private trim(): void { const excess = this.points.length - this.maxEntries(); if (excess > 0) this.points.splice(0, excess); }
}
