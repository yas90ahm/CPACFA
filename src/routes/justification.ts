/**
 * Justification chat API: RAG (FASB/IFRS), IRAC format, [Source] citation, Export Audit Defense PDF.
 */

import { Router, type Request, type Response } from 'express';
import {
  justifyWithRAG,
  buildAuditDefenseSummary,
  exportAuditDefensePDF,
  getJustificationsForPeriod,
} from '../services/justification_service.js';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { send500 } from '../lib/errorHandler.js';

const router = Router();

/**
 * POST /api/justification/chat
 * Body: { question: string, framework?: "FASB" | "IFRS" }
 * Returns: IRAC justification with [Source] tag; agent uses RAG (FASB/IFRS handbooks).
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const body = req.body as { question?: string; framework?: 'FASB' | 'IFRS' };
    const question = (body?.question ?? '').trim();
    if (!question) {
      res.status(400).json({ error: 'Missing "question" in body' });
      return;
    }
    const response = await justifyWithRAG(question, { framework: body?.framework });
    res.json({
      irac: response.irac,
      sourceTag: response.sourceTag,
      formatted: response.formatted,
    });
  } catch (err) {
    send500(res, err, 'Justification chat failed');
  }
});

/**
 * GET /api/justification/audit-defense/summary
 * Query: periodStart (ISO date), periodEnd (ISO date), title?, entityName?
 * Returns: HTML summary of all justifications for the period (for preview or PDF).
 */
router.get('/audit-defense/summary', async (req: Request, res: Response) => {
  try {
    const periodStart = (req.query.periodStart as string) ?? new Date().toISOString().slice(0, 10);
    const periodEnd = (req.query.periodEnd as string) ?? new Date().toISOString().slice(0, 10);
    const title = (req.query.title as string) ?? 'Audit Defense — Justifications';
    const entityName = (req.query.entityName as string) ?? 'Entity';
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const { html } = await buildAuditDefenseSummary({
      periodStart,
      periodEnd,
      title,
      entityName,
      tenantId: tenantId ?? undefined,
      pool: pool ?? undefined,
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    send500(res, err, 'Audit defense summary failed');
  }
});

/**
 * GET /api/justification/audit-defense/export
 * Query: periodStart, periodEnd, title?, entityName?
 * Returns: Professional PDF report of all justifications for the period (Export Audit Defense).
 */
router.get('/audit-defense/export', async (req: Request, res: Response) => {
  try {
    const periodStart = (req.query.periodStart as string) ?? new Date().toISOString().slice(0, 10);
    const periodEnd = (req.query.periodEnd as string) ?? new Date().toISOString().slice(0, 10);
    const title = (req.query.title as string) ?? 'Audit Defense — Justifications';
    const entityName = (req.query.entityName as string) ?? 'Entity';
    const buffer = await exportAuditDefensePDF({
      periodStart,
      periodEnd,
      title,
      entityName,
    });
    const isPdf = buffer.length >= 5 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44; // %PDF
    const filename = `audit-defense-${periodStart}-${periodEnd}.${isPdf ? 'pdf' : 'html'}`;
    res.setHeader('Content-Type', isPdf ? 'application/pdf' : 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    send500(res, err, 'Audit defense export failed');
  }
});

/**
 * GET /api/justification/list
 * Query: periodStart?, periodEnd?
 * Returns: list of stored justifications (optionally filtered by period).
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const periodStart = req.query.periodStart as string | undefined;
    const periodEnd = req.query.periodEnd as string | undefined;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const list = await (periodStart && periodEnd
      ? getJustificationsForPeriod(periodStart, periodEnd, tenantId ?? undefined, pool ?? undefined)
      : getJustificationsForPeriod('1970-01-01', '2100-01-01', tenantId ?? undefined, pool ?? undefined));
    res.json({ justifications: list });
  } catch (err) {
    send500(res, err, 'Justification list failed');
  }
});

export default router;
