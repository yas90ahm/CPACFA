'use client';

import { GateIndicator } from '@/components/shared/GateIndicator';

/* ── Types ────────────────────────────────────────────────────────────────── */

export interface GateEntry {
  id?: string;
  name?: string;
  passing: boolean;
  detail?: string;
  navigateTo?: string;
}

export interface GateStatusCardProps {
  gates: GateEntry[];
  gatesPassing: number;
  gatesTotal: number;
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

export function GateStatusCard({
  gates,
  gatesPassing,
  gatesTotal,
  sessionId,
}: GateStatusCardProps) {
  return (
    <CardShell>
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h2
          className="font-semibold text-base"
          style={{ color: 'var(--text-primary)' }}
        >
          Gate Status
        </h2>
        <span
          className="text-sm tabular-nums"
          style={{
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          {gatesPassing} of {gatesTotal} passing
        </span>
      </div>
      <div className="px-6 pb-5">
        {gates.length > 0 ? (
          <div
            className="divide-y"
            style={{ borderColor: 'var(--border-default)' }}
          >
            {gates.map((gate, idx) => (
              <GateIndicator
                key={gate.id ?? idx}
                gateNumber={idx + 1}
                gateName={gate.name ?? `Gate ${idx + 1}`}
                status={
                  gate.passing
                    ? 'passed'
                    : gate.detail === 'Not yet evaluated'
                      ? 'not-evaluated'
                      : 'failed'
                }
                detail={gate.passing ? (gate.detail as string) : undefined}
                failureReason={!gate.passing ? (gate.detail as string) : undefined}
                failureLink={
                  !gate.passing && gate.navigateTo
                    ? (gate.navigateTo as string).replace('[sessionId]', sessionId)
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <p
            className="text-sm py-4 text-center"
            style={{ color: 'var(--text-tertiary)' }}
          >
            No gates configured for this session.
          </p>
        )}
      </div>
    </CardShell>
  );
}
