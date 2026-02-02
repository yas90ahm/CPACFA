/**
 * Robust file-parsing agent for .xlsx (multi-tab), .csv, .pdf (OCR), and .json.
 * Auto-detects file type, classifies content (bank statement vs tax form), routes to specialist,
 * and applies autonomous data cleaning (US/UK dates, parentheses for negatives).
 *
 * Scope: .xlsx (multi-tab), .csv, .pdf (text/OCR via pdf-parse), .json.
 * For production PDF/OCR and advanced chunking, integrate Unstructured (Python) or LlamaIndex
 * via a backend service or MCP tool.
 */

import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import type { SourceProvenance } from '../types/canonical_ap_ar_payroll.js';
import { classifyIngestionAgentic, normalizeByMapping } from './agentic_ingestion_classifier.js';
import { runOcr, ocrResultToRawText, ocrResultToRows } from './ocr_service.js';

// --- Types ---

export type DetectedFileType = 'xlsx' | 'csv' | 'pdf' | 'json' | 'image' | 'unknown';

export type DocumentClassification =
  | 'bank_statement'
  | 'tax_form'
  | 'trial_balance'
  | 'general_ledger'
  | 'accounts_payable'
  | 'accounts_receivable'
  | 'payroll'
  | 'other';

export type SpecialistRoute =
  | 'Reconciliation Specialist'
  | 'Compliance Specialist'
  | 'Trial Balance Processor'
  | 'General';

/** One sheet/tab or table of parsed data (rows of key-value or array) */
export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: (Record<string, unknown> | unknown[])[];
}

/** Parsed document (multi-tab or single table + optional raw text for PDF) */
export interface ParsedDocument {
  fileType: DetectedFileType;
  filename?: string;
  sheets: ParsedSheet[];
  /** Raw text from PDF or first sheet (for classification) */
  rawText: string;
  /** Original buffer length */
  byteLength: number;
}

/** Result of content classification */
export interface ClassificationResult {
  classification: DocumentClassification;
  confidence: number;
  route: SpecialistRoute;
  signals: string[];
}

/** Data-cleaning options */
export interface DataCleaningOptions {
  normalizeNegativeNumbers?: boolean;
  normalizeDates?: boolean;
  /** 'us' = MM/DD/YYYY, 'uk' = DD/MM/YYYY, 'iso' = YYYY-MM-DD output */
  dateOutputFormat?: 'us' | 'uk' | 'iso';
}

/** Full agent output */
export interface IngestionAgentResult {
  fileType: DetectedFileType;
  filename?: string;
  classification: DocumentClassification;
  route: SpecialistRoute;
  confidence: number;
  signals: string[];
  jurisdiction?: {
    country?: string;
    jurisdiction?: string;
    currency?: string;
    taxId?: string;
    businessNumber?: string;
  };
  normalized?: {
    apItems?: NormalizedApItem[];
    arItems?: NormalizedArItem[];
    payrollItems?: NormalizedPayrollItem[];
  };
  parsed: ParsedDocument;
  cleanedSheets: ParsedSheet[];
  cleaningApplied: string[];
  errors: string[];
}

/** Canonical AP item — full field set for agentic normalization */
export interface NormalizedApItem {
  vendor?: string;
  vendorId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  amount?: number;
  totalAmount?: number;
  taxAmount?: number;
  currency?: string;
  status?: 'open' | 'paid' | 'partial' | 'overdue';
  lineDescription?: string;
  poNumber?: string;
  provenance?: SourceProvenance;
}

/** Canonical AR item — full field set */
export interface NormalizedArItem {
  customer?: string;
  customerId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  amount?: number;
  totalAmount?: number;
  taxAmount?: number;
  currency?: string;
  status?: 'open' | 'paid' | 'partial' | 'overdue';
  lineDescription?: string;
  provenance?: SourceProvenance;
}

/** Canonical Payroll item — full field set */
export interface NormalizedPayrollItem {
  employee?: string;
  employeeId?: string;
  payDate?: string;
  payPeriodStart?: string;
  payPeriodEnd?: string;
  grossPay?: number;
  netPay?: number;
  taxes?: number;
  benefits?: number;
  deductions?: number;
  currency?: string;
  department?: string;
  provenance?: SourceProvenance;
}

// --- File type detection ---

const MAGIC = {
  pdf: Buffer.from('%PDF'),
  xlsx: Buffer.from('PK'), // ZIP
  json: (b: Buffer) => {
    const s = b.slice(0, 512).toString('utf8').trim();
    return (s.startsWith('{') || s.startsWith('[')) && /^[\s\[\{]|[\]\}\s]$/.test(s);
  },
};

/**
 * Auto-detect file type from buffer and optional filename.
 */
export function detectFileType(buffer: Buffer, filename?: string): DetectedFileType {
  const ext = filename ? filename.toLowerCase().split('.').pop()?.trim() : '';
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  if (ext === 'csv') return 'csv';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'json') return 'json';
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return 'image';

  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(MAGIC.pdf)) return 'pdf';
  if (buffer.length >= 2 && buffer.subarray(0, 2).equals(MAGIC.xlsx)) return 'xlsx';
  if (MAGIC.json(buffer)) return 'json';
  // CSV heuristic: first line has commas, no { or [
  const first = buffer.slice(0, 1024).toString('utf8');
  if (first.includes(',') && !first.trimStart().startsWith('{') && !first.trimStart().startsWith('[')) {
    return 'csv';
  }
  return 'unknown';
}

// --- Parsers ---

/**
 * Parse XLSX buffer (multi-tab). Returns one ParsedSheet per sheet.
 */
export function parseXlsx(buffer: Buffer): ParsedDocument {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheets: ParsedSheet[] = [];
  let rawText = '';
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
    const headerRow = rows.length > 0 ? rows[0].map((c) => String(c ?? '').trim()) : [];
    const dataRows = rows.slice(1);
    const asRecords: Record<string, unknown>[] = dataRows.map((row) => {
      const rec: Record<string, unknown> = {};
      headerRow.forEach((h, i) => {
        rec[h || `col_${i}`] = row[i];
      });
      return rec;
    });
    sheets.push({ name, headers: headerRow, rows: asRecords });
    rawText += headerRow.join(' ') + ' ' + dataRows.flat().map(String).join(' ') + '\n';
  }
  return {
    fileType: 'xlsx',
    sheets,
    rawText: rawText.slice(0, 10000),
    byteLength: buffer.length,
  };
}

/**
 * Parse CSV buffer. Single "sheet" with headers and rows.
 */
export function parseCsv(buffer: Buffer): ParsedDocument {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];
  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  const sheet: ParsedSheet = { name: 'Sheet1', headers, rows: records };
  const rawText = headers.join(' ') + ' ' + JSON.stringify(records).slice(0, 8000);
  return {
    fileType: 'csv',
    sheets: [sheet],
    rawText,
    byteLength: buffer.length,
  };
}

/**
 * Parse JSON buffer. Treated as single sheet (array of objects or wrapped).
 */
export function parseJson(buffer: Buffer): ParsedDocument {
  const text = buffer.toString('utf8');
  const data = JSON.parse(text) as unknown;
  const rows = Array.isArray(data) ? data : typeof data === 'object' && data !== null ? [data] : [];
  const first = rows[0];
  const headers =
    typeof first === 'object' && first !== null && !Array.isArray(first)
      ? Object.keys(first as Record<string, unknown>)
      : [];
  const sheet: ParsedSheet = { name: 'data', headers, rows: rows as Record<string, unknown>[] };
  const rawText = text.slice(0, 10000);
  return {
    fileType: 'json',
    sheets: [sheet],
    rawText,
    byteLength: buffer.length,
  };
}

/**
 * Parse PDF buffer — full OCR pipeline with retries, then pdf-parse fallback.
 */
export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  const ocrResult = await runOcr(buffer, { maxRetries: 3 });
  if (ocrResult.text || (ocrResult.pages?.length ?? 0) > 0 || (ocrResult.regions?.length ?? 0) > 0) {
    const rows = ocrResultToRows(ocrResult);
    const sheet: ParsedSheet = {
      name: 'pdf_text',
      headers: ['text', 'page'],
      rows: rows as (Record<string, unknown> | unknown[])[],
    };
    return {
      fileType: 'pdf',
      sheets: [sheet],
      rawText: ocrResultToRawText(ocrResult, 10000),
      byteLength: buffer.length,
    };
  }
  try {
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = (pdfParseModule as { default?: (buf: Buffer) => Promise<{ text: string; numpages: number }> }).default;
    if (!pdfParse) throw new Error('pdf-parse not available');
    const data = await pdfParse(buffer);
    const text = (data.text ?? '').trim();
    const sheet: ParsedSheet = {
      name: 'pdf_text',
      headers: ['text', 'page'],
      rows: text ? [{ text: text.slice(0, 50000), page: 1 }] : [],
    };
    return {
      fileType: 'pdf',
      sheets: [sheet],
      rawText: text.slice(0, 10000),
      byteLength: buffer.length,
    };
  } catch {
    return {
      fileType: 'pdf',
      sheets: [{ name: 'pdf_text', headers: [], rows: [] }],
      rawText: ocrResult.error ?? '(PDF text extraction not available; install pdf-parse or set OCR_SERVICE_URL)',
      byteLength: buffer.length,
    };
  }
}

/**
 * Parse image buffer — full OCR pipeline with retries and structured output.
 */
export async function parseImage(buffer: Buffer): Promise<ParsedDocument> {
  const ocrResult = await runOcr(buffer, { maxRetries: 3 });
  const rows = ocrResultToRows(ocrResult);
  const sheet: ParsedSheet = {
    name: 'image_text',
    headers: ['text', 'page'],
    rows: rows as (Record<string, unknown> | unknown[])[],
  };
  return {
    fileType: 'image',
    sheets: [sheet],
    rawText: ocrResultToRawText(ocrResult, 10000),
    byteLength: buffer.length,
  };
}

/**
 * Parse buffer by detected type. PDF is async; others sync.
 */
export function parseFileSync(buffer: Buffer, fileType: DetectedFileType): ParsedDocument {
  switch (fileType) {
    case 'xlsx':
      return parseXlsx(buffer);
    case 'csv':
      return parseCsv(buffer);
    case 'json':
      return parseJson(buffer);
    case 'image':
      return {
        fileType: 'image',
        sheets: [{ name: 'image_text', headers: [], rows: [] }],
        rawText: buffer.slice(0, 2000).toString('utf8'),
        byteLength: buffer.length,
      };
    case 'pdf':
    case 'unknown':
    default:
      return {
        fileType: 'unknown',
        sheets: [],
        rawText: buffer.slice(0, 2000).toString('utf8'),
        byteLength: buffer.length,
      };
  }
}

export async function parseFile(buffer: Buffer, fileType: DetectedFileType): Promise<ParsedDocument> {
  if (fileType === 'pdf') return parsePdf(buffer);
  if (fileType === 'image') return parseImage(buffer);
  return parseFileSync(buffer, fileType);
}

// --- Classification & routing ---

const BANK_SIGNALS = [
  'bank statement',
  'account number',
  'account no',
  'routing number',
  'balance',
  'withdrawal',
  'deposit',
  'transaction',
  'check',
  'debit',
  'credit',
  'available balance',
  'ledger balance',
  'statement period',
  'opening balance',
  'closing balance',
];

const TAX_SIGNALS = [
  'w-2',
  'w2',
  '1099',
  '1040',
  'tax form',
  'irs',
  'ein',
  'ssn',
  'social security',
  'federal tax',
  'withholding',
  'tax year',
  'adjusted gross',
  'form 1040',
  'form w-2',
  'form 1099',
];

const TB_SIGNALS = [
  'trial balance',
  'account name',
  'account code',
  'debit',
  'credit',
  'gl code',
  'general ledger',
];

/**
 * Classify document from parsed raw text and headers.
 */
export function classifyDocument(parsed: ParsedDocument): ClassificationResult {
  const combined = (parsed.rawText + ' ' + parsed.sheets.flatMap((s) => s.headers).join(' ')).toLowerCase();
  const bankScore = BANK_SIGNALS.filter((s) => combined.includes(s)).length;
  const taxScore = TAX_SIGNALS.filter((s) => combined.includes(s)).length;
  const tbScore = TB_SIGNALS.filter((s) => combined.includes(s)).length;
  const apScore = AP_SIGNALS.filter((s) => combined.includes(s)).length;
  const arScore = AR_SIGNALS.filter((s) => combined.includes(s)).length;
  const payrollScore = PAYROLL_SIGNALS.filter((s) => combined.includes(s)).length;

  const signals: string[] = [];
  if (bankScore > 0) signals.push(...BANK_SIGNALS.filter((s) => combined.includes(s)));
  if (taxScore > 0) signals.push(...TAX_SIGNALS.filter((s) => combined.includes(s)));
  if (tbScore > 0) signals.push(...TB_SIGNALS.filter((s) => combined.includes(s)));

  if (bankScore >= 2 && bankScore >= taxScore && bankScore >= tbScore) {
    return {
      classification: 'bank_statement',
      confidence: Math.min(0.95, 0.5 + bankScore * 0.1),
      route: 'Reconciliation Specialist',
      signals: [...new Set(signals)],
    };
  }
  if (taxScore >= 2 && taxScore >= bankScore && taxScore >= tbScore) {
    return {
      classification: 'tax_form',
      confidence: Math.min(0.95, 0.5 + taxScore * 0.1),
      route: 'Compliance Specialist',
      signals: [...new Set(signals)],
    };
  }
  if (tbScore >= 2) {
    return {
      classification: 'trial_balance',
      confidence: Math.min(0.9, 0.5 + tbScore * 0.1),
      route: 'Trial Balance Processor',
      signals: [...new Set(signals)],
    };
  }
  if (apScore >= 2) {
    return {
      classification: 'accounts_payable',
      confidence: Math.min(0.9, 0.5 + apScore * 0.1),
      route: 'General',
      signals: [...new Set(signals)],
    };
  }
  if (arScore >= 2) {
    return {
      classification: 'accounts_receivable',
      confidence: Math.min(0.9, 0.5 + arScore * 0.1),
      route: 'General',
      signals: [...new Set(signals)],
    };
  }
  if (payrollScore >= 2) {
    return {
      classification: 'payroll',
      confidence: Math.min(0.9, 0.5 + payrollScore * 0.1),
      route: 'General',
      signals: [...new Set(signals)],
    };
  }
  return {
    classification: 'other',
    confidence: 0.3,
    route: 'General',
    signals: [...new Set(signals)].slice(0, 5),
  };
}

// --- Data cleaning ---

/** Normalize a value that may be (1,234.56) or -1,234.56 to number */
function normalizeNegativeNumber(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') return value;
  const s = String(value).trim().replace(/,/g, '');
  if (s === '') return value;
  if (s.startsWith('(') && s.endsWith(')')) {
    const num = parseFloat(s.slice(1, -1));
    return Number.isNaN(num) ? value : -num;
  }
  return value;
}

/** Try to parse US (MM/DD/YYYY) or UK (DD/MM/YYYY) date to ISO (YYYY-MM-DD) */
function normalizeDateString(value: unknown, outputFormat: 'us' | 'uk' | 'iso'): unknown {
  if (value === null || value === undefined) return value;
  const s = String(value).trim();
  if (!s) return value;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (isoMatch) return outputFormat === 'iso' ? s.slice(0, 10) : value;
  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!slashMatch) return value;
  const [, a, b, y] = slashMatch;
  const n1 = parseInt(a!, 10);
  const n2 = parseInt(b!, 10);
  if (n1 > 12 && n2 <= 12) {
    return `${y}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`;
  }
  if (n2 > 12 && n1 <= 12) {
    return `${y}-${String(n1).padStart(2, '0')}-${String(n2).padStart(2, '0')}`;
  }
  const us = n1 <= 12 && n2 <= 31;
  const iso = us ? `${y}-${String(n1).padStart(2, '0')}-${String(n2).padStart(2, '0')}` : `${y}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`;
  if (outputFormat === 'iso') return iso;
  if (outputFormat === 'us') return `${String(n1).padStart(2, '0')}/${String(n2).padStart(2, '0')}/${y}`;
  return `${String(n2).padStart(2, '0')}/${String(n1).padStart(2, '0')}/${y}`;
}

const DATE_LIKE_HEADERS = ['date', 'transaction date', 'posting date', 'value date', 'doc date', 'period', 'tax year', 'fiscal year'];

function isDateHeader(header: string): boolean {
  const h = header.toLowerCase().trim();
  return DATE_LIKE_HEADERS.some((d) => h.includes(d)) || /\bdate\b/.test(h) || /\bday\b/.test(h);
}

function isAmountHeader(header: string): boolean {
  const h = header.toLowerCase().trim();
  return (
    /\b(amount|debit|credit|balance|sum|total|quantity|qty)\b/.test(h) ||
    h === 'dr' ||
    h === 'cr' ||
    h.endsWith('amount') ||
    h.endsWith('balance')
  );
}

/**
 * Apply autonomous data cleaning: parentheses for negatives, US/UK date normalization.
 */
export function cleanData(
  sheets: ParsedSheet[],
  options: DataCleaningOptions = {}
): { cleanedSheets: ParsedSheet[]; applied: string[] } {
  const {
    normalizeNegativeNumbers = true,
    normalizeDates = true,
    dateOutputFormat = 'iso',
  } = options;
  const applied: string[] = [];
  const cleanedSheets: ParsedSheet[] = sheets.map((sheet) => {
    const rows = sheet.rows.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const rec: unknown[] | Record<string, unknown> = Array.isArray(row)
        ? (row as unknown[]).slice()
        : { ...(row as Record<string, unknown>) };
      if (Array.isArray(rec)) {
        sheet.headers.forEach((header, i) => {
          if (normalizeNegativeNumbers && isAmountHeader(header)) {
            const v = normalizeNegativeNumber(rec[i]);
            if (v !== rec[i]) {
              rec[i] = v;
              if (!applied.includes('negative_numbers')) applied.push('negative_numbers');
            }
          }
          if (normalizeDates && isDateHeader(header)) {
            const v = normalizeDateString(rec[i], dateOutputFormat);
            if (v !== rec[i]) {
              rec[i] = v;
              if (!applied.includes('dates')) applied.push('dates');
            }
          }
        });
        return rec;
      }
      const obj = rec as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        if (normalizeNegativeNumbers && isAmountHeader(key)) {
          obj[key] = normalizeNegativeNumber(obj[key]);
          if (!applied.includes('negative_numbers')) applied.push('negative_numbers');
        }
        if (normalizeDates && isDateHeader(key)) {
          obj[key] = normalizeDateString(obj[key], dateOutputFormat);
          if (!applied.includes('dates')) applied.push('dates');
        }
      }
      return obj;
    });
    return { name: sheet.name, headers: sheet.headers, rows };
  });
  return { cleanedSheets, applied };
}

function normalizeByClassification(
  classification: DocumentClassification,
  sheets: ParsedSheet[]
): IngestionAgentResult['normalized'] {
  if (classification === 'accounts_payable') {
    return { apItems: normalizeApItems(sheets) };
  }
  if (classification === 'accounts_receivable') {
    return { arItems: normalizeArItems(sheets) };
  }
  if (classification === 'payroll') {
    return { payrollItems: normalizePayrollItems(sheets) };
  }
  return undefined;
}

function normalizeApItems(sheets: ParsedSheet[]): NormalizedApItem[] {
  return normalizeItems(sheets, (row, headers, sheetName, rowIndex) => ({
    vendor: pickValue(row, headers, ['vendor', 'supplier', 'payee']),
    invoiceNumber: pickValue(row, headers, ['invoice', 'invoice number', 'bill', 'bill number']),
    invoiceDate: pickValue(row, headers, ['invoice date', 'bill date', 'date']),
    dueDate: pickValue(row, headers, ['due date', 'payment due', 'due']),
    amount: pickNumber(row, headers, ['amount', 'balance', 'total', 'amt']),
    currency: pickValue(row, headers, ['currency', 'curr']),
    provenance: { sourceSheet: sheetName, sourceRowIndex: rowIndex },
  }));
}

function normalizeArItems(sheets: ParsedSheet[]): NormalizedArItem[] {
  return normalizeItems(sheets, (row, headers, sheetName, rowIndex) => ({
    customer: pickValue(row, headers, ['customer', 'client', 'payer']),
    invoiceNumber: pickValue(row, headers, ['invoice', 'invoice number']),
    invoiceDate: pickValue(row, headers, ['invoice date', 'date']),
    dueDate: pickValue(row, headers, ['due date', 'payment due', 'due']),
    amount: pickNumber(row, headers, ['amount', 'balance', 'total', 'amt']),
    currency: pickValue(row, headers, ['currency', 'curr']),
    provenance: { sourceSheet: sheetName, sourceRowIndex: rowIndex },
  }));
}

function normalizePayrollItems(sheets: ParsedSheet[]): NormalizedPayrollItem[] {
  return normalizeItems(sheets, (row, headers, sheetName, rowIndex) => ({
    employee: pickValue(row, headers, ['employee', 'employee name', 'name']),
    payDate: pickValue(row, headers, ['pay date', 'payroll date', 'date']),
    grossPay: pickNumber(row, headers, ['gross', 'gross pay']),
    netPay: pickNumber(row, headers, ['net', 'net pay']),
    taxes: pickNumber(row, headers, ['tax', 'taxes', 'withholding']),
    benefits: pickNumber(row, headers, ['benefits', 'deductions']),
    provenance: { sourceSheet: sheetName, sourceRowIndex: rowIndex },
  }));
}

function normalizeItems<T>(
  sheets: ParsedSheet[],
  mapper: (
    row: Record<string, unknown> | unknown[],
    headers: string[],
    sheetName: string,
    rowIndex: number
  ) => T
): T[] {
  const out: T[] = [];
  for (const sheet of sheets) {
    sheet.rows.forEach((row, rowIndex) => {
      if (!row) return;
      out.push(mapper(row, sheet.headers, sheet.name, rowIndex));
    });
  }
  return out;
}

function pickValue(
  row: Record<string, unknown> | unknown[],
  headers: string[],
  keys: string[]
): string | undefined {
  const v = getRowValue(row, headers, keys);
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function pickNumber(
  row: Record<string, unknown> | unknown[],
  headers: string[],
  keys: string[]
): number | undefined {
  const v = getRowValue(row, headers, keys);
  if (v == null) return undefined;
  const num = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(num) ? num : undefined;
}

function getRowValue(
  row: Record<string, unknown> | unknown[],
  headers: string[],
  keys: string[]
): unknown {
  if (Array.isArray(row)) {
    const headerMap = headers.map((h) => h.toLowerCase().trim());
    const idx = headerMap.findIndex((h) => keys.some((k) => h === k || h.includes(k)));
    return idx >= 0 ? row[idx] : undefined;
  }
  const obj = row as Record<string, unknown>;
  const entries = Object.entries(obj);
  const hit = entries.find(([k]) => keys.some((key) => k.toLowerCase().trim().includes(key)));
  return hit ? hit[1] : undefined;
}

// --- Full agent pipeline ---

/**
 * Run the full ingestion agent: detect type → parse → classify → route → clean.
 */
export async function runIngestionAgent(
  buffer: Buffer,
  options: { filename?: string; dataCleaning?: DataCleaningOptions } = {}
): Promise<IngestionAgentResult> {
  const errors: string[] = [];
  const fileType = detectFileType(buffer, options.filename);
  if (fileType === 'unknown') errors.push('File type could not be detected.');

  const parsed = await parseFile(buffer, fileType);
  if (options.filename) parsed.filename = options.filename;

  const classification = classifyDocument(parsed);
  const { cleanedSheets, applied: cleaningApplied } = cleanData(parsed.sheets, options.dataCleaning ?? {});
  const jurisdiction = extractJurisdictionMetadata(parsed);
  const firstSheet = cleanedSheets[0];
  const sampleRow = firstSheet?.rows?.[0] ?? {};
  const agentic = await classifyIngestionAgentic({
    headers: firstSheet?.headers ?? [],
    sampleRow,
  });
  const normalized = agentic?.schemaMapping
    ? normalizeByMapping(agentic.schemaMapping, cleanedSheets)
    : normalizeByClassification(classification.classification, cleanedSheets);

  return {
    fileType,
    filename: options.filename,
    classification: agentic?.classification ?? classification.classification,
    route: classification.route,
    confidence: agentic?.confidence ?? classification.confidence,
    signals: classification.signals,
    jurisdiction,
    normalized,
    parsed,
    cleanedSheets,
    cleaningApplied,
    errors,
  };
}

const AP_SIGNALS = ['ap aging', 'accounts payable', 'vendor', 'invoice', 'bill', 'due date'];
const AR_SIGNALS = ['ar aging', 'accounts receivable', 'customer', 'invoice', 'due date'];
const PAYROLL_SIGNALS = ['payroll', 'employee', 'gross pay', 'net pay', 'taxes', 'benefits'];

function extractJurisdictionMetadata(parsed: ParsedDocument): {
  country?: string;
  jurisdiction?: string;
  currency?: string;
  taxId?: string;
  businessNumber?: string;
} {
  const text = (parsed.rawText ?? '').toLowerCase();
  const headers = parsed.sheets.flatMap((s) => s.headers.map((h) => h.toLowerCase()));
  const all = [text, ...headers].join(' ');

  const currency = /cad\b/.test(all)
    ? 'CAD'
    : /usd\b/.test(all)
      ? 'USD'
      : /gbp\b/.test(all)
        ? 'GBP'
        : /eur\b/.test(all)
          ? 'EUR'
          : undefined;

  const country = /canada|canadian|\bca\b/.test(all)
    ? 'Canada'
    : /united states|u\.s\.|usa|\bus\b/.test(all)
      ? 'United States'
      : /united kingdom|\buk\b|great britain|england|scotland|wales|northern ireland/.test(all)
        ? 'United Kingdom'
        : undefined;

  const taxId =
    /ein\s*[:#]?\s*\d{2}-\d{7}/i.exec(all)?.[0] ||
    /vat\s*(no\.|number|#)?\s*[a-z]{0,2}\d{8,12}/i.exec(all)?.[0] ||
    undefined;

  const businessNumber =
    /business\s*number\s*[:#]?\s*\d{9}/i.exec(all)?.[0] ||
    /bn\s*[:#]?\s*\d{9}/i.exec(all)?.[0] ||
    undefined;

  return {
    country,
    jurisdiction: country,
    currency,
    taxId,
    businessNumber,
  };
}
