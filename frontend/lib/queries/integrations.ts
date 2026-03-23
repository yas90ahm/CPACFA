'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

const STALE_TIME = 30_000;

export interface AccountingConnection {
  id: string;
  provider: string;
  name: string;
  credentialRef?: string;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncResult {
  rowsImported?: number;
  message?: string;
}

export const connectionKeys = {
  all: ['accounting-connections'] as const,
};

/** Fetch all accounting integration connections for the current tenant. */
export function useConnections() {
  return useQuery({
    queryKey: connectionKeys.all,
    queryFn: () =>
      apiFetch<AccountingConnection[]>('/api/accounting-integration/connections'),
    staleTime: STALE_TIME,
  });
}

/** Trigger a trial-balance sync for a specific connection. */
export function useSyncTrialBalance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      apiFetch<SyncResult>(
        `/api/accounting-integration/connections/${connectionId}/sync-trial-balance`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectionKeys.all });
    },
  });
}

/** Disconnect (delete) an accounting connection. */
export function useDisconnectConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      apiFetch(`/api/accounting-integration/connections/${connectionId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectionKeys.all });
    },
  });
}

/** Test connectivity for an existing connection. */
export function useTestConnection() {
  return useMutation({
    mutationFn: (connectionId: string) =>
      apiFetch<{ ok: boolean; message?: string }>(
        `/api/accounting-integration/connections/${connectionId}/test`,
        { method: 'POST' },
      ),
  });
}
