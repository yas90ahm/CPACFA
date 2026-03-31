'use client';

import React, { useState, useMemo } from 'react';
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
  ChevronDown,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  Lock,
  Building2,
  Users,
  Landmark,
  Receipt,
  FileStack,
  Package,
  Award,
  TrendingDown,
  Layers,
  DollarSign,
  ShieldAlert,
  Pencil,
  SkipForward,
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
/*  Static module definitions (for card rendering)                     */
/* ------------------------------------------------------------------ */

interface ModuleDef {
  id: string;
  number: string;
  name: string;
  asc: string;
  icon: React.ElementType;
}

const MODULES: ModuleDef[] = [
  { id: 'prepaids', number: '01', name: 'Prepaids & Deferrals', asc: 'ASC 340', icon: Clock },
  { id: 'fixed-assets', number: '02', name: 'Fixed Assets & Depreciation', asc: 'ASC 360', icon: Building2 },
  { id: 'payroll', number: '03', name: 'Payroll Accruals', asc: 'ASC 710', icon: Users },
  { id: 'debt-interest', number: '04', name: 'Debt & Interest Accrual', asc: 'ASC 835', icon: Landmark },
  { id: 'deferred-tax', number: '05', name: 'Deferred Tax Provision', asc: 'ASC 740', icon: Receipt },
  { id: 'leases', number: '06', name: 'Lease Accounting', asc: 'ASC 842', icon: FileStack },
  { id: 'inventory', number: '07', name: 'Inventory Reserves', asc: 'ASC 330', icon: Package },
  { id: 'stock-comp', number: '08', name: 'Stock Compensation', asc: 'ASC 718', icon: Award },
  { id: 'impairment', number: '09', name: 'Impairment Testing', asc: 'ASC 350/360', icon: TrendingDown },
  { id: 'ap-aging', number: '10', name: 'AP Aging & Accruals', asc: 'ASC 405', icon: BarChart3 },
  { id: 'ar-cecl', number: '11', name: 'AR & CECL Allowance', asc: 'ASC 326', icon: ShieldAlert },
  { id: 'segments', number: '12', name: 'Segment Allocations', asc: 'ASC 280', icon: Layers },
  { id: 'revenue', number: '13', name: 'Revenue Recognition', asc: 'ASC 606', icon: DollarSign },
];

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
  gatesPassing,
  gatesTotal,
  sessionState,
  postedCount,
  pendingCount,
}: {
  gates: Gate[];
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
  moduleDef: ModuleDef;
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
              {moduleDef.asc}
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
            onClick={() => {
              /* Modify amounts — could open a modal or inline editor */
            }}
            disabled={isActing}
            className="px-4 py-2 text-xs font-medium rounded border border-[#DDD5C2] text-[#5C4F3A] bg-[#F5F0E8] hover:bg-[#EDE6D6] transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Pencil size={12} />
            Modify Amounts
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
  isActing,
}: {
  entry: JournalEntry;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
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

/** Check if an entry source starts with 'module:' */
function isModuleSourceEntry(entry: JournalEntry): boolean {
  const src = entry.source || entry.sourceModule || entry.moduleRef || '';
  return src.toLowerCase().startsWith('module:');
}

/* ------------------------------------------------------------------ */
/*  Tab Button                                                         */
/* ------------------------------------------------------------------ */

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
  const sessionId = params.sessionId as string;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'modules' | 'manual'>('modules');
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [actingOnId, setActingOnId] = useState<string | null>(null);

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
    queryKey: ['journal-entries', sessionId],
    queryFn: async () => {
      const data = await apiFetch<{ entries?: JournalEntry[] } | JournalEntry[]>(
        '/api/close/journal-entries',
        { params: { closeSessionId: sessionId } }
      );
      return Array.isArray(data) ? data : data.entries ?? [];
    },
    enabled: !!sessionId,
  });

  /* --- Mutations (Manual Entries tab) --- */

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/close/journal-entries/${id}/approve`, { method: 'POST' }),
    onMutate: (id) => setActingOnId(id),
    onSettled: () => {
      setActingOnId(null);
      queryClient.invalidateQueries({ queryKey: ['journal-entries', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['close-readiness', sessionId] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/close/journal-entries/${id}/reject`, { method: 'POST' }),
    onMutate: (id) => setActingOnId(id),
    onSettled: () => {
      setActingOnId(null);
      queryClient.invalidateQueries({ queryKey: ['journal-entries', sessionId] });
    },
  });

  /* --- Derived state --- */

  const session = sessionQuery.data;
  const gates = readinessQuery.data?.gates ?? [];
  const gatesPassing = readinessQuery.data?.gatesPassing ?? 0;
  const gatesTotal = readinessQuery.data?.gatesTotal ?? 0;
  const allEntries = jesQuery.data ?? [];
  const proposals = proposalsQuery.data ?? [];

  // Manual entries: filter out module-sourced entries
  const manualEntries = useMemo(
    () => allEntries.filter((e) => !isModuleSourceEntry(e)),
    [allEntries]
  );

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
    queryClient.invalidateQueries({ queryKey: ['journal-entries', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['close-readiness', sessionId] });
  };

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
            <span className="text-[#2C2416] font-medium">Journal Entries</span>
          </div>
        </div>

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
              <div className="flex items-center gap-3">
                <TabButton
                  active={activeTab === 'modules'}
                  label="Module Review"
                  count={proposals.filter((p) => p.status === 'pending' || p.status === 'proposed').length}
                  onClick={() => setActiveTab('modules')}
                />
                <TabButton
                  active={activeTab === 'manual'}
                  label="Manual Entries"
                  count={manualEntries.length}
                  onClick={() => setActiveTab('manual')}
                />
              </div>

              {/* ============================================== */}
              {/*  TAB 1: Module Review                          */}
              {/* ============================================== */}
              {activeTab === 'modules' && (
                <div className="space-y-6">
                  {/* Module grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {MODULES.map((mod) => {
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
              {activeTab === 'manual' && (
                <div className="space-y-6">
                  {/* Lifecycle counter cards */}
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
                            onReject={(id) => rejectMutation.mutate(id)}
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
    </div>
  );
}
