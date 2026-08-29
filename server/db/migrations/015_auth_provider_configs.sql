-- OAuth provider configuration is tenant and environment scoped. Secrets remain encrypted at rest.
CREATE TABLE IF NOT EXISTS auth_provider_configs (
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  name VARCHAR(128) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  client_id TEXT,
  client_secret_encrypted TEXT,
  redirect_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, environment_id, provider)
);
