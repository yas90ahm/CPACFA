/**
 * Build ProfessionalReviewInput from raw request body.
 * Resolves contracts from pool, builds portfolioPerformanceByPortfolio, and optionally sets qualitative evidence missing.
 */

import type { Pool } from 'pg';
import type { ProfessionalReviewInput } from '../types/professional_review.js';
import { ENABLE_INTEGRATED_SUPERVISOR } from '../lib/capability_flags.js';
import { setQualitativeEvidenceMissing } from './risk_context_store.js';
import { listContracts } from './revenue_recognition_service.js';

export interface RawProfessionalReviewBody {
  runId: string;
  periodLabel: string;
  trialBalance?: { entries: { accountName: string; debit: number; credit: number }[] };
  balanceSheet?: { totalAssets: number; totalLiabilities: number; totalEquity: number };
  profitAndLoss?: { totalRevenue: number; totalExpenses: number; netIncome: number };
  covenantResult?: { debtToEbitdaBreach?: boolean; interestCoverageBreach?: boolean };
  liquidityMetrics?: { currentRatio?: number; runwayMonths?: number };
  contractIds?: string[];
  contractText?: string | string[];
  leaseDocuments?: string | string[];
  portfolioIds?: string[];
}

export async function buildProfessionalReviewInput(params: {
  body: RawProfessionalReviewBody;
  tenantId: string;
  pool: Pool;
}): Promise<ProfessionalReviewInput> {
  const { body, tenantId, pool } = params;
  const allContracts = await listContracts(tenantId, pool, {});
  const hasContractIds = body.contractIds != null && body.contractIds.length > 0;
  const contractsForInput = hasContractIds
    ? allContracts.filter((c) => body.contractIds!.includes(c.id)).map((c) => ({
        contractNumber: c.contractNumber,
        performanceObligations: c.performanceObligations.map((p) => ({ name: p.name, description: p.description })),
        totalContractValue: c.totalContractValue,
      }))
    : allContracts.map((c) => ({
        contractNumber: c.contractNumber,
        performanceObligations: c.performanceObligations.map((p) => ({ name: p.name, description: p.description })),
        totalContractValue: c.totalContractValue,
      }));

  const hasContractText = Array.isArray(body.contractText)
    ? body.contractText.some((s) => typeof s === 'string' && s.trim().length > 0)
    : typeof body.contractText === 'string' && body.contractText.trim().length > 0;
  const hasLeaseDocuments = Array.isArray(body.leaseDocuments)
    ? body.leaseDocuments.some((s) => typeof s === 'string' && s.trim().length > 0)
    : typeof body.leaseDocuments === 'string' && body.leaseDocuments.trim().length > 0;
  const hasNarrative = contractsForInput.length > 0 || hasContractText || hasLeaseDocuments;

  if (ENABLE_INTEGRATED_SUPERVISOR) {
    await setQualitativeEvidenceMissing(pool, tenantId, body.periodLabel, !hasNarrative);
  }

  const input: ProfessionalReviewInput = {
    tenantId,
    periodLabel: body.periodLabel,
    runId: body.runId,
    narrativeEvidenceSummary: hasNarrative ? 'Contract/lease narrative provided.' : '',
    trialBalance: body.trialBalance,
    balanceSheet: body.balanceSheet,
    profitAndLoss: body.profitAndLoss,
    covenantResult: body.covenantResult,
    liquidityMetrics: body.liquidityMetrics,
    contracts: contractsForInput.length > 0 ? contractsForInput : undefined,
    contractText: body.contractText,
    leaseDocuments: body.leaseDocuments,
  };

  // Portfolio analytics removed (CFO/CFA scope); portfolioPerformanceByPortfolio left undefined.

  return input;
}
