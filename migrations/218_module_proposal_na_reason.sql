-- Module applicability: add not_applicable_reason for human-governed N/A decisions with auditable rationale.
-- Separate from skip_reason so each action type has its own traceable justification.
ALTER TABLE tenant_module_proposals ADD COLUMN IF NOT EXISTS not_applicable_reason TEXT;
