-- Multi-currency GL support: original currency amounts, exchange rates table,
-- and functional_currency on entity settings.

-- 1. Add multi-currency columns to general_ledger
ALTER TABLE core.general_ledger
  ADD COLUMN IF NOT EXISTS original_currency VARCHAR(3) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS original_debit NUMERIC(20,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS original_credit NUMERIC(20,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(20,8) DEFAULT NULL;

COMMENT ON COLUMN core.general_ledger.original_currency IS 'ISO currency code of the original transaction (NULL = same as functional currency)';
COMMENT ON COLUMN core.general_ledger.original_debit IS 'Debit in original currency before translation (NULL if no translation)';
COMMENT ON COLUMN core.general_ledger.original_credit IS 'Credit in original currency before translation (NULL if no translation)';
COMMENT ON COLUMN core.general_ledger.exchange_rate IS 'Exchange rate used: 1 original_currency = rate * functional_currency (NULL if no translation)';

-- 2. Exchange rates table (per session, per currency pair)
CREATE TABLE IF NOT EXISTS core.period_exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  close_session_id UUID NOT NULL,
  from_currency VARCHAR(3) NOT NULL,
  to_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  rate_type VARCHAR(20) NOT NULL DEFAULT 'closing',
  rate NUMERIC(20,8) NOT NULL CHECK (rate > 0),
  effective_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE(tenant_id, close_session_id, from_currency, to_currency, rate_type)
);

CREATE INDEX IF NOT EXISTS idx_period_exchange_rates_session
  ON core.period_exchange_rates(tenant_id, close_session_id);

COMMENT ON TABLE core.period_exchange_rates IS 'Exchange rates per close session for multi-currency GL translation';

-- 3. Add functional_currency to entity settings
ALTER TABLE tenant_entity_settings
  ADD COLUMN IF NOT EXISTS functional_currency VARCHAR(3) DEFAULT 'USD';

COMMENT ON COLUMN tenant_entity_settings.functional_currency IS 'Functional (reporting) currency for financial statements — defaults to USD';
