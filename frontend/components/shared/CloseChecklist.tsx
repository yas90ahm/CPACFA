'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  User,
  Calendar,
  ArrowRight,
  ListChecks,
  Loader2,
  SkipForward,
} from 'lucide-react';
import {
  usePeriodChecklist,
  useCreatePeriodChecklist,
  useSessionChecklist,
  useInitializeChecklist,
  useCompleteChecklistItem,
  useSkipChecklistItem,
  useSignOffStep,
  type ChecklistStep,
  type ChecklistItem,
} from '@/lib/queries/checklist';
import { useAuth } from '@/lib/auth';
import { isReadOnly } from '@/lib/permissions';

// --- Dependency map: which steps depend on which ---
const DEPENDENCY_MAP: Record<string, string[]> = {
  'Reconcile TB and BS': ['Reconcile bank', 'Reconcile AR/AP subledgers'],
  'Close P&L and post to retained earnings': ['Review accruals and deferrals', 'Run depreciation'],
  'Lock period': ['Reconcile TB and BS', 'Close P&L and post to retained earnings'],
};

// Category grouping for steps
function categorizeStep(step: ChecklistStep): string {
  if (step.category) return step.category;
  const label = step.label.toLowerCase();
  if (label.includes('reconcil') || label.includes('bank') || label.includes('ar/ap')) return 'Reconciliation';
  if (label.includes('accrual') || label.includes('depreciation') || label.includes('close p&l')) return 'Adjustments';
  if (label.includes('lock') || label.includes('review') || label.includes('sign')) return 'Review';
  return 'General';
}

const CATEGORY_ORDER = ['Reconciliation', 'Adjustments', 'Review', 'Reporting', 'General'];

function StepStatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (status === 'skipped') return <SkipForward className="w-4 h-4 text-gray-500" />;
  if (status === 'in_progress') return <Loader2 className="w-4 h-4 text-[#7C5CFC] animate-spin" />;
  return <Circle className="w-4 h-4 text-gray-600" />;
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

interface CloseChecklistProps {
  sessionId: string;
  periodLabel: string;
  reconComplete: number;
  reconTotal: number;
  ajeTemplatesPending: number;
  statementsGenerated: boolean;
  varianceUnexplained: number;
  allJePosted: boolean;
}

export function CloseChecklist({
  sessionId,
  periodLabel,
  reconComplete,
  reconTotal,
  ajeTemplatesPending,
  statementsGenerated,
  varianceUnexplained,
  allJePosted,
}: CloseChecklistProps) {
  const { user } = useAuth();
  const role = user?.role ?? 'controller';
  const readOnly = isReadOnly(role);
  const userName = user?.email ?? user?.userId ?? 'Unknown';

  const { data: periodChecklist, isLoading: periodLoading } = usePeriodChecklist(periodLabel);
  const { data: sessionItems = [], isLoading: sessionLoading } = useSessionChecklist(sessionId);
  const createChecklist = useCreatePeriodChecklist();
  const initChecklist = useInitializeChecklist();
  const completeItem = useCompleteChecklistItem();
  const skipItem = useSkipChecklistItem();
  const signOff = useSignOffStep();

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [initialized, setInitialized] = useState(false);

  // Auto-initialize checklists if missing
  useEffect(() => {
    if (initialized) return;
    if (periodLoading || sessionLoading) return;
    setInitialized(true);

    if (!periodChecklist && periodLabel) {
      createChecklist.mutate({ periodLabel });
    }
    if (sessionItems.length === 0 && sessionId) {
      initChecklist.mutate(sessionId);
    }
  }, [periodLoading, sessionLoading, periodChecklist, sessionItems.length, periodLabel, sessionId, initialized, createChecklist, initChecklist]);

  const steps = periodChecklist?.steps ?? [];

  // Auto-derive status from actual completion
  const enrichedSteps = useMemo(() => {
    return steps.map((step) => {
      const s = { ...step };
      const label = s.label.toLowerCase();
      // Auto-complete based on actual data
      if (label.includes('reconcil') && label.includes('bank') && reconComplete === reconTotal && reconTotal > 0 && s.status === 'pending') {
        s.status = 'completed';
      }
      if (label.includes('depreciation') && ajeTemplatesPending === 0 && s.status === 'pending') {
        s.status = 'completed';
      }
      if (label.includes('accrual') && allJePosted && s.status === 'pending') {
        s.status = 'completed';
      }
      return s;
    });
  }, [steps, reconComplete, reconTotal, ajeTemplatesPending, allJePosted]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, ChecklistStep[]> = {};
    for (const step of enrichedSteps) {
      const cat = categorizeStep(step);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(step);
    }
    return CATEGORY_ORDER
      .filter((cat) => groups[cat]?.length)
      .map((cat) => ({ category: cat, steps: groups[cat] }));
  }, [enrichedSteps]);

  // Critical path analysis
  const stats = useMemo(() => {
    const total = enrichedSteps.length + sessionItems.length;
    const completed = enrichedSteps.filter((s) => s.status === 'completed' || s.status === 'skipped').length +
      sessionItems.filter((i) => i.status === 'completed' || i.status === 'skipped').length;
    const blocking = total - completed;
    const overdue = enrichedSteps.filter((s) => {
      if (s.status === 'completed' || s.status === 'skipped') return false;
      if (!s.dueDate) return false;
      return new Date(s.dueDate) < new Date();
    }).length;
    const estimatedDays = Math.max(1, Math.ceil(blocking * 0.5));
    return { total, completed, blocking, overdue, estimatedDays };
  }, [enrichedSteps, sessionItems]);

  const toggleGroup = (cat: string) => {
    setExpandedGroups((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleSignOff = useCallback((step: ChecklistStep) => {
    if (!periodChecklist) return;
    signOff.mutate({
      periodLabel,
      stepId: step.id,
      signedOffBy: userName,
      steps: periodChecklist.steps,
    });
  }, [periodLabel, userName, periodChecklist, signOff]);

  const handleCompleteItem = useCallback((item: ChecklistItem) => {
    completeItem.mutate({ itemId: item.id, completedBy: userName });
  }, [userName, completeItem]);

  const handleSkipItem = useCallback((item: ChecklistItem) => {
    skipItem.mutate({ itemId: item.id, completedBy: userName, notes: 'Skipped by controller' });
  }, [userName, skipItem]);

  const isLoading = periodLoading || sessionLoading;

  if (isLoading) {
    return (
      <div className="bg-[#141829] border border-[#262C48] rounded-xl p-6 animate-pulse">
        <div className="h-5 w-40 bg-[#1e2235] rounded mb-4" />
        <div className="space-y-3">
          <div className="h-10 bg-[#1e2235] rounded" />
          <div className="h-10 bg-[#1e2235] rounded" />
          <div className="h-10 bg-[#1e2235] rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#141829] border border-[#262C48] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-[#1e2235]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#7C5CFC]/10 flex items-center justify-center">
              <ListChecks className="w-4 h-4 text-[#7C5CFC]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Close Checklist</h2>
              <p className="text-xs text-gray-600">{stats.completed}/{stats.total} tasks complete</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {stats.blocking > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-medium">
                <AlertTriangle className="w-3 h-3" />
                {stats.blocking} blocking · ~{stats.estimatedDays}d to cert
              </span>
            )}
            {stats.overdue > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium">
                <Clock className="w-3 h-3" />
                {stats.overdue} overdue
              </span>
            )}
            {stats.blocking === 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium">
                <CheckCircle2 className="w-3 h-3" />
                All tasks complete
              </span>
            )}
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-[#1e2235] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%`,
              background: stats.completed === stats.total ? '#34D399' : '#7C5CFC',
            }}
          />
        </div>
      </div>

      {/* Session Control Items */}
      {sessionItems.length > 0 && (
        <div className="px-5 py-3 border-b border-[#1e2235]">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Certification Controls</p>
          <div className="space-y-1">
            {sessionItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[#1a1d2e] transition-colors">
                <StepStatusIcon status={item.status} />
                <span className={cn(
                  'flex-1 text-xs',
                  item.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-300'
                )}>
                  {item.name}
                </span>
                {item.required && item.status === 'pending' && (
                  <span className="text-xs font-semibold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">REQUIRED</span>
                )}
                {!readOnly && item.status === 'pending' && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleCompleteItem(item)}
                      disabled={completeItem.isPending}
                      className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded bg-emerald-500/10"
                    >
                      Complete
                    </button>
                    {!item.required && (
                      <button
                        type="button"
                        onClick={() => handleSkipItem(item)}
                        disabled={skipItem.isPending}
                        className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded bg-gray-500/10"
                      >
                        Skip
                      </button>
                    )}
                  </div>
                )}
                {item.completedBy && (
                  <span className="text-xs text-gray-600">{item.completedBy}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grouped Period Steps */}
      {grouped.map(({ category, steps: groupSteps }) => {
        const isOpen = expandedGroups[category] !== false;
        const groupComplete = groupSteps.filter((s) => s.status === 'completed' || s.status === 'skipped').length;
        const groupTotal = groupSteps.length;
        const allDone = groupComplete === groupTotal;

        return (
          <div key={category} className="border-b border-[#1e2235] last:border-b-0">
            <button
              type="button"
              onClick={() => toggleGroup(category)}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[#1a1d2e] transition-colors"
            >
              {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-600" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-600" />}
              <span className={cn(
                'text-xs font-semibold uppercase tracking-wider',
                allDone ? 'text-emerald-400' : 'text-gray-400'
              )}>
                {category}
              </span>
              <span className="text-xs text-gray-600 tabular-nums">{groupComplete}/{groupTotal}</span>
              {allDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-auto" />}
            </button>
            {isOpen && (
              <div className="px-5 pb-3 space-y-1">
                {groupSteps.map((step) => {
                  const deps = DEPENDENCY_MAP[step.label];
                  const blockedBy = deps?.filter((dep) => {
                    const depStep = enrichedSteps.find((s) => s.label === dep);
                    return depStep && depStep.status !== 'completed' && depStep.status !== 'skipped';
                  });
                  const isBlocked = blockedBy && blockedBy.length > 0;

                  return (
                    <div
                      key={step.id}
                      className={cn(
                        'flex items-center gap-3 py-2 px-3 rounded-lg transition-colors',
                        isBlocked ? 'opacity-50' : 'hover:bg-[#0d1017]'
                      )}
                    >
                      <StepStatusIcon status={step.status} />
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'text-xs',
                          step.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-300'
                        )}>
                          {step.label}
                        </p>
                        {isBlocked && (
                          <p className="text-xs text-amber-500 mt-0.5">
                            Blocked by: {blockedBy!.join(', ')}
                          </p>
                        )}
                      </div>
                      {step.assignee && (
                        <span className="flex items-center gap-1 text-xs text-gray-600">
                          <User className="w-3 h-3" /> {step.assignee}
                        </span>
                      )}
                      {step.dueDate && (
                        <span className={cn(
                          'flex items-center gap-1 text-xs',
                          new Date(step.dueDate) < new Date() && step.status === 'pending' ? 'text-red-400' : 'text-gray-600'
                        )}>
                          <Calendar className="w-3 h-3" /> {formatDate(step.dueDate)}
                        </span>
                      )}
                      {!readOnly && step.status === 'pending' && !isBlocked && (
                        <button
                          type="button"
                          onClick={() => handleSignOff(step)}
                          disabled={signOff.isPending}
                          className="text-xs text-[#7C5CFC] hover:text-white px-2 py-1 rounded bg-[#7C5CFC]/10"
                        >
                          Sign Off
                        </button>
                      )}
                      {step.signedOffBy && (
                        <span className="text-xs text-emerald-500">✓ {step.signedOffBy}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {enrichedSteps.length === 0 && sessionItems.length === 0 && (
        <div className="p-8 text-center">
          <ListChecks className="w-6 h-6 mx-auto mb-2 text-gray-700" />
          <p className="text-xs text-gray-600">Initializing close checklist...</p>
        </div>
      )}
    </div>
  );
}
