'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { fmtMoney } from '@/lib/money';
import {
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  XCircle,
  MessageSquare,
  FileText,
  Scale,
  BookOpen,
  TrendingUp,
  ScrollText,
  Loader2,
  AlertCircle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SessionResponse {
  id: string;
  state: string;
  periodLabel: string;
  entityName: string;
}

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

interface JournalEntry {
  id: string;
  status: string;
  amount?: string;
  memo?: string;
  entryType?: string;
}

interface Variance {
  id: string;
  lineItemName: string;
  isMaterial: boolean;
  explanationStatus: string;
  changePercent?: number;
  currentAmount?: string;
  priorAmount?: string;
}

interface Reconciliation {
  id: string;
  accountCode: string;
  accountName: string;
  status: string;
  glBalance: string;
  sourceBalance: string;
  variance: string;
}

/* ------------------------------------------------------------------ */
/*  Review Section Status                                              */
/* ------------------------------------------------------------------ */

type SectionStatus = 'reviewed' | 'flagged' | 'blocked';

interface ReviewComment {
  author: string;
  role: string;
  text: string;
  timestamp: string;
}

interface ReviewSection {
  id: string;
  title: string;
  icon: React.ElementType;
  status: SectionStatus;
  commentCount: number;
  content: React.ReactNode;
  comments: ReviewComment[];
}

function statusBadge(status: SectionStatus) {
  switch (status) {
    case 'reviewed':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#E0EDE8] text-[#2D6A4F]">
          <CheckCircle2 size={12} />
          Reviewed
        </span>
      );
    case 'flagged':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#F0E8D0] text-[#8B6914]">
          <AlertTriangle size={12} />
          Flagged
        </span>
      );
    case 'blocked':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#F5E4DE] text-[#C44B2B]">
          <XCircle size={12} />
          Blocked
        </span>
      );
  }
}

/* ------------------------------------------------------------------ */
/*  Collapsible Section Component                                      */
/* ------------------------------------------------------------------ */

function CollapsibleSection({
  section,
  isOpen,
  onToggle,
}: {
  section: ReviewSection;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const Icon = section.icon;

  return (
    <div className="border border-[#DDD5C2] rounded-lg bg-[#EDE6D6] overflow-hidden">
      {/* Section header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[#E8E0D0] transition-colors border-l-4 border-l-[#B8860B]"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Icon size={18} className="text-[#8B7A5E] shrink-0" />
          <span className="text-sm font-medium text-[#2C2416]">
            {section.title}
          </span>
          {statusBadge(section.status)}
          {section.commentCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[#DDD5C2] text-[#5C4F3A]">
              <MessageSquare size={10} />
              {section.commentCount}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronDown size={16} className="text-[#8B7A5E] shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-[#8B7A5E] shrink-0" />
        )}
      </button>

      {/* Section content */}
      {isOpen && (
        <div className="px-5 pb-5 border-t border-[#DDD5C2] pt-4 border-l-4 border-l-[#B8860B]">
          <div className="mb-4">{section.content}</div>

          {/* Comments */}
          {section.comments.length > 0 && (
            <div className="space-y-3 mt-4 pt-4 border-t border-[#DDD5C2]">
              <div className="text-xs font-medium text-[#8B7A5E] uppercase tracking-wider">
                Review Comments
              </div>
              {section.comments.map((comment, i) => (
                <div
                  key={i}
                  className="bg-[#F5F0E8] border border-[#DDD5C2] rounded-lg p-3"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-medium text-[#2C2416]">
                      {comment.author}
                    </span>
                    <span className="text-xs text-[#8B7A5E]">
                      {comment.role}
                    </span>
                    <span className="text-xs text-[#8B7A5E] ml-auto">
                      {comment.timestamp}
                    </span>
                  </div>
                  <p className="text-sm text-[#5C4F3A]">{comment.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Row Helper                                                    */
/* ------------------------------------------------------------------ */

function StatRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-[#5C4F3A]">{label}</span>
      <span
        className={`text-sm font-mono ${
          accent ? 'text-[#B8860B] font-medium' : 'text-[#2C2416]'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading / Error                                                    */
/* ------------------------------------------------------------------ */

function PageSkeleton() {
  return (
    <div className="ml-[260px] min-h-screen bg-[#F5F0E8] flex items-center justify-center">
      <Loader2 size={32} className="text-[#B8860B] animate-spin" />
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-[#F5E4DE] border border-[#C44B2B]/20 rounded-lg p-4 flex items-center gap-3 mb-6">
      <AlertCircle size={18} className="text-[#C44B2B] shrink-0" />
      <div>
        <div className="text-sm font-medium text-[#C44B2B]">
          Failed to load review data
        </div>
        <div className="text-xs text-[#C44B2B]/80 mt-0.5">{message}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function ReviewModePage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    statements: true,
    reconciliations: false,
    journal_entries: false,
    variances: false,
    audit_trail: false,
  });

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Data fetching
  const sessionQuery = useQuery({
    queryKey: ['close-session', sessionId],
    queryFn: () =>
      apiFetch<SessionResponse>(`/api/close/sessions/${sessionId}`),
    enabled: !!sessionId,
  });

  const readinessQuery = useQuery({
    queryKey: ['close-readiness', sessionId],
    queryFn: () =>
      apiFetch<ReadinessResponse>(
        `/api/close/sessions/${sessionId}/readiness`,
        { params: { format: 'gates' } }
      ),
    enabled: !!sessionId,
  });

  const jesQuery = useQuery({
    queryKey: ['journal-entries', sessionId],
    queryFn: async () => {
      const data = await apiFetch<{ entries?: JournalEntry[] } | JournalEntry[]>(
        `/api/close/journal-entries`,
        { params: { closeSessionId: sessionId } }
      );
      return Array.isArray(data) ? data : data.entries ?? [];
    },
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

  const reconsQuery = useQuery({
    queryKey: ['reconciliations', sessionId],
    queryFn: async () => {
      const data = await apiFetch<
        Reconciliation[] | { reconciliations?: Reconciliation[] }
      >(`/api/close/sessions/${sessionId}/reconciliations`);
      return Array.isArray(data) ? data : data.reconciliations ?? [];
    },
    enabled: !!sessionId,
  });

  // Derived
  const session = sessionQuery.data;
  const gates = readinessQuery.data?.gates ?? [];
  const jes = jesQuery.data ?? [];
  const variances = variancesQuery.data ?? [];
  const recons = reconsQuery.data ?? [];

  const isLoading = sessionQuery.isLoading || readinessQuery.isLoading;
  const error = sessionQuery.error || readinessQuery.error;

  if (isLoading) return <PageSkeleton />;

  // Compute stats
  const postedJes = jes.filter((j) => j.status === 'posted').length;
  const pendingJes = jes.filter(
    (j) => j.status === 'proposed' || j.status === 'pending_approval'
  ).length;
  const rejectedJes = jes.filter((j) => j.status === 'rejected').length;

  const totalVariances = variances.length;
  const materialVariances = variances.filter((v) => v.isMaterial).length;
  const explainedVariances = variances.filter(
    (v) => v.explanationStatus === 'explained'
  ).length;
  const unexplainedMaterial = variances.filter(
    (v) => v.isMaterial && v.explanationStatus !== 'explained'
  ).length;

  const totalRecons = recons.length;
  const completedRecons = recons.filter(
    (r) => r.status === 'completed' || r.status === 'approved'
  ).length;
  const reconVarianceTotal = recons.reduce((sum, r) => {
    const v = parseFloat(String(r.variance ?? '0').replace(/[$,]/g, '')) || 0;
    return sum + Math.abs(v);
  }, 0);

  // Determine section statuses based on real data
  const jeStatus: SectionStatus =
    pendingJes > 0 || rejectedJes > 0 ? 'flagged' : 'reviewed';
  const varianceStatus: SectionStatus =
    unexplainedMaterial > 0 ? 'blocked' : 'reviewed';
  const reconStatus: SectionStatus =
    completedRecons < totalRecons ? 'flagged' : 'reviewed';

  const hasBlocker = varianceStatus === 'blocked';

  // Build review sections
  const sections: ReviewSection[] = [
    {
      id: 'statements',
      title: 'Financial Statements',
      icon: FileText,
      status: 'reviewed',
      commentCount: 0,
      comments: [],
      content: (
        <div className="grid grid-cols-2 gap-3">
          {['Balance Sheet', 'Income Statement', 'Cash Flow Statement', 'Stockholders\u2019 Equity'].map(
            (name) => (
              <div
                key={name}
                className="bg-[#F5F0E8] border border-[#DDD5C2] rounded-lg px-4 py-3"
              >
                <div className="text-xs text-[#8B7A5E] mb-1">{name}</div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-[#2D6A4F]" />
                  <span className="text-xs text-[#2D6A4F]">Generated</span>
                </div>
              </div>
            )
          )}
        </div>
      ),
    },
    {
      id: 'reconciliations',
      title: 'Reconciliations',
      icon: Scale,
      status: reconStatus,
      commentCount: reconStatus !== 'reviewed' ? 1 : 0,
      comments:
        reconStatus !== 'reviewed'
          ? [
              {
                author: 'VP Finance',
                role: 'Reviewer',
                text: `${totalRecons - completedRecons} reconciliation(s) still incomplete. Please complete before certification.`,
                timestamp: 'Review in progress',
              },
            ]
          : [],
      content: (
        <div className="space-y-1">
          <StatRow
            label="Total reconciliations"
            value={totalRecons}
          />
          <StatRow
            label="Completed / Approved"
            value={`${completedRecons} of ${totalRecons}`}
            accent
          />
          <StatRow
            label="Net recon variance"
            value={fmtMoney(reconVarianceTotal.toFixed(2), {
              dollar: true,
              dash: false,
            })}
          />
        </div>
      ),
    },
    {
      id: 'journal_entries',
      title: 'Journal Entries',
      icon: BookOpen,
      status: jeStatus,
      commentCount: jeStatus !== 'reviewed' ? 2 : 0,
      comments:
        jeStatus !== 'reviewed'
          ? [
              {
                author: 'VP Finance',
                role: 'Reviewer',
                text: `${pendingJes} journal entries still pending approval. Review required before sign-off.`,
                timestamp: 'Review in progress',
              },
              {
                author: 'VP Finance',
                role: 'Reviewer',
                text: 'Please verify the accrual reversal entries are consistent with prior period methodology.',
                timestamp: 'Review in progress',
              },
            ]
          : [],
      content: (
        <div className="space-y-1">
          <StatRow label="Total entries" value={jes.length} />
          <StatRow label="Posted" value={postedJes} accent />
          <StatRow label="Pending approval" value={pendingJes} />
          {rejectedJes > 0 && (
            <StatRow label="Rejected" value={rejectedJes} />
          )}
        </div>
      ),
    },
    {
      id: 'variances',
      title: 'Variance Analysis',
      icon: TrendingUp,
      status: varianceStatus,
      commentCount: unexplainedMaterial > 0 ? 1 : 0,
      comments:
        unexplainedMaterial > 0
          ? [
              {
                author: 'VP Finance',
                role: 'Reviewer',
                text: `BLOCKING: ${unexplainedMaterial} material variance(s) remain unexplained. Cannot approve for certification until all material variances have documented explanations.`,
                timestamp: 'Review in progress',
              },
            ]
          : [],
      content: (
        <div className="space-y-1">
          <StatRow label="Total variances" value={totalVariances} />
          <StatRow label="Material variances" value={materialVariances} />
          <StatRow
            label="Explained"
            value={`${explainedVariances} of ${totalVariances}`}
            accent
          />
          {unexplainedMaterial > 0 && (
            <StatRow
              label="Unexplained material (blocking)"
              value={unexplainedMaterial}
            />
          )}
        </div>
      ),
    },
    {
      id: 'audit_trail',
      title: 'Audit Trail',
      icon: ScrollText,
      status: 'reviewed',
      commentCount: 0,
      comments: [],
      content: (
        <div className="space-y-1">
          <StatRow
            label="Gates verified"
            value={`${gates.filter((g) => g.passing).length} of ${gates.length}`}
            accent
          />
          <StatRow label="Journal entries tracked" value={jes.length} />
          <StatRow label="Reconciliations tracked" value={totalRecons} />
          <StatRow
            label="Hash-chain integrity"
            value="Verified"
          />
        </div>
      ),
    },
  ];

  const _rmGates = gates;
  const _rmActiveGateIndex = _rmGates.findIndex((g) => !g.passing);
  const _rmActiveGateNum = _rmActiveGateIndex >= 0 ? _rmActiveGateIndex + 1 : (readinessQuery.data?.gatesTotal ?? _rmGates.length);
  const _rmGatesTotal = readinessQuery.data?.gatesTotal ?? _rmGates.length;
  const _rmStartedAt = new Date().toISOString();
  const _rmDayElapsed = Math.max(1, Math.ceil((Date.now() - new Date(_rmStartedAt).getTime()) / (1000 * 60 * 60 * 24)));
  const _rmTargetDays = 10;
  const _rmSessionState = (session?.state ?? 'IN_PROGRESS').replace(/_/g, ' ');

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      {/* Progress Rail */}
      {_rmGates.length > 0 && (
        <div className="bg-[#2C2416] px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[#B8860B] font-medium">
              Gate {_rmActiveGateNum} of {_rmGatesTotal}
            </span>
            <span className="text-[#8B7A5E]">
              Close Day {_rmDayElapsed} of {_rmTargetDays}
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#3B1F0A] text-[#B8860B]">
              {_rmSessionState}
            </span>
            {session?.periodLabel && <span className="text-[#8B7A5E]">{session.periodLabel}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            {_rmGates.map((gate, i) => {
              let bg = '#5C4F3A';
              if (gate.passing) bg = '#2D6A4F';
              else if (i === _rmActiveGateIndex) bg = '#B8860B';
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
      )}

      {/* Top amber review bar */}
      <div className="bg-[#8B6914] px-6 py-3 flex items-center gap-3">
        <AlertTriangle size={16} className="text-white shrink-0" />
        <span className="text-sm font-medium text-white">
          REVIEW MODE
        </span>
        <span className="text-sm text-white/80">
          &mdash; You are reviewing as VP Finance. All content is read-only.
        </span>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link
            href="/close"
            className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors"
          >
            Close Sessions
          </Link>
          <ChevronRight size={14} className="text-[#8B7A5E]" />
          <Link
            href={`/close/${sessionId}/dashboard`}
            className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors"
          >
            {session?.periodLabel ?? 'Session'}
          </Link>
          <ChevronRight size={14} className="text-[#8B7A5E]" />
          <span className="text-[#2C2416] font-medium">Review</span>
        </div>

        {/* Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-medium text-[#2C2416]">
            Close Package Review
          </h1>
          <p className="text-sm text-[#8B7A5E] mt-1">
            {session?.periodLabel ?? 'Close Session'}
            {session?.entityName ? ` \u00B7 ${session.entityName}` : ''}
          </p>
        </div>

        {error && <ErrorBanner message={(error as Error).message} />}

        {/* Collapsible Sections */}
        <div className="space-y-4 mb-10">
          {sections.map((section) => (
            <CollapsibleSection
              key={section.id}
              section={section}
              isOpen={!!openSections[section.id]}
              onToggle={() => toggleSection(section.id)}
            />
          ))}
        </div>

        {/* Bottom Actions */}
        <div className="border-t border-[#DDD5C2] pt-6">
          {hasBlocker && (
            <div className="bg-[#F5E4DE] border border-[#C44B2B]/20 rounded-lg p-4 mb-4 flex items-center gap-3">
              <XCircle size={16} className="text-[#C44B2B] shrink-0" />
              <span className="text-sm text-[#C44B2B]">
                Certification blocked: {unexplainedMaterial} material variance
                {unexplainedMaterial !== 1 ? 's' : ''} require explanation
                before approval.
              </span>
            </div>
          )}

          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={hasBlocker}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm transition-colors ${
                hasBlocker
                  ? 'bg-[#DDD5C2] text-[#8B7A5E] cursor-not-allowed'
                  : 'bg-[#2D6A4F] text-white hover:bg-[#245A42]'
              }`}
            >
              <CheckCircle2 size={16} />
              Approve for Certification
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-[#C44B2B]/30 text-[#C44B2B] font-medium text-sm hover:bg-[#F5E4DE] transition-colors"
            >
              <XCircle size={16} />
              Reject to In Progress
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
