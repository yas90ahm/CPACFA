/**
 * Pilot-stage security hardening tests.
 * - Destructive script guards (seed/reset refuse prod URL and require explicit allow).
 * - Production server refuses to start without DATABASE_URL.
 * - Ingest metadata immutable in updateStagingPayload.
 */

import { describe, it, expect, afterEach, beforeEach, jest } from '@jest/globals';
import { isAllowedForDestructive, looksLikeProduction } from '../../src/db/destructive_guards.js';
import { ensureProductionHasDatabase } from '../../src/server.js';
import { updateStagingPayload } from '../../src/services/persistence_service.js';
import type { Pool } from 'pg';

describe('Destructive script guards', () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origAllowReset = process.env.ALLOW_DB_RESET;

  afterEach(() => {
    process.env.NODE_ENV = origNodeEnv;
    process.env.ALLOW_DB_RESET = origAllowReset;
  });

  it('isAllowedForDestructive returns true when NODE_ENV=test', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.ALLOW_DB_RESET;
    expect(isAllowedForDestructive()).toBe(true);
  });

  it('isAllowedForDestructive returns true when ALLOW_DB_RESET=true', () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DB_RESET = 'true';
    expect(isAllowedForDestructive()).toBe(true);
  });

  it('isAllowedForDestructive returns false when NODE_ENV=development and ALLOW_DB_RESET unset', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_DB_RESET;
    expect(isAllowedForDestructive()).toBe(false);
  });

  it('isAllowedForDestructive returns false when production and ALLOW_DB_RESET not set', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_DB_RESET;
    expect(isAllowedForDestructive()).toBe(false);
  });

  it('looksLikeProduction returns true for prod hostname', () => {
    expect(looksLikeProduction('postgres://u:p@prod.example.com/db')).toBe(true);
    expect(looksLikeProduction('postgres://prod.supabase.co/db')).toBe(true);
  });

  it('looksLikeProduction returns true for URL containing production', () => {
    expect(looksLikeProduction('postgres://host/production-db')).toBe(true);
  });

  it('looksLikeProduction returns false for localhost and non-prod', () => {
    expect(looksLikeProduction('postgres://localhost:5432/test')).toBe(false);
    expect(looksLikeProduction('postgres://user:pass@dev-db.example.com/db')).toBe(false);
  });
});

describe('Production server requires DATABASE_URL', () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origDbUrl = process.env.DATABASE_URL;
  let exitMock: jest.SpiedFunction<typeof process.exit> | undefined;

  beforeEach(() => {
    exitMock = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as typeof process.exit);
  });

  afterEach(() => {
    exitMock?.mockRestore?.();
    exitMock = undefined;
    process.env.NODE_ENV = origNodeEnv;
    if (origDbUrl !== undefined) process.env.DATABASE_URL = origDbUrl;
    else delete process.env.DATABASE_URL;
  });

  it('ensureProductionHasDatabase calls process.exit(1) when NODE_ENV=production and DATABASE_URL unset', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    expect(() => ensureProductionHasDatabase()).toThrow(/process\.exit\(1\)/);
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('ensureProductionHasDatabase does not exit when NODE_ENV=development', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_URL;
    ensureProductionHasDatabase();
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('ensureProductionHasDatabase does not exit when NODE_ENV=production and DATABASE_URL set', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://localhost/test';
    ensureProductionHasDatabase();
    expect(exitMock).not.toHaveBeenCalled();
  });
});

describe('Ingest trust boundary: immutable payload keys', () => {
  it('updateStagingPayload does not merge source_type, source_hash, ingestion_timestamp from patch', async () => {
    const queryMock = jest.fn<() => Promise<{ rows: unknown[] }>>()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'hitl-1',
          tenant_id: 'tenant-1',
          proposed_action: 'x',
          justification: 'y',
          status: 'pending',
          type: 'journal_entry',
          amount: null,
          payload: { kind: 'trial_balance_ingest' },
          created_at: '',
          updated_at: '',
          approved_at: null,
          approved_by: null,
          rejected_at: null,
          rejected_reason: null,
        }],
      });
    const mockPool = { query: queryMock } as unknown as Pool;
    await updateStagingPayload(mockPool, 'tenant-1', 'hitl-1', {
      classification_results: [],
      source_type: 'overwrite_attempt',
      source_hash: 'overwrite',
      ingestion_timestamp: 'overwrite',
    });
    expect(queryMock).toHaveBeenCalled();
    const call = queryMock.mock.calls[0] as unknown as [string, unknown[]];
    const payloadArg = call?.[1]?.[0];
    expect(typeof payloadArg).toBe('string');
    const parsed = JSON.parse(payloadArg as string) as Record<string, unknown>;
    expect(parsed.source_type).toBeUndefined();
    expect(parsed.source_hash).toBeUndefined();
    expect(parsed.ingestion_timestamp).toBeUndefined();
    expect(parsed.classification_results).toEqual([]);
  });
});
