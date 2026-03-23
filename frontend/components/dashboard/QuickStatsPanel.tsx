'use client';

import { StatusBadge } from '@/components/shared/StatusBadge';

/* ── Types ────────────────────────────────────────────────────────────────── */

export interface QuickStatsPanelProps {
  gatesPassing: number;
  gatesTotal: number;
  mappedCount: number;
  unmappedCount: number;
  reconComplete: number;
  reconTotal: number;
  statementsGenerated: boolean;
  statementsStale: boolean;
}

/* ── Stat card ────────────────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  total,
  barColor,
}: {
  label: string;
  value: number;
  total: number;
  barColor: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;

  return (
    <div
      className="rounded-[var(--radius-lg)]"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="px-5 py-4">
        <p
          className="text-xs font-medium uppercase tracking-wide mb-1"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {label}
        </p>
        <p
          className="text-xl font-bold tabular-nums"
          style={{ color: 'var(--text-primary)' }}
        >
          {value}{' '}
          <span
            className="text-sm font-normal"
            style={{ color: 'var(--text-secondary)' }}
          >
            / {total}
          </span>
        </p>
        <div
          className="mt-2 h-1.5 rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--bg-surface-sunken)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              backgroundColor: barColor,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Component ────────────────────────────────────────────────────────────── */

export function QuickStatsPanel({
  gatesPassing,
  gatesTotal,
  mappedCount,
  unmappedCount,
  reconComplete,
  reconTotal,
  statementsGenerated,
  statementsStale,
}: QuickStatsPanelProps) {
  const totalAccounts = mappedCount + unmappedCount;

  return (
    <div className="flex flex-col gap-4">
      <StatCard
        label="Gates Passing"
        value={gatesPassing}
        total={gatesTotal}
        barColor={
          gatesPassing === gatesTotal
            ? 'var(--status-success)'
            : 'var(--interactive-primary)'
        }
      />
      <StatCard
        label="Accounts Mapped"
        value={mappedCount}
        total={totalAccounts}
        barColor={
          unmappedCount === 0
            ? 'var(--status-success)'
            : 'var(--interactive-primary)'
        }
      />
      <StatCard
        label="Recons Complete"
        value={reconComplete}
        total={reconTotal}
        barColor={
          reconComplete === reconTotal && reconTotal > 0
            ? 'var(--status-success)'
            : 'var(--interactive-primary)'
        }
      />

      {/* Statements status */}
      <div
        className="rounded-[var(--radius-lg)]"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div className="px-5 py-4">
          <p
            className="text-xs font-medium uppercase tracking-wide mb-1"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Statements
          </p>
          <div className="mt-1">
            {statementsGenerated && !statementsStale ? (
              <StatusBadge status="complete" label="Current" />
            ) : statementsStale ? (
              <StatusBadge status="pending" label="Stale" />
            ) : (
              <StatusBadge status="not-started" label="Not Generated" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
