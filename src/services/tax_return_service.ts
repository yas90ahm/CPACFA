/**
 * STATUS: UNWIRED — This service compiles but is not imported by any active route.
 * It exists as potential future functionality.
 * Last verified: 2026-02-25
 * To activate: Create a route file that imports this service and register it in server.ts
 */

/**
 * Tax return workflow: create, list, update status, attach provision.
 */

import type { Pool } from 'pg';
import type { TaxReturn, TaxReturnStatus, TaxReturnType } from '../types/tax_statutory.js';
import {
  createTaxReturn as createRepo,
  getTaxReturn,
  listTaxReturns,
  updateTaxReturnStatus,
  attachTaxReturnProvision,
} from '../db/repositories/tax_return_repository.js';

export async function createReturn(
  pool: Pool,
  tenantId: string,
  ret: Omit<TaxReturn, 'id' | 'createdAt' | 'updatedAt'>
): Promise<TaxReturn> {
  return createRepo(pool, tenantId, ret);
}

export async function getReturn(
  pool: Pool,
  id: string,
  tenantId: string
): Promise<TaxReturn | null> {
  return getTaxReturn(pool, id, tenantId);
}

export async function listReturns(
  pool: Pool,
  tenantId: string,
  params?: { entityId?: string; jurisdiction?: string; periodLabel?: string; status?: TaxReturnStatus }
): Promise<TaxReturn[]> {
  return listTaxReturns(pool, tenantId, params);
}

export async function updateReturnStatus(
  pool: Pool,
  id: string,
  tenantId: string,
  update: { status: TaxReturnStatus; filedAt?: string }
): Promise<TaxReturn | null> {
  return updateTaxReturnStatus(pool, id, tenantId, update);
}

export async function attachProvision(
  pool: Pool,
  id: string,
  tenantId: string,
  provisionSnapshot: Record<string, unknown>,
  priorYearFigures?: Record<string, unknown>
): Promise<TaxReturn | null> {
  return attachTaxReturnProvision(pool, id, tenantId, provisionSnapshot, priorYearFigures);
}

/** List returns due within reminder window (status = draft) */
export async function listUpcomingReturns(
  pool: Pool,
  tenantId: string,
  reminderDays: number = 30
): Promise<TaxReturn[]> {
  const fromDate = new Date();
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + reminderDays);
  const list = await listTaxReturns(pool, tenantId, { status: 'draft' });
  return list.filter((r) => r.dueDate >= fromDate.toISOString().slice(0, 10) && r.dueDate <= toDate.toISOString().slice(0, 10));
}
