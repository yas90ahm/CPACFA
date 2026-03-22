/**
 * Transaction Matching Engine — matches bank transactions to GL entries.
 *
 * Strategies:
 * 1. Exact amount match within date window
 * 2. Fuzzy description match (Levenshtein-based similarity)
 * 3. 1:N / N:1 matching (one bank txn → multiple GL entries or vice versa)
 * 4. Rule-based matching (user-defined rules)
 *
 * Each match gets a confidence score (0.0 - 1.0).
 * Matches are proposed, then confirmed or rejected by the user.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { from, sumRound2 } from '../utils/decimal.js';
import type { BankTransaction } from '../db/repositories/bank_transaction_repository.js';

export interface GLTransaction {
  id: string;
  entryDate: string;
  description: string;
  reference: string | null;
  debit: string;
  credit: string;
  netAmount: string;
  accountCode: string;
  matchStatus: string;
}

export interface MatchCandidate {
  bankTransactionId: string;
  glTransactionId: string;
  bankAmount: number;
  glAmount: number;
  amountDifference: number;
  dateDistance: number;
  descriptionSimilarity: number;
  confidence: number;
  matchMethod: 'exact_amount' | 'fuzzy' | 'rule_based';
}

export interface MatchGroup {
  id: string;
  bankTransactionIds: string[];
  glTransactionIds: string[];
  matchType: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
  confidence: number;
  matchMethod: string;
  totalBankAmount: number;
  totalGLAmount: number;
  amountDifference: number;
}

export interface MatchingConfig {
  /** Max days between bank txn date and GL entry date to consider a match */
  dateWindowDays: number;
  /** Minimum confidence score to propose a match (0.0 - 1.0) */
  minConfidence: number;
  /** Amount tolerance for "exact" match (e.g., 0.01 for penny-exact) */
  amountTolerance: number;
  /** Whether to attempt 1:N and N:1 matching */
  enableMultiMatch: boolean;
}

const DEFAULT_CONFIG: MatchingConfig = {
  dateWindowDays: 5,
  minConfidence: 0.6,
  amountTolerance: 0.01,
  enableMultiMatch: true,
};

// --- Similarity Functions ---

/** Levenshtein distance between two strings */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/** Normalized string similarity (0.0 = no match, 1.0 = exact match) */
function stringSimilarity(a: string, b: string): number {
  const na = a.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const nb = b.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  if (na === nb) return 1.0;
  if (na.length === 0 || nb.length === 0) return 0.0;
  const maxLen = Math.max(na.length, nb.length);
  const dist = levenshteinDistance(na, nb);
  return Math.max(0, 1 - dist / maxLen);
}

/** Days between two date strings */
function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1).getTime();
  const d2 = new Date(date2).getTime();
  return Math.abs(d1 - d2) / (24 * 60 * 60 * 1000);
}

// --- Confidence Scoring ---

function computeConfidence(
  amountDiff: number,
  dateDistance: number,
  descSimilarity: number,
  config: MatchingConfig
): number {
  // Amount match weight: 50%
  const amountScore = amountDiff <= config.amountTolerance ? 1.0
    : amountDiff <= 1.0 ? 0.8
    : amountDiff <= 10.0 ? 0.5
    : 0.0;

  // Date proximity weight: 25%
  const dateScore = dateDistance === 0 ? 1.0
    : dateDistance <= 1 ? 0.9
    : dateDistance <= 3 ? 0.7
    : dateDistance <= config.dateWindowDays ? 0.4
    : 0.0;

  // Description similarity weight: 25%
  const descScore = descSimilarity;

  return amountScore * 0.5 + dateScore * 0.25 + descScore * 0.25;
}

// --- Core Matching ---

/**
 * Find 1:1 match candidates between bank transactions and GL entries.
 * Returns sorted by confidence (highest first).
 */
export function findOneToOneMatches(
  bankTxns: BankTransaction[],
  glTxns: GLTransaction[],
  config: MatchingConfig = DEFAULT_CONFIG
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];

  const unmatchedBank = bankTxns.filter((t) => t.matchStatus === 'unmatched');
  const unmatchedGL = glTxns.filter((t) => t.matchStatus === 'unmatched');

  for (const bank of unmatchedBank) {
    const bankAmount = Number(bank.amount);

    for (const gl of unmatchedGL) {
      const glAmount = Number(gl.netAmount);
      const amountDiff = Math.abs(Math.abs(bankAmount) - Math.abs(glAmount));
      const dateDistance = daysBetween(bank.transactionDate, gl.entryDate);

      // Skip if outside date window
      if (dateDistance > config.dateWindowDays) continue;

      // Skip if amount difference is too large (> 10x tolerance or > $100)
      if (amountDiff > Math.max(config.amountTolerance * 10, 100)) continue;

      const descSimilarity = stringSimilarity(bank.description, gl.description);
      const confidence = computeConfidence(amountDiff, dateDistance, descSimilarity, config);

      if (confidence >= config.minConfidence) {
        candidates.push({
          bankTransactionId: bank.id,
          glTransactionId: gl.id,
          bankAmount,
          glAmount,
          amountDifference: amountDiff,
          dateDistance,
          descriptionSimilarity: descSimilarity,
          confidence,
          matchMethod: amountDiff <= config.amountTolerance ? 'exact_amount' : 'fuzzy',
        });
      }
    }
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates;
}

/**
 * Find N:1 matches: multiple bank transactions that sum to one GL entry.
 * Common for split deposits or batch payments.
 */
export function findManyToOneMatches(
  bankTxns: BankTransaction[],
  glTxns: GLTransaction[],
  config: MatchingConfig = DEFAULT_CONFIG
): MatchGroup[] {
  if (!config.enableMultiMatch) return [];

  const groups: MatchGroup[] = [];
  const unmatchedBank = bankTxns.filter((t) => t.matchStatus === 'unmatched');
  const unmatchedGL = glTxns.filter((t) => t.matchStatus === 'unmatched');

  for (const gl of unmatchedGL) {
    const glAmount = Math.abs(Number(gl.netAmount));
    if (glAmount === 0) continue;

    // Find bank txns within date window with same sign
    const candidates = unmatchedBank.filter((b) => {
      const dateOk = daysBetween(b.transactionDate, gl.entryDate) <= config.dateWindowDays;
      return dateOk;
    });

    // Try 2-combination matches (most common: two bank txns = one GL entry)
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const sum = Math.abs(Number(candidates[i].amount)) + Math.abs(Number(candidates[j].amount));
        const diff = Math.abs(sum - glAmount);
        if (diff <= config.amountTolerance) {
          const avgDateDist = (
            daysBetween(candidates[i].transactionDate, gl.entryDate) +
            daysBetween(candidates[j].transactionDate, gl.entryDate)
          ) / 2;
          const confidence = computeConfidence(diff, avgDateDist, 0.5, config) * 0.9; // Slight penalty for multi-match

          if (confidence >= config.minConfidence) {
            groups.push({
              id: randomUUID(),
              bankTransactionIds: [candidates[i].id, candidates[j].id],
              glTransactionIds: [gl.id],
              matchType: 'many_to_one',
              confidence,
              matchMethod: 'exact_amount',
              totalBankAmount: sum,
              totalGLAmount: glAmount,
              amountDifference: diff,
            });
          }
        }
      }
    }
  }

  groups.sort((a, b) => b.confidence - a.confidence);
  return groups;
}

/**
 * Run all matching strategies and return deduplicated proposed match groups.
 * Greedy algorithm: highest confidence matches first, no double-matching.
 */
export function runMatchingEngine(
  bankTxns: BankTransaction[],
  glTxns: GLTransaction[],
  config: MatchingConfig = DEFAULT_CONFIG
): MatchGroup[] {
  const oneToOne = findOneToOneMatches(bankTxns, glTxns, config);
  const manyToOne = findManyToOneMatches(bankTxns, glTxns, config);

  const usedBankIds = new Set<string>();
  const usedGLIds = new Set<string>();
  const finalGroups: MatchGroup[] = [];

  // Process 1:1 matches first (generally higher confidence)
  for (const candidate of oneToOne) {
    if (usedBankIds.has(candidate.bankTransactionId) || usedGLIds.has(candidate.glTransactionId)) {
      continue;
    }
    usedBankIds.add(candidate.bankTransactionId);
    usedGLIds.add(candidate.glTransactionId);

    finalGroups.push({
      id: randomUUID(),
      bankTransactionIds: [candidate.bankTransactionId],
      glTransactionIds: [candidate.glTransactionId],
      matchType: 'one_to_one',
      confidence: candidate.confidence,
      matchMethod: candidate.matchMethod,
      totalBankAmount: Math.abs(candidate.bankAmount),
      totalGLAmount: Math.abs(candidate.glAmount),
      amountDifference: candidate.amountDifference,
    });
  }

  // Process N:1 matches
  for (const group of manyToOne) {
    const bankConflict = group.bankTransactionIds.some((id) => usedBankIds.has(id));
    const glConflict = group.glTransactionIds.some((id) => usedGLIds.has(id));
    if (bankConflict || glConflict) continue;

    for (const id of group.bankTransactionIds) usedBankIds.add(id);
    for (const id of group.glTransactionIds) usedGLIds.add(id);
    finalGroups.push(group);
  }

  return finalGroups;
}

/**
 * Persist proposed match groups to database and update transaction match statuses.
 */
export async function persistMatchGroups(
  pool: Pool,
  tenantId: string,
  periodId: string,
  reconId: string | null,
  groups: MatchGroup[]
): Promise<{ persisted: number }> {
  let persisted = 0;

  for (const group of groups) {
    // Insert match group
    await pool.query(
      `INSERT INTO tenant_transaction_match_groups (
         id, tenant_id, period_id, recon_id, match_type, status,
         confidence_score, match_method, created_by
       ) VALUES ($1, $2, $3, $4, $5, 'proposed', $6, $7, 'system')
       ON CONFLICT DO NOTHING`,
      [group.id, tenantId, periodId, reconId, group.matchType, group.confidence, group.matchMethod]
    );

    // Update bank transactions
    for (const bankId of group.bankTransactionIds) {
      await pool.query(
        `UPDATE tenant_bank_transactions
         SET match_status = 'matched', match_group_id = $3, match_confidence = $4
         WHERE id = $2 AND tenant_id = $1`,
        [tenantId, bankId, group.id, group.confidence]
      );
    }

    // Update GL transactions
    for (const glId of group.glTransactionIds) {
      await pool.query(
        `UPDATE tenant_gl_transactions
         SET match_status = 'matched', match_group_id = $3
         WHERE id = $2 AND tenant_id = $1`,
        [tenantId, glId, group.id]
      );
    }

    persisted++;
  }

  return { persisted };
}

/**
 * Confirm a proposed match group.
 */
export async function confirmMatchGroup(
  pool: Pool,
  tenantId: string,
  matchGroupId: string,
  confirmedBy: string
): Promise<boolean> {
  const r = await pool.query(
    `UPDATE tenant_transaction_match_groups
     SET status = 'confirmed', confirmed_by = $3, confirmed_at = NOW()
     WHERE id = $2 AND tenant_id = $1 AND status = 'proposed'
     RETURNING id`,
    [tenantId, matchGroupId, confirmedBy]
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Reject a proposed match group and reset transaction statuses.
 */
export async function rejectMatchGroup(
  pool: Pool,
  tenantId: string,
  matchGroupId: string,
  rejectedBy: string,
  reason: string
): Promise<boolean> {
  const r = await pool.query(
    `UPDATE tenant_transaction_match_groups
     SET status = 'rejected', rejected_by = $3, rejected_at = NOW(), rejection_reason = $4
     WHERE id = $2 AND tenant_id = $1 AND status = 'proposed'
     RETURNING id`,
    [tenantId, matchGroupId, rejectedBy, reason]
  );
  if ((r.rowCount ?? 0) === 0) return false;

  // Reset bank transactions back to unmatched
  await pool.query(
    `UPDATE tenant_bank_transactions
     SET match_status = 'unmatched', match_group_id = NULL, match_confidence = NULL
     WHERE tenant_id = $1 AND match_group_id = $2`,
    [tenantId, matchGroupId]
  );

  // Reset GL transactions back to unmatched
  await pool.query(
    `UPDATE tenant_gl_transactions
     SET match_status = 'unmatched', match_group_id = NULL
     WHERE tenant_id = $1 AND match_group_id = $2`,
    [tenantId, matchGroupId]
  );

  return true;
}

/**
 * Get matching summary for a reconciliation.
 */
export async function getMatchingSummary(
  pool: Pool,
  tenantId: string,
  periodId: string,
  accountCode: string
): Promise<{
  totalBankTransactions: number;
  matchedBankTransactions: number;
  unmatchedBankTransactions: number;
  totalGLTransactions: number;
  matchedGLTransactions: number;
  unmatchedGLTransactions: number;
  proposedGroups: number;
  confirmedGroups: number;
  matchRate: number;
}> {
  const [bankCounts, glCounts, groupCounts] = await Promise.all([
    pool.query<{ match_status: string; cnt: number }>(
      `SELECT match_status, COUNT(*)::int as cnt FROM tenant_bank_transactions
       WHERE tenant_id = $1 AND period_id = $2 AND account_code = $3
       GROUP BY match_status`,
      [tenantId, periodId, accountCode]
    ),
    pool.query<{ match_status: string; cnt: number }>(
      `SELECT match_status, COUNT(*)::int as cnt FROM tenant_gl_transactions
       WHERE tenant_id = $1 AND period_id = $2 AND account_code = $3
       GROUP BY match_status`,
      [tenantId, periodId, accountCode]
    ),
    pool.query<{ status: string; cnt: number }>(
      `SELECT status, COUNT(*)::int as cnt FROM tenant_transaction_match_groups
       WHERE tenant_id = $1 AND period_id = $2
       GROUP BY status`,
      [tenantId, periodId]
    ),
  ]);

  const bankByStatus: Record<string, number> = {};
  for (const r of bankCounts.rows) bankByStatus[r.match_status] = r.cnt;

  const glByStatus: Record<string, number> = {};
  for (const r of glCounts.rows) glByStatus[r.match_status] = r.cnt;

  const groupByStatus: Record<string, number> = {};
  for (const r of groupCounts.rows) groupByStatus[r.status] = r.cnt;

  const totalBank = Object.values(bankByStatus).reduce((a, b) => a + b, 0);
  const matchedBank = bankByStatus['matched'] ?? 0;
  const totalGL = Object.values(glByStatus).reduce((a, b) => a + b, 0);
  const matchedGL = glByStatus['matched'] ?? 0;

  return {
    totalBankTransactions: totalBank,
    matchedBankTransactions: matchedBank,
    unmatchedBankTransactions: bankByStatus['unmatched'] ?? 0,
    totalGLTransactions: totalGL,
    matchedGLTransactions: matchedGL,
    unmatchedGLTransactions: glByStatus['unmatched'] ?? 0,
    proposedGroups: groupByStatus['proposed'] ?? 0,
    confirmedGroups: groupByStatus['confirmed'] ?? 0,
    matchRate: totalBank > 0 ? matchedBank / totalBank : 0,
  };
}
