/**
 * Excel Export Service (GAP I7)
 *
 * Generates .xlsx buffers for trial balance, financial statements,
 * reconciliations, and variance analysis using the xlsx library.
 * All monetary values use Decimal.js for precision.
 */

import * as XLSX from 'xlsx';
import { round2 } from '../utils/decimal.js';

export interface TrialBalanceExportRow {
  accountCode: string;
  accountName: string;
  accountType?: string;
  debit: number;
  credit: number;
  netBalance?: number;
}

export interface StatementLineExport {
  lineId: string;
  label: string;
  amount: number;
  isSubtotal?: boolean;
  indent?: number;
}

export interface StatementsExportData {
  entityName: string;
  periodLabel: string;
  incomeStatement: StatementLineExport[];
  balanceSheet: StatementLineExport[];
  cashFlow: StatementLineExport[];
  equityChanges: StatementLineExport[];
}

export interface ReconciliationExportRow {
  accountCode: string;
  accountName: string;
  glBalance: number;
  supportingBalance: number;
  variance: number;
  reconcilingItems: number;
  unexplainedVariance: number;
  tolerance: number;
  withinTolerance: boolean;
  status: string;
  preparedBy: string | null;
  reviewedBy: string | null;
}

export interface VarianceExportRow {
  accountCode: string;
  accountName: string;
  currentAmount: number;
  priorAmount: number;
  varianceAmount: number;
  variancePercent: number | null;
  isMaterial: boolean;
  explanation: string | null;
  explainedBy: string | null;
  explanationSource: string | null;
}

/**
 * Export trial balance data to an xlsx buffer.
 * Single sheet with account code, name, debit, credit, net balance columns,
 * plus a totals row at the bottom.
 */
export function exportTrialBalance(
  rows: TrialBalanceExportRow[],
  meta?: { entityName?: string; periodLabel?: string }
): Buffer {
  const wb = XLSX.utils.book_new();

  const headerRows: (string | number)[][] = [];
  if (meta?.entityName) headerRows.push(['Entity', meta.entityName]);
  if (meta?.periodLabel) headerRows.push(['Period', meta.periodLabel]);
  if (headerRows.length > 0) headerRows.push([]); // blank row separator

  const dataRows: (string | number | null)[][] = [
    ['Account Code', 'Account Name', 'Account Type', 'Debit', 'Credit', 'Net Balance'],
  ];

  let totalDebit = 0;
  let totalCredit = 0;

  for (const row of rows) {
    const net = row.netBalance != null ? row.netBalance : round2(row.debit - row.credit);
    dataRows.push([
      row.accountCode,
      row.accountName,
      row.accountType ?? '',
      round2(row.debit),
      round2(row.credit),
      net,
    ]);
    totalDebit += row.debit;
    totalCredit += row.credit;
  }

  dataRows.push([]);
  dataRows.push([
    '',
    'TOTALS',
    '',
    round2(totalDebit),
    round2(totalCredit),
    round2(totalDebit - totalCredit),
  ]);

  const allRows = [...headerRows, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // Set column widths
  ws['!cols'] = [
    { wch: 16 }, // Account Code
    { wch: 40 }, // Account Name
    { wch: 20 }, // Account Type
    { wch: 18 }, // Debit
    { wch: 18 }, // Credit
    { wch: 18 }, // Net Balance
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Trial Balance');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
}

/**
 * Export four financial statements to an xlsx workbook (one sheet each).
 * Sheets: Income Statement, Balance Sheet, Cash Flow, Equity Changes.
 * GAAP formatting: subtotal rows bolded via indentation markers.
 */
export function exportStatements(data: StatementsExportData): Buffer {
  const wb = XLSX.utils.book_new();

  function buildStatementSheet(
    title: string,
    lines: StatementLineExport[]
  ): XLSX.WorkSheet {
    const rows: (string | number)[][] = [
      [data.entityName],
      [title],
      [`Period: ${data.periodLabel}`],
      [],
      ['Line Item', 'Amount'],
    ];

    for (const line of lines) {
      const indent = line.indent ? '  '.repeat(line.indent) : '';
      const prefix = line.isSubtotal ? '** ' : '';
      rows.push([`${indent}${prefix}${line.label}`, round2(line.amount)]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 50 }, { wch: 20 }];
    return ws;
  }

  XLSX.utils.book_append_sheet(
    wb,
    buildStatementSheet('Income Statement', data.incomeStatement),
    'Income Statement'
  );
  XLSX.utils.book_append_sheet(
    wb,
    buildStatementSheet('Balance Sheet', data.balanceSheet),
    'Balance Sheet'
  );
  XLSX.utils.book_append_sheet(
    wb,
    buildStatementSheet('Cash Flow Statement', data.cashFlow),
    'Cash Flow'
  );
  XLSX.utils.book_append_sheet(
    wb,
    buildStatementSheet('Statement of Changes in Equity', data.equityChanges),
    'Equity Changes'
  );

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
}

/**
 * Export reconciliation summary to an xlsx buffer.
 * Single sheet with account-level reconciliation data.
 */
export function exportReconciliations(
  rows: ReconciliationExportRow[],
  meta?: { entityName?: string; periodLabel?: string }
): Buffer {
  const wb = XLSX.utils.book_new();

  const headerRows: (string | number)[][] = [];
  if (meta?.entityName) headerRows.push(['Entity', meta.entityName]);
  if (meta?.periodLabel) headerRows.push(['Period', meta.periodLabel]);
  if (headerRows.length > 0) headerRows.push([]);

  const dataRows: (string | number | boolean | null)[][] = [
    [
      'Account Code',
      'Account Name',
      'GL Balance',
      'Supporting Balance',
      'Variance',
      'Reconciling Items',
      'Unexplained Variance',
      'Tolerance',
      'Within Tolerance',
      'Status',
      'Prepared By',
      'Reviewed By',
    ],
  ];

  for (const row of rows) {
    dataRows.push([
      row.accountCode,
      row.accountName,
      round2(row.glBalance),
      round2(row.supportingBalance),
      round2(row.variance),
      round2(row.reconcilingItems),
      round2(row.unexplainedVariance),
      round2(row.tolerance),
      row.withinTolerance ? 'Yes' : 'No',
      row.status,
      row.preparedBy,
      row.reviewedBy,
    ]);
  }

  const allRows = [...headerRows, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(allRows);
  ws['!cols'] = [
    { wch: 16 },
    { wch: 35 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 18 },
    { wch: 20 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 20 },
    { wch: 20 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Reconciliations');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
}

/**
 * Export variance analysis to an xlsx buffer.
 * Single sheet with variance amounts, percentages, and explanations.
 */
export function exportVariances(
  rows: VarianceExportRow[],
  meta?: { entityName?: string; periodLabel?: string }
): Buffer {
  const wb = XLSX.utils.book_new();

  const headerRows: (string | number)[][] = [];
  if (meta?.entityName) headerRows.push(['Entity', meta.entityName]);
  if (meta?.periodLabel) headerRows.push(['Period', meta.periodLabel]);
  if (headerRows.length > 0) headerRows.push([]);

  const dataRows: (string | number | null)[][] = [
    [
      'Account Code',
      'Account Name',
      'Current Amount',
      'Prior Amount',
      'Variance Amount',
      'Variance %',
      'Material',
      'Explanation',
      'Explained By',
      'Explanation Source',
    ],
  ];

  for (const row of rows) {
    dataRows.push([
      row.accountCode,
      row.accountName,
      round2(row.currentAmount),
      round2(row.priorAmount),
      round2(row.varianceAmount),
      row.variancePercent != null ? `${row.variancePercent.toFixed(1)}%` : 'N/A',
      row.isMaterial ? 'Yes' : 'No',
      row.explanation,
      row.explainedBy,
      row.explanationSource ?? '',
    ]);
  }

  const allRows = [...headerRows, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(allRows);
  ws['!cols'] = [
    { wch: 16 },
    { wch: 35 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 10 },
    { wch: 50 },
    { wch: 20 },
    { wch: 20 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Variance Analysis');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
}
