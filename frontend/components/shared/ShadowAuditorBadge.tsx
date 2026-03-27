'use client';

/**
 * ShadowAuditorBadge — Event-driven verification indicator.
 *
 * Design System Principle 4 (Pulse of the Engine):
 *   Verification indicators are event-driven, not ambient.
 *   Appears for 4 seconds, then collapses to small verified icon.
 *   On hover/expand: lists the specific checks that ran.
 *
 * "Shadow Auditor: 3 checks passed"
 * Then collapses to ✓ icon with tooltip.
 */

import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, ChevronDown } from 'lucide-react';

interface ShadowAuditorCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

interface ShadowAuditorBadgeProps {
  /** Checks that ran */
  checks: ShadowAuditorCheck[];
  /** When the checks completed (triggers the 4s animation) */
  completedAt?: string;
  /** Always show collapsed (for historical display) */
  initialCollapsed?: boolean;
}

export default function ShadowAuditorBadge({
  checks,
  completedAt,
  initialCollapsed = false,
}: ShadowAuditorBadgeProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [expanded, setExpanded] = useState(false);

  const passedCount = checks.filter((c) => c.passed).length;
  const allPassed = passedCount === checks.length;

  // Auto-collapse after 4 seconds (event-driven pulse)
  useEffect(() => {
    if (initialCollapsed) return;
    const timer = setTimeout(() => setCollapsed(true), 4000);
    return () => clearTimeout(timer);
  }, [completedAt, initialCollapsed]);

  const toggle = useCallback(() => setExpanded((e) => !e), []);

  // Collapsed state: small verified icon with tooltip
  if (collapsed && !expanded) {
    return (
      <button
        onClick={toggle}
        title={`Shadow Auditor: ${passedCount} check${passedCount !== 1 ? 's' : ''} passed`}
        className="inline-flex items-center rounded-sm p-0.5 transition-opacity"
        style={{ color: allPassed ? 'var(--color-human-confirmed)' : 'var(--color-blocking)' }}
      >
        <ShieldCheck size={14} />
      </button>
    );
  }

  return (
    <div
      className="inline-flex flex-col rounded-md border transition-all"
      style={{
        backgroundColor: allPassed ? 'var(--color-human-confirmed-bg)' : 'var(--color-blocking-bg)',
        borderColor: allPassed ? 'var(--color-human-confirmed)' : 'var(--color-blocking)',
      }}
    >
      {/* Header bar */}
      <button
        onClick={toggle}
        className="inline-flex items-center gap-1.5 px-2 py-1 type-badge"
        style={{ color: allPassed ? 'var(--color-human-confirmed)' : 'var(--color-blocking)' }}
      >
        <ShieldCheck size={13} />
        <span>Shadow Auditor: {passedCount} check{passedCount !== 1 ? 's' : ''} passed</span>
        {expanded && <ChevronDown size={11} className="ml-auto" />}
      </button>

      {/* Expanded: show individual checks */}
      {expanded && (
        <div className="px-2 pb-1.5 space-y-0.5">
          {checks.map((check, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 type-caption"
              style={{ color: check.passed ? 'var(--color-human-confirmed)' : 'var(--color-blocking)' }}
            >
              <span>{check.passed ? '✓' : '✗'}</span>
              <span>{check.name}</span>
              {check.detail && (
                <span style={{ color: 'var(--text-tertiary)' }}>— {check.detail}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
