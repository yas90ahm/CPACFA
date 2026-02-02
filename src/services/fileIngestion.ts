/**
 * Robust ingestion pipeline for Trial Balance: CSV and XLSX
 * PDF/OCR to be added in a later phase.
 */

import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import type { RawTrialBalanceRow } from './trialBalanceParser.js';

/** Supported MIME types */
export const SUPPORTED_MIMES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls (optional)
] as const;

/** Column name variants we accept (case-insensitive) */
const ACCOUNT_NAME_KEYS = ['accountname', 'account name', 'account', 'name', 'description'];
const ACCOUNT_CODE_KEYS = ['accountcode', 'account code', 'code', 'gl code'];
const DEBIT_KEYS = ['debit', 'debits', 'dr'];
const CREDIT_KEYS = ['credit', 'credits', 'cr'];

function normalizeHeader(h: string): string {
  return String(h ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function findKey(headers: string[], candidates: string[]): string | null {
  const normalized = headers.map(normalizeHeader);
  for (const c of candidates) {
    const idx = normalized.indexOf(c.toLowerCase());
    if (idx >= 0) return headers[idx];
  }
  return null;
}

/**
 * Parse CSV buffer into raw TB rows.
 * Expects columns: account name (or account), debit, credit; optional account code.
 */
export function parseCsvToTrialBalance(buffer: Buffer): RawTrialBalanceRow[] {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];

  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  const accountNameKey = findKey(headers, ACCOUNT_NAME_KEYS) ?? headers[0];
  const accountCodeKey = findKey(headers, ACCOUNT_CODE_KEYS) ?? null;
  const debitKey = findKey(headers, DEBIT_KEYS) ?? 'debit';
  const creditKey = findKey(headers, CREDIT_KEYS) ?? 'credit';

  const rows: RawTrialBalanceRow[] = [];
  for (const row of records) {
    const accountName = String(row[accountNameKey] ?? '').trim();
    if (!accountName) continue;

    const debit = parseNum(row[debitKey]);
    const credit = parseNum(row[creditKey]);

    rows.push({
      accountCode: accountCodeKey ? String(row[accountCodeKey] ?? '').trim() || undefined : undefined,
      accountName,
      debit,
      credit,
    });
  }
  return rows;
}

/**
 * Parse XLSX buffer — first sheet, header row 0.
 */
export function parseXlsxToTrialBalance(buffer: Buffer): RawTrialBalanceRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  }) as unknown[][];

  if (data.length < 2) return [];

  const headerRow = data[0].map((c) => String(c ?? '').trim());
  const accountNameIdx = headerRow.findIndex((h) =>
    ACCOUNT_NAME_KEYS.includes(normalizeHeader(h))
  );
  const accountCodeIdx = headerRow.findIndex((h) =>
    ACCOUNT_CODE_KEYS.includes(normalizeHeader(h))
  );
  const debitIdx = headerRow.findIndex((h) => DEBIT_KEYS.includes(normalizeHeader(h)));
  const creditIdx = headerRow.findIndex((h) => CREDIT_KEYS.includes(normalizeHeader(h)));

  const nameCol = accountNameIdx >= 0 ? accountNameIdx : 0;
  const debitCol = debitIdx >= 0 ? debitIdx : headerRow.length > 1 ? 1 : 1;
  const creditCol = creditIdx >= 0 ? creditIdx : headerRow.length > 2 ? 2 : 2;

  const rows: RawTrialBalanceRow[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const accountName = String((row && row[nameCol]) ?? '').trim();
    if (!accountName) continue;

    rows.push({
      accountCode:
        accountCodeIdx >= 0 && row && row[accountCodeIdx] != null
          ? String(row[accountCodeIdx]).trim() || undefined
          : undefined,
      accountName,
      debit: parseNum(row && row[debitCol]),
      credit: parseNum(row && row[creditCol]),
    });
  }
  return rows;
}

function parseNum(value: unknown): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  const s = String(value ?? '').trim().replace(/,/g, '');
  if (s === '') return 0;
  if (s.startsWith('(') && s.endsWith(')')) return -parseFloat(s.slice(1, -1)) || 0;
  return parseFloat(s) || 0;
}

/**
 * Route buffer by mime type to CSV or XLSX parser.
 */
export function ingestTrialBalanceFile(
  buffer: Buffer,
  mimeType: string
): RawTrialBalanceRow[] {
  const mime = mimeType.toLowerCase().split(';')[0].trim();
  if (mime === 'text/csv') return parseCsvToTrialBalance(buffer);
  if (
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel'
  ) {
    return parseXlsxToTrialBalance(buffer);
  }
  throw new Error(`Unsupported file type: ${mimeType}. Use CSV or XLSX.`);
}
