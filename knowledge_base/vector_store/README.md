# RAG Vector Store — Intelligent Context

RAG (Retrieval-Augmented Generation) engine for **Intelligent Context**: ingestion of accounting handbooks and company Internal Control documents, metadata tagging, precedent retrieval for the CPA agent, and **citation with document title and page number** for every cited rule.

## 1. Data Ingestion

- **Pipeline**: Chunk PDF accounting handbooks and company-specific **Internal Control** documents.
- **Implementation**: `src/knowledge_base/vector_store/`
  - **chunker.ts**: Chunk by paragraph or fixed size; page-aware chunking for PDF-derived text.
  - **ingestion.ts**: `ingestDocument()` (fullText or pages), `ingestChunk()`, `ingestRawText()`.
- **API**:
  - **POST /api/vector-store/ingest** — Body: `document` (fullText/pages, documentTitle, standardType, levelOfAuthority) or `chunks[]`.
  - **POST /api/vector-store/ingest-pdf** — Multipart: `file` (PDF), `documentTitle`, `standardType`, `levelOfAuthority`. Requires `pdf-parse` for PDF text extraction (`npm install pdf-parse`).

## 2. Metadata Tagging

Every chunk is tagged by:

- **Standard Type**: `GAAP` | `IFRS`.
- **Level of Authority**: `authoritative` | `interpretive` | `company_policy` | `precedent`.

Use these when ingesting (e.g. handbook = GAAP + authoritative; internal control doc = GAAP + company_policy).

## 3. Retrieval Strategy

- When the **CPA agent** processes an entry, it **must first query this store** to see if a similar **Precedent** exists in the company’s history.
- **API**:
  - **POST /api/vector-store/query** — Body: `query`, `preferPrecedent?`, `standardType?`, `levelOfAuthority?`, `topK?`. Returns chunks and **citations** (document title + page number).
  - **POST /api/vector-store/precedent** — Body: `entryDescription`, `topK?`, `standardType?`. Looks up similar precedent (company_policy / precedent) and returns citations.

## 4. Citation

- The bot **must** return the **specific page number** and **document title** for every rule it cites.
- Every query response includes:
  - **citations**: Array of `{ documentTitle, pageNumber, standardType, levelOfAuthority, citationCode?, excerpt }`.
  - **citedRulesForBot**: Preformatted text for the bot to include in its response (each rule with document title and page number).

## Implementation

| Path | Purpose |
|------|--------|
| `src/knowledge_base/vector_store/types.ts` | StandardType, LevelOfAuthority, RAGChunk, ChunkCitation, IngestDocumentInput. |
| `src/knowledge_base/vector_store/chunker.ts` | chunkTextByParagraphs, chunkTextBySize, chunkPages. |
| `src/knowledge_base/vector_store/store.ts` | In-memory store; addChunk, addChunks, query, queryForPrecedent. |
| `src/knowledge_base/vector_store/citation.ts` | formatCitation, formatCitationShort, formatCitationForResponse, buildCitations. |
| `src/knowledge_base/vector_store/ingestion.ts` | ingestDocument, ingestChunk, ingestRawText. |
| `src/knowledge_base/vector_store/retrieval.ts` | retrieve, retrievePrecedentForEntry, formatCitedRulesForBot. |
| `src/routes/vector_store.ts` | API routes; mounted at `/api/vector-store`. |

## Optional: PDF extraction

For **POST /api/vector-store/ingest-pdf** to work, install:

```bash
npm install pdf-parse
```

If `pdf-parse` is not installed, the endpoint returns `501` with a message to install it.
