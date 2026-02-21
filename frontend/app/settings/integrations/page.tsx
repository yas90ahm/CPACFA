'use client';

import { useState } from 'react';
import { mockIntegrations } from '@/lib/mock/integrations';
import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';

const ACTIVE_SESSION_ID = 'c925645f-3831-4d81-93a9-a12a2819cd3e';

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState(mockIntegrations);
  const [disconnectConfirm, setDisconnectConfirm] = useState<string | null>(null);

  const toggleConnection = (provider: string) => {
    setIntegrations((prev) =>
      prev.map((i) => (i.provider === provider ? { ...i, connected: !i.connected, connectedAt: i.connected ? undefined : '2025-12-15', lastSync: i.connected ? undefined : '2026-01-31', companyName: i.connected ? undefined : 'Apex Manufacturing Co.' } : i))
    );
    setDisconnectConfirm(null);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-display text-primary">ERP Integrations</h1>
        <p className="text-text-secondary text-sm mt-1">Connect accounting systems to sync trial balance and optionally push journal entries</p>
      </div>

      <div className="space-y-4">
        {integrations.map((int) => (
          <div key={int.provider} className="bg-surface border border-border rounded-card p-6">
            <h2 className="text-lg font-medium text-primary">{int.name}</h2>
            <div className="mt-4 space-y-1 text-sm">
              <p className={cn('flex items-center gap-2', int.connected ? 'text-status-green' : 'text-text-secondary')}>
                {int.connected ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                Status: {int.connected ? 'Connected' : 'Not connected'}
              </p>
              {int.connectedAt && <p className="text-text-secondary">Connected: {new Date(int.connectedAt).toLocaleDateString('en-US')}</p>}
              {int.lastSync && <p className="text-text-secondary">Last Sync: {new Date(int.lastSync).toLocaleDateString('en-US')}</p>}
              {int.companyName && <p className="text-text-secondary">Company: {int.companyName}</p>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {int.connected ? (
                <>
                  <button type="button" className="px-3 py-1.5 rounded-input border border-border text-sm hover:bg-hover">Test Connection</button>
                  <button
                    type="button"
                    onClick={() => setDisconnectConfirm(disconnectConfirm === int.provider ? null : int.provider)}
                    className="px-3 py-1.5 rounded-input border border-status-red/50 text-status-red text-sm hover:bg-status-red-dim"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => toggleConnection(int.provider)} className="px-3 py-1.5 rounded-input bg-accent text-accent-contrast text-sm hover:opacity-90">
                  Connect {int.name} →
                </button>
              )}
            </div>
            {disconnectConfirm === int.provider && (
              <div className="mt-4 p-4 rounded-input bg-surface-alt border border-border text-sm">
                <p className="text-primary">Disconnect {int.name}? You will no longer be able to sync trial balances directly. Existing data will not be affected.</p>
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={() => toggleConnection(int.provider)} className="px-3 py-1.5 rounded-input bg-status-red/20 text-status-red text-sm">Disconnect</button>
                  <button type="button" onClick={() => setDisconnectConfirm(null)} className="px-3 py-1.5 rounded-input border border-border text-sm">Cancel</button>
                </div>
              </div>
            )}
            {int.connected && (
              <div className="mt-4 pt-4 border-t border-border space-y-2">
                <p className="text-xs font-medium text-text-secondary uppercase">Sync Settings</p>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" defaultChecked={int.autoSyncOnSession ?? false} />
                  Automatically pull trial balance when a new close session is created
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" defaultChecked={int.pushJesToErp ?? false} />
                  Post approved adjusting entries back to the source system
                </label>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
