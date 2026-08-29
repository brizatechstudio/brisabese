-- span_id is the same globally unique identifier persisted as `id`.
-- The composite constraint is redundant and can race with the lifecycle
-- upsert when start/end writes are scheduled concurrently.
ALTER TABLE observability_traces
  DROP CONSTRAINT IF EXISTS observability_traces_trace_id_span_id_key;
