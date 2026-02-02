/**
 * Generic in-memory CRUD store: one implementation for Map + nextId + create/list/get/update.
 * Reduces duplication across pbc, reconciliation_resolution, close_controls, etc.
 */

export interface InMemoryStoreOptions {
  /** ID prefix for generated ids (e.g. 'pbc', 'rec-res', 'ctrl'). */
  idPrefix: string;
  /** When true, create() sets createdAt/updatedAt and update() sets updatedAt. */
  timestamps?: boolean;
}

export interface InMemoryStore<T extends { id: string }> {
  create(input: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): T;
  get(id: string): T | undefined;
  list(): T[];
  update(id: string, patch: Partial<Omit<T, 'id'>>): T | undefined;
  nextId(): string;
  set(id: string, record: T): void;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create an in-memory CRUD store. All get/list/update return copies so callers don't mutate.
 */
export function createInMemoryStore<T extends { id: string }>(
  options: InMemoryStoreOptions
): InMemoryStore<T> {
  const { idPrefix, timestamps = false } = options;
  const store = new Map<string, T>();

  return {
    create(input: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): T {
      const now = new Date().toISOString();
      const id = nextId(idPrefix);
      const record = {
        ...input,
        id,
        ...(timestamps && { createdAt: now, updatedAt: now }),
      } as T;
      store.set(id, record);
      return { ...record };
    },

    get(id: string): T | undefined {
      const r = store.get(id);
      return r ? { ...r } : undefined;
    },

    list(): T[] {
      return Array.from(store.values()).map((r) => ({ ...r }));
    },

    update(id: string, patch: Partial<Omit<T, 'id'>>): T | undefined {
      const record = store.get(id);
      if (!record) return undefined;
      Object.assign(record, patch);
      if (timestamps && 'updatedAt' in record) {
        (record as T & { updatedAt: string }).updatedAt = new Date().toISOString();
      }
      return { ...record };
    },

    nextId(): string {
      return nextId(idPrefix);
    },

    set(id: string, record: T): void {
      store.set(id, record);
    },
  };
}
