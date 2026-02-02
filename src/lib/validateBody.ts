/**
 * Request body validation helper: returns typed body or sends 400 with message.
 */

import type { Request, Response } from 'express';

export type Validator<T> = (body: unknown) => { ok: true; data: T } | { ok: false; message: string };

/**
 * Validate req.body with a simple validator; on success set req.body to typed data and return true.
 * On failure send 400 and return false (caller should return).
 */
export function validateBody<T>(
  req: Request,
  res: Response,
  validator: Validator<T>
): req is Request & { body: T } {
  const result = validator(req.body);
  if (result.ok) {
    (req as Request & { body: T }).body = result.data;
    return true;
  }
  res.status(400).json({ error: 'Validation failed', message: result.message });
  return false;
}
