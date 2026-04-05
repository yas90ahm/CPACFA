-- ERP Mapping Profiles: per-connection field mapping configuration.
-- Templates (tenant_id='__system__') are built-in; tenant-specific profiles are cloned from templates.

CREATE TABLE IF NOT EXISTS erp_mapping_profiles (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id     TEXT NOT NULL,
  connection_id TEXT NOT NULL DEFAULT '__template__',
  provider      TEXT NOT NULL,
  profile_name  TEXT NOT NULL,
  data_type     TEXT NOT NULL CHECK (data_type IN ('trial_balance', 'journal_entry', 'chart_of_accounts')),
  is_template   BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    TEXT
);

CREATE INDEX IF NOT EXISTS idx_erp_mapping_profiles_tenant
  ON erp_mapping_profiles(tenant_id, connection_id);

CREATE INDEX IF NOT EXISTS idx_erp_mapping_profiles_provider_template
  ON erp_mapping_profiles(provider, is_template) WHERE is_template = TRUE;

CREATE TABLE IF NOT EXISTS erp_mapping_rules (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  profile_id        TEXT NOT NULL REFERENCES erp_mapping_profiles(id) ON DELETE CASCADE,
  source_field      TEXT NOT NULL,
  canonical_field   TEXT NOT NULL,
  transform_type    TEXT NOT NULL DEFAULT 'direct'
    CHECK (transform_type IN ('direct', 'decimal_coerce', 'date_parse', 'default_value',
                               'strip_format', 'nested_path', 'conditional', 'concatenate')),
  transform_config  JSONB,
  default_value     TEXT,
  is_required       BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_mapping_rules_profile
  ON erp_mapping_rules(profile_id, sort_order);
