/**
 * Base fetch wrapper for API calls.
 * Auth: stub with hardcoded token or cookie; swap for real auth later.
 */

const getBaseUrl = () => {
  if (typeof window !== 'undefined') return '';
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
};

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${getBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  const data = await res.json();
  return data as T;
}
