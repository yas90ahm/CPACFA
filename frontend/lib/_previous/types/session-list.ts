import type { CloseState } from './close-session';

export interface SessionListItem {
  id: string;
  entityId: string;
  entityName: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  state: CloseState;
  startedAt: string | null;
  duration: string | null;
  preparer: string | null;
  reviewer: string | null;
  gatesSummary: string;
  blockingIssues: number;
}
