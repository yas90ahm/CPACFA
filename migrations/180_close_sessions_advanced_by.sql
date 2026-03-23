-- Gap 4: Track who advanced session to UNDER_REVIEW for SoD enforcement
ALTER TABLE close_sessions ADD COLUMN IF NOT EXISTS advanced_to_review_by TEXT;
ALTER TABLE close_sessions ADD COLUMN IF NOT EXISTS advanced_to_review_at TIMESTAMPTZ;

-- Tenant setting: allow same user to advance and certify (default false for SoD compliance)
ALTER TABLE tenant_entity_settings
  ADD COLUMN IF NOT EXISTS allow_same_user_certify BOOLEAN NOT NULL DEFAULT false;
