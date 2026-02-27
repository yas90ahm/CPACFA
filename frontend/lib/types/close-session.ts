export type CloseState =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'UNDER_REVIEW'
  | 'CERTIFIED'
  | 'LOCKED';

export interface CloseSession {
  id: string;
  tenantId: string;
  entityId: string;
  entityName: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  state: CloseState;
  createdBy: string;
  createdAt: string;
  startedAt: string | null;
  certifiedAt: string | null;
  lockedAt: string | null;
  statementsStale: boolean;
  statementsGeneratedAt: string | null;
}
