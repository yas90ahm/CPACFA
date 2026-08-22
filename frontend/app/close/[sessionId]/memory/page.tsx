'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock3,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatCloseDateTime, humanizeCloseValue, shortCloseId } from '@/lib/close-presentation';
import { closeQueryKeys, closeSessionQueryOptions } from '@/lib/hooks/useCloseSession';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

type MemoryStatus = 'candidate' | 'approved' | 'superseded' | 'revoked';
type Applicability = 'one_time' | 'recurring' | 'policy_candidate';
type MemoryScope = 'transaction_pattern' | 'account' | 'entity';

interface LinePattern {
  accountRef: string;
  side: 'debit' | 'credit';
  descriptionTokens: string[];
}

interface AccountingMemory {
  id: string;
  status: MemoryStatus;
  patternSignature: string;
  subject: {
    memoTokens: string[];
    originalLinePattern: LinePattern[];
    originalSource: string;
  };
  treatment: {
    correctedMemo: string;
    correctedLinePattern: LinePattern[];
    amountPolicy: 'recalculate_from_current_period_source';
    requiresCurrentPeriodEvidence: true;
    reusableAmountsStored: false;
  };
  rationale: string;
  applicability: Applicability;
  memoryScope: MemoryScope;
  effectiveFromPeriod: string;
  effectiveToPeriod?: string;
  conflictsWithMemoryId?: string;
  approvedBy?: string;
  approvedAt?: string;
  resolutionReason?: string;
  createdAt: string;
  correctionCount: number;
  promotionRecommended: boolean;
}

interface CorrectionEvent {
  id: string;
  originalJournalEntryId: string;
  replacementJournalEntryId: string;
  beforeSnapshot: { memo?: string };
  afterSnapshot: { memo?: string };
  rationale: string;
  applicability: Applicability;
  memoryScope: MemoryScope;
  correctedBy: string;
  createdAt: string;
}

interface MemoryApplication {
  id: string;
  memoryId: string;
  targetType: 'journal_entry' | 'runbook_task' | 'close_session';
  targetId: string;
  outcome: 'context_supplied' | 'consistent' | 'conflict_blocked' | 'suggested' | 'accepted' | 'rejected';
  similarity: number;
  detail: Record<string, unknown>;
  appliedBy: string;
  createdAt: string;
}

interface MemoryView {
  corrections: CorrectionEvent[];
  memories: AccountingMemory[];
  applications: MemoryApplication[];
}

interface OrchestratorRun {
  id: string;
  status: 'active' | 'waiting_human' | 'completed' | 'stopped';
  maxDepth: number;
  maxSteps: number;
  stepsUsed: number;
  memoryContextCount: number;
  stopReason?: string;
  startedAt: string;
  updatedAt: string;
}

interface OrchestratorEvent {
  id: string;
  depth: number;
  eventType: string;
  sourceType?: string;
  sourceId?: string;
  decision: Record<string, unknown>;
  actor: string;
  createdAt: string;
}

interface RecoveryIncident {
  id: string;
  failureClass: string;
  status: 'open' | 'retry_scheduled' | 'resolved' | 'human_required' | 'stopped';
  autoRecoverable: boolean;
  attemptCount: number;
  maxAttempts: number;
  detail: Record<string, unknown>;
  resolution?: Record<string, unknown>;
  updatedAt: string;
}

interface OrchestratorView {
  run: OrchestratorRun | null;
  events: OrchestratorEvent[];
  incidents: RecoveryIncident[];
}

interface MemoryAction {
  memory: AccountingMemory;
  action: 'approve' | 'revoke';
}

const MEMORY_STATUS_STYLE: Record<MemoryStatus, string> = {
  candidate: 'bg-[#F0E8D0] text-[#8B6914]',
  approved: 'bg-[#E0EDE8] text-[#2D6A4F]',
  superseded: 'bg-[#EDE6D6] text-[#5C4F3A]',
  revoked: 'bg-[#F5E4DE] text-[#C44B2B]',
};

function SummaryCard({ label, value, detail, tone = 'neutral' }: { label: string; value: string | number; detail: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? '#2D6A4F' : tone === 'warn' ? '#8B6914' : tone === 'bad' ? '#C44B2B' : '#2C2416';
  return (
    <div className="rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] p-4">
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#8B7A5E]">{label}</div>
      <div className="mt-2 font-mono text-2xl font-medium" style={{ color }}>{value}</div>
      <div className="mt-1 text-[11px] text-[#8B7A5E]">{detail}</div>
    </div>
  );
}

function Pattern({ lines }: { lines: LinePattern[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {lines.map((line, index) => (
        <span key={`${line.accountRef}-${line.side}-${index}`} className={`rounded px-2 py-1 font-mono text-[11px] ${line.side === 'debit' ? 'bg-[#E0EAF5] text-[#3B6EA5]' : 'bg-[#F0E8D0] text-[#8B6914]'}`}>
          {line.side === 'debit' ? 'DR' : 'CR'} {line.accountRef}
        </span>
      ))}
    </div>
  );
}

function MemoryCard({ memory, onAction }: { memory: AccountingMemory; onAction: (action: MemoryAction) => void }) {
  const reusable = memory.status === 'approved' && memory.applicability !== 'one_time';
  return (
    <article className="rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${MEMORY_STATUS_STYLE[memory.status]}`}>{memory.status}</span>
            <span className="rounded bg-[#DDD5C2] px-2 py-1 text-[10px] font-medium text-[#5C4F3A]">{humanizeCloseValue(memory.applicability)}</span>
            <span className="rounded bg-[#DDD5C2] px-2 py-1 text-[10px] font-medium text-[#5C4F3A]">{humanizeCloseValue(memory.memoryScope)}</span>
          </div>
          <h3 className="mt-3 text-sm font-medium text-[#2C2416]">{memory.treatment.correctedMemo}</h3>
          <p className="mt-1 text-xs leading-relaxed text-[#5C4F3A]">{memory.rationale}</p>
        </div>
        <div className="text-right text-[11px] text-[#8B7A5E]">
          <div>Effective {memory.effectiveFromPeriod}{memory.effectiveToPeriod ? ` to ${memory.effectiveToPeriod}` : ''}</div>
          <div className="mt-1 font-mono">Pattern {memory.patternSignature.slice(0, 10)}…</div>
        </div>
      </div>

      <div className="mt-4 grid items-center gap-3 rounded-md border border-[#DDD5C2] bg-[#F5F0E8] p-3 md:grid-cols-[1fr_auto_1fr]">
        <div><div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[#8B7A5E]">Seen proposal</div><Pattern lines={memory.subject.originalLinePattern} /></div>
        <ArrowRight size={16} className="hidden text-[#B8860B] md:block" />
        <div><div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[#8B7A5E]">Supervisor treatment</div><Pattern lines={memory.treatment.correctedLinePattern} /></div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#DDD5C2] pt-3">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#8B7A5E]">
          <span>{memory.correctionCount} correction{memory.correctionCount === 1 ? '' : 's'} on this pattern</span>
          <span className={reusable ? 'text-[#2D6A4F]' : 'text-[#8B7A5E]'}>{reusable ? 'Eligible as future close context' : memory.applicability === 'one_time' ? 'Not loaded into later closes' : 'Not active'}</span>
          {memory.promotionRecommended && <span className="font-medium text-[#8B6914]">Repeated treatment — review for formal policy</span>}
        </div>
        <div className="flex gap-2">
          {memory.status === 'candidate' && <button type="button" onClick={() => onAction({ memory, action: 'approve' })} className="rounded-md bg-[#2D6A4F] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#245A42]">Approve treatment</button>}
          {(memory.status === 'candidate' || memory.status === 'approved') && <button type="button" onClick={() => onAction({ memory, action: 'revoke' })} className="rounded-md border border-[#C44B2B]/30 bg-[#F5E4DE] px-3 py-1.5 text-xs font-medium text-[#C44B2B] hover:bg-[#C44B2B] hover:text-white">Revoke</button>}
        </div>
      </div>
      {memory.conflictsWithMemoryId && <div className="mt-3 flex items-start gap-2 rounded-md bg-[#F0E8D0] px-3 py-2 text-xs text-[#8B6914]"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> Conflicts with active memory {shortCloseId(memory.conflictsWithMemoryId)}. Approval atomically supersedes the prior treatment.</div>}
      {memory.approvedBy && <div className="mt-3 text-[11px] text-[#8B7A5E]">Approved by {memory.approvedBy} · {formatCloseDateTime(memory.approvedAt)}</div>}
      {memory.resolutionReason && <div className="mt-2 text-[11px] text-[#8B7A5E]">Resolution: {memory.resolutionReason}</div>}
    </article>
  );
}

function MemoryActionDialog({ selection, onClose, onSubmit, pending, error }: { selection: MemoryAction; onClose: () => void; onSubmit: (reason: string) => void; pending: boolean; error?: Error | null }) {
  const [reason, setReason] = useState('');
  useKeyboardShortcuts([{ key: 'Escape', handler: onClose, enabled: !pending }]);
  const approving = selection.action === 'approve';
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2C2416]/60 p-4" role="dialog" aria-modal="true" aria-labelledby="memory-action-title">
      <div className="w-full max-w-lg rounded-xl border border-[#DDD5C2] bg-[#F5F0E8] p-6 shadow-2xl">
        <h2 id="memory-action-title" className="text-lg font-medium text-[#2C2416]">{approving ? 'Approve accounting treatment' : 'Revoke accounting memory'}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#8B7A5E]">{approving ? 'This makes the treatment available as governed context for applicable future closes. It does not authorize or post a journal entry.' : 'The correction fact and prior application history remain immutable; only future use stops.'}</p>
        <label htmlFor="memory-action-reason" className="mt-5 block text-xs font-medium text-[#5C4F3A]">Supervisor rationale</label>
        <textarea id="memory-action-reason" rows={4} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 w-full rounded-md border border-[#DDD5C2] bg-white px-3 py-2 text-sm outline-none focus:border-[#B8860B]" />
        {error && <div className="mt-3 rounded bg-[#F5E4DE] px-3 py-2 text-xs text-[#C44B2B]">{error.message}</div>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={pending} className="rounded-md border border-[#DDD5C2] px-4 py-2 text-sm font-medium text-[#5C4F3A] disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => onSubmit(reason.trim())} disabled={reason.trim().length < 10 || pending} className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${approving ? 'bg-[#2D6A4F]' : 'bg-[#C44B2B]'}`}>{pending && <Loader2 size={14} className="animate-spin" />}{approving ? 'Approve treatment' : 'Revoke memory'}</button>
        </div>
      </div>
    </div>
  );
}

function eventSummary(event: OrchestratorEvent): string {
  const action = typeof event.decision.action === 'string' ? event.decision.action : undefined;
  const reason = typeof event.decision.reason === 'string' ? event.decision.reason : undefined;
  return action ? humanizeCloseValue(action) : reason ?? humanizeCloseValue(event.eventType);
}

export default function LearningAndRecoveryPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<MemoryAction | null>(null);

  const sessionQuery = useQuery(closeSessionQueryOptions(sessionId));
  const memoryQuery = useQuery({
    queryKey: closeQueryKeys.accountingMemory(sessionId),
    queryFn: () => apiFetch<MemoryView>(`/api/close/sessions/${sessionId}/accounting-memory`),
    enabled: Boolean(sessionId),
  });
  const orchestratorQuery = useQuery({
    queryKey: closeQueryKeys.orchestrator(sessionId),
    queryFn: () => apiFetch<OrchestratorView>(`/api/close/sessions/${sessionId}/orchestrator`),
    enabled: Boolean(sessionId),
    refetchInterval: 15_000,
  });

  const actionMutation = useMutation({
    mutationFn: (input: { selection: MemoryAction; reason: string }) => apiFetch(`/api/close/accounting-memories/${input.selection.memory.id}/${input.selection.action}`, {
      method: 'POST',
      body: { reason: input.reason, closeSessionId: sessionId },
    }),
    onSuccess: () => {
      setSelection(null);
      queryClient.invalidateQueries({ queryKey: closeQueryKeys.accountingMemory(sessionId) });
      queryClient.invalidateQueries({ queryKey: closeQueryKeys.orchestrator(sessionId) });
    },
  });

  const memories = memoryQuery.data?.memories ?? [];
  const approvedReusable = useMemo(() => memories.filter((memory) => memory.status === 'approved' && memory.applicability !== 'one_time'), [memories]);
  const candidates = memories.filter((memory) => memory.status === 'candidate');
  const applications = memoryQuery.data?.applications ?? [];
  const conflictCount = applications.filter((application) => application.outcome === 'conflict_blocked').length;
  const run = orchestratorQuery.data?.run ?? null;
  const openIncidents = (orchestratorQuery.data?.incidents ?? []).filter((incident) => incident.status !== 'resolved');
  const error = sessionQuery.error || memoryQuery.error || orchestratorQuery.error;
  const periodLabel = sessionQuery.data?.periodLabel ?? sessionQuery.data?.periodEnd?.slice(0, 7) ?? 'Close session';

  return (
    <div className="ml-[260px] min-h-screen bg-[#F5F0E8]">
      <div className="flex h-12 items-center border-b border-[#DDD5C2] bg-[#EDE6D6] px-6">
        <div className="flex items-center gap-2 text-sm"><Link href={`/close/${sessionId}/dashboard`} className="text-[#8B7A5E] hover:text-[#5C4F3A]">Dashboard</Link><ChevronRight size={14} className="text-[#8B7A5E]" /><span className="font-medium text-[#2C2416]">Learning & Recovery</span></div>
      </div>

      <main className="mx-auto max-w-[1280px] space-y-6 px-6 py-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-medium text-[#2C2416]"><BrainCircuit size={24} className="text-[#B8860B]" /> Accounting Learning & Close Recovery</h1>
            <p className="mt-1 text-sm text-[#8B7A5E]">{sessionQuery.data?.entityName ?? 'Entity'} · {periodLabel} · {sessionQuery.data?.standard ?? 'ASPE'}</p>
          </div>
          <button type="button" onClick={() => { memoryQuery.refetch(); orchestratorQuery.refetch(); }} disabled={memoryQuery.isFetching || orchestratorQuery.isFetching} className="flex items-center gap-2 rounded-md border border-[#DDD5C2] bg-[#EDE6D6] px-3 py-2 text-xs font-medium text-[#5C4F3A] hover:bg-[#DDD5C2] disabled:opacity-50"><RefreshCw size={13} className={(memoryQuery.isFetching || orchestratorQuery.isFetching) ? 'animate-spin' : ''} /> Refresh actual state</button>
        </header>

        <section className="grid gap-4 rounded-lg border border-[#B8860B]/30 bg-[#2C2416] p-5 md:grid-cols-[1fr_auto]">
          <div><div className="flex items-center gap-2 text-sm font-medium text-[#B8860B]"><ShieldCheck size={16} /> Governed memory, not autonomous accounting policy</div><p className="mt-2 max-w-4xl text-xs leading-relaxed text-[#C8BDA7]">Human corrections are immutable facts. Only approved, entity-scoped ASPE treatments can inform a later close. Sabit supplies account direction and rationale—not prior amounts—and current-period evidence is always required. Memory never approves or posts an entry.</p></div>
          <div className="self-center rounded bg-[#3B1F0A] px-3 py-2 text-xs font-medium text-[#B8860B]">Prior amounts stored for reuse: NO</div>
        </section>

        {error && <div className="flex items-start gap-2 rounded-lg border border-[#C44B2B]/20 bg-[#F5E4DE] p-4 text-sm text-[#C44B2B]"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{(error as Error).message}</div>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCard label="Approved context" value={approvedReusable.length} detail="Reusable treatments for this entity" tone="good" />
          <SummaryCard label="Needs decision" value={candidates.length} detail="Conflicts or policy candidates" tone={candidates.length ? 'warn' : 'good'} />
          <SummaryCard label="Applied this close" value={applications.length} detail="Durable usage records" />
          <SummaryCard label="Blocked conflicts" value={conflictCount} detail="No silent treatment overrides" tone={conflictCount ? 'bad' : 'good'} />
          <SummaryCard label="Recovery budget" value={run ? `${run.stepsUsed}/${run.maxSteps}` : '—'} detail={run ? `Depth limit ${run.maxDepth}` : 'Starts with configured close'} tone={run?.status === 'stopped' ? 'bad' : run?.status === 'waiting_human' ? 'warn' : 'neutral'} />
        </section>

        {(memoryQuery.isLoading || orchestratorQuery.isLoading) && <div className="flex items-center justify-center gap-2 rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] py-16 text-sm text-[#8B7A5E]"><Loader2 size={18} className="animate-spin" /> Loading governed memory and recovery state…</div>}

        {!memoryQuery.isLoading && (
          <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
            <div className="space-y-6">
              <section>
                <div className="mb-3 flex items-end justify-between"><div><h2 className="text-base font-medium text-[#2C2416]">Entity accounting memory</h2><p className="mt-1 text-xs text-[#8B7A5E]">Versioned treatments learned from Close Supervisor corrections</p></div><span className="text-xs text-[#8B7A5E]">{memories.length} total versions</span></div>
                <div className="space-y-3">
                  {memories.length === 0 && <div className="rounded-lg border border-dashed border-[#C8BDA7] bg-[#EDE6D6] p-8 text-center"><BrainCircuit size={24} className="mx-auto text-[#8B7A5E]" /><div className="mt-2 text-sm font-medium text-[#2C2416]">No correction memory yet</div><p className="mt-1 text-xs text-[#8B7A5E]">Use “Correct & remember” on a proposed journal entry to create the first governed treatment.</p></div>}
                  {memories.map((memory) => <MemoryCard key={memory.id} memory={memory} onAction={(action) => { actionMutation.reset(); setSelection(action); }} />)}
                </div>
              </section>

              <section>
                <div className="mb-3"><h2 className="text-base font-medium text-[#2C2416]">This close’s correction facts</h2><p className="mt-1 text-xs text-[#8B7A5E]">Append-only before/after decisions; the underlying journal entries retain the amounts and provenance</p></div>
                <div className="space-y-3">
                  {(memoryQuery.data?.corrections ?? []).map((correction) => (
                    <article key={correction.id} className="rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-medium text-[#2C2416]"><History size={15} className="text-[#B8860B]" />{correction.beforeSnapshot.memo || shortCloseId(correction.originalJournalEntryId)}<ArrowRight size={13} className="text-[#8B7A5E]" />{correction.afterSnapshot.memo || shortCloseId(correction.replacementJournalEntryId)}</div><p className="mt-2 text-xs leading-relaxed text-[#5C4F3A]">{correction.rationale}</p></div><span className="text-[11px] text-[#8B7A5E]">{formatCloseDateTime(correction.createdAt)}</span></div>
                      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-[#8B7A5E]"><span>{humanizeCloseValue(correction.applicability)}</span><span>{humanizeCloseValue(correction.memoryScope)}</span><span>Supervisor: {correction.correctedBy}</span><span className="font-mono">Original {shortCloseId(correction.originalJournalEntryId)} · Replacement {shortCloseId(correction.replacementJournalEntryId)}</span></div>
                    </article>
                  ))}
                  {(memoryQuery.data?.corrections ?? []).length === 0 && <div className="rounded-lg border border-dashed border-[#C8BDA7] p-6 text-center text-xs text-[#8B7A5E]">No supervisor corrections have been recorded in this close.</div>}
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section className="rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] p-5">
                <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-medium text-[#2C2416]">Bounded Close Orchestrator</h2><p className="mt-1 text-xs text-[#8B7A5E]">Safe retries and human stop conditions</p></div>{run && <span className={`rounded px-2 py-1 text-[10px] font-medium uppercase ${run.status === 'active' ? 'bg-[#E0EDE8] text-[#2D6A4F]' : run.status === 'waiting_human' ? 'bg-[#F0E8D0] text-[#8B6914]' : 'bg-[#F5E4DE] text-[#C44B2B]'}`}>{humanizeCloseValue(run.status)}</span>}</div>
                {run ? <div className="mt-4"><div className="flex justify-between text-[11px] text-[#8B7A5E]"><span>Step budget</span><span>{run.stepsUsed} of {run.maxSteps}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#DDD5C2]"><div className="h-full rounded-full bg-[#B8860B]" style={{ width: `${Math.min(100, (run.stepsUsed / run.maxSteps) * 100)}%` }} /></div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div className="rounded bg-[#F5F0E8] p-3"><span className="text-[#8B7A5E]">Depth cap</span><div className="mt-1 font-mono text-lg text-[#2C2416]">{run.maxDepth}</div></div><div className="rounded bg-[#F5F0E8] p-3"><span className="text-[#8B7A5E]">Memory loaded</span><div className="mt-1 font-mono text-lg text-[#2C2416]">{run.memoryContextCount}</div></div></div>{run.stopReason && <div className="mt-3 rounded bg-[#F5E4DE] px-3 py-2 text-xs text-[#C44B2B]">{run.stopReason}</div>}</div> : <div className="mt-5 rounded-md border border-dashed border-[#C8BDA7] p-5 text-center"><CircleDashed size={20} className="mx-auto text-[#8B7A5E]" /><p className="mt-2 text-xs text-[#8B7A5E]">No orchestrator run exists yet. It starts automatically when the configured close cycle opens or when an approved runbook is started.</p></div>}
              </section>

              <section>
                <div className="mb-3 flex items-end justify-between"><div><h2 className="text-base font-medium text-[#2C2416]">Recovery incidents</h2><p className="mt-1 text-xs text-[#8B7A5E]">Operational retries are bounded; accounting judgment stops here</p></div><span className="text-xs text-[#8B7A5E]">{openIncidents.length} open</span></div>
                <div className="space-y-2">
                  {(orchestratorQuery.data?.incidents ?? []).map((incident) => (
                    <div key={incident.id} className="rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-[#2C2416]">{humanizeCloseValue(incident.failureClass)}</span><span className={`rounded px-2 py-1 text-[10px] font-medium uppercase ${incident.status === 'resolved' ? 'bg-[#E0EDE8] text-[#2D6A4F]' : incident.status === 'retry_scheduled' ? 'bg-[#E0EAF5] text-[#3B6EA5]' : 'bg-[#F0E8D0] text-[#8B6914]'}`}>{humanizeCloseValue(incident.status)}</span></div><p className="mt-2 text-xs leading-relaxed text-[#5C4F3A]">{typeof incident.detail.error === 'string' ? incident.detail.error : 'See orchestrator event for classified failure details.'}</p><div className="mt-2 text-[11px] text-[#8B7A5E]">Attempts {incident.attemptCount}/{incident.maxAttempts} · Auto-recoverable: {incident.autoRecoverable ? 'yes' : 'no'} · {formatCloseDateTime(incident.updatedAt)}</div></div>
                  ))}
                  {(orchestratorQuery.data?.incidents ?? []).length === 0 && <div className="rounded-lg border border-dashed border-[#C8BDA7] p-5 text-center text-xs text-[#8B7A5E]">No recovery incidents recorded.</div>}
                </div>
              </section>

              <section>
                <div className="mb-3"><h2 className="text-base font-medium text-[#2C2416]">Orchestrator timeline</h2><p className="mt-1 text-xs text-[#8B7A5E]">Append-only decisions, including every stop and retry</p></div>
                <div className="space-y-2">
                  {(orchestratorQuery.data?.events ?? []).slice().reverse().map((event) => (
                    <div key={event.id} className="flex gap-3 rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] p-3"><div className="mt-0.5"><Clock3 size={14} className="text-[#B8860B]" /></div><div className="min-w-0"><div className="text-xs font-medium text-[#2C2416]">{eventSummary(event)}</div><div className="mt-1 text-[11px] text-[#8B7A5E]">Depth {event.depth} · {humanizeCloseValue(event.eventType)} · {formatCloseDateTime(event.createdAt)}</div></div></div>
                  ))}
                  {(orchestratorQuery.data?.events ?? []).length === 0 && <div className="rounded-lg border border-dashed border-[#C8BDA7] p-5 text-center text-xs text-[#8B7A5E]">No orchestration decisions recorded yet.</div>}
                </div>
              </section>

              <section>
                <div className="mb-3"><h2 className="text-base font-medium text-[#2C2416]">Memory applications this close</h2><p className="mt-1 text-xs text-[#8B7A5E]">Evidence of where memory was supplied, matched, or blocked</p></div>
                <div className="space-y-2">
                  {applications.map((application) => <div key={application.id} className="rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] p-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-[#2C2416]">{humanizeCloseValue(application.outcome)}</span><span className="font-mono text-[11px] text-[#8B7A5E]">{Math.round(application.similarity * 100)}%</span></div><div className="mt-1 text-[11px] text-[#8B7A5E]">{humanizeCloseValue(application.targetType)} {shortCloseId(application.targetId)} · {formatCloseDateTime(application.createdAt)}</div></div>)}
                  {applications.length === 0 && <div className="rounded-lg border border-dashed border-[#C8BDA7] p-5 text-center text-xs text-[#8B7A5E]">No memory has been applied in this close.</div>}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      {selection && <MemoryActionDialog selection={selection} onClose={() => setSelection(null)} onSubmit={(reason) => actionMutation.mutate({ selection, reason })} pending={actionMutation.isPending} error={actionMutation.error as Error | null} />}
    </div>
  );
}
