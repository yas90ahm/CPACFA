'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { fmtMoney, sumMoneyStrings } from '@/lib/money';
import {
  LayoutDashboard,
  FolderClosed,
  Briefcase,
  ScrollText,
  BarChart3,
  Activity,
  Settings,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Search,
  ArrowUpDown,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TBRow {
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  reportingCategory?: string;
  fsLineItem?: string;
}

interface TBResponse {
  rows: TBRow[];
  totalDebits?: string;
  totalCredits?: string;
}

/* ------------------------------------------------------------------ */
/*  Nav config                                                         */
/* ------------------------------------------------------------------ */

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, href: (sid: string) => `/close/${sid}/dashboard` },
  { label: 'Trial Balance', icon: BarChart3, href: (sid: string) => `/close/${sid}/trial-balance` },
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
          const isActive = item.label === 'Trial Balance';
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href(sessionId)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#3B1F0A] text-[#B8860B]'
                  : 'text-[#8B7A5E] hover:text-[#B8860B] hover:bg-[#3B1F0A]/50'
              }`}
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

  const { data, isLoading, error } = useQuery<TBResponse>({
    queryKey: ['trial-balance', sessionId, tbType],
    queryFn: () =>
      apiFetch<TBResponse>(`/api/close/sessions/${sessionId}/trial-balance`, {
        params: { type: tbType },
      }),
    enabled: !!sessionId,
  });

  const rows = data?.rows ?? [];

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
          r.accountCode.toLowerCase().includes(q) ||
          r.accountName.toLowerCase().includes(q) ||
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
      <Sidebar sessionId={sessionId} />

      <div className="ml-[260px] flex-1 flex flex-col min-h-screen">
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

        {/* Page header */}
        <main className="flex-1 px-6 py-6">
          {/* Title row */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-medium text-[#2C2416]">
              Trial Balance — March 2026
            </h1>
            <div className="flex items-center gap-2">
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
                          {search ? 'No accounts match your search.' : 'No trial balance data available.'}
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
                                <span className="text-[#8B7A5E] text-sm">--</span>
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
    </div>
  );
}
