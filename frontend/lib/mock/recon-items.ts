import type { ReconcilingItem } from '@/lib/types/reconciliation';

export const mockReconItemsByRecon: Record<string, ReconcilingItem[]> = {
  'recon-1010': [
    { id: 'ri-1', reconId: 'recon-1010', description: 'Outstanding check #4521 — vendor payment', amount: 1200, type: 'Outstanding Check', date: '2026-02-05' },
    { id: 'ri-2', reconId: 'recon-1010', description: 'Outstanding check #4522 — utilities', amount: 890, type: 'Outstanding Check', date: '2026-02-06' },
    { id: 'ri-3', reconId: 'recon-1010', description: 'Deposit in transit — customer payment', amount: 250, type: 'Deposit in Transit', date: '2026-02-01' },
  ],
  'recon-1100': [
    { id: 'ri-4', reconId: 'recon-1100', description: 'Unapplied payment — customer ABC', amount: 35000, type: 'Other', date: '2026-01-28' },
    { id: 'ri-5', reconId: 'recon-1100', description: 'Timing — invoice cutoff', amount: 20555, type: 'Timing Difference', date: null },
    { id: 'ri-6', reconId: 'recon-1100', description: 'Unapplied credit memo', amount: 0, type: 'Other', date: null },
  ],
  'recon-1200': [
    { id: 'ri-7', reconId: 'recon-1200', description: 'Inventory adjustment — count variance', amount: 8300, type: 'Error Correction', date: '2026-01-31' },
  ],
  'recon-1210': [],
  'recon-1300': [],
};
