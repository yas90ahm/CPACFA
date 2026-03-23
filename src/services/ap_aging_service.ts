/**
 * AP Aging + Cutoff Analysis service.
 * ASC 405-20 / AU-C 330: Payables aging and period-end cutoff testing.
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

export interface ApAgingSnapshot {
  id: string; tenantId: string; entityId: string | null; closeSessionId: string;
  snapshotDate: string; totalAp: string; recordCount: number; createdAt: string;
}

export interface ApAgingDetail {
  id: string; snapshotId: string; vendorName: string; invoiceNumber: string | null;
  invoiceDate: string; dueDate: string; amount: string; daysOutstanding: number;
  agingBucket: string; isPastDue: boolean;
}

export interface CutoffItem {
  id: string; closeSessionId: string; snapshotId: string | null;
  vendorName: string; invoiceNumber: string | null; invoiceDate: string;
  amount: string; expenseAccount: string | null; disposition: string;
  reason: string | null; jeId: string | null;
}

export interface ApAgingRow {
  vendorName: string;
  invoiceNumber?: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
}

function classifyBucket(daysOutstanding: number): string {
  if (daysOutstanding <= 0) return 'current';
  if (daysOutstanding <= 30) return '1-30';
  if (daysOutstanding <= 60) return '31-60';
  if (daysOutstanding <= 90) return '61-90';
  if (daysOutstanding <= 120) return '91-120';
  return '120+';
}

function toSnapshot(r: Record<string, unknown>): ApAgingSnapshot {
  return {
    id: r.id as string, tenantId: r.tenant_id as string,
    entityId: (r.entity_id as string) ?? null, closeSessionId: r.close_session_id as string,
    snapshotDate: String(r.snapshot_date), totalAp: String(r.total_ap),
    recordCount: Number(r.record_count), createdAt: String(r.created_at),
  };
}

/* ------------------------------------------------------------------ */
/*  Import AP aging data                                               */
/* ------------------------------------------------------------------ */

export async function importAgingFromFile(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  snapshotDate: string,
  rows: ApAgingRow[],
  entityId?: string
): Promise<ApAgingSnapshot> {
  assertNoAiMutationContext();

  const snapId = randomUUID();
  let totalAp = new Decimal(0);
  const refDate = new Date(snapshotDate);

  await pool.query(
    `INSERT INTO tenant_ap_aging_snapshots (id, tenant_id, entity_id, close_session_id, snapshot_date, total_ap, record_count)
     VALUES ($1,$2,$3,$4,$5,0,$6)`,
    [snapId, tenantId, entityId ?? null, closeSessionId, snapshotDate, rows.length]
  );

  for (const row of rows) {
    const amt = new Decimal(row.amount).toDecimalPlaces(2);
    totalAp = totalAp.plus(amt);
    const dueDate = new Date(row.dueDate);
    const daysOut = Math.max(0, Math.floor((refDate.getTime() - dueDate.getTime()) / 86400000));
    const bucket = classifyBucket(daysOut);

    await pool.query(
      `INSERT INTO tenant_ap_aging_detail
         (id, tenant_id, snapshot_id, vendor_name, invoice_number, invoice_date, due_date, amount, days_outstanding, aging_bucket)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [randomUUID(), tenantId, snapId, row.vendorName, row.invoiceNumber ?? null,
       row.invoiceDate, row.dueDate, amt.toNumber(), daysOut, bucket]
    );
  }

  await pool.query(
    `UPDATE tenant_ap_aging_snapshots SET total_ap = $1 WHERE id = $2`,
    [totalAp.toDecimalPlaces(2).toNumber(), snapId]
  );

  const { rows: snap } = await pool.query(
    `SELECT * FROM tenant_ap_aging_snapshots WHERE id = $1`, [snapId]
  );
  return toSnapshot(snap[0]);
}

/** Get snapshots for a session. */
export async function getSnapshots(pool: Pool, tenantId: string, closeSessionId: string): Promise<ApAgingSnapshot[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tenant_ap_aging_snapshots WHERE tenant_id = $1 AND close_session_id = $2 ORDER BY snapshot_date DESC`,
    [tenantId, closeSessionId]
  );
  return rows.map(toSnapshot);
}

/** Get aging detail for a snapshot. */
export async function getAgingDetail(pool: Pool, tenantId: string, snapshotId: string): Promise<ApAgingDetail[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tenant_ap_aging_detail WHERE tenant_id = $1 AND snapshot_id = $2 ORDER BY days_outstanding DESC`,
    [tenantId, snapshotId]
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string, snapshotId: r.snapshot_id as string,
    vendorName: r.vendor_name as string, invoiceNumber: (r.invoice_number as string) ?? null,
    invoiceDate: String(r.invoice_date), dueDate: String(r.due_date),
    amount: String(r.amount), daysOutstanding: Number(r.days_outstanding),
    agingBucket: r.aging_bucket as string, isPastDue: Boolean(r.is_past_due),
  }));
}

/* ------------------------------------------------------------------ */
/*  Cutoff analysis                                                    */
/* ------------------------------------------------------------------ */

export interface CutoffCandidate {
  vendorName: string;
  invoiceNumber?: string;
  invoiceDate: string;
  amount: number;
  expenseAccount?: string;
}

/** Run cutoff analysis: identify invoices dated <= periodEnd not yet in GL. */
export async function runCutoffAnalysis(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  periodEnd: string,
  candidates: CutoffCandidate[],
  snapshotId?: string
): Promise<CutoffItem[]> {
  assertNoAiMutationContext();

  const items: CutoffItem[] = [];
  for (const c of candidates) {
    if (new Date(c.invoiceDate) > new Date(periodEnd)) continue;

    const id = randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO tenant_ap_cutoff_items
         (id, tenant_id, close_session_id, snapshot_id, vendor_name, invoice_number, invoice_date, amount, expense_account, disposition)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'review')
       RETURNING *`,
      [id, tenantId, closeSessionId, snapshotId ?? null, c.vendorName,
       c.invoiceNumber ?? null, c.invoiceDate, round2(c.amount), c.expenseAccount ?? null]
    );
    items.push(toCutoffItem(rows[0]));
  }
  return items;
}

function toCutoffItem(r: Record<string, unknown>): CutoffItem {
  return {
    id: r.id as string, closeSessionId: r.close_session_id as string,
    snapshotId: (r.snapshot_id as string) ?? null, vendorName: r.vendor_name as string,
    invoiceNumber: (r.invoice_number as string) ?? null, invoiceDate: String(r.invoice_date),
    amount: String(r.amount), expenseAccount: (r.expense_account as string) ?? null,
    disposition: r.disposition as string, reason: (r.reason as string) ?? null,
    jeId: (r.je_id as string) ?? null,
  };
}

/** Get cutoff items for a session. */
export async function getCutoffItems(pool: Pool, tenantId: string, closeSessionId: string): Promise<CutoffItem[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tenant_ap_cutoff_items WHERE tenant_id = $1 AND close_session_id = $2 ORDER BY invoice_date`,
    [tenantId, closeSessionId]
  );
  return rows.map(toCutoffItem);
}

/** Update cutoff item disposition. */
export async function updateCutoffDisposition(
  pool: Pool, tenantId: string, itemId: string,
  disposition: 'review' | 'accrue' | 'exclude', reason?: string
): Promise<CutoffItem> {
  assertNoAiMutationContext();
  const { rows } = await pool.query(
    `UPDATE tenant_ap_cutoff_items SET disposition = $1, reason = $2, updated_at = now()
     WHERE id = $3 AND tenant_id = $4 RETURNING *`,
    [disposition, reason ?? null, itemId, tenantId]
  );
  if (rows.length === 0) throw new Error('Cutoff item not found');
  return toCutoffItem(rows[0]);
}

/** Propose AJEs for cutoff items with disposition = 'accrue'. */
export async function proposeCutoffAJEs(
  pool: Pool, tenantId: string, closeSessionId: string, createdBy: string, apAccrualAccount: string
): Promise<{ jeIds: string[] }> {
  assertNoAiMutationContext();

  const { rows } = await pool.query(
    `SELECT * FROM tenant_ap_cutoff_items
     WHERE tenant_id = $1 AND close_session_id = $2 AND disposition = 'accrue' AND je_id IS NULL
     ORDER BY invoice_date`,
    [tenantId, closeSessionId]
  );

  const jeIds: string[] = [];
  for (const r of rows) {
    const item = toCutoffItem(r);
    const amt = new Decimal(item.amount).toDecimalPlaces(2).toNumber();
    if (amt <= 0) continue;

    const expAccount = item.expenseAccount ?? '6000';
    const je = await createDraftJE(pool, {
      closeSessionId,
      tenantId,
      memo: `AP cutoff accrual: ${item.vendorName} inv ${item.invoiceNumber ?? 'N/A'} dated ${item.invoiceDate}`,
      source: 'accrual',
      createdBy,
      lines: [
        {
          accountRef: expAccount,
          debit: amt, credit: 0,
          description: `Cutoff accrual: ${item.vendorName}`,
          amountProvenance: { kind: 'engine_calculation' as const, ruleId: item.id, ruleVersion: '1', inputs: { cutoff: true } },
        },
        {
          accountRef: apAccrualAccount,
          debit: 0, credit: amt,
          description: `AP accrual: ${item.vendorName}`,
          amountProvenance: { kind: 'engine_calculation' as const, ruleId: item.id, ruleVersion: '1', inputs: { cutoff: true } },
        },
      ],
    });

    await pool.query(
      `UPDATE tenant_ap_cutoff_items SET je_id = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
      [je.id, item.id, tenantId]
    );
    jeIds.push(je.id);
  }

  return { jeIds };
}
