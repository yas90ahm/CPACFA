'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  FileDown,
  Shield,
  Clock,
  FileText,
  Loader2,
  Check,
  X,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { usePortfolioEntities } from '@/lib/queries/portfolio';
import { useCertification } from '@/lib/queries/certification';
import { useStatements } from '@/lib/queries/statements';
import { useEBITDABridge } from '@/lib/queries/ebitda';
import { useVariances } from '@/lib/queries/variance';
import { useAuditTrail } from '@/lib/queries/audit-trail';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { HashDisplay } from '@/components/shared/HashDisplay';
import { PipelineStepper, type PipelineStep } from '@/components/shared/PipelineStepper';
import { GateIndicator } from '@/components/shared/GateIndicator';
import { EmptyState } from '@/components/shared/EmptyState';
import { fmtMoney, isMoneyNegative } from '@/lib/money';
import type { PortfolioCompany } from '@/lib/types/portfolio';
import type { CloseState } from '@/lib/types/close-session';
import { Breadcrumb } from '@/components/shared/Breadcrumb';

/* ─────────────────────────── Types ─────────────────────────── */

type EntityTab = 'overview' | 'statements' | 'ebitda' | 'variance' | 'audit-trail';

type StatementSubTab = 'balance-sheet' | 'income-statement' | 'cash-flow' | 'equity' | 'ebitda-bridge';

/* ─────────────────────── Helpers ─────────────────────── */

function stateToStatusType(state: CloseState): 'complete' | 'in-progress' | 'pending' | 'certified' | 'locked' | 'not-started' {
  switch (state) {
    case 'CERTIFIED': return 'certified';
    case 'LOCKED': return 'locked';
    case 'UNDER_REVIEW': return 'in-progress';
    case 'IN_PROGRESS': return 'in-progress';
    case 'OPEN': return 'pending';
    default: return 'not-started';
  }
}

function closePipelineSteps(state: CloseState): PipelineStep[] {
  const order: CloseState[] = ['OPEN', 'IN_PROGRESS', 'UNDER_REVIEW', 'CERTIFIED', 'LOCKED'];
  const idx = order.indexOf(state);
  return [
    { id: 'open', label: 'Open', status: idx >= 0 ? 'complete' : 'pending' },
    { id: 'in-progress', label: 'In Progress', status: idx > 0 ? (idx === 1 ? 'active' : 'complete') : 'pending' },
    { id: 'under-review', label: 'Under Review', status: idx > 1 ? (idx === 2 ? 'active' : 'complete') : 'pending' },
    { id: 'certified', label: 'Certified', status: idx > 2 ? (idx === 3 ? 'active' : 'complete') : 'pending' },
    { id: 'locked', label: 'Locked', status: idx > 3 ? 'complete' : 'pending' },
  ];
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  } catch {
    return iso;
  }
}

function trendValue(current: string | null | undefined, prior: string | null | undefined): { positive: boolean; text: string } | null {
  if (!current || !prior) return null;
  const c = parseFloat(String(current).replace(/[$,()]/g, ''));
  const p = parseFloat(String(prior).replace(/[$,()]/g, ''));
  if (!isFinite(c) || !isFinite(p) || p === 0) return null;
  const pct = ((c - p) / Math.abs(p)) * 100;
  return { positive: pct >= 0, text: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs prior` };
}

function eventTypeLabel(eventType: string): string {
  const labels: Record<string, string> = {
    close_state_change: 'State Change',
    je_created: 'JE Created',
    je_proposed: 'JE Proposed',
    je_approved: 'JE Approved',
    je_posted: 'JE Posted',
    je_rejected: 'JE Rejected',
    recon_completed: 'Recon Completed',
    recon_approved: 'Recon Approved',
    mapping_changed: 'Mapping Changed',
    evidence_uploaded: 'Evidence Uploaded',
    variance_explained: 'Variance Explained',
    variance_approved: 'Variance Approved',
    certification: 'Certification',
    lock: 'Lock',
    reopen: 'Reopen',
  };
  return labels[eventType] ?? eventType;
}

/* ─────────────────────── Tab Definitions ─────────────────────── */

const TABS: { id: EntityTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'statements', label: 'Statements' },
  { id: 'ebitda', label: 'EBITDA Bridge' },
  { id: 'variance', label: 'Variance' },
  { id: 'audit-trail', label: 'Audit Trail' },
];

const STATEMENT_SUB_TABS: { id: StatementSubTab; label: string }[] = [
  { id: 'balance-sheet', label: 'Balance Sheet' },
  { id: 'income-statement', label: 'Income Statement' },
  { id: 'cash-flow', label: 'Cash Flow' },
  { id: 'equity', label: "Stockholders' Equity" },
  { id: 'ebitda-bridge', label: 'EBITDA Bridge' },
];

/* ─────────────────────── Main Page Component ─────────────────────── */

export default function EntityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const entityId = params.entityId as string;
  const [tab, setTab] = useState<EntityTab>('overview');
  const [statementSubTab, setStatementSubTab] = useState<StatementSubTab>('balance-sheet');

  // ── Data Fetching ──
  const { data: entities, isLoading: entitiesLoading } = usePortfolioEntities();
  const entity = useMemo(() => entities?.find((e) => e.id === entityId) ?? null, [entities, entityId]);

  const sessionId = entity?.currentSessionId ?? null;
  const isCertified = entity?.currentState === 'CERTIFIED' || entity?.currentState === 'LOCKED';

  const { data: certification } = useCertification(sessionId);
  const { data: statements } = useStatements(sessionId);
  const { data: ebitdaData } = useEBITDABridge(sessionId);
  const { data: variances } = useVariances(sessionId);
  const { data: auditData } = useAuditTrail(sessionId);

  // ── Loading & Not Found States ──
  if (entitiesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--interactive-primary)' }} />
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="max-w-2xl mx-auto py-24">
        <EmptyState
          title="Entity not found"
          description={`No portfolio entity found with ID "${entityId}".`}
          actionLabel="Back to Portfolio"
          onAction={() => router.push('/portfolio')}
        />
      </div>
    );
  }

  const fin = entity.financials;
  const revenueTrend = trendValue(fin?.revenue, null);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">

        {/* ── Header ── */}
        <header className="space-y-3">
          <Breadcrumb items={[
            { label: 'Portfolio', href: '/portfolio' },
            { label: entity.name || 'Entity' },
          ]} />

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div>
                <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>
                  {entity.name}
                </h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {entity.currentPeriod || 'Current Period'}
                  </span>
                  <StatusBadge
                    status={stateToStatusType(entity.currentState)}
                    size="sm"
                  />
                </div>
              </div>

              {/* Certification Seal */}
              {isCertified && certification && (
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    border: '3px double var(--cert-primary)',
                    backgroundColor: 'var(--bg-certified)',
                  }}
                  title={`Certified by ${certification.certifiedBy} on ${formatDate(certification.certifiedAt)}`}
                >
                  <Shield className="w-4 h-4" style={{ color: 'var(--cert-primary)' }} />
                </div>
              )}
            </div>

            {/* Export Button */}
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors hover:opacity-90"
              style={{
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              <FileDown className="w-4 h-4" />
              Export Company Report
            </button>
          </div>

          {isCertified && certification && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Certified by {certification.certifiedBy} on {formatDate(certification.certifiedAt)}
            </p>
          )}
        </header>

        {/* ── Tab Bar ── */}
        <nav
          className="flex gap-6"
          style={{ borderBottom: '1px solid var(--border-default)' }}
          aria-label="Entity detail tabs"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="pb-3 text-sm font-medium -mb-px transition-colors"
              style={{
                borderBottom: tab === t.id
                  ? '2px solid var(--interactive-primary)'
                  : '2px solid transparent',
                color: tab === t.id
                  ? 'var(--interactive-primary)'
                  : 'var(--text-secondary)',
              }}
              aria-selected={tab === t.id}
              role="tab"
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* ── Tab Content ── */}
        {tab === 'overview' && (
          <OverviewTab entity={entity} certification={certification} auditEvents={auditData?.events ?? []} onSwitchTab={setTab} sessionId={sessionId} />
        )}
        {tab === 'statements' && (
          <StatementsTab
            sessionId={sessionId}
            statements={statements}
            entityName={entity.name}
            subTab={statementSubTab}
            setSubTab={setStatementSubTab}
          />
        )}
        {tab === 'ebitda' && (
          <EbitdaTab sessionId={sessionId} ebitdaData={ebitdaData} />
        )}
        {tab === 'variance' && (
          <VarianceTab sessionId={sessionId} variances={variances ?? []} />
        )}
        {tab === 'audit-trail' && (
          <AuditTrailTab sessionId={sessionId} auditData={auditData} />
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*                         OVERVIEW TAB                           */
/* ═══════════════════════════════════════════════════════════════ */

function OverviewTab({
  entity,
  certification,
  auditEvents,
  onSwitchTab,
  sessionId,
}: {
  entity: PortfolioCompany;
  certification: import('@/lib/types/certification').CertificationArtifact | null | undefined;
  auditEvents: import('@/lib/types/audit-trail').AuditEvent[];
  onSwitchTab: (tab: EntityTab) => void;
  sessionId: string | null;
}) {
  const fin = entity.financials;
  const isCertified = entity.currentState === 'CERTIFIED' || entity.currentState === 'LOCKED';

  // KPI cards data
  const kpis: { label: string; value: string | null; trend?: { positive: boolean; text: string } | null }[] = [
    { label: 'Revenue', value: fin?.revenue ?? entity.revenue },
    { label: 'EBITDA', value: fin?.ebitda ?? null },
    { label: 'Net Income', value: fin?.netIncome ?? entity.netIncome },
    { label: 'Total Assets', value: fin?.totalAssets ?? null },
    { label: 'Cash', value: fin?.cashPosition ?? null },
  ];

  // Key metrics table
  const metrics: { label: string; current: string | null; prior: string | null; budget: string | null }[] = [
    { label: 'Gross Margin', current: fin?.grossMarginPercent ?? null, prior: null, budget: null },
    { label: 'Operating Margin', current: fin?.operatingMarginPercent ?? null, prior: null, budget: null },
    { label: 'EBITDA Margin', current: entity.marginPercent, prior: null, budget: null },
  ];

  const pipelineSteps = closePipelineSteps(entity.currentState);
  const recentActivity = auditEvents.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Row 1: Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-lg p-4"
            style={{
              background: 'var(--bg-surface)',
              borderColor: 'var(--border-default)',
              borderWidth: '1px',
              borderStyle: 'solid',
            }}
          >
            <p
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {kpi.label}
            </p>
            <div className="mt-1">
              <MoneyCell value={kpi.value} variant="total" showCurrency zeroDisplay="dash" />
            </div>
          </div>
        ))}
      </div>

      {/* Row 2: Close Status + Certification */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Close Status */}
        <div
          className="rounded-lg p-5"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
          }}
        >
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Close Status
          </h3>
          <PipelineStepper steps={pipelineSteps} compact sessionId={sessionId ?? undefined} className="mb-4" />

          <div className="flex items-center gap-4 mt-4">
            {entity.daysInClose != null && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Day {entity.daysInClose} of {entity.targetCloseDays} target
                </span>
              </div>
            )}
          </div>

          {entity.gatesTotal > 0 && (
            <div className="mt-3">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {entity.gatesPassing} of {entity.gatesTotal} gates passing
              </p>
              <div className="flex items-center gap-1 mt-2">
                {Array.from({ length: entity.gatesTotal }, (_, i) => {
                  const passed = i < entity.gatesPassing;
                  return (
                    <span key={i} className="inline-flex items-center justify-center w-4 h-4">
                      {passed
                        ? <Check className="w-3 h-3" style={{ color: 'var(--status-success)' }} />
                        : <X className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />}
                      <span className="sr-only">{passed ? 'Gate passed' : 'Gate not passed'}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Certification */}
        <div
          className="rounded-lg p-5"
          style={{
            background: isCertified ? 'var(--bg-certified)' : 'var(--bg-surface)',
            border: `1px solid ${isCertified ? 'var(--cert-primary)' : 'var(--border-default)'}`,
          }}
        >
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Certification
          </h3>

          {isCertified && certification ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5" style={{ color: 'var(--cert-primary)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Certified
                </span>
              </div>
              <div className="space-y-2">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <span className="font-medium">Certifier:</span> {certification.certifiedBy}
                </p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <span className="font-medium">Date:</span> {formatDateTime(certification.certifiedAt)}
                </p>
                {certification.snapshotHash && (
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
                      Snapshot Hash
                    </p>
                    <HashDisplay
                      hash={certification.snapshotHash}
                      verified={certification.verified}
                      verificationUrl="/verify"
                    />
                  </div>
                )}
              </div>
              <Link
                href="/verify"
                className="inline-flex items-center gap-1 text-sm font-medium mt-2"
                style={{ color: 'var(--interactive-primary)' }}
              >
                Verify
                <ArrowLeft className="w-3 h-3 rotate-180" />
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <StatusBadge status="pending" label="Pending certification" />
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Key Metrics Table */}
      <div
        className="rounded-lg p-5"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Key Metrics
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                <th className="text-left py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Metric
                </th>
                <th className="text-right py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Current
                </th>
                <th className="text-right py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Prior Month
                </th>
                <th className="text-right py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Budget
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.label} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td className="py-2" style={{ color: 'var(--text-primary)' }}>
                    {m.label}
                  </td>
                  <td className="py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {m.current != null ? `${parseFloat(m.current).toFixed(1)}%` : '\u2014'}
                  </td>
                  <td className="py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {m.prior != null ? `${parseFloat(m.prior).toFixed(1)}%` : '\u2014'}
                  </td>
                  <td className="py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {m.budget != null ? `${parseFloat(m.budget).toFixed(1)}%` : '\u2014'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 4: Recent Activity */}
      <div
        className="rounded-lg p-5"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Recent Activity
        </h3>
        {recentActivity.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            No activity recorded for this period.
          </p>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((evt) => (
              <div key={evt.id} className="flex items-start gap-3">
                <div
                  className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: 'var(--interactive-primary)' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {eventTypeLabel(evt.eventType)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {formatDateTime(evt.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {evt.description} {evt.userName !== 'System' ? `\u2014 ${evt.userName}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        {auditEvents.length > 5 && (
          <button
            type="button"
            onClick={() => onSwitchTab('audit-trail')}
            className="inline-flex items-center gap-1 text-sm font-medium mt-4"
            style={{ color: 'var(--interactive-primary)' }}
          >
            View full audit trail
            <ArrowLeft className="w-3 h-3 rotate-180" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*                       STATEMENTS TAB                           */
/* ═══════════════════════════════════════════════════════════════ */

interface StatementLine {
  id: string;
  statementType: string;
  sectionName: string;
  lineItemName: string;
  taxonomyLineId: string;
  amount: string;
  priorAmount?: string;
  changeAmount?: string;
  changePercent?: string | null;
  displayOrder: number;
  isSubtotal: boolean;
  isGrandTotal: boolean;
  indentLevel: number;
  accounts: unknown[];
}

function StatementsTab({
  sessionId,
  statements,
  entityName,
  subTab,
  setSubTab,
}: {
  sessionId: string | null;
  statements: ReturnType<typeof useStatements>['data'];
  entityName: string;
  subTab: StatementSubTab;
  setSubTab: (t: StatementSubTab) => void;
}) {
  if (!sessionId) {
    return (
      <EmptyState
        icon={FileText}
        title="No active session"
        description="This entity does not have an active close session."
      />
    );
  }

  const hasStatements = statements && (
    statements.incomeStatement.lines.length > 0 ||
    statements.balanceSheet.lines.length > 0
  );

  if (!hasStatements) {
    return (
      <EmptyState
        icon={FileText}
        title="Financial statements have not been generated for this period"
        description="Statements will appear here once they are generated during the close process."
      />
    );
  }

  const linesByTab: Record<StatementSubTab, StatementLine[]> = {
    'balance-sheet': (statements?.balanceSheet?.lines ?? []) as StatementLine[],
    'income-statement': (statements?.incomeStatement?.lines ?? []) as StatementLine[],
    'cash-flow': (statements?.cashFlow?.lines ?? []) as StatementLine[],
    'equity': (statements?.equityStatement?.lines ?? []) as StatementLine[],
    'ebitda-bridge': [],
  };

  const titlesByTab: Record<StatementSubTab, string> = {
    'balance-sheet': 'BALANCE SHEET',
    'income-statement': 'INCOME STATEMENT',
    'cash-flow': 'STATEMENT OF CASH FLOWS',
    'equity': "STATEMENT OF STOCKHOLDERS' EQUITY",
    'ebitda-bridge': 'EBITDA BRIDGE',
  };

  const lines = linesByTab[subTab];

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-4 flex-wrap">
        {STATEMENT_SUB_TABS.map((st) => (
          <button
            key={st.id}
            type="button"
            onClick={() => setSubTab(st.id)}
            className="px-3 py-1.5 text-sm rounded-md transition-colors"
            style={
              subTab === st.id
                ? {
                    backgroundColor: 'var(--interactive-primary)',
                    color: 'var(--text-on-primary)',
                  }
                : {
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--bg-surface)',
                  }
            }
          >
            {st.label}
          </button>
        ))}
      </div>

      {/* Statement Content */}
      <div
        className="p-6 rounded-lg"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        {subTab === 'ebitda-bridge' ? (
          <ReadOnlyEbitdaBridge sessionId={sessionId} />
        ) : lines.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
            No data available for this statement.
          </p>
        ) : (
          <>
            <div className="text-center mb-6">
              <h2 className="text-lg font-display mb-1" style={{ color: 'var(--text-primary)' }}>
                {entityName}
              </h2>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {titlesByTab[subTab]}
              </p>
            </div>
            <ReadOnlyStatementTable lines={lines} />
          </>
        )}
      </div>
    </div>
  );
}

function ReadOnlyStatementTable({ lines }: { lines: StatementLine[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            <th className="text-left py-1.5 pr-4 font-medium" />
            <th className="text-right py-1.5 font-medium w-40">Amount</th>
            <th className="text-right py-1.5 font-medium w-40">Prior</th>
            <th className="text-right py-1.5 font-medium w-32">Change %</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((row) => {
            const isSectionHeader = row.indentLevel === 0 && !row.amount;
            return (
              <tr
                key={row.id}
                style={{
                  borderBottom: row.isGrandTotal || row.isSubtotal
                    ? '1px solid var(--border-default)'
                    : '1px solid var(--border-subtle)',
                }}
              >
                <td
                  className="py-1.5 pr-4 text-sm"
                  style={{
                    paddingLeft: `${(row.indentLevel ?? 0) * 24}px`,
                    color: isSectionHeader ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: isSectionHeader || row.isSubtotal || row.isGrandTotal ? 600 : 400,
                  }}
                >
                  {row.lineItemName}
                </td>
                <td className="py-1.5 text-right">
                  <MoneyCell
                    value={row.amount}
                    variant={row.isGrandTotal ? 'grand-total' : row.isSubtotal ? 'subtotal' : 'line-item'}
                    showCurrency={row.isGrandTotal || row.isSubtotal}
                  />
                </td>
                <td className="py-1.5 text-right">
                  <MoneyCell
                    value={row.priorAmount ?? null}
                    variant={row.isGrandTotal ? 'grand-total' : row.isSubtotal ? 'subtotal' : 'line-item'}
                  />
                </td>
                <td
                  className="py-1.5 text-right text-sm tabular-nums"
                  style={{
                    color: row.changePercent != null && isMoneyNegative(row.changePercent)
                      ? 'var(--status-error)'
                      : row.changePercent != null
                        ? 'var(--text-secondary)'
                        : 'var(--text-tertiary)',
                  }}
                >
                  {row.changePercent != null ? `${fmtMoney(row.changePercent, { dash: false })}%` : '\u2014'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReadOnlyEbitdaBridge({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useEBITDABridge(sessionId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--interactive-primary)' }} />
      </div>
    );
  }

  const bridge = data?.bridge;
  if (!bridge) {
    return (
      <EmptyState
        title="No EBITDA bridge data available"
        description="The EBITDA bridge will appear here once financial statements are generated."
      />
    );
  }

  interface BridgeLine { label: string; amount: string; isBold?: boolean; isSeparator?: boolean }
  const lines: BridgeLine[] = [
    { label: 'Net Income', amount: bridge.netIncome ?? '0' },
    { label: '(+) Interest Expense', amount: bridge.interestExpense ?? '0' },
    { label: '(+) Tax Expense', amount: bridge.taxExpense ?? '0' },
    { label: '(+) Depreciation & Amortization', amount: bridge.depreciationAmortization ?? '0' },
    { label: 'EBITDA', amount: bridge.ebitda ?? '0', isSeparator: true, isBold: true },
  ];

  const addbacks: Array<{ id: string; label: string; amount: string }> = bridge.addbacks ?? [];
  for (const ab of addbacks) {
    lines.push({ label: `(+) ${ab.label}`, amount: ab.amount });
  }
  lines.push({
    label: 'Adjusted EBITDA',
    amount: bridge.adjustedEbitda ?? bridge.ebitda ?? '0',
    isSeparator: true,
    isBold: true,
  });

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-lg font-display mb-6 text-center" style={{ color: 'var(--text-primary)' }}>
        EBITDA Bridge
      </h2>
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, idx) => (
            <tr
              key={idx}
              style={{
                borderTop: line.isSeparator ? '1px solid var(--border-default)' : undefined,
              }}
            >
              <td
                className="py-2 pr-4 text-sm"
                style={{
                  color: line.isBold ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: line.isBold ? 700 : 400,
                }}
              >
                {line.label}
              </td>
              <td className="py-2 text-right w-40">
                <MoneyCell
                  value={line.amount}
                  variant={line.isBold ? 'total' : 'line-item'}
                  showCurrency={line.isBold}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*                       EBITDA TAB                               */
/* ═══════════════════════════════════════════════════════════════ */

function EbitdaTab({
  sessionId,
  ebitdaData,
}: {
  sessionId: string | null;
  ebitdaData: ReturnType<typeof useEBITDABridge>['data'];
}) {
  if (!sessionId) {
    return (
      <EmptyState
        title="No active session"
        description="This entity does not have an active close session."
      />
    );
  }

  return (
    <div
      className="rounded-lg p-6"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
      }}
    >
      <ReadOnlyEbitdaBridge sessionId={sessionId} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*                       VARIANCE TAB                             */
/* ═══════════════════════════════════════════════════════════════ */

function VarianceTab({
  sessionId,
  variances,
}: {
  sessionId: string | null;
  variances: import('@/lib/types/variance').VarianceRecord[];
}) {
  if (!sessionId) {
    return (
      <EmptyState
        title="No active session"
        description="This entity does not have an active close session."
      />
    );
  }

  if (variances.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No variance data available"
        description="Variance analysis will appear here once financial statements have been generated and compared with the prior period."
      />
    );
  }

  const materialCount = variances.filter((v) => v.isMaterial).length;
  const explainedCount = variances.filter((v) => v.explanationStatus === 'explained' || v.explanationStatus === 'approved').length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div
        className="flex items-center gap-6 p-4 rounded-lg"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div>
          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
            Total Variances
          </span>
          <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {variances.length}
          </p>
        </div>
        <div>
          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
            Material
          </span>
          <p className="text-lg font-semibold" style={{ color: materialCount > 0 ? 'var(--status-warning)' : 'var(--text-primary)' }}>
            {materialCount}
          </p>
        </div>
        <div>
          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
            Explained
          </span>
          <p className="text-lg font-semibold" style={{ color: 'var(--status-success)' }}>
            {explainedCount}
          </p>
        </div>
      </div>

      {/* Variance table */}
      <div
        className="rounded-lg overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--bg-surface-sunken)' }}>
                <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Line Item</th>
                <th className="text-right py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Prior</th>
                <th className="text-right py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Current</th>
                <th className="text-right py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Change</th>
                <th className="text-right py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Change %</th>
                <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {variances.map((v) => (
                <tr
                  key={v.id}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    backgroundColor: v.isMaterial ? 'var(--status-warning-bg, transparent)' : undefined,
                  }}
                >
                  <td className="py-2.5 px-4" style={{ color: 'var(--text-primary)' }}>
                    <div className="flex items-center gap-2">
                      {v.isMaterial && (
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--status-warning)' }} />
                      )}
                      {v.lineItemName}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <MoneyCell value={v.priorAmount} variant="line-item" />
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <MoneyCell value={v.currentAmount} variant="line-item" />
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <MoneyCell value={v.changeAmount} variant="line-item" />
                  </td>
                  <td
                    className="py-2.5 px-4 text-right tabular-nums"
                    style={{
                      color: isMoneyNegative(v.changePercent)
                        ? 'var(--status-error)'
                        : 'var(--text-secondary)',
                    }}
                  >
                    {fmtMoney(v.changePercent, { dash: false })}%
                  </td>
                  <td className="py-2.5 px-4">
                    <StatusBadge
                      status={
                        v.explanationStatus === 'approved' ? 'complete'
                          : v.explanationStatus === 'explained' ? 'in-progress'
                            : v.explanationStatus === 'pending' ? 'pending'
                              : 'not-started'
                      }
                      size="sm"
                      label={
                        v.explanationStatus === 'approved' ? 'Approved'
                          : v.explanationStatus === 'explained' ? 'Explained'
                            : v.explanationStatus === 'pending' ? 'Pending'
                              : 'N/A'
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Expanded explanations for material variances */}
        {variances.filter((v) => v.isMaterial && (v.explanation || v.aiDraftExplanation)).length > 0 && (
          <div className="p-4 space-y-3" style={{ borderTop: '1px solid var(--border-default)' }}>
            <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              Explanations
            </h4>
            {variances
              .filter((v) => v.isMaterial && (v.explanation || v.aiDraftExplanation))
              .map((v) => (
                <div
                  key={v.id}
                  className="p-3 rounded-md"
                  style={{
                    backgroundColor: v.aiDraftExplanation && !v.explanation
                      ? 'var(--ai-bg)'
                      : 'var(--bg-surface-sunken)',
                    border: `1px solid ${v.aiDraftExplanation && !v.explanation ? 'var(--ai-primary)' : 'var(--border-subtle)'}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {v.lineItemName}
                    </span>
                    {v.aiDraftExplanation && !v.explanation && (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-semibold uppercase px-1.5 py-0.5 rounded"
                        style={{ color: 'var(--ai-primary)', backgroundColor: 'var(--ai-bg)' }}
                      >
                        <Sparkles className="w-3 h-3" />
                        AI Draft
                      </span>
                    )}
                    {v.classification && (
                      <StatusBadge
                        status="not-started"
                        label={v.classification}
                        size="sm"
                        showIcon={false}
                      />
                    )}
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {v.explanation || v.aiDraftExplanation}
                  </p>
                  {v.approvedBy && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      Approved by {v.approvedBy} on {formatDate(v.approvedAt)}
                    </p>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*                      AUDIT TRAIL TAB                           */
/* ═══════════════════════════════════════════════════════════════ */

function AuditTrailTab({
  sessionId,
  auditData,
}: {
  sessionId: string | null;
  auditData: { events: import('@/lib/types/audit-trail').AuditEvent[]; total: number; chainIntegrity: boolean } | undefined;
}) {
  if (!sessionId) {
    return (
      <EmptyState
        title="No active session"
        description="This entity does not have an active close session."
      />
    );
  }

  const events = auditData?.events ?? [];
  const chainIntegrity = auditData?.chainIntegrity ?? true;

  return (
    <div className="space-y-4">
      {/* Chain integrity badge */}
      <div
        className="flex items-center gap-3 p-4 rounded-lg"
        style={{
          backgroundColor: chainIntegrity ? 'var(--bg-surface)' : 'var(--status-error-bg)',
          border: `1px solid ${chainIntegrity ? 'var(--border-default)' : 'var(--status-error)'}`,
        }}
      >
        {chainIntegrity ? (
          <>
            <Shield className="w-5 h-5" style={{ color: 'var(--status-success)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Hash Chain Intact
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                All {events.length} audit entries are cryptographically linked and verified.
              </p>
            </div>
          </>
        ) : (
          <>
            <AlertTriangle className="w-5 h-5" style={{ color: 'var(--status-error)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--status-error)' }}>
                Hash Chain Integrity Warning
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                One or more audit entries have broken chain links. Investigation recommended.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Events table */}
      {events.length === 0 ? (
        <EmptyState
          title="No audit events"
          description="Audit trail entries will appear here as actions are taken during the close process."
        />
      ) : (
        <div
          className="rounded-lg overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--bg-surface-sunken)' }}>
                  <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Timestamp</th>
                  <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Event</th>
                  <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>User</th>
                  <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Description</th>
                  <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Hash</th>
                  <th className="text-center py-3 px-4 font-medium w-16" style={{ color: 'var(--text-secondary)' }}>Chain</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt) => (
                  <tr key={evt.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="py-2.5 px-4 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {formatDateTime(evt.timestamp)}
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                        style={{
                          backgroundColor: 'var(--bg-surface-sunken)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {eventTypeLabel(evt.eventType)}
                      </span>
                    </td>
                    <td className="py-2.5 px-4" style={{ color: 'var(--text-primary)' }}>
                      {evt.userName}
                    </td>
                    <td className="py-2.5 px-4 max-w-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                      {evt.description}
                    </td>
                    <td className="py-2.5 px-4">
                      {evt.hash && <HashDisplay hash={evt.hash} truncate copyable />}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {evt.chainValid ? (
                        <Check className="w-4 h-4 mx-auto" style={{ color: 'var(--status-success)' }} />
                      ) : (
                        <X className="w-4 h-4 mx-auto" style={{ color: 'var(--status-error)' }} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
