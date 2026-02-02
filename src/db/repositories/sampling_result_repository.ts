/**
 * Sampling results per tenant — DB when pool/tenantId present.
 */

import type { Pool } from 'pg';
import type { SamplingResult, SamplingResultWithId } from '../../types/audit_evidence.js';

function rowToResult(row: {
  run_id: string;
  population: string;
  method: string;
  sample_size: number;
  selected_ids: unknown;
  selected_items: unknown;
  test_results: unknown;
  created_at: string;
  period_label?: string | null;
  materiality_threshold?: number | null;
  population_count?: number | null;
}): SamplingResultWithId {
  return {
    runId: row.run_id,
    population: row.population,
    method: row.method,
    sampleSize: row.sample_size,
    selectedIds: Array.isArray(row.selected_ids) ? (row.selected_ids as string[]) : [],
    selectedItems: Array.isArray(row.selected_items)
      ? (row.selected_items as { id: string; amount?: number }[])
      : [],
    testResults: Array.isArray(row.test_results)
      ? (row.test_results as { id: string; result: 'pass' | 'fail' | 'exception'; note?: string }[])
      : undefined,
    createdAt: row.created_at,
    periodLabel: row.period_label ?? undefined,
    materialityThreshold: row.materiality_threshold != null ? Number(row.materiality_threshold) : undefined,
    populationCount: row.population_count ?? undefined,
  };
}

export async function store(
  pool: Pool,
  tenantId: string,
  result: SamplingResult & { runId: string }
): Promise<SamplingResultWithId> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO sampling_results (run_id, tenant_id, population, method, sample_size, selected_ids, selected_items, test_results, created_at, period_label, materiality_threshold, population_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      result.runId,
      tenantId,
      result.population,
      result.method,
      result.sampleSize,
      JSON.stringify(result.selectedIds ?? []),
      JSON.stringify(result.selectedItems ?? []),
      result.testResults ? JSON.stringify(result.testResults) : null,
      now,
      result.periodLabel ?? null,
      result.materialityThreshold ?? null,
      result.populationCount ?? null,
    ]
  );
  return { ...result, createdAt: now };
}

export async function get(
  pool: Pool,
  runId: string,
  tenantId: string
): Promise<SamplingResultWithId | null> {
  const r = await pool.query<{
    run_id: string;
    tenant_id: string;
    population: string;
    method: string;
    sample_size: number;
    selected_ids: unknown;
    selected_items: unknown;
    test_results: unknown;
    created_at: string;
    period_label?: string | null;
    materiality_threshold?: number | null;
    population_count?: number | null;
  }>(
    'SELECT run_id, tenant_id, population, method, sample_size, selected_ids, selected_items, test_results, created_at, period_label, materiality_threshold, population_count FROM sampling_results WHERE run_id = $1 AND tenant_id = $2',
    [runId, tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToResult(row);
}

export async function updateTestResults(
  pool: Pool,
  runId: string,
  tenantId: string,
  testResults: { id: string; result: 'pass' | 'fail' | 'exception'; note?: string }[]
): Promise<SamplingResultWithId | null> {
  await pool.query(
    'UPDATE sampling_results SET test_results = $3 WHERE run_id = $1 AND tenant_id = $2',
    [runId, tenantId, JSON.stringify(testResults)]
  );
  const updated = await get(pool, runId, tenantId);
  if (!updated) return null;
  return { ...updated, testResults };
}

export async function listByTenant(pool: Pool, tenantId: string, limit = 50): Promise<SamplingResultWithId[]> {
  const r = await pool.query<{
    run_id: string;
    tenant_id: string;
    population: string;
    method: string;
    sample_size: number;
    selected_ids: unknown;
    selected_items: unknown;
    test_results: unknown;
    created_at: string;
    period_label?: string | null;
    materiality_threshold?: number | null;
    population_count?: number | null;
  }>(
    'SELECT run_id, tenant_id, population, method, sample_size, selected_ids, selected_items, test_results, created_at, period_label, materiality_threshold, population_count FROM sampling_results WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2',
    [tenantId, limit]
  );
  return r.rows.map((row) => rowToResult(row));
}
