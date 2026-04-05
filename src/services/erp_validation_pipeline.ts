/**
 * ERP Validation Pipeline
 *
 * Ordered validation that runs on canonical ERP data AFTER mapping but BEFORE
 * staging into the GL.  Seven checks execute sequentially; all issues are
 * collected and returned in a single ValidationResult.
 *
 * Rules:
 *  - All money arithmetic uses Decimal.js via `from()` — never JS number.
 *  - Issues carry lineIndex, field, and accountCode for traceability.
 *  - Empty input is valid (no issues).
 */

import type { Pool } from 'pg';
import type {
  CanonicalTrialBalanceEntry,
  ValidationIssue,
  ValidationResult,
  ValidationSeverity,
} from '../types/canonical_ingestion.js';
import { from } from '../utils/decimal.js';

/* ── Known currencies (ISO 4217 subset) ────────────────────────── */

const KNOWN_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'HKD', 'SGD',
  'NZD', 'SEK', 'NOK', 'DKK', 'MXN', 'BRL', 'INR', 'KRW', 'ZAR', 'AED',
  'SAR', 'ILS', 'PLN', 'CZK', 'HUF', 'THB', 'MYR', 'IDR', 'PHP', 'VND',
  'TWD', 'BHD', 'KWD', 'OMR', 'QAR',
]);

/** Currencies with zero decimal precision. */
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW']);

/** Currencies with three-decimal precision. */
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'KWD', 'OMR']);

/* ── Provider-specific account code patterns ───────────────────── */

const ACCOUNT_CODE_PATTERNS: Record<string, RegExp> = {
  quickbooks: /^\d+$/,
  xero: /^[a-zA-Z0-9-]+$/,
  netsuite: /^[a-zA-Z0-9._-]+$/,
  sage_intacct: /^[a-zA-Z0-9._-]+$/,
};

const DEFAULT_ACCOUNT_CODE_PATTERN = /^[a-zA-Z0-9._-]{1,50}$/;

/* ── Helpers ───────────────────────────────────────────────────── */

function issue(
  severity: ValidationSeverity,
  code: string,
  field: string,
  lineIndex: number,
  message: string,
  accountCode?: string,
  value?: string,
): ValidationIssue {
  const base: ValidationIssue = { severity, code, field, lineIndex, message };
  if (accountCode !== undefined) base.accountCode = accountCode;
  if (value !== undefined) base.value = value;
  return base;
}

/**
 * Returns the number of decimal places in a Decimal string.
 * E.g. "123.45" -> 2, "100" -> 0, "1.1" -> 1.
 */
function decimalPlaces(value: string): number {
  const parts = value.split('.');
  return parts.length > 1 ? parts[1].length : 0;
}

/**
 * Maximum allowed decimal places for a given currency code.
 */
function maxDecimalPlaces(currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(currency)) return 3;
  return 2; // USD, EUR, GBP, CAD and all others default to 2
}

/* ── 1. Required Fields ────────────────────────────────────────── */

function validateRequiredFields(entries: CanonicalTrialBalanceEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];

    if (e.accountCode == null || e.accountCode.trim() === '') {
      issues.push(issue('error', 'MISSING_ACCOUNT_CODE', 'accountCode', i,
        'accountCode is required and must be a non-empty string', undefined, String(e.accountCode ?? '')));
    }

    if (e.accountName == null || e.accountName.trim() === '') {
      issues.push(issue('error', 'MISSING_ACCOUNT_NAME', 'accountName', i,
        'accountName is required and must be a non-empty string', e.accountCode, String(e.accountName ?? '')));
    }

    if (!e.currency || e.currency.trim() === '') {
      issues.push(issue('error', 'MISSING_CURRENCY', 'currency', i,
        'currency is required', e.accountCode, String(e.currency ?? '')));
    }

    // At least one of debit/credit must be > 0; both zero is a warning
    try {
      const debit = from(e.debit ?? '0');
      const credit = from(e.credit ?? '0');
      if (debit.isZero() && credit.isZero()) {
        issues.push(issue('warning', 'ZERO_BALANCE', 'debit', i,
          'Both debit and credit are zero', e.accountCode, '0'));
      }
    } catch {
      // Decimal parse failures are caught in check 2 — skip here
    }
  }

  return issues;
}

/* ── 2. Decimal Precision ──────────────────────────────────────── */

function validateDecimalPrecision(entries: CanonicalTrialBalanceEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];

    for (const field of ['debit', 'credit'] as const) {
      const raw = e[field];

      // Parse check
      let parsed;
      try {
        parsed = from(raw);
        if (parsed.isNaN()) throw new Error('NaN');
      } catch {
        issues.push(issue('error', 'INVALID_DECIMAL', field, i,
          `${field} value cannot be parsed as a decimal`, e.accountCode, String(raw)));
        continue;
      }

      // Negative check
      if (parsed.isNegative()) {
        issues.push(issue('error', 'NEGATIVE_AMOUNT', field, i,
          `${field} must not be negative`, e.accountCode, String(raw)));
        continue;
      }

      // Currency-specific precision check
      const currency = (e.currency ?? '').toUpperCase();
      if (currency) {
        const maxDp = maxDecimalPlaces(currency);
        const actualDp = decimalPlaces(String(raw));
        if (actualDp > maxDp) {
          issues.push(issue('warning', 'DECIMAL_PRECISION_EXCEEDED', field, i,
            `${field} has ${actualDp} decimal places; ${currency} allows max ${maxDp}`,
            e.accountCode, String(raw)));
        }
      }
    }
  }

  return issues;
}

/* ── 3. Account Code Format ────────────────────────────────────── */

function validateAccountCodeFormat(
  entries: CanonicalTrialBalanceEntry[],
  provider: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const pattern = ACCOUNT_CODE_PATTERNS[provider] ?? DEFAULT_ACCOUNT_CODE_PATTERN;

  for (let i = 0; i < entries.length; i++) {
    const code = entries[i].accountCode;
    if (code == null || code.trim() === '') continue; // Already caught in check 1

    if (!pattern.test(code)) {
      issues.push(issue('warning', 'ACCOUNT_CODE_FORMAT', 'accountCode', i,
        `Account code "${code}" does not match expected format for provider "${provider}"`,
        code, code));
    }
  }

  return issues;
}

/* ── 4. No Duplicates ──────────────────────────────────────────── */

function validateNoDuplicates(entries: CanonicalTrialBalanceEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, number>(); // key -> first lineIndex

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const key = e.entityId ? `${e.accountCode}:${e.entityId}` : e.accountCode;

    if (seen.has(key)) {
      issues.push(issue('error', 'DUPLICATE_ACCOUNT', 'accountCode', i,
        `Duplicate account code "${e.accountCode}"${e.entityId ? ` for entity "${e.entityId}"` : ''} (first seen at line ${seen.get(key)})`,
        e.accountCode, key));
    } else {
      seen.set(key, i);
    }
  }

  return issues;
}

/* ── 5. Trial Balance Check ────────────────────────────────────── */

function validateBalance(entries: CanonicalTrialBalanceEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (entries.length === 0) return issues;

  let totalDebits = from('0');
  let totalCredits = from('0');

  for (const e of entries) {
    try {
      totalDebits = totalDebits.plus(from(e.debit ?? '0'));
    } catch { /* parse failures caught in check 2 */ }
    try {
      totalCredits = totalCredits.plus(from(e.credit ?? '0'));
    } catch { /* parse failures caught in check 2 */ }
  }

  const imbalance = totalDebits.minus(totalCredits).abs();

  if (imbalance.greaterThan('1.00')) {
    issues.push(issue('warning', 'TB_IMBALANCE', 'debit', 0,
      `Trial balance imbalance of ${imbalance.toFixed(2)} (total debits ${totalDebits.toFixed(2)}, total credits ${totalCredits.toFixed(2)})`,
      undefined, imbalance.toFixed(2)));
  } else if (imbalance.greaterThan('0.01')) {
    issues.push(issue('warning', 'MINOR_IMBALANCE', 'debit', 0,
      `Minor trial balance imbalance of ${imbalance.toFixed(2)} (within rounding tolerance)`,
      undefined, imbalance.toFixed(2)));
  }

  return issues;
}

/* ── 6. Currency Consistency ───────────────────────────────────── */

function validateCurrencyConsistency(entries: CanonicalTrialBalanceEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (entries.length === 0) return issues;

  const currencies = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const cur = (entries[i].currency ?? '').toUpperCase().trim();
    if (cur) currencies.add(cur);
  }

  if (currencies.size > 1) {
    const sorted = Array.from(currencies).sort();
    issues.push(issue('warning', 'MULTI_CURRENCY_BATCH', 'currency', 0,
      `Batch contains multiple currencies: ${sorted.join(', ')}`,
      undefined, sorted.join(',')));
  }

  // Check each currency for known ISO 4217 codes
  for (let i = 0; i < entries.length; i++) {
    const cur = (entries[i].currency ?? '').toUpperCase().trim();
    if (cur && !KNOWN_CURRENCIES.has(cur)) {
      issues.push(issue('warning', 'UNKNOWN_CURRENCY', 'currency', i,
        `Unknown currency code "${cur}"`, entries[i].accountCode, cur));
    }
  }

  return issues;
}

/* ── 7. Validate Against Chart of Accounts ─────────────────────── */

async function validateAgainstCOA(
  entries: CanonicalTrialBalanceEntry[],
  pool: Pool,
  tenantId: string,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  if (entries.length === 0) return issues;

  let coaCodes: Set<string>;
  try {
    const result = await pool.query(
      `SELECT account_code FROM core.tenant_chart_of_accounts WHERE tenant_id = $1`,
      [tenantId],
    );
    coaCodes = new Set(result.rows.map((r: { account_code: string }) => r.account_code));
  } catch {
    // COA table may not exist yet — skip silently (best-effort check)
    return issues;
  }

  // If COA is empty, every code is "new" — skip to avoid noise on first sync
  if (coaCodes.size === 0) return issues;

  for (let i = 0; i < entries.length; i++) {
    const code = entries[i].accountCode;
    if (code && !coaCodes.has(code)) {
      issues.push(issue('info', 'NEW_ACCOUNT_CODE', 'accountCode', i,
        `Account code "${code}" not found in existing chart of accounts`,
        code, code));
    }
  }

  return issues;
}

/* ── Result Builder ────────────────────────────────────────────── */

function buildResult(issues: ValidationIssue[]): ValidationResult {
  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    issues,
    errorCount: issues.filter(i => i.severity === 'error').length,
    warningCount: issues.filter(i => i.severity === 'warning').length,
    infoCount: issues.filter(i => i.severity === 'info').length,
  };
}

/* ── Main Pipeline ─────────────────────────────────────────────── */

export async function validateTrialBalanceBatch(
  entries: CanonicalTrialBalanceEntry[],
  context: { tenantId: string; pool: Pool; provider: string },
): Promise<ValidationResult> {
  if (entries.length === 0) {
    return buildResult([]);
  }

  const allIssues: ValidationIssue[] = [];

  // 1. Required fields
  allIssues.push(...validateRequiredFields(entries));

  // 2. Decimal precision
  allIssues.push(...validateDecimalPrecision(entries));

  // 3. Account code format (provider-specific)
  allIssues.push(...validateAccountCodeFormat(entries, context.provider));

  // 4. No duplicates
  allIssues.push(...validateNoDuplicates(entries));

  // 5. Trial balance check
  allIssues.push(...validateBalance(entries));

  // 6. Currency consistency
  allIssues.push(...validateCurrencyConsistency(entries));

  // 7. Validate against COA (async, best-effort)
  allIssues.push(...await validateAgainstCOA(entries, context.pool, context.tenantId));

  return buildResult(allIssues);
}
