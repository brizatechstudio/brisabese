export type ObservabilityLevel = 'debug' | 'info' | 'warning' | 'error' | 'critical';
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface TelemetryContext {
  requestId?: string;
  traceId?: string;
  spanId?: string;
  sessionId?: string;
  organizationId?: string;
  projectId?: string;
  environmentId?: string;
  userId?: string;
  service?: string;
  ip?: string;
  userAgent?: string;
}

export interface StructuredLog extends TelemetryContext {
  id: string;
  timestamp: string;
  level: ObservabilityLevel;
  service: string;
  event: string;
  message: string;
  durationMs?: number;
  statusCode?: number;
  metadata?: Record<string, unknown>;
}

export interface MetricPoint extends TelemetryContext {
  id: string;
  timestamp: string;
  name: string;
  value: number;
  kind: 'counter' | 'gauge' | 'histogram';
  tags: Record<string, string>;
}

export interface TraceSpan extends TelemetryContext {
  id: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  service: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: 'running' | 'ok' | 'error';
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface TraceRecord extends TelemetryContext {
  traceId: string;
  name: string;
  service: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: 'running' | 'ok' | 'error';
  spans: TraceSpan[];
}

export interface AlertRule extends TelemetryContext {
  id: string;
  name: string;
  metric: string;
  operator: '>' | '>=' | '<' | '<=' | '=';
  threshold: number;
  severity: 'warning' | 'critical';
  channels: Array<'email' | 'webhook' | 'slack' | 'discord' | 'teams'>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEvent extends TelemetryContext {
  id: string;
  ruleId: string;
  ruleName: string;
  metric: string;
  value: number;
  threshold: number;
  severity: 'warning' | 'critical';
  status: 'open' | 'resolved';
  createdAt: string;
}

export interface HealthResult {
  service: string;
  status: HealthStatus;
  latencyMs: number;
  details: Record<string, unknown>;
  checkedAt: string;
}

export interface RetentionPolicy {
  logsDays: number;
  metricsDays: number;
  tracesDays: number;
  alertsDays: number;
  maxEntries: number;
}
