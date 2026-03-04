-- Migration 137: Mapping auto-accept settings and suggestion tracking
-- Allows auto-accepting AI COA suggestions above a confidence threshold.

ALTER TABLE tenant_entity_settings
  ADD COLUMN IF NOT EXISTS mapping_confidence_threshold NUMERIC(5,4) DEFAULT 0.95,
  ADD COLUMN IF NOT EXISTS mapping_auto_accept_enabled BOOLEAN DEFAULT FALSE;

ALTER TABLE ai_coa_suggestions
  ADD COLUMN IF NOT EXISTS auto_accepted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_accepted_at TIMESTAMPTZ;
