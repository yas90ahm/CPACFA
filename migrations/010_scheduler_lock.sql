-- Control DB: distributed lock for ingestion scheduler so only one instance runs per interval.
-- All API instances use the same control DB; lock is time-based to avoid stuck lock if instance crashes.

CREATE TABLE IF NOT EXISTS scheduler_locks (
  id TEXT PRIMARY KEY,
  instance_id TEXT,
  acquired_at TIMESTAMPTZ,
  interval_ms INTEGER NOT NULL DEFAULT 300000
);

INSERT INTO scheduler_locks (id, instance_id, acquired_at, interval_ms)
VALUES ('ingestion_scheduler', NULL, NULL, 300000)
ON CONFLICT (id) DO NOTHING;
