/**
 * Full OCR pipeline — retries, backoff, and structured output for agentic ingestion.
 * Uses external OCR endpoint (PYTHON_OCR_URL or OCR_SERVICE_URL). Supports page-level and region-level text.
 */

export interface OcrPage {
  pageIndex: number;
  text: string;
}

export interface OcrRegion {
  pageIndex: number;
  text: string;
  bbox?: [number, number, number, number];
}

export interface OcrResult {
  text: string;
  pages?: OcrPage[];
  regions?: OcrRegion[];
  error?: string;
}

const DEFAULT_MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 10000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run OCR with retries and exponential backoff. Returns structured text and optional pages/regions.
 */
export async function runOcr(
  buffer: Buffer,
  options: { maxRetries?: number } = {}
): Promise<OcrResult> {
  const url = process.env.OCR_SERVICE_URL ?? process.env.PYTHON_OCR_URL;
  if (!url) {
    return { text: '', error: 'No OCR_SERVICE_URL or PYTHON_OCR_URL configured' };
  }

  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(buffer),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`OCR service returned ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        text?: string;
        pages?: OcrPage[];
        regions?: OcrRegion[];
      };

      const text = typeof data?.text === 'string' ? data.text : '';
      const pages = Array.isArray(data?.pages) ? data.pages : undefined;
      const regions = Array.isArray(data?.regions) ? data.regions : undefined;

      return {
        text: text || (pages?.map((p) => p.text).join('\n\n') ?? '') || (regions?.map((r) => r.text).join('\n') ?? ''),
        pages,
        regions,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const backoff = Math.min(
          INITIAL_BACKOFF_MS * Math.pow(2, attempt),
          MAX_BACKOFF_MS
        );
        await sleep(backoff);
      }
    }
  }

  return {
    text: '',
    error: lastError?.message ?? 'OCR failed after retries',
  };
}

/**
 * Build a single full-text string from OcrResult for rawText / classification.
 */
export function ocrResultToRawText(result: OcrResult, maxLength = 10000): string {
  if (result.error && !result.text) return result.error;
  const raw = result.text || result.pages?.map((p) => p.text).join('\n\n') || result.regions?.map((r) => r.text).join('\n') || '';
  return raw.slice(0, maxLength);
}

/**
 * Build sheet-like rows from OcrResult (one row per page or per region when available).
 */
export function ocrResultToRows(result: OcrResult): Array<Record<string, unknown>> {
  if (result.regions?.length) {
    return result.regions.map((r) => ({
      text: r.text,
      page: r.pageIndex + 1,
      bbox: r.bbox,
    }));
  }
  if (result.pages?.length) {
    return result.pages.map((p) => ({
      text: p.text,
      page: p.pageIndex + 1,
    }));
  }
  if (result.text) {
    return [{ text: result.text.slice(0, 50000), page: 1 }];
  }
  return [];
}
