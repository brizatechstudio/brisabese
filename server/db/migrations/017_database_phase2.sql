CREATE TABLE IF NOT EXISTS sql_saved_queries (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  query TEXT NOT NULL,
  favorite BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sql_saved_queries_scope
  ON sql_saved_queries(project_id, environment_id, favorite DESC, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sql_saved_queries_name_scope
  ON sql_saved_queries(project_id, environment_id, user_id, lower(name));
