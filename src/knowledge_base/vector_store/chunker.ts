/**
 * RAG Vector Store — Text chunking for ingestion.
 * Chunks PDF-derived text and company documents by paragraph or fixed size.
 */

const DEFAULT_MAX_CHUNK_SIZE = 1200;
const MIN_CHUNK_SIZE = 200;

/**
 * Split text into chunks by paragraph boundaries, then by size if needed.
 */
export function chunkTextByParagraphs(
  text: string,
  maxChunkSize: number = DEFAULT_MAX_CHUNK_SIZE
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const paragraphs = trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    if (current.length + p.length + 2 <= maxChunkSize) {
      current = current ? current + '\n\n' + p : p;
    } else {
      if (current) chunks.push(current);
      if (p.length <= maxChunkSize) {
        current = p;
      } else {
        chunks.push(...chunkTextBySize(p, maxChunkSize));
        current = '';
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Split text into fixed-size chunks with overlap to avoid cutting mid-sentence.
 */
export function chunkTextBySize(
  text: string,
  maxChunkSize: number = DEFAULT_MAX_CHUNK_SIZE,
  overlap: number = 100
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    let end = Math.min(start + maxChunkSize, trimmed.length);
    if (end < trimmed.length) {
      const lastSpace = trimmed.lastIndexOf(' ', end);
      if (lastSpace > start + MIN_CHUNK_SIZE) end = lastSpace + 1;
    }
    chunks.push(trimmed.slice(start, end).trim());
    start = end - (end < trimmed.length ? overlap : 0);
    if (start >= trimmed.length) break;
  }
  return chunks.filter(Boolean);
}

/**
 * Chunk page-by-page content (e.g. from PDF) preserving page numbers.
 */
export function chunkPages(
  pages: { pageNumber: number; text: string }[],
  maxChunkSize: number = DEFAULT_MAX_CHUNK_SIZE
): { pageNumber: number; text: string }[] {
  const out: { pageNumber: number; text: string }[] = [];
  for (const { pageNumber, text } of pages) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxChunkSize) {
      out.push({ pageNumber, text: trimmed });
    } else {
      const subChunks = chunkTextByParagraphs(trimmed, maxChunkSize);
      for (const sub of subChunks) out.push({ pageNumber, text: sub });
    }
  }
  return out;
}
