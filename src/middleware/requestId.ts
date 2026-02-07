/**
 * Request ID middleware: read X-Request-Id or generate UUID, set res header, attach to req.requestId, inject into error JSON.
 */

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { runWithRequestId } from '../lib/request_context.js';

export interface RequestWithId extends Request {
  /** Request correlation ID (incoming X-Request-Id or generated UUID). */
  requestId: string;
  /** @deprecated Use requestId. Kept for backward compatibility. */
  id?: string;
}

function getIncomingRequestId(req: Request): string | null {
  const raw = req.get('X-Request-Id') ?? req.get('x-request-id') ?? '';
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed || null;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = getIncomingRequestId(req) ?? randomUUID();
  (req as RequestWithId).requestId = id;
  (req as RequestWithId).id = id;
  res.setHeader('X-Request-Id', id);

  const originalJson = res.json.bind(res);
  res.json = function (body: unknown): Response {
    if (res.statusCode >= 400 && typeof body === 'object' && body !== null && !Array.isArray(body) && !('requestId' in (body as object))) {
      (body as Record<string, unknown>).requestId = id;
    }
    return originalJson(body);
  };

  runWithRequestId(id, () => next());
}
