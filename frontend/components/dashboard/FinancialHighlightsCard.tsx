'use client';

import { cn } from '@/lib/utils';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { EmptyState } from '@/components/shared/EmptyState';
import { Check, FileText } from 'lucide-react';

/* ── Types ────────────────────────────────────────────────────────────────── */

export interface FinancialLine {
  label: string;
  amount: string | null;
  prior?: string;
  variant?: 'line-item' | 'subtotal' | 'total';
}

export interface FinancialHighlightsCardProps {
  financialLines: FinancialLine[];
  balanceVerified: boolean;
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

export function FinancialHighlightsCard({
  financialLines,
  balanceVerified,
  sessionId,
}: FinancialHighlightsCardProps) {
  const hasFinancials = financialLines.some((l) => l.amount !== null);

  return (
    <CardShell>
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h2
          className="font-semibold text-base"
          style={{ color: 'var(--text-primary)' }}
        >
          Financial Summary
        </h2>
        {balanceVerified && (
          <span
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-[var(--radius-md)]"
            style={{
              backgroundColor: 'var(--status-success-bg)',
              color: 'var(--status-success)',
            }}
          >
            <Check className="w-3 h-3" />
            A = L + E: Verified
          </span>
        )}
      </div>
      <div className="px-6 pb-5">
        {hasFinancials ? (
          <div className="space-y-0">
            {/* Table header */}
            <div
              className="grid grid-cols-3 gap-4 pb-2 mb-2"
              style={{ borderBottom: '1px solid var(--border-default)' }}
            >
              <span
                className="text-xs font-medium uppercase tracking-wide"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Line Item
              </span>
              <span
                className="text-xs font-medium uppercase tracking-wide text-right"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Current
              </span>
              <span
                className="text-xs font-medium uppercase tracking-wide text-right"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Prior
              </span>
            </div>
            {financialLines
              .filter((l) => l.amount !== null)
              .map((line) => (
                <div
                  key={line.label}
                  className="grid grid-cols-3 gap-4 py-2"
                  style={{
                    borderBottom:
                      line.variant === 'total'
                        ? 'none'
                        : '1px solid var(--border-default)',
                  }}
                >
                  <span
                    className={cn(
                      'text-sm',
                      line.variant === 'total' && 'font-bold',
                      line.variant === 'subtotal' && 'font-semibold',
                    )}
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {line.label}
                  </span>
                  <MoneyCell
                    value={line.amount}
                    variant={line.variant ?? 'line-item'}
                    showCurrency
                  />
                  <MoneyCell
                    value={line.prior ?? null}
                    variant="line-item"
                    showCurrency
                    className="opacity-70"
                  />
                </div>
              ))}
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="No financial data yet"
            description="Generate financial statements to see summary metrics here."
            actionLabel="Go to Statements"
            onAction={() => {
              window.location.href = `/close/${sessionId}/statements`;
            }}
          />
        )}
      </div>
    </CardShell>
  );
}
