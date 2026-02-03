'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  listLockedPeriods,
  listPeriods,
  getConflicts,
  getCloseStatus,
  uploadTrialBalanceAuth,
  listConnections,
  syncTrialBalanceAuth,
  type ClosePeriod,
} from '@/lib/apiAuth';
import { getPeriodEndDate } from '@/lib/utils';
import { HeroCommandCenter } from '@/components/upload/hero-command-center';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/lib/auth-context';

const INGEST_RESULT_KEY = 'finos-ingest-result';

const REPORTING_STANDARDS = [
  { value: 'US_GAAP', label: 'US GAAP' },
  { value: 'IFRS', label: 'IFRS' },
  { value: 'ASPE', label: 'ASPE' },
  { value: 'FRS102', label: 'FRS 102' },
] as const;

export default function OverviewPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const [periodStatus, setPeriodStatus] = React.useState<'Open' | 'Closed' | null>(null);
  const [currentPeriodLabel, setCurrentPeriodLabel] = React.useState<string | null>(null);
  const [reviewCount, setReviewCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [connections, setConnections] = React.useState<{ id: string; name: string; provider: string }[]>([]);
  const [reportingStandard, setReportingStandard] = React.useState<'US_GAAP' | 'IFRS' | 'ASPE' | 'FRS102'>('US_GAAP');
  const [periodType, setPeriodType] = React.useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const [periods, setPeriods] = React.useState<ClosePeriod[]>([]);
  const [closeStatus, setCloseStatus] = React.useState<{ checklist?: { total: number; completed: number }; adjustmentCount?: number; postedCount?: number } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const year = new Date().getFullYear();
      const requestedLabels: string[] | undefined =
        periodType === 'quarterly'
          ? [`${year}-Q1`, `${year}-Q2`, `${year}-Q3`, `${year}-Q4`]
          : periodType === 'annual'
            ? [String(year)]
            : undefined;
      const [locks, periodsList, conflicts, conns] = await Promise.all([
        listLockedPeriods(),
        listPeriods(requestedLabels),
        getConflicts(),
        listConnections(),
      ]);
      const lockedLabels = new Set(locks.map((l) => l.periodLabel));
      setPeriods(periodsList);
      const current = periodsList[0] ?? { periodLabel: periodType === 'monthly' ? `${year}-01` : periodType === 'quarterly' ? `${year}-Q1` : String(year), status: 'open' };
      setCurrentPeriodLabel(current.periodLabel);
      setPeriodStatus(lockedLabels.has(current.periodLabel) ? 'Closed' : 'Open');
      setReviewCount(conflicts.length);
      setConnections(Array.isArray(conns) ? conns : []);
      try {
        const status = await getCloseStatus(current.periodLabel);
        setCloseStatus({
          checklist: status.checklist ? { total: status.checklist.total, completed: status.checklist.completed } : undefined,
          adjustmentCount: status.adjustmentCount,
          postedCount: status.postedCount,
        });
      } catch {
        setCloseStatus(null);
      }
    } catch {
      setPeriodStatus('Open');
      setCurrentPeriodLabel('2025-01');
      setPeriods([]);
      setReviewCount(0);
      setConnections([]);
      setCloseStatus(null);
    } finally {
      setLoading(false);
    }
  }, [periodType]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [load]);

  // Refetch when user returns to this tab or restores page from back/forward cache
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

  const periodLabel = currentPeriodLabel ?? 'Current period';
  const periodForUpload = currentPeriodLabel ?? undefined;

  const upcomingPeriods = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return [...periods]
      .sort((a, b) => {
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
      })
      .slice(0, 4);
  }, [periods]);

  const currentPeriodEntry = periods.find((p) => p.periodLabel === currentPeriodLabel);
  const closeDueDate = currentPeriodEntry?.closeDueDate ?? null;
  const dueBadge = (() => {
    if (!closeDueDate) return null;
    const due = new Date(closeDueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Due today';
    if (diffDays <= 7) return `Due in ${diffDays} days`;
    return null;
  })();

  const handleSyncTrialBalance = async () => {
    if (!periodForUpload || connections.length === 0) return;
    setUploadError(null);
    setSyncing(true);
    try {
      const connectionId = connections[0].id;
      const asOfDate = getPeriodEndDate(periodForUpload);
      const result = await syncTrialBalanceAuth(connectionId, periodForUpload, asOfDate);
      if (result.success) {
        router.push(`/close/${encodeURIComponent(periodForUpload)}`);
      } else {
        setUploadError(result.errors?.join(' ') ?? 'Sync failed.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed.';
      if (msg.includes('Unauthorized') || msg.includes('Authorization')) {
        logout();
        router.push('/login?redirect=/dashboard');
        return;
      }
      setUploadError(msg);
    } finally {
      setSyncing(false);
    }
  };

  const handleTrialBalanceFile = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const result = await uploadTrialBalanceAuth(file, {
        periodLabel: periodForUpload,
        standard: reportingStandard,
      });
      try {
        sessionStorage.setItem(
          INGEST_RESULT_KEY,
          JSON.stringify({ result, periodLabel: periodForUpload ?? null })
        );
      } catch {
        // sessionStorage full or unavailable
      }
      router.push('/ingest-result');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      if (msg.includes('Unauthorized') || msg.includes('Authorization')) {
        logout();
        router.push('/login?redirect=/dashboard');
        return;
      }
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Overview
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Current period status and quick actions
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">Period</h2>
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="period-type" className="text-sm text-muted-foreground">View:</label>
              <select
                id="period-type"
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value as 'monthly' | 'quarterly' | 'annual')}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
              {periods.length > 1 ? (
                <>
                  <label htmlFor="period-select" className="text-sm text-muted-foreground ml-2">Current period:</label>
                  <select
                    id="period-select"
                    value={currentPeriodLabel ?? ''}
                    onChange={(e) => {
                      const label = e.target.value;
                      setCurrentPeriodLabel(label);
                      setPeriodStatus(periods.find((p) => p.periodLabel === label)?.status === 'locked' ? 'Closed' : 'Open');
                    }}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  >
                    {periods.map((p) => (
                      <option key={p.periodLabel} value={p.periodLabel}>
                        {p.periodLabel}
                        {p.closeDueDate ? ` (due ${p.closeDueDate})` : ''}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <span className="font-medium text-foreground">{periodLabel}</span>
              )}
              <Badge variant={periodStatus === 'Closed' ? 'success' : 'secondary'}>
                {periodStatus ?? 'Open'}
              </Badge>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">Current close</h2>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{periodLabel}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {closeDueDate && (
                  <p className="text-sm text-muted-foreground">
                    Due {closeDueDate}
                    {dueBadge && (
                      <Badge variant={dueBadge === 'Overdue' ? 'destructive' : 'secondary'} className="ml-2">
                        {dueBadge}
                      </Badge>
                    )}
                  </p>
                )}
                {closeStatus?.checklist != null && (
                  <p className="text-sm text-muted-foreground">
                    {closeStatus.checklist.completed} of {closeStatus.checklist.total} steps
                    {closeStatus.adjustmentCount != null && closeStatus.postedCount != null && (
                      <> · {closeStatus.adjustmentCount - closeStatus.postedCount} adjustments pending</>
                    )}
                  </p>
                )}
                <Button asChild>
                  <Link href={periodForUpload ? `/close/${encodeURIComponent(periodForUpload)}` : '/close'}>
                    Open close
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">Upcoming</h2>
            {upcomingPeriods.length > 0 ? (
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingPeriods.map((p) => (
                      <TableRow key={p.periodLabel}>
                        <TableCell className="font-medium">{p.periodLabel}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.closeDueDate ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={p.status === 'locked' || p.closeStage === 'closed' ? 'success' : 'secondary'}>
                            {p.status === 'locked' || p.closeStage === 'closed' ? 'Closed' : 'Open'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/close/${encodeURIComponent(p.periodLabel)}`}>Open</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No periods yet. Add a period from Close.</p>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">Trial balance</h2>
            <p className="text-sm text-muted-foreground">
              {connections.length > 0
                ? `Sync from your books or upload a file for ${periodLabel}.`
                : `Upload a trial balance for ${periodLabel} to build statements and continue to close.`}
            </p>
            {connections.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={handleSyncTrialBalance}
                  disabled={syncing || !periodForUpload || periodStatus === 'Closed'}
                >
                  {syncing ? 'Syncing…' : 'Sync trial balance'}
                </Button>
                <span className="text-sm text-muted-foreground">or upload file</span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="reporting-standard" className="text-sm font-medium text-foreground">
                Reporting standard
              </label>
              <select
                id="reporting-standard"
                value={reportingStandard}
                onChange={(e) => setReportingStandard(e.target.value as 'US_GAAP' | 'IFRS' | 'ASPE' | 'FRS102')}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                {REPORTING_STANDARDS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <HeroCommandCenter
              onFile={handleTrialBalanceFile}
              disabled={uploading}
              processing={uploading}
            />
            {uploadError && (
              <p className="text-sm text-destructive">{uploadError}</p>
            )}
          </section>

          <section className="flex flex-wrap gap-3">
            {periodStatus !== 'Closed' && (
              <Button asChild>
                <Link href={periodForUpload ? `/close/${encodeURIComponent(periodForUpload)}` : '/close'}>
                  Open month-end close
                </Link>
              </Button>
            )}
            {periodStatus === 'Closed' && (
              <Button asChild variant="secondary">
                <Link href={`/valuation?period=${encodeURIComponent(periodLabel)}`}>
                  Run valuation
                </Link>
              </Button>
            )}
            {reviewCount > 0 && (
              <Button asChild variant="outline">
                <Link href="/conflicts">Review items ({reviewCount})</Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/export">Reports</Link>
            </Button>
          </section>
        </>
      )}
    </div>
  );
}
