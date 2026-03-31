'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

const STALE_TIME = 30_000;

// --- Types ---

export interface MemoryEntry {
  id: string;
  entryType: 'correction' | 'justification' | 'decision' | 'transaction_category' | 'entity_policy';
  key: string;
  value: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryQueryResult {
  entries: MemoryEntry[];
  total: number;
}

export interface ConsistencyCheckResult {
  consistent: boolean;
  conflictingEntry?: MemoryEntry;
  promptForUser?: string;
}

// --- Hooks ---

export function useMemoryList(entryType?: string) {
  return useQuery({
    queryKey: ['memory-list', entryType],
    queryFn: async (): Promise<MemoryEntry[]> => {
      const params: Record<string, string> = {};
      if (entryType) params.entryType = entryType;
      const res = await apiFetch<{ entries: MemoryEntry[] }>('/api/memory/list', { params });
      return res.entries ?? [];
    },
    staleTime: STALE_TIME,
  });
}

export function useMemoryEntry(id: string | null) {
  return useQuery({
    queryKey: ['memory-entry', id],
    queryFn: async (): Promise<MemoryEntry> => {
      return apiFetch<MemoryEntry>(`/api/memory/entry/${id}`);
    },
    enabled: !!id,
    staleTime: STALE_TIME,
  });
}

export function useVendorMemory(vendor: string | null) {
  return useQuery({
    queryKey: ['memory-vendor', vendor],
    queryFn: async (): Promise<MemoryEntry[]> => {
      const res = await apiFetch<{ entries: MemoryEntry[] }>(`/api/memory/vendor/${encodeURIComponent(vendor!)}`);
      return res.entries ?? [];
    },
    enabled: !!vendor,
    staleTime: STALE_TIME,
  });
}

export function useMemorySearch() {
  return useMutation({
    mutationFn: async (params: { query: string; topK?: number; entryType?: string }) => {
      return apiFetch<MemoryQueryResult>('/api/memory/query', {
        method: 'POST',
        body: params,
      });
    },
  });
}

export function useStoreCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { vendor: string; correctedCategory: string; originalCategory?: string; context?: string }) => {
      return apiFetch<MemoryEntry>('/api/memory/correction', {
        method: 'POST',
        body: params,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memory-list'] });
    },
  });
}

export function useStoreJustification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { key: string; justification: string; iracJson?: Record<string, string>; source?: string }) => {
      return apiFetch<MemoryEntry>('/api/memory/justification', {
        method: 'POST',
        body: params,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memory-list'] });
    },
  });
}

export function useStoreDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { key: string; decision: string; rationale?: string }) => {
      return apiFetch<MemoryEntry>('/api/memory/decision', {
        method: 'POST',
        body: params,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memory-list'] });
    },
  });
}

export function useConsistencyCheck() {
  return useMutation({
    mutationFn: async (params: { vendor: string; proposedCategory: string }) => {
      return apiFetch<ConsistencyCheckResult>('/api/memory/consistency-check', {
        method: 'POST',
        body: params,
      });
    },
  });
}
