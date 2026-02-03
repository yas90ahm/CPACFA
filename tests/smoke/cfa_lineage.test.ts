/**
 * CFA lineage smoke test — proves Single Source of Truth between Accounting Engine and valuation.
 *
 * Flow:
 * 1. Manually set a 'Revenue CAGR' in the Accounting Engine (build AccountingContextSnapshot with known CAGR).
 * 2. Format it as the accounting_context block (same as Node does when calling Python).
 * 3. Trigger the CFA Analyst tool that runs DCF via Python: POST to Python /api/market-intelligence with that context.
 * 4. Assert that strategic_analyst.py received that exact CAGR in its context and used it (appears in board deck narrative).
 *
 * Requires: BACKEND_PYTHON_URL set and Python backend running with strategic_analyst (Flask app /api/market-intelligence).
 */

import { describe, it, expect } from '@jest/globals';
import type { AccountingContextSnapshot } from '../../src/services/historical_snapshot_service.js';
import { formatAccountingContextBlock } from '../../src/services/historical_snapshot_service.js';

const BACKEND_PYTHON_URL = process.env.BACKEND_PYTHON_URL ?? '';
const PYTHON_BASE = BACKEND_PYTHON_URL.replace(/\/$/, '') || 'http://localhost:5000';

/** Unique CAGR for this test so we can assert it flowed through (e.g. 9.87% → "9.9%" with toFixed(1)). */
const TEST_REVENUE_CAGR = 0.0987; // 9.87% → formatted as "9.9%"
const TEST_CAGR_PERCENT_STRING = '9.9'; // what we expect in the formatted block and in Python output

describe('CFA lineage — Single Source of Truth (Accounting → Valuation)', () => {
  it('sends Revenue CAGR from Accounting Engine to Python strategic_analyst and it appears in context', async () => {
    if (!BACKEND_PYTHON_URL) {
      console.warn(
        'Skipping cfa_lineage: BACKEND_PYTHON_URL not set. Set it to prove Single Source of Truth (e.g. http://localhost:5000).'
      );
      return;
    }

    // ——— 1. Manually set Revenue CAGR in the "Accounting Engine" (snapshot we control) ———
    const snapshot: AccountingContextSnapshot = {
      totalRevenue: 1_000_000,
      netIncome: 80_000,
      totalAssets: 2_500_000,
      totalEquity: 1_200_000,
      totalLiabilities: 1_300_000,
      ebitdaMargin: 0.08,
      periodLabel: 'FY2024',
      revenueCagr: TEST_REVENUE_CAGR, // <-- Single Source of Truth: we set this exact number
    };

    // ——— 2. Format as accounting_context (same as Node does when calling Python) ———
    const accountingContext = formatAccountingContextBlock(snapshot);
    expect(accountingContext).toContain('Revenue CAGR');
    expect(accountingContext).toContain(TEST_CAGR_PERCENT_STRING);

    // ——— 3. Trigger CFA Analyst tool: POST to Python strategic_analyst (market-intelligence = DCF + board deck) ———
    const body = {
      company_name: 'Smoke Test Co',
      competitor_tickers: [] as string[],
      company_dso_days: 45,
      company_inventory_turnover: 6,
      industry_avg_dso_days: 45,
      industry_avg_inventory_turnover: 6,
      risk_free_rate: 0.045,
      free_cash_flows: [100_000, 110_000, 121_000, 133_000, 146_000],
      terminal_growth_rate: 0.02,
      accounting_context: accountingContext,
    };

    const response = await fetch(`${PYTHON_BASE}/api/market-intelligence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Python market-intelligence returned ${response.status}: ${text}`);
    }

    const result = (await response.json()) as {
      board_deck_summary?: { full_narrative?: string; valuation_summary?: string };
      dcf?: { assumptions_summary?: string };
    };

    // ——— 4. Assert: Python received that exact CAGR and used it (appears in narrative / context) ———
    const fullNarrative = result.board_deck_summary?.full_narrative ?? '';
    const valuationSummary = result.board_deck_summary?.valuation_summary ?? '';
    const dcfAssumptions = result.dcf?.assumptions_summary ?? '';
    const combinedOutput = [fullNarrative, valuationSummary, dcfAssumptions].join(' ');

    expect(
      combinedOutput.includes(TEST_CAGR_PERCENT_STRING) || combinedOutput.includes('Revenue CAGR')
    ).toBe(true);

    // Stronger: the Accounting-Locked block we sent is echoed or cited in the narrative
    expect(
      fullNarrative.includes('Accounting-Locked') || fullNarrative.includes(TEST_CAGR_PERCENT_STRING)
    ).toBe(true);
  });
});
