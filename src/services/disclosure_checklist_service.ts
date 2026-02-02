/**
 * Disclosure checklist — list by period/framework or citation, update status/evidence.
 * Uses tenant DB when pool/tenantId provided; else in-memory.
 * Per-GAAP default topic sets: US_GAAP (ASC), IFRS (IAS/IFRS), ASPE, FRS 102.
 */

import type { Pool } from 'pg';
import type { DisclosureItem, DisclosureItemStatus } from '../types/disclosure_checklist.js';
import type { AccountingStandard } from '../constants/accounting/index.js';
import { isDbConfigured } from '../db/index.js';
import * as disclosureRepo from '../db/repositories/disclosure_checklist_repository.js';

type SeedItem = Omit<DisclosureItem, 'id' | 'periodLabel'>;

const FRAMEWORKS: AccountingStandard[] = ['US_GAAP', 'IFRS', 'ASPE', 'FRS102'];

const DEFAULT_TOPICS_US_GAAP: SeedItem[] = [
  { standard: 'ASC 205', topic: 'Discontinued operations', description: 'Disclosure of discontinued operations', status: 'not_started', framework: 'US_GAAP' },
  { standard: 'ASC 205', topic: 'Segment reporting', description: 'Segment information disclosure', status: 'not_started', framework: 'US_GAAP' },
  { standard: 'ASC 210', topic: 'Balance sheet classification', description: 'Current vs non-current classification', status: 'not_started', framework: 'US_GAAP' },
  { standard: 'ASC 210', topic: 'Liquidity and capital resources', description: 'Liquidity and capital resources disclosure', status: 'not_started', framework: 'US_GAAP' },
  { standard: 'ASC 220', topic: 'Comprehensive income', description: 'Comprehensive income disclosure', status: 'not_started', framework: 'US_GAAP' },
  { standard: 'ASC 220', topic: 'Reclassification adjustments', description: 'Reclassification adjustments out of OCI', status: 'not_started', framework: 'US_GAAP' },
];

const DEFAULT_TOPICS_IFRS: SeedItem[] = [
  { standard: 'IAS 1', topic: 'Presentation of financial statements', description: 'Fair presentation and compliance with IFRS', status: 'not_started', framework: 'IFRS' },
  { standard: 'IAS 1', topic: 'Statement of financial position', description: 'Current vs non-current classification', status: 'not_started', framework: 'IFRS' },
  { standard: 'IAS 1', topic: 'Comprehensive income', description: 'OCI and reclassification disclosure', status: 'not_started', framework: 'IFRS' },
  { standard: 'IFRS 8', topic: 'Segment reporting', description: 'Operating segments and entity-wide disclosures', status: 'not_started', framework: 'IFRS' },
  { standard: 'IFRS 8', topic: 'Segment reconciliation', description: 'Reconciliation of segment totals to entity amounts', status: 'not_started', framework: 'IFRS' },
];

const DEFAULT_TOPICS_ASPE: SeedItem[] = [
  { standard: 'ASPE 1500', topic: 'First-time adoption', description: 'Disclosure of accounting policies and transition', status: 'not_started', framework: 'ASPE' },
  { standard: 'ASPE 1500', topic: 'Financial statement presentation', description: 'Balance sheet and income statement disclosure', status: 'not_started', framework: 'ASPE' },
  { standard: 'ASPE 1505', topic: 'Disclosure of accounting policies', description: 'Significant accounting policies', status: 'not_started', framework: 'ASPE' },
  { standard: 'ASPE 3065', topic: 'Leases', description: 'Future minimum lease payments and commitments', status: 'not_started', framework: 'ASPE' },
];

const DEFAULT_TOPICS_FRS102: SeedItem[] = [
  { standard: 'FRS 102 Section 3', topic: 'Financial statement presentation', description: 'Presentation and disclosure requirements', status: 'not_started', framework: 'FRS102' },
  { standard: 'FRS 102 Section 3', topic: 'Accounting policies', description: 'Significant accounting policies disclosure', status: 'not_started', framework: 'FRS102' },
  { standard: 'FRS 102 Section 6', topic: 'Consolidated and separate financial statements', description: 'Segment and consolidation disclosure', status: 'not_started', framework: 'FRS102' },
  { standard: 'FRS 102 Section 20', topic: 'Leases', description: 'Future minimum lease payments', status: 'not_started', framework: 'FRS102' },
];

function getDefaultTopics(framework: AccountingStandard): SeedItem[] {
  switch (framework) {
    case 'US_GAAP': return DEFAULT_TOPICS_US_GAAP;
    case 'IFRS': return DEFAULT_TOPICS_IFRS;
    case 'ASPE': return DEFAULT_TOPICS_ASPE;
    case 'FRS102': return DEFAULT_TOPICS_FRS102;
    default: return DEFAULT_TOPICS_US_GAAP;
  }
}

/** When standard param is one of these, treat as framework; otherwise treat as citation filter. */
function isFramework(value: string): value is AccountingStandard {
  return FRAMEWORKS.includes(value as AccountingStandard);
}

const store = new Map<string, DisclosureItem>();
let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `disc-${Date.now()}-${idCounter}`;
}

function key(periodLabel: string, id: string): string {
  return `${periodLabel}:${id}`;
}

function seedForPeriodInMemory(periodLabel: string, framework: AccountingStandard = 'US_GAAP'): DisclosureItem[] {
  const topics = getDefaultTopics(framework);
  const items: DisclosureItem[] = [];
  for (const t of topics) {
    const id = nextId();
    const item: DisclosureItem = { ...t, id, periodLabel };
    items.push(item);
    store.set(key(periodLabel, id), item);
  }
  return items;
}

/**
 * List disclosure checklist items by period (and optional standard).
 * standard: when US_GAAP|IFRS|ASPE|FRS102, filter by framework; otherwise filter by citation (legacy).
 * Seeds per-GAAP default topics when none exist for the requested framework.
 */
export async function listDisclosureChecklist(
  periodLabel: string,
  standard?: string,
  tenantId?: string,
  pool?: Pool
): Promise<DisclosureItem[]> {
  const options: disclosureRepo.ListDisclosureOptions | undefined =
    standard == null
      ? undefined
      : isFramework(standard)
        ? { framework: standard }
        : { citation: standard };

  if (isDbConfigured() && tenantId && pool) {
    let items = await disclosureRepo.list(pool, tenantId, periodLabel, options);
    if (items.length === 0) {
      const frameworkToSeed = options?.framework ?? 'US_GAAP';
      const topics = getDefaultTopics(frameworkToSeed as AccountingStandard);
      for (const t of topics) {
        if (options?.framework && t.framework !== options.framework) continue;
        if (options?.citation && t.standard !== options.citation) continue;
        const created = await disclosureRepo.create(pool, tenantId, { ...t, periodLabel });
        items.push(created);
      }
      items = items.sort((a, b) => (a.framework ?? '').localeCompare(b.framework ?? '') || a.standard.localeCompare(b.standard) || a.topic.localeCompare(b.topic));
    }
    return items;
  }
  const existing = Array.from(store.values()).filter((i) => {
    if (i.periodLabel !== periodLabel) return false;
    if (options?.framework) return i.framework === options.framework;
    if (options?.citation) return i.standard === options.citation;
    return true;
  });
  if (existing.length === 0) {
    const frameworkToSeed = (options?.framework as AccountingStandard) ?? 'US_GAAP';
    const seeded = seedForPeriodInMemory(periodLabel, frameworkToSeed);
    if (options?.framework) return seeded.filter((i) => i.framework === options.framework);
    if (options?.citation) return seeded.filter((i) => i.standard === options.citation);
    return seeded;
  }
  return existing;
}

/**
 * Get one disclosure item by id (and periodLabel for in-memory key).
 */
export async function getDisclosureItem(
  id: string,
  periodLabel: string,
  tenantId?: string,
  pool?: Pool
): Promise<DisclosureItem | undefined> {
  if (isDbConfigured() && tenantId && pool) {
    const r = await disclosureRepo.get(pool, tenantId, id);
    return r ?? undefined;
  }
  return store.get(key(periodLabel, id));
}

/**
 * Update disclosure item status and/or evidence.
 */
export async function updateDisclosureStep(
  id: string,
  periodLabel: string,
  patch: { status?: DisclosureItemStatus; evidenceId?: string; evidenceType?: DisclosureItem['evidenceType']; assignee?: string; dueDate?: string },
  tenantId?: string,
  pool?: Pool
): Promise<DisclosureItem | undefined> {
  if (isDbConfigured() && tenantId && pool) {
    const out = await disclosureRepo.update(pool, tenantId, id, patch);
    return out ?? undefined;
  }
  const item = store.get(key(periodLabel, id));
  if (!item) return undefined;
  if (patch.status != null) item.status = patch.status;
  if (patch.evidenceId !== undefined) item.evidenceId = patch.evidenceId;
  if (patch.evidenceType !== undefined) item.evidenceType = patch.evidenceType;
  if (patch.assignee !== undefined) item.assignee = patch.assignee;
  if (patch.dueDate !== undefined) item.dueDate = patch.dueDate;
  return { ...item };
}
