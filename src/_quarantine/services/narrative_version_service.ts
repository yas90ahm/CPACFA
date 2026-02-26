/**
 * FW2: Narrative versioning — store MD&A / one-pager with asAt and periodLabel for "narrative as at date".
 */

export interface NarrativeVersion {
  id: string;
  type: 'mda' | 'one_pager' | 'board_deck';
  periodLabel: string;
  asAt: string; // ISO
  content: string | Record<string, unknown>; // narrative text or structured (e.g. MD&A sections)
  createdAt: string;
}

const store = new Map<string, NarrativeVersion>();

function nextId(): string {
  return `narr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function storeNarrativeVersion(params: {
  type: NarrativeVersion['type'];
  periodLabel: string;
  content: string | Record<string, unknown>;
  asAt?: string;
}): NarrativeVersion {
  const id = nextId();
  const now = new Date().toISOString();
  const asAt = params.asAt ?? now;
  const entry: NarrativeVersion = {
    id,
    type: params.type,
    periodLabel: params.periodLabel,
    asAt,
    content: params.content,
    createdAt: now,
  };
  store.set(id, entry);
  return { ...entry };
}

export function listNarrativeVersions(params?: {
  type?: NarrativeVersion['type'];
  periodLabel?: string;
  from?: string;
  to?: string;
  limit?: number;
}): NarrativeVersion[] {
  let list = Array.from(store.values());
  if (params?.type) list = list.filter((n) => n.type === params.type);
  if (params?.periodLabel) list = list.filter((n) => n.periodLabel === params.periodLabel);
  if (params?.from) list = list.filter((n) => n.asAt >= params.from!);
  if (params?.to) list = list.filter((n) => n.asAt <= params.to!);
  list.sort((a, b) => b.asAt.localeCompare(a.asAt));
  const limit = params?.limit ?? 50;
  return list.slice(0, limit).map((n) => ({ ...n }));
}

export function getNarrativeVersion(id: string): NarrativeVersion | undefined {
  const n = store.get(id);
  return n ? { ...n } : undefined;
}
