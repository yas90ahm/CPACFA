'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccountingModules, matchesAccountingModule } from '@/lib/accounting-modules';
import {
  ChevronRight,
  Loader2,
  AlertCircle,
  Calculator,
  ShieldAlert,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface JournalEntry {
  id: string;
  status: string;
  memo?: string;
  source?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getModuleStatus(
  moduleId: string,
  jesByModule: Map<string, JournalEntry[]>
): { label: string; color: string; bg: string } {
  const jes = (jesByModule.get(moduleId) ?? []).filter(Boolean);
  if (jes.length === 0) {
    return { label: 'No linked JEs', color: '#8B7A5E', bg: '#EDE6D6' };
  }

  const blocked = jes.some((j) => j?.status === 'blocked' || j?.status === 'rejected');
  if (blocked) return { label: 'Blocked', color: '#C44B2B', bg: '#F5E4DE' };

  const pending = jes.filter((j) => j?.status === 'proposed' || j?.status === 'pending_approval');
  if (pending.length > 0) {
    return { label: `${pending.length} Pending`, color: '#8B6914', bg: '#F0E8D0' };
  }

  const posted = jes.filter((j) => j?.status === 'posted');
  if (posted.length === jes.length) {
    return { label: 'All Posted', color: '#2D6A4F', bg: '#E0EDE8' };
  }

  // Segments / reporting modules
  const reportable = jes.filter((j) => j?.status === 'reportable' || j?.status === 'approved');
  if (reportable.length > 0) {
    return { label: `${reportable.length} Reportable`, color: '#3B6EA5', bg: '#E0EAF5' };
  }

  return { label: 'In Progress', color: '#8B6914', bg: '#F0E8D0' };
}

function getModuleJeCount(moduleId: string, jesByModule: Map<string, JournalEntry[]>): number {
  return (jesByModule.get(moduleId) ?? []).length;
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
      <div>
        <Skeleton className="h-7 w-80 mb-2" />
        <Skeleton className="h-4 w-[480px]" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function AccountingModulesPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

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

  const jesQuery = useQuery({
    queryKey: ['journal-entries', sessionId],
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

  const modules = getAccountingModules((sessionQuery.data as { standard?: string } | undefined)?.standard);
  const jes = jesQuery.data ?? [];

  // Group JEs by module — match source and memo against module names/IDs
  const jesByModule = new Map<string, JournalEntry[]>();
  for (const je of jes) {
    if (!je) continue;
    for (const mod of modules) {
      if (matchesAccountingModule(mod.id, je.source, je.memo)) {
        const arr = jesByModule.get(mod.id) ?? [];
        arr.push(je);
        jesByModule.set(mod.id, arr);
        break;
      }
    }
  }

  // Summary stats
  const totalJEs = jes.length;

  return (
    <div className="ml-[260px] min-h-screen bg-[#F5F0E8]">
      {/* Breadcrumb */}
      <div className="h-12 bg-[#EDE6D6] border-b border-[#DDD5C2] flex items-center px-6">
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/close/${sessionId}/dashboard`} className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors">
            Dashboard
          </Link>
          <ChevronRight size={14} className="text-[#8B7A5E]" />
          <span className="text-[#2C2416] font-medium">Accounting Modules</span>
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
                const isActive = i === _activeGateIndex && !gate?.passing;
                let bg = '#DDD5C2'; // pending (muted)
                if (gate?.passing) bg = '#2D6A4F'; // forest green
                else if (isActive) bg = '#B8860B'; // gold active
                const sizeClass = isActive ? 'w-3 h-3' : 'w-2.5 h-2.5';
                return (
                  <div
                    key={gate?.id ?? i}
                    className={`${sizeClass} rounded-full transition-colors`}
                    style={{ backgroundColor: bg }}
                    title={`${gate?.label ?? 'Gate'}: ${gate?.passing ? 'Passing' : 'Pending'}`}
                  />
                );
              })}
            </div>
          </div>
        ) : null;
      })()}

      <main className="px-6 py-6 max-w-[1200px] mx-auto">
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
            {/* Title */}
            <div>
              <h1 className="text-2xl font-medium text-[#2C2416]">
                {((sessionQuery.data as { standard?: string } | undefined)?.standard ?? '').toUpperCase() === 'ASPE'
                  ? 'Canadian ASPE Close Workpapers'
                  : 'Accounting Modules'}
              </h1>
              <p className="text-sm text-[#8B7A5E] mt-1">
                Registered checks assemble workpapers and proposed entries from ledger data and approved policies.
                Deterministic math calculates amounts; reviewers approve conclusions and every journal entry.
              </p>
            </div>

            {/* Progress rail */}
            <div className="bg-[#2C2416] rounded-lg px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm">
                <Calculator size={16} className="text-[#B8860B]" />
                <span className="text-[#B8860B] font-medium">{modules.length} Workpapers</span>
                <span className="text-[#8B7A5E]">
                  {totalJEs} journal entr{totalJEs === 1 ? 'y' : 'ies'} recorded in this close
                </span>
              </div>
            </div>

            {/* Module cards grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {modules.map((mod) => {
                const status = getModuleStatus(mod.id, jesByModule);
                const jeCount = getModuleJeCount(mod.id, jesByModule);
                const Icon = mod.icon;

                return (
                  <Link
                    key={mod.id}
                    href={`/close/${sessionId}/modules/${mod.id}`}
                    className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5 hover:border-[#B8860B] transition-colors group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        {/* Numbered circle */}
                        <div className="w-9 h-9 rounded-full bg-[#2C2416] flex items-center justify-center text-[#B8860B] text-xs font-medium shrink-0">
                          {mod.number}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-[#2C2416] group-hover:text-[#B8860B] transition-colors">
                            {mod.name}
                          </div>
                          <span className="inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#2C2416] text-[#B8860B]">
                            {mod.guidance}
                          </span>
                        </div>
                      </div>
                      {/* Status badge */}
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded shrink-0"
                        style={{ color: status.color, backgroundColor: status.bg }}
                      >
                        {status.label}
                      </span>
                    </div>

                    <p className="text-xs text-[#8B7A5E] mb-3 leading-relaxed">
                      {mod.description}
                    </p>

                    <div className="text-xs text-[#8B7A5E] mb-3">
                      Method: <span className="text-[#2C2416]">{mod.method}</span>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[#DDD5C2]">
                      <div className="flex items-center gap-1">
                        <Icon size={14} className="text-[#8B7A5E]" />
                        <span className="text-xs text-[#8B7A5E]">
                          {jeCount} linked JE{jeCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className="text-xs text-[#3B6EA5]">Review workpaper →</span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Bottom constraint notice */}
            <div className="bg-[#F5E4DE] border border-[#C44B2B]/20 rounded-lg px-5 py-4 flex items-start gap-3">
              <ShieldAlert size={18} className="text-[#C44B2B] shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-[#C44B2B]">ARCHITECTURAL CONSTRAINT</div>
                <p className="text-xs text-[#C44B2B]/80 mt-1 leading-relaxed">
                  AI does not compute or post dollar amounts. All financial calculations use
                  deterministic Decimal.js arithmetic on the backend. AI may suggest account
                  mappings and draft variance explanations, but every proposed journal entry
                  requires explicit human approval before posting.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
