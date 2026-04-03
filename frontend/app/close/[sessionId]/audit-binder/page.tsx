'use client';

import React, { useState, useCallback } from 'react';
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
  Download,
  FileText,
  FileSpreadsheet,
  BookOpen,
  Package,
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

interface BinderSection {
  name: string;
  key: string;
  itemCount: number;
  completeness: 'complete' | 'incomplete';
  downloadUrl?: string;
}

interface AuditBinderResponse {
  sections: BinderSection[];
  totalItems: number;
  completeSections: number;
  totalSections: number;
  binderDownloadUrl?: string;
}

/* ------------------------------------------------------------------ */
/*  Default binder sections                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_SECTIONS: BinderSection[] = [
  { name: 'Trial Balance', key: 'trial_balance', itemCount: 0, completeness: 'incomplete' },
  { name: 'Journal Entries', key: 'journal_entries', itemCount: 0, completeness: 'incomplete' },
  { name: 'Reconciliations', key: 'reconciliations', itemCount: 0, completeness: 'incomplete' },
  { name: 'Financial Statements', key: 'financial_statements', itemCount: 0, completeness: 'incomplete' },
  { name: 'Variance Explanations', key: 'variance_explanations', itemCount: 0, completeness: 'incomplete' },
  { name: 'Evidence Files', key: 'evidence_files', itemCount: 0, completeness: 'incomplete' },
  { name: 'Audit Trail', key: 'audit_trail', itemCount: 0, completeness: 'incomplete' },
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
/*  Completeness Badge                                                 */
/* ------------------------------------------------------------------ */

function CompletenessBadge({ completeness }: { completeness: string }) {
  if (completeness === 'complete') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#E0EDE8] text-[#2D6A4F]">
        <CheckCircle2 size={10} />
        Complete
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#F0E8D0] text-[#8B6914]">
      <AlertCircle size={10} />
      Incomplete
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
        <div className="text-sm font-medium text-[#C44B2B]">Failed to load audit binder</div>
        <div className="text-xs text-[#C44B2B]/80 mt-0.5">{message}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section Icon                                                       */
/* ------------------------------------------------------------------ */

function sectionIcon(key: string) {
  switch (key) {
    case 'trial_balance': return <FileSpreadsheet size={16} className="text-[#8B7A5E]" />;
    case 'journal_entries': return <FileText size={16} className="text-[#8B7A5E]" />;
    case 'reconciliations': return <CheckCircle2 size={16} className="text-[#8B7A5E]" />;
    case 'financial_statements': return <BookOpen size={16} className="text-[#8B7A5E]" />;
    case 'variance_explanations': return <AlertCircle size={16} className="text-[#8B7A5E]" />;
    case 'evidence_files': return <Package size={16} className="text-[#8B7A5E]" />;
    case 'audit_trail': return <ScrollText size={16} className="text-[#8B7A5E]" />;
    default: return <FileText size={16} className="text-[#8B7A5E]" />;
  }
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

async function downloadBlob(url: string, filename: string, method: string = 'GET', body?: Record<string, unknown>) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const opts: RequestInit = {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}${url}`, opts);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export default function AuditBinderPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownload = useCallback(async (type: 'binder' | 'pdf' | 'csv') => {
    setDownloading(type);
    try {
      if (type === 'binder') {
        await downloadBlob(`/api/audit/binder?closeSessionId=${sessionId}`, `audit-binder-${sessionId}.zip`);
      } else if (type === 'pdf') {
        await downloadBlob(`/api/export/pdf`, `audit-binder-${sessionId}.pdf`, 'POST', { closeSessionId: sessionId });
      } else {
        await downloadBlob(`/api/export/csv`, `audit-binder-${sessionId}.csv`, 'POST', { closeSessionId: sessionId });
      }
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(null);
    }
  }, [sessionId]);

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

  /* --- Audit Binder --- */
  const binderQuery = useQuery({
    queryKey: ['audit-binder', sessionId],
    queryFn: async () => {
      try {
        // Try the primary endpoint first
        return await apiFetch<AuditBinderResponse>(
          `/api/close/sessions/${sessionId}/audit/binder`
        );
      } catch {
        try {
          // Fallback to alternate endpoint
          return await apiFetch<AuditBinderResponse>(`/api/audit/binder`);
        } catch {
          return null;
        }
      }
    },
    enabled: !!sessionId,
  });

  const binderData = binderQuery.data;
  const sections = binderData?.sections ?? DEFAULT_SECTIONS;
  const completeSections = binderData?.completeSections ?? sections.filter((s) => s.completeness === 'complete').length;
  const totalSections = binderData?.totalSections ?? sections.length;
  const totalItems = binderData?.totalItems ?? sections.reduce((sum, s) => sum + s.itemCount, 0);

  const isLoading = binderQuery.isLoading;
  const error = binderQuery.error;

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex">
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
            <span className="text-[#2C2416] font-medium">Audit Binder</span>
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
                  Audit Binder -- Complete Close Package
                </h1>
                <p className="text-sm text-[#8B7A5E] mt-1">
                  Consolidated view of all close artifacts for audit readiness and external review.
                </p>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
                  <div className="text-xs text-[#8B7A5E] font-medium mb-1">Sections</div>
                  <div className="text-2xl font-medium font-mono text-[#2C2416]">
                    {completeSections}/{totalSections}
                  </div>
                  <div className="text-xs text-[#8B7A5E] mt-1">sections complete</div>
                </div>
                <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
                  <div className="text-xs text-[#8B7A5E] font-medium mb-1">Total Items</div>
                  <div className="text-2xl font-medium font-mono text-[#2C2416]">{totalItems}</div>
                  <div className="text-xs text-[#8B7A5E] mt-1">across all sections</div>
                </div>
                <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
                  <div className="text-xs text-[#8B7A5E] font-medium mb-1">Completeness</div>
                  <div
                    className="text-2xl font-medium font-mono"
                    style={{
                      color:
                        completeSections === totalSections ? '#2D6A4F' : '#8B6914',
                    }}
                  >
                    {totalSections > 0 ? Math.round((completeSections / totalSections) * 100) : 0}%
                  </div>
                  <div className="text-xs text-[#8B7A5E] mt-1">binder readiness</div>
                </div>
              </div>

              {/* Binder Sections Table */}
              <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
                <div className="bg-[#2C2416] px-4 py-3 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-[#B8860B] uppercase tracking-wider">
                    Binder Sections
                  </h2>
                  <span className="text-xs text-[#8B7A5E]">{sections.length} sections</span>
                </div>

                <div className="divide-y divide-[#DDD5C2]">
                  {sections.map((section) => (
                    <div
                      key={section.key}
                      className="px-4 py-4 flex items-center justify-between hover:bg-[#E8E0D0] transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        {sectionIcon(section.key)}
                        <div>
                          <div className="text-sm font-medium text-[#2C2416]">{section.name}</div>
                          <div className="text-xs text-[#8B7A5E] mt-0.5">
                            {section.itemCount} item{section.itemCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <CompletenessBadge completeness={section.completeness} />
                        <button
                          className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded border border-[#DDD5C2] text-[#5C4F3A] bg-[#F5F0E8] hover:border-[#8B7A5E] transition-colors"
                          onClick={() => {
                            if (section.downloadUrl) {
                              window.open(section.downloadUrl, '_blank');
                            }
                          }}
                        >
                          <Download size={12} />
                          Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Export Buttons */}
              <div className="flex items-center gap-4 pt-2">
                <button
                  onClick={() => handleDownload('binder')}
                  disabled={downloading === 'binder'}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#B8860B] text-sm font-medium text-[#2C2416] hover:bg-[#A07608] transition-colors disabled:opacity-50"
                >
                  {downloading === 'binder' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  Download Complete Binder
                </button>
                <button
                  onClick={() => handleDownload('pdf')}
                  disabled={downloading === 'pdf'}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#EDE6D6] border border-[#DDD5C2] text-sm font-medium text-[#2C2416] hover:border-[#B8860B] transition-colors disabled:opacity-50"
                >
                  {downloading === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                  Export as PDF
                </button>
                <button
                  onClick={() => handleDownload('csv')}
                  disabled={downloading === 'csv'}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#EDE6D6] border border-[#DDD5C2] text-sm font-medium text-[#2C2416] hover:border-[#B8860B] transition-colors disabled:opacity-50"
                >
                  {downloading === 'csv' ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                  Export as CSV
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
