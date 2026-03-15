-- Migration 149: Add observability columns to ai_call_log
-- Enables latency tracking, token accounting, and cost estimation per AI call.

ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS latency_ms INTEGER;
ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS input_tokens INTEGER;
ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS output_tokens INTEGER;
ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(10,6);
