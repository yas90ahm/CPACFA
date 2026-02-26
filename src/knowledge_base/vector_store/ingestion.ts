/**
 * RAG Vector Store — Data ingestion pipeline.
 * Chunks PDF-derived text and company Internal Control documents; tags by Standard Type and Level of Authority.
 * Tenant-scoped: all chunks are stored under tenantId namespace.
 */

import type { IngestDocumentInput, IngestChunkInput, RAGChunk, StandardType, LevelOfAuthority } from './types.js';
import { chunkTextByParagraphs, chunkPages } from './chunker.js';
import { addChunk, addChunks } from './store.js';

const DEFAULT_MAX_CHUNK_SIZE = 1200;

/**
 * Ingest a document for a tenant: chunk by paragraph/size, tag with metadata, add to store.
 */
export function ingestDocument(tenantId: string, input: IngestDocumentInput): RAGChunk[] {
  const maxChunkSize = input.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
  const { documentTitle, standardType, levelOfAuthority, sourceDocumentId } = input;
  const chunks: IngestChunkInput[] = [];

  if (input.pages && input.pages.length > 0) {
    const pageChunks = chunkPages(input.pages, maxChunkSize);
    for (const { pageNumber, text } of pageChunks) {
      chunks.push({
        text,
        documentTitle,
        pageNumber,
        standardType,
        levelOfAuthority,
        sourceDocumentId,
      });
    }
  } else if (input.fullText) {
    const textChunks = chunkTextByParagraphs(input.fullText, maxChunkSize);
    for (let i = 0; i < textChunks.length; i++) {
      chunks.push({
        text: textChunks[i],
        documentTitle,
        pageNumber: i + 1,
        standardType,
        levelOfAuthority,
        sourceDocumentId,
      });
    }
  }

  return addChunks(tenantId, chunks);
}

/**
 * Ingest a single chunk for a tenant (e.g. from external PDF pipeline).
 */
export function ingestChunk(tenantId: string, input: IngestChunkInput): RAGChunk {
  return addChunk(tenantId, input);
}

/**
 * Ingest raw text from a PDF or handbook for a tenant.
 * Assigns page 1 if no page info; use ingestDocument with pages for page-aware ingestion.
 */
export function ingestRawText(
  tenantId: string,
  text: string,
  documentTitle: string,
  standardType: StandardType,
  levelOfAuthority: LevelOfAuthority,
  options?: { sourceDocumentId?: string; maxChunkSize?: number }
): RAGChunk[] {
  return ingestDocument(tenantId, {
    documentTitle,
    standardType,
    levelOfAuthority,
    fullText: text,
    sourceDocumentId: options?.sourceDocumentId,
    maxChunkSize: options?.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE,
  });
}
