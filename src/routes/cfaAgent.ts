/**
 * Investment Analysis Agent API: DuPont, Competitor Benchmarking, Monte Carlo, Skepticism.
 */

import { Router, type Request, type Response } from 'express';
import { runInvestmentAnalysis } from '../agents/cfa/index.js';
import type { AccountWithGrowth } from '../agents/cfa/skepticism.js';

const router = Router();

/**
 * POST /api/agents/cfa/analyze
 * Body: InvestmentAnalysisInput + optional webSearchResult (string from Web Search tool for competitor).
 * Returns: DuPont, competitor valuation (P/E, EV/EBITDA), Monte Carlo liquidity CI, Skepticism red flags.
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      netIncome?: number;
      revenue?: number;
      totalAssets?: number;
      shareholdersEquity?: number;
      currentLiquidity?: number;
      expectedGrowthRate?: number;
      volatility?: number;
      accounts?: AccountWithGrowth[];
      revenueGrowthPercent?: number;
      competitorTicker?: string;
      webSearchResult?: string;
    };

    const webSearch = body.webSearchResult != null
      ? async () => body.webSearchResult as string
      : undefined;

    const output = await runInvestmentAnalysis({
      netIncome: body.netIncome,
      revenue: body.revenue,
      totalAssets: body.totalAssets,
      shareholdersEquity: body.shareholdersEquity,
      currentLiquidity: body.currentLiquidity,
      expectedGrowthRate: body.expectedGrowthRate,
      volatility: body.volatility,
      accounts: body.accounts,
      revenueGrowthPercent: body.revenueGrowthPercent,
      competitorTicker: body.competitorTicker,
      webSearch: body.competitorTicker && webSearch ? webSearch : undefined,
    });

    res.json(output);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Investment analysis failed';
    res.status(500).json({ error: 'Analysis error', message });
  }
});

export default router;
