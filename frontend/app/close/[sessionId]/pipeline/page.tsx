'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  Upload,
  GitBranch,
  Scale,
  FileEdit,
  BarChart3,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  ChevronRight,
  LayoutDashboard,
  FolderClosed,
  Briefcase,
  ScrollText,
  Activity,
  Settings,
  Lock,
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
  closeDayTarget?: number;
}

/* ------------------------------------------------------------------ */
/*  Pipeline step definitions                                          */
/* ------------------------------------------------------------------ */

interface PipelineStep {
  number: number;
  title: string;
  description: string;
  gateIds: string[];
  icon: React.ElementType;
  href: (sid: string) => string;
}

const PIPELINE_STEPS: PipelineStep[] = [
  {
    number: 1,
    title: 'Upload & Balance Trial Balance',
    description:
      'Import the general ledger and verify that total debits equal total credits. The trial balance must be balanced before proceeding.',
    gateIds: ['tb_balanced'],
    icon: Upload,
    href: (sid) => `/close/${sid}/dashboard`,
  },
  {
    number: 2,
    title: 'Map Accounts to Reporting Lines',
    description:
      'Assign every GL account to a financial statement line item using the reporting taxonomy. AI suggestions are available for review.',
    gateIds: ['all_accounts_mapped'],
    icon: GitBranch,
    href: (sid) => `/close/${sid}/mapping`,
  },
  {
    number: 3,
    title: 'Reconcile Balance Sheet Accounts',
    description:
      'Match balance sheet accounts against source documents such as bank statements and subledger exports. Evidence upload required.',
    gateIds: ['recons_complete'],
    icon: Scale,
    href: (sid) => `/close/${sid}/reconciliation`,
  },
  {
    number: 4,
    title: 'Post Adjusting Journal Entries',
    description:
      'Apply recurring entries from templates and create manual one-time entries. Every JE must balance and include a memo.',
    gateIds: ['material_jes_approved'],
    icon: FileEdit,
    href: (sid) => `/close/${sid}/adjustments`,
  },
  {
    number: 5,
    title: 'Generate Financial Statements',
    description:
      'Produce the four certified statements (Balance Sheet, Income Statement, Cash Flow, Stockholders\u2019 Equity) from the adjusted trial balance.',
    gateIds: ['statements_current'],
    icon: BarChart3,
    href: (sid) => `/close/${sid}/review`,
  },
  {
    number: 6,
    title: 'Explain Material Variances',
    description:
      'Document all material period-over-period changes. AI can draft explanations, but each requires human confirmation.',
    gateIds: ['variances_explained'],
    icon: TrendingUp,
    href: (sid) => `/close/${sid}/variance`,
  },
  {
    number: 7,
    title: 'Review & Certify',
    description:
      'CFO reviews all gates, the system re-validates every check, and the close is signed with an Ed25519 digital signature. Terminal once locked.',
    gateIds: ['all_gates_pass', 'cfo_certified'],
    icon: ShieldCheck,
    href: (sid) => `/close/${sid}/review`,
  },
];

/* ------------------------------------------------------------------ */
/*  Nav items config                                                   */
/* ------------------------------------------------------------------ */

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, href: (sid: string) => `/close/${sid}/dashboard` },
  { label: 'Pipeline', icon: Activity, href: (sid: string) => `/close/${sid}/pipeline` },
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
          const isActive = item.label === 'Pipeline';
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href(sessionId)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#3B1F0A] text-[#B8860B]'
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
  sessionState,
  startedAt,
  closeDayTarget,
  activeStepLabel,
}: {
  gates: Gate[];
  gatesPassing: number;
  gatesTotal: number;
  sessionState: string;
  startedAt: string;
  closeDayTarget?: number;
  activeStepLabel: string;
}) {
  const dayElapsed = Math.max(
    1,
    Math.ceil((Date.now() - new Date(startedAt).getTime()) / (1000 * 60 * 60 * 24))
  );
  const targetDays = closeDayTarget ?? 10;

  return (
    <div className="bg-[#EDE6D6] border-b border-[#DDD5C2] px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-[#B8860B] font-medium">
          Gate {gatesPassing} of {gatesTotal}
        </span>
        <span className="text-[#8B7A5E]">
          Close Day {dayElapsed} of {targetDays}
        </span>
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#2C2416] text-[#B8860B]">
          {sessionState.replace(/_/g, ' ')}
        </span>
        <span className="text-[#8B7A5E] text-xs">{activeStepLabel}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {gates.map((gate) => (
          <div
            key={gate.id}
            className="w-2.5 h-2.5 rounded-full transition-colors"
            style={{ backgroundColor: gate.passing ? '#2D6A4F' : '#DDD5C2' }}
            title={`${gate.label}: ${gate.passing ? 'Passing' : 'Pending'}`}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step status helpers                                                */
/* ------------------------------------------------------------------ */

type StepStatus = 'complete' | 'active' | 'locked';

function deriveStepStatus(step: PipelineStep, gates: Gate[], previousComplete: boolean): StepStatus {
  const allPassing = step.gateIds.every((gid) => {
    const gate = gates.find((g) => g.id === gid);
    return gate?.passing ?? false;
  });
  if (allPassing) return 'complete';
  if (previousComplete) return 'active';
  return 'locked';
}

function getStepMetric(step: PipelineStep, gates: Gate[]): string {
  for (const gid of step.gateIds) {
    const gate = gates.find((g) => g.id === gid);
    if (gate?.detail) return gate.detail;
  }
  return '';
}

/* ------------------------------------------------------------------ */
/*  Step Card                                                          */
/* ------------------------------------------------------------------ */

function StepCard({
  step,
  status,
  metric,
  sessionId,
}: {
  step: PipelineStep;
  status: StepStatus;
  metric: string;
  sessionId: string;
}) {
  const Icon = step.icon;

  const statusConfig = {
    complete: {
      badge: 'Complete',
      badgeBg: 'bg-[#E0EDE8]',
      badgeText: 'text-[#2D6A4F]',
      circleBg: 'bg-[#2D6A4F]',
      circleText: 'text-white',
      borderClass: 'border-[#DDD5C2]',
      CircleIcon: CheckCircle2,
    },
    active: {
      badge: 'In Progress',
      badgeBg: 'bg-[#F0E8D0]',
      badgeText: 'text-[#8B6914]',
      circleBg: 'bg-[#B8860B]',
      circleText: 'text-white',
      borderClass: 'border-[#B8860B] border-2',
      CircleIcon: null,
    },
    locked: {
      badge: 'Locked',
      badgeBg: 'bg-[#EDE6D6]',
      badgeText: 'text-[#8B7A5E]',
      circleBg: 'bg-[#DDD5C2]',
      circleText: 'text-[#8B7A5E]',
      borderClass: 'border-[#DDD5C2]',
      CircleIcon: null,
    },
  };

  const cfg = statusConfig[status];

  const card = (
    <div
      className={`bg-[#EDE6D6] border ${cfg.borderClass} rounded-lg p-5 transition-colors ${
        status !== 'locked' ? 'hover:shadow-md cursor-pointer' : 'opacity-70'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Numbered circle */}
        <div className="flex flex-col items-center shrink-0">
          <div
            className={`w-10 h-10 rounded-full ${cfg.circleBg} ${cfg.circleText} flex items-center justify-center text-sm font-medium`}
          >
            {status === 'complete' ? (
              <CheckCircle2 size={20} />
            ) : (
              <span>{step.number}</span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <Icon size={16} className="text-[#8B7A5E] shrink-0" />
            <h3 className="text-sm font-medium text-[#2C2416] truncate">{step.title}</h3>
          </div>
          <p className="text-xs text-[#8B7A5E] leading-relaxed mt-1">{step.description}</p>
          <div className="flex items-center gap-2 mt-2 text-xs text-[#8B7A5E]">
            {step.gateIds.map((gid) => (
              <code
                key={gid}
                className="bg-[#F5F0E8] px-1.5 py-0.5 rounded text-[10px] font-mono text-[#8B7A5E]"
              >
                {gid}
              </code>
            ))}
          </div>
        </div>

        {/* Right side: metric + status badge */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.badgeBg} ${cfg.badgeText}`}
          >
            {cfg.badge}
          </span>
          {metric && (
            <span className="text-xs text-[#8B7A5E] text-right">{metric}</span>
          )}
        </div>
      </div>
    </div>
  );

  if (status === 'locked') return card;

  return (
    <Link href={step.href(sessionId)} className="block">
      {card}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Connector line between steps                                       */
/* ------------------------------------------------------------------ */

function StepConnector({ passing }: { passing: boolean }) {
  return (
    <div className="flex justify-start pl-[29px] py-0">
      <div
        className="w-0.5 h-4"
        style={{ backgroundColor: passing ? '#2D6A4F' : '#DDD5C2' }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#DDD5C2] rounded ${className}`} />;
}

function PipelineSkeleton() {
  return (
    <div className="space-y-4 max-w-3xl">
      <Skeleton className="h-7 w-80 mb-2" />
      <Skeleton className="h-4 w-64 mb-6" />
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i}>
          <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5">
            <div className="flex items-start gap-4">
              <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-4 w-48 mb-2" />
                <Skeleton className="h-3 w-full mb-1" />
                <Skeleton className="h-3 w-3/4" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full shrink-0" />
            </div>
          </div>
          {i < 7 && (
            <div className="flex justify-start pl-[29px] py-0">
              <Skeleton className="w-0.5 h-4" />
            </div>
          )}
        </div>
      ))}
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
        <div className="text-sm font-medium text-[#C44B2B]">Failed to load pipeline data</div>
        <div className="text-xs text-[#C44B2B]/80 mt-0.5">{message}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function ClosePipelinePage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

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

  const session = sessionQuery.data;
  const gates = readinessQuery.data?.gates ?? [];
  const gatesPassing = readinessQuery.data?.gatesPassing ?? 0;
  const gatesTotal = readinessQuery.data?.gatesTotal ?? 0;

  const isLoading = sessionQuery.isLoading || readinessQuery.isLoading;
  const error = sessionQuery.error || readinessQuery.error;

  // Derive statuses for each step
  const stepStatuses: StepStatus[] = [];
  let previousComplete = true; // Step 1 is always eligible
  for (const step of PIPELINE_STEPS) {
    const status = deriveStepStatus(step, gates, previousComplete);
    stepStatuses.push(status);
    previousComplete = status === 'complete';
  }

  // Find the active step label for the progress rail
  const activeIndex = stepStatuses.findIndex((s) => s === 'active');
  const activeStepLabel =
    activeIndex >= 0
      ? PIPELINE_STEPS[activeIndex].title
      : stepStatuses.every((s) => s === 'complete')
      ? 'All Steps Complete'
      : '';

  const periodLabel = session?.periodLabel ?? 'Close Session';

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex">
      {/* Sidebar */}
      <Sidebar sessionId={sessionId} />

      {/* Main content */}
      <div className="ml-[260px] flex-1 flex flex-col min-h-screen">
        {/* Top breadcrumb bar */}
        <div className="h-12 bg-[#EDE6D6] border-b border-[#DDD5C2] flex items-center px-6">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/close" className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors">
              Close Sessions
            </Link>
            <ChevronRight size={14} className="text-[#8B7A5E]" />
            <Link
              href={`/close/${sessionId}/dashboard`}
              className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors"
            >
              {periodLabel}
            </Link>
            <ChevronRight size={14} className="text-[#8B7A5E]" />
            <span className="text-[#2C2416] font-medium">Pipeline</span>
          </div>
        </div>

        {/* Progress Rail */}
        {gates.length > 0 && (
          <ProgressRail
            gates={gates}
            gatesPassing={gatesPassing}
            gatesTotal={gatesTotal}
            sessionState={session?.state ?? 'IN_PROGRESS'}
            startedAt={session?.startedAt ?? session?.createdAt ?? new Date().toISOString()}
            closeDayTarget={session?.closeDayTarget}
            activeStepLabel={activeStepLabel}
          />
        )}

        {/* Page body */}
        <main className="flex-1 px-6 py-6">
          {error && <ErrorBanner message={(error as Error).message} />}

          {isLoading ? (
            <PipelineSkeleton />
          ) : (
            <div className="max-w-3xl">
              {/* Page title */}
              <div className="mb-6">
                <h1 className="text-2xl font-medium text-[#2C2416]">
                  Close Pipeline
                </h1>
                <p className="text-sm text-[#8B7A5E] mt-1">
                  7 Steps to Certification &mdash; complete each gate in order to advance
                </p>
              </div>

              {/* Pipeline steps */}
              <div>
                {PIPELINE_STEPS.map((step, i) => (
                  <div key={step.number}>
                    <StepCard
                      step={step}
                      status={stepStatuses[i]}
                      metric={getStepMetric(step, gates)}
                      sessionId={sessionId}
                    />
                    {i < PIPELINE_STEPS.length - 1 && (
                      <StepConnector passing={stepStatuses[i] === 'complete'} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
