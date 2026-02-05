/**
 * Request ID middleware: set req.id, X-Request-Id response header, and async context for correlation in logs.
 */

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { runWithRequestId } from '../lib/request_context.js';

export interface RequestWithId extends Request {
  id?: string;
}

export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const id = randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  runWithRequestId(id, () => next());
}
