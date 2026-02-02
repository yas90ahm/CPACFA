/**
 * Async route handler wrapper: catches promise rejections and forwards to Express error middleware.
 * Use so route handlers can await without try/catch for 500s.
 */

import type { Request, Response, NextFunction } from 'express';

export type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void | Response>;

/**
 * Wrap an async route handler so rejections are passed to next(err).
 */
export function asyncHandler(fn: AsyncRequestHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
