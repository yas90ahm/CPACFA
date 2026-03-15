'use client';

import { useState, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useCloseSession } from '@/lib/queries/close-session';
import { useCertification } from '@/lib/queries/certification';
import { useStatements } from '@/lib/queries/statements';
import { useVariances } from '@/lib/queries/variance';
import { useAuth } from '@/lib/auth';
import { apiFetch, ApiError } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  Download,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileText,
  TrendingUp,
  Shield,
  Clock,
  Hash,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import type { BoardPackage } from '@/lib/queries/cumulative';

type PeriodType = 'monthly' | 'QTD' | 'YTD';
type StatementTab = 'income' | 'balance' | 'cashflow' | 'equity';

// Custom hook that tolerates 409 (session not certified) by returning null instead of throwing
function useBoardPackageTolerant(sessionId: string | null, periodType: PeriodType) {
  return useQuery<BoardPackage | null>({
    queryKey: ['board-package-tolerant', sessionId, periodType],
    queryFn: async () => {
      if (!sessionId) return null;
      try {
        const res = await apiFetch<BoardPackage>(
          `/api/close/sessions/${sessionId}/board-package?periodType=${periodType}`
        );
        return res;
      } catch (err) {
        if (err instanceof ApiError && (err.status === 409 || err.status === 422)) {
          // Session not certified — return null so the page renders in draft mode
          return null;
        }
        throw err;
      }
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    retry: (failureCount, err) => {
      // Don't retry on 409/422 — those are expected for non-certified sessions
      if (err instanceof ApiError && (err.status === 409 || err.status === 422)) return false;
      return failureCount < 2;
    },
  });
}

// Renders a single financial statement as a simple table
function StatementTable({
  lines,
}: {
  lines: Array<{
    name: string;
    amount: string;
    isSubtotal: boolean;
    isGrandTotal: boolean;
    indentLevel: number;
    sectionName: string | null;
  }>;
}) {
  if (lines.length === 0) {
    return <p className="text-sm italic py-4" style={{ color: 'var(--text-secondary)' }}>No data available.</p>;
  }

  let lastSection: string | null = null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <tbody>
          {lines.map((line, idx) => {
            const showSection = line.sectionName && line.sectionName !== lastSection;
            if (showSection) lastSection = line.sectionName;
            return (
              <>
                {showSection && (
                  <tr key={`sec-${idx}`} style={{ background: 'var(--bg-surface-sunken)' }}>
                    <td
                      colSpan={2}
                      className="py-2 px-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {line.sectionName}
                    </td>
                  </tr>
                )}
                <tr
                  key={idx}
                  className={cn(
                    line.isGrandTotal && 'font-semibold',
                    line.isSubtotal && !line.isGrandTotal && 'font-medium'
                  )}
                  style={{
                    borderBottom: '1px solid var(--border-default)',
                    ...(line.isGrandTotal ? { borderTop: '2px solid var(--border-default)', background: 'var(--bg-surface-sunken)' } : {}),
                    ...(line.isSubtotal && !line.isGrandTotal ? { borderTop: '1px solid var(--border-default)' } : {}),
                  }}
                >
                  <td
                    className="py-1.5 px-3"
                    style={{ paddingLeft: `${12 + (line.indentLevel ?? 0) * 16}px`, color: 'var(--text-primary)' }}
                  >
                    {line.name}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono">
                    <MoneyCell value={line.amount} showDollar={line.isGrandTotal || line.isSubtotal} />
                  </td>
                </tr>
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Fallback statement table built from the statements query (when board package not available)
function FallbackStatementTable({
  lines,
}: {
  lines: Array<{
    lineItemName: string;
    amount: string;
    isSubtotal: boolean;
    isGrandTotal: boolean;
    indentLevel: number;
    sectionName: string;
  }>;
}) {
  const mapped = lines.map((l) => ({
    name: l.lineItemName,
    amount: l.amount,
    isSubtotal: l.isSubtotal,
    isGrandTotal: l.isGrandTotal,
    indentLevel: l.indentLevel,
    sectionName: l.sectionName || null,
  }));
  return <StatementTable lines={mapped} />;
}

export default function BoardPackagePage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [activeTab, setActiveTab] = useState<StatementTab>('income');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const { getAuthToken } = useAuth();

  const { data: session } = useCloseSession(sessionId);
  const { data: certification } = useCertification(sessionId);
  const { data: statementsData } = useStatements(sessionId);
  const { data: variances = [] } = useVariances(sessionId);

  const currentState = session?.state ?? 'IN_PROGRESS';
  const isCertified = currentState === 'CERTIFIED' || currentState === 'LOCKED';

  const { data: boardPackage, isLoading: boardLoading } = useBoardPackageTolerant(sessionId, periodType);

  // Financial highlights derived from board package metrics or fallback to statements data
  const financialHighlights = useMemo(() => {
    if (boardPackage?.keyMetrics?.length) return boardPackage.keyMetrics;

    // Build from statements as fallback
    const is = statementsData?.incomeStatement?.lines ?? [];
    const bs = statementsData?.balanceSheet?.lines ?? [];
    const revenueLine = is.find((l) => /revenue|sales/i.test(l.lineItemName) && l.isGrandTotal) ?? is.find((l) => /revenue/i.test(l.lineItemName));
    const netIncomeLine = is.find((l) => /net income|net income \(loss\)/i.test(l.lineItemName));
    const totalAssetsLine = bs.find((l) => /total assets/i.test(l.lineItemName));
    const totalEquityLine = bs.find((l) => /total equity|stockholders'? equity/i.test(l.lineItemName));

    const metrics: Array<{ label: string; value: string; format: 'money' | 'percent' | 'text' }> = [];
    if (revenueLine) metrics.push({ label: 'Revenue', value: revenueLine.amount, format: 'money' });
    if (netIncomeLine) metrics.push({ label: 'Net Income', value: netIncomeLine.amount, format: 'money' });
    if (totalAssetsLine) metrics.push({ label: 'Total Assets', value: totalAssetsLine.amount, format: 'money' });
    if (totalEquityLine) metrics.push({ label: 'Total Equity', value: totalEquityLine.amount, format: 'money' });
    return metrics;
  }, [boardPackage, statementsData]);

  // Material variances — from board package or from variances query
  const materialVariances = useMemo(() => {
    if (boardPackage?.materialVariances?.length) return boardPackage.materialVariances;
    return variances
      .filter((v) => v.isMaterial)
      .map((v) => ({
        lineItem: v.lineItemName,
        statement: v.statementType,
        currentAmount: v.currentAmount,
        priorAmount: v.priorAmount,
        changeAmount: v.changeAmount,
        changePercent: v.changePercent,
        explanation: v.explanation,
      }));
  }, [boardPackage, variances]);

  // PDF download handler — uses fetch with auth token
  const handleDownloadPdf = useCallback(async () => {
    setDownloadError(null);
    setDownloading(true);
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/close/sessions/${sessionId}/board-package/export/pdf?periodType=${periodType}`, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Download failed' }));
        throw new Error((err as { error?: string }).error || 'Download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `board-package-${session?.periodLabel ?? sessionId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }, [sessionId, periodType, session?.periodLabel, getAuthToken]);

  const handleDownloadCsv = useCallback(() => {
    const stmts = boardPackage?.statements;
    if (!stmts) return;
    const sections: Array<{ title: string; lines: Array<{ name: string; amount: string; isSubtotal?: boolean; isGrandTotal?: boolean; indentLevel?: number; sectionName?: string | null }> }> = [
      { title: 'Income Statement', lines: stmts.incomeStatement ?? [] },
      { title: 'Balance Sheet', lines: stmts.balanceSheet ?? [] },
      { title: 'Cash Flow', lines: stmts.cashFlow ?? [] },
      { title: "Stockholders' Equity", lines: stmts.equity ?? [] },
    ];
    const rows: string[][] = [['Statement', 'Section', 'Line Item', 'Amount']];
    for (const sec of sections) {
      for (const l of sec.lines) {
        rows.push([
          sec.title,
          l.sectionName ?? '',
          (l.isGrandTotal ? '*** ' : l.isSubtotal ? '** ' : '  '.repeat(l.indentLevel ?? 0)) + l.name,
          l.amount,
        ]);
      }
    }
    if (materialVariances.length) {
      rows.push([]);
      rows.push(['Material Variances']);
      rows.push(['Line Item', 'Statement', 'Current', 'Prior', 'Change', 'Change %', 'Explanation']);
      for (const v of materialVariances) {
        rows.push([v.lineItem, v.statement, v.currentAmount, v.priorAmount, v.changeAmount, v.changePercent ? `${v.changePercent}%` : '', v.explanation ?? '']);
      }
    }
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `board-package-${session?.periodLabel ?? sessionId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [boardPackage, materialVariances, session?.periodLabel, sessionId]);

  // Determine status badge appearance
  const statusBadge = useMemo(() => {
    switch (currentState) {
      case 'LOCKED':
        return { label: 'Locked', style: { background: 'var(--status-success-bg)', color: 'var(--status-success)', border: '1px solid var(--status-success)' } };
      case 'CERTIFIED':
        return { label: 'Certified', style: { background: 'var(--status-success-bg)', color: 'var(--status-success)', border: '1px solid var(--status-success)' } };
      case 'UNDER_REVIEW':
        return { label: 'Under Review', style: { background: 'var(--status-warning-bg)', color: 'var(--status-warning)', border: '1px solid var(--status-warning)' } };
      default:
        return { label: 'In Progress', style: { background: 'var(--bg-surface-sunken)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' } };
    }
  }, [currentState]);

  const statementTabs: Array<{ id: StatementTab; label: string }> = [
    { id: 'income', label: 'Income Statement' },
    { id: 'balance', label: 'Balance Sheet' },
    { id: 'cashflow', label: 'Cash Flow' },
    { id: 'equity', label: "Stockholders' Equity" },
  ];

  const boardStatements = boardPackage?.statements;
  const fallbackStatements = statementsData;

  const activeStatementLines = useMemo(() => {
    if (boardStatements) {
      switch (activeTab) {
        case 'income': return boardStatements.incomeStatement ?? [];
        case 'balance': return boardStatements.balanceSheet ?? [];
        case 'cashflow': return boardStatements.cashFlow ?? [];
        case 'equity': return boardStatements.equity ?? [];
      }
    }
    return null; // Will use fallback
  }, [boardStatements, activeTab]);

  const fallbackLines = useMemo(() => {
    if (boardStatements) return null; // Board package has statements, no fallback needed
    switch (activeTab) {
      case 'income': return fallbackStatements?.incomeStatement?.lines ?? [];
      case 'balance': return fallbackStatements?.balanceSheet?.lines ?? [];
      case 'cashflow': return fallbackStatements?.cashFlow?.lines ?? [];
      case 'equity': return fallbackStatements?.equityStatement?.lines ?? [];
    }
  }, [boardStatements, fallbackStatements, activeTab]);

  const prepDate = useMemo(() => {
    if (boardPackage?.generatedAt) {
      return new Date(boardPackage.generatedAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    }
    return new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  }, [boardPackage]);

  return (
    <div className="space-y-6">

      {/* Draft banner — shown for any non-certified session */}
      {!isCertified && (
        <div className="rounded-lg p-4 flex items-center gap-3" style={{ background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning)' }}>
          <AlertCircle className="w-5 h-5 shrink-0" style={{ color: 'var(--status-warning)' }} />
          <div className="flex-1">
            <span className="font-medium" style={{ color: 'var(--status-warning)' }}>Draft</span>
            <span className="text-sm ml-2" style={{ color: 'var(--text-secondary)' }}>
              — this package has not been certified. Data shown reflects current in-progress work.
            </span>
          </div>
        </div>
      )}

      {/* Download error */}
      {downloadError && (
        <div className="rounded-lg p-4 flex items-center gap-3" style={{ background: 'var(--status-error-bg)', border: '1px solid var(--status-error)' }}>
          <AlertCircle className="w-5 h-5 shrink-0" style={{ color: 'var(--status-error)' }} />
          <div className="flex-1 text-sm" style={{ color: 'var(--status-error)' }}>{downloadError}</div>
          <button type="button" onClick={() => setDownloadError(null)} className="hover:opacity-70" style={{ color: 'var(--status-error)' }}>
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cover Section */}
      <div className="rounded-lg p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--interactive-primary-bg, rgba(59,130,246,0.1))' }}>
              <BookOpen className="w-5 h-5" style={{ color: 'var(--interactive-primary)' }} />
            </div>
            <div>
              <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>Board Package</h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {boardPackage?.entityName ?? session?.entityName ?? '—'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Period type selector */}
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as PeriodType)}
              className="text-sm rounded-md px-3 py-1.5 focus:outline-none"
              style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="monthly">Monthly</option>
              <option value="QTD">Quarter-to-Date</option>
              <option value="YTD">Year-to-Date</option>
            </select>

            {/* Download buttons */}
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={!boardPackage?.statements}
              className="flex items-center gap-2 px-4 py-1.5 rounded-md text-sm transition-colors disabled:opacity-50"
              style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-1.5 rounded-md text-sm transition-colors disabled:opacity-50"
              style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloading ? 'Downloading…' : 'Download PDF'}
            </button>
          </div>
        </div>

        {/* Cover details row */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Period</div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {boardPackage?.periodLabel ?? session?.periodLabel ?? '—'}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Period Type</div>
            <div className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
              {periodType === 'monthly' ? 'Monthly' : periodType}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Preparation Date</div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{prepDate}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Status</div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" style={statusBadge.style}>
              {statusBadge.label}
            </span>
          </div>
        </div>
      </div>

      {/* Financial Highlights */}
      <div className="rounded-lg p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
        <h2 className="text-lg font-display mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <TrendingUp className="w-5 h-5" />
          Financial Highlights
        </h2>
        {boardLoading ? (
          <div className="flex flex-wrap gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="min-w-[140px] rounded-lg p-3 animate-pulse" style={{ border: '1px solid var(--border-default)' }}>
                <div className="h-3 rounded w-16 mb-2" style={{ background: 'var(--bg-surface-sunken)' }} />
                <div className="h-5 rounded w-24" style={{ background: 'var(--bg-surface-sunken)' }} />
              </div>
            ))}
          </div>
        ) : financialHighlights.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {financialHighlights.map((m) => (
              <div key={m.label} className="min-w-[150px] rounded-lg p-3" style={{ border: '1px solid var(--border-default)' }}>
                <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{m.label}</div>
                {m.format === 'money' ? (
                  <div className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                    <MoneyCell value={m.value} showDollar className="text-lg font-medium" />
                  </div>
                ) : m.format === 'percent' ? (
                  <div className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>{m.value}%</div>
                ) : (
                  <div className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>{m.value}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm italic" style={{ color: 'var(--text-secondary)' }}>
            No financial highlights available. Generate statements to populate this section.
          </p>
        )}
      </div>

      {/* Financial Statements — Tabbed Layout */}
      <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
        <div className="flex items-center justify-between px-6 pt-6 pb-0">
          <h2 className="text-lg font-display flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <FileText className="w-5 h-5" />
            Financial Statements
          </h2>
        </div>

        {/* Tabs */}
        <div className="flex mt-4 px-6 gap-1" style={{ borderBottom: '1px solid var(--border-default)' }}>
          {statementTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-2 text-sm font-medium transition-colors -mb-px"
              style={{
                borderBottom: activeTab === tab.id ? '2px solid var(--interactive-primary)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--interactive-primary)' : 'var(--text-secondary)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {boardLoading ? (
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-4 rounded w-48" style={{ background: 'var(--bg-surface-sunken)' }} />
                  <div className="h-4 rounded w-24" style={{ background: 'var(--bg-surface-sunken)' }} />
                </div>
              ))}
            </div>
          ) : activeStatementLines !== null ? (
            <StatementTable lines={activeStatementLines} />
          ) : fallbackLines !== null ? (
            <FallbackStatementTable lines={fallbackLines} />
          ) : (
            <p className="text-sm italic py-4" style={{ color: 'var(--text-secondary)' }}>
              No statement data available. Generate financial statements first.
            </p>
          )}
        </div>
      </div>

      {/* Material Variances Summary */}
      <div className="rounded-lg p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
        <h2 className="text-lg font-display mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <AlertCircle className="w-5 h-5" />
          Material Variances
          {materialVariances.length > 0 && (
            <span className="ml-1 px-2 py-0.5 text-xs rounded-full font-normal" style={{ background: 'var(--status-warning-bg)', color: 'var(--status-warning)' }}>
              {materialVariances.length}
            </span>
          )}
        </h2>

        {materialVariances.length === 0 ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--status-success)' }} />
            No material variances requiring explanation.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Line Item</th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Statement</th>
                  <th className="text-right py-2 px-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Current</th>
                  <th className="text-right py-2 px-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Prior</th>
                  <th className="text-right py-2 px-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Change</th>
                  <th className="text-right py-2 px-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Change%</th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Explanation</th>
                </tr>
              </thead>
              <tbody>
                {materialVariances.map((mv, idx) => (
                  <tr key={idx} className="transition-colors" style={{ borderBottom: '1px solid var(--border-default)' }}>
                    <td className="py-2 px-3 font-medium" style={{ color: 'var(--text-primary)' }}>{mv.lineItem}</td>
                    <td className="py-2 px-3 capitalize text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {mv.statement?.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      <MoneyCell value={mv.currentAmount} />
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      <MoneyCell value={mv.priorAmount} />
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      <MoneyCell value={mv.changeAmount} />
                    </td>
                    <td className="py-2 px-3 text-right text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {mv.changePercent != null ? `${mv.changePercent}%` : '—'}
                    </td>
                    <td className="py-2 px-3 text-xs max-w-[240px]" style={{ color: 'var(--text-secondary)' }}>
                      {mv.explanation ? (
                        <span>{mv.explanation}</span>
                      ) : (
                        <span className="italic flex items-center gap-1" style={{ color: 'var(--status-warning)' }}>
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          Pending explanation
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {boardPackage?.cumulativeNote && (
          <p className="text-xs italic mt-4 pt-3" style={{ color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-default)' }}>
            {boardPackage.cumulativeNote}
          </p>
        )}
      </div>

      {/* Certification Record */}
      <div className="rounded-lg p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
        <h2 className="text-lg font-display mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Shield className="w-5 h-5" />
          Certification Record
        </h2>

        {isCertified && certification ? (
          <div className="space-y-4">
            {/* Certified status row */}
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: 'var(--status-success)' }} />
              <span className="font-medium" style={{ color: 'var(--status-success)' }}>Period Certified</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
              <div>
                <div className="text-xs uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                  <Clock className="w-3 h-3" />
                  Certified At
                </div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {certification.certifiedAt
                    ? new Date(certification.certifiedAt).toLocaleString('en-US', {
                        year: 'numeric', month: 'long', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })
                    : '—'}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                  <ChevronRight className="w-3 h-3" />
                  Certified By
                </div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {certification.certifiedBy ?? boardPackage?.certifiedBy ?? '—'}
                </div>
              </div>

              <div className="sm:col-span-2 lg:col-span-1">
                <div className="text-xs uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                  <Hash className="w-3 h-3" />
                  Snapshot Hash
                </div>
                <div className="text-xs font-mono break-all" style={{ color: 'var(--text-secondary)' }}>
                  {certification.snapshotHash
                    ? `${certification.snapshotHash.slice(0, 32)}...`
                    : '—'}
                </div>
              </div>
            </div>

            {/* Signature field */}
            {certification.signature && (
              <div className="pt-3" style={{ borderTop: '1px solid var(--border-default)' }}>
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>
                  Ed25519 Signature
                </div>
                <div className="text-xs font-mono break-all rounded-md px-3 py-2" style={{ color: 'var(--text-secondary)', background: 'var(--bg-surface-sunken)' }}>
                  {certification.signature.slice(0, 64)}...
                </div>
              </div>
            )}

            {/* Validation results from certification */}
            {certification.validationResults?.length > 0 && (
              <div className="pt-3" style={{ borderTop: '1px solid var(--border-default)' }}>
                <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Validation Checks
                </div>
                <div className="space-y-1.5">
                  {certification.validationResults.map((v, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      {v.passed ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--status-success)' }} />
                      ) : (
                        <XCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--status-error)' }} />
                      )}
                      <span style={{ color: v.passed ? 'var(--text-secondary)' : 'var(--status-error)' }}>
                        {v.check}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 py-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--bg-surface-sunken)', border: '1px solid var(--border-default)' }}>
              <Clock className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <div>
              <div className="font-medium" style={{ color: 'var(--text-secondary)' }}>Pending Certification</div>
              <div className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                This package will be certified once the period moves to CERTIFIED state.
                Navigate to <span className="font-medium">Review &amp; Certify</span> to complete this step.
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
