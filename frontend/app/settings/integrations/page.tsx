'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';

interface Connection {
  id: string;
  provider: string;
  name: string;
  credentialRef?: string;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  createdAt: string;
  updatedAt: string;
}

const PROVIDER_NAMES: Record<string, string> = {
  quickbooks: 'QuickBooks',
  xero: 'Xero',
  netsuite: 'NetSuite',
};

export default function IntegrationsPage() {
  const queryClient = useQueryClient();
  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['accounting-connections'],
    queryFn: () => apiFetch<Connection[]>('/api/accounting-integration/connections'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/accounting-integration/connections/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounting-connections'] }),
  });

  const [disconnectConfirm, setDisconnectConfirm] = useState<string | null>(null);

  const handleDisconnect = (id: string) => {
    deleteMutation.mutate(id);
    setDisconnectConfirm(null);
  };

  if (isLoading && connections.length === 0) return <div className="text-text-secondary">Loading...</div>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-display text-primary">ERP Integrations</h1>
        <p className="text-text-secondary text-sm mt-1">Connect accounting systems to sync trial balance and optionally push journal entries</p>
      </div>

      <div className="space-y-4">
        {connections.length === 0 ? (
          <p className="text-text-secondary text-sm">No ERP connections yet. Connect an accounting system to sync trial balance and optionally push journal entries.</p>
        ) : (
        connections.map((conn) => {
          const connected = !!conn.credentialRef;
          const displayName = PROVIDER_NAMES[conn.provider] ?? conn.name;
          return (
          <div key={conn.id} className="bg-surface border border-border rounded-card p-6">
            <h2 className="text-lg font-medium text-primary">{displayName}</h2>
            <div className="mt-4 space-y-1 text-sm">
              <p className={cn('flex items-center gap-2', connected ? 'text-status-green' : 'text-text-secondary')}>
                {connected ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                Status: {connected ? 'Connected' : 'Not connected'}
              </p>
              <p className="text-text-secondary">Name: {conn.name}</p>
              {conn.lastSyncAt && <p className="text-text-secondary">Last Sync: {new Date(conn.lastSyncAt).toLocaleDateString('en-US')}</p>}
              <p className="text-text-secondary">Created: {new Date(conn.createdAt).toLocaleDateString('en-US')}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {connected ? (
                <>
                  <button type="button" className="px-3 py-1.5 rounded-input border border-border text-sm hover:bg-hover">Test Connection</button>
                  <button
                    type="button"
                    onClick={() => setDisconnectConfirm(disconnectConfirm === conn.id ? null : conn.id)}
                    className="px-3 py-1.5 rounded-input border border-status-red/50 text-status-red text-sm hover:bg-status-red-dim"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <Link href="/close" className="px-3 py-1.5 rounded-input bg-accent text-accent-contrast text-sm hover:opacity-90">
                  Connect via close session →
                </Link>
              )}
            </div>
            {disconnectConfirm === conn.id && (
              <div className="mt-4 p-4 rounded-input bg-surface-alt border border-border text-sm">
                <p className="text-primary">Disconnect {displayName}? You will no longer be able to sync trial balances directly. Existing data will not be affected.</p>
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={() => handleDisconnect(conn.id)} className="px-3 py-1.5 rounded-input bg-status-red/20 text-status-red text-sm">Disconnect</button>
                  <button type="button" onClick={() => setDisconnectConfirm(null)} className="px-3 py-1.5 rounded-input border border-border text-sm">Cancel</button>
                </div>
              </div>
            )}
          </div>
          );
        })
        )}
      </div>
    </div>
  );
}
