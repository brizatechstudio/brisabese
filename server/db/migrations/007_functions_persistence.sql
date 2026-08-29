-- MIGRATION 007: durable Functions control plane and operational queue state.
-- Function source, deployments, schedules, jobs, logs and secrets are scoped
-- to a BrisaBase project environment and survive API container restarts.

CREATE TABLE IF NOT EXISTS functions (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  slug VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  runtime VARCHAR(32) NOT NULL DEFAULT 'nodejs20',
  entrypoint VARCHAR(255) NOT NULL DEFAULT 'default',
  access VARCHAR(32) NOT NULL DEFAULT 'authenticated',
  execution_mode VARCHAR(32) NOT NULL DEFAULT 'user',
  limits JSONB NOT NULL DEFAULT '{"timeoutMs":15000,"memoryMb":128,"cpuProfile":"shared"}'::jsonb,
  current_version INTEGER,
  created_by VARCHAR(64),
  updated_by VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, environment_id, slug)
);

CREATE TABLE IF NOT EXISTS function_versions (
  id VARCHAR(64) PRIMARY KEY,
  function_id VARCHAR(64) NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  source TEXT NOT NULL,
  entrypoint VARCHAR(255) NOT NULL DEFAULT 'default',
  runtime VARCHAR(32) NOT NULL DEFAULT 'nodejs20',
  checksum CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  change_summary TEXT,
  created_by VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(function_id, version)
);

CREATE TABLE IF NOT EXISTS function_deployments (
  id VARCHAR(64) PRIMARY KEY,
  function_id VARCHAR(64) NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  version_id VARCHAR(64) NOT NULL REFERENCES function_versions(id) ON DELETE RESTRICT,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deployed_by VARCHAR(64),
  rollback_of VARCHAR(64) REFERENCES function_deployments(id) ON DELETE SET NULL
);

-- Environment-level secrets/variables retain the existing public API. The
-- nullable function_id permits a future function-specific API without sharing
-- a value across project environments.
CREATE TABLE IF NOT EXISTS function_secrets (
  id VARCHAR(64) PRIMARY KEY,
  function_id VARCHAR(64) REFERENCES functions(id) ON DELETE CASCADE,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS function_variables (
  id VARCHAR(64) PRIMARY KEY,
  function_id VARCHAR(64) REFERENCES functions(id) ON DELETE CASCADE,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS function_schedules (
  id VARCHAR(64) PRIMARY KEY,
  function_id VARCHAR(64) NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  cron_expression VARCHAR(128) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS function_queues (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, environment_id, name)
);

CREATE TABLE IF NOT EXISTS function_jobs (
  id VARCHAR(64) PRIMARY KEY,
  queue_id VARCHAR(64) REFERENCES function_queues(id) ON DELETE SET NULL,
  function_id VARCHAR(64) NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  priority INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error TEXT,
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS function_execution_logs (
  id VARCHAR(64) PRIMARY KEY,
  function_id VARCHAR(64) NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  version_id VARCHAR(64) REFERENCES function_versions(id) ON DELETE SET NULL,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  request_id VARCHAR(128),
  execution_id VARCHAR(64) NOT NULL,
  record_type VARCHAR(16) NOT NULL DEFAULT 'log',
  level VARCHAR(16),
  source VARCHAR(16),
  status VARCHAR(16),
  response_status INTEGER,
  duration_ms INTEGER,
  memory_mb INTEGER,
  error TEXT,
  message TEXT,
  data JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_function_secrets_environment_name
  ON function_secrets(project_id, environment_id, name) WHERE function_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_function_variables_environment_name
  ON function_variables(project_id, environment_id, name) WHERE function_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_functions_scope ON functions(organization_id, project_id, environment_id);
CREATE INDEX IF NOT EXISTS idx_function_versions_function ON function_versions(function_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_function_deployments_function ON function_deployments(function_id, deployed_at DESC);
CREATE INDEX IF NOT EXISTS idx_function_schedules_due ON function_schedules(enabled, last_run_at) WHERE enabled;
CREATE INDEX IF NOT EXISTS idx_function_jobs_due ON function_jobs(status, available_at, priority DESC) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_function_jobs_scope ON function_jobs(organization_id, project_id, environment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_function_execution_logs_function ON function_execution_logs(function_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_function_execution_logs_request ON function_execution_logs(request_id) WHERE request_id IS NOT NULL;
