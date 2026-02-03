'use client';

import * as React from 'react';
import Link from 'next/link';
import { getAuditReconciliationSummary } from '@/lib/apiAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AuditReconciliationSummaryPage() {
  const [data, setData] = React.useState<unknown | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const out = await getAuditReconciliationSummary();
        if (!cancelled) setData(out);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load reconciliation summary');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">Overview</Link>
        <span>/</span>
        <span className="font-medium text-foreground">Reconciliation summary</span>
      </nav>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reconciliation summary</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          TB balance, BS balance, CF tie, equity tie, and failed checks
        </p>
      </div>
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}
      {!loading && !error && data != null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="rounded-md border border-border bg-muted/30 p-4 text-xs overflow-auto max-h-[70vh]">
              {JSON.stringify(data, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
      <Button asChild variant="outline">
        <Link href="/dashboard">Back to Overview</Link>
      </Button>
    </div>
  );
}
