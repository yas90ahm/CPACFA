-- Renumbered from 149 to 172 to resolve duplicate prefix
-- pgvector extension and GAAP embeddings table for semantic search
-- Gracefully skips if pgvector extension is not available (e.g. Cloud SQL without it enabled)
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension not available — skipping knowledge_embeddings table creation';
    RETURN;
  END;

  CREATE TABLE IF NOT EXISTS knowledge_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier VARCHAR(20) NOT NULL DEFAULT 'tier1_global',
    tenant_id TEXT,
    session_id TEXT,
    framework VARCHAR(10),
    citation TEXT NOT NULL,
    section TEXT,
    chunk_text TEXT NOT NULL,
    embedding vector(64),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_tier
    ON knowledge_embeddings (tier);

  CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_tenant
    ON knowledge_embeddings (tenant_id) WHERE tenant_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_framework
    ON knowledge_embeddings (framework) WHERE framework IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_citation
    ON knowledge_embeddings (citation);

  -- IVFFlat index for cosine similarity
  BEGIN
    CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_vector
      ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'IVFFlat index creation skipped (requires training data or extension support)';
  END;
END
$$;
