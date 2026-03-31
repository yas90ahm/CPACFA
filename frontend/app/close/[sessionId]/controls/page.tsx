'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  LayoutDashboard,
  FolderClosed,
  Briefcase,
  ScrollText,
  BarChart3,
  Activity,
  Settings,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Shield,
  ShieldCheck,
  ClipboardList,
  Eye,
  FileCheck,
  Radio,
  MessageSquare,
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

interface Control {
  id: string;
  controlId: string;
  description: string;
  assertionType: string;
  cosoComponent: string;
  status: 'tested' | 'pending' | 'failed';
  evidenceCount: number;
  lastTested?: string;
}

interface ControlEvidence {
  controlId: string;
  evidenceId: string;
  fileName: string;
  uploadedAt: string;
}

/* ------------------------------------------------------------------ */
/*  COSO Components                                                    */
/* ------------------------------------------------------------------ */

const COSO_COMPONENTS = [
  { key: 'control_environment', label: 'Control Environment', icon: Shield, description: 'Tone at the top, ethical values, and organizational structure' },
  { key: 'risk_assessment', label: 'Risk Assessment', icon: AlertCircle, description: 'Identification and analysis of relevant risks' },
  { key: 'control_activities', label: 'Control Activities', icon: ClipboardList, description: 'Policies and procedures to mitigate risks' },
  { key: 'information_communication', label: 'Information & Communication', icon: MessageSquare, description: 'Quality information flow across the organization' },
  { key: 'monitoring', label: 'Monitoring', icon: Radio, description: 'Ongoing evaluation of internal control effectiveness' },
];

/* ------------------------------------------------------------------ */
/*  Nav items config                                                   */
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
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors text-[#8B7A5E] hover:text-[#B8860B] hover:bg-[#3B1F0A]/50"
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
}: {
  gates: Gate[];
  gatesPassing: number;
  gatesTotal: number;
}) {
  const activeGateIndex = gates.findIndex((g) => !g.passing);
  const activeGateNum = activeGateIndex >= 0 ? activeGateIndex + 1 : gatesTotal;

  return (
    <div className="bg-[#2C2416] px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-[#B8860B] font-medium">
          Gate {activeGateNum} of {gatesTotal}
        </span>
        <span className="text-[#8B7A5E]">
          {gatesPassing} of {gatesTotal} passing
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
/*  Status Badge                                                       */
/* ------------------------------------------------------------------ */

function ControlStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    tested: { bg: 'bg-[#E0EDE8]', text: 'text-[#2D6A4F]', label: 'Tested' },
    pending: { bg: 'bg-[#F0E8D0]', text: 'text-[#8B6914]', label: 'Pending' },
    failed: { bg: 'bg-[#FDEAE6]', text: 'text-[#C44B2B]', label: 'Failed' },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${s.bg} ${s.text}`}>
      {status === 'tested' && <CheckCircle2 size={10} />}
      {status === 'pending' && <AlertCircle size={10} />}
      {status === 'failed' && <AlertCircle size={10} />}
      {s.label}
    </span>
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
      <Skeleton className="h-4 w-96" />
      <div className="grid grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
      <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg h-64" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Error Banner                                                       */
/* ------------------------------------------------------------------ */

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-[#F5E4DE] border border-[#C44B2B]/20 rounded-lg p-4 flex items-center gap-3">
      <AlertCircle size={18} className="text-[#C44B2B] shrink-0" />
      <div>
        <div className="text-sm font-medium text-[#C44B2B]">Failed to load controls data</div>
        <div className="text-xs text-[#C44B2B]/80 mt-0.5">{message}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function ControlsPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  /* --- Readiness gates --- */
  const readinessQuery = useQuery({
    queryKey: ['close-readiness', sessionId],
    queryFn: () =>
      apiFetch<ReadinessResponse>(`/api/close/sessions/${sessionId}/readiness`, {
        params: { format: 'gates' },
      }),
    enabled: !!sessionId,
  });

  const gates = readinessQuery.data?.gates ?? [];
  const gatesPassing = readinessQuery.data?.gatesPassing ?? gates.filter((g) => g.passing).length;
  const gatesTotal = readinessQuery.data?.gatesTotal ?? gates.length;

  /* --- Controls --- */
  const controlsQuery = useQuery({
    queryKey: ['controls', sessionId],
    queryFn: async () => {
      try {
        const data = await apiFetch<Control[] | { controls?: Control[] }>(
          `/api/close/controls`
        );
        return Array.isArray(data) ? data : data.controls ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!sessionId,
  });

  /* --- Control Evidence --- */
  const evidenceQuery = useQuery({
    queryKey: ['control-evidence', sessionId],
    queryFn: async () => {
      try {
        const data = await apiFetch<ControlEvidence[] | { evidence?: ControlEvidence[] }>(
          `/api/close/control-evidence`
        );
        return Array.isArray(data) ? data : data.evidence ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!sessionId,
  });

  const controls = controlsQuery.data ?? [];
  const evidence = evidenceQuery.data ?? [];
  const isLoading = controlsQuery.isLoading;
  const error = controlsQuery.error;

  // Compute COSO component stats
  const cosoStats = COSO_COMPONENTS.map((comp) => {
    const related = controls.filter(
      (c) => c.cosoComponent === comp.key || c.cosoComponent === comp.label
    );
    const assertionCount = related.length;
    const evidenceCount = related.reduce((sum, c) => sum + (c.evidenceCount ?? 0), 0);
    const passCount = related.filter((c) => c.status === 'tested').length;
    const failCount = related.filter((c) => c.status === 'failed').length;
    const status: 'pass' | 'fail' | 'pending' =
      failCount > 0 ? 'fail' : passCount === assertionCount && assertionCount > 0 ? 'pass' : 'pending';
    return { ...comp, assertionCount, evidenceCount, passCount, failCount, status };
  });

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex">
      <Sidebar sessionId={sessionId} />

      <div className="ml-[260px] flex-1 flex flex-col min-h-screen">
        {/* Progress Rail */}
        {gates.length > 0 && (
          <ProgressRail
            gates={gates}
            gatesPassing={gatesPassing}
            gatesTotal={gatesTotal}
          />
        )}

        {/* Top bar */}
        <div className="h-12 bg-[#EDE6D6] border-b border-[#DDD5C2] flex items-center px-6">
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/close/${sessionId}/dashboard`} className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors">
              Dashboard
            </Link>
            <ChevronRight size={14} className="text-[#8B7A5E]" />
            <span className="text-[#2C2416] font-medium">Controls</span>
          </div>
        </div>

        {/* Page body */}
        <main className="flex-1 px-6 py-6">
          {error && <ErrorBanner message={(error as Error).message} />}

          {isLoading ? (
            <PageSkeleton />
          ) : (
            <div className="space-y-6">
              {/* Page Title */}
              <div>
                <h1 className="text-2xl font-medium text-[#2C2416]">
                  Internal Controls -- COSO Framework
                </h1>
                <p className="text-sm text-[#8B7A5E] mt-1">
                  Evaluate internal control effectiveness across the five COSO components with evidence-based testing.
                </p>
              </div>

              {/* COSO Component Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {cosoStats.map((comp) => {
                  const Icon = comp.icon;
                  const statusColor =
                    comp.status === 'pass' ? '#2D6A4F' : comp.status === 'fail' ? '#C44B2B' : '#8B6914';
                  const statusBg =
                    comp.status === 'pass' ? '#E0EDE8' : comp.status === 'fail' ? '#FDEAE6' : '#F0E8D0';
                  const statusLabel =
                    comp.status === 'pass' ? 'All Passing' : comp.status === 'fail' ? 'Issues Found' : 'Pending';

                  return (
                    <div
                      key={comp.key}
                      className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Icon size={16} className="text-[#B8860B]" />
                        <span className="text-xs font-medium text-[#2C2416] leading-tight">
                          {comp.label}
                        </span>
                      </div>
                      <div className="text-xs text-[#8B7A5E] mb-3 line-clamp-2">
                        {comp.description}
                      </div>
                      <div className="space-y-1.5 text-xs text-[#5C4F3A]">
                        <div className="flex justify-between">
                          <span>Assertions</span>
                          <span className="font-mono">{comp.assertionCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Evidence</span>
                          <span className="font-mono">{comp.evidenceCount}</span>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-[#DDD5C2]">
                        <span
                          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded"
                          style={{ backgroundColor: statusBg, color: statusColor }}
                        >
                          {comp.status === 'pass' && <CheckCircle2 size={10} />}
                          {comp.status === 'fail' && <AlertCircle size={10} />}
                          {comp.status === 'pending' && <AlertCircle size={10} />}
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Control Testing Table */}
              <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
                <div className="bg-[#2C2416] px-4 py-3 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-[#B8860B] uppercase tracking-wider">
                    Control Testing
                  </h2>
                  <span className="text-xs text-[#8B7A5E]">{controls.length} controls</span>
                </div>

                {controls.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[#8B7A5E]">
                    No controls defined for this close session. Configure controls in Settings.
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-2.5 grid grid-cols-12 gap-3 text-xs font-medium text-[#8B7A5E] uppercase tracking-wider border-b border-[#DDD5C2] bg-[#E8E0D0]">
                      <div className="col-span-2">Control ID</div>
                      <div className="col-span-3">Description</div>
                      <div className="col-span-2">Assertion Type</div>
                      <div className="col-span-2 text-center">Evidence</div>
                      <div className="col-span-1">Status</div>
                      <div className="col-span-2">Last Tested</div>
                    </div>
                    <div className="divide-y divide-[#DDD5C2]">
                      {controls.map((ctrl) => (
                        <div
                          key={ctrl.id}
                          className="px-4 py-3 grid grid-cols-12 gap-3 items-center hover:bg-[#E8E0D0] transition-colors"
                        >
                          <div className="col-span-2 text-sm font-mono text-[#2C2416]">
                            {ctrl.controlId}
                          </div>
                          <div className="col-span-3 text-sm text-[#2C2416] truncate">
                            {ctrl.description}
                          </div>
                          <div className="col-span-2">
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#F5F0E8] text-[#5C4F3A] border border-[#DDD5C2]">
                              {ctrl.assertionType === 'existence' && <Eye size={10} />}
                              {ctrl.assertionType === 'completeness' && <FileCheck size={10} />}
                              {ctrl.assertionType === 'valuation' && <ShieldCheck size={10} />}
                              {ctrl.assertionType}
                            </span>
                          </div>
                          <div className="col-span-2 text-center">
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#EDE6D6] text-[#5C4F3A]">
                              {ctrl.evidenceCount} file{ctrl.evidenceCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="col-span-1">
                            <ControlStatusBadge status={ctrl.status} />
                          </div>
                          <div className="col-span-2 text-xs text-[#8B7A5E]">
                            {ctrl.lastTested
                              ? new Date(ctrl.lastTested).toLocaleDateString()
                              : '--'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
