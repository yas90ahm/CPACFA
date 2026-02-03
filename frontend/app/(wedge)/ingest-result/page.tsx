'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { IngestResult as IngestResultType } from '@/lib/ingest-types';

const INGEST_RESULT_KEY = 'finos-ingest-result';

function formatAmount(n: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function IngestResultPage() {
  const [data, setData] = React.useState<{
    result: IngestResultType;
    periodLabel: string | null;
  } | null>(null);

  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(INGEST_RESULT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { result: IngestResultType; periodLabel: string | null };
      if (parsed?.result) {
        setData({ result: parsed.result, periodLabel: parsed.periodLabel ?? null });
        sessionStorage.removeItem(INGEST_RESULT_KEY);
      }
    } catch {
      // invalid or missing
    }
  }, []);

  if (!data) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">No result to show.</p>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to Overview</Link>
        </Button>
      </div>
    );
  }

  const { result, periodLabel } = data;
  const { balanceSheet, profitAndLoss, reasoningChain, qualityChecks, dataGaps, executiveMemo, audit, standard } = result;
  const sourceName = audit?.sourceDocumentName ?? 'Trial balance';

  return (
    <div className="space-y-6">
      <nav className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">Overview</Link>
        <span>/</span>
        <span className="font-medium text-foreground">Trial balance result</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Your trial balance for {periodLabel ?? 'this period'} is ready
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {standard && <span>{standard} · </span>}
          {sourceName}
        </p>
        {periodLabel && (
          <p className="mt-2 text-sm text-muted-foreground">
            Unadjusted trial balance saved for {periodLabel}. Statements below are from adjusted TB (no adjustments yet).
          </p>
        )}
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">Balance Sheet</h2>
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balanceSheet.assets.map((line, i) => (
                <TableRow key={`asset-${i}`}>
                  <TableCell className="font-medium">{line.label}</TableCell>
                  <TableCell className="text-right">{formatAmount(line.amount)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30">
                <TableCell className="font-medium">Total assets</TableCell>
                <TableCell className="text-right">{formatAmount(balanceSheet.totalAssets)}</TableCell>
              </TableRow>
              {balanceSheet.liabilities.map((line, i) => (
                <TableRow key={`liab-${i}`}>
                  <TableCell className="font-medium">{line.label}</TableCell>
                  <TableCell className="text-right">{formatAmount(line.amount)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30">
                <TableCell className="font-medium">Total liabilities</TableCell>
                <TableCell className="text-right">{formatAmount(balanceSheet.totalLiabilities)}</TableCell>
              </TableRow>
              {balanceSheet.equity.map((line, i) => (
                <TableRow key={`equity-${i}`}>
                  <TableCell className="font-medium">{line.label}</TableCell>
                  <TableCell className="text-right">{formatAmount(line.amount)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30">
                <TableCell className="font-medium">Total equity</TableCell>
                <TableCell className="text-right">{formatAmount(balanceSheet.totalEquity)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        {balanceSheet.balances !== undefined && (
          <p className="text-xs text-muted-foreground">
            Assets = Liabilities + Equity: {balanceSheet.balances ? 'Yes' : 'No'}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">Profit & Loss</h2>
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profitAndLoss.revenue.map((line, i) => (
                <TableRow key={`rev-${i}`}>
                  <TableCell className="font-medium">{line.label}</TableCell>
                  <TableCell className="text-right">{formatAmount(line.amount)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30">
                <TableCell className="font-medium">Total revenue</TableCell>
                <TableCell className="text-right">{formatAmount(profitAndLoss.totalRevenue)}</TableCell>
              </TableRow>
              {profitAndLoss.expenses.map((line, i) => (
                <TableRow key={`exp-${i}`}>
                  <TableCell className="font-medium">{line.label}</TableCell>
                  <TableCell className="text-right">{formatAmount(line.amount)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30">
                <TableCell className="font-medium">Total expenses</TableCell>
                <TableCell className="text-right">{formatAmount(profitAndLoss.totalExpenses)}</TableCell>
              </TableRow>
              <TableRow className="bg-muted/50">
                <TableCell className="font-semibold">Net income</TableCell>
                <TableCell className="text-right font-semibold">{formatAmount(profitAndLoss.netIncome)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      {reasoningChain && (
        <section className="space-y-2">
          <h2 className="text-lg font-medium text-foreground">Reasoning chain</h2>
          <Accordion type="single" defaultValue="reasoning">
            <AccordionItem value="reasoning">
              <AccordionTrigger value="reasoning">Plan & verification</AccordionTrigger>
              <AccordionContent value="reasoning">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="whitespace-pre-wrap">{reasoningChain.plan}</p>
                  {reasoningChain.verificationSummary && (
                    <p className="pt-2">{reasoningChain.verificationSummary}</p>
                  )}
                  {reasoningChain.verification?.checks?.length ? (
                    <ul className="list-disc pl-4 pt-1">
                      {reasoningChain.verification.checks.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
      )}

      {(qualityChecks?.length ?? 0) > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-foreground">Quality checks</h2>
          <div className="space-y-2">
            {qualityChecks!.map((q) => (
              <Card key={q.id}>
                <CardContent className="pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={q.severity === 'critical' ? 'destructive' : q.severity === 'warning' ? 'default' : 'secondary'}>
                      {q.severity}
                    </Badge>
                    <span className="font-medium text-foreground">{q.title}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{q.message}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {(dataGaps?.length ?? 0) > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-foreground">Data gaps</h2>
          <div className="space-y-2">
            {dataGaps!.map((g) => (
              <Card key={g.id}>
                <CardContent className="pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={g.urgency === 'high' ? 'destructive' : 'secondary'}>{g.urgency}</Badge>
                    <span className="font-medium text-foreground">{g.title}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{g.description}</p>
                  {g.suggestion && <p className="mt-1 text-sm text-muted-foreground">Suggestion: {g.suggestion}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {executiveMemo && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-foreground">Executive memo</h2>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{executiveMemo}</p>
            </CardContent>
          </Card>
        </section>
      )}

      {audit && (audit.binderUrl || audit.gaapConsistencyUrl || audit.reconciliationSummaryUrl || audit.todosUrl) && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-foreground">Audit links</h2>
          <div className="flex flex-wrap gap-2">
            {audit.binderUrl && (
              <Button asChild variant="outline" size="sm">
                <Link href="/audit/binder">Audit binder</Link>
              </Button>
            )}
            {audit.gaapConsistencyUrl && (
              <Button asChild variant="outline" size="sm">
                <Link href="/audit/gaap-consistency">GAAP consistency</Link>
              </Button>
            )}
            {audit.reconciliationSummaryUrl && (
              <Button asChild variant="outline" size="sm">
                <Link href="/audit/reconciliation-summary">Reconciliation summary</Link>
              </Button>
            )}
            {audit.todosUrl && (
              <Button asChild variant="outline" size="sm">
                <Link href="/audit/todos">To-dos</Link>
              </Button>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-wrap gap-3 pt-4">
        {periodLabel && (
          <Button asChild>
            <Link href={`/close/${encodeURIComponent(periodLabel)}`}>
              Continue to Month-End Close
            </Link>
          </Button>
        )}
        <Button asChild variant="secondary">
          <Link href="/export">Reports</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to Overview</Link>
        </Button>
      </section>
    </div>
  );
}
