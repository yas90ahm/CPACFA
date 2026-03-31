'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import {
  useConnections,
  useSyncTrialBalance,
  useDisconnectConnection,
  useTestConnection,
  type AccountingConnection,
} from '@/lib/queries/integrations';
import {
  Building2,
  Globe,
  Database,
  CreditCard,
  Loader2,
  Check,
  X,
  RefreshCw,
  Unplug,
  Plug,
  ExternalLink,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ToastState = { type: 'success' | 'error'; message: string } | null;

interface ProviderMeta {
  key: string;
  label: string;
  icon: typeof Building2;
  description: string;
}

const ERP_PROVIDERS: ProviderMeta[] = [
  { key: 'quickbooks', label: 'QuickBooks', icon: Building2, description: 'Intuit QuickBooks Online' },
  { key: 'xero', label: 'Xero', icon: Globe, description: 'Xero Cloud Accounting' },
  { key: 'netsuite', label: 'NetSuite', icon: Database, description: 'Oracle NetSuite ERP' },
];

/* ------------------------------------------------------------------ */
/*  Helper: find connection for a provider                             */
/* ------------------------------------------------------------------ */

function connectionForProvider(
  connections: AccountingConnection[],
  provider: string,
): AccountingConnection | undefined {
  return connections.find((c) => c.provider === provider);
}

/* ------------------------------------------------------------------ */
/*  Status badge                                                       */
/* ------------------------------------------------------------------ */

function SyncStatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const map: Record<string, { label: string; cls: string }> = {
    success: { label: 'Synced', cls: 'text-status-green bg-status-green-dim' },
    error: { label: 'Error', cls: 'text-status-red bg-status-red-dim' },
    syncing: { label: 'Syncing', cls: 'text-status-blue bg-status-blue-dim' },
  };
  const info = map[status] ?? { label: status, cls: 'text-text-secondary bg-surface-alt' };
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', info.cls)}>
      {status === 'syncing' && <Loader2 className="w-3 h-3 animate-spin" />}
      {info.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function IntegrationsPage() {
  const { data: connections = [], isLoading } = useConnections();
  const syncMutation = useSyncTrialBalance();
  const disconnectMutation = useDisconnectConnection();
  const testMutation = useTestConnection();

  const [toast, setToast] = useState<ToastState>(null);
  const [disconnectConfirm, setDisconnectConfirm] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const showToast = useCallback((t: NonNullable<ToastState>) => {
    setToast(t);
    setTimeout(() => setToast(null), 4000);
  }, []);

  /* ---- Actions ---- */

  const handleConnect = async (provider: string) => {
    try {
      const res = await apiFetch<{ url: string }>(`/api/integrations/oauth/start/${provider}`);
      if (res.url) window.location.href = res.url;
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to start OAuth flow' });
    }
  };

  const handleSync = (conn: AccountingConnection) => {
    setSyncingId(conn.id);
    syncMutation.mutate(conn.id, {
      onSuccess: (res) => {
        showToast({ type: 'success', message: res?.message ?? 'Trial balance synced successfully.' });
        setSyncingId(null);
      },
      onError: (err) => {
        showToast({ type: 'error', message: err instanceof Error ? err.message : 'Sync failed' });
        setSyncingId(null);
      },
    });
  };

  const handleTest = (conn: AccountingConnection) => {
    testMutation.mutate(conn.id, {
      onSuccess: () => showToast({ type: 'success', message: `${conn.name} connection verified.` }),
      onError: (err) => showToast({ type: 'error', message: err instanceof Error ? err.message : 'Test failed' }),
    });
  };

  const handleDisconnect = (id: string) => {
    disconnectMutation.mutate(id, {
      onSuccess: () => showToast({ type: 'success', message: 'Connection removed.' }),
      onError: (err) => showToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to disconnect' }),
    });
    setDisconnectConfirm(null);
  };

  /* ---- Render ---- */

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-text-secondary py-12">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading integrations...
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-10">
      {/* ---- Header ---- */}
      <div>
        <h1 className="text-2xl font-display text-primary">Integrations</h1>
        <p className="text-text-secondary text-sm mt-1">
          Connect your accounting system, Google workspace, and banking provider.
        </p>
      </div>

      {/* =============== ERP CONNECTIONS =============== */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium text-primary">ERP / Accounting</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ERP_PROVIDERS.map((provider) => {
            const conn = connectionForProvider(connections, provider.key);
            const connected = !!conn?.credentialRef;
            const Icon = provider.icon;
            const isSyncing = syncingId === conn?.id;
            const isTesting = testMutation.isPending && testMutation.variables === conn?.id;

            return (
              <div
                key={provider.key}
                className={cn(
                  'bg-surface border rounded-card p-5 flex flex-col gap-4 transition-shadow',
                  connected ? 'border-status-green/40 shadow-card' : 'border-border',
                )}
              >
                {/* Provider header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center',
                      connected ? 'bg-status-green-dim' : 'bg-surface-alt',
                    )}>
                      <Icon className={cn('w-5 h-5', connected ? 'text-status-green' : 'text-text-secondary')} />
                    </div>
                    <div>
                      <p className="font-medium text-primary text-sm">{provider.label}</p>
                      <p className="text-xs text-text-tertiary">{provider.description}</p>
                    </div>
                  </div>
                </div>

                {/* Status info */}
                <div className="flex-1 space-y-1 text-xs">
                  <p className={cn('flex items-center gap-1.5', connected ? 'text-status-green' : 'text-text-tertiary')}>
                    {connected ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    {connected ? 'Connected' : 'Not connected'}
                  </p>
                  {conn && connected && (
                    <>
                      <p className="text-text-secondary truncate" title={conn.name}>
                        {conn.name}
                      </p>
                      {conn.lastSyncAt && (
                        <p className="text-text-tertiary">
                          Last sync: {new Date(conn.lastSyncAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      )}
                      <SyncStatusBadge status={isSyncing ? 'syncing' : conn.lastSyncStatus} />
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 mt-auto">
                  {conn && connected ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSync(conn)}
                        disabled={isSyncing}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-accent text-accent-contrast text-xs font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
                      >
                        {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        {isSyncing ? 'Syncing...' : 'Sync Now'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTest(conn)}
                        disabled={isTesting}
                        className="px-3 py-1.5 rounded-input border border-border text-xs hover:bg-hover disabled:opacity-50 transition-colors"
                      >
                        {isTesting ? 'Testing...' : 'Test'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDisconnectConfirm(disconnectConfirm === conn.id ? null : conn.id)}
                        className="px-3 py-1.5 rounded-input border border-status-red/40 text-status-red text-xs hover:bg-status-red-dim transition-colors"
                      >
                        <Unplug className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleConnect(provider.key)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-accent text-accent-contrast text-xs font-medium hover:bg-accent-hover transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Connect
                    </button>
                  )}
                </div>

                {/* Disconnect confirmation */}
                {conn && disconnectConfirm === conn.id && (
                  <div className="p-3 rounded-input bg-surface-alt border border-border text-xs">
                    <p className="text-primary">
                      Disconnect {provider.label}? Existing data is not affected.
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => handleDisconnect(conn.id)}
                        className="px-3 py-1 rounded-input bg-status-red/20 text-status-red text-xs"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setDisconnectConfirm(null)}
                        className="px-3 py-1 rounded-input border border-border text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* =============== GOOGLE =============== */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium text-primary">Google Workspace</h2>
        <div className="bg-surface border border-border rounded-card p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-surface-alt flex items-center justify-center">
            <Globe className="w-5 h-5 text-text-secondary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-primary text-sm">Google Drive</p>
            <p className="text-xs text-text-tertiary">
              Export statement packages to Google Sheets and store evidence in Drive.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleConnect('google')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-accent text-accent-contrast text-xs font-medium hover:bg-accent-hover transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Connect
          </button>
        </div>
      </section>

      {/* =============== BANK CONNECTIONS =============== */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium text-primary">Bank Connections</h2>
        <div className="bg-surface border border-border rounded-card p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-surface-alt flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-text-secondary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-primary text-sm">Plaid</p>
            <p className="text-xs text-text-tertiary">
              Connect bank accounts to auto-pull statements for reconciliation evidence.
            </p>
          </div>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-surface-alt text-text-tertiary">
            Coming soon
          </span>
        </div>
      </section>

      {/* ---- Toast ---- */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg border text-sm shadow-lg transition-opacity',
            toast.type === 'success'
              ? 'border-status-green bg-status-green-dim text-status-green'
              : 'border-status-red bg-status-red-dim text-status-red',
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
