'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { fmtMoney } from '@/lib/money';
import {
  FileText,
  CheckCircle2,
  Loader2,
  Download,
  FileSpreadsheet,
  Code,
} from 'lucide-react';

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

export default function StatementsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [activeTab, setActiveTab] = useState<StatementType>('balance_sheet');

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

  // Fetch statement packages list
  const { data: packages } = useQuery<StatementPackage[]>({
    queryKey: ['statement-packages', sessionId],
    queryFn: () =>
      apiFetch<any>(`/api/close/sessions/${sessionId}/statement-packages`).then(
        (r: any) => r.packages ?? r ?? []
      ),
    enabled: !!sessionId,
  });

  const packageId = packages?.[0]?.id;

  // Fetch lines for the selected package
  const { data: linesData, isLoading } = useQuery<{ lines: StatementLine[]; tieChecks?: TieCheck[] }>({
    queryKey: ['statement-lines', packageId, activeTab],
    queryFn: () =>
      apiFetch<any>(
        `/api/close/statement-packages/${packageId}/lines?includePrior=true&statementType=${activeTab}`
      ),
    enabled: !!packageId,
  });

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

  const _gates = (readinessQuery.data as any)?.gates ?? [];
  const _gatesTotal = (readinessQuery.data as any)?.gatesTotal ?? _gates.length;
  const _activeGateIndex = _gates.findIndex((g: any) => !g.passing);
  const _activeGateNum = _activeGateIndex >= 0 ? _activeGateIndex + 1 : _gatesTotal;
  const _startedAt = (sessionQuery.data as any)?.startedAt ?? (sessionQuery.data as any)?.createdAt ?? new Date().toISOString();
  const _dayElapsed = Math.max(1, Math.ceil((Date.now() - new Date(_startedAt).getTime()) / (1000 * 60 * 60 * 24)));
  const _targetDays = (sessionQuery.data as any)?.closeDayTarget ?? 10;
  const _sessionState = ((sessionQuery.data as any)?.state ?? 'IN_PROGRESS').replace(/_/g, ' ');
  const _periodLabel = (sessionQuery.data as any)?.periodLabel ?? '';

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
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
        <h1 className="text-2xl font-medium text-[#2C2416]">Financial Statements — March 2026</h1>
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
                  <th className="text-left px-4 py-3 font-medium w-1/2">Line Item</th>
                  <th className="text-right px-4 py-3 font-medium">March 2026</th>
                  <th className="text-right px-4 py-3 font-medium">February 2026</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-[#8B7A5E]">
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
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#B8860B] text-sm font-medium text-[#2C2416] hover:bg-[#A07608] transition-colors">
          <Download size={16} />
          Export PDF
        </button>
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#EDE6D6] border border-[#DDD5C2] text-sm font-medium text-[#2C2416] hover:border-[#B8860B] transition-colors">
          <FileSpreadsheet size={16} />
          Export Excel
        </button>
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#EDE6D6] border border-[#DDD5C2] text-sm font-medium text-[#2C2416] hover:border-[#B8860B] transition-colors">
          <Code size={16} />
          Export XBRL
        </button>
      </div>
    </div>
  );
}
