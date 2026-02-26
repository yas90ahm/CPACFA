-- Additional indexes for GL query performance (095 has base indexes).
-- TB derivation: covering index for tenant+period+account aggregation.

CREATE INDEX IF NOT EXISTS idx_gl_tb_covering
  ON core.general_ledger(tenant_id, period_label, account_code)
  INCLUDE (debit, credit);

COMMENT ON INDEX core.idx_gl_tb_covering IS 'Performance: TB derivation aggregates by account; covering index avoids heap lookups';
