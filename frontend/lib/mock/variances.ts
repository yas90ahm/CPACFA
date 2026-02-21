import type { VarianceRecord } from '@/lib/types/variance';

function v(
  id: string,
  lineItemName: string,
  statementType: string,
  priorAmount: string,
  currentAmount: string,
  changeAmount: string,
  changePercent: string,
  isMaterial: boolean,
  explanationStatus: VarianceRecord['explanationStatus'],
  explanation: string | null,
  approvedBy: string | null,
  approvedAt: string | null,
  aiDraftExplanation: string | null
): VarianceRecord {
  return {
    id,
    lineItemName,
    statementType,
    priorAmount,
    currentAmount,
    changeAmount,
    changePercent,
    isMaterial,
    materialityThreshold: '50000',
    explanation,
    explanationStatus,
    approvedBy,
    approvedAt,
    aiDraftExplanation,
  };
}

const eqLabel = "Total Stockholders' Equity";

/** ~24 variance records. 6 material: 4 explained (3 approved, 1 pending), 2 unexplained with AI drafts. */
export const mockVariances: VarianceRecord[] = [
  v('v1', 'Revenue — Product Sales', 'income_statement', '17200000.00', '18450000.00', '1250000.00', '7.3', true, 'approved', 'Product revenue increased due to new enterprise contracts and volume in industrial segment.', 'Jane Doe', '2026-02-14T10:00:00Z', null),
  v('v2', 'Revenue — Service Income', 'income_statement', '2000000.00', '2340000.00', '340000.00', '17.0', true, 'explained', 'Service revenue growth from expanded support contracts and one-time implementation fees.', null, null, null),
  v('v3', 'COGS — Materials', 'income_statement', '7500000.00', '8120000.00', '620000.00', '8.3', true, 'approved', 'Raw material cost increase driven by commodity prices and higher volume.', 'Jane Doe', '2026-02-14T10:05:00Z', null),
  v('v4', 'COGS — Direct Labor', 'income_statement', '3300000.00', '3450000.00', '150000.00', '4.5', true, 'pending', null, null, null, 'Direct labor increased $150K (4.5%) due to overtime in January to meet order backlog and seasonal hiring for the production line.'),
  v('v5', 'Salaries & Wages', 'income_statement', '2000000.00', '2425000.00', '425000.00', '21.2', true, 'pending', null, null, null, 'Salaries and wages up $425K (21.2%) primarily from annual merit increases effective January 1 and two new department hires in engineering and sales.'),
  v('v6', 'Professional Fees', 'income_statement', '20000.00', '32000.00', '12000.00', '60.0', true, 'approved', 'One-time legal and audit support for contract review and year-end procedures.', 'Jane Doe', '2026-02-14T10:10:00Z', null),
  v('v7', 'COGS — Manufacturing Overhead', 'income_statement', '1890000.00', '1890000.00', '0.00', '0.0', false, 'not_required', null, null, null, null),
  v('v8', 'Rent Expense', 'income_statement', '185000.00', '185000.00', '0.00', '0.0', false, 'not_required', null, null, null, null),
  v('v9', 'Depreciation Expense', 'income_statement', '57500.00', '57500.00', '0.00', '0.0', false, 'not_required', null, null, null, null),
  v('v10', 'Insurance Expense', 'income_statement', '8333.33', '8333.33', '0.00', '0.0', false, 'not_required', null, null, null, null),
  v('v11', 'Utilities', 'income_statement', '42000.00', '42000.00', '0.00', '0.0', false, 'not_required', null, null, null, null),
  v('v12', 'Office Supplies', 'income_statement', '18500.00', '18500.00', '0.00', '0.0', false, 'not_required', null, null, null, null),
  v('v13', 'Interest Expense', 'income_statement', '-33333.33', '-33333.33', '0.00', '0.0', false, 'not_required', null, null, null, null),
  v('v14', 'Other Income', 'income_statement', '12000.00', '12000.00', '0.00', '0.0', false, 'not_required', null, null, null, null),
  v('v15', 'Cash and Cash Equivalents', 'balance_sheet', '1535448.76', '1745678.90', '210230.14', '13.7', false, 'not_required', null, null, null, null),
  v('v16', 'Accounts Receivable, net', 'balance_sheet', '3438289.00', '3438289.00', '0.00', '0.0', false, 'not_required', null, null, null, null),
  v('v17', 'Inventory', 'balance_sheet', '3700000.00', '3900000.00', '200000.00', '5.4', false, 'not_required', null, null, null, null),
  v('v18', 'Accounts Payable', 'balance_sheet', '2656000.00', '2890000.00', '234000.00', '8.8', false, 'not_required', null, null, null, null),
  v('v19', 'Accrued Expenses', 'balance_sheet', '1900000.00', '2089333.33', '189333.33', '10.0', false, 'not_required', null, null, null, null),
  v('v20', 'Net Cash from Operating Activities', 'cash_flow', '3200000.00', '3556127.66', '356127.66', '11.1', false, 'not_required', null, null, null, null),
  v('v21', 'Net Cash from Investing Activities', 'cash_flow', '-150000.00', '-150000.00', '0.00', '0.0', false, 'not_required', null, null, null, null),
  v('v22', 'Net Cash from Financing Activities', 'cash_flow', '-125000.00', '-125000.00', '0.00', '0.0', false, 'not_required', null, null, null, null),
  v('v23', 'Retained Earnings', 'equity', '78551.24', '3483801.24', '3405250.00', '4335.0', false, 'not_required', null, null, null, null),
  v('v24', eqLabel, 'equity', '678551.24', '4083801.24', '3405250.00', '502.0', false, 'not_required', null, null, null, null),
];

export function getVariancesBySession(_sessionId: string): VarianceRecord[] {
  return mockVariances;
}
