-- A resource identifier can be a complete storage object path.  It is not
-- necessarily a control-plane UUID, so it must not be truncated at 64 chars.
ALTER TABLE audit_logs
  ALTER COLUMN resource_id TYPE TEXT;
