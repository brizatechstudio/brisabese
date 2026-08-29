-- Persistent authentication state for the real-local runtime.

ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS phone VARCHAR(64);
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS provider VARCHAR(32) NOT NULL DEFAULT 'email';
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ;

ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64);
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS device_name VARCHAR(255);
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id VARCHAR(96) PRIMARY KEY, session_id VARCHAR(96) NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE, user_id VARCHAR(64) NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE, environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  family_id VARCHAR(96) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_session ON auth_refresh_tokens(session_id);

CREATE TABLE IF NOT EXISTS auth_verification_tokens (
  id VARCHAR(96) PRIMARY KEY, user_id VARCHAR(64) NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE, environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_password_reset_tokens (
  id VARCHAR(96) PRIMARY KEY, user_id VARCHAR(64) NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE, environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_settings (
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE, environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  require_email_verification BOOLEAN NOT NULL DEFAULT TRUE, allow_signups BOOLEAN NOT NULL DEFAULT TRUE, minimum_password_length INTEGER NOT NULL DEFAULT 8,
  require_mfa BOOLEAN NOT NULL DEFAULT FALSE, maximum_sessions INTEGER NOT NULL DEFAULT 10, session_lifetime_seconds INTEGER NOT NULL DEFAULT 2592000,
  jwt_access_lifetime_seconds INTEGER NOT NULL DEFAULT 900, refresh_token_lifetime_seconds INTEGER NOT NULL DEFAULT 2592000,
  PRIMARY KEY(project_id, environment_id)
);
CREATE TABLE IF NOT EXISTS auth_mfa_factors (
  id VARCHAR(96) PRIMARY KEY, user_id VARCHAR(64) NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE, environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL, secret_encrypted TEXT NOT NULL, verified_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_used_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS auth_mfa_recovery_codes (
  id VARCHAR(96) PRIMARY KEY, user_id VARCHAR(64) NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  factor_id VARCHAR(96) NOT NULL REFERENCES auth_mfa_factors(id) ON DELETE CASCADE, code_hash CHAR(64) NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
