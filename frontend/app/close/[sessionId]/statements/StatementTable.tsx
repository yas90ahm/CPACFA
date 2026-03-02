'use client';

import React, { useState, useCallback } from 'react';
import { MoneyCell } from '@/components/shared/MoneyCell';
import type { StatementLineItem, AccountRollup, JournalEntryRef } from '@/lib/types/statements';

/**
 * Format a GAAP-style amount string for display: "1234567.89" -> "1,234,567.89"
 * Negative amounts shown in parentheses: "-1234.56" -> "(1,234.56)"
 *
 * Uses parseFloat internally for pure formatting/presentation only.
 * This is acceptable because the result is never used for financial computation —
 * all arithmetic happens on the backend via Decimal.js + PostgreSQL NUMERIC(20,2).
 */
function formatGaapAmount(amount: string, showDollar: boolean = false): string {
  if (!amount) return '';
  const n = parseFloat(amount);
  if (Number.isNaN(n)) return amount;
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const prefix = showDollar ? '$ ' : '';
  return n < 0 ? `${prefix}(${formatted})` : `${prefix}${formatted}`;
}

function amountCell(amount: string, isGrandTotal: boolean, isSubtotal: boolean, onClick?: () => void) {
  const hasAmount = amount && amount.trim() !== '';
  // parseFloat for UI-only sign check (color determination), not financial computation
  const isNeg = hasAmount && parseFloat(amount) < 0;
  const showDollar = isGrandTotal || isSubtotal;
  const clickable = onClick && hasAmount && !isSubtotal && !isGrandTotal;
  return (
    <td className={`text-right font-mono tabular-nums text-sm py-1.5 ${isGrandTotal ? 'border-t-2 border-b-[3px] border-double border-text-muted' : isSubtotal ? 'border-t border-text-muted/50' : ''}`}>
      {clickable ? (
        <button
          type="button"
          onClick={onClick}
          className="border-b border-dotted border-current hover:bg-hover rounded px-1 -mx-1"
        >
          <span className={isNeg ? 'text-status-red' : ''}>{formatGaapAmount(amount)}</span>
        </button>
      ) : hasAmount ? (
        <span className={`${isGrandTotal ? 'font-bold' : isSubtotal ? 'font-semibold' : ''} ${isNeg ? 'text-status-red' : ''}`}>
          {formatGaapAmount(amount, showDollar)}
        </span>
      ) : (
        <span />
      )}
    </td>
  );
}

export interface StatementTableProps {
  lines: StatementLineItem[];
  showPriorPeriod?: boolean;
  showChanges?: boolean;
  /** Called with a real JE ID when user clicks a journal entry reference. */
  onOpenJeById?: (jeId: string) => void;
}

export function StatementTable({ lines, showPriorPeriod, showChanges, onOpenJeById }: StatementTableProps) {
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
                  {showPriorPeriod && amountCell(
                    row.priorAmount ?? '',
                    row.isGrandTotal ?? false,
                    row.isSubtotal ?? false
                  )}
                  {amountCell(
                    row.amount,
                    row.isGrandTotal ?? false,
                    row.isSubtotal ?? false,
                    hasAccounts ? () => toggleLine(row.id) : undefined
                  )}
                  {showChanges && (
                    <>
                      {amountCell(
                        row.changeAmount ?? '',
                        row.isGrandTotal ?? false,
                        row.isSubtotal ?? false
                      )}
                      <td className={`text-right font-mono tabular-nums text-sm py-1.5 ${row.changePercent != null && parseFloat(row.changePercent) < 0 ? 'text-status-red' : ''}`}>
                        {row.changePercent != null ? `${formatGaapAmount(row.changePercent)}%` : ''}
                      </td>
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
                                {ent.jeId && onOpenJeById ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenJeById(ent.jeId)}
                                    className="border-b border-dotted border-current hover:bg-hover rounded px-1 -mx-1"
                                  >
                                    <MoneyCell value={ent.amount} showDollar />
                                  </button>
                                ) : (
                                  <MoneyCell value={ent.amount} showDollar />
                                )}
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
