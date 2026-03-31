'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { fmtMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface RollForwardViewProps {
  sessionId: string;
  reconId: string;
}

interface JournalEntryRef {
  id: string;
  memo: string;
  amount: string;
  date?: string;
  entryNumber?: string;
}

interface RollForwardSection {
  label: string;
  amount: string;
  entries: JournalEntryRef[];
}

interface RollForwardData {
  beginningBalance: string;
  additions: RollForwardSection;
  disposals: RollForwardSection;
  adjustments: RollForwardSection;
  endingBalance: string;
  glBalance: string;
  matchesGL: boolean;
}

function toRollForwardData(raw: Record<string, unknown>): RollForwardData {
  const toSection = (s: unknown): RollForwardSection => {
    const sec = (s ?? {}) as Record<string, unknown>;
    const entries = ((sec.entries ?? sec.journalEntries ?? []) as Record<string, unknown>[]).map((e) => ({
      id: (e.id ?? e.entryId ?? '') as string,
      memo: (e.memo ?? e.description ?? '') as string,
      amount: String(e.amount ?? '0'),
      date: (e.date ?? e.postDate) as string | undefined,
      entryNumber: (e.entryNumber ?? e.number) as string | undefined,
    }));
    return {
      label: (sec.label ?? '') as string,
      amount: String(sec.amount ?? sec.total ?? '0'),
      entries,
    };
  };

  return {
    beginningBalance: String(raw.beginningBalance ?? raw.openingBalance ?? '0'),
    additions: toSection(raw.additions),
    disposals: toSection(raw.disposals),
    adjustments: toSection(raw.adjustments),
    endingBalance: String(raw.endingBalance ?? raw.closingBalance ?? '0'),
    glBalance: String(raw.glBalance ?? '0'),
    matchesGL: (raw.matchesGL ?? raw.matches ?? false) as boolean,
  };
}

function ExpandableSection({
  sign,
  label,
  section,
}: {
  sign: string;
  label: string;
  section: RollForwardSection;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasEntries = section.entries.length > 0;

  return (
    <>
      <tr
        className={cn(
          'border-b border-border-light',
          hasEntries && 'cursor-pointer hover:bg-hover'
        )}
        onClick={() => hasEntries && setExpanded(!expanded)}
      >
        <td className="py-2.5 px-4 text-sm flex items-center gap-2">
          {hasEntries ? (
            expanded ? (
              <ChevronDown className="w-4 h-4 text-text-secondary shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-text-secondary shrink-0" />
            )
          ) : (
            <span className="w-4" />
          )}
          <span className="text-text-secondary">{sign}</span>
          <span>{label}</span>
          {hasEntries && (
            <span className="text-xs text-text-muted">({section.entries.length} entries)</span>
          )}
        </td>
        <td className="py-2.5 px-4 text-right">
          <MoneyCell value={section.amount} showDollar />
        </td>
      </tr>
      {expanded &&
        section.entries.map((je) => (
          <tr key={je.id} className="border-b border-border-light bg-elevated/50">
            <td className="py-1.5 pl-14 pr-4 text-xs text-text-secondary">
              {je.entryNumber && (
                <span className="font-mono text-text-muted mr-2">#{je.entryNumber}</span>
              )}
              {je.memo}
              {je.date && (
                <span className="text-text-muted ml-2">
                  {new Date(je.date).toLocaleDateString()}
                </span>
              )}
            </td>
            <td className="py-1.5 px-4 text-right text-xs font-mono">
              {fmtMoney(je.amount, { dollar: true })}
            </td>
          </tr>
        ))}
    </>
  );
}

export function RollForwardView({ sessionId, reconId }: RollForwardViewProps) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['roll-forward', sessionId, reconId],
    queryFn: async (): Promise<RollForwardData | null> => {
      try {
        const res = await apiFetch<Record<string, unknown>>(
          `/api/close/sessions/${sessionId}/reconciliations/${reconId}/roll-forward`
        );
        return toRollForwardData(res);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return null;
        }
        throw err;
      }
    },
    enabled: !!sessionId && !!reconId,
    staleTime: 30_000,
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 404) return false;
      return failureCount < 2;
    },
  });

  // Don't render if 404 (not a roll-forward account) or loading/error
  if (isLoading) {
    return (
      <section className="bg-surface border border-border rounded-card p-6">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-text-secondary" />
        </div>
      </section>
    );
  }

  if (!data || isError) {
    return null;
  }

  return (
    <section className="bg-surface border border-border rounded-card p-6">
      <h2 className="text-sm font-medium text-text-secondary mb-4">Roll-Forward Schedule</h2>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-4 font-medium text-text-secondary">Description</th>
              <th className="text-right py-2 px-4 font-medium text-text-secondary w-40">Amount</th>
            </tr>
          </thead>
          <tbody>
            {/* Beginning Balance */}
            <tr className="border-b border-border">
              <td className="py-2.5 px-4 font-semibold text-primary">Beginning Balance</td>
              <td className="py-2.5 px-4 text-right font-semibold">
                <MoneyCell value={data.beginningBalance} showDollar />
              </td>
            </tr>

            {/* Additions */}
            <ExpandableSection sign="+" label="Additions" section={data.additions} />

            {/* Disposals */}
            <ExpandableSection sign="-" label="Disposals" section={data.disposals} />

            {/* Adjustments */}
            <ExpandableSection sign="+/-" label="Adjustments" section={data.adjustments} />

            {/* Ending Balance */}
            <tr className="border-t-2 border-border">
              <td className="py-3 px-4 font-semibold text-primary">= Ending Balance</td>
              <td className="py-3 px-4 text-right font-semibold">
                <MoneyCell value={data.endingBalance} showDollar />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Verification */}
      <div
        className={cn(
          'mt-4 flex items-center gap-2 px-4 py-3 rounded-input border',
          data.matchesGL
            ? 'border-status-green bg-status-green-dim text-status-green'
            : 'border-status-red bg-status-red-dim text-status-red'
        )}
      >
        {data.matchesGL ? (
          <>
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">Matches GL Balance</span>
            <span className="text-xs ml-auto font-mono">
              GL: {fmtMoney(data.glBalance, { dollar: true })}
            </span>
          </>
        ) : (
          <>
            <XCircle className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">Does NOT match GL Balance</span>
            <span className="text-xs ml-auto font-mono">
              GL: {fmtMoney(data.glBalance, { dollar: true })} | Computed:{' '}
              {fmtMoney(data.endingBalance, { dollar: true })}
            </span>
          </>
        )}
      </div>
    </section>
  );
}
