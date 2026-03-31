'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { fmtMoney } from '@/lib/money';
import {
  LayoutDashboard,
  FolderClosed,
  Briefcase,
  ScrollText,
  BarChart3,
  Activity,
  Settings,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Pencil,
  FileText,
  Loader2,
  TrendingUp,
  TrendingDown,
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

interface SessionResponse {
  id: string;
  state: string;
  periodLabel: string;
  entityName: string;
  startedAt: string;
  createdAt: string;
}

interface Variance {
  id: string;
  lineItemName: string;
  isMaterial: boolean;
  priorAmount?: string;
  currentAmount?: string;
  changeAmount?: string;
  changePercent?: number;
  explanationStatus: string;
  explanation?: string;
  explainedBy?: string;
  explainedAt?: string;
  materialityThreshold?: number;
}

interface AIDraft {
  explanation: string;
  confidence?: number;
  citations?: string[];
  ascReferences?: string[];
}

type FilterTab = 'all' | 'material' | 'unexplained' | 'explained';

/* ------------------------------------------------------------------ */
/*  Nav                                                                */
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
          return (
            <Link
              key={item.label}
              href={item.href(sessionId)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-[#8B7A5E] hover:text-[#B8860B] hover:bg-[#3B1F0A]/50 transition-colors"
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
  sessionState,
  unexplainedCount,
}: {
  gates: Gate[];
  gatesTotal: number;
  sessionState: string;
  unexplainedCount: number;
}) {
  const activeGateIndex = gates.findIndex((g) => !g.passing);
  const activeGateNum = activeGateIndex >= 0 ? activeGateIndex + 1 : gatesTotal;

  return (
    <div className="bg-[#2C2416] px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-[#B8860B] font-medium">
          Gate {activeGateNum} of {gatesTotal}
        </span>
        <span className="text-[#EDE6D6]">Variance Analysis</span>
        {unexplainedCount > 0 && (
          <span className="text-[#8B6914]">
            {unexplainedCount} unexplained
          </span>
        )}
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#3B1F0A] text-[#B8860B]">
          {unexplainedCount > 0 ? 'NEEDS ATTENTION' : sessionState.replace(/_/g, ' ')}
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
  count,
  color,
  bgColor,
}: {
  label: string;
  count: number;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
      <div className="text-xs text-[#8B7A5E] font-medium uppercase tracking-wider mb-2">{label}</div>
      <div className="text-2xl font-medium font-mono" style={{ color }}>
        {count}
      </div>
      <div
        className="mt-2 h-1 rounded-full"
        style={{ backgroundColor: bgColor, opacity: count > 0 ? 1 : 0.3 }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Filter Tabs                                                        */
/* ------------------------------------------------------------------ */

function FilterTabs({
  active,
  onChange,
  counts,
}: {
  active: FilterTab;
  onChange: (tab: FilterTab) => void;
  counts: Record<FilterTab, number>;
}) {
  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'material', label: 'Material' },
    { key: 'unexplained', label: 'Unexplained' },
    { key: 'explained', label: 'Explained' },
  ];

  return (
    <div className="flex items-center gap-1 bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            active === tab.key
              ? 'bg-[#2C2416] text-[#EDE6D6]'
              : 'text-[#8B7A5E] hover:text-[#2C2416]'
          }`}
        >
          {tab.label} ({counts[tab.key]})
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Variance Card                                                      */
/* ------------------------------------------------------------------ */

function VarianceCard({
  variance,
  sessionId,
  onExplained,
}: {
  variance: Variance;
  sessionId: string;
  onExplained: () => void;
}) {
  const [showDraft, setShowDraft] = useState(false);
  const [customExplanation, setCustomExplanation] = useState('');
  const [mode, setMode] = useState<'view' | 'edit' | 'custom'>('view');

  const isExplained = variance.explanationStatus === 'explained';
  const hasDraft =
    variance.explanationStatus === 'ai_drafted' || variance.explanationStatus === 'draft_ready';

  const draftQuery = useQuery({
    queryKey: ['ai-draft', sessionId, variance.id],
    queryFn: () =>
      apiFetch<AIDraft>(`/api/close/sessions/${sessionId}/variances/${variance.id}/ai-draft`),
    enabled: showDraft && !isExplained,
  });

  const queryClient = useQueryClient();

  const explainMutation = useMutation({
    mutationFn: (explanation: string) =>
      apiFetch(`/api/close/variances/${variance.id}/explain`, {
        method: 'POST',
        body: { explanation },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variances', sessionId] });
      onExplained();
    },
  });

  const changePercent = variance.changePercent ?? 0;
  const isPositive = changePercent >= 0;

  return (
    <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-medium text-[#2C2416]">{variance.lineItemName}</h3>
            {variance.isMaterial && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#F5E4DE] text-[#C44B2B] uppercase tracking-wider">
                Material
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isExplained ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-[#E0EDE8] text-[#2D6A4F]">
                <CheckCircle2 size={10} />
                Explained
              </span>
            ) : hasDraft ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-[#E0EAF5] text-[#3B6EA5]">
                <Sparkles size={10} />
                AI Draft Ready
                {draftQuery.data?.confidence != null && (
                  <span className="ml-1">{Math.round(draftQuery.data.confidence * 100)}%</span>
                )}
              </span>
            ) : null}
          </div>
        </div>

        {/* Amounts grid */}
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[#8B7A5E] mb-1">
              Prior Period
            </div>
            <div className="text-sm font-mono text-[#2C2416]">
              {fmtMoney(variance.priorAmount, { dollar: true, dash: true })}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[#8B7A5E] mb-1">
              Current Period
            </div>
            <div className="text-sm font-mono text-[#2C2416]">
              {fmtMoney(variance.currentAmount, { dollar: true, dash: true })}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[#8B7A5E] mb-1">
              Change
            </div>
            <div className="text-sm font-mono text-[#2C2416]">
              {fmtMoney(variance.changeAmount, { dollar: true, dash: true })}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[#8B7A5E] mb-1">
              % Change
            </div>
            <div
              className="text-sm font-mono font-medium flex items-center justify-center gap-1"
              style={{ color: Math.abs(changePercent) > 5 ? '#C44B2B' : '#2D6A4F' }}
            >
              {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {changePercent.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Explained state */}
        {isExplained && variance.explanation && (
          <div className="mt-4 bg-[#E0EDE8] border border-[#2D6A4F]/10 rounded px-4 py-3">
            <p className="text-xs text-[#2C2416] leading-relaxed">{variance.explanation}</p>
            {(variance.explainedBy || variance.explainedAt) && (
              <p className="text-[10px] text-[#8B7A5E] mt-2">
                Attested by {variance.explainedBy || 'Controller'}
                {variance.explainedAt && (
                  <> on {new Date(variance.explainedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                )}
              </p>
            )}
          </div>
        )}

        {/* AI Draft / Actions for unexplained */}
        {!isExplained && (
          <div className="mt-4 space-y-3">
            {/* Show AI draft */}
            {showDraft && draftQuery.data && mode !== 'custom' && (
              <div className="bg-[#E0EAF5] border border-[#3B6EA5]/10 rounded px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={12} className="text-[#3B6EA5]" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[#3B6EA5]">
                    AI Draft
                    {draftQuery.data.confidence != null && (
                      <> - {Math.round(draftQuery.data.confidence * 100)}% confidence</>
                    )}
                  </span>
                </div>
                <p className="text-xs text-[#2C2416] leading-relaxed mb-2">
                  {mode === 'edit' ? (
                    <textarea
                      className="w-full bg-[#F5F0E8] border border-[#DDD5C2] rounded px-3 py-2 text-xs text-[#2C2416] focus:outline-none focus:border-[#3B6EA5] resize-y min-h-[60px]"
                      defaultValue={draftQuery.data.explanation}
                      onChange={(e) => setCustomExplanation(e.target.value)}
                      rows={3}
                    />
                  ) : (
                    draftQuery.data.explanation
                  )}
                </p>
                {draftQuery.data.ascReferences && draftQuery.data.ascReferences.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {draftQuery.data.ascReferences.map((ref) => (
                      <span
                        key={ref}
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#F5F0E8] text-[#3B6EA5]"
                      >
                        {ref}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Custom explanation */}
            {mode === 'custom' && (
              <div>
                <textarea
                  className="w-full bg-[#F5F0E8] border border-[#DDD5C2] rounded px-3 py-2 text-xs text-[#2C2416] focus:outline-none focus:border-[#3B6EA5] resize-y"
                  placeholder="Write your variance explanation..."
                  value={customExplanation}
                  onChange={(e) => setCustomExplanation(e.target.value)}
                  rows={3}
                />
              </div>
            )}

            {/* Loading AI draft */}
            {showDraft && draftQuery.isLoading && (
              <div className="flex items-center gap-2 text-xs text-[#3B6EA5]">
                <Loader2 size={12} className="animate-spin" />
                Generating AI draft...
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {!showDraft && hasDraft && (
                <button
                  onClick={() => setShowDraft(true)}
                  className="px-3 py-1.5 text-xs font-medium rounded bg-[#E0EAF5] text-[#3B6EA5] hover:bg-[#3B6EA5] hover:text-[#E0EAF5] transition-colors flex items-center gap-1.5"
                >
                  <Sparkles size={12} />
                  View AI Draft
                </button>
              )}
              {showDraft && draftQuery.data && mode === 'view' && (
                <>
                  <button
                    onClick={() => explainMutation.mutate(draftQuery.data!.explanation)}
                    disabled={explainMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium rounded bg-[#2D6A4F] text-[#E0EDE8] hover:bg-[#245A42] transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {explainMutation.isPending ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={12} />
                    )}
                    Accept &amp; Attest
                  </button>
                  <button
                    onClick={() => {
                      setMode('edit');
                      setCustomExplanation(draftQuery.data!.explanation);
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded border border-[#DDD5C2] text-[#5C4F3A] hover:bg-[#DDD5C2] transition-colors flex items-center gap-1.5"
                  >
                    <Pencil size={12} />
                    Edit Draft
                  </button>
                </>
              )}
              {mode === 'edit' && (
                <button
                  onClick={() => {
                    if (customExplanation.trim()) explainMutation.mutate(customExplanation.trim());
                  }}
                  disabled={explainMutation.isPending || !customExplanation.trim()}
                  className="px-3 py-1.5 text-xs font-medium rounded bg-[#2D6A4F] text-[#E0EDE8] hover:bg-[#245A42] transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {explainMutation.isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={12} />
                  )}
                  Save &amp; Attest
                </button>
              )}
              {mode !== 'custom' && (
                <button
                  onClick={() => {
                    setMode('custom');
                    setCustomExplanation('');
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded border border-[#DDD5C2] text-[#5C4F3A] hover:bg-[#DDD5C2] transition-colors flex items-center gap-1.5"
                >
                  <FileText size={12} />
                  Write My Own
                </button>
              )}
              {mode === 'custom' && (
                <button
                  onClick={() => {
                    if (customExplanation.trim()) explainMutation.mutate(customExplanation.trim());
                  }}
                  disabled={explainMutation.isPending || !customExplanation.trim()}
                  className="px-3 py-1.5 text-xs font-medium rounded bg-[#2D6A4F] text-[#E0EDE8] hover:bg-[#245A42] transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {explainMutation.isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={12} />
                  )}
                  Submit &amp; Attest
                </button>
              )}
              {(mode === 'edit' || mode === 'custom') && (
                <button
                  onClick={() => setMode('view')}
                  className="px-3 py-1.5 text-xs font-medium rounded text-[#8B7A5E] hover:text-[#2C2416] transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
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
      <Skeleton className="h-7 w-80 mb-2" />
      <div className="grid grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4 h-24" />
        ))}
      </div>
      <Skeleton className="h-10 w-96" />
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5 h-48" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function VarianceAnalysisPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  /* --- Data fetching --- */

  const sessionQuery = useQuery({
    queryKey: ['close-session', sessionId],
    queryFn: () => apiFetch<SessionResponse>(`/api/close/sessions/${sessionId}`),
    enabled: !!sessionId,
  });

  const readinessQuery = useQuery({
    queryKey: ['close-readiness', sessionId],
    queryFn: () =>
      apiFetch<ReadinessResponse>(`/api/close/sessions/${sessionId}/readiness`, {
        params: { format: 'gates' },
      }),
    enabled: !!sessionId,
  });

  const variancesQuery = useQuery({
    queryKey: ['variances', sessionId],
    queryFn: async () => {
      const data = await apiFetch<Variance[] | { variances?: Variance[] }>(
        `/api/close/sessions/${sessionId}/variances`
      );
      return Array.isArray(data) ? data : data.variances ?? [];
    },
    enabled: !!sessionId,
  });

  /* --- Derived state --- */

  const session = sessionQuery.data;
  const gates = readinessQuery.data?.gates ?? [];
  const gatesTotal = readinessQuery.data?.gatesTotal ?? 0;
  const variances = variancesQuery.data ?? [];

  const materialVariances = variances.filter((v) => v.isMaterial);
  const explained = variances.filter((v) => v.explanationStatus === 'explained');
  const unexplained = variances.filter(
    (v) => v.explanationStatus !== 'explained' && v.isMaterial
  );
  const aiDraftsReady = variances.filter(
    (v) => v.explanationStatus === 'ai_drafted' || v.explanationStatus === 'draft_ready'
  );

  const counts: Record<FilterTab, number> = {
    all: variances.length,
    material: materialVariances.length,
    unexplained: unexplained.length,
    explained: explained.length,
  };

  const filteredVariances = variances.filter((v) => {
    if (activeTab === 'material') return v.isMaterial;
    if (activeTab === 'unexplained') return v.explanationStatus !== 'explained' && v.isMaterial;
    if (activeTab === 'explained') return v.explanationStatus === 'explained';
    return true;
  });

  const isLoading = sessionQuery.isLoading || variancesQuery.isLoading;
  const error = sessionQuery.error || variancesQuery.error;

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex">
      <Sidebar sessionId={sessionId} />

      <div className="ml-[260px] flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <div className="h-12 bg-[#EDE6D6] border-b border-[#DDD5C2] flex items-center px-6">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/close" className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors">
              Dashboard
            </Link>
            <ChevronRight size={14} className="text-[#8B7A5E]" />
            <Link
              href={`/close/${sessionId}/dashboard`}
              className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors"
            >
              {session?.periodLabel || 'Close Session'}
            </Link>
            <ChevronRight size={14} className="text-[#8B7A5E]" />
            <span className="text-[#2C2416] font-medium">Variance Analysis</span>
          </div>
        </div>

        {/* Progress Rail */}
        {gates.length > 0 && (
          <ProgressRail
            gates={gates}
            gatesTotal={gatesTotal}
            sessionState={session?.state ?? 'IN_PROGRESS'}
            unexplainedCount={unexplained.length}
          />
        )}

        {/* Page body */}
        <main className="flex-1 px-6 py-6">
          {error && (
            <div className="bg-[#F5E4DE] border border-[#C44B2B]/20 rounded-lg p-4 flex items-center gap-3 mb-6">
              <AlertTriangle size={18} className="text-[#C44B2B] shrink-0" />
              <div className="text-sm text-[#C44B2B]">{(error as Error).message}</div>
            </div>
          )}

          {isLoading ? (
            <PageSkeleton />
          ) : (
            <div className="space-y-6">
              {/* Title */}
              <div>
                <h1 className="text-lg font-medium text-[#2C2416]">
                  Period-over-Period Variance Analysis
                </h1>
                <p className="text-sm text-[#8B7A5E] mt-1">
                  Material variances exceeding the 5% threshold require documented explanation before
                  the close can advance.
                </p>
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <StatCard
                  label="Total Variances"
                  count={variances.length}
                  color="#2C2416"
                  bgColor="#DDD5C2"
                />
                <StatCard
                  label="Material >5%"
                  count={materialVariances.length}
                  color="#C44B2B"
                  bgColor="#F5E4DE"
                />
                <StatCard
                  label="Explained"
                  count={explained.length}
                  color="#2D6A4F"
                  bgColor="#E0EDE8"
                />
                <StatCard
                  label="Unexplained"
                  count={unexplained.length}
                  color="#8B6914"
                  bgColor="#F0E8D0"
                />
                <StatCard
                  label="AI Drafts Ready"
                  count={aiDraftsReady.length}
                  color="#3B6EA5"
                  bgColor="#E0EAF5"
                />
              </div>

              {/* Filter tabs */}
              <FilterTabs active={activeTab} onChange={setActiveTab} counts={counts} />

              {/* Variance cards */}
              {filteredVariances.length === 0 ? (
                <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-8 text-center">
                  <CheckCircle2 size={24} className="text-[#2D6A4F] mx-auto mb-3" />
                  <p className="text-sm text-[#5C4F3A]">
                    {activeTab === 'unexplained'
                      ? 'All material variances have been explained.'
                      : 'No variances match this filter.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredVariances.map((v) => (
                    <VarianceCard
                      key={v.id}
                      variance={v}
                      sessionId={sessionId}
                      onExplained={() =>
                        queryClient.invalidateQueries({ queryKey: ['variances', sessionId] })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
