-- MIGRATION 008: durable local metrics and tracing.

CREATE TABLE IF NOT EXISTS observability_metrics (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE SET NULL,
  project_id VARCHAR(64) REFERENCES projects(id) ON DELETE SET NULL,
  environment_id VARCHAR(64) REFERENCES project_environments(id) ON DELETE SET NULL,
  request_id VARCHAR(128),
  trace_id VARCHAR(128),
  span_id VARCHAR(128),
  name VARCHAR(255) NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  kind VARCHAR(16) NOT NULL,
  labels JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS observability_traces (
  id VARCHAR(64) PRIMARY KEY,
  trace_id VARCHAR(128) NOT NULL,
  span_id VARCHAR(128) NOT NULL,
  parent_span_id VARCHAR(128),
  request_id VARCHAR(128),
  organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE SET NULL,
  project_id VARCHAR(64) REFERENCES projects(id) ON DELETE SET NULL,
  environment_id VARCHAR(64) REFERENCES project_environments(id) ON DELETE SET NULL,
  user_id VARCHAR(64),
  service VARCHAR(128) NOT NULL,
  operation VARCHAR(255) NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_ms INTEGER,
  status VARCHAR(16) NOT NULL,
  error TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trace_id, span_id)
);

CREATE INDEX IF NOT EXISTS idx_observability_metrics_scope_time
  ON observability_metrics(organization_id, project_id, environment_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_observability_metrics_name_time
  ON observability_metrics(name, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_observability_traces_trace
  ON observability_traces(trace_id, start_time);
CREATE INDEX IF NOT EXISTS idx_observability_traces_scope_time
  ON observability_traces(organization_id, project_id, environment_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_observability_traces_request
  ON observability_traces(request_id) WHERE request_id IS NOT NULL;
