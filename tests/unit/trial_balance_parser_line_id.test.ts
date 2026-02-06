/**
 * Trial balance parser: stable lineId (UUID) assigned at parse time for audit trail.
 */

import { describe, it, expect } from '@jest/globals';
import { parseTrialBalance } from '../../src/services/trialBalanceParser.js';

describe('trial balance parser lineId', () => {
  it('assigns stable lineId (UUID) to each entry', () => {
    const result = parseTrialBalance([
      { accountName: 'Cash', debit: 1000, credit: 0 },
      { accountName: 'Revenue', debit: 0, credit: 1000 },
    ]);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].lineId).toBeDefined();
    expect(result.entries[1].lineId).toBeDefined();
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(result.entries[0].lineId).toMatch(uuidRe);
    expect(result.entries[1].lineId).toMatch(uuidRe);
    expect(result.entries[0].lineId).not.toBe(result.entries[1].lineId);
  });
});
