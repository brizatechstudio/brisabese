-- BrisaBase Phase 5: Developer Platform persistence.
CREATE TABLE IF NOT EXISTS graphql_persisted_queries (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment_id text NOT NULL,
  sha256_hash char(64) NOT NULL,
  query_text text NOT NULL,
  operation_name text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  use_count bigint NOT NULL DEFAULT 0,
  UNIQUE (organization_id, project_id, environment_id, sha256_hash)
);
CREATE INDEX IF NOT EXISTS idx_graphql_persisted_scope ON graphql_persisted_queries(organization_id, project_id, environment_id, last_used_at DESC);

CREATE TABLE IF NOT EXISTS developer_artifacts (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('openapi','typescript')),
  checksum char(64) NOT NULL,
  generated_by text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_developer_artifacts_scope ON developer_artifacts(organization_id, project_id, environment_id, kind, generated_at DESC);
