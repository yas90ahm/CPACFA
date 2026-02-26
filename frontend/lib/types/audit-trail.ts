export type AuditEventType =
  | 'close_state_change'
  | 'je_created'
  | 'je_proposed'
  | 'je_approved'
  | 'je_posted'
  | 'je_rejected'
  | 'recon_completed'
  | 'recon_approved'
  | 'mapping_changed'
  | 'evidence_uploaded'
  | 'variance_explained'
  | 'variance_approved'
  | 'certification'
  | 'lock'
  | 'reopen';

export interface AuditEvent {
  id: string;
  sessionId: string;
  eventType: AuditEventType;
  timestamp: string;
  userId: string;
  userName: string;
  description: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  hash: string;
  previousHash: string | null;
  chainValid: boolean;
  metadata?: Record<string, unknown>;
}
