import { apiJson, apiBlob } from './apiClient';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const JUSTIFY_API = process.env.NEXT_PUBLIC_JUSTIFY_URL ?? 'http://localhost:5000';
/** Python backend (e.g. Flask) for black-box logs and audit evidence */
const PYTHON_API = process.env.NEXT_PUBLIC_PYTHON_URL ?? '';

export async function uploadTrialBalance(
  file: File,
  options?: {
    standard?: 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP';
    fullSet?: boolean;
    meta?: {
      country?: string;
      jurisdiction?: string;
      currency?: string;
      taxId?: string;
      businessNumber?: string;
      entityId?: string;
      transactions?: Array<{
        date?: string;
        amount: number;
        description?: string;
        counterparty?: string;
        debit?: number;
        credit?: number;
        category?: 'operating' | 'investing' | 'financing';
      }>;
    };
  }
): Promise<unknown> {
  const form = new FormData();
  form.append('file', file);
  if (options?.standard) form.append('standard', options.standard);
  if (options?.fullSet !== undefined) form.append('fullSet', String(options.fullSet));
  if (options?.meta?.country) form.append('country', options.meta.country);
  if (options?.meta?.jurisdiction) form.append('jurisdiction', options.meta.jurisdiction);
  if (options?.meta?.currency) form.append('currency', options.meta.currency);
  if (options?.meta?.taxId) form.append('taxId', options.meta.taxId);
  if (options?.meta?.businessNumber) form.append('businessNumber', options.meta.businessNumber);
  if (options?.meta?.entityId) form.append('entityId', options.meta.entityId);
  if (options?.meta?.transactions) {
    form.append('transactions', JSON.stringify(options.meta.transactions));
  }
  const res = await fetch(`${API_BASE}/api/trial-balance/ingest`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function runIngestionAgent(
  file: File,
  options?: { includeRows?: boolean; rowLimit?: number }
): Promise<{
  classification: string;
  route: string;
  confidence: number;
  signals: string[];
  jurisdiction?: {
    country?: string;
    jurisdiction?: string;
    currency?: string;
    taxId?: string;
    businessNumber?: string;
  };
  sheets?: Array<{ name: string; headers: string[]; rowCount: number; rows?: Array<Record<string, unknown> | unknown[]> }>;
}> {
  const form = new FormData();
  form.append('file', file);
  if (options?.includeRows) form.append('includeRows', 'true');
  if (options?.rowLimit !== undefined) form.append('rowLimit', String(options.rowLimit));
  const res = await fetch(`${API_BASE}/api/ingestion/agent`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function justifyQuestion(question: string): Promise<{
  citation: string;
  explanation: string;
  question_type?: string;
  supporting_detail?: string;
}> {
  return apiJson(JUSTIFY_API, '/api/justify', { method: 'POST', body: { question } });
}

export async function setTransactionCategory(input: {
  entityId: string;
  description: string;
  category: 'operating' | 'investing' | 'financing';
}): Promise<{ ok: boolean }> {
  return apiJson(API_BASE, '/api/memory/transaction-category', { method: 'POST', body: input });
}

/** Confirm or correct inferred accounting standard (agentic upgrade: low-confidence confirmation). */
export async function confirmStandardInference(payload: {
  entityId: string;
  standard: 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP';
}): Promise<{ ok: boolean }> {
  return apiJson(API_BASE, '/api/memory/entity', { method: 'POST', body: payload });
}

/** Session trace (reasoning_logs + HITL staging) for audit trail / AgentThinkingHUD. */
export async function fetchSessionTrace(sessionId: string): Promise<{
  reasoningLogs: Array<{
    stepType: 'thought' | 'tool';
    timestamp: string;
    thought?: string;
    toolName?: string;
    toolInput?: Record<string, unknown>;
    toolResult?: string | Record<string, unknown>;
    rawDataSeen?: unknown;
    ruleApplied?: string;
    verificationResult?: { passed: boolean; checks: string[] };
  }>;
  stagingItems: Array<{
    id: string;
    proposedAction: string;
    justification: string;
    status: string;
    type: string;
    amount?: number;
    payload?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  }>;
}> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/supervisor/session/${encodeURIComponent(sessionId)}/trace`
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Supervisor chat (ReAct loop): returns response, thoughts, toolCalls for Reasoning Streams UI. */
export async function supervisorChat(params: {
  message: string;
  entries?: Array<{ accountName: string; debit: number; credit: number; accountCode?: string }>;
}): Promise<{
  response: string;
  thoughts: string[];
  toolCalls: Array<{ name: string; input?: unknown; result?: string }>;
  stopReason: string;
}> {
  const res = await fetch(`${API_BASE}/api/supervisor/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: params.message,
      raw_rows: params.entries,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Transaction Interrogator: drill-down for a P&L line item (filter transactions + CPA justification). */
export async function fetchDrillDown(lineItemLabel: string, accountCode?: string): Promise<{
  transactions: { description?: string; amount?: string; counterparty?: string; date?: string; account_name?: string; account_code?: string }[];
  justification: string;
  line_item_label: string;
  count: number;
}> {
  const params = new URLSearchParams({ line_item: lineItemLabel });
  if (accountCode) params.set('account_code', accountCode);
  return apiJson(JUSTIFY_API, `/api/transaction-interrogator?${params}`);
}

/** Proactive Advice (CFA Brain): Tax Planning, Cash Buffer, Spending Anomaly. */
export async function fetchProactiveAdvice(input: {
  cash: number;
  monthlyBurn: number;
  taxLiability?: number;
  revenue?: number;
  netIncome?: number;
  expensesThisMonth?: { label: string; amount: number }[];
  expensesPriorMonth?: { label: string; amount: number }[];
  idealReserveMonths?: number;
}): Promise<{
  taxPlanning: { highTaxDetected: boolean; effectiveRate?: number; suggestions: string[]; message: string };
  cashBuffer: { survivalMonths: number | null; monthlyBurn: number; idealReserveAmount: number; idealReserveMonths: number; currentCash: number; shortfall: number | null; message: string };
  spendingAnomaly: { topOutliers: { label: string; amountThisMonth: number; amountPriorMonth: number; variance: number; variancePercent: number; message: string }[]; summary: string };
}> {
  const res = await fetch(`${API_BASE}/api/cfa/proactive-advice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function assessLiquidity(inputs: {
  currentAssets: number;
  inventory: number;
  currentLiabilities: number;
  revenue: number;
  accountsReceivable: number;
  accountsPayable: number;
  costOfGoodsSold?: number;
}): Promise<{ metrics: unknown; summary: string; riskLevel: string; bulletPoints: string[] }> {
  return apiJson(API_BASE, '/api/cfa/liquidity', { method: 'POST', body: inputs });
}

// --- CFO Dashboard ---

export interface CFOFinancialSnapshot {
  revenue: number;
  costOfGoodsSold?: number;
  operatingExpenses?: number;
  operatingIncome?: number;
  netIncome: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  cash: number;
  currentAssets?: number;
  currentLiabilities?: number;
  inventory?: number;
  accountsReceivable?: number;
  accountsPayable?: number;
  priorRevenue?: number;
  priorNetIncome?: number;
  periodLabel?: string;
}

export interface CFOKPIs {
  burnRate: number;
  runwayMonths: number;
  breakEvenRevenue?: number;
  ruleOf40: number;
  revenueGrowthPercent: number;
  profitMarginPercent: number;
  workingCapitalCycleDays: number;
  daysSalesOutstanding: number;
  daysInventoryOutstanding: number;
  daysPayablesOutstanding: number;
  grossMarginPercent: number;
  operatingMarginPercent: number;
  netMarginPercent: number;
}

export async function getCFONarrative(snapshot: CFOFinancialSnapshot): Promise<{
  narrative: { periodLabel: string; overview: string; sections: { title: string; content: string }[]; highlights: string[] };
  kpis: CFOKPIs;
}> {
  const res = await fetch(`${API_BASE}/api/cfo-dashboard/narrative`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getCFOKPIs(snapshot: CFOFinancialSnapshot): Promise<{ kpis: CFOKPIs }> {
  return apiJson(API_BASE, '/api/cfo-dashboard/kpis', { method: 'POST', body: snapshot });
}

/** Strategic Sandbox: recalc Cash Runway & Break-even via Python sandbox (revenue shock, new hires). */
export interface ScenarioParams {
  revenueChangePercent?: number;
  newEmployeeCount?: number;
  newEmployeeSalary?: number;
}

export interface ScenarioKPIs {
  burnRate: number;
  runwayMonths: number;
  breakEvenRevenue: number;
}

export async function runScenarioAnalysis(
  snapshot: CFOFinancialSnapshot,
  params: ScenarioParams
): Promise<{ kpis: ScenarioKPIs }> {
  const res = await fetch(`${API_BASE}/api/cfo-dashboard/scenario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot, ...params }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function runPointedQuestion(question: string, snapshot: CFOFinancialSnapshot): Promise<{
  question: string;
  interpretedVariable: string;
  interpretedShock: string;
  baseCase: { scenario: string; grossMarginPercent: number; operatingMarginPercent: number; netMarginPercent: number };
  sensitivityCase: { scenario: string; grossMarginPercent: number; operatingMarginPercent: number; netMarginPercent: number };
  delta: { grossMarginPercent: number; operatingMarginPercent: number; netMarginPercent: number };
  narrative: string;
  chartData: { scenario: string; grossMargin: number; operatingMargin: number; netMargin: number }[];
}> {
  return apiJson(API_BASE, '/api/cfo-dashboard/pointed-question', { method: 'POST', body: { question, snapshot } });
}

// --- Auditor Portal (read-only) ---

export async function verifyAuditorToken(token: string): Promise<{ valid: boolean }> {
  const res = await fetch(`${API_BASE}/api/audit/auditor/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function internalControlsChat(question: string, token: string): Promise<{
  question: string;
  scopedQuestion: string;
  irac: { issue: string; rule: string; analysis: string; conclusion: string; source: string };
  sourceTag: string;
  formatted: string;
}> {
  return apiJson(API_BASE, '/api/audit/auditor/internal-controls-chat', { method: 'POST', body: { question, token } });
}

export async function getAuditBinder(periodStart: string, periodEnd: string, entityName?: string): Promise<{
  entityName: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  balanceSheetBundle?: unknown;
  profitAndLossBundle?: unknown;
  justifications: unknown[];
}> {
  const params = new URLSearchParams({ periodStart, periodEnd });
  if (entityName) params.set('entityName', entityName);
  const res = await fetch(`${API_BASE}/api/audit/binder?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getGAAPConsistencyReport(periodStart: string, periodEnd: string): Promise<{
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  policyChanges: { id: string; effectiveDate: string; policyArea: string; changeDescription: string; citation?: string }[];
  hasChanges: boolean;
  summary?: string;
}> {
  const params = new URLSearchParams({ periodStart, periodEnd });
  return apiJson(API_BASE, `/api/audit/gaap-consistency?${params}`);
}

/** Black-box audit logs (prompt, thought_process, python_execution, final_response). Requires Python backend. */
export async function getBlackBoxLogs(params: {
  date_from?: string;
  date_to?: string;
  user_id?: string;
  entry_type?: string;
  limit?: number;
}): Promise<{ logs: { id: number; timestamp: string; entry_type: string; payload: string; user_id?: string }[]; count: number }> {
  const base = PYTHON_API || API_BASE;
  const search = new URLSearchParams();
  if (params.date_from) search.set('date_from', params.date_from);
  if (params.date_to) search.set('date_to', params.date_to);
  if (params.user_id) search.set('user_id', params.user_id);
  if (params.entry_type) search.set('entry_type', params.entry_type);
  search.set('limit', String(params.limit ?? 100));
  const res = await fetch(`${base}/api/audit/black-box/logs?${search}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// --- Consolidation (Global Controller) ---

export interface ConsolidationRollupPayload {
  reporting_currency: string;
  report_date: string;
  subsidiaries: {
    entity_id: string;
    entity_name: string;
    functional_currency: string;
    report_date?: string;
    lines: { account_code: string; account_name: string; debit: number; credit: number; account_type: string }[];
  }[];
  fx_rates_to_reporting?: Record<string, number>;
  translation_rates?: Record<string, number>;
  intercompany_pairs?: { entity_receivable: string; entity_payable: string; receivable_account_code: string; payable_account_code: string; description?: string }[];
  minority_ownerships?: { subsidiary_entity_id: string; minority_pct: number }[];
}

export interface ConsolidationRollupResult {
  report_date: string;
  reporting_currency: string;
  consolidated_balance_sheet: {
    report_date: string;
    assets: { label: string; amount: string; account_code?: string }[];
    liabilities: { label: string; amount: string; account_code?: string }[];
    equity: { label: string; amount: string; account_code?: string }[];
    total_assets: string;
    total_liabilities: string;
    total_equity: string;
  };
  eliminations_applied: { description: string; debit_account: string; credit_account: string; amount: string; entity_debit: string; entity_credit: string }[];
  minority_interest?: { subsidiary_entity_id: string; subsidiary_name: string; amount: string; description?: string }[];
  total_minority_interest?: string;
  translation_adjustments?: Record<string, string>;
  intercompany_netted?: boolean;
}

export async function consolidationRollup(payload: ConsolidationRollupPayload): Promise<ConsolidationRollupResult> {
  const base = PYTHON_API || API_BASE;
  return apiJson(base, '/api/consolidation/rollup', { method: 'POST', body: payload });
}

// --- Document Generation Service (Download Package) ---

export type DownloadPackageType = 'detailed-pdf' | 'summary-pdf' | 'raw-csv';

/** Build report payload from Audit Binder for PDF/CSV export. */
export function buildReportPayloadFromBinder(binder: {
  entityName?: string;
  periodStart?: string;
  periodEnd?: string;
  generatedAt?: string;
  balanceSheetBundle?: { statement?: Record<string, unknown> };
  profitAndLossBundle?: { statement?: Record<string, unknown> };
  justifications?: { citation?: string; sourceTag?: string; conclusion?: string; rule?: string }[];
  cleanLedger?: { account_code?: string; account_name: string; debit: number; credit: number; account_type?: string }[];
}): {
  cover: Record<string, string>;
  financial_statements: Record<string, unknown>;
  executive_summary: string;
  audit_trail: { timestamp_utc: string; event_type: string; reasoning: string; citations: string; outcome: string }[];
  audit_trail_rules_cited: string[];
  clean_ledger: { account_code: string; account_name: string; debit: number; credit: number; account_type: string }[];
} {
  const bs = binder.balanceSheetBundle?.statement as Record<string, unknown> | undefined;
  const pl = binder.profitAndLossBundle?.statement as Record<string, unknown> | undefined;
  const reportDate = (bs?.reportDate ?? pl?.reportDate ?? binder.generatedAt ?? '') as string;
  const justifications = binder.justifications ?? [];
  const rulesCited = Array.from(
    new Set(
      justifications.flatMap((j) => {
        const c = (j.citation ?? j.sourceTag ?? j.rule ?? '').toString();
        return c.split(/[\s,;]+/).filter((s) => s.length > 2);
      })
    )
  );
  const auditTrail = justifications.map((j, i) => ({
    timestamp_utc: binder.generatedAt ?? new Date().toISOString(),
    event_type: 'justification',
    reasoning: (j.conclusion ?? '') as string,
    citations: (j.citation ?? j.sourceTag ?? '') as string,
    outcome: 'allowed',
  }));
  let cleanLedger = binder.cleanLedger ?? [];
  if (cleanLedger.length === 0 && (bs || pl)) {
    // Fallback: derive from BS/P&L (label, amount as debit or credit by type)
    const lines: { account_code: string; account_name: string; debit: number; credit: number; account_type: string }[] = [];
    const add = (arr: { label?: string; amount?: number; accountCode?: string }[] | undefined, type: string, isDebit: boolean) => {
      (arr ?? []).forEach((l) => {
        const amt = Number(l.amount) || 0;
        lines.push({
          account_code: (l.accountCode ?? '') as string,
          account_name: (l.label ?? '') as string,
          debit: isDebit ? amt : 0,
          credit: isDebit ? 0 : amt,
          account_type: type,
        });
      });
    };
    const bsAssets = bs?.assets as { label?: string; amount?: number; accountCode?: string }[] | undefined;
    const bsLiab = bs?.liabilities as { label?: string; amount?: number; accountCode?: string }[] | undefined;
    const bsEquity = bs?.equity as { label?: string; amount?: number; accountCode?: string }[] | undefined;
    const plRev = pl?.revenue as { label?: string; amount?: number; accountCode?: string }[] | undefined;
    const plExp = pl?.expenses as { label?: string; amount?: number; accountCode?: string }[] | undefined;
    add(bsAssets, 'ASSET', true);
    add(bsLiab, 'LIABILITY', false);
    add(bsEquity, 'EQUITY', false);
    add(plRev, 'REVENUE', false);
    add(plExp, 'EXPENSE', true);
    cleanLedger = lines;
  }
  const cleanLedgerNormalized = cleanLedger.map((r) => ({
    account_code: r.account_code ?? '',
    account_name: r.account_name ?? '',
    debit: Number(r.debit) || 0,
    credit: Number(r.credit) || 0,
    account_type: r.account_type ?? '',
  }));
  const payload = {
    cover: {
      title: 'Financial Report',
      entity_name: binder.entityName ?? 'Entity',
      report_date: reportDate,
      period_label: `${binder.periodStart ?? ''} to ${binder.periodEnd ?? ''}`,
      prepared_by: 'Supervisor Agent',
      codification: 'FASB ASC / IASB',
    },
    financial_statements: {
      report_date: reportDate,
      balance_sheet: bs ?? {},
      profit_and_loss: pl ?? {},
    },
    executive_summary: `Period: ${binder.periodStart ?? ''} to ${binder.periodEnd ?? ''}. Entity: ${binder.entityName ?? 'Entity'}. CPA-verified financial statements and justification chain included.`,
    audit_trail: auditTrail,
    audit_trail_rules_cited: rulesCited,
    clean_ledger: cleanLedgerNormalized,
    ...(binder.periodStart && { periodStart: binder.periodStart }),
    ...(binder.periodEnd && { periodEnd: binder.periodEnd }),
  };
  return payload;
}

/** Download Package: Detailed PDF (Executive Summary, Financials, CFA Insights, full Audit Trail). */
export async function downloadPackagePdf(
  payload: Record<string, unknown>,
  pdfType: 'detailed' | 'summary'
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/export/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, pdf_type: pdfType }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.blob();
}

/** Download Package: Raw Data CSV (Clean Ledger, injection-safe). */
export async function downloadPackageCsv(payload: { clean_ledger?: unknown[] }): Promise<Blob> {
  return apiBlob(API_BASE, '/api/export/csv', { method: 'POST', body: payload });
}

/** Trigger browser download of a Blob with given filename. */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
