/**
 * Mock SOC2-compliant audit log.
 * Every interaction with the bot is logged: timestamp, user ID, and Reasoning Path (AI).
 * In production this would write to a secure, append-only store with access controls.
 */

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO 8601
  userId: string;
  action: 'chat_message' | 'file_upload' | 'statement_view' | 'justification_request';
  resource?: string;
  reasoningPath?: string; // AI reasoning chain / path taken
  metadata?: Record<string, unknown>;
}

const store: AuditLogEntry[] = [];
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function generateId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Log an interaction. Mock: in-memory; production would POST to audit service.
 */
export function logAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
  const full: AuditLogEntry = {
    ...entry,
    id: generateId(),
    timestamp: new Date().toISOString(),
  };
  store.push(full);
  // Mock SOC2: "send" to audit backend (no-op if no endpoint)
  if (typeof window !== 'undefined') {
    fetch(`${API_BASE}/api/audit/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(full),
    }).catch(() => {});
  }
  return full;
}

/**
 * Retrieve audit log (mock). In production this would be restricted and paginated.
 */
export function getAuditLog(limit = 100): AuditLogEntry[] {
  return [...store].reverse().slice(0, limit);
}

/**
 * Get current user ID (mock). In production from auth/session.
 */
export function getCurrentUserId(): string {
  if (typeof window !== 'undefined') {
    return (window as unknown as { __MOCK_USER_ID?: string }).__MOCK_USER_ID ?? 'user-demo-001';
  }
  return 'user-demo-001';
}
