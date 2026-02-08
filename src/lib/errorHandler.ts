/**
 * Sanitized 500 error reporting: log full error server-side, respond with standard envelope only.
 * Never send stack traces, SQL details, internal error objects, or secret-bearing messages to the client.
 */

import type { Response } from 'express';
import { log } from './logger.js';
import { getRequestId } from './request_context.js';

/** Standard 500 response body. Never varies to avoid leaking internal details. */
export const STANDARD_500_BODY = {
  error: 'Internal Server Error',
  code: 'INTERNAL',
  message: 'Unexpected error',
} as const;

/**
 * Log the error server-side (message and stack) and send a safe 500 response.
 * Response body is always STANDARD_500_BODY; never includes err.message, stack, SQL, or file paths.
 * @param res - Express response
 * @param err - Caught error (any) — used for logging only
 * @param genericLabel - Optional label for server log (e.g. "Login failed"). Not sent to client.
 */
export function send500(res: Response, err: unknown, genericLabel?: string): void {
  const label = genericLabel ?? 'Internal server error';
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  log('error', label, { message, stack });
  const requestId = getRequestId() ?? '';
  res.status(500).json({
    ...STANDARD_500_BODY,
    ...(requestId && { requestId }),
  });
}
