'use client';

import { useState, useMemo, useCallback, Fragment } from 'react';
import { usePortfolioEntities, usePortfolioSummary } from '@/lib/queries/portfolio';
import { usePortfolioMetrics } from '@/lib/queries/portfolio-alerts';
import type { PortfolioCompany } from '@/lib/types/portfolio';
import { cn } from '@/lib/utils';
import { sumMoneyStrings } from '@/lib/money';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Building2,
  ArrowRightLeft,
  Globe,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Quarter = { label: string; value: string };

type StatementTab = 'income' | 'balance' | 'cashflow' | 'equity';

interface ConsolidatedLine {
  id: string;
  lineItemName: string;
  sectionName: string;
  amount: string;
  isSubtotal: boolean;
  isGrandTotal: boolean;
  indentLevel: number;
  perEntity: { entityId: string; entityName: string; amount: string }[];
}

interface EliminationRow {
  id: string;
  entityA: string;
  accountA: string;
  amountA: string;
  entityB: string;
  accountB: string;
  amountB: string;
  matched: boolean;
  confirmed: boolean;
}

interface FxRow {
  entityId: string;
  entityName: string;
  functionalCurrency: string;
  spotRate: string;
  averageRate: string;
  ctaAmount: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildQuarters(): Quarter[] {
  const now = new Date();
  const year = now.getFullYear();
  const quarters: Quarter[] = [];
  for (let y = year - 1; y <= year; y++) {
    for (let q = 1; q <= 4; q++) {
      quarters.push({ label: `Q${q} ${y}`, value: `${y}-Q${q}` });
    }
  }
  return quarters;
}

function isCertifiedEntity(entity: PortfolioCompany): boolean {
  return (
    entity.currentState === 'CERTIFIED' ||
    entity.currentState === 'LOCKED' ||
    entity.dataSource === 'certified' ||
    entity.dataSource === 'locked'
  );
}

function buildConsolidatedLines(
  entities: PortfolioCompany[],
): Record<StatementTab, ConsolidatedLine[]> {
  // Build placeholder lines from available financial data
  const incomeLines: ConsolidatedLine[] = [
    {
      id: 'is-revenue',
      lineItemName: 'Revenue',
      sectionName: 'Revenue',
      amount: sumMoneyStrings(entities.map((e) => e.revenue)),
      isSubtotal: false,
      isGrandTotal: false,
      indentLevel: 0,
      perEntity: entities.map((e) => ({
        entityId: e.id,
        entityName: e.name,
        amount: e.revenue ?? '0',
      })),
    },
    {
      id: 'is-gross-profit',
      lineItemName: 'Gross Profit',
      sectionName: 'Revenue',
      amount: sumMoneyStrings(entities.map((e) => e.financials?.grossProfit)),
      isSubtotal: true,
      isGrandTotal: false,
      indentLevel: 0,
      perEntity: entities.map((e) => ({
        entityId: e.id,
        entityName: e.name,
        amount: e.financials?.grossProfit ?? '0',
      })),
    },
    {
      id: 'is-operating-income',
      lineItemName: 'Operating Income',
      sectionName: 'Operating Expenses',
      amount: sumMoneyStrings(entities.map((e) => e.financials?.operatingIncome)),
      isSubtotal: true,
      isGrandTotal: false,
      indentLevel: 0,
      perEntity: entities.map((e) => ({
        entityId: e.id,
        entityName: e.name,
        amount: e.financials?.operatingIncome ?? '0',
      })),
    },
    {
      id: 'is-ebitda',
      lineItemName: 'EBITDA',
      sectionName: 'Operating Expenses',
      amount: sumMoneyStrings(entities.map((e) => e.financials?.ebitda)),
      isSubtotal: true,
      isGrandTotal: false,
      indentLevel: 0,
      perEntity: entities.map((e) => ({
        entityId: e.id,
        entityName: e.name,
        amount: e.financials?.ebitda ?? '0',
      })),
    },
    {
      id: 'is-net-income',
      lineItemName: 'Net Income',
      sectionName: 'Net Income',
      amount: sumMoneyStrings(entities.map((e) => e.netIncome)),
      isSubtotal: false,
      isGrandTotal: true,
      indentLevel: 0,
      perEntity: entities.map((e) => ({
        entityId: e.id,
        entityName: e.name,
        amount: e.netIncome ?? '0',
      })),
    },
  ];

  const balanceLines: ConsolidatedLine[] = [
    {
      id: 'bs-total-assets',
      lineItemName: 'Total Assets',
      sectionName: 'Assets',
      amount: sumMoneyStrings(entities.map((e) => e.financials?.totalAssets)),
      isSubtotal: false,
      isGrandTotal: true,
      indentLevel: 0,
      perEntity: entities.map((e) => ({
        entityId: e.id,
        entityName: e.name,
        amount: e.financials?.totalAssets ?? '0',
      })),
    },
    {
      id: 'bs-total-liabilities',
      lineItemName: 'Total Liabilities',
      sectionName: 'Liabilities',
      amount: sumMoneyStrings(entities.map((e) => e.financials?.totalLiabilities)),
      isSubtotal: false,
      isGrandTotal: true,
      indentLevel: 0,
      perEntity: entities.map((e) => ({
        entityId: e.id,
        entityName: e.name,
        amount: e.financials?.totalLiabilities ?? '0',
      })),
    },
    {
      id: 'bs-total-equity',
      lineItemName: 'Total Equity',
      sectionName: 'Equity',
      amount: sumMoneyStrings(entities.map((e) => e.financials?.totalEquity)),
      isSubtotal: false,
      isGrandTotal: true,
      indentLevel: 0,
      perEntity: entities.map((e) => ({
        entityId: e.id,
        entityName: e.name,
        amount: e.financials?.totalEquity ?? '0',
      })),
    },
  ];

  const cashFlowLines: ConsolidatedLine[] = [
    {
      id: 'cf-cash-position',
      lineItemName: 'Cash and Cash Equivalents',
      sectionName: 'Cash Position',
      amount: sumMoneyStrings(entities.map((e) => e.financials?.cashPosition)),
      isSubtotal: false,
      isGrandTotal: true,
      indentLevel: 0,
      perEntity: entities.map((e) => ({
        entityId: e.id,
        entityName: e.name,
        amount: e.financials?.cashPosition ?? '0',
      })),
    },
  ];

  const equityLines: ConsolidatedLine[] = [
    {
      id: 'eq-total-equity',
      lineItemName: 'Total Stockholders\' Equity',
      sectionName: 'Equity',
      amount: sumMoneyStrings(entities.map((e) => e.financials?.totalEquity)),
      isSubtotal: false,
      isGrandTotal: true,
      indentLevel: 0,
      perEntity: entities.map((e) => ({
        entityId: e.id,
        entityName: e.name,
        amount: e.financials?.totalEquity ?? '0',
      })),
    },
  ];

  return {
    income: incomeLines,
    balance: balanceLines,
    cashflow: cashFlowLines,
    equity: equityLines,
  };
}

// ---------------------------------------------------------------------------
// Skeleton Components
// ---------------------------------------------------------------------------

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="py-3 px-4">
          <div
            className="h-4 rounded animate-pulse"
            style={{ background: 'var(--bg-surface-sunken)', width: i === 0 ? '60%' : '40%' }}
          />
        </td>
      ))}
    </tr>
  );
}

function SkeletonCard() {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
      }}
    >
      <div
        className="h-3 w-20 rounded animate-pulse mb-2"
        style={{ background: 'var(--bg-surface-sunken)' }}
      />
      <div
        className="h-6 w-28 rounded animate-pulse"
        style={{ background: 'var(--bg-surface-sunken)' }}
      />
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-10 rounded animate-pulse"
          style={{ background: 'var(--bg-surface-sunken)' }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

function EntitySidebar({
  entities,
  selectedIds,
  onToggle,
  onSelectAllCertified,
  allCertifiedSelected,
}: {
  entities: PortfolioCompany[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAllCertified: () => void;
  allCertifiedSelected: boolean;
}) {
  const certifiedCount = entities.filter(isCertifiedEntity).length;
  const selectedCount = selectedIds.size;

  return (
    <aside
      className="w-[280px] shrink-0 overflow-y-auto"
      style={{
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-default)',
      }}
    >
      <div className="p-4 space-y-3">
        <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          Entities
        </h2>

        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={allCertifiedSelected}
            onChange={onSelectAllCertified}
            className="rounded"
            style={{ accentColor: 'var(--interactive-primary)' }}
          />
          <span style={{ color: 'var(--text-primary)' }}>Select All Certified</span>
        </label>

        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {selectedCount} of {entities.length} selected
        </p>

        <div className="space-y-1">
          {entities.map((entity) => {
            const certified = isCertifiedEntity(entity);
            const selected = selectedIds.has(entity.id);

            return (
              <div
                key={entity.id}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  certified ? 'cursor-pointer' : 'cursor-not-allowed',
                )}
                style={{
                  borderLeft: `3px solid ${certified ? 'var(--status-success)' : 'var(--status-warning)'}`,
                  background: selected ? 'var(--bg-surface-sunken)' : 'transparent',
                }}
                onClick={() => certified && onToggle(entity.id)}
                role="button"
                tabIndex={certified ? 0 : -1}
                aria-disabled={!certified}
                onKeyDown={(e) => {
                  if (certified && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onToggle(entity.id);
                  }
                }}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={!certified}
                  onChange={() => certified && onToggle(entity.id)}
                  className="rounded shrink-0"
                  style={{ accentColor: 'var(--interactive-primary)' }}
                  onClick={(e) => e.stopPropagation()}
                  tabIndex={-1}
                />
                <span
                  className="flex-1 truncate"
                  style={{ color: certified ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
                >
                  {entity.name}
                </span>
                <StatusBadge
                  status={certified ? 'certified' : 'pending'}
                  size="sm"
                  showLabel={false}
                />
              </div>
            );
          })}
        </div>

        {certifiedCount === 0 && entities.length > 0 && (
          <p className="text-xs mt-2" style={{ color: 'var(--status-warning)' }}>
            No entities have been certified yet.
          </p>
        )}
      </div>
    </aside>
  );
}

function CertificationReadinessTable({
  entities,
  selectedIds,
}: {
  entities: PortfolioCompany[];
  selectedIds: Set<string>;
}) {
  const allSelectedCertified = useMemo(() => {
    if (selectedIds.size === 0) return false;
    return Array.from(selectedIds).every((id) => {
      const entity = entities.find((e) => e.id === id);
      return entity && isCertifiedEntity(entity);
    });
  }, [entities, selectedIds]);

  const uncertifiedEntities = entities.filter((e) => !isCertifiedEntity(e));

  if (uncertifiedEntities.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3
        className="text-lg font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        Certification Readiness
      </h3>

      {!allSelectedCertified && (
        <div
          className="flex items-center gap-2 rounded-md px-4 py-3 text-sm"
          style={{
            background: 'var(--status-warning-bg)',
            border: '1px solid var(--status-warning-border)',
            color: 'var(--status-warning)',
          }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Cannot generate consolidated until all selected entities are certified
        </div>
      )}

      <div
        className="rounded-lg overflow-hidden"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--border-table-header)',
                background: 'var(--bg-surface-sunken)',
              }}
            >
              <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Entity</th>
              <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Period</th>
              <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
              <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Certified Date</th>
              <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Certifier</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((entity) => {
              const certified = isCertifiedEntity(entity);
              return (
                <tr
                  key={entity.id}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    borderLeft: `4px solid ${certified ? 'var(--status-success)' : 'var(--status-warning)'}`,
                    background: certified ? 'transparent' : 'var(--status-warning-bg)',
                  }}
                >
                  <td className="py-2.5 px-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {entity.name}
                  </td>
                  <td className="py-2.5 px-4" style={{ color: 'var(--text-secondary)' }}>
                    {entity.currentPeriod || '\u2014'}
                  </td>
                  <td className="py-2.5 px-4">
                    <StatusBadge
                      status={certified ? 'certified' : 'pending'}
                      size="sm"
                    />
                  </td>
                  <td className="py-2.5 px-4" style={{ color: 'var(--text-secondary)' }}>
                    {certified ? entity.lastActivity ?? '\u2014' : '\u2014'}
                  </td>
                  <td className="py-2.5 px-4" style={{ color: 'var(--text-secondary)' }}>
                    {certified ? entity.reviewer ?? entity.preparer ?? '\u2014' : '\u2014'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ConsolidatedStatements({
  selectedEntities,
  allCertified,
}: {
  selectedEntities: PortfolioCompany[];
  allCertified: boolean;
}) {
  const [activeTab, setActiveTab] = useState<StatementTab>('income');
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());
  const [generated, setGenerated] = useState(false);

  const statements = useMemo(
    () => buildConsolidatedLines(selectedEntities),
    [selectedEntities],
  );

  const tabConfig: { key: StatementTab; label: string }[] = [
    { key: 'income', label: 'Consolidated Income Statement' },
    { key: 'balance', label: 'Consolidated Balance Sheet' },
    { key: 'cashflow', label: 'Consolidated Cash Flow' },
    { key: 'equity', label: 'Consolidated Statement of Equity' },
  ];

  const toggleLine = useCallback((lineId: string) => {
    setExpandedLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  }, []);

  const handleGenerate = useCallback(() => {
    console.log('Generate Consolidated Statements', {
      entities: selectedEntities.map((e) => e.id),
    });
    setGenerated(true);
  }, [selectedEntities]);

  const lines = statements[activeTab];

  return (
    <section className="space-y-4">
      <h3
        className="text-lg font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        Consolidated Financial Statements
      </h3>

      <button
        type="button"
        disabled={!allCertified || selectedEntities.length === 0}
        onClick={handleGenerate}
        className="px-5 py-2.5 rounded-md text-sm font-medium transition-opacity"
        style={{
          background: 'var(--interactive-primary)',
          color: 'white',
          opacity: !allCertified || selectedEntities.length === 0 ? 0.5 : 1,
          cursor: !allCertified || selectedEntities.length === 0 ? 'not-allowed' : 'pointer',
        }}
      >
        Generate Consolidated Statements
      </button>

      {generated && (
        <>
          {/* Tabs */}
          <div
            className="flex gap-0 overflow-x-auto"
            role="tablist"
            aria-label="Financial statement tabs"
            style={{ borderBottom: '2px solid var(--border-default)' }}
          >
            {tabConfig.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className="px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors"
                style={{
                  color: activeTab === tab.key ? 'var(--interactive-primary)' : 'var(--text-secondary)',
                  borderBottom: activeTab === tab.key ? '2px solid var(--interactive-primary)' : '2px solid transparent',
                  marginBottom: '-2px',
                  background: 'transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Statement Table */}
          <div
            className="rounded-lg overflow-hidden"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
            }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{
                    height: '44px',
                    borderBottom: '1px solid var(--border-table-header)',
                    background: 'var(--bg-surface-sunken)',
                  }}
                >
                  <th className="text-left px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Line Item
                  </th>
                  <th className="text-right px-4 font-medium w-[180px]" style={{ color: 'var(--text-secondary)' }}>
                    Consolidated Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const isExpanded = expandedLines.has(line.id);
                  return (
                    <Fragment key={line.id}>
                      <tr
                        className="cursor-pointer transition-colors"
                        onClick={() => toggleLine(line.id)}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--bg-surface-sunken)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '';
                        }}
                      >
                        <td className="py-2.5 px-4">
                          <span className="flex items-center gap-1.5">
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                            )}
                            <span
                              style={{
                                paddingLeft: `${line.indentLevel * 16}px`,
                                color: 'var(--text-primary)',
                                fontWeight: line.isSubtotal || line.isGrandTotal ? 700 : 400,
                              }}
                            >
                              {line.lineItemName}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          <MoneyCell
                            value={line.amount}
                            variant={line.isGrandTotal ? 'grand-total' : line.isSubtotal ? 'subtotal' : 'line-item'}
                            showCurrency
                          />
                        </td>
                      </tr>
                      {isExpanded &&
                        line.perEntity.map((pe) => (
                          <tr
                            key={`${line.id}-${pe.entityId}`}
                            style={{
                              borderBottom: '1px solid var(--border-subtle)',
                              background: 'var(--bg-surface-sunken)',
                            }}
                          >
                            <td
                              className="py-2 px-4 text-xs"
                              style={{
                                paddingLeft: '48px',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {pe.entityName}
                            </td>
                            <td className="py-2 px-4">
                              <MoneyCell value={pe.amount} variant="line-item" showCurrency />
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function IntercompanyEliminations({
  entities,
}: {
  entities: PortfolioCompany[];
}) {
  // Mock intercompany elimination data structured for the UI
  const [eliminations, setEliminations] = useState<EliminationRow[]>(() => {
    if (entities.length < 2) return [];
    return [
      {
        id: 'elim-1',
        entityA: entities[0]?.name ?? 'Entity A',
        accountA: 'Intercompany Receivable',
        amountA: '150000.00',
        entityB: entities[1]?.name ?? 'Entity B',
        accountB: 'Intercompany Payable',
        amountB: '150000.00',
        matched: true,
        confirmed: false,
      },
      {
        id: 'elim-2',
        entityA: entities[0]?.name ?? 'Entity A',
        accountA: 'Management Fee Income',
        amountA: '50000.00',
        entityB: entities[1]?.name ?? 'Entity B',
        accountB: 'Management Fee Expense',
        amountB: '48500.00',
        matched: false,
        confirmed: false,
      },
    ];
  });

  const [showManualForm, setShowManualForm] = useState<string | null>(null);

  const handleConfirm = useCallback((id: string) => {
    console.log('Confirm elimination:', id);
    setEliminations((prev) =>
      prev.map((e) => (e.id === id ? { ...e, confirmed: true } : e)),
    );
  }, []);

  const handleConfirmAllMatched = useCallback(() => {
    console.log('Confirm all matched eliminations');
    setEliminations((prev) =>
      prev.map((e) => (e.matched ? { ...e, confirmed: true } : e)),
    );
  }, []);

  const matchedCount = eliminations.filter((e) => e.matched).length;
  const totalEliminations = sumMoneyStrings(eliminations.map((e) => e.amountA));

  if (entities.length < 2) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3
          className="text-lg font-semibold flex items-center gap-2"
          style={{ color: 'var(--text-primary)' }}
        >
          <ArrowRightLeft className="w-5 h-5" />
          Intercompany Eliminations
        </h3>
        {matchedCount > 0 && (
          <button
            type="button"
            onClick={handleConfirmAllMatched}
            className="px-3 py-1.5 rounded-md text-sm font-medium"
            style={{
              background: 'var(--status-success-bg)',
              color: 'var(--status-success)',
              border: '1px solid var(--status-success-border)',
            }}
          >
            <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
            Confirm All Matched
          </button>
        )}
      </div>

      <div
        className="rounded-lg overflow-hidden"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border-table-header)',
                  background: 'var(--bg-surface-sunken)',
                }}
              >
                <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Entity A</th>
                <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Account</th>
                <th className="text-right py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Amount</th>
                <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Entity B</th>
                <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Account</th>
                <th className="text-right py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Amount</th>
                <th className="text-center py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
                <th className="text-center py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {eliminations.map((row) => (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: row.matched
                      ? 'var(--status-success-bg)'
                      : 'var(--status-warning-bg)',
                  }}
                >
                  <td className="py-2.5 px-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {row.entityA}
                  </td>
                  <td className="py-2.5 px-4" style={{ color: 'var(--text-secondary)' }}>
                    {row.accountA}
                  </td>
                  <td className="py-2.5 px-4">
                    <MoneyCell value={row.amountA} showCurrency />
                  </td>
                  <td className="py-2.5 px-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {row.entityB}
                  </td>
                  <td className="py-2.5 px-4" style={{ color: 'var(--text-secondary)' }}>
                    {row.accountB}
                  </td>
                  <td className="py-2.5 px-4">
                    <MoneyCell value={row.amountB} showCurrency />
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {row.confirmed ? (
                      <StatusBadge status="complete" size="sm" label="Confirmed" />
                    ) : row.matched ? (
                      <StatusBadge status="certified" size="sm" label="Matched" />
                    ) : (
                      <StatusBadge status="pending" size="sm" label="Unmatched" />
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {row.confirmed ? (
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Done</span>
                    ) : row.matched ? (
                      <button
                        type="button"
                        onClick={() => handleConfirm(row.id)}
                        className="px-2.5 py-1 rounded text-xs font-medium"
                        style={{
                          background: 'var(--interactive-primary)',
                          color: 'white',
                        }}
                      >
                        Confirm Elimination
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          console.log('Manual elimination:', row.id);
                          setShowManualForm(showManualForm === row.id ? null : row.id);
                        }}
                        className="px-2.5 py-1 rounded text-xs font-medium"
                        style={{
                          background: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-default)',
                        }}
                      >
                        Manual Elimination
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr
                style={{
                  borderTop: '2px solid var(--border-default)',
                  background: 'var(--bg-surface-sunken)',
                }}
              >
                <td colSpan={2} className="py-3 px-4 font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Total Eliminations
                </td>
                <td className="py-3 px-4">
                  <MoneyCell value={totalEliminations} variant="total" showCurrency />
                </td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}

function FxTranslation({
  entities,
}: {
  entities: PortfolioCompany[];
}) {
  // Only show if entities have different currencies. Since PortfolioCompany
  // does not include a currency field, we will not render this section unless
  // we detect multi-currency data in the future. For now, render a placeholder
  // if there are at least 2 entities.
  const [fxRows, setFxRows] = useState<FxRow[]>(() =>
    entities.map((e) => ({
      entityId: e.id,
      entityName: e.name,
      functionalCurrency: 'USD',
      spotRate: '1.0000',
      averageRate: '1.0000',
      ctaAmount: '0.00',
    })),
  );

  // Check if all same currency - if yes, don't show
  const currencies = new Set(fxRows.map((r) => r.functionalCurrency));
  if (currencies.size <= 1 && currencies.has('USD')) return null;

  return (
    <section className="space-y-3">
      <h3
        className="text-lg font-semibold flex items-center gap-2"
        style={{ color: 'var(--text-primary)' }}
      >
        <Globe className="w-5 h-5" />
        FX Translation
      </h3>

      <div
        className="rounded-lg overflow-hidden"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--border-table-header)',
                background: 'var(--bg-surface-sunken)',
              }}
            >
              <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Entity</th>
              <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Functional Currency</th>
              <th className="text-right py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Spot Rate</th>
              <th className="text-right py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Average Rate</th>
              <th className="text-right py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>CTA Amount</th>
            </tr>
          </thead>
          <tbody>
            {fxRows.map((row, idx) => (
              <tr
                key={row.entityId}
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <td className="py-2.5 px-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                  {row.entityName}
                </td>
                <td className="py-2.5 px-4" style={{ color: 'var(--text-secondary)' }}>
                  {row.functionalCurrency}
                </td>
                <td className="py-2.5 px-4 text-right">
                  <input
                    type="text"
                    value={row.spotRate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFxRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, spotRate: val } : r)),
                      );
                    }}
                    className="w-24 text-right rounded px-2 py-1 text-sm font-mono"
                    style={{
                      background: 'var(--bg-surface-sunken)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </td>
                <td className="py-2.5 px-4 text-right">
                  <input
                    type="text"
                    value={row.averageRate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFxRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, averageRate: val } : r)),
                      );
                    }}
                    className="w-24 text-right rounded px-2 py-1 text-sm font-mono"
                    style={{
                      background: 'var(--bg-surface-sunken)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </td>
                <td className="py-2.5 px-4">
                  <MoneyCell value={row.ctaAmount} showCurrency />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ExportSection({
  selectedEntities,
  allCertified,
}: {
  selectedEntities: PortfolioCompany[];
  allCertified: boolean;
}) {
  const [format, setFormat] = useState<'excel' | 'pdf'>('excel');
  const [scheduleExport, setScheduleExport] = useState(false);

  const handleExport = useCallback(() => {
    console.log('Export Consolidated Package', {
      format,
      entities: selectedEntities.map((e) => e.id),
      scheduled: scheduleExport,
    });
  }, [format, selectedEntities, scheduleExport]);

  return (
    <section className="space-y-4">
      <h3
        className="text-lg font-semibold flex items-center gap-2"
        style={{ color: 'var(--text-primary)' }}
      >
        <Download className="w-5 h-5" />
        Export for LP Reporting
      </h3>

      <div
        className="rounded-lg p-5 space-y-4"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        {/* Format Options */}
        <div className="space-y-2">
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Export Format
          </p>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="export-format"
                value="excel"
                checked={format === 'excel'}
                onChange={() => setFormat('excel')}
                style={{ accentColor: 'var(--interactive-primary)' }}
              />
              <FileSpreadsheet className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              <span style={{ color: 'var(--text-primary)' }}>Excel Workbook</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="export-format"
                value="pdf"
                checked={format === 'pdf'}
                onChange={() => setFormat('pdf')}
                style={{ accentColor: 'var(--interactive-primary)' }}
              />
              <FileText className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              <span style={{ color: 'var(--text-primary)' }}>PDF Report</span>
            </label>
          </div>
        </div>

        {/* Format details */}
        <div
          className="rounded-md px-4 py-3 text-xs"
          style={{
            background: 'var(--bg-surface-sunken)',
            color: 'var(--text-secondary)',
          }}
        >
          {format === 'excel' ? (
            <p>
              Excel workbook includes sheets for: Income Statement, Balance Sheet, Cash Flow,
              Entity Detail, Elimination Detail, and Certification Summary.
            </p>
          ) : (
            <p>
              PDF report includes formatted financial statements with cover page,
              entity-level detail, and certification summary.
            </p>
          )}
        </div>

        {/* Schedule toggle */}
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={scheduleExport}
            onChange={(e) => setScheduleExport(e.target.checked)}
            className="rounded"
            style={{ accentColor: 'var(--interactive-primary)' }}
          />
          <span style={{ color: 'var(--text-primary)' }}>Schedule Quarterly Export</span>
        </label>

        {/* Export button */}
        <button
          type="button"
          onClick={handleExport}
          disabled={!allCertified || selectedEntities.length === 0}
          className="px-5 py-2.5 rounded-md text-sm font-medium transition-opacity flex items-center gap-2"
          style={{
            background: 'var(--interactive-primary)',
            color: 'white',
            opacity: !allCertified || selectedEntities.length === 0 ? 0.5 : 1,
            cursor: !allCertified || selectedEntities.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          <Download className="w-4 h-4" />
          Export Consolidated Package
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ConsolidatedPage() {
  const { data: entities = [], isLoading: entitiesLoading } = usePortfolioEntities();
  const { data: summary, isLoading: summaryLoading } = usePortfolioSummary();
  const { data: metrics } = usePortfolioMetrics();

  const quarters = useMemo(() => buildQuarters(), []);
  const [selectedQuarter, setSelectedQuarter] = useState(() => {
    const q = buildQuarters();
    // Default to current quarter
    const now = new Date();
    const currentQ = Math.ceil((now.getMonth() + 1) / 3);
    const target = `${now.getFullYear()}-Q${currentQ}`;
    return q.find((x) => x.value === target)?.value ?? q[q.length - 1]?.value ?? '';
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isLoading = entitiesLoading || summaryLoading;

  // Auto-select all certified entities on first load
  const certifiedEntities = useMemo(
    () => entities.filter(isCertifiedEntity),
    [entities],
  );

  // Initialize selection with certified entities
  useMemo(() => {
    if (entities.length > 0 && selectedIds.size === 0 && certifiedEntities.length > 0) {
      setSelectedIds(new Set(certifiedEntities.map((e) => e.id)));
    }
  }, [entities.length, certifiedEntities.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedEntities = useMemo(
    () => entities.filter((e) => selectedIds.has(e.id)),
    [entities, selectedIds],
  );

  const allSelectedCertified = useMemo(() => {
    if (selectedIds.size === 0) return false;
    return selectedEntities.every(isCertifiedEntity);
  }, [selectedEntities, selectedIds.size]);

  const certifiedCount = certifiedEntities.length;
  const totalCount = entities.length;
  const progressPercent = totalCount > 0 ? (certifiedCount / totalCount) * 100 : 0;
  const allCertified = certifiedCount === totalCount && totalCount > 0;

  const uncertifiedNames = entities
    .filter((e) => !isCertifiedEntity(e))
    .map((e) => e.name);

  const handleToggleEntity = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAllCertified = useCallback(() => {
    setSelectedIds((prev) => {
      const certIds = new Set(certifiedEntities.map((e) => e.id));
      const allAlreadySelected = certifiedEntities.every((e) => prev.has(e.id));
      if (allAlreadySelected) {
        // Deselect all
        return new Set();
      }
      return certIds;
    });
  }, [certifiedEntities]);

  const allCertifiedSelected = useMemo(
    () =>
      certifiedEntities.length > 0 &&
      certifiedEntities.every((e) => selectedIds.has(e.id)),
    [certifiedEntities, selectedIds],
  );

  const selectedQuarterLabel = quarters.find((q) => q.value === selectedQuarter)?.label ?? selectedQuarter;

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex h-full" style={{ background: 'var(--bg-base)' }}>
        {/* Sidebar skeleton */}
        <div
          className="w-[280px] shrink-0 p-4"
          style={{
            background: 'var(--bg-surface)',
            borderRight: '1px solid var(--border-default)',
          }}
        >
          <SidebarSkeleton />
        </div>
        {/* Main skeleton */}
        <div className="flex-1 p-8 space-y-6">
          <div
            className="h-8 w-64 rounded animate-pulse"
            style={{ background: 'var(--bg-surface-sunken)' }}
          />
          <div className="grid grid-cols-3 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div
            className="rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--border-default)' }}
          >
            <table className="w-full">
              <tbody>
                <SkeletonRow cols={5} />
                <SkeletonRow cols={5} />
                <SkeletonRow cols={5} />
                <SkeletonRow cols={5} />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty: no entities at all
  // ---------------------------------------------------------------------------

  if (entities.length === 0) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <h1
          className="text-2xl font-display mb-6"
          style={{ color: 'var(--text-primary)' }}
        >
          Portfolio Consolidation
        </h1>
        <EmptyState
          icon={Building2}
          title="Add portfolio companies to begin consolidation"
          description="Once you have portfolio entities with close sessions, you can consolidate their certified financial data for LP reporting."
          variant="first-time"
          actionLabel="Go to Portfolio"
          ctaHref="/portfolio"
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty: no certified entities
  // ---------------------------------------------------------------------------

  if (certifiedCount === 0) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <h1
          className="text-2xl font-display mb-6"
          style={{ color: 'var(--text-primary)' }}
        >
          Portfolio Consolidation
        </h1>
        <EmptyState
          icon={ShieldCheck}
          title="No entities have been certified for this period"
          description="Consolidation requires certified data. Complete the close process and certify entity financials before generating consolidated statements."
          variant="prerequisite-missing"
        />
        {uncertifiedNames.length > 0 && (
          <div
            className="mt-4 rounded-lg p-4"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
            }}
          >
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Waiting for: {uncertifiedNames.join(', ')}
            </p>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: 'var(--bg-surface-sunken)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${progressPercent}%`,
                  background: 'var(--interactive-primary)',
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main Layout
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full" style={{ background: 'var(--bg-base)' }}>
      {/* Left In-Page Sidebar */}
      <EntitySidebar
        entities={entities}
        selectedIds={selectedIds}
        onToggle={handleToggleEntity}
        onSelectAllCertified={handleSelectAllCertified}
        allCertifiedSelected={allCertifiedSelected}
      />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1
            className="text-2xl font-display"
            style={{ color: 'var(--text-primary)' }}
          >
            Portfolio Consolidation
          </h1>

          {/* Period Selector */}
          <select
            value={selectedQuarter}
            onChange={(e) => setSelectedQuarter(e.target.value)}
            className="rounded-md px-3 py-2 text-sm font-medium"
            style={{
              background: 'var(--bg-surface-sunken)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
            aria-label="Select reporting period"
          >
            {quarters.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {certifiedCount} of {totalCount}
            </span>{' '}
            entities certified for {selectedQuarterLabel}
          </p>
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--bg-surface-sunken)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progressPercent}%`,
                background: allCertified ? 'var(--status-success)' : 'var(--interactive-primary)',
              }}
            />
          </div>
          {!allCertified && uncertifiedNames.length > 0 && (
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Waiting for: {uncertifiedNames.join(', ')}
            </p>
          )}
        </div>

        {/* Section 1: Certification Readiness */}
        <CertificationReadinessTable
          entities={entities}
          selectedIds={selectedIds}
        />

        {/* Section 2: Consolidated Financial Statements */}
        <ConsolidatedStatements
          selectedEntities={selectedEntities}
          allCertified={allSelectedCertified}
        />

        {/* Section 3: Intercompany Eliminations */}
        <IntercompanyEliminations entities={selectedEntities} />

        {/* Section 4: FX Translation (only if multi-currency) */}
        <FxTranslation entities={selectedEntities} />

        {/* Section 5: Export for LP Reporting */}
        <ExportSection
          selectedEntities={selectedEntities}
          allCertified={allSelectedCertified}
        />
      </main>
    </div>
  );
}
