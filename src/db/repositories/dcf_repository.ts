/**
 * DCF valuation repository — models, WACC, sensitivity.
 */

import type { Pool } from 'pg';

export interface DCFModelRow {
  id: string;
  tenantId: string;
  companyName: string;
  valuationDate: string;
  projectionYears: number;
  terminalGrowthRate?: number;
  wacc?: number;
  cashFlows: Array<{ year: number; fcf: number }>;
  terminalValue?: number;
  pvCashFlows?: number;
  pvTerminalValue?: number;
  enterpriseValue?: number;
  netDebt?: number;
  equityValue?: number;
  sharesOutstanding?: number;
  valuePerShare?: number;
  assumptions?: { revenueGrowth?: number[]; margins?: number[]; capex?: number[] };
  createdAt: string;
}

export interface WACCCalculationRow {
  id: string;
  tenantId: string;
  dcfModelId?: string;
  costOfEquity?: number;
  costOfDebt?: number;
  marketRiskPremium?: number;
  riskFreeRate?: number;
  beta?: number;
  taxRate?: number;
  debtWeight?: number;
  equityWeight?: number;
  wacc?: number;
  rationale?: string;
  createdAt: string;
}

export interface DCFSensitivityRow {
  id: string;
  tenantId: string;
  dcfModelId: string;
  waccValues: number[];
  growthValues: number[];
  valueMatrix: number[][];
  createdAt: string;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// DCF Models CRUD
export async function createDCFModel(
  pool: Pool,
  tenantId: string,
  model: Omit<DCFModelRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<DCFModelRow> {
  const id = nextId('dcf');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO dcf_models (id, tenant_id, company_name, valuation_date, projection_years, terminal_growth_rate, wacc, cash_flows, terminal_value, pv_cash_flows, pv_terminal_value, enterprise_value, net_debt, equity_value, shares_outstanding, value_per_share, assumptions, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      id, tenantId, model.companyName, model.valuationDate, model.projectionYears ?? 5,
      model.terminalGrowthRate ?? null, model.wacc ?? null, JSON.stringify(model.cashFlows),
      model.terminalValue ?? null, model.pvCashFlows ?? null, model.pvTerminalValue ?? null,
      model.enterpriseValue ?? null, model.netDebt ?? null, model.equityValue ?? null,
      model.sharesOutstanding ?? null, model.valuePerShare ?? null,
      model.assumptions ? JSON.stringify(model.assumptions) : null, now
    ]
  );
  return { id, tenantId, ...model, createdAt: now };
}

export async function getDCFModel(pool: Pool, tenantId: string, id: string): Promise<DCFModelRow | null> {
  const r = await pool.query('SELECT * FROM dcf_models WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    companyName: row.company_name,
    valuationDate: row.valuation_date,
    projectionYears: row.projection_years,
    terminalGrowthRate: row.terminal_growth_rate != null ? Number(row.terminal_growth_rate) : undefined,
    wacc: row.wacc != null ? Number(row.wacc) : undefined,
    cashFlows: row.cash_flows ?? [],
    terminalValue: row.terminal_value != null ? Number(row.terminal_value) : undefined,
    pvCashFlows: row.pv_cash_flows != null ? Number(row.pv_cash_flows) : undefined,
    pvTerminalValue: row.pv_terminal_value != null ? Number(row.pv_terminal_value) : undefined,
    enterpriseValue: row.enterprise_value != null ? Number(row.enterprise_value) : undefined,
    netDebt: row.net_debt != null ? Number(row.net_debt) : undefined,
    equityValue: row.equity_value != null ? Number(row.equity_value) : undefined,
    sharesOutstanding: row.shares_outstanding != null ? Number(row.shares_outstanding) : undefined,
    valuePerShare: row.value_per_share != null ? Number(row.value_per_share) : undefined,
    assumptions: row.assumptions ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listDCFModels(pool: Pool, tenantId: string): Promise<DCFModelRow[]> {
  const r = await pool.query('SELECT * FROM dcf_models WHERE tenant_id = $1 ORDER BY valuation_date DESC', [tenantId]);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    companyName: row.company_name,
    valuationDate: row.valuation_date,
    projectionYears: row.projection_years,
    terminalGrowthRate: row.terminal_growth_rate != null ? Number(row.terminal_growth_rate) : undefined,
    wacc: row.wacc != null ? Number(row.wacc) : undefined,
    cashFlows: row.cash_flows ?? [],
    terminalValue: row.terminal_value != null ? Number(row.terminal_value) : undefined,
    pvCashFlows: row.pv_cash_flows != null ? Number(row.pv_cash_flows) : undefined,
    pvTerminalValue: row.pv_terminal_value != null ? Number(row.pv_terminal_value) : undefined,
    enterpriseValue: row.enterprise_value != null ? Number(row.enterprise_value) : undefined,
    netDebt: row.net_debt != null ? Number(row.net_debt) : undefined,
    equityValue: row.equity_value != null ? Number(row.equity_value) : undefined,
    sharesOutstanding: row.shares_outstanding != null ? Number(row.shares_outstanding) : undefined,
    valuePerShare: row.value_per_share != null ? Number(row.value_per_share) : undefined,
    assumptions: row.assumptions ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function deleteDCFModel(pool: Pool, tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM dcf_models WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return (r.rowCount ?? 0) > 0;
}

// WACC Calculations
export async function createWACCCalculation(
  pool: Pool,
  tenantId: string,
  wacc: Omit<WACCCalculationRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<WACCCalculationRow> {
  const id = nextId('wacc');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO wacc_calculations (id, tenant_id, dcf_model_id, cost_of_equity, cost_of_debt, market_risk_premium, risk_free_rate, beta, tax_rate, debt_weight, equity_weight, wacc, rationale, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id, tenantId, wacc.dcfModelId ?? null, wacc.costOfEquity ?? null, wacc.costOfDebt ?? null,
      wacc.marketRiskPremium ?? null, wacc.riskFreeRate ?? null, wacc.beta ?? null,
      wacc.taxRate ?? null, wacc.debtWeight ?? null, wacc.equityWeight ?? null,
      wacc.wacc ?? null, wacc.rationale ?? null, now
    ]
  );
  return { id, tenantId, ...wacc, createdAt: now };
}

export async function listWACCCalculations(pool: Pool, tenantId: string, dcfModelId?: string): Promise<WACCCalculationRow[]> {
  let sql = 'SELECT * FROM wacc_calculations WHERE tenant_id = $1';
  const params: unknown[] = [tenantId];
  if (dcfModelId) {
    sql += ' AND dcf_model_id = $2';
    params.push(dcfModelId);
  }
  sql += ' ORDER BY created_at DESC';
  const r = await pool.query(sql, params);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    dcfModelId: row.dcf_model_id ?? undefined,
    costOfEquity: row.cost_of_equity != null ? Number(row.cost_of_equity) : undefined,
    costOfDebt: row.cost_of_debt != null ? Number(row.cost_of_debt) : undefined,
    marketRiskPremium: row.market_risk_premium != null ? Number(row.market_risk_premium) : undefined,
    riskFreeRate: row.risk_free_rate != null ? Number(row.risk_free_rate) : undefined,
    beta: row.beta != null ? Number(row.beta) : undefined,
    taxRate: row.tax_rate != null ? Number(row.tax_rate) : undefined,
    debtWeight: row.debt_weight != null ? Number(row.debt_weight) : undefined,
    equityWeight: row.equity_weight != null ? Number(row.equity_weight) : undefined,
    wacc: row.wacc != null ? Number(row.wacc) : undefined,
    rationale: row.rationale ?? undefined,
    createdAt: row.created_at,
  }));
}

// Sensitivity
export async function createSensitivity(
  pool: Pool,
  tenantId: string,
  sensitivity: Omit<DCFSensitivityRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<DCFSensitivityRow> {
  const id = nextId('sens');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO dcf_sensitivity (id, tenant_id, dcf_model_id, wacc_values, growth_values, value_matrix, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, tenantId, sensitivity.dcfModelId, JSON.stringify(sensitivity.waccValues), JSON.stringify(sensitivity.growthValues), JSON.stringify(sensitivity.valueMatrix), now]
  );
  return { id, tenantId, ...sensitivity, createdAt: now };
}

export async function getSensitivity(pool: Pool, tenantId: string, dcfModelId: string): Promise<DCFSensitivityRow | null> {
  const r = await pool.query('SELECT * FROM dcf_sensitivity WHERE dcf_model_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1', [dcfModelId, tenantId]);
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    dcfModelId: row.dcf_model_id,
    waccValues: row.wacc_values ?? [],
    growthValues: row.growth_values ?? [],
    valueMatrix: row.value_matrix ?? [],
    createdAt: row.created_at,
  };
}
