import type { Pool } from 'pg';
import type { CompiledRunbookTask, RunbookTaskExecutionStatus } from '../types/close_runbook.js';
import type { CanadianAspeRequirementCode } from '../types/accounting_close_profile.js';
import { from, sumRound2 } from '../utils/decimal.js';

export interface RunbookCapabilityOutcome {
  status: Extract<RunbookTaskExecutionStatus, 'completed' | 'waiting_human' | 'blocked'>;
  result: Record<string, unknown>;
  blockedReason?: string;
}

export interface RunbookCapabilityContext {
  pool: Pool;
  tenantId: string;
  closeSessionId: string;
  periodLabel: string;
  task: CompiledRunbookTask;
}

async function executeSourceIntegrity(ctx: RunbookCapabilityContext): Promise<RunbookCapabilityOutcome> {
  const {
    detectBalanceSheetImbalance,
    detectUnmappedAccounts,
  } = await import('./issue_detection_service.js');
  const unmapped = await detectUnmappedAccounts({ pool: ctx.pool, tenantId: ctx.tenantId, periodId: ctx.closeSessionId });
  const imbalance = await detectBalanceSheetImbalance({ pool: ctx.pool, tenantId: ctx.tenantId, periodId: ctx.closeSessionId });
  const { checkMappingCompleteness } = await import('./mapping_completeness_gate.js');
  const { getTrialBalanceForCertification } = await import('./adjusted_trial_balance_service.js');
  const { buildCertifiedStatementsFromSnapshot } = await import('./certified_statements_service.js');
  const { getSession } = await import('./close_session_service.js');
  const session = await getSession(ctx.pool, ctx.tenantId, ctx.closeSessionId);
  if (!session) throw new Error(`Close session ${ctx.closeSessionId} not found`);
  const mapping = await checkMappingCompleteness(
    ctx.pool,
    ctx.tenantId,
    ctx.closeSessionId,
    session.entityId
  );
  const trialBalance = await getTrialBalanceForCertification(
    ctx.pool,
    ctx.tenantId,
    ctx.periodLabel,
    ctx.closeSessionId
  );
  let statementIntegrityError: string | null = null;
  if (trialBalance.trialBalance.length === 0) {
    statementIntegrityError = 'Session trial balance contains no accounts';
  } else {
    try {
      buildCertifiedStatementsFromSnapshot({
        trialBalance: {
          entries: trialBalance.trialBalance.map((entry) => ({
            accountName: entry.accountName,
            debit: entry.debit ?? 0,
            credit: entry.credit ?? 0,
            ...(entry.accountCode && { accountCode: entry.accountCode }),
            ...(entry.accountType && { accountType: entry.accountType }),
            ...(entry.lineId && { lineId: entry.lineId }),
          })),
          totalDebits: sumRound2(trialBalance.trialBalance.map((entry) => entry.debit ?? 0)),
          totalCredits: sumRound2(trialBalance.trialBalance.map((entry) => entry.credit ?? 0)),
        },
        accountingContext: { standard: session.standard },
      });
    } catch (error) {
      statementIntegrityError = error instanceof Error ? error.message : String(error);
    }
  }
  const glCount = await ctx.pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM core.general_ledger WHERE tenant_id = $1 AND period_label = $2',
    [ctx.tenantId, ctx.periodLabel]
  );
  let healthAnalysis: {
    overallGrade: string;
    overallScore: number;
    checks: Array<{ id: string; status: 'pass' | 'warn' | 'fail' }>;
    findingCount: number;
  } | null = null;
  if (Number(glCount.rows[0]?.count ?? 0) > 0) {
    const { runGLHealthAnalysis } = await import('./gl_health_analysis_service.js');
    healthAnalysis = await runGLHealthAnalysis(ctx.pool, ctx.tenantId, ctx.closeSessionId, ctx.periodLabel);
  }
  const source = await ctx.pool.query<{
    source: string;
    connection_id: string | null;
    synced_at: string | null;
    entry_count: string;
  }>(
    `SELECT source, connection_id, synced_at,
            CASE WHEN jsonb_typeof(entries) = 'array' THEN jsonb_array_length(entries) ELSE 0 END::text AS entry_count
     FROM core.period_trial_balance
     WHERE tenant_id = $1 AND period_label = $2`,
    [ctx.tenantId, ctx.periodLabel]
  );
  const sourceRow = source.rows[0];
  const sourceReady = Boolean(
    sourceRow &&
    sourceRow.source === 'synced' &&
    sourceRow.connection_id &&
    sourceRow.synced_at &&
    Number(sourceRow.entry_count) > 0
  );
  const failedHealthChecks = healthAnalysis?.checks
    .filter((check) => check.status === 'fail')
    .map((check) => check.id) ?? [];
  const result = {
    unmappedIssuesCreated: unmapped.length,
    imbalanceIssuesCreated: imbalance.length,
    mapping: {
      passes: mapping.passes,
      totalAccounts: mapping.total_accounts,
      mappedAccounts: mapping.mapped_accounts,
      unmappedAccounts: mapping.unmapped_accounts.map((account) => account.account_code),
    },
    statementIntegrity: {
      passes: statementIntegrityError == null,
      error: statementIntegrityError,
    },
    generalLedgerRows: Number(glCount.rows[0]?.count ?? 0),
    source: sourceRow ? {
      kind: sourceRow.source,
      connectionId: sourceRow.connection_id,
      syncedAt: sourceRow.synced_at,
      entryCount: Number(sourceRow.entry_count),
    } : null,
    sourceReady,
    healthAnalysis: healthAnalysis ? {
      grade: healthAnalysis.overallGrade,
      score: healthAnalysis.overallScore,
      failedChecks: failedHealthChecks,
      findingCount: healthAnalysis.findingCount,
    } : null,
  };
  const controlCode = ctx.task.controlCode;
  const blockers = controlCode === 'ERP_CUTOFF_COMPLETE'
    ? (!sourceReady ? ['ERP-synced trial balance with source receipt'] : [])
    : controlCode === 'MAPPING_COMPLETENESS'
      ? [
          ...(mapping.total_accounts === 0 ? ['session trial balance contains no accounts'] : []),
          ...(mapping.total_accounts > 0 && !mapping.passes
            ? [`${mapping.unmapped_accounts.length} unmapped account(s)`]
            : []),
        ]
      : controlCode === 'INTEGRITY_CHECKS'
        ? [
            ...(statementIntegrityError ? [statementIntegrityError] : []),
            ...failedHealthChecks.map((check) => `failed GL health check ${check}`),
          ]
        : [
            ...(!sourceReady ? ['ERP-synced trial balance with source receipt'] : []),
            ...(mapping.total_accounts === 0 ? ['session trial balance contains no accounts'] : []),
            ...(mapping.total_accounts > 0 && !mapping.passes
              ? [`${mapping.unmapped_accounts.length} unmapped account(s)`]
              : []),
            ...(statementIntegrityError ? [statementIntegrityError] : []),
            ...failedHealthChecks.map((check) => `failed GL health check ${check}`),
          ];
  if (blockers.length > 0) {
    return {
      status: 'blocked',
      result,
      blockedReason: `Source control failed: ${blockers.join('; ')}.`,
    };
  }
  return { status: 'completed', result };
}

function requirementMatchesControl(
  controlCode: CanadianAspeRequirementCode | undefined,
  requirement: { accountCode: string; accountName: string | null; expectedSource: string }
): boolean {
  if (!controlCode || controlCode === 'BALANCE_SHEET_RECONCILIATIONS') return true;
  const text = `${requirement.accountCode} ${requirement.accountName ?? ''}`.toLowerCase();
  switch (controlCode) {
    case 'CASH_REC':
      return requirement.expectedSource === 'bank_statement';
    case 'AR_SUBLEDGER_RECONCILIATION':
      return /\b(accounts? receivable|receivable|trade debtors?|a\/?r)\b/.test(text);
    case 'AP_SUBLEDGER_RECONCILIATION':
      return /\b(accounts? payable|payable|trade creditors?|a\/?p)\b/.test(text);
    case 'PAYROLL_REMITTANCE_RECONCILIATION':
      return /\b(payroll|wages?|source deductions?|cpp|employment insurance|cra remittance)\b/.test(text);
    case 'SALES_TAX_RECONCILIATION':
      return /\b(gst|hst|qst|pst|sales tax|input tax credit)\b/.test(text);
    case 'PREPAID_AMORTIZATION':
      return /\b(prepaid|prepayment)\b/.test(text);
    case 'INVENTORY_RECONCILIATION':
      return requirement.expectedSource === 'physical_count' || /\b(inventory|stock)\b/.test(text);
    case 'FIXED_ASSET_ROLLFORWARD':
      return /\b(fixed asset|property|equipment|ppe|depreciation)\b/.test(text);
    case 'DEBT_AND_INTEREST_RECONCILIATION':
      return requirement.expectedSource === 'loan_statement' || /\b(debt|loan|mortgage|note payable|interest)\b/.test(text);
    case 'LEASE_RECONCILIATION':
      return /\b(lease|rental obligation)\b/.test(text);
    case 'DEFERRED_REVENUE_RECONCILIATION':
      return /\b(deferred revenue|unearned revenue|contract liabilit)\b/.test(text);
    default:
      return true;
  }
}

async function executeReconciliationReview(ctx: RunbookCapabilityContext): Promise<RunbookCapabilityOutcome> {
  const { detectIncompleteReconciliations } = await import('./issue_detection_service.js');
  const issues = await detectIncompleteReconciliations({ pool: ctx.pool, tenantId: ctx.tenantId, periodId: ctx.closeSessionId });
  const { getSession } = await import('./close_session_service.js');
  const requirementRepository = await import('../db/repositories/recon_requirements_repository.js');
  const reconciliationRepository = await import('../db/repositories/period_reconciliation_repository.js');
  const session = await getSession(ctx.pool, ctx.tenantId, ctx.closeSessionId);
  if (!session) throw new Error(`Close session ${ctx.closeSessionId} not found`);
  const allRequirements = await requirementRepository.listRequirements(ctx.pool, ctx.tenantId, session.entityId);
  const requirements = allRequirements
    .filter((requirement) => requirement.isRequired)
    .filter((requirement) => requirementMatchesControl(ctx.task.controlCode, requirement));
  const reconciliations = await reconciliationRepository.listPeriodReconciliationsByPeriod(
    ctx.pool,
    ctx.tenantId,
    ctx.closeSessionId
  );
  const byAccount = new Map(reconciliations.map((reconciliation) => [reconciliation.accountCode, reconciliation]));
  const blockers = requirements.flatMap((requirement) => {
    const reconciliation = byAccount.get(requirement.accountCode);
    if (!reconciliation) return [{ accountCode: requirement.accountCode, reason: 'Not initialized' }];
    let unexplained;
    let tolerance;
    try {
      unexplained = reconciliation.unexplainedVariance == null
        ? null
        : from(reconciliation.unexplainedVariance).abs();
      tolerance = from(reconciliation.toleranceAmount);
    } catch {
      return [{ accountCode: requirement.accountCode, reason: 'Invalid variance or tolerance value' }];
    }
    if (
      (unexplained != null && !unexplained.isFinite()) ||
      !tolerance.isFinite() ||
      tolerance.isNegative()
    ) {
      return [{ accountCode: requirement.accountCode, reason: 'Invalid variance or tolerance value' }];
    }
    if (unexplained != null && unexplained.greaterThan(tolerance)) {
      return [{ accountCode: requirement.accountCode, reason: `Unexplained variance ${reconciliation.unexplainedVariance}` }];
    }
    if (reconciliation.status === 'approved') return [];
    if (reconciliation.status === 'completed' && !requirement.requiresReviewerApproval) return [];
    return [{ accountCode: requirement.accountCode, reason: `Status ${reconciliation.status}` }];
  });
  const result = {
    totalRequired: requirements.length,
    completed: requirements.length - blockers.length,
    blockers,
    issuesCreated: issues.length,
    passes: requirements.length > 0 && blockers.length === 0,
  };
  if (requirements.length === 0) {
    return {
      status: 'blocked',
      result,
      blockedReason: 'No applicable reconciliation population was detected. Add the required account population or document a not-applicable disposition.',
    };
  }
  if (blockers.length > 0) {
    return {
      status: 'blocked',
      result,
      blockedReason: `${blockers.length} applicable reconciliation item(s) remain incomplete or outside tolerance.`,
    };
  }
  return { status: 'completed', result };
}

async function executeJournalEntryReview(ctx: RunbookCapabilityContext): Promise<RunbookCapabilityOutcome> {
  const { detectPendingAjeTemplates } = await import('./issue_detection_service.js');
  const journalRepository = await import('../db/repositories/journal_entry_repository.js');
  const memoryRepository = await import('../db/repositories/accounting_memory_repository.js');
  const {
    matchAccountingMemoryToJournalEntry,
    recordMemoryApplication,
  } = await import('./accounting_memory_service.js');
  const { getSession } = await import('./close_session_service.js');
  const {
    evaluateErpWritebackCloseGate,
    summarizeUnresolvedErpWritebacks,
  } = await import('./erp_writeback_close_gate_service.js');
  const issues = await detectPendingAjeTemplates({ pool: ctx.pool, tenantId: ctx.tenantId, periodId: ctx.closeSessionId });
  const entries = await journalRepository.listJournalEntries(ctx.pool, ctx.tenantId, {
    closeSessionId: ctx.closeSessionId,
  });
  const session = await getSession(ctx.pool, ctx.tenantId, ctx.closeSessionId);
  if (!session) throw new Error(`Close session ${ctx.closeSessionId} not found`);
  const writebackGate = await evaluateErpWritebackCloseGate(
    ctx.pool,
    ctx.tenantId,
    session.entityId,
    ctx.closeSessionId
  );
  const memories = await memoryRepository.listApprovedMemoriesForPeriod(
    ctx.pool,
    ctx.tenantId,
    session.entityId,
    ctx.periodLabel
  );
  const activeEntries = entries.filter((entry) => entry.status !== 'rejected');
  const linesByEntry = await journalRepository.listJournalEntryLinesBatch(
    ctx.pool,
    activeEntries.map((entry) => entry.id)
  );
  const memoryConflicts: Array<{
    journalEntryId: string;
    memoryId: string;
    similarity: number;
    reason: string;
  }> = [];
  const memoryConsistent: Array<{
    journalEntryId: string;
    memoryId: string;
    similarity: number;
  }> = [];
  for (const entry of activeEntries) {
    const lines = linesByEntry.get(entry.id) ?? [];
    for (const memory of memories) {
      const match = matchAccountingMemoryToJournalEntry(memory, entry, lines);
      if (match.similarity < 0.35 || match.relationship === 'context') continue;
      if (match.relationship === 'conflict') {
        memoryConflicts.push({
          journalEntryId: entry.id,
          memoryId: memory.id,
          similarity: match.similarity,
          reason: match.reason,
        });
      } else {
        memoryConsistent.push({
          journalEntryId: entry.id,
          memoryId: memory.id,
          similarity: match.similarity,
        });
      }
      await recordMemoryApplication(ctx.pool, {
        tenantId: ctx.tenantId,
        entityId: session.entityId,
        closeSessionId: ctx.closeSessionId,
        memoryId: memory.id,
        targetType: 'journal_entry',
        targetId: entry.id,
        outcome: match.relationship === 'conflict' ? 'conflict_blocked' : 'consistent',
        similarity: match.similarity,
        detail: {
          reason: match.reason,
          journalEntryStatus: entry.status,
          reusableAmountsApplied: false,
        },
        appliedBy: 'system:journal-entry-memory-check',
      });
    }
  }
  const unresolved = entries.filter((entry) => ['draft', 'proposed', 'pending_approval'].includes(entry.status));
  const result = {
    totalJournalEntries: entries.length,
    unresolvedJournalEntries: unresolved.map((entry) => ({ id: entry.id, status: entry.status, memo: entry.memo })),
    pendingTemplateIssuesCreated: issues.length,
    approvedCorrectionMemoriesChecked: memories.length,
    memoryConflicts,
    memoryConsistent,
    erpWritebackEnabled: writebackGate.enabled,
    unresolvedErpWritebacks: writebackGate.unresolved,
    priorPeriodAmountsReused: false,
  };
  if (
    unresolved.length > 0 ||
    issues.length > 0 ||
    memoryConflicts.length > 0 ||
    writebackGate.unresolved.length > 0
  ) {
    const writebackReason = writebackGate.unresolved.length > 0
      ? ` ERP writebacks unresolved (${summarizeUnresolvedErpWritebacks(writebackGate.unresolved)}).`
      : '';
    return {
      status: 'blocked',
      result,
      blockedReason: `${unresolved.length} journal entry(ies), ${issues.length} template issue(s), and ${memoryConflicts.length} approved-memory conflict(s) require review.${writebackReason}`,
    };
  }
  return { status: 'completed', result };
}

async function executeVarianceReview(ctx: RunbookCapabilityContext): Promise<RunbookCapabilityOutcome> {
  const { detectUnexplainedVariances } = await import('./issue_detection_service.js');
  const { checkVarianceCompleteness } = await import('./variance_analysis_service.js');
  const issues = await detectUnexplainedVariances({ pool: ctx.pool, tenantId: ctx.tenantId, periodId: ctx.closeSessionId });
  const completeness = await checkVarianceCompleteness(ctx.pool, ctx.tenantId, ctx.closeSessionId);
  const result = {
    passes: completeness.passes,
    unexplained: completeness.unexplained.map((variance) => variance.id),
    issuesCreated: issues.length,
  };
  if (!completeness.passes) {
    return {
      status: 'blocked',
      result,
      blockedReason: `${completeness.unexplained.length} material variance(s) still require an explanation.`,
    };
  }
  return { status: 'completed', result };
}

async function executeEvidenceReview(ctx: RunbookCapabilityContext): Promise<RunbookCapabilityOutcome> {
  const { checkEvidencePolicyForCertification } = await import('./evidence_policy_service.js');
  const evidence = await checkEvidencePolicyForCertification(ctx.pool, ctx.tenantId, ctx.closeSessionId);
  const result = {
    hardBlockers: evidence.hardBlockers,
    softWarnings: evidence.softWarnings,
  };
  if (evidence.hardBlockers.length > 0) {
    return {
      status: 'blocked',
      result,
      blockedReason: `${evidence.hardBlockers.length} evidence blocker(s) must be remediated before this control can pass.`,
    };
  }
  if (evidence.softWarnings.length > 0) {
    return {
      status: 'waiting_human',
      result,
      blockedReason: `${evidence.hardBlockers.length} evidence blocker(s) and ${evidence.softWarnings.length} warning(s) require review.`,
    };
  }
  return { status: 'completed', result };
}

async function executeStatementGeneration(ctx: RunbookCapabilityContext): Promise<RunbookCapabilityOutcome> {
  const { generateStatements, listStatementPackages } = await import('./statement_package_service.js');
  const { getSession } = await import('./close_session_service.js');
  const session = await getSession(ctx.pool, ctx.tenantId, ctx.closeSessionId);
  if (!session) throw new Error(`Close session ${ctx.closeSessionId} not found`);
  const [latest] = await listStatementPackages(ctx.pool, ctx.tenantId, ctx.closeSessionId, 1);
  const statementPackage = latest && !session.statementsStaleSince
    ? latest
    : await generateStatements(ctx.pool, ctx.tenantId, ctx.closeSessionId, {
        generatedBy: `runbook:${ctx.task.code}`,
        status: 'draft',
      });
  const failedValidations = (statementPackage.validationResults ?? [])
    .filter((validation) => !validation.passed)
    .map((validation) => validation.check);
  const result = {
    statementPackageId: statementPackage.id,
    version: statementPackage.version,
    status: statementPackage.status,
    inputHash: statementPackage.inputHash,
    reusedExistingPackage: statementPackage.id === latest?.id,
    failedValidations,
  };
  if (failedValidations.length > 0) {
    return {
      status: 'blocked',
      result,
      blockedReason: `Statement validation failed: ${failedValidations.join(', ')}.`,
    };
  }
  return { status: 'completed', result };
}

async function executeCloseReadiness(ctx: RunbookCapabilityContext): Promise<RunbookCapabilityOutcome> {
  const { getBlockingIssuesForPeriod } = await import('./issue_service.js');
  const blockingIssues = await getBlockingIssuesForPeriod(ctx.pool, ctx.closeSessionId, ctx.tenantId);
  const result = {
    openBlockingIssues: blockingIssues.map((issue) => ({
      issueId: issue.issueId,
      severity: issue.severity,
      title: issue.title,
    })),
  };
  if (blockingIssues.length > 0) {
    return {
      status: 'blocked',
      result,
      blockedReason: `${blockingIssues.length} critical or blocking close issue(s) remain open.`,
    };
  }
  return { status: 'completed', result };
}

export async function executeRunbookCapability(
  ctx: RunbookCapabilityContext
): Promise<RunbookCapabilityOutcome> {
  switch (ctx.task.capability) {
    case 'source_integrity':
      return executeSourceIntegrity(ctx);
    case 'reconciliation_review':
      return executeReconciliationReview(ctx);
    case 'journal_entry_review':
      return executeJournalEntryReview(ctx);
    case 'variance_review':
      return executeVarianceReview(ctx);
    case 'evidence_review':
      return executeEvidenceReview(ctx);
    case 'statement_generation':
      return executeStatementGeneration(ctx);
    case 'close_readiness':
      return executeCloseReadiness(ctx);
    case 'human_review':
    case 'custom_review':
      return {
        status: 'waiting_human',
        result: { prepared: false, reason: 'Human judgment or an unregistered company-specific procedure is required.' },
        blockedReason: 'Assigned owner must complete or resolve this task.',
      };
  }
}
