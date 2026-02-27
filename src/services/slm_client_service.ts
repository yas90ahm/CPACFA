/**
 * SLM Client Service — typed HTTP client for the SLM Python microservice.
 *
 * Calls the FastAPI endpoints at SLM_SERVICE_URL (default http://slm:8000).
 * Handles timeouts, retries, and graceful degradation (never throws to callers
 * in batch mode; returns partial results with errors).
 *
 * AI boundary: this service is read-only from the SLM perspective. It sends
 * account names and receives classification suggestions. No financial data
 * is written here — persistence happens in ai_classification_service.
 */

const SLM_SERVICE_URL = process.env.SLM_SERVICE_URL || 'http://slm:8000';
const SLM_TIMEOUT_MS = Number(process.env.SLM_TIMEOUT_MS) || 10_000;
const SLM_RETRY_COUNT = 2;
const SLM_RETRY_DELAY_MS = 500;

// ---------- Response types from SLM ----------

export interface SlmCoaResult {
  account_name: string;
  line_item_id: string;
  line_item_label: string;
  statement: string;
  confidence: number;
  confidence_band: string;
  tier: string;
  alternatives: Array<Record<string, unknown>>;
  model_version: string;
}

export interface SlmCfResult {
  account_name: string;
  classification: string; // 'Operating' | 'Investing' | 'Financing'
  confidence: number;
  confidence_band: string;
  source: string;
  rule_pattern: string | null;
  alternatives: Array<Record<string, unknown>>;
  model_version: string;
}

export interface SlmHealthResponse {
  status: string;
  models_loaded: boolean;
  startup_seconds: number;
  versions: { coa: string; cf: string };
}

export interface SlmError {
  account_name: string;
  error: string;
}

// ---------- Internal helpers ----------

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function slmPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${SLM_SERVICE_URL}${path}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= SLM_RETRY_COUNT; attempt++) {
    try {
      const resp = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, SLM_TIMEOUT_MS);

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`SLM ${path} returned ${resp.status}: ${text}`);
      }

      return (await resp.json()) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < SLM_RETRY_COUNT) {
        await new Promise((r) => setTimeout(r, SLM_RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }

  throw lastError!;
}

// ---------- Public API ----------

/**
 * Classify a single account for COA mapping.
 * Throws on failure (caller should catch for graceful degradation).
 */
export async function classifyCoa(accountName: string): Promise<SlmCoaResult> {
  return slmPost<SlmCoaResult>('/classify/coa', { account_name: accountName });
}

/**
 * Classify a batch of accounts for COA mapping.
 * Returns results for each account. On partial failure, returns what succeeded.
 */
export async function classifyCoaBatch(
  accountNames: string[]
): Promise<{ results: SlmCoaResult[]; errors: SlmError[] }> {
  if (accountNames.length === 0) return { results: [], errors: [] };

  try {
    // Try batch endpoint first
    const results = await slmPost<SlmCoaResult[]>('/classify/coa', { accounts: accountNames });
    return { results, errors: [] };
  } catch {
    // Fallback: classify individually, collecting partial results
    const results: SlmCoaResult[] = [];
    const errors: SlmError[] = [];
    for (const name of accountNames) {
      try {
        const r = await slmPost<SlmCoaResult>('/classify/coa', { account_name: name });
        results.push(r);
      } catch (err) {
        errors.push({
          account_name: name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { results, errors };
  }
}

/**
 * Classify a single account for Cash Flow.
 */
export async function classifyCf(accountName: string): Promise<SlmCfResult> {
  return slmPost<SlmCfResult>('/classify/cf', { account_name: accountName });
}

/**
 * Classify a batch of accounts for Cash Flow.
 */
export async function classifyCfBatch(
  accountNames: string[]
): Promise<{ results: SlmCfResult[]; errors: SlmError[] }> {
  if (accountNames.length === 0) return { results: [], errors: [] };

  try {
    const results = await slmPost<SlmCfResult[]>('/classify/cf', { accounts: accountNames });
    return { results, errors: [] };
  } catch {
    const results: SlmCfResult[] = [];
    const errors: SlmError[] = [];
    for (const name of accountNames) {
      try {
        const r = await slmPost<SlmCfResult>('/classify/cf', { account_name: name });
        results.push(r);
      } catch (err) {
        errors.push({
          account_name: name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { results, errors };
  }
}

/**
 * Check SLM service health. Returns null if unreachable.
 */
export async function checkHealth(): Promise<SlmHealthResponse | null> {
  try {
    const url = `${SLM_SERVICE_URL}/health`;
    const resp = await fetchWithTimeout(url, { method: 'GET' }, 5_000);
    if (!resp.ok) return null;
    return (await resp.json()) as SlmHealthResponse;
  } catch {
    return null;
  }
}
