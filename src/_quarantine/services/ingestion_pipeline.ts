/**
 * Luca-style ingestion pipeline scaffolding: split, de-dup, and summarize.
 */

import { createHash } from 'crypto';
import type { ParsedDocument, DetectedFileType } from './ingestion_agent.js';
import { splitPdfText } from './pdf_splitter.js';

export interface IngestionDocument {
  id: string;
  hash: string;
  semanticHash: string;
  fileType: DetectedFileType;
  rawTextPreview: string;
  isDuplicate: boolean;
  clusterId?: string;
  signals: string[];
}

export interface IngestionPipelineResult {
  documents: IngestionDocument[];
  duplicateCount: number;
  clusters: Array<{ clusterId: string; count: number }>;
}

const seenHashes = new Set<string>();

export function buildIngestionPipeline(parsed: ParsedDocument, filename?: string): IngestionPipelineResult {
  const docs = splitDocuments(parsed, filename);
  let duplicates = 0;
  const documents = docs.map((doc) => {
    const isDuplicate = seenHashes.has(doc.hash);
    if (!isDuplicate) seenHashes.add(doc.hash);
    if (isDuplicate) duplicates += 1;
    return { ...doc, isDuplicate };
  });
  const clustered = assignClusters(documents);
  const clusters = summarizeClusters(clustered);
  return { documents: clustered, duplicateCount: duplicates, clusters };
}

function splitDocuments(parsed: ParsedDocument, filename?: string): IngestionDocument[] {
  const id = () => `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const raw = parsed.rawText ?? '';
  if (parsed.fileType === 'pdf') {
    const pages = splitPdfText(raw);
    if (pages.length > 1) {
      return pages.map((p) => ({
        id: id(),
        hash: computeHash(parsed.fileType, p.text, `${filename ?? 'pdf'}#page-${p.page}`),
        semanticHash: computeSemanticHash(p.text),
        fileType: parsed.fileType,
        rawTextPreview: p.text.slice(0, 600),
        isDuplicate: false,
        signals: ['page_split'],
      }));
    }
  }
  const hash = computeHash(parsed.fileType, raw, filename);
  const signals: string[] = [];
  const invoiceMentions = raw.toLowerCase().match(/\binvoice\b/g)?.length ?? 0;
  if (invoiceMentions > 1) signals.push('multi_invoice_possible');
  return [
    {
      id: id(),
      hash,
      semanticHash: computeSemanticHash(raw),
      fileType: parsed.fileType,
      rawTextPreview: raw.slice(0, 600),
      isDuplicate: false,
      signals,
    },
  ];
}

function computeHash(fileType: DetectedFileType, rawText: string, filename?: string): string {
  const h = createHash('sha256');
  h.update(fileType);
  h.update('|');
  h.update(filename ?? '');
  h.update('|');
  h.update(rawText.slice(0, 2000));
  return h.digest('hex');
}

function computeSemanticHash(text: string): string {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 200);
  const bits = new Array(64).fill(0);
  for (const t of tokens) {
    const h = hash64(t);
    for (let i = 0; i < 64; i++) {
      bits[i] += (h & (1n << BigInt(i))) ? 1 : -1;
    }
  }
  let out = 0n;
  for (let i = 0; i < 64; i++) {
    if (bits[i] >= 0) out |= 1n << BigInt(i);
  }
  return out.toString(16);
}

function hash64(input: string): bigint {
  const h = createHash('sha256').update(input).digest('hex');
  return BigInt('0x' + h.slice(0, 16));
}

function assignClusters(docs: IngestionDocument[]): IngestionDocument[] {
  let clusterId = 0;
  const clusters: Array<{ id: string; rep: IngestionDocument }> = [];
  return docs.map((doc) => {
    const match = clusters.find((c) => hammingDistance(doc.semanticHash, c.rep.semanticHash) <= 6);
    if (match) {
      return { ...doc, clusterId: match.id };
    }
    clusterId += 1;
    const id = `cluster-${clusterId}`;
    clusters.push({ id, rep: doc });
    return { ...doc, clusterId: id };
  });
}

function summarizeClusters(docs: IngestionDocument[]): Array<{ clusterId: string; count: number }> {
  const counts = new Map<string, number>();
  docs.forEach((d) => {
    if (!d.clusterId) return;
    counts.set(d.clusterId, (counts.get(d.clusterId) ?? 0) + 1);
  });
  return Array.from(counts.entries()).map(([clusterId, count]) => ({ clusterId, count }));
}

function hammingDistance(aHex: string, bHex: string): number {
  const a = BigInt('0x' + (aHex || '0'));
  const b = BigInt('0x' + (bHex || '0'));
  let x = a ^ b;
  let dist = 0;
  while (x) {
    dist += Number(x & 1n);
    x >>= 1n;
  }
  return dist;
}
