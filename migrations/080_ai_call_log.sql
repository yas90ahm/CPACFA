-- AI call log: every LLM request/response for audit and debugging (Sovereign CPA Engine).

CREATE TABLE IF NOT EXISTS ai_call_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  pillar TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  request_json JSONB NOT NULL,
  response_raw TEXT,
  response_json JSONB,
  ok BOOLEAN NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_call_log_tenant_created
  ON ai_call_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_call_log_pillar
  ON ai_call_log(tenant_id, pillar);
