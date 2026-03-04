-- Migration 146: Consolidation and FX Translation config persistence
-- Stores user-entered configuration so it survives page refresh.

CREATE TABLE IF NOT EXISTS consolidation_configs (
  id              TEXT PRIMARY KEY DEFAULT 'cfg_' || gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL,
  close_session_id TEXT NOT NULL,
  entities        JSONB NOT NULL DEFAULT '[]'::jsonb,
  elimination_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  reporting_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  period_label    TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, close_session_id)
);

CREATE TABLE IF NOT EXISTS fx_translation_configs (
  id              TEXT PRIMARY KEY DEFAULT 'fxcfg_' || gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL,
  close_session_id TEXT NOT NULL,
  mode            VARCHAR(20) NOT NULL DEFAULT 'translate',
  source_currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  reporting_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  closing_rate    NUMERIC(20,8),
  average_rate    NUMERIC(20,8),
  historical_rate NUMERIC(20,8),
  balance_lines   JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, close_session_id)
);
