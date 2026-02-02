/**
 * Export gate unit tests — verify gate blocks when consolidation rounding gap exceeds materiality.
 */

import { describe, it, expect } from '@jest/globals';
import { checkExportGate, CRITICAL_TAMPER_ALERT } from '../../src/services/export_gate_service.js';
import type { Pool } from 'pg';

const mockPool = {} as Pool;

describe('Export gate — consolidation rounding gap', () => {
  it('blocks export when roundingGapExceedsMateriality is true', async () => {
    const result = await checkExportGate({
      pool: mockPool,
      tenantId: 'test-tenant',
      roundingGapExceedsMateriality: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.alert).toBe(CRITICAL_TAMPER_ALERT);
    expect(result.message).toContain('Rounding gap');
  });

  it('blocks export when aggregateRoundingExceedsMateriality is true', async () => {
    const result = await checkExportGate({
      pool: mockPool,
      tenantId: 'test-tenant',
      aggregateRoundingExceedsMateriality: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.alert).toBe(CRITICAL_TAMPER_ALERT);
    expect(result.message).toContain('Aggregate rounding');
  });
});
