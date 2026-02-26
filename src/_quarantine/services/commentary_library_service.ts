/**
 * Commentary library: reusable variance snippets for narrative generation.
 */

import type { CommentarySnippet } from '../types/reporting_packs.js';

const store = new Map<string, CommentarySnippet>();

const DEFAULTS: CommentarySnippet[] = [
  { id: 'rev-volume', label: 'Revenue down on volume', text: 'Revenue decreased primarily due to lower volume.', tags: ['revenue', 'volume'] },
  { id: 'rev-price', label: 'Revenue up on price', text: 'Revenue increased due to higher average price.', tags: ['revenue', 'price'] },
  { id: 'cogs-mix', label: 'COGS mix shift', text: 'Cost of goods sold was impacted by product mix shift.', tags: ['cogs', 'mix'] },
  { id: 'opex-timing', label: 'OpEx timing', text: 'Operating expenses reflect timing of accruals and one-time items.', tags: ['opex', 'timing'] },
];

function init(): void {
  if (store.size > 0) return;
  for (const s of DEFAULTS) store.set(s.id, s);
}

export function listCommentarySnippets(tag?: string): CommentarySnippet[] {
  init();
  const list = Array.from(store.values());
  if (tag) return list.filter((s) => s.tags?.includes(tag));
  return list;
}

export function getCommentarySnippet(id: string): CommentarySnippet | undefined {
  init();
  return store.get(id);
}

export function addCommentarySnippet(snippet: Omit<CommentarySnippet, 'id'>): CommentarySnippet {
  init();
  const id = `snippet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const full: CommentarySnippet = { ...snippet, id };
  store.set(id, full);
  return full;
}

export function searchCommentaryByTags(tags: string[]): CommentarySnippet[] {
  init();
  const set = new Set(tags.map((t) => t.toLowerCase()));
  return Array.from(store.values()).filter(
    (s) => s.tags?.some((t) => set.has(t.toLowerCase()))
  );
}
