import { MetricPoint, StructuredLog, TraceRecord } from './types';

function prometheusName(name: string): string { return `brisabase_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`; }
export class ObservabilityExporters {
  public prometheus(metrics: MetricPoint[]): string {
    return metrics.map((metric) => {
      const labels = Object.entries(metric.tags).map(([key, value]) => `${key}="${String(value).replace(/"/g, '\\"')}"`).join(',');
      return `${prometheusName(metric.name)}${labels ? `{${labels}}` : ''} ${metric.value}`;
    }).join('\n');
  }
  /** OTLP-shaped payload kept transport-neutral for a future HTTP/gRPC exporter. */
  public otlp(logs: StructuredLog[], traces: TraceRecord[], metrics: MetricPoint[]): Record<string, unknown> { return { resourceLogs: logs, resourceSpans: traces, resourceMetrics: metrics }; }
  public loki(logs: StructuredLog[]): Array<{ stream: Record<string, string>; values: Array<[string, string]> }> { return logs.map((log) => ({ stream: { service: log.service, level: log.level }, values: [[String(Date.parse(log.timestamp) * 1_000_000), JSON.stringify(log)]] })); }
}
