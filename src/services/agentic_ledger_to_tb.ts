/**
 * Agentic messy ledger to trial balance.
 * When deterministic parse yields all-zero amounts, use LLM to classify columns
 * and map to TB canonical fields (accountName, debit, credit, amount, line),
 * and optionally parse concatenated "line" column into account + amounts.
 */

import type { RawTrialBalanceRow } from './trialBalanceParser.js';
import { classifyIngestionAgentic } from './agentic_ingestion_classifier.js';
import { detectFileType, parseFile } from './ingestion_agent.js';
import { callLLMWithFallback } from '../llm/callWithFallback.js';

const MAX_LINES_PER_PARSE = 100;

/** True when every row has debit === 0 and credit === 0 but there are rows with non-empty account name. */
export function isMessyTrialBalance(rawRows: RawTrialBalanceRow[]): boolean {
  if (rawRows.length === 0) return false;
  const allZero = rawRows.every((r) => r.debit === 0 && r.credit === 0);
  const hasNonEmptyAccount = rawRows.some((r) => String(r.accountName ?? '').trim() !== '');
  return allZero && hasNonEmptyAccount;
}

function parseNum(value: unknown): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  const s = String(value ?? '').trim().replace(/,/g, '');
  if (s === '') return 0;
  if (s.startsWith('(') && s.endsWith(')')) return -parseFloat(s.slice(1, -1)) || 0;
  return parseFloat(s) || 0;
}

function getMappedValue(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  canonicalField: string
): string | undefined {
  const key = Object.keys(mapping).find(
    (k) => (mapping[k] ?? '').toLowerCase().trim() === canonicalField.toLowerCase()
  );
  if (!key) return undefined;
  const v = row[key];
  if (v == null) return undefined;
  return String(v).trim() || undefined;
}

function getMappedNum(row: Record<string, unknown>, mapping: Record<string, string>, canonicalField: string): number {
  const v = getMappedValue(row, mapping, canonicalField);
  if (v == null || v === '') return 0;
  return parseNum(v);
}

/**
 * Parse an array of messy ledger line strings (e.g. "1,01/01/26,JE-01,Suspense,...,415699.00,0.00")
 * into { accountName, debit, credit } per line via LLM.
 */
export async function parseLedgerLinesAgentic(
  lineStrings: string[]
): Promise<{ accountName: string; debit: number; credit: number }[]> {
  if (lineStrings.length === 0) return [];
  const batch = lineStrings.slice(0, MAX_LINES_PER_PARSE);
  const prompt = `Each string below is a messy ledger/GL line (may include line#, date, type, account, description, amounts).
Return a JSON array of objects with exactly one object per input line: { "accountName": string, "debit": number, "credit": number }.
Extract the account name and numeric amount(s); put net amount in debit or credit (use 0 for the other).
Input lines (one per line):
${batch.map((s, i) => `${i + 1}: ${s}`).join('\n')}

Return only the JSON array, no other text.`;

  const parsed = await callLLMWithFallback({
    system:
      'You are a CPA-grade data extractor. Extract account name and debit/credit amounts from messy ledger lines. Return only a JSON array.',
    prompt,
    maxTokens: 4000,
    parse: (raw) => {
      const start = raw.indexOf('[');
      const end = raw.lastIndexOf(']');
      const slice = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
      const arr = JSON.parse(slice) as unknown[];
      if (!Array.isArray(arr)) return [];
      return arr.map((item) => {
        const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const accountName = String(o.accountName ?? o.account ?? '').trim() || 'Unknown';
        const debit = parseNum(o.debit);
        const credit = parseNum(o.credit);
        return { accountName, debit, credit };
      });
    },
    fallback: [],
  });

  if (lineStrings.length > MAX_LINES_PER_PARSE) {
    const rest = await parseLedgerLinesAgentic(lineStrings.slice(MAX_LINES_PER_PARSE));
    return [...parsed, ...rest];
  }
  return parsed;
}

/**
 * Interpret a messy ledger file (buffer) as trial balance rows using agentic classification and optional line parsing.
 * Returns RawTrialBalanceRow[] for use with parseTrialBalance. Returns [] on failure or non-ledger classification.
 */
export async function agenticLedgerToTrialBalance(
  buffer: Buffer,
  _mimeType: string
): Promise<RawTrialBalanceRow[]> {
  const fileType = detectFileType(buffer);
  if (fileType !== 'csv' && fileType !== 'xlsx') return [];
  const parsed = await parseFile(buffer, fileType);
  const sheet = parsed.sheets[0];
  if (!sheet || !sheet.headers?.length || !sheet.rows?.length) return [];
  const headers = sheet.headers;
  const rows = sheet.rows.filter((r) => r && typeof r === 'object' && !Array.isArray(r)) as Record<string, unknown>[];
  const sampleRow = rows[0] ?? {};
  const result = await classifyIngestionAgentic({ headers, sampleRow });
  if (!result?.schemaMapping) return [];
  const classification = (result.classification ?? '').toLowerCase();
  if (classification !== 'trial_balance' && classification !== 'general_ledger') return [];
  const mapping = result.schemaMapping;

  const lineHeader = Object.keys(mapping).find((k) => (mapping[k] ?? '').toLowerCase().trim() === 'line');
  if (lineHeader != null) {
    const lineStrings = rows.map((r) => String(r[lineHeader] ?? '').trim()).filter(Boolean);
    if (lineStrings.length > 0) {
      const parsedLines = await parseLedgerLinesAgentic(lineStrings);
      return parsedLines.map((p) => ({
        accountName: p.accountName,
        debit: p.debit,
        credit: p.credit,
        accountCode: undefined,
      }));
    }
  }

  const accountNameFields = ['accountname', 'account', 'description', 'name'];
  const tbRows: RawTrialBalanceRow[] = [];
  for (const row of rows) {
    let accountName = '';
    for (const f of accountNameFields) {
      const v = getMappedValue(row, mapping, f);
      if (v) {
        accountName = v;
        break;
      }
    }
    if (!accountName) continue;
    const debit = getMappedNum(row, mapping, 'debit');
    const credit = getMappedNum(row, mapping, 'credit');
    const amount = getMappedNum(row, mapping, 'amount');
    let finalDebit = debit;
    let finalCredit = credit;
    if (debit === 0 && credit === 0 && amount !== 0) {
      if (amount >= 0) finalDebit = amount;
      else finalCredit = -amount;
    }
    const accountCode = getMappedValue(row, mapping, 'accountcode') ?? undefined;
    tbRows.push({
      accountCode: accountCode || undefined,
      accountName,
      debit: finalDebit,
      credit: finalCredit,
    });
  }
  return tbRows;
}
