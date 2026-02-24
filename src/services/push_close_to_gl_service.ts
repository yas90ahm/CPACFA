/**
 * Push a close adjustment to the GL via accounting integration.
 * Builds PushJournalEntryInput from adjustment, calls pushJournalEntry, returns result.
 */

import type { Pool } from 'pg';
import type { CloseAdjustment } from '../types/close_and_controls.js';
import { pushJournalEntry } from './accounting_integration_service.js';
import { from, sumRound2 } from '../utils/decimal.js';

export interface PushAdjustmentToGLResult {
  success: boolean;
  externalId?: string;
  errors?: string[];
  /** When true, GL post-back is disabled (ENABLE_GL_POSTBACK !== 'true'); caller should return 501. */
  notImplemented?: boolean;
}

/**
 * Derive JE date from periodLabel (e.g. "2025-01" → last day "2025-01-31").
 * For YYYY-MM use last day of month; otherwise use fallback date.
 */
export function periodLabelToDate(periodLabel: string, fallbackDate?: string): string {
  const match = periodLabel.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const lastDay = new Date(year, month, 0).getDate();
    return `${match[1]}-${match[2].padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }
  if (fallbackDate) return fallbackDate.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

/**
 * Push a close adjustment to the GL. Validates balance, builds lines, calls pushJournalEntry.
 * When ENABLE_GL_POSTBACK is not 'true', returns notImplemented so caller can respond 501.
 */
export async function pushAdjustmentToGL(
  adjustment: CloseAdjustment,
  connectionId: string,
  pool?: Pool,
  tenantId?: string
): Promise<PushAdjustmentToGLResult> {
  if (process.env.ENABLE_GL_POSTBACK !== 'true') {
    return {
      success: false,
      notImplemented: true,
      errors: ['GL post-back is disabled; set ENABLE_GL_POSTBACK=true to enable.'],
    };
  }
  const debits = adjustment.debits ?? [];
  const credits = adjustment.credits ?? [];
  const debitTotal = sumRound2(debits.map((d) => d.amount));
  const creditTotal = sumRound2(credits.map((c) => c.amount));
  if (from(debitTotal).minus(creditTotal).abs().greaterThan(0.01)) {
    return { success: false, errors: ['Adjustment must balance (debits = credits)'] };
  }

  const lines = [
    ...debits.map((d) => ({
      accountCode: d.account,
      accountName: d.account,
      debit: d.amount,
      credit: 0,
    })),
    ...credits.map((c) => ({
      accountCode: c.account,
      accountName: c.account,
      debit: 0,
      credit: c.amount,
    })),
  ];

  const date = periodLabelToDate(adjustment.periodLabel, adjustment.createdAt);
  const memo = adjustment.description || `Close adjustment ${adjustment.id}`;

  const result = await pushJournalEntry(
    { connectionId, date, memo, lines },
    pool,
    tenantId
  );

  if (!result.success) {
    return { success: false, errors: result.errors };
  }
  return {
    success: true,
    externalId: result.externalId ?? result.externalRef,
    errors: result.errors?.length ? result.errors : undefined,
  };
}
