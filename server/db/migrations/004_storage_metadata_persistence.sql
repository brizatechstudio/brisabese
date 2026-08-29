CREATE TABLE IF NOT EXISTS storage_buckets (
  id VARCHAR(64) PRIMARY KEY, project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE, name VARCHAR(63) NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE, file_size_limit BIGINT NOT NULL DEFAULT 104857600, allowed_mime_types JSONB,
  versioning_enabled BOOLEAN NOT NULL DEFAULT FALSE, created_by VARCHAR(64), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, environment_id, name)
);
CREATE TABLE IF NOT EXISTS storage_objects (
  id VARCHAR(64) PRIMARY KEY, bucket_id VARCHAR(64) NOT NULL REFERENCES storage_buckets(id) ON DELETE CASCADE,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE, environment_id VARCHAR(64) NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
  path TEXT NOT NULL, name TEXT NOT NULL, extension VARCHAR(32) NOT NULL, mime_type VARCHAR(255) NOT NULL, size BIGINT NOT NULL,
  etag VARCHAR(255), checksum CHAR(64), storage_key TEXT NOT NULL UNIQUE, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  cache_control TEXT, content_disposition VARCHAR(16) NOT NULL DEFAULT 'inline', version INTEGER NOT NULL DEFAULT 1,
  created_by VARCHAR(64), updated_by VARCHAR(64), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ, deleted_by VARCHAR(64), UNIQUE(bucket_id, path)
);
CREATE INDEX IF NOT EXISTS idx_storage_objects_bucket_path ON storage_objects(bucket_id, path) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS storage_object_versions (
  id VARCHAR(64) PRIMARY KEY, object_id VARCHAR(64) NOT NULL REFERENCES storage_objects(id) ON DELETE CASCADE,
  bucket_id VARCHAR(64) NOT NULL REFERENCES storage_buckets(id) ON DELETE CASCADE, project_id VARCHAR(64) NOT NULL, environment_id VARCHAR(64) NOT NULL,
  path TEXT NOT NULL, version INTEGER NOT NULL, storage_key TEXT NOT NULL UNIQUE, size BIGINT NOT NULL, mime_type VARCHAR(255) NOT NULL,
  etag VARCHAR(255), checksum CHAR(64), metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_by VARCHAR(64), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(object_id, version)
);
CREATE TABLE IF NOT EXISTS storage_usage (
  project_id VARCHAR(64) NOT NULL, environment_id VARCHAR(64) NOT NULL, uploaded_bytes BIGINT NOT NULL DEFAULT 0, downloaded_bytes BIGINT NOT NULL DEFAULT 0,
  uploads_count BIGINT NOT NULL DEFAULT 0, downloads_count BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(project_id, environment_id)
);
