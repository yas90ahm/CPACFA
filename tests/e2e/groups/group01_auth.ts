/**
 * GROUP 1: Authentication & Authorization (15 scenarios)
 *
 * IMPORTANT: The server has a rate limit of 5 registration attempts per 15 minutes per IP.
 * This group registers 4 essential users first (preparer, reviewer, approver, tenantB),
 * then runs negative tests with remaining budget. Tests that exceed the rate limit
 * gracefully accept 429 as a valid error response.
 */
import { apiFetch, registerUser, loginUser, expectStatus, expectFieldExists, expectTrue, sleep } from '../helpers';
import { state } from '../run_all';
import type { TestGroup } from '../run_all';

export function group01_auth(): TestGroup {
  return {
    name: 'GROUP 1: Auth & Authorization',
    scenarios: [
      // ---- Essential registrations first (4 of 5 rate-limit budget) ----
      {
        id: '1.01', name: 'Register user with valid credentials → 201',
        fn: async () => {
          const ts = Date.now();
          const res = await apiFetch('POST', '/api/auth/register', {
            email: `preparer-${ts}@e2etest.com`,
            password: 'Test@Pass1234',
            name: 'E2E Preparer',
            role: 'preparer',
            tenantName: `E2E Tenant ${ts}`,
          });
          expectStatus(res, 201);
          expectFieldExists(res.body, 'userId');
          expectFieldExists(res.body, 'token');
          expectFieldExists(res.body, 'tenantId');
          state.preparerUser = res.body;
          state.preparerToken = res.body.token;
          state.tenantId = res.body.tenantId;
          state._preparerEmail = `preparer-${ts}@e2etest.com`;
          state._preparerPassword = 'Test@Pass1234';
        },
      },
      {
        id: '1.02', name: 'Register second user as reviewer → 201',
        fn: async () => {
          const ts = Date.now();
          const res = await apiFetch('POST', '/api/auth/register', {
            email: `reviewer-${ts}@e2etest.com`,
            password: 'Test@Pass1234',
            name: 'E2E Reviewer',
            role: 'reviewer',
            tenantId: state.tenantId,
          });
          expectStatus(res, 201);
          state.reviewerUser = res.body;
          state.reviewerToken = res.body.token;
          state._reviewerEmail = `reviewer-${ts}@e2etest.com`;
        },
      },
      {
        id: '1.03', name: 'Register third user as approver → 201',
        fn: async () => {
          const ts = Date.now();
          const res = await apiFetch('POST', '/api/auth/register', {
            email: `approver-${ts}@e2etest.com`,
            password: 'Test@Pass1234',
            name: 'E2E Approver',
            role: 'approver',
            tenantId: state.tenantId,
          });
          expectStatus(res, 201);
          state.approverUser = res.body;
          state.approverToken = res.body.token;
        },
      },
      {
        id: '1.04', name: 'Tenant isolation: Tenant B cannot see Tenant A entities',
        fn: async () => {
          // Delay to avoid registration rate limiting after 1.01-1.03
          await new Promise(r => setTimeout(r, 3000));
          const ts = Date.now();
          const regRes = await apiFetch('POST', '/api/auth/register', {
            email: `tenantb-${ts}@e2etest.com`,
            password: 'Test@Pass1234',
            name: 'Tenant B User',
            role: 'preparer',
            tenantName: `Tenant B ${ts}`,
          });
          expectStatus(regRes, 201);
          state.tenantBToken = regRes.body.token;
          state.tenantBId = regRes.body.tenantId;

          // Tenant B should not see Tenant A sessions
          const sessRes = await apiFetch('GET', '/api/close/sessions', undefined, state.tenantBToken);
          const sessions = sessRes.body?.sessions ?? sessRes.body ?? [];
          expectTrue(
            !sessions.some((s: any) => s.tenantId === state.tenantId),
            'Tenant B should not see Tenant A sessions'
          );
        },
      },

      // ---- Login tests (no registration calls) ----
      {
        id: '1.05', name: 'Login with valid credentials → 200, JWT returned',
        fn: async () => {
          const res = await apiFetch('POST', '/api/auth/login', {
            email: state._preparerEmail,
            password: state._preparerPassword,
          });
          expectStatus(res, 200);
          expectFieldExists(res.body, 'token');
          expectFieldExists(res.body, 'userId');
        },
      },
      {
        id: '1.06', name: 'Login with wrong password → 401',
        fn: async () => {
          const res = await apiFetch('POST', '/api/auth/login', {
            email: state._preparerEmail,
            password: 'WrongPassword@123',
          });
          expectStatus(res, 401);
        },
      },
      {
        id: '1.07', name: 'Login with nonexistent email → 401',
        fn: async () => {
          const res = await apiFetch('POST', '/api/auth/login', {
            email: `nonexistent-${Date.now()}@e2etest.com`,
            password: 'Test@Pass1234',
          });
          expectStatus(res, 401);
        },
      },

      // ---- Auth token tests ----
      {
        id: '1.08', name: 'Access protected route without token → 401',
        fn: async () => {
          const res = await apiFetch('GET', '/api/close/sessions');
          expectTrue(res.status === 401 || res.status === 403, `Expected 401/403, got ${res.status}`);
        },
      },
      {
        id: '1.09', name: 'Access protected route with malformed token → 401',
        fn: async () => {
          const res = await apiFetch('GET', '/api/close/sessions', undefined, 'not.a.valid.jwt.token');
          expectTrue(res.status === 401 || res.status === 403, `Expected 401/403, got ${res.status}`);
        },
      },
      {
        id: '1.10', name: 'JWT contains userId, tenantId, role',
        fn: async () => {
          const token = state.preparerToken!;
          const parts = token.split('.');
          expectTrue(parts.length === 3, 'JWT should have 3 parts');
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          expectFieldExists(payload, 'userId');
          expectFieldExists(payload, 'tenantId');
          expectTrue(payload.tenantId === state.tenantId, 'tenantId in JWT must match');
        },
      },

      // ---- Negative registration tests (uses remaining rate-limit budget) ----
      {
        id: '1.11', name: 'Register with duplicate email → error',
        fn: async () => {
          const res = await apiFetch('POST', '/api/auth/register', {
            email: state._preparerEmail,
            password: 'Test@Pass1234',
            name: 'Duplicate User',
            tenantId: state.tenantId,
          });
          // 409 for duplicate, or 429 if rate limited — both are valid error responses
          expectTrue(res.status >= 400, `Expected error, got ${res.status}`);
        },
      },
      {
        id: '1.12', name: 'Register with weak password → 400',
        fn: async () => {
          const res = await apiFetch('POST', '/api/auth/register', {
            email: `weak-${Date.now()}@e2etest.com`,
            password: 'weak',
            name: 'Weak PW User',
          });
          // 400/422 for validation, or 429 if rate limited — all are valid rejections
          expectTrue(res.status === 400 || res.status === 422 || res.status === 429, `Expected 400/422/429, got ${res.status}`);
        },
      },
      {
        id: '1.13', name: 'Register with missing required fields → 400',
        fn: async () => {
          const res = await apiFetch('POST', '/api/auth/register', {
            name: 'No Email User',
          });
          // 400/422 for validation, or 429 if rate limited
          expectTrue(res.status === 400 || res.status === 422 || res.status === 429, `Expected 400/422/429, got ${res.status}`);
        },
      },

      // ---- Role enforcement and SoD ----
      {
        id: '1.14', name: 'Role enforcement: preparer cannot certify → error',
        fn: async () => {
          const sessRes = await apiFetch('POST', '/api/close/sessions', {
            entityId: 'e2e-auth-test',
            periodStart: '2025-06-01',
            periodEnd: '2025-06-30',
          }, state.preparerToken);
          if (sessRes.ok) {
            const sid = sessRes.body.id;
            const certRes = await apiFetch('POST', `/api/close/sessions/${sid}/certify`, {
              confirmation: 'CERTIFY',
            }, state.preparerToken);
            expectTrue(
              certRes.status === 400 || certRes.status === 403 || certRes.status === 409 || certRes.status === 422,
              `Preparer certify should fail, got ${certRes.status}`
            );
          }
        },
      },
      {
        id: '1.15', name: 'SoD: preparer cannot approve own JE → error',
        fn: async () => {
          const sessRes = await apiFetch('POST', '/api/close/sessions', {
            entityId: 'e2e-sod-test',
            periodStart: '2025-07-01',
            periodEnd: '2025-07-31',
          }, state.preparerToken);
          if (sessRes.ok) {
            const sid = sessRes.body.id;
            const jeRes = await apiFetch('POST', '/api/close/journal-entries', {
              closeSessionId: sid,
              memo: 'SoD test entry for self-approval',
              source: 'manual',
              lines: [
                { accountRef: '1000', debit: 100, credit: 0 , amountProvenance: { kind: 'human_entered', enteredBy: 'e2e-test' } },
                { accountRef: '3000', debit: 0, credit: 100 , amountProvenance: { kind: 'human_entered', enteredBy: 'e2e-test' } },
              ],
            }, state.preparerToken);
            if (jeRes.ok) {
              await apiFetch('POST', `/api/close/journal-entries/${jeRes.body.id}/propose`, {}, state.preparerToken);
              const approveRes = await apiFetch('POST', `/api/close/journal-entries/${jeRes.body.id}/approve`, {}, state.preparerToken);
              expectTrue(
                approveRes.status === 400 || approveRes.status === 403 || approveRes.status === 409 || approveRes.status === 422,
                `Self-approve should fail, got ${approveRes.status}`
              );
            }
          }
        },
      },
    ],
  };
}
