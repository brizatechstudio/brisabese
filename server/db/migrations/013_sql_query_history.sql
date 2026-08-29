CREATE TABLE IF NOT EXISTS sql_query_history (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL,
  query TEXT NOT NULL,
  execution_time_ms INTEGER NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL CHECK (status IN ('success', 'error')),
  error_message TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sql_query_history_scope
  ON sql_query_history(project_id, environment_id, executed_at DESC);
