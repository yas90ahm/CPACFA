/**
 * Trial Balance API — ingest file, return structured Balance Sheet and P&L
 * Every response includes Reasoning Chain and codification traceability.
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { parseTrialBalance } from '../services/trialBalanceParser.js';
import { ingestTrialBalanceFile, SUPPORTED_MIMES } from '../services/fileIngestion.js';
import { buildValidatedStatements, MathematicalIntegrityError } from '../services/financialStatements.js';
import { generateStatements } from '../services/statementGenerator.js';
import { buildCashFlowStatement, buildCashFlowFromTransactions } from '../services/cashFlow.js';
import { buildEquityChangesStatement } from '../services/equityChanges.js';
import { buildNotesAndPolicies } from '../services/notesPolicies.js';
import { inferAccountingStandard } from '../services/standard_selector.js';
import { updatePolicyMemory } from '../memory/index.js';
import { classifyTransactionsAgentic } from '../services/transaction_classifier.js';
import { runPlanExecuteVerifyAgentic } from '../services/agentic_plan_execute_verify.js';
import { registerStatementGeneration, recordPolicyChange } from '../services/audit_export_service.js';
import { markUploadCompleted, runResultPipeline } from '../services/result_generator.js';
import * as persistence from '../services/persistence_service.js';
import { assessAgenticQuality } from '../services/agentic_quality_assessor.js';
import { shouldEscalateToHuman, submitToStaging } from '../services/hitl_orchestrator.js';
import { addTodosFromGaps } from '../services/reconciliation_todos.js';
import { inferStandardAgentic } from '../services/standard_inference_agentic.js';
import { generateCashFlowNarrativeAgentic } from '../services/agentic_cash_flow_narrative.js';
import { generateNotesNarrativeAgentic } from '../services/agentic_notes_narrative.js';
import { runRulesAndPersistExceptions } from '../services/data_quality_exception_service.js';
import type { RuleEvaluationContext } from '../services/data_quality_rule_service.js';
import type { FinancialStatementsOutput } from '../types/financial.js';
import type { RawTrialBalanceRow } from '../services/trialBalanceParser.js';
import type { AuthRequest } from '../auth/middleware.js';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { listContracts } from '../db/repositories/revenue_recognition_repository.js';
import type { IntegrityContractFact } from '../types/integrity.js';
import type { Pool } from 'pg';
import type { StatementGeneratorOptions } from '../services/statementGenerator.js';
import { assertPeriodNotLocked, PeriodLockedError } from '../services/period_lock_service.js';
import { appendAuditLog } from '../services/audit_log_service.js';
import { validateBody, requireValidTenantId } from '../middleware/validationMiddleware.js';
import {
  ingestBodySchema,
  type IngestBody,
  classificationSuggestionsBodySchema,
  type ClassificationSuggestionsBody,
  applyClassificationBodySchema,
  type ApplyClassificationBody,
} from '../schemas/request/trialBalance.js';
import {
  statementsBodySchema,
  cashFlowNarrativeBodySchema,
  notesNarrativeBodySchema,
  confirmStandardBodySchema,
  equityChangesNarrativeBodySchema,
  type StatementsBody,
  type CashFlowNarrativeBody,
  type NotesNarrativeBody,
  type ConfirmStandardBody,
  type EquityChangesNarrativeBody,
} from '../schemas/trialBalanceSchemas.js';
import { loadCloseContext } from '../services/close_context.js';
import { getPrecedentForCloseStep, toSimilarPrecedentSummary } from '../services/precedent_for_close_step.js';
import { runProfessionalReview } from '../services/professional_review_service.js';
import { deriveCovenantAndLiquidityFromIngest } from '../services/ingest_covenant_liquidity.js';
import * as periodFinancialDataState from '../db/repositories/period_financial_data_state_repository.js';
import { ENABLE_INTEGRATED_SUPERVISOR } from '../lib/capability_flags.js';
import { setQualitativeEvidenceMissing } from '../services/risk_context_store.js';
import {
  getClassificationSuggestions,
  classifyTrialBalance,
  applyUserClassificationOverrides,
} from '../services/accountClassifier.js';
import type { TrialBalanceEntry, AccountType } from '../types/financial.js';
import { saveUnadjustedFromUpload, getUnadjusted } from '../services/trial_balance_store_service.js';
import { getUnadjustedOrRollup } from '../services/trial_balance_rollup_service.js';
import { getAdjustedTrialBalance } from '../services/adjusted_trial_balance_service.js';
import {
  isMessyTrialBalance,
  agenticLedgerToTrialBalance,
} from '../services/agentic_ledger_to_tb.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype?.toLowerCase() ?? '';
    const allowed =
      mime === 'text/csv' ||
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/vnd.ms-excel';
    if (allowed) cb(null, true);
    else cb(new Error('Only CSV and XLSX files are allowed.'));
  },
});

/**
 * POST /api/trial-balance/ingest
 * Body: multipart/form-data with file (field name: file)
 * Every file upload is associated with tenant_id and stored in tenant_session_uploads when tenant context exists.
 * If the ledger is flagged as 'messy', raw CSV rows are saved to Postgres before calling the agentic parser,
 * so the user can Pause, refresh, and see the same Action Card to approve the AI's cleanup.
 * Returns: FinancialStatementsOutput (Reasoning Chain + TB + BS + P&L)
 */
router.post('/ingest', upload.single('file'), requireValidTenantId, validateBody(ingestBodySchema), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({
        error: 'Missing file',
        message: 'Upload a CSV or XLSX file with field name "file".',
      });
      return;
    }

    const tenantIdIngest = getTenantId(req);
    const poolIngest = getTenantPool(req);
    const hasTenantContext = Boolean(tenantIdIngest && poolIngest);
    const ingestSessionId = hasTenantContext
      ? `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      : null;
    // Validate server-generated sessionId format (ingest-{timestamp}-{random})
    if (ingestSessionId && !/^ingest-\d+-[a-z0-9]+$/.test(ingestSessionId)) {
      console.error('Invalid sessionId format generated:', ingestSessionId);
      res.status(500).json({ error: 'Internal error', message: 'Session ID generation failed' });
      return;
    }

    let uploadId: string | null = null;
    if (hasTenantContext && ingestSessionId) {
      const uploadRow = await persistence.createSessionUpload(
        poolIngest!,
        tenantIdIngest!,
        ingestSessionId,
        {
          filename: file.originalname || 'upload.csv',
          contentType: file.mimetype,
          metadata: null,
        }
      );
      uploadId = uploadRow.id;
    }

    let rawRows = ingestTrialBalanceFile(file.buffer, file.mimetype);
    if (rawRows.length === 0) {
      res.status(400).json({
        error: 'Empty or invalid file',
        message: 'No trial balance rows found. Expected columns: account name, debit, credit.',
      });
      return;
    }

    if (isMessyTrialBalance(rawRows)) {
      if (uploadId && tenantIdIngest && poolIngest) {
        await persistence.updateSessionUploadMetadata(poolIngest, uploadId, tenantIdIngest, {
          rawRows,
          status: 'pending_agentic_cleanup',
        });
      }
      try {
        const agenticRows = await agenticLedgerToTrialBalance(file.buffer, file.mimetype);
        if (agenticRows.length > 0) rawRows = agenticRows;
      } catch {
        // keep original rawRows so parseTrialBalance still runs (may show zeros)
      }
    }

    const trialBalance = parseTrialBalance(rawRows);
    const body: IngestBody = req.body;
    const fullSetIngest = body.fullSet === false ? false : true;
    const comparativeIngest = body.comparative === true;
    let priorTrialBalanceIngest: import('../types/financial.js').TrialBalanceResult | undefined;
    if (fullSetIngest && comparativeIngest) {
      const priorEntriesRaw = body.prior_entries;
      const priorRows =
        Array.isArray(priorEntriesRaw) ? priorEntriesRaw
        : typeof priorEntriesRaw === 'string'
          ? (() => { try { return JSON.parse(priorEntriesRaw) as RawTrialBalanceRow[]; } catch { return undefined; } })()
          : undefined;
      if (!Array.isArray(priorRows) || priorRows.length === 0) {
        res.status(400).json({
          error: 'Prior period trial balance required for cash flow and equity roll-forward.',
          message: 'When fullSet and comparative are true, provide prior_entries (trial balance for prior period).',
        });
        return;
      }
      priorTrialBalanceIngest = parseTrialBalance(priorRows);
    }
    if (body.periodLabel) {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      await assertPeriodNotLocked(body.periodLabel, tenantId ?? undefined, pool);
    }
    const transactions = parseTransactions(body.transactions);
    const categorizedTransactions =
      transactions && transactions.length > 0
        ? attachCategories(
            transactions,
            await classifyTransactionsAgentic(transactions, { entityId: body.entityId })
          )
        : undefined;
    const explicitStandard = normalizeStandard(body.standard);
    let standard =
      explicitStandard ??
      await inferAccountingStandard({
        standard: explicitStandard,
        entityId: body.entityId,
        country: body.country,
        jurisdiction: body.jurisdiction,
        currency: body.currency,
        taxId: body.taxId,
        businessNumber: body.businessNumber,
        publiclyAccountable: body.publiclyAccountable,
        periodLabel: body.periodLabel,
        pool: poolIngest ?? undefined,
        tenantId: tenantIdIngest ?? undefined,
      });
    const standardInference = !standard
      ? await inferStandardAgentic({
          country: body.country,
          jurisdiction: body.jurisdiction,
          currency: body.currency,
          taxId: body.taxId,
          businessNumber: body.businessNumber,
        })
      : null;
    // Trial-balance-first flow: default to inferred or US_GAAP so upload always proceeds; review follows
    if (!standard) {
      standard = standardInference?.standard ?? 'US_GAAP';
    }
    if (body.entityId) {
      const opts = poolIngest && tenantIdIngest ? { pool: poolIngest, tenantId: tenantIdIngest } : undefined;
      await updatePolicyMemory(body.entityId, {
        ...(standard ? { standard } : {}),
        ...(body.publiclyAccountable !== undefined ? { publiclyAccountable: body.publiclyAccountable } : {}),
        country: body.country,
        jurisdiction: body.jurisdiction,
        currency: body.currency,
        taxId: body.taxId,
        businessNumber: body.businessNumber,
      }, undefined, opts);
    }
    const fullSet = body.fullSet === false ? false : true;
    const useAgenticClassification = body.useAgenticClassification === true;
    let preClassified: import('../types/financial.js').TrialBalanceEntry[] | undefined;
    let priorPreClassified: import('../types/financial.js').TrialBalanceEntry[] | undefined;
    if (useAgenticClassification) {
      preClassified = await classifyTrialBalance(trialBalance.entries);
      if (priorTrialBalanceIngest?.entries.length) {
        priorPreClassified = await classifyTrialBalance(priorTrialBalanceIngest.entries);
      }
    }
    const stmtOpts: StatementGeneratorOptions = useAgenticClassification && preClassified
      ? { fullSet, priorTrialBalance: priorTrialBalanceIngest, preClassifiedEntries: preClassified, priorClassifiedEntries: priorPreClassified }
      : { fullSet, priorTrialBalance: priorTrialBalanceIngest };
    if (standard && tenantIdIngest && poolIngest) {
      stmtOpts.tenantId = tenantIdIngest;
      stmtOpts.loadContracts = async (tid: string) => {
        try {
          const rows = await listContracts(poolIngest as Pool, tid);
          return rows.map((r) => ({ id: r.id, totalContractValue: r.totalContractValue, periodRecognizedRevenue: undefined }));
        } catch {
          return [];
        }
      };
    }
    const buildOpts = useAgenticClassification && preClassified ? { preClassifiedEntries: preClassified } : undefined;

    let trialBalanceForBuild: import('../types/financial.js').TrialBalanceResult = trialBalance;
    if (body.periodLabel) {
      const tenantIdForSave = tenantIdIngest ?? 'default';
      const entriesToStore = preClassified ?? await classifyTrialBalance(trialBalance.entries);
      await saveUnadjustedFromUpload(
        tenantIdForSave,
        body.periodLabel,
        entriesToStore,
        {
          uploadedBy: (req as AuthRequest).userId,
          fileName: file.originalname,
        },
        poolIngest
      );
      try {
        const adjustedEntries = await getAdjustedTrialBalance(tenantIdForSave, body.periodLabel, poolIngest ?? undefined);
        const totalDebits = adjustedEntries.reduce((s, e) => s + (e.debit ?? 0), 0);
        const totalCredits = adjustedEntries.reduce((s, e) => s + (e.credit ?? 0), 0);
        trialBalanceForBuild = {
          entries: adjustedEntries,
          totalDebits,
          totalCredits,
          balances: Math.abs(totalDebits - totalCredits) < 0.01,
          errors: Math.abs(totalDebits - totalCredits) >= 0.01 ? ['Adjusted trial balance does not balance'] : [],
        };
      } catch {
        trialBalanceForBuild = trialBalance;
      }
    }

    const base = standard
      ? await generateStatements(trialBalanceForBuild, standard, body.periodLabel && tenantIdIngest ? { ...stmtOpts, preClassifiedEntries: undefined } : stmtOpts)
      : await buildValidatedStatements(trialBalanceForBuild, body.periodLabel && tenantIdIngest ? undefined : buildOpts);
    const { balanceSheet, profitAndLoss } = base;
    const classifiedEntries = base.classifiedEntries;
    const standardMetadata = 'standardMetadata' in base ? base.standardMetadata : undefined;
    const priorBalanceSheetIngest = priorTrialBalanceIngest
      ? (await buildValidatedStatements(priorTrialBalanceIngest, priorPreClassified?.length === priorTrialBalanceIngest.entries.length ? { preClassifiedEntries: priorPreClassified } : undefined)).balanceSheet
      : undefined;
    const cashFlow = fullSet
      ? categorizedTransactions && categorizedTransactions.length > 0
        ? buildCashFlowFromTransactions(categorizedTransactions)
        : buildCashFlowStatement(trialBalanceForBuild, profitAndLoss, priorTrialBalanceIngest)
      : undefined;
    const equityChanges = fullSet ? buildEquityChangesStatement(balanceSheet, priorBalanceSheetIngest, profitAndLoss) : undefined;
    const notesAndPolicies = fullSet && standard ? buildNotesAndPolicies(standard) : undefined;

    const reasoningChain = await runPlanExecuteVerifyAgentic({
      trialBalance: trialBalanceForBuild,
      balanceSheet,
      profitAndLoss,
    });

    const output: FinancialStatementsOutput = {
      reasoningChain,
      trialBalance: { ...trialBalanceForBuild, entries: classifiedEntries },
      balanceSheet,
      profitAndLoss,
      ...(standard ? { standard } : {}),
      ...(standardMetadata ? { standardMetadata } : {}),
    };

    const sourceDocumentId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sourceDocumentName = file.originalname || 'Trial Balance (uploaded)';
    attachLineProvenance(output, {
      sourceDocumentId,
      sourceDocumentName,
      reasoningChainId: reasoningChain.executedAt,
      reasoningChainTimestamp: reasoningChain.executedAt,
    });

    const authReq = req as AuthRequest;
    await registerStatementGeneration(output, {
      sourceDocumentId,
      sourceDocumentName,
      reasoningChainId: reasoningChain.executedAt,
      tenantId: authReq.tenantId,
      pool: authReq.tenantPool,
    });

    // Run configurable data quality rules on TB/BS and persist exceptions when tenant context exists
    if (authReq.tenantId && authReq.tenantPool) {
      const periodLabel = body.periodLabel ?? `ingest-${new Date().toISOString().slice(0, 10)}`;
      const ctx: RuleEvaluationContext = {
        scope: 'balance_sheet',
        periodLabel,
        sourceId: sourceDocumentId,
        balanceSheet: output.balanceSheet,
        profitAndLoss: output.profitAndLoss,
        trialBalanceEntries: output.trialBalance?.entries?.map((e) => ({
          accountName: e.accountName ?? '',
          debit: e.debit ?? 0,
          credit: e.credit ?? 0,
        })),
      };
      runRulesAndPersistExceptions(authReq.tenantPool, authReq.tenantId, ctx).catch(() => {});
    }

    const periodLabelIngest = body.periodLabel ?? `ingest-${new Date().toISOString().slice(0, 10)}`;
    const meta = {
      standard,
      entityId: body.entityId,
      periodLabel: periodLabelIngest,
      country: body.country,
      jurisdiction: body.jurisdiction,
      currency: body.currency,
      taxId: body.taxId,
      businessNumber: body.businessNumber,
      ...(categorizedTransactions ? { transactions: categorizedTransactions } : {}),
      fullSet,
    };
    // Trigger Specialist Brains pipeline as soon as Upload is marked Completed (CPA → CFA → Supervisor)
    markUploadCompleted({ type: 'statements', output, meta });
    const pipelineResult = await runResultPipeline(
      { type: 'statements', output, meta },
      authReq.tenantId && authReq.tenantPool ? { tenantId: authReq.tenantId, pool: authReq.tenantPool } : undefined
    );
    if (authReq.tenantId && authReq.tenantPool) {
      await persistence.createSession(authReq.tenantPool, authReq.tenantId, {
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
        const item = await Promise.resolve(
          submitToStaging(
            {
              proposedAction: 'Review agentic CPA assessment',
              justification: agenticAssessment.summary,
              type: 'other',
            },
            authReq.tenantId && authReq.tenantPool ? { pool: authReq.tenantPool, tenantId: authReq.tenantId } : undefined
          )
        );
        hitl = { escalated: true, stagingId: item.id };
      }
    }
    // Stage 3: populate actionable to-dos from data gaps (Urgent To-Dos list)
    const gaps = pipelineResult.dataGaps ?? [];
    if (gaps.length > 0) await addTodosFromGaps(gaps, authReq.tenantPool, authReq.tenantId);

    // Mandatory similar precedent for close step (auditability)
    const precedentResult = getPrecedentForCloseStep('trial_balance_ingest', {
      entityId: body.entityId,
      currentPeriodLabel: body.periodLabel,
      priorPeriodLabel: body.prior_period_label,
      standard,
    });
    const similarPrecedent = toSimilarPrecedentSummary('trial_balance_ingest', precedentResult);

    // Judgment Layer: professional review (flag-only; no auto-execute)
    let professionalReviewIngest: import('../types/professional_review.js').ProfessionalReviewResponse | undefined;
    if (authReq.tenantId && authReq.tenantPool) {
      try {
        const { covenantResult, liquidityMetrics } = deriveCovenantAndLiquidityFromIngest({
          balanceSheet: output.balanceSheet,
          profitAndLoss: output.profitAndLoss,
          cashFlow: output.cashFlow,
        });
        let contractsForReview: import('../types/professional_review.js').ProfessionalReviewInput['contracts'];
        try {
          const { listContracts } = await import('../services/revenue_recognition_service.js');
          const contracts = await listContracts(authReq.tenantId, authReq.tenantPool, {});
          contractsForReview = contracts.map((c) => ({
            contractNumber: c.contractNumber,
            performanceObligations: c.performanceObligations.map((p) => ({ name: p.name, description: p.description })),
            totalContractValue: c.totalContractValue,
          }));
        } catch {
          contractsForReview = undefined;
        }
        const hasNarrativeIngest =
          (contractsForReview?.length ?? 0) > 0 ||
          (Array.isArray(body.contractText) ? body.contractText.some((s) => typeof s === 'string' && s.trim().length > 0) : typeof body.contractText === 'string' && (body.contractText as string).trim().length > 0) ||
          (Array.isArray(body.leaseDocuments) ? body.leaseDocuments.some((s) => typeof s === 'string' && s.trim().length > 0) : typeof body.leaseDocuments === 'string' && (body.leaseDocuments as string).trim().length > 0);
        professionalReviewIngest = await runProfessionalReview(
          {
            tenantId: authReq.tenantId,
            periodLabel: periodLabelIngest,
            runId: sourceDocumentId,
            narrativeEvidenceSummary: hasNarrativeIngest ? 'Contract/lease narrative provided.' : '',
            trialBalance: { entries: output.trialBalance?.entries ?? [] },
            balanceSheet: output.balanceSheet,
            profitAndLoss: output.profitAndLoss,
            covenantResult,
            liquidityMetrics,
            contracts: contractsForReview,
            contractText: body.contractText,
            leaseDocuments: body.leaseDocuments,
          },
          authReq.tenantPool
        );
      } catch {
        // Do not fail ingest if professional review fails
      }
      // Freshness Interlock: record last financial data update for this period
      if (periodLabelIngest) {
        try {
          await periodFinancialDataState.upsert(authReq.tenantPool, authReq.tenantId, periodLabelIngest);
        } catch {
          // Do not fail ingest if upsert fails
        }
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
      standardInference: standardInference ?? undefined,
      agenticAssessment,
      hitl,
      similarPrecedent,
      ...(professionalReviewIngest ? { professionalReview: professionalReviewIngest } : {}),
      ...(uploadId && ingestSessionId ? { uploadId, sessionId: ingestSessionId } : {}),
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
        message: err.message,
        check: err.check,
        imbalanceAmount: err.imbalanceAmount,
        details: err.details,
      });
    }
    const message = err instanceof Error ? err.message : 'Ingestion failed';
    res.status(400).json({ error: 'Ingestion error', message });
  }
});

/**
 * POST /api/trial-balance/cash-flow-narrative
 * Body: { cashFlowStatement: CashFlowStatement, periodLabel?: string }
 * Returns: { narrative: string } — agentic driver narrative for the cash flow statement.
 */
router.post('/cash-flow-narrative', validateBody(cashFlowNarrativeBodySchema), async (req: Request, res: Response) => {
  try {
    const body: CashFlowNarrativeBody = req.body;
    const narrative = await generateCashFlowNarrativeAgentic(body.cashFlowStatement as import('../types/financial.js').CashFlowStatement, body.periodLabel);
    res.json({ narrative });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Cash flow narrative failed', message });
  }
});

/**
 * POST /api/trial-balance/notes-narrative
 * Body: { standard: ASPE|IFRS|FRS102|US_GAAP, context?: string }
 * Returns: { narrative: string } — entity-specific notes narrative for MD&A or note header.
 */
router.post('/notes-narrative', validateBody(notesNarrativeBodySchema), async (req: Request, res: Response) => {
  try {
    const body: NotesNarrativeBody = req.body;
    const narrative = await generateNotesNarrativeAgentic(body.standard, body.context);
    res.json({ narrative });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Notes narrative failed', message });
  }
});

/**
 * POST /api/trial-balance/confirm-standard
 * Body: { entityId: string; standard: 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP'; fiscalYear?: string }
 * Persists the confirmed standard to policy memory so subsequent statement generation uses it (no re-infer). Returns success.
 */
router.post('/confirm-standard', validateBody(confirmStandardBodySchema), async (req: Request, res: Response) => {
  try {
    const body: ConfirmStandardBody = req.body;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const opts = pool && tenantId ? { pool, tenantId } : undefined;
    await updatePolicyMemory(body.entityId, { standard: body.standard }, body.fiscalYear, opts);
    recordPolicyChange({
      effectiveDate: body.fiscalYear ? `${body.fiscalYear}-01-01` : new Date().toISOString().slice(0, 10),
      policyArea: 'Reporting standard',
      changeDescription: `Standard confirmed: ${body.standard} for entity ${body.entityId}${body.fiscalYear ? ` (fiscal ${body.fiscalYear})` : ''}.`,
      eventType: 'accounting_policy_change',
      reasoning: 'User confirmed via confirm-standard API.',
    });
    res.json({ ok: true, message: 'Standard confirmed; retry statement generation.' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Confirm standard failed', message });
  }
});

/**
 * POST /api/trial-balance/classification-suggestions
 * Body: { entries: { accountName: string; debit: number; credit: number }[] }
 * Returns deterministic classification plus agentic suggested overrides (diff only). Do not apply suggestions to statement build until user confirms.
 */
router.post('/classification-suggestions', validateBody(classificationSuggestionsBodySchema), async (req: Request, res: Response) => {
  try {
    const body: ClassificationSuggestionsBody = req.body;
    const entries: TrialBalanceEntry[] = body.entries.map((e) => ({
      accountName: e.accountName,
      debit: e.debit,
      credit: e.credit,
    }));
    const result = await getClassificationSuggestions(entries);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Classification suggestions failed', message });
  }
});

/**
 * POST /api/trial-balance/apply-classification
 * Body: { entries: { accountName, debit, credit }[]; overrides: { index: number; accountType: AccountType; rationale?: string }[] }
 * Returns entries with deterministic base + user-confirmed overrides applied. Use returned entries for subsequent statement build (e.g. preClassifiedEntries).
 */
router.post('/apply-classification', validateBody(applyClassificationBodySchema), async (req: Request, res: Response) => {
  try {
    const body: ApplyClassificationBody = req.body;
    const entries: TrialBalanceEntry[] = body.entries.map((e) => ({
      accountName: e.accountName,
      debit: e.debit,
      credit: e.credit,
    }));
    const classified = applyUserClassificationOverrides(entries, body.overrides);
    res.json({ entries: classified });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Apply classification failed', message });
  }
});

/**
 * POST /api/trial-balance/equity-changes-narrative
 * Body: { equityChangesStatement: EquityChangesStatement }
 * Returns: { narrative: string } — agentic narrative for residual/other equity movements (empty when negligible).
 */
router.post('/equity-changes-narrative', validateBody(equityChangesNarrativeBodySchema), async (req: Request, res: Response) => {
  try {
    const body: EquityChangesNarrativeBody = req.body;
    const narrative = await generateEquityChangesNarrativeAgentic(body.equityChangesStatement as import('../types/financial.js').EquityChangesStatement);
    res.json({ narrative });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Equity changes narrative failed', message });
  }
});

/**
 * POST /api/trial-balance/statements
 * Body: JSON { entries: RawTrialBalanceRow[] }
 * Returns: FinancialStatementsOutput (same as ingest, for programmatic use)
 */
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
      await inferAccountingStandard({
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
      });
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
    if (body.entityId) {
      const opts = poolStmt && tenantIdStmt ? { pool: poolStmt, tenantId: tenantIdStmt } : undefined;
      await updatePolicyMemory(body.entityId, {
        ...(standard ? { standard } : {}),
        ...(body.publiclyAccountable !== undefined ? { publiclyAccountable: body.publiclyAccountable } : {}),
        country: body.country,
        jurisdiction: body.jurisdiction,
        currency: body.currency,
        taxId: body.taxId,
        businessNumber: body.businessNumber,
      }, undefined, opts);
    }
    const fullSet = body.fullSet !== undefined ? Boolean(body.fullSet) : true;
    const useAgenticClassificationStmt = body.useAgenticClassification === true;
    let preClassifiedStmt: import('../types/financial.js').TrialBalanceEntry[] | undefined;
    let priorPreClassifiedStmt: import('../types/financial.js').TrialBalanceEntry[] | undefined;
    if (useAgenticClassificationStmt) {
      preClassifiedStmt = await classifyTrialBalance(trialBalance.entries);
      if (priorTrialBalance?.entries.length) {
        priorPreClassifiedStmt = await classifyTrialBalance(priorTrialBalance.entries);
      }
    }
    const stmtOptsStmt: StatementGeneratorOptions =
      useAgenticClassificationStmt && preClassifiedStmt
        ? { fullSet, priorTrialBalance, preClassifiedEntries: preClassifiedStmt, priorClassifiedEntries: priorPreClassifiedStmt }
        : { fullSet, priorTrialBalance };
    if (standard && tenantIdStmt && poolStmt) {
      stmtOptsStmt.tenantId = tenantIdStmt;
      stmtOptsStmt.loadContracts = async (tid: string) => {
        try {
          const rows = await listContracts(poolStmt, tid);
          return rows.map((r) => ({ id: r.id, totalContractValue: r.totalContractValue, periodRecognizedRevenue: undefined }));
        } catch {
          return [];
        }
      };
    }
    const buildOptsStmt = useAgenticClassificationStmt && preClassifiedStmt ? { preClassifiedEntries: preClassifiedStmt } : undefined;
    const closeContext =
      fullSet && comparativeStatements && poolStmt && tenantIdStmt
        ? await loadCloseContext({
            pool: poolStmt,
            tenantId: tenantIdStmt,
            entityId: body.entityId ?? '',
            currentPeriodLabel: body.periodLabel ?? '',
            priorPeriodLabel: body.prior_period_label,
            priorTrialBalance,
          })
        : undefined;
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
      ? (await buildValidatedStatements(priorTrialBalance, priorPreClassifiedStmt?.length === priorTrialBalance.entries.length ? { preClassifiedEntries: priorPreClassifiedStmt } : undefined)).balanceSheet
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
      priorPeriodLabel: (body as { prior_period_label?: string }).prior_period_label,
      standard,
    });

    // Run configurable data quality rules on TB/BS and persist exceptions when tenant context exists
    if (authReqStatements.tenantId && authReqStatements.tenantPool) {
      const periodLabel = periodLabelStmt;
      const ctx: RuleEvaluationContext = {
        scope: 'balance_sheet',
        periodLabel,
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
    // Trigger Specialist Brains pipeline when upload/statements are completed
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

    // Mandatory similar precedent for close step (auditability)
    const precedentResultStmt = getPrecedentForCloseStep('trial_balance_statements', {
      entityId: body.entityId,
      currentPeriodLabel: body.periodLabel,
      priorPeriodLabel: body.prior_period_label,
      standard,
    });
    const similarPrecedentStmt = toSimilarPrecedentSummary('trial_balance_statements', precedentResultStmt);

    // Judgment Layer: professional review (flag-only; no auto-execute)
    let professionalReviewStmt: import('../types/professional_review.js').ProfessionalReviewResponse | undefined;
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

/**
 * GET /api/trial-balance/period/:periodLabel
 * Returns stored unadjusted trial balance for the period (entries + meta). For quarter/year,
 * returns roll-up from constituent months when no direct TB exists. 404 if none.
 */
router.get('/period/:periodLabel', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.params.periodLabel;
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!periodLabel) {
      res.status(400).json({ error: 'periodLabel required' });
      return;
    }
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
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Failed to load unadjusted trial balance', message });
  }
});

/**
 * GET /api/trial-balance/period/:periodLabel/adjusted
 * Returns adjusted trial balance (unadjusted + posted adjustments). 404 if no unadjusted TB for period.
 */
router.get('/period/:periodLabel/adjusted', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.params.periodLabel;
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!periodLabel) {
      res.status(400).json({ error: 'periodLabel required' });
      return;
    }
    const adjustedEntries = await getAdjustedTrialBalance(tenantId, periodLabel, pool ?? undefined);
    res.json({ periodLabel, entries: adjustedEntries });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('No unadjusted trial balance')) {
      res.status(404).json({ error: 'No unadjusted trial balance for period', periodLabel: req.params.periodLabel });
      return;
    }
    res.status(500).json({ error: 'Failed to load adjusted trial balance', message });
  }
});

/**
 * GET /api/trial-balance/period/:periodLabel/statements
 * Returns financial statements for the period from adjusted TB (unadjusted + posted adjustments). 404 if no unadjusted TB.
 */
router.get('/period/:periodLabel/statements', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.params.periodLabel;
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!periodLabel) {
      res.status(400).json({ error: 'periodLabel required' });
      return;
    }
    const adjustedEntries = await getAdjustedTrialBalance(tenantId, periodLabel, pool ?? undefined);
    const totalDebits = adjustedEntries.reduce((s, e) => s + (e.debit ?? 0), 0);
    const totalCredits = adjustedEntries.reduce((s, e) => s + (e.credit ?? 0), 0);
    const trialBalanceForBuild: import('../types/financial.js').TrialBalanceResult = {
      entries: adjustedEntries,
      totalDebits,
      totalCredits,
      balances: Math.abs(totalDebits - totalCredits) < 0.01,
      errors: Math.abs(totalDebits - totalCredits) >= 0.01 ? ['Adjusted trial balance does not balance'] : [],
    };
    const standard = (req.query.standard as string) || 'US_GAAP';
    const fullSet = (req.query.fullSet as string) !== 'false';
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
    res.status(500).json({ error: 'Failed to build statements', message });
  }
});

/**
 * GET /api/trial-balance/supported
 * Returns supported file types and column expectations.
 */
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

function normalizeStandard(value?: string): 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP' | undefined {
  if (!value) return undefined;
  const v = value.toUpperCase();
  if (v === 'ASPE' || v === 'IFRS' || v === 'FRS102' || v === 'US_GAAP') return v;
  return undefined;
}

function parseTransactions(
  raw?: string
): Array<{
  date?: string;
  amount: number;
  description?: string;
  counterparty?: string;
  debit?: number;
  credit?: number;
}> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed
      .map((t) => ({
        date: typeof t?.date === 'string' ? t.date : undefined,
        amount: Number(t?.amount) || 0,
        description: typeof t?.description === 'string' ? t.description : undefined,
        counterparty: typeof t?.counterparty === 'string' ? t.counterparty : undefined,
        debit: t?.debit != null ? Number(t.debit) : undefined,
        credit: t?.credit != null ? Number(t.credit) : undefined,
      }))
      .filter((t) => t.amount !== 0);
  } catch {
    return undefined;
  }
}

function attachLineProvenance(
  statements: FinancialStatementsOutput,
  options: {
    sourceDocumentId: string;
    sourceDocumentName: string;
    reasoningChainId: string;
    reasoningChainTimestamp: string;
  }
): void {
  const apply = (lines: Array<{ label: string; amount: number; sourceDocumentId?: string; sourceDocumentUrl?: string; reasoningMonologueId?: string; reasoningMonologueTimestamp?: string }>) => {
    lines.forEach((line) => {
      line.sourceDocumentId = options.sourceDocumentId;
      line.sourceDocumentUrl = `/api/audit/source-document/${options.sourceDocumentId}`;
      line.reasoningMonologueId = options.reasoningChainId;
      line.reasoningMonologueTimestamp = options.reasoningChainTimestamp;
    });
  };
  apply(statements.balanceSheet.assets);
  apply(statements.balanceSheet.liabilities);
  apply(statements.balanceSheet.equity);
  apply(statements.profitAndLoss.revenue);
  apply(statements.profitAndLoss.expenses);
}

function attachCategories(
  transactions: Array<{ date?: string; amount: number; description?: string }>,
  categories: Array<'operating' | 'investing' | 'financing'>
): Array<{ date?: string; amount: number; description?: string; category?: 'operating' | 'investing' | 'financing' }> {
  return transactions.map((t, i) => ({ ...t, category: categories[i] ?? 'operating' }));
}