-- Immutable audit trail: agentic reasoning (Thought + Tool) per supervisor session.
-- Each entry captures: raw data seen, CPA/CFA rule applied, deterministic verification (V1–V3b).

ALTER TABLE tenant_supervisor_sessions
  ADD COLUMN IF NOT EXISTS reasoning_logs JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN tenant_supervisor_sessions.reasoning_logs IS
  'Append-only log of agent steps: thought/tool, rawDataSeen, ruleApplied, verificationResult (V1–V3b).';
