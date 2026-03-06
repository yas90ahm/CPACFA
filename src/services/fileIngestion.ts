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

/** Known TB / GL header names for scoring rows to find the real header. */
const KNOWN_TB_HEADERS = new Set([
  'account', 'account code', 'account name', 'account number', 'account #',
  'account id', 'gl account', 'description', 'debit', 'credit', 'dr', 'cr',
  'debits', 'credits', 'debit amount', 'credit amount', 'balance', 'amount',
  'ending balance', 'beginning balance', 'net balance', 'period', 'date',
  'accountcode', 'accountname', 'glaccount',
]);

/** Score a row: how many cells look like recognized column headers? */
function scoreTBHeaderRow(cells: unknown[]): number {
  let score = 0;
  for (const cell of cells) {
    if (cell == null || String(cell).trim() === '') continue;
    const norm = String(cell).trim().toLowerCase().replace(/[_\-#]+/g, ' ').replace(/\s+/g, ' ');
    if (KNOWN_TB_HEADERS.has(norm)) { score += 2; continue; }
    for (const kh of KNOWN_TB_HEADERS) {
      if (kh.length >= 4 && (norm.includes(kh) || kh.includes(norm))) { score += 1; break; }
    }
  }
  return score;
}

/** Find the header row index among the first 20 rows by scoring header keyword matches. */
function findTBHeaderRowIndex(rows: unknown[][]): number {
  const scanLimit = Math.min(rows.length, 20);
  let bestIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i];
    if (!row || row.every(c => c == null || String(c).trim() === '')) continue;
    const s = scoreTBHeaderRow(row);
    if (s > bestScore) { bestScore = s; bestIdx = i; }
  }
  return bestScore >= 3 ? bestIdx : 0;
}

/**
 * Parse XLSX buffer — first sheet, auto-detect header row.
 * Handles junk rows above headers and single-column CSV-pasted-into-Excel.
 * Standardizes column names via parser_utils for messy bank/export formats.
 * Sets needsAgenticMapping when no canonical debit/credit or amount column was found.
 */
export function parseXlsxToTrialBalance(buffer: Buffer): IngestTrialBalanceResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], headers: [], needsAgenticMapping: false };

  const sheet = workbook.Sheets[sheetName];
  let data = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  }) as unknown[][];

  if (data.length < 2) return { rows: [], headers: [], needsAgenticMapping: false };

  // Detect single-column CSV-pasted-into-Excel
  const maxCols = Math.max(...data.slice(0, 10).map(r => (r as unknown[]).filter(c => c != null && String(c).trim() !== '').length));
  if (maxCols === 1) {
    const hasComma = data.find(r => {
      const cells = r as unknown[];
      return cells.length > 0 && cells[0] != null && String(cells[0]).includes(',');
    });
    if (hasComma) {
      data = data.map(r => {
        const cells = r as unknown[];
        const val = cells.length > 0 ? String(cells[0] ?? '') : '';
        if (!val.trim()) return [''];
        const parts: string[] = [];
        let current = '';
        let inQuotes = false;
        for (const ch of val) {
          if (ch === '"') { inQuotes = !inQuotes; continue; }
          if (ch === ',' && !inQuotes) { parts.push(current.trim()); current = ''; continue; }
          current += ch;
        }
        parts.push(current.trim());
        return parts;
      });
    }
  }

  // Find the real header row (skip junk rows like company name, report title, blanks)
  const headerIdx = findTBHeaderRowIndex(data);
  const headerRow = (data[headerIdx] as unknown[]).map((c) => String(c ?? '').trim());
  const records: Record<string, unknown>[] = [];
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[] | undefined;
    if (!row || row.every(c => c == null || String(c).trim() === '')) continue;
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
