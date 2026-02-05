/**
 * Audit Binder generation: bundle every financial statement with its Justification Chain.
 * For every number in the P&L (and BS): deep link to source document (PDF/CSV) and
 * timestamped Reasoning Monologue the AI used to categorize it.
 * GAAP Consistency Report: flags accounting policy changes during the fiscal year.
 */

import type {
  BalanceSheet,
  ProfitAndLoss,
  FinancialStatementLine,
  FinancialStatementsOutput,
} from '../types/financial.js';
import type {
  AuditBinder,
  StatementWithJustificationChain,
  LineAuditLink,
  CashFlowOrEquityLineLink,
  GAAPConsistencyReport,
  AccountingPolicyChange,
} from '../types/audit.js';
import type { StoredJustification } from '../types/justification.js';
import { getJustificationsForPeriod } from './justification_service.js';
import { validateTrialBalanceAndBalanceSheet } from './integrity_gate_service.js';
import { verifyChain } from './audit_ledger_service.js';
import * as statementRegistry from '../db/repositories/statement_registry_repository.js';
import * as closeAuditTrail from '../db/repositories/close_audit_trail_repository.js';
import { disallowMemoryStoreInProduction } from '../lib/env.js';
import type { Pool } from 'pg';

// --- Last statement generation: tenant DB when pool/tenantId provided; else in-memory (dev only; production disallows) ---

const BASE_SOURCE_DOC_URL = '/api/audit/source-document';
const BASE_REASONING_URL = '/api/audit/reasoning';

export interface StoredStatementGeneration {
  statements: FinancialStatementsOutput;
  sourceDocumentId: string;
  sourceDocumentName: string;
  reasoningChainId: string;
  reasoningChainTimestamp: string;
  registeredAt: string;
}

let lastStatementGeneration: StoredStatementGeneration | null = null;

/** Lease classification rationale for audit trail (deposition-ready). */
export interface LeaseRationaleEntry {
  leaseId?: string;
  leaseName?: string;
  classification: string;
  termMonths?: number;
  majorPartOfLife?: boolean;
  pvVsFvTest?: boolean;
}

/** Revenue allocation rationale for audit trail (deposition-ready). */
export interface RevenueRationaleEntry {
  contractId?: string;
  contractNumber?: string;
  allocationRationale?: string;
}

/** Register a statement generation (call after TB ingest or statements build). When pool and tenantId are provided, persists to tenant DB and writes audit trail; else in-memory (dev only). */
export async function registerStatementGeneration(
  statements: FinancialStatementsOutput,
  options: {
    sourceDocumentId?: string;
    sourceDocumentName?: string;
    reasoningChainId?: string;
    tenantId?: string;
    pool?: Pool | null;
    periodLabel?: string;
    priorPeriodLabel?: string;
    standard?: string;
    assumptions?: Record<string, unknown>;
    /** Lease classification rationales (deposition-ready); merged into assumptions. */
    leaseRationales?: LeaseRationaleEntry[];
    /** Revenue allocation rationales (deposition-ready); merged into assumptions. */
    revenueRationales?: RevenueRationaleEntry[];
  } = {}
): Promise<void> {
  // Accounting Kill Switch: never register statements that fail (A) or (B).
  validateTrialBalanceAndBalanceSheet(
    statements.trialBalance ?? { entries: [], totalDebits: 0, totalCredits: 0 },
    statements.balanceSheet
  );

  const id = () => `gen-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const registeredAt = new Date().toISOString();
  const payload: StoredStatementGeneration = {
    statements,
    sourceDocumentId: options.sourceDocumentId ?? id(),
    sourceDocumentName: options.sourceDocumentName ?? 'Trial Balance (uploaded)',
    reasoningChainId: options.reasoningChainId ?? statements.reasoningChain?.executedAt ?? registeredAt,
    reasoningChainTimestamp: statements.reasoningChain?.executedAt ?? registeredAt,
    registeredAt,
  };
  const assumptions = {
    ...(options.assumptions ?? {}),
    ...(options.leaseRationales?.length ? { leaseClassification: options.leaseRationales } : {}),
    ...(options.revenueRationales?.length ? { revenueAllocation: options.revenueRationales } : {}),
  };
  if (options.pool && options.tenantId) {
    await statementRegistry.upsertLatest(options.pool, options.tenantId, payload);
    if (options.periodLabel) {
      await closeAuditTrail.createAuditTrailRecord(options.pool, options.tenantId, {
        periodLabel: options.periodLabel,
        runId: options.reasoningChainId,
        standard: options.standard ?? statements.standard,
        priorPeriodLabel: options.priorPeriodLabel,
        assumptions: Object.keys(assumptions).length ? assumptions : options.assumptions,
      });
    }
  } else {
    disallowMemoryStoreInProduction({ storeName: 'statement generation (audit export)', hasDurableContext: false });
    lastStatementGeneration = payload;
  }
}

/** Get the last registered statement generation (for Audit Binder). When pool and tenantId are provided, reads from tenant DB; else in-memory. */
export async function getLastStatementGeneration(
  tenantId?: string,
  pool?: Pool | null
): Promise<StoredStatementGeneration | null> {
  if (pool && tenantId) {
    const row = await statementRegistry.getLatest(pool, tenantId);
    if (!row) return null;
    return {
      statements: row.statements,
      sourceDocumentId: row.source_document_id,
      sourceDocumentName: row.source_document_name,
      reasoningChainId: row.reasoning_chain_id,
      reasoningChainTimestamp: row.reasoning_chain_timestamp,
      registeredAt: row.registered_at,
    };
  }
  disallowMemoryStoreInProduction({ storeName: 'statement generation (audit export)', hasDurableContext: false });
  return lastStatementGeneration;
}

// --- Line-level deep links ---

function lineToAuditLink(
  line: FinancialStatementLine,
  sourceDocumentId: string,
  sourceDocumentName: string,
  reasoningChainId: string,
  reasoningChainTimestamp: string,
  baseSourceUrl: string,
  baseReasoningUrl: string
): LineAuditLink {
  const sourceDocumentUrl = line.sourceDocumentUrl ?? `${baseSourceUrl}/${sourceDocumentId}`;
  const reasoningMonologueId = line.reasoningMonologueId ?? reasoningChainId;
  const reasoningMonologueUrl = `${baseReasoningUrl}/${reasoningMonologueId}`;
  const reasoningMonologueTimestamp = line.reasoningMonologueTimestamp ?? reasoningChainTimestamp;
  return {
    label: line.label,
    accountCode: line.accountCode,
    amount: line.amount,
    sourceDocumentUrl,
    sourceDocumentName,
    reasoningMonologueUrl,
    reasoningMonologueTimestamp,
    reasoningMonologueId,
  };
}

function buildLineLinks(
  lines: FinancialStatementLine[],
  sourceDocumentId: string,
  sourceDocumentName: string,
  reasoningChainId: string,
  reasoningChainTimestamp: string,
  baseSourceUrl: string = BASE_SOURCE_DOC_URL,
  baseReasoningUrl: string = BASE_REASONING_URL
): LineAuditLink[] {
  return lines.map((line) =>
    lineToAuditLink(
      line,
      sourceDocumentId,
      sourceDocumentName,
      reasoningChainId,
      reasoningChainTimestamp,
      baseSourceUrl,
      baseReasoningUrl
    )
  );
}

// --- Audit Binder ---

export interface BuildAuditBinderOptions {
  periodStart: string;
  periodEnd: string;
  entityName?: string;
  /** If provided, use these statements; otherwise use last registered generation (tenant-scoped when tenantId/pool provided). */
  statements?: FinancialStatementsOutput;
  /** Base URL for source document links (e.g. origin + /api/audit/source-document) */
  baseSourceDocumentUrl?: string;
  /** Base URL for reasoning monologue links */
  baseReasoningUrl?: string;
  /** When provided, fetch last statement from tenant DB */
  tenantId?: string;
  pool?: Pool | null;
  /** Trust boundary: ingest metadata for staged items in period (included in binder for auditability) */
  ingestMetadata?: Array<{ source_type: string; source_hash: string; ingestion_timestamp: string }>;
}

/**
 * Bundle every generated financial statement with its Justification Chain.
 * For every number in the P&L (and BS), create a deep link to the source document and the timestamped Reasoning Monologue.
 */
export async function buildAuditBinder(options: BuildAuditBinderOptions): Promise<AuditBinder> {
  const {
    periodStart,
    periodEnd,
    entityName = 'Entity',
    statements: providedStatements,
    baseSourceDocumentUrl = BASE_SOURCE_DOC_URL,
    baseReasoningUrl = BASE_REASONING_URL,
    tenantId,
    pool,
    ingestMetadata,
  } = options;

  const stored = await getLastStatementGeneration(tenantId, pool);
  const statements = providedStatements ?? stored?.statements ?? null;

  const justifications = await getJustificationsForPeriod(periodStart, periodEnd, tenantId ?? undefined, pool);
  const generatedAt = new Date().toISOString();

  const binder: AuditBinder = {
    entityName,
    periodStart,
    periodEnd,
    generatedAt,
    justifications,
    ...(ingestMetadata?.length && { ingestMetadata }),
  };

  if (tenantId && pool) {
    const chainResult = await verifyChain(pool, tenantId);
    binder.chainVerification = {
      valid: chainResult.valid,
      entryCount: chainResult.entryCount,
      verifiedAt: chainResult.verifiedAt,
      ...(chainResult.latestEntryHash != null && { latestEntryHash: chainResult.latestEntryHash }),
      ...(chainResult.latestEntryId != null && { latestEntryId: chainResult.latestEntryId }),
      ...(chainResult.brokenAtEntryId != null && { brokenAtEntryId: chainResult.brokenAtEntryId }),
      ...(chainResult.message != null && { message: chainResult.message }),
    };
  }

  if (!statements) {
    return binder;
  }

  // Accounting Kill Switch: never return financials that fail (A) or (B). Throw so route returns 422.
  validateTrialBalanceAndBalanceSheet(
    statements.trialBalance ?? { entries: [], totalDebits: 0, totalCredits: 0 },
    statements.balanceSheet
  );

  const sourceDocumentId = stored?.sourceDocumentId ?? 'unknown';
  const sourceDocumentName = stored?.sourceDocumentName ?? 'Source document';
  const reasoningChainId = stored?.reasoningChainId ?? statements.reasoningChain?.executedAt ?? generatedAt;
  const reasoningChainTimestamp = statements.reasoningChain?.executedAt ?? generatedAt;

  const buildLinks = (lines: FinancialStatementLine[]) =>
    buildLineLinks(
      lines,
      sourceDocumentId,
      sourceDocumentName,
      reasoningChainId,
      reasoningChainTimestamp,
      baseSourceDocumentUrl,
      baseReasoningUrl
    );

  // Balance Sheet bundle
  binder.balanceSheetBundle = {
    statementType: 'balance_sheet',
    reportDate: statements.balanceSheet.reportDate,
    statement: statements.balanceSheet,
    justificationChain: justifications,
    lineLinks: [
      ...buildLinks(statements.balanceSheet.assets),
      ...buildLinks(statements.balanceSheet.liabilities),
      ...buildLinks(statements.balanceSheet.equity),
    ],
  };

  // P&L bundle
  binder.profitAndLossBundle = {
    statementType: 'profit_and_loss',
    reportDate: statements.profitAndLoss.reportDate,
    statement: statements.profitAndLoss,
    justificationChain: justifications,
    lineLinks: [
      ...buildLinks(statements.profitAndLoss.revenue),
      ...buildLinks(statements.profitAndLoss.expenses),
    ],
  };

  // Cash flow bundle (Stage 3 — same line-level evidence model)
  if (statements.cashFlow) {
    const cf = statements.cashFlow;
    const sourceDocumentUrl = `${baseSourceDocumentUrl}/${sourceDocumentId}`;
    const reasoningMonologueUrl = `${baseReasoningUrl}/${reasoningChainId}`;
    const cfLineLinks: CashFlowOrEquityLineLink[] = [
      ...(cf.operating ?? []).map((l) => ({
        label: l.label,
        amount: l.amount,
        sourceDocumentUrl,
        sourceDocumentName,
        reasoningMonologueUrl,
        reasoningMonologueTimestamp: reasoningChainTimestamp,
        reasoningMonologueId: reasoningChainId,
      })),
      ...(cf.investing ?? []).map((l) => ({
        label: l.label,
        amount: l.amount,
        sourceDocumentUrl,
        sourceDocumentName,
        reasoningMonologueUrl,
        reasoningMonologueTimestamp: reasoningChainTimestamp,
        reasoningMonologueId: reasoningChainId,
      })),
      ...(cf.financing ?? []).map((l) => ({
        label: l.label,
        amount: l.amount,
        sourceDocumentUrl,
        sourceDocumentName,
        reasoningMonologueUrl,
        reasoningMonologueTimestamp: reasoningChainTimestamp,
        reasoningMonologueId: reasoningChainId,
      })),
    ];
    binder.cashFlowBundle = {
      statementType: 'cash_flow',
      statement: cf,
      justificationChain: justifications,
      lineLinks: cfLineLinks,
    };
  }

  // Statement of changes in equity bundle (Stage 3)
  if (statements.equityChanges) {
    const eq = statements.equityChanges;
    const sourceDocumentUrl = `${baseSourceDocumentUrl}/${sourceDocumentId}`;
    const reasoningMonologueUrl = `${baseReasoningUrl}/${reasoningChainId}`;
    const eqLineLinks: CashFlowOrEquityLineLink[] = (eq.changes ?? []).map((l) => ({
      label: l.label,
      amount: l.amount,
      sourceDocumentUrl,
      sourceDocumentName,
      reasoningMonologueUrl,
      reasoningMonologueTimestamp: reasoningChainTimestamp,
      reasoningMonologueId: reasoningChainId,
    }));
    binder.equityChangesBundle = {
      statementType: 'equity_changes',
      statement: eq,
      justificationChain: justifications,
      lineLinks: eqLineLinks,
    };
  }

  // Clean Ledger (trial balance) for CSV export when available
  const entries = statements.trialBalance?.entries;
  if (entries?.length) {
    binder.cleanLedger = entries.map((e: { accountCode?: string; accountName: string; debit: number; credit: number; accountType?: string }) => ({
      account_code: e.accountCode ?? '',
      account_name: e.accountName ?? '',
      debit: e.debit ?? 0,
      credit: e.credit ?? 0,
      account_type: e.accountType ?? '',
    }));
  }

  return binder;
}

// --- GAAP Consistency Report ---

const policyChangeStore: AccountingPolicyChange[] = [];

/** Record an accounting policy change (call from compliance or manual entry). */
export function recordPolicyChange(change: Omit<AccountingPolicyChange, 'id'>): AccountingPolicyChange {
  const id = `policy-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const record: AccountingPolicyChange = { ...change, id };
  policyChangeStore.push(record);
  return record;
}

/** Get all recorded policy changes (for GAAP report). */
export function getRecordedPolicyChanges(): AccountingPolicyChange[] {
  return [...policyChangeStore];
}

export interface BuildGAAPConsistencyReportOptions {
  periodStart: string;
  periodEnd: string;
  /** Optional: fetch from backend compliance audit trail and flag events that look like policy changes */
  includeComplianceEvents?: boolean;
}

/**
 * GAAP Consistency Report: flags any accounting policy changes made during the fiscal year.
 */
export function buildGAAPConsistencyReport(options: BuildGAAPConsistencyReportOptions): GAAPConsistencyReport {
  const { periodStart, periodEnd } = options;
  const start = new Date(periodStart).getTime();
  const end = new Date(periodEnd).getTime();

  const policyChanges = getRecordedPolicyChanges().filter((c) => {
    const t = new Date(c.effectiveDate).getTime();
    return t >= start && t <= end;
  });

  const hasChanges = policyChanges.length > 0;
  const summary = hasChanges
    ? `${policyChanges.length} accounting policy change(s) detected during the period. Review for GAAP consistency and disclosure.`
    : 'No accounting policy changes recorded for this period.';

  return {
    periodStart,
    periodEnd,
    generatedAt: new Date().toISOString(),
    policyChanges,
    hasChanges,
    summary,
  };
}
