/**
 * General Ledger upload service — parse CSV, validate per-entry balance, save to DB.
 * Each entry_id group must balance; balanced entries saved, imbalanced returned for HITL.
 */

import { parse } from 'csv-parse/sync';
import type { Pool } from 'pg';
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
import { round2, from, sumRound2, minus, absGt } from '../utils/decimal.js';

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
    'account',
    'glaccount',
    'gl account',
  ],
  debit: ['debit', 'debits', 'dr', 'debit_amount', 'debit amount'],
  credit: ['credit', 'credits', 'cr', 'credit_amount', 'credit amount'],
  description: ['description', 'desc', 'memo', 'notes', 'narrative'],
};

function normalizeHeader(h: string): string {
  return String(h ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '_');
}

function mapHeaderToCanonical(rawHeader: string): string | null {
  const n = normalizeHeader(rawHeader);
  for (const [canonical, variants] of Object.entries(GL_COLUMN_MAP)) {
    for (const v of variants) {
      const vn = normalizeHeader(v);
      if (n === vn || n.includes(vn) || vn.includes(n)) return canonical;
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
 * Parse GL CSV file to structured data.
 * Expected columns: entry_id, date/entry_date, account_code, debit, credit, description.
 */
export function parseGLCsv(fileBuffer: Buffer): GLUploadRow[] {
  const input = fileBuffer.toString('utf8');
  const records = parse(input, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as Record<string, unknown>[];

  if (records.length === 0) return [];

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
    const description = mapped.description
      ? String(mapped.description).trim()
      : undefined;

    rows.push({
      entry_id: entryId || `ENTRY-${i + 1}`,
      entry_date: typeof entryDate === 'string' ? entryDate : String(entryDate),
      account_code: String(accountCode),
      debit,
      credit,
      description,
    });
  }
  return rows;
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
      lines.push({
        entry_id: entryId,
        line_number: idx + 1,
        entry_date: row.entry_date,
        account_code: row.account_code,
        debit,
        credit,
        description: row.description,
        tenant_id: '',
        period_label: '',
      });
    });
  });
  return lines;
}

/**
 * Validate GL entries:
 * 1. Each entry_id group must have debits = credits (within tolerance)
 * 2. All account_codes must exist in COA
 * 3. Lines cannot have both debit and credit
 */
export async function validateGLEntries(
  pool: Pool,
  tenantId: string,
  lines: GeneralLedgerLine[],
  tolerance = 0.01
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

  const dualLines = lines.filter((l) => (l.debit ?? 0) > 0 && (l.credit ?? 0) > 0);
  if (dualLines.length > 0) {
    errors.push(
      `${dualLines.length} line(s) have both debit and credit (must be one or the other)`
    );
  }

  const uniqueAccounts = new Set(lines.map((l) => l.account_code));
  const coaAccounts = await coaRepository.getAccountsByTenant(pool, tenantId);
  const coaCodes = new Set(coaAccounts.map((a) => a.account_code));
  const invalidAccounts = Array.from(uniqueAccounts).filter((code) => !coaCodes.has(code));
  if (invalidAccounts.length > 0) {
    errors.push(`Invalid account codes (not in COA): ${invalidAccounts.join(', ')}`);
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
    // Do not throw: GL upload succeeded; TB persistence is secondary
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
  uploadedBy?: string
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
    const rows = parseGLCsv(fileBuffer);
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

    const groupStart = Date.now();
    let lines = groupAndNumberLines(rows);
    lines = lines.map((line) => ({
      ...line,
      tenant_id: tenantId,
      period_label: periodLabel,
      created_by: uploadedBy,
    }));
    perfMetrics.group_ms = Date.now() - groupStart;

    const validateStart = Date.now();
    const validation = await validateGLEntries(pool, tenantId, lines);
    perfMetrics.validate_ms = Date.now() - validateStart;

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
