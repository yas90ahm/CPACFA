-- Migration 175: Missing foreign keys and indexes identified by codebase audit.

-- PE Hierarchy: self-referencing FK + parent index for tree traversal
DO $$ BEGIN
  ALTER TABLE tenant_pe_hierarchy
    ADD CONSTRAINT fk_pe_hierarchy_parent
    FOREIGN KEY (parent_pe_line_id) REFERENCES tenant_pe_hierarchy(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_pe_hierarchy_parent ON tenant_pe_hierarchy(parent_pe_line_id);

-- Recon Source Data: FK to reconciliations
DO $$ BEGIN
  ALTER TABLE tenant_recon_source_data
    ADD CONSTRAINT fk_recon_source_data_recon
    FOREIGN KEY (recon_id) REFERENCES tenant_period_reconciliations(recon_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Period Budgets: FK to close_sessions with CASCADE
DO $$ BEGIN
  ALTER TABLE tenant_period_budgets
    ADD CONSTRAINT fk_period_budgets_session
    FOREIGN KEY (close_session_id) REFERENCES close_sessions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- EBITDA Addbacks: FK to close_sessions with CASCADE
DO $$ BEGIN
  ALTER TABLE tenant_ebitda_addbacks
    ADD CONSTRAINT fk_ebitda_addbacks_session
    FOREIGN KEY (close_session_id) REFERENCES close_sessions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Knowledge Embeddings: prevent duplicate tier1_global entries for same citation
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_embeddings_unique_global
    ON knowledge_embeddings(tier, citation)
    WHERE tenant_id IS NULL AND tier = 'tier1_global';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
