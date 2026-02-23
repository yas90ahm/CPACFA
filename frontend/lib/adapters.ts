/**
 * Adapters to map backend API responses to frontend types.
 * Backend uses: status (lowercase), entityId, periodLabel (sometimes)
 * Frontend uses: state (UPPERCASE), entityName, periodLabel
 */

const STATUS_TO_STATE: Record<string, string> = {
  open: 'OPEN',
  in_progress: 'IN_PROGRESS',
  under_review: 'UNDER_REVIEW',
  certified: 'CERTIFIED',
  locked: 'LOCKED',
};

export function toCloseState(status: string): string {
  return STATUS_TO_STATE[status?.toLowerCase()] ?? status ?? 'OPEN';
}

export function derivePeriodLabel(periodEnd: string): string {
  if (!periodEnd) return '';
  const d = new Date(periodEnd);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Backend CloseSession (or list item) → frontend CloseSession */
export function toCloseSession(raw: Record<string, unknown>, sessionId?: string): Record<string, unknown> {
  const id = (raw.id ?? sessionId) as string;
  const status = (raw.status ?? 'open') as string;
  return {
    id,
    tenantId: raw.tenantId ?? '',
    entityName: raw.entityName ?? raw.entityId ?? '',
    periodLabel: (raw.periodLabel as string) ?? derivePeriodLabel((raw.periodEnd as string) ?? ''),
    periodStart: raw.periodStart ?? '',
    periodEnd: raw.periodEnd ?? '',
    state: toCloseState(status),
    createdBy: raw.createdBy ?? raw.certifiedBy ?? 'System',
    createdAt: raw.createdAt ?? new Date().toISOString(),
    startedAt: raw.startedAt ?? (status !== 'open' ? raw.createdAt : null),
    certifiedAt: raw.certifiedAt ?? null,
    lockedAt: status === 'locked' ? raw.updatedAt : null,
    statementsStale: !!(raw.statementsStale ?? raw.statementsStaleSince),
    statementsGeneratedAt: raw.statementsGeneratedAt ?? null,
  };
}

/** Backend session list item → frontend SessionListItem */
export function toSessionListItem(raw: Record<string, unknown>): Record<string, unknown> {
  const status = (raw.status ?? 'open') as string;
  const state = toCloseState(status);
  return {
    id: raw.id,
    entityId: raw.entityId ?? '',
    entityName: raw.entityName ?? raw.entityId ?? '',
    periodLabel: (raw.periodLabel as string) ?? derivePeriodLabel((raw.periodEnd as string) ?? ''),
    periodStart: raw.periodStart ?? '',
    periodEnd: raw.periodEnd ?? '',
    state,
    startedAt: raw.startedAt ?? (status !== 'open' ? raw.createdAt : null),
    duration: raw.duration ?? null,
    preparer: raw.preparer ?? null,
    reviewer: raw.reviewer ?? null,
    gatesSummary: raw.gatesSummary ?? '0/9',
    blockingIssues: raw.blockingIssues ?? 0,
  };
}
