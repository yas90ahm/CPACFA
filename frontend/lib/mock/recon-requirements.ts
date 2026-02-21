export type ToleranceType = 'dollar' | 'percentage' | 'both';

export interface ReconRequirement {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  toleranceDollar: string;
  tolerancePercent: string;
  toleranceType: ToleranceType;
  evidenceRequired: boolean;
  sourceDocument: string;
  active: boolean;
}

export const mockReconRequirements: ReconRequirement[] = [
  { id: 'rr-1010', accountCode: '1010', accountName: 'Chase Checking', accountType: 'ASSET', toleranceDollar: '500.00', tolerancePercent: '0', toleranceType: 'dollar', evidenceRequired: true, sourceDocument: 'Bank statement', active: true },
  { id: 'rr-1020', accountCode: '1020', accountName: 'Chase Savings', accountType: 'ASSET', toleranceDollar: '500.00', tolerancePercent: '0', toleranceType: 'dollar', evidenceRequired: true, sourceDocument: 'Bank statement', active: true },
  { id: 'rr-1100', accountCode: '1100', accountName: 'Accounts Receivable', accountType: 'ASSET', toleranceDollar: '1000.00', tolerancePercent: '0', toleranceType: 'dollar', evidenceRequired: true, sourceDocument: 'Subledger export', active: true },
  { id: 'rr-1200', accountCode: '1200', accountName: 'Inventory Raw', accountType: 'ASSET', toleranceDollar: '1000.00', tolerancePercent: '0', toleranceType: 'dollar', evidenceRequired: true, sourceDocument: 'Count sheet', active: true },
  { id: 'rr-1210', accountCode: '1210', accountName: 'Inventory FG', accountType: 'ASSET', toleranceDollar: '1000.00', tolerancePercent: '0', toleranceType: 'dollar', evidenceRequired: true, sourceDocument: 'Count sheet', active: true },
  { id: 'rr-1300', accountCode: '1300', accountName: 'Prepaid Expenses', accountType: 'ASSET', toleranceDollar: '500.00', tolerancePercent: '0', toleranceType: 'dollar', evidenceRequired: true, sourceDocument: 'Schedule', active: true },
  { id: 'rr-1500', accountCode: '1500', accountName: 'PP&E', accountType: 'ASSET', toleranceDollar: '0.00', tolerancePercent: '0', toleranceType: 'dollar', evidenceRequired: true, sourceDocument: 'Depreciation schedule', active: true },
  { id: 'rr-1510', accountCode: '1510', accountName: 'Accumulated Depreciation', accountType: 'ASSET', toleranceDollar: '0.00', tolerancePercent: '0', toleranceType: 'dollar', evidenceRequired: true, sourceDocument: 'Rollforward', active: true },
  { id: 'rr-2010', accountCode: '2010', accountName: 'Accounts Payable', accountType: 'LIABILITY', toleranceDollar: '1000.00', tolerancePercent: '0', toleranceType: 'dollar', evidenceRequired: true, sourceDocument: 'Subledger', active: true },
  { id: 'rr-2100', accountCode: '2100', accountName: 'Accrued Expenses', accountType: 'LIABILITY', toleranceDollar: '1000.00', tolerancePercent: '0', toleranceType: 'dollar', evidenceRequired: true, sourceDocument: 'Schedule', active: true },
  { id: 'rr-2200', accountCode: '2200', accountName: 'Current Portion Debt', accountType: 'LIABILITY', toleranceDollar: '0.00', tolerancePercent: '0', toleranceType: 'dollar', evidenceRequired: true, sourceDocument: 'Lender statement', active: true },
  { id: 'rr-2500', accountCode: '2500', accountName: 'Long-Term Debt', accountType: 'LIABILITY', toleranceDollar: '0.00', tolerancePercent: '0', toleranceType: 'dollar', evidenceRequired: true, sourceDocument: 'Lender statement', active: true },
];

export function getReconRequirementsByEntity(_entityId: string): ReconRequirement[] {
  return mockReconRequirements;
}
