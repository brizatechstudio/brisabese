-- BrisaBase Phase 6: recovery certification, production hosting domains and runtime operations.

ALTER TABLE hosting_sites
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{"redirects":[],"rewrites":[],"publicEnv":{}}'::jsonb;

CREATE TABLE IF NOT EXISTS hosting_domains (
  id VARCHAR(80) PRIMARY KEY,
  site_id VARCHAR(80) NOT NULL REFERENCES hosting_sites(id) ON DELETE CASCADE,
  organization_id VARCHAR(80) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  hostname VARCHAR(255) NOT NULL,
  verification_token VARCHAR(128) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  tls_status VARCHAR(24) NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMPTZ,
  created_by VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(hostname),
  CHECK (status IN ('pending','verified','disabled','failed')),
  CHECK (tls_status IN ('pending','active','failed'))
);
CREATE INDEX IF NOT EXISTS hosting_domains_scope_idx ON hosting_domains(organization_id,project_id,environment_id,site_id,created_at DESC);
CREATE INDEX IF NOT EXISTS hosting_domains_hostname_idx ON hosting_domains(lower(hostname)) WHERE status='verified';

CREATE TABLE IF NOT EXISTS backup_recovery_drills (
  id VARCHAR(80) PRIMARY KEY,
  provider VARCHAR(40) NOT NULL,
  status VARCHAR(24) NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_by VARCHAR(160) NOT NULL DEFAULT 'operator',
  CHECK (status IN ('running','passed','failed'))
);
CREATE INDEX IF NOT EXISTS backup_recovery_drills_time_idx ON backup_recovery_drills(completed_at DESC NULLS LAST,started_at DESC);

CREATE TABLE IF NOT EXISTS runtime_instances (
  id VARCHAR(120) PRIMARY KEY,
  release VARCHAR(160) NOT NULL,
  region VARCHAR(80) NOT NULL,
  hostname VARCHAR(255) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'healthy',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('starting','healthy','degraded','draining','stopped'))
);
CREATE INDEX IF NOT EXISTS runtime_instances_heartbeat_idx ON runtime_instances(last_heartbeat_at DESC);

CREATE TABLE IF NOT EXISTS operations_incidents (
  id VARCHAR(80) PRIMARY KEY,
  organization_id VARCHAR(80) REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(80) REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(160) REFERENCES project_environments(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  severity VARCHAR(24) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'investigating',
  created_by VARCHAR(160) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (severity IN ('info','minor','major','critical')),
  CHECK (status IN ('investigating','identified','monitoring','resolved'))
);
CREATE INDEX IF NOT EXISTS operations_incidents_scope_time_idx ON operations_incidents(project_id,environment_id,started_at DESC);
CREATE INDEX IF NOT EXISTS operations_incidents_public_idx ON operations_incidents(status,started_at DESC);
