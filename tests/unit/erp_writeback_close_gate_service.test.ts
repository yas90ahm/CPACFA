// @ts-nocheck — query mocks return only the gate rows needed by each case.
import { describe, expect, it, jest } from '@jest/globals';
import type { Pool } from 'pg';
import {
  evaluateErpWritebackCloseGate,
  summarizeUnresolvedErpWritebacks,
} from '../../src/services/erp_writeback_close_gate_service.js';
import { getCanadianAspeCloseProfile } from '../../src/services/canadian_aspe_close_profile.js';

describe('approved ERP writeback close gate', () => {
  it('does not require an external receipt when approved writeback is disabled', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ approved_erp_writeback_enabled: false }],
    });
    const pool = { query } as unknown as Pool;

    await expect(evaluateErpWritebackCloseGate(
      pool,
      'tenant-a',
      'entity-a',
      'session-a'
    )).resolves.toEqual({ enabled: false, unresolved: [] });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('requires a conclusive posted receipt for every approved entry when enabled', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ approved_erp_writeback_enabled: true }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'je-1', writeback_status: 'pending' },
          { id: 'je-2', writeback_status: 'reconciliation_required' },
        ],
      });
    const pool = { query } as unknown as Pool;

    const gate = await evaluateErpWritebackCloseGate(
      pool,
      'tenant-a',
      'entity-a',
      'session-a'
    );

    expect(gate).toEqual({
      enabled: true,
      unresolved: [
        { journalEntryId: 'je-1', status: 'pending' },
        { journalEntryId: 'je-2', status: 'reconciliation_required' },
      ],
    });
    expect(query.mock.calls[1][0]).toContain("w.status <> 'posted'");
    expect(summarizeUnresolvedErpWritebacks(gate.unresolved)).toBe(
      'pending: 1, reconciliation_required: 1'
    );
  });

  it('runs the material-JE control before requiring human reviewer sign-off', () => {
    const materialJeControl = getCanadianAspeCloseProfile('monthly').requirements.find(
      (requirement) => requirement.code === 'MATERIAL_JES_APPROVED'
    );

    expect(materialJeControl).toMatchObject({
      executionMode: 'agent_assisted',
      completionAuthority: 'reviewer',
    });
  });
});
