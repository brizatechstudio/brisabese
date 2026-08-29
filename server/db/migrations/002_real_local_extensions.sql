-- BrisaBase V2 real-local persistence for services that previously held runtime state.

CREATE TABLE IF NOT EXISTS auth_users (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  password_hash TEXT,
  display_name VARCHAR(255),
  role VARCHAR(64) NOT NULL DEFAULT 'authenticated',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  user_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  app_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, environment_id, email)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id VARCHAR(96) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  refresh_token_hash CHAR(64),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_scope ON auth_sessions(project_id, environment_id, user_id);

CREATE TABLE IF NOT EXISTS security_policies (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  resource_type VARCHAR(32) NOT NULL,
  resource TEXT NOT NULL,
  operation VARCHAR(32) NOT NULL,
  definition JSONB NOT NULL,
  compiled JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_policies_scope ON security_policies(project_id, environment_id, resource_type, resource);

CREATE TABLE IF NOT EXISTS function_definitions (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  runtime VARCHAR(32) NOT NULL,
  source TEXT NOT NULL,
  permission VARCHAR(32) NOT NULL DEFAULT 'authenticated',
  timeout_ms INTEGER NOT NULL DEFAULT 30000,
  memory_mb INTEGER NOT NULL DEFAULT 128,
  active_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, environment_id, name)
);

CREATE TABLE IF NOT EXISTS function_logs (
  id VARCHAR(64) PRIMARY KEY,
  function_id VARCHAR(64) REFERENCES function_definitions(id) ON DELETE SET NULL,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  level VARCHAR(16) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS observability_logs (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64), project_id VARCHAR(64), environment_id VARCHAR(64), user_id VARCHAR(64),
  request_id VARCHAR(128), trace_id VARCHAR(128), span_id VARCHAR(128),
  level VARCHAR(16) NOT NULL, service VARCHAR(64) NOT NULL, event VARCHAR(128), message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_observability_logs_scope_time ON observability_logs(project_id, environment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_plans (
  id VARCHAR(64) PRIMARY KEY, name VARCHAR(128) NOT NULL UNIQUE, limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id VARCHAR(64) PRIMARY KEY, organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id VARCHAR(64) REFERENCES billing_plans(id), status VARCHAR(32) NOT NULL, provider VARCHAR(32) NOT NULL DEFAULT 'local',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(), ends_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS billing_invoices (
  id VARCHAR(64) PRIMARY KEY, organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id VARCHAR(64) REFERENCES billing_subscriptions(id) ON DELETE SET NULL, amount_cents INTEGER NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD', status VARCHAR(32) NOT NULL, provider VARCHAR(32) NOT NULL DEFAULT 'local', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS billing_usage (
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, metric VARCHAR(128) NOT NULL,
  value BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(organization_id, metric)
);
CREATE TABLE IF NOT EXISTS billing_events (
  id VARCHAR(64) PRIMARY KEY, organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event VARCHAR(128) NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS developer_registry_items (
  id VARCHAR(64) PRIMARY KEY, kind VARCHAR(32) NOT NULL, slug VARCHAR(128) NOT NULL, version VARCHAR(64) NOT NULL,
  manifest JSONB NOT NULL, signed BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kind, slug, version)
);

CREATE TABLE IF NOT EXISTS infrastructure_nodes (
  id VARCHAR(64) PRIMARY KEY, region VARCHAR(64) NOT NULL, zone VARCHAR(64) NOT NULL, hostname VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, last_heartbeat_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS infrastructure_deployments (
  id VARCHAR(64) PRIMARY KEY, project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE, service VARCHAR(64) NOT NULL,
  version VARCHAR(128) NOT NULL, status VARCHAR(32) NOT NULL, strategy VARCHAR(32) NOT NULL, provider VARCHAR(32) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS backup_records (
  id VARCHAR(64) PRIMARY KEY, project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE, storage_key TEXT NOT NULL,
  status VARCHAR(32) NOT NULL, checksum CHAR(64), encrypted BOOLEAN NOT NULL DEFAULT TRUE, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_database_registry (
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  schema_name VARCHAR(63) NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, environment_id)
);
