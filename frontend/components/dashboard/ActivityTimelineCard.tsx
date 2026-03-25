'use client';

import Link from 'next/link';
import type { AuditEvent } from '@/lib/types/audit-trail';
import { ArrowRight } from 'lucide-react';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const EVENT_LABELS: Record<string, string> = {
  close_session_transition: 'Close session status changed',
  close_session_created: 'Close session created',
  gl_upload: 'General ledger uploaded',
  gl_ingest: 'General ledger imported',
  mapping_rule_update: 'Account mapping updated',
  coa_mapping_rule_created: 'Account mapping rule created',
  ai_mapping_suggestion_accepted: 'AI mapping suggestion accepted',
  ai_mapping_suggestion_rejected: 'AI mapping suggestion rejected',
  journal_entry_posted: 'Journal entry posted',
  journal_entry_proposed: 'Journal entry proposed',
  journal_entry_approved: 'Journal entry approved',
  journal_entry_rejected: 'Journal entry rejected',
  reconciliation_completed: 'Reconciliation completed',
  reconciliation_approved: 'Reconciliation approved',
  recon_supporting_balance_set: 'Supporting balance entered',
  statements_generated: 'Financial statements generated',
  variance_explained: 'Variance explanation added',
  certification: 'Period certified',
  reopen: 'Period reopened',
  lock: 'Period locked',
};

function humanizeEvent(event: AuditEvent): string {
  if (event.description && !event.description.includes('Material event:')) return event.description;
  return EVENT_LABELS[event.eventType] ?? event.eventType.replace(/_/g, ' ');
}

function humanizeUser(event: AuditEvent): string {
  if (event.userName && !event.userName.startsWith('user-')) return event.userName;
  if (event.userId?.includes('@')) return event.userId.split('@')[0];
  if (event.userId?.startsWith('user-')) return 'Controller';
  return event.userName ?? 'System';
}

/* ── Types ────────────────────────────────────────────────────────────────── */

export interface ActivityTimelineCardProps {
  events: AuditEvent[];
  sessionId: string;
}

/* ── Card shell ───────────────────────────────────────────────────────────── */

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[var(--radius-lg)]"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {children}
    </div>
  );
}

/* ── Component ────────────────────────────────────────────────────────────── */

export function ActivityTimelineCard({ events, sessionId }: ActivityTimelineCardProps) {
  return (
    <CardShell>
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h2
          className="font-semibold text-base"
          style={{ color: 'var(--text-primary)' }}
        >
          Recent Activity
        </h2>
      </div>
      <div className="px-6 pb-5">
        {events.length === 0 ? (
          <p className="text-sm py-2" style={{ color: 'var(--text-tertiary)' }}>
            No recent activity recorded.
          </p>
        ) : (
          <ul className="space-y-1">
            {events.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start gap-3 py-2"
              >
                <span
                  className="text-xs w-[120px] flex-shrink-0 pt-0.5 tabular-nums"
                  style={{
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  {formatDate(entry.timestamp)}
                </span>
                <span
                  className="text-sm font-medium flex-shrink-0"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {humanizeUser(entry)}
                </span>
                <span
                  className="text-sm flex-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {humanizeEvent(entry)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/close/${sessionId}/audit-trail`}
          className="inline-flex items-center gap-1 text-xs font-medium mt-4"
          style={{ color: 'var(--text-link)' }}
        >
          View full audit trail <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </CardShell>
  );
}
