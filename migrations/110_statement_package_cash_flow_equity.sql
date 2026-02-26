-- Allow cash_flow and equity statement types in statement_lines (MVP cleanup Part 2).
ALTER TABLE statement_lines DROP CONSTRAINT IF EXISTS chk_statement_lines_statement;
ALTER TABLE statement_lines ADD CONSTRAINT chk_statement_lines_statement
  CHECK (statement IN ('balance_sheet', 'profit_and_loss', 'cash_flow', 'equity'));

-- Store cross-statement validation results (net income tie, cash tie, RE tie).
ALTER TABLE statement_packages ADD COLUMN IF NOT EXISTS validation_results JSONB;
