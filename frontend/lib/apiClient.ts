/**
 * Shared API client: fetch + check ok + return json (or blob).
 * Use for all JSON API calls to avoid repeated if (!res.ok) throw; return res.json().
 */

/**
 * GET or POST with JSON body; returns parsed JSON. Throws on !res.ok.
 */
export async function apiJson<T = unknown>(
  baseUrl: string,
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: options.body != null ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body != null ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

/**
 * POST (or GET) returning Blob; throws on !res.ok.
 */
export async function apiBlob(
  baseUrl: string,
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<Blob> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'POST',
    headers: options.body != null ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body != null ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.blob();
}
