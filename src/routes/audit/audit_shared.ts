/**
 * Shared utilities for audit routes: auditor token, error handling.
 */

import type { Response } from 'express';
import { MathematicalIntegrityError } from '../../services/financialStatements.js';
import { SessionPersistenceError } from '../../errors.js';
import { send500 } from '../../lib/errorHandler.js';

/** Auditor Portal token: in production/staging/demo must be set and not the default; in dev default allowed. */
export function getAuditorToken(): string | null {
  const raw = process.env.AUDITOR_PORTAL_TOKEN;
  const mode = process.env.MODE ?? process.env.APP_MODE ?? '';
  const isSecure = process.env.NODE_ENV === 'production' || ['prod', 'staging', 'demo'].includes(mode);
  if (isSecure) {
    if (!raw || raw.trim() === '' || raw === 'auditor-readonly-2025') return null;
    return raw;
  }
  return raw ?? 'auditor-readonly-2025';
}

export function handleAuditError(res: Response, err: unknown, label: string): void {
  send500(res, err, label);
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
    send500(res, err, label);
    return;
  }
  handleAuditError(res, err, label);
}
