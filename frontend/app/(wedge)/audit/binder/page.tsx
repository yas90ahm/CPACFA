'use client';

import * as React from 'react';
import Link from 'next/link';
import { getAuditBinder } from '@/lib/apiAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function formatAmount(n: number): string {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

type BinderData = {
  entityName?: string;
  periodStart?: string;
  periodEnd?: string;
  generatedAt?: string;
  balanceSheetBundle?: {
    statement?: { assets?: { label: string; amount: number }[]; liabilities?: { label: string; amount: number }[]; equity?: { label: string; amount: number }[]; totalAssets?: number; totalLiabilities?: number; totalEquity?: number };
  };
  profitAndLossBundle?: {
    statement?: { revenue?: { label: string; amount: number }[]; expenses?: { label: string; amount: number }[]; totalRevenue?: number; totalExpenses?: number; netIncome?: number };
  };
  cleanLedger?: { account_code?: string; account_name: string; debit: number; credit: number; account_type?: string }[];
};

function renderLines(lines: { label: string; amount: number }[] | undefined): React.ReactNode {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  return lines.map((line, i) => (
    <TableRow key={i}>
      <TableCell className="font-medium">{line.label}</TableCell>
      <TableCell className="text-right">{formatAmount(line.amount)}</TableCell>
    </TableRow>
  ));
}

export default function AuditBinderPage() {
  const [data, setData] = React.useState<BinderData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const out = await getAuditBinder();
        if (!cancelled) setData(out);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load audit binder');
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
        <span className="font-medium text-foreground">Audit binder</span>
      </nav>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Audit binder</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Statements, justification chain, and line-level deep links
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
      {!loading && !error && data != null && (() => {
        const bs = data.balanceSheetBundle?.statement;
        const pl = data.profitAndLossBundle?.statement;
        const cleanLedger = Array.isArray(data.cleanLedger) ? data.cleanLedger : [];
        return (
          <div className="space-y-6">
            {(data.entityName || data.periodStart || data.periodEnd) && (
              <p className="text-sm text-muted-foreground">
                {data.entityName && <span className="font-medium text-foreground">{data.entityName}</span>}
                {data.periodStart && data.periodEnd && (
                  <span className="ml-2">Period: {data.periodStart} to {data.periodEnd}</span>
                )}
                {data.generatedAt && <span className="ml-2">Generated: {new Date(data.generatedAt).toLocaleString()}</span>}
              </p>
            )}
            {bs && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Balance Sheet</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Line</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {renderLines(bs.assets)}
                        {bs.totalAssets != null && (
                          <TableRow className="bg-muted/30">
                            <TableCell className="font-medium">Total assets</TableCell>
                            <TableCell className="text-right">{formatAmount(bs.totalAssets)}</TableCell>
                          </TableRow>
                        )}
                        {renderLines(bs.liabilities)}
                        {bs.totalLiabilities != null && (
                          <TableRow className="bg-muted/30">
                            <TableCell className="font-medium">Total liabilities</TableCell>
                            <TableCell className="text-right">{formatAmount(bs.totalLiabilities)}</TableCell>
                          </TableRow>
                        )}
                        {renderLines(bs.equity)}
                        {bs.totalEquity != null && (
                          <TableRow className="bg-muted/30">
                            <TableCell className="font-medium">Total equity</TableCell>
                            <TableCell className="text-right">{formatAmount(bs.totalEquity)}</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
            {pl && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Profit &amp; Loss</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Line</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {renderLines(pl.revenue)}
                        {pl.totalRevenue != null && (
                          <TableRow className="bg-muted/30">
                            <TableCell className="font-medium">Total revenue</TableCell>
                            <TableCell className="text-right">{formatAmount(pl.totalRevenue)}</TableCell>
                          </TableRow>
                        )}
                        {renderLines(pl.expenses)}
                        {pl.totalExpenses != null && (
                          <TableRow className="bg-muted/30">
                            <TableCell className="font-medium">Total expenses</TableCell>
                            <TableCell className="text-right">{formatAmount(pl.totalExpenses)}</TableCell>
                          </TableRow>
                        )}
                        {pl.netIncome != null && (
                          <TableRow className="bg-muted/50">
                            <TableCell className="font-medium">Net income</TableCell>
                            <TableCell className="text-right">{formatAmount(pl.netIncome)}</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
            {cleanLedger.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Clean Ledger (Trial Balance)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Debit</TableHead>
                          <TableHead className="text-right">Credit</TableHead>
                          <TableHead>Type</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cleanLedger.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{row.account_name}</TableCell>
                            <TableCell className="text-right">{formatAmount(row.debit)}</TableCell>
                            <TableCell className="text-right">{formatAmount(row.credit)}</TableCell>
                            <TableCell className="text-muted-foreground">{row.account_type ?? '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
            {!bs && !pl && cleanLedger.length === 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">No statement data in binder. Upload a trial balance and generate statements first.</p>
                </CardContent>
              </Card>
            )}
          </div>
        );
      })()}
      <Button asChild variant="outline">
        <Link href="/dashboard">Back to Overview</Link>
      </Button>
    </div>
  );
}
