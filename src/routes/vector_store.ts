/**
 * RAG Vector Store API — Intelligent Context.
 * Ingestion (PDF handbooks, Internal Control docs), metadata (Standard Type, Level of Authority),
 * retrieval (precedent for CPA), citation (document title + page number for every rule).
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import type { IngestChunkInput, IngestDocumentInput, StandardType, LevelOfAuthority } from '../knowledge_base/vector_store/index.js';
import {
  ingestDocument,
  ingestChunk,
  ingestRawText,
  retrieve,
  retrievePrecedentForEntry,
  formatCitedRulesForBot,
  listChunks,
} from '../knowledge_base/vector_store/index.js';
import { chunkTextByParagraphs } from '../knowledge_base/vector_store/chunker.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB

/** PDF-only upload: fileFilter + same size limit. */
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = (file.mimetype ?? '').toLowerCase() === 'application/pdf';
    if (ok) cb(null, true);
    else cb(new Error('Only PDF files are allowed (application/pdf)'));
  },
});

/** Magic bytes for PDF: %PDF */
function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

/** POST /api/vector-store/ingest — Ingest document or chunks (metadata: Standard Type, Level of Authority). */
router.post('/ingest', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      document?: IngestDocumentInput;
      chunks?: IngestChunkInput[];
    };
    if (body.document) {
      const chunks = ingestDocument(body.document);
      return res.json({ ok: true, message: 'Document ingested', count: chunks.length, chunks: chunks.map((c) => ({ id: c.id, pageNumber: c.pageNumber, documentTitle: c.documentTitle })) });
    }
    if (body.chunks && Array.isArray(body.chunks)) {
      const ingested = body.chunks.map((c) => ingestChunk(c));
      return res.json({ ok: true, message: 'Chunks ingested', count: ingested.length, chunks: ingested.map((c) => ({ id: c.id, pageNumber: c.pageNumber, documentTitle: c.documentTitle })) });
    }
    return res.status(400).json({ error: 'Provide "document" or "chunks" in body' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingest failed';
    return res.status(500).json({ error: 'Ingest error', message });
  }
});

/** POST /api/vector-store/ingest-pdf — Chunk PDF (accounting handbook or Internal Control doc); tag by Standard Type and Level of Authority. */
router.post('/ingest-pdf', pdfUpload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file || !file.buffer) return res.status(400).json({ error: 'Missing PDF file (multipart field "file")' });
    if (!isPdfBuffer(file.buffer)) return res.status(400).json({ error: 'File is not a valid PDF (magic bytes check failed)' });
    const documentTitle = (req.body.documentTitle as string) ?? file.originalname ?? 'Untitled';
    const standardType = ((req.body.standardType as string) ?? 'GAAP') as StandardType;
    const levelOfAuthority = ((req.body.levelOfAuthority as string) ?? 'authoritative') as LevelOfAuthority;
    const sourceDocumentId = req.body.sourceDocumentId as string | undefined;

    let text: string;
    let numPages: number = 1;
    try {
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = (pdfParseModule as { default?: (buf: Buffer) => Promise<{ text: string; numpages: number }> }).default;
      if (!pdfParse) throw new Error('pdf-parse not available');
      const data = await pdfParse(file.buffer);
      text = data.text ?? '';
      numPages = data.numpages ?? 1;
    } catch (_e) {
      return res.status(501).json({
        error: 'PDF text extraction not available',
        message: 'Install pdf-parse: npm install pdf-parse. Then re-run ingest.',
      });
    }

    if (!text.trim()) return res.status(400).json({ error: 'PDF produced no text' });

    const maxChunkSize = 1200;
    const textChunks = chunkTextByParagraphs(text, maxChunkSize);
    const pageChunkCount = Math.max(1, Math.ceil(textChunks.length / numPages));
    const pages: { pageNumber: number; text: string }[] = [];
    for (let i = 0; i < textChunks.length; i++) {
      const pageNumber = Math.min(numPages, Math.floor(i / pageChunkCount) + 1);
      pages.push({ pageNumber, text: textChunks[i] });
    }
    const chunks = ingestDocument({
      documentTitle,
      standardType,
      levelOfAuthority,
      sourceDocumentId,
      pages: pages.length > 0 ? pages : undefined,
      fullText: pages.length === 0 ? text : undefined,
      maxChunkSize,
    });
    return res.json({
      ok: true,
      message: 'PDF ingested',
      count: chunks.length,
      documentTitle,
      standardType,
      levelOfAuthority,
      chunks: chunks.map((c) => ({ id: c.id, pageNumber: c.pageNumber })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PDF ingest failed';
    return res.status(500).json({ error: 'PDF ingest error', message });
  }
});

/** POST /api/vector-store/query — Retrieve with optional precedent-first; citations include document title + page number. */
router.post('/query', (req: Request, res: Response) => {
  try {
    const body = req.body as { query: string; preferPrecedent?: boolean; standardType?: StandardType; levelOfAuthority?: LevelOfAuthority; topK?: number };
    const queryText = (body?.query ?? '').trim();
    if (!queryText) return res.status(400).json({ error: 'Missing "query" in body' });
    const result = retrieve(queryText, {
      preferPrecedent: body.preferPrecedent,
      standardType: body.standardType,
      levelOfAuthority: body.levelOfAuthority,
      topK: body.topK ?? 10,
    });
    return res.json({
      query: result.query,
      chunks: result.chunks.map((c) => ({ id: c.id, documentTitle: c.documentTitle, pageNumber: c.pageNumber, standardType: c.standardType, levelOfAuthority: c.levelOfAuthority, citationCode: c.citationCode, excerpt: c.text.slice(0, 300) })),
      citations: result.citations,
      citedRulesForBot: formatCitedRulesForBot(result),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Query failed';
    return res.status(500).json({ error: 'Query error', message });
  }
});

/** POST /api/vector-store/precedent — CPA agent: check for similar precedent in company history before processing entry. */
router.post('/precedent', (req: Request, res: Response) => {
  try {
    const body = req.body as { entryDescription: string; topK?: number; standardType?: 'GAAP' | 'IFRS' };
    const entryDescription = (body?.entryDescription ?? '').trim();
    if (!entryDescription) return res.status(400).json({ error: 'Missing "entryDescription" in body' });
    const result = retrievePrecedentForEntry(entryDescription, { topK: body.topK ?? 5, standardType: body.standardType });
    return res.json({
      query: result.query,
      chunks: result.chunks.map((c) => ({ id: c.id, documentTitle: c.documentTitle, pageNumber: c.pageNumber, standardType: c.standardType, levelOfAuthority: c.levelOfAuthority, citationCode: c.citationCode })),
      citations: result.citations,
      citedRulesForBot: formatCitedRulesForBot(result),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Precedent lookup failed';
    return res.status(500).json({ error: 'Precedent error', message });
  }
});

/** GET /api/vector-store/chunks — List stored chunks (e.g. admin). */
router.get('/chunks', (_req: Request, res: Response) => {
  try {
    const chunks = listChunks();
    return res.json({ count: chunks.length, chunks: chunks.map((c) => ({ id: c.id, documentTitle: c.documentTitle, pageNumber: c.pageNumber, standardType: c.standardType, levelOfAuthority: c.levelOfAuthority })) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'List failed';
    return res.status(500).json({ error: 'List error', message });
  }
});

export default router;
