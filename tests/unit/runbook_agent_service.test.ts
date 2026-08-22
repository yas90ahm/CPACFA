import { describe, expect, it } from '@jest/globals';
import { buildRunbookAgentFactSnapshot } from '../../src/services/runbook_agent_service.js';

describe('runbook frontier-model boundary', () => {
  it('withholds deterministic numbers while preserving bounded fact structure', () => {
    const snapshot = buildRunbookAgentFactSnapshot({
      totalRequired: 8,
      passes: true,
      evidence: [{ id: 'bank-rec-1', variance: 1250.42 }],
    });

    expect(snapshot).toEqual({
      totalRequired: '[deterministic numeric result withheld from model]',
      passes: true,
      evidence: [{
        id: 'bank-rec-1',
        variance: '[deterministic numeric result withheld from model]',
      }],
    });
  });

  it('bounds oversized arrays before model use', () => {
    const snapshot = buildRunbookAgentFactSnapshot({ rows: Array.from({ length: 100 }, (_, index) => index) }) as {
      rows: unknown[];
    };
    expect(snapshot.rows).toHaveLength(50);
    expect(snapshot.rows.every((value) => value === '[deterministic numeric result withheld from model]')).toBe(true);
  });

  it('redacts monetary and decimal amounts embedded in deterministic messages', () => {
    const snapshot = buildRunbookAgentFactSnapshot({
      exception: 'Unexplained variance $1,250.42 exceeds the 12.5% threshold',
      id: 'bank-rec-1',
    }) as { exception: string; id: string };

    expect(snapshot.exception).not.toContain('1,250.42');
    expect(snapshot.exception).not.toContain('12.5%');
    expect(snapshot.id).toBe('bank-rec-1');
  });
});
