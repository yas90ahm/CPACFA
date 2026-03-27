'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronDown, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Types ────────────────────────────────────────────────────────────────── */

type StepStatus = 'complete' | 'active' | 'pending' | 'error';

interface StepperStep {
  id: string;
  label: string;
  status: StepStatus;
}

export interface CloseChecklistProps {
  sessionId: string;
  stepperSteps: Array<StepperStep>;
  mappedCount: number;
  totalAccounts: number;
  unmappedCount: number;
  reconComplete: number;
  reconTotal: number;
  reconsInProgress: number;
  ajeTemplatePending: number;
  ajeTemplateTotal: number;
  jesAwaitingApproval: number;
  statementsGenerated: boolean;
  statementsStale: boolean;
  varianceExplainedCount: number;
  varianceMaterialTotal: number;
  gatesPassing: number;
  gatesTotal: number;
  sessionState: string;
}

interface Task {
  name: string;
  href: string;
  status: StepStatus;
  detail: string;
}

interface Phase {
  number: number;
  title: string;
  status: StepStatus;
  summary: string;
  tasks: Task[];
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function getStepStatus(steps: StepperStep[], id: string): StepStatus {
  return steps.find((s) => s.id === id)?.status ?? 'pending';
}

function derivePhaseStatus(tasks: Task[]): StepStatus {
  if (tasks.every((t) => t.status === 'complete')) return 'complete';
  if (tasks.some((t) => t.status === 'error')) return 'error';
  if (tasks.some((t) => t.status === 'active')) return 'active';
  return 'pending';
}

function statusColor(status: StepStatus): string {
  switch (status) {
    case 'complete':
      return 'var(--status-success)';
    case 'active':
      return 'var(--interactive-primary)';
    case 'error':
      return 'var(--status-error)';
    default:
      return 'var(--text-tertiary)';
  }
}

function linkLabel(status: StepStatus): string {
  switch (status) {
    case 'complete':
      return 'View';
    case 'active':
      return 'Continue';
    default:
      return 'Start';
  }
}

/* ── Task status icon ─────────────────────────────────────────────────────── */

function TaskStatusIcon({ status }: { status: StepStatus }) {
  if (status === 'complete') {
    return (
      <CheckCircle2
        className="h-5 w-5 flex-shrink-0"
        style={{ color: 'var(--status-success)' }}
      />
    );
  }
  if (status === 'active') {
    return (
      <span
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: 'var(--interactive-primary)' }}
      >
        <span className="h-2 w-2 rounded-full bg-white" />
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2"
        style={{ borderColor: 'var(--status-error)', color: 'var(--status-error)' }}
      >
        <span className="text-xs font-bold leading-none">!</span>
      </span>
    );
  }
  // pending — dashed circle
  return (
    <span
      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2"
      style={{ borderColor: 'var(--text-tertiary)', borderStyle: 'dashed' }}
    />
  );
}

/* ── Phase row ────────────────────────────────────────────────────────────── */

function PhaseRow({
  phase,
  isLast,
  expanded,
  onToggle,
}: {
  phase: Phase;
  isLast: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const color = statusColor(phase.status);

  return (
    <div className="relative">
      {/* Vertical connecting line */}
      {!isLast && (
        <div
          className="absolute left-[19px] top-10 bottom-0 w-px"
          style={{ backgroundColor: 'var(--border-default)' }}
        />
      )}

      {/* Phase header */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'group flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-3',
          'text-left transition-colors hover:bg-[var(--bg-secondary)]',
        )}
      >
        {/* Numbered circle */}
        <span
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold"
          style={{
            backgroundColor: phase.status === 'complete' || phase.status === 'active' ? color : 'transparent',
            color:
              phase.status === 'complete' || phase.status === 'active'
                ? 'white'
                : color,
            border: phase.status === 'complete' || phase.status === 'active' ? 'none' : `2px solid ${color}`,
          }}
        >
          {phase.status === 'complete' ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            phase.number
          )}
        </span>

        {/* Title + summary */}
        <div className="min-w-0 flex-1">
          <span
            className="block text-sm font-semibold font-sans"
            style={{ color: 'var(--text-primary)' }}
          >
            {phase.title}
          </span>
          <span
            className="block text-xs font-sans"
            style={{ color: 'var(--text-secondary)' }}
          >
            {phase.summary}
          </span>
        </div>

        {/* Chevron */}
        <ChevronDown
          className={cn(
            'h-4 w-4 flex-shrink-0 transition-transform duration-200',
            expanded && 'rotate-180',
          )}
          style={{ color: 'var(--text-tertiary)' }}
        />
      </button>

      {/* Expanded task rows */}
      {expanded && (
        <div className="ml-[19px] border-l pl-6 pb-2" style={{ borderColor: 'var(--border-default)' }}>
          {phase.tasks.map((task) => (
            <div
              key={task.name}
              className="flex items-center gap-3 py-2.5 px-3"
            >
              <TaskStatusIcon status={task.status} />

              <div className="min-w-0 flex-1">
                <span
                  className="block text-sm font-sans"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {task.name}
                </span>
                <span
                  className="block text-xs font-sans"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {task.detail}
                </span>
              </div>

              <Link
                href={task.href}
                className="flex flex-shrink-0 items-center gap-1 text-xs font-medium transition-colors hover:opacity-80"
                style={{ color: 'var(--interactive-primary)' }}
              >
                {linkLabel(task.status)}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */

export function CloseChecklist(props: CloseChecklistProps) {
  const {
    sessionId,
    stepperSteps,
    mappedCount,
    totalAccounts,
    unmappedCount,
    reconComplete,
    reconTotal,
    reconsInProgress,
    ajeTemplatePending,
    ajeTemplateTotal,
    jesAwaitingApproval,
    statementsGenerated,
    statementsStale,
    varianceExplainedCount,
    varianceMaterialTotal,
    gatesPassing,
    gatesTotal,
    sessionState,
  } = props;

  /* ── Build phases ──────────────────────────────────────────────────────── */

  const phases: Phase[] = useMemo(() => {
    const uploadStatus = getStepStatus(stepperSteps, 'upload');
    const mapStatus = getStepStatus(stepperSteps, 'map');
    const reconStatus = getStepStatus(stepperSteps, 'recon');
    const adjustStatus = getStepStatus(stepperSteps, 'adjust');
    const generateStatus = getStepStatus(stepperSteps, 'generate');
    const varianceStatus = getStepStatus(stepperSteps, 'variance');
    const reviewStatus = getStepStatus(stepperSteps, 'review');
    const certifyStatus = getStepStatus(stepperSteps, 'certify');

    // Phase 1 — Prepare GL
    const p1Tasks: Task[] = [
      {
        name: 'Upload General Ledger',
        href: `/close/${sessionId}/trial-balance`,
        status: uploadStatus,
        detail: uploadStatus === 'complete' ? 'GL uploaded' : 'Upload CSV or sync from ERP',
      },
      {
        name: 'Map Chart of Accounts',
        href: `/close/${sessionId}/mapping`,
        status: mapStatus,
        detail:
          mapStatus === 'complete'
            ? `All ${totalAccounts} accounts mapped`
            : `${mappedCount} of ${totalAccounts} mapped${unmappedCount > 0 ? ` \u2022 ${unmappedCount} unmapped` : ''}`,
      },
    ];

    // Phase 2 — Reconcile Balance Sheet
    const p2Tasks: Task[] = [
      {
        name: 'Complete reconciliations',
        href: `/close/${sessionId}/reconciliation`,
        status: reconStatus,
        detail:
          reconStatus === 'complete'
            ? `All ${reconTotal} reconciliations complete`
            : `${reconComplete} of ${reconTotal} complete${reconsInProgress > 0 ? ` \u2022 ${reconsInProgress} in progress` : ''}`,
      },
    ];

    // Phase 3 — Post Adjusting Entries
    const templateDetail = (() => {
      if (adjustStatus === 'complete' && ajeTemplatePending === 0)
        return `All ${ajeTemplateTotal} templates resolved`;
      if (ajeTemplatePending > 0)
        return `${ajeTemplatePending} of ${ajeTemplateTotal} templates pending`;
      return `${ajeTemplateTotal} templates to review`;
    })();

    const p3Tasks: Task[] = [
      {
        name: 'Resolve AJE templates',
        href: `/close/${sessionId}/adjustments`,
        status: ajeTemplatePending === 0 && ajeTemplateTotal > 0 ? 'complete' : adjustStatus,
        detail: templateDetail,
      },
      {
        name: 'Review pending journal entries',
        href: `/close/${sessionId}/adjustments`,
        status: jesAwaitingApproval === 0 ? 'complete' : adjustStatus === 'active' ? 'active' : 'pending',
        detail:
          jesAwaitingApproval === 0
            ? 'No entries awaiting approval'
            : `${jesAwaitingApproval} awaiting approval`,
      },
    ];

    // Phase 4 — Generate & Review
    const stmtDetail = (() => {
      if (statementsGenerated && !statementsStale) return 'Statements generated';
      if (statementsGenerated && statementsStale) return 'Statements stale \u2014 regeneration needed';
      return 'Not yet generated';
    })();

    const p4Tasks: Task[] = [
      {
        name: 'Generate financial statements',
        href: `/close/${sessionId}/statements`,
        status: statementsStale
          ? 'error'
          : statementsGenerated
            ? 'complete'
            : generateStatus,
        detail: stmtDetail,
      },
      {
        name: 'Explain material variances',
        href: `/close/${sessionId}/variance`,
        status: varianceStatus,
        detail:
          varianceStatus === 'complete'
            ? `All ${varianceMaterialTotal} variances explained`
            : `${varianceExplainedCount} of ${varianceMaterialTotal} explained`,
      },
    ];

    // Phase 5 — Review & Certify
    const reviewDetail = (() => {
      if (sessionState === 'CERTIFIED' || sessionState === 'LOCKED') return 'Review complete';
      if (sessionState === 'UNDER_REVIEW') return 'Under CFO review';
      return 'Not yet submitted';
    })();

    const certifyDetail = (() => {
      if (sessionState === 'LOCKED') return 'Certified and locked';
      if (sessionState === 'CERTIFIED') return 'Certified';
      return `${gatesPassing} of ${gatesTotal} gates passing`;
    })();

    const p5Tasks: Task[] = [
      {
        name: 'Submit for CFO review',
        href: `/close/${sessionId}/review`,
        status: reviewStatus,
        detail: reviewDetail,
      },
      {
        name: 'Certify period',
        href: `/close/${sessionId}/review`,
        status: certifyStatus,
        detail: certifyDetail,
      },
    ];

    const buildPhase = (number: number, title: string, tasks: Task[]): Phase => {
      const status = derivePhaseStatus(tasks);
      const complete = tasks.filter((t) => t.status === 'complete').length;
      const summary =
        status === 'complete'
          ? 'All tasks complete'
          : `${complete} of ${tasks.length} tasks complete`;
      return { number, title, status, summary, tasks };
    };

    return [
      buildPhase(1, 'Prepare GL', p1Tasks),
      buildPhase(2, 'Reconcile Balance Sheet', p2Tasks),
      buildPhase(3, 'Post Adjusting Entries', p3Tasks),
      buildPhase(4, 'Generate & Review', p4Tasks),
      buildPhase(5, 'Review & Certify', p5Tasks),
    ];
  }, [
    sessionId,
    stepperSteps,
    mappedCount,
    totalAccounts,
    unmappedCount,
    reconComplete,
    reconTotal,
    reconsInProgress,
    ajeTemplatePending,
    ajeTemplateTotal,
    jesAwaitingApproval,
    statementsGenerated,
    statementsStale,
    varianceExplainedCount,
    varianceMaterialTotal,
    gatesPassing,
    gatesTotal,
    sessionState,
  ]);

  /* ── Determine initial expanded state ──────────────────────────────────── */

  const firstActiveIndex = phases.findIndex((p) => p.status !== 'complete');

  const [expandedMap, setExpandedMap] = useState<Record<number, boolean>>(() => {
    const map: Record<number, boolean> = {};
    phases.forEach((phase, idx) => {
      // Auto-expand the first non-complete phase; collapse complete phases
      map[phase.number] = idx === firstActiveIndex;
    });
    return map;
  });

  const togglePhase = (num: number) => {
    setExpandedMap((prev) => ({ ...prev, [num]: !prev[num] }));
  };

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <div
      className="rounded-[var(--radius-lg)] border bg-[var(--bg-surface)] shadow-[var(--shadow-sm)]"
      style={{ borderColor: 'var(--border-default)' }}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <h3
          className="text-base font-sans font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          Close Checklist
        </h3>
        <p
          className="mt-0.5 text-xs font-sans"
          style={{ color: 'var(--text-secondary)' }}
        >
          {phases.filter((p) => p.status === 'complete').length} of {phases.length} phases complete
        </p>
      </div>

      {/* Phase list */}
      <div className="px-2 pb-4">
        {phases.map((phase, idx) => (
          <PhaseRow
            key={phase.number}
            phase={phase}
            isLast={idx === phases.length - 1}
            expanded={!!expandedMap[phase.number]}
            onToggle={() => togglePhase(phase.number)}
          />
        ))}
      </div>
    </div>
  );
}

export default CloseChecklist;
