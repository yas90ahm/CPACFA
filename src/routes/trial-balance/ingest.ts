/**
 * Trial Balance ingest — POST /ingest (file upload → TB + BS + P&L via buildValidatedStatements).
 * Uses TypeScript-only pipeline: fileIngestion (parser_utils) → trialBalanceParser → buildValidatedStatements.
 * No Python backend calls. MathematicalIntegrityError always returns 422 (Provable Correctness).
 */

import { createHash } from 'crypto';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { parseTrialBalance } from '../../services/trialBalanceParser.js';
import { ingestTrialBalanceFile, type IngestTrialBalanceResult } from '../../services/fileIngestion.js';
import { buildValidatedStatements, MathematicalIntegrityError } from '../../services/financialStatements.js';
import { getRoundingTolerance } from '../../services/rules_registry.js';
import { absGt } from '../../utils/decimal.js';
import { generateStatements } from '../../services/statementGenerator.js';
import { buildCashFlowStatement, buildCashFlowFromTransactions } from '../../services/cashFlow.js';
import { buildEquityChangesStatement } from '../../services/equityChanges.js';
import { buildNotesAndPolicies } from '../../services/notesPolicies.js';
import { inferAccountingStandard } from '../../services/standard_selector.js';
import { updatePolicyMemory } from '../../memory/index.js';
import { classifyTransactionsAgentic } from '../../services/transaction_classifier.js';
import { runPlanExecuteVerifyAgentic } from '../../services/agentic_plan_execute_verify.js';
import { registerStatementGeneration, recordPolicyChange } from '../../services/audit_export_service.js';
import { createIngestionIntegrityMemo } from '../../services/justification_service.js';
import { markUploadCompleted, runResultPipeline } from '../../services/result_generator.js';
import * as persistence from '../../services/persistence_service.js';
import { createStagingItem, updateStagingPayload } from '../../services/persistence_service.js';
import { runClassifier, runAdvisor } from '../../ai/ai_orchestrator.js';
import * as aiProposalsRepo from '../../db/repositories/tenant_ai_proposals_repository.js';
import { assessAgenticQuality } from '../../services/agentic_quality_assessor.js';
import { shouldEscalateToHuman, submitToStaging } from '../../services/hitl_orchestrator.js';
import { addTodosFromGaps } from '../../services/reconciliation_todos.js';
import { inferStandardAgentic } from '../../services/standard_inference_agentic.js';
import { runRulesAndPersistExceptions } from '../../services/data_quality_exception_service.js';
import type { RuleEvaluationContext } from '../../services/data_quality_rule_service.js';
import type { FinancialStatementsOutput } from '../../types/financial.js';
import type { RawTrialBalanceRow } from '../../services/trialBalanceParser.js';
import type { AuthRequest } from '../../auth/middleware.js';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { listContracts } from '../../db/repositories/revenue_recognition_repository.js';
import type { Pool } from 'pg';
import type { StatementGeneratorOptions } from '../../services/statementGenerator.js';
import { assertPeriodNotLocked, PeriodLockedError } from '../../services/period_lock_service.js';
import { appendAuditLog } from '../../services/audit_log_service.js';
import { createIssueFromIntegrityFailure } from '../../services/issue_item_service.js';
import { createDecisionRecord } from '../../services/decision_record_service.js';
import { validateBody, requireValidTenantId } from '../../middleware/validationMiddleware.js';
import { ingestBodySchema, type IngestBody } from '../../schemas/request/trialBalance.js';
import { getPrecedentForCloseStep, toSimilarPrecedentSummary } from '../../services/precedent_for_close_step.js';
import { runProfessionalReview } from '../../services/professional_review_service.js';
import { deriveCovenantAndLiquidityFromIngest } from '../../services/ingest_covenant_liquidity.js';
import * as periodFinancialDataState from '../../db/repositories/period_financial_data_state_repository.js';
import { classifyTrialBalance } from '../../services/accountClassifier.js';
import { executeBridgeCommand } from '../../bridge/index.js';
import { getAdjustedTrialBalance } from '../../services/adjusted_trial_balance_service.js';
import { attachLineProvenance, attachCategories, parseTransactions, normalizeStandard } from './helpers.js';
import { log } from '../../lib/logger.js';

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

/** Set req.tenantId from body when auth did not set it (e.g. Diagnostic HUD bypass). */
function injectTenantFromBody(req: Request, _res: Response, next: import('express').NextFunction): void {
  const authReq = req as AuthRequest;
  if (!authReq.tenantId && req.body && typeof (req.body as { tenantId?: string }).tenantId === 'string') {
    const tid = (req.body as { tenantId: string }).tenantId.trim();
    if (tid) authReq.tenantId = tid;
  }
  next();
}

/**
 * POST /api/trial-balance/ingest
 * Body: multipart/form-data with file (field name: file)
 * Returns: FinancialStatementsOutput (Reasoning Chain + TB + BS + P&L)
 */
router.post('/ingest', upload.single('file'), injectTenantFromBody, requireValidTenantId, validateBody(ingestBodySchema), async (req: Request, res: Response) => {
  try {
    log('info', 'trial-balance ingest received', { file: req.file?.originalname ?? 'none' });
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
    if (ingestSessionId && !/^ingest-\d+-[a-z0-9]+$/.test(ingestSessionId)) {
      log('error', 'Invalid sessionId format generated', { ingestSessionId });
      res.status(500).json({ error: 'Internal error', message: 'Session ID generation failed' });
      return;
    }

    let uploadId: string | null = null;
    if (hasTenantContext && ingestSessionId && poolIngest && tenantIdIngest) {
      const uploadRow = await persistence.createSessionUpload(poolIngest, tenantIdIngest, ingestSessionId, {
        filename: file.originalname || 'upload.csv',
        contentType: file.mimetype,
        metadata: null,
      });
      uploadId = uploadRow.id;
    }

    const body = req.body as IngestBody;
    const ingestResult = ingestTrialBalanceFile(file.buffer, file.mimetype);
    let rawRows = ingestResult.rows;
    if (rawRows.length === 0) {
      res.status(400).json({
        error: 'Empty or invalid file',
        message: 'No trial balance rows found. Expected columns: account name, debit, credit.',
      });
      return;
    }
    const maxTbRows = Number(process.env.MAX_TB_ROWS ?? 100_000);
    if (rawRows.length > maxTbRows) {
      res.status(413).json({
        error: 'Trial balance too large',
        message: `Row count ${rawRows.length} exceeds maximum ${maxTbRows}. Set MAX_TB_ROWS to allow more.`,
        rowCount: rawRows.length,
        maxAllowed: maxTbRows,
      });
      return;
    }

    if (body.confirmMapping && Array.isArray(body.confirmedEntries) && body.confirmedEntries.length > 0) {
      rawRows = body.confirmedEntries as RawTrialBalanceRow[];
    } else if (ingestResult.needsAgenticMapping) {
      // Scope: no AI numeric extraction. Ask for human confirmation or use deterministic parse.
      return res.status(200).json({
        requiresColumnConfirmation: true,
        message: 'Column mapping could not be determined. Confirm columns (account, debit, credit) and re-upload, or use HITL resolve-ingest with a corrected file.',
        suggestedEntries: [],
      });
    } else if (false) {
      // Scope: agentic ledger-to-TB numeric extraction quarantined. Branch kept for brace structure; never runs.
    }

    const trialBalance = parseTrialBalance(rawRows);
    const totalDebits =
      trialBalance.totalDebits != null
        ? trialBalance.totalDebits
        : trialBalance.entries.reduce((s, e) => s + (e.debit ?? 0), 0);
    const totalCredits =
      trialBalance.totalCredits != null
        ? trialBalance.totalCredits
        : trialBalance.entries.reduce((s, e) => s + (e.credit ?? 0), 0);
    const tolerance = getRoundingTolerance();
    if (absGt(totalDebits, totalCredits, tolerance)) {
      const imbalanceAmount = Math.abs(totalDebits - totalCredits);
      let stagedId: string | undefined;
      const ingestionTimestamp = new Date().toISOString();
      const sourceHash = createHash('sha256').update(file.buffer).digest('hex');
      const aiWarnings: Array<{ ai_status: string; reason: string; pillar: string }> = [];
      if (poolIngest && tenantIdIngest) {
        const periodLabelStaged = body.periodLabel ?? `ingest-${new Date().toISOString().slice(0, 10)}`;
        const item = await createStagingItem(poolIngest, tenantIdIngest, {
          proposedAction: `Trial balance upload out of balance by ${imbalanceAmount}. Fix via HITL resolve-ingest.`,
          justification: `Debits ${totalDebits} != Credits ${totalCredits}. Raw records staged; no save to main ledger.`,
          type: 'journal_entry',
          amount: imbalanceAmount,
          payload: {
            kind: 'trial_balance_ingest',
            rawRows,
            periodLabel: periodLabelStaged,
            imbalanceAmount,
            fileName: file.originalname ?? 'upload.csv',
            totalDebits,
            totalCredits,
            source_type: 'csv_upload',
            source_hash: sourceHash,
            ingestion_timestamp: ingestionTimestamp,
          },
        });
        stagedId = item.id;
        const sourceLines = rawRows.map((r, i) => ({
          source_id: `row-${i}`,
          accountName: r.accountName ?? '',
          debit: r.debit ?? 0,
          credit: r.credit ?? 0,
        }));
        const classifierResult = await runClassifier({
          pool: poolIngest,
          tenantId: tenantIdIngest,
          periodLabel: periodLabelStaged ?? `ingest-${new Date().toISOString().slice(0, 10)}`,
          sourceLines,
        });
        if (!classifierResult.ok) {
          aiWarnings.push({
            ai_status: 'unavailable',
            reason: classifierResult.error ?? 'Classifier failed',
            pillar: 'classifier',
          });
        }
        if (classifierResult.results.length > 0) {
          await updateStagingPayload(poolIngest, tenantIdIngest, item.id, {
            classification_results: classifierResult.results,
            classification_prompt_version: classifierResult.prompt_version,
            classification_model: process.env.AI_MODEL ?? undefined,
          });
        }
        const classifiedSourceLines = rawRows.map((r, i) => ({
          source_id: `row-${i}`,
          accountName: r.accountName ?? '',
          debit: r.debit ?? 0,
          credit: r.credit ?? 0,
          ...(classifierResult.results[i]
            ? {
                object_type: classifierResult.results[i].object_type,
                fs_placement: classifierResult.results[i].fs_placement,
                suggested_accounts: classifierResult.results[i].suggested_accounts,
                rule_tags: classifierResult.results[i].rule_tags,
              }
            : {}),
        }));
        const advisorResult = await runAdvisor({
          pool: poolIngest,
          tenantId: tenantIdIngest,
          periodLabel: periodLabelStaged ?? `ingest-${new Date().toISOString().slice(0, 10)}`,
          sourceLines: classifiedSourceLines,
          tbSummary: { totalDebits, totalCredits, rowCount: rawRows.length },
        });
        if (!advisorResult.ok) {
          aiWarnings.push({
            ai_status: 'unavailable',
            reason: advisorResult.error ?? 'Advisor failed',
            pillar: 'advisor',
          });
        }
        if (advisorResult.proposals.length > 0) {
          await aiProposalsRepo.saveProposals(poolIngest, {
            tenantId: tenantIdIngest,
            periodLabel: periodLabelStaged ?? `ingest-${new Date().toISOString().slice(0, 10)}`,
            stagingId: item.id,
            proposal: { prompt_version: advisorResult.prompt_version, proposals: advisorResult.proposals },
            promptVersion: advisorResult.prompt_version,
            model: process.env.AI_MODEL ?? undefined,
          });
        }
      }
      // Scope: no AI-generated amounts. Staging only; human supplies correction via resolve-ingest.
      return res.status(200).json({
        status: 'staged',
        stagedId,
        imbalanceAmount,
        totalDebits,
        totalCredits,
        message: 'Trial balance does not balance. Data staged for HITL fix. Use POST /api/hitl/resolve-ingest with human-supplied adjustment; not saved to main ledger.',
        ...(aiWarnings.length > 0 && { ai_warnings: aiWarnings }),
        ingest_metadata: { source_type: 'csv_upload', source_hash: sourceHash, ingestion_timestamp: ingestionTimestamp },
      });
    }

    const fullSetIngest = body.fullSet === false ? false : true;
    const comparativeIngest = body.comparative === true;
    let priorTrialBalanceIngest: import('../../types/financial.js').TrialBalanceResult | undefined;
    if (fullSetIngest && comparativeIngest) {
      const priorEntriesRaw = body.prior_entries;
      const priorRows =
        Array.isArray(priorEntriesRaw)
          ? priorEntriesRaw
          : typeof priorEntriesRaw === 'string'
            ? (() => {
                try {
                  return JSON.parse(priorEntriesRaw) as RawTrialBalanceRow[];
                } catch {
                  return undefined;
                }
              })()
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
        pool: poolIngest ?? undefined,
        tenantId: tenantIdIngest ?? undefined,
      }));
    const standardInference = !standard
      ? await inferStandardAgentic({
          country: body.country,
          jurisdiction: body.jurisdiction,
          currency: body.currency,
          taxId: body.taxId,
          businessNumber: body.businessNumber,
        })
      : null;
    if (!standard) {
      standard = standardInference?.standard ?? 'US_GAAP';
    }
    if (body.entityId && poolIngest && tenantIdIngest) {
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
        { pool: poolIngest, tenantId: tenantIdIngest }
      );
    }
    const fullSet = body.fullSet === false ? false : true;
    const useAgenticClassification = body.useAgenticClassification === true;
    let preClassified: import('../../types/financial.js').TrialBalanceEntry[] | undefined;
    let priorPreClassified: import('../../types/financial.js').TrialBalanceEntry[] | undefined;
    if (useAgenticClassification) {
      preClassified = await classifyTrialBalance(trialBalance.entries);
      if (priorTrialBalanceIngest?.entries.length) {
        priorPreClassified = await classifyTrialBalance(priorTrialBalanceIngest.entries);
      }
    }
    const stmtOpts: StatementGeneratorOptions =
      useAgenticClassification && preClassified
        ? {
            fullSet,
            priorTrialBalance: priorTrialBalanceIngest,
            preClassifiedEntries: preClassified,
            priorClassifiedEntries: priorPreClassified,
          }
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

    let trialBalanceForBuild: import('../../types/financial.js').TrialBalanceResult = trialBalance;
    if (body.periodLabel && poolIngest && tenantIdIngest) {
      const tenantIdForSave = tenantIdIngest;
      const entriesToStore = preClassified ?? (await classifyTrialBalance(trialBalance.entries));
      const result = await executeBridgeCommand(
        {
          pool: poolIngest,
          tenantId: tenantIdForSave,
          actor: (req as AuthRequest).userId ?? 'anonymous',
        },
        {
          commandType: 'SaveTrialBalance',
          periodLabel: body.periodLabel,
          entries: entriesToStore.map((e) => ({
            accountName: e.accountName,
            debit: e.debit ?? 0,
            credit: e.credit ?? 0,
            accountCode: e.accountCode,
          })),
          fileName: file.originalname,
        }
      );
      if (!result.ok) {
        if (result.code === 'PERIOD_LOCKED') {
          res.status(409).json({ error: 'Period locked', message: result.error });
          return;
        }
        res.status(400).json({ error: result.error, code: result.code });
        return;
      }
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

    let base: Awaited<ReturnType<typeof buildValidatedStatements>> | Awaited<ReturnType<typeof generateStatements>>;
    base = standard
      ? await generateStatements(
          trialBalanceForBuild,
          standard,
          body.periodLabel && tenantIdIngest ? { ...stmtOpts, preClassifiedEntries: undefined } : stmtOpts
        )
      : await buildValidatedStatements(
          trialBalanceForBuild,
          body.periodLabel && tenantIdIngest ? undefined : buildOpts
        );
    const { balanceSheet, profitAndLoss } = base;
    const classifiedEntries = base.classifiedEntries;
    const standardMetadata = 'standardMetadata' in base ? base.standardMetadata : undefined;
    if (tenantIdIngest && poolIngest && classifiedEntries.length > 0) {
      try {
        await createDecisionRecord(poolIngest, {
          closeSessionId: (body as { closeSessionId?: string }).closeSessionId ?? null,
          tenantId: tenantIdIngest,
          decisionType: 'classification',
          subjectRef: { entryCount: classifiedEntries.length },
          inputSnapshot: { accountNames: trialBalanceForBuild.entries.map((e) => e.accountName) },
          outputSnapshot: {
            classifications: classifiedEntries.map((e) => ({ accountName: e.accountName, accountType: e.accountType })),
          },
          rationaleText: useAgenticClassification ? 'Agentic classification (classifyTrialBalance)' : 'Deterministic classification',
          engineVersion: useAgenticClassification ? 'agentic' : 'deterministic',
        });
      } catch (_) {
        /* non-fatal */
      }
    }
    const priorBalanceSheetIngest =
      priorTrialBalanceIngest
        ? (
            await buildValidatedStatements(
              priorTrialBalanceIngest,
              priorPreClassified?.length === priorTrialBalanceIngest.entries.length ? { preClassifiedEntries: priorPreClassified } : undefined
            )
          ).balanceSheet
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

    createIngestionIntegrityMemo(
      body.periodLabel ?? `ingest-${new Date().toISOString().slice(0, 10)}`,
      `Trial balance ingested; ${output.trialBalance?.entries?.length ?? 0} entries; debits equal credits; balance sheet equation satisfied.`
    );

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
    const gaps = pipelineResult.dataGaps ?? [];
    if (gaps.length > 0) await addTodosFromGaps(gaps, authReq.tenantPool, authReq.tenantId);

    const precedentResult = getPrecedentForCloseStep('trial_balance_ingest', {
      entityId: body.entityId,
      currentPeriodLabel: body.periodLabel,
      priorPeriodLabel: body.prior_period_label,
      standard,
    });
    const similarPrecedent = toSimilarPrecedentSummary('trial_balance_ingest', precedentResult);

    let professionalReviewIngest: import('../../types/professional_review.js').ProfessionalReviewResponse | undefined;
    if (authReq.tenantId && authReq.tenantPool) {
      try {
        const { covenantResult, liquidityMetrics } = deriveCovenantAndLiquidityFromIngest({
          balanceSheet: output.balanceSheet,
          profitAndLoss: output.profitAndLoss,
          cashFlow: output.cashFlow,
        });
        let contractsForReview: import('../../types/professional_review.js').ProfessionalReviewInput['contracts'];
        try {
          const { listContracts: listContractsService } = await import('../../services/revenue_recognition_service.js');
          const contracts = await listContractsService(authReq.tenantId, authReq.tenantPool, {});
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
    // Recognize MathematicalIntegrityError even when instanceof fails (e.g. Jest/ESM class identity)
    const integrityErr: MathematicalIntegrityError | null =
      err instanceof MathematicalIntegrityError
        ? err
        : err && typeof err === 'object' && (err as { name?: string }).name === 'MathematicalIntegrityError'
          ? (err as MathematicalIntegrityError)
          : null;
    if (integrityErr) {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const closeSessionId = (req.body as Record<string, unknown>)?.closeSessionId ?? (req.query as Record<string, unknown>).closeSessionId;
      if (tenantId && pool) {
        try {
          await createDecisionRecord(pool, {
            closeSessionId: typeof closeSessionId === 'string' ? closeSessionId : null,
            tenantId,
            decisionType: 'anomaly_flag',
            subjectRef: { check: integrityErr.check, imbalanceAmount: integrityErr.imbalanceAmount },
            inputSnapshot: integrityErr.details ?? {},
            outputSnapshot: { blocked: true, reason: 'MathematicalIntegrityError' },
            rationaleText: integrityErr.message,
            engineVersion: 'financialStatements_validator',
          });
        } catch (_) {
          /* non-fatal */
        }
        if (typeof closeSessionId === 'string' && closeSessionId) {
          try {
            await createIssueFromIntegrityFailure(
            { pool, tenantId, closeSessionId, createdBy: (req as AuthRequest).userId },
            {
              title: 'Trial balance imbalance (debits ≠ credits or A ≠ L+E)',
              description: integrityErr.message,
              category: 'posting',
              severity: 'high',
              impactPl: integrityErr.imbalanceAmount,
              impactBs: integrityErr.check === 'B' ? integrityErr.imbalanceAmount : undefined,
              sourceRef: { check: integrityErr.check, imbalanceAmount: integrityErr.imbalanceAmount, details: integrityErr.details },
            }
          );
        } catch (_) {
          /* non-fatal */
        }
      }
      return res.status(422).json({
        error: 'MathematicalIntegrityError',
        message: integrityErr.message,
        check: integrityErr.check,
        imbalanceAmount: integrityErr.imbalanceAmount,
        details: integrityErr.details,
      });
    }
    const message = err instanceof Error ? err.message : 'Ingestion failed';
    res.status(400).json({ error: 'Ingestion error', message });
  }
  }
});

export default router;
