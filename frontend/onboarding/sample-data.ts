/**
 * Pre-analyzed sample data for the Guided First-Run "Load Sample Data" experience.
 * Populates the dashboard so users can see what results look like before uploading.
 */

import type { StatementRow } from '@/components/agent-workspace';

export const SAMPLE_STATEMENT_ROWS: StatementRow[] = [
  // Assets
  { label: 'Cash and equivalents', amount: 1250000, section: 'assets', accountCode: '1000' },
  { label: 'Accounts receivable', amount: 480000, section: 'assets', accountCode: '1100' },
  { label: 'Inventory', amount: 320000, section: 'assets', accountCode: '1200' },
  { label: 'Prepaid expenses', amount: 45000, section: 'assets', accountCode: '1300' },
  { label: 'Property, plant & equipment (net)', amount: 890000, section: 'assets', accountCode: '1500' },
  // Liabilities
  { label: 'Accounts payable', amount: 280000, section: 'liabilities', accountCode: '2000' },
  { label: 'Accrued expenses', amount: 120000, section: 'liabilities', accountCode: '2100' },
  { label: 'Short-term debt', amount: 150000, section: 'liabilities', accountCode: '2200' },
  { label: 'Long-term debt', amount: 400000, section: 'liabilities', accountCode: '2500' },
  // Equity
  { label: 'Common stock', amount: 500000, section: 'equity', accountCode: '3000' },
  { label: 'Retained earnings', amount: 1180000, section: 'equity', accountCode: '3100' },
  // Revenue
  { label: 'Product revenue', amount: 2450000, section: 'revenue', accountCode: '4000' },
  { label: 'Service revenue', amount: 380000, section: 'revenue', accountCode: '4100' },
  // Expenses
  { label: 'Cost of goods sold', amount: 1200000, section: 'expenses', accountCode: '5000' },
  { label: 'Salaries and wages', amount: 520000, section: 'expenses', accountCode: '5100' },
  { label: 'Rent and utilities', amount: 95000, section: 'expenses', accountCode: '5200' },
  { label: 'Marketing', amount: 78000, section: 'expenses', accountCode: '5300' },
  { label: 'Depreciation', amount: 45000, section: 'expenses', accountCode: '5400' },
  { label: 'Other operating expenses', amount: 62000, section: 'expenses', accountCode: '5500' },
];
