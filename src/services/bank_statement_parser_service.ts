/**
 * Bank Statement Parser — CSV/OFX/BAI2 format detection and extraction.
 * Parses uploaded bank statements into normalized transaction records.
 * Supports CSV (auto-detect columns), OFX/QFX (XML-based), BAI2 (commercial bank format).
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
  format: 'csv' | 'ofx' | 'qfx' | 'bai2' | 'unknown';
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

// --- BAI2 Parsing ---

const BAI2_CREDIT_CODES = new Set(['115', '165', '195']);
const BAI2_DEBIT_CODES = new Set(['395', '415', '475', '495']);

function parseBAI2Date(dateStr: string): string | null {
  if (!dateStr || dateStr.length !== 6) return null;
  const yy = dateStr.slice(0, 2);
  const mm = dateStr.slice(2, 4);
  const dd = dateStr.slice(4, 6);
  const year = parseInt(yy, 10) >= 50 ? `19${yy}` : `20${yy}`;
  return `${year}-${mm}-${dd}`;
}

function classifyBAI2TransactionType(
  typeCode: string,
  description: string,
  isCredit: boolean,
): ParsedBankTransaction['transactionType'] {
  if (typeCode === '495') return 'fee';
  if (typeCode === '395') return 'check';
  if (typeCode === '165' || typeCode === '415') {
    if (description.toLowerCase().includes('transfer') || description.toLowerCase().includes('xfer')) return 'transfer';
  }
  return isCredit ? 'deposit' : 'withdrawal';
}

/**
 * Pre-process BAI2 content: handle continuation records (type 88) by appending
 * their content to the preceding record, then split into clean records.
 */
function preprocessBAI2(content: string): string[] {
  const rawLines = content.split(/\r?\n/);
  const merged: string[] = [];

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('88,')) {
      // Continuation record — append to previous line (strip '88,' prefix and trailing '/')
      if (merged.length > 0) {
        const prev = merged[merged.length - 1].replace(/\/\s*$/, '');
        const continuation = line.slice(3).replace(/\/\s*$/, '');
        merged[merged.length - 1] = prev + continuation;
      }
    } else {
      merged.push(line.replace(/\/\s*$/, ''));
    }
  }

  return merged;
}

export function parseBAI2(content: string): ParseResult {
  const records = preprocessBAI2(content);
  const transactions: ParsedBankTransaction[] = [];
  const errors: string[] = [];
  let statementDate: string | null = null;
  const accountIdentifiers: string[] = [];

  // Track current context
  let currentAccountId: string | null = null;
  let currentDate: string | null = null;

  // Validation accumulators
  const accountTotals: Map<string, { expected: string; actual: typeof from.prototype }> = new Map();
  let fileControlTotal: string | null = null;

  for (const record of records) {
    const fields = record.split(',');
    const recordType = fields[0];

    if (recordType === '02') {
      // Group header — extract date for statement
      const asOfDate = fields[4] ?? '';
      statementDate = parseBAI2Date(asOfDate);
    } else if (recordType === '03') {
      // Account identifier
      currentAccountId = fields[1] ?? null;
      if (currentAccountId) accountIdentifiers.push(currentAccountId);
      // AS_OF_DATE may also be in group header; account-level amount is opening balance
      // Date comes from the group header (type 02)
      const groupDate = statementDate;
      currentDate = groupDate;
      // Initialize account total tracking
      if (currentAccountId) {
        accountTotals.set(currentAccountId, { expected: '0', actual: from(0) });
      }
    } else if (recordType === '16') {
      // Transaction detail
      const typeCode = fields[1] ?? '';
      const rawAmount = fields[2] ?? '0';
      const fundsType = fields[3] ?? '';

      // Determine field positions based on funds type
      // Funds type S has distribution data, V has date+amount after
      let bankRefIdx = 4;
      if (fundsType === 'S') {
        // S,count,amount1,days1,amount2,days2,...
        const distCount = parseInt(fields[4] ?? '0', 10);
        bankRefIdx = 5 + distCount * 2;
      } else if (fundsType === 'V') {
        // V,date,time
        bankRefIdx = 6;
      } else if (fundsType === 'Z' || fundsType === '0' || fundsType === '1' || fundsType === '2') {
        bankRefIdx = 4;
      }

      const bankReference = fields[bankRefIdx] ?? '';
      const customerReference = fields[bankRefIdx + 1] ?? '';
      const textParts = fields.slice(bankRefIdx + 2);
      const description = textParts.join(',').trim();

      // Amount: BAI2 amounts are in implied decimal (cents), divide by 100
      const amountCents = from(rawAmount);
      const amountDollars = amountCents.dividedBy(100).toDecimalPlaces(2);

      const isCredit = BAI2_CREDIT_CODES.has(typeCode);
      const isDebit = BAI2_DEBIT_CODES.has(typeCode);
      // Sign: credits positive, debits negative
      const signedAmount = isDebit ? amountDollars.negated() : amountDollars;

      const transactionType = classifyBAI2TransactionType(typeCode, description, isCredit);

      // Build externalId from bank reference or generate one
      const externalId = bankReference.trim() || `bai2-${currentAccountId ?? 'unknown'}-${transactions.length}`;

      transactions.push({
        externalId,
        transactionDate: currentDate ?? '',
        postDate: currentDate,
        description: description || '',
        reference: bankReference.trim() || null,
        checkNumber: typeCode === '395' ? (customerReference.trim() || null) : null,
        amount: signedAmount.toFixed(2),
        transactionType,
        counterparty: null,
        runningBalance: null,
      });

      // Accumulate for validation (absolute amounts for control totals)
      if (currentAccountId && accountTotals.has(currentAccountId)) {
        const entry = accountTotals.get(currentAccountId)!;
        entry.actual = entry.actual.plus(amountDollars);
      }
    } else if (recordType === '49') {
      // Account trailer — control total
      const controlTotal = fields[1] ?? '0';
      if (currentAccountId && accountTotals.has(currentAccountId)) {
        accountTotals.get(currentAccountId)!.expected = controlTotal;
      }
    } else if (recordType === '99') {
      // File trailer — file control total
      fileControlTotal = fields[1] ?? '0';
    }
  }

  // --- Validation ---
  // Account trailer totals
  for (const [accountId, totals] of accountTotals) {
    const expectedDollars = from(totals.expected).dividedBy(100).toDecimalPlaces(2);
    if (!totals.actual.equals(expectedDollars)) {
      const discrepancy = totals.actual.minus(expectedDollars).toFixed(2);
      errors.push(`BAI2 validation warning: Account ${accountId} control total mismatch. Expected ${expectedDollars.toFixed(2)}, got ${totals.actual.toFixed(2)}, discrepancy ${discrepancy}`);
    }
  }

  // File control total
  if (fileControlTotal !== null) {
    const expectedFileTotal = from(fileControlTotal).dividedBy(100).toDecimalPlaces(2);
    let actualFileTotal = from(0);
    for (const totals of accountTotals.values()) {
      actualFileTotal = actualFileTotal.plus(totals.actual);
    }
    if (!actualFileTotal.equals(expectedFileTotal)) {
      const discrepancy = actualFileTotal.minus(expectedFileTotal).toFixed(2);
      errors.push(`BAI2 validation warning: File control total mismatch. Expected ${expectedFileTotal.toFixed(2)}, got ${actualFileTotal.toFixed(2)}, discrepancy ${discrepancy}`);
    }
  }

  return {
    success: transactions.length > 0,
    transactions,
    format: 'bai2',
    accountIdentifier: accountIdentifiers.length === 1 ? accountIdentifiers[0] : accountIdentifiers.join(';'),
    statementDate,
    errors,
  };
}

// --- Format Detection & Dispatch ---

export function detectFormat(content: string): 'csv' | 'ofx' | 'qfx' | 'bai2' | 'unknown' {
  const trimmed = content.trim();
  // BAI2 files always begin with 01, on the first line
  const firstLine = trimmed.split(/\r?\n/)[0] ?? '';
  if (firstLine.startsWith('01,')) return 'bai2';
  if (trimmed.includes('<OFX>') || trimmed.includes('<OFX>') || trimmed.startsWith('OFXHEADER')) return 'ofx';
  if (trimmed.includes('INTU.BID')) return 'qfx';
  // Check for CSV: first line should have comma-separated headers
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
    case 'bai2':
      return parseBAI2(content);
    default:
      return {
        success: false,
        transactions: [],
        format: 'unknown',
        accountIdentifier: null,
        statementDate: null,
        errors: ['Unsupported file format. Supported: CSV, OFX, QFX, BAI2'],
      };
  }
}
