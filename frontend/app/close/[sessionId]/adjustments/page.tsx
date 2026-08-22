'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { fmtMoney } from '@/lib/money';
import {
  getAccountingModules,
  normalizeFrontendAccountingStandard,
  type AccountingModuleDefinition,
} from '@/lib/accounting-modules';
import { WorkflowBreadcrumb } from '@/components/workflow-breadcrumb';
import { closeQueryKeys, useCloseSession } from '@/lib/hooks/useCloseSession';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import type { NormalizedGate } from '@/lib/contracts';
import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  Lock,
  Pencil,
  SkipForward,
  Sparkles,
  Plus,
  Trash2,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface JournalEntry {
  id: string;
  entryNumber?: string;
  status: string;
  memo?: string;
  description?: string;
  amount?: string;
  totalDebits?: string;
  totalCredits?: string;
  postedAt?: string;
  postedBy?: string;
  createdBy?: string;
  moduleRef?: string;
  module?: string;
  source?: string;
  sourceModule?: string;
  shadowAuditStatus?: string;
  shadowAuditChecks?: number;
}

interface JournalEntryDetailLine {
  jeId: string;
  lineIndex: number;
  accountRef: string;
  debit: string;
  credit: string;
  description?: string;
}

interface JournalEntryDetail {
  je: JournalEntry;
  lines: JournalEntryDetailLine[];
}

interface EditableJournalLine {
  accountRef: string;
  debit: string;
  credit: string;
  description: string;
}

type CorrectionApplicability = 'one_time' | 'recurring' | 'policy_candidate';
type CorrectionMemoryScope = 'transaction_pattern' | 'account' | 'entity';

interface ProposalLine {
  id: string;
  accountCode?: string;
  accountName?: string;
  description?: string;
  debit?: string;
  credit?: string;
  provenance?: string;
}

interface DataQualityFlag {
  message: string;
  severity?: string;
}

interface ModuleProposal {
  id: string;
  moduleId: string;
  moduleName: string;
  asc?: string;
  status: string; // 'pending' | 'approved' | 'posted' | 'skipped' | 'blocked'
  jeCount?: number;
  totalAmount?: string;
  lines?: ProposalLine[];
  dataQualityFlags?: DataQualityFlag[];
  skipReason?: string;
}

interface ModuleProposalsResponse {
  proposals?: ModuleProposal[];
}

/* ------------------------------------------------------------------ */
/*  Nav                                                                */
/* ------------------------------------------------------------------ */

/* Sidebar imported from @/components/close-sidebar */

/* ------------------------------------------------------------------ */
/*  Progress Rail                                                      */
/* ------------------------------------------------------------------ */

function ProgressRail({
  gates,
  gatesPassing,
  gatesTotal,
  sessionState,
  postedCount,
  pendingCount,
}: {
  gates: NormalizedGate[];
  gatesPassing: number;
  gatesTotal: number;
  sessionState: string;
  postedCount: number;
  pendingCount: number;
}) {
  const activeGateIndex = gates.findIndex((g) => !g.passing);
  const activeGateNum = activeGateIndex >= 0 ? activeGateIndex + 1 : gatesTotal;

  return (
    <div className="bg-[#2C2416] px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-[#B8860B] font-medium">
          Gate {activeGateNum} of {gatesTotal}
        </span>
        <span className="text-[#EDE6D6]">Journal Entries</span>
        <span className="text-[#8B7A5E]">{postedCount} posted</span>
        <span className="text-[#8B7A5E]">{pendingCount} pending</span>
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#3B1F0A] text-[#B8860B]">
          {sessionState.replace(/_/g, ' ')}
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
/*  Shadow Auditor Badge                                               */
/* ------------------------------------------------------------------ */

function ShadowBadge({ status, checks }: { status?: string; checks?: number }) {
  if (!status || status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-[#F0E8D0] text-[#8B6914]">
        <Clock size={10} />
        Auditing
      </span>
    );
  }
  if (status === 'clear' || status === 'passed') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-[#E0EDE8] text-[#2D6A4F]">
        <ShieldCheck size={10} />
        Clear{checks ? ` (${checks} checks)` : ''}
      </span>
    );
  }
  if (status === 'warning' || status === 'flagged') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-[#F0E8D0] text-[#8B6914]">
        <AlertTriangle size={10} />
        Warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-[#F5E4DE] text-[#C44B2B]">
      <XCircle size={10} />
      Failed
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Module Badge                                                       */
/* ------------------------------------------------------------------ */

function ModuleBadge({ module }: { module?: string }) {
  if (!module) return null;
  return (
    <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded bg-[#E0EAF5] text-[#3B6EA5] uppercase tracking-wider">
      {module}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Provenance Badge                                                   */
/* ------------------------------------------------------------------ */

function ProvenanceBadge({ provenance }: { provenance?: string }) {
  if (!provenance) return null;
  const isAi = provenance.toLowerCase().includes('ai') || provenance.toLowerCase().includes('module');
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded uppercase tracking-wider"
      style={{
        backgroundColor: isAi ? '#E0EAF5' : '#E0EDE8',
        color: isAi ? '#3B6EA5' : '#2D6A4F',
      }}
    >
      {provenance}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Module Status Badge                                                */
/* ------------------------------------------------------------------ */

function ModuleStatusBadge({ status, jeCount }: { status: string; jeCount?: number }) {
  if (status === 'posted' || status === 'approved') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-[#E0EDE8] text-[#2D6A4F]">
        <CheckCircle2 size={10} />
        All Posted
      </span>
    );
  }
  if (status === 'blocked' || status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-[#F5E4DE] text-[#C44B2B]">
        <XCircle size={10} />
        Blocked
      </span>
    );
  }
  if (status === 'skipped') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-[#EDE6D6] text-[#8B7A5E]">
        <SkipForward size={10} />
        Skipped
      </span>
    );
  }
  // pending
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-[#F0E8D0] text-[#8B6914]">
      <Clock size={10} />
      {jeCount ? `${jeCount} Pending` : 'Pending'}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Module Card                                                        */
/* ------------------------------------------------------------------ */

function ModuleCard({
  moduleDef,
  proposal,
  isExpanded,
  onToggle,
}: {
  moduleDef: AccountingModuleDefinition;
  proposal?: ModuleProposal;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const Icon = moduleDef.icon;
  const status = proposal?.status ?? 'no-data';
  const jeCount = proposal?.jeCount ?? 0;
  const totalAmount = proposal?.totalAmount ?? '0.00';
  const isPending = status === 'pending' || status === 'proposed';

  return (
    <button
      type="button"
      onClick={isPending ? onToggle : undefined}
      className={`bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4 text-left transition-colors w-full ${
        isPending ? 'hover:border-[#B8860B]/40 cursor-pointer' : 'cursor-default'
      } ${isExpanded ? 'ring-1 ring-[#B8860B]/30' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-[#DDD5C2] flex items-center justify-center text-[11px] font-medium font-mono text-[#5C4F3A]">
            {moduleDef.number}
          </div>
          <div>
            <div className="text-sm font-medium text-[#2C2416]">{moduleDef.name}</div>
            <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#E0EAF5] text-[#3B6EA5] mt-1">
              {moduleDef.guidance}
            </span>
          </div>
        </div>
        <ModuleStatusBadge status={status} jeCount={jeCount} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#8B7A5E]">
          {jeCount} {jeCount === 1 ? 'entry' : 'entries'}
        </span>
        <span className="text-sm font-mono font-medium text-[#2C2416]">
          {fmtMoney(totalAmount, { dollar: true, dash: false })}
        </span>
      </div>
      {isPending && (
        <div className="flex items-center justify-center mt-2 text-[#8B7A5E]">
          <ChevronDown
            size={14}
            className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Module Detail Expansion                                            */
/* ------------------------------------------------------------------ */

function ModuleDetail({
  proposal,
  sessionId,
  onApproved,
  onSkipped,
}: {
  proposal: ModuleProposal;
  sessionId: string;
  onApproved: () => void;
  onSkipped: () => void;
}) {
  const [skipMode, setSkipMode] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [isActing, setIsActing] = useState(false);

  const approveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/module-proposals/${proposal.id}/approve`, {
        method: 'POST',
      }),
    onMutate: () => setIsActing(true),
    onSettled: () => setIsActing(false),
    onSuccess: () => onApproved(),
  });

  const skipMutation = useMutation({
    mutationFn: (reason: string) =>
      apiFetch(`/api/close/sessions/${sessionId}/module-proposals/${proposal.id}/skip`, {
        method: 'POST',
        body: { reason },
      }),
    onMutate: () => setIsActing(true),
    onSettled: () => setIsActing(false),
    onSuccess: () => onSkipped(),
  });

  const lines = proposal.lines ?? [];
  const flags = proposal.dataQualityFlags ?? [];

  return (
    <div className="col-span-2 bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[#2C2416]">
          {proposal.moduleName} — Proposed Entries
        </h3>
        <span className="text-xs text-[#8B7A5E]">
          {lines.length} {lines.length === 1 ? 'line' : 'lines'}
        </span>
      </div>

      {/* Data quality flags */}
      {flags.length > 0 && (
        <div className="space-y-2">
          {flags.map((flag, i) => (
            <div
              key={i}
              className="flex items-start gap-2 bg-[#F0E8D0] border border-[#8B6914]/20 rounded px-3 py-2"
            >
              <AlertTriangle size={14} className="text-[#8B6914] shrink-0 mt-0.5" />
              <span className="text-xs text-[#8B6914]">{flag.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Proposed lines table */}
      {lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="border-b border-[#DDD5C2]">
                <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-[#8B7A5E]">
                  Account
                </th>
                <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-[#8B7A5E]">
                  Description
                </th>
                <th className="text-right px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-[#8B7A5E]">
                  Debit
                </th>
                <th className="text-right px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-[#8B7A5E]">
                  Credit
                </th>
                <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-[#8B7A5E]">
                  Provenance
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDD5C2]">
              {lines.map((line) => (
                <tr key={line.id} className="hover:bg-[#E6DEC9] transition-colors">
                  <td className="px-3 py-2 font-mono text-[#2C2416] text-xs">
                    {line.accountCode ?? ''} {line.accountName ?? ''}
                  </td>
                  <td className="px-3 py-2 text-[#5C4F3A] text-xs max-w-xs truncate">
                    {line.description ?? '--'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[#2C2416] text-xs">
                    {fmtMoney(line.debit, { dollar: true, dash: true })}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[#2C2416] text-xs">
                    {fmtMoney(line.credit, { dollar: true, dash: true })}
                  </td>
                  <td className="px-3 py-2">
                    <ProvenanceBadge provenance={line.provenance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action buttons */}
      {!skipMode ? (
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => approveMutation.mutate()}
            disabled={isActing}
            className="px-4 py-2 text-xs font-medium rounded bg-[#2D6A4F] text-[#E0EDE8] hover:bg-[#245A42] transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isActing && approveMutation.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <CheckCircle2 size={12} />
            )}
            Approve All
          </button>
          <button
            onClick={() => setSkipMode(true)}
            disabled={isActing}
            className="px-4 py-2 text-xs font-medium rounded border border-[#C44B2B]/20 text-[#C44B2B] bg-[#F5E4DE] hover:bg-[#C44B2B] hover:text-[#F5F0E8] transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <SkipForward size={12} />
            Skip with Reason
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 pt-2">
          <input
            type="text"
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            placeholder="Reason for skipping this module..."
            className="flex-1 px-3 py-2 text-xs rounded border border-[#DDD5C2] bg-[#F5F0E8] text-[#2C2416] placeholder:text-[#8B7A5E] focus:outline-none focus:ring-1 focus:ring-[#B8860B]/40"
          />
          <button
            onClick={() => {
              if (skipReason.trim()) skipMutation.mutate(skipReason.trim());
            }}
            disabled={isActing || !skipReason.trim()}
            className="px-4 py-2 text-xs font-medium rounded bg-[#C44B2B] text-[#F5F0E8] hover:bg-[#A33D24] transition-colors disabled:opacity-50"
          >
            {skipMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Confirm Skip'}
          </button>
          <button
            onClick={() => {
              setSkipMode(false);
              setSkipReason('');
            }}
            className="px-3 py-2 text-xs font-medium rounded border border-[#DDD5C2] text-[#8B7A5E] bg-[#F5F0E8] hover:bg-[#EDE6D6] transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pending Approval Card (Manual Entries)                             */
/* ------------------------------------------------------------------ */

function PendingCard({
  entry,
  onApprove,
  onReject,
  onCorrect,
  isActing,
}: {
  entry: JournalEntry;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onCorrect: (entry: JournalEntry) => void;
  isActing: boolean;
}) {
  const displayId = entry.entryNumber || `AJE-${String(entry.id).slice(0, 3).toUpperCase()}`;
  const amount = entry.amount || entry.totalDebits || '0.00';
  const moduleName = entry.moduleRef || entry.module;

  return (
    <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium font-mono text-[#2C2416]">{displayId}</span>
          <ModuleBadge module={moduleName} />
        </div>
        <ShadowBadge status={entry.shadowAuditStatus} checks={entry.shadowAuditChecks} />
      </div>
      <p className="text-sm text-[#5C4F3A] mb-3">
        {entry.memo || entry.description || 'No description provided'}
      </p>
      <div className="flex items-center justify-between">
        <span className="text-lg font-mono font-medium text-[#2C2416]">
          {fmtMoney(amount, { dollar: true, dash: false })}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onCorrect(entry)}
            disabled={isActing}
            className="flex items-center gap-1.5 rounded border border-[#B8860B]/30 bg-[#F0E8D0] px-3 py-1.5 text-xs font-medium text-[#8B6914] transition-colors hover:bg-[#B8860B] hover:text-white disabled:opacity-50"
          >
            <Pencil size={12} />
            Correct &amp; remember
          </button>
          <button
            onClick={() => onReject(entry.id)}
            disabled={isActing}
            className="px-3 py-1.5 text-xs font-medium rounded border border-[#C44B2B]/30 text-[#C44B2B] bg-[#F5E4DE] hover:bg-[#C44B2B] hover:text-[#F5F0E8] transition-colors disabled:opacity-50"
          >
            Reject
          </button>
          <button
            onClick={() => onApprove(entry.id)}
            disabled={isActing}
            className="px-3 py-1.5 text-xs font-medium rounded bg-[#2D6A4F] text-[#E0EDE8] hover:bg-[#245A42] transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isActing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

interface CorrectionResult {
  replacementJournalEntryId: string;
  memory: { id: string; status: 'candidate' | 'approved' | 'superseded' | 'revoked' };
  memoryConflictRequiresApproval: boolean;
  orchestrationQueued: boolean;
  orchestrationWarning?: string;
}

function CorrectionDialog({
  entry,
  onClose,
  onSaved,
}: {
  entry: JournalEntry;
  onClose: () => void;
  onSaved: (result: CorrectionResult) => void;
}) {
  useKeyboardShortcuts([{ key: 'Escape', handler: onClose }]);
  const detailQuery = useQuery({
    queryKey: ['journal-entry-detail', entry.id],
    queryFn: () => apiFetch<JournalEntryDetail>(`/api/close/journal-entries/${entry.id}`, {
      params: { withLines: 'true' },
    }),
  });

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2C2416]/60 p-4" role="dialog" aria-modal="true" aria-labelledby="correction-dialog-title">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-[#DDD5C2] bg-[#F5F0E8] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#DDD5C2] bg-[#EDE6D6] px-6 py-4">
          <div>
            <h2 id="correction-dialog-title" className="text-lg font-medium text-[#2C2416]">Correct journal entry and remember</h2>
            <p className="mt-1 text-xs text-[#8B7A5E]">The original proposal remains in the audit trail. A balanced replacement is proposed for independent approval.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-[#8B7A5E] hover:bg-[#DDD5C2] hover:text-[#2C2416]" aria-label="Close correction dialog">
            <XCircle size={20} />
          </button>
        </div>
        {detailQuery.isLoading && (
          <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-[#8B7A5E]"><Loader2 size={18} className="animate-spin" /> Loading journal entry…</div>
        )}
        {detailQuery.error && (
          <div className="m-6 rounded-lg border border-[#C44B2B]/20 bg-[#F5E4DE] p-4 text-sm text-[#C44B2B]">{(detailQuery.error as Error).message}</div>
        )}
        {detailQuery.data && (
          <CorrectionForm key={entry.id} detail={detailQuery.data} onClose={onClose} onSaved={onSaved} />
        )}
      </div>
    </div>
  );
}

function CorrectionForm({
  detail,
  onClose,
  onSaved,
}: {
  detail: JournalEntryDetail;
  onClose: () => void;
  onSaved: (result: CorrectionResult) => void;
}) {
  const [memo, setMemo] = useState(detail.je.memo ?? '');
  const [rationale, setRationale] = useState('');
  const [applicability, setApplicability] = useState<CorrectionApplicability>('recurring');
  const [memoryScope, setMemoryScope] = useState<CorrectionMemoryScope>('transaction_pattern');
  const [lines, setLines] = useState<EditableJournalLine[]>(detail.lines.map((line) => ({
    accountRef: line.accountRef,
    debit: line.debit === '0.00' ? '' : line.debit,
    credit: line.credit === '0.00' ? '' : line.credit,
    description: line.description ?? '',
  })));

  const totals = useMemo(() => lines.reduce((value, line) => ({
    debit: value.debit + (Number(line.debit) || 0),
    credit: value.credit + (Number(line.credit) || 0),
  }), { debit: 0, credit: 0 }), [lines]);
  const lineStructureValid = lines.length >= 2 && lines.every((line) => {
    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;
    return Boolean(line.accountRef.trim()) && debit >= 0 && credit >= 0 && (debit > 0) !== (credit > 0);
  });
  const balanced = totals.debit > 0 && Math.abs(totals.debit - totals.credit) < 0.005;
  const canSubmit = memo.trim().length >= 5 && rationale.trim().length >= 10 && lineStructureValid && balanced;

  const mutation = useMutation({
    mutationFn: () => apiFetch<CorrectionResult>(`/api/close/journal-entries/${detail.je.id}/correct`, {
      method: 'POST',
      body: {
        memo: memo.trim(),
        rationale: rationale.trim(),
        applicability,
        memoryScope,
        lines: lines.map((line) => ({
          accountRef: line.accountRef.trim(),
          debit: Number(line.debit) || 0,
          credit: Number(line.credit) || 0,
          description: line.description.trim() || undefined,
        })),
      },
    }),
    onSuccess: onSaved,
  });

  function updateLine(index: number, field: keyof EditableJournalLine, value: string) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line));
  }

  return (
    <div className="space-y-5 p-6">
      <div className="rounded-lg border border-[#B8860B]/25 bg-[#F0E8D0] p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-[#8B6914]"><ShieldCheck size={15} /> Safe learning boundary</div>
        <p className="mt-1 text-xs leading-relaxed text-[#8B6914]">Sabit remembers the corrected accounts, debit/credit direction, rationale, and scope. It never reuses this entry’s amounts; every later close must recalculate from current-period evidence.</p>
      </div>

      <div>
        <label htmlFor="corrected-memo" className="text-xs font-medium text-[#5C4F3A]">Corrected memo</label>
        <input id="corrected-memo" value={memo} onChange={(event) => setMemo(event.target.value)} className="mt-1.5 w-full rounded-md border border-[#DDD5C2] bg-white px-3 py-2 text-sm outline-none focus:border-[#B8860B]" />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-[#5C4F3A]">Corrected lines</span>
          <button type="button" onClick={() => setLines((current) => [...current, { accountRef: '', debit: '', credit: '', description: '' }])} className="flex items-center gap-1 text-xs font-medium text-[#B8860B] hover:underline"><Plus size={12} /> Add line</button>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-[1.5fr_1fr_1fr_2fr_auto] gap-2 px-1 text-[10px] font-medium uppercase tracking-wider text-[#8B7A5E]"><span>Account</span><span>Debit</span><span>Credit</span><span>Description</span><span /></div>
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-[1.5fr_1fr_1fr_2fr_auto] gap-2">
              <input aria-label={`Line ${index + 1} account`} value={line.accountRef} onChange={(event) => updateLine(index, 'accountRef', event.target.value)} className="rounded border border-[#DDD5C2] bg-white px-2 py-2 font-mono text-sm outline-none focus:border-[#B8860B]" />
              <input aria-label={`Line ${index + 1} debit`} type="number" min="0" step="0.01" value={line.debit} onChange={(event) => updateLine(index, 'debit', event.target.value)} className="rounded border border-[#DDD5C2] bg-white px-2 py-2 text-right font-mono text-sm outline-none focus:border-[#B8860B]" />
              <input aria-label={`Line ${index + 1} credit`} type="number" min="0" step="0.01" value={line.credit} onChange={(event) => updateLine(index, 'credit', event.target.value)} className="rounded border border-[#DDD5C2] bg-white px-2 py-2 text-right font-mono text-sm outline-none focus:border-[#B8860B]" />
              <input aria-label={`Line ${index + 1} description`} value={line.description} onChange={(event) => updateLine(index, 'description', event.target.value)} className="rounded border border-[#DDD5C2] bg-white px-2 py-2 text-sm outline-none focus:border-[#B8860B]" />
              <button type="button" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} disabled={lines.length <= 2} className="rounded p-2 text-[#C44B2B] hover:bg-[#F5E4DE] disabled:opacity-30" aria-label={`Remove line ${index + 1}`}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-[1.5fr_1fr_1fr_2fr_auto] gap-2 border-t border-[#DDD5C2] pt-3 text-xs">
          <span className="text-right font-medium text-[#5C4F3A]">Totals</span>
          <span className="text-right font-mono text-[#2C2416]">{totals.debit.toFixed(2)}</span>
          <span className="text-right font-mono text-[#2C2416]">{totals.credit.toFixed(2)}</span>
          <span className={balanced ? 'text-[#2D6A4F]' : 'text-[#C44B2B]'}>{balanced ? 'Balanced' : 'Entry must balance'}</span><span />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="correction-applicability" className="text-xs font-medium text-[#5C4F3A]">Applicability</label>
          <select id="correction-applicability" value={applicability} onChange={(event) => setApplicability(event.target.value as CorrectionApplicability)} className="mt-1.5 w-full rounded-md border border-[#DDD5C2] bg-white px-3 py-2 text-sm outline-none focus:border-[#B8860B]">
            <option value="recurring">Recurring treatment</option>
            <option value="one_time">One-time correction</option>
            <option value="policy_candidate">Policy candidate — separate approval</option>
          </select>
        </div>
        <div>
          <label htmlFor="correction-scope" className="text-xs font-medium text-[#5C4F3A]">Memory scope</label>
          <select id="correction-scope" value={memoryScope} onChange={(event) => setMemoryScope(event.target.value as CorrectionMemoryScope)} className="mt-1.5 w-full rounded-md border border-[#DDD5C2] bg-white px-3 py-2 text-sm outline-none focus:border-[#B8860B]">
            <option value="transaction_pattern">Matching transaction pattern</option>
            <option value="account">Account treatment</option>
            <option value="entity">Entity close context</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="correction-rationale" className="text-xs font-medium text-[#5C4F3A]">Supervisor rationale</label>
        <textarea id="correction-rationale" rows={3} value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Explain what was wrong and why this treatment is correct under ASPE…" className="mt-1.5 w-full rounded-md border border-[#DDD5C2] bg-white px-3 py-2 text-sm outline-none focus:border-[#B8860B]" />
        <div className="mt-1 text-[11px] text-[#8B7A5E]">Minimum 10 characters. This becomes an immutable correction fact.</div>
      </div>

      {mutation.error && <div className="rounded-md border border-[#C44B2B]/20 bg-[#F5E4DE] px-3 py-2 text-sm text-[#C44B2B]">{(mutation.error as Error).message}</div>}
      {!lineStructureValid && <div className="text-xs text-[#C44B2B]">Each line needs an account and exactly one positive debit or credit.</div>}

      <div className="flex justify-end gap-3 border-t border-[#DDD5C2] pt-4">
        <button type="button" onClick={onClose} disabled={mutation.isPending} className="rounded-md border border-[#DDD5C2] px-4 py-2 text-sm font-medium text-[#5C4F3A] hover:bg-[#EDE6D6] disabled:opacity-50">Cancel</button>
        <button type="button" onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending} className="flex items-center gap-2 rounded-md bg-[#2D6A4F] px-4 py-2 text-sm font-medium text-white hover:bg-[#245A42] disabled:opacity-50">
          {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          Record correction
        </button>
      </div>
    </div>
  );
}

function RejectDialog({
  entry,
  onClose,
  onConfirm,
  isPending,
  error,
}: {
  entry: JournalEntry;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isPending: boolean;
  error?: Error | null;
}) {
  const [reason, setReason] = useState('');
  useKeyboardShortcuts([{ key: 'Escape', handler: onClose, enabled: !isPending }]);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2C2416]/60 p-4" role="dialog" aria-modal="true" aria-labelledby="reject-dialog-title">
      <div className="w-full max-w-lg rounded-xl border border-[#DDD5C2] bg-[#F5F0E8] p-6 shadow-2xl">
        <h2 id="reject-dialog-title" className="text-lg font-medium text-[#2C2416]">Reject proposed entry</h2>
        <p className="mt-1 text-sm text-[#8B7A5E]">{entry.memo || entry.description || entry.id}</p>
        <label htmlFor="rejection-reason" className="mt-5 block text-xs font-medium text-[#5C4F3A]">Reason</label>
        <textarea id="rejection-reason" rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this proposal should not be recorded…" className="mt-1.5 w-full rounded-md border border-[#DDD5C2] bg-white px-3 py-2 text-sm outline-none focus:border-[#B8860B]" />
        <p className="mt-1 text-[11px] text-[#8B7A5E]">Minimum 10 characters. Rejection does not create reusable accounting memory.</p>
        {error && <div className="mt-3 rounded bg-[#F5E4DE] px-3 py-2 text-xs text-[#C44B2B]">{error.message}</div>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={isPending} className="rounded-md border border-[#DDD5C2] px-4 py-2 text-sm font-medium text-[#5C4F3A] disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => onConfirm(reason.trim())} disabled={reason.trim().length < 10 || isPending} className="flex items-center gap-2 rounded-md bg-[#C44B2B] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {isPending && <Loader2 size={14} className="animate-spin" />} Reject entry
          </button>
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
      <Skeleton className="h-7 w-72 mb-2" />
      <div className="flex gap-3 mb-4">
        <Skeleton className="h-9 w-36 rounded-md" />
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4 h-28" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDateTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

/* ------------------------------------------------------------------ */
/*  Tab Button                                                         */
/* ------------------------------------------------------------------ */

function TabButton({
  active,
  label,
  count,
  onClick,
  tabId,
  panelId,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  tabId: string;
  panelId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      id={tabId}
      role="tab"
      aria-selected={active}
      aria-controls={panelId}
      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
        active
          ? 'bg-[#2C2416] text-[#EDE6D6]'
          : 'bg-[#EDE6D6] text-[#8B7A5E] border border-[#DDD5C2] hover:text-[#2C2416] hover:bg-[#DDD5C2]'
      }`}
    >
      {label}
      {count !== undefined && (
        <span
          className={`ml-2 text-xs font-mono px-1.5 py-0.5 rounded ${
            active ? 'bg-[#3B1F0A] text-[#B8860B]' : 'bg-[#DDD5C2] text-[#5C4F3A]'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function JournalEntriesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const closeSession = useCloseSession(sessionId);
  const { sessionQuery, readinessQuery } = closeSession;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'modules' | 'entries'>(
    searchParams.get('tab') === 'entries' ? 'entries' : 'modules'
  );
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [actingOnId, setActingOnId] = useState<string | null>(null);
  const [correctingEntry, setCorrectingEntry] = useState<JournalEntry | null>(null);
  const [rejectingEntry, setRejectingEntry] = useState<JournalEntry | null>(null);
  const [correctionNotice, setCorrectionNotice] = useState<string | null>(null);
  const requestedCorrectionHandled = useRef(false);

  /* --- Data fetching --- */

  const proposalsQuery = useQuery({
    queryKey: ['module-proposals', sessionId],
    queryFn: async () => {
      const data = await apiFetch<ModuleProposalsResponse | ModuleProposal[]>(
        `/api/close/sessions/${sessionId}/module-proposals`
      );
      return Array.isArray(data) ? data : data.proposals ?? [];
    },
    enabled: !!sessionId,
  });

  const jesQuery = useQuery({
    queryKey: closeQueryKeys.journalEntries(sessionId),
    queryFn: async () => {
      const data = await apiFetch<{ journalEntries?: JournalEntry[]; entries?: JournalEntry[] } | JournalEntry[]>(
        '/api/close/journal-entries',
        { params: { closeSessionId: sessionId } }
      );
      if (Array.isArray(data)) return data;
      return data.journalEntries ?? data.entries ?? [];
    },
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (requestedCorrectionHandled.current || !jesQuery.data) return;
    const requestedId = searchParams.get('correct');
    if (!requestedId) return;
    requestedCorrectionHandled.current = true;
    const requestedEntry = jesQuery.data.find((entry) => entry.id === requestedId);
    if (requestedEntry && ['proposed', 'pending_approval'].includes(requestedEntry.status)) {
      setActiveTab('entries');
      setCorrectingEntry(requestedEntry);
    }
  }, [jesQuery.data, searchParams]);

  /* --- Mutations (Manual Entries tab) --- */

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/close/journal-entries/${id}/approve`, { method: 'POST' }),
    onMutate: (id) => setActingOnId(id),
    onSettled: () => {
      setActingOnId(null);
      queryClient.invalidateQueries({ queryKey: closeQueryKeys.journalEntries(sessionId) });
      queryClient.invalidateQueries({ queryKey: closeQueryKeys.readiness(sessionId) });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      apiFetch(`/api/close/journal-entries/${input.id}/reject`, {
        method: 'POST',
        body: { reason: input.reason },
      }),
    onMutate: (input) => setActingOnId(input.id),
    onSuccess: () => setRejectingEntry(null),
    onSettled: () => {
      setActingOnId(null);
      queryClient.invalidateQueries({ queryKey: closeQueryKeys.journalEntries(sessionId) });
      queryClient.invalidateQueries({ queryKey: closeQueryKeys.readiness(sessionId) });
    },
  });

  function handleCorrectionSaved(result: CorrectionResult) {
    setCorrectingEntry(null);
    setCorrectionNotice(result.memory.status === 'candidate'
      ? 'Correction recorded. The replacement is proposed and the treatment is awaiting explicit memory approval.'
      : result.orchestrationWarning
        ? result.orchestrationWarning
        : 'Correction recorded. Sabit remembered the treatment and queued the affected close checks.');
    queryClient.invalidateQueries({ queryKey: closeQueryKeys.journalEntries(sessionId) });
    queryClient.invalidateQueries({ queryKey: closeQueryKeys.readiness(sessionId) });
    queryClient.invalidateQueries({ queryKey: closeQueryKeys.accountingMemory(sessionId) });
    queryClient.invalidateQueries({ queryKey: closeQueryKeys.orchestrator(sessionId) });
  }

  const autoProposeMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/close/templates/propose', {
        method: 'POST',
        body: { closeSessionId: sessionId },
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['module-proposals', sessionId] });
      queryClient.invalidateQueries({ queryKey: closeQueryKeys.journalEntries(sessionId) });
      queryClient.invalidateQueries({ queryKey: closeQueryKeys.readiness(sessionId) });
    },
  });

  const createJeMutation = useMutation({
    mutationFn: (body: { memo: string; lines: { accountRef: string; debit: number; credit: number; description?: string }[] }) =>
      apiFetch<{ id: string }>('/api/close/journal-entries', {
        method: 'POST',
        body: { closeSessionId: sessionId, source: 'manual' as const, ...body },
      }),
    onSuccess: async (data) => {
      // Auto-propose after creation
      try {
        await apiFetch(`/api/close/journal-entries/${data.id}/propose`, { method: 'POST' });
      } catch { /* may fail if already proposed */ }
      queryClient.invalidateQueries({ queryKey: closeQueryKeys.journalEntries(sessionId) });
      queryClient.invalidateQueries({ queryKey: closeQueryKeys.readiness(sessionId) });
      setShowNewJE(false);
      setNewJELines([{ accountRef: '', debit: '', credit: '', description: '' }]);
      setNewJEMemo('');
    },
  });

  const [showNewJE, setShowNewJE] = useState(false);
  const [newJEMemo, setNewJEMemo] = useState('');
  const [newJELines, setNewJELines] = useState([
    { accountRef: '', debit: '', credit: '', description: '' },
  ]);

  function addLine() {
    setNewJELines((lines) => [...lines, { accountRef: '', debit: '', credit: '', description: '' }]);
  }

  function updateLine(index: number, field: string, value: string) {
    setNewJELines((lines) => lines.map((line, lineIndex) => lineIndex === index
      ? { ...line, [field]: value }
      : line));
  }

  function removeLine(index: number) {
    setNewJELines((lines) => lines.length <= 1 ? lines : lines.filter((_, lineIndex) => lineIndex !== index));
  }

  function submitNewJE() {
    const lines = newJELines
      .filter((l) => l.accountRef.trim())
      .map((l) => ({
        accountRef: l.accountRef.trim(),
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        description: l.description || undefined,
      }));
    if (lines.length < 2 || !newJEMemo.trim()) {
      alert('A journal entry requires a memo and at least two populated lines.');
      return;
    }
    if (lines.some((line) => line.debit < 0 || line.credit < 0 || (line.debit > 0) === (line.credit > 0))) {
      alert('Each line must contain exactly one positive debit or credit.');
      return;
    }
    const totalD = lines.reduce((s, l) => s + l.debit, 0);
    const totalC = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalD - totalC) > 0.01) {
      alert(`Entry does not balance. Debits: ${totalD.toFixed(2)}, Credits: ${totalC.toFixed(2)}`);
      return;
    }
    createJeMutation.mutate({ memo: newJEMemo.trim(), lines });
  }

  /* --- Derived state --- */

  const session = closeSession.session;
  const modules = getAccountingModules(session?.standard);
  const isAspe = normalizeFrontendAccountingStandard(session?.standard) === 'ASPE';
  const gates = closeSession.gates;
  const gatesPassing = closeSession.gatesPassing;
  const gatesTotal = closeSession.gatesTotal;
  const allEntries = jesQuery.data ?? [];
  const proposals = proposalsQuery.data ?? [];

  // The entry-review tab is the complete persisted JE lifecycle, including agent/module proposals.
  const manualEntries = allEntries;

  const drafts = manualEntries.filter((e) => e.status === 'draft');
  const proposed = manualEntries.filter(
    (e) => e.status === 'proposed' || e.status === 'pending_approval'
  );
  const approved = manualEntries.filter((e) => e.status === 'approved');
  const posted = manualEntries.filter((e) => e.status === 'posted');
  const rejected = manualEntries.filter((e) => e.status === 'rejected');

  // All posted entries (both module + manual) for progress rail
  const allPosted = allEntries.filter((e) => e.status === 'posted');
  const allPending = allEntries.filter(
    (e) => e.status === 'proposed' || e.status === 'pending_approval'
  );

  // Map proposals by moduleId for card lookup
  const proposalsByModule = useMemo(() => {
    const map = new Map<string, ModuleProposal>();
    for (const p of proposals) {
      map.set(p.moduleId, p);
    }
    return map;
  }, [proposals]);

  const isLoading = sessionQuery.isLoading || jesQuery.isLoading;
  const error = sessionQuery.error || jesQuery.error || proposalsQuery.error;

  /* --- Invalidation helpers for module actions --- */

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['module-proposals', sessionId] });
    queryClient.invalidateQueries({ queryKey: closeQueryKeys.journalEntries(sessionId) });
    queryClient.invalidateQueries({ queryKey: closeQueryKeys.readiness(sessionId) });
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex">
      {/* Sidebar rendered by layout.tsx */}

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
            <span className="text-[#2C2416] font-medium">Journal Entries</span>
          </div>
        </div>

        {/* Workflow Breadcrumb */}
        <WorkflowBreadcrumb sessionId={sessionId} gates={gates} />

        {/* Progress Rail */}
        {gates.length > 0 && (
          <ProgressRail
            gates={gates}
            gatesPassing={gatesPassing}
            gatesTotal={gatesTotal}
            sessionState={session?.state ?? 'IN_PROGRESS'}
            postedCount={allPosted.length}
            pendingCount={allPending.length}
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
                  Journal Entries &amp; Adjustments
                </h1>
                <p className="text-sm text-[#8B7A5E] mt-1">
                  {session?.entityName} · {session?.periodLabel}
                </p>
              </div>

              {/* Tab bar */}
              <div className="flex items-center gap-3" role="tablist" aria-label="Journal entry review mode">
                <TabButton
                  active={activeTab === 'modules'}
                  label="Module Review"
                  count={proposals.filter((p) => p.status === 'pending' || p.status === 'proposed').length}
                  onClick={() => setActiveTab('modules')}
                  tabId="module-review-tab"
                  panelId="module-review-panel"
                />
                <TabButton
                  active={activeTab === 'entries'}
                  label="Entry Review"
                  count={manualEntries.length}
                  onClick={() => setActiveTab('entries')}
                  tabId="entry-review-tab"
                  panelId="entry-review-panel"
                />
              </div>

              {/* ============================================== */}
              {/*  TAB 1: Module Review                          */}
              {/* ============================================== */}
              {activeTab === 'modules' && (
                <div id="module-review-panel" role="tabpanel" aria-labelledby="module-review-tab" className="space-y-6">
                  {/* Auto-propose CTA */}
                  <div className="bg-[#E0EAF5] border border-[#3B6EA5]/20 rounded-lg px-5 py-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-[#2C2416]">
                        {isAspe ? 'ASPE Workpapers Run Through the Approved Runbook' : 'Compute Adjusting-Entry Proposals'}
                      </div>
                      <div className="text-xs text-[#8B7A5E] mt-0.5">
                        {isAspe
                          ? 'Registered agents prepare checks and drafts; reviewers approve conclusions and journal entries before ERP posting.'
                          : 'Run the configured accounting modules to propose adjustments from trial-balance data and approved policies.'}
                      </div>
                    </div>
                    <button
                      onClick={() => autoProposeMutation.mutate()}
                      disabled={isAspe || autoProposeMutation.isPending}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#B8860B] text-[#F5F0E8] hover:bg-[#A07608] disabled:opacity-50 transition-colors shrink-0"
                    >
                      {autoProposeMutation.isPending ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      {isAspe ? 'Runbook Controlled' : autoProposeMutation.isPending ? 'Computing...' : 'Run Modules'}
                    </button>
                  </div>
                  {autoProposeMutation.isSuccess && (
                    <div className="bg-[#E0EDE8] border border-[#2D6A4F]/20 rounded-lg px-4 py-2 text-xs text-[#2D6A4F] font-medium flex items-center gap-2">
                      <CheckCircle2 size={14} />
                      Module proposals generated. Review below.
                    </div>
                  )}
                  {autoProposeMutation.isError && (
                    <div className="bg-[#F5E4DE] border border-[#C44B2B]/20 rounded-lg px-4 py-2 text-xs text-[#C44B2B]">
                      {(autoProposeMutation.error as Error).message}
                    </div>
                  )}

                  {/* Module grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {modules.map((mod) => {
                      const proposal = proposalsByModule.get(mod.id);
                      const isPending =
                        proposal?.status === 'pending' || proposal?.status === 'proposed';
                      const isExpanded = expandedModule === mod.id;

                      return (
                        <React.Fragment key={mod.id}>
                          <ModuleCard
                            moduleDef={mod}
                            proposal={proposal}
                            isExpanded={isExpanded}
                            onToggle={() =>
                              setExpandedModule(isExpanded ? null : mod.id)
                            }
                          />
                          {/* Expanded detail section spans 2 cols */}
                          {isExpanded && isPending && proposal && (
                            <ModuleDetail
                              proposal={proposal}
                              sessionId={sessionId}
                              onApproved={invalidateAll}
                              onSkipped={invalidateAll}
                            />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {proposalsQuery.isLoading && (
                    <div className="flex items-center justify-center py-8 text-[#8B7A5E]">
                      <Loader2 size={20} className="animate-spin mr-2" />
                      <span className="text-sm">Loading module proposals...</span>
                    </div>
                  )}
                </div>
              )}

              {/* ============================================== */}
              {/*  TAB 2: Manual Entries                          */}
              {/* ============================================== */}
              {activeTab === 'entries' && (
                <div id="entry-review-panel" role="tabpanel" aria-labelledby="entry-review-tab" className="space-y-6">
                  {/* New JE button */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-[#2C2416]">Journal Entry Review &amp; Manual Adjustments</div>
                      <div className="text-xs text-[#8B7A5E]">Review every persisted proposal, including module and agent work, or create a manual entry</div>
                    </div>
                    <button
                      onClick={() => setShowNewJE(!showNewJE)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#B8860B] text-[#F5F0E8] hover:bg-[#A07608] transition-colors"
                    >
                      <Plus size={14} />
                      New Journal Entry
                    </button>
                  </div>

                  {/* New JE form */}
                  {showNewJE && (
                    <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5 space-y-4">
                      <div className="text-sm font-medium text-[#2C2416]">Create Adjusting Entry</div>

                      <div>
                        <label className="block text-xs font-medium text-[#5C4F3A] mb-1">Memo (required)</label>
                        <input
                          type="text"
                          value={newJEMemo}
                          onChange={(e) => setNewJEMemo(e.target.value)}
                          placeholder="e.g., Accrue Q1 bonus liability"
                          className="w-full px-3 py-2 text-sm bg-white border border-[#DDD5C2] rounded text-[#2C2416] placeholder-[#8B7A5E]/50 focus:outline-none focus:border-[#B8860B]"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-medium text-[#5C4F3A]">Lines</label>
                          <button onClick={addLine} className="text-xs text-[#B8860B] font-medium hover:underline flex items-center gap-1">
                            <Plus size={12} /> Add Line
                          </button>
                        </div>
                        <div className="space-y-2">
                          <div className="grid grid-cols-[2fr_1fr_1fr_2fr_auto] gap-2 text-[10px] font-medium text-[#8B7A5E] uppercase tracking-wider px-1">
                            <span>Account</span><span>Debit</span><span>Credit</span><span>Description</span><span />
                          </div>
                          {newJELines.map((line, i) => (
                            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_2fr_auto] gap-2">
                              <input
                                type="text"
                                value={line.accountRef}
                                onChange={(e) => updateLine(i, 'accountRef', e.target.value)}
                                placeholder="Account code"
                                className="px-2 py-1.5 text-sm font-mono bg-white border border-[#DDD5C2] rounded focus:outline-none focus:border-[#B8860B]"
                              />
                              <input
                                type="text"
                                value={line.debit}
                                onChange={(e) => updateLine(i, 'debit', e.target.value)}
                                placeholder="0.00"
                                className="px-2 py-1.5 text-sm font-mono bg-white border border-[#DDD5C2] rounded text-right focus:outline-none focus:border-[#B8860B]"
                              />
                              <input
                                type="text"
                                value={line.credit}
                                onChange={(e) => updateLine(i, 'credit', e.target.value)}
                                placeholder="0.00"
                                className="px-2 py-1.5 text-sm font-mono bg-white border border-[#DDD5C2] rounded text-right focus:outline-none focus:border-[#B8860B]"
                              />
                              <input
                                type="text"
                                value={line.description}
                                onChange={(e) => updateLine(i, 'description', e.target.value)}
                                placeholder="Line description"
                                className="px-2 py-1.5 text-sm bg-white border border-[#DDD5C2] rounded focus:outline-none focus:border-[#B8860B]"
                              />
                              <button
                                onClick={() => removeLine(i)}
                                className="text-[#C44B2B] hover:bg-[#F5E4DE] rounded p-1.5 transition-colors"
                                title="Remove line"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                        {/* Running totals */}
                        <div className="grid grid-cols-[2fr_1fr_1fr_2fr_auto] gap-2 mt-2 pt-2 border-t border-[#DDD5C2]">
                          <span className="text-xs font-medium text-[#5C4F3A] text-right pr-2">Totals</span>
                          <span className="text-xs font-mono font-medium text-[#2C2416] text-right px-2">
                            {newJELines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0).toFixed(2)}
                          </span>
                          <span className="text-xs font-mono font-medium text-[#2C2416] text-right px-2">
                            {newJELines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0).toFixed(2)}
                          </span>
                          <span className={`text-xs font-medium px-2 ${
                            Math.abs(newJELines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0) - newJELines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)) < 0.01
                              ? 'text-[#2D6A4F]' : 'text-[#C44B2B]'
                          }`}>
                            {Math.abs(newJELines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0) - newJELines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)) < 0.01 ? 'Balanced' : 'Unbalanced'}
                          </span>
                          <span />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-2">
                        {createJeMutation.isError && (
                          <span className="text-xs text-[#C44B2B]">{(createJeMutation.error as Error).message}</span>
                        )}
                        <button
                          onClick={() => { setShowNewJE(false); setNewJELines([{ accountRef: '', debit: '', credit: '', description: '' }]); setNewJEMemo(''); }}
                          className="px-3 py-1.5 text-sm font-medium text-[#5C4F3A] border border-[#DDD5C2] rounded hover:bg-[#F5F0E8] transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={submitNewJE}
                          disabled={createJeMutation.isPending || !newJEMemo.trim()}
                          className="px-4 py-1.5 text-sm font-medium bg-[#2D6A4F] text-white rounded hover:bg-[#245A42] disabled:opacity-50 transition-colors flex items-center gap-2"
                        >
                          {createJeMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                          Create &amp; Propose
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Lifecycle counter cards */}
                  {correctionNotice && (
                    <div className="flex items-start justify-between gap-3 rounded-lg border border-[#2D6A4F]/20 bg-[#E0EDE8] px-4 py-3 text-sm text-[#2D6A4F]">
                      <span className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0" />{correctionNotice}</span>
                      <button type="button" onClick={() => setCorrectionNotice(null)} className="text-xs font-medium hover:underline">Dismiss</button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    <StatCard label="Draft" count={drafts.length} color="#5C4F3A" bgColor="#DDD5C2" />
                    <StatCard
                      label="Proposed"
                      count={proposed.length}
                      color="#3B6EA5"
                      bgColor="#E0EAF5"
                    />
                    <StatCard
                      label="Approved"
                      count={approved.length}
                      color="#8B6914"
                      bgColor="#F0E8D0"
                    />
                    <StatCard
                      label="Posted"
                      count={posted.length}
                      color="#2D6A4F"
                      bgColor="#E0EDE8"
                    />
                    <StatCard
                      label="Rejected"
                      count={rejected.length}
                      color="#C44B2B"
                      bgColor="#F5E4DE"
                    />
                  </div>

                  {/* Pending Approval */}
                  {proposed.length > 0 && (
                    <section>
                      <h2 className="text-[11px] font-medium uppercase tracking-wider text-[#8B7A5E] mb-3">
                        Pending Approval
                      </h2>
                      <div className="space-y-3">
                        {proposed.map((entry) => (
                          <PendingCard
                            key={entry.id}
                            entry={entry}
                            onApprove={(id) => approveMutation.mutate(id)}
                            onReject={() => {
                              rejectMutation.reset();
                              setRejectingEntry(entry);
                            }}
                            onCorrect={setCorrectingEntry}
                            isActing={actingOnId === entry.id}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Recently Posted */}
                  {posted.length > 0 && (
                    <section>
                      <h2 className="text-[11px] font-medium uppercase tracking-wider text-[#8B7A5E] mb-3">
                        Recently Posted
                      </h2>
                      <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm" role="table">
                            <thead>
                              <tr className="border-b border-[#DDD5C2]">
                                <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-[#8B7A5E]">
                                  JE ID
                                </th>
                                <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-[#8B7A5E]">
                                  Description
                                </th>
                                <th className="text-right px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-[#8B7A5E]">
                                  Amount
                                </th>
                                <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-[#8B7A5E]">
                                  Posted
                                </th>
                                <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-[#8B7A5E]">
                                  Posted By
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#DDD5C2]">
                              {posted.slice(0, 20).map((entry) => {
                                const displayId =
                                  entry.entryNumber ||
                                  `AJE-${String(entry.id).slice(0, 3).toUpperCase()}`;
                                const amount = entry.amount || entry.totalDebits || '0.00';
                                return (
                                  <tr
                                    key={entry.id}
                                    className="hover:bg-[#E6DEC9] transition-colors"
                                  >
                                    <td className="px-4 py-3">
                                      <span className="inline-flex items-center gap-2">
                                        <span
                                          className="w-0.5 h-5 rounded-full"
                                          style={{ backgroundColor: '#B8860B' }}
                                        />
                                        <span className="font-mono text-[#2C2416] font-medium">
                                          {displayId}
                                        </span>
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-[#5C4F3A] max-w-xs truncate">
                                      {entry.memo || entry.description || '--'}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-[#2C2416]">
                                      {fmtMoney(amount, { dollar: true, dash: false })}
                                    </td>
                                    <td className="px-4 py-3 text-[#8B7A5E] text-xs">
                                      {formatDateTime(entry.postedAt)}
                                    </td>
                                    <td className="px-4 py-3 text-[#5C4F3A]">
                                      {entry.postedBy || entry.createdBy || '--'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Immutability notice */}
                  <div className="bg-[#F0E8D0] border border-[#8B6914]/20 rounded-lg px-4 py-3 flex items-start gap-3">
                    <Lock size={16} className="text-[#8B6914] shrink-0 mt-0.5" />
                    <p className="text-xs text-[#8B6914] leading-relaxed">
                      Posted journal entries are immutable — database triggers prevent modification
                      or deletion after posting. This is enforced at the PostgreSQL level and cannot
                      be bypassed by application code.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      {correctingEntry && (
        <CorrectionDialog
          entry={correctingEntry}
          onClose={() => setCorrectingEntry(null)}
          onSaved={handleCorrectionSaved}
        />
      )}
      {rejectingEntry && (
        <RejectDialog
          entry={rejectingEntry}
          onClose={() => setRejectingEntry(null)}
          onConfirm={(reason) => rejectMutation.mutate({ id: rejectingEntry.id, reason })}
          isPending={rejectMutation.isPending}
          error={rejectMutation.error as Error | null}
        />
      )}
    </div>
  );
}
