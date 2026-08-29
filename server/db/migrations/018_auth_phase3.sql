-- BrisaBase Phase 3: complete end-user authentication and security controls.

ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS custom_claims JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_unique_phone
  ON auth_users(project_id, environment_id, phone) WHERE phone IS NOT NULL;

ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS auth_method VARCHAR(32) NOT NULL DEFAULT 'password';
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMPTZ;

ALTER TABLE auth_settings ADD COLUMN IF NOT EXISTS magic_link_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE auth_settings ADD COLUMN IF NOT EXISTS email_otp_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE auth_settings ADD COLUMN IF NOT EXISTS phone_otp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE auth_settings ADD COLUMN IF NOT EXISTS anonymous_auth_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE auth_settings ADD COLUMN IF NOT EXISTS passkeys_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE auth_settings ADD COLUMN IF NOT EXISTS password_require_uppercase BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE auth_settings ADD COLUMN IF NOT EXISTS password_require_lowercase BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE auth_settings ADD COLUMN IF NOT EXISTS password_require_number BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE auth_settings ADD COLUMN IF NOT EXISTS password_require_symbol BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE auth_settings ADD COLUMN IF NOT EXISTS otp_lifetime_seconds INTEGER NOT NULL DEFAULT 600;
ALTER TABLE auth_settings ADD COLUMN IF NOT EXISTS login_attempt_limit INTEGER NOT NULL DEFAULT 10;
ALTER TABLE auth_settings ADD COLUMN IF NOT EXISTS login_lockout_seconds INTEGER NOT NULL DEFAULT 900;
ALTER TABLE auth_settings ADD COLUMN IF NOT EXISTS allowed_redirect_origins JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS auth_identities (
  id VARCHAR(96) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  provider_email VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, environment_id, provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id);

CREATE TABLE IF NOT EXISTS auth_one_time_codes (
  id VARCHAR(96) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  user_id VARCHAR(64) REFERENCES auth_users(id) ON DELETE CASCADE,
  purpose VARCHAR(32) NOT NULL,
  destination VARCHAR(320) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  redirect_url TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_otc_lookup ON auth_one_time_codes(project_id, environment_id, purpose, destination, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_passkeys (
  id VARCHAR(96) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  public_key_jwk JSONB NOT NULL,
  sign_count BIGINT NOT NULL DEFAULT 0,
  transports JSONB NOT NULL DEFAULT '[]'::jsonb,
  device_name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(project_id, environment_id, credential_id)
);
CREATE INDEX IF NOT EXISTS idx_auth_passkeys_user ON auth_passkeys(user_id);

CREATE TABLE IF NOT EXISTS auth_custom_roles (
  id VARCHAR(96) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  claims JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, environment_id, name)
);
