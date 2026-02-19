/**
 * Issue Detection Service
 *
 * Detection functions for each issue type. Each checks a condition and creates an Issue
 * if the condition is met. Idempotent: no duplicate issues for the same problem
 * (same period + issue_type + source key).
 */

import type { Pool } from 'pg';
import type { CloseIssue, IssueType, CloseIssueSeverity, CloseIssueCategory } from '../types/close_issue.js';
import { createIssue, listIssues, autoVerifyIssue } from './issue_service.js';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';

export interface DetectionContext {
  pool: Pool;
  tenantId: string;
  periodId: string; // close_session id
}

/** Find existing open issue for same type (and optional account). If fix confirmed (check no longer fails), auto-verify. */
async function ensureOneIssue(
  ctx: DetectionContext,
  issueType: IssueType,
  options: {
    severity: CloseIssueSeverity;
    category: CloseIssueCategory;
    title: string;
    description: string;
    affectedAccounts?: string[];
    sourceCheck?: string;
    sourceDetails?: Record<string, unknown>;
    accountCode?: string;
  },
  problemStillExists: boolean
): Promise<CloseIssue | null> {
  const session = await getCloseSessionById(ctx.pool, ctx.tenantId, ctx.periodId);
  if (!session) return null;
  const entityId = session.entityId;
  const existing = await listIssues(ctx.pool, {
    tenantId: ctx.tenantId,
    periodId: ctx.periodId,
    issueType,
  });
  const match = existing.find((i) => {
    if (options.accountCode && !i.affectedAccounts.includes(options.accountCode)) return false;
    return i.status !== 'verified' && i.status !== 'waived';
  });
  if (match) {
    if (!problemStillExists) {
      await autoVerifyIssue(ctx.pool, ctx.tenantId, match.issueId);
      return null;
    }
    return match;
  }
  if (!problemStillExists) return null;
  return createIssue(ctx.pool, {
    tenantId: ctx.tenantId,
    periodId: ctx.periodId,
    entityId,
    issueType,
    severity: options.severity,
    category: options.category,
    title: options.title,
    description: options.description,
    affectedAccounts: options.affectedAccounts,
    sourceCheck: options.sourceCheck,
    sourceDetails: options.sourceDetails,
  });
}

/** Unmapped accounts in TB for period. Uses checkMappingCompleteness (same logic as readiness gate). */
export async function detectUnmappedAccounts(ctx: DetectionContext): Promise<CloseIssue[]> {
  const session = await getCloseSessionById(ctx.pool, ctx.tenantId, ctx.periodId);
  if (!session || !session.entityId) return [];
  const { checkMappingCompleteness } = await import('./mapping_completeness_gate.js');
  const result = await checkMappingCompleteness(
    ctx.pool,
    ctx.tenantId,
    ctx.periodId,
    session.entityId
  );
  const unmappedCodes = new Set(result.unmapped_accounts.map((u) => u.account_code || u.account_name).filter(Boolean));

  // Auto-verify issues for accounts that are now mapped
  const allUnmapped = await listIssues(ctx.pool, { tenantId: ctx.tenantId, periodId: ctx.periodId, issueType: 'unmapped_account' });
  const openUnmapped = allUnmapped.filter((i) => i.status !== 'verified' && i.status !== 'waived');
  for (const issue of openUnmapped) {
    const code = issue.affectedAccounts?.[0];
    if (code && !unmappedCodes.has(code)) {
      await ensureOneIssue(
        ctx,
        'unmapped_account',
        {
          severity: 'blocking',
          category: 'ingestion',
          title: `Unmapped account: ${code}`,
          description: `Account ${code} has no mapping to reporting taxonomy.`,
          affectedAccounts: [code],
          sourceCheck: 'mapping_completeness_gate',
          sourceDetails: {},
          accountCode: code,
        },
        false
      );
    }
  }

  const issues: CloseIssue[] = [];
  for (const unmapped of result.unmapped_accounts) {
    const code = unmapped.account_code || unmapped.account_name;
    if (!code) continue;
    const created = await ensureOneIssue(
      ctx,
      'unmapped_account',
      {
        severity: 'blocking',
        category: 'ingestion',
        title: `Unmapped account: ${code} — ${unmapped.account_name}`,
        description: `Account ${code} (${unmapped.account_name}) has a balance of ${unmapped.balance} but is not mapped to any reporting line item. This balance will not appear on financial statements until mapped.`,
        affectedAccounts: [code],
        sourceCheck: 'mapping_completeness_gate',
        sourceDetails: { accountCode: unmapped.account_code, accountName: unmapped.account_name, balance: unmapped.balance },
        accountCode: code,
      },
      true
    );
    if (created) issues.push(created);
  }
  return issues;
}

/** Balance sheet imbalance (A ≠ L+E). Single critical issue. */
export async function detectBalanceSheetImbalance(ctx: DetectionContext): Promise<CloseIssue[]> {
  const session = await getCloseSessionById(ctx.pool, ctx.tenantId, ctx.periodId);
  if (!session) return [];
  const periodLabel = session.periodEnd?.slice(0, 7);
  if (!periodLabel) return [];
  let imbalance = false;
  try {
    const { buildFinancialStatements } = await import('./financialStatements.js');
    const { getTrialBalanceForCertification } = await import('./adjusted_trial_balance_service.js');
    const tb = await getTrialBalanceForCertification(ctx.pool, ctx.tenantId, periodLabel, ctx.periodId);
    const entries = tb.trialBalance ?? [];
    const totalDebits = entries.reduce((s, e) => s + (e.debit ?? 0), 0);
    const totalCredits = entries.reduce((s, e) => s + (e.credit ?? 0), 0);
    const trialBalanceResult = {
      entries: entries.map((e) => ({
        accountName: (e as { accountName?: string }).accountName ?? '',
        debit: e.debit ?? 0,
        credit: e.credit ?? 0,
        accountCode: (e as { accountCode?: string }).accountCode,
        accountType: (e as { accountType?: string }).accountType as import('../types/financial.js').AccountType | undefined,
      })),
      totalDebits,
      totalCredits,
      balances: true,
      errors: [] as string[],
    };
    const { balanceSheet } = buildFinancialStatements(trialBalanceResult);
    const diff = Math.abs(
      balanceSheet.totalAssets - (balanceSheet.totalLiabilities + balanceSheet.totalEquity)
    );
    imbalance = diff > 0.01;
  } catch {
    imbalance = true;
  }
  const created = await ensureOneIssue(
    ctx,
    'bs_imbalance',
    {
      severity: 'critical',
      category: 'statement',
      title: 'Balance sheet does not balance',
      description: 'Assets ≠ Liabilities + Equity. Fix adjustments or mapping.',
      sourceCheck: 'bs_imbalance',
      sourceDetails: {},
    },
    imbalance
  );
  return created ? [created] : [];
}

/** Reconciliation completeness (Step 5). Issues for not_started, over_tolerance, awaiting_approval. */
export async function detectIncompleteReconciliations(ctx: DetectionContext): Promise<CloseIssue[]> {
  const session = await getCloseSessionById(ctx.pool, ctx.tenantId, ctx.periodId);
  if (!session) return [];
  const { checkReconCompleteness } = await import('./recon_completeness_gate.js');
  const result = await checkReconCompleteness(ctx.pool, ctx.tenantId, ctx.periodId);
  if (result.passes || result.total_required === 0) return [];

  const issues: CloseIssue[] = [];
  for (const blocker of result.blockers) {
    const issueType: IssueType =
      blocker.reason.includes('tolerance') || blocker.reason.includes('variance')
        ? 'recon_over_tolerance'
        : blocker.reason.includes('approval')
          ? 'recon_incomplete'
          : 'recon_not_started';

    const created = await ensureOneIssue(
      ctx,
      issueType,
      {
        severity: 'blocking',
        category: 'reconciliation',
        title: `Reconciliation incomplete: ${blocker.account_name}`,
        description: blocker.reason,
        affectedAccounts: [blocker.account_code],
        sourceCheck: 'recon_completeness_gate',
        sourceDetails: { recon_id: blocker.recon_id, account_code: blocker.account_code },
        accountCode: blocker.account_code,
      },
      true
    );
    if (created) issues.push(created);
  }
  return issues;
}

/** Unexplained material variances. */
export async function detectUnexplainedVariances(ctx: DetectionContext): Promise<CloseIssue[]> {
  const session = await getCloseSessionById(ctx.pool, ctx.tenantId, ctx.periodId);
  if (!session) return [];
  const { checkVarianceCompleteness } = await import('./variance_analysis_service.js');
  const result = await checkVarianceCompleteness(ctx.pool, ctx.tenantId, ctx.periodId);
  if (result.passes || result.unexplained.length === 0) return [];
  const created = await ensureOneIssue(
    ctx,
    'missing_variance_explanation',
    {
      severity: 'blocking',
      category: 'statement',
      title: `${result.unexplained.length} material variance(s) unexplained`,
      description: `${result.unexplained.length} period-over-period variance(s) exceed materiality threshold. Add explanations before close.`,
      affectedAccounts: result.unexplained.map((v) => v.fsLineId),
      sourceCheck: 'variance_analysis_gate',
      sourceDetails: { varianceIds: result.unexplained.map((v) => v.id) },
    },
    true
  );
  return created ? [created] : [];
}

/** Pending AJE templates: proposed but not yet applied or skipped. */
export async function detectPendingAjeTemplates(ctx: DetectionContext): Promise<CloseIssue[]> {
  const session = await getCloseSessionById(ctx.pool, ctx.tenantId, ctx.periodId);
  if (!session) return [];
  const { checkTemplateCompleteness } = await import('./template_completeness_gate.js');
  const result = await checkTemplateCompleteness(ctx.pool, ctx.tenantId, ctx.periodId);
  if (result.passes || result.pending === 0) return [];
  const created = await ensureOneIssue(
    ctx,
    'pending_aje_template',
    {
      severity: 'blocking',
      category: 'adjustment',
      title: `${result.pending} AJE template(s) pending`,
      description: `${result.pending} recurring AJE template(s) have been proposed for this period. Apply or skip each before close.`,
      affectedAccounts: result.pending_names,
      sourceCheck: 'template_completeness_gate',
      sourceDetails: { templateIds: result.pending_names },
    },
    true
  );
  return created ? [created] : [];
}