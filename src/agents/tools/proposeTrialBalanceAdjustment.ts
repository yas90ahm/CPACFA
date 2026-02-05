/**
 * Tool: proposeTrialBalanceAdjustment — submit a correcting debit/credit to the HITL Staging Area.
 * Sovereign scope: amounts MUST have valid provenance (SOURCE_LINE_AMOUNT | HUMAN_ENTERED_AMOUNT | DETERMINISTIC_ENGINE_AMOUNT).
 * Advisor MUST NOT invent or estimate amounts.
 */

import { z } from 'zod';
import { submitToStaging } from '../../services/hitl_orchestrator.js';
import { getUnadjusted } from '../../services/trial_balance_store_service.js';
import type { ToolDefinition, ToolResult } from './types.js';

/** Allowed amount provenance for Sovereign scope. */
export const AMOUNT_PROVENANCE_LITERALS = ['SOURCE_LINE_AMOUNT', 'HUMAN_ENTERED_AMOUNT', 'DETERMINISTIC_ENGINE_AMOUNT'] as const;
export type AmountProvenanceLiteral = (typeof AMOUNT_PROVENANCE_LITERALS)[number];

const amountProvenanceLiteralSchema = z.enum(AMOUNT_PROVENANCE_LITERALS);

const sourceRefSchema = z.object({
  periodTrialBalanceRowId: z.string().optional().describe('Row index (e.g. "0") or id of source TB row'),
  ledgerLineId: z.string().optional(),
  externalTxnId: z.string().optional(),
});

const deterministicCalcRefSchema = z.object({
  calcId: z.string(),
  inputsHash: z.string(),
  ruleVersion: z.string(),
});

const debitCreditItemSchema = z.object({
  account: z.string().min(1).describe('GL account name'),
  amount: z.number().optional().describe('Required for SOURCE_LINE_AMOUNT and HUMAN_ENTERED_AMOUNT; forbidden for DETERMINISTIC_ENGINE_AMOUNT'),
  amountProvenance: amountProvenanceLiteralSchema.describe('SOURCE_LINE_AMOUNT | HUMAN_ENTERED_AMOUNT | DETERMINISTIC_ENGINE_AMOUNT'),
  sourceRef: sourceRefSchema.optional().describe('Required when amountProvenance=SOURCE_LINE_AMOUNT'),
  deterministicCalcRef: deterministicCalcRefSchema.optional().describe('When amountProvenance=DETERMINISTIC_ENGINE_AMOUNT; TS core computes amount'),
});

export const proposeTrialBalanceAdjustmentSchema = z.object({
  debits: z.array(debitCreditItemSchema).min(1).describe('Debit side with provenance per line'),
  credits: z.array(debitCreditItemSchema).min(1).describe('Credit side with provenance per line'),
  justification: z.string().min(1).describe('Brief justification'),
  periodLabel: z.string().optional().describe('Required when any line uses SOURCE_LINE_AMOUNT with periodTrialBalanceRowId (e.g. 2025-01)'),
  actorUserId: z.string().optional().describe('Required when any line uses HUMAN_ENTERED_AMOUNT; stored as human-origin'),
});

export type ProposeTrialBalanceAdjustmentInput = z.infer<typeof proposeTrialBalanceAdjustmentSchema>;

export const proposeTrialBalanceAdjustmentDefinition: ToolDefinition<ProposeTrialBalanceAdjustmentInput> = {
  name: 'proposeTrialBalanceAdjustment',
  description:
    'Propose a trial balance adjustment (debits and credits) to fix a ledger imbalance. Submit to the Staging Area; when approved, the adjustment is merged into the trial balance. Every amount MUST have amountProvenance: SOURCE_LINE_AMOUNT (exact match to a TB row), HUMAN_ENTERED_AMOUNT (user-entered; require actorUserId), or DETERMINISTIC_ENGINE_AMOUNT (TS computes; do not supply amount). Advisor may not invent or estimate amounts.',
  parameters: proposeTrialBalanceAdjustmentSchema as import('zod').z.ZodType<ProposeTrialBalanceAdjustmentInput>,
};

export interface ProposeTrialBalanceAdjustmentContext {
  tenantId: string;
  pool: import('pg').Pool;
}

const SOURCE_AMOUNT_TOLERANCE = 0.01;

/**
 * Resolve source line amount from period TB by row index (periodTrialBalanceRowId as string index).
 * Returns the single non-zero amount (debit or credit) of that row, or null if not found.
 */
async function getSourceAmountByRowIndex(
  tenantId: string,
  periodLabel: string,
  periodTrialBalanceRowId: string,
  pool: import('pg').Pool
): Promise<{ amount: number } | null> {
  const rec = await getUnadjusted(tenantId, periodLabel, pool);
  if (!rec?.entries?.length) return null;
  const idx = parseInt(periodTrialBalanceRowId, 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= rec.entries.length) return null;
  const row = rec.entries[idx];
  const amount = (row.debit ?? 0) || (row.credit ?? 0);
  if (amount === 0) return null;
  return { amount };
}

/**
 * Validate SOURCE_LINE_AMOUNT: require sourceRef; assert amount matches source within tolerance.
 */
async function validateSourceLineAmount(
  line: { amount?: number; amountProvenance: string; sourceRef?: { periodTrialBalanceRowId?: string; ledgerLineId?: string; externalTxnId?: string } },
  lineLabel: string,
  tenantId: string,
  periodLabel: string,
  pool: import('pg').Pool
): Promise<{ ok: boolean; error?: string }> {
  if (line.amountProvenance !== 'SOURCE_LINE_AMOUNT') return { ok: true };
  if (!line.sourceRef) return { ok: false, error: `${lineLabel}: amountProvenance SOURCE_LINE_AMOUNT requires sourceRef` };
  const amount = line.amount;
  if (amount == null || typeof amount !== 'number') return { ok: false, error: `${lineLabel}: amount required for SOURCE_LINE_AMOUNT` };
  const rowId = line.sourceRef.periodTrialBalanceRowId;
  if (rowId != null && rowId !== '') {
    const source = await getSourceAmountByRowIndex(tenantId, periodLabel, rowId, pool);
    if (!source) return { ok: false, error: `${lineLabel}: source row not found or zero (periodTrialBalanceRowId=${rowId})` };
    const diff = Math.abs(amount - source.amount);
    if (diff > SOURCE_AMOUNT_TOLERANCE) {
      return { ok: false, error: `${lineLabel}: amount ${amount} does not match source line amount ${source.amount} (tolerance ${SOURCE_AMOUNT_TOLERANCE}); discrepancy ${diff.toFixed(4)}` };
    }
    if (diff > 0) {
      // Log discrepancy within tolerance (e.g. 0.01) for audit
      console.warn(`[proposeTrialBalanceAdjustment] ${lineLabel} amount ${amount} vs source ${source.amount} discrepancy ${diff.toFixed(4)} within tolerance`);
    }
  }
  return { ok: true };
}

/**
 * Validate HUMAN_ENTERED_AMOUNT: require actorUserId.
 */
function validateHumanEnteredAmount(
  line: { amount?: number; amountProvenance: string },
  lineLabel: string,
  actorUserId: string | undefined
): { ok: boolean; error?: string } {
  if (line.amountProvenance !== 'HUMAN_ENTERED_AMOUNT') return { ok: true };
  if (!actorUserId?.trim()) return { ok: false, error: `${lineLabel}: amountProvenance HUMAN_ENTERED_AMOUNT requires actorUserId` };
  if (line.amount == null || typeof line.amount !== 'number') return { ok: false, error: `${lineLabel}: amount required for HUMAN_ENTERED_AMOUNT` };
  return { ok: true };
}

/**
 * Validate DETERMINISTIC_ENGINE_AMOUNT: reject if Advisor provides amount (TS must compute).
 */
function validateDeterministicAmount(
  line: { amount?: number; amountProvenance: string },
  lineLabel: string
): { ok: boolean; error?: string } {
  if (line.amountProvenance !== 'DETERMINISTIC_ENGINE_AMOUNT') return { ok: true };
  if (line.amount != null && typeof line.amount === 'number') {
    return { ok: false, error: `${lineLabel}: amount must not be provided by Advisor when amountProvenance is DETERMINISTIC_ENGINE_AMOUNT; TS core computes it` };
  }
  return { ok: true };
}

/** Map tool provenance + refs to internal AmountProvenance for staging payload. */
function toInternalProvenance(
  item: ProposeTrialBalanceAdjustmentInput['debits'][0],
  actorUserId: string | undefined
): import('../../types/amount_provenance.js').AmountProvenance | undefined {
  if (item.amountProvenance === 'SOURCE_LINE_AMOUNT' && item.sourceRef) {
    return {
      kind: 'ledger_exact',
      sourceTbRowId: item.sourceRef.periodTrialBalanceRowId,
      sourceLedgerLineId: item.sourceRef.ledgerLineId,
    };
  }
  if (item.amountProvenance === 'HUMAN_ENTERED_AMOUNT' && actorUserId) {
    return { kind: 'human_entered', enteredBy: actorUserId, enteredAt: new Date().toISOString() };
  }
  if (item.amountProvenance === 'DETERMINISTIC_ENGINE_AMOUNT' && item.deterministicCalcRef) {
    return {
      kind: 'engine_calculation',
      ruleId: item.deterministicCalcRef.calcId,
      ruleVersion: item.deterministicCalcRef.ruleVersion,
      inputs: { inputsHash: item.deterministicCalcRef.inputsHash },
    };
  }
  return undefined;
}

/**
 * Run the proposeTrialBalanceAdjustment tool. Validates provenance; submits to HITL Staging.
 */
export async function runProposeTrialBalanceAdjustment(
  input: ProposeTrialBalanceAdjustmentInput,
  context?: ProposeTrialBalanceAdjustmentContext
): Promise<ToolResult<{ id: string; status: string; message: string }>> {
  const parsed = proposeTrialBalanceAdjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }

  const { debits, credits, justification, periodLabel, actorUserId } = parsed.data;
  const tenantId = context?.tenantId;
  const pool = context?.pool;

  // Require periodLabel when any line uses SOURCE_LINE_AMOUNT with periodTrialBalanceRowId
  const needsPeriod = [...debits, ...credits].some(
    (l) => l.amountProvenance === 'SOURCE_LINE_AMOUNT' && l.sourceRef?.periodTrialBalanceRowId
  );
  if (needsPeriod && (!periodLabel?.trim() || !tenantId || !pool)) {
    return { success: false, error: 'periodLabel, tenantId, and pool are required when using SOURCE_LINE_AMOUNT with periodTrialBalanceRowId' };
  }

  const allLines = debits.map((d, i) => ({ ...d, _label: `debits[${i}]` })).concat(credits.map((c, i) => ({ ...c, _label: `credits[${i}]` })));

  for (const line of allLines) {
    const label = line._label;
    const r1 = validateDeterministicAmount(line, label);
    if (!r1.ok) return { success: false, error: r1.error ?? 'Invalid DETERMINISTIC_ENGINE_AMOUNT' };
    const r2 = validateHumanEnteredAmount(line, label, actorUserId);
    if (!r2.ok) return { success: false, error: r2.error ?? 'Invalid HUMAN_ENTERED_AMOUNT' };
    if (line.amountProvenance === 'SOURCE_LINE_AMOUNT' && periodLabel && tenantId && pool) {
      const r3 = await validateSourceLineAmount(line, label, tenantId, periodLabel, pool);
      if (!r3.ok) return { success: false, error: r3.error ?? 'Invalid SOURCE_LINE_AMOUNT' };
    }
  }

  const debitSummary = debits.map((d) => `${d.account} ${d.amount ?? '(TS compute)'}`).join(', ');
  const creditSummary = credits.map((c) => `${c.account} ${c.amount ?? '(TS compute)'}`).join(', ');
  const proposedAction = `Trial balance adjustment: Debit ${debitSummary} | Credit ${creditSummary}`;

  const payload = {
    debits: debits.map((d) => ({
      account: d.account,
      amount: d.amount,
      amountProvenance: d.amountProvenance,
      sourceRef: d.sourceRef,
      deterministicCalcRef: d.deterministicCalcRef,
      amountProvenanceInternal: toInternalProvenance(d, actorUserId),
    })),
    credits: credits.map((c) => ({
      account: c.account,
      amount: c.amount,
      amountProvenance: c.amountProvenance,
      sourceRef: c.sourceRef,
      deterministicCalcRef: c.deterministicCalcRef,
      amountProvenanceInternal: toInternalProvenance(c, actorUserId),
    })),
  };

  const opts = pool && tenantId ? { pool, tenantId } : undefined;
  const item = await Promise.resolve(
    submitToStaging(
      { proposedAction, justification, type: 'adjustment', payload },
      opts
    )
  );

  return {
    success: true,
    data: {
      id: item.id,
      status: item.status,
      message: 'Adjustment submitted to Staging Area. When approved, call buildFinancialStatements again to merge and re-build.',
    },
  };
}
