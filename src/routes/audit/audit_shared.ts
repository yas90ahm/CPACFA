/**
 * Shared utilities for audit routes: auditor token, Python backend URL, error handling.
 */

import type { Response } from 'express';
import { MathematicalIntegrityError } from '../services/financialStatements.js';

/** Auditor Portal token: in production must be set and not the default; in dev default allowed. */
export function getAuditorToken(): string | null {
  const raw = process.env.AUDITOR_PORTAL_TOKEN;
  if (process.env.NODE_ENV === 'production') {
    if (!raw || raw.trim() === '' || raw === 'auditor-readonly-2025') return null;
    return raw;
  }
  return raw ?? 'auditor-readonly-2025';
}

/** Optional Python backend URL for Forensic Skeptic / Audit Dashboard (e.g. http://localhost:5000). */
export const BACKEND_PYTHON_URL = process.env.BACKEND_PYTHON_URL ?? '';

export function handleAuditError(res: Response, err: unknown, label: string): void {
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({ error: label, message });
}

/**
 * If err is MathematicalIntegrityError, send 422 Unprocessable Entity with exact imbalance (Kill Switch).
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
  handleAuditError(res, err, label);
}
