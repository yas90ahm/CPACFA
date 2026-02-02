/**
 * RAG Vector Store — Types for Intelligent Context.
 * Metadata: Standard Type (GAAP vs IFRS), Level of Authority.
 * Citation: document title + page number for every cited rule.
 */

/** Standard type for tagging chunks (e.g. GAAP vs IFRS). */
export type StandardType = 'GAAP' | 'IFRS';

/** Level of authority for the source document. */
export type LevelOfAuthority =
  | 'authoritative'   // e.g. FASB Codification, IASB Standards
  | 'interpretive'    // e.g. ASU, IFRIC
  | 'company_policy'  // Internal control / company-specific
  | 'precedent';      // Prior company treatment / history

/** A single chunk in the RAG store with full metadata for citation. */
export interface RAGChunk {
  id: string;
  /** Chunk text (searchable). */
  text: string;
  /** Document title (required for citation). */
  documentTitle: string;
  /** Page number in the source document (required for citation). */
  pageNumber: number;
  /** Standard type (GAAP vs IFRS). */
  standardType: StandardType;
  /** Level of authority. */
  levelOfAuthority: LevelOfAuthority;
  /** Optional section/citation code (e.g. ASC 606-10-25-1). */
  citationCode?: string;
  /** Optional source file or document id. */
  sourceDocumentId?: string;
  /** When ingested (ISO). */
  ingestedAt: string;
}

/** Citation returned for every cited rule: document title + page number. */
export interface ChunkCitation {
  documentTitle: string;
  pageNumber: number;
  standardType: StandardType;
  levelOfAuthority: LevelOfAuthority;
  citationCode?: string;
  excerpt: string;
  chunkId: string;
}

/** Result of a RAG query: chunks plus formatted citations. */
export interface RAGQueryResult {
  query: string;
  chunks: RAGChunk[];
  /** Citations with document title and page number for every rule (for bot response). */
  citations: ChunkCitation[];
}

/** Options for precedent/retrieval query. */
export interface RAGQueryOptions {
  standardType?: StandardType;
  levelOfAuthority?: LevelOfAuthority;
  /** Prefer company precedent (internal control / company_policy). */
  preferPrecedent?: boolean;
  topK?: number;
}

/** Input for ingesting a single chunk (e.g. from PDF pipeline). */
export interface IngestChunkInput {
  text: string;
  documentTitle: string;
  pageNumber: number;
  standardType: StandardType;
  levelOfAuthority: LevelOfAuthority;
  citationCode?: string;
  sourceDocumentId?: string;
}

/** Input for ingesting a document (raw text or page-by-page). */
export interface IngestDocumentInput {
  documentTitle: string;
  standardType: StandardType;
  levelOfAuthority: LevelOfAuthority;
  /** Full text to chunk, or page-by-page text for page-aware chunking. */
  pages?: { pageNumber: number; text: string }[];
  fullText?: string;
  sourceDocumentId?: string;
  /** Max characters per chunk when splitting fullText. */
  maxChunkSize?: number;
}
