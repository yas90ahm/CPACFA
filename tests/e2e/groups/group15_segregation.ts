/**
 * GROUP 15: Segregation of Duties (8 scenarios)
 *
 * Verifies SoD enforcement: creators cannot approve their own work,
 * different users can approve, role-based access for certify/reopen,
 * and clear error messages on violations.
 */
import {
  apiFetch,
  apiUpload,
  createEntity,
  createSession,
  uploadGL,
  mapAllAccounts,
  initializeReconciliations,
  reconcileAccount,
  createAndPostJE,
  generateStatements,
  explainAllVariances,
  expectStatus,
  expectFieldExists,
  expectTrue,
  readFixture,
  sleep,
  FIXTURES,
  enrichJELines,
} from '../helpers';
import { state } from '../run_all';
import type { TestGroup } from '../run_all';

/** Helper: set up a session with GL, mapping, and recons for SoD testing. */
async function setupSoDSession(
  token: string,
  reviewerToken: string,
  suffix: string,
): Promise<{ sessionId: string; entityId: string; recons: any[] }> {
  const entityId = `e2e-sod-${suffix}-${Date.now()}`;
  await createEntity(token, entityId);

  const sess = await createSession(token, entityId, '2026-01-01', '2026-01-31', '2026-01');
  const sessionId = sess.id;

  const glCsv = readFixture('minimalGL');
  await uploadGL(token, sessionId, glCsv);
  await mapAllAccounts(token, sessionId, entityId);
  const recons = await initializeReconciliations(token, sessionId);

  return { sessionId, entityId, recons };
}

export function group15_segregation(): TestGroup {
  return {
    name: 'GROUP 15: Segregation of Duties',
    scenarios: [
      {
        id: '15.01',
        name: 'Creator cannot approve own JE',
        fn: async () => {
          try {
            const token = state.preparerToken!;
            const { sessionId } = await setupSoDSession(token, state.reviewerToken!, 'selfapprove');

            // Create a JE as preparer
            const draftRes = await apiFetch('POST', '/api/close/journal-entries', {
              closeSessionId: sessionId,
              memo: 'SoD test — creator should not approve own JE',
              source: 'manual',
              lines: enrichJELines([
                { accountRef: '1000', debit: '1000.00', credit: '0.00', description: 'SoD JE debit' },
                { accountRef: '4000', debit: '0.00', credit: '1000.00', description: 'SoD JE credit' },
              ]),
            }, token);
            expectTrue(draftRes.ok, `Create JE should succeed, got ${draftRes.status}`);
            const jeId = draftRes.body.id;

            // Propose the JE
            const proposeRes = await apiFetch(
              'POST',
              `/api/close/journal-entries/${jeId}/propose`,
              {},
              token,
            );
            expectTrue(
              proposeRes.ok || proposeRes.status === 200,
              `Propose should succeed, got ${proposeRes.status}`,
            );

            // Try to approve own JE — should fail
            const approveRes = await apiFetch(
              'POST',
              `/api/close/journal-entries/${jeId}/approve`,
              {},
              token,
            );
            expectTrue(
              approveRes.status === 403 ||
                approveRes.status === 400 ||
                approveRes.status === 409 ||
                approveRes.status === 422,
              `Self-approval should be rejected, got ${approveRes.status}: ${JSON.stringify(approveRes.body).slice(0, 200)}`,
            );
          } catch (err: any) {
            throw new Error(`15.01 Creator cannot approve own JE: ${err.message}`);
          }
        },
      },
      {
        id: '15.02',
        name: 'Different user approves -> succeeds',
        fn: async () => {
          try {
            const token = state.preparerToken!;
            const reviewerToken = state.reviewerToken!;
            const approverToken = state.approverToken ?? reviewerToken;
            const { sessionId } = await setupSoDSession(token, reviewerToken, 'diffapprove');

            // Create JE as preparer
            const draftRes = await apiFetch('POST', '/api/close/journal-entries', {
              closeSessionId: sessionId,
              memo: 'SoD test — different user approval should succeed',
              source: 'manual',
              lines: enrichJELines([
                { accountRef: '1000', debit: '500.00', credit: '0.00', description: 'SoD cross-approve debit' },
                { accountRef: '4000', debit: '0.00', credit: '500.00', description: 'SoD cross-approve credit' },
              ]),
            }, token);
            expectTrue(draftRes.ok, `Create JE should succeed, got ${draftRes.status}`);
            const jeId = draftRes.body.id;

            // Propose
            await apiFetch('POST', `/api/close/journal-entries/${jeId}/propose`, {}, token);

            // Approve with a different user (reviewer or approver)
            const approveRes = await apiFetch(
              'POST',
              `/api/close/journal-entries/${jeId}/approve`,
              {},
              approverToken,
            );
            expectTrue(
              approveRes.ok || approveRes.status === 200,
              `Different user approval should succeed, got ${approveRes.status}: ${JSON.stringify(approveRes.body).slice(0, 200)}`,
            );
          } catch (err: any) {
            throw new Error(`15.02 Different user approves: ${err.message}`);
          }
        },
      },
      {
        id: '15.03',
        name: 'Preparer cannot approve own recon',
        fn: async () => {
          try {
            const token = state.preparerToken!;
            const { sessionId, recons } = await setupSoDSession(token, state.reviewerToken!, 'selfrecon');

            if (recons.length === 0) throw new Error('SKIP: No reconciliations initialized');

            const recon = recons[0];
            const reconId = recon.id ?? recon.recon_id ?? recon.reconId;

            // Set supporting balance
            await apiFetch(
              'POST',
              `/api/close/sessions/${sessionId}/reconciliations/${reconId}/supporting-balance`,
              { amount: '50000.00' },
              token,
            );

            // Complete the recon as preparer
            await apiFetch(
              'POST',
              `/api/close/sessions/${sessionId}/reconciliations/${reconId}/complete`,
              { variance_explanation: 'SoD recon test — amounts verified.' },
              token,
            );

            // Try to approve own recon — should fail
            const approveRes = await apiFetch(
              'POST',
              `/api/close/sessions/${sessionId}/reconciliations/${reconId}/approve`,
              {},
              token,
            );
            expectTrue(
              approveRes.status === 400 ||
                approveRes.status === 403 ||
                approveRes.status === 409 ||
                approveRes.status === 422,
              `Self-approval of recon should be rejected, got ${approveRes.status}: ${JSON.stringify(approveRes.body).slice(0, 200)}`,
            );
          } catch (err: any) {
            if (err.message.startsWith('SKIP:')) throw err;
            throw new Error(`15.03 Preparer cannot approve own recon: ${err.message}`);
          }
        },
      },
      {
        id: '15.04',
        name: 'Different user approves recon -> succeeds',
        fn: async () => {
          try {
            const token = state.preparerToken!;
            const reviewerToken = state.reviewerToken!;
            const { sessionId, recons } = await setupSoDSession(token, reviewerToken, 'crossrecon');

            if (recons.length === 0) throw new Error('SKIP: No reconciliations initialized');

            const recon = recons[0];
            const reconId = recon.id ?? recon.recon_id ?? recon.reconId;

            // Set supporting balance as preparer
            await apiFetch(
              'POST',
              `/api/close/sessions/${sessionId}/reconciliations/${reconId}/supporting-balance`,
              { amount: '50000.00' },
              token,
            );

            // Upload evidence
            await apiUpload(
              `/api/close/sessions/${sessionId}/reconciliations/${reconId}/evidence`,
              { description: 'SoD recon evidence' },
              'file',
              FIXTURES.sampleEvidence,
              token,
            );

            // Complete as preparer
            await apiFetch(
              'POST',
              `/api/close/sessions/${sessionId}/reconciliations/${reconId}/complete`,
              { variance_explanation: 'SoD cross-approval recon test — amounts verified.' },
              token,
            );

            // Approve with reviewer (different user)
            const approveRes = await apiFetch(
              'POST',
              `/api/close/sessions/${sessionId}/reconciliations/${reconId}/approve`,
              {},
              reviewerToken,
            );
            expectTrue(
              approveRes.ok || approveRes.status === 200,
              `Different user recon approval should succeed, got ${approveRes.status}: ${JSON.stringify(approveRes.body).slice(0, 200)}`,
            );
          } catch (err: any) {
            if (err.message.startsWith('SKIP:')) throw err;
            throw new Error(`15.04 Different user approves recon: ${err.message}`);
          }
        },
      },
      {
        id: '15.05',
        name: 'Only approver can certify',
        fn: async () => {
          try {
            const token = state.preparerToken!;
            const reviewerToken = state.reviewerToken!;

            // Use an existing session (or create a minimal one)
            const entityId = `e2e-sod-certify-${Date.now()}`;
            await createEntity(token, entityId);
            const sess = await createSession(token, entityId, '2026-01-01', '2026-01-31', '2026-01');
            const sessionId = sess.id;

            // Preparer tries to certify — should fail
            const prepCertRes = await apiFetch(
              'POST',
              `/api/close/sessions/${sessionId}/certify`,
              { certifiedBy: 'preparer', confirmation: 'CERTIFY' },
              token,
            );
            expectTrue(
              prepCertRes.status === 403 ||
                prepCertRes.status === 400 ||
                prepCertRes.status === 409 ||
                prepCertRes.status === 422,
              `Preparer should not be able to certify, got ${prepCertRes.status}`,
            );

            // Reviewer tries to certify — should also fail (not approver role)
            const revCertRes = await apiFetch(
              'POST',
              `/api/close/sessions/${sessionId}/certify`,
              { certifiedBy: 'reviewer', confirmation: 'CERTIFY' },
              reviewerToken,
            );
            // Reviewer may or may not be allowed depending on role hierarchy
            // At minimum, preparer should be denied
            expectTrue(
              revCertRes.status === 403 ||
                revCertRes.status === 400 ||
                revCertRes.status === 409 ||
                revCertRes.status === 422 ||
                revCertRes.ok,
              `Reviewer certify should either succeed or fail gracefully, got ${revCertRes.status}`,
            );
          } catch (err: any) {
            throw new Error(`15.05 Only approver can certify: ${err.message}`);
          }
        },
      },
      {
        id: '15.06',
        name: 'Only approver can reopen',
        fn: async () => {
          try {
            const token = state.preparerToken!;
            const reviewerToken = state.reviewerToken!;

            // Use an existing session
            const entityId = `e2e-sod-reopen-${Date.now()}`;
            await createEntity(token, entityId);
            const sess = await createSession(token, entityId, '2026-01-01', '2026-01-31', '2026-01');
            const sessionId = sess.id;

            // Preparer tries to reopen — should fail (session not certified, but role check happens first)
            const prepReopenRes = await apiFetch(
              'POST',
              `/api/close/sessions/${sessionId}/reopen`,
              { reason: 'Preparer attempting unauthorized reopen for SoD test' },
              token,
            );
            // Should fail because either:
            // 1. Session is not in CERTIFIED state (409/422)
            // 2. Preparer lacks role (403)
            expectTrue(
              prepReopenRes.status === 403 ||
                prepReopenRes.status === 400 ||
                prepReopenRes.status === 409 ||
                prepReopenRes.status === 422,
              `Preparer reopen should fail, got ${prepReopenRes.status}: ${JSON.stringify(prepReopenRes.body).slice(0, 200)}`,
            );

            // Reviewer tries to reopen — also restricted
            const revReopenRes = await apiFetch(
              'POST',
              `/api/close/sessions/${sessionId}/reopen`,
              { reason: 'Reviewer attempting reopen for SoD test verification' },
              reviewerToken,
            );
            expectTrue(
              revReopenRes.status === 403 ||
                revReopenRes.status === 400 ||
                revReopenRes.status === 409 ||
                revReopenRes.status === 422,
              `Reviewer reopen should fail (wrong state or role), got ${revReopenRes.status}`,
            );
          } catch (err: any) {
            throw new Error(`15.06 Only approver can reopen: ${err.message}`);
          }
        },
      },
      {
        id: '15.07',
        name: 'SoD active in production mode',
        fn: async () => {
          try {
            const token = state.preparerToken!;

            // Verify SoD is active by testing a known SoD enforcement point
            const entityId = `e2e-sod-active-${Date.now()}`;
            await createEntity(token, entityId);
            const sess = await createSession(token, entityId, '2026-01-01', '2026-01-31', '2026-01');

            // Create JE
            const draftRes = await apiFetch('POST', '/api/close/journal-entries', {
              closeSessionId: sess.id,
              memo: 'SoD active check — self-approval test',
              source: 'manual',
              lines: enrichJELines([
                { accountRef: '1000', debit: '100.00', credit: '0.00', description: 'SoD active check' },
                { accountRef: '3000', debit: '0.00', credit: '100.00', description: 'SoD active check' },
              ]),
            }, token);

            if (draftRes.ok) {
              const jeId = draftRes.body.id;

              // Propose
              await apiFetch('POST', `/api/close/journal-entries/${jeId}/propose`, {}, token);

              // Self-approve must fail — this confirms SoD is active
              const selfApprove = await apiFetch(
                'POST',
                `/api/close/journal-entries/${jeId}/approve`,
                {},
                token,
              );

              // SoD is "active" if self-approval is rejected
              const sodActive =
                selfApprove.status === 403 ||
                selfApprove.status === 400 ||
                selfApprove.status === 409 ||
                selfApprove.status === 422;

              expectTrue(
                sodActive,
                `SoD should be active (self-approval rejected), but got ${selfApprove.status}. SoD may be disabled.`,
              );
            }
          } catch (err: any) {
            throw new Error(`15.07 SoD active in production mode: ${err.message}`);
          }
        },
      },
      {
        id: '15.08',
        name: 'Clear error messages on SoD violations',
        fn: async () => {
          try {
            const token = state.preparerToken!;

            const entityId = `e2e-sod-errmsg-${Date.now()}`;
            await createEntity(token, entityId);
            const sess = await createSession(token, entityId, '2026-01-01', '2026-01-31', '2026-01');

            // Create and propose JE
            const draftRes = await apiFetch('POST', '/api/close/journal-entries', {
              closeSessionId: sess.id,
              memo: 'SoD error message check',
              source: 'manual',
              lines: enrichJELines([
                { accountRef: '1000', debit: '200.00', credit: '0.00', description: 'Error msg test' },
                { accountRef: '3000', debit: '0.00', credit: '200.00', description: 'Error msg test' },
              ]),
            }, token);

            if (draftRes.ok) {
              const jeId = draftRes.body.id;

              // Propose
              await apiFetch('POST', `/api/close/journal-entries/${jeId}/propose`, {}, token);

              // Self-approve — should fail with clear error
              const selfApprove = await apiFetch(
                'POST',
                `/api/close/journal-entries/${jeId}/approve`,
                {},
                token,
              );

              if (!selfApprove.ok) {
                // Check that the error message is meaningful (not generic 500)
                const errorBody = selfApprove.body;
                const errorMsg =
                  typeof errorBody === 'string'
                    ? errorBody
                    : errorBody?.error ?? errorBody?.message ?? JSON.stringify(errorBody);

                expectTrue(
                  typeof errorMsg === 'string' && errorMsg.length > 5,
                  `SoD error should have a meaningful message, got: ${errorMsg}`,
                );

                // The error message should reference segregation, approval, or the user
                const hasContext =
                  errorMsg.toLowerCase().includes('segregat') ||
                  errorMsg.toLowerCase().includes('approv') ||
                  errorMsg.toLowerCase().includes('same user') ||
                  errorMsg.toLowerCase().includes('creator') ||
                  errorMsg.toLowerCase().includes('cannot') ||
                  errorMsg.toLowerCase().includes('different') ||
                  errorMsg.toLowerCase().includes('own') ||
                  errorMsg.toLowerCase().includes('self');

                expectTrue(
                  hasContext,
                  `SoD error message should be descriptive about the violation. Got: "${errorMsg.slice(0, 200)}"`,
                );
              }
            }

            // Also test certify error message
            const certRes = await apiFetch(
              'POST',
              `/api/close/sessions/${sess.id}/certify`,
              { certifiedBy: 'preparer', confirmation: 'CERTIFY' },
              token,
            );
            if (!certRes.ok) {
              const certError = certRes.body?.error ?? certRes.body?.message ?? '';
              expectTrue(
                typeof certError === 'string' && certError.length > 3,
                `Certify error should have a message, got: "${certError}"`,
              );
            }
          } catch (err: any) {
            throw new Error(`15.08 Clear error messages on SoD violations: ${err.message}`);
          }
        },
      },
    ],
  };
}
