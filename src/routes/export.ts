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
import { checkExportGate, TAMPERING_ATTEMPT_DETECTED } from '../services/export_gate_service.js';
import { detectIntegrityConflicts } from '../services/integrity_conflict_service.js';
import { appendAuditLog } from '../services/audit_log_service.js';
import { finalIntegrityCheck } from '../agents/Supervisor.js';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { ENABLE_INTEGRATED_SUPERVISOR } from '../lib/capability_flags.js';
import type { AuthRequest } from '../auth/middleware.js';

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

/**
 * POST /api/export/pdf
 * Body: ReportPayload + pdf_type? + optional agent_context?: { response, thoughts?, toolCalls? }
 * When agent_context is provided: agent drafts narrative, Reasoning Chain included as appendix (Node PDF).
 * Otherwise builds PDF from request body in TypeScript.
 */
router.post('/pdf', async (req: Request, res: Response) => {
  try {
    let qualitativeEvidenceMissing = false;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
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
      if (process.env.ENABLE_INTEGRATED_SUPERVISOR === 'true' && !periodLabel) {
        res.status(400).json({
          error: 'periodLabel required',
          message: 'periodLabel is required in body or query when Integration is enabled.',
        });
        return;
      }
      const gateResult = await checkExportGate({
        tenantId,
        pool,
        periodLabel: periodLabel || undefined,
      });
      if (!gateResult.allowed) {
        res.status(403).json({
          error: gateResult.alert ?? 'Export blocked',
          code: gateResult.alert,
          message: gateResult.message ?? 'Financial export blocked.',
        });
        return;
      }
      if (gateResult.qualitativeEvidenceMissing) qualitativeEvidenceMissing = true;
    }

    const body = req.body as Record<string, unknown> & { pdf_type?: string; agent_context?: AgentExportContext };
    const pdfType = (body?.pdf_type ?? 'detailed') as string;
    const financial_statements = (body.financial_statements as Record<string, unknown>) ?? {};

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
        return res.status(409).json({
          error: 'Conflict',
          code: 'CPA_CFA_CONFLICT',
          message: 'CPA vs. CFA discrepancy: export blocked. Resolve covenant conflicts before issuing financial statements.',
          conflicts: conflicts.map((c) => ({ severity: c.severity, source: c.source, message: c.message, cpaVsCfa: c.cpaVsCfa })),
        });
      }
    }

    const clean_ledger_raw = (body.clean_ledger as Array<{ account_code?: string; account_name: string; debit: number; credit: number; account_type?: string }>) ?? [];
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
    if (!finalCheck.passed) {
      return res.status(422).json({
        error: 'Unprocessable Entity',
        code: 'FINAL_INTEGRITY_CHECK_FAILED',
        message: finalCheck.error ?? 'Export blocked: imbalance or unclassified Suspense accounts.',
        checks: finalCheck.checks,
        suspenseAccounts: finalCheck.suspenseAccounts,
        plugSuspicious: finalCheck.plugSuspicious,
      });
    }

    if (hasAgentContext(body)) {
      const agent_context = body.agent_context;
      const cover = (body.cover as Record<string, string>) ?? {};
      const audit_trail = (body.audit_trail as Array<{ timestamp_utc: string; event_type: string; reasoning: string; citations: string; outcome: string }>) ?? [];
      const audit_trail_rules_cited = (body.audit_trail_rules_cited as string[]) ?? [];
      const clean_ledger_raw = (body.clean_ledger as Array<{ account_code?: string; account_name: string; debit: number; credit: number; account_type?: string }>) ?? [];
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
      };
      const buf = await createPdfFromStructuredPayload(pdfPayload);
      const name = pdfType === 'summary' ? 'financial_report_summary.pdf' : 'financial_report.pdf';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      return res.send(buf);
    }

    const cover = (body.cover as Record<string, string>) ?? {};
    const pdfPayload = {
      cover,
      executive_summary: (body.executive_summary as string) ?? `Financial report. Period: ${(body.periodStart as string) ?? ''} to ${(body.periodEnd as string) ?? ''}. Entity: ${cover.entity_name ?? 'Entity'}.`,
      overview: (body.overview as string) | undefined,
      highlights: Array.isArray(body.highlights) ? (body.highlights as string[]) : undefined,
      financial_statements: (body.financial_statements as Record<string, unknown>) ?? {},
      audit_trail: (body.audit_trail as Array<{ timestamp_utc: string; event_type: string; reasoning: string; citations: string; outcome: string }>) ?? [],
      reasoning_chain_appendix: [],
      unauditedNarrativeHeader: qualitativeEvidenceMissing,
    };
    const buf = await createPdfFromStructuredPayload(pdfPayload);
    const name = pdfType === 'summary' ? 'financial_report_summary.pdf' : 'financial_report.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buf);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PDF export failed';
    res.status(500).json({ error: 'Export error', message });
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
      if (ENABLE_INTEGRATED_SUPERVISOR && !periodLabel) {
        res.status(400).json({
          error: 'periodLabel required',
          message: 'periodLabel is required in body or query when Integration is enabled.',
        });
        return;
      }
      const gateResult = await checkExportGate({
        tenantId,
        pool,
        periodLabel: periodLabel || undefined,
      });
      if (!gateResult.allowed) {
        res.status(403).json({
          error: gateResult.alert ?? 'Export blocked',
          code: gateResult.alert,
          message: gateResult.message ?? 'Financial export blocked.',
        });
        return;
      }
    }
    const body = req.body as {
      clean_ledger?: Array<{ account_code?: string; account_name: string; debit: number; credit: number; account_type?: string; Agent_Confidence_Score?: number }>;
    };
    const raw = body?.clean_ledger ?? [];
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
        code: 'FINAL_INTEGRITY_CHECK_FAILED',
        message: finalCheckCsv.error ?? 'Export blocked: imbalance or unclassified Suspense accounts.',
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
    const buf = generateCsvWithConfidence(cleanLedgerWithConfidence);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="clean_ledger.csv"');
    res.send(buf);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CSV export failed';
    res.status(500).json({ error: 'Export error', message });
  }
});

export default router;
