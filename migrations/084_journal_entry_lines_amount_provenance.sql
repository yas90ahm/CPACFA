-- Persist amount provenance on journal entry lines for durable audit trail.
-- Populated for all JE lines created through HITL or JE flows.

ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS amount_provenance JSONB;

COMMENT ON COLUMN journal_entry_lines.amount_provenance IS 'Amount provenance: { kind: ledger_exact | engine_calculation | human_entered, ... }. Required for non-zero amounts at API; persisted for audit binder.';
