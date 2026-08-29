import { randomUUID } from 'node:crypto';
import { AlertEvent, AlertRule, MetricPoint, TelemetryContext } from './types';
import { postgres } from '../db/postgres';
import { config } from '../config';

export class AlertEngine {
  private rules = new Map<string, AlertRule>();
  private events: AlertEvent[] = [];
  private pendingWrites = new Set<Promise<void>>();
  private lastPersistenceError?: string;
  constructor(private readonly maxEntries: () => number) {}
  private parse<T>(value: T | string): T { return typeof value === 'string' ? JSON.parse(value) as T : value; }
  private enqueue(write: Promise<void>): void {
    this.pendingWrites.add(write);
    void write.catch((error) => { this.lastPersistenceError = error instanceof Error ? error.message : 'Alert persistence failed.'; }).finally(() => this.pendingWrites.delete(write));
  }
  public async hydrate(): Promise<void> {
    if (config.testMode) return;
    const [rules, events] = await Promise.all([
      postgres.query<{ definition: AlertRule | string }>('SELECT definition FROM observability_alert_rules ORDER BY updated_at DESC'),
      postgres.query<{ definition: AlertEvent | string }>('SELECT definition FROM observability_alert_events ORDER BY created_at DESC LIMIT 10000'),
    ]);
    this.rules.clear();
    for (const row of rules) { const rule = this.parse(row.definition); if (rule?.id) this.rules.set(rule.id, rule); }
    this.events = events.map((row) => this.parse(row.definition)).filter((event) => Boolean(event?.id));
    this.lastPersistenceError = undefined;
  }
  public async flush(): Promise<void> { await Promise.all(Array.from(this.pendingWrites)); }
  public persistence(): Record<string, unknown> { return { ready: config.testMode || !this.lastPersistenceError, pendingWrites: this.pendingWrites.size, lastError: this.lastPersistenceError, rules: this.rules.size, events: this.events.length }; }
  public get(id: string): AlertRule | undefined { const rule = this.rules.get(id); return rule ? JSON.parse(JSON.stringify(rule)) as AlertRule : undefined; }
  public async persist(rule: AlertRule): Promise<void> {
    if (config.testMode) return;
    await postgres.execute('INSERT INTO observability_alert_rules(id,organization_id,project_id,environment_id,definition,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET definition=EXCLUDED.definition,updated_at=EXCLUDED.updated_at', [rule.id, rule.organizationId || null, rule.projectId, rule.environmentId, JSON.stringify(rule), rule.createdAt, rule.updatedAt]);
    this.lastPersistenceError = undefined;
  }
  public async removePersistent(id: string): Promise<void> { if (!config.testMode) await postgres.execute('DELETE FROM observability_alert_rules WHERE id=$1', [id]); }
  private validate(input: Pick<AlertRule, 'name' | 'metric' | 'operator' | 'threshold' | 'severity' | 'channels' | 'enabled'>): void {
    if (!input.name?.trim() || !input.metric?.trim() || !Number.isFinite(input.threshold)) throw new Error('Invalid alert rule.');
    if (!['>', '>=', '<', '<=', '='].includes(input.operator) || !['warning', 'critical'].includes(input.severity) || !Array.isArray(input.channels) || typeof input.enabled !== 'boolean') throw new Error('Invalid alert rule.');
  }
  public create(input: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>): AlertRule {
    this.validate(input);
    const now = new Date().toISOString(); const rule: AlertRule = { ...input, id: `alert_${randomUUID().replace(/-/g, '').slice(0, 20)}`, createdAt: now, updatedAt: now };
    this.rules.set(rule.id, rule); return rule;
  }
  public update(id: string, input: Partial<Omit<AlertRule, 'id' | 'createdAt'>>): AlertRule {
    const rule = this.rules.get(id); if (!rule) throw new Error('Alert rule not found.'); const updated = { ...rule, ...input, id: rule.id, createdAt: rule.createdAt, updatedAt: new Date().toISOString() }; this.validate(updated); this.rules.set(id, updated); return updated;
  }
  public remove(id: string): boolean { return this.rules.delete(id); }
  public list(context: TelemetryContext = {}): AlertRule[] { return Array.from(this.rules.values()).filter((rule) => (!context.projectId || rule.projectId === context.projectId) && (!context.environmentId || rule.environmentId === context.environmentId)); }
  public listEvents(limit = 100, context: TelemetryContext = {}): AlertEvent[] { return this.events.filter((event) => (!context.projectId || event.projectId === context.projectId) && (!context.environmentId || event.environmentId === context.environmentId)).slice(0, limit); }
  public evaluate(point: MetricPoint): AlertEvent[] {
    const created: AlertEvent[] = [];
    for (const rule of this.rules.values()) {
      if (!rule.enabled || rule.metric !== point.name || (rule.projectId && rule.projectId !== point.projectId)) continue;
      const matches = rule.operator === '>' ? point.value > rule.threshold : rule.operator === '>=' ? point.value >= rule.threshold : rule.operator === '<' ? point.value < rule.threshold : rule.operator === '<=' ? point.value <= rule.threshold : point.value === rule.threshold;
      if (!matches) continue;
      const duplicate = this.events.find((event) => event.ruleId === rule.id && event.status === 'open' && Date.now() - Date.parse(event.createdAt) < 60_000);
      if (duplicate) continue;
      const event: AlertEvent = { id: `alr_${randomUUID().replace(/-/g, '').slice(0, 20)}`, ruleId: rule.id, ruleName: rule.name, metric: point.name, value: point.value, threshold: rule.threshold, severity: rule.severity, status: 'open', createdAt: new Date().toISOString(), projectId: point.projectId, environmentId: point.environmentId, organizationId: point.organizationId };
      this.events.unshift(event); created.push(event);
      if (!config.testMode) this.enqueue(postgres.execute('INSERT INTO observability_alert_events(id,rule_id,organization_id,project_id,environment_id,definition,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [event.id,event.ruleId,event.organizationId || null,event.projectId || null,event.environmentId || null,JSON.stringify(event),event.status,event.createdAt]));
    }
    this.events.splice(this.maxEntries()); return created;
  }
  public prune(before: number): number { const size = this.events.length; this.events = this.events.filter((event) => Date.parse(event.createdAt) >= before); return size - this.events.length; }
  public async prunePersistent(before: number): Promise<number> { if (config.testMode) return 0; return (await postgres.query<{ id: string }>('DELETE FROM observability_alert_events WHERE created_at < $1 RETURNING id', [new Date(before).toISOString()])).length; }
}
