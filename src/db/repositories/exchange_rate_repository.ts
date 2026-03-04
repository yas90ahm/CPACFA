/**
 * Exchange rate repository — CRUD for period_exchange_rates.
 */

import type { Pool } from 'pg';

export interface ExchangeRate {
  id: string;
  tenantId: string;
  closeSessionId: string;
  fromCurrency: string;
  toCurrency: string;
  rateType: string;
  rate: string;
  effectiveDate: string;
  createdAt: string;
  createdBy: string | null;
}

interface ExchangeRateRow {
  id: string;
  tenant_id: string;
  close_session_id: string;
  from_currency: string;
  to_currency: string;
  rate_type: string;
  rate: string;
  effective_date: string;
  created_at: string;
  created_by: string | null;
}

function rowToRate(row: ExchangeRateRow): ExchangeRate {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    closeSessionId: row.close_session_id,
    fromCurrency: row.from_currency,
    toCurrency: row.to_currency,
    rateType: row.rate_type,
    rate: row.rate,
    effectiveDate: row.effective_date,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export async function listExchangeRates(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<ExchangeRate[]> {
  const r = await pool.query<ExchangeRateRow>(
    `SELECT id, tenant_id, close_session_id, from_currency, to_currency, rate_type,
            rate::text, effective_date::text, created_at::text, created_by
     FROM core.period_exchange_rates
     WHERE tenant_id = $1 AND close_session_id = $2
     ORDER BY from_currency, rate_type`,
    [tenantId, closeSessionId]
  );
  return r.rows.map(rowToRate);
}

export async function upsertExchangeRate(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  fromCurrency: string,
  toCurrency: string,
  rateType: string,
  rate: string,
  effectiveDate: string,
  createdBy?: string
): Promise<ExchangeRate> {
  const r = await pool.query<ExchangeRateRow>(
    `INSERT INTO core.period_exchange_rates
       (tenant_id, close_session_id, from_currency, to_currency, rate_type, rate, effective_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8)
     ON CONFLICT (tenant_id, close_session_id, from_currency, to_currency, rate_type)
     DO UPDATE SET rate = EXCLUDED.rate, effective_date = EXCLUDED.effective_date, created_by = EXCLUDED.created_by
     RETURNING id, tenant_id, close_session_id, from_currency, to_currency, rate_type,
               rate::text, effective_date::text, created_at::text, created_by`,
    [tenantId, closeSessionId, fromCurrency.toUpperCase(), toCurrency.toUpperCase(), rateType, rate, effectiveDate, createdBy ?? null]
  );
  return rowToRate(r.rows[0]!);
}

export async function deleteExchangeRate(
  pool: Pool,
  tenantId: string,
  rateId: string
): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM core.period_exchange_rates WHERE id = $1 AND tenant_id = $2`,
    [rateId, tenantId]
  );
  return (r.rowCount ?? 0) > 0;
}
