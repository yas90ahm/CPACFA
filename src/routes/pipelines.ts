/**
 * Pipelines API — Bank transaction-level, AP/AR aging, Payroll accrual.
 */

import { Router, type Request, type Response } from 'express';
import { runBankPipeline } from '../services/bank_pipeline_service.js';
import { buildApAgingReport, buildArAgingReport } from '../services/ap_ar_aging_service.js';
import { buildPayrollAccrual } from '../services/payroll_accrual_service.js';
import {
  runBankReconciliation,
  type BankRecInput,
  type BankRecOptions,
} from '../services/bank_reconciliation_service.js';
import {
  explainBankRecAgentic,
  suggestReconciliationAdjustmentAgentic,
} from '../services/agentic_bank_rec_service.js';
import { storeBankRecByPeriod, listBankRecByPeriod } from '../services/bank_rec_by_period_service.js';
import { buildCashPosition } from '../services/cash_position_service.js';
import type { CanonicalApItem, CanonicalArItem, CanonicalPayrollItem } from '../types/canonical_ap_ar_payroll.js';

const router = Router();

/** POST /api/pipelines/bank — Transaction-level bank pipeline → transactions + TB cash entry + balance */
router.post('/bank', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      rows: Record<string, unknown>[];
      openingBalance?: number;
      sourceDocId?: string;
    };
    if (!Array.isArray(body?.rows)) {
      res.status(400).json({ error: 'Missing or invalid "rows" array' });
      return;
    }
    const result = runBankPipeline({
      rows: body.rows,
      openingBalance: body.openingBalance,
      sourceDocId: body.sourceDocId,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Bank pipeline failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/pipelines/ap-aging — AP aging report from canonical AP items */
router.post('/ap-aging', (req: Request, res: Response) => {
  try {
    const body = req.body as { items: CanonicalApItem[]; asOfDate?: string };
    if (!Array.isArray(body?.items)) {
      res.status(400).json({ error: 'Missing or invalid "items" array' });
      return;
    }
    const report = buildApAgingReport(body.items, { asOfDate: body.asOfDate });
    res.json(report);
  } catch (e) {
    res.status(500).json({
      error: 'AP aging failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/pipelines/ar-aging — AR aging report from canonical AR items */
router.post('/ar-aging', (req: Request, res: Response) => {
  try {
    const body = req.body as { items: CanonicalArItem[]; asOfDate?: string };
    if (!Array.isArray(body?.items)) {
      res.status(400).json({ error: 'Missing or invalid "items" array' });
      return;
    }
    const report = buildArAgingReport(body.items, { asOfDate: body.asOfDate });
    res.json(report);
  } catch (e) {
    res.status(500).json({
      error: 'AR aging failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/pipelines/payroll-accrual — Payroll accrual summary from canonical payroll items */
router.post('/payroll-accrual', (req: Request, res: Response) => {
  try {
    const body = req.body as { items: CanonicalPayrollItem[]; periodEndDate?: string; currency?: string };
    if (!Array.isArray(body?.items)) {
      res.status(400).json({ error: 'Missing or invalid "items" array' });
      return;
    }
    const result = buildPayrollAccrual({
      items: body.items,
      periodEndDate: body.periodEndDate,
      currency: body.currency,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Payroll accrual failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/pipelines/bank-rec — Bank reconciliation (statement vs GL cash). Body may include explain: true, periodLabel (FW3: store by period), priorPeriodRecId. */
router.post('/bank-rec', async (req: Request, res: Response) => {
  try {
    const body = req.body as import('../services/bank_reconciliation_service.js').BankRecInput & {
      explain?: boolean;
      periodLabel?: string;
      priorPeriodRecId?: string;
    };
    if (!body?.statementLines || !Array.isArray(body.statementLines) || !body?.glCashEntries || !Array.isArray(body.glCashEntries)) {
      res.status(400).json({ error: 'Missing statementLines or glCashEntries' });
      return;
    }
    const { explain: wantExplain, periodLabel, priorPeriodRecId, ...input } = body;
    const result = runBankReconciliation(input);
    if (periodLabel) {
      const stored = storeBankRecByPeriod({ periodLabel, result, priorPeriodRecId });
      if (wantExplain) {
        const narrative = await explainBankRecAgentic(result);
        res.json({ result, narrative, storedRecId: stored.id, periodLabel });
        return;
      }
      res.json({ result, storedRecId: stored.id, periodLabel });
      return;
    }
    if (wantExplain) {
      const narrative = await explainBankRecAgentic(result);
      res.json({ result, narrative });
      return;
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Bank reconciliation failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/pipelines/bank-rec/by-period — List bank recs by period (FW3) */
router.get('/bank-rec/by-period', (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const list = listBankRecByPeriod({ periodLabel, limit });
    res.json({ resolutions: list });
  } catch (e) {
    res.status(500).json({
      error: 'List bank rec by period failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/pipelines/bank-rec/suggest-adjustments — Agentic: suggest adjustments for unmatched items */
router.post('/bank-rec/suggest-adjustments', async (req: Request, res: Response) => {
  try {
    const body = req.body as { unmatchedStatement?: unknown[]; unmatchedGL?: unknown[] };
    if (!Array.isArray(body?.unmatchedStatement) || !Array.isArray(body?.unmatchedGL)) {
      res.status(400).json({ error: 'unmatchedStatement and unmatchedGL arrays required' });
      return;
    }
    type BankStatementLine = import('../services/bank_reconciliation_service.js').BankStatementLine;
    type GLCashEntry = import('../services/bank_reconciliation_service.js').GLCashEntry;
    const result = await suggestReconciliationAdjustmentAgentic({
      unmatchedStatement: body.unmatchedStatement as BankStatementLine[],
      unmatchedGL: body.unmatchedGL as GLCashEntry[],
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Suggest adjustments failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/pipelines/bank-rec/explain — Agentic narrative for an existing bank rec result */
router.post('/bank-rec/explain', async (req: Request, res: Response) => {
  try {
    const result = req.body as import('../services/bank_reconciliation_service.js').BankRecResult;
    if (!result || typeof result.reconciled !== 'boolean') {
      res.status(400).json({ error: 'Missing or invalid bank rec result' });
      return;
    }
    const narrative = await explainBankRecAgentic(result);
    res.json({ narrative });
  } catch (e) {
    res.status(500).json({
      error: 'Bank rec explain failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/pipelines/cash-position — Cash position (actual by account + optional forecast) */
router.post('/cash-position', (req: Request, res: Response) => {
  try {
    const body = req.body as import('../services/cash_position_service.js').CashPositionInput;
    if (!body?.accounts || !Array.isArray(body.accounts)) {
      res.status(400).json({ error: 'Missing accounts array' });
      return;
    }
    const result = buildCashPosition(body);
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Cash position failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
