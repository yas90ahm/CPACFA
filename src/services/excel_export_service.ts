/**
 * Excel Export Service (GAP I7)
 *
 * Generates .xlsx buffers for trial balance, financial statements,
 * reconciliations, and variance analysis using the exceljs library.
 * All monetary values use Decimal.js for precision.
 */

import ExcelJS from 'exceljs';
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

/** Helper: add rows from an array-of-arrays to a worksheet */
function addAoaToWorksheet(ws: ExcelJS.Worksheet, rows: (string | number | boolean | null | undefined)[][]): void {
  for (const row of rows) {
    ws.addRow(row);
  }
}

/** Helper: set column widths on a worksheet */
function setColumnWidths(ws: ExcelJS.Worksheet, widths: number[]): void {
  for (let i = 0; i < widths.length; i++) {
    const col = ws.getColumn(i + 1);
    col.width = widths[i];
  }
}

/**
 * Export trial balance data to an xlsx buffer.
 * Single sheet with account code, name, debit, credit, net balance columns,
 * plus a totals row at the bottom.
 */
export async function exportTrialBalance(
  rows: TrialBalanceExportRow[],
  meta?: { entityName?: string; periodLabel?: string }
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Trial Balance');

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
  addAoaToWorksheet(ws, allRows);

  // Set column widths
  setColumnWidths(ws, [16, 40, 20, 18, 18, 18]);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * Export four financial statements to an xlsx workbook (one sheet each).
 * Sheets: Income Statement, Balance Sheet, Cash Flow, Equity Changes.
 * GAAP formatting: subtotal rows bolded via indentation markers.
 */
export async function exportStatements(data: StatementsExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  function buildStatementSheet(
    sheetName: string,
    title: string,
    lines: StatementLineExport[]
  ): void {
    const ws = wb.addWorksheet(sheetName);
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

    addAoaToWorksheet(ws, rows);
    setColumnWidths(ws, [50, 20]);
  }

  buildStatementSheet('Income Statement', 'Income Statement', data.incomeStatement);
  buildStatementSheet('Balance Sheet', 'Balance Sheet', data.balanceSheet);
  buildStatementSheet('Cash Flow', 'Cash Flow Statement', data.cashFlow);
  buildStatementSheet('Equity Changes', 'Statement of Changes in Equity', data.equityChanges);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * Export reconciliation summary to an xlsx buffer.
 * Single sheet with account-level reconciliation data.
 */
export async function exportReconciliations(
  rows: ReconciliationExportRow[],
  meta?: { entityName?: string; periodLabel?: string }
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Reconciliations');

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
  addAoaToWorksheet(ws, allRows);
  setColumnWidths(ws, [16, 35, 16, 18, 14, 18, 20, 12, 16, 14, 20, 20]);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * Export variance analysis to an xlsx buffer.
 * Single sheet with variance amounts, percentages, and explanations.
 */
export async function exportVariances(
  rows: VarianceExportRow[],
  meta?: { entityName?: string; periodLabel?: string }
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Variance Analysis');

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
  addAoaToWorksheet(ws, allRows);
  setColumnWidths(ws, [16, 35, 16, 16, 16, 12, 10, 50, 20, 20]);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
