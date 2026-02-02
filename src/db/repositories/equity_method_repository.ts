/**
 * Equity method investments repository.
 */

import type { Pool } from 'pg';

export interface EquityMethodInvestmentRow {
  id: string;
  tenantId: string;
  investeeName: string;
  investmentDate: string;
  ownershipPercent: number;
  initialInvestment: number;
  currentCarryingValue?: number;
  basisDifference?: number;
  basisDifferenceComponents?: Array<{ description: string; amount: number; amortizationYears?: number }>;
  isSignificantInfluence: boolean;
  influenceBasis?: string;
  notes?: string;
  createdAt: string;
}

export interface EquityMethodIncomeRow {
  id: string;
  tenantId: string;
  investmentId: string;
  periodLabel: string;
  investeeNetIncome?: number;
  shareOfIncome?: number;
  dividendsReceived?: number;
  basisDifferenceAmortization?: number;
  impairmentLoss?: number;
  netEquityIncome?: number;
  carryingValueAfter?: number;
  createdAt: string;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createInvestment(pool: Pool, tenantId: string, inv: Omit<EquityMethodInvestmentRow, 'id' | 'createdAt' | 'tenantId'>): Promise<EquityMethodInvestmentRow> {
  const id = nextId('emi');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO equity_method_investments (id, tenant_id, investee_name, investment_date, ownership_percent, initial_investment, current_carrying_value, basis_difference, basis_difference_components, is_significant_influence, influence_basis, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [id, tenantId, inv.investeeName, inv.investmentDate, inv.ownershipPercent, inv.initialInvestment, inv.currentCarryingValue ?? inv.initialInvestment, inv.basisDifference ?? null, inv.basisDifferenceComponents ? JSON.stringify(inv.basisDifferenceComponents) : null, inv.isSignificantInfluence ?? true, inv.influenceBasis ?? null, inv.notes ?? null, now]
  );
  return { id, tenantId, ...inv, currentCarryingValue: inv.currentCarryingValue ?? inv.initialInvestment, createdAt: now };
}

export async function getInvestment(pool: Pool, tenantId: string, id: string): Promise<EquityMethodInvestmentRow | null> {
  const r = await pool.query('SELECT * FROM equity_method_investments WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  return { id: row.id, tenantId: row.tenant_id, investeeName: row.investee_name, investmentDate: row.investment_date, ownershipPercent: Number(row.ownership_percent), initialInvestment: Number(row.initial_investment), currentCarryingValue: row.current_carrying_value != null ? Number(row.current_carrying_value) : undefined, basisDifference: row.basis_difference != null ? Number(row.basis_difference) : undefined, basisDifferenceComponents: row.basis_difference_components, isSignificantInfluence: row.is_significant_influence, influenceBasis: row.influence_basis, notes: row.notes, createdAt: row.created_at };
}

export async function listInvestments(pool: Pool, tenantId: string): Promise<EquityMethodInvestmentRow[]> {
  const r = await pool.query('SELECT * FROM equity_method_investments WHERE tenant_id = $1 ORDER BY investee_name', [tenantId]);
  return r.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, investeeName: row.investee_name, investmentDate: row.investment_date, ownershipPercent: Number(row.ownership_percent), initialInvestment: Number(row.initial_investment), currentCarryingValue: row.current_carrying_value != null ? Number(row.current_carrying_value) : undefined, basisDifference: row.basis_difference != null ? Number(row.basis_difference) : undefined, basisDifferenceComponents: row.basis_difference_components, isSignificantInfluence: row.is_significant_influence, influenceBasis: row.influence_basis, notes: row.notes, createdAt: row.created_at }));
}

export async function updateInvestment(pool: Pool, tenantId: string, id: string, patch: Partial<EquityMethodInvestmentRow>): Promise<EquityMethodInvestmentRow | null> {
  const updates: string[] = [];
  const params: unknown[] = [id];
  let idx = 2;
  if (patch.currentCarryingValue !== undefined) { updates.push(`current_carrying_value = $${idx++}`); params.push(patch.currentCarryingValue); }
  if (patch.basisDifference !== undefined) { updates.push(`basis_difference = $${idx++}`); params.push(patch.basisDifference); }
  if (updates.length === 0) return getInvestment(pool, tenantId, id);
  params.push(tenantId);
  await pool.query(`UPDATE equity_method_investments SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $${idx}`, params);
  return getInvestment(pool, tenantId, id);
}

export async function deleteInvestment(pool: Pool, tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM equity_method_investments WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return (r.rowCount ?? 0) > 0;
}

export async function recordIncome(pool: Pool, tenantId: string, income: Omit<EquityMethodIncomeRow, 'id' | 'createdAt' | 'tenantId'>): Promise<EquityMethodIncomeRow> {
  const id = nextId('emin');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO equity_method_income (id, tenant_id, investment_id, period_label, investee_net_income, share_of_income, dividends_received, basis_difference_amortization, impairment_loss, net_equity_income, carrying_value_after, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [id, tenantId, income.investmentId, income.periodLabel, income.investeeNetIncome ?? null, income.shareOfIncome ?? null, income.dividendsReceived ?? null, income.basisDifferenceAmortization ?? null, income.impairmentLoss ?? null, income.netEquityIncome ?? null, income.carryingValueAfter ?? null, now]
  );
  return { id, tenantId, ...income, createdAt: now };
}

export async function listIncome(pool: Pool, tenantId: string, investmentId: string): Promise<EquityMethodIncomeRow[]> {
  const r = await pool.query('SELECT * FROM equity_method_income WHERE tenant_id = $1 AND investment_id = $2 ORDER BY period_label', [tenantId, investmentId]);
  return r.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, investmentId: row.investment_id, periodLabel: row.period_label, investeeNetIncome: row.investee_net_income != null ? Number(row.investee_net_income) : undefined, shareOfIncome: row.share_of_income != null ? Number(row.share_of_income) : undefined, dividendsReceived: row.dividends_received != null ? Number(row.dividends_received) : undefined, basisDifferenceAmortization: row.basis_difference_amortization != null ? Number(row.basis_difference_amortization) : undefined, impairmentLoss: row.impairment_loss != null ? Number(row.impairment_loss) : undefined, netEquityIncome: row.net_equity_income != null ? Number(row.net_equity_income) : undefined, carryingValueAfter: row.carrying_value_after != null ? Number(row.carrying_value_after) : undefined, createdAt: row.created_at }));
}
