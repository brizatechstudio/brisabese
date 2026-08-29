CREATE TABLE IF NOT EXISTS observability_alert_rules (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  definition JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_observability_alert_rules_scope
  ON observability_alert_rules(project_id, environment_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS observability_alert_events (
  id VARCHAR(64) PRIMARY KEY,
  rule_id VARCHAR(64) REFERENCES observability_alert_rules(id) ON DELETE CASCADE,
  organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(64) REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) REFERENCES project_environments(id) ON DELETE CASCADE,
  definition JSONB NOT NULL,
  status VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_observability_alert_events_scope_time
  ON observability_alert_events(project_id, environment_id, created_at DESC);
