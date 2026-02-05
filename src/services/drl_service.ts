/**
 * Document request list (DRL): track auditor requests, link to binder/source.
 * When pool and tenantId are provided, uses tenant DB; in production no in-memory fallback.
 */

import type { Pool } from 'pg';
import type { DocumentRequest } from '../types/audit_evidence.js';
import {
  createDocumentRequest as createRepo,
  getDocumentRequest as getRepo,
  listDocumentRequests as listRepo,
  updateDocumentRequest as updateRepo,
  fulfillDocumentRequest as fulfillRepo,
} from '../db/repositories/document_request_repository.js';
import { disallowMemoryStoreInProduction } from '../lib/env.js';

const store = new Map<string, DocumentRequest>();

function uuid(): string {
  return `drl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function addDocumentRequest(
  params: {
    requestLabel: string;
    documentId?: string;
    status?: DocumentRequest['status'];
    assignee?: string;
    dueDate?: string;
  },
  pool?: Pool | null,
  tenantId?: string
): Promise<DocumentRequest> {
  if (pool && tenantId) return createRepo(pool, tenantId, params);
  const id = uuid();
  const entry: DocumentRequest = {
    id,
    requestLabel: params.requestLabel,
    documentId: params.documentId,
    status: params.status ?? 'pending',
    requestedAt: new Date().toISOString(),
    assignee: params.assignee,
    dueDate: params.dueDate,
  };
  store.set(id, entry);
  return entry;
}

/** Update DRL item (assignee, due date, status) — FW3 */
export async function updateDocumentRequest(
  id: string,
  patch: { assignee?: string; dueDate?: string; status?: DocumentRequest['status'] },
  pool?: Pool | null,
  tenantId?: string
): Promise<DocumentRequest | undefined> {
  if (pool && tenantId) {
    const r = await updateRepo(pool, id, tenantId, patch);
    return r ?? undefined;
  }
  disallowMemoryStoreInProduction({ storeName: 'document requests (DRL)', hasDurableContext: false });
  const r = store.get(id);
  if (!r) return undefined;
  if (patch.assignee !== undefined) r.assignee = patch.assignee;
  if (patch.dueDate !== undefined) r.dueDate = patch.dueDate;
  if (patch.status !== undefined) r.status = patch.status;
  return r;
}

export async function listDocumentRequests(
  status?: DocumentRequest['status'],
  pool?: Pool | null,
  tenantId?: string
): Promise<DocumentRequest[]> {
  if (pool && tenantId) return listRepo(pool, tenantId, status);
  let list = Array.from(store.values());
  if (status) list = list.filter((r) => r.status === status);
  return list;
}

export async function fulfillDocumentRequest(
  id: string,
  documentId: string,
  pool?: Pool | null,
  tenantId?: string
): Promise<DocumentRequest | undefined> {
  if (pool && tenantId) {
    const r = await fulfillRepo(pool, id, tenantId, documentId);
    return r ?? undefined;
  }
  disallowMemoryStoreInProduction({ storeName: 'document requests (DRL)', hasDurableContext: false });
  const r = store.get(id);
  if (!r) return undefined;
  r.documentId = documentId;
  r.status = 'fulfilled';
  r.fulfilledAt = new Date().toISOString();
  return r;
}
