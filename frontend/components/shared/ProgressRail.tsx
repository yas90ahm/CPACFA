'use client';

/**
 * ProgressRail — Persistent context bar on every close-related page.
 *
 * Design System Principle 5 (Contextual Flow):
 *   No standalone pages. Every module is a step in a journey.
 *   Persistent Progress Rail on every page.
 *   Format: Gate {N} of 11 · {Module} · {N} JEs proposed · Close day {N} of {N} · {N} gates remaining
 *
 * Background: ledger-100 (#EDE6D6)
 * Text: ledger-600 (#5C4F3A)
 * Active gate: forest green
 */

import { Shield, Clock, FileText, AlertTriangle } from 'lucide-react';

interface ProgressRailProps {
  /** Current gate number passing (e.g., 7 of 11) */
  gatesPassing: number;
  /** Total gates */
  gatesTotal: number;
  /** Current module/stage name */
  currentModule?: string;
  /** Number of JEs proposed this session */
  jesProposed?: number;
  /** Close day (e.g., day 5 of 10) */
  closeDay?: number;
  /** Close duration target */
  closeDayTarget?: number;
  /** Next state to reach */
  nextState?: string;
  /** Number of blocking issues */
  blockingIssues?: number;
  /** Session status */
  status?: string;
}

export default function ProgressRail({
  gatesPassing,
  gatesTotal,
  currentModule,
  jesProposed,
  closeDay,
  closeDayTarget,
  nextState,
  blockingIssues,
  status,
}: ProgressRailProps) {
  const gatesRemaining = gatesTotal - gatesPassing;
  const allPassing = gatesRemaining === 0;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 text-xs border-b"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-default)',
        color: 'var(--text-secondary)',
      }}
    >
      {/* Gate status */}
      <span className="inline-flex items-center gap-1">
        <Shield
          size={13}
          style={{ color: allPassing ? 'var(--color-human-confirmed)' : 'var(--color-blocking)' }}
        />
        <span className="font-medium" style={{ color: allPassing ? 'var(--color-human-confirmed)' : 'var(--text-primary)' }}>
          Gate {gatesPassing} of {gatesTotal}
        </span>
      </span>

      <span style={{ color: 'var(--border-default)' }}>·</span>

      {/* Current module */}
      {currentModule && (
        <>
          <span>{currentModule}</span>
          <span style={{ color: 'var(--border-default)' }}>·</span>
        </>
      )}

      {/* JEs proposed */}
      {jesProposed != null && jesProposed > 0 && (
        <>
          <span className="inline-flex items-center gap-1">
            <FileText size={12} />
            {jesProposed} JE{jesProposed !== 1 ? 's' : ''} proposed
          </span>
          <span style={{ color: 'var(--border-default)' }}>·</span>
        </>
      )}

      {/* Close day */}
      {closeDay != null && closeDayTarget != null && (
        <>
          <span className="inline-flex items-center gap-1">
            <Clock size={12} />
            Close day {closeDay} of {closeDayTarget}
          </span>
          <span style={{ color: 'var(--border-default)' }}>·</span>
        </>
      )}

      {/* Gates remaining / blocking issues */}
      {blockingIssues != null && blockingIssues > 0 ? (
        <span
          className="inline-flex items-center gap-1 font-medium"
          style={{ color: 'var(--color-blocking)' }}
        >
          <AlertTriangle size={12} />
          {blockingIssues} blocking issue{blockingIssues !== 1 ? 's' : ''}
        </span>
      ) : gatesRemaining > 0 ? (
        <span style={{ color: 'var(--color-needs-review)' }}>
          {gatesRemaining} gate{gatesRemaining !== 1 ? 's' : ''} remaining
          {nextState ? ` before ${nextState}` : ''}
        </span>
      ) : (
        <span style={{ color: 'var(--color-human-confirmed)' }}>
          All gates passing
          {status === 'in_progress' ? ' — ready for review' : ''}
        </span>
      )}
    </div>
  );
}
