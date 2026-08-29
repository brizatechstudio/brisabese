import { HealthResult, HealthStatus } from './types';

type HealthCheck = () => Promise<{ status?: HealthStatus; details?: Record<string, unknown> }> | { status?: HealthStatus; details?: Record<string, unknown> };

export class HealthEngine {
  private checks = new Map<string, HealthCheck>();
  private last = new Map<string, HealthResult>();
  public register(service: string, check: HealthCheck): void { this.checks.set(service, check); }
  public async check(service: string): Promise<HealthResult> {
    const started = Date.now(); const task = this.checks.get(service);
    if (!task) return { service, status: 'degraded', latencyMs: 0, details: { reason: 'No health check registered.' }, checkedAt: new Date().toISOString() };
    try { const result = await task(); const health: HealthResult = { service, status: result.status || 'healthy', latencyMs: Date.now() - started, details: result.details || {}, checkedAt: new Date().toISOString() }; this.last.set(service, health); return health; }
    catch (error: any) { const health: HealthResult = { service, status: 'unhealthy', latencyMs: Date.now() - started, details: { error: error?.message || String(error) }, checkedAt: new Date().toISOString() }; this.last.set(service, health); return health; }
  }
  public async checkAll(): Promise<HealthResult[]> { return Promise.all(Array.from(this.checks.keys()).map((service) => this.check(service))); }
  public getLast(service?: string): HealthResult | HealthResult[] | null { return service ? this.last.get(service) || null : Array.from(this.last.values()); }
}
