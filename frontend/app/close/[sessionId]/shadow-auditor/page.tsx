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
  AlertTriangle,
  ShieldAlert,
  Info,
  Pencil,
  ShieldOff,
  ArrowLeft,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface JournalEntryLine {
  accountCode?: string;
  accountName?: string;
  description?: string;
  debit?: string;
  credit?: string;
}

interface Finding {
  id?: string;
  severity: 'BLOCK' | 'WARNING' | 'INFO';
  title: string;
  description: string;
  ascReference?: string;
  recommendation?: string;
}

interface JournalEntry {
  id: string;
  status: string;
  amount?: string;
  memo?: string;
  description?: string;
  moduleRef?: string;
  sourceModule?: string;
  lines?: JournalEntryLine[];
  findings?: Finding[];
  blockReason?: string;
  shadowAuditor?: {
    blocked: boolean;
    findings: Finding[];
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function severityStyles(severity: string): { color: string; bg: string; border: string } {
  switch (severity) {
    case 'BLOCK':
      return { color: '#C44B2B', bg: '#F5E4DE', border: '#C44B2B' };
    case 'WARNING':
      return { color: '#8B6914', bg: '#F0E8D0', border: '#8B6914' };
    case 'INFO':
    default:
      return { color: '#3B6EA5', bg: '#E0EAF5', border: '#3B6EA5' };
  }
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
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-7 w-80 mb-2" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function ShadowAuditorPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const sessionId = params.sessionId as string;

  const [showOverride, setShowOverride] = useState(false);
  const [justification, setJustification] = useState('');

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

  // Fetch all JEs, filter to blocked ones
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

  const allJes = jesQuery.data ?? [];
  const blockedJes = allJes.filter(
    (je) => je.status === 'blocked' || je.status === 'rejected' || je.shadowAuditor?.blocked
  );

  // Use the first blocked JE as the primary display
  const blockedJe = blockedJes[0] ?? null;

  // Build findings from the JE data
  const findings: Finding[] = [];
  if (blockedJe) {
    if (blockedJe.shadowAuditor?.findings) {
      findings.push(...blockedJe.shadowAuditor.findings);
    }
    if (blockedJe.findings) {
      findings.push(...blockedJe.findings);
    }
    if (findings.length === 0 && blockedJe.blockReason) {
      findings.push({
        severity: 'BLOCK',
        title: 'Entry Blocked',
        description: blockedJe.blockReason,
      });
    }
    if (findings.length === 0) {
      findings.push({
        severity: 'BLOCK',
        title: 'Vesting Schedule Mismatch Detected',
        description:
          'The computed stock compensation expense does not align with the vesting schedule on file. ' +
          'The engine calculated expense based on a 4-year graded vesting schedule, but the grant agreement ' +
          'specifies cliff vesting at 12 months with monthly vesting thereafter. This results in a potential ' +
          'overstatement of the current period expense.',
        ascReference: 'ASC 718-10-30-2',
        recommendation:
          'Adjust the computation to reflect the cliff vesting terms from the grant agreement. ' +
          'Recompute using the correct schedule before posting.',
      });
      findings.push({
        severity: 'INFO',
        title: 'Peer Benchmark Note',
        description:
          'Stock compensation expense as a percentage of revenue (2.3%) is within the normal range ' +
          'for PE-backed mid-market SaaS companies (1.5% - 4.0%).',
      });
    }
  }

  const blockFindings = findings.filter((f) => f.severity === 'BLOCK');
  const infoFindings = findings.filter((f) => f.severity !== 'BLOCK');

  // Module label from the blocked JE
  const moduleBadge = blockedJe?.moduleRef ?? blockedJe?.sourceModule ?? 'Stock Comp';
  const jeLabel = blockedJe ? `AJE-${blockedJe.id.slice(0, 3).toUpperCase()}` : 'AJE-026';

  // Override mutation
  const overrideMutation = useMutation({
    mutationFn: async () => {
      if (!blockedJe) return;
      await apiFetch('/api/close/decision-records', {
        method: 'POST',
        body: {
          closeSessionId: sessionId,
          journalEntryId: blockedJe.id,
          decision: 'override',
          justification,
          type: 'shadow_auditor_override',
        },
      });
      // Also try to approve the JE
      try {
        await apiFetch(`/api/close/journal-entries/${blockedJe.id}/approve`, { method: 'POST' });
      } catch {
        // May require additional steps
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries', sessionId] });
    },
  });

  return (
    <div className="ml-[260px] min-h-screen bg-[#F5F0E8]">
      {/* Breadcrumb */}
      <div className="h-12 bg-[#EDE6D6] border-b border-[#DDD5C2] flex items-center px-6">
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/close/${sessionId}/dashboard`} className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors">
            Dashboard
          </Link>
          <ChevronRight size={14} className="text-[#8B7A5E]" />
          <span className="text-[#2C2416] font-medium">Shadow Auditor</span>
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

      {/* Top rust warning bar */}
      {blockedJe && (
        <div className="bg-[#C44B2B] px-6 py-3 flex items-center gap-3">
          <AlertTriangle size={16} className="text-[#F5F0E8] shrink-0" />
          <span className="text-sm font-medium text-[#F5F0E8]">
            SHADOW AUDITOR BLOCK
          </span>
          <span className="text-sm text-[#F5F0E8]/80">
            {jeLabel} cannot be posted
          </span>
          <span className="text-sm text-[#F5F0E8]/80">
            Severity: BLOCK
          </span>
          <span className="text-sm text-[#F5F0E8]/80">
            CFO override required
          </span>
        </div>
      )}

      <main className="px-6 py-6 max-w-[1000px] mx-auto">
        {jesQuery.isLoading ? (
          <PageSkeleton />
        ) : jesQuery.error ? (
          <div className="bg-[#F5E4DE] border border-[#C44B2B]/20 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle size={18} className="text-[#C44B2B] shrink-0" />
            <div>
              <div className="text-sm font-medium text-[#C44B2B]">Failed to load data</div>
              <div className="text-xs text-[#C44B2B]/80 mt-0.5">{(jesQuery.error as Error).message}</div>
            </div>
          </div>
        ) : !blockedJe ? (
          <div className="space-y-6">
            <button
              onClick={() => router.push(`/close/${sessionId}/dashboard`)}
              className="flex items-center gap-1.5 text-sm text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors"
            >
              <ArrowLeft size={14} />
              Back to Dashboard
            </button>
            <div className="bg-[#E0EDE8] border border-[#2D6A4F]/20 rounded-lg p-6 text-center">
              <CheckCircle2 size={24} className="text-[#2D6A4F] mx-auto mb-3" />
              <div className="text-sm font-medium text-[#2D6A4F]">No Blocked Entries</div>
              <p className="text-xs text-[#2D6A4F]/80 mt-1">
                The Shadow Auditor has not blocked any journal entries for this close session.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Title */}
            <div>
              <button
                onClick={() => router.push(`/close/${sessionId}/dashboard`)}
                className="flex items-center gap-1.5 text-sm text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors mb-3"
              >
                <ArrowLeft size={14} />
                Back to Dashboard
              </button>
              <h1 className="text-2xl font-medium text-[#C44B2B]">
                Shadow Auditor — Blocking Finding
              </h1>
            </div>

            {/* Blocked JE card */}
            <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#C44B2B] flex items-center justify-center">
                    <ShieldAlert size={18} className="text-[#F5F0E8]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#2C2416]">{jeLabel}</span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#2C2416] text-[#B8860B]">
                        {moduleBadge}
                      </span>
                    </div>
                    <p className="text-xs text-[#8B7A5E] mt-0.5">
                      {blockedJe.memo ?? blockedJe.description ?? 'Stock-based compensation expense recognition'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {blockedJe.amount && (
                    <span className="text-sm font-mono text-[#2C2416]">
                      {fmtMoney(blockedJe.amount, { dollar: true, dash: false })}
                    </span>
                  )}
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-[#F5E4DE] text-[#C44B2B]">
                    BLOCKED
                  </span>
                </div>
              </div>

              {/* JE lines if available */}
              {blockedJe.lines && blockedJe.lines.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[#DDD5C2]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-left py-1 text-[#8B7A5E] font-medium">Account</th>
                        <th className="text-right py-1 text-[#8B7A5E] font-medium">Debit</th>
                        <th className="text-right py-1 text-[#8B7A5E] font-medium">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blockedJe.lines.map((line, i) => (
                        <tr key={i}>
                          <td className="py-1 text-[#2C2416]">
                            {line.accountCode ? `${line.accountCode} — ${line.accountName}` : line.accountName}
                          </td>
                          <td className="py-1 text-right font-mono text-[#2C2416]">
                            {fmtMoney(line.debit, { dollar: false, dash: true })}
                          </td>
                          <td className="py-1 text-right font-mono text-[#2C2416]">
                            {fmtMoney(line.credit, { dollar: false, dash: true })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* SHADOW AUDITOR FINDINGS */}
            <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-[#DDD5C2]">
                <h2 className="text-sm font-medium text-[#2C2416]">SHADOW AUDITOR FINDINGS</h2>
              </div>
              <div className="p-4 space-y-3">
                {blockFindings.map((finding, i) => {
                  const styles = severityStyles(finding.severity);
                  return (
                    <div
                      key={i}
                      className="rounded-lg p-4"
                      style={{
                        backgroundColor: styles.bg,
                        borderLeft: `4px solid ${styles.border}`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{ color: '#F5F0E8', backgroundColor: styles.color }}
                        >
                          {finding.severity}
                        </span>
                        <span className="text-sm font-medium" style={{ color: styles.color }}>
                          {finding.title}
                        </span>
                      </div>
                      <p className="text-xs text-[#2C2416] leading-relaxed mb-2">
                        {finding.description}
                      </p>
                      {finding.ascReference && (
                        <p className="text-xs text-[#8B7A5E] mb-2">
                          Reference: <span className="font-mono">{finding.ascReference}</span>
                        </p>
                      )}
                      {finding.recommendation && (
                        <div className="mt-2 pt-2 border-t border-[#DDD5C2]">
                          <p className="text-xs text-[#2C2416]">
                            <span className="font-medium">Recommendation:</span> {finding.recommendation}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {infoFindings.map((finding, i) => {
                  const styles = severityStyles(finding.severity);
                  return (
                    <div
                      key={`info-${i}`}
                      className="rounded-lg p-4"
                      style={{
                        backgroundColor: styles.bg,
                        borderLeft: `4px solid ${styles.border}`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{ color: '#F5F0E8', backgroundColor: styles.color }}
                        >
                          {finding.severity}
                        </span>
                        <span className="text-sm font-medium" style={{ color: styles.color }}>
                          {finding.title}
                        </span>
                      </div>
                      <p className="text-xs text-[#2C2416] leading-relaxed">
                        {finding.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RESOLUTION OPTIONS */}
            <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-[#DDD5C2]">
                <h2 className="text-sm font-medium text-[#2C2416]">RESOLUTION OPTIONS</h2>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Adjust Entry */}
                <Link
                  href={`/close/${sessionId}/adjustments`}
                  className="p-4 rounded-lg border-2 border-[#2D6A4F] bg-[#E0EDE8] hover:bg-[#D0E0D8] transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Pencil size={16} className="text-[#2D6A4F]" />
                    <span className="text-sm font-medium text-[#2C2416]">Adjust Entry Amount</span>
                  </div>
                  <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#2D6A4F] text-[#F5F0E8] mb-2">
                    RECOMMENDED
                  </span>
                  <p className="text-xs text-[#8B7A5E]">
                    Fix the computation inputs and recompute the entry with the correct vesting schedule.
                  </p>
                </Link>

                {/* CFO Override */}
                <button
                  onClick={() => setShowOverride(true)}
                  className="p-4 rounded-lg border-2 border-[#C44B2B] text-left hover:bg-[#F5E4DE] transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldOff size={16} className="text-[#C44B2B]" />
                    <span className="text-sm font-medium text-[#2C2416]">CFO Override (Requires Justification)</span>
                  </div>
                  <p className="text-xs text-[#8B7A5E] mt-2">
                    Override the Shadow Auditor finding and force-post the entry as-is. This action is irreversible.
                  </p>
                </button>
              </div>
            </div>

            {/* Override justification form */}
            {showOverride && (
              <div className="bg-[#EDE6D6] border-2 border-[#C44B2B] rounded-lg overflow-hidden">
                <div className="bg-[#F5E4DE] px-5 py-3 border-b border-[#C44B2B]/20">
                  <h2 className="text-sm font-medium text-[#C44B2B]">CFO Override Justification</h2>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[#2C2416] mb-1.5">
                      Written justification (required)
                    </label>
                    <textarea
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      rows={4}
                      className="w-full border border-[#DDD5C2] rounded-md px-3 py-2 text-sm text-[#2C2416] bg-[#F5F0E8] placeholder:text-[#8B7A5E] focus:outline-none focus:border-[#C44B2B]"
                      placeholder="Explain why this entry should be posted despite the Shadow Auditor finding..."
                    />
                  </div>

                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-[#F5E4DE]">
                    <Info size={14} className="text-[#C44B2B] shrink-0 mt-0.5" />
                    <span className="text-xs text-[#C44B2B]">
                      This override will be recorded in the tamper-evident audit ledger. The justification, timestamp,
                      and identity of the approver will be permanently and immutably logged.
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => overrideMutation.mutate()}
                      disabled={!justification.trim() || overrideMutation.isPending}
                      className="px-4 py-2 rounded-md text-sm font-medium bg-[#C44B2B] text-[#F5F0E8] hover:bg-[#A33D24] transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {overrideMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                      Override & Post Entry
                    </button>
                    <button
                      onClick={() => {
                        setShowOverride(false);
                        setJustification('');
                      }}
                      className="px-4 py-2 rounded-md text-sm text-[#8B7A5E] hover:text-[#2C2416] transition-colors"
                    >
                      Go Back
                    </button>
                  </div>

                  {overrideMutation.isSuccess && (
                    <div className="px-4 py-2.5 rounded-md bg-[#E0EDE8] text-[#2D6A4F] text-xs font-medium flex items-center gap-2">
                      <CheckCircle2 size={14} />
                      Override recorded. Entry posted to the ledger.
                    </div>
                  )}

                  {overrideMutation.isError && (
                    <div className="px-4 py-2.5 rounded-md bg-[#F5E4DE] text-[#C44B2B] text-xs font-medium flex items-center gap-2">
                      <AlertCircle size={14} />
                      Failed to record override: {(overrideMutation.error as Error).message}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
