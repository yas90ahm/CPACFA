'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useCloseSession } from '@/lib/hooks/useCloseSession';
import { fmtMoney, sumMoneyStrings } from '@/lib/money';
import { CloseSidebar } from '@/components/close-sidebar';
import { WorkflowBreadcrumb } from '@/components/workflow-breadcrumb';
import PageAIInsight from '@/components/close/PageAIInsight';
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Search,
  ArrowUpDown,
  Upload,
  FileSpreadsheet,
  X,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TBRow {
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  /** API may return debitBalance/creditBalance instead of debit/credit */
  debitBalance?: string;
  creditBalance?: string;
  netBalance?: string;
  accountType?: string;
  reportingCategory?: string;
  fsLineItem?: string;
  mappingReportingLineName?: string;
  mappingStatus?: string;
}

interface TBResponse {
  rows: TBRow[];
  totalDebits?: string;
  totalCredits?: string;
}

/* ------------------------------------------------------------------ */
/*  Nav config                                                         */
/* ------------------------------------------------------------------ */

/* Sidebar imported from @/components/close-sidebar */

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

const TYPE_COLORS: Record<AccountType, string> = {
  Asset: '#2D6A4F',
  Liability: '#8B6914',
  Equity: '#3B6EA5',
  Revenue: '#B8860B',
  Expense: '#C44B2B',
};

function deriveAccountType(row: TBRow): AccountType {
  const cat = (row.reportingCategory ?? '').toLowerCase();
  if (cat.includes('asset')) return 'Asset';
  if (cat.includes('liabilit')) return 'Liability';
  if (cat.includes('equity') || cat.includes('capital') || cat.includes('retained')) return 'Equity';
  if (cat.includes('revenue') || cat.includes('income') || cat.includes('sale')) return 'Revenue';
  if (cat.includes('expense') || cat.includes('cost') || cat.includes('depreci')) return 'Expense';

  // Fallback: derive from account code range
  const code = parseInt(row.accountCode, 10);
  if (code >= 1000 && code < 2000) return 'Asset';
  if (code >= 2000 && code < 3000) return 'Liability';
  if (code >= 3000 && code < 4000) return 'Equity';
  if (code >= 4000 && code < 5000) return 'Revenue';
  return 'Expense';
}

function computeNetBalance(debit: string, credit: string): string {
  const d = parseFloat(debit || '0') || 0;
  const c = parseFloat(credit || '0') || 0;
  return (d - c).toFixed(2);
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#DDD5C2] rounded ${className}`} />;
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function TrialBalancePage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const [tbType, setTbType] = useState<'adjusted' | 'unadjusted'>('adjusted');
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<'code' | 'name' | 'debit' | 'credit' | 'net' | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const {
    sessionQuery,
    gates,
    gatesTotal,
    activeGateNum,
    dayElapsed,
    targetDays,
    sessionState,
    periodLabel,
  } = useCloseSession(sessionId);
  const activeGateIndex = gates.findIndex((g) => !g.passing);

  const { data, isLoading, error } = useQuery<TBResponse>({
    queryKey: ['trial-balance', sessionId, tbType],
    queryFn: () =>
      apiFetch<TBResponse>(`/api/close/sessions/${sessionId}/trial-balance`, {
        params: { type: tbType },
      }),
    enabled: !!sessionId,
  });

  // Normalize: API may return debitBalance/creditBalance or debit/credit
  const rows = useMemo(() => (data?.rows ?? []).map((r) => ({
    ...r,
    debit: r.debit ?? r.debitBalance ?? '0',
    credit: r.credit ?? r.creditBalance ?? '0',
    reportingCategory: r.reportingCategory ?? r.accountType ?? '',
    fsLineItem: r.fsLineItem ?? r.mappingReportingLineName ?? '',
  })), [data]);

  const handleGLUpload = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError('');
    setUploadSuccess('');
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
      const token = typeof window !== 'undefined' ? localStorage.getItem('cpa_auth_token') : null;
      const formData = new FormData();
      formData.append('file', file);
      const period = sessionQuery.data?.periodEnd?.slice(0, 7) ?? '';
      const res = await fetch(
        `${baseUrl}/api/gl/ingest?period=${encodeURIComponent(period)}&sessionId=${encodeURIComponent(sessionId)}`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
          body: formData,
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error ?? err.message ?? `Upload failed (${res.status})`);
      }
      const result = await res.json();
      const count = result.entriesInserted ?? result.accountCount ?? result.rowCount ?? 0;
      setUploadSuccess(`GL imported successfully — ${count} entries loaded. Refreshing trial balance...`);
      queryClient.invalidateQueries({ queryKey: ['trial-balance', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['close-readiness', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['close-session', sessionId] });
      setTimeout(() => { setShowUpload(false); setUploadSuccess(''); }, 2000);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [sessionId, sessionQuery.data, queryClient]);

  // Computed totals — prefer backend-computed values when available.
  // Fallback: display-only sum using sumMoneyStrings, not used for financial decisions.
  const totals = useMemo(() => {
    const totalDebits = data?.totalDebits ?? sumMoneyStrings(rows.map((r) => r.debit));
    const totalCredits = data?.totalCredits ?? sumMoneyStrings(rows.map((r) => r.credit));
    const imbalance = (parseFloat(totalDebits) - parseFloat(totalCredits)).toFixed(2);
    const accountCount = rows.length;
    // Count non-zero JE adjustments (rows where both debit and credit are non-zero in adjusted mode)
    const adjustmentCount = tbType === 'adjusted' ? rows.filter((r) => {
      const d = parseFloat(r.debit || '0') || 0;
      const c = parseFloat(r.credit || '0') || 0;
      return d > 0 && c > 0;
    }).length : 0;
    return { totalDebits, totalCredits, imbalance, accountCount, adjustmentCount };
  }, [data, rows, tbType]);

  const isBalanced = Math.abs(parseFloat(totals.imbalance)) < 0.01;

  // Filter and sort
  const filteredRows = useMemo(() => {
    let result = rows;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          (r.accountCode ?? '').toLowerCase().includes(q) ||
          (r.accountName ?? '').toLowerCase().includes(q) ||
          (r.fsLineItem ?? '').toLowerCase().includes(q)
      );
    }

    if (sortCol) {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        switch (sortCol) {
          case 'code':
            cmp = a.accountCode.localeCompare(b.accountCode);
            break;
          case 'name':
            cmp = a.accountName.localeCompare(b.accountName);
            break;
          case 'debit':
            cmp = (parseFloat(a.debit || '0') || 0) - (parseFloat(b.debit || '0') || 0);
            break;
          case 'credit':
            cmp = (parseFloat(a.credit || '0') || 0) - (parseFloat(b.credit || '0') || 0);
            break;
          case 'net':
            cmp =
              (parseFloat(a.debit || '0') - parseFloat(a.credit || '0')) -
              (parseFloat(b.debit || '0') - parseFloat(b.credit || '0'));
            break;
        }
        return sortAsc ? cmp : -cmp;
      });
    }

    return result;
  }, [rows, search, sortCol, sortAsc]);

  function handleSort(col: typeof sortCol) {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex">
      {/* Sidebar rendered by layout.tsx */}

      <div className="ml-[260px] flex-1 flex flex-col min-h-screen">
        {/* Workflow Breadcrumb */}
        <WorkflowBreadcrumb sessionId={sessionId} gates={gates} />

        {/* Progress Rail */}
        {gates.length > 0 && (
          <div className="bg-[#2C2416] px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-[#B8860B] font-medium">
                Gate {activeGateNum} of {gatesTotal}
              </span>
              <span className="text-[#8B7A5E]">
                Close Day {dayElapsed} of {targetDays}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#3B1F0A] text-[#B8860B]">
                {sessionState}
              </span>
              {periodLabel && <span className="text-[#8B7A5E]">{periodLabel}</span>}
            </div>
            <div className="flex items-center gap-1.5">
              {gates.map((gate, i) => {
                const isActive = i === activeGateIndex && !gate.passing;
                let bg = '#DDD5C2'; // pending (muted light)
                if (gate.passing) bg = '#2D6A4F'; // forest green
                else if (isActive) bg = '#B8860B'; // gold active
                const sizeClass = isActive ? 'w-3 h-3' : 'w-2.5 h-2.5';
                return (
                  <div
                    key={gate.id}
                    className={`${sizeClass} rounded-full transition-colors`}
                    style={{ backgroundColor: bg }}
                    title={`${gate.label}: ${gate.passing ? 'Passing' : 'Pending'}`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Page header */}
        <main className="flex-1 px-6 py-6">
          {/* Title row */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-medium text-[#2C2416]">
              Trial Balance{periodLabel ? ` — ${periodLabel}` : ''}
            </h1>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowUpload(true); setUploadError(''); setUploadSuccess(''); }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[#F5F0E8] transition-colors hover:opacity-90"
                style={{ backgroundColor: '#B8860B' }}
              >
                <Upload size={16} />
                Upload GL
              </button>
            </div>
          </div>
          {/* AI Insight */}
          {rows.length > 0 && (() => {
            const unmapped = rows.filter((r) => r.mappingStatus === 'unmapped').length;
            if (unmapped > 0) {
              return (
                <div className="mb-4">
                  <PageAIInsight
                    message={`TB balanced. ${unmapped} account${unmapped !== 1 ? 's' : ''} still need mapping.`}
                    linkLabel="Go to Mapping"
                    linkHref={`/close/${sessionId}/mapping`}
                  />
                </div>
              );
            }
            return (
              <div className="mb-4">
                <PageAIInsight
                  message={`All ${rows.length} accounts mapped. TB is ${isBalanced ? 'balanced' : 'imbalanced'}.`}
                  accentColor={isBalanced ? '#2D6A4F' : '#C44B2B'}
                />
              </div>
            );
          })()}
          <div className="flex items-center gap-2 mb-6">
              <button
                onClick={() => setTbType('adjusted')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tbType === 'adjusted'
                    ? 'bg-[#B8860B] text-[#2C2416]'
                    : 'bg-[#EDE6D6] border border-[#DDD5C2] text-[#8B7A5E] hover:text-[#2C2416] hover:border-[#B8860B]'
                }`}
              >
                Adjusted
              </button>
              <button
                onClick={() => setTbType('unadjusted')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tbType === 'unadjusted'
                    ? 'bg-[#B8860B] text-[#2C2416]'
                    : 'bg-[#EDE6D6] border border-[#DDD5C2] text-[#8B7A5E] hover:text-[#2C2416] hover:border-[#B8860B]'
                }`}
              >
                Unadjusted
              </button>
            </div>

          {/* Stat cards in dark header */}
          <div className="bg-[#2C2416] rounded-lg p-5 mb-6">
            <div className="grid grid-cols-5 gap-4">
              <div>
                <div className="text-xs text-[#8B7A5E] mb-1">Total Debits</div>
                <div className="text-xl font-mono text-[#F5F0E8] font-medium">
                  {isLoading ? '...' : fmtMoney(totals.totalDebits, { dollar: true, dash: false })}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#8B7A5E] mb-1">Total Credits</div>
                <div className="text-xl font-mono text-[#F5F0E8] font-medium">
                  {isLoading ? '...' : fmtMoney(totals.totalCredits, { dollar: true, dash: false })}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#8B7A5E] mb-1">Imbalance</div>
                <div className={`text-xl font-mono font-medium ${isBalanced ? 'text-[#2D6A4F]' : 'text-[#C44B2B]'}`}>
                  {isLoading ? '...' : fmtMoney(totals.imbalance, { dollar: true, dash: false })}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#8B7A5E] mb-1">Accounts</div>
                <div className="text-xl font-mono text-[#F5F0E8] font-medium">
                  {isLoading ? '...' : totals.accountCount}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#8B7A5E] mb-1">Adjustments</div>
                <div className="text-xl font-mono text-[#F5F0E8] font-medium">
                  {isLoading ? '...' : `${totals.adjustmentCount} JEs`}
                </div>
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="mb-4">
            <div className="relative max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B7A5E]" />
              <input
                type="text"
                placeholder="Search accounts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-[#EDE6D6] border border-[#DDD5C2] text-sm text-[#2C2416] placeholder-[#8B7A5E] focus:outline-none focus:border-[#B8860B] transition-colors"
              />
            </div>
          </div>

          {/* Error state */}
          {error && (
            <div className="bg-[#F5E4DE] border border-[#C44B2B]/20 rounded-lg p-4 flex items-center gap-3 mb-4">
              <AlertCircle size={18} className="text-[#C44B2B] shrink-0" />
              <div>
                <div className="text-sm font-medium text-[#C44B2B]">Failed to load trial balance</div>
                <div className="text-xs text-[#C44B2B]/80 mt-0.5">{(error as Error).message}</div>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden mb-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-[#B8860B]" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#2C2416]">
                      <th
                        className="text-left px-4 py-3 font-medium text-[#B8860B] cursor-pointer select-none"
                        onClick={() => handleSort('code')}
                      >
                        <span className="flex items-center gap-1">
                          Account Code
                          <ArrowUpDown size={12} className="text-[#8B7A5E]" />
                        </span>
                      </th>
                      <th
                        className="text-left px-4 py-3 font-medium text-[#B8860B] cursor-pointer select-none"
                        onClick={() => handleSort('name')}
                      >
                        <span className="flex items-center gap-1">
                          Name
                          <ArrowUpDown size={12} className="text-[#8B7A5E]" />
                        </span>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-[#B8860B]">Type</th>
                      <th
                        className="text-right px-4 py-3 font-medium text-[#B8860B] cursor-pointer select-none"
                        onClick={() => handleSort('debit')}
                      >
                        <span className="flex items-center justify-end gap-1">
                          Debit
                          <ArrowUpDown size={12} className="text-[#8B7A5E]" />
                        </span>
                      </th>
                      <th
                        className="text-right px-4 py-3 font-medium text-[#B8860B] cursor-pointer select-none"
                        onClick={() => handleSort('credit')}
                      >
                        <span className="flex items-center justify-end gap-1">
                          Credit
                          <ArrowUpDown size={12} className="text-[#8B7A5E]" />
                        </span>
                      </th>
                      <th
                        className="text-right px-4 py-3 font-medium text-[#B8860B] cursor-pointer select-none"
                        onClick={() => handleSort('net')}
                      >
                        <span className="flex items-center justify-end gap-1">
                          Net Balance
                          <ArrowUpDown size={12} className="text-[#8B7A5E]" />
                        </span>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-[#B8860B]">FS Line</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-[#8B7A5E]">
                          {search ? 'No accounts match your search.' : (
                            <div className="flex flex-col items-center gap-3 py-4">
                              <FileSpreadsheet size={32} className="text-[#8B7A5E]" />
                              <p className="text-sm text-[#8B7A5E]">No trial balance data yet.</p>
                              <button
                                onClick={() => { setShowUpload(true); setUploadError(''); setUploadSuccess(''); }}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[#F5F0E8] transition-colors"
                                style={{ backgroundColor: '#B8860B' }}
                              >
                                <Upload size={14} />
                                Upload your General Ledger
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row, i) => {
                        const accountType = deriveAccountType(row);
                        const net = computeNetBalance(row.debit, row.credit);
                        return (
                          <tr
                            key={`${row.accountCode}-${i}`}
                            className="border-t border-[#DDD5C2] hover:bg-[#F5F0E8] transition-colors"
                          >
                            <td className="px-4 py-2.5 font-mono text-[#2C2416]">
                              {row.accountCode}
                            </td>
                            <td className="px-4 py-2.5 text-[#2C2416]">
                              {row.accountName}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className="inline-block text-xs font-medium px-2 py-0.5 rounded"
                                style={{
                                  color: TYPE_COLORS[accountType],
                                  backgroundColor: `${TYPE_COLORS[accountType]}18`,
                                }}
                              >
                                {accountType}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-[#2C2416]">
                              {fmtMoney(row.debit)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-[#2C2416]">
                              {fmtMoney(row.credit)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-[#2C2416]">
                              {fmtMoney(net)}
                            </td>
                            <td className="px-4 py-2.5">
                              {row.fsLineItem ? (
                                <span className="text-[#B8860B] text-sm cursor-pointer hover:underline">
                                  {row.fsLineItem}
                                </span>
                              ) : (
                                <Link
                                  href={`/close/${sessionId}/mapping`}
                                  className="text-[#C44B2B] text-sm font-medium hover:underline"
                                >
                                  Unmapped
                                </Link>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Bottom balanced bar */}
          {!isLoading && rows.length > 0 && (
            <div
              className={`rounded-lg px-5 py-3 flex items-center gap-3 text-sm font-medium ${
                isBalanced
                  ? 'bg-[#E0EDE8] border border-[#2D6A4F] text-[#2D6A4F]'
                  : 'bg-[#F5E4DE] border border-[#C44B2B] text-[#C44B2B]'
              }`}
            >
              {isBalanced ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {isBalanced ? (
                <span>
                  BALANCED — Total Debits {fmtMoney(totals.totalDebits, { dollar: true, dash: false })} = Total Credits{' '}
                  {fmtMoney(totals.totalCredits, { dollar: true, dash: false })} · Imbalance:{' '}
                  {fmtMoney(totals.imbalance, { dollar: true, dash: false })} · {totals.accountCount} accounts verified
                </span>
              ) : (
                <span>
                  IMBALANCED — Total Debits {fmtMoney(totals.totalDebits, { dollar: true, dash: false })} != Total Credits{' '}
                  {fmtMoney(totals.totalCredits, { dollar: true, dash: false })} · Imbalance:{' '}
                  {fmtMoney(totals.imbalance, { dollar: true, dash: false })}
                </span>
              )}
            </div>
          )}
        </main>
      </div>

      {/* GL Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-6 w-full max-w-lg mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-[#2C2416]">Upload General Ledger</h3>
              <button onClick={() => setShowUpload(false)} className="text-[#8B7A5E] hover:text-[#2C2416]">
                <X size={20} />
              </button>
            </div>

            {uploadError && (
              <div className="mb-4 px-3 py-2 rounded bg-[#F5E4DE] border border-[#C44B2B] text-[#C44B2B] text-sm">
                {uploadError}
              </div>
            )}
            {uploadSuccess && (
              <div className="mb-4 px-3 py-2 rounded bg-[#E0EDE8] border border-[#2D6A4F] text-[#2D6A4F] text-sm flex items-center gap-2">
                <CheckCircle2 size={16} />
                {uploadSuccess}
              </div>
            )}

            {/* Dropzone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) handleGLUpload(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-[#2D6A4F] bg-[#E0EDE8]/50'
                  : 'border-[#DDD5C2] hover:border-[#B8860B] hover:bg-[#F5F0E8]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleGLUpload(file);
                  e.target.value = '';
                }}
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={32} className="animate-spin text-[#B8860B]" />
                  <p className="text-sm text-[#8B7A5E]">Uploading and processing...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <FileSpreadsheet size={32} className="text-[#8B7A5E]" />
                  <div>
                    <p className="text-sm font-medium text-[#2C2416]">
                      Drop your GL export here or click to browse
                    </p>
                    <p className="text-xs text-[#8B7A5E] mt-1">
                      CSV or Excel (.csv, .xlsx, .xls) — up to 50 MB
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Format hints */}
            <div className="mt-4 p-3 rounded bg-[#F5F0E8] border border-[#DDD5C2]">
              <p className="text-xs font-medium text-[#5C4F3A] mb-2">Expected columns:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[#8B7A5E]">
                <span>entry_date</span>
                <span>account_code</span>
                <span>account_name</span>
                <span>debit</span>
                <span>credit</span>
                <span>description (optional)</span>
              </div>
              <p className="text-xs text-[#8B7A5E] mt-2">
                Sabit will auto-detect column names and map them. You can adjust the mapping after upload.
              </p>
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowUpload(false)}
                className="px-4 py-2 text-sm font-medium text-[#5C4F3A] border border-[#DDD5C2] rounded-lg hover:bg-[#F5F0E8] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
