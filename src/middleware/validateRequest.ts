/**
 * Request validation middleware using Zod schemas.
 * Provides consistent error handling and type safety for API routes.
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

/**
 * Validate request body against a Zod schema.
 * Returns 400 with detailed error messages on validation failure.
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
      } else {
        res.status(400).json({ error: 'Invalid request body' });
      }
    }
  };
}

/**
 * Validate query parameters against a Zod schema.
 * Returns 400 with detailed error messages on validation failure.
 */
export function validateQuery<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
      } else {
        res.status(400).json({ error: 'Invalid query parameters' });
      }
    }
  };
}

/**
 * Validate path parameters against a Zod schema.
 * Returns 400 with detailed error messages on validation failure.
 */
export function validateParams<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
      } else {
        res.status(400).json({ error: 'Invalid path parameters' });
      }
    }
  };
}
