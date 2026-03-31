let authTokenGetter: (() => string | null) | null = null;

export function setAuthTokenGetter(getter: () => string | null): void {
  authTokenGetter = getter;
}

function getAuthToken(): string | null {
  const fromGetter = authTokenGetter?.() ?? null;
  if (fromGetter) return fromGetter;
  if (typeof window !== 'undefined') {
    return localStorage.getItem('cpa_auth_token');
  }
  return null;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type AuthExpiredHandler = () => void;
let authExpiredHandler: AuthExpiredHandler | null = null;

export function setAuthExpiredHandler(handler: AuthExpiredHandler): void {
  authExpiredHandler = handler;
}

const getBaseUrl = () => {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
};

export interface ApiOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | undefined | null>;
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, params } = options;

  const url = new URL(`${getBaseUrl()}${path.startsWith('/') ? path : '/' + path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    authExpiredHandler?.();
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(res.status, err.error ?? err.message ?? 'Request failed', err.code);
  }

  return res.json() as Promise<T>;
}
