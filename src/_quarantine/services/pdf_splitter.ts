/**
 * Lightweight PDF text splitter (page-level via heuristics).
 */

export interface PdfPageText {
  page: number;
  text: string;
}

export function splitPdfText(rawText: string): PdfPageText[] {
  if (!rawText) return [];
  const byFormFeed = rawText.split('\\f');
  if (byFormFeed.length > 1) {
    return byFormFeed.map((t, i) => ({ page: i + 1, text: t.trim() })).filter((p) => p.text);
  }
  const byPageMarkers = rawText.split(/\\n\\s*page\\s+\\d+\\s*\\n/i);
  if (byPageMarkers.length > 1) {
    return byPageMarkers.map((t, i) => ({ page: i + 1, text: t.trim() })).filter((p) => p.text);
  }
  return [{ page: 1, text: rawText }];
}
