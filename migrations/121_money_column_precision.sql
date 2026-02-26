-- Standardize money columns to NUMERIC(20,2) precision.
-- Bare NUMERIC allows arbitrary precision which can cause rounding inconsistencies.

-- journal_entry_lines: debit, credit
ALTER TABLE journal_entry_lines
  ALTER COLUMN debit TYPE NUMERIC(20,2),
  ALTER COLUMN credit TYPE NUMERIC(20,2);

-- statement_lines: amount
ALTER TABLE statement_lines
  ALTER COLUMN amount TYPE NUMERIC(20,2);

-- recon_items: amount
ALTER TABLE recon_items
  ALTER COLUMN amount TYPE NUMERIC(20,2);

-- issue_items: impact_pl, impact_bs, impact_cash, materiality_estimate, materiality_threshold_used
ALTER TABLE issue_items
  ALTER COLUMN impact_pl TYPE NUMERIC(20,2),
  ALTER COLUMN impact_bs TYPE NUMERIC(20,2),
  ALTER COLUMN impact_cash TYPE NUMERIC(20,2),
  ALTER COLUMN materiality_estimate TYPE NUMERIC(20,2),
  ALTER COLUMN materiality_threshold_used TYPE NUMERIC(20,2);

-- intercompany_reconciliation_results: matched_amount, balance_a, balance_b, variance
ALTER TABLE intercompany_reconciliation_results
  ALTER COLUMN matched_amount TYPE NUMERIC(20,2),
  ALTER COLUMN balance_a TYPE NUMERIC(20,2),
  ALTER COLUMN balance_b TYPE NUMERIC(20,2),
  ALTER COLUMN variance TYPE NUMERIC(20,2);

-- budget_version_lines: amount
ALTER TABLE budget_version_lines
  ALTER COLUMN amount TYPE NUMERIC(20,2);
