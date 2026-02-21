export interface ReconActivity {
  id: string;
  reconId: string;
  user: string;
  description: string;
  timestamp: string;
}

export const mockActivityByRecon: Record<string, ReconActivity[]> = {
  'recon-1010': [
    { id: 'act-1', reconId: 'recon-1010', user: 'Sarah Chen', description: 'Set supporting balance to $1,243,338.90', timestamp: '2026-02-10T14:20:00Z' },
    { id: 'act-2', reconId: 'recon-1010', user: 'Sarah Chen', description: 'Added reconciling item: Outstanding check #4521', timestamp: '2026-02-10T14:21:00Z' },
    { id: 'act-3', reconId: 'recon-1010', user: 'Sarah Chen', description: 'Uploaded chase-operating-stmt-jan-2026.pdf', timestamp: '2026-02-10T14:22:00Z' },
    { id: 'act-4', reconId: 'recon-1010', user: 'Sarah Chen', description: 'Marked as complete', timestamp: '2026-02-10T15:00:00Z' },
    { id: 'act-5', reconId: 'recon-1010', user: 'Mike Torres', description: 'Approved', timestamp: '2026-02-11T09:00:00Z' },
  ],
  'recon-1020': [
    { id: 'act-6', reconId: 'recon-1020', user: 'Sarah Chen', description: 'Set supporting balance to $500,000.00', timestamp: '2026-02-10T14:24:00Z' },
    { id: 'act-7', reconId: 'recon-1020', user: 'Sarah Chen', description: 'Uploaded chase-savings-stmt-jan-2026.pdf', timestamp: '2026-02-10T14:25:00Z' },
    { id: 'act-8', reconId: 'recon-1020', user: 'Sarah Chen', description: 'Marked as complete', timestamp: '2026-02-10T15:05:00Z' },
    { id: 'act-9', reconId: 'recon-1020', user: 'Mike Torres', description: 'Approved', timestamp: '2026-02-11T09:05:00Z' },
  ],
  'recon-1100': [
    { id: 'act-10', reconId: 'recon-1100', user: 'Sarah Chen', description: 'Set supporting balance to $3,401,234.00', timestamp: '2026-02-12T08:50:00Z' },
    { id: 'act-11', reconId: 'recon-1100', user: 'Sarah Chen', description: 'Added reconciling item: Unapplied payment — customer ABC', timestamp: '2026-02-12T09:00:00Z' },
    { id: 'act-12', reconId: 'recon-1100', user: 'Sarah Chen', description: 'Uploaded ar-aging-report-013126.xlsx', timestamp: '2026-02-12T09:00:00Z' },
    { id: 'act-13', reconId: 'recon-1100', user: 'Sarah Chen', description: 'Marked as complete', timestamp: '2026-02-14T16:00:00Z' },
  ],
  'recon-1200': [
    { id: 'act-14', reconId: 'recon-1200', user: 'Mike Torres', description: 'Set supporting balance to $2,087,500.00', timestamp: '2026-02-14T11:00:00Z' },
    { id: 'act-15', reconId: 'recon-1200', user: 'Mike Torres', description: 'Added reconciling item: Inventory adjustment — count variance', timestamp: '2026-02-14T11:15:00Z' },
    { id: 'act-16', reconId: 'recon-1200', user: 'Mike Torres', description: 'Uploaded inventory-count-sheet-jan.pdf', timestamp: '2026-02-14T11:30:00Z' },
  ],
};
