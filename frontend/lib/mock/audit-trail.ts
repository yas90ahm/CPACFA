import type { AuditEvent } from '@/lib/types/audit-trail';

function event(
  id: string,
  eventType: AuditEvent['eventType'],
  timestamp: string,
  userId: string,
  userName: string,
  description: string,
  previousHash: string | null,
  metadata?: Record<string, unknown>
): AuditEvent {
  const hash = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return {
    id,
    sessionId: 'c925645f-3831-4d81-93a9-a12a2819cd3e',
    eventType,
    timestamp,
    userId,
    userName,
    description,
    beforeState: null,
    afterState: null,
    hash,
    previousHash,
    chainValid: true,
    metadata,
  };
}

let prevHash: string | null = null;

const events: AuditEvent[] = [];
const eventData = [
  { id: 'evt-1', type: 'close_state_change' as const, ts: '2026-02-01T09:00:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Created close session' },
  { id: 'evt-2', type: 'close_state_change' as const, ts: '2026-02-01T09:15:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Advanced period to IN_PROGRESS' },
  { id: 'evt-3', type: 'mapping_changed' as const, ts: '2026-02-01T10:00:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Bulk mapped 44 accounts to COA' },
  { id: 'evt-4', type: 'mapping_changed' as const, ts: '2026-02-01T11:00:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Mapped Account 6200 to Operating Expenses — General' },
  { id: 'evt-5', type: 'recon_completed' as const, ts: '2026-02-02T09:00:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Completed reconciliation: Account 1010 — Chase Checking' },
  { id: 'evt-6', type: 'recon_completed' as const, ts: '2026-02-02T10:00:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Completed reconciliation: Account 1100 — Accounts Receivable' },
  { id: 'evt-7', type: 'recon_completed' as const, ts: '2026-02-02T11:00:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Completed reconciliation: Account 1200 — Inventory' },
  { id: 'evt-8', type: 'recon_completed' as const, ts: '2026-02-02T14:00:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Completed reconciliation: Account 2010 — Accounts Payable' },
  { id: 'evt-9', type: 'recon_completed' as const, ts: '2026-02-02T15:00:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Completed reconciliation: Account 2100 — Accrued Expenses' },
  { id: 'evt-10', type: 'recon_approved' as const, ts: '2026-02-03T09:00:00Z', user: 'user-mike', name: 'Mike Torres', desc: 'Approved reconciliation: Account 1010 — Chase Checking' },
  { id: 'evt-11', type: 'recon_approved' as const, ts: '2026-02-03T10:00:00Z', user: 'user-mike', name: 'Mike Torres', desc: 'Approved reconciliation: Account 1100 — Accounts Receivable' },
  { id: 'evt-12', type: 'recon_approved' as const, ts: '2026-02-03T11:00:00Z', user: 'user-mike', name: 'Mike Torres', desc: 'Approved reconciliation: Account 1200 — Inventory' },
  { id: 'evt-13', type: 'recon_approved' as const, ts: '2026-02-03T14:00:00Z', user: 'user-mike', name: 'Mike Torres', desc: 'Approved reconciliation: Account 2010 — Accounts Payable' },
  { id: 'evt-14', type: 'recon_approved' as const, ts: '2026-02-03T15:00:00Z', user: 'user-mike', name: 'Mike Torres', desc: 'Approved reconciliation: Account 2100 — Accrued Expenses' },
  { id: 'evt-15', type: 'je_created' as const, ts: '2026-02-04T09:00:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Created journal entry JE #1040 (draft)', meta: { jeNumber: 1040 } },
  { id: 'evt-16', type: 'je_proposed' as const, ts: '2026-02-04T10:00:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Submitted JE #1040 for approval', meta: { jeNumber: 1040 } },
  { id: 'evt-17', type: 'je_approved' as const, ts: '2026-02-04T11:00:00Z', user: 'user-mike', name: 'Mike Torres', desc: 'Approved JE #1040', meta: { jeNumber: 1040 } },
  { id: 'evt-18', type: 'je_posted' as const, ts: '2026-02-04T12:00:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Posted JE #1040 — Bad Debt Expense ($18,500.00)', meta: { jeNumber: 1040, amount: 18500 } },
  { id: 'evt-19', type: 'je_created' as const, ts: '2026-02-04T13:00:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Created journal entry JE #1042 (draft)', meta: { jeNumber: 1042 } },
  { id: 'evt-20', type: 'je_proposed' as const, ts: '2026-02-04T14:00:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Submitted JE #1042 for approval', meta: { jeNumber: 1042 } },
  { id: 'evt-21', type: 'je_approved' as const, ts: '2026-02-04T15:00:00Z', user: 'user-mike', name: 'Mike Torres', desc: 'Approved JE #1042', meta: { jeNumber: 1042 } },
  { id: 'evt-22', type: 'je_posted' as const, ts: '2026-02-04T16:00:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Posted JE #1042 — Inventory reserve adjustment ($52,000.00)', meta: { jeNumber: 1042, amount: 52000 } },
  { id: 'evt-23', type: 'close_state_change' as const, ts: '2026-02-04T17:00:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Generated statement package' },
  { id: 'evt-24', type: 'variance_explained' as const, ts: '2026-02-05T09:00:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Saved variance explanation: Revenue — Product Sales (+$1.25M)' },
  { id: 'evt-25', type: 'variance_approved' as const, ts: '2026-02-05T10:00:00Z', user: 'user-mike', name: 'Mike Torres', desc: 'Approved variance explanation: Revenue — Product Sales' },
  { id: 'evt-26', type: 'close_state_change' as const, ts: '2026-02-05T14:00:00Z', user: 'user-sarah', name: 'Sarah Chen', desc: 'Advanced period to UNDER_REVIEW' },
  { id: 'evt-27', type: 'certification' as const, ts: '2026-02-05T16:32:18Z', user: 'user-mike', name: 'Mike Torres', desc: 'Certified period — artifact signed (SHA: a3f2c8...)' },
];

eventData.forEach((d) => {
  const evt = event(d.id, d.type, d.ts, d.user, d.name, d.desc, prevHash, d.meta);
  events.push(evt);
  prevHash = evt.hash;
});

export const mockAuditEvents: AuditEvent[] = events;

export function getAuditEventsBySession(_sessionId: string): AuditEvent[] {
  return mockAuditEvents;
}
