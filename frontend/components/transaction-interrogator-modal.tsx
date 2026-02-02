'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fetchDrillDown } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface DrillDownTransaction {
  description?: string;
  amount?: string;
  counterparty?: string;
  date?: string;
  account_name?: string;
  account_code?: string;
}

interface TransactionInterrogatorModalProps {
  open: boolean;
  onClose: () => void;
  lineItemLabel: string;
  accountCode?: string;
  className?: string;
}

export function TransactionInterrogatorModal({
  open,
  onClose,
  lineItemLabel,
  accountCode,
  className,
}: TransactionInterrogatorModalProps) {
  const [transactions, setTransactions] = React.useState<DrillDownTransaction[]>([]);
  const [justification, setJustification] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !lineItemLabel) return;
    setLoading(true);
    setError(null);
    fetchDrillDown(lineItemLabel, accountCode)
      .then((data) => {
        setTransactions(data.transactions ?? []);
        setJustification(data.justification ?? '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load drill-down.'))
      .finally(() => setLoading(false));
  }, [open, lineItemLabel, accountCode]);

  const formatAmount = (v: string | undefined) => {
    if (v == null || v === '') return '—';
    const n = parseFloat(String(v).replace(/,/g, ''));
    if (Number.isNaN(n)) return v;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  };

  if (!open) return null;

  return (
    <div
      className={cn('fixed inset-0 z-50 flex items-center justify-center p-4', className)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drill-down-title"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        aria-hidden
      />
      <Card className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
          <CardTitle id="drill-down-title" className="text-lg">
            Transaction Interrogator — {lineItemLabel}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden flex flex-col gap-4 pt-4">
          {loading && (
            <p className="text-sm text-muted-foreground">Loading transactions and justification…</p>
          )}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {!loading && !error && (
            <>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">CPA Agent — Categorization logic</p>
                <p className="text-sm leading-relaxed rounded-md border bg-muted/30 p-3">
                  {justification || 'No justification available.'}
                </p>
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Transactions tagged to this category ({transactions.length})
                </p>
                <ScrollArea className="flex-1 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[140px]">Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-6">
                            No transaction detail for this line. Upload source data (bank/GL export) via ingestion to see drill-down.
                          </TableCell>
                        </TableRow>
                      ) : (
                        transactions.map((tx, i) => (
                          <TableRow key={`${tx.description}-${i}`}>
                            <TableCell className="text-muted-foreground text-sm">
                              {tx.date ?? '—'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {tx.description ?? tx.counterparty ?? '—'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm">
                              {formatAmount(tx.amount)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
