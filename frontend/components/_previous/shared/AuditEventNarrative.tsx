'use client';

/**
 * AuditEventNarrative — Human-readable audit trail rendering.
 *
 * Design System Principle 3 (Narrative-Driven Auditing):
 *   No raw GUIDs, no camelCase event types, no user ID strings.
 *   Transform raw events into human-readable narratives.
 *
 * Examples from the spec:
 *   user-177302... → Sarah Miller (Controller)
 *   close_session_transition → Advanced close to Under Review — all 8 required gates passed
 *   je_posted → Sarah posted Journal Entry #47: Depreciation expense ($24,500)
 */

import { Shield, FileText, CheckCircle2, Sparkles, Lock, AlertTriangle, ArrowRight, XCircle } from 'lucide-react';

interface AuditEvent {
  id: string;
  eventType: string;
  createdBy?: string;
  createdByName?: string;
  createdByRole?: string;
  createdAt: string;
  deterministicFlagSnapshot?: Record<string, unknown>;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
}

interface AuditEventNarrativeProps {
  event: AuditEvent;
  /** Show the full timestamp (not relative) */
  showFullTimestamp?: boolean;
}

/** Maps raw event types to human-readable narratives */
function narrateEvent(event: AuditEvent): { text: string; icon: typeof Shield; color: string } {
  const snap = event.deterministicFlagSnapshot ?? {};
  const actor = event.createdByName || event.createdBy?.slice(0, 8) || 'System';
  const role = event.createdByRole ? ` (${event.createdByRole})` : '';
  const who = `${actor}${role}`;

  switch (event.eventType) {
    case 'je_posting': {
      const memo = snap.memo || snap.certificationMemo || '';
      const total = snap.total_debit || snap.totalDebit || '';
      const displayAmt = total ? ` ($${Number(total).toLocaleString()})` : '';
      return {
        text: `${who} posted a journal entry${memo ? `: ${memo}` : ''}${displayAmt}`,
        icon: FileText,
        color: 'var(--color-human-confirmed)',
      };
    }
    case 'je_approval':
      return {
        text: `${who} approved journal entry${snap.je_id ? ` #${String(snap.je_id).slice(0, 8)}` : ''}`,
        icon: CheckCircle2,
        color: 'var(--color-human-confirmed)',
      };
    case 'close_session_transition': {
      const from = snap.from || snap.statusBefore || '';
      const to = snap.to || snap.statusAfter || '';
      const action = snap.action === 'demo_reset_initiated'
        ? 'initiated demo reset'
        : `advanced close from ${humanizeStatus(String(from))} to ${humanizeStatus(String(to))}`;
      return {
        text: `${who} ${action}`,
        icon: ArrowRight,
        color: 'var(--color-sabit-acted)',
      };
    }
    case 'certify_close':
      return {
        text: `${who} certified the close period — financial statements signed with Ed25519`,
        icon: Lock,
        color: 'var(--color-certified)',
      };
    case 'close_session_locked':
      return {
        text: `${who} locked the period — terminal state, no further changes permitted`,
        icon: Lock,
        color: 'var(--color-certified)',
      };
    case 'ai_mapping_suggestion_accepted':
      return {
        text: `${who} accepted AI mapping: ${snap.accountName ?? ''} → ${snap.acceptedFsLineId ?? snap.originalFsLineId ?? ''}`,
        icon: Sparkles,
        color: 'var(--color-sabit-acted)',
      };
    case 'ai_mapping_suggestion_edited':
      return {
        text: `${who} edited AI mapping: ${snap.accountName ?? ''} — overrode ${snap.originalFsLineId ?? ''} with ${snap.acceptedFsLineId ?? ''}`,
        icon: Sparkles,
        color: 'var(--color-needs-review)',
      };
    case 'ai_mapping_suggestion_rejected':
      return {
        text: `${who} rejected AI mapping for ${snap.accountName ?? ''}`,
        icon: XCircle,
        color: 'var(--color-blocking)',
      };
    case 'mapping_auto_accepted': {
      const action = snap.action as string;
      if (action === 'auto_proposed_and_accepted') {
        return {
          text: `Sabit auto-proposed mapping: ${snap.accountName ?? ''} → ${snap.fsLineId ?? ''} (${Math.round(Number(snap.confidence ?? 0) * 100)}% confidence)`,
          icon: Sparkles,
          color: 'var(--color-sabit-acted)',
        };
      }
      if (action === 'routed_to_human_review') {
        return {
          text: `Sabit flagged ${snap.accountName ?? ''} for human review — ${(snap.suspects as string[])?.join(', ') ?? 'suspect detected'}`,
          icon: AlertTriangle,
          color: 'var(--color-needs-review)',
        };
      }
      if (action === 'acceptance_failed') {
        return {
          text: `Auto-propose failed for ${snap.accountName ?? ''}: ${snap.error ?? 'unknown error'}`,
          icon: XCircle,
          color: 'var(--color-blocking)',
        };
      }
      return {
        text: `Sabit processed mapping for ${snap.accountName ?? ''}`,
        icon: Sparkles,
        color: 'var(--color-sabit-acted)',
      };
    }
    case 'recon_confirmation':
      return {
        text: `${who} completed reconciliation for ${snap.accountCode ?? (Array.isArray(snap.affected_accounts) ? snap.affected_accounts[0] : '') ?? ''}`,
        icon: CheckCircle2,
        color: 'var(--color-human-confirmed)',
      };
    case 'recon_signoff':
      return {
        text: `${who} approved reconciliation`,
        icon: Shield,
        color: 'var(--color-human-confirmed)',
      };
    case 'ai_variance_draft_accepted':
      return {
        text: `${who} accepted AI variance explanation for ${snap.fsLineId ?? ''}`,
        icon: Sparkles,
        color: 'var(--color-sabit-acted)',
      };
    case 'ai_variance_draft_edited':
      return {
        text: `${who} edited AI variance explanation for ${snap.fsLineId ?? ''}`,
        icon: Sparkles,
        color: 'var(--color-needs-review)',
      };
    case 'statement_package_generation':
      return {
        text: `Sabit generated financial statements package`,
        icon: FileText,
        color: 'var(--color-sabit-acted)',
      };
    case 'subsequent_event_created':
      return {
        text: `${who} recorded subsequent event: ${snap.description ?? ''}`,
        icon: AlertTriangle,
        color: 'var(--color-needs-review)',
      };
    case 'subsequent_events_confirmed_none':
      return {
        text: `${who} confirmed no subsequent events after balance sheet date`,
        icon: CheckCircle2,
        color: 'var(--color-human-confirmed)',
      };
    default:
      return {
        text: `${who}: ${humanizeEventType(event.eventType)}`,
        icon: Shield,
        color: 'var(--text-secondary)',
      };
  }
}

function humanizeStatus(status: string): string {
  const map: Record<string, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    under_review: 'Under Review',
    certified: 'Certified',
    subsequent_events_review: 'Subsequent Events Review',
    locked: 'Locked',
  };
  return map[status] || status;
}

function humanizeEventType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimestamp(iso: string, full?: boolean): string {
  const d = new Date(iso);
  if (full) {
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AuditEventNarrative({ event, showFullTimestamp }: AuditEventNarrativeProps) {
  const { text, icon: Icon, color } = narrateEvent(event);

  return (
    <div className="flex items-start gap-2.5 py-2">
      <div
        className="flex-shrink-0 mt-0.5 rounded-full p-1"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
      >
        <Icon size={13} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="type-body" style={{ color: 'var(--text-primary)' }}>
          {text}
        </p>
        <p className="type-caption" style={{ color: 'var(--text-tertiary)' }}>
          {formatTimestamp(event.createdAt, showFullTimestamp)}
        </p>
      </div>
    </div>
  );
}
