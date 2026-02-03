/**
 * Global validation middleware using Zod.
 * Intercepts requests and returns 400 Bad Request with specific field errors when data is malformed.
 * Use validateRequest for body/query/params, or validateBody/validateQuery/validateParams individually.
 */

import type { Request, Response, NextFunction } from 'express';
import { z, type ZodTypeAny, ZodError } from 'zod';
import type { AuthRequest } from '../auth/middleware.js';

export interface ValidationErrorDetail {
  path: string;
  message: string;
  code?: string;
}

export interface ValidationErrorResponse {
  error: 'Validation failed';
  message: string;
  fieldErrors: ValidationErrorDetail[];
}

function formatZodErrors(err: ZodError, source?: 'params' | 'query' | 'body'): ValidationErrorDetail[] {
  return err.errors.map((e) => ({
    path:
      source != null
        ? e.path.length > 0
          ? `${source}.${e.path.join('.')}`
          : source
        : e.path.length > 0
          ? e.path.join('.')
          : '(body)',
    message: e.message,
    code: e.code,
  }));
}

function sendValidationError(
  res: Response,
  fieldErrors: ValidationErrorDetail[],
  fallbackMessage: string
): void {
  const response: ValidationErrorResponse = {
    error: 'Validation failed',
    message: fieldErrors.length > 0 ? fieldErrors.map((e) => `${e.path}: ${e.message}`).join('; ') : fallbackMessage,
    fieldErrors,
  };
  res.status(400).json(response);
}

export interface ValidateRequestOptions {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validate any combination of req.params, req.query, and req.body.
 * Runs in order: params, then query, then body. On first failure, returns 400 with fieldErrors.
 */
export function validateRequest(options: ValidateRequestOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (options.params) {
      try {
        req.params = options.params.parse(req.params) as Record<string, string>;
      } catch (error) {
        if (error instanceof ZodError) {
          sendValidationError(res, formatZodErrors(error, 'params'), 'Invalid path parameters');
          return;
        }
        sendValidationError(res, [], 'Invalid path parameters');
        return;
      }
    }
    if (options.query) {
      try {
        req.query = options.query.parse(req.query) as Request['query'];
      } catch (error) {
        if (error instanceof ZodError) {
          sendValidationError(res, formatZodErrors(error, 'query'), 'Invalid query parameters');
          return;
        }
        sendValidationError(res, [], 'Invalid query parameters');
        return;
      }
    }
    if (options.body) {
      try {
        req.body = options.body.parse(req.body);
        next();
      } catch (error) {
        if (error instanceof ZodError) {
          sendValidationError(res, formatZodErrors(error, 'body'), 'Invalid request body');
          return;
        }
        sendValidationError(res, [], 'Invalid request body');
        return;
      }
      return;
    }
    next();
  };
}

/** Schema: tenantId must be present and a non-empty string (or valid UUID). Used for routes that require tenant context (e.g. CSV ingest). */
const tenantIdFormatSchema = z.string().min(1, 'Tenant ID is required and must be a non-empty string');

/**
 * Require req.tenantId (from auth) to be present and correctly formatted.
 * Use on routes that require tenant context (e.g. POST /ingest). Returns 400 with fieldErrors on failure.
 */
export function requireValidTenantId(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthRequest;
  try {
    tenantIdFormatSchema.parse(authReq.tenantId);
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors = formatZodErrors(error).map((e) => ({
        ...e,
        path: e.path === '(body)' ? 'tenantId' : e.path,
      }));
      sendValidationError(
        res,
        fieldErrors,
        'Tenant ID is required and must be a valid UUID or non-empty string'
      );
      return;
    }
    sendValidationError(res, [{ path: 'tenantId', message: 'Tenant ID is required and must be a valid UUID or non-empty string' }], 'Tenant ID is required');
    return;
  }
}

/**
 * Validate request body against a Zod schema.
 * On success: assigns parsed value to req.body and calls next().
 * On failure: returns 400 with fieldErrors (path + message). Does not call next().
 */
export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req.body) as z.infer<T>;
      req.body = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const fieldErrors = formatZodErrors(error);
        const response: ValidationErrorResponse = {
          error: 'Validation failed',
          message: fieldErrors.map((e) => `${e.path}: ${e.message}`).join('; '),
          fieldErrors,
        };
        res.status(400).json(response);
      } else {
        res.status(400).json({
          error: 'Validation failed',
          message: 'Invalid request body',
          fieldErrors: [],
        });
      }
    }
  };
}

/**
 * Validate query parameters against a Zod schema.
 * On success: assigns parsed value to req.query and calls next().
 * On failure: returns 400 with fieldErrors.
 */
export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req.query) as z.infer<T>;
      req.query = parsed as Request['query'];
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const fieldErrors = formatZodErrors(error);
        const response: ValidationErrorResponse = {
          error: 'Validation failed',
          message: fieldErrors.map((e) => `${e.path}: ${e.message}`).join('; '),
          fieldErrors,
        };
        res.status(400).json(response);
      } else {
        res.status(400).json({
          error: 'Validation failed',
          message: 'Invalid query parameters',
          fieldErrors: [],
        });
      }
    }
  };
}

/**
 * Validate path parameters against a Zod schema.
 * On success: assigns parsed value to req.params and calls next().
 * On failure: returns 400 with fieldErrors.
 */
export function validateParams<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req.params) as z.infer<T>;
      req.params = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const fieldErrors = formatZodErrors(error);
        const response: ValidationErrorResponse = {
          error: 'Validation failed',
          message: fieldErrors.map((e) => `${e.path}: ${e.message}`).join('; '),
          fieldErrors,
        };
        res.status(400).json(response);
      } else {
        res.status(400).json({
          error: 'Validation failed',
          message: 'Invalid path parameters',
          fieldErrors: [],
        });
      }
    }
  };
}
