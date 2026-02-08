/**
 * RAG Vector Store — Intelligent Context.
 * Data ingestion (chunk PDF handbooks & Internal Control docs), metadata tagging (Standard Type, Level of Authority),
 * retrieval (precedent for CPA), citation (document title + page number for every rule).
 */

export * from './types.js';
export * from './chunker.js';
export { addChunk, addChunks, query, queryForPrecedent, getById, listChunks, clearStore, clearTenant, resolveTenantId, DEFAULT_TENANT_ID } from './store.js';
export * from './citation.js';
export * from './ingestion.js';
export * from './retrieval.js';
