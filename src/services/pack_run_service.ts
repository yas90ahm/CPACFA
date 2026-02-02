/**
 * Pack run store: "pack as at date" — FW2 Feature & Workflow Gaps.
 */

import type { PackRun } from '../types/reporting_packs.js';
import type { ReportPackResult } from '../types/reporting_packs.js';

const store = new Map<string, PackRun>();

function nextId(): string {
  return `packrun-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Record a pack run (call after building a pack).
 */
export function recordPackRun(params: {
  templateId: string;
  periodLabel: string;
  result: ReportPackResult;
}): PackRun {
  const id = nextId();
  const now = new Date().toISOString();
  const run: PackRun = {
    id,
    templateId: params.templateId,
    periodLabel: params.periodLabel,
    asAt: now,
    sectionCount: params.result.sections?.length ?? 0,
    generatedAt: params.result.generatedAt ?? now,
  };
  store.set(id, run);
  return run;
}

/**
 * List pack runs (optionally by period or template).
 */
export function listPackRuns(params?: {
  periodLabel?: string;
  templateId?: string;
  limit?: number;
}): PackRun[] {
  let list = Array.from(store.values());
  if (params?.periodLabel) list = list.filter((r) => r.periodLabel === params.periodLabel);
  if (params?.templateId) list = list.filter((r) => r.templateId === params.templateId);
  list.sort((a, b) => b.asAt.localeCompare(a.asAt));
  const limit = params?.limit ?? 50;
  return list.slice(0, limit);
}

/**
 * Get a single pack run by id.
 */
export function getPackRun(id: string): PackRun | undefined {
  return store.get(id);
}
