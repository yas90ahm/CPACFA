/**
 * General Ledger upload service — parse CSV, validate per-entry balance, save to DB.
 * Each entry_id group must balance; balanced entries saved, imbalanced returned for HITL.
 */

import { parse } from 'csv-parse/sync';
import { createHash } from 'crypto';
import type { Pool } from 'pg';
import * as XLSX from 'xlsx';
import type {
  GeneralLedgerLine,
  JournalEntry,
  GLUploadRow,
  GLValidationResult,
} from '../types/general_ledger.js';
import * as glRepository from '../db/repositories/general_ledger_repository.js';
import * as coaRepository from '../db/repositories/coa_repository.js';
import { buildDerivedTrialBalance } from './gl_to_tb_aggregation_service.js';
import { saveUnadjustedFromGLDerived } from './trial_balance_store_service.js';
import * as persistence from './persistence_service.js';
import { detectPatterns, getSummary } from './deterministic_pattern_detector.js';
import type { TrialBalanceEntry } from '../types/financial.js';
import Decimal from 'decimal.js';
import { round2, from, sumRound2, minus, absGt } from '../utils/decimal.js';

/**
 * Detect Excel files and convert to CSV buffer. Returns original buffer for CSV files.
 */
function ensureCsvBuffer(fileBuffer: Buffer): Buffer {
  const isExcel = (fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4B) // PK zip header (.xlsx)
    || (fileBuffer[0] === 0xD0 && fileBuffer[1] === 0xCF); // OLE2 header (.xls)
  if (!isExcel) return fileBuffer;

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, { type: 'buffer', cellText: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('password')) {
      throw new Error('Password-protected Excel files are not supported. Please export as CSV.');
    }
    throw new Error(`Failed to read Excel file: ${msg}`);
  }

  if (!workbook.SheetNames.length) {
    throw new Error('The uploaded Excel file contains no data');
  }

  if (workbook.SheetNames.length > 1) {
    console.warn(`GL upload: Multiple sheets detected (${workbook.SheetNames.join(', ')}), using first sheet "${workbook.SheetNames[0]}"`);
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const csv = XLSX.utils.sheet_to_csv(sheet);
  if (!csv.trim()) {
    throw new Error('The uploaded Excel file contains no data');
  }

  return Buffer.from(csv, 'utf8');
}

/** GL column mappings: raw header variants → canonical key */
const GL_COLUMN_MAP: Record<string, readonly string[]> = {
  entry_id: [
    'entryid',
    'entry_id',
    'entry id',
    'je #',
    'je#',
    'journal entry',
    'journalentry',
  ],
  entry_date: [
    'date',
    'entrydate',
    'entry_date',
    'entry date',
    'transactiondate',
    'transaction date',
    'posting_date',
    'value_date',
  ],
  account_code: [
    'accountcode',
    'account_code',
    'account code',
    'glaccount',
    'gl account',
  ],
  debit: ['debit', 'debits', 'dr', 'debit_amount', 'debit amount'],
  credit: ['credit', 'credits', 'cr', 'credit_amount', 'credit amount'],
  account_name: ['accountname', 'account_name', 'account name'],
  description: ['description', 'desc', 'memo', 'notes', 'narrative'],
  currency: ['currency', 'currency_code', 'currencycode', 'ccy', 'curr', 'transaction_currency', 'txn_currency'],
  exchange_rate: ['exchange_rate', 'exchangerate', 'fx_rate', 'fxrate', 'rate', 'exrate', 'ex_rate'],
};

function normalizeHeader(h: string): string {
  return String(h ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '_');
}

/** Column mapping: frontend field names → CSV header strings. */
export type GLColumnMapping = {
  accountCode?: string | null;
  accountName?: string | null;
  debit?: string | null;
  credit?: string | null;
  date?: string | null;
  description?: string | null;
  reference?: string | null;
  entryId?: string | null;
  currency?: string | null;
  exchangeRate?: string | null;
};

/** Auto-detect column mapping from CSV headers. */
export function autoDetectColumnMapping(headers: string[]): GLColumnMapping {
  const lower = headers.map((h) => (h ?? '').toLowerCase().trim());
  const claimed = new Set<number>();
  const find = (pred: (h: string) => boolean): string | null => {
    const i = lower.findIndex((h, idx) => !claimed.has(idx) && pred(h));
    if (i >= 0) { claimed.add(i); return headers[i]!; }
    return null;
  };

  // Match in priority order: financial columns first, then descriptive columns.
  // This prevents 'Description' from being grabbed by accountName before
  // the description field gets a chance, and ensures debit/credit are claimed
  // before any broad pattern can steal them.
  const accountCode =
    find((h) => (h.includes('account') && (h.includes('code') || h.includes('number') || h.includes('#') || h.includes('id'))) || h === 'gl account' || h === 'glaccount') ??
    find((h) => h === 'account' || h === 'account code');
  const debit = find((h) => h === 'debit' || h === 'debits' || h === 'dr' || h === 'debit amount' || h === 'debit_amount');
  const credit = find((h) => h === 'credit' || h === 'credits' || h === 'cr' || h === 'credit amount' || h === 'credit_amount');
  const entryId =
    find((h) => h.includes('entry') && (h.includes('id') || h.includes('#') || h.includes('number'))) ??
    find((h) => h === 'je #' || h === 'je#' || h === 'journal entry');
  const date = find((h) => h.includes('date') || h.includes('period') || h === 'posted');
  const accountName =
    find((h) => h.includes('account') && h.includes('name')) ??
    find((h) => h === 'name' || h === 'account name');
  const description = find((h) => h === 'description' || h === 'desc' || h.includes('memo') || h.includes('narration') || h === 'notes');
  const reference = find((h) => h.includes('ref') || h.includes('doc') || h.includes('voucher'));
  const currency = find((h) => h === 'currency' || h === 'currency code' || h === 'ccy' || h === 'curr' || h.includes('currency'));
  const exchangeRate = find((h) => h === 'exchange rate' || h === 'fx rate' || h === 'rate' || h.includes('exchange') && h.includes('rate'));

  return { accountCode, accountName, debit, credit, date, description, reference, entryId, currency, exchangeRate };
}

function mapHeaderToCanonical(rawHeader: string): string | null {
  const n = normalizeHeader(rawHeader);
  for (const [canonical, variants] of Object.entries(GL_COLUMN_MAP)) {
    for (const v of variants) {
      const vn = normalizeHeader(v);
      if (n === vn) return canonical;
      // Only use substring matching for variants >= 4 chars to avoid
      // false positives like "description".includes("cr") matching credit.
      if (vn.length >= 4 && (n.includes(vn) || vn.includes(n))) return canonical;
    }
  }
  return null;
}

/**
 * Parse amount from string (handles $1,234.56, (123), etc.).
 * Uses Decimal.js for precision. Throws if value cannot be parsed as a valid decimal.
 */
function parseGlAmount(value: unknown): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Number.isNaN(value)) {
      throw new Error(`Invalid amount: cannot parse "${value}" as a decimal number`);
    }
    return round2(value);
  }
  const s = String(value)
    .replace(/[$,\s]/g, '')
    .replace(/[()]/g, '-')
    .trim();
  if (s === '' || s === '-') return 0;
  try {
    const d = from(s);
    if (!d.isFinite()) throw new Error(`Invalid amount`);
    return round2(d.toNumber());
  } catch {
    throw new Error(`Invalid amount: cannot parse "${value}" as a decimal number`);
  }
}

/**
 * Parse GL CSV for preview (no persist). Returns headers, suggested mapping, errors, TB preview.
 */
export function parseGLPreview(
  fileBuffer: Buffer,
  columnMapping?: GLColumnMapping | null
): {
  success: boolean;
  headers: string[];
  appliedMapping: GLColumnMapping;
  suggestedMapping: GLColumnMapping;
  errors: string[];
  warnings: string[];
  preview: {
    totalRows: number;
    validRows: number;
    uniqueAccounts: number;
    totalDebits: string;
    totalCredits: string;
    balanced: boolean;
    accounts: Array<{
      accountCode: string;
      accountName: string;
      totalDebit: string;
      totalCredit: string;
      netBalance: string;
      entryCount: number;
    }>;
  } | null;
} {
  const csvBuffer = ensureCsvBuffer(fileBuffer);
  const records = parse(csvBuffer.toString('utf8'), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as Record<string, unknown>[];

  const errors: string[] = [];
  const warnings: string[] = [];

  if (records.length === 0) {
    return {
      success: false,
      headers: [],
      appliedMapping: {},
      suggestedMapping: {},
      errors: ['CSV file is empty'],
      warnings: [],
      preview: null,
    };
  }

  const headers = Object.keys(records[0]!);
  const suggested = autoDetectColumnMapping(headers);
  const mapping = columnMapping && (columnMapping.accountCode || columnMapping.debit || columnMapping.credit)
    ? columnMapping
    : suggested;

  const required: (keyof GLColumnMapping)[] = ['accountCode'];
  if (!mapping.debit && !mapping.credit) {
    required.push('debit', 'credit');
  }
  const missing = required.filter((f) => !mapping[f]);
  if (missing.length > 0) {
    return {
      success: false,
      headers,
      appliedMapping: mapping,
      suggestedMapping: suggested,
      errors: [`Missing column mappings: ${missing.join(', ')}`],
      warnings: [],
      preview: null,
    };
  }

  const getVal = (row: Record<string, unknown>, key: keyof GLColumnMapping): unknown =>
    mapping[key] ? row[mapping[key] as string] : null;

  const transformedRows: Array<{
    rowNumber: number;
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
  }> = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    const ac = String(getVal(row, 'accountCode') ?? '').trim();
    const an = String(getVal(row, 'accountName') ?? '').trim();
    const d = parseDecimalSafe(getVal(row, 'debit'));
    const c = parseDecimalSafe(getVal(row, 'credit'));
    transformedRows.push({
      rowNumber: i + 2,
      accountCode: ac,
      accountName: an,
      debit: d,
      credit: c,
    });
  }

  const emptyAccount = transformedRows.filter((r) => !r.accountCode);
  if (emptyAccount.length > 0) {
    errors.push(
      `${emptyAccount.length} row(s) have empty account codes (rows: ${emptyAccount.slice(0, 5).map((r) => r.rowNumber).join(', ')}${emptyAccount.length > 5 ? '...' : ''})`
    );
  }

  const accountMap = new Map<
    string,
    { accountCode: string; accountName: string; totalDebit: Decimal; totalCredit: Decimal; entryCount: number }
  >();

  for (const row of transformedRows) {
    if (!row.accountCode) continue;
    const key = row.accountCode;
    if (!accountMap.has(key)) {
      accountMap.set(key, {
        accountCode: row.accountCode,
        accountName: row.accountName,
        totalDebit: new Decimal(0),
        totalCredit: new Decimal(0),
        entryCount: 0,
      });
    }
    const acc = accountMap.get(key)!;
    acc.totalDebit = acc.totalDebit.plus(row.debit);
    acc.totalCredit = acc.totalCredit.plus(row.credit);
    acc.entryCount++;
  }

  const accounts = Array.from(accountMap.values()).map((a) => ({
    accountCode: a.accountCode,
    accountName: a.accountName,
    totalDebit: a.totalDebit.toString(),
    totalCredit: a.totalCredit.toString(),
    netBalance: a.totalDebit.minus(a.totalCredit).toString(),
    entryCount: a.entryCount,
  }));

  const totalDebits = accounts.reduce((s, a) => s.plus(a.totalDebit), new Decimal(0));
  const totalCredits = accounts.reduce((s, a) => s.plus(a.totalCredit), new Decimal(0));
  const balanced = totalDebits.equals(totalCredits);

  if (!balanced) {
    warnings.push(
      `Trial balance is not balanced: Debits $${totalDebits.toFixed(2)} ≠ Credits $${totalCredits.toFixed(2)} (difference: $${totalDebits.minus(totalCredits).abs().toFixed(2)})`
    );
  }

  accounts.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  return {
    success: errors.length === 0,
    headers,
    appliedMapping: mapping,
    suggestedMapping: suggested,
    errors,
    warnings,
    preview: {
      totalRows: transformedRows.length,
      validRows: transformedRows.filter((r) => r.accountCode).length,
      uniqueAccounts: accounts.length,
      totalDebits: totalDebits.toString(),
      totalCredits: totalCredits.toString(),
      balanced,
      accounts,
    },
  };
}

/** Parse amount from string (handles $1,234.56, (123), etc.). Returns 0 for empty. */
function parseDecimalSafe(value: unknown): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? round2(value) : 0;
  const s = String(value).replace(/[$,\s]/g, '').replace(/[()]/g, '-').trim();
  if (s === '' || s === '-') return 0;
  try {
    const d = from(s);
    return d.isFinite() ? round2(d.toNumber()) : 0;
  } catch {
    return 0;
  }
}

/**
 * Parse GL CSV with optional column mapping. If mapping is provided, use it; otherwise auto-detect.
 * Returns GLUploadRow[] for ingest, or can be used for preview.
 */
export function parseGLCsvWithMapping(
  fileBuffer: Buffer,
  columnMapping?: GLColumnMapping | null
): { rows: GLUploadRow[]; hasEntryId: boolean } {
  const input = fileBuffer.toString('utf8');
  const records = parse(input, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as Record<string, unknown>[];

  if (records.length === 0) return { rows: [], hasEntryId: false };

  const rawHeaders = Object.keys(records[0]!);
  let headerToCanonical: Record<string, string>;

  if (columnMapping && (columnMapping.accountCode || columnMapping.debit || columnMapping.credit)) {
    headerToCanonical = {};
    const map: Record<string, string> = {
      account_code: columnMapping.accountCode ?? '',
      account_name: columnMapping.accountName ?? '',
      debit: columnMapping.debit ?? '',
      credit: columnMapping.credit ?? '',
      entry_date: columnMapping.date ?? columnMapping.entryId ?? '',
      entry_id: columnMapping.entryId ?? '',
      description: columnMapping.description ?? '',
      currency: columnMapping.currency ?? '',
      exchange_rate: columnMapping.exchangeRate ?? '',
    };
    for (const [canon, header] of Object.entries(map)) {
      if (header && rawHeaders.includes(header)) headerToCanonical[header] = canon;
    }
  } else {
    headerToCanonical = {};
    for (const raw of rawHeaders) {
      const canonical = mapHeaderToCanonical(raw);
      if (canonical && !Object.values(headerToCanonical).includes(canonical)) {
        headerToCanonical[raw] = canonical;
      }
    }
  }

  const hasAccount = Object.values(headerToCanonical).includes('account_code');
  const hasDebit = Object.values(headerToCanonical).includes('debit');
  const hasCredit = Object.values(headerToCanonical).includes('credit');
  const hasEntryId = Object.values(headerToCanonical).includes('entry_id');

  if (!hasAccount || (!hasDebit && !hasCredit)) {
    throw new Error('CSV must have account_code (or Account, GL Account) and debit/credit columns.');
  }

  const rows: GLUploadRow[] = [];
  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    const mapped: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(row)) {
      const canon = headerToCanonical[k];
      if (canon && v != null && String(v).trim() !== '') {
        mapped[canon] = String(v).trim();
      }
    }

    const accountCode = mapped.account_code;
    if (!accountCode) continue;

    const entryId = mapped.entry_id ? String(mapped.entry_id).trim() : `ENTRY-${i + 1}`;
    const entryDate =
      mapped.entry_date ??
      new Date().toISOString().slice(0, 10);
    const debit = hasDebit ? parseGlAmount(mapped.debit) : 0;
    const credit = hasCredit ? parseGlAmount(mapped.credit) : 0;
    const accountName = mapped.account_name ? String(mapped.account_name).trim() : undefined;
    const description = mapped.description ? String(mapped.description).trim() : undefined;

    const currencyVal = mapped.currency ? String(mapped.currency).trim().toUpperCase() : null;
    const exchangeRateVal = mapped.exchange_rate ? String(mapped.exchange_rate).trim() : null;

    rows.push({
      entry_id: entryId || `ENTRY-${i + 1}`,
      entry_date: typeof entryDate === 'string' ? entryDate : String(entryDate),
      account_code: String(accountCode),
      account_name: accountName,
      debit,
      credit,
      description,
      currency: currencyVal || null,
      exchange_rate: exchangeRateVal || null,
    });
  }
  return { rows, hasEntryId };
}

/**
 * Parse GL CSV file to structured data.
 * Expected columns: entry_id, date/entry_date, account_code, debit, credit, description.
 */
export function parseGLCsv(fileBuffer: Buffer): { rows: GLUploadRow[]; hasEntryId: boolean } {
  const input = fileBuffer.toString('utf8');
  const records = parse(input, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as Record<string, unknown>[];

  if (records.length === 0) return { rows: [], hasEntryId: false };

  const rawHeaders = Object.keys(records[0]!);
  const headerToCanonical: Record<string, string> = {};
  for (const raw of rawHeaders) {
    const canonical = mapHeaderToCanonical(raw);
    if (canonical && !Object.values(headerToCanonical).includes(canonical)) {
      headerToCanonical[raw] = canonical;
    }
  }

  const hasEntryId = Object.values(headerToCanonical).includes('entry_id');
  const hasDate = Object.values(headerToCanonical).includes('entry_date');
  const hasAccount = Object.values(headerToCanonical).includes('account_code');
  const hasDebit = Object.values(headerToCanonical).includes('debit');
  const hasCredit = Object.values(headerToCanonical).includes('credit');

  if (!hasAccount || (!hasDebit && !hasCredit)) {
    throw new Error(
      'CSV must have account_code (or Account, GL Account) and debit/credit columns.'
    );
  }

  const rows: GLUploadRow[] = [];
  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    const mapped: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(row)) {
      const canon = headerToCanonical[k];
      if (canon && v != null && String(v).trim() !== '') {
        mapped[canon] = String(v).trim();
      }
    }

    const accountCode = mapped.account_code;
    if (!accountCode) continue;

    const entryId = hasEntryId
      ? String(mapped.entry_id ?? '').trim()
      : `ENTRY-${i + 1}`;
    const entryDate =
      (hasDate ? mapped.entry_date : undefined) ??
      new Date().toISOString().slice(0, 10);
    const debit = hasDebit ? parseGlAmount(mapped.debit) : 0;
    const credit = hasCredit ? parseGlAmount(mapped.credit) : 0;
    const accountName = mapped.account_name
      ? String(mapped.account_name).trim()
      : undefined;
    const description = mapped.description
      ? String(mapped.description).trim()
      : undefined;

    const currencyVal = mapped.currency ? String(mapped.currency).trim().toUpperCase() : null;
    const exchangeRateVal = mapped.exchange_rate ? String(mapped.exchange_rate).trim() : null;

    rows.push({
      entry_id: entryId || `ENTRY-${i + 1}`,
      entry_date: typeof entryDate === 'string' ? entryDate : String(entryDate),
      account_code: String(accountCode),
      account_name: accountName,
      debit,
      credit,
      description,
      currency: currencyVal || null,
      exchange_rate: exchangeRateVal || null,
    });
  }
  return { rows, hasEntryId };
}

/**
 * Group GL rows by entry_id and assign line_numbers.
 */
export function groupAndNumberLines(rows: GLUploadRow[]): GeneralLedgerLine[] {
  const entriesMap = new Map<string, GLUploadRow[]>();

  for (const row of rows) {
    const arr = entriesMap.get(row.entry_id) ?? [];
    arr.push(row);
    entriesMap.set(row.entry_id, arr);
  }

  const lines: GeneralLedgerLine[] = [];
  entriesMap.forEach((entryRows, entryId) => {
    entryRows.forEach((row, idx) => {
      const debit = typeof row.debit === 'number' ? row.debit : parseGlAmount(row.debit);
      const credit = typeof row.credit === 'number' ? row.credit : parseGlAmount(row.credit);
      // Multi-currency: if row has a currency and exchange_rate, store originals and translate
      const rowCurrency = row.currency ? String(row.currency).trim().toUpperCase() : null;
      const rowRate = row.exchange_rate != null && String(row.exchange_rate).trim() !== ''
        ? parseDecimalSafe(row.exchange_rate) : null;

      let finalDebit = debit;
      let finalCredit = credit;
      let originalCurrency: string | null = null;
      let originalDebit: number | null = null;
      let originalCredit: number | null = null;
      let exchangeRate: number | null = null;

      if (rowCurrency && rowRate && rowRate > 0) {
        // Store originals and translate to functional currency
        originalCurrency = rowCurrency;
        originalDebit = debit;
        originalCredit = credit;
        exchangeRate = rowRate;
        finalDebit = round2(from(debit).times(from(rowRate)).toNumber());
        finalCredit = round2(from(credit).times(from(rowRate)).toNumber());
      }

      lines.push({
        entry_id: entryId,
        line_number: idx + 1,
        entry_date: row.entry_date,
        account_code: row.account_code,
        account_name: row.account_name,
        debit: finalDebit,
        credit: finalCredit,
        description: row.description,
        tenant_id: '',
        period_label: '',
        original_currency: originalCurrency,
        original_debit: originalDebit,
        original_credit: originalCredit,
        exchange_rate: exchangeRate,
      });
    });
  });
  return lines;
}

/**
 * Validate multi-currency GL rows: detect missing exchange rates, mixed currencies without rates.
 * Returns warnings (non-blocking) and errors (blocking) arrays.
 */
export function validateMultiCurrency(rows: GLUploadRow[]): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  const currencies = new Set<string>();
  let missingRateCount = 0;
  const missingRateCurrencies = new Set<string>();

  for (const row of rows) {
    const currency = row.currency ? String(row.currency).trim().toUpperCase() : null;
    if (currency) {
      currencies.add(currency);
      const rate = row.exchange_rate != null && String(row.exchange_rate).trim() !== ''
        ? parseDecimalSafe(row.exchange_rate) : null;
      if (!rate || rate <= 0) {
        missingRateCount++;
        missingRateCurrencies.add(currency);
      }
    }
  }

  if (currencies.size > 1) {
    warnings.push(`Multi-currency GL detected: ${Array.from(currencies).sort().join(', ')}. Amounts will be translated using the exchange rates provided.`);
  }

  if (missingRateCount > 0) {
    errors.push(
      `${missingRateCount} row(s) have a currency (${Array.from(missingRateCurrencies).join(', ')}) but missing or invalid exchange rate. ` +
      `Every row with a non-functional currency must include a positive exchange rate.`
    );
  }

  return { warnings, errors };
}

/**
 * Check post-translation balance and apply $0.01 auto-adjust if needed.
 * Returns the adjusted lines (if rounding caused an imbalance) and warnings.
 */
export function autoAdjustTranslationRounding(lines: GeneralLedgerLine[]): { lines: GeneralLedgerLine[]; warnings: string[] } {
  const warnings: string[] = [];
  const hasTranslated = lines.some((l) => l.original_currency != null);
  if (!hasTranslated) return { lines, warnings };

  // Group by entry_id and check balance
  const entries = new Map<string, GeneralLedgerLine[]>();
  for (const line of lines) {
    const arr = entries.get(line.entry_id) ?? [];
    arr.push(line);
    entries.set(line.entry_id, arr);
  }

  const adjustedLines = [...lines];
  for (const [entryId, entryLines] of entries) {
    const totalDebits = entryLines.reduce((sum, l) => sum + (l.debit ?? 0), 0);
    const totalCredits = entryLines.reduce((sum, l) => sum + (l.credit ?? 0), 0);
    const diff = round2(totalDebits - totalCredits);
    const absDiff = Math.abs(diff);

    if (absDiff > 0 && absDiff <= 0.01) {
      // Auto-adjust the last line
      const lastLine = entryLines[entryLines.length - 1]!;
      const idx = adjustedLines.indexOf(lastLine);
      if (idx >= 0) {
        if (diff > 0) {
          // Debits exceed credits — add to last line's credit
          adjustedLines[idx] = { ...lastLine, credit: round2((lastLine.credit ?? 0) + absDiff) };
        } else {
          // Credits exceed debits — add to last line's debit
          adjustedLines[idx] = { ...lastLine, debit: round2((lastLine.debit ?? 0) + absDiff) };
        }
        warnings.push(`Entry ${entryId}: $${absDiff.toFixed(2)} translation rounding auto-adjusted.`);
      }
    }
  }

  return { lines: adjustedLines, warnings };
}

/**
 * Validate GL entries:
 * - JE format (isRegisterFormat=false): each entry_id group must balance (D=C)
 * - Register format (isRegisterFormat=true): only total D=C across entire file
 * - All account_codes must exist in COA (if COA exists)
 * - Lines cannot have both debit and credit
 */
export async function validateGLEntries(
  pool: Pool,
  tenantId: string,
  lines: GeneralLedgerLine[],
  tolerance = 0.01,
  isRegisterFormat = false
): Promise<GLValidationResult> {
  const errors: string[] = [];
  const balancedEntries: JournalEntry[] = [];
  const imbalancedEntries: Array<{
    entry: JournalEntry;
    totalDebits: number;
    totalCredits: number;
    imbalance: number;
  }> = [];

  const entries = glRepository.groupLinesByEntry(lines);

  if (isRegisterFormat) {
    // Account register format: each row is independent. Validate only total D=C.
    const totalDebits = sumRound2(lines.map((l) => l.debit ?? 0));
    const totalCredits = sumRound2(lines.map((l) => l.credit ?? 0));
    if (absGt(totalDebits, totalCredits, tolerance)) {
      console.warn(
        `[GL Register] Total debits (${totalDebits.toFixed(2)}) ≠ total credits (${totalCredits.toFixed(2)}). Difference: ${Math.abs(minus(totalDebits, totalCredits)).toFixed(2)} — this is normal for GL registers with opening balances.`
      );
    }
    // All entries are considered "balanced" in register format — they're standalone lines.
    for (const entry of entries) {
      balancedEntries.push(entry);
    }
  } else {
    // JE format: each entry_id group must balance individually.
    for (const entry of entries) {
      const totalDebits = sumRound2(entry.lines.map((line) => line.debit ?? 0));
      const totalCredits = sumRound2(entry.lines.map((line) => line.credit ?? 0));
      const imbalance = Math.abs(minus(totalDebits, totalCredits));

      if (absGt(totalDebits, totalCredits, tolerance)) {
        imbalancedEntries.push({
          entry,
          totalDebits,
          totalCredits,
          imbalance,
        });
      } else {
        balancedEntries.push(entry);
      }
    }
  }

  const dualLines = lines.filter((l) => (l.debit ?? 0) > 0 && (l.credit ?? 0) > 0);
  if (dualLines.length > 0) {
    errors.push(
      `${dualLines.length} line(s) have both debit and credit (must be one or the other)`
    );
  }

  const uniqueAccounts = new Set(lines.map((l) => l.account_code));
  const coaAccounts = await coaRepository.getAccountsByTenant(pool, tenantId);
  if (coaAccounts.length > 0) {
    // COA exists for this tenant — validate GL account codes against it.
    const coaCodes = new Set(coaAccounts.map((a) => a.account_code));
    const invalidAccounts = Array.from(uniqueAccounts).filter((code) => !coaCodes.has(code));
    if (invalidAccounts.length > 0) {
      errors.push(`Invalid account codes (not in COA): ${invalidAccounts.join(', ')}`);
    }
  } else {
    // Fresh tenant, no COA yet — skip COA validation so first GL upload can proceed.
    console.warn(`No COA for tenant ${tenantId}; skipping account code validation for first upload.`);
  }

  return {
    valid: imbalancedEntries.length === 0 && errors.length === 0,
    balancedEntries,
    imbalancedEntries,
    errors,
  };
}

/**
 * Derive TB from GL and persist to period_trial_balance.
 * Ensures export gate / materiality logic can find TB when GL-only flow is used.
 */
function toFinancialAccountType(t?: string): TrialBalanceEntry['accountType'] {
  if (!t) return undefined;
  const map: Record<string, TrialBalanceEntry['accountType']> = {
    Asset: 'ASSET',
    Liability: 'LIABILITY',
    Equity: 'EQUITY',
    Revenue: 'REVENUE',
    Expense: 'EXPENSE',
    ASSET: 'ASSET',
    LIABILITY: 'LIABILITY',
    EQUITY: 'EQUITY',
    REVENUE: 'REVENUE',
    EXPENSE: 'EXPENSE',
  };
  return map[t] ?? undefined;
}

async function deriveAndPersistTB(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  uploadedBy?: string
): Promise<void> {
  try {
    const derived = await buildDerivedTrialBalance(pool, tenantId, periodLabel);
    const entries: TrialBalanceEntry[] = derived.entries.map((e) => ({
      accountCode: e.account_code,
      accountName: e.account_name,
      accountType: toFinancialAccountType(e.account_type),
      debit: e.total_debits ?? e.debit ?? 0,
      credit: e.total_credits ?? e.credit ?? 0,
    }));
    await saveUnadjustedFromGLDerived(tenantId, periodLabel, entries, {
      derivedBy: uploadedBy,
    }, pool);
  } catch (err) {
    console.error('Failed to persist derived TB:', err);
    throw err;
  }
}

export interface GLPerfMetrics {
  parse_ms: number;
  group_ms: number;
  validate_ms: number;
  save_ms?: number;
  derive_tb_ms?: number;
  stage_ms?: number;
  total_ms: number;
}

/**
 * Upload GL for a tenant + period.
 * Parses CSV, validates, saves balanced entries, returns imbalanced for HITL.
 */
export async function uploadGLForPeriod(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  fileBuffer: Buffer,
  uploadedBy?: string,
  columnMapping?: GLColumnMapping | null
): Promise<{
  success: boolean;
  balancedCount: number;
  imbalancedCount: number;
  imbalancedEntries?: Array<{
    entry_id: string;
    totalDebits: number;
    totalCredits: number;
    imbalance: number;
    lines: GeneralLedgerLine[];
  }>;
  stagedIds?: string[];
  errors?: string[];
  perfMetrics?: GLPerfMetrics;
}> {
  const startTime = Date.now();
  const perfMetrics: GLPerfMetrics = {
    parse_ms: 0,
    group_ms: 0,
    validate_ms: 0,
    total_ms: 0,
  };

  try {
    const parseStart = Date.now();
    const csvBuffer = ensureCsvBuffer(fileBuffer);
    const parsed = columnMapping
      ? parseGLCsvWithMapping(csvBuffer, columnMapping)
      : parseGLCsv(csvBuffer);
    const { rows, hasEntryId } = parsed;
    perfMetrics.parse_ms = Date.now() - parseStart;

    if (rows.length === 0) {
      perfMetrics.total_ms = Date.now() - startTime;
      return {
        success: false,
        balancedCount: 0,
        imbalancedCount: 0,
        errors: ['No data in CSV file'],
        perfMetrics,
      };
    }

    // Multi-currency validation: block if currency present without exchange rate
    const mcResult = validateMultiCurrency(rows);
    if (mcResult.errors.length > 0) {
      perfMetrics.total_ms = Date.now() - startTime;
      return {
        success: false,
        balancedCount: 0,
        imbalancedCount: 0,
        errors: mcResult.errors,
        perfMetrics,
      };
    }

    // Account register format (no entry_id): each row is a standalone GL line.
    // JE format (has entry_id): rows are grouped by entry_id and each group must balance.
    const isRegisterFormat = !hasEntryId;

    const groupStart = Date.now();
    let lines = groupAndNumberLines(rows);
    lines = lines.map((line) => ({
      ...line,
      tenant_id: tenantId,
      period_label: periodLabel,
      created_by: uploadedBy,
    }));

    // Post-translation rounding auto-adjust ($0.01 tolerance)
    const roundingResult = autoAdjustTranslationRounding(lines);
    lines = roundingResult.lines;
    if (roundingResult.warnings.length > 0) {
      console.log(`[GL_UPLOAD] Translation rounding: ${roundingResult.warnings.join('; ')}`);
    }

    perfMetrics.group_ms = Date.now() - groupStart;

    // Duplicate detection: hash the file and compare against last upload
    const fileHash = createHash('sha256').update(fileBuffer).digest('hex');
    try {
      const lastUpload = await pool.query(
        `SELECT file_hash FROM gl_upload_history WHERE tenant_id = $1 AND period_label = $2 ORDER BY uploaded_at DESC LIMIT 1`,
        [tenantId, periodLabel]
      );
      if (lastUpload.rows.length > 0 && lastUpload.rows[0].file_hash === fileHash) {
        perfMetrics.total_ms = Date.now() - startTime;
        return {
          success: false,
          balancedCount: 0,
          imbalancedCount: 0,
          errors: ['Duplicate file: this exact file has already been uploaded for this period. Upload a different file or make corrections first.'],
          perfMetrics,
        };
      }
    } catch {
      // gl_upload_history table may not exist yet — continue without duplicate check
    }

    // Date range validation: flag entries dated outside the close period
    const dateWarnings: string[] = [];
    const periodMatch = periodLabel.match(/^(\d{4})-(\d{2})$/);
    if (periodMatch) {
      const year = parseInt(periodMatch[1], 10);
      const month = parseInt(periodMatch[2], 10);
      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0); // last day of month
      let outOfRange = 0;
      for (const line of lines) {
        if (line.entry_date) {
          const d = new Date(line.entry_date);
          if (d < periodStart || d > periodEnd) {
            outOfRange++;
          }
        }
      }
      if (outOfRange > 0) {
        dateWarnings.push(`${outOfRange} GL line(s) have dates outside the period ${periodLabel}. Review for accuracy.`);
      }
    }

    const validateStart = Date.now();
    const validation = await validateGLEntries(pool, tenantId, lines, 0.01, isRegisterFormat);
    perfMetrics.validate_ms = Date.now() - validateStart;

    // Include date warnings in validation errors (non-blocking for now, just warnings)
    if (dateWarnings.length > 0 && !validation.errors.length) {
      // Attach as warnings rather than blocking errors
      (validation as { warnings?: string[] }).warnings = dateWarnings;
    }

    if (validation.errors.length > 0) {
      perfMetrics.total_ms = Date.now() - startTime;
      return {
        success: false,
        balancedCount: 0,
        imbalancedCount: validation.imbalancedEntries.length,
        imbalancedEntries:
          validation.imbalancedEntries.length > 0
            ? validation.imbalancedEntries.map((ie) => ({
                entry_id: ie.entry.entry_id,
                totalDebits: ie.totalDebits,
                totalCredits: ie.totalCredits,
                imbalance: ie.imbalance,
                lines: ie.entry.lines,
              }))
            : undefined,
        errors: validation.errors,
        perfMetrics,
      };
    }

    if (validation.balancedEntries.length > 0) {
      const balancedLines = validation.balancedEntries.flatMap((e) => e.lines);
      const saveStart = Date.now();
      await glRepository.upsertGLForPeriod(pool, tenantId, periodLabel, balancedLines, {
        createdBy: uploadedBy,
      });
      perfMetrics.save_ms = Date.now() - saveStart;

      const tbStart = Date.now();
      await deriveAndPersistTB(pool, tenantId, periodLabel, uploadedBy);
      perfMetrics.derive_tb_ms = Date.now() - tbStart;

      // Record file hash for duplicate detection on subsequent uploads
      try {
        await pool.query(
          `INSERT INTO gl_upload_history (tenant_id, period_label, file_hash, uploaded_by, uploaded_at, row_count)
           VALUES ($1, $2, $3, $4, NOW(), $5)
           ON CONFLICT DO NOTHING`,
          [tenantId, periodLabel, fileHash, uploadedBy, lines.length]
        );
      } catch {
        // Non-critical: table may not exist yet
      }
    }

    const imbalancedSummary =
      validation.imbalancedEntries.length > 0
        ? validation.imbalancedEntries.map((ie) => ({
            entry_id: ie.entry.entry_id,
            totalDebits: ie.totalDebits,
            totalCredits: ie.totalCredits,
            imbalance: ie.imbalance,
            lines: ie.entry.lines,
          }))
        : undefined;

    const stagedIds: string[] = [];
    if (validation.imbalancedEntries.length > 0 && pool && tenantId) {
      const stageStart = Date.now();
      for (const ie of validation.imbalancedEntries) {
        try {
          const patternResult = detectPatterns({
            entry_id: ie.entry.entry_id,
            entry_date: ie.entry.entry_date,
            lines: ie.entry.lines.map((l) => ({
              line_number: l.line_number,
              account_code: l.account_code,
              debit: l.debit ?? 0,
              credit: l.credit ?? 0,
              description: l.description,
            })),
            totalDebits: ie.totalDebits,
            totalCredits: ie.totalCredits,
            imbalance: ie.imbalance,
          });
          const summary = getSummary(patternResult);

          const item = await persistence.createStagingItem(pool, tenantId, {
            proposedAction: `GL entry ${ie.entry.entry_id} is imbalanced by ${Math.abs(ie.imbalance).toFixed(2)}. ${summary}`,
            justification: `Pattern: ${patternResult.primary_pattern.pattern_id} (${patternResult.primary_pattern.confidence} confidence). ${patternResult.primary_pattern.likely_cause}`,
            type: 'journal_entry',
            amount: ie.imbalance,
            payload: {
              kind: 'gl_ingest',
              periodLabel,
              entry_id: ie.entry.entry_id,
              entry_date: ie.entry.entry_date,
              totalDebits: ie.totalDebits,
              totalCredits: ie.totalCredits,
              imbalance: ie.imbalance,
              lines: ie.entry.lines.map((line) => ({
                line_number: line.line_number,
                account_code: line.account_code,
                debit: line.debit ?? 0,
                credit: line.credit ?? 0,
                description: line.description,
              })),
              pattern_detection: {
                primary_pattern: patternResult.primary_pattern,
                all_patterns: patternResult.patterns,
                requires_ai: patternResult.requires_ai,
              },
            },
          });
          stagedIds.push(item.id);
        } catch (err) {
          console.error(`Failed to stage imbalanced entry ${ie.entry.entry_id}:`, err);
        }
      }
      perfMetrics.stage_ms = Date.now() - stageStart;
    }

    perfMetrics.total_ms = Date.now() - startTime;

    console.log('GL Upload Performance:', {
      tenant_id: tenantId,
      period: periodLabel,
      total_lines: lines.length,
      balanced_entries: validation.balancedEntries.length,
      imbalanced_entries: validation.imbalancedEntries.length,
      metrics: perfMetrics,
    });

    return {
      success: validation.imbalancedEntries.length === 0,
      balancedCount: validation.balancedEntries.length,
      imbalancedCount: validation.imbalancedEntries.length,
      imbalancedEntries: imbalancedSummary,
      stagedIds: stagedIds.length > 0 ? stagedIds : undefined,
      errors: validation.errors.length > 0 ? validation.errors : undefined,
      perfMetrics,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GL upload failed';
    perfMetrics.total_ms = Date.now() - startTime;
    console.error('GL upload error:', err);
    return {
      success: false,
      balancedCount: 0,
      imbalancedCount: 0,
      errors: [message],
      perfMetrics,
    };
  }
}
