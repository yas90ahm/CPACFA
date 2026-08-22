'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { fmtMoney } from '@/lib/money';
import {
  type Gate,
  type JournalEntryResponse,
  type NormalizedTBRow,
  adaptTrialBalance,
  adaptJournalEntries,
  adaptVariances,
  adaptReconciliations,
  adaptIssues,
  isJEPending,
  isJEBooked,
  isReconComplete,
  isIssueOpen,
  VarianceExplanationStatus,
} from '@/lib/contracts';
import { closeQueryKeys, useCloseSession } from '@/lib/hooks/useCloseSession';
import VarianceHighlightsCard from '@/components/close/VarianceHighlightsCard';
import { WorkflowBreadcrumb } from '@/components/workflow-breadcrumb';
import {
  ChevronRight,
  FileText,
  MessageSquare,
  Upload,
  Package,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Top Bar                                                            */
/* ------------------------------------------------------------------ */

function TopBar({ periodLabel }: { periodLabel: string }) {
  return (
    <div className="h-12 bg-[#EDE6D6] border-b border-[#DDD5C2] flex items-center px-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/close" className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors">
          Dashboard
        </Link>
        <ChevronRight size={14} className="text-[#8B7A5E]" />
        <span className="text-[#2C2416] font-medium">{periodLabel || 'Close Session'}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Progress Rail                                                      */
/* ------------------------------------------------------------------ */

function ProgressRail({
  gates,
  gatesPassing,
  gatesTotal,
  sessionState,
  startedAt,
  closeDayTarget,
  attentionCount,
}: {
  gates: Gate[];
  gatesPassing: number;
  gatesTotal: number;
  sessionState: string;
  startedAt: string;
  closeDayTarget?: number;
  attentionCount: number;
}) {
  const startDate = startedAt ? new Date(startedAt) : null;
  const dayElapsed = startDate && !isNaN(startDate.getTime())
    ? Math.max(1, Math.ceil((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
    : null;
  const targetDays = closeDayTarget ?? 10;

  // Find the first non-passing gate index for "active" state
  const activeGateIndex = gates.findIndex((g) => !g.passing);
  const activeGateNum = activeGateIndex >= 0 ? activeGateIndex + 1 : gatesTotal;

  return (
    <div className="bg-[#2C2416] px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-[#B8860B] font-medium">
          Gate {activeGateNum} of {gatesTotal}
        </span>
        <span className="text-[#8B7A5E]">
          {dayElapsed != null ? `Close Day ${dayElapsed} of ${targetDays}` : 'N/A'}
        </span>
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#3B1F0A] text-[#B8860B]">
          {(sessionState ?? '').replace(/_/g, ' ')}
        </span>
        {attentionCount > 0 && (
          <span className="text-[#8B6914] text-xs">
            {attentionCount} item{attentionCount !== 1 ? 's' : ''} need attention
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {gates.map((gate, i) => {
          const isActive = i === activeGateIndex && !gate.passing;
          let bg = '#DDD5C2'; // pending (muted ledger-200)
          if (gate.passing) bg = '#2D6A4F'; // forest green
          else if (isActive) bg = '#B8860B'; // gold active
          const sizeClass = isActive ? 'w-3 h-3' : 'w-2.5 h-2.5';
          return (
            <div
              key={gate.id}
              className={`${sizeClass} rounded-full transition-colors`}
              style={{ backgroundColor: bg }}
              title={`${gate.label}: ${gate.passing ? 'Passing' : 'Pending'}`}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Gate Status Cards                                                  */
/* ------------------------------------------------------------------ */

function GateCard({
  gateLabel,
  title,
  passing,
  detail,
  metric,
  metricLabel,
}: {
  gateLabel: string;
  title: string;
  passing: boolean;
  detail?: string;
  metric: string;
  metricLabel: string;
}) {
  return (
    <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[#8B7A5E] font-medium">{gateLabel}</span>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            passing
              ? 'bg-[#E0EDE8] text-[#2D6A4F]'
              : 'bg-[#F0E8D0] text-[#8B6914]'
          }`}
        >
          {passing ? 'Passing' : detail || 'Pending'}
        </span>
      </div>
      <div className="text-sm text-[#2C2416] font-medium mb-2">{title}</div>
      <div className="text-2xl font-medium text-[#2C2416] font-mono">{metric}</div>
      <div className="text-xs text-[#8B7A5E] mt-1">{metricLabel}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Adjusted Trial Balance Summary                                     */
/* ------------------------------------------------------------------ */

function TrialBalanceSummary({ rows, sessionId, mappingGate }: { rows: NormalizedTBRow[]; sessionId: string; mappingGate?: Gate }) {
  // Aggregate by account type — use account code range as primary signal, category as fallback
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  let totalRevenue = 0;
  let totalExpenses = 0;

  for (const row of rows) {
    const debit = parseFloat(row.debit || '0') || 0;
    const credit = parseFloat(row.credit || '0') || 0;
    const net = debit - credit;

    // Primary: account code range (1xxx=Asset, 2xxx=Liability, 3xxx=Equity, 4xxx=Revenue, 5xxx+=Expense)
    const code = parseInt(row.accountCode, 10);
    let type: string | null = null;
    if (!isNaN(code)) {
      if (code >= 1000 && code < 2000) type = 'asset';
      else if (code >= 2000 && code < 3000) type = 'liability';
      else if (code >= 3000 && code < 4000) type = 'equity';
      else if (code >= 4000 && code < 5000) type = 'revenue';
      else if (code >= 5000) type = 'expense';
    }
    // Fallback: reporting category or account type from API
    if (!type) {
      const cat = (row?.accountType ?? row?.accountName ?? '').toLowerCase();
      if (cat.includes('asset')) type = 'asset';
      else if (cat.includes('liabilit')) type = 'liability';
      else if (cat.includes('equity') || cat.includes('capital') || cat.includes('retained')) type = 'equity';
      else if (cat.includes('revenue') || cat.includes('income') || cat.includes('sale')) type = 'revenue';
      else if (cat.includes('expense') || cat.includes('cost') || cat.includes('depreci')) type = 'expense';
    }

    if (type === 'asset') totalAssets += net;
    else if (type === 'liability') totalLiabilities += Math.abs(net);
    else if (type === 'equity') totalEquity += Math.abs(net);
    else if (type === 'revenue') totalRevenue += credit - debit;
    else if (type === 'expense') totalExpenses += debit - credit;
  }

  const netIncome = totalRevenue - totalExpenses;
  const allZero = totalAssets === 0 && totalLiabilities === 0 && totalEquity === 0 && totalRevenue === 0 && totalExpenses === 0;
  const hasRowsButUnmapped = rows.length > 0 && allZero;
  // A = L + E check: mid-period, net income hasn't been closed to retained earnings,
  // so equity = BS equity accounts + current period net income (Revenue - Expenses)
  const equityForCheck = totalEquity + netIncome;
  const aleCheck = Math.abs(totalAssets - (totalLiabilities + equityForCheck));
  const isBalanced = aleCheck < 0.02; // within penny

  if (hasRowsButUnmapped) {
    return (
      <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
        <div className="bg-[#2C2416] px-4 py-3">
          <h3 className="text-sm font-medium text-[#B8860B]">Adjusted Trial Balance Summary</h3>
        </div>
        <div className="px-4 py-8 text-center">
          <AlertCircle size={24} className="mx-auto text-[#8B6914] mb-3" />
          <p className="text-sm font-medium text-[#2C2416]">Accounts need mapping</p>
          <p className="text-xs text-[#8B7A5E] mt-1 mb-4">
            {rows.length} accounts uploaded. Map them to financial statement lines to see the summary.
          </p>
          <Link
            href={`/close/${sessionId}/mapping`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[#F5F0E8] transition-colors"
            style={{ backgroundColor: '#B8860B' }}
          >
            Map Accounts →
          </Link>
        </div>
      </div>
    );
  }

  const summaryRows = [
    { label: 'Total Assets', value: totalAssets },
    { label: 'Total Liabilities', value: totalLiabilities },
    { label: 'Total Equity', value: totalEquity },
    { label: 'Total Revenue', value: totalRevenue },
    { label: 'Total Expenses', value: totalExpenses },
    { label: 'Net Income', value: netIncome },
  ];

  return (
    <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
      <div className="bg-[#2C2416] px-4 py-3">
        <h3 className="text-sm font-medium text-[#B8860B]">Adjusted Trial Balance Summary</h3>
      </div>
      <div className="divide-y divide-[#DDD5C2]">
        {summaryRows.map((row) => (
          <div key={row.label} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-[#2C2416]">{row.label}</span>
            <span className="text-sm font-mono text-[#2C2416]">
              {fmtMoney(row.value.toFixed(2), { dollar: true, dash: false })}
            </span>
          </div>
        ))}
      </div>
      <div
        className={`px-4 py-2.5 flex items-center gap-2 text-xs font-medium ${
          isBalanced ? 'bg-[#E0EDE8] text-[#2D6A4F]' : 'bg-[#F5E4DE] text-[#C44B2B]'
        }`}
      >
        {isBalanced ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
        A = L + E Check: {isBalanced ? 'Balanced' : `Imbalance of ${fmtMoney(aleCheck.toFixed(2), { dollar: true, dash: false })}`}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Items Needing Attention                                            */
/* ------------------------------------------------------------------ */

interface AttentionItem {
  id: string;
  badge: string;
  badgeColor: string;
  badgeBg: string;
  text: string;
}

function buildAttentionItems(
  jes: JournalEntryResponse[],
  variances: ReturnType<typeof adaptVariances>,
  recons: ReturnType<typeof adaptReconciliations>,
  issues: ReturnType<typeof adaptIssues>
): AttentionItem[] {
  const items: AttentionItem[] = [];

  // Pending JE approvals
  const pendingJes = jes.filter((j) => isJEPending(j?.status ?? ''));
  if (pendingJes.length > 0) {
    items.push({
      id: 'aje-pending',
      badge: 'AJE',
      badgeColor: '#8B6914',
      badgeBg: '#F0E8D0',
      text: `${pendingJes.length} journal entr${pendingJes.length === 1 ? 'y' : 'ies'} pending approval`,
    });
  }

  // Unexplained material variances
  const unexplained = variances.filter((v) => v?.isMaterial && v?.explanationStatus !== VarianceExplanationStatus.EXPLAINED);
  if (unexplained.length > 0) {
    items.push({
      id: 'var-unexplained',
      badge: 'VAR',
      badgeColor: '#C44B2B',
      badgeBg: '#F5E4DE',
      text: `${unexplained.length} material variance${unexplained.length === 1 ? '' : 's'} unexplained`,
    });
  }

  // Incomplete reconciliations
  const incompleteRecons = recons.filter(
    (r) => !isReconComplete(r?.status ?? '')
  );
  if (incompleteRecons.length > 0) {
    items.push({
      id: 'rec-incomplete',
      badge: 'REC',
      badgeColor: '#8B6914',
      badgeBg: '#F0E8D0',
      text: `${incompleteRecons.length} reconciliation${incompleteRecons.length === 1 ? '' : 's'} incomplete`,
    });
  }

  // AI drafts ready
  const aiReady = variances.filter(
    (v) => v?.explanationStatus === VarianceExplanationStatus.AI_DRAFTED || v?.explanationStatus === VarianceExplanationStatus.DRAFT_READY
  );
  if (aiReady.length > 0) {
    items.push({
      id: 'ai-drafts',
      badge: 'AI',
      badgeColor: '#3B6EA5',
      badgeBg: '#E0EAF5',
      text: `${aiReady.length} AI draft${aiReady.length === 1 ? '' : 's'} ready for review`,
    });
  }

  // Issues from the API
  for (const issue of issues) {
    if (isIssueOpen(issue?.status ?? '')) {
      let badge = 'AUDIT';
      let badgeColor = '#C44B2B';
      let badgeBg = '#F5E4DE';
      if (issue?.category === 'evidence' || issue?.category === 'missing_evidence') {
        badge = 'EVID';
        badgeColor = '#8B6914';
        badgeBg = '#F0E8D0';
      }
      items.push({
        id: `issue-${issue.id}`,
        badge,
        badgeColor,
        badgeBg,
        text: issue.title || issue.description || 'Issue requires attention',
      });
    }
  }

  return items.slice(0, 8); // Cap at 8 items
}

function AttentionList({ items, sessionState, tbRowCount, unmappedCount, sessionId }: { items: AttentionItem[]; sessionState?: string; tbRowCount: number; unmappedCount: number; sessionId: string }) {
  if (items.length === 0) {
    const state = (sessionState ?? '').toUpperCase();
    const noData = tbRowCount === 0;
    const needsMapping = tbRowCount > 0 && unmappedCount > 0;

    if (noData) {
      return (
        <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-6">
          <h3 className="text-sm font-medium text-[#2C2416] mb-4">Items Needing Attention</h3>
          <div className="flex items-center gap-2 text-sm text-[#8B7A5E]">
            <AlertCircle size={16} />
            Upload a trial balance to begin your close.
          </div>
        </div>
      );
    }
    if (needsMapping) {
      return (
        <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-6">
          <h3 className="text-sm font-medium text-[#2C2416] mb-4">Items Needing Attention</h3>
          <div className="flex items-center gap-2 text-sm text-[#8B6914]">
            <AlertCircle size={16} />
            Map {unmappedCount} account{unmappedCount !== 1 ? 's' : ''} to continue.
          </div>
          <Link
            href={`/close/${sessionId}/mapping`}
            className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded text-xs font-medium text-[#F5F0E8] transition-colors"
            style={{ backgroundColor: '#B8860B' }}
          >
            Go to Mapping →
          </Link>
        </div>
      );
    }
    return (
      <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-6">
        <h3 className="text-sm font-medium text-[#2C2416] mb-4">Items Needing Attention</h3>
        <div className="flex items-center gap-2 text-sm text-[#2D6A4F]">
          <CheckCircle2 size={16} />
          All items resolved. Ready to advance.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
      <h3 className="text-sm font-medium text-[#2C2416] mb-3">Items Needing Attention</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
              style={{ color: item.badgeColor, backgroundColor: item.badgeBg }}
            >
              {item.badge}
            </span>
            <span className="text-sm text-[#5C4F3A]">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick Actions                                                      */
/* ------------------------------------------------------------------ */

/* Gate-ID → route mapping for "Continue Close" navigation */
const GATE_ROUTE_MAP: Record<string, string> = {
  tb_balanced: 'trial-balance',
  all_accounts_mapped: 'mapping',
  recons_complete: 'reconciliation',
  templates_resolved: 'adjustments',
  statements_current: 'statements',
  variances_explained: 'variance',
  material_jes_approved: 'adjustments',
  no_blocking_issues: 'dashboard',
  evidence_policy: 'evidence',
  checklist_complete: 'pipeline',
  cash_rec_complete: 'reconciliation',
};

const STEP_LABELS: Record<string, string> = {
  'trial-balance': 'Trial Balance',
  'mapping': 'Account Mapping',
  'reconciliation': 'Reconciliation',
  'adjustments': 'Journal Entries',
  'statements': 'Statements',
  'variance': 'Variance Analysis',
  'review': 'Review & Certify',
  'dashboard': 'Dashboard',
  'evidence': 'Evidence',
  'pipeline': 'Pipeline',
};

function ContinueCloseButton({ sessionId, gates }: { sessionId: string; gates: Gate[] }) {
  const firstFailing = gates.find((g) => !g.passing);
  const route = firstFailing
    ? GATE_ROUTE_MAP[firstFailing.id] ?? 'review'
    : 'review';
  const stepLabel = STEP_LABELS[route] ?? 'Review & Certify';

  return (
    <Link
      href={`/close/${sessionId}/${route}`}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#B8860B] text-sm font-medium text-[#2C2416] hover:bg-[#A07608] transition-colors"
    >
      Continue to {stepLabel} &rarr;
    </Link>
  );
}

function QuickActions({ sessionId, pendingJes, aiDrafts }: { sessionId: string; pendingJes: number; aiDrafts: number }) {
  const actions = [
    {
      icon: FileText,
      title: 'Review Journal Entries',
      sub: `${pendingJes} pending approval`,
      href: `/close/${sessionId}/adjustments`,
    },
    {
      icon: MessageSquare,
      title: 'Explain Variances',
      sub: `${aiDrafts} AI draft${aiDrafts !== 1 ? 's' : ''} ready`,
      href: `/close/${sessionId}/variance`,
    },
    {
      icon: Upload,
      title: 'Upload Evidence',
      sub: 'Bank recon pending',
      href: `/close/${sessionId}/reconciliation`,
    },
    {
      icon: Package,
      title: 'Generate Statements',
      sub: 'Ready when gates pass',
      href: `/close/${sessionId}/review`,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.title}
            href={action.href}
            className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4 hover:border-[#B8860B] transition-colors group"
          >
            <Icon size={20} className="text-[#8B7A5E] group-hover:text-[#B8860B] transition-colors mb-3" />
            <div className="text-sm font-medium text-[#2C2416]">{action.title}</div>
            <div className="text-xs text-[#8B7A5E] mt-1">{action.sub}</div>
          </Link>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                   */
/* ------------------------------------------------------------------ */

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#DDD5C2] rounded ${className}`} />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Title skeleton */}
      <div>
        <Skeleton className="h-7 w-64 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>
      {/* Gate cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
            <Skeleton className="h-4 w-16 mb-3" />
            <Skeleton className="h-4 w-28 mb-2" />
            <Skeleton className="h-8 w-24 mb-1" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      {/* Two-column skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg h-80" />
        <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg h-80" />
      </div>
      {/* Quick actions skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4 h-24" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Error State                                                        */
/* ------------------------------------------------------------------ */

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-[#F5E4DE] border border-[#C44B2B]/20 rounded-lg p-4 flex items-center gap-3">
      <AlertCircle size={18} className="text-[#C44B2B] shrink-0" />
      <div>
        <div className="text-sm font-medium text-[#C44B2B]">Failed to load dashboard data</div>
        <div className="text-xs text-[#C44B2B]/80 mt-0.5">{message}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function CloseDashboardPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const closeSession = useCloseSession(sessionId);
  const { sessionQuery, readinessQuery } = closeSession;

  // --- Data fetching ---

  const tbQuery = useQuery({
    queryKey: ['trial-balance', sessionId, 'adjusted'],
    queryFn: async () => {
      const data = await apiFetch(`/api/close/sessions/${sessionId}/trial-balance`, {
        params: { type: 'adjusted' },
      });
      return adaptTrialBalance(data);
    },
    enabled: !!sessionId,
  });

  const jesQuery = useQuery({
    queryKey: closeQueryKeys.journalEntries(sessionId),
    queryFn: async () => {
      const data = await apiFetch(`/api/close/journal-entries`, {
        params: { closeSessionId: sessionId },
      });
      return adaptJournalEntries(data);
    },
    enabled: !!sessionId,
  });

  const variancesQuery = useQuery({
    queryKey: closeQueryKeys.variances(sessionId),
    queryFn: async () => {
      const data = await apiFetch(`/api/close/sessions/${sessionId}/variances`);
      return adaptVariances(data);
    },
    enabled: !!sessionId,
  });

  const reconsQuery = useQuery({
    queryKey: ['reconciliations', sessionId],
    queryFn: async () => {
      const data = await apiFetch(`/api/close/sessions/${sessionId}/reconciliations`);
      return adaptReconciliations(data);
    },
    enabled: !!sessionId,
  });

  const issuesQuery = useQuery({
    queryKey: ['issues', sessionId],
    queryFn: async () => {
      try {
        const data = await apiFetch(`/api/close/sessions/${sessionId}/issues`);
        return adaptIssues(data);
      } catch {
        // issues endpoint may not exist yet -- degrade gracefully
        return [];
      }
    },
    enabled: !!sessionId,
  });

  // --- Derived state ---

  const session = closeSession.session;
  const gates = closeSession.gates;
  const gatesPassing = closeSession.gatesPassing;
  const gatesTotal = closeSession.gatesTotal;
  const tbRows = tbQuery.data?.rows ?? [];
  const jes = jesQuery.data ?? [];
  const variances = variancesQuery.data ?? [];
  const recons = reconsQuery.data ?? [];
  const issues = issuesQuery.data ?? [];

  const pendingJes = jes.filter((j) => isJEPending(j?.status ?? '')).length;
  const postedJes = jes.filter((j) => isJEBooked(j?.status ?? '')).length;
  const aiDrafts = variances.filter(
    (v) => v?.explanationStatus === VarianceExplanationStatus.AI_DRAFTED || v?.explanationStatus === VarianceExplanationStatus.DRAFT_READY
  ).length;

  const completedRecons = recons.filter((r) => isReconComplete(r?.status ?? '')).length;

  const attentionItems = buildAttentionItems(jes, variances, recons, issues);

  const isLoading = sessionQuery.isLoading || readinessQuery.isLoading;
  const error = sessionQuery.error || readinessQuery.error;

  // --- Computed gate card data ---

  // Find specific gates or use index-based fallback
  function findGate(keyword: string, index: number): Gate | undefined {
    return gates.find((g) => (g?.label ?? '').toLowerCase().includes(keyword)) ?? gates[index];
  }

  const tbGate = findGate('trial', 0);
  const mappingGate = findGate('map', 1);
  const reconGate = findGate('recon', 2);
  const jeGate = findGate('journal', 3) ?? findGate('adjust', 3);

  // Mapping count from gate detail (e.g. "148/148 mapped")
  const mappingDetail = mappingGate?.detail ?? '';
  const mappingMatch = mappingDetail.match(/(\d+)\s*\/\s*(\d+)/);
  const mappingMetric = mappingMatch ? `${mappingMatch[1]}/${mappingMatch[2]}` : mappingGate?.passing ? 'Complete' : 'Pending';

  // Period info
  const periodLabel = session?.periodLabel ?? 'Close Session';
  const entityName = session?.entityName ?? '';

  // Derive period end display from session.periodEnd (e.g. "2026-03-31")
  const periodEndDisplay = (() => {
    const pe = session?.periodEnd;
    if (pe && pe.length >= 10) {
      const d = new Date(pe + 'T12:00:00Z'); // noon UTC to avoid timezone shift
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      }
    }
    return periodLabel;
  })();

  // Quarter — derive from session.periodEnd month
  const quarter = (() => {
    const pe = session?.periodEnd;
    if (pe && pe.length >= 7) {
      const year = Number(pe.slice(0, 4));
      const month = Number(pe.slice(5, 7));
      if (year > 0 && month > 0) return `Q${Math.ceil(month / 3)} FY${year}`;
    }
    return '';
  })();

  // Updated ago
  const updatedAgo = session?.statementsGeneratedAt
    ? formatTimeAgo(new Date(session.statementsGeneratedAt))
    : session?.startedAt
    ? formatTimeAgo(new Date(session.startedAt))
    : '';

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex">
      {/* Sidebar rendered by layout.tsx */}

      {/* Main content */}
      <div className="ml-[260px] flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <TopBar periodLabel={periodLabel} />

        {/* Workflow Breadcrumb */}
        <WorkflowBreadcrumb sessionId={sessionId} gates={gates} />

        {/* Progress Rail */}
        {gates.length > 0 && (
          <ProgressRail
            gates={gates}
            gatesPassing={gatesPassing}
            gatesTotal={gatesTotal}
            sessionState={session?.status ?? session?.state ?? 'IN_PROGRESS'}
            startedAt={session?.startedAt ?? session?.createdAt ?? ''}
            closeDayTarget={session?.closeDayTarget}
            attentionCount={attentionItems.length}
          />
        )}

        {/* Page body */}
        <main className="flex-1 px-6 py-6">
          {error && <ErrorBanner message={(error as Error).message} />}

          {isLoading ? (
            <DashboardSkeleton />
          ) : (
            <div className="space-y-6">
              {/* Page Title */}
              <div>
                <h1 className="text-2xl font-medium text-[#2C2416]">{periodLabel}</h1>
                <p className="text-sm text-[#8B7A5E] mt-1">
                  {[entityName, `Period ending ${periodEndDisplay}`, quarter, `Updated ${updatedAgo}`]
                    .filter(Boolean)
                    .join(' \u00B7 ')}
                </p>
              </div>

              {/* Gate Status Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <GateCard
                  gateLabel={`Gate ${gates.indexOf(tbGate!) + 1 || 1}`}
                  title={tbGate?.name ?? "Trial Balance"}
                  passing={tbGate?.passing ?? false}
                  detail={tbGate?.detail}
                  metric={tbRows.length === 0 ? 'No data' : (() => {
                    let totalD = 0, totalC = 0;
                    for (const r of tbRows) {
                      totalD += parseFloat(r.debit || '0') || 0;
                      totalC += parseFloat(r.credit || '0') || 0;
                    }
                    return fmtMoney(Math.abs(totalD - totalC).toFixed(2), { dollar: true, dash: false });
                  })()}
                  metricLabel={tbRows.length === 0 ? 'Upload GL to begin' : 'Imbalance'}
                />
                <GateCard
                  gateLabel={`Gate ${gates.indexOf(mappingGate!) + 1 || 2}`}
                  title={mappingGate?.name ?? "Account Mapping"}
                  passing={mappingGate?.passing ?? false}
                  detail={mappingGate?.detail}
                  metric={mappingMetric}
                  metricLabel="Accounts mapped"
                />
                <GateCard
                  gateLabel={`Gate ${gates.indexOf(reconGate!) + 1 || 3}`}
                  title={reconGate?.name ?? "Reconciliation"}
                  passing={reconGate?.passing ?? false}
                  detail={reconGate?.detail}
                  metric={(() => {
                    const reconDetail = reconGate?.detail ?? '';
                    const reconMatch = reconDetail.match(/(\d+)\s*\/\s*(\d+)/);
                    if (reconMatch) return `${reconMatch[1]}/${reconMatch[2]}`;
                    return `${completedRecons}/${recons.length || reconDetail || 0}`;
                  })()}
                  metricLabel="Reconciliations complete"
                />
                <GateCard
                  gateLabel={`Gate ${gates.indexOf(jeGate!) + 1 || 4}`}
                  title={jeGate?.name ?? "Journal Entries"}
                  passing={jeGate?.passing ?? false}
                  detail={jeGate?.detail}
                  metric={`${postedJes} posted`}
                  metricLabel={pendingJes > 0 ? `${pendingJes} pending approval` : 'All approved'}
                />
              </div>

              {/* AI: Material Variance Highlights */}
              <VarianceHighlightsCard
                variances={variances}
                sessionId={sessionId}
                isLoading={variancesQuery.isLoading}
                onRefresh={() => variancesQuery.refetch()}
              />

              {/* Two-column: TB Summary + Attention */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TrialBalanceSummary rows={tbRows} sessionId={sessionId} mappingGate={mappingGate} />
                <AttentionList
                  items={attentionItems}
                  sessionState={session?.status ?? session?.state}
                  tbRowCount={tbRows.length}
                  unmappedCount={(() => {
                    const d = mappingGate?.detail ?? '';
                    const m = d.match(/(\d+)\s*\/\s*(\d+)/);
                    if (m) return Math.max(0, Number(m[2]) - Number(m[1]));
                    return tbRows.length; // assume all unmapped if can't parse
                  })()}
                  sessionId={sessionId}
                />
              </div>

              {/* Continue Close */}
              {gates.length > 0 && (
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-[#2C2416]">Continue Close</h2>
                  <ContinueCloseButton sessionId={sessionId} gates={gates} />
                </div>
              )}

              {/* Quick Actions */}
              <div>
                <h2 className="text-sm font-medium text-[#2C2416] mb-3">Quick Actions</h2>
                <QuickActions sessionId={sessionId} pendingJes={pendingJes} aiDrafts={aiDrafts} />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}
