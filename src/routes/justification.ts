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
    const message = err instanceof Error ? err.message : 'Justification failed';
    res.status(500).json({ error: 'Justification error', message });
  }
});

/**
 * GET /api/justification/audit-defense/summary
 * Query: periodStart (ISO date), periodEnd (ISO date), title?, entityName?
 * Returns: HTML summary of all justifications for the period (for preview or PDF).
 */
router.get('/audit-defense/summary', (req: Request, res: Response) => {
  try {
    const periodStart = (req.query.periodStart as string) ?? new Date().toISOString().slice(0, 10);
    const periodEnd = (req.query.periodEnd as string) ?? new Date().toISOString().slice(0, 10);
    const title = (req.query.title as string) ?? 'Audit Defense — Justifications';
    const entityName = (req.query.entityName as string) ?? 'Entity';
    const { html } = buildAuditDefenseSummary({
      periodStart,
      periodEnd,
      title,
      entityName,
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Summary failed';
    res.status(500).json({ error: 'Summary error', message });
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
    const message = err instanceof Error ? err.message : 'Export failed';
    res.status(500).json({ error: 'Export error', message });
  }
});

/**
 * GET /api/justification/list
 * Query: periodStart?, periodEnd?
 * Returns: list of stored justifications (optionally filtered by period).
 */
router.get('/list', (req: Request, res: Response) => {
  try {
    const periodStart = req.query.periodStart as string | undefined;
    const periodEnd = req.query.periodEnd as string | undefined;
    const list = periodStart && periodEnd
      ? getJustificationsForPeriod(periodStart, periodEnd)
      : getJustificationsForPeriod('1970-01-01', '2100-01-01');
    res.json({ justifications: list });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'List failed';
    res.status(500).json({ error: 'List error', message });
  }
});

export default router;
