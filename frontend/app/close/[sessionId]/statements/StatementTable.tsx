'use client';

import React, { useState, useCallback } from 'react';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { parseMoney } from '@/lib/format';
import type { StatementLineItem, AccountRollup, JournalEntryRef } from '@/lib/types/statements';
import type { JournalEntry, JournalEntryLine } from '@/lib/types/journal-entry';

function formatAmount(amount: string): string {
  if (!amount) return '—';
  const n = parseFloat(amount);
  if (Number.isNaN(n)) return amount;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function amountCell(amount: string, isGrandTotal: boolean, isSubtotal: boolean, onClick?: () => void) {
  const hasAmount = amount && amount.trim() !== '';
  const formatted = hasAmount ? formatAmount(amount) : '—';
  const num = hasAmount ? parseMoney(amount) : 0;
  const clickable = onClick && hasAmount && !isSubtotal && !isGrandTotal;
  return (
    <td className="text-right font-mono tabular-nums text-sm py-1.5">
      {clickable ? (
        <button
          type="button"
          onClick={onClick}
          className="border-b border-dotted border-current hover:bg-hover rounded px-1 -mx-1"
        >
          <MoneyCell value={num} showDollar />
        </button>
      ) : hasAmount ? (
        <span className={isGrandTotal ? 'font-bold text-base' : isSubtotal ? 'font-bold' : ''}>
          <MoneyCell value={num} showDollar />
        </span>
      ) : (
        <span className="text-text-muted">—</span>
      )}
    </td>
  );
}

function buildSyntheticJe(ref: JournalEntryRef, accountCode: string, accountName: string): JournalEntry {
  const amt = parseFloat(ref.amount);
  const isDebit = amt >= 0;
  const numMatch = ref.jeNumber.match(/\d+/);
  const jeNum = numMatch ? parseInt(numMatch[0], 10) : 0;
  const lines: JournalEntryLine[] = isDebit
    ? [
        { id: 'l1', accountCode, accountName, description: null, debit: Math.abs(amt), credit: 0 },
        { id: 'l2', accountCode: 'OFFSET', accountName: 'Offset', description: null, debit: 0, credit: Math.abs(amt) },
      ]
    : [
        { id: 'l1', accountCode: 'OFFSET', accountName: 'Offset', description: null, debit: Math.abs(amt), credit: 0 },
        { id: 'l2', accountCode, accountName, description: null, debit: 0, credit: Math.abs(amt) },
      ];
  return {
    id: ref.jeId,
    sessionId: '',
    jeNumber: ref.jeNumber === 'GL Import' ? 0 : jeNum,
    date: ref.date,
    memo: ref.memo,
    status: 'posted',
    source: 'manual',
    templateId: null,
    templateName: null,
    lines,
    evidenceCount: 0,
    createdBy: 'System',
    createdAt: ref.date,
    proposedBy: null,
    proposedAt: null,
    approvedBy: null,
    approvedAt: null,
    postedBy: null,
    postedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
  };
}

export interface StatementTableProps {
  lines: StatementLineItem[];
  showPriorPeriod?: boolean;
  showChanges?: boolean;
  onOpenJe?: (entry: JournalEntry) => void;
}

export function StatementTable({ lines, showPriorPeriod, showChanges, onOpenJe }: StatementTableProps) {
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [expandedAccountKey, setExpandedAccountKey] = useState<string | null>(null);

  const toggleLine = useCallback((id: string) => {
    setExpandedLineId((prev) => (prev === id ? null : id));
    setExpandedAccountKey(null);
  }, []);

  const toggleAccount = useCallback((lineId: string, accountCode: string) => {
    const key = `${lineId}:${accountCode}`;
    setExpandedAccountKey((prev) => (prev === key ? null : key));
  }, []);

  const handleOpenJe = useCallback(
    (ref: JournalEntryRef, accountCode: string, accountName: string) => {
      const entry = buildSyntheticJe(ref, accountCode, accountName);
      onOpenJe?.(entry);
    },
    [onOpenJe]
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ border: 'none' }}>
        <tbody>
          {lines.map((row) => {
            const isSectionHeader = row.indentLevel === 0 && !row.amount;
            const isExpanded = expandedLineId === row.id;
            const hasAccounts = row.accounts && row.accounts.length > 0;

            return (
              <React.Fragment key={row.id}>
                <tr
                  className={
                    isSectionHeader
                      ? 'font-bold text-primary'
                      : row.isGrandTotal
                        ? 'border-t-2 border-border font-bold text-primary'
                        : row.isSubtotal
                          ? 'border-t border-border font-bold'
                          : ''
                  }
                >
                  <td
                    className="py-1.5 pr-4 align-baseline"
                    style={{ paddingLeft: `${(row.indentLevel ?? 1) * 24}px` }}
                  >
                    {row.lineItemName}
                  </td>
                  {showPriorPeriod && <td className="text-right font-mono text-sm text-text-muted py-1.5">—</td>}
                  {amountCell(
                    row.amount,
                    row.isGrandTotal ?? false,
                    row.isSubtotal ?? false,
                    hasAccounts ? () => toggleLine(row.id) : undefined
                  )}
                  {showChanges && (
                    <>
                      <td className="text-right font-mono text-sm text-text-muted py-1.5">—</td>
                      <td className="text-right font-mono text-sm text-text-muted py-1.5">—</td>
                    </>
                  )}
                </tr>
                {isExpanded &&
                  hasAccounts &&
                  row.accounts!.map((acc: AccountRollup) => {
                    const accKey = `${row.id}:${acc.accountCode}`;
                    const accExpanded = expandedAccountKey === accKey;
                    return (
                      <React.Fragment key={accKey}>
                        <tr className="bg-surface-alt/50 print:hidden">
                          <td className="py-1 pr-4 pl-8 text-sm text-text-secondary" colSpan={showPriorPeriod && showChanges ? 4 : showPriorPeriod || showChanges ? 2 : 1}>
                            ├─ {acc.accountCode} {acc.accountName}
                          </td>
                          {showPriorPeriod && <td />}
                          {amountCell(acc.balance, false, false, acc.entries?.length ? () => toggleAccount(row.id, acc.accountCode) : undefined)}
                          {showChanges && <><td /><td /></>}
                        </tr>
                        {accExpanded &&
                          acc.entries?.map((ent) => (
                            <tr key={ent.jeId} className="bg-surface-alt/30 print:hidden">
                              <td className="py-1 pr-4 pl-12 text-sm text-text-tertiary" colSpan={showPriorPeriod && showChanges ? 4 : showPriorPeriod || showChanges ? 2 : 1}>
                                ├─ {ent.jeNumber} {ent.memo}
                              </td>
                              {showPriorPeriod && <td />}
                              <td className="text-right font-mono text-sm py-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenJe(ent, acc.accountCode, acc.accountName)}
                                  className="border-b border-dotted border-current hover:bg-hover rounded px-1 -mx-1"
                                >
                                  <MoneyCell value={parseMoney(ent.amount)} showDollar />
                                </button>
                              </td>
                              {showChanges && <><td /><td /></>}
                            </tr>
                          ))}
                        {accExpanded && (
                          <tr className="bg-surface-alt/30 print:hidden font-medium">
                            <td className="py-1 pr-4 pl-12 text-sm" colSpan={showPriorPeriod && showChanges ? 4 : showPriorPeriod || showChanges ? 2 : 1}>
                              └─ Net
                            </td>
                            {showPriorPeriod && <td />}
                            {amountCell(acc.balance, false, false)}
                            {showChanges && <><td /><td /></>}
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
