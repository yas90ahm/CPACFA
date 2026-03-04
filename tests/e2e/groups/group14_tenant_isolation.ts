/**
 * GROUP 14: Multi-Tenant Isolation (6 scenarios)
 *
 * Verifies that Tenant A and Tenant B are completely isolated:
 * entities, sessions, journal entries, and audit trails are
 * invisible and inaccessible across tenant boundaries.
 */
import {
  apiFetch,
  createEntity,
  createSession,
  expectStatus,
  expectFieldExists,
  expectTrue,
  enrichJELines,
} from '../helpers';
import { state } from '../run_all';
import type { TestGroup } from '../run_all';

export function group14_tenant_isolation(): TestGroup {
  return {
    name: 'GROUP 14: Multi-Tenant Isolation',
    scenarios: [
      {
        id: '14.01',
        name: 'Tenant A creates entity and session',
        fn: async () => {
          try {
            const tokenA = state.preparerToken!;
            if (!tokenA) throw new Error('SKIP: Tenant A preparer token not available');

            // Create entity for Tenant A
            const entityId = `e2e-tenant-a-${Date.now()}`;
            await createEntity(tokenA, entityId);
            state._tenantIsoEntityA = entityId;

            // Create session
            const sess = await createSession(tokenA, entityId, '2026-01-01', '2026-01-31', '2026-01');
            expectFieldExists(sess, 'id');
            state._tenantIsoSessionA = sess.id;

            // Verify we can access it
            const getRes = await apiFetch(
              'GET',
              `/api/close/sessions/${sess.id}`,
              undefined,
              tokenA,
            );
            expectTrue(getRes.ok, `Tenant A should access own session, got ${getRes.status}`);
          } catch (err: any) {
            if (err.message.startsWith('SKIP:')) throw err;
            throw new Error(`14.01 Tenant A creates entity and session: ${err.message}`);
          }
        },
      },
      {
        id: '14.02',
        name: 'Tenant B cannot list Tenant A entities',
        fn: async () => {
          try {
            const tokenB = state.tenantBToken;
            if (!tokenB) throw new Error('SKIP: Tenant B token not available (set up in group01)');

            // List entities with Tenant B token
            const entitiesRes = await apiFetch(
              'GET',
              '/api/settings/entities',
              undefined,
              tokenB,
            );

            if (entitiesRes.ok) {
              const entities = entitiesRes.body?.entities ?? [];
              // None of Tenant B's entities should match Tenant A's entity
              const tenantAEntity = state._tenantIsoEntityA;
              if (tenantAEntity) {
                const foundA = entities.some(
                  (e: any) =>
                    e.entityId === tenantAEntity ||
                    e.id === tenantAEntity ||
                    e.name === tenantAEntity,
                );
                expectTrue(
                  !foundA,
                  `Tenant B should NOT see Tenant A entity "${tenantAEntity}" in entity list`,
                );
              }
            }
            // If the endpoint returns 403 or empty, that also confirms isolation
            expectTrue(
              entitiesRes.ok || entitiesRes.status === 403 || entitiesRes.status === 404,
              `Entities endpoint should succeed or deny, got ${entitiesRes.status}`,
            );
          } catch (err: any) {
            if (err.message.startsWith('SKIP:')) throw err;
            throw new Error(`14.02 Tenant B cannot list Tenant A entities: ${err.message}`);
          }
        },
      },
      {
        id: '14.03',
        name: 'Tenant B cannot get Tenant A session',
        fn: async () => {
          try {
            const tokenB = state.tenantBToken;
            const sessionA = state._tenantIsoSessionA ?? state.sessionId;
            if (!tokenB) throw new Error('SKIP: Tenant B token not available');
            if (!sessionA) throw new Error('SKIP: Tenant A session not available');

            // Try to get Tenant A's session with Tenant B's token
            const getRes = await apiFetch(
              'GET',
              `/api/close/sessions/${sessionA}`,
              undefined,
              tokenB,
            );

            // Should be 404 (not found in Tenant B's scope) or 403
            expectTrue(
              getRes.status === 404 || getRes.status === 403 || getRes.status === 401,
              `Tenant B should NOT access Tenant A session, got ${getRes.status}: ${JSON.stringify(getRes.body).slice(0, 200)}`,
            );
          } catch (err: any) {
            if (err.message.startsWith('SKIP:')) throw err;
            throw new Error(`14.03 Tenant B cannot get Tenant A session: ${err.message}`);
          }
        },
      },
      {
        id: '14.04',
        name: 'Tenant B cannot post JE to Tenant A session',
        fn: async () => {
          try {
            const tokenB = state.tenantBToken;
            const sessionA = state._tenantIsoSessionA ?? state.sessionId;
            if (!tokenB) throw new Error('SKIP: Tenant B token not available');
            if (!sessionA) throw new Error('SKIP: Tenant A session not available');

            // Try to create a JE in Tenant A's session using Tenant B's token
            const jeRes = await apiFetch('POST', '/api/close/journal-entries', {
              closeSessionId: sessionA,
              memo: 'Cross-tenant JE attack attempt',
              source: 'manual',
              lines: enrichJELines([
                { accountRef: '1000', debit: '9999.00', credit: '0.00', description: 'Unauthorized' },
                { accountRef: '3000', debit: '0.00', credit: '9999.00', description: 'Unauthorized' },
              ]),
            }, tokenB);

            // Should be rejected — 403, 404, or 400
            expectTrue(
              jeRes.status === 403 || jeRes.status === 404 || jeRes.status === 400 || jeRes.status === 401,
              `Tenant B should NOT post JE to Tenant A session, got ${jeRes.status}: ${JSON.stringify(jeRes.body).slice(0, 200)}`,
            );
          } catch (err: any) {
            if (err.message.startsWith('SKIP:')) throw err;
            throw new Error(`14.04 Tenant B cannot post JE to Tenant A session: ${err.message}`);
          }
        },
      },
      {
        id: '14.05',
        name: 'Tenant B cannot read Tenant A audit trail',
        fn: async () => {
          try {
            const tokenB = state.tenantBToken;
            const sessionA = state._tenantIsoSessionA ?? state.sessionId;
            if (!tokenB) throw new Error('SKIP: Tenant B token not available');
            if (!sessionA) throw new Error('SKIP: Tenant A session not available');

            // Try to read Tenant A's audit events
            const auditRes = await apiFetch(
              'GET',
              `/api/close/sessions/${sessionA}/audit-events`,
              undefined,
              tokenB,
            );

            // Should be 404 (session not found in Tenant B scope) or 403
            if (auditRes.ok) {
              // If it returns 200, verify no events are leaked
              const events = auditRes.body?.events ?? [];
              expectTrue(
                events.length === 0,
                `Tenant B should see 0 audit events for Tenant A session, got ${events.length}`,
              );
            } else {
              expectTrue(
                auditRes.status === 404 || auditRes.status === 403 || auditRes.status === 401,
                `Tenant B audit trail access should be denied, got ${auditRes.status}`,
              );
            }
          } catch (err: any) {
            if (err.message.startsWith('SKIP:')) throw err;
            throw new Error(`14.05 Tenant B cannot read Tenant A audit trail: ${err.message}`);
          }
        },
      },
      {
        id: '14.06',
        name: 'Tenant B creates own entity independently',
        fn: async () => {
          try {
            const tokenB = state.tenantBToken;
            if (!tokenB) throw new Error('SKIP: Tenant B token not available');

            // Tenant B creates their own entity
            const entityId = `e2e-tenant-b-${Date.now()}`;
            await createEntity(tokenB, entityId);

            // Verify Tenant B can access their own entity
            const settingsRes = await apiFetch(
              'GET',
              `/api/settings/general?entityId=${encodeURIComponent(entityId)}`,
              undefined,
              tokenB,
            );
            expectTrue(
              settingsRes.ok,
              `Tenant B should access own entity settings, got ${settingsRes.status}`,
            );

            // Create a session for Tenant B
            const sess = await createSession(tokenB, entityId, '2026-01-01', '2026-01-31', '2026-01');
            expectFieldExists(sess, 'id');

            // Verify Tenant B can access their own session
            const sessRes = await apiFetch(
              'GET',
              `/api/close/sessions/${sess.id}`,
              undefined,
              tokenB,
            );
            expectTrue(sessRes.ok, `Tenant B should access own session, got ${sessRes.status}`);

            // Verify Tenant A cannot access Tenant B's session
            const tokenA = state.preparerToken!;
            const crossRes = await apiFetch(
              'GET',
              `/api/close/sessions/${sess.id}`,
              undefined,
              tokenA,
            );
            expectTrue(
              crossRes.status === 404 || crossRes.status === 403 || crossRes.status === 401,
              `Tenant A should NOT access Tenant B session, got ${crossRes.status}`,
            );
          } catch (err: any) {
            if (err.message.startsWith('SKIP:')) throw err;
            throw new Error(`14.06 Tenant B creates own entity independently: ${err.message}`);
          }
        },
      },
    ],
  };
}
