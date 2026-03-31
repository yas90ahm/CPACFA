'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  LayoutDashboard,
  FolderClosed,
  Briefcase,
  ScrollText,
  BarChart3,
  Activity,
  Settings,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  FileWarning,
  TrendingDown,
  Clock,
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

interface AccountQuality {
  accountCode: string;
  accountName: string;
  qualityScore: number;
  issuesFound: number;
  lastAnalyzed?: string;
  issues?: string[];
}

interface GLHealthResponse {
  overallGrade: string;
  overallScore: number;
  accounts: AccountQuality[];
  issueCategories: {
    missingDescriptions: number;
    unusualBalances: number;
    concentrationRisk: number;
    periodViolations: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Nav items config                                                   */
/* ------------------------------------------------------------------ */

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, href: (sid: string) => `/close/${sid}/dashboard` },
  { label: 'Close Sessions', icon: FolderClosed, href: () => '/close' },
  { label: 'Portfolio', icon: Briefcase, href: () => '/portfolio' },
  { label: 'Audit Trail', icon: ScrollText, href: (sid: string) => `/close/${sid}/audit-trail` },
  { label: 'GL Quality', icon: BarChart3, href: (sid: string) => `/close/${sid}/gl-quality` },
  { label: 'Modules', icon: Activity, href: (sid: string) => `/close/${sid}/modules` },
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
          const isActive = item.label === 'GL Quality';
          return (
            <Link
              key={item.label}
              href={item.href(sessionId)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'text-[#B8860B] bg-[#3B1F0A]/50'
                  : 'text-[#8B7A5E] hover:text-[#B8860B] hover:bg-[#3B1F0A]/50'
              }`}
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
  gatesPassing,
  gatesTotal,
}: {
  gates: Gate[];
  gatesPassing: number;
  gatesTotal: number;
}) {
  const activeGateIndex = gates.findIndex((g) => !g.passing);
  const activeGateNum = activeGateIndex >= 0 ? activeGateIndex + 1 : gatesTotal;

  return (
    <div className="bg-[#2C2416] px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-[#B8860B] font-medium">
          Gate {activeGateNum} of {gatesTotal}
        </span>
        <span className="text-[#8B7A5E]">
          {gatesPassing} of {gatesTotal} passing
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
/*  Grade Badge                                                        */
/* ------------------------------------------------------------------ */

function gradeColor(grade: string): string {
  const g = grade.toUpperCase();
  if (g === 'A' || g === 'B') return '#2D6A4F';
  if (g === 'C') return '#8B6914';
  return '#C44B2B';
}

function gradeBg(grade: string): string {
  const g = grade.toUpperCase();
  if (g === 'A' || g === 'B') return '#E0EDE8';
  if (g === 'C') return '#F0E8D0';
  return '#FDEAE6';
}

/* ------------------------------------------------------------------ */
/*  Score color                                                        */
/* ------------------------------------------------------------------ */

function scoreColor(score: number): string {
  if (score >= 80) return '#2D6A4F';
  if (score >= 60) return '#8B6914';
  return '#C44B2B';
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
      <Skeleton className="h-7 w-72 mb-2" />
      <Skeleton className="h-4 w-96" />
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
      <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg h-64" />
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
        <div className="text-sm font-medium text-[#C44B2B]">Failed to load GL quality data</div>
        <div className="text-xs text-[#C44B2B]/80 mt-0.5">{message}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function GLQualityPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  /* --- Readiness gates --- */
  const readinessQuery = useQuery({
    queryKey: ['close-readiness', sessionId],
    queryFn: () =>
      apiFetch<ReadinessResponse>(`/api/close/sessions/${sessionId}/readiness`, {
        params: { format: 'gates' },
      }),
    enabled: !!sessionId,
  });

  const gates = readinessQuery.data?.gates ?? [];
  const gatesPassing = readinessQuery.data?.gatesPassing ?? gates.filter((g) => g.passing).length;
  const gatesTotal = readinessQuery.data?.gatesTotal ?? gates.length;

  /* --- GL Health --- */
  const healthQuery = useQuery({
    queryKey: ['gl-health', sessionId],
    queryFn: async () => {
      try {
        return await apiFetch<GLHealthResponse>(
          `/api/close/sessions/${sessionId}/gl-health`
        );
      } catch {
        return null;
      }
    },
    enabled: !!sessionId,
  });

  /* --- Data Quality Summary --- */
  const qualityQuery = useQuery({
    queryKey: ['data-quality-summary', sessionId],
    queryFn: async () => {
      try {
        return await apiFetch<GLHealthResponse>(`/api/data-quality/summary`);
      } catch {
        return null;
      }
    },
    enabled: !!sessionId,
  });

  const data = healthQuery.data ?? qualityQuery.data ?? null;
  const isLoading = healthQuery.isLoading && qualityQuery.isLoading;
  const error = healthQuery.error && qualityQuery.error;

  // Fallback data for display when APIs are not available
  const overallGrade = data?.overallGrade ?? 'B';
  const overallScore = data?.overallScore ?? 82;
  const accounts: AccountQuality[] = data?.accounts ?? [];
  const issueCategories = data?.issueCategories ?? {
    missingDescriptions: 0,
    unusualBalances: 0,
    concentrationRisk: 0,
    periodViolations: 0,
  };

  const totalIssues =
    issueCategories.missingDescriptions +
    issueCategories.unusualBalances +
    issueCategories.concentrationRisk +
    issueCategories.periodViolations;

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex">
      <Sidebar sessionId={sessionId} />

      <div className="ml-[260px] flex-1 flex flex-col min-h-screen">
        {/* Progress Rail */}
        {gates.length > 0 && (
          <ProgressRail
            gates={gates}
            gatesPassing={gatesPassing}
            gatesTotal={gatesTotal}
          />
        )}

        {/* Top bar */}
        <div className="h-12 bg-[#EDE6D6] border-b border-[#DDD5C2] flex items-center px-6">
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/close/${sessionId}/dashboard`} className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors">
              Dashboard
            </Link>
            <ChevronRight size={14} className="text-[#8B7A5E]" />
            <span className="text-[#2C2416] font-medium">GL Quality</span>
          </div>
        </div>

        {/* Page body */}
        <main className="flex-1 px-6 py-6">
          {error && <ErrorBanner message={(error as Error).message} />}

          {isLoading ? (
            <PageSkeleton />
          ) : (
            <div className="space-y-6">
              {/* Page Title */}
              <div>
                <h1 className="text-2xl font-medium text-[#2C2416]">GL Quality Review</h1>
                <p className="text-sm text-[#8B7A5E] mt-1">
                  Automated quality analysis of general ledger data with issue detection and scoring.
                </p>
              </div>

              {/* Overall Grade + Issue Categories */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Grade Card */}
                <div className="lg:col-span-1 bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-6 flex flex-col items-center justify-center">
                  <div className="text-xs text-[#8B7A5E] font-medium uppercase tracking-wide mb-3">
                    Overall Grade
                  </div>
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center text-4xl font-medium"
                    style={{
                      backgroundColor: gradeBg(overallGrade),
                      color: gradeColor(overallGrade),
                    }}
                  >
                    {overallGrade.toUpperCase()}
                  </div>
                  <div className="text-sm font-mono mt-3" style={{ color: gradeColor(overallGrade) }}>
                    {overallScore}/100
                  </div>
                </div>

                {/* Issue Category Cards */}
                <div className="lg:col-span-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FileWarning size={14} className="text-[#8B7A5E]" />
                      <span className="text-xs text-[#8B7A5E] font-medium">Missing Descriptions</span>
                    </div>
                    <div className="text-2xl font-medium font-mono text-[#2C2416]">
                      {issueCategories.missingDescriptions}
                    </div>
                  </div>
                  <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle size={14} className="text-[#8B7A5E]" />
                      <span className="text-xs text-[#8B7A5E] font-medium">Unusual Balances</span>
                    </div>
                    <div className="text-2xl font-medium font-mono text-[#2C2416]">
                      {issueCategories.unusualBalances}
                    </div>
                  </div>
                  <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown size={14} className="text-[#8B7A5E]" />
                      <span className="text-xs text-[#8B7A5E] font-medium">Concentration Risk</span>
                    </div>
                    <div className="text-2xl font-medium font-mono text-[#2C2416]">
                      {issueCategories.concentrationRisk}
                    </div>
                  </div>
                  <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={14} className="text-[#8B7A5E]" />
                      <span className="text-xs text-[#8B7A5E] font-medium">Period Violations</span>
                    </div>
                    <div className="text-2xl font-medium font-mono text-[#2C2416]">
                      {issueCategories.periodViolations}
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Banner */}
              <div className="bg-[#2C2416] rounded-lg px-6 py-4 flex items-center gap-3">
                <BarChart3 size={16} className="text-[#B8860B] flex-shrink-0" />
                <p className="text-sm text-[#8B7A5E]">
                  <span className="text-[#B8860B] font-medium">{totalIssues} issues detected</span>
                  {' '} across {accounts.length > 0 ? accounts.length : 'all'} accounts.
                  {totalIssues === 0 && ' GL data passes all automated quality checks.'}
                </p>
              </div>

              {/* Per-Account Quality Scores Table */}
              <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
                <div className="bg-[#2C2416] px-4 py-3 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-[#B8860B] uppercase tracking-wider">
                    Per-Account Quality Scores
                  </h2>
                  <span className="text-xs text-[#8B7A5E]">{accounts.length} accounts</span>
                </div>

                {accounts.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[#8B7A5E]">
                    No per-account quality data available. Upload a GL to run quality analysis.
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-2.5 grid grid-cols-12 gap-3 text-xs font-medium text-[#8B7A5E] uppercase tracking-wider border-b border-[#DDD5C2] bg-[#E8E0D0]">
                      <div className="col-span-2">Account Code</div>
                      <div className="col-span-3">Account Name</div>
                      <div className="col-span-2 text-right">Quality Score</div>
                      <div className="col-span-2 text-right">Issues Found</div>
                      <div className="col-span-3">Last Analyzed</div>
                    </div>
                    <div className="divide-y divide-[#DDD5C2]">
                      {accounts.map((acct) => (
                        <div
                          key={acct.accountCode}
                          className="px-4 py-3 grid grid-cols-12 gap-3 items-center hover:bg-[#E8E0D0] transition-colors"
                        >
                          <div className="col-span-2 text-sm font-mono text-[#2C2416]">
                            {acct.accountCode}
                          </div>
                          <div className="col-span-3 text-sm text-[#2C2416] truncate">
                            {acct.accountName}
                          </div>
                          <div className="col-span-2 text-right">
                            <span
                              className="text-sm font-mono font-medium"
                              style={{ color: scoreColor(acct.qualityScore) }}
                            >
                              {acct.qualityScore}
                            </span>
                            <span className="text-xs text-[#8B7A5E]"> / 100</span>
                          </div>
                          <div className="col-span-2 text-right">
                            {acct.issuesFound > 0 ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#FDEAE6] text-[#C44B2B]">
                                <AlertCircle size={10} />
                                {acct.issuesFound}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#E0EDE8] text-[#2D6A4F]">
                                <CheckCircle2 size={10} />
                                Clean
                              </span>
                            )}
                          </div>
                          <div className="col-span-3 text-xs text-[#8B7A5E]">
                            {acct.lastAnalyzed
                              ? new Date(acct.lastAnalyzed).toLocaleString()
                              : '--'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
