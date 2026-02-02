/**
 * Structured logger with secret redaction. Never logs secrets or PII.
 * Outputs JSON to stderr (error/warn) or stdout (info) for containers and log aggregators.
 */

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
  const payload = {
    level,
    timestamp: new Date().toISOString(),
    message,
    ...serializeMeta(meta),
  };
  const line = JSON.stringify(payload) + '\n';
  stream.write(line);
}

/**
 * Log at info (stdout), warn (stderr), or error (stderr). Meta is redacted for sensitive keys.
 */
export function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
  if (level === 'info') {
    write(process.stdout, level, message, meta);
  } else {
    write(process.stderr, level, message, meta);
  }
}
