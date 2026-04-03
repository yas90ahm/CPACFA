/**
 * Inventory Obsolescence Reserve Service — ASC 330
 * Aging analysis, reserve computation, and AJE proposal for inventory write-downs.
 * All monetary computation via Decimal.js. AI boundary enforced on all write paths.
 */

import type { Pool } from 'pg';
import Decimal from 'decimal.js';
import { assertNoAiMutationContext } from '../lib/ai_boundary.js';
import { createDraftJE } from './journal_entry_service.js';
import { round2 } from '../utils/decimal.js';

Decimal.set({ precision: 28 });

// ============================================================================
// Types
// ============================================================================

export interface InventoryAgingRow {
  id: string;
  tenantId: string;
  entityId: string;
  closeSessionId: string;
  snapshotId: string;
  itemCode: string;
  description: string;
  quantity: string;
  unitCost: string;
  totalCost: string;
  lastMovementDate: string | null;
  daysSinceMovement: number;
  agingBucket: 'current' | '91_180' | '181_365' | 'over_365';
  createdAt: string;
}

export interface InventoryReserveConfig {
  id: string;
  tenantId: string;
  entityId: string;
  rateCurrent: string;
  rate91_180: string;
  rate181_365: string;
  rateOver365: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryReserveComputation {
  id: string;
  tenantId: string;
  entityId: string;
  closeSessionId: string;
  snapshotId: string;
  totalInventory: string;
  bucketCurrent: string;
  bucket91_180: string;
  bucket181_365: string;
  bucketOver365: string;
  reserveCurrent: string;
  reserve91_180: string;
  reserve181_365: string;
  reserveOver365: string;
  requiredReserve: string;
  currentGlReserve: string;
  adjustmentNeeded: string;
  journalEntryId: string | null;
  createdAt: string;
}

export interface AgingSummary {
  snapshotId: string;
  totalItems: number;
  totalInventory: string;
  buckets: {
    current: { count: number; total: string };
    '91_180': { count: number; total: string };
    '181_365': { count: number; total: string };
    over_365: { count: number; total: string };
  };
  items: InventoryAgingRow[];
}

// ============================================================================
// Aging bucket classification
// ============================================================================

function classifyBucket(daysSinceMovement: number): InventoryAgingRow['agingBucket'] {
  if (daysSinceMovement <= 90) return 'current';
  if (daysSinceMovement <= 180) return '91_180';
  if (daysSinceMovement <= 365) return '181_365';
  return 'over_365';
}

// ============================================================================
// Import Inventory Aging
// ============================================================================

/**
 * Parse CSV buffer and import inventory aging snapshot.
 * Expected columns: item_code, description, quantity, unit_cost, total_cost, last_movement_date
 */
export async function importInventoryAging(
  pool: Pool,
  tenantId: string,
  entityId: string,
  closeSessionId: string,
  csvBuffer: Buffer
): Promise<AgingSummary> {
  assertNoAiMutationContext();

  const text = csvBuffer.toString('utf-8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

  const header = lines[0]!.toLowerCase();
  const cols = header.split(',').map((c) => c.trim());
  const idx = {
    itemCode: cols.indexOf('item_code'),
    description: cols.indexOf('description'),
    quantity: cols.indexOf('quantity'),
    unitCost: cols.indexOf('unit_cost'),
    totalCost: cols.indexOf('total_cost'),
    lastMovementDate: cols.indexOf('last_movement_date'),
  };

  if (idx.itemCode < 0 || idx.quantity < 0 || idx.unitCost < 0 || idx.totalCost < 0) {
    throw new Error('CSV must contain columns: item_code, quantity, unit_cost, total_cost');
  }

  const snapshotId = crypto.randomUUID();
  const now = new Date();
  const rows: InventoryAgingRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i]!.split(',').map((p) => p.trim());
    const itemCode = parts[idx.itemCode] ?? '';
    if (!itemCode) continue;

    const description = idx.description >= 0 ? (parts[idx.description] ?? '') : '';
    const quantity = parts[idx.quantity] ?? '0';
    const unitCost = parts[idx.unitCost] ?? '0';
    const totalCost = parts[idx.totalCost] ?? '0';
    const lastMovementDateStr = idx.lastMovementDate >= 0 ? (parts[idx.lastMovementDate] ?? '') : '';

    let daysSinceMovement = 0;
    let lastMovementDate: string | null = null;
    if (lastMovementDateStr) {
      const movDate = new Date(lastMovementDateStr);
      if (!isNaN(movDate.getTime())) {
        lastMovementDate = movDate.toISOString().slice(0, 10);
        daysSinceMovement = Math.floor((now.getTime() - movDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceMovement < 0) daysSinceMovement = 0;
      }
    }

    const agingBucket = classifyBucket(daysSinceMovement);

    await pool.query(
      `INSERT INTO tenant_inventory_aging
        (tenant_id, entity_id, close_session_id, snapshot_id, item_code, description,
         quantity, unit_cost, total_cost, last_movement_date, days_since_movement, aging_bucket)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [tenantId, entityId, closeSessionId, snapshotId, itemCode, description,
       quantity, unitCost, totalCost, lastMovementDate, daysSinceMovement, agingBucket]
    );

    rows.push({
      id: '',
      tenantId,
      entityId,
      closeSessionId,
      snapshotId,
      itemCode,
      description,
      quantity,
      unitCost,
      totalCost,
      lastMovementDate,
      daysSinceMovement,
      agingBucket,
      createdAt: now.toISOString(),
    });
  }

  return buildAgingSummary(snapshotId, rows);
}

function buildAgingSummary(snapshotId: string, rows: InventoryAgingRow[]): AgingSummary {
  const buckets = {
    current: { count: 0, total: new Decimal(0) },
    '91_180': { count: 0, total: new Decimal(0) },
    '181_365': { count: 0, total: new Decimal(0) },
    over_365: { count: 0, total: new Decimal(0) },
  };

  let totalInventory = new Decimal(0);

  for (const row of rows) {
    const cost = new Decimal(row.totalCost);
    totalInventory = totalInventory.plus(cost);
    const bucket = row.agingBucket === 'over_365' ? 'over_365' : row.agingBucket;
    buckets[bucket].count += 1;
    buckets[bucket].total = buckets[bucket].total.plus(cost);
  }

  return {
    snapshotId,
    totalItems: rows.length,
    totalInventory: totalInventory.toDecimalPlaces(2).toFixed(2),
    buckets: {
      current: { count: buckets.current.count, total: buckets.current.total.toDecimalPlaces(2).toFixed(2) },
      '91_180': { count: buckets['91_180'].count, total: buckets['91_180'].total.toDecimalPlaces(2).toFixed(2) },
      '181_365': { count: buckets['181_365'].count, total: buckets['181_365'].total.toDecimalPlaces(2).toFixed(2) },
      over_365: { count: buckets.over_365.count, total: buckets.over_365.total.toDecimalPlaces(2).toFixed(2) },
    },
    items: rows,
  };
}

// ============================================================================
// Compute Reserve
// ============================================================================

/**
 * Compute required inventory obsolescence reserve by applying configured rates to aging buckets.
 * All arithmetic via Decimal.js.
 */
export async function computeReserve(
  pool: Pool,
  tenantId: string,
  entityId: string,
  closeSessionId: string,
  snapshotId: string
): Promise<InventoryReserveComputation> {
  assertNoAiMutationContext();

  // Load aging rows for this snapshot
  const agingRes = await pool.query(
    `SELECT aging_bucket, SUM(total_cost) AS bucket_total
     FROM tenant_inventory_aging
     WHERE tenant_id = $1 AND snapshot_id = $2
     GROUP BY aging_bucket`,
    [tenantId, snapshotId]
  );

  const bucketTotals: Record<string, Decimal> = {
    current: new Decimal(0),
    '91_180': new Decimal(0),
    '181_365': new Decimal(0),
    over_365: new Decimal(0),
  };

  for (const row of agingRes.rows) {
    const bucket = row.aging_bucket as string;
    bucketTotals[bucket] = new Decimal(row.bucket_total ?? 0);
  }

  // Load config
  const config = await getReserveConfig(pool, tenantId, entityId);
  const rateCurrent = new Decimal(config.rateCurrent);
  const rate91 = new Decimal(config.rate91_180);
  const rate181 = new Decimal(config.rate181_365);
  const rateOver = new Decimal(config.rateOver365);

  // Compute reserve per bucket
  const reserveCurrent = bucketTotals.current!.mul(rateCurrent).toDecimalPlaces(2);
  const reserve91 = bucketTotals['91_180']!.mul(rate91).toDecimalPlaces(2);
  const reserve181 = bucketTotals['181_365']!.mul(rate181).toDecimalPlaces(2);
  const reserveOver = bucketTotals.over_365!.mul(rateOver).toDecimalPlaces(2);

  const requiredReserve = reserveCurrent.plus(reserve91).plus(reserve181).plus(reserveOver).toDecimalPlaces(2);

  const totalInventory = bucketTotals.current!
    .plus(bucketTotals['91_180']!)
    .plus(bucketTotals['181_365']!)
    .plus(bucketTotals.over_365!)
    .toDecimalPlaces(2);

  // Pull current reserve from GL (look for existing reserve balance)
  const glRes = await pool.query(
    `SELECT COALESCE(SUM(current_gl_reserve), 0) AS gl_reserve
     FROM tenant_inventory_reserve_computations
     WHERE tenant_id = $1 AND entity_id = $2 AND close_session_id = $3
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, entityId, closeSessionId]
  );
  const currentGlReserve = new Decimal(glRes.rows[0]?.gl_reserve ?? 0);

  // Insert computation
  const insertRes = await pool.query(
    `INSERT INTO tenant_inventory_reserve_computations
       (tenant_id, entity_id, close_session_id, snapshot_id,
        total_inventory, bucket_current, bucket_91_180, bucket_181_365, bucket_over_365,
        reserve_current, reserve_91_180, reserve_181_365, reserve_over_365,
        required_reserve, current_gl_reserve)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      tenantId, entityId, closeSessionId, snapshotId,
      totalInventory.toFixed(2),
      bucketTotals.current!.toFixed(2),
      bucketTotals['91_180']!.toFixed(2),
      bucketTotals['181_365']!.toFixed(2),
      bucketTotals.over_365!.toFixed(2),
      reserveCurrent.toFixed(2),
      reserve91.toFixed(2),
      reserve181.toFixed(2),
      reserveOver.toFixed(2),
      requiredReserve.toFixed(2),
      currentGlReserve.toFixed(2),
    ]
  );

  return mapComputationRow(insertRes.rows[0]);
}

// ============================================================================
// Propose Reserve AJE
// ============================================================================

/**
 * If adjustment_needed != 0, propose a draft journal entry:
 *   Debit: Inventory Write-Down Expense
 *   Credit: Inventory Obsolescence Reserve
 */
export async function proposeReserveAJE(
  pool: Pool,
  tenantId: string,
  entityId: string,
  closeSessionId: string,
  computationId: string
): Promise<{ journalEntryId: string | null; adjustmentNeeded: string }> {
  assertNoAiMutationContext();

  const res = await pool.query(
    `SELECT * FROM tenant_inventory_reserve_computations WHERE id = $1 AND tenant_id = $2`,
    [computationId, tenantId]
  );
  if (res.rows.length === 0) throw new Error('Computation not found');
  const comp = mapComputationRow(res.rows[0]);

  const adj = new Decimal(comp.adjustmentNeeded);
  if (adj.isZero()) {
    return { journalEntryId: null, adjustmentNeeded: '0.00' };
  }

  const absAdj = adj.abs().toDecimalPlaces(2).toNumber();
  const isIncrease = adj.greaterThan(0);

  const je = await createDraftJE(pool, {
    closeSessionId,
    tenantId,
    memo: `ASC 330 inventory obsolescence reserve adjustment — ${isIncrease ? 'increase' : 'decrease'} of ${adj.toFixed(2)}`,
    source: 'manual',
    lines: isIncrease
      ? [
          { accountRef: '5900', debit: absAdj, credit: 0, description: 'Inventory write-down expense',
            amountProvenance: { kind: 'engine_calculation' as const, ruleId: `inventory_reserve_${computationId}`, ruleVersion: '1', inputs: { computationId, adjustmentNeeded: adj.toFixed(2), direction: 'increase' } } },
          { accountRef: '1299', debit: 0, credit: absAdj, description: 'Inventory obsolescence reserve',
            amountProvenance: { kind: 'engine_calculation' as const, ruleId: `inventory_reserve_${computationId}`, ruleVersion: '1', inputs: { computationId, adjustmentNeeded: adj.toFixed(2), direction: 'increase' } } },
        ]
      : [
          { accountRef: '1299', debit: absAdj, credit: 0, description: 'Inventory obsolescence reserve reversal',
            amountProvenance: { kind: 'engine_calculation' as const, ruleId: `inventory_reserve_${computationId}`, ruleVersion: '1', inputs: { computationId, adjustmentNeeded: adj.toFixed(2), direction: 'decrease' } } },
          { accountRef: '5900', debit: 0, credit: absAdj, description: 'Inventory write-down expense reversal',
            amountProvenance: { kind: 'engine_calculation' as const, ruleId: `inventory_reserve_${computationId}`, ruleVersion: '1', inputs: { computationId, adjustmentNeeded: adj.toFixed(2), direction: 'decrease' } } },
        ],
  });

  await pool.query(
    `UPDATE tenant_inventory_reserve_computations SET journal_entry_id = $1 WHERE id = $2`,
    [je.id, computationId]
  );

  return { journalEntryId: je.id, adjustmentNeeded: adj.toFixed(2) };
}

// ============================================================================
// Reserve Config CRUD
// ============================================================================

export async function getReserveConfig(
  pool: Pool,
  tenantId: string,
  entityId: string
): Promise<InventoryReserveConfig> {
  const res = await pool.query(
    `SELECT * FROM tenant_inventory_reserve_config WHERE tenant_id = $1 AND entity_id = $2`,
    [tenantId, entityId]
  );
  if (res.rows.length > 0) return mapConfigRow(res.rows[0]);

  // Return defaults if no config exists
  return {
    id: '',
    tenantId,
    entityId,
    rateCurrent: '0.0000',
    rate91_180: '0.2500',
    rate181_365: '0.5000',
    rateOver365: '1.0000',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function updateReserveConfig(
  pool: Pool,
  tenantId: string,
  entityId: string,
  config: { rateCurrent?: string; rate91_180?: string; rate181_365?: string; rateOver365?: string }
): Promise<InventoryReserveConfig> {
  assertNoAiMutationContext();

  const res = await pool.query(
    `INSERT INTO tenant_inventory_reserve_config (tenant_id, entity_id, rate_current, rate_91_180, rate_181_365, rate_over_365)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, entity_id) DO UPDATE SET
       rate_current = COALESCE($3, tenant_inventory_reserve_config.rate_current),
       rate_91_180 = COALESCE($4, tenant_inventory_reserve_config.rate_91_180),
       rate_181_365 = COALESCE($5, tenant_inventory_reserve_config.rate_181_365),
       rate_over_365 = COALESCE($6, tenant_inventory_reserve_config.rate_over_365),
       updated_at = now()
     RETURNING *`,
    [
      tenantId, entityId,
      config.rateCurrent ?? '0.0000',
      config.rate91_180 ?? '0.2500',
      config.rate181_365 ?? '0.5000',
      config.rateOver365 ?? '1.0000',
    ]
  );
  return mapConfigRow(res.rows[0]);
}

// ============================================================================
// Get Inventory Reserve (summary for session)
// ============================================================================

export async function getInventoryReserve(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<{ computations: InventoryReserveComputation[]; aging: AgingSummary | null }> {
  const compRes = await pool.query(
    `SELECT * FROM tenant_inventory_reserve_computations
     WHERE tenant_id = $1 AND close_session_id = $2
     ORDER BY created_at DESC`,
    [tenantId, closeSessionId]
  );
  const computations = compRes.rows.map(mapComputationRow);

  if (computations.length === 0) return { computations: [], aging: null };

  const latestSnapshotId = computations[0]!.snapshotId;
  const agingRes = await pool.query(
    `SELECT * FROM tenant_inventory_aging
     WHERE tenant_id = $1 AND snapshot_id = $2
     ORDER BY days_since_movement DESC`,
    [tenantId, latestSnapshotId]
  );

  const items = agingRes.rows.map(mapAgingRow);
  const aging = buildAgingSummary(latestSnapshotId, items);

  return { computations, aging };
}

// ============================================================================
// Row mappers
// ============================================================================

function mapAgingRow(row: Record<string, unknown>): InventoryAgingRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    entityId: row.entity_id as string,
    closeSessionId: row.close_session_id as string,
    snapshotId: row.snapshot_id as string,
    itemCode: row.item_code as string,
    description: (row.description ?? '') as string,
    quantity: String(row.quantity ?? 0),
    unitCost: String(row.unit_cost ?? 0),
    totalCost: String(row.total_cost ?? 0),
    lastMovementDate: row.last_movement_date ? String(row.last_movement_date).slice(0, 10) : null,
    daysSinceMovement: Number(row.days_since_movement ?? 0),
    agingBucket: row.aging_bucket as InventoryAgingRow['agingBucket'],
    createdAt: String(row.created_at),
  };
}

function mapConfigRow(row: Record<string, unknown>): InventoryReserveConfig {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    entityId: row.entity_id as string,
    rateCurrent: String(row.rate_current ?? '0.0000'),
    rate91_180: String(row.rate_91_180 ?? '0.2500'),
    rate181_365: String(row.rate_181_365 ?? '0.5000'),
    rateOver365: String(row.rate_over_365 ?? '1.0000'),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapComputationRow(row: Record<string, unknown>): InventoryReserveComputation {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    entityId: row.entity_id as string,
    closeSessionId: row.close_session_id as string,
    snapshotId: row.snapshot_id as string,
    totalInventory: String(row.total_inventory ?? 0),
    bucketCurrent: String(row.bucket_current ?? 0),
    bucket91_180: String(row.bucket_91_180 ?? 0),
    bucket181_365: String(row.bucket_181_365 ?? 0),
    bucketOver365: String(row.bucket_over_365 ?? 0),
    reserveCurrent: String(row.reserve_current ?? 0),
    reserve91_180: String(row.reserve_91_180 ?? 0),
    reserve181_365: String(row.reserve_181_365 ?? 0),
    reserveOver365: String(row.reserve_over_365 ?? 0),
    requiredReserve: String(row.required_reserve ?? 0),
    currentGlReserve: String(row.current_gl_reserve ?? 0),
    adjustmentNeeded: String(row.adjustment_needed ?? 0),
    journalEntryId: (row.journal_entry_id as string) ?? null,
    createdAt: String(row.created_at),
  };
}
