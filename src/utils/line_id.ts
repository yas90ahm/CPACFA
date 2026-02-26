/**
 * Deterministic line identity for trial balance and journal entry lines.
 * Same logical line → same lineId; different logical lines → different lineId.
 * Pure function: no DB state, no timestamps, no randomness.
 */

import { createHash } from 'crypto';
import { normalizeMoney } from './decimal.js';

const LINE_ID_LENGTH = 16;

export interface LineIdInput {
  accountName: string;
  debit?: number;
  credit?: number;
  accountCode?: string;
  description?: string;
}

/**
 * Compute deterministic lineId from logical line content.
 * Uses SHA-256 of canonical string (accountName|debit|credit|accountCode|description) with normalizeMoney for amounts.
 * Truncated to 16 hex chars for readability and uniqueness.
 */
export function computeLineId(input: LineIdInput): string {
  const accountName = String(input.accountName ?? '').trim();
  const debit = normalizeMoney(input.debit ?? 0);
  const credit = normalizeMoney(input.credit ?? 0);
  const accountCode = input.accountCode != null ? String(input.accountCode).trim() : '';
  const description = input.description != null ? String(input.description).trim() : '';
  const payload = `${accountName}|${debit}|${credit}|${accountCode}|${description}`;
  const hash = createHash('sha256').update(payload, 'utf8').digest('hex');
  return hash.slice(0, LINE_ID_LENGTH);
}
