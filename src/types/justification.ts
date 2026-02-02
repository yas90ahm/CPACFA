/**
 * Justification service types: IRAC, RAG, citations, audit defense.
 */

/** Issue-Rule-Analysis-Conclusion (IRAC) legal format */
export interface IRACJustification {
  issue: string;
  rule: string;
  analysis: string;
  conclusion: string;
  /** [Source] tag: specific section of accounting code */
  source: string;
}

/** Single chunk from FASB/IFRS handbook (RAG) */
export interface HandbookChunk {
  id: string;
  framework: 'FASB' | 'IFRS';
  citation: string;
  section?: string;
  text: string;
}

/** RAG query result */
export interface RAGResult {
  chunks: HandbookChunk[];
  query: string;
}

/** Full justification response with IRAC and citation */
export interface JustificationResponse {
  irac: IRACJustification;
  /** Raw citation for [Source] tag, e.g. "FASB ASC 350-40-25-2" */
  sourceTag: string;
  /** Full formatted response (IRAC + [Source]) */
  formatted: string;
}

/** Stored justification for a period (audit defense export) */
export interface StoredJustification {
  id: string;
  question: string;
  response: JustificationResponse;
  timestamp: string;
  periodStart?: string;
  periodEnd?: string;
}

/** Vector / RAG store interface (implement with real DB or in-memory) */
export interface JustificationRAGStore {
  query(query: string, options?: { topK?: number; framework?: 'FASB' | 'IFRS' }): Promise<RAGResult>;
}
