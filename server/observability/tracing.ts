import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { postgres } from '../db/postgres';
import { config } from '../config';
import { TelemetryContext, TraceRecord, TraceSpan } from './types';
import { sanitizeTelemetry } from './sanitizer';

function span(row: any): TraceSpan {
  return { id: row.span_id, traceId: row.trace_id, parentSpanId: row.parent_span_id || undefined, requestId: row.request_id || undefined, organizationId: row.organization_id || undefined, projectId: row.project_id || undefined, environmentId: row.environment_id || undefined, userId: row.user_id || undefined, name: row.operation, service: row.service, startedAt: new Date(row.start_time).toISOString(), endedAt: row.end_time ? new Date(row.end_time).toISOString() : undefined, durationMs: row.duration_ms === null || row.duration_ms === undefined ? undefined : Number(row.duration_ms), status: row.status, error: row.error || undefined, metadata: typeof row.attributes === 'string' ? JSON.parse(row.attributes) : (row.attributes || {}) };
}

export class TraceEngine {
  private traces = new Map<string, TraceRecord>();
  private context = new AsyncLocalStorage<TelemetryContext>();
  private readonly pending = new Set<Promise<void>>();
  private lastPersistenceError: string | undefined;
  private lastPersistedAt: string | undefined;
  constructor(private readonly maxEntries: () => number) {}
  public current(): TelemetryContext { return this.context.getStore() || {}; }
  public run<T>(context: TelemetryContext, callback: () => T): T { return this.context.run({ ...this.current(), ...context }, callback); }
  public startTrace(name: string, service: string, context: TelemetryContext = {}): TraceRecord { const traceId = context.traceId || `tr_${randomUUID().replace(/-/g, '').slice(0, 24)}`; const trace: TraceRecord = { traceId, name, service, startedAt: new Date().toISOString(), status: 'running', spans: [], ...context }; this.traces.set(traceId, trace); this.trim(); return trace; }
  public startSpan(name: string, service: string, metadata?: Record<string, unknown>, context: TelemetryContext = this.current()): TraceSpan {
    const trace = context.traceId ? this.traces.get(context.traceId) || this.startTrace('implicit', service, context) : this.startTrace(name, service, context);
    const item: TraceSpan = { id: `sp_${randomUUID().replace(/-/g, '').slice(0, 20)}`, traceId: trace.traceId, parentSpanId: context.spanId, name, service, startedAt: new Date().toISOString(), status: 'running', metadata: sanitizeTelemetry(metadata || {}), ...context };
    trace.spans = [...trace.spans, item]; this.traces.set(trace.traceId, trace); if (!config.testMode) this.persist(item); return item;
  }
  public endSpan(item: TraceSpan, error?: unknown): TraceSpan {
    item.endedAt = new Date().toISOString(); item.durationMs = Math.max(0, Date.parse(item.endedAt) - Date.parse(item.startedAt)); item.status = error ? 'error' : 'ok'; item.error = error ? String(error instanceof Error ? error.message : error).slice(0, 8192) : undefined;
    const trace = this.traces.get(item.traceId); if (trace && trace.spans.every((candidate) => candidate.status !== 'running')) { trace.endedAt = item.endedAt; trace.durationMs = Math.max(0, Date.parse(trace.endedAt) - Date.parse(trace.startedAt)); trace.status = trace.spans.some((candidate) => candidate.status === 'error') ? 'error' : 'ok'; }
    if (!config.testMode) this.persist(item); return item;
  }
  public withSpan<T>(name: string, service: string, callback: () => T, metadata?: Record<string, unknown>): T { const item = this.startSpan(name, service, metadata); return this.run({ ...this.current(), traceId: item.traceId, spanId: item.id }, () => { try { const value = callback(); if (value && typeof (value as any).then === 'function') return (value as any).then((result: any) => { this.endSpan(item); return result; }).catch((error: any) => { this.endSpan(item, error); throw error; }); this.endSpan(item); return value; } catch (error) { this.endSpan(item, error); throw error; } }); }
  public get(traceId: string): TraceRecord | null { return this.traces.get(traceId) || null; }
  public list(filters: { projectId?: string; requestId?: string; traceId?: string; limit?: number } = {}): TraceRecord[] { return Array.from(this.traces.values()).filter((trace) => (!filters.projectId || trace.projectId === filters.projectId) && (!filters.requestId || trace.requestId === filters.requestId) && (!filters.traceId || trace.traceId === filters.traceId)).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, filters.limit || 100); }
  public async listPersistent(filters: { projectId?: string; environmentId?: string; requestId?: string; traceId?: string; limit?: number } = {}): Promise<TraceRecord[]> {
    const values: unknown[] = []; const terms: string[] = [];
    const add = (column: string, value: unknown) => { if (value !== undefined && value !== '') { values.push(value); terms.push(`${column}=$${values.length}`); } };
    add('project_id', filters.projectId); add('environment_id', filters.environmentId); add('request_id', filters.requestId); add('trace_id', filters.traceId); values.push(Math.min(Math.max(filters.limit || 100, 1), 1000));
    const rows = await postgres.query<any>(`SELECT * FROM observability_traces${terms.length ? ` WHERE ${terms.join(' AND ')}` : ''} ORDER BY start_time DESC LIMIT $${values.length}`, values);
    const grouped = new Map<string, TraceRecord>();
    for (const row of rows.reverse()) { const item = span(row); const current = grouped.get(item.traceId) || { traceId: item.traceId, name: item.name, service: item.service, startedAt: item.startedAt, endedAt: item.endedAt, durationMs: item.durationMs, status: item.status, requestId: item.requestId, organizationId: item.organizationId, projectId: item.projectId, environmentId: item.environmentId, userId: item.userId, spans: [] }; current.spans.push(item); if (item.startedAt < current.startedAt) { current.startedAt = item.startedAt; current.name = item.name; current.service = item.service; } if (item.status === 'error') current.status = 'error'; if (item.status === 'running' && current.status !== 'error') current.status = 'running'; if (item.endedAt && (!current.endedAt || item.endedAt > current.endedAt)) current.endedAt = item.endedAt; grouped.set(item.traceId, current); }
    return Array.from(grouped.values()).map((trace) => ({ ...trace, durationMs: trace.endedAt ? Math.max(0, Date.parse(trace.endedAt) - Date.parse(trace.startedAt)) : undefined })).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  public async getPersistent(traceId: string, scope: { projectId?: string; environmentId?: string } = {}): Promise<TraceRecord | null> { return (await this.listPersistent({ ...scope, traceId, limit: 1000 }))[0] || null; }
  public async flush(): Promise<void> { await Promise.all([...this.pending]); }
  public persistence(): { ready: boolean; lastError?: string; lastPersistedAt?: string; pending: number } { return { ready: !this.lastPersistenceError && Boolean(this.lastPersistedAt), lastError: this.lastPersistenceError, lastPersistedAt: this.lastPersistedAt, pending: this.pending.size }; }
  public prune(before: number): number { const ids = Array.from(this.traces.values()).filter((trace) => Date.parse(trace.startedAt) < before).map((trace) => trace.traceId); ids.forEach((traceId) => this.traces.delete(traceId)); return ids.length; }
  public async prunePersistent(before: number): Promise<number> { const rows = await postgres.query<{ id: string }>('DELETE FROM observability_traces WHERE start_time < $1 RETURNING id', [new Date(before).toISOString()]); return rows.length; }
  private persist(item: TraceSpan): void {
    const task = postgres.execute('INSERT INTO observability_traces(id,trace_id,span_id,parent_span_id,request_id,organization_id,project_id,environment_id,user_id,service,operation,start_time,end_time,duration_ms,status,error,attributes,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now()) ON CONFLICT (id) DO UPDATE SET trace_id=EXCLUDED.trace_id,span_id=EXCLUDED.span_id,parent_span_id=EXCLUDED.parent_span_id,request_id=EXCLUDED.request_id,organization_id=EXCLUDED.organization_id,project_id=EXCLUDED.project_id,environment_id=EXCLUDED.environment_id,user_id=EXCLUDED.user_id,service=EXCLUDED.service,operation=EXCLUDED.operation,start_time=EXCLUDED.start_time,end_time=COALESCE(EXCLUDED.end_time,observability_traces.end_time),duration_ms=COALESCE(EXCLUDED.duration_ms,observability_traces.duration_ms),status=CASE WHEN EXCLUDED.status=\'running\' AND observability_traces.status<>\'running\' THEN observability_traces.status ELSE EXCLUDED.status END,error=COALESCE(EXCLUDED.error,observability_traces.error),attributes=EXCLUDED.attributes', [item.id, item.traceId, item.id, item.parentSpanId || null, item.requestId || null, item.organizationId || null, item.projectId || null, item.environmentId || null, item.userId || null, item.service, item.name, item.startedAt, item.endedAt || null, item.durationMs || null, item.status, item.error || null, JSON.stringify(sanitizeTelemetry(item.metadata || {}))]).then(() => { this.lastPersistenceError = undefined; this.lastPersistedAt = new Date().toISOString(); }).catch((error: any) => { this.lastPersistenceError = error?.message || 'Trace persistence failed.'; }).finally(() => this.pending.delete(task));
    this.pending.add(task);
  }
  private trim(): void { const excess = this.traces.size - this.maxEntries(); if (excess > 0) Array.from(this.traces.values()).sort((a, b) => a.startedAt.localeCompare(b.startedAt)).slice(0, excess).forEach((trace) => this.traces.delete(trace.traceId)); }
}
