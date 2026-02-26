/**
 * Structured logger with secret redaction and request correlation.
 * Every log line includes request_id when present (from async context).
 * Outputs JSON to stderr (error/warn) or stdout (info) for containers and log aggregators.
 */

import { getRequestId } from './request_context.js';

const REDACT_KEYS = ['secret', 'password', 'token', 'key', 'authorization', 'cookie'];

function shouldRedactKey(key: string): boolean {
  const lower = key.toLowerCase();
  return REDACT_KEYS.some((k) => lower.includes(k));
}

/**
 * Redact any value whose key (case-insensitive) contains secret, password, token, key, authorization, or cookie.
 */
export function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = shouldRedactKey(k) ? '[REDACTED]' : v;
  }
  return out;
}

function serializeMeta(meta?: Record<string, unknown>): Record<string, unknown> {
  if (!meta || Object.keys(meta).length === 0) return {};
  return redact(meta);
}

function write(stream: NodeJS.WritableStream, level: string, message: string, meta?: Record<string, unknown>): void {
  const requestId = getRequestId();
  const payload: Record<string, unknown> = {
    level,
    timestamp: new Date().toISOString(),
    message,
    ...(requestId != null && { request_id: requestId }),
    ...serializeMeta(meta),
  };
  const line = JSON.stringify(payload) + '\n';
  stream.write(line);
}

/**
 * Log at info (stdout), warn (stderr), or error (stderr). request_id auto-injected when in request context. Meta is redacted for sensitive keys.
 */
export function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
  if (level === 'info') {
    write(process.stdout, level, message, meta);
  } else {
    write(process.stderr, level, message, meta);
  }
}

/** Fields for critical-route structured log (single line JSON per request). */
export interface CriticalRouteLogPayload {
  ts: string;
  level: 'info';
  requestId: string;
  tenantId?: string;
  closeSessionId?: string;
  route: string;
  outcome: string;
  code?: string;
  durationMs: number;
}

/**
 * Log one structured JSON line for a critical endpoint. Low-noise; use only for observability-critical routes.
 */
export function logCriticalRoute(payload: CriticalRouteLogPayload): void {
  const line = JSON.stringify(payload) + '\n';
  process.stdout.write(line);
}
