'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock3,
  FileCheck2,
  FileUp,
  Loader2,
  LockKeyhole,
  Play,
  RefreshCw,
  ShieldCheck,
  SkipForward,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { ApiError, apiFetch, apiUpload } from '@/lib/api';
import { closeQueryKeys, closeSessionQueryOptions } from '@/lib/hooks/useCloseSession';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

type Frequency = 'monthly' | 'quarterly';
type RunbookStatus = 'draft' | 'approved' | 'archived';
type TaskStatus = 'pending' | 'queued' | 'running' | 'waiting_human' | 'blocked' | 'completed' | 'failed' | 'skipped';

interface CompilationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  taskCode?: string;
  sourceReference?: string;
}

interface CompiledTask {
  code: string;
  title: string;
  description: string;
  origin: 'company_runbook' | 'sabit_control';
  category: string;
  capability: string;
  executionMode: 'deterministic' | 'agent_assisted' | 'human_review';
  dependencies: string[];
  dueOffsetDays: number;
  assignee?: string;
  reviewer?: string;
  completionCriteria: string;
  approvalRequired: boolean;
  controlCode?: string;
}

interface CloseRunbook {
  id: string;
  entityId: string;
  name: string;
  version: number;
  framework: 'ASPE';
  frequency: Frequency;
  sourceFilename: string;
  sourceSha256: string;
  sourceRowCount: number;
  status: RunbookStatus;
  isActive: boolean;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  compiledPlan: {
    executable: boolean;
    tasks: CompiledTask[];
    issues: CompilationIssue[];
    coverage: {
      coveredByCompanyRunbook: string[];
      addedBySabit: string[];
      uncovered: string[];
    };
  };
}

interface TaskExecution {
  id: string;
  taskCode: string;
  status: TaskStatus;
  taskSnapshot: CompiledTask;
  result?: Record<string, unknown>;
  blockedReason?: string;
  assignedTo?: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}

interface ExecutionView {
  execution: {
    id: string;
    runbookId: string;
    status: 'pending' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled';
    startedAt?: string;
    completedAt?: string;
  };
  tasks: TaskExecution[];
  summary: {
    total: number;
    completed: number;
    waitingHuman: number;
    blocked: number;
    active: number;
    pending: number;
  };
}

interface ReviewSelection {
  task: TaskExecution;
  action: 'complete' | 'skip' | 'retry';
}

const STATUS_STYLE: Record<TaskStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-[#EDE6D6] text-[#8B7A5E]' },
  queued: { label: 'Queued', className: 'bg-[#E0EAF5] text-[#3B6EA5]' },
  running: { label: 'Agent running', className: 'bg-[#E0EAF5] text-[#3B6EA5]' },
  waiting_human: { label: 'Review required', className: 'bg-[#F0E8D0] text-[#8B6914]' },
  blocked: { label: 'Blocked', className: 'bg-[#F5E4DE] text-[#C44B2B]' },
  completed: { label: 'Complete', className: 'bg-[#E0EDE8] text-[#2D6A4F]' },
  failed: { label: 'Failed', className: 'bg-[#F5E4DE] text-[#C44B2B]' },
  skipped: { label: 'Not applicable', className: 'bg-[#EDE6D6] text-[#5C4F3A]' },
};

function StatusBadge({ status }: { status: TaskStatus }) {
  const style = STATUS_STYLE[status];
  return <span className={`rounded px-2 py-1 text-[11px] font-medium ${style.className}`}>{style.label}</span>;
}

function SummaryCard({ label, value, tone = 'neutral' }: { label: string; value: number | string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? '#2D6A4F' : tone === 'warn' ? '#8B6914' : tone === 'bad' ? '#C44B2B' : '#2C2416';
  return (
    <div className="rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] p-4">
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#8B7A5E]">{label}</div>
      <div className="mt-2 font-mono text-2xl font-medium" style={{ color }}>{value}</div>
    </div>
  );
}

function CompilationPanel({ runbook, onApprove, approving }: { runbook: CloseRunbook; onApprove: () => void; approving: boolean }) {
  const errors = runbook.compiledPlan.issues.filter((issue) => issue.severity === 'error');
  const warnings = runbook.compiledPlan.issues.filter((issue) => issue.severity === 'warning');
  const canApprove = runbook.status === 'draft' && runbook.compiledPlan.executable;

  return (
    <section className="rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#DDD5C2] px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-medium text-[#2C2416]">{runbook.name} v{runbook.version}</h2>
            {runbook.isActive && <span className="rounded bg-[#E0EDE8] px-2 py-0.5 text-[10px] font-medium text-[#2D6A4F]">ACTIVE</span>}
            <span className="rounded bg-[#2C2416] px-2 py-0.5 text-[10px] font-medium text-[#B8860B]">{runbook.status.toUpperCase()}</span>
          </div>
          <p className="mt-1 text-xs text-[#8B7A5E]">
            {runbook.sourceFilename} · {runbook.sourceRowCount} source rows · SHA-256 {runbook.sourceSha256.slice(0, 12)}…
          </p>
        </div>
        {canApprove && (
          <button
            type="button"
            onClick={onApprove}
            disabled={approving}
            className="inline-flex items-center gap-2 rounded-md bg-[#2D6A4F] px-4 py-2 text-sm font-medium text-white hover:bg-[#24583F] disabled:opacity-50"
          >
            {approving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            Approve & activate
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">
        <SummaryCard label="Compiled tasks" value={runbook.compiledPlan.tasks.length} />
        <SummaryCard label="Company controls" value={runbook.compiledPlan.coverage.coveredByCompanyRunbook.length} tone="good" />
        <SummaryCard label="Controls added by Sabit" value={runbook.compiledPlan.coverage.addedBySabit.length} tone="warn" />
        <SummaryCard label="Blocking errors" value={errors.length} tone={errors.length ? 'bad' : 'good'} />
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="border-t border-[#DDD5C2] px-5 py-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[#5C4F3A]">Compiler findings</h3>
          <div className="mt-3 space-y-2">
            {[...errors, ...warnings].map((issue, index) => (
              <div key={`${issue.code}-${issue.taskCode ?? index}`} className="flex items-start gap-2 rounded-md bg-[#F5F0E8] px-3 py-2">
                {issue.severity === 'error'
                  ? <XCircle size={14} className="mt-0.5 shrink-0 text-[#C44B2B]" />
                  : <AlertCircle size={14} className="mt-0.5 shrink-0 text-[#8B6914]" />}
                <div className="text-xs text-[#2C2416]">
                  <span className="font-medium">{issue.code.replace(/_/g, ' ')}</span>: {issue.message}
                  {issue.sourceReference && <span className="ml-1 text-[#8B7A5E]">({issue.sourceReference})</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="border-t border-[#DDD5C2] px-5 py-4">
        <summary className="cursor-pointer text-sm font-medium text-[#2C2416]">Inspect compiled task graph</summary>
        <div className="mt-3 space-y-2">
          {runbook.compiledPlan.tasks.map((task) => (
            <div key={task.code} className="rounded-md border border-[#DDD5C2] bg-[#F5F0E8] p-3" style={{ contentVisibility: 'auto', containIntrinsicSize: '80px' }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] text-[#8B7A5E]">{task.code}</span>
                <span className="text-sm font-medium text-[#2C2416]">{task.title}</span>
                <span className="rounded bg-[#EDE6D6] px-1.5 py-0.5 text-[10px] text-[#5C4F3A]">{task.origin === 'sabit_control' ? 'SABIT CONTROL' : 'COMPANY'}</span>
                <span className="rounded bg-[#E0EAF5] px-1.5 py-0.5 text-[10px] text-[#3B6EA5]">{task.capability.replace(/_/g, ' ')}</span>
              </div>
              {task.dependencies.length > 0 && <p className="mt-1 text-xs text-[#8B7A5E]">After: {task.dependencies.join(', ')}</p>}
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

function TaskRow({ task, onReview }: { task: TaskExecution; onReview: (selection: ReviewSelection) => void }) {
  const canResolve = ['waiting_human', 'blocked', 'failed'].includes(task.status);
  return (
    <article className="rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] p-4" style={{ contentVisibility: 'auto', containIntrinsicSize: '150px' }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} />
            <span className="font-mono text-[10px] text-[#8B7A5E]">{task.taskCode}</span>
            <span className="rounded bg-[#E0EAF5] px-1.5 py-0.5 text-[10px] text-[#3B6EA5]">{task.taskSnapshot.capability.replace(/_/g, ' ')}</span>
          </div>
          <h3 className="mt-2 text-sm font-medium text-[#2C2416]">{task.taskSnapshot.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-[#8B7A5E]">{task.taskSnapshot.description}</p>
          {task.blockedReason && <p className="mt-2 rounded bg-[#F5F0E8] px-3 py-2 text-xs text-[#5C4F3A]">{task.blockedReason}</p>}
          {task.taskSnapshot.dependencies.length > 0 && (
            <p className="mt-2 text-[11px] text-[#8B7A5E]">Depends on {task.taskSnapshot.dependencies.join(', ')}</p>
          )}
        </div>
        {canResolve && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {task.status === 'waiting_human' && (
              <button type="button" onClick={() => onReview({ task, action: 'complete' })} className="inline-flex items-center gap-1 rounded bg-[#2D6A4F] px-3 py-1.5 text-xs font-medium text-white">
                <UserCheck size={13} /> Review
              </button>
            )}
            <button type="button" onClick={() => onReview({ task, action: 'retry' })} className="inline-flex items-center gap-1 rounded border border-[#DDD5C2] bg-[#F5F0E8] px-3 py-1.5 text-xs font-medium text-[#5C4F3A]">
              <RefreshCw size={13} /> Retry
            </button>
            <button type="button" onClick={() => onReview({ task, action: 'skip' })} className="inline-flex items-center gap-1 rounded border border-[#DDD5C2] bg-[#F5F0E8] px-3 py-1.5 text-xs font-medium text-[#5C4F3A]">
              <SkipForward size={13} /> N/A
            </button>
          </div>
        )}
      </div>
      {task.result && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-[#5C4F3A]">Agent result and evidence references</summary>
          <pre className="mt-2 max-h-56 overflow-auto rounded bg-[#2C2416] p-3 text-[11px] text-[#EDE6D6]">{JSON.stringify(task.result, null, 2)}</pre>
        </details>
      )}
    </article>
  );
}

function ReviewPanel({ selection, notes, onNotes, onCancel, onSubmit, pending }: {
  selection: ReviewSelection;
  notes: string;
  onNotes: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  useKeyboardShortcuts([{ key: 'Escape', handler: onCancel, enabled: !pending }]);
  const notesRequired = selection.action !== 'retry';
  const title = selection.action === 'complete' ? 'Document reviewer conclusion' : selection.action === 'skip' ? 'Document not-applicable conclusion' : 'Retry registered capability';
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <div className="w-full max-w-lg rounded-xl border border-[#DDD5C2] bg-[#F5F0E8] p-5 shadow-xl">
        <h2 id="review-title" className="text-lg font-medium text-[#2C2416]">{title}</h2>
        <p className="mt-1 text-sm text-[#8B7A5E]">{selection.task.taskSnapshot.title}</p>
        {selection.action === 'skip' && (
          <p className="mt-3 rounded bg-[#F0E8D0] px-3 py-2 text-xs text-[#8B6914]">Only controls configured as conditional may be marked not applicable. The server will reject a prohibited skip.</p>
        )}
        <label htmlFor="review-notes" className="mt-4 block text-xs font-medium text-[#2C2416]">
          Reviewer note {notesRequired ? '(required)' : '(optional)'}
        </label>
        <textarea
          id="review-notes"
          rows={5}
          value={notes}
          onChange={(event) => onNotes(event.target.value)}
          placeholder={selection.action === 'retry' ? 'Describe the remediation, if helpful…' : 'State the work performed, evidence reviewed, and conclusion…'}
          className="mt-1.5 w-full rounded-md border border-[#DDD5C2] bg-white px-3 py-2 text-sm text-[#2C2416] outline-none focus:border-[#B8860B]"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={pending} className="rounded-md border border-[#DDD5C2] px-4 py-2 text-sm text-[#5C4F3A] disabled:opacity-50">Cancel</button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending || (notesRequired && !notes.trim())}
            className="inline-flex items-center gap-2 rounded-md bg-[#2C2416] px-4 py-2 text-sm font-medium text-[#B8860B] disabled:opacity-50"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CloseRunbookPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const queryClient = useQueryClient();
  const [name, setName] = useState('Canadian ASPE Close Runbook');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [file, setFile] = useState<File | null>(null);
  const [selectedRunbookId, setSelectedRunbookId] = useState<string | null>(null);
  const [reviewSelection, setReviewSelection] = useState<ReviewSelection | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const sessionQuery = useQuery(closeSessionQueryOptions(sessionId));
  const session = sessionQuery.data;

  const runbooksQuery = useQuery({
    queryKey: ['close-runbooks', session?.entityId, frequency],
    queryFn: () => apiFetch<{ runbooks: CloseRunbook[] }>('/api/close/runbooks', {
      params: { entityId: session?.entityId, frequency },
    }),
    enabled: Boolean(session?.entityId),
  });

  const executionQuery = useQuery({
    queryKey: closeQueryKeys.runbookExecution(sessionId),
    queryFn: async () => {
      try {
        return await apiFetch<ExecutionView>(`/api/close/runbook-executions/session/${sessionId}`);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: Boolean(sessionId),
    refetchInterval: (query) => {
      const status = query.state.data?.execution.status;
      return status && !['completed', 'cancelled'].includes(status) ? 3000 : false;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !session?.entityId) throw new Error('Choose a runbook file first.');
      const form = new FormData();
      form.append('file', file);
      form.append('entityId', session.entityId);
      form.append('name', name.trim() || file.name);
      form.append('frequency', frequency);
      return apiUpload<{ runbook: CloseRunbook }>('/api/close/runbooks/compile', form);
    },
    onSuccess: ({ runbook }) => {
      setSelectedRunbookId(runbook.id);
      queryClient.invalidateQueries({ queryKey: ['close-runbooks', session?.entityId, frequency] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (runbookId: string) => apiFetch<{ runbook: CloseRunbook }>(`/api/close/runbooks/${runbookId}/approve`, { method: 'POST' }),
    onSuccess: ({ runbook }) => {
      setSelectedRunbookId(runbook.id);
      queryClient.invalidateQueries({ queryKey: ['close-runbooks', session?.entityId, frequency] });
    },
  });

  const startMutation = useMutation({
    mutationFn: () => apiFetch<ExecutionView>(`/api/close/runbook-executions/session/${sessionId}/start`, {
      method: 'POST',
      body: { frequency },
    }),
    onSuccess: (view) => queryClient.setQueryData(closeQueryKeys.runbookExecution(sessionId), view),
  });

  const resolveMutation = useMutation({
    mutationFn: (input: { taskId: string; action: ReviewSelection['action']; notes: string }) =>
      apiFetch(`/api/close/runbook-task-executions/${input.taskId}`, {
        method: 'PATCH',
        body: { action: input.action, notes: input.notes },
      }),
    onSuccess: () => {
      setReviewSelection(null);
      setReviewNotes('');
      queryClient.invalidateQueries({ queryKey: closeQueryKeys.runbookExecution(sessionId) });
      queryClient.invalidateQueries({ queryKey: closeQueryKeys.readiness(sessionId) });
    },
  });

  function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    uploadMutation.mutate();
  }

  function openReview(selection: ReviewSelection) {
    setReviewSelection(selection);
    setReviewNotes('');
  }

  const runbooks = runbooksQuery.data?.runbooks ?? [];
  const selectedRunbook = runbooks.find((runbook) => runbook.id === selectedRunbookId)
    ?? runbooks.find((runbook) => runbook.isActive)
    ?? runbooks[0];
  const activeRunbook = runbooks.find((runbook) => runbook.isActive && runbook.status === 'approved');
  const execution = executionQuery.data;
  const profileValid = session?.standard?.toUpperCase() === 'ASPE' && session?.basis === 'accrual';
  const mutationError = uploadMutation.error || approveMutation.error || startMutation.error || resolveMutation.error;

  return (
    <div className="ml-[260px] min-h-screen bg-[#F5F0E8]">
      <div className="flex h-12 items-center border-b border-[#DDD5C2] bg-[#EDE6D6] px-6">
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/close/${sessionId}/dashboard`} className="text-[#8B7A5E] hover:text-[#5C4F3A]">Dashboard</Link>
          <ChevronRight size={14} className="text-[#8B7A5E]" />
          <span className="font-medium text-[#2C2416]">Runbook & Agents</span>
        </div>
      </div>

      <main className="mx-auto max-w-[1200px] space-y-6 px-6 py-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium text-[#2C2416]">Runbook Compiler & Close Agents</h1>
            <p className="mt-1 max-w-3xl text-sm text-[#8B7A5E]">
              Convert the company’s existing close procedures into a governed task graph. Approved versions start automatically with configured close cycles; this screen also supports catch-up starts.
            </p>
          </div>
          <div className={`rounded-md px-3 py-2 text-xs font-medium ${profileValid ? 'bg-[#E0EDE8] text-[#2D6A4F]' : 'bg-[#F5E4DE] text-[#C44B2B]'}`}>
            {profileValid ? 'ASPE · accrual · Canadian close profile' : 'Runbook requires ASPE accrual profile'}
          </div>
        </header>

        <section className="grid gap-3 rounded-lg border border-[#B8860B]/25 bg-[#2C2416] p-5 md:grid-cols-[1fr_auto]">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-[#B8860B]"><LockKeyhole size={16} /> Document security boundary</div>
            <p className="mt-2 text-xs leading-relaxed text-[#C8BDA7]">
              Uploaded text is parsed as untrusted business data, never executed as model instructions. It can select only code-owned capabilities. Sabit adds missing mandatory ASPE controls, and no document can grant approval, certification, period-lock, or unapproved ERP-posting authority.
            </p>
          </div>
          <div className="flex items-center gap-2 self-center rounded bg-[#3B1F0A] px-3 py-2 text-xs text-[#B8860B]"><ShieldCheck size={14} /> Human-controlled</div>
        </section>

        {mutationError && (
          <div className="flex items-start gap-2 rounded-lg border border-[#C44B2B]/20 bg-[#F5E4DE] p-4 text-sm text-[#C44B2B]">
            <AlertCircle size={17} className="mt-0.5 shrink-0" /> {(mutationError as Error).message}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="space-y-6">
            <form onSubmit={submitUpload} className="rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] p-5">
              <div className="flex items-center gap-2"><FileUp size={17} className="text-[#B8860B]" /><h2 className="text-base font-medium text-[#2C2416]">Upload company runbook</h2></div>
              <label htmlFor="runbook-name" className="mt-4 block text-xs font-medium text-[#5C4F3A]">Runbook name</label>
              <input id="runbook-name" value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-md border border-[#DDD5C2] bg-[#F5F0E8] px-3 py-2 text-sm outline-none focus:border-[#B8860B]" />
              <label htmlFor="runbook-frequency" className="mt-4 block text-xs font-medium text-[#5C4F3A]">Close frequency</label>
              <select id="runbook-frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as Frequency)} className="mt-1.5 w-full rounded-md border border-[#DDD5C2] bg-[#F5F0E8] px-3 py-2 text-sm outline-none focus:border-[#B8860B]">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
              <label htmlFor="runbook-file" className="mt-4 block text-xs font-medium text-[#5C4F3A]">File</label>
              <input id="runbook-file" type="file" accept=".csv,.xlsx,.json,.txt,.md,.pdf,.docx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-1.5 block w-full text-xs text-[#5C4F3A] file:mr-3 file:rounded file:border-0 file:bg-[#DDD5C2] file:px-3 file:py-2 file:text-xs file:font-medium file:text-[#2C2416]" />
              <p className="mt-2 text-[11px] text-[#8B7A5E]">CSV, XLSX, JSON, text, PDF, or DOCX · maximum 10 MB · legacy XLS is rejected</p>
              <button type="submit" disabled={!file || !profileValid || uploadMutation.isPending} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#B8860B] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#9C7209] disabled:opacity-50">
                {uploadMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <FileCheck2 size={15} />}
                Compile draft
              </button>
            </form>

            <section className="rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] p-5">
              <h2 className="text-sm font-medium text-[#2C2416]">Version history</h2>
              {runbooksQuery.isLoading ? <Loader2 size={18} className="mt-4 animate-spin text-[#8B7A5E]" /> : runbooks.length === 0 ? (
                <p className="mt-3 text-xs text-[#8B7A5E]">No {frequency} runbook has been compiled for this entity.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {runbooks.map((runbook) => (
                    <button key={runbook.id} type="button" onClick={() => setSelectedRunbookId(runbook.id)} className={`w-full rounded-md border p-3 text-left ${selectedRunbook?.id === runbook.id ? 'border-[#B8860B] bg-[#F5F0E8]' : 'border-[#DDD5C2] bg-transparent'}`}>
                      <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-[#2C2416]">v{runbook.version} · {runbook.name}</span>{runbook.isActive && <CheckCircle2 size={14} className="text-[#2D6A4F]" />}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-wide text-[#8B7A5E]">{runbook.status} · {new Date(runbook.createdAt).toLocaleDateString()}</div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-6">
            {selectedRunbook ? (
              <CompilationPanel runbook={selectedRunbook} onApprove={() => approveMutation.mutate(selectedRunbook.id)} approving={approveMutation.isPending} />
            ) : (
              <div className="rounded-lg border border-dashed border-[#DDD5C2] bg-[#EDE6D6] p-10 text-center">
                <CircleDashed size={24} className="mx-auto text-[#8B7A5E]" />
                <p className="mt-3 text-sm text-[#5C4F3A]">Upload a runbook to see coverage, compiler findings, and the bounded task graph.</p>
              </div>
            )}

            <section className="rounded-lg border border-[#DDD5C2] bg-[#F5F0E8] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><Bot size={18} className="text-[#B8860B]" /><h2 className="text-base font-medium text-[#2C2416]">Live close execution</h2></div>
                  <p className="mt-1 text-xs text-[#8B7A5E]">Period {session?.periodLabel ?? session?.periodEnd ?? '—'} · {session?.entityName ?? session?.entityId ?? '—'}</p>
                </div>
                {!execution && activeRunbook && (
                  <button type="button" onClick={() => startMutation.mutate()} disabled={!profileValid || startMutation.isPending} className="inline-flex items-center gap-2 rounded-md bg-[#2C2416] px-4 py-2 text-sm font-medium text-[#B8860B] disabled:opacity-50">
                    {startMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Start catch-up run
                  </button>
                )}
              </div>

              {!execution ? (
                <div className="mt-5 rounded-lg border border-dashed border-[#DDD5C2] bg-[#EDE6D6] p-6 text-center">
                  <Clock3 size={22} className="mx-auto text-[#8B7A5E]" />
                  <p className="mt-2 text-sm text-[#5C4F3A]">{activeRunbook ? 'The approved runbook will auto-start with the configured close cycle, or can be started here for this existing session.' : 'Approve an executable runbook to activate agent work.'}</p>
                </div>
              ) : (
                <>
                  <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
                    <SummaryCard label="Complete" value={execution.summary.completed} tone="good" />
                    <SummaryCard label="Agent active" value={execution.summary.active} />
                    <SummaryCard label="Human review" value={execution.summary.waitingHuman} tone="warn" />
                    <SummaryCard label="Blocked" value={execution.summary.blocked} tone={execution.summary.blocked ? 'bad' : 'neutral'} />
                    <SummaryCard label="Pending" value={execution.summary.pending} />
                  </div>
                  <div className="mt-5 space-y-3">
                    {execution.tasks.map((task) => <TaskRow key={task.id} task={task} onReview={openReview} />)}
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </main>

      {reviewSelection && (
        <ReviewPanel
          selection={reviewSelection}
          notes={reviewNotes}
          onNotes={setReviewNotes}
          onCancel={() => { setReviewSelection(null); setReviewNotes(''); }}
          onSubmit={() => resolveMutation.mutate({ taskId: reviewSelection.task.id, action: reviewSelection.action, notes: reviewNotes.trim() })}
          pending={resolveMutation.isPending}
        />
      )}
    </div>
  );
}
