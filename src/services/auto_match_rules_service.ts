/**
 * Auto-Match Rules — user-defined rules for recurring transaction matching.
 * Rules match by description pattern, amount range, counterparty, and transaction type.
 * When auto_confirm is true, matched groups are auto-confirmed without user review.
 */

import type { Pool } from 'pg';
import type { BankTransaction } from '../db/repositories/bank_transaction_repository.js';
import type { MatchGroup } from './transaction_matching_service.js';
import { randomUUID } from 'crypto';

export interface AutoMatchRule {
  id: string;
  tenantId: string;
  entityId: string | null;
  accountCode: string | null;
  ruleName: string;
  descriptionPattern: string | null;
  amountMin: string | null;
  amountMax: string | null;
  counterpartyPattern: string | null;
  transactionType: string | null;
  targetGlAccount: string | null;
  autoConfirm: boolean;
  priority: number;
  enabled: boolean;
}

export async function listAutoMatchRules(
  pool: Pool,
  tenantId: string,
  accountCode?: string
): Promise<AutoMatchRule[]> {
  let sql = `SELECT * FROM tenant_auto_match_rules WHERE tenant_id = $1 AND enabled = TRUE`;
  const params: unknown[] = [tenantId];
  if (accountCode) {
    params.push(accountCode);
    sql += ` AND (account_code IS NULL OR account_code = $${params.length})`;
  }
  sql += ' ORDER BY priority DESC, created_at';
  const r = await pool.query<Record<string, unknown>>(sql, params);
  return r.rows.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    entityId: row.entity_id != null ? String(row.entity_id) : null,
    accountCode: row.account_code != null ? String(row.account_code) : null,
    ruleName: String(row.rule_name),
    descriptionPattern: row.description_pattern != null ? String(row.description_pattern) : null,
    amountMin: row.amount_min != null ? String(row.amount_min) : null,
    amountMax: row.amount_max != null ? String(row.amount_max) : null,
    counterpartyPattern: row.counterparty_pattern != null ? String(row.counterparty_pattern) : null,
    transactionType: row.transaction_type != null ? String(row.transaction_type) : null,
    targetGlAccount: row.target_gl_account != null ? String(row.target_gl_account) : null,
    autoConfirm: Boolean(row.auto_confirm),
    priority: Number(row.priority),
    enabled: Boolean(row.enabled),
  }));
}

export async function createAutoMatchRule(
  pool: Pool,
  tenantId: string,
  input: Omit<AutoMatchRule, 'id' | 'tenantId' | 'enabled' | 'priority'> & { priority?: number; createdBy?: string }
): Promise<AutoMatchRule> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO tenant_auto_match_rules (id, tenant_id, entity_id, account_code, rule_name,
       description_pattern, amount_min, amount_max, counterparty_pattern, transaction_type,
       target_gl_account, auto_confirm, priority, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, $8::numeric, $9, $10, $11, $12, $13, $14)`,
    [id, tenantId, input.entityId, input.accountCode, input.ruleName,
     input.descriptionPattern, input.amountMin, input.amountMax,
     input.counterpartyPattern, input.transactionType,
     input.targetGlAccount, input.autoConfirm, input.priority ?? 0, input.createdBy ?? null]
  );
  return { id, tenantId, enabled: true, priority: input.priority ?? 0, ...input };
}

/** Apply auto-match rules to unmatched bank transactions. Returns rule-based match groups. */
export function applyAutoMatchRules(
  rules: AutoMatchRule[],
  bankTxns: BankTransaction[]
): MatchGroup[] {
  const groups: MatchGroup[] = [];
  const matchedIds = new Set<string>();

  for (const rule of rules) {
    for (const txn of bankTxns) {
      if (txn.matchStatus !== 'unmatched' || matchedIds.has(txn.id)) continue;

      let matches = true;

      // Description pattern match
      if (rule.descriptionPattern) {
        try {
          const regex = new RegExp(rule.descriptionPattern, 'i');
          if (!regex.test(txn.description)) matches = false;
        } catch {
          if (!txn.description.toLowerCase().includes(rule.descriptionPattern.toLowerCase())) matches = false;
        }
      }

      // Amount range check
      const amount = Math.abs(Number(txn.amount));
      if (rule.amountMin != null && amount < Number(rule.amountMin)) matches = false;
      if (rule.amountMax != null && amount > Number(rule.amountMax)) matches = false;

      // Transaction type check
      if (rule.transactionType && txn.transactionType !== rule.transactionType) matches = false;

      // Counterparty check
      if (rule.counterpartyPattern && txn.counterparty) {
        if (!txn.counterparty.toLowerCase().includes(rule.counterpartyPattern.toLowerCase())) matches = false;
      }

      if (matches && rule.targetGlAccount) {
        matchedIds.add(txn.id);
        groups.push({
          id: randomUUID(),
          bankTransactionIds: [txn.id],
          glTransactionIds: [],
          matchType: 'one_to_one',
          confidence: 1.0,
          matchMethod: 'rule_based',
          totalBankAmount: amount,
          totalGLAmount: 0,
          amountDifference: 0,
        });
      }
    }
  }

  return groups;
}
