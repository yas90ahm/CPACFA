/**
 * Mapping Learning Loop (Layer 5)
 *
 * Every time a controller rejects an AI suggestion and manually maps an account,
 * that correction becomes training data for future closes.
 *
 * Two levels of learning:
 * 1. Entity-specific: "For TenantX-EntityY, 'Acct 4100' maps to Revenue"
 *    → Stored in mapping_corrections_log, queried by Layer 3 agent
 *
 * 2. Cross-tenant (anonymized): "Accounts containing 'depreciation' should map to contra-asset"
 *    → Stored in mapping_pattern_signals, used as hints for all customers
 *    → No tenant-identifying data (name patterns only)
 *
 * The learning loop integrates into:
 * - accept/reject flow in ai_classification_service (capture corrections)
 * - classifyWithXBRL (consult corrections before AI)
 * - mapping_validation_agent (use corrections as evidence for proposals)
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';

export interface CorrectionInput {
  tenantId: string;
  entityId: string;
  accountNamePattern: string;
  accountCodePattern?: string;
  rejectedFsLineId: string;
  rejectedConfidence?: number;
  chosenFsLineId: string;
  chosenFsLineName?: string;
  source: 'manual_override' | 'agent_proposal_rejected' | 'suggestion_rejected';
  closeSessionId?: string;
}

/**
 * Record a mapping correction (controller overrode AI suggestion).
 * Updates both entity-specific log and cross-tenant pattern signals.
 */
export async function recordCorrection(
  pool: Pool,
  input: CorrectionInput
): Promise<void> {
  const normalizedPattern = normalizeAccountName(input.accountNamePattern);
  if (!normalizedPattern) return;

  // 1. Entity-specific correction log
  try {
    await pool.query(
      `INSERT INTO mapping_corrections_log
        (id, tenant_id, entity_id, account_name_pattern, account_code_pattern,
         rejected_fs_line_id, rejected_confidence, chosen_fs_line_id, chosen_fs_line_name,
         source, close_session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        randomUUID(),
        input.tenantId,
        input.entityId,
        normalizedPattern,
        input.accountCodePattern ?? null,
        input.rejectedFsLineId,
        input.rejectedConfidence ?? null,
        input.chosenFsLineId,
        input.chosenFsLineName ?? null,
        input.source,
        input.closeSessionId ?? null,
      ]
    );
  } catch {
    // Table may not exist yet — non-fatal
  }

  // 2. Cross-tenant pattern signal (anonymized — no tenant or account code)
  // Only write cross-tenant signals if tenant has opted in
  let crossTenantEnabled = false;
  try {
    const optInRes = await pool.query<{ cross_tenant_learning_enabled: boolean }>(
      `SELECT cross_tenant_learning_enabled FROM tenant_financial_config WHERE tenant_id = $1`,
      [input.tenantId]
    );
    crossTenantEnabled = optInRes.rows[0]?.cross_tenant_learning_enabled ?? false;
  } catch {
    // Column or table may not exist — default to off
  }

  if (!crossTenantEnabled) return; // Entity-specific correction recorded, skip cross-tenant

  // Extract meaningful keywords from the account name
  const keywords = extractKeywords(normalizedPattern);
  for (const keyword of keywords) {
    try {
      await pool.query(
        `INSERT INTO mapping_pattern_signals
          (id, name_keyword, correct_fs_line_id, correct_fs_line_name, signal_strength,
           expected_balance_direction)
         VALUES ($1, $2, $3, $4, 1, $5)
         ON CONFLICT (name_keyword, correct_fs_line_id)
         DO UPDATE SET
           signal_strength = mapping_pattern_signals.signal_strength + 1,
           updated_at = NOW()`,
        [
          randomUUID(),
          keyword,
          input.chosenFsLineId,
          input.chosenFsLineName ?? null,
          inferBalanceDirection(input.chosenFsLineId),
        ]
      );
    } catch {
      // Non-fatal
    }
  }
}

/**
 * Query the learning loop for a mapping suggestion.
 * Returns the best correction match if available.
 */
export async function queryLearningLoop(
  pool: Pool,
  tenantId: string,
  entityId: string,
  accountName: string
): Promise<{ fsLineId: string; fsLineName: string; source: 'entity_history' | 'cross_tenant' } | null> {
  const normalizedPattern = normalizeAccountName(accountName);
  if (!normalizedPattern) return null;

  // 1. Check entity-specific corrections first (highest priority)
  try {
    const entityRes = await pool.query<{ chosen_fs_line_id: string; chosen_fs_line_name: string }>(
      `SELECT chosen_fs_line_id, chosen_fs_line_name
       FROM mapping_corrections_log
       WHERE tenant_id = $1 AND entity_id = $2 AND account_name_pattern = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId, entityId, normalizedPattern]
    );
    if (entityRes.rows.length > 0) {
      return {
        fsLineId: entityRes.rows[0].chosen_fs_line_id,
        fsLineName: entityRes.rows[0].chosen_fs_line_name ?? '',
        source: 'entity_history',
      };
    }
  } catch {
    // Table may not exist
  }

  // 2. Check cross-tenant pattern signals (only if tenant opted in)
  let crossTenantEnabled = false;
  try {
    const optInRes = await pool.query<{ cross_tenant_learning_enabled: boolean }>(
      `SELECT cross_tenant_learning_enabled FROM tenant_financial_config WHERE tenant_id = $1`,
      [tenantId]
    );
    crossTenantEnabled = optInRes.rows[0]?.cross_tenant_learning_enabled ?? false;
  } catch {
    // Default to off
  }

  if (!crossTenantEnabled) return null;

  const keywords = extractKeywords(normalizedPattern);
  if (keywords.length === 0) return null;

  try {
    const signalRes = await pool.query<{ correct_fs_line_id: string; correct_fs_line_name: string; signal_strength: number }>(
      `SELECT correct_fs_line_id, correct_fs_line_name, signal_strength
       FROM mapping_pattern_signals
       WHERE name_keyword = ANY($1)
       ORDER BY signal_strength DESC
       LIMIT 1`,
      [keywords]
    );
    if (signalRes.rows.length > 0 && signalRes.rows[0].signal_strength >= 2) {
      // Require at least 2 corrections to trust cross-tenant signal
      return {
        fsLineId: signalRes.rows[0].correct_fs_line_id,
        fsLineName: signalRes.rows[0].correct_fs_line_name ?? '',
        source: 'cross_tenant',
      };
    }
  } catch {
    // Table may not exist
  }

  return null;
}

/**
 * Get learning loop statistics for an entity.
 */
export async function getLearningStats(
  pool: Pool,
  tenantId: string,
  entityId: string
): Promise<{
  totalCorrections: number;
  uniquePatterns: number;
  crossTenantSignals: number;
  topCorrectedAccounts: Array<{ pattern: string; count: number; currentMapping: string }>;
}> {
  let totalCorrections = 0;
  let uniquePatterns = 0;
  const topCorrectedAccounts: Array<{ pattern: string; count: number; currentMapping: string }> = [];

  try {
    const countRes = await pool.query<{ total: string; unique: string }>(
      `SELECT COUNT(*) AS total, COUNT(DISTINCT account_name_pattern) AS unique
       FROM mapping_corrections_log
       WHERE tenant_id = $1 AND entity_id = $2`,
      [tenantId, entityId]
    );
    totalCorrections = Number(countRes.rows[0]?.total ?? 0);
    uniquePatterns = Number(countRes.rows[0]?.unique ?? 0);

    const topRes = await pool.query<{ pattern: string; cnt: string; mapping: string }>(
      `SELECT account_name_pattern AS pattern, COUNT(*) AS cnt,
              MAX(chosen_fs_line_name) AS mapping
       FROM mapping_corrections_log
       WHERE tenant_id = $1 AND entity_id = $2
       GROUP BY account_name_pattern
       ORDER BY cnt DESC
       LIMIT 10`,
      [tenantId, entityId]
    );
    for (const row of topRes.rows) {
      topCorrectedAccounts.push({
        pattern: row.pattern,
        count: Number(row.cnt),
        currentMapping: row.mapping ?? '',
      });
    }
  } catch {
    // Tables may not exist
  }

  let crossTenantSignals = 0;
  try {
    const signalRes = await pool.query<{ cnt: string }>(
      'SELECT COUNT(*) AS cnt FROM mapping_pattern_signals'
    );
    crossTenantSignals = Number(signalRes.rows[0]?.cnt ?? 0);
  } catch {
    // Table may not exist
  }

  return { totalCorrections, uniquePatterns, crossTenantSignals, topCorrectedAccounts };
}

// ── Helpers ──

function normalizeAccountName(name: string): string {
  return name.toLowerCase()
    .replace(/[0-9]+/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract meaningful accounting keywords from normalized name */
function extractKeywords(normalizedName: string): string[] {
  const ACCOUNTING_KEYWORDS = [
    'depreciation', 'amortization', 'allowance', 'doubtful', 'reserve',
    'accrued', 'prepaid', 'deferred', 'revenue', 'receivable', 'payable',
    'inventory', 'goodwill', 'intangible', 'equipment', 'furniture',
    'lease', 'rent', 'salary', 'wage', 'compensation', 'benefit',
    'insurance', 'tax', 'interest', 'dividend', 'treasury', 'retained',
    'earnings', 'capital', 'stock', 'equity', 'liability', 'asset',
    'cash', 'bank', 'suspense', 'clearing', 'intercompany',
    'supplies', 'utilities', 'travel', 'advertising', 'marketing',
    'consulting', 'professional', 'legal', 'audit',
  ];

  const words = normalizedName.split(/\s+/);
  const keywords: string[] = [];

  for (const word of words) {
    if (word.length >= 4 && ACCOUNTING_KEYWORDS.includes(word)) {
      keywords.push(word);
    }
  }

  // Also try bigrams
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    if (['accounts receivable', 'accounts payable', 'accumulated depreciation',
         'deferred revenue', 'deferred tax', 'retained earnings',
         'treasury stock', 'common stock', 'paid capital',
         'long term', 'short term', 'cost goods'].includes(bigram)) {
      keywords.push(bigram);
    }
  }

  return keywords;
}

/** Infer expected balance direction from fs_line_id */
function inferBalanceDirection(fsLineId: string): 'debit' | 'credit' | null {
  if (fsLineId.includes('asset') && !fsLineId.includes('accum') && !fsLineId.includes('allowance')) return 'debit';
  if (fsLineId.includes('accum') || fsLineId.includes('allowance')) return 'credit';
  if (fsLineId.includes('liability') || fsLineId.includes('equity')) return 'credit';
  if (fsLineId.includes('revenue') || fsLineId.includes('income')) return 'credit';
  if (fsLineId.includes('expense') || fsLineId.includes('cogs') || fsLineId.includes('opex')) return 'debit';
  if (fsLineId.includes('treasury')) return 'debit';
  return null;
}
