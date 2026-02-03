-- HITL staging and supervisor session state in Postgres (for Pause/Resume and multi-instance).

-- HITL staging items (replace in-memory Map in hitl_orchestrator)
CREATE TABLE IF NOT EXISTS tenant_hitl_staging (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  proposed_action   TEXT NOT NULL,
  justification     TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  type              TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('journal_entry','policy_change','adjustment','flag_override','other')),
  amount            NUMERIC(18,4) NULL,
  payload           JSONB NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at       TIMESTAMPTZ NULL,
  approved_by       TEXT NULL,
  rejected_at       TIMESTAMPTZ NULL,
  rejected_reason   TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_hitl_staging_tenant_status
  ON tenant_hitl_staging(tenant_id, status);

-- Session state for Supervisor/agentic chat (conversation + pipeline context)
CREATE TABLE IF NOT EXISTS tenant_supervisor_sessions (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  user_id           TEXT NULL,
  mode              TEXT NOT NULL DEFAULT 'chat' CHECK (mode IN ('chat','pipeline')),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','failed')),
  pipeline_input_snapshot JSONB NULL,
  last_step         TEXT NULL,
  last_result_summary TEXT NULL,
  message_history   JSONB NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_supervisor_sessions_tenant_status
  ON tenant_supervisor_sessions(tenant_id, status);

-- Optional: session uploads (replace tier3_session Map) for persistence across restarts
CREATE TABLE IF NOT EXISTS tenant_session_uploads (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  session_id        TEXT NOT NULL,
  filename          TEXT NOT NULL,
  content_type      TEXT NULL,
  summary_text      TEXT NULL,
  metadata          JSONB NULL,
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_session_uploads_session
  ON tenant_session_uploads(tenant_id, session_id);
