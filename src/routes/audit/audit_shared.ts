/**
 * Shared utilities for audit routes: auditor token, error handling.
 */

import type { Response } from 'express';
import { MathematicalIntegrityError } from '../../services/financialStatements.js';
import { SessionPersistenceError } from '../../errors.js';

/** Auditor Portal token: in production must be set and not the default; in dev default allowed. */
export function getAuditorToken(): string | null {
  const raw = process.env.AUDITOR_PORTAL_TOKEN;
  if (process.env.NODE_ENV === 'production') {
    if (!raw || raw.trim() === '' || raw === 'auditor-readonly-2025') return null;
    return raw;
  }
  return raw ?? 'auditor-readonly-2025';
}

/** In production, avoid leaking system paths, table names, or stack traces to the client. */
const SANITIZED_MESSAGE = 'An internal error occurred. Please try again or contact support.';

export function handleAuditError(res: Response, err: unknown, label: string): void {
  let message: string;
  if (process.env.NODE_ENV === 'production') {
    message = SANITIZED_MESSAGE;
  } else {
    message = err instanceof Error ? err.message : String(err);
  }
  res.status(500).json({ error: label, message });
}

/**
 * If err is MathematicalIntegrityError, send 422 Unprocessable Entity with exact imbalance (Kill Switch).
 * If err is SessionPersistenceError, send 500 Internal Server Error (no silent green).
 * Otherwise call handleAuditError(res, err, label).
 */
export function handleAuditOrIntegrityError(res: Response, err: unknown, label: string): void {
  if (err instanceof MathematicalIntegrityError) {
    res.status(422).json({
      error: 'MathematicalIntegrityError',
      message: err.message,
      check: err.check,
      imbalanceAmount: err.imbalanceAmount,
      details: err.details,
    });
    return;
  }
  if (err instanceof SessionPersistenceError) {
    res.status(500).json({
      error: 'SessionPersistenceError',
      message: process.env.NODE_ENV === 'production' ? SANITIZED_MESSAGE : err.message,
      ...(process.env.NODE_ENV !== 'production' && { operation: err.operation }),
    });
    return;
  }
  handleAuditError(res, err, label);
}
