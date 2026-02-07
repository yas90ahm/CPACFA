/**
 * Sanitized 500 error reporting: log full error server-side, respond with standard envelope only.
 * Never send stack traces or internal details to the client.
 */

import type { Response } from 'express';
import { log } from './logger.js';
import { getRequestId } from './request_context.js';

/**
 * Log the error server-side (message and stack) and send a safe 500 response with standard envelope.
 * @param res - Express response
 * @param err - Caught error (any)
 * @param genericLabel - Optional short label for the client (e.g. "Login failed"). No internal details.
 */
export function send500(res: Response, err: unknown, genericLabel?: string): void {
  const label = genericLabel ?? 'Internal server error';
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  log('error', label, { message, stack });
  const requestId = getRequestId() ?? '';
  res.status(500).json({
    error: label,
    code: 'INTERNAL_ERROR',
    message: label,
    details: {},
    ...(requestId && { requestId }),
  });
}
