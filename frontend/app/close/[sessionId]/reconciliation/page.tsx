'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { fmtMoney, isMoneyZero } from '@/lib/money';
import {
  LayoutDashboard,
  FolderClosed,
  Briefcase,
  ScrollText,
  BarChart3,
  Activity,
  Settings,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileText,
  Paperclip,
  ExternalLink,
  Shield,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Gate {
  id: string;
  label: string;
  passing: boolean;
  detail?: string;
}

interface ReadinessResponse {
  gates: Gate[];
  gatesPassing: number;
  gatesTotal: number;
  canAdvance: boolean;
}

interface Reconciliation {
  id: string;
  accountCode: string;
  accountName: string;
  glBalance: string;
  sourceBalance: string;
  variance: string;
  evidenceCount?: number;
  approvedBy?: string;
  approverName?: string;
  status: string;
}

/* ------------------------------------------------------------------ */
/*  Nav items config                                                   */
/* ------------------------------------------------------------------ */

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, href: (sid: string) => `/close/${sid}/dashboard` },
  { label: 'Close Sessions', icon: FolderClosed, href: () => '/close' },
  { label: 'Portfolio', icon: Briefcase, href: () => '/portfolio' },
  { label: 'Audit Trail', icon: ScrollText, href: (sid: string) => `/close/${sid}/audit-trail` },
  { label: 'GL Quality', icon: BarChart3, href: () => '/close' },
  { label: 'Analytics', icon: Activity, href: () => '/close' },
  { label: 'Settings', icon: Settings, href: () => '/settings/general' },
];

/* ------------------------------------------------------------------ */
/*  Sidebar                                                            */
/* ------------------------------------------------------------------ */

function Sidebar({ sessionId }: { sessionId: string }) {
  return (
    <aside className="fixed top-0 left-0 h-screen w-[260px] bg-[#2C2416] flex flex-col z-50">
      <div className="px-6 pt-6 pb-4">
        <div className="text-[#B8860B] text-xl font-medium tracking-wide">SABIT</div>
        <div className="text-[#8B7A5E] text-xs mt-0.5">Financial Close Engine</div>
      </div>
      <nav className="flex-1 px-3 mt-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href(sessionId)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors text-[#8B7A5E] hover:text-[#B8860B] hover:bg-[#3B1F0A]/50"
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-[#3B1F0A]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#3B1F0A] flex items-center justify-center text-[#B8860B] text-xs font-medium">
            YA
          </div>
          <div>
            <div className="text-sm text-[#B8860B] font-medium">Yasir A.</div>
            <div className="text-xs text-[#8B7A5E]">Controller</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Progress Rail                                                      */
/* ------------------------------------------------------------------ */

function ProgressRail({
  gates,
  gatesTotal,
  reconGate,
}: {
  gates: Gate[];
  gatesTotal: number;
  reconGate?: Gate;
}) {
  const activeGateIndex = gates.findIndex((g) => !g.passing);

  return (
    <div className="bg-[#2C2416] px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-[#B8860B] font-medium">
          Gate 3 of {gatesTotal}
        </span>
        <span className="text-[#8B7A5E]">
          Balance Sheet Reconciliation
        </span>
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${
            reconGate?.passing
              ? 'bg-[#1B3D2F] text-[#2D6A4F]'
              : 'bg-[#3B1F0A] text-[#B8860B]'
          }`}
        >
          {reconGate?.passing ? 'PASSING' : reconGate?.detail ?? 'IN PROGRESS'}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {gates.map((gate, i) => {
          let bg = '#5C4F3A';
          if (gate.passing) bg = '#2D6A4F';
          else if (i === activeGateIndex) bg = '#B8860B';
          return (
            <div
              key={gate.id}
              className="w-2.5 h-2.5 rounded-full transition-colors"
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
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
      <div className="text-xs text-[#8B7A5E] font-medium mb-1">{label}</div>
      <div
        className="text-2xl font-medium font-mono"
        style={{ color: accent ?? '#2C2416' }}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-[#8B7A5E] mt-1">{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reconciliation Status Badge                                        */
/* ------------------------------------------------------------------ */

function ReconStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === 'completed' || s === 'approved' || s === 'reconciled') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#E0EDE8] text-[#2D6A4F]">
        <CheckCircle2 size={12} />
        Reconciled
      </span>
    );
  }
  if (s === 'in_progress' || s === 'pending') {
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded bg-[#F0E8D0] text-[#8B6914]">
        In Progress
      </span>
    );
  }
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded bg-[#DDD5C2] text-[#8B7A5E]">
      {status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Expandable Account Detail                                          */
/* ------------------------------------------------------------------ */

function AccountDetail({ recon, sessionId }: { recon: Reconciliation; sessionId: string }) {
  return (
    <div className="px-4 py-4 bg-[#F5F0E8] border-t border-[#DDD5C2]">
      <div className="text-xs font-medium text-[#8B7A5E] uppercase tracking-wider mb-3">
        Account Detail — {recon.accountCode} {recon.accountName}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* GL Balance Breakdown */}
        <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
          <div className="text-xs font-medium text-[#8B7A5E] mb-3">GL Balance</div>
          <div className="text-lg font-mono font-medium text-[#2C2416] mb-3">
            {fmtMoney(recon.glBalance, { dollar: true, dash: false })}
          </div>
          <div className="space-y-2 text-xs text-[#5C4F3A]">
            <div className="flex justify-between">
              <span>Opening Balance</span>
              <span className="font-mono">—</span>
            </div>
            <div className="flex justify-between">
              <span>Period Debits</span>
              <span className="font-mono">—</span>
            </div>
            <div className="flex justify-between">
              <span>Period Credits</span>
              <span className="font-mono">—</span>
            </div>
            <div className="flex justify-between border-t border-[#DDD5C2] pt-2 font-medium">
              <span>Closing Balance</span>
              <span className="font-mono">{fmtMoney(recon.glBalance, { dollar: true, dash: false })}</span>
            </div>
          </div>
        </div>

        {/* Source Documents */}
        <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
          <div className="text-xs font-medium text-[#8B7A5E] mb-3">Source Documents</div>
          <div className="text-lg font-mono font-medium text-[#2C2416] mb-3">
            {fmtMoney(recon.sourceBalance, { dollar: true, dash: false })}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-[#5C4F3A]">
              <FileText size={12} className="text-[#8B7A5E]" />
              <span>Bank statement ending balance</span>
            </div>
            {(recon.evidenceCount ?? 0) > 0 && (
              <div className="flex items-center gap-2 text-xs text-[#3B6EA5]">
                <Paperclip size={12} />
                <span>{recon.evidenceCount} evidence file{(recon.evidenceCount ?? 0) !== 1 ? 's' : ''} attached</span>
              </div>
            )}
          </div>
        </div>

        {/* Reconciling Items */}
        <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
          <div className="text-xs font-medium text-[#8B7A5E] mb-3">Reconciling Items</div>
          <div
            className={`text-lg font-mono font-medium mb-3 ${
              isMoneyZero(recon.variance) ? 'text-[#2D6A4F]' : 'text-[#C44B2B]'
            }`}
          >
            {fmtMoney(recon.variance, { dollar: true, dash: false })}
          </div>
          <div className="space-y-2 text-xs text-[#5C4F3A]">
            <div className="flex justify-between">
              <span>Outstanding deposits</span>
              <span className="font-mono">—</span>
            </div>
            <div className="flex justify-between">
              <span>Outstanding checks</span>
              <span className="font-mono">—</span>
            </div>
            <div className="flex justify-between">
              <span>Timing differences</span>
              <span className="font-mono">—</span>
            </div>
            <div className="flex justify-between border-t border-[#DDD5C2] pt-2 font-medium">
              <span>Unexplained Variance</span>
              <span
                className={`font-mono ${isMoneyZero(recon.variance) ? 'text-[#2D6A4F]' : 'text-[#C44B2B]'}`}
              >
                {fmtMoney(recon.variance, { dollar: true, dash: false })}
              </span>
            </div>
          </div>
          <Link
            href={`/close/${sessionId}/reconciliation/${recon.id}`}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#B8860B] hover:underline"
          >
            View full detail
            <ExternalLink size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#DDD5C2] rounded ${className}`} />;
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-7 w-72 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-8 w-16 mb-1" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg h-96" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Error Banner                                                       */
/* ------------------------------------------------------------------ */

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-[#F5E4DE] border border-[#C44B2B]/20 rounded-lg p-4 flex items-center gap-3">
      <AlertCircle size={18} className="text-[#C44B2B] shrink-0" />
      <div>
        <div className="text-sm font-medium text-[#C44B2B]">Failed to load reconciliation data</div>
        <div className="text-xs text-[#C44B2B]/80 mt-0.5">{message}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function ReconciliationListPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* --- Data fetching --- */

  const readinessQuery = useQuery({
    queryKey: ['close-readiness', sessionId],
    queryFn: () =>
      apiFetch<ReadinessResponse>(`/api/close/sessions/${sessionId}/readiness`, {
        params: { format: 'gates' },
      }),
    enabled: !!sessionId,
  });

  const reconsQuery = useQuery({
    queryKey: ['reconciliations', sessionId],
    queryFn: async () => {
      const data = await apiFetch<Reconciliation[] | { reconciliations?: Reconciliation[] }>(
        `/api/close/sessions/${sessionId}/reconciliations`
      );
      return Array.isArray(data) ? data : data.reconciliations ?? [];
    },
    enabled: !!sessionId,
  });

  /* --- Derived state --- */

  const gates = readinessQuery.data?.gates ?? [];
  const gatesTotal = readinessQuery.data?.gatesTotal ?? 0;
  const reconGate = gates.find((g) => g.label.toLowerCase().includes('recon')) ?? gates[2];

  const recons = reconsQuery.data ?? [];
  const totalAccounts = recons.length;
  const reconciledCount = recons.filter(
    (r) => r.status === 'completed' || r.status === 'approved' || r.status === 'reconciled'
  ).length;
  const totalEvidenceCount = recons.reduce((sum, r) => sum + (r.evidenceCount ?? 0), 0);

  // Total variance: sum all variance strings for display
  const totalVariance = recons.reduce((sum, r) => {
    const clean = String(r.variance ?? '0').replace(/[$,()]/g, '').replace('-', '');
    return sum + (parseFloat(clean) || 0);
  }, 0);
  const totalVarianceStr = totalVariance.toFixed(2);
  const varianceIsZero = totalVariance < 0.01;

  const isLoading = reconsQuery.isLoading;
  const error = reconsQuery.error;

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex">
      <Sidebar sessionId={sessionId} />

      <div className="ml-[260px] flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <div className="h-12 bg-[#EDE6D6] border-b border-[#DDD5C2] flex items-center px-6">
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/close/${sessionId}/dashboard`} className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors">
              Dashboard
            </Link>
            <ChevronRight size={14} className="text-[#8B7A5E]" />
            <span className="text-[#2C2416] font-medium">Reconciliation</span>
          </div>
        </div>

        {/* Progress Rail */}
        {gates.length > 0 && (
          <ProgressRail gates={gates} gatesTotal={gatesTotal} reconGate={reconGate} />
        )}

        {/* Page body */}
        <main className="flex-1 px-6 py-6">
          {error && <ErrorBanner message={(error as Error).message} />}

          {isLoading ? (
            <PageSkeleton />
          ) : (
            <div className="space-y-6">
              {/* Page Title */}
              <div>
                <h1 className="text-2xl font-medium text-[#2C2416]">Balance Sheet Reconciliation</h1>
                <p className="text-sm text-[#8B7A5E] mt-1">
                  Reconcile each balance sheet account against its source document. Evidence upload required for approval.
                </p>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard
                  label="Total Accounts"
                  value={totalAccounts}
                  sub="balance sheet accounts"
                />
                <StatCard
                  label="Reconciled"
                  value={reconciledCount}
                  sub={`of ${totalAccounts} complete`}
                  accent={reconciledCount === totalAccounts && totalAccounts > 0 ? '#2D6A4F' : '#8B6914'}
                />
                <StatCard
                  label="Total Variance"
                  value={`$${fmtMoney(totalVarianceStr, { dollar: false, dash: false })}`}
                  sub={varianceIsZero ? 'fully reconciled' : 'unexplained'}
                  accent={varianceIsZero ? '#2D6A4F' : '#C44B2B'}
                />
                <StatCard
                  label="Evidence Files"
                  value={totalEvidenceCount}
                  sub="uploaded documents"
                />
              </div>

              {/* Reconciliation Table */}
              <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
                {/* Table Header */}
                <div className="bg-[#2C2416] px-4 py-3 grid grid-cols-12 gap-4 text-xs font-medium text-[#8B7A5E] uppercase tracking-wider">
                  <div className="col-span-3">Account</div>
                  <div className="col-span-2 text-right">GL Balance</div>
                  <div className="col-span-2 text-right">Source Balance</div>
                  <div className="col-span-1 text-right">Variance</div>
                  <div className="col-span-1 text-center">Evidence</div>
                  <div className="col-span-1">Approver</div>
                  <div className="col-span-2">Status</div>
                </div>

                {/* Table Rows */}
                <div className="divide-y divide-[#DDD5C2]">
                  {recons.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-[#8B7A5E]">
                      No reconciliation accounts found for this session.
                    </div>
                  ) : (
                    recons.map((recon) => {
                      const isExpanded = expandedId === recon.id;
                      const reconVarianceZero = isMoneyZero(recon.variance);

                      return (
                        <React.Fragment key={recon.id}>
                          <div
                            className="px-4 py-3 grid grid-cols-12 gap-4 items-center hover:bg-[#E8E0D0] transition-colors cursor-pointer"
                            onClick={() => setExpandedId(isExpanded ? null : recon.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setExpandedId(isExpanded ? null : recon.id);
                              }
                            }}
                            aria-expanded={isExpanded}
                          >
                            <div className="col-span-3 flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronUp size={14} className="text-[#8B7A5E] shrink-0" />
                              ) : (
                                <ChevronDown size={14} className="text-[#8B7A5E] shrink-0" />
                              )}
                              <div>
                                <span className="text-sm font-mono text-[#2C2416]">{recon.accountCode}</span>
                                <span className="text-sm text-[#8B7A5E] ml-2">{recon.accountName}</span>
                              </div>
                            </div>
                            <div className="col-span-2 text-right">
                              <span className="text-sm font-mono text-[#2C2416]">
                                {fmtMoney(recon.glBalance, { dollar: true, dash: false })}
                              </span>
                            </div>
                            <div className="col-span-2 text-right">
                              <span className="text-sm font-mono text-[#2C2416]">
                                {fmtMoney(recon.sourceBalance, { dollar: true, dash: false })}
                              </span>
                            </div>
                            <div className="col-span-1 text-right">
                              <span
                                className={`text-sm font-mono font-medium ${
                                  reconVarianceZero ? 'text-[#2D6A4F]' : 'text-[#C44B2B]'
                                }`}
                              >
                                {fmtMoney(recon.variance, { dollar: true, dash: false })}
                              </span>
                            </div>
                            <div className="col-span-1 text-center">
                              {(recon.evidenceCount ?? 0) > 0 ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#E0EAF5] text-[#3B6EA5]">
                                  <Paperclip size={10} />
                                  {recon.evidenceCount}
                                </span>
                              ) : (
                                <span className="text-xs text-[#8B7A5E]">—</span>
                              )}
                            </div>
                            <div className="col-span-1">
                              <span className="text-xs text-[#5C4F3A]">
                                {recon.approverName ?? recon.approvedBy ?? '—'}
                              </span>
                            </div>
                            <div className="col-span-2">
                              <ReconStatusBadge status={recon.status} />
                            </div>
                          </div>

                          {/* Expandable Detail */}
                          {isExpanded && (
                            <AccountDetail recon={recon} sessionId={sessionId} />
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </div>

                {/* Table Footer */}
                {recons.length > 0 && (
                  <div className="bg-[#E8E0D0] px-4 py-2.5 flex items-center justify-between text-xs text-[#8B7A5E]">
                    <span>{recons.length} balance sheet account{recons.length !== 1 ? 's' : ''}</span>
                    <span>
                      {reconciledCount === totalAccounts && totalAccounts > 0 ? (
                        <span className="flex items-center gap-1 text-[#2D6A4F] font-medium">
                          <Shield size={12} />
                          All accounts reconciled — gate passing
                        </span>
                      ) : (
                        <span className="text-[#8B6914]">
                          {totalAccounts - reconciledCount} account{totalAccounts - reconciledCount !== 1 ? 's' : ''} pending reconciliation
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
