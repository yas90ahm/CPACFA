-- Control DB: durable job queue for ingestion, agentic, and statement generation.
-- Worker polls, locks, executes, retries with backoff, dead-letters after max_attempts.

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  last_error TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  worker_id TEXT,
  run_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT jobs_status_check CHECK (status IN ('pending', 'locked', 'completed', 'failed', 'dead'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency_key ON jobs (idempotency_key) WHERE idempotency_key IS NOT NULL AND status = 'completed';
CREATE INDEX IF NOT EXISTS idx_jobs_poll ON jobs (status, run_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs (type);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at);
