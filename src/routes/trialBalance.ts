/**
 * Trial Balance API — ingest file, return structured Balance Sheet and P&L
 * Every response includes Reasoning Chain and codification traceability.
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { parseTrialBalance } from '../services/trialBalanceParser.js';
import { ingestTrialBalanceFile, SUPPORTED_MIMES } from '../services/fileIngestion.js';
import { buildFinancialStatements } from '../services/financialStatements.js';
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
import { validateBody } from '../middleware/validateRequest.js';
import { statementsBodySchema } from '../schemas/trialBalanceSchemas.js';
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
 * Returns: FinancialStatementsOutput (Reasoning Chain + TB + BS + P&L)
 */
router.post('/ingest', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({
        error: 'Missing file',
        message: 'Upload a CSV or XLSX file with field name "file".',
      });
      return;
    }

    const rawRows = ingestTrialBalanceFile(file.buffer, file.mimetype);
    if (rawRows.length === 0) {
      res.status(400).json({
        error: 'Empty or invalid file',
        message: 'No trial balance rows found. Expected columns: account name, debit, credit.',
      });
      return;
    }

    const trialBalance = parseTrialBalance(rawRows);
    const body = req.body as {
      standard?: string;
      fullSet?: string;
      comparative?: string | boolean;
      country?: string;
      jurisdiction?: string;
      currency?: string;
      taxId?: string;
      businessNumber?: string;
      entityId?: string;
      publiclyAccountable?: boolean;
      prior_entries?: RawTrialBalanceRow[] | string;
      transactions?: string;
      periodLabel?: string;
      /** When true, use agentic classification for statement build (legacy behavior). Default false = deterministic-first. */
      useAgenticClassification?: boolean;
      /** Optional raw contract narrative(s) for substance-over-form (embedded lease) assessment. */
      contractText?: string | string[];
      /** Optional lease document narrative(s) for substance-over-form (embedded lease) assessment. */
      leaseDocuments?: string | string[];
    };
    const fullSetIngest = body?.fullSet === 'false' ? false : true;
    const comparativeIngest = body?.comparative === true || body?.comparative === 'true';
    let priorTrialBalanceIngest: import('../types/financial.js').TrialBalanceResult | undefined;
    if (fullSetIngest && comparativeIngest) {
      const priorEntriesRaw = body?.prior_entries;
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
    if (body?.periodLabel) {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      await assertPeriodNotLocked(body.periodLabel, tenantId ?? undefined, pool);
    }
    const transactions = parseTransactions(body?.transactions);
    const categorizedTransactions =
      transactions && transactions.length > 0
        ? attachCategories(
            transactions,
            await classifyTransactionsAgentic(transactions, { entityId: body?.entityId })
          )
        : undefined;
    const explicitStandard = normalizeStandard(body?.standard);
    const tenantIdIngest = getTenantId(req);
    const poolIngest = getTenantPool(req);
    let standard =
      explicitStandard ??
      await inferAccountingStandard({
        standard: explicitStandard,
        entityId: body?.entityId,
        country: body?.country,
        jurisdiction: body?.jurisdiction,
        currency: body?.currency,
        taxId: body?.taxId,
        businessNumber: body?.businessNumber,
        publiclyAccountable: body?.publiclyAccountable,
        periodLabel: (body as { periodLabel?: string })?.periodLabel,
        pool: poolIngest ?? undefined,
        tenantId: tenantIdIngest ?? undefined,
      });
    const standardInference = !standard
      ? await inferStandardAgentic({
          country: body?.country,
          jurisdiction: body?.jurisdiction,
          currency: body?.currency,
          taxId: body?.taxId,
          businessNumber: body?.businessNumber,
        })
      : null;
    if (!standard) {
      res.status(400).json({
        error: 'Reporting standard required; jurisdiction ambiguous',
        message: 'Provide an explicit standard in the request body, or confirm the suggested standard via the confirm-standard API.',
        inferredStandard: standardInference?.standard,
        confidence: standardInference?.confidence,
        rationale: standardInference?.rationale,
        promptForUser: standardInference?.promptForUser ?? 'Please confirm reporting standard (US_GAAP, IFRS, ASPE, FRS102).',
      });
      return;
    }
    if (body?.entityId) {
      const opts = poolIngest && tenantIdIngest ? { pool: poolIngest, tenantId: tenantIdIngest } : undefined;
      await updatePolicyMemory(body.entityId, {
        ...(standard ? { standard } : {}),
        ...(body.publiclyAccountable !== undefined ? { publiclyAccountable: body.publiclyAccountable } : {}),
        country: body?.country,
        jurisdiction: body?.jurisdiction,
        currency: body?.currency,
        taxId: body?.taxId,
        businessNumber: body?.businessNumber,
      }, undefined, opts);
    }
    const fullSet = body?.fullSet === 'false' ? false : true;
    const useAgenticClassification = body?.useAgenticClassification === true || body?.useAgenticClassification === 'true';
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
        const rows = await listContracts(poolIngest as Pool, tid);
        return rows.map((r) => ({ id: r.id, totalContractValue: r.totalContractValue, periodRecognizedRevenue: undefined }));
      };
    }
    const buildOpts = useAgenticClassification && preClassified ? { preClassifiedEntries: preClassified } : undefined;
    const base = standard
      ? await generateStatements(trialBalance, standard, stmtOpts)
      : await buildFinancialStatements(trialBalance, buildOpts);
    const { balanceSheet, profitAndLoss } = base;
    const classifiedEntries = base.classifiedEntries;
    const standardMetadata = 'standardMetadata' in base ? base.standardMetadata : undefined;
    const priorBalanceSheetIngest = priorTrialBalanceIngest
      ? (await buildFinancialStatements(priorTrialBalanceIngest, priorPreClassified?.length === priorTrialBalanceIngest.entries.length ? { preClassifiedEntries: priorPreClassified } : undefined)).balanceSheet
      : undefined;
    const cashFlow = fullSet
      ? categorizedTransactions && categorizedTransactions.length > 0
        ? buildCashFlowFromTransactions(categorizedTransactions)
        : buildCashFlowStatement(trialBalance, profitAndLoss, priorTrialBalanceIngest)
      : undefined;
    const equityChanges = fullSet ? buildEquityChangesStatement(balanceSheet, priorBalanceSheetIngest, profitAndLoss) : undefined;
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
      const periodLabel = (body as { periodLabel?: string })?.periodLabel ?? `ingest-${new Date().toISOString().slice(0, 10)}`;
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

    const periodLabelIngest = (body as { periodLabel?: string })?.periodLabel ?? `ingest-${new Date().toISOString().slice(0, 10)}`;
    const meta = {
      standard,
      entityId: body?.entityId,
      periodLabel: periodLabelIngest,
      country: body?.country,
      jurisdiction: body?.jurisdiction,
      currency: body?.currency,
      taxId: body?.taxId,
      businessNumber: body?.businessNumber,
      ...(categorizedTransactions ? { transactions: categorizedTransactions } : {}),
      fullSet,
    };
    // Trigger Specialist Brains pipeline as soon as Upload is marked Completed (CPA → CFA → Supervisor)
    markUploadCompleted({ type: 'statements', output, meta });
    const pipelineResult = await runResultPipeline({ type: 'statements', output, meta });
    const agenticAssessment = await assessAgenticQuality({
      qualityChecks: pipelineResult.qualityChecks ?? [],
      dataGaps: pipelineResult.dataGaps ?? [],
      standard: standard,
    });
    let hitl = pipelineResult.hitl ?? { escalated: false };
    if (!hitl.escalated && agenticAssessment?.overallSeverity === 'critical') {
      const escalate = shouldEscalateToHuman({ isCriticalAccountingPolicyChange: true });
      if (escalate) {
        const item = submitToStaging({
          proposedAction: 'Review agentic CPA assessment',
          justification: agenticAssessment.summary,
          type: 'other',
        });
        hitl = { escalated: true, stagingId: item.id };
      }
    }
    // Stage 3: populate actionable to-dos from data gaps (Urgent To-Dos list)
    const gaps = pipelineResult.dataGaps ?? [];
    if (gaps.length > 0) await addTodosFromGaps(gaps, authReq.tenantPool, authReq.tenantId);

    // Mandatory similar precedent for close step (auditability)
    const precedentResult = getPrecedentForCloseStep('trial_balance_ingest', {
      entityId: body?.entityId,
      currentPeriodLabel: (body as { periodLabel?: string })?.periodLabel,
      priorPeriodLabel: (body as { prior_period_label?: string })?.prior_period_label,
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
    const message = err instanceof Error ? err.message : 'Ingestion failed';
    res.status(400).json({ error: 'Ingestion error', message });
  }
});

/**
 * POST /api/trial-balance/cash-flow-narrative
 * Body: { cashFlowStatement: CashFlowStatement, periodLabel?: string }
 * Returns: { narrative: string } — agentic driver narrative for the cash flow statement.
 */
router.post('/cash-flow-narrative', async (req: Request, res: Response) => {
  try {
    const body = req.body as { cashFlowStatement?: { operating?: { label: string; amount: number }[]; investing?: { label: string; amount: number }[]; financing?: { label: string; amount: number }[]; netChangeInCash?: number; beginningCash?: number; endingCash?: number }; periodLabel?: string };
    const cfs = body?.cashFlowStatement;
    if (!cfs || !Array.isArray(cfs.operating)) {
      res.status(400).json({ error: 'Missing cashFlowStatement', message: 'Body must include cashFlowStatement with at least operating array.' });
      return;
    }
    const narrative = await generateCashFlowNarrativeAgentic(cfs as import('../types/financial.js').CashFlowStatement, body.periodLabel);
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
router.post('/notes-narrative', async (req: Request, res: Response) => {
  try {
    const body = req.body as { standard?: string; context?: string };
    const standard = body?.standard as 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP' | undefined;
    if (!standard || !['ASPE', 'IFRS', 'FRS102', 'US_GAAP'].includes(standard)) {
      res.status(400).json({ error: 'Missing or invalid standard', message: 'Body must include standard: ASPE, IFRS, FRS102, or US_GAAP.' });
      return;
    }
    const narrative = await generateNotesNarrativeAgentic(standard, body.context);
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
router.post('/confirm-standard', async (req: Request, res: Response) => {
  try {
    const body = req.body as { entityId?: string; standard?: 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP'; fiscalYear?: string };
    if (!body?.entityId || !body?.standard) {
      res.status(400).json({
        error: 'Missing entityId or standard',
        message: 'Body must include entityId and standard (ASPE, IFRS, FRS102, US_GAAP).',
      });
      return;
    }
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
router.post('/classification-suggestions', async (req: Request, res: Response) => {
  try {
    const body = req.body as { entries?: { accountName: string; debit: number; credit: number }[] };
    const raw = body?.entries;
    if (!Array.isArray(raw) || raw.length === 0) {
      res.status(400).json({
        error: 'Missing entries',
        message: 'Body must include entries (array of { accountName, debit, credit }).',
      });
      return;
    }
    const entries: TrialBalanceEntry[] = raw.map((e) => ({
      accountName: e.accountName,
      debit: Number(e.debit) || 0,
      credit: Number(e.credit) || 0,
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
router.post('/apply-classification', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      entries?: { accountName: string; debit: number; credit: number }[];
      overrides?: { index: number; accountType: AccountType; rationale?: string }[];
    };
    const raw = body?.entries;
    const overrides = body?.overrides ?? [];
    if (!Array.isArray(raw) || raw.length === 0) {
      res.status(400).json({
        error: 'Missing entries',
        message: 'Body must include entries (array of { accountName, debit, credit }).',
      });
      return;
    }
    const entries: TrialBalanceEntry[] = raw.map((e) => ({
      accountName: e.accountName,
      debit: Number(e.debit) || 0,
      credit: Number(e.credit) || 0,
    }));
    const classified = applyUserClassificationOverrides(entries, overrides);
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
router.post('/equity-changes-narrative', async (req: Request, res: Response) => {
  try {
    const body = req.body as { equityChangesStatement?: import('../types/financial.js').EquityChangesStatement };
    const stmt = body?.equityChangesStatement;
    if (!stmt) {
      res.status(400).json({ error: 'Missing equityChangesStatement', message: 'Body must include equityChangesStatement.' });
      return;
    }
    const narrative = await generateEquityChangesNarrativeAgentic(stmt);
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
router.post('/statements', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      entries?: RawTrialBalanceRow[];
      prior_entries?: RawTrialBalanceRow[];
      standard?: string;
      fullSet?: boolean;
      comparative?: boolean;
      country?: string;
      jurisdiction?: string;
      currency?: string;
      taxId?: string;
      businessNumber?: string;
      entityId?: string;
      publiclyAccountable?: boolean;
      transactions?: string;
      periodLabel?: string;
      /** When true, use agentic classification for statement build (legacy behavior). Default false = deterministic-first. */
      useAgenticClassification?: boolean;
    };
    if (body?.periodLabel) {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      await assertPeriodNotLocked(body.periodLabel, tenantId ?? undefined, pool);
    }
    const fullSetStatements = body?.fullSet !== undefined ? Boolean(body.fullSet) : true;
    const comparativeStatements = body?.comparative === true;
    if (fullSetStatements && comparativeStatements) {
      if (!Array.isArray(body.prior_entries) || body.prior_entries.length === 0) {
        res.status(400).json({
          error: 'Prior period trial balance required for cash flow and equity roll-forward.',
          message: 'When fullSet and comparative are true, provide prior_entries (trial balance for prior period).',
        });
        return;
      }
    }
    const transactions = parseTransactions(body?.transactions);
    const categorizedTransactions =
      transactions && transactions.length > 0
        ? attachCategories(
            transactions,
            await classifyTransactionsAgentic(transactions, { entityId: body?.entityId })
          )
        : undefined;
    const rawRows = body?.entries;
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      res.status(400).json({
        error: 'Missing entries',
        message: 'Body must be { entries: [ { accountName, debit, credit }, ... ] }.',
      });
      return;
    }

    const trialBalance = parseTrialBalance(rawRows);
    const priorTrialBalance = Array.isArray(body.prior_entries) ? parseTrialBalance(body.prior_entries) : undefined;
    const explicitStandard = normalizeStandard(body?.standard);
    const tenantIdStmt = getTenantId(req);
    const poolStmt = getTenantPool(req);
    let standard =
      explicitStandard ??
      await inferAccountingStandard({
        standard: explicitStandard,
        entityId: body?.entityId,
        country: body?.country,
        jurisdiction: body?.jurisdiction,
        currency: body?.currency,
        taxId: body?.taxId,
        businessNumber: body?.businessNumber,
        publiclyAccountable: body?.publiclyAccountable,
        periodLabel: body?.periodLabel,
        pool: poolStmt ?? undefined,
        tenantId: tenantIdStmt ?? undefined,
      });
    const standardInferenceStmt = !standard
      ? await inferStandardAgentic({
          country: body?.country,
          jurisdiction: body?.jurisdiction,
          currency: body?.currency,
          taxId: body?.taxId,
          businessNumber: body?.businessNumber,
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
    if (body?.entityId) {
      const opts = poolStmt && tenantIdStmt ? { pool: poolStmt, tenantId: tenantIdStmt } : undefined;
      await updatePolicyMemory(body.entityId, {
        ...(standard ? { standard } : {}),
        ...(body.publiclyAccountable !== undefined ? { publiclyAccountable: body.publiclyAccountable } : {}),
        country: body?.country,
        jurisdiction: body?.jurisdiction,
        currency: body?.currency,
        taxId: body?.taxId,
        businessNumber: body?.businessNumber,
      }, undefined, opts);
    }
    const fullSet = body?.fullSet !== undefined ? Boolean(body.fullSet) : true;
    const useAgenticClassificationStmt = body?.useAgenticClassification === true || body?.useAgenticClassification === 'true';
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
        const rows = await listContracts(poolStmt, tid);
        return rows.map((r) => ({ id: r.id, totalContractValue: r.totalContractValue, periodRecognizedRevenue: undefined }));
      };
    }
    const buildOptsStmt = useAgenticClassificationStmt && preClassifiedStmt ? { preClassifiedEntries: preClassifiedStmt } : undefined;
    const closeContext =
      fullSet && comparativeStatements && poolStmt && tenantIdStmt
        ? await loadCloseContext({
            pool: poolStmt,
            tenantId: tenantIdStmt,
            entityId: body?.entityId ?? '',
            currentPeriodLabel: body?.periodLabel ?? '',
            priorPeriodLabel: (body as { prior_period_label?: string })?.prior_period_label,
            priorTrialBalance,
          })
        : undefined;
    const base = standard
      ? await generateStatements(trialBalance, standard, stmtOptsStmt)
      : await buildFinancialStatements(trialBalance, buildOptsStmt);
    const { balanceSheet, profitAndLoss } = base;
    const classifiedEntries = base.classifiedEntries;
    const standardMetadata = 'standardMetadata' in base ? base.standardMetadata : undefined;
    const cashFlow = fullSet
      ? categorizedTransactions && categorizedTransactions.length > 0
        ? buildCashFlowFromTransactions(categorizedTransactions)
        : buildCashFlowStatement(trialBalance, profitAndLoss, priorTrialBalance)
      : undefined;
    const priorBalanceSheet = priorTrialBalance
      ? (await buildFinancialStatements(priorTrialBalance, priorPreClassifiedStmt?.length === priorTrialBalance.entries.length ? { preClassifiedEntries: priorPreClassifiedStmt } : undefined)).balanceSheet
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
      entityId: body?.entityId,
      periodLabel: periodLabelStmt,
      country: body?.country,
      jurisdiction: body?.jurisdiction,
      currency: body?.currency,
      taxId: body?.taxId,
      businessNumber: body?.businessNumber,
      ...(categorizedTransactions ? { transactions: categorizedTransactions } : {}),
      fullSet,
    };
    // Trigger Specialist Brains pipeline when upload/statements are completed
    markUploadCompleted({ type: 'statements', output, meta });
    const pipelineResult = await runResultPipeline(
      { type: 'statements', output, meta },
      authReqStatements.tenantId && authReqStatements.tenantPool ? { tenantId: authReqStatements.tenantId, pool: authReqStatements.tenantPool } : undefined
    );
    const agenticAssessment = await assessAgenticQuality({
      qualityChecks: pipelineResult.qualityChecks ?? [],
      dataGaps: pipelineResult.dataGaps ?? [],
      standard: standard,
    });
    let hitl = pipelineResult.hitl ?? { escalated: false };
    if (!hitl.escalated && agenticAssessment?.overallSeverity === 'critical') {
      const escalate = shouldEscalateToHuman({ isCriticalAccountingPolicyChange: true });
      if (escalate) {
        const item = submitToStaging({
          proposedAction: 'Review agentic CPA assessment',
          justification: agenticAssessment.summary,
          type: 'other',
        });
        hitl = { escalated: true, stagingId: item.id };
      }
    }
    const gapsStatements = pipelineResult.dataGaps ?? [];
    if (gapsStatements.length > 0) await addTodosFromGaps(gapsStatements, authReqStatements.tenantPool, authReqStatements.tenantId);

    // Mandatory similar precedent for close step (auditability)
    const precedentResultStmt = getPrecedentForCloseStep('trial_balance_statements', {
      entityId: body?.entityId,
      currentPeriodLabel: body?.periodLabel,
      priorPeriodLabel: (body as { prior_period_label?: string })?.prior_period_label,
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
            periodLabel: body?.periodLabel ?? `stmt-${new Date().toISOString().slice(0, 10)}`,
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
    const message = err instanceof Error ? err.message : 'Processing failed';
    res.status(400).json({ error: 'Processing error', message });
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