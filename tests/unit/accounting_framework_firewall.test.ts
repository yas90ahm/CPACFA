import { describe, expect, it } from '@jest/globals';
import {
  getEpsTopicStandard,
  getFxTopicStandard,
  getLeaseTopicStandard,
  getRevenueTopicStandard,
  normalizeAccountingStandard,
} from '../../src/constants/accounting/index.js';
import { generateStatements } from '../../src/services/statementGenerator.js';
import { runPlanExecuteVerify } from '../../src/services/planExecuteVerify.js';
import { isFrameworkCompatibleAgentText } from '../../src/services/mapping_validation_agent.js';
import type { TrialBalanceResult } from '../../src/types/financial.js';

describe('accounting framework firewall', () => {
  it('maps ASPE topics only to Canadian private-enterprise guidance', () => {
    expect(getLeaseTopicStandard('ASPE')).toBe('aspe3065');
    expect(getRevenueTopicStandard('ASPE')).toBe('aspe3400');
    expect(getFxTopicStandard('ASPE')).toBe('aspe1651');
    expect(getEpsTopicStandard('ASPE')).toBe('not_applicable_private_enterprise');
  });

  it('does not silently turn an unknown framework into U.S. GAAP', () => {
    expect(normalizeAccountingStandard('GAAP')).toBe('US_GAAP');
    expect(normalizeAccountingStandard('ASPE')).toBe('ASPE');
    expect(() => normalizeAccountingStandard('Canadian GAAP?')).toThrow(/unsupported accounting standard/i);
    expect(() => normalizeAccountingStandard(undefined)).toThrow(/must be configured explicitly/i);
  });

  it('rejects frontier-model guidance that cites a different framework', () => {
    expect(isFrameworkCompatibleAgentText('ASPE', 'Apply ASPE impairment guidance.', 'ASPE Section 3856')).toBe(true);
    expect(isFrameworkCompatibleAgentText('ASPE', 'Apply the expected-credit-loss model in ASC 326.', null)).toBe(false);
    expect(isFrameworkCompatibleAgentText('US_GAAP', 'Use U.S. GAAP presentation.', 'ASC 210')).toBe(true);
    expect(isFrameworkCompatibleAgentText('US_GAAP', 'Apply the private-enterprise rule.', 'ASPE Section 3065')).toBe(false);
  });

  it('generates and verifies ASPE statements without legacy ASC presentation citations', async () => {
    const trialBalance: TrialBalanceResult = {
      entries: [
        { accountCode: '1000', accountName: 'Cash', debit: 100, credit: 0, accountType: 'ASSET' },
        { accountCode: '3000', accountName: 'Share capital', debit: 0, credit: 100, accountType: 'EQUITY' },
      ],
      totalDebits: 100,
      totalCredits: 100,
      balances: true,
      errors: [],
    };

    const result = await generateStatements(trialBalance, 'ASPE', {
      preClassifiedEntries: trialBalance.entries,
    });
    const verification = runPlanExecuteVerify({
      trialBalance,
      balanceSheet: result.balanceSheet,
      profitAndLoss: result.profitAndLoss,
      standard: 'ASPE',
    });

    expect(result.balanceSheet.codificationRef).toEqual(expect.objectContaining({
      framework: 'ASPE',
      citation: 'ASPE 1521',
    }));
    expect(result.profitAndLoss.codificationRef).toEqual(expect.objectContaining({
      framework: 'ASPE',
      citation: 'ASPE 1520',
    }));
    expect(result.classifiedEntries.every((entry) => entry.codificationRef?.framework === 'ASPE')).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/ASC 210|ASC 220/);
    expect(verification.verification.passed).toBe(true);
    expect(verification.plan).toContain('ASPE 1521');
  });
});
