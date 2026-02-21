export interface Integration {
  provider: string;
  name: string;
  connected: boolean;
  connectedAt?: string;
  lastSync?: string;
  companyName?: string;
  autoSyncOnSession?: boolean;
  pushJesToErp?: boolean;
}

export const mockIntegrations: Integration[] = [
  { provider: 'quickbooks', name: 'QuickBooks Online', connected: true, connectedAt: '2025-12-15', lastSync: '2026-01-31', companyName: 'Apex Manufacturing Co.', autoSyncOnSession: false, pushJesToErp: false },
  { provider: 'netsuite', name: 'NetSuite', connected: false },
  { provider: 'sage', name: 'Sage Intacct', connected: false },
];

export function getIntegrationsByEntity(_entityId: string): Integration[] {
  return mockIntegrations;
}
