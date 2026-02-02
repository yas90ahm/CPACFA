/**
 * Precedent transactions repository.
 */

import type { Pool } from 'pg';

export interface PrecedentAnalysisRow {
  id: string;
  tenantId: string;
  targetCompany: string;
  analysisDate: string;
  targetMetrics?: { revenue?: number; ebitda?: number };
  valuationRange?: { low?: number; median?: number; high?: number };
  createdAt: string;
}

export interface PrecedentTransactionRow {
  id: string;
  tenantId: string;
  analysisId: string;
  targetCompany: string;
  acquirer: string;
  announcementDate: string;
  closeDate?: string;
  transactionValue?: number;
  targetRevenue?: number;
  targetEbitda?: number;
  multiples?: { evEbitda?: number; evRevenue?: number };
  dealStructure?: 'cash' | 'stock' | 'mixed';
  controlPremium?: number;
  synergies?: number;
  isExcluded: boolean;
  excludeReason?: string;
  createdAt: string;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createAnalysis(
  pool: Pool,
  tenantId: string,
  analysis: Omit<PrecedentAnalysisRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<PrecedentAnalysisRow> {
  const id = nextId('prec');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO precedent_analyses (id, tenant_id, target_company, analysis_date, target_metrics, valuation_range, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, tenantId, analysis.targetCompany, analysis.analysisDate, analysis.targetMetrics ? JSON.stringify(analysis.targetMetrics) : null, analysis.valuationRange ? JSON.stringify(analysis.valuationRange) : null, now]
  );
  return { id, tenantId, ...analysis, createdAt: now };
}

export async function getAnalysis(pool: Pool, tenantId: string, id: string): Promise<PrecedentAnalysisRow | null> {
  const r = await pool.query('SELECT * FROM precedent_analyses WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  return { id: row.id, tenantId: row.tenant_id, targetCompany: row.target_company, analysisDate: row.analysis_date, targetMetrics: row.target_metrics, valuationRange: row.valuation_range, createdAt: row.created_at };
}

export async function listAnalyses(pool: Pool, tenantId: string): Promise<PrecedentAnalysisRow[]> {
  const r = await pool.query('SELECT * FROM precedent_analyses WHERE tenant_id = $1 ORDER BY analysis_date DESC', [tenantId]);
  return r.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, targetCompany: row.target_company, analysisDate: row.analysis_date, targetMetrics: row.target_metrics, valuationRange: row.valuation_range, createdAt: row.created_at }));
}

export async function deleteAnalysis(pool: Pool, tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM precedent_analyses WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return (r.rowCount ?? 0) > 0;
}

export async function addTransaction(
  pool: Pool,
  tenantId: string,
  txn: Omit<PrecedentTransactionRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<PrecedentTransactionRow> {
  const id = nextId('ptxn');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO precedent_transactions (id, tenant_id, analysis_id, target_company, acquirer, announcement_date, close_date, transaction_value, target_revenue, target_ebitda, multiples, deal_structure, control_premium, synergies, is_excluded, exclude_reason, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [id, tenantId, txn.analysisId, txn.targetCompany, txn.acquirer, txn.announcementDate, txn.closeDate ?? null, txn.transactionValue ?? null, txn.targetRevenue ?? null, txn.targetEbitda ?? null, txn.multiples ? JSON.stringify(txn.multiples) : null, txn.dealStructure ?? null, txn.controlPremium ?? null, txn.synergies ?? null, txn.isExcluded ?? false, txn.excludeReason ?? null, now]
  );
  return { id, tenantId, ...txn, createdAt: now };
}

export async function listTransactions(pool: Pool, tenantId: string, analysisId: string): Promise<PrecedentTransactionRow[]> {
  const r = await pool.query('SELECT * FROM precedent_transactions WHERE tenant_id = $1 AND analysis_id = $2 ORDER BY announcement_date DESC', [tenantId, analysisId]);
  return r.rows.map((row) => ({
    id: row.id, tenantId: row.tenant_id, analysisId: row.analysis_id, targetCompany: row.target_company, acquirer: row.acquirer, announcementDate: row.announcement_date, closeDate: row.close_date, transactionValue: row.transaction_value != null ? Number(row.transaction_value) : undefined, targetRevenue: row.target_revenue != null ? Number(row.target_revenue) : undefined, targetEbitda: row.target_ebitda != null ? Number(row.target_ebitda) : undefined, multiples: row.multiples, dealStructure: row.deal_structure, controlPremium: row.control_premium != null ? Number(row.control_premium) : undefined, synergies: row.synergies != null ? Number(row.synergies) : undefined, isExcluded: row.is_excluded, excludeReason: row.exclude_reason, createdAt: row.created_at
  }));
}
