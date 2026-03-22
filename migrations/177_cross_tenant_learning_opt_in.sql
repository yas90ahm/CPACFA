-- Migration 177: Cross-tenant learning opt-in toggle.
-- Off by default. Tenant must explicitly opt in before their correction
-- patterns are shared anonymously with other tenants.

ALTER TABLE tenant_financial_config
  ADD COLUMN IF NOT EXISTS cross_tenant_learning_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN tenant_financial_config.cross_tenant_learning_enabled IS
  'When TRUE, anonymized mapping correction patterns from this tenant are shared '
  'with other tenants via mapping_pattern_signals. Off by default. '
  'Requires explicit tenant opt-in and legal disclosure in terms of service.';
