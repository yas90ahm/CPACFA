-- Migration 153: XBRL Full Taxonomy Integration.
-- Creates xbrl_taxonomy_elements table for the complete 2025 US GAAP taxonomy,
-- adds trigram indexes for text similarity search, and adds XBRL tracking
-- columns to coa_mapping_rules.

-- Enable trigram extension for text similarity search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS xbrl_taxonomy_elements (
  id TEXT PRIMARY KEY,
  element_name TEXT NOT NULL,
  label TEXT NOT NULL,
  documentation TEXT,
  balance_type TEXT CHECK (balance_type IN ('debit', 'credit', 'na')),
  period_type TEXT CHECK (period_type IN ('instant', 'duration', 'na')),
  abstract BOOLEAN DEFAULT false,
  statement TEXT,
  deprecated BOOLEAN DEFAULT false,
  taxonomy_version TEXT DEFAULT '2025',
  embedding vector(384),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xbrl_label_trgm ON xbrl_taxonomy_elements USING gin (label gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_xbrl_element_trgm ON xbrl_taxonomy_elements USING gin (element_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_xbrl_statement ON xbrl_taxonomy_elements (statement);
CREATE INDEX IF NOT EXISTS idx_xbrl_balance ON xbrl_taxonomy_elements (balance_type);
CREATE INDEX IF NOT EXISTS idx_xbrl_not_abstract ON xbrl_taxonomy_elements (abstract) WHERE abstract = false;

-- Add XBRL foreign key reference to Sabit taxonomy lines (if not already present from 152)
ALTER TABLE fs_taxonomy_lines ADD COLUMN IF NOT EXISTS xbrl_element_id TEXT;

-- Add XBRL tracking to mapping rules
ALTER TABLE coa_mapping_rules ADD COLUMN IF NOT EXISTS xbrl_element_id TEXT;
ALTER TABLE coa_mapping_rules ADD COLUMN IF NOT EXISTS classification_confidence NUMERIC(5,4);
ALTER TABLE coa_mapping_rules ADD COLUMN IF NOT EXISTS classification_source TEXT
  CHECK (classification_source IN ('xbrl_search', 'ai_classifier', 'manual', 'prior_period'));
