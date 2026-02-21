import type { CloseSession } from '@/lib/types/close-session';
import type { CloseReadiness } from '@/lib/types/readiness';
import type { CloseIssue } from '@/lib/types/issues';
import { mockSessions } from '@/lib/mock/sessions';

export const mockSession: CloseSession = {
  id: 'c925645f-3831-4d81-93a9-a12a2819cd3e',
  tenantId: 'tenant-apex',
  entityName: 'Apex Manufacturing Co.',
  periodLabel: 'January 2026',
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  state: 'IN_PROGRESS',
  createdBy: 'Sarah Chen',
  createdAt: '2026-02-01T09:00:00Z',
  startedAt: '2026-02-01T09:15:00Z',
  certifiedAt: null,
  lockedAt: null,
  statementsStale: false,
  statementsGeneratedAt: '2026-02-14T11:00:00Z',
};

export function getCloseSessionById(sessionId: string): CloseSession {
  const listItem = mockSessions.find((s) => s.id === sessionId);
  if (listItem) {
    return {
      id: listItem.id,
      tenantId: 'tenant-apex',
      entityName: listItem.entityName,
      periodLabel: listItem.periodLabel,
      periodStart: listItem.periodStart,
      periodEnd: listItem.periodEnd,
      state: listItem.state,
      createdBy: listItem.preparer ?? 'System',
      createdAt: listItem.startedAt ?? new Date().toISOString(),
      startedAt: listItem.startedAt,
      certifiedAt: null,
      lockedAt: null,
      statementsStale: false,
      statementsGeneratedAt: null,
    };
  }
  return { ...mockSession, id: sessionId };
}

export const mockReadiness: CloseReadiness = {
  sessionId: mockSession.id,
  gatesPassing: 5,
  gatesTotal: 8,
  canAdvance: false,
  gates: [
    { id: 'tb', name: 'Trial balance balanced', description: 'Debits = Credits', passing: true, detail: 'Balanced', category: 'hard', navigateTo: '/close/[sessionId]/trial-balance' },
    { id: 'map', name: 'All accounts mapped', description: 'COA mapping complete', passing: true, detail: '47/47 mapped', category: 'hard', navigateTo: '/close/[sessionId]/mapping' },
    { id: 'recon', name: 'All reconciliations complete', description: 'All recons signed off', passing: false, detail: '7/12 complete', category: 'hard', navigateTo: '/close/[sessionId]/reconciliation' },
    { id: 'aje', name: 'All AJE templates resolved', description: 'No pending templates', passing: false, detail: '3 templates pending', category: 'hard', navigateTo: '/close/[sessionId]/adjustments' },
    { id: 'stmt', name: 'Statements generated & not stale', description: 'FS package current', passing: true, detail: 'Generated Feb 14', category: 'hard', navigateTo: '/close/[sessionId]/statements' },
    { id: 'var', name: 'Material variances explained', description: 'Unexplained variances resolved', passing: false, detail: '2 unexplained', category: 'soft', navigateTo: '/close/[sessionId]/variance' },
    { id: 'hard', name: 'All hard checks passing', description: 'Integrity checks', passing: true, detail: 'Passing', category: 'hard', navigateTo: '/close/[sessionId]/dashboard' },
    { id: 'issues', name: 'Zero blocking issues', description: 'No critical/blocking issues', passing: false, detail: '2 blocking', category: 'hard', navigateTo: '/close/[sessionId]/dashboard' },
  ],
};

export const mockIssues: CloseIssue[] = [
  {
    id: 'iss-1',
    title: 'Reconciliation over tolerance — Chase Checking',
    description: 'Variance $2,340.00 exceeds tolerance of $1,500.00.',
    severity: 'BLOCKING',
    status: 'DETECTED',
    category: 'reconciliation',
    affectedAccounts: ['1010 — Chase Checking'],
    assignedTo: null,
    detectedAt: '2026-02-15T14:22:00Z',
    resolvedAt: null,
    navigateTo: '/close/[sessionId]/reconciliation/recon-1010',
  },
  {
    id: 'iss-2',
    title: 'Unmapped account 6100 — Shipping',
    description: 'Account not mapped to COA template.',
    severity: 'BLOCKING',
    status: 'ASSIGNED',
    category: 'mapping',
    affectedAccounts: ['6100 — Shipping'],
    assignedTo: 'Mike Torres',
    detectedAt: '2026-02-14T10:00:00Z',
    resolvedAt: null,
    navigateTo: '/close/[sessionId]/mapping',
  },
  {
    id: 'iss-3',
    title: 'Material variance — Revenue',
    description: 'Revenue variance 4.2% vs prior period.',
    severity: 'WARNING',
    status: 'DETECTED',
    category: 'variance',
    affectedAccounts: ['4000 — Revenue'],
    assignedTo: null,
    detectedAt: '2026-02-15T09:00:00Z',
    resolvedAt: null,
    navigateTo: '/close/[sessionId]/variance',
  },
  {
    id: 'iss-4',
    title: 'Depreciation template pending',
    description: 'AJE template Depreciation not yet applied.',
    severity: 'WARNING',
    status: 'DETECTED',
    category: 'adjustments',
    affectedAccounts: [],
    assignedTo: null,
    detectedAt: '2026-02-14T08:00:00Z',
    resolvedAt: null,
    navigateTo: '/close/[sessionId]/adjustments',
  },
  {
    id: 'iss-5',
    title: 'Prior period comparison note',
    description: 'Prior period close took 6 days.',
    severity: 'INFO',
    status: 'VERIFIED',
    category: 'review',
    affectedAccounts: [],
    assignedTo: null,
    detectedAt: '2026-02-10T12:00:00Z',
    resolvedAt: '2026-02-10T12:30:00Z',
    navigateTo: '/close/[sessionId]/review',
  },
];

export const mockPhaseProgress = [
  { id: '1', name: 'Ingest & Validate', status: 'complete' as const, detail: 'Complete', fraction: '1/1' },
  { id: '2', name: 'Account Mapping', status: 'complete' as const, detail: '47/47 mapped', fraction: '47/47' },
  { id: '3', name: 'Reconciliation', status: 'in_progress' as const, detail: '7 of 12 complete, 2 over tolerance, 3 not started', fraction: '7/12' },
  { id: '4', name: 'Adjusting Entries', status: 'not_started' as const, detail: '3 templates pending', fraction: '0/3' },
  { id: '5', name: 'Statement Generation', status: 'not_started' as const, detail: '', fraction: '' },
  { id: '6', name: 'Variance Analysis', status: 'not_started' as const, detail: '2 unexplained', fraction: '' },
  { id: '7', name: 'Review & Certify', status: 'not_started' as const, detail: '', fraction: '' },
];

export const mockNextActions = [
  { id: 'a1', priority: 'BLOCKING' as const, title: 'Complete reconciliation for Account 1010 — Chase Checking', context: 'Variance: $2,340.00 (over tolerance by $840.00)', cta: 'Open Reconciliation', href: '/close/[sessionId]/reconciliation/recon-1010' },
  { id: 'a2', priority: 'BLOCKING' as const, title: 'Map account 6100 — Shipping to COA', context: 'Unmapped account', cta: 'Open Mapping', href: '/close/[sessionId]/mapping' },
  { id: 'a3', priority: 'WARNING' as const, title: 'Explain material variance — Revenue', context: '4.2% vs prior period', cta: 'Open Variance', href: '/close/[sessionId]/variance' },
  { id: 'a4', priority: 'WARNING' as const, title: 'Apply AJE template: Depreciation', context: 'Template pending', cta: 'Open Adjustments', href: '/close/[sessionId]/adjustments' },
];

export const mockRecentActivity = [
  { id: 'r1', user: 'Sarah Chen', description: 'Posted AJE #1042 — Depreciation', time: '2 hours ago' },
  { id: 'r2', user: 'System', description: 'Auto-resolved: Account 4100 now mapped', time: '2 hours ago' },
  { id: 'r3', user: 'Mike Torres', description: 'Approved reconciliation: Account 1200 — AR', time: 'yesterday' },
  { id: 'r4', user: 'Sarah Chen', description: 'Started close session', time: '4 days ago' },
];
