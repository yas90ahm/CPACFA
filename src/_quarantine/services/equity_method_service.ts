/**
 * Equity method investments service.
 */

import type { Pool } from 'pg';
import * as repo from '../db/repositories/equity_method_repository.js';
import type { EquityMethodInvestmentRow, EquityMethodIncomeRow } from '../db/repositories/equity_method_repository.js';
import { round2 } from '../utils/decimal.js';

export type { EquityMethodInvestmentRow, EquityMethodIncomeRow };

export interface EquityIncomeResult {
  investmentId: string;
  periodLabel: string;
  investeeNetIncome: number;
  ownershipPercent: number;
  shareOfIncome: number;
  dividendsReceived: number;
  basisDifferenceAmortization: number;
  impairmentLoss: number;
  netEquityIncome: number;
  carryingValueBefore: number;
  carryingValueAfter: number;
}

export async function calculateEquityIncome(
  tenantId: string,
  pool: Pool,
  investmentId: string,
  periodLabel: string,
  investeeNetIncome: number,
  dividendsReceived: number = 0,
  impairmentLoss: number = 0
): Promise<EquityIncomeResult> {
  const investment = await repo.getInvestment(pool, tenantId, investmentId);
  if (!investment) throw new Error('Investment not found');

  const ownershipPercent = investment.ownershipPercent;
  const shareOfIncome = investeeNetIncome * ownershipPercent;

  // Basis difference amortization (simplified: straight-line over remaining life)
  let basisDifferenceAmortization = 0;
  if (investment.basisDifferenceComponents && investment.basisDifferenceComponents.length > 0) {
    for (const comp of investment.basisDifferenceComponents) {
      if (comp.amortizationYears && comp.amortizationYears > 0) {
        basisDifferenceAmortization += comp.amount / comp.amortizationYears;
      }
    }
  }

  const netEquityIncome = shareOfIncome - basisDifferenceAmortization - impairmentLoss;
  const carryingValueBefore = investment.currentCarryingValue ?? investment.initialInvestment;
  const carryingValueAfter = carryingValueBefore + netEquityIncome - dividendsReceived;

  // Record income
  await repo.recordIncome(pool, tenantId, {
    investmentId,
    periodLabel,
    investeeNetIncome,
    shareOfIncome,
    dividendsReceived,
    basisDifferenceAmortization,
    impairmentLoss,
    netEquityIncome,
    carryingValueAfter,
  });

  // Update carrying value
  await repo.updateInvestment(pool, tenantId, investmentId, { currentCarryingValue: carryingValueAfter });

  return {
    investmentId,
    periodLabel,
    investeeNetIncome,
    ownershipPercent,
    shareOfIncome: round2(shareOfIncome),
    dividendsReceived,
    basisDifferenceAmortization: round2(basisDifferenceAmortization),
    impairmentLoss,
    netEquityIncome: round2(netEquityIncome),
    carryingValueBefore: round2(carryingValueBefore),
    carryingValueAfter: round2(carryingValueAfter),
  };
}

// CRUD Operations
export async function createInvestment(tenantId: string, pool: Pool, inv: Omit<EquityMethodInvestmentRow, 'id' | 'createdAt' | 'tenantId'>): Promise<EquityMethodInvestmentRow> {
  return repo.createInvestment(pool, tenantId, inv);
}

export async function getInvestment(tenantId: string, pool: Pool, id: string): Promise<EquityMethodInvestmentRow | null> {
  return repo.getInvestment(pool, tenantId, id);
}

export async function listInvestments(tenantId: string, pool: Pool): Promise<EquityMethodInvestmentRow[]> {
  return repo.listInvestments(pool, tenantId);
}

export async function updateInvestment(tenantId: string, pool: Pool, id: string, patch: Partial<EquityMethodInvestmentRow>): Promise<EquityMethodInvestmentRow | null> {
  return repo.updateInvestment(pool, tenantId, id, patch);
}

export async function deleteInvestment(tenantId: string, pool: Pool, id: string): Promise<boolean> {
  return repo.deleteInvestment(pool, tenantId, id);
}

export async function listIncome(tenantId: string, pool: Pool, investmentId: string): Promise<EquityMethodIncomeRow[]> {
  return repo.listIncome(pool, tenantId, investmentId);
}
