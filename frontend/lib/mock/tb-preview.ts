import type { TBPreview } from '@/lib/types/ingest';

const rows = [
  { accountCode: '1010', accountName: 'Chase Checking', debit: '1245678.90', credit: '0' },
  { accountCode: '1020', accountName: 'Chase Savings', debit: '500000.00', credit: '0' },
  { accountCode: '1100', accountName: 'Accounts Receivable', debit: '3456789.00', credit: '0' },
  { accountCode: '1200', accountName: 'Inventory — Raw', debit: '2000000.00', credit: '0' },
  { accountCode: '1210', accountName: 'Inventory — FG', debit: '1900000.00', credit: '0' },
  { accountCode: '1300', accountName: 'Prepaid', debit: '236666.67', credit: '0' },
  { accountCode: '1500', accountName: 'PP&E', debit: '12500000.00', credit: '0' },
  { accountCode: '1510', accountName: 'Accum Depr', debit: '0', credit: '4257500.00' },
  { accountCode: '2010', accountName: 'Accounts Payable', debit: '0', credit: '2890000.00' },
  { accountCode: '2100', accountName: 'Accrued Exp', debit: '0', credit: '2089333.33' },
  { accountCode: '6710', accountName: 'New Account A', debit: '100.00', credit: '0' },
  { accountCode: '6720', accountName: 'New Account B', debit: '0', credit: '250.00' },
  { accountCode: '6730', accountName: 'New Account C', debit: '500.00', credit: '0' },
  { accountCode: '6740', accountName: 'New Account D', debit: '0', credit: '750.00' },
  { accountCode: '6750', accountName: 'New Account E', debit: '200.00', credit: '0' },
];

const totalDebits = '45678901.23';
const totalCredits = '45678901.23';

export const mockTBPreview: TBPreview = {
  rows,
  totalDebits,
  totalCredits,
  balanced: true,
  accountCount: 52,
  newAccounts: ['6710', '6720', '6730', '6740', '6750'],
  inactiveAccounts: ['7200', '7300', '7400'],
  priorMappedCount: 47,
};

export function getTBPreviewForIngest(): Promise<TBPreview> {
  return Promise.resolve(mockTBPreview);
}
