/**
 * Tool: buildFinancialStatements — build Balance Sheet and P&L from validated trial balance.
 * Accepts only sessionId and tenantId; trial balance is loaded from the database (session snapshot).
 * If the LLM passes entries or other invented data, the tool returns a Grounding Violation.
 */

import { z } from 'zod';
import type { Pool } from 'pg';
import { parseTrialBalance } from '../../services/trialBalanceParser.js';
import { buildValidatedStatements as buildFinancialStatementsService, MathematicalIntegrityError } from '../../services/financialStatements.js';
import { generateStatements } from '../../services/statementGenerator.js';
import { listContracts } from '../../db/repositories/revenue_recognition_repository.js';
import type { IntegrityContractFact } from '../../types/integrity.js';
import { runPlanExecuteVerify } from '../../services/planExecuteVerify.js';
import { loadSessionSnapshot, listStagingItems, type SessionSnapshot } from '../../services/persistence_service.js';
import {
  mergeAdjustmentsIntoEntries,
  type TrialBalanceAdjustment,
} from '../../services/adjusted_trial_balance_service.js';
import {
  runIntegrityGate,
  INTEGRITY_GATE_CRITICAL_MESSAGE,
} from '../../services/integrity_gate_service.js';
import { submitToStaging } from '../../services/hitl_orchestrator.js';
import type { ToolDefinition, ToolResult } from './types.js';

const GROUNDING_VIOLATION =
  'Grounding Violation: This tool accepts only sessionId and tenantId. Trial balance must come from the database (session snapshot). Do not pass entries or invented numbers.';

const leaseInputSchema = z.object({
  leasePayments: z.array(z.number()).min(1),
  discountRate: z.number().min(0).max(1),
  paymentTiming: z.enum(['beginning', 'end']).optional(),
});

/** Tool input: only session and tenant identifiers; data is loaded from DB. */
export const buildFinancialStatementsSchema = z.object({
  sessionId: z.string().min(1).describe('Session ID that holds the validated trial balance (from pipeline/session snapshot).'),
  tenantId: z.string().min(1).describe('Tenant ID for the session.'),
  standard: z
    .enum(['ASPE', 'IFRS', 'FRS102', 'US_GAAP'])
    .optional()
    .describe('Accounting standard: ASPE, IFRS, FRS102, or US GAAP.'),
  lease: leaseInputSchema
    .optional()
    .describe('Optional lease data for IFRS 16: leasePayments, discountRate, paymentTiming. Used when standard is IFRS.'),
  fullSet: z
    .boolean()
    .optional()
    .default(false)
    .describe('When true, include Cash Flow, Equity Changes, and Notes/Policies in the response.'),
});

export type BuildFinancialStatementsInput = z.infer<typeof buildFinancialStatementsSchema>;

export const buildFinancialStatementsDefinition: ToolDefinition<BuildFinancialStatementsInput> = {
  name: 'buildFinancialStatements',
  description:
    'Build Balance Sheet and P&L from the validated trial balance stored for this session. Call with sessionId and tenantId only; data is loaded from the database. Do not pass entries or any numbers—only sessionId and tenantId. Returns Balance Sheet, P&L, and classified entries. Ensures Assets = Liabilities + Equity.',
  parameters: buildFinancialStatementsSchema as import('zod').z.ZodType<BuildFinancialStatementsInput>,
};

/** Serialize statement line for JSON (no circular refs) */
function serializeLine(line: { accountCode?: string; label: string; amount: number }) {
  return { accountCode: line.accountCode, label: line.label, amount: line.amount };
}

/** Context must include pool so the tool can load the session snapshot from the database. */
export interface BuildFinancialStatementsContext {
  tenantId: string;
  pool: Pool;
}

/** Extract validated entries from a session snapshot (raw_rows or statements output). */
function entriesFromSnapshot(snapshot: SessionSnapshot): Array<{ accountName: string; debit: number; credit: number; accountCode?: string }> {
  if (snapshot.type === 'raw_rows' && Array.isArray(snapshot.rawRows) && snapshot.rawRows.length > 0) {
    return snapshot.rawRows.map((r) => ({
      accountName: r.accountName ?? '',
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
      accountCode: r.accountCode,
    }));
  }
  if (snapshot.type === 'statements' && snapshot.output?.trialBalance?.entries?.length) {
    return snapshot.output.trialBalance.entries.map((e) => ({
      accountName: e.accountName ?? '',
      debit: Number(e.debit) || 0,
      credit: Number(e.credit) || 0,
      accountCode: e.accountCode,
    }));
  }
  return [];
}

/**
 * Run the buildFinancialStatements tool. Data is loaded from the database using sessionId and tenantId only.
 * If the LLM passes entries or prior_entries (invented numbers), returns Grounding Violation.
 */
export async function runBuildFinancialStatements(
  input: BuildFinancialStatementsInput,
  context?: BuildFinancialStatementsContext
): Promise<ToolResult<{
  balanceSheet: {
    assets: ReturnType<typeof serializeLine>[];
    liabilities: ReturnType<typeof serializeLine>[];
    equity: ReturnType<typeof serializeLine>[];
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    balances: boolean;
  };
  profitAndLoss: {
    revenue: ReturnType<typeof serializeLine>[];
    expenses: ReturnType<typeof serializeLine>[];
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
  };
  classifiedEntriesCount: number;
}>> {
  try {
    // Reject LLM-invented data: tool accepts only sessionId and tenantId
    const raw = input as Record<string, unknown>;
    if (raw.entries != null && (Array.isArray(raw.entries) || typeof raw.entries === 'object')) {
      return { success: false, error: GROUNDING_VIOLATION };
    }
    if (raw.prior_entries != null && (Array.isArray(raw.prior_entries) || typeof raw.prior_entries === 'object')) {
      return { success: false, error: GROUNDING_VIOLATION };
    }

    const parsed = buildFinancialStatementsSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.message };
    }

    if (!context?.pool) {
      return { success: false, error: 'Grounding Violation: pool is required to load session snapshot from the database.' };
    }

    const snapshot = await loadSessionSnapshot(context.pool, parsed.data.sessionId, parsed.data.tenantId);
    if (!snapshot) {
      return { success: false, error: 'Grounding Violation: No session snapshot found for this sessionId and tenantId. Upload or ingest trial balance first so the session has validated data.' };
    }

    const unadjustedEntries = entriesFromSnapshot(snapshot);
    if (unadjustedEntries.length === 0) {
      return { success: false, error: 'Grounding Violation: Session snapshot contains no trial balance entries. Ingest or upload trial balance first.' };
    }

    // Versioning: Unadjusted TB (Source) → Proposed Adjustments (HITL) → Adjusted TB.
    // Refuse to run on raw source data if pending adjustments exist.
    const pendingStaging = await listStagingItems(context.pool, parsed.data.tenantId, { status: 'pending' });
    if (pendingStaging.length > 0) {
      return {
        success: false,
        error: `Cannot build financial statements on raw source data while ${pendingStaging.length} pending adjustment(s) exist. Approve or reject all pending HITL items first, then retry. Every number in the report must be traceable to the original upload or an approved agent-proposed adjustment.`,
      };
    }

    // Merge approved HITL adjustments into a virtual Adjusted state before calculating Balance Sheet or P&L.
    const approvedStaging = await listStagingItems(context.pool, parsed.data.tenantId, { status: 'approved' });
    const approvedAdjustments: TrialBalanceAdjustment[] = [];
    const appliedAdjustmentIds: string[] = [];
    for (const item of approvedStaging) {
      const p = item.payload;
      if (!p || typeof p !== 'object') continue;
      const debits = Array.isArray(p.debits) ? p.debits : [];
      const credits = Array.isArray(p.credits) ? p.credits : [];
      if (debits.length === 0 && credits.length === 0) continue;
      const adj: TrialBalanceAdjustment = {
        debits: debits.map((d: { account?: string; amount?: number }) => ({
          account: typeof d?.account === 'string' ? d.account : 'Unknown',
          amount: typeof d?.amount === 'number' ? d.amount : 0,
        })),
        credits: credits.map((c: { account?: string; amount?: number }) => ({
          account: typeof c?.account === 'string' ? c.account : 'Unknown',
          amount: typeof c?.amount === 'number' ? c.amount : 0,
        })),
      };
      approvedAdjustments.push(adj);
      appliedAdjustmentIds.push(item.id);
    }

    const entries = mergeAdjustmentsIntoEntries(unadjustedEntries, approvedAdjustments);

    const trialBalance = parseTrialBalance(entries);
    if (!trialBalance.balances && trialBalance.errors.length > 0) {
      return {
        success: false,
        error: `Trial balance does not balance: ${trialBalance.errors.join('; ')}`,
      };
    }

    const standard = parsed.data.standard;
    const lease = parsed.data.lease;
    const fullSet = parsed.data.fullSet ?? false;
    const priorTrialBalance = undefined;

    let stmtOpts: { lease?: typeof lease; fullSet: boolean; priorTrialBalance?: undefined; contracts?: IntegrityContractFact[] } = {
      lease,
      fullSet,
      priorTrialBalance,
    };
    if (standard && context) {
      const rows = await listContracts(context.pool, parsed.data.tenantId);
      stmtOpts = { ...stmtOpts, contracts: rows.map((r) => ({ id: r.id, totalContractValue: r.totalContractValue, periodRecognizedRevenue: undefined })) };
    }
    const result = standard
      ? await generateStatements(trialBalance, standard, stmtOpts)
      : await buildFinancialStatementsService(trialBalance);
    const balanceSheet = result.balanceSheet;
    const profitAndLoss = result.profitAndLoss;
    const classifiedEntries = result.classifiedEntries;
    const standardMetadata = 'standardMetadata' in result ? result.standardMetadata : undefined;

    const pev = runPlanExecuteVerify({ trialBalance, balanceSheet, profitAndLoss });
    if (!pev.verification.passed) {
      return {
        success: false,
        error: `Verification failed: ${pev.verification.checks.join('; ')}. Unverified statements are not returned.`,
      };
    }

    // Hard Gate: after any agentic adjustment, intercept if ledger is unbalanced so user never sees an invalid Balance Sheet.
    const gate = runIntegrityGate({
      trialBalance: {
        totalDebits: trialBalance.totalDebits,
        totalCredits: trialBalance.totalCredits,
      },
      balanceSheet: {
        totalAssets: balanceSheet.totalAssets,
        totalLiabilities: balanceSheet.totalLiabilities,
        totalEquity: balanceSheet.totalEquity,
      },
    });
    if (!gate.passed) {
      return {
        success: false,
        error: INTEGRITY_GATE_CRITICAL_MESSAGE,
      };
    }

    return {
      success: true,
      data: {
        ...('riskLevel' in result && result.riskLevel === 'balanced_but_high_risk' && {
          riskLevel: 'balanced_but_high_risk' as const,
          riskMessage: 'Balanced but High Risk: suspicious plug accounts (Miscellaneous, Suspense, Other) detected. Mandatory audit alert created.',
        }),
        balanceSheet: {
          assets: balanceSheet.assets.map(serializeLine),
          liabilities: balanceSheet.liabilities.map(serializeLine),
          equity: balanceSheet.equity.map(serializeLine),
          totalAssets: balanceSheet.totalAssets,
          totalLiabilities: balanceSheet.totalLiabilities,
          totalEquity: balanceSheet.totalEquity,
          balances: balanceSheet.balances,
        },
        profitAndLoss: {
          revenue: profitAndLoss.revenue.map(serializeLine),
          expenses: profitAndLoss.expenses.map(serializeLine),
          totalRevenue: profitAndLoss.totalRevenue,
          totalExpenses: profitAndLoss.totalExpenses,
          netIncome: profitAndLoss.netIncome,
        },
        classifiedEntriesCount: classifiedEntries.length,
        /** IDs of approved HITL adjustments merged into this report (traceability). */
        appliedAdjustmentIds: appliedAdjustmentIds.length ? appliedAdjustmentIds : undefined,
        /** For audit: plan + deterministic verification (V1–V3b). */
        reasoningChain: { plan: pev.plan, executedAt: pev.executedAt, verification: pev.verification },
        ...(standard ? { standard } : {}),
        ...(standardMetadata ? { standardMetadata } : {}),
        ...('cashFlow' in result && result.cashFlow ? { cashFlow: result.cashFlow } : {}),
        ...('equityChanges' in result && result.equityChanges ? { equityChanges: result.equityChanges } : {}),
        ...('notesAndPolicies' in result && result.notesAndPolicies ? { notesAndPolicies: result.notesAndPolicies } : {}),
      },
    };
  } catch (e) {
    if (e instanceof MathematicalIntegrityError) {
      const selfHealMessage =
        e.check === 'A'
          ? `ERROR: Your proposed entry unbalances the trial balance by ${e.imbalanceAmount}. You must provide a correcting debit/credit so that Sum(Debits) = Sum(Credits).`
          : `ERROR: Your proposed entry unbalances the ledger by ${e.imbalanceAmount}. You must provide a correcting debit/credit to maintain $Assets = L+E$.`;
      return {
        success: false,
        error: selfHealMessage,
        data: { check: e.check, imbalanceAmount: e.imbalanceAmount, details: e.details },
      } as ToolResult<unknown>;
    }
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}
