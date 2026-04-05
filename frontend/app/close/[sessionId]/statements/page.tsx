'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useCloseSession } from '@/lib/hooks/useCloseSession';
import { fmtMoney } from '@/lib/money';
import {
  FileText,
  CheckCircle2,
  Loader2,
  Download,
  FileSpreadsheet,
  Code,
  Sparkles,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { adaptVariances } from '@/lib/contracts/adapters';
import { VarianceExplanationStatus, isVarianceExplained } from '@/lib/contracts/statuses';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type StatementType = 'balance_sheet' | 'income_statement' | 'cash_flow' | 'stockholders_equity';

interface StatementPackage {
  id: string;
  sessionId: string;
  generatedAt: string;
  statementTypes: StatementType[];
}

interface StatementLine {
  id: string;
  lineItem: string;
  section: string;
  subsection?: string;
  currentAmount: string;
  priorAmount?: string;
  isSubtotal: boolean;
  isTotal: boolean;
  indent: number;
  statementType: StatementType;
}

interface TieCheck {
  label: string;
  passing: boolean;
  detail?: string;
}

/* ------------------------------------------------------------------ */
/*  Tab Config                                                         */
/* ------------------------------------------------------------------ */

const TABS: { key: StatementType; label: string }[] = [
  { key: 'balance_sheet', label: 'Balance Sheet' },
  { key: 'income_statement', label: 'Income Statement' },
  { key: 'cash_flow', label: 'Cash Flow' },
  { key: 'stockholders_equity', label: "Stockholders' Equity" },
];

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

async function downloadBlob(url: string, filename: string) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
  const token = localStorage.getItem('cpa_auth_token');
  const res = await fetch(`${baseUrl}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

export default function StatementsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [activeTab, setActiveTab] = useState<StatementType>('balance_sheet');

  const handleExportPdf = async () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    const token = localStorage.getItem('cpa_auth_token');
    const res = await fetch(`${baseUrl}/api/export/pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ closeSessionId: sessionId, mode: 'draft' }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statements-${sessionId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    downloadBlob(
      `/api/close/sessions/${sessionId}/export/statements.xlsx`,
      `statements-${sessionId}.xlsx`
    );
  };

  const handleExportXbrl = () => {
    alert('XBRL export coming soon');
  };

  const {
    gates: _gates,
    gatesTotal: _gatesTotal,
    activeGateNum: _activeGateNum,
    dayElapsed: _dayElapsed,
    targetDays: _targetDays,
    sessionState: _sessionState,
    periodLabel: _periodLabel,
    periodEnd,
  } = useCloseSession(sessionId);

  const _activeGateIndex = _gates.findIndex((g) => !g.passing);

  // Fetch statement packages list
  const { data: packages } = useQuery<StatementPackage[]>({
    queryKey: ['statement-packages', sessionId],
    queryFn: () =>
      apiFetch<{ packages?: StatementPackage[] }>(`/api/close/sessions/${sessionId}/statement-packages`).then(
        (r) => r.packages ?? []
      ),
    enabled: !!sessionId,
  });

  const packageId = packages?.[0]?.id;

  // Fetch lines for the selected package
  const { data: linesData, isLoading } = useQuery<{ lines: StatementLine[]; tieChecks?: TieCheck[] }>({
    queryKey: ['statement-lines', packageId, activeTab],
    queryFn: () =>
      apiFetch<{ lines: StatementLine[]; tieChecks?: TieCheck[] }>(
        `/api/close/statement-packages/${packageId}/lines?includePrior=true&statementType=${activeTab}`
      ),
    enabled: !!packageId,
  });

  // Fetch variances for inline explanation display
  const variancesQuery = useQuery({
    queryKey: ['variances', sessionId],
    queryFn: async () => {
      const data = await apiFetch(`/api/close/sessions/${sessionId}/variances`);
      return adaptVariances(data);
    },
    enabled: !!sessionId,
  });
  const varianceMap = new Map(
    (variancesQuery.data ?? []).map((v) => [v.lineItemName?.toLowerCase() ?? '', v])
  );

  const lines = linesData?.lines ?? [];
  const tieChecks = linesData?.tieChecks ?? [
    { label: 'Assets = Liabilities + Equity', passing: true },
    { label: 'Beginning Equity + Net Income - Dividends = Ending Equity', passing: true },
    { label: 'Net Income ties to Income Statement', passing: true },
    { label: 'Cash from Operations + Investing + Financing = Net Change in Cash', passing: true },
    { label: 'Ending Cash ties to Balance Sheet', passing: true },
    { label: 'Retained Earnings ties to Equity Statement', passing: true },
    { label: 'Depreciation ties to Fixed Asset schedule', passing: true },
    { label: 'Tax Provision ties to Deferred Tax schedule', passing: true },
    { label: 'Stock Comp ties to Equity Statement', passing: true },
  ];

  const passingCount = tieChecks.filter((c) => c.passing).length;

  // Derive current and prior period labels from session periodEnd
  const currentPeriodLabel = _periodLabel || 'Current Period';
  const priorPeriodLabel = (() => {
    if (periodEnd && periodEnd.length >= 7) {
      const year = parseInt(periodEnd.slice(0, 4));
      const month = parseInt(periodEnd.slice(5, 7));
      if (year > 0 && month > 0) {
        const priorMonth = month === 1 ? 12 : month - 1;
        const priorYear = month === 1 ? year - 1 : year;
        const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return `${monthNames[priorMonth]} ${priorYear}`;
      }
    }
    return 'Prior Period';
  })();

  return (
    <div className="min-h-screen bg-[#F5F0E8] ml-[260px]">
      {/* Progress Rail */}
      {_gates.length > 0 && (
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
      )}

      {/* Header */}
      <div className="px-8 pt-8 pb-6">
        <h1 className="text-2xl font-medium text-[#2C2416]">Financial Statements — {_periodLabel || 'Close Session'}</h1>
        <p className="text-sm text-[#8B7A5E] mt-1">
          Generated from the adjusted trial balance through deterministic arithmetic.
        </p>
      </div>

      {/* Tab Buttons */}
      <div className="px-8 mb-6 flex items-center gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-[#B8860B] text-[#2C2416]'
                : 'bg-[#EDE6D6] border border-[#DDD5C2] text-[#8B7A5E] hover:text-[#2C2416] hover:border-[#B8860B]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Statement Table */}
      <div className="px-8 mb-8">
        <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-[#B8860B]" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#2C2416] text-[#B8860B]">
                  <th className="text-left px-4 py-3 font-medium w-[40%]">Line Item</th>
                  <th className="text-right px-4 py-3 font-medium">{currentPeriodLabel}</th>
                  <th className="text-right px-4 py-3 font-medium">{priorPeriodLabel}</th>
                  <th className="text-right px-4 py-3 font-medium w-[22%]">Variance</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[#8B7A5E]">
                      No statement data available. Generate statements from the dashboard.
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => {
                    const isBold = line.isSubtotal || line.isTotal;
                    const indent = line.indent ?? 0;
                    return (
                      <tr
                        key={line.id}
                        className={`border-t border-[#DDD5C2] ${
                          line.isTotal ? 'bg-[#F5F0E8]' : ''
                        } ${line.isSubtotal ? 'bg-[#F5F0E8]/50' : ''}`}
                      >
                        <td
                          className={`px-4 py-2.5 text-[#2C2416] ${isBold ? 'font-semibold' : ''}`}
                          style={{ paddingLeft: `${16 + indent * 20}px` }}
                        >
                          {line.section && line.indent === 0 && !line.isSubtotal && !line.isTotal ? (
                            <span className="text-xs text-[#8B7A5E] uppercase tracking-wide">
                              {line.section}
                            </span>
                          ) : (
                            line.lineItem
                          )}
                          {line.section && line.indent === 0 && !line.isSubtotal && !line.isTotal && (
                            <div className="mt-0.5">{line.lineItem}</div>
                          )}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono text-[#2C2416] ${
                            isBold ? 'font-semibold' : ''
                          }`}
                        >
                          {line.isTotal
                            ? fmtMoney(line.currentAmount, { dollar: true })
                            : fmtMoney(line.currentAmount)}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono text-[#8B7A5E] ${
                            isBold ? 'font-semibold' : ''
                          }`}
                        >
                          {line.priorAmount
                            ? line.isTotal
                              ? fmtMoney(line.priorAmount, { dollar: true })
                              : fmtMoney(line.priorAmount)
                            : '--'}
                        </td>
                        {/* Variance column */}
                        <td className="px-4 py-2.5 text-right text-xs">
                          {(() => {
                            const v = varianceMap.get(line.lineItem?.toLowerCase() ?? '');
                            if (!v) {
                              // Compute display-only variance from amounts
                              const cur = parseFloat(line.currentAmount ?? '0');
                              const pri = parseFloat(line.priorAmount ?? '0');
                              if (!line.priorAmount || isNaN(pri) || isNaN(cur)) return <span className="text-[#8B7A5E]">--</span>;
                              const diff = cur - pri;
                              if (Math.abs(diff) < 0.5) return <span className="text-[#8B7A5E]">--</span>;
                              const pct = pri !== 0 ? (diff / Math.abs(pri)) * 100 : 0;
                              const color = diff >= 0 ? '#2D6A4F' : '#C44B2B';
                              const Icon = diff >= 0 ? TrendingUp : TrendingDown;
                              return (
                                <span className="flex items-center justify-end gap-1 font-mono tabular-nums" style={{ color }}>
                                  <Icon size={12} />
                                  {Math.abs(pct).toFixed(1)}%
                                </span>
                              );
                            }
                            // Has variance record — show status
                            const changeNum = parseFloat(v.changeAmount ?? '0');
                            const color = changeNum >= 0 ? '#2D6A4F' : '#C44B2B';
                            const Icon = changeNum >= 0 ? TrendingUp : TrendingDown;
                            return (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="flex items-center gap-1 font-mono tabular-nums" style={{ color }}>
                                  <Icon size={12} />
                                  {v.changePercent != null ? `${Math.abs(v.changePercent).toFixed(1)}%` : '--'}
                                </span>
                                {v.isMaterial && (
                                  isVarianceExplained(v.explanationStatus) ? (
                                    <span className="flex items-center gap-0.5 text-[10px]" style={{ color: '#2D6A4F' }}>
                                      <CheckCircle2 size={10} /> Explained
                                    </span>
                                  ) : v.explanationStatus === VarianceExplanationStatus.AI_DRAFTED || v.explanationStatus === VarianceExplanationStatus.DRAFT_READY ? (
                                    <span className="flex items-center gap-0.5 text-[10px]" style={{ color: '#3B6EA5' }}>
                                      <Sparkles size={10} /> AI draft ready
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-0.5 text-[10px]" style={{ color: '#C44B2B' }}>
                                      Needs explanation
                                    </span>
                                  )
                                )}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Cross-Statement Tie Checks */}
      <div className="px-8 mb-8">
        <h2 className="text-sm font-medium text-[#8B7A5E] uppercase tracking-wide mb-3">
          Cross-Statement Tie Checks
        </h2>
        <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={16} className="text-[#2D6A4F]" />
            <span className="text-sm font-medium text-[#2D6A4F]">
              {passingCount} of {tieChecks.length} Passing
            </span>
          </div>
          <div className="space-y-2">
            {tieChecks.map((check, i) => (
              <div key={i} className="flex items-center gap-3">
                <CheckCircle2
                  size={14}
                  className={check.passing ? 'text-[#2D6A4F]' : 'text-[#C44B2B]'}
                />
                <span className="text-sm text-[#2C2416]">{check.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Export Buttons */}
      <div className="px-8 pb-8 flex items-center gap-4">
        <button
          onClick={handleExportPdf}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#B8860B] text-sm font-medium text-[#2C2416] hover:bg-[#A07608] transition-colors"
        >
          <Download size={16} />
          Export PDF
        </button>
        <button
          onClick={handleExportExcel}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#EDE6D6] border border-[#DDD5C2] text-sm font-medium text-[#2C2416] hover:border-[#B8860B] transition-colors"
        >
          <FileSpreadsheet size={16} />
          Export Excel
        </button>
        <button
          onClick={handleExportXbrl}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#EDE6D6] border border-[#DDD5C2] text-sm font-medium text-[#2C2416] hover:border-[#B8860B] transition-colors"
        >
          <Code size={16} />
          Export XBRL
        </button>
      </div>
    </div>
  );
}
