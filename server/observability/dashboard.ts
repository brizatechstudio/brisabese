import { AlertEngine } from './alerts';
import { MetricsEngine } from './metrics';
import { HealthEngine } from './health';
import { StructuredLog, TraceRecord } from './types';

export class ObservabilityDashboard {
  constructor(private readonly metrics: MetricsEngine, private readonly alerts: AlertEngine, private readonly health: HealthEngine, private readonly logs: () => StructuredLog[], private readonly traces: () => TraceRecord[]) {}
  public async overview(): Promise<Record<string, unknown>> {
    const summary = this.metrics.summary(); const logs = this.logs();
    return { generatedAt: new Date().toISOString(), metrics: summary, errors: logs.filter((log) => ['error', 'critical'].includes(log.level)).length, logs: logs.length, traces: this.traces().length, alerts: this.alerts.listEvents(20), health: await this.health.checkAll() };
  }
}
