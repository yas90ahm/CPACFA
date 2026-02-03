/**
 * Authenticated API calls for the wedge flow (close-gated valuation, conflicts).
 * Uses Bearer token from auth storage.
 */

import { getStoredToken } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type AuthFetchOptions = Omit<RequestInit, 'body'> & { body?: unknown };

export async function authFetch(
  path: string,
  options: AuthFetchOptions = {}
): Promise<Response> {
  const token = getStoredToken();
  const headers: HeadersInit = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body != null && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const body: BodyInit | null | undefined =
    options.body instanceof FormData ? options.body : options.body != null ? JSON.stringify(options.body) : undefined;
  const { body: _omit, ...rest } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers,
    body,
  });
  return res;
}

export async function authJson<T = unknown>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {}
): Promise<T> {
  const res = await authFetch(path, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

// --- Trial balance ingest (auth + periodLabel) ---

export type UploadTrialBalanceOptions = {
  periodLabel?: string;
  standard?: 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP';
  fullSet?: boolean;
  meta?: {
    country?: string;
    jurisdiction?: string;
    currency?: string;
    taxId?: string;
    businessNumber?: string;
    entityId?: string;
  };
};

/** POST /api/trial-balance/ingest with auth and optional periodLabel */
export async function uploadTrialBalanceAuth(
  file: File,
  options?: UploadTrialBalanceOptions
): Promise<unknown> {
  const form = new FormData();
  form.append('file', file);
  if (options?.periodLabel) form.append('periodLabel', options.periodLabel);
  if (options?.standard) form.append('standard', options.standard);
  if (options?.fullSet !== undefined) form.append('fullSet', String(options.fullSet));
  const meta = options?.meta;
  if (meta?.country) form.append('country', meta.country);
  if (meta?.jurisdiction) form.append('jurisdiction', meta.jurisdiction);
  if (meta?.currency) form.append('currency', meta.currency);
  if (meta?.taxId) form.append('taxId', meta.taxId);
  if (meta?.businessNumber) form.append('businessNumber', meta.businessNumber);
  if (meta?.entityId) form.append('entityId', meta.entityId);

  const res = await authFetch('/api/trial-balance/ingest', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403) throw new Error('Period is locked or access denied.');
    if (res.status === 400) throw new Error(text || 'Invalid file or request.');
    throw new Error(text || 'Upload failed.');
  }
  return res.json();
}

// --- Close ---

export interface PeriodLock {
  periodLabel: string;
  lockedAt: string;
  lockedBy: string;
  reason?: string;
}

export type CloseStage = 'no_tb' | 'unadjusted_in' | 'adjustments' | 'ready_to_close' | 'closed';

export interface ClosePeriod {
  periodLabel: string;
  status?: string;
  locked?: boolean;
  closeDueDate?: string;
  hasUnadjustedTB?: boolean;
  tbSource?: 'uploaded' | 'synced';
  tbAt?: string;
  closeStage?: CloseStage;
}

/** GET /api/close/period-lock — list locked periods */
export async function listLockedPeriods(): Promise<PeriodLock[]> {
  const res = await authJson<{ locks?: PeriodLock[] }>('/api/close/period-lock');
  return res.locks ?? [];
}

/** GET /api/close/periods — list periods with status (includes closeDueDate when set) */
export async function listPeriods(periodLabels?: string[]): Promise<ClosePeriod[]> {
  const q = periodLabels?.length ? `?periodLabels=${periodLabels.join(',')}` : '';
  const res = await authJson<{ periods?: ClosePeriod[] }>(`/api/close/periods${q}`);
  return res.periods ?? [];
}

/** POST /api/close/calendar — set close due date for a period */
export async function setCloseDueDate(periodLabel: string, closeDueDate: string): Promise<ClosePeriod> {
  const res = await authJson<ClosePeriod>('/api/close/calendar', {
    method: 'POST',
    body: { periodLabel, closeDueDate },
  });
  return res;
}

/** GET /api/close/period-lock/:periodLabel — get lock for period (returns { periodLabel, locked, lock }) */
export async function getPeriodLock(periodLabel: string): Promise<PeriodLock | undefined> {
  try {
    const res = await authJson<{ periodLabel: string; locked: boolean; lock: PeriodLock | null }>(
      `/api/close/period-lock/${encodeURIComponent(periodLabel)}`
    );
    return res.lock ?? undefined;
  } catch {
    return undefined;
  }
}

/** POST /api/close/period-lock — lock period (lockedBy required by backend) */
export async function lockPeriod(periodLabel: string, lockedBy: string, reason?: string): Promise<PeriodLock> {
  const res = await authJson<PeriodLock & { suggestPackGeneration?: boolean }>('/api/close/period-lock', {
    method: 'POST',
    body: { periodLabel, lockedBy, reason },
  });
  return res;
}

/** GET /api/close/checklist/:periodLabel */
export async function getChecklist(periodLabel: string): Promise<{ steps?: { id: string; name?: string; label?: string; status?: string; category?: string; verificationMethod?: string; dueDate?: string; assignee?: string }[] }> {
  const res = await authJson<{ steps?: { id: string; name?: string; label?: string; status?: string; category?: string; verificationMethod?: string; dueDate?: string; assignee?: string }[] }>(
    `/api/close/checklist/${encodeURIComponent(periodLabel)}`
  );
  return res ?? { steps: [] };
}

/** PATCH /api/close/checklist/:periodLabel/step/:stepId — Update step dueDate and/or assignee */
export async function updateChecklistStep(
  periodLabel: string,
  stepId: string,
  patch: { dueDate?: string; assignee?: string }
): Promise<{ id: string; dueDate?: string; assignee?: string; [key: string]: unknown }> {
  return authJson(
    `/api/close/checklist/${encodeURIComponent(periodLabel)}/step/${encodeURIComponent(stepId)}`,
    { method: 'PATCH', body: patch }
  );
}

/** Close checklist template step spec (matches backend) */
export interface ChecklistTemplateStepSpec {
  label: string;
  category?: string;
  verificationMethod?: string;
  controlId?: string;
  dueOffsetDays?: number;
  assignee?: string;
}

/** Close checklist template row */
export interface ChecklistTemplateRow {
  id: string;
  tenantId: string;
  name: string;
  stepsSpec: ChecklistTemplateStepSpec[];
  periodType: 'monthly' | 'quarterly' | 'annual';
  updatedAt: string;
}

/** GET /api/close/checklist-templates — List close checklist templates (optional periodType). */
export async function getChecklistTemplates(periodType?: 'monthly' | 'quarterly' | 'annual'): Promise<ChecklistTemplateRow[]> {
  const q = periodType ? `?periodType=${encodeURIComponent(periodType)}` : '';
  const res = await authJson<{ templates?: ChecklistTemplateRow[] }>(
    `/api/close/checklist-templates${q}`
  );
  return res?.templates ?? [];
}

/** POST /api/close/checklist-templates — Create or update template for period type. */
export async function createOrUpdateChecklistTemplate(
  periodType: 'monthly' | 'quarterly' | 'annual',
  body: { name?: string; stepsSpec: ChecklistTemplateStepSpec[] }
): Promise<ChecklistTemplateRow> {
  return authJson<ChecklistTemplateRow>('/api/close/checklist-templates', {
    method: 'POST',
    body: { periodType, ...body },
  });
}

/** PATCH /api/close/checklist-templates/:periodType — Update template name and/or steps. */
export async function updateChecklistTemplate(
  periodType: 'monthly' | 'quarterly' | 'annual',
  body: { name?: string; stepsSpec?: ChecklistTemplateStepSpec[] }
): Promise<ChecklistTemplateRow> {
  return authJson<ChecklistTemplateRow>(
    `/api/close/checklist-templates/${encodeURIComponent(periodType)}`,
    { method: 'PATCH', body }
  );
}

/** POST /api/close/checklist-sign-off — Mark a checklist step complete (persisted to DB) */
export async function checklistSignOff(
  periodLabel: string,
  stepId: string,
  signedOffBy: string,
  steps: { id: string; name?: string; label?: string; status?: string }[]
): Promise<{ periodLabel: string; stepId: string; steps: { id: string; name?: string; label?: string; status?: string }[]; signedOffAt: string }> {
  const res = await authJson<{ periodLabel: string; stepId: string; steps: unknown[]; signedOffAt: string }>(
    '/api/close/checklist-sign-off',
    {
      method: 'POST',
      body: { periodLabel, stepId, signedOffBy, steps },
    }
  );
  return { ...res, steps: res.steps ?? steps };
}

export interface CloseAdjustmentRow {
  id: string;
  description?: string;
  status?: string;
  debits?: { account: string; amount: number }[];
  credits?: { account: string; amount: number }[];
}

/** Minimal shape for a JE suggestion sent to POST /api/close/adjustments/from-je (backend uses description, debits, credits, source). */
export interface JournalEntrySuggestionPayload {
  id?: string;
  date?: string;
  description: string;
  debits: { account: string; amount: number }[];
  credits: { account: string; amount: number }[];
  source: 'gap' | 'reconciliation' | 'manual';
  sourceDetail?: string;
}

/** GET /api/close/adjustments?periodLabel= */
export async function listAdjustments(periodLabel: string): Promise<CloseAdjustmentRow[]> {
  const res = await authJson<{ adjustments?: CloseAdjustmentRow[] }>(
    `/api/close/adjustments?periodLabel=${encodeURIComponent(periodLabel)}`
  );
  return res?.adjustments ?? [];
}

/** POST /api/close/adjustments/from-je — add JE as adjustment. */
export async function createAdjustment(
  periodLabel: string,
  payload: { suggestions?: JournalEntrySuggestionPayload[] }
): Promise<{ ok?: boolean; added?: CloseAdjustmentRow[]; count?: number }> {
  return authJson('/api/close/adjustments/from-je', {
    method: 'POST',
    body: { periodLabel, suggestions: payload.suggestions ?? [] },
  });
}

/** PATCH /api/close/adjustments/:id — Update adjustment status (approved / rejected / posted). approvedBy required for approved/posted. */
export async function updateAdjustmentStatus(
  adjustmentId: string,
  status: 'pending' | 'approved' | 'rejected' | 'posted',
  approvedBy?: string
): Promise<CloseAdjustmentRow & { approvalRequestId?: string }> {
  const body: { status: string; approvedBy?: string } = { status };
  if (approvedBy) body.approvedBy = approvedBy;
  return authJson<CloseAdjustmentRow & { approvalRequestId?: string }>(
    `/api/close/adjustments/${encodeURIComponent(adjustmentId)}`,
    { method: 'PATCH', body }
  );
}

/** Result of PATCH adjustment when backend may return 400 for approval workflow. */
export type UpdateAdjustmentStatusResult =
  | { success: true; adjustment: CloseAdjustmentRow }
  | { success: false; needsApproval: true; message: string; approvalRequestId?: string }
  | { success: false; error: string };

/** PATCH /api/close/adjustments/:id with parsed 400 body for approval workflow messaging. */
export async function updateAdjustmentStatusWithResult(
  adjustmentId: string,
  status: 'pending' | 'approved' | 'rejected' | 'posted',
  approvedBy?: string
): Promise<UpdateAdjustmentStatusResult> {
  const body: { status: string; approvedBy?: string } = { status };
  if (approvedBy) body.approvedBy = approvedBy;
  const res = await authFetch(
    `/api/close/adjustments/${encodeURIComponent(adjustmentId)}`,
    { method: 'PATCH', body }
  );
  const text = await res.text();
  if (res.ok) {
    const data = text ? (JSON.parse(text) as CloseAdjustmentRow) : undefined;
    return { success: true, adjustment: data! };
  }
  if (res.status === 400 && text) {
    try {
      const err = JSON.parse(text) as { approvalRequestId?: string; message?: string; error?: string };
      const msg = err.message ?? err.error ?? 'Approval required';
      if (err.approvalRequestId != null || /approval|submit for approval/i.test(msg)) {
        return { success: false, needsApproval: true, message: msg, approvalRequestId: err.approvalRequestId };
      }
    } catch {
      // fall through to generic error
    }
  }
  return { success: false, error: text || `Request failed (${res.status})` };
}

// --- Approvals API ---

export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRequestRow {
  id: string;
  tenantId: string;
  workflowId: string;
  resourceType: string;
  resourceId: string;
  currentStepIndex: number;
  status: ApprovalRequestStatus;
  createdAt: string;
  updatedAt: string;
}

/** POST /api/approvals/submit — Submit resource for approval. Returns created request id. */
export async function submitApproval(
  resourceType: 'close_adjustment' | 'budget_version' | 'close_checklist',
  resourceId: string
): Promise<{ approvalRequestId: string }> {
  const res = await authJson<{ approvalRequestId?: string; id?: string }>(
    '/api/approvals/submit',
    { method: 'POST', body: { resourceType, resourceId } }
  );
  const id = res?.approvalRequestId ?? res?.id;
  if (!id) throw new Error('Submit response missing approval request id');
  return { approvalRequestId: id };
}

/** GET /api/approvals/requests — List approval requests (optional resourceType, resourceId, status). */
export async function listApprovalRequests(params?: {
  resourceType?: string;
  resourceId?: string;
  status?: ApprovalRequestStatus;
}): Promise<ApprovalRequestRow[]> {
  const q = new URLSearchParams();
  if (params?.resourceType) q.set('resourceType', params.resourceType);
  if (params?.resourceId) q.set('resourceId', params.resourceId);
  if (params?.status) q.set('status', params.status);
  const query = q.toString();
  const res = await authJson<{ requests?: ApprovalRequestRow[] }>(
    `/api/approvals/requests${query ? `?${query}` : ''}`
  );
  return res?.requests ?? [];
}

/** PATCH /api/approvals/requests/:id — Approve or reject (body: action, actor?). */
export async function updateApprovalRequest(
  requestId: string,
  action: 'approved' | 'rejected',
  actor?: string
): Promise<{ request: ApprovalRequestRow; workflowComplete?: boolean }> {
  const body: { action: string; actor?: string } = { action };
  if (actor) body.actor = actor;
  return authJson<{ request: ApprovalRequestRow; workflowComplete?: boolean }>(
    `/api/approvals/requests/${encodeURIComponent(requestId)}`,
    { method: 'PATCH', body }
  );
}

export interface CloseStatusResponse {
  periodLabel: string;
  locked: boolean;
  hasUnadjustedTB: boolean;
  tbSource: 'uploaded' | 'synced' | null;
  tbAt?: string;
  adjustmentCount: number;
  postedCount: number;
  closeStage: CloseStage;
  checklist?: { total: number; completed: number; incompleteSteps: { id: string; label: string; status: string }[] };
  readiness?: { ready: boolean; reason?: string };
  [key: string]: unknown;
}

/** GET /api/close/status?periodLabel= — close status and progress (hasUnadjustedTB, tbSource, closeStage, checklist, etc.) */
export async function getCloseStatus(periodLabel: string): Promise<CloseStatusResponse> {
  return authJson<CloseStatusResponse>(
    `/api/close/status?periodLabel=${encodeURIComponent(periodLabel)}`
  );
}

/** GET /api/close/exceptions — open items; includeNarrative=true for agentic narrative + nextActions */
export async function getCloseExceptions(
  periodLabel: string,
  includeNarrative?: boolean
): Promise<{
  narrative?: string;
  nextActions?: { label: string; reason: string }[];
  [key: string]: unknown;
}> {
  const q = `periodLabel=${encodeURIComponent(periodLabel)}${includeNarrative ? '&includeNarrative=true' : ''}`;
  return authJson(`/api/close/exceptions?${q}`);
}

/** GET /api/close/readiness — close readiness; includeNarrative=true for agentic summary */
export async function getCloseReadiness(
  periodLabel: string,
  includeNarrative?: boolean
): Promise<{ ready: boolean; reason?: string; narrative?: string; [key: string]: unknown }> {
  const q = `periodLabel=${encodeURIComponent(periodLabel)}${includeNarrative ? '&includeNarrative=true' : ''}`;
  return authJson(`/api/close/readiness?${q}`);
}

/** GET /api/close/coach?periodLabel=... — Close coach: next best action and reason (agentic). Graceful if API key missing or call fails. */
export async function getCloseCoach(
  periodLabel: string
): Promise<{ nextAction: string; reason: string }> {
  return authJson<{ nextAction: string; reason: string }>(
    `/api/close/coach?periodLabel=${encodeURIComponent(periodLabel)}`
  );
}

/** POST /api/close/je-suggestions/from-text — agentic JE suggestions from natural language */
export async function getJESuggestionsFromText(
  text: string,
  periodEnd?: string
): Promise<{ suggestions?: unknown[] }> {
  const res = await authJson<{ suggestions?: unknown[] }>('/api/close/je-suggestions/from-text', {
    method: 'POST',
    body: { text, periodEnd },
  });
  return res ?? { suggestions: [] };
}

/** POST /api/close/je-suggestions/explain — agentic narrative for JE suggestions */
export async function explainJESuggestions(suggestions: unknown[]): Promise<{ narrative?: string }> {
  const res = await authJson<{ narrative?: string }>('/api/close/je-suggestions/explain', {
    method: 'POST',
    body: { suggestions },
  });
  return res ?? { narrative: '' };
}

/** POST /api/close/accrual-suggestions/agentic — agentic accrual/deferral suggestions */
export async function getAccrualSuggestionsAgentic(body: {
  periodEnd: string;
  openAR?: { invoiceId: string; amount: number; daysOpen: number }[];
  openAP?: { invoiceId: string; amount: number; daysOpen: number }[];
  payrollData?: { lastPayDate?: string; avgBiweeklyPayroll?: number };
}): Promise<{ suggestions?: unknown[] }> {
  const res = await authJson<{ suggestions?: unknown[] }>('/api/close/accrual-suggestions/agentic', {
    method: 'POST',
    body,
  });
  return res ?? { suggestions: [] };
}

/** POST /api/close/adjustments/from-accruals — add accrual suggestions to adjustments queue */
export async function addAccrualsAsAdjustments(
  periodLabel: string,
  suggestions: unknown[]
): Promise<{ added?: unknown[]; count?: number }> {
  return authJson('/api/close/adjustments/from-accruals', {
    method: 'POST',
    body: { periodLabel, suggestions },
  });
}

// --- Trial balance by period (unadjusted / adjusted / statements) ---

/** GET /api/trial-balance/period/:periodLabel — unadjusted TB for period (or roll-up from months for quarter/year) */
export async function getUnadjustedTrialBalance(periodLabel: string): Promise<{
  entries: { accountCode?: string; accountName: string; debit: number; credit: number; accountType?: string }[];
  source: 'uploaded' | 'synced' | 'rollup';
  at?: string;
  by?: string;
  connectionId?: string;
  constituentPeriods?: string[];
} | null> {
  try {
    const res = await authJson<{ entries?: unknown[]; source?: string; at?: string; by?: string; connectionId?: string; constituentPeriods?: string[] }>(
      `/api/trial-balance/period/${encodeURIComponent(periodLabel)}`
    );
    if (!res?.entries) return null;
    return {
      entries: res.entries as { accountCode?: string; accountName: string; debit: number; credit: number; accountType?: string }[],
      source: (res.source ?? 'uploaded') as 'uploaded' | 'synced' | 'rollup',
      at: res.at,
      by: res.by,
      connectionId: res.connectionId,
      constituentPeriods: res.constituentPeriods,
    };
  } catch {
    return null;
  }
}

/** GET /api/trial-balance/period/:periodLabel/adjusted — adjusted TB for period */
export async function getAdjustedTrialBalance(periodLabel: string): Promise<{
  entries: { accountCode?: string; accountName: string; debit: number; credit: number; accountType?: string }[];
} | null> {
  try {
    const res = await authJson<{ entries?: unknown[] }>(
      `/api/trial-balance/period/${encodeURIComponent(periodLabel)}/adjusted`
    );
    if (!res?.entries) return null;
    return { entries: res.entries as { accountCode?: string; accountName: string; debit: number; credit: number; accountType?: string }[] };
  } catch {
    return null;
  }
}

/** GET /api/trial-balance/period/:periodLabel/statements — BS, P&L, etc. from adjusted TB */
export async function getPeriodStatements(periodLabel: string): Promise<{
  balanceSheet?: unknown;
  profitAndLoss?: unknown;
  trialBalance?: { entries?: unknown[] };
  [key: string]: unknown;
} | null> {
  try {
    const res = await authJson<Record<string, unknown>>(
      `/api/trial-balance/period/${encodeURIComponent(periodLabel)}/statements`
    );
    return res;
  } catch {
    return null;
  }
}

// --- Closing entries (suggested JEs from adjusted TB) ---

export interface ClosingEntrySuggestion {
  id: string;
  date: string;
  description: string;
  debits: { account: string; amount: number }[];
  credits: { account: string; amount: number }[];
  source: string;
  sourceDetail?: string;
  confidence?: number;
}

/** GET /api/close/closing-entries?periodLabel= — suggested closing entry (revenue/expense to retained earnings) */
export async function getClosingEntries(periodLabel: string): Promise<ClosingEntrySuggestion | null> {
  try {
    const res = await authJson<{ suggestion?: ClosingEntrySuggestion }>(
      `/api/close/closing-entries?periodLabel=${encodeURIComponent(periodLabel)}`
    );
    return res.suggestion ?? null;
  } catch {
    return null;
  }
}

/** POST /api/close/closing-entries/add — add suggested closing entry as adjustment (pending). Body: periodLabel. */
export async function addClosingEntryAsAdjustment(periodLabel: string): Promise<{ added: { id: string }[]; count: number }> {
  return authJson<{ added: { id: string }[]; count: number }>('/api/close/closing-entries/add', {
    method: 'POST',
    body: { periodLabel },
  });
}

// --- Accounting integration (connections, sync TB) ---

export interface AccountingConnection {
  id: string;
  tenantId: string;
  provider: string;
  name: string;
  credentialRef: string;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/accounting-integration/connections — list connections for tenant */
export async function listConnections(): Promise<AccountingConnection[]> {
  try {
    const res = await authJson<AccountingConnection[]>('/api/accounting-integration/connections');
    return Array.isArray(res) ? res : [];
  } catch {
    return [];
  }
}

/** POST /api/accounting-integration/sync-trial-balance — sync TB from GL; optional periodLabel saves as unadjusted */
export async function syncTrialBalanceAuth(
  connectionId: string,
  periodLabel?: string,
  asOfDate?: string
): Promise<{ success: boolean; entries?: unknown[]; savedAsUnadjusted?: boolean; errors?: string[] }> {
  const res = await authJson<{ success: boolean; entries?: unknown[]; savedAsUnadjusted?: boolean; errors?: string[] }>(
    '/api/accounting-integration/sync-trial-balance',
    {
      method: 'POST',
      body: { connectionId, periodLabel, asOfDate },
    }
  );
  return res;
}

// --- Valuation (close-gated: only locked periods) ---

/** POST /api/valuation/dcf — run DCF (backend enforces period locked) */
export async function runDcf(periodLabel: string, assumptions: Record<string, unknown>): Promise<Record<string, unknown>> {
  return authJson('/api/valuation/dcf', {
    method: 'POST',
    body: { periodLabel, ...assumptions },
  });
}

// --- Supervisor conflicts ---

export interface ConflictItem {
  id: string;
  periodLabel?: string;
  conflictReason: string;
  conflictSnapshot?: Record<string, unknown>;
  resolvedAt?: string | null;
}

/** GET /api/supervisor/conflicts — list unresolved CPA-CFA conflicts */
export async function getConflicts(periodLabel?: string): Promise<ConflictItem[]> {
  const q = periodLabel ? `?periodLabel=${encodeURIComponent(periodLabel)}` : '';
  const res = await authJson<{ conflicts?: ConflictItem[] }>(`/api/supervisor/conflicts${q}`);
  return res.conflicts ?? [];
}

// --- Export ---

/** GET or POST export PDF for period (skeleton) */
export async function exportPdf(periodLabel: string): Promise<Blob> {
  const res = await authFetch(`/api/export/pdf?periodLabel=${encodeURIComponent(periodLabel)}`, { method: 'GET' });
  if (!res.ok) throw new Error(await res.text());
  return res.blob();
}

// --- Audit (binder, GAAP consistency, reconciliation summary, todos) ---

/** GET /api/audit/binder — Audit Binder (statements + CF + equity + line-level deep links) */
export async function getAuditBinder(params?: { periodStart?: string; periodEnd?: string; entityName?: string }): Promise<unknown> {
  const q = new URLSearchParams();
  if (params?.periodStart) q.set('periodStart', params.periodStart);
  if (params?.periodEnd) q.set('periodEnd', params.periodEnd);
  if (params?.entityName) q.set('entityName', params.entityName);
  const query = q.toString() ? `?${q.toString()}` : '';
  return authJson(`/api/audit/binder${query}`);
}

/** GET /api/audit/gaap-consistency — GAAP Consistency Report */
export async function getAuditGaapConsistency(params?: { periodStart?: string; periodEnd?: string }): Promise<unknown> {
  const q = new URLSearchParams();
  if (params?.periodStart) q.set('periodStart', params.periodStart);
  if (params?.periodEnd) q.set('periodEnd', params.periodEnd);
  const query = q.toString() ? `?${q.toString()}` : '';
  return authJson(`/api/audit/gaap-consistency${query}`);
}

/** GET /api/audit/reconciliation-summary — Reconciliation summary (TB/BS/CF/equity + failed checks) */
export async function getAuditReconciliationSummary(params?: { includeNarrative?: boolean }): Promise<unknown> {
  const q = params?.includeNarrative ? '?includeNarrative=true' : '';
  return authJson(`/api/audit/reconciliation-summary${q}`);
}

/** GET /api/audit/todos — Urgent To-Dos */
export async function getAuditTodos(params?: { status?: 'open' | 'done'; limit?: number }): Promise<{ todos: unknown[]; count: number }> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.limit != null) q.set('limit', String(params.limit));
  const query = q.toString() ? `?${q.toString()}` : '';
  const res = await authJson<{ todos?: unknown[]; count?: number }>(`/api/audit/todos${query}`);
  return { todos: res.todos ?? [], count: res.count ?? 0 };
}
