/**
 * Standard error envelope for JSON error responses.
 * Centralized so all error responses include requestId (injected by requestId middleware when missing).
 */

import type { Response } from 'express';
import { getRequestId } from './request_context.js';

export interface ErrorEnvelope {
  error: string;
  code: string;
  message: string;
  details: Record<string, unknown>;
  requestId?: string;
}

/**
 * Send a JSON error response with standard envelope.
 * requestId is set from async context if not provided; middleware may also inject it.
 */
export function sendError(
  res: Response,
  status: number,
  envelope: { error: string; code: string; message: string; details?: Record<string, unknown> },
  requestId?: string
): void {
  const id = requestId ?? getRequestId() ?? '';
  const body: ErrorEnvelope = {
    error: envelope.error,
    code: envelope.code,
    message: envelope.message,
    details: envelope.details ?? {},
    ...(id && { requestId: id }),
  };
  res.status(status).json(body);
}
