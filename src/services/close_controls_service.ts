/**
 * FW4: Control catalogue — list of controls (id, name, owner, frequency, evidenceType).
 * Uses tenant pool when DATABASE_URL is set and pool/tenantId provided; otherwise in-memory.
 * control_evidence links rec/sampling/PBC evidence to controls.
 */

import type { Pool } from 'pg';
import { createInMemoryStore } from '../lib/inMemoryStore.js';
import type { CloseControl, ControlAssertion } from '../types/close_and_controls.js';
import { isDbConfigured } from '../db/index.js';
import * as controlRepo from '../db/repositories/close_control_repository.js';
import type { ControlEvidenceRow } from '../db/repositories/close_control_repository.js';
import * as assertionRepo from '../db/repositories/control_assertion_repository.js';
import { suggestAssertionsAgentic } from './agentic_suggest_assertions.js';

const store = createInMemoryStore<CloseControl>({ idPrefix: 'ctrl', timestamps: false });

export async function addControl(
  input: Omit<CloseControl, 'id'>,
  tenantId?: string,
  pool?: Pool
): Promise<CloseControl> {
  if (isDbConfigured() && tenantId && pool) {
    return controlRepo.createControl(pool, tenantId, input);
  }
  return store.create(input as Omit<CloseControl, 'id' | 'createdAt' | 'updatedAt'>);
}

export async function listControls(tenantId?: string, pool?: Pool): Promise<CloseControl[]> {
  if (isDbConfigured() && tenantId && pool) {
    return controlRepo.listControls(pool, tenantId);
  }
  return store.list();
}

export async function getControl(id: string, tenantId?: string, pool?: Pool): Promise<CloseControl | undefined> {
  if (isDbConfigured() && tenantId && pool) {
    const c = await controlRepo.getControl(pool, tenantId, id);
    return c ?? undefined;
  }
  return store.get(id);
}

export async function updateControl(
  id: string,
  patch: Partial<Omit<CloseControl, 'id'>>,
  tenantId?: string,
  pool?: Pool
): Promise<CloseControl | undefined> {
  if (isDbConfigured() && tenantId && pool) {
    const c = await controlRepo.updateControl(pool, tenantId, id, patch);
    return c ?? undefined;
  }
  return store.update(id, patch) ?? undefined;
}

/** Link evidence (rec/sampling/PBC) to a control. When pool/tenantId absent, no-op (returns undefined). */
export async function linkEvidenceToControl(
  tenantId: string,
  pool: Pool,
  params: { controlId: string; evidenceType: string; evidenceId: string; periodLabel: string }
): Promise<ControlEvidenceRow | undefined> {
  if (!isDbConfigured()) return undefined;
  return controlRepo.linkControlEvidence(pool, tenantId, params);
}

/** List control–evidence links for a period (for close package and audit package). */
export async function listControlEvidenceForPeriod(
  tenantId: string,
  pool: Pool,
  periodLabel: string
): Promise<ControlEvidenceRow[]> {
  if (!isDbConfigured()) return [];
  return controlRepo.listControlEvidenceByPeriod(pool, tenantId, periodLabel);
}

/** List control–evidence links for a control (optional period filter). */
export async function listControlEvidenceForControl(
  tenantId: string,
  pool: Pool,
  controlId: string,
  periodLabel?: string
): Promise<ControlEvidenceRow[]> {
  if (!isDbConfigured()) return [];
  return controlRepo.listControlEvidenceByControl(pool, tenantId, controlId, periodLabel);
}

/** Control summary for period: controls with linked evidence (for close package / audit package). */
export async function getControlEvidenceSummaryForPeriod(
  tenantId: string,
  pool: Pool,
  periodLabel: string
): Promise<{ controlId: string; evidenceCount: number; evidence: ControlEvidenceRow[] }[]> {
  const controls = await listControls(tenantId, pool);
  const evidenceByPeriod = await listControlEvidenceForPeriod(tenantId, pool, periodLabel);
  const byControl = new Map<string, ControlEvidenceRow[]>();
  for (const e of evidenceByPeriod) {
    const list = byControl.get(e.controlId) ?? [];
    list.push(e);
    byControl.set(e.controlId, list);
  }
  return controls.map((c) => ({
    controlId: c.id,
    evidenceCount: (byControl.get(c.id) ?? []).length,
    evidence: byControl.get(c.id) ?? [],
  }));
}

/** List assertions linked to a control. */
export async function listAssertionsForControl(
  tenantId: string,
  pool: Pool,
  controlId: string
): Promise<ControlAssertion[]> {
  if (!isDbConfigured()) return [];
  return assertionRepo.listAssertionsForControl(pool, tenantId, controlId);
}

/** Add assertion to a control. */
export async function addAssertionToControl(
  tenantId: string,
  pool: Pool,
  controlId: string,
  assertionLabel: string,
  riskCategory?: string
): Promise<ControlAssertion | undefined> {
  if (!isDbConfigured()) return undefined;
  return assertionRepo.addAssertion(pool, tenantId, controlId, assertionLabel, riskCategory);
}

/** Remove assertion. */
export async function removeAssertion(
  tenantId: string,
  pool: Pool,
  assertionId: string
): Promise<boolean> {
  if (!isDbConfigured()) return false;
  return assertionRepo.deleteAssertion(pool, tenantId, assertionId);
}

/** Optional agentic suggestion of assertions for a control. */
export async function suggestAssertionsForControl(
  tenantId: string,
  pool: Pool,
  controlId: string
): Promise<string[]> {
  const control = await getControl(controlId, tenantId, pool);
  if (!control) return [];
  return suggestAssertionsAgentic(control);
}
