'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { listPeriods, type ClosePeriod, type CloseStage } from '@/lib/apiAuth';
import { getPeriodType } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function stageLabel(stage: CloseStage | undefined, tbSource?: 'uploaded' | 'synced'): string {
  if (!stage) return '—';
  switch (stage) {
    case 'no_tb':
      return 'No TB';
    case 'unadjusted_in':
      return tbSource === 'synced' ? 'Unadjusted in (synced)' : 'Unadjusted in (uploaded)';
    case 'adjustments':
      return 'Adjustments';
    case 'ready_to_close':
      return 'Ready to close';
    case 'closed':
      return 'Closed';
    default:
      return stage;
  }
}

const CURRENT_YEAR = new Date().getFullYear();

export default function MonthEndClosePage() {
  const router = useRouter();
  const [periods, setPeriods] = React.useState<ClosePeriod[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [periodFilter, setPeriodFilter] = React.useState<'all' | 'monthly' | 'quarterly' | 'annual'>('all');
  const [addModalOpen, setAddModalOpen] = React.useState(false);
  const [addType, setAddType] = React.useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const [addMonth, setAddMonth] = React.useState(`${CURRENT_YEAR}-01`);
  const [addQuarter, setAddQuarter] = React.useState(`${CURRENT_YEAR}-Q1`);
  const [addYear, setAddYear] = React.useState(String(CURRENT_YEAR));
  const [adding, setAdding] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = await listPeriods();
      const fallback = [{ periodLabel: '2025-01' }, { periodLabel: '2024-12' }];
      setPeriods(list.length ? list : fallback);
    } catch {
      setPeriods([{ periodLabel: '2025-01' }, { periodLabel: '2024-12' }]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      await load();
      if (cancelled) return;
    }
    run();
    return () => { cancelled = true; };
  }, [load]);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisible = () => load();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') onVisible();
    };
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) onVisible();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [load]);

  const filteredPeriods = React.useMemo(() => {
    if (periodFilter === 'all') return periods;
    return periods.filter((p) => getPeriodType(p.periodLabel) === periodFilter);
  }, [periods, periodFilter]);

  const sortedPeriods = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return [...filteredPeriods].sort((a, b) => {
      const aDue = a.closeDueDate ? new Date(a.closeDueDate).getTime() : null;
      const bDue = b.closeDueDate ? new Date(b.closeDueDate).getTime() : null;
      const todayMs = today.getTime();
      if (aDue != null && bDue != null) {
        const aOverdue = aDue < todayMs ? 1 : 0;
        const bOverdue = bDue < todayMs ? 1 : 0;
        if (aOverdue !== bOverdue) return aOverdue - bOverdue;
        return aDue - bDue;
      }
      if (aDue != null) return -1;
      if (bDue != null) return 1;
      return a.periodLabel.localeCompare(b.periodLabel);
    });
  }, [filteredPeriods]);

  const closed = (p: ClosePeriod) => p.status === 'locked' || p.closeStage === 'closed';

  const isAtRisk = (p: ClosePeriod) => {
    if (!p.closeDueDate) return false;
    const due = new Date(p.closeDueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays < 0 || diffDays <= 7;
  };

  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const handleAddPeriod = async () => {
    const label =
      addType === 'monthly' ? addMonth : addType === 'quarterly' ? addQuarter : addYear;
    if (!label) return;
    setAdding(true);
    try {
      const list = await listPeriods([label]);
      setPeriods((prev) => {
        if (prev.some((p) => p.periodLabel === label)) return prev;
        const entry = list[0] ?? { periodLabel: label, status: 'open' };
        return [...prev, entry].sort((a, b) => a.periodLabel.localeCompare(b.periodLabel));
      });
      setAddModalOpen(false);
      router.push(`/close/${encodeURIComponent(label)}`);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Close</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage monthly, quarterly, and annual close. Select a period to manage close tasks and close the period.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild size="sm" variant="outline">
          <Link href={`/close/${encodeURIComponent(currentMonth)}`}>Current: {currentMonth}</Link>
        </Button>
        <label htmlFor="period-filter" className="text-sm text-muted-foreground">Show:</label>
        <select
          id="period-filter"
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value as typeof periodFilter)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          <option value="all">All</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="annual">Annual</option>
        </select>
        <Button onClick={() => setAddModalOpen(true)} variant="outline" size="sm">
          Add period
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/close/templates">Checklist templates</Link>
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading periods…</p>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Close due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPeriods.map((p) => {
                const atRisk = isAtRisk(p);
                const dueDate = p.closeDueDate;
                const due = dueDate ? new Date(dueDate) : null;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const diffDays = due ? Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
                const dueBadge = diffDays != null && diffDays < 0 ? 'Overdue' : diffDays != null && diffDays <= 7 ? `Due in ${diffDays}d` : null;
                return (
                  <TableRow key={p.periodLabel} className={atRisk ? 'close-at-risk-row border-l-4' : undefined}>
                    <TableCell className="font-medium">{p.periodLabel}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {dueDate ?? '—'}
                      {dueBadge && (
                        <Badge variant={diffDays != null && diffDays < 0 ? 'destructive' : 'secondary'} className="ml-1.5 text-xs">
                          {dueBadge}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={closed(p) ? 'success' : 'secondary'}>
                        {closed(p) ? 'Closed' : 'Open'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {stageLabel(p.closeStage, p.tbSource)}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.closeStage === 'no_tb' ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href="/dashboard">Get TB</Link>
                        </Button>
                      ) : (
                        <Button asChild size="sm" variant={closed(p) ? 'outline' : 'default'}>
                          <Link href={`/close/${encodeURIComponent(p.periodLabel)}`}>
                            {closed(p) ? 'View' : 'Open'}
                          </Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {addModalOpen && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Add period</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setAddModalOpen(false)}>Close</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Type</label>
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value as 'monthly' | 'quarterly' | 'annual')}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                <option value="monthly">Month</option>
                <option value="quarterly">Quarter</option>
                <option value="annual">Year</option>
              </select>
            </div>
            {addType === 'monthly' && (
              <div>
                <label className="text-sm font-medium text-foreground">Month (YYYY-MM)</label>
                <Input
                  type="month"
                  value={addMonth}
                  onChange={(e) => setAddMonth(e.target.value || `${CURRENT_YEAR}-01`)}
                  className="mt-1"
                />
              </div>
            )}
            {addType === 'quarterly' && (
              <div>
                <label className="text-sm font-medium text-foreground">Quarter</label>
                <select
                  value={addQuarter}
                  onChange={(e) => setAddQuarter(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  {[1, 2, 3, 4].map((q) => (
                    <option key={q} value={`${CURRENT_YEAR}-Q${q}`}>{CURRENT_YEAR}-Q{q}</option>
                  ))}
                </select>
              </div>
            )}
            {addType === 'annual' && (
              <div>
                <label className="text-sm font-medium text-foreground">Year</label>
                <Input
                  type="number"
                  min={2020}
                  max={2030}
                  value={addYear}
                  onChange={(e) => setAddYear(e.target.value || String(CURRENT_YEAR))}
                  className="mt-1"
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancel</Button>
              <Button onClick={handleAddPeriod} disabled={adding}>
                {adding ? 'Adding…' : 'Add and open'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
