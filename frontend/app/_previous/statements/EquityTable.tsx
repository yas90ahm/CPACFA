'use client';

import { MoneyCell } from '@/components/shared/MoneyCell';

export interface EquityColumnarProps {
  columns: string[];
  rows: { label: string; values: string[] }[];
}

export function EquityTable({ columns, rows }: EquityColumnarProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ border: 'none' }}>
        <thead>
          <tr className="border-b border-border">
            <th className="text-left font-medium text-text-secondary py-2 pr-4 w-48"></th>
            {(columns ?? []).map((col) => (
              <th key={col} className="text-right font-medium text-text-secondary py-2 px-2">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((row, i) => (
            <tr
              key={row.label}
              className={
                i === rows.length - 1 ? 'border-t-2 border-border font-bold' : i > 0 ? 'border-t border-border-light' : ''
              }
            >
              <td className="py-1.5 pr-4 font-medium">{row.label}</td>
              {(row.values ?? []).map((val, j) => (
                <td key={j} className="text-right font-mono tabular-nums text-sm py-1.5 px-2">
                  {val === '—' ? <span className="text-text-muted">—</span> : <MoneyCell value={val} showDollar />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
