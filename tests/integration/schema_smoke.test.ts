/**
 * Schema smoke test: connect to DB and run verifySchema().
 * Ensures DB correctness before running heavier pipeline tests.
 * Skips with clear message when DATABASE_URL is not set.
 */

import { describe, it, expect } from '@jest/globals';
import { getControlPool, isDbConfigured } from '../../src/db/index.js';
import { verifySchema } from '../../src/db/schema_verify.js';

describe('Schema smoke', () => {
  it('verifies schema when DATABASE_URL is set', async () => {
    if (!isDbConfigured()) {
      console.warn('Schema smoke: DATABASE_URL not set; skipping.');
      return;
    }
    const pool = getControlPool();
    const result = await verifySchema(pool);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
