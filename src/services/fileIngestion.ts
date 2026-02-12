/**
 * Robust ingestion pipeline for Trial Balance: CSV and XLSX
 * Uses parser_utils for canonical column mapping (handles messy headers: Balance, Amt, Dr, Cr).
 * PDF/OCR to be added in a later phase.
 */

import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import type { RawTrialBalanceRow } from './trialBalanceParser.js';
import {
  standardizeColumns,
  standardizedRowsToTrialBalanceRows,
  hasCanonicalDebitCredit,
} from './trial-balance/parser_utils.js';

/** Supported MIME types */
export const SUPPORTED_MIMES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls (optional)
] as const;

export interface IngestTrialBalanceResult {
  rows: RawTrialBalanceRow[];
  /** Raw column headers (for CoA source detection). */
  headers: string[];
  /** True when column cleaning could not find Debit/Credit or Amount; agentic mapping should be triggered. */
  needsAgenticMapping: boolean;
}

/**
 * Parse CSV buffer into raw TB rows.
 * Standardizes column names via parser_utils (handles pathetic CSVs: Balance, Amt, Dr, Cr).
 * Sets needsAgenticMapping when no canonical debit/credit or amount column was found.
 */
export function parseCsvToTrialBalance(buffer: Buffer): IngestTrialBalanceResult {
  const input = buffer.toString('utf8');
  const records = parse(input, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true, // strip BOM so first column is not "\ufeffAccountName"
  }) as Record<string, unknown>[];
  if (records.length === 0) return { rows: [], headers: [], needsAgenticMapping: false };
  const headers = Object.keys(records[0]!);
  const standardized = standardizeColumns(records);
  const needsAgenticMapping = !hasCanonicalDebitCredit(standardized);
  const rows = standardizedRowsToTrialBalanceRows(standardized) as RawTrialBalanceRow[];
  return { rows, headers, needsAgenticMapping };
}

/**
 * Parse XLSX buffer — first sheet, header row 0.
 * Standardizes column names via parser_utils for messy bank/export formats.
 * Sets needsAgenticMapping when no canonical debit/credit or amount column was found.
 */
export function parseXlsxToTrialBalance(buffer: Buffer): IngestTrialBalanceResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], headers: [], needsAgenticMapping: false };

  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  }) as unknown[][];

  if (data.length < 2) return { rows: [], headers: [], needsAgenticMapping: false };

  const headerRow = data[0].map((c) => String(c ?? '').trim());
  const records: Record<string, unknown>[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i] as unknown[] | undefined;
    const obj: Record<string, unknown> = {};
    for (let j = 0; j < headerRow.length; j++) {
      const key = headerRow[j] || `Col${j}`;
      obj[key] = row && row[j] != null ? row[j] : '';
    }
    records.push(obj);
  }
  if (records.length === 0) return { rows: [], headers: [], needsAgenticMapping: false };
  const standardized = standardizeColumns(records);
  const needsAgenticMapping = !hasCanonicalDebitCredit(standardized);
  const rows = standardizedRowsToTrialBalanceRows(standardized) as RawTrialBalanceRow[];
  return { rows, headers: headerRow.filter(Boolean), needsAgenticMapping };
}

/**
 * Route buffer by mime type to CSV or XLSX parser.
 * Returns { rows, needsAgenticMapping }. When needsAgenticMapping is true, trigger agentic column guess
 * and require user confirmation before saving.
 */
export function ingestTrialBalanceFile(buffer: Buffer, mimeType: string): IngestTrialBalanceResult {
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
