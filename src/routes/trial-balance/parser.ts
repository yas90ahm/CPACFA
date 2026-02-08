/**
 * Trial Balance parser — POST /statements, GET /period/:periodLabel, /adjusted, /statements, GET /supported.
 */

import { Router, type Request, type Response } from 'express';
import { parseTrialBalance } from '../../services/trialBalanceParser.js';
import { SUPPORTED_MIMES } from '../../services/fileIngestion.js';
import { buildValidatedStatements, MathematicalIntegrityError } from '../../services/financialStatements.js';
import { generateStatements } from '../../services/statementGenerator.js';
import { buildCashFlowStatement, buildCashFlowFromTransactions } from '../../services/cashFlow.js';
import { buildEquityChangesStatement } from '../../services/equityChanges.js';
import { buildNotesAndPolicies } from '../../services/notesPolicies.js';
import { inferAccountingStandard } from '../../services/standard_selector.js';
import { updatePolicyMemory } from '../../memory/index.js';
import { classifyTransactionsAgentic } from '../../services/transaction_classifier.js';
import { runPlanExecuteVerifyAgentic } from '../../services/agentic_plan_execute_verify.js';
import { registerStatementGeneration } from '../../services/audit_export_service.js';
import { markUploadCompleted, runResultPipeline } from '../../services/result_generator.js';
import * as persistence from '../../services/persistence_service.js';
import { assessAgenticQuality } from '../../services/agentic_quality_assessor.js';
import { shouldEscalateToHuman, submitToStaging } from '../../services/hitl_orchestrator.js';
import { addTodosFromGaps } from '../../services/reconciliation_todos.js';
import { inferStandardAgentic } from '../../services/standard_inference_agentic.js';
import { runRulesAndPersistExceptions } from '../../services/data_quality_exception_service.js';
import type { RuleEvaluationContext } from '../../services/data_quality_rule_service.js';
import type { FinancialStatementsOutput } from '../../types/financial.js';
import type { AuthRequest } from '../../auth/middleware.js';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { listContracts } from '../../db/repositories/revenue_recognition_repository.js';
import type { Pool } from 'pg';
import type { StatementGeneratorOptions } from '../../services/statementGenerator.js';
import { assertPeriodNotLocked, PeriodLockedError } from '../../services/period_lock_service.js';
import { appendAuditLog } from '../../services/audit_log_service.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validationMiddleware.js';
import {
  statementsBodySchema,
  type StatementsBody,
  periodLabelParamSchema,
  periodStatementsQuerySchema,
} from '../../schemas/trialBalanceSchemas.js';
import { loadCloseContext } from '../../services/close_context.js';
import { getPrecedentForCloseStep, toSimilarPrecedentSummary } from '../../services/precedent_for_close_step.js';
import { runProfessionalReview } from '../../services/professional_review_service.js';
import { deriveCovenantAndLiquidityFromIngest } from '../../services/ingest_covenant_liquidity.js';
import { classifyTrialBalance } from '../../services/accountClassifier.js';
import { getUnadjustedOrRollup } from '../../services/trial_balance_rollup_service.js';
import { getAdjustedTrialBalance } from '../../services/adjusted_trial_balance_service.js';
import { attachLineProvenance, attachCategories, parseTransactions, normalizeStandard } from './helpers.js';
import { send500 } from '../../lib/errorHandler.js';

const router = Router();

/** POST /api/trial-balance/statements — Build statements from JSON entries */
router.post('/statements', validateBody(statementsBodySchema), async (req: Request, res: Response) => {
  try {
    const body: StatementsBody = req.body;
    if (body.periodLabel) {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      await assertPeriodNotLocked(body.periodLabel, tenantId ?? undefined, pool);
    }
    const fullSetStatements = body.fullSet !== undefined ? Boolean(body.fullSet) : true;
    const comparativeStatements = body.comparative === true;
    const transactions = parseTransactions(body.transactions);
    const categorizedTransactions =
      transactions && transactions.length > 0
        ? attachCategories(
            transactions,
            await classifyTransactionsAgentic(transactions, { entityId: body.entityId })
          )
        : undefined;
    const rawRows = body.entries;

    const trialBalance = parseTrialBalance(rawRows);
    const priorTrialBalance = body.prior_entries ? parseTrialBalance(body.prior_entries) : undefined;
    const explicitStandard = normalizeStandard(body.standard);
    const tenantIdStmt = getTenantId(req);
    const poolStmt = getTenantPool(req);
    let standard =
      explicitStandard ??
      (await inferAccountingStandard({
        standard: explicitStandard,
        entityId: body.entityId,
        country: body.country,
        jurisdiction: body.jurisdiction,
        currency: body.currency,
        taxId: body.taxId,
        businessNumber: body.businessNumber,
        publiclyAccountable: body.publiclyAccountable,
        periodLabel: body.periodLabel,
        pool: poolStmt ?? undefined,
        tenantId: tenantIdStmt ?? undefined,
      }));
    const standardInferenceStmt = !standard
      ? await inferStandardAgentic({
          country: body.country,
          jurisdiction: body.jurisdiction,
          currency: body.currency,
          taxId: body.taxId,
          businessNumber: body.businessNumber,
        })
      : null;
    if (!standard) {
      res.status(400).json({
        error: 'Reporting standard required; jurisdiction ambiguous',
        message: 'Provide an explicit standard in the request body, or confirm the suggested standard via the confirm-standard API.',
        inferredStandard: standardInferenceStmt?.standard,
        confidence: standardInferenceStmt?.confidence,
        rationale: standardInferenceStmt?.rationale,
        promptForUser: standardInferenceStmt?.promptForUser ?? 'Please confirm reporting standard (US_GAAP, IFRS, ASPE, FRS102).',
      });
      return;
    }
    if (body.entityId && poolStmt && tenantIdStmt) {
      await updatePolicyMemory(
        body.entityId,
        {
          ...(standard ? { standard } : {}),
          ...(body.publiclyAccountable !== undefined ? { publiclyAccountable: body.publiclyAccountable } : {}),
          country: body.country,
          jurisdiction: body.jurisdiction,
          currency: body.currency,
          taxId: body.taxId,
          businessNumber: body.businessNumber,
        },
        undefined,
        { pool: poolStmt, tenantId: tenantIdStmt }
      );
    }
    const fullSet = body.fullSet !== undefined ? Boolean(body.fullSet) : true;
    const useAgenticClassificationStmt = body.useAgenticClassification === true;
    let preClassifiedStmt: import('../../types/financial.js').TrialBalanceEntry[] | undefined;
    let priorPreClassifiedStmt: import('../../types/financial.js').TrialBalanceEntry[] | undefined;
    if (useAgenticClassificationStmt) {
      preClassifiedStmt = await classifyTrialBalance(trialBalance.entries);
      if (priorTrialBalance?.entries.length) {
        priorPreClassifiedStmt = await classifyTrialBalance(priorTrialBalance.entries);
      }
    }
    const stmtOptsStmt: StatementGeneratorOptions =
      useAgenticClassificationStmt && preClassifiedStmt
        ? {
            fullSet,
            priorTrialBalance,
            preClassifiedEntries: preClassifiedStmt,
            priorClassifiedEntries: priorPreClassifiedStmt,
          }
        : { fullSet, priorTrialBalance };
    if (standard && tenantIdStmt && poolStmt) {
      stmtOptsStmt.tenantId = tenantIdStmt;
      stmtOptsStmt.loadContracts = async (tid: string) => {
        try {
          const rows = await listContracts(poolStmt as Pool, tid);
          return rows.map((r) => ({ id: r.id, totalContractValue: r.totalContractValue, periodRecognizedRevenue: undefined }));
        } catch {
          return [];
        }
      };
    }
    const buildOptsStmt = useAgenticClassificationStmt && preClassifiedStmt ? { preClassifiedEntries: preClassifiedStmt } : undefined;
    if (fullSet && comparativeStatements && poolStmt && tenantIdStmt) {
      await loadCloseContext({
        pool: poolStmt,
        tenantId: tenantIdStmt,
        entityId: body.entityId ?? '',
        currentPeriodLabel: body.periodLabel ?? '',
        priorPeriodLabel: body.prior_period_label,
        priorTrialBalance,
      });
    }
    const base = standard
      ? await generateStatements(trialBalance, standard, stmtOptsStmt)
      : await buildValidatedStatements(trialBalance, buildOptsStmt);
    const { balanceSheet, profitAndLoss } = base;
    const classifiedEntries = base.classifiedEntries;
    const standardMetadata = 'standardMetadata' in base ? base.standardMetadata : undefined;
    const cashFlow = fullSet
      ? categorizedTransactions && categorizedTransactions.length > 0
        ? buildCashFlowFromTransactions(categorizedTransactions)
        : buildCashFlowStatement(trialBalance, profitAndLoss, priorTrialBalance)
      : undefined;
    const priorBalanceSheet = priorTrialBalance
      ? (
          await buildValidatedStatements(
            priorTrialBalance,
            priorPreClassifiedStmt?.length === priorTrialBalance.entries.length ? { preClassifiedEntries: priorPreClassifiedStmt } : undefined
          )
        ).balanceSheet
      : undefined;
    const equityChanges = fullSet ? buildEquityChangesStatement(balanceSheet, priorBalanceSheet, profitAndLoss) : undefined;
    const notesAndPolicies = fullSet && standard ? buildNotesAndPolicies(standard) : undefined;

    const reasoningChain = await runPlanExecuteVerifyAgentic({
      trialBalance,
      balanceSheet,
      profitAndLoss,
    });

    const output: FinancialStatementsOutput = {
      reasoningChain,
      trialBalance: { ...trialBalance, entries: classifiedEntries },
      balanceSheet,
      profitAndLoss,
      ...(standard ? { standard } : {}),
      ...(standardMetadata ? { standardMetadata } : {}),
    };

    const sourceDocumentId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sourceDocumentName = 'Trial Balance (JSON)';
    attachLineProvenance(output, {
      sourceDocumentId,
      sourceDocumentName,
      reasoningChainId: reasoningChain.executedAt,
      reasoningChainTimestamp: reasoningChain.executedAt,
    });

    const authReqStatements = req as AuthRequest;
    const periodLabelStmt = body.periodLabel ?? `stmt-${new Date().toISOString().slice(0, 10)}`;
    await registerStatementGeneration(output, {
      sourceDocumentId,
      sourceDocumentName,
      reasoningChainId: reasoningChain.executedAt,
      tenantId: authReqStatements.tenantId,
      pool: authReqStatements.tenantPool,
      periodLabel: periodLabelStmt,
      priorPeriodLabel: body.prior_period_label,
      standard,
    });

    if (authReqStatements.tenantId && authReqStatements.tenantPool) {
      const ctx: RuleEvaluationContext = {
        scope: 'balance_sheet',
        periodLabel: periodLabelStmt,
        sourceId: sourceDocumentId,
        balanceSheet: output.balanceSheet,
        profitAndLoss: output.profitAndLoss,
        trialBalanceEntries: output.trialBalance?.entries?.map((e) => ({
          accountName: e.accountName ?? '',
          debit: e.debit ?? 0,
          credit: e.credit ?? 0,
        })),
      };
      runRulesAndPersistExceptions(authReqStatements.tenantPool, authReqStatements.tenantId, ctx).catch(() => {});
    }

    const meta = {
      standard,
      entityId: body.entityId,
      periodLabel: periodLabelStmt,
      country: body.country,
      jurisdiction: body.jurisdiction,
      currency: body.currency,
      taxId: body.taxId,
      businessNumber: body.businessNumber,
      ...(categorizedTransactions ? { transactions: categorizedTransactions } : {}),
      fullSet,
    };
    markUploadCompleted({ type: 'statements', output, meta });
    const pipelineResult = await runResultPipeline(
      { type: 'statements', output, meta },
      authReqStatements.tenantId && authReqStatements.tenantPool ? { tenantId: authReqStatements.tenantId, pool: authReqStatements.tenantPool } : undefined
    );
    if (authReqStatements.tenantId && authReqStatements.tenantPool) {
      await persistence.createSession(authReqStatements.tenantPool, authReqStatements.tenantId, {
        mode: 'pipeline',
        pipelineInputSnapshot: { type: 'statements', output, meta },
      });
    }
    const agenticAssessment = await assessAgenticQuality({
      qualityChecks: pipelineResult.qualityChecks ?? [],
      dataGaps: pipelineResult.dataGaps ?? [],
      standard: standard,
    });
    let hitl = pipelineResult.hitl ?? { escalated: false };
    if (!hitl.escalated && agenticAssessment?.overallSeverity === 'critical') {
      const escalate = shouldEscalateToHuman({ isCriticalAccountingPolicyChange: true });
      if (escalate) {
        const item = await submitToStaging(
          {
            proposedAction: 'Review agentic CPA assessment',
            justification: agenticAssessment.summary,
            type: 'other',
          },
          authReqStatements.tenantId && authReqStatements.tenantPool ? { pool: authReqStatements.tenantPool, tenantId: authReqStatements.tenantId } : undefined
        );
        hitl = { escalated: true, stagingId: item.id };
      }
    }
    const gapsStatements = pipelineResult.dataGaps ?? [];
    if (gapsStatements.length > 0) await addTodosFromGaps(gapsStatements, authReqStatements.tenantPool, authReqStatements.tenantId);

    const precedentResultStmt = getPrecedentForCloseStep('trial_balance_statements', {
      tenantId: authReqStatements.tenantId,
      entityId: body.entityId,
      currentPeriodLabel: body.periodLabel,
      priorPeriodLabel: body.prior_period_label,
      standard,
    });
    const similarPrecedentStmt = toSimilarPrecedentSummary('trial_balance_statements', precedentResultStmt);

    let professionalReviewStmt: import('../../types/professional_review.js').ProfessionalReviewResponse | undefined;
    if (authReqStatements.tenantId && authReqStatements.tenantPool) {
      try {
        const { covenantResult, liquidityMetrics } = deriveCovenantAndLiquidityFromIngest({
          balanceSheet: output.balanceSheet,
          profitAndLoss: output.profitAndLoss,
          cashFlow: output.cashFlow,
        });
        professionalReviewStmt = await runProfessionalReview(
          {
            tenantId: authReqStatements.tenantId,
            periodLabel: body.periodLabel ?? `stmt-${new Date().toISOString().slice(0, 10)}`,
            runId: sourceDocumentId,
            narrativeEvidenceSummary: '',
            trialBalance: { entries: output.trialBalance?.entries ?? [] },
            balanceSheet: output.balanceSheet,
            profitAndLoss: output.profitAndLoss,
            covenantResult,
            liquidityMetrics,
          },
          authReqStatements.tenantPool
        );
      } catch {
        // Do not fail statements if professional review fails
      }
    }

    res.json({
      ...output,
      ...(cashFlow ? { cashFlow } : {}),
      ...(equityChanges ? { equityChanges } : {}),
      ...(notesAndPolicies ? { notesAndPolicies } : {}),
      ratios: pipelineResult.ratios,
      executiveMemo: pipelineResult.executiveMemo,
      qualityChecks: pipelineResult.qualityChecks,
      dataGaps: pipelineResult.dataGaps,
      policyProposals: pipelineResult.policyProposals,
      standardInference: standardInferenceStmt ?? undefined,
      agenticAssessment,
      hitl,
      similarPrecedent: similarPrecedentStmt,
      ...(professionalReviewStmt ? { professionalReview: professionalReviewStmt } : {}),
      audit: {
        binderUrl: '/api/audit/binder',
        gaapConsistencyUrl: '/api/audit/gaap-consistency',
        reconciliationSummaryUrl: '/api/audit/reconciliation-summary',
        todosUrl: '/api/audit/todos',
        sourceDocumentName,
        sourceDocumentId,
      },
    });
  } catch (err) {
    if (err instanceof PeriodLockedError) {
      const pool = getTenantPool(req);
      const tenantId = getTenantId(req);
      const auditContext = pool && tenantId ? { pool, tenantId } : undefined;
      appendAuditLog(
        { action: 'period_edit_blocked', resource: `period:${err.periodLabel}`, detail: 'Period is locked', actor: (req as AuthRequest).userId ?? 'anonymous' },
        auditContext
      );
      return res.status(403).json({ error: 'Period locked', periodLabel: err.periodLabel });
    }
    if (err instanceof MathematicalIntegrityError) {
      return res.status(422).json({
        error: 'MathematicalIntegrityError',
        code: 'FINAL_INTEGRITY_CHECK_FAILED',
        message: err.message,
        check: err.check,
        imbalanceAmount: err.imbalanceAmount,
        details: err.details,
      });
    }
    const message = err instanceof Error ? err.message : 'Processing failed';
    res.status(400).json({ error: 'Processing error', message });
  }
});

/** GET /api/trial-balance/period/:periodLabel — Unadjusted TB or rollup */
router.get('/period/:periodLabel', validateParams(periodLabelParamSchema), async (req: Request, res: Response) => {
  try {
    const periodLabel = req.params.periodLabel;
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const result = await getUnadjustedOrRollup(tenantId, periodLabel, pool ?? undefined);
    if (!result) {
      res.status(404).json({ error: 'No unadjusted trial balance for period', periodLabel });
      return;
    }
    res.json({
      periodLabel,
      entries: result.entries,
      source: result.source,
      at: result.at,
      by: result.by,
      ...(result.source !== 'rollup' && 'connectionId' in result && result.connectionId ? { connectionId: result.connectionId } : {}),
      ...(result.source !== 'rollup' && 'fileName' in result && result.fileName ? { fileName: result.fileName } : {}),
      ...(result.source === 'rollup' && 'constituentPeriods' in result ? { constituentPeriods: result.constituentPeriods } : {}),
    });
  } catch (e) {
    send500(res, e, 'Failed to load unadjusted trial balance');
  }
});

/** GET /api/trial-balance/period/:periodLabel/adjusted — Adjusted TB entries */
router.get('/period/:periodLabel/adjusted', validateParams(periodLabelParamSchema), async (req: Request, res: Response) => {
  try {
    const periodLabel = req.params.periodLabel;
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const adjustedEntries = await getAdjustedTrialBalance(tenantId, periodLabel, pool ?? undefined);
    res.json({ periodLabel, entries: adjustedEntries });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('No unadjusted trial balance')) {
      res.status(404).json({ error: 'No unadjusted trial balance for period', periodLabel: req.params.periodLabel });
      return;
    }
    send500(res, e, 'Failed to load adjusted trial balance');
  }
});

/** GET /api/trial-balance/period/:periodLabel/statements — Financial statements from adjusted TB (Kill Switch) */
router.get(
  '/period/:periodLabel/statements',
  validateParams(periodLabelParamSchema),
  validateQuery(periodStatementsQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const periodLabel = req.params.periodLabel;
      const tenantId = getTenantId(req) ?? 'default';
      const pool = getTenantPool(req);
      const adjustedEntries = await getAdjustedTrialBalance(tenantId, periodLabel, pool ?? undefined);
      const totalDebits = adjustedEntries.reduce((s, e) => s + (e.debit ?? 0), 0);
      const totalCredits = adjustedEntries.reduce((s, e) => s + (e.credit ?? 0), 0);
      const trialBalanceForBuild: import('../../types/financial.js').TrialBalanceResult = {
        entries: adjustedEntries,
        totalDebits,
        totalCredits,
        balances: Math.abs(totalDebits - totalCredits) < 0.01,
        errors: Math.abs(totalDebits - totalCredits) >= 0.01 ? ['Adjusted trial balance does not balance'] : [],
      };
      const standard = (req.query.standard as string) || 'US_GAAP';
      const fullSet = (req.query.fullSet as string | undefined) !== 'false' && req.query.fullSet !== undefined;
      const stmtOpts: StatementGeneratorOptions = { fullSet, tenantId: tenantId ?? undefined };
      if (pool && tenantId) {
        stmtOpts.loadContracts = async (tid: string) => {
          try {
            const rows = await listContracts(pool as Pool, tid);
            return rows.map((r) => ({ id: r.id, totalContractValue: r.totalContractValue, periodRecognizedRevenue: undefined }));
          } catch {
            return [];
          }
        };
      }
      const base =
        standard && ['US_GAAP', 'IFRS', 'ASPE', 'FRS102'].includes(standard)
          ? await generateStatements(trialBalanceForBuild, standard as 'US_GAAP' | 'IFRS' | 'ASPE' | 'FRS102', stmtOpts)
          : await buildValidatedStatements(trialBalanceForBuild);
      const priorTrialBalance = undefined;
      const cashFlow = fullSet ? buildCashFlowStatement(trialBalanceForBuild, base.profitAndLoss, priorTrialBalance) : undefined;
      const priorBalanceSheet = undefined;
      const equityChanges = fullSet ? buildEquityChangesStatement(base.balanceSheet, priorBalanceSheet, base.profitAndLoss) : undefined;
      res.json({
        periodLabel,
        balanceSheet: base.balanceSheet,
        profitAndLoss: base.profitAndLoss,
        ...(cashFlow ? { cashFlow } : {}),
        ...(equityChanges ? { equityChanges } : {}),
        ...('standard' in base ? { standard: base.standard } : {}),
      });
    } catch (e) {
      if (e instanceof MathematicalIntegrityError) {
        return res.status(422).json({
          error: 'MathematicalIntegrityError',
          code: 'FINAL_INTEGRITY_CHECK_FAILED',
          message: e.message,
          check: e.check,
          imbalanceAmount: e.imbalanceAmount,
          details: e.details,
        });
      }
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('No unadjusted trial balance')) {
        res.status(404).json({ error: 'No unadjusted trial balance for period', periodLabel: req.params.periodLabel });
        return;
      }
      send500(res, e, 'Failed to build statements');
    }
  }
);

/** GET /api/trial-balance/supported — File types and codification */
router.get('/supported', (_req: Request, res: Response) => {
  res.json({
    fileTypes: ['csv', 'xlsx'],
    mimeTypes: [...SUPPORTED_MIMES],
    expectedColumns: {
      required: ['accountName (or account name, account)', 'debit', 'credit'],
      optional: ['accountCode (or account code, code)'],
    },
    codification: {
      balanceSheet: 'FASB ASC 210-10-45, IAS 1.54',
      profitAndLoss: 'FASB ASC 220-10-45, IAS 1.81',
    },
  });
});

export default router;
