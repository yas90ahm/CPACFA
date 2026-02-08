/**
 * Document Generation Service — PDF/CSV export with Agent reasoning.
 * When agent_context is provided: agent drafts narrative, Reasoning Chain included as PDF appendix.
 * Otherwise builds PDF from request body in TypeScript.
 */

import { Router, type Request, type Response } from 'express';
import {
  buildReportPayloadWithAgent,
  buildCleanLedgerWithConfidence,
  generateCsvWithConfidence,
  type AgentExportContext,
} from '../services/export_service.js';
import { createPdfFromStructuredPayload } from '../services/pdf_export.js';
import { checkExportGate, TAMPERING_ATTEMPT_DETECTED, RESOLUTION_MISMATCH } from '../services/export_gate_service.js';
import { detectIntegrityConflicts } from '../services/integrity_conflict_service.js';
import { appendAuditLog } from '../services/audit_log_service.js';
import { recordMaterialEvent, recordLegacyCertifiedSourceUsed } from '../services/audit_ledger_service.js';
import { createIssueFromIntegrityFailure } from '../services/issue_item_service.js';
import { finalIntegrityCheck } from '../services/integrity_check.js';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { ENABLE_INTEGRATED_SUPERVISOR } from '../lib/capability_flags.js';
import { ALLOW_IMBALANCED_DRAFT_EXPORT, isProduction } from '../lib/env.js';
import { log } from '../lib/logger.js';
import { getStorage } from '../storage/index.js';
import { send500 } from '../lib/errorHandler.js';
import type { AuthRequest } from '../auth/middleware.js';
import {
  BinderExportCode,
  BinderExportMessage,
  BinderExportRemediation,
} from '../constants/binder_export_codes.js';
import type { ExportMode } from '../services/pdf_export.js';

const router = Router();

/** Extract BS/P&L totals from financial_statements (snake_case or camelCase) for integrity conflict check. */
function extractIntegrityConflictInput(
  financial_statements: Record<string, unknown>
): { totalAssets: number; totalLiabilities: number; totalEquity: number; currentAssets?: number; currentLiabilities?: number; debt?: number; ebitda?: number; interestExpense?: number; currentRatio?: number; debtToEquity?: number } | null {
  const bs = (financial_statements.balance_sheet ?? financial_statements.balanceSheet) as Record<string, unknown> | undefined;
  const pl = (financial_statements.profit_and_loss ?? financial_statements.profitAndLoss) as Record<string, unknown> | undefined;
  const totalAssets = Number(bs?.total_assets ?? bs?.totalAssets ?? 0);
  const totalLiabilities = Number(bs?.total_liabilities ?? bs?.totalLiabilities ?? 0);
  const totalEquity = Number(bs?.total_equity ?? bs?.totalEquity ?? 0);
  if (totalAssets === 0 && totalLiabilities === 0 && totalEquity === 0) return null;
  const currentAssets = bs?.current_assets ?? bs?.currentAssets;
  const currentLiabilities = bs?.current_liabilities ?? bs?.currentLiabilities;
  const debt = bs?.debt ?? totalLiabilities;
  const totalRevenue = pl != null ? Number(pl.total_revenue ?? pl.totalRevenue ?? 0) : undefined;
  const totalExpenses = pl != null ? Number(pl.total_expenses ?? pl.totalExpenses ?? 0) : undefined;
  const netIncome = pl != null ? Number(pl.net_income ?? pl.netIncome ?? 0) : undefined;
  const ebitda = pl != null ? (Number(pl.ebitda ?? 0) || (netIncome != null && totalExpenses != null ? netIncome + totalExpenses : undefined)) : undefined;
  const interestExpense = pl != null ? Number(pl.interest_expense ?? pl.interestExpense ?? 0) : undefined;
  const ratios = (financial_statements.ratios ?? financial_statements) as Record<string, unknown> | undefined;
  const currentRatio = ratios?.current_ratio ?? ratios?.currentRatio;
  const debtToEquity = ratios?.debt_to_equity ?? ratios?.debtToEquity;
  return {
    totalAssets,
    totalLiabilities,
    totalEquity,
    currentAssets: currentAssets != null ? Number(currentAssets) : undefined,
    currentLiabilities: currentLiabilities != null ? Number(currentLiabilities) : undefined,
    debt: typeof debt === 'number' ? debt : totalLiabilities,
    ebitda,
    interestExpense,
    currentRatio: currentRatio != null ? Number(currentRatio) : undefined,
    debtToEquity: debtToEquity != null ? Number(debtToEquity) : undefined,
  };
}

function hasAgentContext(body: Record<string, unknown>): body is Record<string, unknown> & { agent_context: AgentExportContext } {
  const ac = (body as { agent_context?: unknown }).agent_context;
  return !!ac && typeof ac === 'object' && typeof (ac as { response?: unknown }).response === 'string';
}

/** In production, certification bypass flag is IGNORED and never honored. If present, log tampering_attempt. */
function auditBypassFlagIfPresent(req: Request, resource: string, tenantId: string | undefined, pool: ReturnType<typeof getTenantPool>): void {
  if (!isProduction()) return;
  const body = (req.body as Record<string, unknown>) ?? {};
  const present = 'exportBypassCertification' in body || 'exportBypassCertification' in (req.query ?? {});
  if (present) {
    appendAuditLog(
      {
        action: 'tampering_attempt',
        resource,
        detail: 'exportBypassCertification sent; ignored in production. Certified export requires session.status === certified.',
        actor: (req as AuthRequest).userId ?? 'anonymous',
      },
      tenantId && pool ? { pool, tenantId } : undefined
    );
  }
}

/**
 * POST /api/export/pdf
 * Body: ReportPayload + pdf_type? + exportMode?: 'draft' | 'certified' + optional agent_context?
 * exportMode: default 'draft'. Certified requires closeSessionId and session.status === 'certified'.
 * When agent_context is provided: agent drafts narrative, Reasoning Chain included as appendix (Node PDF).
 * Otherwise builds PDF from request body in TypeScript.
 */
router.post('/pdf', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    auditBypassFlagIfPresent(req, 'export:pdf', tenantId, pool);

    let qualitativeEvidenceMissing = false;
    const bodyForMode = req.body as Record<string, unknown> & { exportMode?: string; closeSessionId?: string; periodLabel?: string };
    const exportMode: ExportMode = (bodyForMode.exportMode ?? (req.query.exportMode as string) ?? 'draft') === 'certified' ? 'certified' : 'draft';

    if (tenantId && pool) {
      const bodyGate = req.body as Record<string, unknown> & { periodLabel?: string };
      if ('roundingGapExceedsMateriality' in bodyGate || 'aggregateRoundingExceedsMateriality' in bodyGate) {
        res.status(403).json({
          error: 'Tampering attempt detected',
          code: TAMPERING_ATTEMPT_DETECTED,
          message: 'Materiality flags cannot be supplied by client.',
        });
        return;
      }
      const periodLabel = (bodyGate.periodLabel ?? (req.query.periodLabel as string) ?? '') as string;
      const closeSessionId = (bodyGate.closeSessionId ?? (req.query.closeSessionId as string) ?? '') as string;
      if (process.env.ENABLE_INTEGRATED_SUPERVISOR === 'true' && !periodLabel) {
        res.status(400).json({
          error: 'periodLabel required',
          message: 'periodLabel is required in body or query when Integration is enabled.',
        });
        return;
      }

      if (exportMode === 'certified') {
        if (!closeSessionId) {
          res.status(400).json({
            error: 'closeSessionId required',
            code: 'CLOSE_SESSION_REQUIRED',
            message: 'Certified export requires closeSessionId in body or query.',
          });
          return;
        }
        const { computeReadiness } = await import('../services/close_checklist_readiness_service.js');
        const { getSession } = await import('../services/close_session_service.js');
        const session = await getSession(pool, tenantId, closeSessionId);
        if (!session) {
          res.status(403).json({
            error: 'Close session not found',
            code: 'CLOSE_SESSION_NOT_FOUND',
            message: 'Certified export requires an existing close session.',
          });
          return;
        }
        if (session.status !== 'certified') {
          res.status(403).json({
            error: 'Close not certified',
            code: 'CLOSE_NOT_CERTIFIED',
            message: 'Certified export requires session.status === \'certified\'. Use exportMode=draft for pre-certification export.',
          });
          return;
        }
        const readiness = await computeReadiness(pool, tenantId, session);
        if (!readiness.ready && readiness.hardBlockers.length > 0) {
          res.status(403).json({
            error: 'Close readiness blocked',
            code: 'CLOSE_READINESS_BLOCKED',
            message: 'Export blocked: resolve hard blockers before export.',
            hardBlockers: readiness.hardBlockers,
            softWarnings: readiness.softWarnings,
          });
          return;
        }
      }

      if (exportMode === 'certified') {
        const gateResult = await checkExportGate({
          tenantId,
          pool,
          periodLabel: periodLabel || undefined,
        });
        if (!gateResult.allowed) {
          if (gateResult.alert === RESOLUTION_MISMATCH && gateResult.details) {
            res.status(422).json({
              code: 'RESOLUTION_MISMATCH',
              message: gateResult.message ?? 'Ledger resolution mismatch: export blocked.',
              details: gateResult.details,
            });
            return;
          }
          res.status(403).json({
            error: gateResult.alert ?? 'Export blocked',
            code: gateResult.alert,
            message: gateResult.message ?? 'Financial export blocked.',
          });
          return;
        }
        if (gateResult.qualitativeEvidenceMissing) qualitativeEvidenceMissing = true;
      }
    }

    const body = req.body as Record<string, unknown> & { pdf_type?: string; agent_context?: AgentExportContext };
    const pdfType = (body?.pdf_type ?? 'detailed') as string;
    type CleanLedgerRow = { account_code?: string; account_name: string; debit: number; credit: number; account_type?: string };
    let financial_statements: Record<string, unknown> = (body.financial_statements as Record<string, unknown>) ?? {};
    let clean_ledger_raw: CleanLedgerRow[] = (body.clean_ledger as CleanLedgerRow[]) ?? [];
    let certifiedExportResult: Awaited<ReturnType<typeof import('../services/audit_export_service.js').getCertifiedStatementsForBinder>> = null;
    if (exportMode === 'certified') {
      const closeSessionIdExport = (bodyForMode.closeSessionId ?? (req.query.closeSessionId as string) ?? '') as string;
      if (closeSessionIdExport && tenantId && pool) {
        const { getCertifiedStatementsForBinder } = await import('../services/audit_export_service.js');
        const { statementsToExportPayload } = await import('../services/certified_statements_service.js');
        const allowLegacy = (req.query.allowLegacyCertifiedSource as string) === '1' || process.env.ALLOW_LEGACY_CERTIFIED_SOURCE === 'true';
        const result = await getCertifiedStatementsForBinder(pool, tenantId, closeSessionIdExport, { allowLegacyCertifiedSource: allowLegacy });
        if (result) {
          certifiedExportResult = result;
          const payload = statementsToExportPayload(result.statements);
          financial_statements = payload.financial_statements;
          clean_ledger_raw = payload.clean_ledger;
        } else if (!allowLegacy) {
          const payload: {
            error: string;
            code: string;
            message: string;
            remediation?: string;
            allowLegacyCertifiedSourceEffective?: boolean;
            attemptedSource?: string;
          } = {
            error: 'Unprocessable Entity',
            code: BinderExportCode.NO_CERTIFIED_SOURCE,
            message: BinderExportMessage[BinderExportCode.NO_CERTIFIED_SOURCE],
            allowLegacyCertifiedSourceEffective: allowLegacy,
            attemptedSource: 'certified_snapshot',
          };
          if (BinderExportRemediation[BinderExportCode.NO_CERTIFIED_SOURCE]) {
            payload.remediation = BinderExportRemediation[BinderExportCode.NO_CERTIFIED_SOURCE];
          }
          return res.status(422).json(payload);
        }
      }
    }

    const conflictInput = extractIntegrityConflictInput(financial_statements);
    if (conflictInput) {
      const { conflicts, hasFatal } = detectIntegrityConflicts(conflictInput);
      if (hasFatal) {
        const authReq = req as AuthRequest;
        appendAuditLog(
          {
            action: 'BLOCKED_EXPORT',
            resource: 'export:pdf',
            detail: JSON.stringify({ reason: 'CPA vs CFA conflict', conflicts }),
            actor: authReq.userId ?? 'anonymous',
          },
          tenantId && pool ? { pool, tenantId } : undefined
        );
        const closeSessionId = (req.body as Record<string, unknown>).closeSessionId ?? (req.query as Record<string, unknown>).closeSessionId;
        if (tenantId && pool && typeof closeSessionId === 'string' && closeSessionId) {
          try {
            await createIssueFromIntegrityFailure(
              { pool, tenantId, closeSessionId, createdBy: authReq.userId },
              {
                title: 'Export blocked: CPA vs CFA covenant conflict',
                description: conflicts.map((c) => c.message).join('; '),
                category: 'export_blocker',
                severity: 'critical',
                sourceRef: { conflicts: conflicts.map((c) => ({ severity: c.severity, source: c.source, message: c.message, cpaVsCfa: c.cpaVsCfa })) },
              }
            );
          } catch (_) {
            /* non-fatal: issue creation failed; still return 409 */
          }
        }
        return res.status(409).json({
          error: 'Conflict',
          code: 'CPA_CFA_CONFLICT',
          message: 'CPA vs. CFA discrepancy: export blocked. Resolve covenant conflicts before issuing financial statements.',
          conflicts: conflicts.map((c) => ({ severity: c.severity, source: c.source, message: c.message, cpaVsCfa: c.cpaVsCfa })),
        });
      }
    }

    const bs = (financial_statements.balance_sheet ?? financial_statements.balanceSheet) as Record<string, unknown> | undefined;
    const totalAssets = bs != null ? Number(bs.total_assets ?? bs.totalAssets ?? 0) : 0;
    const totalLiabilities = bs != null ? Number(bs.total_liabilities ?? bs.totalLiabilities ?? 0) : 0;
    const totalEquity = bs != null ? Number(bs.total_equity ?? bs.totalEquity ?? 0) : 0;
    let totalDebits = 0;
    let totalCredits = 0;
    for (const row of clean_ledger_raw) {
      totalDebits += Number(row.debit) || 0;
      totalCredits += Number(row.credit) || 0;
    }
    const finalCheck = finalIntegrityCheck({
      trialBalance: { totalDebits, totalCredits },
      balanceSheet: { totalAssets, totalLiabilities, totalEquity },
      entriesForPlugDetection: clean_ledger_raw.map((r) => ({
        accountName: r.account_name,
        debit: Number(r.debit) || 0,
        credit: Number(r.credit) || 0,
      })),
    });
    let draftImbalanceAmount: number | undefined;
    if (!finalCheck.passed) {
      if (exportMode === 'certified') {
        return res.status(422).json({
          error: 'Unprocessable Entity',
          code: BinderExportCode.FINAL_INTEGRITY_CHECK_FAILED,
          message: finalCheck.error ?? BinderExportMessage[BinderExportCode.FINAL_INTEGRITY_CHECK_FAILED],
          checks: finalCheck.checks,
          suspenseAccounts: finalCheck.suspenseAccounts,
          plugSuspicious: finalCheck.plugSuspicious,
        });
      }
      if (exportMode === 'draft' && ALLOW_IMBALANCED_DRAFT_EXPORT()) {
        draftImbalanceAmount = Math.abs(totalDebits - totalCredits);
      } else {
        return res.status(422).json({
          error: 'Unprocessable Entity',
          code: BinderExportCode.FINAL_INTEGRITY_CHECK_FAILED,
          message: finalCheck.error ?? BinderExportMessage[BinderExportCode.FINAL_INTEGRITY_CHECK_FAILED],
          checks: finalCheck.checks,
          suspenseAccounts: finalCheck.suspenseAccounts,
          plugSuspicious: finalCheck.plugSuspicious,
        });
      }
    }

    if (hasAgentContext(body)) {
      const agent_context = body.agent_context;
      const cover = (body.cover as Record<string, string>) ?? {};
      const audit_trail = (body.audit_trail as Array<{ timestamp_utc: string; event_type: string; reasoning: string; citations: string; outcome: string }>) ?? [];
      const audit_trail_rules_cited = (body.audit_trail_rules_cited as string[]) ?? [];
      const binderSummary = {
        entityName: cover.entity_name,
        periodStart: (body.periodStart as string) ?? '',
        periodEnd: (body.periodEnd as string) ?? '',
        reportDate: cover.report_date,
      };
      const payload = await buildReportPayloadWithAgent({
        cover,
        financial_statements,
        audit_trail,
        audit_trail_rules_cited,
        clean_ledger: clean_ledger_raw,
        binderSummary,
        agentContext: agent_context,
      });
      if (tenantId && pool) {
        const bodyGate = req.body as Record<string, unknown> & { periodLabel?: string };
        const periodLabel = (bodyGate.periodLabel ?? (req.query.periodLabel as string) ?? '') as string;
        await recordMaterialEvent(pool, {
          tenantId,
          periodLabel: periodLabel || undefined,
          eventType: 'export_event',
          deterministicFlagSnapshot: {
            format: 'pdf',
            pdfType,
            hasAgentContext: true,
            periodLabel: periodLabel || undefined,
          },
          createdBy: (req as { userId?: string }).userId,
        });
      }
      const pdfPayload = {
        cover: payload.cover,
        executive_summary: payload.executive_summary,
        overview: payload.overview,
        highlights: payload.highlights,
        financial_statements: payload.financial_statements,
        audit_trail: payload.audit_trail,
        reasoning_chain_appendix: payload.reasoning_chain_appendix,
        unauditedNarrativeHeader: qualitativeEvidenceMissing,
        compliancePackage: payload.compliancePackage,
        exportMode,
        ...(exportMode === 'draft' && {
          draftWorkflowState: undefined as string | undefined,
          generatedAt: new Date().toISOString(),
          imbalanceAmount: draftImbalanceAmount,
        }),
      };
      if (exportMode === 'draft' && tenantId && pool) {
        const closeSessionIdForDraft = (bodyForMode.closeSessionId ?? (req.query.closeSessionId as string) ?? '') as string;
        if (closeSessionIdForDraft) {
          const { getSession } = await import('../services/close_session_service.js');
          const session = await getSession(pool, tenantId, closeSessionIdForDraft);
          (pdfPayload as { draftWorkflowState?: string }).draftWorkflowState = session?.status ?? 'draft';
        } else {
          (pdfPayload as { draftWorkflowState?: string }).draftWorkflowState = 'draft';
        }
      }
      const buf = await createPdfFromStructuredPayload(pdfPayload);
      const name =
        exportMode === 'certified'
          ? pdfType === 'summary'
            ? 'Certified_Financials_summary.pdf'
            : 'Certified_Financials.pdf'
          : pdfType === 'summary'
            ? 'Draft_Financials_NOT_CERTIFIED_summary.pdf'
            : 'Draft_Financials_NOT_CERTIFIED.pdf';
      if (tenantId && pool && (req.query.storeExport === '1' || (body as { storeExport?: string }).storeExport === '1')) {
        const bodyGate = req.body as Record<string, unknown> & { periodLabel?: string };
        const periodLabel = (bodyGate.periodLabel ?? (req.query.periodLabel as string) ?? '') as string;
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const key = `${tenantId}/exports/pdf/${periodLabel || 'na'}/${ts}.pdf`;
        await getStorage().putObject(key, Buffer.from(buf), { contentType: 'application/pdf' });
        res.setHeader('X-Export-File-Ref', key);
      }
      if (exportMode === 'certified' && certifiedExportResult) {
        res.setHeader('X-Certified-Source', certifiedExportResult.source);
        if (certifiedExportResult.source === 'legacy') res.setHeader('X-Legacy-Certified-Source', 'true');
        if (certifiedExportResult.certifiedSnapshotId) res.setHeader('X-Certified-Snapshot-Id', certifiedExportResult.certifiedSnapshotId);
        if (certifiedExportResult.snapshotHash) res.setHeader('X-Certified-Snapshot-Hash', certifiedExportResult.snapshotHash);
        if (certifiedExportResult.snapshotHashVersion != null) res.setHeader('X-Certified-Snapshot-Hash-Version', String(certifiedExportResult.snapshotHashVersion));
        if (certifiedExportResult.source === 'legacy' && tenantId && pool) {
          const closeSessionIdExport = (bodyForMode.closeSessionId ?? (req.query.closeSessionId as string) ?? '') as string;
          const bodyG = req.body as Record<string, unknown> & { periodLabel?: string };
          const periodLabel = (bodyG.periodLabel ?? (req.query.periodLabel as string) ?? '') as string;
          log('warn', 'Legacy certified source used', { tenantId, closeSessionId: closeSessionIdExport });
          await recordLegacyCertifiedSourceUsed(pool, { tenantId, closeSessionId: closeSessionIdExport, periodLabel: periodLabel || undefined, createdBy: (req as { userId?: string }).userId });
        }
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      return res.send(buf);
    }

    const cover = (body.cover as Record<string, string>) ?? {};
    const pdfPayload = {
      cover,
      executive_summary: (body.executive_summary as string) ?? `Financial report. Period: ${(body.periodStart as string) ?? ''} to ${(body.periodEnd as string) ?? ''}. Entity: ${cover.entity_name ?? 'Entity'}.`,
      overview: typeof body.overview === 'string' ? body.overview : (body.overview != null ? String(body.overview) : undefined),
      highlights: Array.isArray(body.highlights) ? (body.highlights as string[]) : undefined,
      financial_statements: (body.financial_statements as Record<string, unknown>) ?? {},
      audit_trail: (body.audit_trail as Array<{ timestamp_utc: string; event_type: string; reasoning: string; citations: string; outcome: string }>) ?? [],
      reasoning_chain_appendix: [],
      unauditedNarrativeHeader: qualitativeEvidenceMissing,
    };
    if (tenantId && pool) {
      const bodyGate = req.body as Record<string, unknown> & { periodLabel?: string; periodEnd?: string };
      const periodLabel =
        (bodyGate.periodLabel ?? (req.query.periodLabel as string) ?? (bodyGate.periodEnd != null ? String(bodyGate.periodEnd).slice(0, 7) : '') ?? '') as string;
      await recordMaterialEvent(pool, {
        tenantId,
        periodLabel: periodLabel || undefined,
        eventType: 'export_event',
        deterministicFlagSnapshot: {
          format: 'pdf',
          pdfType,
          hasAgentContext: false,
          periodLabel: periodLabel || undefined,
        },
        createdBy: (req as { userId?: string }).userId,
      });
    }
    const buf = await createPdfFromStructuredPayload(pdfPayload);
    const name =
      exportMode === 'certified'
        ? pdfType === 'summary'
          ? 'Certified_Financials_summary.pdf'
          : 'Certified_Financials.pdf'
        : pdfType === 'summary'
          ? 'Draft_Financials_NOT_CERTIFIED_summary.pdf'
          : 'Draft_Financials_NOT_CERTIFIED.pdf';
    if (exportMode === 'certified' && certifiedExportResult) {
      res.setHeader('X-Certified-Source', certifiedExportResult.source);
      if (certifiedExportResult.source === 'legacy') res.setHeader('X-Legacy-Certified-Source', 'true');
      if (certifiedExportResult.certifiedSnapshotId) res.setHeader('X-Certified-Snapshot-Id', certifiedExportResult.certifiedSnapshotId);
      if (certifiedExportResult.snapshotHash) res.setHeader('X-Certified-Snapshot-Hash', certifiedExportResult.snapshotHash);
      if (certifiedExportResult.snapshotHashVersion != null) res.setHeader('X-Certified-Snapshot-Hash-Version', String(certifiedExportResult.snapshotHashVersion));
      if (certifiedExportResult.source === 'legacy' && tenantId && pool) {
        const bodyG = req.body as Record<string, unknown> & { closeSessionId?: string; periodLabel?: string };
        const closeSessionIdExport = (bodyG.closeSessionId ?? (req.query.closeSessionId as string) ?? '') as string;
        const periodLabel = (bodyG.periodLabel ?? (req.query.periodLabel as string) ?? '') as string;
        log('warn', 'Legacy certified source used', { tenantId, closeSessionId: closeSessionIdExport });
        await recordLegacyCertifiedSourceUsed(pool, { tenantId, closeSessionId: closeSessionIdExport, periodLabel: periodLabel || undefined, createdBy: (req as { userId?: string }).userId });
      }
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buf);
  } catch (err) {
    send500(res, err, 'PDF export failed');
  }
});

/**
 * POST /api/export/csv
 * Body: { clean_ledger: [ { account_code, account_name, debit, credit, account_type } ] }
 * CSV always includes Agent_Confidence_Score column (default 1.0 per line). Generated in Node.
 */
router.post('/csv', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    auditBypassFlagIfPresent(req, 'export:csv', tenantId, pool);

    const bodyCsv = req.body as Record<string, unknown> & { exportMode?: string; closeSessionId?: string; periodLabel?: string };
    const exportModeCsv: ExportMode = (bodyCsv.exportMode ?? (req.query.exportMode as string) ?? 'draft') === 'certified' ? 'certified' : 'draft';

    if (tenantId && pool) {
      const bodyGate = req.body as Record<string, unknown> & { periodLabel?: string };
      if ('roundingGapExceedsMateriality' in bodyGate || 'aggregateRoundingExceedsMateriality' in bodyGate) {
        res.status(403).json({
          error: 'Tampering attempt detected',
          code: TAMPERING_ATTEMPT_DETECTED,
          message: 'Materiality flags cannot be supplied by client.',
        });
        return;
      }
      const periodLabel = (bodyGate.periodLabel ?? (req.query.periodLabel as string) ?? '') as string;
      const closeSessionId = (bodyCsv.closeSessionId ?? (req.query.closeSessionId as string) ?? '') as string;
      if (ENABLE_INTEGRATED_SUPERVISOR && !periodLabel) {
        res.status(400).json({
          error: 'periodLabel required',
          message: 'periodLabel is required in body or query when Integration is enabled.',
        });
        return;
      }
      if (exportModeCsv === 'certified') {
        if (!closeSessionId) {
          res.status(400).json({
            error: 'closeSessionId required',
            code: 'CLOSE_SESSION_REQUIRED',
            message: 'Certified CSV export requires closeSessionId in body or query.',
          });
          return;
        }
        const { getSession } = await import('../services/close_session_service.js');
        const session = await getSession(pool, tenantId, closeSessionId);
        if (!session) {
          res.status(403).json({
            error: 'Close session not found',
            code: 'CLOSE_SESSION_NOT_FOUND',
            message: 'Certified export requires an existing close session.',
          });
          return;
        }
        if (session.status !== 'certified') {
          res.status(403).json({
            error: 'Close not certified',
            code: 'CLOSE_NOT_CERTIFIED',
            message: 'Certified CSV export requires session.status === \'certified\'. Use exportMode=draft for pre-certification export.',
          });
          return;
        }
      }
      if (exportModeCsv === 'certified') {
        const gateResult = await checkExportGate({
          tenantId,
          pool,
          periodLabel: periodLabel || undefined,
        });
        if (!gateResult.allowed) {
          if (gateResult.alert === RESOLUTION_MISMATCH && gateResult.details) {
            res.status(422).json({
              code: 'RESOLUTION_MISMATCH',
              message: gateResult.message ?? 'Ledger resolution mismatch: export blocked.',
              details: gateResult.details,
            });
            return;
          }
          res.status(403).json({
            error: gateResult.alert ?? 'Export blocked',
            code: gateResult.alert,
            message: gateResult.message ?? 'Financial export blocked.',
          });
          return;
        }
      }
    }
    const body = req.body as {
      clean_ledger?: Array<{ account_code?: string; account_name: string; debit: number; credit: number; account_type?: string; Agent_Confidence_Score?: number }>;
    };
    const closeSessionIdCsv = (bodyCsv.closeSessionId ?? (req.query.closeSessionId as string) ?? '') as string;
    let raw: Array<{ account_code?: string; account_name: string; debit: number; credit: number; account_type?: string; Agent_Confidence_Score?: number }> = body?.clean_ledger ?? [];
    let certifiedCsvResult: Awaited<ReturnType<typeof import('../services/audit_export_service.js').getCertifiedStatementsForBinder>> = null;
    if (exportModeCsv === 'certified' && closeSessionIdCsv && tenantId && pool) {
      const { getCertifiedStatementsForBinder } = await import('../services/audit_export_service.js');
      const { statementsToExportPayload } = await import('../services/certified_statements_service.js');
      const allowLegacyCsv = (req.query.allowLegacyCertifiedSource as string) === '1' || process.env.ALLOW_LEGACY_CERTIFIED_SOURCE === 'true';
      const resultCsv = await getCertifiedStatementsForBinder(pool, tenantId, closeSessionIdCsv, { allowLegacyCertifiedSource: allowLegacyCsv });
      if (resultCsv) {
        certifiedCsvResult = resultCsv;
        const payload = statementsToExportPayload(resultCsv.statements);
        raw = payload.clean_ledger as typeof raw;
      } else if (!allowLegacyCsv) {
        const payload: {
          error: string;
          code: string;
          message: string;
          remediation?: string;
          allowLegacyCertifiedSourceEffective?: boolean;
          attemptedSource?: string;
        } = {
          error: 'Unprocessable Entity',
          code: BinderExportCode.NO_CERTIFIED_SOURCE,
          message: BinderExportMessage[BinderExportCode.NO_CERTIFIED_SOURCE],
          allowLegacyCertifiedSourceEffective: allowLegacyCsv,
          attemptedSource: 'certified_snapshot',
        };
        if (BinderExportRemediation[BinderExportCode.NO_CERTIFIED_SOURCE]) {
          payload.remediation = BinderExportRemediation[BinderExportCode.NO_CERTIFIED_SOURCE];
        }
        return res.status(422).json(payload);
      }
    }
    let totalDebitsCsv = 0;
    let totalCreditsCsv = 0;
    for (const row of raw) {
      totalDebitsCsv += Number(row.debit) || 0;
      totalCreditsCsv += Number(row.credit) || 0;
    }
    const finalCheckCsv = finalIntegrityCheck({
      trialBalance: { totalDebits: totalDebitsCsv, totalCredits: totalCreditsCsv },
      balanceSheet: { totalAssets: 0, totalLiabilities: 0, totalEquity: 0 },
      entriesForPlugDetection: raw.map((r) => ({
        accountName: r.account_name,
        debit: Number(r.debit) || 0,
        credit: Number(r.credit) || 0,
      })),
    });
    if (!finalCheckCsv.passed) {
      return res.status(422).json({
        error: 'Unprocessable Entity',
        code: BinderExportCode.FINAL_INTEGRITY_CHECK_FAILED,
        message: finalCheckCsv.error ?? BinderExportMessage[BinderExportCode.FINAL_INTEGRITY_CHECK_FAILED],
        checks: finalCheckCsv.checks,
        suspenseAccounts: finalCheckCsv.suspenseAccounts,
        plugSuspicious: finalCheckCsv.plugSuspicious,
      });
    }
    const hasScore = raw.length > 0 && raw.some((r) => typeof (r as { Agent_Confidence_Score?: number }).Agent_Confidence_Score === 'number');
    const cleanLedgerWithConfidence = hasScore
      ? raw.map((r) => ({
          account_code: r.account_code ?? '',
          account_name: r.account_name ?? '',
          debit: Number(r.debit) || 0,
          credit: Number(r.credit) || 0,
          account_type: r.account_type ?? '',
          Agent_Confidence_Score: Math.min(1, Math.max(0, Number((r as { Agent_Confidence_Score?: number }).Agent_Confidence_Score) || 1)),
        }))
      : buildCleanLedgerWithConfidence(raw);
    if (tenantId && pool) {
      const bodyGate = req.body as Record<string, unknown> & { periodLabel?: string };
      const periodLabel = (bodyGate.periodLabel ?? (req.query.periodLabel as string) ?? '') as string;
      await recordMaterialEvent(pool, {
        tenantId,
        periodLabel: periodLabel || undefined,
        eventType: 'export_event',
        deterministicFlagSnapshot: {
          format: 'csv',
          rowCount: cleanLedgerWithConfidence.length,
          periodLabel: periodLabel || undefined,
        },
        createdBy: (req as { userId?: string }).userId,
      });
    }
    const buf = generateCsvWithConfidence(cleanLedgerWithConfidence);
    if (tenantId && pool && (req.query.storeExport === '1' || (req.body as { storeExport?: string })?.storeExport === '1')) {
      const bodyGate = req.body as Record<string, unknown> & { periodLabel?: string };
      const periodLabel = (bodyGate.periodLabel ?? (req.query.periodLabel as string) ?? '') as string;
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const key = `${tenantId}/exports/csv/${periodLabel || 'na'}/${ts}.csv`;
      await getStorage().putObject(key, typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf, { contentType: 'text/csv; charset=utf-8' });
      res.setHeader('X-Export-File-Ref', key);
    }
    const csvName = exportModeCsv === 'certified' ? 'Certified_Financials.csv' : 'Draft_Financials_NOT_CERTIFIED.csv';
    if (exportModeCsv === 'certified' && certifiedCsvResult) {
      res.setHeader('X-Certified-Source', certifiedCsvResult.source);
      if (certifiedCsvResult.source === 'legacy') res.setHeader('X-Legacy-Certified-Source', 'true');
      if (certifiedCsvResult.certifiedSnapshotId) res.setHeader('X-Certified-Snapshot-Id', certifiedCsvResult.certifiedSnapshotId);
      if (certifiedCsvResult.snapshotHash) res.setHeader('X-Certified-Snapshot-Hash', certifiedCsvResult.snapshotHash);
      if (certifiedCsvResult.snapshotHashVersion != null) res.setHeader('X-Certified-Snapshot-Hash-Version', String(certifiedCsvResult.snapshotHashVersion));
      if (certifiedCsvResult.source === 'legacy' && tenantId && pool) {
        const bodyG = req.body as Record<string, unknown> & { closeSessionId?: string; periodLabel?: string };
        const closeSessionIdCsv = (bodyG.closeSessionId ?? (req.query.closeSessionId as string) ?? '') as string;
        const periodLabel = (bodyG.periodLabel ?? (req.query.periodLabel as string) ?? '') as string;
        log('warn', 'Legacy certified source used', { tenantId, closeSessionId: closeSessionIdCsv });
        await recordLegacyCertifiedSourceUsed(pool, { tenantId, closeSessionId: closeSessionIdCsv, periodLabel: periodLabel || undefined, createdBy: (req as { userId?: string }).userId });
      }
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${csvName}"`);
    res.send(buf);
  } catch (err) {
    send500(res, err, 'CSV export failed');
  }
});

export default router;
