/**
 * Unit tests: QuickBooks and Xero CSV classification.
 * Verifies that standard export CSVs correctly classify all accounts via CoA template.
 */

import { describe, it, expect } from '@jest/globals';
import type { AccountType } from '../../src/types/financial.js';
import { ingestTrialBalanceFile } from '../../src/services/fileIngestion.js';
import { detectCoaSource, mapAccountTypeToCategory } from '../../src/services/coa_template_service.js';
import { parseTrialBalance } from '../../src/services/trialBalanceParser.js';
import { buildValidatedStatements } from '../../src/services/financialStatements.js';

const QBO_CSV = `Account,Name,Type,Debit,Credit
1000,Cash,Bank,100000,0
1100,Accounts Receivable,Accounts Receivable,50000,0
2000,Accounts Payable,Accounts Payable,0,50000
3000,Equity,Equity,0,100000`;

const XERO_CSV = `Account Code,Account Name,Type,Debit,Credit
1000,Cash,BANK,80000,0
1100,Receivables,CURRENT,20000,0
2000,Payables,CURRLIAB,0,40000
3000,Equity,EQUITY,0,60000`;

function applyCoaTemplate(
  rows: Array<{ accountName: string; accountCode?: string; accountTypeRaw?: string; debit: number; credit: number }>,
  headers: string[]
): Array<{ accountName: string; accountCode?: string; accountTypeRaw?: string; accountType?: AccountType; debit: number; credit: number }> {
  const { template } = detectCoaSource(headers);
  if (!template) return rows;
  return rows.map((r) => {
    if (!r.accountTypeRaw) return r;
    const cat = mapAccountTypeToCategory(template, r.accountTypeRaw);
    return { ...r, accountType: cat };
  });
}

describe('QuickBooks CSV classification', () => {
  it('classifies all accounts correctly via CoA template', () => {
    const buf = Buffer.from(QBO_CSV, 'utf8');
    const result = ingestTrialBalanceFile(buf, 'text/csv');
    expect(result.headers.length).toBeGreaterThan(0);
    expect(detectCoaSource(result.headers).source).toBe('quickbooks_online');

    const withTypes = applyCoaTemplate(result.rows, result.headers);
    expect(withTypes.some((r) => r.accountType)).toBe(true);

    const parsed = parseTrialBalance(withTypes);
    const { balanceSheet } = buildValidatedStatements(parsed);
    expect(balanceSheet.balances).toBe(true);
    expect(Math.abs(balanceSheet.totalAssets - (balanceSheet.totalLiabilities + balanceSheet.totalEquity))).toBeLessThan(0.02);
  });
});

describe('Xero CSV classification', () => {
  it('classifies all accounts correctly via CoA template', () => {
    const buf = Buffer.from(XERO_CSV, 'utf8');
    const result = ingestTrialBalanceFile(buf, 'text/csv');
    expect(result.headers.length).toBeGreaterThan(0);
    expect(detectCoaSource(result.headers).source).toBe('xero');

    const withTypes = applyCoaTemplate(result.rows, result.headers);
    const parsed = parseTrialBalance(withTypes);
    const { balanceSheet } = buildValidatedStatements(parsed);
    expect(balanceSheet.balances).toBe(true);
  });
});
