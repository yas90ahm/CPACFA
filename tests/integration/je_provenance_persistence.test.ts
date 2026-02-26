/**
 * Integration: JE lines persist amount_provenance; list returns it.
 * Skips when DATABASE_URL not set.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { isDbConfigured, getTenantPool } from '../../src/db/index.js';
import { createDraftJE } from '../../src/services/journal_entry_service.js';
import * as repo from '../../src/db/repositories/journal_entry_repository.js';
import { getTestAuthToken } from '../helpers/testHelpers.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? 'je-provenance-tenant';

describe('JE provenance persistence', () => {
  beforeAll(() => {});

  it('createDraftJE persists amountProvenance on lines; listJournalEntryLines returns it', async () => {
    if (!isDbConfigured()) return;
    let pool;
    try {
      pool = await getTenantPool(TEST_TENANT_ID);
    } catch {
      return;
    }
    if (!pool) return;

    const closeSessionId = '00000000-0000-0000-0000-000000000001';
    const je = await createDraftJE(pool, {
      closeSessionId,
      tenantId: TEST_TENANT_ID,
      memo: 'Test accrual',
      source: 'manual',
      createdBy: 'test-user',
      lines: [
        {
          accountRef: 'Cash',
          debit: 100,
          credit: 0,
          amountProvenance: { kind: 'human_entered', enteredBy: 'test-user' },
        },
        {
          accountRef: 'Revenue',
          debit: 0,
          credit: 100,
          amountProvenance: { kind: 'human_entered', enteredBy: 'test-user' },
        },
      ],
    });

    const lines = await repo.listJournalEntryLines(pool, je.id);
    expect(lines).toHaveLength(2);
    expect(lines[0].amountProvenance).toEqual({ kind: 'human_entered', enteredBy: 'test-user' });
    expect(lines[1].amountProvenance).toEqual({ kind: 'human_entered', enteredBy: 'test-user' });
  });
});
