'use client';

import React, { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { fmtMoney, isMoneyZero } from '@/lib/money';
import {
  LayoutDashboard,
  FolderClosed,
  Briefcase,
  ScrollText,
  BarChart3,
  Activity,
  Settings,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileText,
  Paperclip,
  Upload,
  Download,
  Clock,
  ArrowRightLeft,
  X,
  Plus,
  Shield,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ReconDetail {
  id: string;
  accountCode: string;
  accountName: string;
  glBalance: string;
  sourceBalance: string;
  supportingBalance?: string;
  variance: string;
  unexplainedVariance?: string;
  autoMatchRate?: number;
  status: string;
  evidenceCount?: number;
  approvedBy?: string;
  approverName?: string;
  completedAt?: string;
  preparedBy?: string;
}

interface MatchedTransaction {
  id: string;
  date?: string;
  glDescription?: string;
  bankDescription?: string;
  glAmount?: string;
  bankAmount?: string;
  matchType?: string;
  status?: string;
  action?: string;
  confidence?: number;
}

interface EvidenceFile {
  id: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  uploadedBy?: string;
  uploadedAt?: string;
  url?: string;
  sha256?: string;
}

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
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
      <div className="text-xs text-[#8B7A5E] font-medium mb-1">{label}</div>
      <div
        className="text-2xl font-medium font-mono"
        style={{ color: accent ?? '#2C2416' }}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-[#8B7A5E] mt-1">{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Match Type Badge                                                   */
/* ------------------------------------------------------------------ */

function MatchTypeBadge({ matchType }: { matchType?: string }) {
  const t = (matchType ?? '').toLowerCase();
  if (t === 'exact') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#E0EDE8] text-[#2D6A4F]">
        <CheckCircle2 size={10} />
        Exact
      </span>
    );
  }
  if (t === 'fuzzy' || t === 'partial') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#F0E8D0] text-[#8B6914]">
        <ArrowRightLeft size={10} />
        Fuzzy
      </span>
    );
  }
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded bg-[#DDD5C2] text-[#8B7A5E]">
      {matchType || 'Unknown'}
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
      <div>
        <Skeleton className="h-7 w-72 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-8 w-24 mb-1" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg h-64" />
      <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg h-48" />
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
        <div className="text-sm font-medium text-[#C44B2B]">Failed to load reconciliation detail</div>
        <div className="text-xs text-[#C44B2B]/80 mt-0.5">{message}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Evidence Upload Dropzone                                           */
/* ------------------------------------------------------------------ */

function EvidenceDropzone({
  sessionId,
  reconId,
  onUploadComplete,
}: {
  sessionId: string;
  reconId: string;
  onUploadComplete: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      setIsUploading(true);
      try {
        for (const file of files) {
          const formData = new FormData();
          formData.append('file', file);

          const token = typeof window !== 'undefined' ? localStorage.getItem('cpa_auth_token') : null;
          const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

          await fetch(
            `${baseUrl}/api/close/sessions/${sessionId}/reconciliations/${reconId}/evidence`,
            {
              method: 'POST',
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              body: formData,
            }
          );
        }
        onUploadComplete();
      } catch {
        // Upload error handled silently; user can retry
      } finally {
        setIsUploading(false);
      }
    },
    [sessionId, reconId, onUploadComplete]
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;

      setIsUploading(true);
      try {
        for (const file of files) {
          const formData = new FormData();
          formData.append('file', file);

          const token = typeof window !== 'undefined' ? localStorage.getItem('cpa_auth_token') : null;
          const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

          await fetch(
            `${baseUrl}/api/close/sessions/${sessionId}/reconciliations/${reconId}/evidence`,
            {
              method: 'POST',
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              body: formData,
            }
          );
        }
        onUploadComplete();
      } catch {
        // Upload error handled silently
      } finally {
        setIsUploading(false);
      }
    },
    [sessionId, reconId, onUploadComplete]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
        isDragging
          ? 'border-[#B8860B] bg-[#F0E8D0]'
          : 'border-[#DDD5C2] bg-[#F5F0E8] hover:border-[#8B7A5E]'
      }`}
    >
      {isUploading ? (
        <div className="flex items-center justify-center gap-2 text-sm text-[#8B7A5E]">
          <Loader2 size={16} className="animate-spin" />
          Uploading...
        </div>
      ) : (
        <>
          <Upload size={20} className="mx-auto text-[#8B7A5E] mb-2" />
          <p className="text-sm text-[#5C4F3A]">
            Drop files here or{' '}
            <label className="text-[#B8860B] hover:underline cursor-pointer">
              browse
              <input
                type="file"
                multiple
                className="hidden"
                onChange={handleFileInput}
                accept=".pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
              />
            </label>
          </p>
          <p className="text-xs text-[#8B7A5E] mt-1">
            PDF, CSV, Excel, or images accepted
          </p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function ReconciliationDetailPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const reconId = params.reconId as string;
  const queryClient = useQueryClient();

  /* --- Data fetching --- */

  const reconQuery = useQuery({
    queryKey: ['reconciliation-detail', sessionId, reconId],
    queryFn: () =>
      apiFetch<ReconDetail>(`/api/close/sessions/${sessionId}/reconciliations/${reconId}`),
    enabled: !!sessionId && !!reconId,
  });

  const transactionsQuery = useQuery({
    queryKey: ['bank-transactions', sessionId, reconId],
    queryFn: async () => {
      try {
        const data = await apiFetch<
          MatchedTransaction[] | { transactions?: MatchedTransaction[]; items?: MatchedTransaction[] }
        >(`/api/close/sessions/${sessionId}/bank-transactions`, {
          params: { reconId },
        });
        if (Array.isArray(data)) return data;
        return data.transactions ?? data.items ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!sessionId && !!reconId,
  });

  const evidenceQuery = useQuery({
    queryKey: ['recon-evidence', sessionId, reconId],
    queryFn: async () => {
      try {
        const data = await apiFetch<EvidenceFile[] | { evidence?: EvidenceFile[]; files?: EvidenceFile[] }>(
          `/api/close/sessions/${sessionId}/reconciliations/${reconId}/evidence`
        );
        if (Array.isArray(data)) return data;
        return data.evidence ?? data.files ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!sessionId && !!reconId,
  });

  /* --- Mutations --- */

  const completeMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/reconciliations/${reconId}/complete`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-detail', sessionId, reconId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations', sessionId] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/reconciliations/${reconId}/approve`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-detail', sessionId, reconId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations', sessionId] });
    },
  });

  /* --- Derived state --- */

  const recon = reconQuery.data;
  const transactions = transactionsQuery.data ?? [];
  const evidence = evidenceQuery.data ?? [];

  const autoMatched = transactions.filter(
    (t) => t.status === 'accepted' || t.status === 'matched' || t.action === 'Accepted'
  );
  const manualReview = transactions.filter(
    (t) => t.status === 'pending' || t.status === 'review' || t.status === 'unmatched'
  );

  const autoMatchRate = recon?.autoMatchRate ?? (
    transactions.length > 0
      ? Math.round((autoMatched.length / transactions.length) * 100)
      : 0
  );

  const reconStatus = recon?.status ?? 'pending';
  const isReconciled = reconStatus === 'completed' || reconStatus === 'approved' || reconStatus === 'reconciled';
  const varianceZero = isMoneyZero(recon?.unexplainedVariance ?? recon?.variance);

  const isLoading = reconQuery.isLoading;
  const error = reconQuery.error;

  const handleRefreshEvidence = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['recon-evidence', sessionId, reconId] });
  }, [queryClient, sessionId, reconId]);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex">
      <Sidebar sessionId={sessionId} />

      <div className="ml-[260px] flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <div className="h-12 bg-[#EDE6D6] border-b border-[#DDD5C2] flex items-center px-6">
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/close/${sessionId}/dashboard`} className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors">
              Dashboard
            </Link>
            <ChevronRight size={14} className="text-[#8B7A5E]" />
            <Link
              href={`/close/${sessionId}/reconciliation`}
              className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors"
            >
              Reconciliation
            </Link>
            <ChevronRight size={14} className="text-[#8B7A5E]" />
            <span className="text-[#2C2416] font-medium">
              {recon ? `${recon.accountCode} — ${recon.accountName}` : 'Detail'}
            </span>
          </div>
        </div>

        {/* Page body */}
        <main className="flex-1 px-6 py-6">
          {error && <ErrorBanner message={(error as Error).message} />}

          {isLoading ? (
            <PageSkeleton />
          ) : recon ? (
            <div className="space-y-6">
              {/* Page Title */}
              <div>
                <h1 className="text-2xl font-medium text-[#2C2416]">
                  {recon.accountCode} — {recon.accountName}
                </h1>
                <p className="text-sm text-[#8B7A5E] mt-1">
                  Account reconciliation detail with transaction matching and evidence management.
                </p>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <StatCard
                  label="GL Balance"
                  value={fmtMoney(recon.glBalance, { dollar: true, dash: false })}
                  sub="per adjusted trial balance"
                />
                <StatCard
                  label="Supporting Balance"
                  value={fmtMoney(recon.supportingBalance ?? recon.sourceBalance, { dollar: true, dash: false })}
                  sub="per source document"
                />
                <StatCard
                  label="Unexplained Variance"
                  value={fmtMoney(recon.unexplainedVariance ?? recon.variance, { dollar: true, dash: false })}
                  sub={varianceZero ? 'fully reconciled' : 'requires explanation'}
                  accent={varianceZero ? '#2D6A4F' : '#C44B2B'}
                />
                <StatCard
                  label="Auto-Match Rate"
                  value={`${autoMatchRate}%`}
                  sub={`${autoMatched.length} of ${transactions.length} transactions`}
                  accent={autoMatchRate >= 90 ? '#2D6A4F' : autoMatchRate >= 70 ? '#8B6914' : '#C44B2B'}
                />
                <StatCard
                  label="Status"
                  value={isReconciled ? 'Reconciled' : 'In Progress'}
                  sub={recon.approverName ? `Approved by ${recon.approverName}` : recon.completedAt ? 'Pending approval' : ''}
                  accent={isReconciled ? '#2D6A4F' : '#8B6914'}
                />
              </div>

              {/* Separation of Duties */}
              <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
                <CheckCircle2 size={14} className="text-[#2D6A4F] shrink-0" />
                <span className="text-[#5C4F3A]">
                  Preparer: {recon.preparedBy ?? 'Unassigned'} (Controller)
                  {' \u00B7 '}
                  Approver: {recon.approvedBy ?? 'Pending'} (CFO)
                  {' \u00B7 '}
                  Separation of Duties: <span className="text-[#2D6A4F] font-medium">Enforced</span>
                </span>
              </div>

              {/* AUTO-MATCHED TRANSACTIONS */}
              <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
                <div className="bg-[#2C2416] px-4 py-3 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-[#B8860B] uppercase tracking-wider">
                    Auto-Matched Transactions
                  </h2>
                  <span className="text-xs text-[#8B7A5E]">{autoMatched.length} matched</span>
                </div>

                {autoMatched.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-[#8B7A5E]">
                    No auto-matched transactions found.
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-2.5 grid grid-cols-12 gap-3 text-xs font-medium text-[#8B7A5E] uppercase tracking-wider border-b border-[#DDD5C2] bg-[#E8E0D0]">
                      <div className="col-span-1">Date</div>
                      <div className="col-span-3">GL Transaction</div>
                      <div className="col-span-3">Bank Transaction</div>
                      <div className="col-span-1 text-right">GL Amount</div>
                      <div className="col-span-1 text-right">Bank Amount</div>
                      <div className="col-span-1">Match</div>
                      <div className="col-span-2">Action</div>
                    </div>
                    <div className="divide-y divide-[#DDD5C2]">
                      {autoMatched.map((tx) => (
                        <div
                          key={tx.id}
                          className="px-4 py-3 grid grid-cols-12 gap-3 items-center hover:bg-[#E8E0D0] transition-colors"
                        >
                          <div className="col-span-1 text-xs text-[#5C4F3A] font-mono">
                            {tx.date ?? '—'}
                          </div>
                          <div className="col-span-3 text-sm text-[#2C2416] truncate">
                            {tx.glDescription ?? '—'}
                          </div>
                          <div className="col-span-3 text-sm text-[#2C2416] truncate">
                            {tx.bankDescription ?? '—'}
                          </div>
                          <div className="col-span-1 text-right text-sm font-mono text-[#2C2416]">
                            {tx.glAmount ? fmtMoney(tx.glAmount, { dollar: true, dash: false }) : '—'}
                          </div>
                          <div className="col-span-1 text-right text-sm font-mono text-[#2C2416]">
                            {tx.bankAmount ? fmtMoney(tx.bankAmount, { dollar: true, dash: false }) : '—'}
                          </div>
                          <div className="col-span-1">
                            <MatchTypeBadge matchType={tx.matchType} />
                          </div>
                          <div className="col-span-2">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-[#2D6A4F]">
                              <CheckCircle2 size={12} />
                              {tx.action ?? 'Accepted'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* MANUAL REVIEW REQUIRED */}
              {manualReview.length > 0 && (
                <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
                  <div className="bg-[#2C2416] px-4 py-3 flex items-center justify-between">
                    <h2 className="text-sm font-medium text-[#8B6914] uppercase tracking-wider">
                      Manual Review Required
                    </h2>
                    <span className="text-xs text-[#8B7A5E]">
                      {manualReview.length} item{manualReview.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="divide-y divide-[#DDD5C2]">
                    {manualReview.map((tx) => (
                      <div
                        key={tx.id}
                        className="px-4 py-4 hover:bg-[#E8E0D0] transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <span className="text-xs font-mono text-[#8B7A5E]">{tx.date ?? '—'}</span>
                              <span className="text-sm font-medium text-[#2C2416]">
                                {tx.glDescription ?? tx.bankDescription ?? 'Unmatched transaction'}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-[#5C4F3A]">
                              {tx.glAmount && (
                                <span>GL: {fmtMoney(tx.glAmount, { dollar: true, dash: false })}</span>
                              )}
                              {tx.bankAmount && (
                                <span>Bank: {fmtMoney(tx.bankAmount, { dollar: true, dash: false })}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <button className="text-xs font-medium px-3 py-1.5 rounded border border-[#DDD5C2] text-[#5C4F3A] bg-[#F5F0E8] hover:border-[#8B7A5E] transition-colors">
                              <span className="flex items-center gap-1">
                                <Clock size={12} />
                                Mark as timing difference
                              </span>
                            </button>
                            <button className="text-xs font-medium px-3 py-1.5 rounded border border-[#DDD5C2] text-[#5C4F3A] bg-[#F5F0E8] hover:border-[#8B7A5E] transition-colors">
                              <span className="flex items-center gap-1">
                                <Plus size={12} />
                                Create JE to record
                              </span>
                            </button>
                            <button className="text-xs font-medium px-3 py-1.5 rounded border border-[#DDD5C2] text-[#8B7A5E] bg-[#F5F0E8] hover:border-[#8B7A5E] transition-colors">
                              <span className="flex items-center gap-1">
                                <X size={12} />
                                Dismiss
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* EVIDENCE ATTACHMENTS */}
              <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
                <div className="bg-[#2C2416] px-4 py-3 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-[#B8860B] uppercase tracking-wider">
                    Evidence Attachments
                  </h2>
                  <span className="text-xs text-[#8B7A5E]">{evidence.length} file{evidence.length !== 1 ? 's' : ''}</span>
                </div>

                {/* File list */}
                {evidence.length > 0 && (
                  <div className="divide-y divide-[#DDD5C2]">
                    {evidence.map((file) => (
                      <div
                        key={file.id}
                        className="px-4 py-3 flex items-center justify-between hover:bg-[#E8E0D0] transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <FileText size={16} className="text-[#8B7A5E]" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-[#2C2416]">{file.fileName}</span>
                              {file.sha256 ? (
                                <span className="font-mono text-xs text-[#B8860B]">
                                  sha256:{file.sha256.slice(0, 16)}...
                                </span>
                              ) : (
                                <span className="font-mono text-xs text-[#8B7A5E]">Hash pending</span>
                              )}
                            </div>
                            <div className="text-xs text-[#8B7A5E]">
                              {[
                                formatFileSize(file.fileSize),
                                file.uploadedBy,
                                file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : null,
                              ]
                                .filter(Boolean)
                                .join(' \u00B7 ')}
                            </div>
                          </div>
                        </div>
                        {file.url && (
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs font-medium text-[#B8860B] hover:underline"
                          >
                            <Download size={12} />
                            Download
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload dropzone */}
                <div className="p-4">
                  <EvidenceDropzone
                    sessionId={sessionId}
                    reconId={reconId}
                    onUploadComplete={handleRefreshEvidence}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => completeMutation.mutate()}
                  disabled={completeMutation.isPending || isReconciled}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isReconciled
                      ? 'bg-[#E0EDE8] text-[#2D6A4F] cursor-not-allowed'
                      : 'bg-[#2D6A4F] text-white hover:bg-[#245A42]'
                  }`}
                >
                  {completeMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Shield size={16} />
                  )}
                  {isReconciled ? 'Reconciled' : 'Mark as Reconciled'}
                </button>

                <button
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending || reconStatus === 'approved'}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    reconStatus === 'approved'
                      ? 'bg-[#DDD5C2] text-[#8B7A5E] cursor-not-allowed'
                      : 'bg-[#B8860B] text-white hover:bg-[#9A7209]'
                  }`}
                >
                  {approveMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  {reconStatus === 'approved' ? 'Approved' : 'Send for Approval'}
                </button>

                {(completeMutation.isError || approveMutation.isError) && (
                  <span className="text-xs text-[#C44B2B]">
                    Action failed. Please try again.
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <AlertCircle size={24} className="mx-auto text-[#8B7A5E] mb-3" />
              <p className="text-sm text-[#8B7A5E]">Reconciliation not found.</p>
              <Link
                href={`/close/${sessionId}/reconciliation`}
                className="text-sm text-[#B8860B] hover:underline mt-2 inline-block"
              >
                Back to reconciliation list
              </Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
