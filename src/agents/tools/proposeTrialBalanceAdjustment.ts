/**
 * Tool: proposeTrialBalanceAdjustment — submit a correcting debit/credit to the HITL Staging Area.
 * When approved, buildFinancialStatements merges these into the trial balance before building statements.
 * Use after buildFinancialStatements returns a math/balance error to fix the specific accounts identified.
 */

import { z } from 'zod';
import { submitToStaging } from '../../services/hitl_orchestrator.js';
import type { ToolDefinition, ToolResult } from './types.js';

const debitCreditItemSchema = z.object({
  account: z.string().min(1).describe('GL account name (e.g. Cash, Lease Liability)'),
  amount: z.number().describe('Amount (positive number)'),
});

export const proposeTrialBalanceAdjustmentSchema = z.object({
  debits: z
    .array(debitCreditItemSchema)
    .min(1)
    .describe('Debit side: account(s) and amount(s) to debit'),
  credits: z
    .array(debitCreditItemSchema)
    .min(1)
    .describe('Credit side: account(s) and amount(s) to credit'),
  justification: z.string().min(1).describe('Brief justification (e.g. correcting lease classification, plug account)'),
});

export type ProposeTrialBalanceAdjustmentInput = z.infer<typeof proposeTrialBalanceAdjustmentSchema>;

export const proposeTrialBalanceAdjustmentDefinition: ToolDefinition<ProposeTrialBalanceAdjustmentInput> = {
  name: 'proposeTrialBalanceAdjustment',
  description:
    'Propose a trial balance adjustment (debits and credits) to fix a ledger imbalance. Submit to the Staging Area; when approved, the adjustment is merged into the trial balance before building statements. Call this when buildFinancialStatements returns a math/balance error (Assets != L+E or trial balance does not balance). Then call buildFinancialStatements again after the adjustment is approved.',
  parameters: proposeTrialBalanceAdjustmentSchema as import('zod').z.ZodType<ProposeTrialBalanceAdjustmentInput>,
};

export interface ProposeTrialBalanceAdjustmentContext {
  tenantId: string;
  pool: import('pg').Pool;
}

/**
 * Run the proposeTrialBalanceAdjustment tool. Submits to HITL Staging; when approved, buildFinancialStatements will merge it.
 */
export async function runProposeTrialBalanceAdjustment(
  input: ProposeTrialBalanceAdjustmentInput,
  context?: ProposeTrialBalanceAdjustmentContext
): Promise<ToolResult<{ id: string; status: string; message: string }>> {
  const parsed = proposeTrialBalanceAdjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }

  const { debits, credits, justification } = parsed.data;
  const debitSummary = debits.map((d) => `${d.account} ${d.amount}`).join(', ');
  const creditSummary = credits.map((c) => `${c.account} ${c.amount}`).join(', ');
  const proposedAction = `Trial balance adjustment: Debit ${debitSummary} | Credit ${creditSummary}`;

  const payload = {
    debits: debits.map((d) => ({ account: d.account, amount: d.amount })),
    credits: credits.map((c) => ({ account: c.account, amount: c.amount })),
  };

  const opts = context?.pool && context?.tenantId ? { pool: context.pool, tenantId: context.tenantId } : undefined;
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
