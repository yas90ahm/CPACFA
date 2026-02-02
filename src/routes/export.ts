/**
 * Document Generation Service — PDF/CSV export with Agent reasoning.
 * When agent_context (thoughts, toolCalls, response) is provided: agent drafts narrative, Reasoning Chain included as PDF appendix, CSV includes Agent_Confidence_Score.
 * Otherwise proxies to Python backend when configured.
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
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { ENABLE_INTEGRATED_SUPERVISOR } from '../lib/capability_flags.js';

const router = Router();
const BACKEND_PYTHON_URL = process.env.BACKEND_PYTHON_URL ?? '';

function getPythonBase(): string {
  const base = BACKEND_PYTHON_URL.replace(/\/$/, '');
  return base || 'http://localhost:5000';
}

function hasAgentContext(body: Record<string, unknown>): body is Record<string, unknown> & { agent_context: AgentExportContext } {
  const ac = (body as { agent_context?: unknown }).agent_context;
  return !!ac && typeof ac === 'object' && typeof (ac as { response?: unknown }).response === 'string';
}

/**
 * POST /api/export/pdf
 * Body: ReportPayload + pdf_type? + optional agent_context?: { response, thoughts?, toolCalls? }
 * When agent_context is provided: agent drafts narrative, Reasoning Chain included as appendix (Node PDF).
 * Otherwise proxies to Python; returns PDF file.
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

    if (hasAgentContext(body)) {
      const agent_context = body.agent_context;
      const cover = (body.cover as Record<string, string>) ?? {};
      const financial_statements = (body.financial_statements as Record<string, unknown>) ?? {};
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
      };
      const buf = await createPdfFromStructuredPayload(pdfPayload);
      const name = pdfType === 'summary' ? 'financial_report_summary.pdf' : 'financial_report.pdf';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      return res.send(buf);
    }

    const url = `${getPythonBase()}/api/export/pdf`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      res.status(resp.status).json(err);
      return;
    }
    const blob = await resp.blob();
    const buf = Buffer.from(await blob.arrayBuffer());
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
