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
    return <p className="text-sm text-text-secondary italic py-4">No data available.</p>;
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
                  <tr key={`sec-${idx}`} className="bg-surface-alt">
                    <td
                      colSpan={2}
                      className="py-2 px-3 text-xs font-semibold text-text-secondary uppercase tracking-wider"
                    >
                      {line.sectionName}
                    </td>
                  </tr>
                )}
                <tr
                  key={idx}
                  className={cn(
                    'border-b border-border-light',
                    line.isGrandTotal && 'border-t-2 border-t-border bg-surface-alt font-semibold',
                    line.isSubtotal && !line.isGrandTotal && 'border-t border-t-border-light font-medium'
                  )}
                >
                  <td
                    className="py-1.5 px-3 text-primary"
                    style={{ paddingLeft: `${12 + (line.indentLevel ?? 0) * 16}px` }}
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

  // Determine status badge appearance
  const statusBadge = useMemo(() => {
    switch (currentState) {
      case 'LOCKED':
        return { label: 'Locked', className: 'bg-status-green-dim text-status-green border border-status-green/30' };
      case 'CERTIFIED':
        return { label: 'Certified', className: 'bg-certified-dim text-certified border border-certified/30' };
      case 'UNDER_REVIEW':
        return { label: 'Under Review', className: 'bg-status-amber-dim text-status-amber border border-status-amber/30' };
      default:
        return { label: 'In Progress', className: 'bg-surface-alt text-text-secondary border border-border' };
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
        <div className="bg-status-amber-dim border border-status-amber rounded-card p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-status-amber shrink-0" />
          <div className="flex-1">
            <span className="font-medium text-status-amber">Draft</span>
            <span className="text-sm text-text-secondary ml-2">
              — this package has not been certified. Data shown reflects current in-progress work.
            </span>
          </div>
        </div>
      )}

      {/* Download error */}
      {downloadError && (
        <div className="bg-status-red-dim border border-status-red rounded-card p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-status-red shrink-0" />
          <div className="flex-1 text-sm text-status-red">{downloadError}</div>
          <button type="button" onClick={() => setDownloadError(null)} className="text-status-red hover:opacity-70">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cover Section */}
      <div className="bg-surface border border-border rounded-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-input bg-accent/10 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-display text-primary">Board Package</h1>
              <p className="text-text-secondary text-sm mt-0.5">
                {boardPackage?.entityName ?? session?.entityName ?? '—'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Period type selector */}
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as PeriodType)}
              className="text-sm border border-border rounded-input px-3 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="monthly">Monthly</option>
              <option value="QTD">Quarter-to-Date</option>
              <option value="YTD">Year-to-Date</option>
            </select>

            {/* Download PDF button */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-1.5 rounded-input border border-border text-sm text-text-secondary hover:bg-hover hover:text-primary transition-colors disabled:opacity-50"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloading ? 'Downloading…' : 'Download PDF'}
            </button>
          </div>
        </div>

        {/* Cover details row */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Period</div>
            <div className="text-sm font-medium text-primary">
              {boardPackage?.periodLabel ?? session?.periodLabel ?? '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Period Type</div>
            <div className="text-sm font-medium text-primary capitalize">
              {periodType === 'monthly' ? 'Monthly' : periodType}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Preparation Date</div>
            <div className="text-sm font-medium text-primary">{prepDate}</div>
          </div>
          <div>
            <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Status</div>
            <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', statusBadge.className)}>
              {statusBadge.label}
            </span>
          </div>
        </div>
      </div>

      {/* Financial Highlights */}
      <div className="bg-surface border border-border rounded-card p-6">
        <h2 className="text-lg font-display text-primary mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Financial Highlights
        </h2>
        {boardLoading ? (
          <div className="flex flex-wrap gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="min-w-[140px] border border-border rounded-card p-3 animate-pulse">
                <div className="h-3 bg-surface-alt rounded w-16 mb-2" />
                <div className="h-5 bg-surface-alt rounded w-24" />
              </div>
            ))}
          </div>
        ) : financialHighlights.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {financialHighlights.map((m) => (
              <div key={m.label} className="min-w-[150px] border border-border rounded-card p-3">
                <div className="text-xs text-text-secondary mb-1">{m.label}</div>
                {m.format === 'money' ? (
                  <div className="text-lg font-medium text-primary">
                    <MoneyCell value={m.value} showDollar className="text-lg font-medium" />
                  </div>
                ) : m.format === 'percent' ? (
                  <div className="text-lg font-medium text-primary">{m.value}%</div>
                ) : (
                  <div className="text-lg font-medium text-primary">{m.value}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary italic">
            No financial highlights available. Generate statements to populate this section.
          </p>
        )}
      </div>

      {/* Financial Statements — Tabbed Layout */}
      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-0">
          <h2 className="text-lg font-display text-primary flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Financial Statements
          </h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border mt-4 px-6 gap-1">
          {statementTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                activeTab === tab.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-secondary hover:text-primary hover:border-border'
              )}
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
                  <div className="h-4 bg-surface-alt rounded w-48" />
                  <div className="h-4 bg-surface-alt rounded w-24" />
                </div>
              ))}
            </div>
          ) : activeStatementLines !== null ? (
            <StatementTable lines={activeStatementLines} />
          ) : fallbackLines !== null ? (
            <FallbackStatementTable lines={fallbackLines} />
          ) : (
            <p className="text-sm text-text-secondary italic py-4">
              No statement data available. Generate financial statements first.
            </p>
          )}
        </div>
      </div>

      {/* Material Variances Summary */}
      <div className="bg-surface border border-border rounded-card p-6">
        <h2 className="text-lg font-display text-primary mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Material Variances
          {materialVariances.length > 0 && (
            <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-status-amber-dim text-status-amber font-normal">
              {materialVariances.length}
            </span>
          )}
        </h2>

        {materialVariances.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <CheckCircle2 className="w-4 h-4 text-status-green shrink-0" />
            No material variances requiring explanation.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-text-secondary">Line Item</th>
                  <th className="text-left py-2 px-3 font-medium text-text-secondary">Statement</th>
                  <th className="text-right py-2 px-3 font-medium text-text-secondary">Current</th>
                  <th className="text-right py-2 px-3 font-medium text-text-secondary">Prior</th>
                  <th className="text-right py-2 px-3 font-medium text-text-secondary">Change</th>
                  <th className="text-right py-2 px-3 font-medium text-text-secondary">Change%</th>
                  <th className="text-left py-2 px-3 font-medium text-text-secondary">Explanation</th>
                </tr>
              </thead>
              <tbody>
                {materialVariances.map((mv, idx) => (
                  <tr key={idx} className="border-b border-border-light hover:bg-hover/50 transition-colors">
                    <td className="py-2 px-3 font-medium text-primary">{mv.lineItem}</td>
                    <td className="py-2 px-3 text-text-secondary capitalize text-xs">
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
                    <td className="py-2 px-3 text-right text-text-secondary text-xs">
                      {mv.changePercent != null ? `${mv.changePercent}%` : '—'}
                    </td>
                    <td className="py-2 px-3 text-text-secondary text-xs max-w-[240px]">
                      {mv.explanation ? (
                        <span>{mv.explanation}</span>
                      ) : (
                        <span className="text-status-amber italic flex items-center gap-1">
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
          <p className="text-xs text-text-tertiary italic mt-4 border-t border-border-light pt-3">
            {boardPackage.cumulativeNote}
          </p>
        )}
      </div>

      {/* Certification Record */}
      <div className="bg-surface border border-border rounded-card p-6">
        <h2 className="text-lg font-display text-primary mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Certification Record
        </h2>

        {isCertified && certification ? (
          <div className="space-y-4">
            {/* Certified status row */}
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-status-green shrink-0" />
              <span className="font-medium text-status-green">Period Certified</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
              <div>
                <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Certified At
                </div>
                <div className="text-sm font-medium text-primary">
                  {certification.certifiedAt
                    ? new Date(certification.certifiedAt).toLocaleString('en-US', {
                        year: 'numeric', month: 'long', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })
                    : '—'}
                </div>
              </div>

              <div>
                <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" />
                  Certified By
                </div>
                <div className="text-sm font-medium text-primary">
                  {certification.certifiedBy ?? boardPackage?.certifiedBy ?? '—'}
                </div>
              </div>

              <div className="sm:col-span-2 lg:col-span-1">
                <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  Snapshot Hash
                </div>
                <div className="text-xs font-mono text-text-secondary break-all">
                  {certification.snapshotHash
                    ? `${certification.snapshotHash.slice(0, 32)}...`
                    : '—'}
                </div>
              </div>
            </div>

            {/* Signature field */}
            {certification.signature && (
              <div className="pt-3 border-t border-border-light">
                <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">
                  Ed25519 Signature
                </div>
                <div className="text-xs font-mono text-text-secondary break-all bg-surface-alt rounded-input px-3 py-2">
                  {certification.signature.slice(0, 64)}...
                </div>
              </div>
            )}

            {/* Validation results from certification */}
            {certification.validationResults?.length > 0 && (
              <div className="pt-3 border-t border-border-light">
                <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
                  Validation Checks
                </div>
                <div className="space-y-1.5">
                  {certification.validationResults.map((v, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      {v.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-status-green shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-status-red shrink-0" />
                      )}
                      <span className={v.passed ? 'text-text-secondary' : 'text-status-red'}>
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
            <div className="w-8 h-8 rounded-full bg-surface-alt border border-border flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-text-tertiary" />
            </div>
            <div>
              <div className="font-medium text-text-secondary">Pending Certification</div>
              <div className="text-sm text-text-tertiary mt-0.5">
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
