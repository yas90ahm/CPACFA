/**
 * CFA Analyst API — Audit, DCF, Liquidity, Pointed Questions.
 * POST /api/cfa/audit, /api/cfa/liquidity, /api/cfa/dcf, /api/cfa/sensitivity, /api/cfa/question, /api/cfa/regression
 */

import { Router, type Request, type Response } from 'express';
import {
  perform_audit_check,
  dcfValue,
  sensitivityAnalysis,
  assessLiquidityRisk,
  answerPointedQuestion,
  runRegression,
  hasPythonTool,
} from '../services/analysis_agent.js';
import { runProactiveAdvice } from '../services/proactive_advice.js';
import type { AuditEntry, LiquidityInputs, DCFInputs } from '../types/analysis.js';

const router = Router();

/**
 * POST /api/cfa/audit
 * Body: { entries: AuditEntry[], options?: { yoyThresholdPercent?, benfordFlagThreshold? } }
 */
router.post('/audit', (req: Request, res: Response) => {
  try {
    const body = req.body as { entries?: AuditEntry[]; options?: { yoyThresholdPercent?: number; benfordFlagThreshold?: number } };
    const entries = body?.entries ?? [];
    if (entries.length === 0) {
      res.status(400).json({ error: 'Missing or empty "entries" array' });
      return;
    }
    const result = perform_audit_check(entries, body?.options);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Audit check failed';
    res.status(400).json({ error: 'Audit error', message });
  }
});

/**
 * POST /api/cfa/liquidity
 * Body: LiquidityInputs (currentAssets, inventory, currentLiabilities, revenue, accountsReceivable, accountsPayable, ...)
 */
router.post('/liquidity', (req: Request, res: Response) => {
  try {
    const inputs = req.body as LiquidityInputs;
    if (
      inputs.currentAssets == null ||
      inputs.currentLiabilities == null ||
      inputs.revenue == null ||
      inputs.accountsReceivable == null ||
      inputs.accountsPayable == null
    ) {
      res.status(400).json({
        error: 'Missing required fields: currentAssets, currentLiabilities, revenue, accountsReceivable, accountsPayable',
      });
      return;
    }
    if (inputs.inventory == null) inputs.inventory = 0;
    const assessment = assessLiquidityRisk(inputs);
    res.json(assessment);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Liquidity assessment failed';
    res.status(400).json({ error: 'Liquidity error', message });
  }
});

/**
 * POST /api/cfa/dcf
 * Body: DCFInputs (freeCashFlows[], wacc, terminalGrowthRate)
 */
router.post('/dcf', (req: Request, res: Response) => {
  try {
    const inputs = req.body as DCFInputs;
    if (
      !Array.isArray(inputs.freeCashFlows) ||
      inputs.wacc == null ||
      inputs.terminalGrowthRate == null
    ) {
      res.status(400).json({
        error: 'Missing required fields: freeCashFlows (array), wacc, terminalGrowthRate',
      });
      return;
    }
    const result = dcfValue(inputs);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'DCF failed';
    res.status(400).json({ error: 'DCF error', message });
  }
});

/**
 * POST /api/cfa/sensitivity
 * Body: DCFInputs + { waccRange?: { min, max, steps }, growthRange?: { min, max, steps } }
 */
router.post('/sensitivity', (req: Request, res: Response) => {
  try {
    const body = req.body as DCFInputs & {
      waccRange?: { min: number; max: number; steps: number };
      growthRange?: { min: number; max: number; steps: number };
    };
    const { waccRange, growthRange, ...dcfInputs } = body;
    if (
      !Array.isArray(dcfInputs.freeCashFlows) ||
      dcfInputs.wacc == null ||
      dcfInputs.terminalGrowthRate == null
    ) {
      res.status(400).json({
        error: 'Missing required DCF fields: freeCashFlows, wacc, terminalGrowthRate',
      });
      return;
    }
    const result = sensitivityAnalysis(dcfInputs, { waccRange, growthRange });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sensitivity analysis failed';
    res.status(400).json({ error: 'Sensitivity error', message });
  }
});

/**
 * POST /api/cfa/question
 * Body: { question: string, context?: { liquidityInputs?, auditEntries?, dcfInputs? } }
 * E.g. "Assess the liquidity risk" with liquidityInputs → Current Ratio, Quick Ratio, CCC + CFA summary.
 */
router.post('/question', (req: Request, res: Response) => {
  try {
    const body = req.body as { question?: string; context?: Parameters<typeof answerPointedQuestion>[1] };
    const question = (body?.question ?? '').trim();
    if (!question) {
      res.status(400).json({ error: 'Missing "question" in body' });
      return;
    }
    const context = body?.context ?? {};
    const result = answerPointedQuestion(question, context);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Question handling failed';
    res.status(400).json({ error: 'Question error', message });
  }
});

/**
 * POST /api/cfa/regression
 * Body: { x: number[], y: number[] }
 * Runs OLS regression; uses Python/MCP if available for complex stats.
 */
router.post('/regression', async (req: Request, res: Response) => {
  try {
    const body = req.body as { x?: number[]; y?: number[] };
    const x = body?.x ?? [];
    const y = body?.y ?? [];
    if (x.length !== y.length || x.length < 2) {
      res.status(400).json({ error: 'Provide equal-length arrays x and y with at least 2 points' });
      return;
    }
    const result = await runRegression(x, y);
    res.json({ ...result, pythonToolUsed: hasPythonTool() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Regression failed';
    res.status(400).json({ error: 'Regression error', message });
  }
});

/**
 * GET /api/cfa/tools
 * Returns whether Python/MCP interpreter is available for regressions.
 */
router.get('/tools', (_req: Request, res: Response) => {
  res.json({ pythonInterpreterAvailable: hasPythonTool() });
});

/**
 * POST /api/cfa/proactive-advice
 * Proactive Advice for individuals/SMEs: Tax Planning, Cash Buffer (Survival Metric + Ideal Reserve), Spending Anomaly (Top 3 outliers).
 * Body: { cash, monthlyBurn, taxLiability?, revenue?, netIncome?, expensesThisMonth?: { label, amount }[], expensesPriorMonth?: { label, amount }[], idealReserveMonths? }
 */
router.post('/proactive-advice', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      cash?: number;
      monthlyBurn?: number;
      taxLiability?: number;
      revenue?: number;
      netIncome?: number;
      expensesThisMonth?: { label: string; amount: number }[];
      expensesPriorMonth?: { label: string; amount: number }[];
      idealReserveMonths?: number;
    };
    const cash = Number(body?.cash ?? 0);
    const monthlyBurn = Number(body?.monthlyBurn ?? 0);
    if (cash < 0 || monthlyBurn < 0) {
      res.status(400).json({
        error: 'Provide non-negative cash and monthlyBurn',
      });
      return;
    }
    const result = runProactiveAdvice({
      cash,
      monthlyBurn,
      taxLiability: body?.taxLiability,
      revenue: body?.revenue,
      netIncome: body?.netIncome,
      expensesThisMonth: body?.expensesThisMonth,
      expensesPriorMonth: body?.expensesPriorMonth,
      idealReserveMonths: body?.idealReserveMonths,
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Proactive advice failed';
    res.status(400).json({ error: 'Proactive advice error', message });
  }
});

export default router;
