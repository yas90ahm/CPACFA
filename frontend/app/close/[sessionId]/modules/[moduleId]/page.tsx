'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { fmtMoney } from '@/lib/money';
import {
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  ThumbsUp,
  Pencil,
  SkipForward,
  Loader2,
  ArrowLeft,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface JournalEntryLine {
  id?: string;
  accountCode?: string;
  accountName?: string;
  description?: string;
  debit?: string;
  credit?: string;
  provenance?: string;
}

interface JournalEntry {
  id: string;
  status: string;
  amount?: string;
  memo?: string;
  description?: string;
  moduleRef?: string;
  sourceModule?: string;
  provenance?: string;
  lines?: JournalEntryLine[];
  createdAt?: string;
}

interface ComputationInput {
  label: string;
  value: string;
  source?: string;
}

interface DataQualityFlag {
  severity: 'info' | 'warning' | 'error';
  message: string;
}

/* ------------------------------------------------------------------ */
/*  Module metadata                                                    */
/* ------------------------------------------------------------------ */

const MODULE_META: Record<string, { name: string; asc: string; fullAsc: string }> = {
  prepaids: { name: 'Prepaids & Deferrals', asc: 'ASC 340', fullAsc: 'ASC 340-10' },
  'fixed-assets': { name: 'Fixed Assets & Depreciation', asc: 'ASC 360', fullAsc: 'ASC 360-10' },
  payroll: { name: 'Payroll Accruals', asc: 'ASC 710', fullAsc: 'ASC 710-10' },
  'debt-interest': { name: 'Debt & Interest Accrual', asc: 'ASC 835', fullAsc: 'ASC 835-30' },
  'deferred-tax': { name: 'Deferred Tax Provision', asc: 'ASC 740', fullAsc: 'ASC 740-10' },
  leases: { name: 'Lease Accounting', asc: 'ASC 842', fullAsc: 'ASC 842-20' },
  inventory: { name: 'Inventory Reserves', asc: 'ASC 330', fullAsc: 'ASC 330-10' },
  'stock-comp': { name: 'Stock Compensation', asc: 'ASC 718', fullAsc: 'ASC 718-10' },
  impairment: { name: 'Impairment Testing', asc: 'ASC 350/360', fullAsc: 'ASC 350-20 / 360-10' },
  'ap-aging': { name: 'AP Aging & Accruals', asc: 'ASC 405', fullAsc: 'ASC 405-20' },
  'ar-cecl': { name: 'AR & CECL Allowance', asc: 'ASC 326', fullAsc: 'ASC 326-20' },
  segments: { name: 'Segment Allocations', asc: 'ASC 280', fullAsc: 'ASC 280-10' },
  revenue: { name: 'Revenue Recognition', asc: 'ASC 606', fullAsc: 'ASC 606-10' },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function provenanceBadge(provenance?: string): { label: string; color: string; bg: string } {
  switch (provenance) {
    case 'engine_calculation':
      return { label: 'engine_calculation', color: '#2D6A4F', bg: '#E0EDE8' };
    case 'ledger_exact':
      return { label: 'ledger_exact', color: '#B8860B', bg: '#F0E8D0' };
    case 'ai_suggested':
      return { label: 'ai_suggested', color: '#3B6EA5', bg: '#E0EAF5' };
    default:
      return { label: provenance ?? 'manual', color: '#8B7A5E', bg: '#EDE6D6' };
  }
}

function buildInputsFromJE(je: JournalEntry): ComputationInput[] {
  const inputs: ComputationInput[] = [];
  if (je.memo) {
    inputs.push({ label: 'Memo', value: je.memo, source: 'engine_calculation' });
  }
  if (je.amount) {
    inputs.push({ label: 'Computed Amount', value: fmtMoney(je.amount, { dollar: true, dash: false }), source: 'engine_calculation' });
  }
  if (je.createdAt) {
    inputs.push({ label: 'Created', value: new Date(je.createdAt).toLocaleDateString(), source: 'engine_calculation' });
  }
  return inputs;
}

function buildFlags(jes: JournalEntry[]): DataQualityFlag[] {
  const flags: DataQualityFlag[] = [];

  // Check balance
  let totalDebit = 0;
  let totalCredit = 0;
  for (const je of jes) {
    for (const line of je.lines ?? []) {
      totalDebit += parseFloat(String(line.debit ?? '0').replace(/[$,]/g, '')) || 0;
      totalCredit += parseFloat(String(line.credit ?? '0').replace(/[$,]/g, '')) || 0;
    }
  }
  const diff = Math.abs(totalDebit - totalCredit);
  if (diff < 0.02) {
    flags.push({ severity: 'info', message: 'All proposed entries balance (debits = credits). No exceptions.' });
  } else {
    flags.push({ severity: 'warning', message: `Imbalance detected: debits and credits differ by ${fmtMoney(diff.toFixed(2), { dollar: true, dash: false })}.` });
  }

  if (jes.length > 0) {
    flags.push({ severity: 'info', message: `${jes.length} journal entr${jes.length === 1 ? 'y' : 'ies'} proposed by deterministic calculation engine.` });
  }

  const blocked = jes.filter((j) => j.status === 'blocked' || j.status === 'rejected');
  if (blocked.length > 0) {
    flags.push({ severity: 'warning', message: `${blocked.length} entr${blocked.length === 1 ? 'y' : 'ies'} blocked by Shadow Auditor review.` });
  }

  return flags;
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
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function ModuleDrillDownPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const sessionId = params.sessionId as string;
  const moduleId = params.moduleId as string;

  const [skipReason, setSkipReason] = useState('');
  const [selectedAction, setSelectedAction] = useState<'approve' | 'modify' | 'skip' | null>(null);

  const sessionQuery = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => apiFetch<any>(`/api/close/sessions/${sessionId}`),
    enabled: !!sessionId,
  });
  const readinessQuery = useQuery({
    queryKey: ['readiness', sessionId],
    queryFn: () => apiFetch<any>(`/api/close/sessions/${sessionId}/readiness`, { params: { format: 'gates' } }),
    enabled: !!sessionId,
  });

  const meta = MODULE_META[moduleId] ?? {
    name: moduleId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    asc: '',
    fullAsc: '',
  };

  // Fetch JEs for this module
  const jesQuery = useQuery({
    queryKey: ['module-jes', sessionId, moduleId],
    queryFn: async () => {
      const data = await apiFetch<{ entries?: JournalEntry[] } | JournalEntry[]>(
        '/api/close/journal-entries',
        { params: { closeSessionId: sessionId, moduleRef: moduleId } }
      );
      const entries = Array.isArray(data) ? data : data.entries ?? [];
      // If moduleRef filter didn't work, filter client-side
      if (entries.length === 0) {
        const allData = await apiFetch<{ entries?: JournalEntry[] } | JournalEntry[]>(
          '/api/close/journal-entries',
          { params: { closeSessionId: sessionId } }
        );
        const allEntries = Array.isArray(allData) ? allData : allData.entries ?? [];
        return allEntries.filter((je) => {
          const ref = (je.moduleRef ?? je.sourceModule ?? '').toLowerCase().replace(/[\s_-]/g, '');
          return ref.includes(moduleId.replace(/-/g, ''));
        });
      }
      return entries;
    },
    enabled: !!sessionId && !!moduleId,
  });

  const jes = jesQuery.data ?? [];

  // Flatten all lines from all JEs
  const allLines: (JournalEntryLine & { jeId: string; jeProvenance?: string })[] = [];
  for (const je of jes) {
    if (je.lines && je.lines.length > 0) {
      for (const line of je.lines) {
        allLines.push({ ...line, jeId: je.id, jeProvenance: line.provenance ?? je.provenance });
      }
    } else {
      // Synthesize a line from the JE itself
      allLines.push({
        jeId: je.id,
        accountCode: '',
        accountName: je.memo ?? je.description ?? '',
        description: je.memo ?? je.description ?? '',
        debit: je.amount ?? '0.00',
        credit: '0.00',
        jeProvenance: je.provenance,
      });
    }
  }

  // Totals
  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of allLines) {
    totalDebit += parseFloat(String(line.debit ?? '0').replace(/[$,]/g, '')) || 0;
    totalCredit += parseFloat(String(line.credit ?? '0').replace(/[$,]/g, '')) || 0;
  }
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.02;

  const inputs = jes.length > 0 ? buildInputsFromJE(jes[0]) : [];
  const flags = buildFlags(jes);

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      for (const je of jes) {
        if (je.status === 'proposed' || je.status === 'pending_approval') {
          try {
            await apiFetch(`/api/close/journal-entries/${je.id}/approve`, { method: 'POST' });
          } catch {
            // Some may already be approved
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['module-jes', sessionId, moduleId] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries', sessionId] });
    },
  });

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      {/* Breadcrumb */}
      <div className="h-12 bg-[#EDE6D6] border-b border-[#DDD5C2] flex items-center px-6">
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/close/${sessionId}/dashboard`} className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors">
            Dashboard
          </Link>
          <ChevronRight size={14} className="text-[#8B7A5E]" />
          <Link href={`/close/${sessionId}/modules`} className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors">
            Modules
          </Link>
          <ChevronRight size={14} className="text-[#8B7A5E]" />
          <span className="text-[#2C2416] font-medium">{meta.name}</span>
        </div>
      </div>

      {/* Progress Rail */}
      {(() => {
        const _gates = (readinessQuery.data as any)?.gates ?? [];
        const _gatesTotal = (readinessQuery.data as any)?.gatesTotal ?? _gates.length;
        const _activeGateIndex = _gates.findIndex((g: any) => !g.passing);
        const _activeGateNum = _activeGateIndex >= 0 ? _activeGateIndex + 1 : _gatesTotal;
        const _startedAt = (sessionQuery.data as any)?.startedAt ?? (sessionQuery.data as any)?.createdAt ?? new Date().toISOString();
        const _dayElapsed = Math.max(1, Math.ceil((Date.now() - new Date(_startedAt).getTime()) / (1000 * 60 * 60 * 24)));
        const _targetDays = (sessionQuery.data as any)?.closeDayTarget ?? 10;
        const _sessionState = ((sessionQuery.data as any)?.state ?? 'IN_PROGRESS').replace(/_/g, ' ');
        const _periodLabel = (sessionQuery.data as any)?.periodLabel ?? '';
        return _gates.length > 0 ? (
          <div className="bg-[#2C2416] px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-[#B8860B] font-medium">
                Gate {_activeGateNum} of {_gatesTotal}
              </span>
              <span className="text-[#8B7A5E]">
                Close Day {_dayElapsed} of {_targetDays}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#3B1F0A] text-[#B8860B]">
                {_sessionState}
              </span>
              {_periodLabel && <span className="text-[#8B7A5E]">{_periodLabel}</span>}
            </div>
            <div className="flex items-center gap-1.5">
              {_gates.map((gate: any, i: number) => {
                let bg = '#5C4F3A';
                if (gate.passing) bg = '#2D6A4F';
                else if (i === _activeGateIndex) bg = '#B8860B';
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
        ) : null;
      })()}

      <main className="px-6 py-6 max-w-[1000px] mx-auto">
        {jesQuery.isLoading ? (
          <PageSkeleton />
        ) : jesQuery.error ? (
          <div className="bg-[#F5E4DE] border border-[#C44B2B]/20 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle size={18} className="text-[#C44B2B] shrink-0" />
            <div>
              <div className="text-sm font-medium text-[#C44B2B]">Failed to load module data</div>
              <div className="text-xs text-[#C44B2B]/80 mt-0.5">{(jesQuery.error as Error).message}</div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Back link + Title */}
            <div>
              <button
                onClick={() => router.push(`/close/${sessionId}/modules`)}
                className="flex items-center gap-1.5 text-sm text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors mb-3"
              >
                <ArrowLeft size={14} />
                Back to Modules
              </button>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-medium text-[#2C2416]">{meta.name}</h1>
                {meta.asc && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#2C2416] text-[#B8860B]">
                    {meta.asc}
                  </span>
                )}
              </div>
              {meta.fullAsc && (
                <p className="text-xs text-[#8B7A5E] mt-1">
                  Guidance: {meta.fullAsc}
                </p>
              )}
            </div>

            {/* Progress rail */}
            <div className="bg-[#2C2416] rounded-lg px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-[#B8860B] font-medium">{meta.name}</span>
                <span className="text-[#8B7A5E]">
                  {jes.length} JE{jes.length !== 1 ? 's' : ''} proposed
                </span>
                <span className="text-[#8B7A5E]">
                  {allLines.length} line{allLines.length !== 1 ? 's' : ''}
                </span>
              </div>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded ${
                  isBalanced ? 'bg-[#E0EDE8] text-[#2D6A4F]' : 'bg-[#F5E4DE] text-[#C44B2B]'
                }`}
              >
                {isBalanced ? 'Balanced' : 'Imbalanced'}
              </span>
            </div>

            {/* COMPUTATION INPUTS */}
            {inputs.length > 0 && (
              <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
                <div className="px-5 py-3 border-b border-[#DDD5C2]">
                  <h2 className="text-sm font-medium text-[#2C2416]">COMPUTATION INPUTS</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#DDD5C2]">
                        <th className="text-left px-5 py-2.5 text-xs font-medium text-[#8B7A5E]">Source</th>
                        <th className="text-left px-5 py-2.5 text-xs font-medium text-[#8B7A5E]">Parameter</th>
                        <th className="text-left px-5 py-2.5 text-xs font-medium text-[#8B7A5E]">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inputs.map((input, i) => {
                        const badge = provenanceBadge(input.source);
                        return (
                          <tr key={i} className="border-b border-[#DDD5C2] last:border-b-0">
                            <td className="px-5 py-2.5">
                              <span
                                className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                                style={{ color: badge.color, backgroundColor: badge.bg }}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-5 py-2.5 text-[#2C2416]">{input.label}</td>
                            <td className="px-5 py-2.5 font-mono text-[#2C2416]">{input.value}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* PROPOSED JOURNAL ENTRY LINES */}
            <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-[#DDD5C2]">
                <h2 className="text-sm font-medium text-[#2C2416]">PROPOSED JOURNAL ENTRY LINES</h2>
              </div>
              {allLines.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-[#8B7A5E]">
                  No journal entries proposed for this module.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#DDD5C2]">
                        <th className="text-left px-5 py-2.5 text-xs font-medium text-[#8B7A5E]">JE ID</th>
                        <th className="text-left px-5 py-2.5 text-xs font-medium text-[#8B7A5E]">Account</th>
                        <th className="text-left px-5 py-2.5 text-xs font-medium text-[#8B7A5E]">Description</th>
                        <th className="text-right px-5 py-2.5 text-xs font-medium text-[#8B7A5E]">Debit</th>
                        <th className="text-right px-5 py-2.5 text-xs font-medium text-[#8B7A5E]">Credit</th>
                        <th className="text-left px-5 py-2.5 text-xs font-medium text-[#8B7A5E]">Provenance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allLines.map((line, i) => {
                        const badge = provenanceBadge(line.jeProvenance);
                        return (
                          <tr key={i} className="border-b border-[#DDD5C2]">
                            <td className="px-5 py-2.5 font-mono text-xs text-[#8B7A5E]">
                              {line.jeId.slice(0, 8)}
                            </td>
                            <td className="px-5 py-2.5 text-[#2C2416]">
                              {line.accountCode ? `${line.accountCode} — ${line.accountName ?? ''}` : line.accountName ?? ''}
                            </td>
                            <td className="px-5 py-2.5 text-[#8B7A5E]">{line.description ?? ''}</td>
                            <td className="px-5 py-2.5 text-right font-mono text-[#2C2416]">
                              {fmtMoney(line.debit, { dollar: false, dash: true })}
                            </td>
                            <td className="px-5 py-2.5 text-right font-mono text-[#2C2416]">
                              {fmtMoney(line.credit, { dollar: false, dash: true })}
                            </td>
                            <td className="px-5 py-2.5">
                              <span
                                className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                                style={{ color: badge.color, backgroundColor: badge.bg }}
                              >
                                {badge.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* Footer totals */}
                    <tfoot>
                      <tr className="bg-[#F5F0E8]">
                        <td className="px-5 py-2.5" colSpan={3}>
                          <span className="text-xs font-medium text-[#2C2416]">TOTALS</span>
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono text-sm font-medium text-[#2C2416]">
                          {fmtMoney(totalDebit.toFixed(2), { dollar: false, dash: true })}
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono text-sm font-medium text-[#2C2416]">
                          {fmtMoney(totalCredit.toFixed(2), { dollar: false, dash: true })}
                        </td>
                        <td className="px-5 py-2.5">
                          {isBalanced && (
                            <span className="flex items-center gap-1 text-xs font-medium text-[#2D6A4F]">
                              <CheckCircle2 size={12} />
                              Balanced
                            </span>
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* DATA QUALITY FLAGS */}
            {flags.length > 0 && (
              <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
                <div className="px-5 py-3 border-b border-[#DDD5C2]">
                  <h2 className="text-sm font-medium text-[#2C2416]">DATA QUALITY FLAGS</h2>
                </div>
                <div className="p-4 space-y-2">
                  {flags.map((flag, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 px-4 py-3 rounded-md"
                      style={{
                        borderLeft: `3px solid ${flag.severity === 'warning' ? '#8B6914' : flag.severity === 'error' ? '#C44B2B' : '#2D6A4F'}`,
                        backgroundColor: flag.severity === 'warning' ? '#F0E8D0' : flag.severity === 'error' ? '#F5E4DE' : '#E0EDE8',
                      }}
                    >
                      {flag.severity === 'warning' ? (
                        <AlertTriangle size={14} className="text-[#8B6914] shrink-0 mt-0.5" />
                      ) : flag.severity === 'error' ? (
                        <AlertCircle size={14} className="text-[#C44B2B] shrink-0 mt-0.5" />
                      ) : (
                        <Info size={14} className="text-[#2D6A4F] shrink-0 mt-0.5" />
                      )}
                      <span className="text-xs text-[#2C2416] leading-relaxed">{flag.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* YOUR DECISION */}
            <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-[#DDD5C2]">
                <h2 className="text-sm font-medium text-[#2C2416]">YOUR DECISION</h2>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Approve All */}
                <button
                  onClick={() => setSelectedAction('approve')}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    selectedAction === 'approve'
                      ? 'border-[#2D6A4F] bg-[#E0EDE8]'
                      : 'border-[#DDD5C2] hover:border-[#2D6A4F]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <ThumbsUp size={16} className="text-[#2D6A4F]" />
                    <span className="text-sm font-medium text-[#2C2416]">Approve All</span>
                  </div>
                  <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#E0EDE8] text-[#2D6A4F] mb-2">
                    RECOMMENDED
                  </span>
                  <p className="text-xs text-[#8B7A5E]">
                    Post all proposed entries as-is. Amounts computed by deterministic engine.
                  </p>
                </button>

                {/* Modify */}
                <button
                  onClick={() => setSelectedAction('modify')}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    selectedAction === 'modify'
                      ? 'border-[#8B7A5E] bg-[#F5F0E8]'
                      : 'border-[#DDD5C2] hover:border-[#8B7A5E]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Pencil size={16} className="text-[#8B7A5E]" />
                    <span className="text-sm font-medium text-[#2C2416]">Modify Amounts</span>
                  </div>
                  <p className="text-xs text-[#8B7A5E] mt-2">
                    Edit individual line amounts before posting. Changes will be audit-logged.
                  </p>
                </button>

                {/* Skip */}
                <button
                  onClick={() => setSelectedAction('skip')}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    selectedAction === 'skip'
                      ? 'border-[#8B7A5E] bg-[#F5F0E8]'
                      : 'border-[#DDD5C2] hover:border-[#8B7A5E]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <SkipForward size={16} className="text-[#8B7A5E]" />
                    <span className="text-sm font-medium text-[#2C2416]">Skip Module</span>
                  </div>
                  <p className="text-xs text-[#8B7A5E] mt-2">
                    Skip this module for the current period. Requires a written reason.
                  </p>
                </button>
              </div>

              {/* Skip reason input */}
              {selectedAction === 'skip' && (
                <div className="px-5 pb-4">
                  <label className="block text-xs font-medium text-[#2C2416] mb-1.5">
                    Reason for skipping (required)
                  </label>
                  <textarea
                    value={skipReason}
                    onChange={(e) => setSkipReason(e.target.value)}
                    rows={3}
                    className="w-full border border-[#DDD5C2] rounded-md px-3 py-2 text-sm text-[#2C2416] bg-[#F5F0E8] placeholder:text-[#8B7A5E] focus:outline-none focus:border-[#B8860B]"
                    placeholder="Explain why this module is being skipped..."
                  />
                </div>
              )}

              {/* Action buttons */}
              {selectedAction && (
                <div className="px-5 pb-4 flex items-center gap-3">
                  {selectedAction === 'approve' && (
                    <button
                      onClick={() => approveMutation.mutate()}
                      disabled={approveMutation.isPending}
                      className="px-4 py-2 rounded-md text-sm font-medium bg-[#2D6A4F] text-[#F5F0E8] hover:bg-[#245A42] transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {approveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                      Approve & Post All Entries
                    </button>
                  )}
                  {selectedAction === 'modify' && (
                    <Link
                      href={`/close/${sessionId}/adjustments`}
                      className="px-4 py-2 rounded-md text-sm font-medium bg-[#2C2416] text-[#B8860B] hover:bg-[#3B1F0A] transition-colors"
                    >
                      Open in Journal Entry Editor
                    </Link>
                  )}
                  {selectedAction === 'skip' && (
                    <button
                      disabled={!skipReason.trim()}
                      className="px-4 py-2 rounded-md text-sm font-medium bg-[#8B7A5E] text-[#F5F0E8] hover:bg-[#6E614A] transition-colors disabled:opacity-50"
                    >
                      Confirm Skip
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedAction(null);
                      setSkipReason('');
                    }}
                    className="px-4 py-2 rounded-md text-sm text-[#8B7A5E] hover:text-[#2C2416] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {approveMutation.isSuccess && (
                <div className="mx-5 mb-4 px-4 py-2.5 rounded-md bg-[#E0EDE8] text-[#2D6A4F] text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  All entries approved and posted successfully.
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
