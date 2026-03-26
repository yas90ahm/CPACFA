/**
 * Subledger / Bank Statement Ingestion Service.
 *
 * Parses CSV source files, persists them as reconciliation source data,
 * and auto-matches source entries against GL lines by amount and date proximity.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { from, sumRound2, round2 } from '../utils/decimal.js';
import type { ReconSourceEntry, ReconSourceData, MatchResult } from '../types/recon_source.js';
import * as sourceRepo from '../db/repositories/recon_source_repository.js';

export class ReconSourceError extends Error {
  constructor(
    message: string,
    public readonly code: 'PARSE_ERROR' | 'NOT_FOUND' | 'VALIDATION'
  ) {
    super(message);
    this.name = 'ReconSourceError';
  }
}

/* ── CSV Parsing ──────────────────────────────────────────────────── */

/**
 * Parse CSV content into ReconSourceEntry[].
 * Expects columns: date, description, amount (with optional reference).
 * Handles common CSV variations: quoted fields, header detection.
 */
export function parseCsvSource(csvContent: string, _sourceType: string): ReconSourceEntry[] {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new ReconSourceError('CSV must have a header row and at least one data row', 'PARSE_ERROR');
  }

  const headerLine = lines[0]!;
  const headers = parseCsvLine(headerLine).map((h) => h.toLowerCase().trim());

  // Find column indices
  const dateIdx = headers.findIndex((h) => h === 'date' || h === 'transaction_date' || h === 'trans_date' || h === 'post_date');
  const descIdx = headers.findIndex((h) => h === 'description' || h === 'memo' || h === 'narrative' || h === 'details');
  const amountIdx = headers.findIndex((h) => h === 'amount' || h === 'value' || h === 'transaction_amount');
  const refIdx = headers.findIndex((h) => h === 'reference' || h === 'ref' || h === 'check_number' || h === 'check_no');

  if (dateIdx < 0) throw new ReconSourceError('CSV missing required column: date', 'PARSE_ERROR');
  if (descIdx < 0) throw new ReconSourceError('CSV missing required column: description', 'PARSE_ERROR');
  if (amountIdx < 0) throw new ReconSourceError('CSV missing required column: amount', 'PARSE_ERROR');

  const entries: ReconSourceEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]!);
    const dateVal = (fields[dateIdx] ?? '').trim();
    const descVal = (fields[descIdx] ?? '').trim();
    const amountStr = (fields[amountIdx] ?? '').trim().replace(/[,$()]/g, '');
    const refVal = refIdx >= 0 ? (fields[refIdx] ?? '').trim() : undefined;

    if (!dateVal || !amountStr) continue;

    let amountNum: number;
    try { amountNum = from(amountStr).toDecimalPlaces(2).toNumber(); } catch { continue; }
    if (!Number.isFinite(amountNum)) continue;

    // If the original field had parentheses, it's negative
    const rawAmountField = (fields[amountIdx] ?? '').trim();
    const isNegative = rawAmountField.startsWith('(') && rawAmountField.endsWith(')');
    const finalAmount = round2(isNegative ? -Math.abs(amountNum) : amountNum);

    entries.push({
      date: normalizeDate(dateVal),
      description: descVal,
      amount: finalAmount,
      reference: refVal || undefined,
      lineNumber: i,
    });
  }

  if (entries.length === 0) {
    throw new ReconSourceError('No valid data rows found in CSV', 'PARSE_ERROR');
  }

  return entries;
}

/** Parse a single CSV line handling quoted fields. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/** Normalize various date formats to YYYY-MM-DD. */
function normalizeDate(dateStr: string): string {
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // MM/DD/YYYY or M/D/YYYY
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[1]!.padStart(2, '0')}-${slashMatch[2]!.padStart(2, '0')}`;
  }

  // DD-MM-YYYY (less common, try ISO parse)
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return dateStr; // Return as-is; downstream can handle
}

/* ── Upload ───────────────────────────────────────────────────────── */

/**
 * Parse and persist a CSV source file for a reconciliation.
 */
export async function uploadReconSource(
  pool: Pool,
  tenantId: string,
  reconId: string,
  sessionId: string,
  csvContent: string,
  sourceType: string,
  fileName: string,
  uploadedBy: string
): Promise<ReconSourceData> {
  const entries = parseCsvSource(csvContent, sourceType);
  const totalAmount = sumRound2(entries.map((e) => e.amount));
  const entryCount = entries.length;
  const id = randomUUID();

  return sourceRepo.insertReconSource(
    pool,
    id,
    tenantId,
    reconId,
    sessionId,
    sourceType,
    fileName,
    uploadedBy,
    entries,
    totalAmount,
    entryCount
  );
}

/* ── Auto-match ───────────────────────────────────────────────────── */

interface GLLineRow {
  id: string;
  entry_id: string;
  line_number: number;
  entry_date: string;
  account_code: string;
  debit: string;
  credit: string;
  description: string | null;
}

/**
 * Auto-match source entries against GL lines for a given reconciliation.
 * Matching strategy:
 * 1. Exact amount match (debit-credit vs source amount)
 * 2. Amount match with date proximity (within 3 days) boosts confidence
 */
export async function autoMatchEntries(
  pool: Pool,
  tenantId: string,
  reconId: string,
  sessionId: string
): Promise<MatchResult[]> {
  // Get the source data
  const sourceData = await sourceRepo.getReconSourceByReconAndSession(pool, tenantId, reconId, sessionId);
  if (!sourceData) {
    throw new ReconSourceError('No source data uploaded for this reconciliation', 'NOT_FOUND');
  }

  // Get the reconciliation to find its account_code and period
  const { rows: reconRows } = await pool.query<{ account_code: string; period_id: string }>(
    `SELECT account_code, period_id FROM tenant_period_reconciliations
     WHERE recon_id = $1 AND tenant_id = $2`,
    [reconId, tenantId]
  );
  if (reconRows.length === 0) {
    throw new ReconSourceError('Reconciliation not found', 'NOT_FOUND');
  }

  const recon = reconRows[0]!;

  // Get period_label from session
  const { rows: sessionRows } = await pool.query<{ period_label: string }>(
    `SELECT period_label FROM close_sessions WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );
  if (sessionRows.length === 0) {
    throw new ReconSourceError('Close session not found', 'NOT_FOUND');
  }

  const periodLabel = sessionRows[0]!.period_label;

  // Get GL lines for this account and period
  const { rows: glRows } = await pool.query<GLLineRow>(
    `SELECT id, entry_id, line_number, entry_date::text, account_code,
            debit::text, credit::text, description
     FROM core.general_ledger
     WHERE tenant_id = $1 AND period_label = $2 AND account_code = $3
     ORDER BY entry_date, entry_id, line_number`,
    [tenantId, periodLabel, recon.account_code]
  );

  const matches: MatchResult[] = [];
  const matchedGLIds = new Set<string>();
  const matchedSourceIndices = new Set<number>();

  // Pass 1: exact amount + date proximity
  for (let si = 0; si < sourceData.entries.length; si++) {
    const entry = sourceData.entries[si]!;
    const sourceAmount = from(entry.amount);

    for (const gl of glRows) {
      if (matchedGLIds.has(gl.id)) continue;

      const glNet = from(gl.debit).minus(gl.credit).toDecimalPlaces(2).toNumber();
      const amountMatch = sourceAmount.abs().eq(from(glNet).abs());

      if (!amountMatch) continue;

      // Date proximity scoring
      const sourceDate = new Date(entry.date);
      const glDate = new Date(gl.entry_date);
      const daysDiff = Math.abs((sourceDate.getTime() - glDate.getTime()) / (1000 * 60 * 60 * 24));

      let confidence: number;
      let matchType: MatchResult['matchType'];

      if (daysDiff <= 1) {
        confidence = 0.95;
        matchType = 'amount_date_proximity';
      } else if (daysDiff <= 3) {
        confidence = 0.85;
        matchType = 'amount_date_proximity';
      } else if (daysDiff <= 7) {
        confidence = 0.70;
        matchType = 'amount_date_proximity';
      } else {
        confidence = 0.50;
        matchType = 'exact_amount';
      }

      matches.push({
        sourceIndex: si,
        glEntryId: gl.entry_id,
        glLineNumber: gl.line_number,
        sourceAmount: entry.amount,
        glAmount: glNet,
        matchType,
        confidence,
        sourceDescription: entry.description,
        glDescription: gl.description,
        sourceDate: entry.date,
        glDate: gl.entry_date,
      });

      matchedGLIds.add(gl.id);
      matchedSourceIndices.add(si);
      break; // move to next source entry
    }
  }

  // Sort by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence);

  return matches;
}

/* ── Get source data ──────────────────────────────────────────────── */

/**
 * Get source data for a reconciliation in a session.
 */
export async function getReconSourceData(
  pool: Pool,
  tenantId: string,
  reconId: string,
  sessionId: string
): Promise<ReconSourceData | null> {
  return sourceRepo.getReconSourceByReconAndSession(pool, tenantId, reconId, sessionId);
}
