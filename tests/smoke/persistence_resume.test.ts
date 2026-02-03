/**
 * Persistence resume smoke test — proves multi-day enterprise workflows.
 *
 * Flow:
 * 1. Initialize a Supervisor session (createSession in Postgres).
 * 2. Save one 'Thought' to PersistenceService (appendReasoningLog).
 * 3. Simulate process kill (no in-memory reference; only sessionId remains).
 * 4. Initialize a new "instance" by loading the same session (getSession with same sessionId).
 * 5. Assert the Agent can pull the previous Thought from Postgres and knows exactly where it left off.
 *
 * Requires: DATABASE_URL set and migrations 062 + 063 applied (tenant_supervisor_sessions with reasoning_logs).
 */

import { describe, it, expect } from '@jest/globals';
import { isDbConfigured, getPool } from '../../src/db/index.js';
import * as persistence from '../../src/services/persistence_service.js';

const TEST_TENANT_ID = 'smoke-persistence-resume-tenant';

describe('Persistence resume — multi-day enterprise workflows', () => {
  it('resumes Supervisor session and restores previous Thought from Postgres', async () => {
    if (!isDbConfigured()) {
      console.warn('Skipping persistence_resume: DATABASE_URL not set. Set DATABASE_URL to prove multi-day resume.');
      return;
    }

    const pool = getPool();
    let sessionId: string | null = null;

    try {
      // ——— 1. Initialize a Supervisor session (first "process") ———
      const session = await persistence.createSession(pool, TEST_TENANT_ID, {
        mode: 'chat',
      });
      sessionId = session.id;
      expect(session.id).toBeDefined();
      expect(session.reasoningLogs).toBeUndefined(); // initially empty

      // ——— 2. Save one 'Thought' to PersistenceService ———
      const thoughtText =
        'We left off here: ready to build Q4 financials. Next step is to run buildFinancialStatements with sessionId and tenantId.';
      await persistence.appendReasoningLog(pool, TEST_TENANT_ID, session.id, {
        stepType: 'thought',
        thought: thoughtText,
        timestamp: new Date().toISOString(),
      });

      // ——— 3. Simulate process kill: drop in-memory reference; only sessionId survives (e.g. from a bookmark or URL) ———
      const savedSessionId = session.id;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _dropped = session; // "process" ends; no other reference to session

      // ——— 4. New "process": initialize a new Supervisor instance with the same SessionID ———
      const resumedSession = await persistence.getSession(pool, savedSessionId);

      // ——— 5. Assert: Agent successfully pulls the previous Thought from Postgres and knows where it left off ———
      expect(resumedSession).toBeDefined();
      expect(resumedSession!.id).toBe(savedSessionId);
      expect(resumedSession!.tenantId).toBe(TEST_TENANT_ID);
      expect(resumedSession!.reasoningLogs).toBeDefined();
      expect(Array.isArray(resumedSession!.reasoningLogs)).toBe(true);
      expect(resumedSession!.reasoningLogs!.length).toBeGreaterThanOrEqual(1);

      const thoughtEntry = resumedSession!.reasoningLogs!.find(
        (e) => e.stepType === 'thought' && e.thought === thoughtText
      );
      expect(thoughtEntry).toBeDefined();
      expect(thoughtEntry!.stepType).toBe('thought');
      expect(thoughtEntry!.thought).toBe(thoughtText);
      expect(thoughtEntry!.timestamp).toBeDefined();
    } finally {
      // Cleanup: delete the test session
      if (sessionId) {
        await persistence.deleteSession(pool, sessionId, TEST_TENANT_ID);
      }
    }
  });
});
