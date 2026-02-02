'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  GlobalControllerView,
  type SubsidiaryEntity,
  type ConsolidationResultData,
  type EntityVariance,
} from '@/components/consolidation';
import { consolidationRollup } from '@/lib/api';

const SAMPLE_SUBSIDIARIES: SubsidiaryEntity[] = [
  { entity_id: 'sub-us', entity_name: 'Subsidiary US', functional_currency: 'USD' },
  { entity_id: 'sub-eu', entity_name: 'Subsidiary EU', functional_currency: 'EUR' },
  { entity_id: 'sub-uk', entity_name: 'Subsidiary UK', functional_currency: 'GBP' },
];

const SAMPLE_CONSOLIDATION: ConsolidationResultData = {
  report_date: new Date().toISOString().slice(0, 10),
  reporting_currency: 'USD',
  consolidated_balance_sheet: {
    report_date: new Date().toISOString().slice(0, 10),
    assets: [
      { label: 'Cash and equivalents', amount: 1250000, account_code: '1000' },
      { label: 'Accounts receivable', amount: 840000, account_code: '1100' },
      { label: 'Inventory', amount: 620000, account_code: '1200' },
      { label: 'Property, plant & equipment', amount: 2100000, account_code: '1500' },
    ],
    liabilities: [
      { label: 'Accounts payable', amount: 450000, account_code: '2000' },
      { label: 'Accrued expenses', amount: 220000, account_code: '2100' },
      { label: 'Long-term debt', amount: 1250000, account_code: '2500' },
    ],
    equity: [
      { label: 'Common stock', amount: 1000000, account_code: '3000' },
      { label: 'Retained earnings', amount: 1840000, account_code: '3200' },
      { label: 'Noncontrolling interest', amount: 120000, account_code: '3300' },
    ],
    total_assets: 4810000,
    total_liabilities: 1920000,
    total_equity: 2960000,
  },
  eliminations_applied: [
    { description: 'Intercompany receivable/payable', debit_account: '2100', credit_account: '1100', amount: 85000, entity_debit: 'sub-eu', entity_credit: 'sub-us' },
  ],
  minority_interest: [{ subsidiary_entity_id: 'sub-eu', subsidiary_name: 'Subsidiary EU', amount: 120000, description: 'Noncontrolling interest' }],
  total_minority_interest: 120000,
  intercompany_netted: true,
};

/** Sample variance: entities +/- 15% off-budget (calm design highlights) */
const SAMPLE_VARIANCES: EntityVariance[] = [
  { entity_id: 'sub-us', entity_name: 'Subsidiary US', metric_label: 'Revenue', actual: 1150000, budget: 1000000, variance_pct: 15, is_over_15: true },
  { entity_id: 'sub-eu', entity_name: 'Subsidiary EU', metric_label: 'Operating expense', actual: 920000, budget: 1000000, variance_pct: -8, is_over_15: false },
  { entity_id: 'sub-uk', entity_name: 'Subsidiary UK', metric_label: 'Revenue', actual: 780000, budget: 1000000, variance_pct: -22, is_over_15: true },
];

export default function ConsolidationPage() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<ConsolidationResultData | null>(SAMPLE_CONSOLIDATION);
  const [subsidiaries, setSubsidiaries] = React.useState<SubsidiaryEntity[]>(SAMPLE_SUBSIDIARIES);

  const loadFromApi = async () => {
    setLoading(true);
    setError(null);
    try {
      const reportDate = new Date().toISOString().slice(0, 10);
      const payload = {
        reporting_currency: 'USD',
        report_date: reportDate,
        fx_rates_to_reporting: { EUR: 1.08, GBP: 1.27 },
        subsidiaries: subsidiaries.map((s) => ({
          entity_id: s.entity_id,
          entity_name: s.entity_name,
          functional_currency: s.functional_currency,
          report_date: reportDate,
          lines: [
            { account_code: '1000', account_name: 'Cash', debit: 100000, credit: 0, account_type: 'ASSET' },
            { account_code: '1100', account_name: 'Receivables', debit: 50000, credit: 0, account_type: 'ASSET' },
            { account_code: '2000', account_name: 'Payables', debit: 0, credit: 30000, account_type: 'LIABILITY' },
            { account_code: '3000', account_name: 'Equity', debit: 0, credit: 120000, account_type: 'EQUITY' },
          ],
        })),
        intercompany_pairs: [
          { entity_receivable: 'sub-us', entity_payable: 'sub-eu', receivable_account_code: '1100', payable_account_code: '2100' },
        ],
      };
      const result = await consolidationRollup(payload);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Consolidation rollup failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Global Controller</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Entity map, Before/After eliminations, variance vs. budget (±15%)
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {data && (
          <GlobalControllerView
            parentName="Consolidated Group"
            reportingCurrency={data.reporting_currency}
            subsidiaries={subsidiaries}
            consolidationWithEliminations={data}
            consolidationWithoutEliminations={undefined}
            variances={SAMPLE_VARIANCES}
            varianceThresholdPct={15}
          />
        )}
        <div className="mt-4">
          <button
            type="button"
            onClick={loadFromApi}
            disabled={loading}
            className="rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            {loading ? 'Loading…' : 'Load from API (rollup)'}
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            By default, sample data is shown. Use &quot;Load from API&quot; when the Python backend is running.
          </p>
        </div>
      </main>
    </div>
  );
}
