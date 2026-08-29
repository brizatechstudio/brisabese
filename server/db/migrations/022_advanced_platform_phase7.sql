-- BrisaBase Phase 7: Remote Config, Feature Flags, Experiments, Analytics,
-- App Quality, Search/Vector and AI Gateway persistence.

CREATE TABLE IF NOT EXISTS feature_segments (
  id VARCHAR(80) PRIMARY KEY,
  organization_id VARCHAR(80) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, environment_id, name)
);
CREATE INDEX IF NOT EXISTS feature_segments_scope_idx ON feature_segments(project_id,environment_id,created_at DESC);

CREATE TABLE IF NOT EXISTS remote_config_parameters (
  id VARCHAR(80) PRIMARY KEY,
  organization_id VARCHAR(80) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  key VARCHAR(160) NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_by VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, environment_id, key)
);
CREATE INDEX IF NOT EXISTS remote_config_scope_idx ON remote_config_parameters(project_id,environment_id,key);

CREATE TABLE IF NOT EXISTS feature_flags (
  id VARCHAR(80) PRIMARY KEY,
  organization_id VARCHAR(80) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  key VARCHAR(160) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_basis_points INTEGER NOT NULL DEFAULT 10000 CHECK (rollout_basis_points BETWEEN 0 AND 10000),
  rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB,
  salt VARCHAR(128) NOT NULL,
  created_by VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, environment_id, key)
);
CREATE INDEX IF NOT EXISTS feature_flags_scope_idx ON feature_flags(project_id,environment_id,key);

CREATE TABLE IF NOT EXISTS experiments (
  id VARCHAR(80) PRIMARY KEY,
  organization_id VARCHAR(80) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  key VARCHAR(160) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','completed','cancelled')),
  variants JSONB NOT NULL,
  primary_metric VARCHAR(160),
  audience JSONB NOT NULL DEFAULT '{}'::jsonb,
  salt VARCHAR(128) NOT NULL,
  winner_variant VARCHAR(80),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_by VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, environment_id, key)
);
CREATE INDEX IF NOT EXISTS experiments_scope_idx ON experiments(project_id,environment_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS experiment_assignments (
  experiment_id VARCHAR(80) NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  subject_id VARCHAR(255) NOT NULL,
  variant VARCHAR(80) NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(experiment_id, subject_id)
);
CREATE INDEX IF NOT EXISTS experiment_assignments_scope_idx ON experiment_assignments(project_id,environment_id,experiment_id,variant);

CREATE TABLE IF NOT EXISTS analytics_events (
  id VARCHAR(96) PRIMARY KEY,
  organization_id VARCHAR(80) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  subject_id VARCHAR(255),
  session_id VARCHAR(255),
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_events_scope_time_idx ON analytics_events(project_id,environment_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_name_time_idx ON analytics_events(project_id,environment_id,name,occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_subject_idx ON analytics_events(project_id,environment_id,subject_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS app_quality_events (
  id VARCHAR(96) PRIMARY KEY,
  organization_id VARCHAR(80) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  kind VARCHAR(32) NOT NULL CHECK (kind IN ('crash','error','anr','performance','trace')),
  release VARCHAR(120),
  platform VARCHAR(40),
  severity VARCHAR(24) NOT NULL DEFAULT 'error' CHECK (severity IN ('info','warning','error','fatal')),
  name VARCHAR(200) NOT NULL,
  message TEXT,
  stack TEXT,
  duration_ms DOUBLE PRECISION,
  subject_id VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_quality_scope_time_idx ON app_quality_events(project_id,environment_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS app_quality_release_idx ON app_quality_events(project_id,environment_id,release,kind,occurred_at DESC);

CREATE TABLE IF NOT EXISTS app_distribution_releases (
  id VARCHAR(80) PRIMARY KEY,
  organization_id VARCHAR(80) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  version VARCHAR(120) NOT NULL,
  platform VARCHAR(40) NOT NULL,
  storage_bucket VARCHAR(160),
  storage_path TEXT,
  notes TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  created_by VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id,environment_id,platform,version)
);

CREATE TABLE IF NOT EXISTS search_indexes (
  id VARCHAR(80) PRIMARY KEY,
  organization_id VARCHAR(80) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  key VARCHAR(160) NOT NULL,
  dimensions INTEGER CHECK(dimensions IS NULL OR dimensions BETWEEN 1 AND 4096),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id,environment_id,key)
);

CREATE TABLE IF NOT EXISTS search_documents (
  id VARCHAR(96) PRIMARY KEY,
  index_id VARCHAR(80) NOT NULL REFERENCES search_indexes(id) ON DELETE CASCADE,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  external_id VARCHAR(255) NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding DOUBLE PRECISION[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(index_id, external_id)
);
CREATE INDEX IF NOT EXISTS search_documents_scope_idx ON search_documents(project_id,environment_id,index_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS search_documents_fts_idx ON search_documents USING GIN (to_tsvector('simple', coalesce(title,'') || ' ' || content));

CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id VARCHAR(80) PRIMARY KEY,
  organization_id VARCHAR(80) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  key VARCHAR(120) NOT NULL,
  base_url TEXT NOT NULL,
  model VARCHAR(160) NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  pricing JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id,environment_id,key)
);

CREATE TABLE IF NOT EXISTS ai_usage (
  id VARCHAR(96) PRIMARY KEY,
  provider_id VARCHAR(80) REFERENCES ai_provider_configs(id) ON DELETE SET NULL,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  model VARCHAR(160) NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(18,8) NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_scope_time_idx ON ai_usage(project_id,environment_id,created_at DESC);

CREATE TABLE IF NOT EXISTS messaging_templates (
  id VARCHAR(80) PRIMARY KEY,
  organization_id VARCHAR(80) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  channel VARCHAR(24) NOT NULL CHECK(channel IN ('push','email','sms')),
  subject VARCHAR(255),
  body TEXT NOT NULL,
  created_by VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id,environment_id,name,channel)
);

CREATE TABLE IF NOT EXISTS messaging_campaigns (
  id VARCHAR(80) PRIMARY KEY,
  organization_id VARCHAR(80) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  channel VARCHAR(24) NOT NULL CHECK(channel IN ('push','email','sms')),
  template_id VARCHAR(80) REFERENCES messaging_templates(id) ON DELETE SET NULL,
  subject VARCHAR(255),
  body TEXT NOT NULL,
  audience JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(24) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','queued','sending','sent','partial','failed','cancelled')),
  scheduled_at TIMESTAMPTZ,
  attempted_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_by VARCHAR(160),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messaging_campaigns_scope_idx ON messaging_campaigns(project_id,environment_id,created_at DESC);
CREATE INDEX IF NOT EXISTS messaging_campaigns_queue_idx ON messaging_campaigns(status,scheduled_at) WHERE status='queued';
