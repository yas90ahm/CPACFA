import type { SessionListItem } from '@/lib/types/session-list';

export const mockSessions: SessionListItem[] = [
  { id: 'session-feb-2026', entityId: 'entity-apex', entityName: 'Apex Manufacturing Co.', periodLabel: 'February 2026', periodStart: '2026-02-01', periodEnd: '2026-02-28', state: 'OPEN', startedAt: null, duration: null, preparer: null, reviewer: null, gatesSummary: '0/9', blockingIssues: 0 },
  { id: 'c925645f-3831-4d81-93a9-a12a2819cd3e', entityId: 'entity-apex', entityName: 'Apex Manufacturing Co.', periodLabel: 'January 2026', periodStart: '2026-01-01', periodEnd: '2026-01-31', state: 'IN_PROGRESS', startedAt: '2026-02-01T09:15:00Z', duration: '4 days', preparer: 'Sarah Chen', reviewer: null, gatesSummary: '5/9', blockingIssues: 2 },
  { id: 'session-dec-2025', entityId: 'entity-apex', entityName: 'Apex Manufacturing Co.', periodLabel: 'December 2025', periodStart: '2025-12-01', periodEnd: '2025-12-31', state: 'LOCKED', startedAt: '2025-12-28T10:00:00Z', duration: '6 days', preparer: 'Sarah Chen', reviewer: 'Mike Torres', gatesSummary: '9/9', blockingIssues: 0 },
  { id: 'session-nov-2025', entityId: 'entity-apex', entityName: 'Apex Manufacturing Co.', periodLabel: 'November 2025', periodStart: '2025-11-01', periodEnd: '2025-11-30', state: 'LOCKED', startedAt: '2025-11-27T09:00:00Z', duration: '5 days', preparer: 'Sarah Chen', reviewer: 'Mike Torres', gatesSummary: '9/9', blockingIssues: 0 },
];

export function getSessionsByEntity(_entityId: string): SessionListItem[] {
  return mockSessions;
}
