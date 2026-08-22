'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cpu,
  DollarSign,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { ApiError, apiFetch } from '@/lib/api';

interface LearningStats {
  totalCorrections: number;
  uniquePatterns: number;
  crossTenantSignals: number;
  topCorrectedAccounts: Array<{
    pattern: string;
    count: number;
    currentMapping: string;
  }>;
  callLog: {
    totalCalls: number;
    totalCost: string;
    model: string;
    avgLatency: string;
    errors: number;
  };
}

type ModuleStatus = 'needs_review' | 'approved' | 'skipped' | 'not_applicable' | 'failed';

interface ModuleProposal {
  id: string;
  moduleName: string;
  standard?: string;
  status: ModuleStatus;
  jeId?: string;
  dataQualityFlags?: Array<{ message?: string; severity?: string }>;
}

interface ModuleProposalResponse {
  proposals: ModuleProposal[];
  summary: {
    total: number;
    needsReview: number;
    approved: number;
    skipped: number;
    notApplicable: number;
    failed: number;
  };
}

type TaskStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'waiting_human'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'skipped';

interface RunbookTask {
  id: string;
  taskCode: string;
  status: TaskStatus;
  blockedReason?: string;
  taskSnapshot: {
    title: string;
    capability: string;
    executionMode: 'deterministic' | 'agent_assisted' | 'human_review';
    approvalRequired: boolean;
  };
  result?: {
    agentWorkpaper?: {
      unavailable?: boolean;
      advisoryOnly?: boolean;
      conclusion?: string;
      callLogId?: string;
    };
  };
}

interface RunbookExecutionView {
  execution: {
    id: string;
    status: 'pending' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled';
  };
  tasks: RunbookTask[];
  summary: {
    total: number;
    completed: number;
    waitingHuman: number;
    blocked: number;
    active: number;
    pending: number;
  };
}

const MODULE_STATUS: Record<ModuleStatus, { label: string; className: string }> = {
  needs_review: { label: 'Review required', className: 'bg-[#F0E8D0] text-[#8B6914]' },
  approved: { label: 'Approved', className: 'bg-[#E0EDE8] text-[#2D6A4F]' },
  skipped: { label: 'Skipped', className: 'bg-[#EDE6D6] text-[#5C4F3A]' },
  not_applicable: { label: 'Not applicable', className: 'bg-[#EDE6D6] text-[#5C4F3A]' },
  failed: { label: 'Failed', className: 'bg-[#F5E4DE] text-[#C44B2B]' },
};

const TASK_STATUS: Record<TaskStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-[#EDE6D6] text-[#5C4F3A]' },
  queued: { label: 'Queued', className: 'bg-[#E0EAF5] text-[#3B6EA5]' },
  running: { label: 'Running', className: 'bg-[#E0EAF5] text-[#3B6EA5]' },
  waiting_human: { label: 'Review required', className: 'bg-[#F0E8D0] text-[#8B6914]' },
  blocked: { label: 'Blocked', className: 'bg-[#F5E4DE] text-[#C44B2B]' },
  completed: { label: 'Completed', className: 'bg-[#E0EDE8] text-[#2D6A4F]' },
  failed: { label: 'Failed', className: 'bg-[#F5E4DE] text-[#C44B2B]' },
  skipped: { label: 'Not applicable', className: 'bg-[#EDE6D6] text-[#5C4F3A]' },
};

function MetricCard({ label, value, tone = 'neutral' }: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) {
  const color = tone === 'good' ? '#2D6A4F' : tone === 'warn' ? '#8B6914' : tone === 'bad' ? '#C44B2B' : '#2C2416';
  return (
    <div className="rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] p-4">
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#8B7A5E]">{label}</div>
      <div className="mt-2 font-mono text-2xl font-medium" style={{ color }}>{value}</div>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[#C44B2B]/30 bg-[#F5E4DE] p-4 text-sm text-[#C44B2B]">
      <AlertCircle size={17} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export default function AIReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const learningQuery = useQuery({
    queryKey: ['ai-learning-stats', sessionId],
    queryFn: () => apiFetch<LearningStats>(`/api/close/sessions/${sessionId}/suggestions/learning-stats`),
    enabled: Boolean(sessionId),
  });

  const modulesQuery = useQuery({
    queryKey: ['module-proposals', sessionId],
    queryFn: () => apiFetch<ModuleProposalResponse>(`/api/close/sessions/${sessionId}/module-proposals`),
    enabled: Boolean(sessionId),
  });

  const runbookQuery = useQuery({
    queryKey: ['runbook-execution', sessionId],
    queryFn: async (): Promise<RunbookExecutionView | null> => {
      try {
        return await apiFetch<RunbookExecutionView>(`/api/close/runbook-executions/session/${sessionId}`);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: Boolean(sessionId),
  });

  const isLoading = learningQuery.isLoading || modulesQuery.isLoading || runbookQuery.isLoading;
  const runbook = runbookQuery.data;
  const agentTasks = runbook?.tasks.filter((task) => task.taskSnapshot.executionMode === 'agent_assisted') ?? [];
  const workpapers = agentTasks.filter((task) => task.result?.agentWorkpaper && !task.result.agentWorkpaper.unavailable).length;

  return (
    <div className="ml-[260px] min-h-screen bg-[#F5F0E8]">
      <div className="flex h-12 items-center border-b border-[#DDD5C2] bg-[#EDE6D6] px-6">
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/close/${sessionId}/dashboard`} className="text-[#8B7A5E] hover:text-[#5C4F3A]">Dashboard</Link>
          <ChevronRight size={14} className="text-[#8B7A5E]" />
          <span className="font-medium text-[#2C2416]">Agent activity</span>
        </div>
      </div>

      <main className="mx-auto max-w-[1180px] space-y-8 px-8 py-8">
        <header>
          <h1 className="text-2xl font-medium text-[#2C2416]">Agent & control activity</h1>
          <p className="mt-1 text-sm text-[#8B7A5E]">
            Persisted runbook outcomes, controller decisions, and recorded model usage. Missing data is shown as unavailable—never estimated.
          </p>
        </header>

        <div className="flex items-start gap-3 rounded-lg bg-[#2C2416] px-5 py-4">
          <ShieldCheck size={17} className="mt-0.5 shrink-0 text-[#B8860B]" />
          <p className="text-sm text-[#C9BCA5]">
            Frontier-model workpapers are advisory. Deterministic controls calculate and validate accounting results; required human approvals and ERP posting controls remain enforceable.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-[#8B7A5E]">
            <Loader2 size={24} className="mr-2 animate-spin" /> Loading recorded activity…
          </div>
        )}

        {!isLoading && (
          <>
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Bot size={17} className="text-[#B8860B]" />
                <h2 className="text-sm font-medium uppercase tracking-wide text-[#5C4F3A]">Close runbook agents</h2>
              </div>
              {runbookQuery.error ? (
                <ErrorPanel message={(runbookQuery.error as Error).message} />
              ) : !runbook ? (
                <div className="rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] p-5 text-sm text-[#5C4F3A]">
                  No runbook execution is recorded for this close session. Configure and activate a runbook, or open the runbook page to start an eligible existing close.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                    <MetricCard label="All tasks" value={runbook.summary.total} />
                    <MetricCard label="Completed" value={runbook.summary.completed} tone="good" />
                    <MetricCard label="Running" value={runbook.summary.active} />
                    <MetricCard label="Human review" value={runbook.summary.waitingHuman} tone={runbook.summary.waitingHuman ? 'warn' : 'good'} />
                    <MetricCard label="Blocked" value={runbook.summary.blocked} tone={runbook.summary.blocked ? 'bad' : 'good'} />
                    <MetricCard label="Agent workpapers" value={workpapers} />
                  </div>
                  <div className="overflow-hidden rounded-lg border border-[#DDD5C2] bg-[#EDE6D6]">
                    <div className="border-b border-[#DDD5C2] px-4 py-3 text-xs text-[#8B7A5E]">
                      Agent-assisted tasks only. Full deterministic and human task graph is available in the <Link className="font-medium text-[#3B6EA5] hover:underline" href={`/close/${sessionId}/runbook`}>runbook controller</Link>.
                    </div>
                    {agentTasks.length === 0 ? (
                      <div className="p-5 text-sm text-[#5C4F3A]">This approved runbook contains no agent-assisted tasks.</div>
                    ) : (
                      <div className="divide-y divide-[#DDD5C2]">
                        {agentTasks.map((task) => {
                          const status = TASK_STATUS[task.status];
                          const workpaper = task.result?.agentWorkpaper;
                          return (
                            <div key={task.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_auto]">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-xs text-[#8B7A5E]">{task.taskCode}</span>
                                  <span className="text-sm font-medium text-[#2C2416]">{task.taskSnapshot.title}</span>
                                  <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${status.className}`}>{status.label}</span>
                                </div>
                                <p className="mt-1 text-xs text-[#8B7A5E]">
                                  Capability: {task.taskSnapshot.capability.replace(/_/g, ' ')}
                                  {task.taskSnapshot.approvalRequired ? ' · reviewer sign-off required' : ''}
                                </p>
                                {task.blockedReason && <p className="mt-2 text-xs text-[#C44B2B]">{task.blockedReason}</p>}
                                {workpaper?.unavailable && <p className="mt-2 text-xs text-[#8B6914]">Model workpaper unavailable; deterministic result remains recorded.</p>}
                                {workpaper?.conclusion && <p className="mt-2 text-xs text-[#5C4F3A]">{workpaper.conclusion}</p>}
                              </div>
                              <div className="text-right text-[10px] text-[#8B7A5E]">
                                {workpaper?.callLogId ? <>Call log<br /><span className="font-mono">{workpaper.callLogId.slice(0, 12)}…</span></> : 'No model call recorded'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={17} className="text-[#B8860B]" />
                <h2 className="text-sm font-medium uppercase tracking-wide text-[#5C4F3A]">Accounting module proposals</h2>
              </div>
              {modulesQuery.error ? (
                <ErrorPanel message={(modulesQuery.error as Error).message} />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                    <MetricCard label="Recorded" value={modulesQuery.data?.summary.total ?? 0} />
                    <MetricCard label="Approved" value={modulesQuery.data?.summary.approved ?? 0} tone="good" />
                    <MetricCard label="Review required" value={modulesQuery.data?.summary.needsReview ?? 0} tone={(modulesQuery.data?.summary.needsReview ?? 0) ? 'warn' : 'good'} />
                    <MetricCard label="Failed" value={modulesQuery.data?.summary.failed ?? 0} tone={(modulesQuery.data?.summary.failed ?? 0) ? 'bad' : 'good'} />
                    <MetricCard label="Skipped" value={modulesQuery.data?.summary.skipped ?? 0} />
                    <MetricCard label="Not applicable" value={modulesQuery.data?.summary.notApplicable ?? 0} />
                  </div>
                  {(modulesQuery.data?.proposals.length ?? 0) === 0 ? (
                    <div className="rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] p-5 text-sm text-[#5C4F3A]">No module proposals are recorded for this session.</div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {modulesQuery.data?.proposals.map((proposal) => {
                        const status = MODULE_STATUS[proposal.status];
                        const flagCount = Array.isArray(proposal.dataQualityFlags) ? proposal.dataQualityFlags.length : 0;
                        return (
                          <div key={proposal.id} className="rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-[#2C2416]">{proposal.moduleName.replace(/_/g, ' ')}</div>
                                {proposal.standard && <div className="mt-1 text-xs text-[#8B7A5E]">{proposal.standard}</div>}
                              </div>
                              <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${status.className}`}>{status.label}</span>
                            </div>
                            <div className="mt-3 text-xs text-[#8B7A5E]">
                              {proposal.jeId ? `Journal entry ${proposal.jeId}` : 'No journal entry linked'} · {flagCount} data-quality flag{flagCount === 1 ? '' : 's'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Activity size={17} className="text-[#B8860B]" />
                <h2 className="text-sm font-medium uppercase tracking-wide text-[#5C4F3A]">Recorded model usage & mapping learning</h2>
              </div>
              {learningQuery.error || !learningQuery.data ? (
                <ErrorPanel message={(learningQuery.error as Error | undefined)?.message ?? 'Recorded AI activity is unavailable.'} />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    <MetricCard label="Mapping corrections" value={learningQuery.data.totalCorrections} />
                    <MetricCard label="Unique patterns" value={learningQuery.data.uniquePatterns} />
                    <MetricCard label="Session AI calls" value={learningQuery.data.callLog.totalCalls} />
                    <MetricCard label="Recorded cost" value={learningQuery.data.callLog.totalCost} />
                    <MetricCard label="Errors" value={learningQuery.data.callLog.errors} tone={learningQuery.data.callLog.errors ? 'bad' : 'good'} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="flex items-center gap-3 rounded-lg border border-[#DDD5C2] bg-[#2C2416] px-4 py-3 text-sm">
                      <Cpu size={15} className="text-[#B8860B]" />
                      <span className="text-[#C9BCA5]">Latest model</span>
                      <span className="ml-auto font-mono text-[#B8860B]">{learningQuery.data.callLog.model}</span>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-[#DDD5C2] bg-[#2C2416] px-4 py-3 text-sm">
                      <Clock3 size={15} className="text-[#B8860B]" />
                      <span className="text-[#C9BCA5]">Average latency</span>
                      <span className="ml-auto font-mono text-[#B8860B]">{learningQuery.data.callLog.avgLatency}</span>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-[#DDD5C2] bg-[#2C2416] px-4 py-3 text-sm">
                      <DollarSign size={15} className="text-[#B8860B]" />
                      <span className="text-[#C9BCA5]">Usage scope</span>
                      <span className="ml-auto text-xs text-[#B8860B]">This close</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-[#8B7A5E]">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    Session totals include model calls carrying an explicit close-session key. Historical calls created before session provenance was added remain excluded rather than inferred.
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
