-- BrisaBase platform completion: Preview DB, Static Hosting and Messaging.
-- All records are explicitly tenant scoped. Public/data-plane routes must never
-- accept organization/project/environment identity from these tables without an
-- authenticated gateway resolving the same scope first.

CREATE TABLE IF NOT EXISTS preview_environments (
  id varchar(80) PRIMARY KEY,
  organization_id varchar(80) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id varchar(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_environment_id varchar(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  preview_environment_id varchar(160) NOT NULL UNIQUE REFERENCES project_environments(id) ON DELETE CASCADE,
  branch_name varchar(160) NOT NULL,
  include_data boolean NOT NULL DEFAULT false,
  status varchar(32) NOT NULL DEFAULT 'creating',
  expires_at timestamptz,
  created_by varchar(160),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('creating','ready','failed','deleting','deleted','expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS preview_environments_active_branch_idx
  ON preview_environments(project_id, lower(branch_name))
  WHERE status IN ('creating','ready');
CREATE INDEX IF NOT EXISTS preview_environments_scope_idx
  ON preview_environments(organization_id, project_id, source_environment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS preview_environments_expiry_idx
  ON preview_environments(expires_at)
  WHERE expires_at IS NOT NULL AND status='ready';

CREATE TABLE IF NOT EXISTS hosting_sites (
  id varchar(80) PRIMARY KEY,
  organization_id varchar(80) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id varchar(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id varchar(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  slug varchar(100) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'active',
  active_deployment_id varchar(80),
  custom_domain varchar(255),
  created_by varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, environment_id, slug),
  CHECK (status IN ('active','disabled'))
);

CREATE TABLE IF NOT EXISTS hosting_deployments (
  id varchar(80) PRIMARY KEY,
  site_id varchar(80) NOT NULL REFERENCES hosting_sites(id) ON DELETE CASCADE,
  organization_id varchar(80) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id varchar(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id varchar(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'uploading',
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  file_count integer NOT NULL DEFAULT 0,
  size_bytes bigint NOT NULL DEFAULT 0,
  created_by varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  UNIQUE(site_id, version),
  CHECK (status IN ('uploading','ready','active','failed','superseded'))
);

ALTER TABLE hosting_sites
  DROP CONSTRAINT IF EXISTS hosting_sites_active_deployment_fk;
ALTER TABLE hosting_sites
  ADD CONSTRAINT hosting_sites_active_deployment_fk
  FOREIGN KEY (active_deployment_id) REFERENCES hosting_deployments(id) ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS hosting_sites_scope_idx
  ON hosting_sites(organization_id, project_id, environment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS hosting_deployments_site_idx
  ON hosting_deployments(site_id, version DESC);

CREATE TABLE IF NOT EXISTS messaging_devices (
  id varchar(80) PRIMARY KEY,
  organization_id varchar(80) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id varchar(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id varchar(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  user_id varchar(160),
  provider varchar(32) NOT NULL,
  platform varchar(32) NOT NULL,
  token_hash varchar(128) NOT NULL,
  token_encrypted text NOT NULL,
  locale varchar(32),
  timezone varchar(80),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(32) NOT NULL DEFAULT 'active',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, environment_id, token_hash),
  CHECK (provider IN ('fcm','webpush')),
  CHECK (platform IN ('web','android','ios')),
  CHECK (status IN ('active','invalid','disabled'))
);

CREATE INDEX IF NOT EXISTS messaging_devices_user_idx
  ON messaging_devices(project_id, environment_id, user_id, status);

CREATE TABLE IF NOT EXISTS messaging_messages (
  id varchar(80) PRIMARY KEY,
  organization_id varchar(80) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id varchar(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id varchar(160) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  created_by varchar(160),
  title varchar(255),
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(32) NOT NULL DEFAULT 'queued',
  provider varchar(32),
  attempted_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_message text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('queued','sending','sent','partial','failed','cancelled'))
);

CREATE INDEX IF NOT EXISTS messaging_messages_scope_idx
  ON messaging_messages(organization_id, project_id, environment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messaging_messages_queue_idx
  ON messaging_messages(status, scheduled_at)
  WHERE status='queued';
