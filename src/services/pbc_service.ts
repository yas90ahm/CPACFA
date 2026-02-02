/**
 * FW3: PBC (Provided by Client) list — items we provide to auditor, status, date provided.
 * When pool and tenantId are provided, uses tenant DB; else in-memory (dev fallback).
 */

import type { Pool } from 'pg';
import { createInMemoryStore } from '../lib/inMemoryStore.js';
import * as pbcRepo from '../db/repositories/pbc_repository.js';
import type { PBCItem } from '../types/pbc.js';

export type { PBCItem } from '../types/pbc.js';

const store = createInMemoryStore<PBCItem>({ idPrefix: 'pbc', timestamps: true });

export async function addPBCItem(
  item: Omit<PBCItem, 'id' | 'createdAt' | 'updatedAt'>,
  pool?: Pool | null,
  tenantId?: string
): Promise<PBCItem> {
  if (pool && tenantId) {
    const row = await pbcRepo.create(pool, tenantId, {
      label: item.label,
      description: item.description,
      status: item.status ?? 'pending',
      requestedAt: item.requestedAt,
      providedAt: item.providedAt,
      documentId: item.documentId,
      periodLabel: item.periodLabel,
    });
    return row as PBCItem;
  }
  return store.create(item);
}

export async function listPBCItems(
  params?: { status?: PBCItem['status']; periodLabel?: string },
  pool?: Pool | null,
  tenantId?: string
): Promise<PBCItem[]> {
  if (pool && tenantId) {
    return pbcRepo.list(pool, tenantId, params);
  }
  let list = store.list();
  if (params?.status) list = list.filter((i) => i.status === params.status);
  if (params?.periodLabel) list = list.filter((i) => i.periodLabel === params.periodLabel);
  list.sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  return list;
}

export async function getPBCItem(
  id: string,
  pool?: Pool | null,
  tenantId?: string
): Promise<PBCItem | undefined> {
  if (pool && tenantId) {
    const row = await pbcRepo.get(pool, id, tenantId);
    return row ?? undefined;
  }
  return store.get(id);
}

export async function updatePBCItem(
  id: string,
  patch: { status?: PBCItem['status']; providedAt?: string; documentId?: string },
  pool?: Pool | null,
  tenantId?: string
): Promise<PBCItem | undefined> {
  if (pool && tenantId) {
    const row = await pbcRepo.update(pool, id, tenantId, patch);
    return row ?? undefined;
  }
  return store.update(id, patch);
}
