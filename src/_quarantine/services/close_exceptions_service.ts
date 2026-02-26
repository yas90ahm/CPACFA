/**
 * Close exceptions: aggregate open items for a period (checklist, recs, disclosure, DQ, DRL, PBC).
 * "What's blocking close?" in one call.
 */

import type { Pool } from 'pg';
import { getChecklist } from './checklist_store_service.js';
import { buildReconciliationTieOut } from './reconciliation_tie_out_service.js';
import { listDisclosureChecklist } from './disclosure_checklist_service.js';
import { listExceptionsForTenant } from './data_quality_exception_service.js';
import { listDocumentRequests } from './drl_service.js';
import { listPBCItems } from './pbc_service.js';

export interface CloseExceptionChecklistItem {
  id: string;
  label: string;
  status: string;
  dueDate?: string;
  assignee?: string;
}

export interface CloseExceptionRecItem {
  id: string;
  reconciliationType: string;
  status: string;
}

export interface CloseExceptionDisclosureItem {
  id: string;
  topic: string;
  status: string;
}

export interface CloseExceptionsResult {
  periodLabel: string;
  checklistOverdue: CloseExceptionChecklistItem[];
  recOpen: CloseExceptionRecItem[];
  disclosurePending: CloseExceptionDisclosureItem[];
  dataQualityExceptions?: { id: string; ruleId?: string; message?: string; severity?: string }[];
  drlPending?: { id: string; requestLabel: string; status: string }[];
  pbcPending?: { id: string; label: string; status: string }[];
}

/**
 * Get all open items / exceptions for a period.
 */
export async function getCloseExceptions(
  tenantId: string,
  periodLabel: string,
  pool: Pool | undefined
): Promise<CloseExceptionsResult> {
  const [steps, tieOut, disclosureItems, dqExceptions, drlList, pbcList] = await Promise.all([
    getChecklist(periodLabel, undefined, tenantId, pool),
    buildReconciliationTieOut(tenantId, periodLabel, pool),
    listDisclosureChecklist(periodLabel, undefined, tenantId, pool),
    pool ? listExceptionsForTenant(pool, tenantId, { periodLabel, status: 'open', limit: 100 }) : Promise.resolve([]),
    listDocumentRequests(undefined, pool ?? null, tenantId),
    listPBCItems({ periodLabel, status: 'pending' }, pool ?? null, tenantId),
  ]);

  const checklistOverdue = steps
    .filter((s) => s.status !== 'completed' && s.status !== 'skipped')
    .map((s) => ({
      id: s.id,
      label: s.label,
      status: s.status,
      dueDate: s.dueDate,
      assignee: s.assignee,
    }));

  const recOpen = tieOut.openOrPending.map((r) => ({
    id: r.id,
    reconciliationType: r.reconciliationType,
    status: r.status,
  }));

  const disclosurePending = disclosureItems
    .filter((d) => d.status !== 'complete')
    .map((d) => ({
      id: d.id,
      topic: d.topic,
      status: d.status,
    }));

  const drlPending = drlList
    .filter((r) => r.status === 'pending' || r.status === 'in_progress' || r.status === 'partial')
    .map((r) => ({ id: r.id, requestLabel: r.requestLabel, status: r.status }));

  const pbcPending = pbcList.map((p) => ({ id: p.id, label: p.label, status: p.status }));

  return {
    periodLabel,
    checklistOverdue,
    recOpen,
    disclosurePending,
    dataQualityExceptions: dqExceptions.length > 0
      ? dqExceptions.map((e) => ({ id: e.id, ruleId: e.ruleId, message: e.message, severity: e.severity }))
      : undefined,
    drlPending: drlPending.length > 0 ? drlPending : undefined,
    pbcPending: pbcPending.length > 0 ? pbcPending : undefined,
  };
}
