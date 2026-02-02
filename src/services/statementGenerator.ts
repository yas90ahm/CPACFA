/**
 * StatementGenerator — Build financial statements by accounting standard.
 * Accepts a `standard` parameter: ASPE, IFRS, FRS102, or US GAAP.
 */

import type {
  TrialBalanceResult,
  BalanceSheet,
  ProfitAndLoss,
  FinancialStatementLine,
  TrialBalanceEntry,
} from '../types/financial.js';
import { buildBalanceSheet, buildProfitAndLoss, buildFinancialStatements } from './financialStatements.js';
import { classifyTrialBalanceDeterministic } from './accountClassifier.js';
import { getStandardsRegistry, requiresLeaseLiabilityCalculation, usesSimplifiedDepreciation } from '../constants/accounting/index.js';
import type { AccountingStandard } from '../constants/accounting/index.js';
import { computeLeaseLiability, type LeaseLiabilityInput } from './leaseLiabilityCalc.js';
import { buildCashFlowStatement } from './cashFlow.js';
import { buildEquityChangesStatement } from './equityChanges.js';
import { buildNotesAndPolicies } from './notesPolicies.js';
import type { CashFlowStatement, EquityChangesStatement, NotesAndPolicies } from '../types/financial.js';
import type { Pool } from 'pg';
import type { IntegrityContractFact } from '../types/integrity.js';
import { runIntegrityGate } from './integrity_gate_service.js';
import { recordOverride } from './audit_ledger_service.js';

export interface StatementGeneratorOptions {
  /** Lease data for IFRS 16; when provided and standard is IFRS, lease liability tool is triggered. */
  lease?: LeaseLiabilityInput;
  /** When true, include Cash Flow, Equity Changes, and Notes/Policies. */
  fullSet?: boolean;
  /** Optional prior trial balance for period-over-period cash flow / equity changes. */
  priorTrialBalance?: TrialBalanceResult;
  /** Pre-classified entries (e.g. from agentic or user-confirmed); when length matches, used instead of deterministic classification. */
  preClassifiedEntries?: TrialBalanceEntry[];
  /** Pre-classified prior-period entries when useAgenticClassification and priorTrialBalance are used. */
  priorClassifiedEntries?: TrialBalanceEntry[];
  /** When provided with trial balance, integrity gate runs before building statements (TB revenue vs contract revenue). */
  contracts?: IntegrityContractFact[];
  /** Tolerance for integrity gate (default 0). */
  integrityTolerance?: number;
  /** When set with loadContracts, generator loads contracts and runs gate when tenant has contracts. */
  tenantId?: string;
  /** Loader for contracts by tenant; when set with tenantId, gate runs when contracts.length > 0. */
  loadContracts?: (tenantId: string) => Promise<IntegrityContractFact[]>;
  /** When set and gate would otherwise be skipped (no contracts, no loader), record bypass in audit ledger then proceed. */
  integrityGateBypassLog?: { tenantId: string; pool: Pool; rationale: string };
}

export interface StatementGeneratorResult {
  balanceSheet: BalanceSheet;
  profitAndLoss: ProfitAndLoss;
  classifiedEntries: TrialBalanceEntry[];
  /** Standard applied (ASPE, IFRS, FRS102, or US_GAAP). */
  standard: AccountingStandard;
  cashFlow?: CashFlowStatement;
  equityChanges?: EquityChangesStatement;
  notesAndPolicies?: NotesAndPolicies;
  /** ASPE: simplified depreciation. IFRS/US_GAAP: lease liability when lease data provided. FRS102/ASPE: operating lease expense only (no ROU). */
  standardMetadata?: {
    depreciationMethod?: 'straight-line';
    leaseLiability?: number;
    rightOfUseAsset?: number;
    citation?: string;
  };
}

/**
 * Generate financial statements for the given standard.
 * - ASPE: Simplified depreciation (straight-line); operating leases off balance sheet.
 * - IFRS: Lease liability/ROU when lease data provided (IFRS 16).
 * - US_GAAP: Lease liability/ROU when lease data provided (ASC 842).
 * - FRS102: Operating lease expense only (no ROU); baseline classification.
 */
export async function generateStatements(
  trialBalanceResult: TrialBalanceResult,
  standard: AccountingStandard,
  options: StatementGeneratorOptions = {}
): Promise<StatementGeneratorResult> {
  const classified =
    options.preClassifiedEntries?.length === trialBalanceResult.entries.length
      ? options.preClassifiedEntries
      : classifyTrialBalanceDeterministic(trialBalanceResult.entries);

  let contractsToCheck: IntegrityContractFact[] | undefined;
  if (options.loadContracts && options.tenantId) {
    const loaded = await options.loadContracts(options.tenantId);
    if (loaded.length > 0) contractsToCheck = loaded;
  } else if (options.contracts?.length) {
    contractsToCheck = options.contracts;
  }

  if (contractsToCheck && contractsToCheck.length > 0) {
    runIntegrityGate({
      trialBalanceEntries: classified,
      contracts: contractsToCheck,
      tolerance: options.integrityTolerance,
    });
  } else if (
    options.integrityGateBypassLog &&
    !(options.loadContracts && options.tenantId) &&
    !(options.contracts && options.contracts.length > 0)
  ) {
    await recordOverride(options.integrityGateBypassLog.pool, {
      tenantId: options.integrityGateBypassLog.tenantId,
      eventType: 'integrity_gate_bypass',
      deterministicFlagSnapshot: { reason: 'Statements built without TB vs contract validation' },
      userPromptRationale: options.integrityGateBypassLog.rationale,
    });
  }

  let balanceSheet = buildBalanceSheet(classified);
  const profitAndLoss = buildProfitAndLoss(classified);
  const priorClassified =
    options.priorTrialBalance && options.priorClassifiedEntries?.length === options.priorTrialBalance.entries.length
      ? options.priorClassifiedEntries
      : options.priorTrialBalance
        ? classifyTrialBalanceDeterministic(options.priorTrialBalance.entries)
        : undefined;
  const priorBalanceSheet = priorClassified ? buildBalanceSheet(priorClassified) : undefined;

  const standardMetadata: StatementGeneratorResult['standardMetadata'] = {};

  if (usesSimplifiedDepreciation(standard)) {
    // ASPE: simplified depreciation — straight-line only
    standardMetadata.depreciationMethod = 'straight-line';
  }

  if (requiresLeaseLiabilityCalculation(standard) && options.lease) {
    // IFRS 16 or ASC 842: trigger lease liability / ROU calculation
    const leaseResult = computeLeaseLiability(options.lease);
    standardMetadata.leaseLiability = leaseResult.leaseLiability;
    standardMetadata.rightOfUseAsset = leaseResult.rightOfUseAsset;
    const isUSGaap = standard === 'US_GAAP';
    standardMetadata.citation = isUSGaap ? 'ASC 842-20-30-1' : 'IFRS 16.26–.27';

    const rouLine: FinancialStatementLine = isUSGaap
      ? {
          label: 'Right-of-use asset',
          amount: leaseResult.rightOfUseAsset,
          codificationRef: { framework: 'FASB', citation: 'ASC 842-20-30-1', description: 'Right-of-use asset at commencement' },
        }
      : {
          label: 'Right-of-use asset',
          amount: leaseResult.rightOfUseAsset,
          codificationRef: { framework: 'IASB', citation: 'IFRS 16.26', description: 'Right-of-use asset at commencement' },
        };
    const leaseLiaLine: FinancialStatementLine = isUSGaap
      ? {
          label: 'Lease liability',
          amount: leaseResult.leaseLiability,
          codificationRef: { framework: 'FASB', citation: 'ASC 842-20-30-1', description: 'Lease liability at commencement' },
        }
      : {
          label: 'Lease liability',
          amount: leaseResult.leaseLiability,
          codificationRef: { framework: 'IASB', citation: 'IFRS 16.26', description: 'Lease liability at commencement' },
        };

    balanceSheet = {
      ...balanceSheet,
      assets: [...balanceSheet.assets, rouLine],
      liabilities: [...balanceSheet.liabilities, leaseLiaLine],
      totalAssets: balanceSheet.totalAssets + leaseResult.rightOfUseAsset,
      totalLiabilities: balanceSheet.totalLiabilities + leaseResult.leaseLiability,
      balances: Math.abs(
        balanceSheet.totalAssets + leaseResult.rightOfUseAsset -
        (balanceSheet.totalLiabilities + leaseResult.leaseLiability + balanceSheet.totalEquity)
      ) < 0.02,
    };
  }

  return {
    balanceSheet,
    profitAndLoss,
    classifiedEntries: classified,
    standard,
    ...(options.fullSet ? {
      cashFlow: buildCashFlowStatement(trialBalanceResult, profitAndLoss, options.priorTrialBalance),
      equityChanges: buildEquityChangesStatement(balanceSheet, priorBalanceSheet, profitAndLoss),
      notesAndPolicies: buildNotesAndPolicies(standard),
    } : {}),
    ...(Object.keys(standardMetadata).length > 0 ? { standardMetadata } : {}),
  };
}

export { getStandardsRegistry };
