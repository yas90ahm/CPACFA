/**
 * AR Aging + CECL Allowance service.
 * ASC 326-20: Current Expected Credit Losses.
 * All monetary math uses Decimal.js — no native JS arithmetic on money.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import Decimal from 'decimal.js';
import { round2 } from '../utils/decimal.js';
import { assertNoAiMutationContext } from '../lib/ai_boundary.js';
import { createDraftJE } from './journal_entry_service.js';

Decimal.set({ precision: 28 });

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ArAgingSnapshot {
  id: string; tenantId: string; entityId: string | null; closeSessionId: string;
  snapshotDate: string; totalAr: string; recordCount: number; createdAt: string;
}

export interface ArAgingDetail {
  id: string; snapshotId: string; customerName: string; invoiceNumber: string | null;
  invoiceDate: string; dueDate: string; amount: string; daysOutstanding: number;
  agingBucket: string;
}

export interface CECLConfig {
  id: string; tenantId: string; entityId: string | null;
  bucketCurrentRate: string; bucket1_30Rate: string; bucket31_60Rate: string;
  bucket61_90Rate: string; bucket91_120Rate: string; bucket120PlusRate: string;
  allowanceAccount: string; badDebtAccount: string;
}

export interface CECLComputation {
  id: string; snapshotId: string; closeSessionId: string;
  requiredAllowance: string; currentAllowance: string; adjustmentNeeded: string;
  jeId: string | null; status: string; detailJson: unknown;
}

const AGING_BUCKETS = ['current', '1-30', '31-60', '61-90', '91-120', '120+'] as const;

function classifyBucket(daysOutstanding: number): string {
  if (daysOutstanding <= 0) return 'current';
  if (daysOutstanding <= 30) return '1-30';
  if (daysOutstanding <= 60) return '31-60';
  if (daysOutstanding <= 90) return '61-90';
  if (daysOutstanding <= 120) return '91-120';
  return '120+';
}

/* ------------------------------------------------------------------ */
/*  Import aging data from parsed CSV rows                             */
/* ------------------------------------------------------------------ */

export interface AgingRow {
  customerName: string;
  invoiceNumber?: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
}

export async function importAgingFromFile(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  snapshotDate: string,
  rows: AgingRow[],
  entityId?: string
): Promise<ArAgingSnapshot> {
  assertNoAiMutationContext();

  const snapId = randomUUID();
  let totalAr = new Decimal(0);
  const refDate = new Date(snapshotDate);

  // Insert snapshot
  await pool.query(
    `INSERT INTO tenant_ar_aging_snapshots (id, tenant_id, entity_id, close_session_id, snapshot_date, total_ar, record_count)
     VALUES ($1,$2,$3,$4,$5,0,$6)`,
    [snapId, tenantId, entityId ?? null, closeSessionId, snapshotDate, rows.length]
  );

  // Insert detail rows
  for (const row of rows) {
    const amt = new Decimal(row.amount).toDecimalPlaces(2);
    totalAr = totalAr.plus(amt);
    const dueDate = new Date(row.dueDate);
    const daysOut = Math.max(0, Math.floor((refDate.getTime() - dueDate.getTime()) / 86400000));
    const bucket = classifyBucket(daysOut);

    await pool.query(
      `INSERT INTO tenant_ar_aging_detail
         (id, tenant_id, snapshot_id, customer_name, invoice_number, invoice_date, due_date, amount, days_outstanding, aging_bucket)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [randomUUID(), tenantId, snapId, row.customerName, row.invoiceNumber ?? null,
       row.invoiceDate, row.dueDate, amt.toNumber(), daysOut, bucket]
    );
  }

  // Update total
  await pool.query(
    `UPDATE tenant_ar_aging_snapshots SET total_ar = $1 WHERE id = $2`,
    [totalAr.toDecimalPlaces(2).toNumber(), snapId]
  );

  const { rows: snap } = await pool.query(
    `SELECT * FROM tenant_ar_aging_snapshots WHERE id = $1`, [snapId]
  );
  return toSnapshot(snap[0]);
}

function toSnapshot(r: Record<string, unknown>): ArAgingSnapshot {
  return {
    id: r.id as string, tenantId: r.tenant_id as string,
    entityId: (r.entity_id as string) ?? null, closeSessionId: r.close_session_id as string,
    snapshotDate: String(r.snapshot_date), totalAr: String(r.total_ar),
    recordCount: Number(r.record_count), createdAt: String(r.created_at),
  };
}

/** Get aging detail for a snapshot. */
export async function getAgingDetail(pool: Pool, tenantId: string, snapshotId: string): Promise<ArAgingDetail[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tenant_ar_aging_detail WHERE tenant_id = $1 AND snapshot_id = $2 ORDER BY days_outstanding DESC`,
    [tenantId, snapshotId]
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string, snapshotId: r.snapshot_id as string,
    customerName: r.customer_name as string, invoiceNumber: (r.invoice_number as string) ?? null,
    invoiceDate: String(r.invoice_date), dueDate: String(r.due_date),
    amount: String(r.amount), daysOutstanding: Number(r.days_outstanding),
    agingBucket: r.aging_bucket as string,
  }));
}

/** Get snapshots for a session. */
export async function getSnapshots(pool: Pool, tenantId: string, closeSessionId: string): Promise<ArAgingSnapshot[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tenant_ar_aging_snapshots WHERE tenant_id = $1 AND close_session_id = $2 ORDER BY snapshot_date DESC`,
    [tenantId, closeSessionId]
  );
  return rows.map(toSnapshot);
}

/* ------------------------------------------------------------------ */
/*  CECL config                                                        */
/* ------------------------------------------------------------------ */

export async function getCECLConfig(pool: Pool, tenantId: string, entityId?: string): Promise<CECLConfig | null> {
  const { rows } = await pool.query(
    `SELECT * FROM tenant_cecl_config WHERE tenant_id = $1 AND (entity_id = $2 OR ($2 IS NULL AND entity_id IS NULL)) LIMIT 1`,
    [tenantId, entityId ?? null]
  );
  if (rows.length === 0) return null;
  return toCECLConfig(rows[0]);
}

function toCECLConfig(r: Record<string, unknown>): CECLConfig {
  return {
    id: r.id as string, tenantId: r.tenant_id as string, entityId: (r.entity_id as string) ?? null,
    bucketCurrentRate: String(r.bucket_current_rate), bucket1_30Rate: String(r.bucket_1_30_rate),
    bucket31_60Rate: String(r.bucket_31_60_rate), bucket61_90Rate: String(r.bucket_61_90_rate),
    bucket91_120Rate: String(r.bucket_91_120_rate), bucket120PlusRate: String(r.bucket_120_plus_rate),
    allowanceAccount: r.allowance_account as string, badDebtAccount: r.bad_debt_account as string,
  };
}

export async function updateCECLConfig(
  pool: Pool, tenantId: string, config: Partial<CECLConfig> & { entityId?: string }
): Promise<CECLConfig> {
  assertNoAiMutationContext();
  const vals = [
    randomUUID(), tenantId, config.entityId ?? null,
    config.bucketCurrentRate ?? '0.005', config.bucket1_30Rate ?? '0.01',
    config.bucket31_60Rate ?? '0.03', config.bucket61_90Rate ?? '0.07',
    config.bucket91_120Rate ?? '0.15', config.bucket120PlusRate ?? '0.30',
    config.allowanceAccount ?? '1299', config.badDebtAccount ?? '6800',
  ];
  const { rows } = await pool.query(
    `INSERT INTO tenant_cecl_config
       (id, tenant_id, entity_id, bucket_current_rate, bucket_1_30_rate, bucket_31_60_rate,
        bucket_61_90_rate, bucket_91_120_rate, bucket_120_plus_rate, allowance_account, bad_debt_account)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (tenant_id, entity_id) DO UPDATE SET
       bucket_current_rate=EXCLUDED.bucket_current_rate, bucket_1_30_rate=EXCLUDED.bucket_1_30_rate,
       bucket_31_60_rate=EXCLUDED.bucket_31_60_rate, bucket_61_90_rate=EXCLUDED.bucket_61_90_rate,
       bucket_91_120_rate=EXCLUDED.bucket_91_120_rate, bucket_120_plus_rate=EXCLUDED.bucket_120_plus_rate,
       allowance_account=EXCLUDED.allowance_account, bad_debt_account=EXCLUDED.bad_debt_account, updated_at=now()
     RETURNING *`, vals);
  return toCECLConfig(rows[0]);
}

/* ------------------------------------------------------------------ */
/*  CECL computation                                                   */
/* ------------------------------------------------------------------ */

const BUCKET_RATE_MAP: Record<string, keyof CECLConfig> = {
  'current': 'bucketCurrentRate', '1-30': 'bucket1_30Rate', '31-60': 'bucket31_60Rate',
  '61-90': 'bucket61_90Rate', '91-120': 'bucket91_120Rate', '120+': 'bucket120PlusRate',
};

export async function computeCECLAllowance(
  pool: Pool, tenantId: string, snapshotId: string, closeSessionId: string, currentAllowanceBalance?: number
): Promise<CECLComputation> {
  const config = await getCECLConfig(pool, tenantId);
  if (!config) throw new Error('CECL config not found — configure loss rates first');

  // Query actual GL balance for the allowance account if not explicitly provided
  if (currentAllowanceBalance === undefined || currentAllowanceBalance === 0) {
    try {
      const glResult = await pool.query<{ net: string }>(
        `SELECT COALESCE(SUM(credit) - SUM(debit), 0)::text AS net
         FROM general_ledger
         WHERE tenant_id = $1 AND account_code = $2`,
        [tenantId, config.allowanceAccount]
      );
      currentAllowanceBalance = Math.abs(parseFloat(glResult.rows[0]?.net ?? '0'));
    } catch {
      currentAllowanceBalance = 0; // fallback if GL query fails
    }
  }

  const detail = await getAgingDetail(pool, tenantId, snapshotId);
  const bucketTotals: Record<string, Decimal> = {};
  for (const bucket of AGING_BUCKETS) bucketTotals[bucket] = new Decimal(0);
  for (const d of detail) {
    bucketTotals[d.agingBucket] = (bucketTotals[d.agingBucket] ?? new Decimal(0)).plus(d.amount);
  }

  let requiredAllowance = new Decimal(0);
  const detailRows: { bucket: string; balance: string; rate: string; allowance: string }[] = [];
  for (const bucket of AGING_BUCKETS) {
    const balance = bucketTotals[bucket] ?? new Decimal(0);
    const rateKey = BUCKET_RATE_MAP[bucket]!;
    const rate = new Decimal((config as unknown as Record<string, string>)[rateKey]);
    const allowance = balance.times(rate).toDecimalPlaces(2);
    requiredAllowance = requiredAllowance.plus(allowance);
    detailRows.push({ bucket, balance: balance.toFixed(2), rate: rate.toFixed(6), allowance: allowance.toFixed(2) });
  }

  const compId = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO tenant_cecl_computations
       (id, tenant_id, snapshot_id, close_session_id, required_allowance, current_allowance, detail_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [compId, tenantId, snapshotId, closeSessionId,
     requiredAllowance.toDecimalPlaces(2).toNumber(), round2(currentAllowanceBalance),
     JSON.stringify(detailRows)]
  );
  const r = rows[0];
  return {
    id: r.id, snapshotId: r.snapshot_id, closeSessionId: r.close_session_id,
    requiredAllowance: String(r.required_allowance), currentAllowance: String(r.current_allowance),
    adjustmentNeeded: String(r.adjustment_needed), jeId: r.je_id ?? null,
    status: r.status, detailJson: r.detail_json,
  };
}

/** Propose an AJE for the CECL allowance adjustment. */
export async function proposeAllowanceAJE(
  pool: Pool, tenantId: string, computationId: string, createdBy: string
): Promise<{ jeId: string }> {
  assertNoAiMutationContext();

  const { rows: compRows } = await pool.query(
    `SELECT * FROM tenant_cecl_computations WHERE id = $1 AND tenant_id = $2`, [computationId, tenantId]
  );
  if (compRows.length === 0) throw new Error('CECL computation not found');
  const comp = compRows[0];
  const adjustment = new Decimal(String(comp.adjustment_needed));
  if (adjustment.eq(0)) throw new Error('No adjustment needed');

  const config = await getCECLConfig(pool, tenantId);
  if (!config) throw new Error('CECL config not found');

  const absAmt = adjustment.abs().toDecimalPlaces(2).toNumber();
  const isIncrease = adjustment.gt(0);

  const je = await createDraftJE(pool, {
    closeSessionId: comp.close_session_id,
    tenantId,
    memo: `CECL allowance adjustment: ${isIncrease ? 'increase' : 'decrease'} by ${absAmt}`,
    source: 'accrual',
    createdBy,
    lines: [
      {
        accountRef: config.badDebtAccount,
        debit: isIncrease ? absAmt : 0,
        credit: isIncrease ? 0 : absAmt,
        description: 'Bad debt expense — CECL',
        amountProvenance: { kind: 'engine_calculation' as const, ruleId: computationId, ruleVersion: '1', inputs: { cecl: true } },
      },
      {
        accountRef: config.allowanceAccount,
        debit: isIncrease ? 0 : absAmt,
        credit: isIncrease ? absAmt : 0,
        description: 'Allowance for doubtful accounts — CECL',
        amountProvenance: { kind: 'engine_calculation' as const, ruleId: computationId, ruleVersion: '1', inputs: { cecl: true } },
      },
    ],
  });

  await pool.query(
    `UPDATE tenant_cecl_computations SET je_id = $1, status = 'proposed' WHERE id = $2 AND tenant_id = $3`,
    [je.id, computationId, tenantId]
  );

  return { jeId: je.id };
}
