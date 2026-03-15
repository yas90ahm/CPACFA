-- Renumbered from 149 to 172 to resolve duplicate prefix
-- pgvector extension and GAAP embeddings table for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier VARCHAR(20) NOT NULL DEFAULT 'tier1_global',
  tenant_id TEXT,
  session_id TEXT,
  framework VARCHAR(10),
  citation TEXT NOT NULL,
  section TEXT,
  chunk_text TEXT NOT NULL,
  -- Dimension must match the active EmbeddingProvider: local=64, OpenAI=1536
  embedding vector(64),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- IVFFlat index for cosine similarity (efficient at scale)
-- Note: IVFFlat requires training data; falls back to sequential scan when < 100 rows
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_vector
  ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_tier
  ON knowledge_embeddings (tier);

CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_tenant
  ON knowledge_embeddings (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_framework
  ON knowledge_embeddings (framework) WHERE framework IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_citation
  ON knowledge_embeddings (citation);
