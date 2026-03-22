/**
 * Bank Statement Parser — CSV/OFX format detection and extraction.
 * Parses uploaded bank statements into normalized transaction records.
 * Supports CSV (auto-detect columns), OFX/QFX (XML-based).
 */

import { randomUUID } from 'crypto';
import { from } from '../utils/decimal.js';

export interface ParsedBankTransaction {
  externalId: string;
  transactionDate: string;
  postDate: string | null;
  description: string;
  reference: string | null;
  checkNumber: string | null;
  amount: string;
  transactionType: 'deposit' | 'withdrawal' | 'transfer' | 'fee' | 'interest' | 'check' | 'other';
  counterparty: string | null;
  runningBalance: string | null;
}

export interface ParseResult {
  success: boolean;
  transactions: ParsedBankTransaction[];
  format: 'csv' | 'ofx' | 'qfx' | 'unknown';
  accountIdentifier: string | null;
  statementDate: string | null;
  errors: string[];
}

// --- CSV Parsing ---

interface CsvColumnMap {
  date: number;
  description: number;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  reference: number | null;
  checkNumber: number | null;
  balance: number | null;
  type: number | null;
}

const DATE_HEADER_PATTERNS = /^(date|trans(action)?[\s_-]?date|post[\s_-]?date|posted|value[\s_-]?date)/i;
const DESC_HEADER_PATTERNS = /^(description|memo|narrative|details|payee|particulars)/i;
const AMOUNT_HEADER_PATTERNS = /^(amount|value|sum|total)/i;
const DEBIT_HEADER_PATTERNS = /^(debit|withdrawal|charge|payment|dr)/i;
const CREDIT_HEADER_PATTERNS = /^(credit|deposit|receipt|cr)/i;
const REF_HEADER_PATTERNS = /^(ref(erence)?|trans(action)?[\s_-]?(id|number|no|ref)|fitid)/i;
const CHECK_HEADER_PATTERNS = /^(check[\s_-]?(number|no|num)?|cheque)/i;
const BALANCE_HEADER_PATTERNS = /^(balance|running[\s_-]?balance|available)/i;
const TYPE_HEADER_PATTERNS = /^(type|category|trans(action)?[\s_-]?type)/i;

function detectCsvColumns(headers: string[]): CsvColumnMap | null {
  const normalized = headers.map((h) => h.trim());
  let date = -1, description = -1, amount: number | null = null;
  let debit: number | null = null, credit: number | null = null;
  let reference: number | null = null, checkNumber: number | null = null;
  let balance: number | null = null, type: number | null = null;

  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i];
    if (date < 0 && DATE_HEADER_PATTERNS.test(h)) date = i;
    else if (description < 0 && DESC_HEADER_PATTERNS.test(h)) description = i;
    else if (amount == null && AMOUNT_HEADER_PATTERNS.test(h)) amount = i;
    else if (debit == null && DEBIT_HEADER_PATTERNS.test(h)) debit = i;
    else if (credit == null && CREDIT_HEADER_PATTERNS.test(h)) credit = i;
    else if (reference == null && REF_HEADER_PATTERNS.test(h)) reference = i;
    else if (checkNumber == null && CHECK_HEADER_PATTERNS.test(h)) checkNumber = i;
    else if (balance == null && BALANCE_HEADER_PATTERNS.test(h)) balance = i;
    else if (type == null && TYPE_HEADER_PATTERNS.test(h)) type = i;
  }

  if (date < 0 || description < 0) return null;
  if (amount == null && debit == null && credit == null) return null;

  return { date, description, amount, debit, credit, reference, checkNumber, balance, type };
}

function parseDate(dateStr: string): string | null {
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  // US format (MM/DD/YYYY or M/D/YYYY)
  const usMatch = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  // Try Date constructor as fallback
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseAmount(amountStr: string): number {
  if (!amountStr || !amountStr.trim()) return 0;
  // Remove currency symbols, commas, spaces
  const cleaned = amountStr.replace(/[$€£¥,\s]/g, '').replace(/\((.+)\)/, '-$1');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function classifyTransactionType(
  description: string,
  amount: number,
  typeHint: string | null
): ParsedBankTransaction['transactionType'] {
  if (typeHint) {
    const t = typeHint.toLowerCase();
    if (t.includes('fee') || t.includes('charge')) return 'fee';
    if (t.includes('interest')) return 'interest';
    if (t.includes('transfer')) return 'transfer';
    if (t.includes('check') || t.includes('cheque')) return 'check';
  }
  const desc = description.toLowerCase();
  if (desc.includes('fee') || desc.includes('service charge')) return 'fee';
  if (desc.includes('interest')) return 'interest';
  if (desc.includes('transfer') || desc.includes('xfer')) return 'transfer';
  if (desc.includes('check') || desc.includes('cheque')) return 'check';
  return amount >= 0 ? 'deposit' : 'withdrawal';
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCsv(content: string, sourceFileName?: string): ParseResult {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { success: false, transactions: [], format: 'csv', accountIdentifier: null, statementDate: null, errors: ['File has fewer than 2 lines'] };
  }

  const headers = parseCsvLine(lines[0]);
  const columnMap = detectCsvColumns(headers);
  if (!columnMap) {
    return {
      success: false,
      transactions: [],
      format: 'csv',
      accountIdentifier: null,
      statementDate: null,
      errors: ['Could not detect required columns (date, description, amount/debit/credit). Expected headers like: Date, Description, Amount'],
    };
  }

  const transactions: ParsedBankTransaction[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 2) continue; // skip blank lines

    const dateStr = fields[columnMap.date] ?? '';
    const date = parseDate(dateStr);
    if (!date) {
      errors.push(`Row ${i + 1}: invalid date "${dateStr}"`);
      continue;
    }

    const description = fields[columnMap.description] ?? '';
    let amount: number;

    if (columnMap.amount != null) {
      amount = parseAmount(fields[columnMap.amount] ?? '');
    } else {
      const debitVal = parseAmount(fields[columnMap.debit!] ?? '');
      const creditVal = parseAmount(fields[columnMap.credit!] ?? '');
      amount = creditVal > 0 ? creditVal : -debitVal;
    }

    const amountDecimal = from(amount).toDecimalPlaces(2);
    const reference = columnMap.reference != null ? (fields[columnMap.reference] ?? null) : null;
    const checkNumber = columnMap.checkNumber != null ? (fields[columnMap.checkNumber] ?? null) : null;
    const runningBalance = columnMap.balance != null ? (fields[columnMap.balance] ?? null) : null;
    const typeHint = columnMap.type != null ? (fields[columnMap.type] ?? null) : null;

    transactions.push({
      externalId: reference?.trim() || `${sourceFileName ?? 'csv'}-row-${i}`,
      transactionDate: date,
      postDate: null,
      description: description.trim(),
      reference: reference?.trim() || null,
      checkNumber: checkNumber?.trim() || null,
      amount: amountDecimal.toNumber().toString(),
      transactionType: classifyTransactionType(description, amount, typeHint),
      counterparty: null,
      runningBalance: runningBalance ? from(parseAmount(runningBalance)).toDecimalPlaces(2).toNumber().toString() : null,
    });
  }

  return {
    success: transactions.length > 0,
    transactions,
    format: 'csv',
    accountIdentifier: null,
    statementDate: transactions.length > 0 ? transactions[transactions.length - 1].transactionDate : null,
    errors,
  };
}

// --- OFX/QFX Parsing ---

function extractOFXValue(content: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}>([^<\\n]+)`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function parseOFXDate(dateStr: string): string | null {
  if (!dateStr) return null;
  // OFX dates: YYYYMMDD or YYYYMMDDHHMMSS
  const m = dateStr.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return parseDate(dateStr);
}

function parseOFXTransactionType(trntype: string | null): ParsedBankTransaction['transactionType'] {
  if (!trntype) return 'other';
  const t = trntype.toUpperCase();
  if (t === 'CREDIT' || t === 'DEP') return 'deposit';
  if (t === 'DEBIT' || t === 'POS') return 'withdrawal';
  if (t === 'XFER') return 'transfer';
  if (t === 'SRVCHG' || t === 'FEE') return 'fee';
  if (t === 'INT' || t === 'DIV') return 'interest';
  if (t === 'CHECK') return 'check';
  return 'other';
}

export function parseOFX(content: string): ParseResult {
  const isQFX = content.includes('INTU.BID');
  const format = isQFX ? 'qfx' : 'ofx';

  // Extract account identifier
  const accountId = extractOFXValue(content, 'ACCTID');

  // Extract statement date
  const dtEnd = extractOFXValue(content, 'DTEND');
  const statementDate = dtEnd ? parseOFXDate(dtEnd) : null;

  // Extract transactions
  const transactions: ParsedBankTransaction[] = [];
  const errors: string[] = [];

  // Split by STMTTRN blocks
  const trnBlocks = content.split(/<STMTTRN>/i).slice(1);

  for (let i = 0; i < trnBlocks.length; i++) {
    const block = trnBlocks[i];
    const endIdx = block.indexOf('</STMTTRN>');
    const trnContent = endIdx > 0 ? block.slice(0, endIdx) : block;

    const trntype = extractOFXValue(trnContent, 'TRNTYPE');
    const dtposted = extractOFXValue(trnContent, 'DTPOSTED');
    const trnamt = extractOFXValue(trnContent, 'TRNAMT');
    const fitid = extractOFXValue(trnContent, 'FITID');
    const name = extractOFXValue(trnContent, 'NAME') ?? extractOFXValue(trnContent, 'MEMO') ?? '';
    const checknum = extractOFXValue(trnContent, 'CHECKNUM');

    const date = parseOFXDate(dtposted ?? '');
    if (!date) {
      errors.push(`Transaction ${i + 1}: invalid date`);
      continue;
    }

    const amount = trnamt ? parseAmount(trnamt) : 0;
    const amountDecimal = from(amount).toDecimalPlaces(2);

    transactions.push({
      externalId: fitid ?? `ofx-${i}`,
      transactionDate: date,
      postDate: date,
      description: name.trim(),
      reference: fitid,
      checkNumber: checknum?.trim() || null,
      amount: amountDecimal.toNumber().toString(),
      transactionType: parseOFXTransactionType(trntype),
      counterparty: null,
      runningBalance: null,
    });
  }

  return {
    success: transactions.length > 0,
    transactions,
    format,
    accountIdentifier: accountId,
    statementDate,
    errors,
  };
}

// --- Format Detection & Dispatch ---

export function detectFormat(content: string): 'csv' | 'ofx' | 'qfx' | 'unknown' {
  const trimmed = content.trim();
  if (trimmed.includes('<OFX>') || trimmed.includes('<OFX>') || trimmed.startsWith('OFXHEADER')) return 'ofx';
  if (trimmed.includes('INTU.BID')) return 'qfx';
  // Check for CSV: first line should have comma-separated headers
  const firstLine = trimmed.split(/\r?\n/)[0] ?? '';
  if (firstLine.includes(',') && !firstLine.includes('<')) return 'csv';
  return 'unknown';
}

export function parseBankStatement(content: string, sourceFileName?: string): ParseResult {
  const format = detectFormat(content);
  switch (format) {
    case 'csv':
      return parseCsv(content, sourceFileName);
    case 'ofx':
    case 'qfx':
      return parseOFX(content);
    default:
      return {
        success: false,
        transactions: [],
        format: 'unknown',
        accountIdentifier: null,
        statementDate: null,
        errors: ['Unsupported file format. Supported: CSV, OFX, QFX'],
      };
  }
}
