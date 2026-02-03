'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { listLockedPeriods } from '@/lib/apiAuth';
import { Button } from '@/components/ui/button';

export default function ValuationPage() {
  const searchParams = useSearchParams();
  const [closedPeriods, setClosedPeriods] = React.useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const locks = await listLockedPeriods();
        if (cancelled) return;
        setClosedPeriods(locks.map((l) => l.periodLabel));
        const q = searchParams.get('period');
        if (q && locks.some((l) => l.periodLabel === q)) setSelectedPeriod(q);
        else if (locks.length) setSelectedPeriod(locks[0].periodLabel);
      } catch {
        if (!cancelled) {
          setClosedPeriods(['2024-12']);
          setSelectedPeriod('2024-12');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [searchParams]);

  const handleRunDcf = () => {
    if (!selectedPeriod) return;
    window.location.href = `/valuation/${encodeURIComponent(selectedPeriod)}/dcf`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Valuation
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Run DCF for closed periods
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="period" className="block text-sm font-medium text-muted-foreground">
              Period
            </label>
            <select
              id="period"
              value={selectedPeriod ?? ''}
              onChange={(e) => setSelectedPeriod(e.target.value || null)}
              className="mt-1.5 w-full max-w-xs rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select period</option>
              {closedPeriods.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Available for closed periods only
            </p>
          </div>
          <Button onClick={handleRunDcf} disabled={!selectedPeriod}>
            Run DCF
          </Button>
        </div>
      )}
    </div>
  );
}
