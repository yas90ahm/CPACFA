/**
 * Policy Memory — entity-level accounting policy decisions (agentic, non-hardcoded).
 * Stores selected standard, overrides, and user-approved corrections.
 * When pool and tenantId are provided, persists to DB; otherwise in-memory only (e.g. no tenant context).
 */

import type { Pool } from 'pg';
import * as repo from '../db/repositories/policy_memory_repository.js';

export interface PolicyMemoryRecord {
  entityId: string;
  standard?: 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP';
  country?: string;
  jurisdiction?: string;
  currency?: string;
  taxId?: string;
  businessNumber?: string;
  /** When reporting country is Canada: true → IFRS (publicly accountable), false/omit → ASPE. */
  publiclyAccountable?: boolean;
  fiscalYear?: string;
  overrides?: Record<string, string>;
  updatedAt: string;
}

export interface PolicyMemoryOptions {
  pool: Pool;
  tenantId: string;
}

const inMemoryStore = new Map<string, PolicyMemoryRecord>();

function keyFor(entityId: string, fiscalYear?: string): string {
  return fiscalYear ? `${entityId}::${fiscalYear}` : entityId;
}

export async function getPolicyMemory(
  entityId: string,
  fiscalYear?: string,
  options?: PolicyMemoryOptions
): Promise<PolicyMemoryRecord | null> {
  if (options?.pool && options?.tenantId) {
    const fromDb = await repo.getPolicyMemoryFromDb(options.pool, options.tenantId, entityId, fiscalYear);
    if (fromDb) return fromDb;
    const fromMem = inMemoryStore.get(keyFor(entityId, fiscalYear)) ?? null;
    return fromMem;
  }
  return inMemoryStore.get(keyFor(entityId, fiscalYear)) ?? null;
}

export async function setPolicyMemory(
  record: PolicyMemoryRecord,
  options?: PolicyMemoryOptions
): Promise<void> {
  const updated = { ...record, updatedAt: new Date().toISOString() };
  const key = keyFor(record.entityId, record.fiscalYear);
  inMemoryStore.set(key, updated);
  if (options?.pool && options?.tenantId) {
    await repo.setPolicyMemoryInDb(options.pool, options.tenantId, updated);
  }
}

export async function updatePolicyMemory(
  entityId: string,
  patch: Partial<PolicyMemoryRecord>,
  fiscalYear?: string,
  options?: PolicyMemoryOptions
): Promise<void> {
  const existing = options?.pool && options?.tenantId
    ? await repo.getPolicyMemoryFromDb(options.pool, options.tenantId, entityId, fiscalYear)
    : inMemoryStore.get(keyFor(entityId, fiscalYear)) ?? null;
  const merged: PolicyMemoryRecord = {
    ...existing,
    ...patch,
    entityId,
    fiscalYear,
    standard: patch.standard ?? existing?.standard,
    overrides: { ...(existing?.overrides ?? {}), ...(patch.overrides ?? {}) },
    updatedAt: new Date().toISOString(),
  };
  const key = keyFor(entityId, fiscalYear);
  inMemoryStore.set(key, merged);
  if (options?.pool && options?.tenantId) {
    await repo.updatePolicyMemoryInDb(options.pool, options.tenantId, entityId, patch, fiscalYear);
  }
}
