'use client';

import * as React from 'react';
import { DashboardLayout, DashboardSidebarNav } from '@/components/layouts';
import { AgentThoughtStreamProvider, AgentThoughtStream, useAgentThoughtStream } from '@/components/agent';
import { AgentWorkspace, type StatementRow } from '@/components/agent-workspace';
import { FinancialCharts } from '@/components/financial-charts';
import { AuditLogPanel } from '@/components/audit-log-panel';
import { CFODashboard } from '@/components/cfo-dashboard';
import { StrategicSandbox } from '@/components/scenario_planner';
import type { ScenarioKPIs } from '@/lib/api';
import { uploadTrialBalance, runIngestionAgent, setTransactionCategory, confirmStandardInference } from '@/lib/api';
import type {
  QualityCheck,
  DataGap,
  PolicyProposal,
  HITLStatus,
  AgenticQualityAssessment,
  StandardInference,
} from '@/lib/agentic-types';
import {
  AgenticQualityPanel,
  HITLBanner,
  PolicyProposalsPanel,
  StandardConfirmationCard,
} from '@/components/agentic';
import type { CFOFinancialSnapshot } from '@/lib/api';
import { ExportNotificationProvider, useExportNotification } from '@/components/notifications';
import { CelebrationToast } from '@/components/notifications/celebration-toast';
import { FirstRunProvider, SAMPLE_STATEMENT_ROWS } from '@/onboarding';
import type { SmartIngestionExtraction } from '@/components/upload';
import { HeroCommandCenter, inferRouteFromFile } from '@/components/upload';
import { GhostStatementSkeletons, DashboardProcessingSkeletons } from '@/components/dashboard';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

/** Infer statement section from extracted label (CPA path). */
function inferSection(label: string | undefined): StatementRow['section'] {
  if (!label) return 'revenue';
  const l = label.toLowerCase();
  if (l.includes('revenue')) return 'revenue';
  if (l.includes('cogs') || l.includes('cost of')) return 'expenses';
  if (l.includes('net income')) return 'equity';
  if (l.includes('total assets') || l.includes('cash') || l.includes('asset')) return 'assets';
  if (l.includes('liabilit')) return 'liabilities';
  if (l.includes('equity')) return 'equity';
  if (l.includes('expense')) return 'expenses';
  return 'revenue';
}

/** Parse currency string from extraction (e.g. "4,500,000" -> 4500000). */
function parseAmount(value: string): number {
  const n = value.replace(/,/g, '').replace(/\s/g, '');
  const num = parseFloat(n);
  return Number.isFinite(num) ? num : 0;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.\-]/g, '');
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '');
}

function extractTransactionsFromIngestion(
  sheets?: Array<{ name: string; headers: string[]; rowCount: number; rows?: Array<Record<string, unknown> | unknown[]> }>
): Array<{
  date?: string;
  amount: number;
  description?: string;
  counterparty?: string;
  debit?: number;
  credit?: number;
}> {
  if (!sheets) return [];
  const transactions: Array<{
    date?: string;
    amount: number;
    description?: string;
    counterparty?: string;
    debit?: number;
    credit?: number;
  }> = [];
  for (const sheet of sheets) {
    if (!sheet.rows) continue;
    const headers = sheet.headers.map(normalizeKey);
    const idx = (keys: string[]) => headers.findIndex((h) => keys.includes(h));
    const amountIdx = idx(['amount', 'amt', 'value', 'total', 'net']);
    const debitIdx = idx(['debit', 'dr']);
    const creditIdx = idx(['credit', 'cr']);
    const dateIdx = idx(['date', 'transactiondate', 'postingdate']);
    const descIdx = idx(['description', 'memo', 'details', 'narrative']);
    const counterpartyIdx = idx(['payee', 'vendor', 'counterparty', 'merchant', 'name']);

    for (const row of sheet.rows) {
      if (Array.isArray(row)) {
        const debit = debitIdx >= 0 ? parseNumber(row[debitIdx]) ?? undefined : undefined;
        const credit = creditIdx >= 0 ? parseNumber(row[creditIdx]) ?? undefined : undefined;
        const amount =
          amountIdx >= 0
            ? parseNumber(row[amountIdx])
            : debitIdx >= 0 || creditIdx >= 0
              ? (debit ?? 0) - (credit ?? 0)
              : null;
        if (amount === null || amount === 0) continue;
        transactions.push({
          amount,
          date: dateIdx >= 0 ? String(row[dateIdx] ?? '') : undefined,
          description: descIdx >= 0 ? String(row[descIdx] ?? '') : undefined,
          counterparty: counterpartyIdx >= 0 ? String(row[counterpartyIdx] ?? '') : undefined,
          debit,
          credit,
        });
      } else if (row && typeof row === 'object') {
        const record = row as Record<string, unknown>;
        const pick = (keys: string[]) =>
          keys.map((k) => record[Object.keys(record).find((rk) => normalizeKey(rk) === k) ?? '']).find((v) => v !== undefined);
        const debit = parseNumber(pick(['debit', 'dr'])) ?? undefined;
        const credit = parseNumber(pick(['credit', 'cr'])) ?? undefined;
        const amount =
          parseNumber(pick(['amount', 'amt', 'value', 'total', 'net'])) ??
          ((debit ?? 0) - (credit ?? 0));
        if (!amount || amount === 0) continue;
        const date = pick(['date', 'transactiondate', 'postingdate']);
        const description = pick(['description', 'memo', 'details', 'narrative']);
        const counterparty = pick(['payee', 'vendor', 'counterparty', 'merchant', 'name']);
        transactions.push({
          amount,
          date: date ? String(date) : undefined,
          description: description ? String(description) : undefined,
          counterparty: counterparty ? String(counterparty) : undefined,
          debit,
          credit,
        });
      }
    }
  }
  return transactions.slice(0, 2000);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function CashFlowBlock({
  title,
  lines,
  entityId,
}: {
  title: string;
  lines: Array<{ label: string; amount: number }>;
  entityId?: string;
}) {
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return (
    <div className="rounded-md border border-border bg-muted/10 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-sm font-semibold">{formatCurrency(total)}</span>
      </div>
      {lines.length === 0 ? (
        <p className="text-xs text-muted-foreground">No line items detected.</p>
      ) : (
        <div className="space-y-1 text-xs">
          {lines.slice(0, 6).map((line, idx) => (
            <div key={`${line.label}-${idx}`} className="flex justify-between gap-2">
              <span className="text-muted-foreground truncate">{line.label}</span>
              <div className="flex items-center gap-2">
                {entityId && (
                  <>
                    <input
                      list="cashflow-category"
                      placeholder="Override..."
                      className="w-24 rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                      onBlur={async (e) => {
                        const value = e.target.value.trim().toLowerCase();
                        if (value === 'operating' || value === 'investing' || value === 'financing') {
                          await setTransactionCategory({
                            entityId,
                            description: line.label,
                            category: value,
                          });
                          e.target.value = '';
                        }
                      }}
                    />
                    <datalist id="cashflow-category">
                      <option value="operating" />
                      <option value="investing" />
                      <option value="financing" />
                    </datalist>
                  </>
                )}
                <span className="font-medium">{formatCurrency(line.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Convert Supervisor/CPA extraction to statement rows for dashboard. */
function extractionToStatementRows(ext: SmartIngestionExtraction): StatementRow[] {
  const rows: StatementRow[] = [];
  for (const page of ext.pages ?? []) {
    for (const box of page.boxes ?? []) {
      rows.push({
        label: box.label ?? 'Item',
        amount: parseAmount(box.value),
        section: inferSection(box.label),
      });
    }
  }
  return rows;
}

/** Map trial-balance API response to StatementRow[]. */
function mapTrialBalanceToRows(res: {
  balanceSheet?: {
    assets?: { label: string; amount: number }[];
    liabilities?: { label: string; amount: number }[];
    equity?: { label: string; amount: number }[];
  };
  profitAndLoss?: {
    revenue?: { label: string; amount: number }[];
    expenses?: { label: string; amount: number }[];
  };
}): StatementRow[] {
  const rows: StatementRow[] = [];
  const bs = res?.balanceSheet;
  if (bs?.assets?.length) {
    bs.assets.forEach((a) => rows.push({ label: a.label, amount: a.amount, section: 'assets' }));
  }
  if (bs?.liabilities?.length) {
    bs.liabilities.forEach((l) =>
      rows.push({ label: l.label, amount: l.amount, section: 'liabilities' })
    );
  }
  if (bs?.equity?.length) {
    bs.equity.forEach((e) => rows.push({ label: e.label, amount: e.amount, section: 'equity' }));
  }
  const pl = res?.profitAndLoss;
  if (pl?.revenue?.length) {
    pl.revenue.forEach((r) => rows.push({ label: r.label, amount: r.amount, section: 'revenue' }));
  }
  if (pl?.expenses?.length) {
    pl.expenses.forEach((e) =>
      rows.push({ label: e.label, amount: e.amount, section: 'expenses' })
    );
  }
  return rows;
}

/** Mock PDF pipeline: Supervisor routes to CPA; returns extraction → statement rows. */
async function runMockPdfPipeline(file: File): Promise<StatementRow[]> {
  const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const mockExt: SmartIngestionExtraction = {
    documentId: docId,
    fileName: file.name,
    pages: [
      {
        pageIndex: 0,
        pageWidth: 612,
        pageHeight: 792,
        boxes: [
          { id: 'box-1', value: '4,500,000', x: 65, y: 18, width: 14, height: 3, label: 'Revenue' },
          { id: 'box-2', value: '1,350,000', x: 65, y: 24, width: 14, height: 3, label: 'COGS' },
          { id: 'box-3', value: '675,000', x: 65, y: 32, width: 12, height: 3, label: 'Net Income' },
          { id: 'box-4', value: '8,000,000', x: 65, y: 42, width: 14, height: 3, label: 'Total Assets' },
          { id: 'box-5', value: '1,200,000', x: 65, y: 48, width: 14, height: 3, label: 'Cash' },
        ],
      },
    ],
  };
  await new Promise((r) => setTimeout(r, 1600));
  return extractionToStatementRows(mockExt);
}

function snapshotFromStatementRows(rows: StatementRow[]): CFOFinancialSnapshot | null {
  if (rows.length === 0) return null;
  let revenue = 0,
    expenses = 0,
    totalAssets = 0,
    totalLiabilities = 0,
    totalEquity = 0,
    cash = 0,
    currentAssets = 0,
    currentLiabilities = 0,
    inventory = 0,
    ar = 0,
    ap = 0,
    cogs = 0;
  for (const r of rows) {
    const amt = r.amount ?? 0;
    if (r.section === 'revenue') revenue += amt;
    if (r.section === 'expenses') expenses += amt;
    if (r.section === 'assets') totalAssets += amt;
    if (r.section === 'liabilities') totalLiabilities += amt;
    if (r.section === 'equity') totalEquity += amt;
    if (r.label?.toLowerCase().includes('cash')) cash += amt;
    if (r.label?.toLowerCase().includes('receivable')) ar += amt;
    if (r.label?.toLowerCase().includes('payable')) ap += amt;
    if (r.label?.toLowerCase().includes('inventory')) inventory += amt;
    if (r.label?.toLowerCase().includes('cogs') || r.label?.toLowerCase().includes('cost of')) cogs += amt;
  }
  if (totalAssets === 0 && totalLiabilities === 0 && totalEquity === 0) return null;
  const netIncome = revenue - expenses;
  const operatingExpenses = expenses - (cogs || 0);
  const operatingIncome = revenue - (cogs || 0) - operatingExpenses;
  return {
    revenue,
    costOfGoodsSold: cogs || undefined,
    operatingExpenses: operatingExpenses || undefined,
    operatingIncome,
    netIncome,
    totalAssets,
    totalLiabilities,
    totalEquity,
    cash: cash || 0,
    currentAssets: currentAssets || totalAssets * 0.3,
    currentLiabilities: currentLiabilities || totalLiabilities * 0.4,
    inventory: inventory || undefined,
    accountsReceivable: ar || undefined,
    accountsPayable: ap || undefined,
    periodLabel: 'Current',
  };
}

type DashboardStatus = 'idle' | 'processing' | 'completed';

type CashFlowStatement = {
  operating: Array<{ label: string; amount: number }>;
  investing: Array<{ label: string; amount: number }>;
  financing: Array<{ label: string; amount: number }>;
  netChangeInCash: number;
  beginningCash?: number;
  endingCash?: number;
  estimated?: boolean;
  note?: string;
};

type EquityChangesStatement = {
  openingEquity?: number;
  changes: Array<{ label: string; amount: number }>;
  closingEquity?: number;
  estimated?: boolean;
  note?: string;
};

type NotesAndPolicies = {
  standard: string;
  notes: Array<{ title: string; content: string; citation?: string }>;
};

function DashboardContent() {
  const [statementRows, setStatementRows] = React.useState<StatementRow[]>([]);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [showCelebration, setShowCelebration] = React.useState(false);
  const [scenarioKpis, setScenarioKpis] = React.useState<ScenarioKPIs | undefined>(undefined);
  const [activeTab, setActiveTab] = React.useState<'overview' | 'deep-dive' | 'compliance'>('overview');
  const [processing, setProcessing] = React.useState(false);
  const [cashFlow, setCashFlow] = React.useState<CashFlowStatement | null>(null);
  const [equityChanges, setEquityChanges] = React.useState<EquityChangesStatement | null>(null);
  const [notesAndPolicies, setNotesAndPolicies] = React.useState<NotesAndPolicies | null>(null);
  const [entityId, setEntityId] = React.useState('default-entity');
  const [qualityChecks, setQualityChecks] = React.useState<QualityCheck[]>([]);
  const [dataGaps, setDataGaps] = React.useState<DataGap[]>([]);
  const [policyProposals, setPolicyProposals] = React.useState<PolicyProposal[]>([]);
  const [hitl, setHitl] = React.useState<HITLStatus>({ escalated: false });
  const [agenticAssessment, setAgenticAssessment] = React.useState<AgenticQualityAssessment | null>(null);
  const [standardInference, setStandardInference] = React.useState<StandardInference | null>(null);
  const [showStandardConfirmation, setShowStandardConfirmation] = React.useState(true);
  const { markAnalysisComplete } = useExportNotification();
  const { setStream: setThoughtStream } = useAgentThoughtStream();
  const cfoSnapshot = React.useMemo(() => snapshotFromStatementRows(statementRows), [statementRows]);

  const hasData = statementRows.length > 0;
  const statementsVerified = hasData;

  const status: DashboardStatus = !hasData && !processing ? 'idle' : processing ? 'processing' : 'completed';

  const handleLoadSampleDataRequest = React.useCallback(() => {
    setStatementRows(SAMPLE_STATEMENT_ROWS);
    setCashFlow(null);
    setEquityChanges(null);
    setNotesAndPolicies(null);
    setQualityChecks([]);
    setDataGaps([]);
    setPolicyProposals([]);
    setHitl({ escalated: false });
    setAgenticAssessment(null);
    setStandardInference(null);
    markAnalysisComplete();
    setShowCelebration(true);
  }, [markAnalysisComplete]);

  /** Supervisor Agent routes by file headers → CPA (statements) or CFA (spreadsheets). */
  const handleActionFile = React.useCallback(
    async (file: File) => {
      setUploadError(null);
      setProcessing(true);
      setCashFlow(null);
      setEquityChanges(null);
      setNotesAndPolicies(null);
      setQualityChecks([]);
      setDataGaps([]);
      setPolicyProposals([]);
      setHitl({ escalated: false });
      setAgenticAssessment(null);
      setStandardInference(null);
      setThoughtStream({ isThinking: true });
      const ext = (file.name.split('.').pop() ?? '').toLowerCase();
      try {
        const route = await inferRouteFromFile(file);
        if (ext === 'pdf') {
          const rows = await runMockPdfPipeline(file);
          setStatementRows(rows);
          if (rows.length > 0) markAnalysisComplete();
        } else if (['csv', 'xlsx', 'xls'].includes(ext)) {
          let jurisdictionMeta:
            | {
                country?: string;
                jurisdiction?: string;
                currency?: string;
                taxId?: string;
                businessNumber?: string;
              }
            | undefined;
          let transactions:
            | Array<{
                date?: string;
                amount: number;
                description?: string;
                counterparty?: string;
                debit?: number;
                credit?: number;
              }>
            | undefined;
          try {
            const ingestion = await runIngestionAgent(file, { includeRows: true, rowLimit: 500 });
            jurisdictionMeta = ingestion.jurisdiction;
            if (ingestion.classification === 'bank_statement') {
              const extracted = extractTransactionsFromIngestion(ingestion.sheets);
              if (extracted.length > 0) transactions = extracted;
            }
          } catch {
            // Non-blocking: proceed with upload even if ingestion fails.
          }
          const res = (await uploadTrialBalance(file, {
            fullSet: true,
            meta: {
              ...jurisdictionMeta,
              entityId,
              ...(transactions ? { transactions } : {}),
            },
          })) as Parameters<
            typeof mapTrialBalanceToRows
          >[0] & {
            cashFlow?: CashFlowStatement;
            equityChanges?: EquityChangesStatement;
            notesAndPolicies?: NotesAndPolicies;
            qualityChecks?: QualityCheck[];
            dataGaps?: DataGap[];
            policyProposals?: PolicyProposal[];
            hitl?: HITLStatus;
            agenticAssessment?: AgenticQualityAssessment | null;
            standardInference?: StandardInference | null;
          };
          const rows = mapTrialBalanceToRows(res);
          setStatementRows(rows);
          if (res.cashFlow) setCashFlow(res.cashFlow);
          if (res.equityChanges) setEquityChanges(res.equityChanges);
          if (res.notesAndPolicies) setNotesAndPolicies(res.notesAndPolicies);
          setQualityChecks(res.qualityChecks ?? []);
          setDataGaps(res.dataGaps ?? []);
          setPolicyProposals(res.policyProposals ?? []);
          setHitl(res.hitl ?? { escalated: false });
          setAgenticAssessment(res.agenticAssessment ?? null);
          setStandardInference(res.standardInference ?? null);
          setShowStandardConfirmation(true);
          if (rows.length > 0) markAnalysisComplete();
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setProcessing(false);
        setThoughtStream({ isThinking: false });
      }
    },
    [markAnalysisComplete, setThoughtStream]
  );

  const mainContent =
    status === 'idle' ? (
      <div className="min-h-full bg-background">
        <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto">
          <section className="flex flex-col items-center justify-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">Action Center</h1>
            <HeroCommandCenter
              onFile={handleActionFile}
              processing={processing}
              disabled={processing}
            />
            <p className="mt-3 text-sm text-muted-foreground">
              Or{' '}
              <button
                type="button"
                onClick={handleLoadSampleDataRequest}
                className="font-medium text-primary underline hover:no-underline"
              >
                load sample data
              </button>
            </p>
            {uploadError && (
              <p className="mt-2 text-sm text-destructive text-center">{uploadError}</p>
            )}
          </section>
        </div>
      </div>
    ) : status === 'processing' ? (
      <div className="min-h-full bg-background">
        <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Action Center</h2>
            <HeroCommandCenter
              onFile={handleActionFile}
              compact
              processing={processing}
              disabled={processing}
            />
            {uploadError && (
              <p className="mt-2 text-sm text-destructive">{uploadError}</p>
            )}
          </section>
          <section>
            <GhostStatementSkeletons />
          </section>
          <section>
            <DashboardProcessingSkeletons />
          </section>
        </div>
      </div>
    ) : (
      <div className="min-h-full bg-background">
        <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto space-y-4">
          {hitl.escalated && (
            <HITLBanner hitl={hitl} onDismiss={() => setHitl({ escalated: false })} />
          )}
          {standardInference && showStandardConfirmation && standardInference.confidence < 0.8 && (
            <StandardConfirmationCard
              standardInference={standardInference}
              entityId={entityId}
              onConfirm={confirmStandardInference}
              onDismiss={() => setShowStandardConfirmation(false)}
            />
          )}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'overview' | 'deep-dive' | 'compliance')}>
            <TabsList className="w-full justify-start rounded-md border border-border bg-muted/30 p-1 mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="deep-dive">Deep-Dive Analysis</TabsTrigger>
              <TabsTrigger value="compliance">Compliance & Audit</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-8 mt-0">
              <section>
                <HeroCommandCenter
                  onFile={handleActionFile}
                  compact
                  processing={processing}
                  disabled={processing}
                />
                {uploadError && (
                  <p className="mt-2 text-sm text-destructive">{uploadError}</p>
                )}
              </section>
              <section>
                <h2 className="text-lg font-semibold text-foreground mb-1">Your financial partner</h2>
                <p className="text-sm text-muted-foreground mb-4">Prepared statement and chat</p>
                <AgentWorkspace
                  statementRows={statementRows}
                  statementTitle="Prepared Financial Statement"
                  onLoadSampleDataRequest={handleLoadSampleDataRequest}
                />
              </section>
              {(cashFlow || equityChanges || notesAndPolicies) && (
                <section className="dashboard-reveal">
                  <h2 className="text-lg font-semibold text-foreground mb-1">Full Statement Set</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    Cash Flow, Equity Changes, and Notes (auto-generated)
                  </p>
                  <div className="mb-3 flex items-center gap-3">
                    <label className="text-xs text-muted-foreground">Entity ID</label>
                    <input
                      value={entityId}
                      onChange={(e) => setEntityId(e.target.value)}
                      className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                      placeholder="entity-id"
                    />
                  </div>
                  <Accordion type="multiple" className="space-y-2">
                    {cashFlow && (
                      <AccordionItem value="cashflow">
                        <AccordionTrigger value="cashflow">
                          <span className="font-medium">Cash Flow Statement</span>
                          {cashFlow.estimated && (
                            <span className="text-xs text-muted-foreground font-normal ml-2">Estimated</span>
                          )}
                        </AccordionTrigger>
                        <AccordionContent value="cashflow">
                          <div className="rounded-md border border-border bg-card p-4 space-y-4">
                            {cashFlow.note && <p className="text-xs text-muted-foreground">{cashFlow.note}</p>}
                            <div className="grid gap-4 md:grid-cols-3">
                              <CashFlowBlock title="Operating" lines={cashFlow.operating} entityId={entityId} />
                              <CashFlowBlock title="Investing" lines={cashFlow.investing} entityId={entityId} />
                              <CashFlowBlock title="Financing" lines={cashFlow.financing} entityId={entityId} />
                            </div>
                            <div className="flex flex-wrap gap-4 text-sm">
                              <span className="font-medium">
                                Net Change in Cash: {formatCurrency(cashFlow.netChangeInCash)}
                              </span>
                              {cashFlow.beginningCash !== undefined && (
                                <span>Beginning Cash: {formatCurrency(cashFlow.beginningCash)}</span>
                              )}
                              {cashFlow.endingCash !== undefined && (
                                <span>Ending Cash: {formatCurrency(cashFlow.endingCash)}</span>
                              )}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}
                    {equityChanges && (
                      <AccordionItem value="equity">
                        <AccordionTrigger value="equity">
                          <span className="font-medium">Statement of Changes in Equity</span>
                          {equityChanges.estimated && (
                            <span className="text-xs text-muted-foreground font-normal ml-2">Estimated</span>
                          )}
                        </AccordionTrigger>
                        <AccordionContent value="equity">
                          <div className="rounded-md border border-border bg-card p-4 space-y-3">
                            {equityChanges.note && (
                              <p className="text-xs text-muted-foreground">{equityChanges.note}</p>
                            )}
                            <div className="flex flex-wrap gap-4 text-sm">
                              {equityChanges.openingEquity !== undefined && (
                                <span>Opening Equity: {formatCurrency(equityChanges.openingEquity)}</span>
                              )}
                              {equityChanges.closingEquity !== undefined && (
                                <span className="font-medium">
                                  Closing Equity: {formatCurrency(equityChanges.closingEquity)}
                                </span>
                              )}
                            </div>
                            {equityChanges.changes.length > 0 && (
                              <div className="space-y-1 text-sm">
                                {equityChanges.changes.map((c, idx) => (
                                  <div key={`${c.label}-${idx}`} className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">{c.label}</span>
                                    <span className="font-medium">{formatCurrency(c.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}
                    {notesAndPolicies && (
                      <AccordionItem value="notes">
                        <AccordionTrigger value="notes">
                          <span className="font-medium">Notes & Accounting Policies</span>
                          <span className="text-xs text-muted-foreground font-normal ml-2">
                            {notesAndPolicies.standard}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent value="notes">
                          <div className="rounded-md border border-border bg-card p-4 space-y-3 text-sm">
                            {notesAndPolicies.notes.map((note, idx) => (
                              <div key={`${note.title}-${idx}`} className="space-y-1">
                                <p className="font-medium">{note.title}</p>
                                <p className="text-muted-foreground">{note.content}</p>
                                {note.citation && (
                                  <p className="text-xs text-muted-foreground">Citation: {note.citation}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}
                  </Accordion>
                </section>
              )}
              {statementsVerified && (
                <section className="dashboard-reveal">
                  <h2 className="text-lg font-semibold text-foreground mb-1">Strategic CFO Dashboard</h2>
                  <p className="text-sm text-muted-foreground mb-4">MD&A narrative, KPIs, and what-if scenarios</p>
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
                    <CFODashboard
                      snapshot={cfoSnapshot ?? undefined}
                      scenarioKpis={scenarioKpis}
                    />
                    <StrategicSandbox
                      snapshot={cfoSnapshot ?? undefined}
                      onScenarioUpdate={setScenarioKpis}
                      className="lg:sticky lg:top-4"
                    />
                  </div>
                </section>
              )}
            </TabsContent>

            <TabsContent value="deep-dive" className="mt-0">
              <Accordion type="multiple">
                <AccordionItem value="trends" className="dashboard-reveal">
                  <AccordionTrigger value="trends">
                    <span className="font-medium">Trends</span>
                    <span className="text-xs text-muted-foreground font-normal ml-2">Debt-to-equity and revenue growth</span>
                  </AccordionTrigger>
                  <AccordionContent value="trends">
                    <FinancialCharts />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </TabsContent>

            <TabsContent value="compliance" className="mt-0 space-y-6">
              <section>
                <h2 className="text-lg font-semibold text-foreground mb-1">Agentic quality & policy</h2>
                <p className="text-sm text-muted-foreground mb-3">
                  Quality checks, data gaps, and CPA policy proposals from the agentic pipeline
                </p>
                <AgenticQualityPanel
                  qualityChecks={qualityChecks}
                  dataGaps={dataGaps}
                  agenticAssessment={agenticAssessment}
                />
                <div className="mt-4">
                  <PolicyProposalsPanel policyProposals={policyProposals} />
                </div>
              </section>
              <Accordion type="multiple">
                <AccordionItem value="audit">
                  <AccordionTrigger value="audit">
                    <span className="font-medium">Audit trail</span>
                    <span className="text-xs text-muted-foreground font-normal ml-2">SOC2-style activity log</span>
                  </AccordionTrigger>
                  <AccordionContent value="audit">
                    <AuditLogPanel maxEntries={50} />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );

  return (
    <>
      <CelebrationToast
        open={showCelebration}
        onClose={() => setShowCelebration(false)}
        message="Your report is ready — download from the partner chat or Auditor portal."
      />
      <DashboardLayout
        sidebar={<DashboardSidebarNav currentPath="/" />}
        main={mainContent}
        agentStream={<AgentThoughtStream />}
      />
    </>
  );
}

export default function DashboardPage() {
  return (
    <FirstRunProvider>
      <ExportNotificationProvider>
        <AgentThoughtStreamProvider>
          <DashboardContent />
        </AgentThoughtStreamProvider>
      </ExportNotificationProvider>
    </FirstRunProvider>
  );
}
