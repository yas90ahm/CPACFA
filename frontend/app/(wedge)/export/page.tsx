'use client';

import * as React from 'react';
import { listLockedPeriods, exportPdf } from '@/lib/apiAuth';
import { Button } from '@/components/ui/button';

export default function ReportsPage() {
  const [closedPeriods, setClosedPeriods] = React.useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const locks = await listLockedPeriods();
        if (cancelled) return;
        setClosedPeriods(locks.map((l) => l.periodLabel));
        if (locks.length) setSelectedPeriod(locks[0].periodLabel);
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
  }, []);

  const handleDownloadPdf = async () => {
    if (!selectedPeriod) return;
    setExporting(true);
    setError(null);
    try {
      const blob = await exportPdf(selectedPeriod);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `financials-${selectedPeriod}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      setError(
        msg.toLowerCase().includes('conflict')
          ? 'Complete review items for this period before generating the report.'
          : msg
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Reports
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Export financials for closed periods
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
          </div>
          <Button onClick={handleDownloadPdf} disabled={!selectedPeriod || exporting}>
            {exporting ? 'Exporting…' : 'Download PDF'}
          </Button>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
