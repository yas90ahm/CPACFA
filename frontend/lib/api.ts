/**
 * API client for backend calls.
 * Auth: JWT Bearer token from auth module. 401 triggers redirect to login.
 */

let authTokenGetter: (() => string | null) | null = null;

export function setAuthTokenGetter(getter: () => string | null): void {
  authTokenGetter = getter;
}

function getAuthToken(): string | null {
  return authTokenGetter?.() ?? null;
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

function handleAuthExpired(): void {
  authExpiredHandler?.();
}

const getBaseUrl = () => {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
};

export interface ApiOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | undefined | null>;
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, params } = options;

  const url = new URL(`${getBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    handleAuthExpired();
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    const msg =
      (err as { error?: string; message?: string }).error ??
      (err as { error?: string; message?: string }).message ??
      'Request failed';
    const code = (err as { code?: string }).code;
    throw new ApiError(res.status, msg, code);
  }

  const data = await res.json();
  return data as T;
}

/**
 * Multipart/form-data upload. Do NOT set Content-Type - browser sets boundary.
 */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const url = `${getBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = {};

  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (res.status === 401) {
    handleAuthExpired();
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    const msg =
      (err as { error?: string; message?: string }).error ??
      (err as { error?: string; message?: string }).message ??
      'Request failed';
    const code = (err as { code?: string }).code;
    throw new ApiError(res.status, msg, code);
  }

  return res.json() as Promise<T>;
}
