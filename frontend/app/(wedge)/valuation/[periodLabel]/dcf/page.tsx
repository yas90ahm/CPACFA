'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { runDcf } from '@/lib/apiAuth';
import { Button } from '@/components/ui/button';

function formatDcfSummary(result: Record<string, unknown>): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const prefer = ['enterpriseValue', 'equityValue', 'wacc', 'terminalGrowthRate', 'npv'];
  for (const key of prefer) {
    const v = result[key];
    if (v !== undefined && v !== null) {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
      rows.push({ label, value: typeof v === 'number' ? String(v) : String(v) });
    }
  }
  if (rows.length === 0 && typeof result === 'object') {
    for (const [k, v] of Object.entries(result)) {
      if (v !== undefined && v !== null && typeof v !== 'object') {
        const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
        rows.push({ label, value: String(v) });
      }
    }
  }
  return rows.slice(0, 10);
}

export default function DcfPage() {
  const params = useParams();
  const periodLabel = typeof params.periodLabel === 'string' ? params.periodLabel : '';
  const [result, setResult] = React.useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleRun = async () => {
    if (!periodLabel) return;
    setLoading(true);
    setError(null);
    try {
      const res = await runDcf(periodLabel, {});
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DCF run failed');
    } finally {
      setLoading(false);
    }
  };

  const summary = result ? formatDcfSummary(result) : [];

  return (
    <div className="space-y-6">
      <div>
        <nav className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/valuation" className="hover:text-foreground">Valuation</Link>
          <span>/</span>
          <span className="font-medium text-foreground">{periodLabel}</span>
          <span>/</span>
          <span className="text-muted-foreground">DCF</span>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          DCF — {periodLabel}
        </h1>
      </div>

      <div className="space-y-4">
        <Button onClick={handleRun} disabled={loading}>
          {loading ? 'Running…' : 'Run DCF'}
        </Button>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        {result && (
          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium text-foreground">Result</h2>
            </div>
            <div className="p-4">
              {summary.length > 0 ? (
                <dl className="grid gap-2 sm:grid-cols-2">
                  {summary.map(({ label, value }) => (
                    <div key={label} className="flex justify-between gap-4 text-sm sm:flex-col sm:gap-0">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">No summary fields returned.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
