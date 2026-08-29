-- MIGRATION 006: STORAGE ENGINE METADATA
-- Object bytes are held by a StorageAdapter; this control database only stores metadata.

CREATE TABLE IF NOT EXISTS storage_buckets (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  name VARCHAR(63) NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  file_size_limit BIGINT NOT NULL,
  allowed_mime_types JSONB,
  versioning_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, environment_id, name)
);

CREATE TABLE IF NOT EXISTS storage_objects (
  id VARCHAR(64) PRIMARY KEY,
  bucket_id VARCHAR(64) NOT NULL REFERENCES storage_buckets(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  extension VARCHAR(32),
  mime_type VARCHAR(255) NOT NULL,
  size_bytes BIGINT NOT NULL,
  etag VARCHAR(255),
  checksum_sha256 CHAR(64),
  storage_key TEXT NOT NULL UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  cache_control TEXT,
  content_disposition VARCHAR(32) NOT NULL DEFAULT 'inline',
  created_by VARCHAR(64),
  updated_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(bucket_id, path)
);

CREATE TABLE IF NOT EXISTS storage_object_versions (
  id VARCHAR(64) PRIMARY KEY,
  object_id VARCHAR(64) NOT NULL REFERENCES storage_objects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  checksum_sha256 CHAR(64),
  created_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(object_id, version)
);

CREATE TABLE IF NOT EXISTS storage_multipart_uploads (
  id VARCHAR(64) PRIMARY KEY,
  bucket_id VARCHAR(64) NOT NULL REFERENCES storage_buckets(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS storage_policies (
  id VARCHAR(64) PRIMARY KEY,
  bucket_id VARCHAR(64) NOT NULL REFERENCES storage_buckets(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  role VARCHAR(64) NOT NULL,
  operation VARCHAR(32) NOT NULL,
  path_pattern TEXT NOT NULL DEFAULT '*',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS storage_usage (
  project_id VARCHAR(64) NOT NULL,
  environment_id VARCHAR(64) NOT NULL,
  bucket_id VARCHAR(64),
  total_files BIGINT NOT NULL DEFAULT 0,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  uploaded_bytes BIGINT NOT NULL DEFAULT 0,
  downloaded_bytes BIGINT NOT NULL DEFAULT 0,
  uploads_count BIGINT NOT NULL DEFAULT 0,
  downloads_count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, environment_id, bucket_id)
);

CREATE INDEX IF NOT EXISTS idx_storage_buckets_scope ON storage_buckets(project_id, environment_id);
CREATE INDEX IF NOT EXISTS idx_storage_objects_bucket_path ON storage_objects(bucket_id, path);
CREATE INDEX IF NOT EXISTS idx_storage_objects_scope ON storage_objects(project_id, environment_id);
