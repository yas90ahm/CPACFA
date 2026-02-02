/**
 * Comparable company analysis repository.
 */

import type { Pool } from 'pg';

export interface ComparableAnalysisRow {
  id: string;
  tenantId: string;
  targetCompany: string;
  analysisDate: string;
  targetMetrics?: { revenue?: number; ebitda?: number; netIncome?: number; bookValue?: number; shares?: number };
  valuationMetrics?: { evEbitda?: number; evRevenue?: number; pe?: number; pb?: number };
  valuationRange?: { low?: number; median?: number; high?: number };
  createdAt: string;
}

export interface ComparableCompanyRow {
  id: string;
  tenantId: string;
  analysisId: string;
  companyName: string;
  ticker?: string;
  marketCap?: number;
  enterpriseValue?: number;
  revenue?: number;
  ebitda?: number;
  netIncome?: number;
  bookValue?: number;
  multiples?: { evEbitda?: number; evRevenue?: number; pe?: number; pb?: number };
  isOutlier: boolean;
  outlierReason?: string;
  createdAt: string;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Comparable Analyses CRUD
export async function createAnalysis(
  pool: Pool,
  tenantId: string,
  analysis: Omit<ComparableAnalysisRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<ComparableAnalysisRow> {
  const id = nextId('cmp');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO comparable_analyses (id, tenant_id, target_company, analysis_date, target_metrics, valuation_metrics, valuation_range, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id, tenantId, analysis.targetCompany, analysis.analysisDate,
      analysis.targetMetrics ? JSON.stringify(analysis.targetMetrics) : null,
      analysis.valuationMetrics ? JSON.stringify(analysis.valuationMetrics) : null,
      analysis.valuationRange ? JSON.stringify(analysis.valuationRange) : null, now
    ]
  );
  return { id, tenantId, ...analysis, createdAt: now };
}

export async function getAnalysis(pool: Pool, tenantId: string, id: string): Promise<ComparableAnalysisRow | null> {
  const r = await pool.query('SELECT * FROM comparable_analyses WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    targetCompany: row.target_company,
    analysisDate: row.analysis_date,
    targetMetrics: row.target_metrics ?? undefined,
    valuationMetrics: row.valuation_metrics ?? undefined,
    valuationRange: row.valuation_range ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listAnalyses(pool: Pool, tenantId: string): Promise<ComparableAnalysisRow[]> {
  const r = await pool.query('SELECT * FROM comparable_analyses WHERE tenant_id = $1 ORDER BY analysis_date DESC', [tenantId]);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    targetCompany: row.target_company,
    analysisDate: row.analysis_date,
    targetMetrics: row.target_metrics ?? undefined,
    valuationMetrics: row.valuation_metrics ?? undefined,
    valuationRange: row.valuation_range ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function deleteAnalysis(pool: Pool, tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM comparable_analyses WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return (r.rowCount ?? 0) > 0;
}

// Comparable Companies CRUD
export async function addComparableCompany(
  pool: Pool,
  tenantId: string,
  company: Omit<ComparableCompanyRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<ComparableCompanyRow> {
  const id = nextId('cc');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO comparable_companies (id, tenant_id, analysis_id, company_name, ticker, market_cap, enterprise_value, revenue, ebitda, net_income, book_value, multiples, is_outlier, outlier_reason, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      id, tenantId, company.analysisId, company.companyName, company.ticker ?? null,
      company.marketCap ?? null, company.enterpriseValue ?? null, company.revenue ?? null,
      company.ebitda ?? null, company.netIncome ?? null, company.bookValue ?? null,
      company.multiples ? JSON.stringify(company.multiples) : null,
      company.isOutlier ?? false, company.outlierReason ?? null, now
    ]
  );
  return { id, tenantId, ...company, createdAt: now };
}

export async function listComparableCompanies(pool: Pool, tenantId: string, analysisId: string): Promise<ComparableCompanyRow[]> {
  const r = await pool.query('SELECT * FROM comparable_companies WHERE tenant_id = $1 AND analysis_id = $2 ORDER BY company_name', [tenantId, analysisId]);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    analysisId: row.analysis_id,
    companyName: row.company_name,
    ticker: row.ticker ?? undefined,
    marketCap: row.market_cap != null ? Number(row.market_cap) : undefined,
    enterpriseValue: row.enterprise_value != null ? Number(row.enterprise_value) : undefined,
    revenue: row.revenue != null ? Number(row.revenue) : undefined,
    ebitda: row.ebitda != null ? Number(row.ebitda) : undefined,
    netIncome: row.net_income != null ? Number(row.net_income) : undefined,
    bookValue: row.book_value != null ? Number(row.book_value) : undefined,
    multiples: row.multiples ?? undefined,
    isOutlier: row.is_outlier,
    outlierReason: row.outlier_reason ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function updateComparableCompany(
  pool: Pool,
  tenantId: string,
  id: string,
  patch: Partial<ComparableCompanyRow>
): Promise<boolean> {
  const updates: string[] = [];
  const params: unknown[] = [id];
  let idx = 2;
  if (patch.isOutlier !== undefined) { updates.push(`is_outlier = $${idx++}`); params.push(patch.isOutlier); }
  if (patch.outlierReason !== undefined) { updates.push(`outlier_reason = $${idx++}`); params.push(patch.outlierReason); }
  if (updates.length === 0) return true;
  params.push(tenantId);
  const r = await pool.query(`UPDATE comparable_companies SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $${idx}`, params);
  return (r.rowCount ?? 0) > 0;
}

export async function deleteComparableCompany(pool: Pool, tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM comparable_companies WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return (r.rowCount ?? 0) > 0;
}
