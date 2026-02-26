-- Extend audit_ledger with explicit before/after state for state-change audit trail.
-- deterministic_flag_snapshot remains for backward compatibility; before_state and after_state
-- capture the relevant object state at the moment of change.
ALTER TABLE audit_ledger
  ADD COLUMN IF NOT EXISTS before_state JSONB,
  ADD COLUMN IF NOT EXISTS after_state JSONB;
