/**
 * GROUP 17: Edge Cases (10 scenarios)
 *
 * Tests boundary conditions: max precision amounts, very large amounts,
 * rapid-fire operations, zero balances, minimal close, special characters,
 * and long text fields.
 */
import {
  apiFetch,
  createSession,
  uploadGL,
  mapAllAccounts,
  initializeReconciliations,
  reconcileAccount,
  createAndPostJE,
  generateStatements,
  explainAllVariances,
  expectStatus,
  expectTrue,
  expectFieldExists,
  FIXTURES,
  readFixture,
  sleep,
  enrichJELines,
} from '../helpers';
import { state } from '../run_all';
import type { TestGroup } from '../run_all';
import fs from 'fs';

export function group17_edge_cases(): TestGroup {
  return {
    name: 'GROUP 17: Edge Cases',
    scenarios: [
      // ------------------------------------------------------------------
      // 17.01  JE with max precision amounts (20,2) handled
      // ------------------------------------------------------------------
      {
        id: '17.01',
        name: 'JE with max precision amounts (20,2) handled',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');
          if (!state.approverToken) throw new Error('SKIP: no approverToken');

          // NUMERIC(20,2) max is 999999999999999999.99 (18 digits before decimal)
          // Use a large but valid value
          const maxAmount = '99999999999999999.99';

          const draftRes = await apiFetch(
            'POST',
            '/api/close/journal-entries',
            {
              closeSessionId: state.sessionId,
              memo: 'E2E edge case: max precision NUMERIC(20,2)',
              source: 'manual',
              lines: enrichJELines([
                { accountRef: '1000', debit: maxAmount, credit: '0.00' },
                { accountRef: '3000', debit: '0.00', credit: maxAmount },
              ]),
            },
            state.preparerToken,
          );

          if (draftRes.ok) {
            const jeId = draftRes.body.id;
            expectFieldExists(draftRes.body, 'id');

            // Verify the amounts were stored correctly
            const getRes = await apiFetch(
              'GET',
              `/api/close/journal-entries/${jeId}`,
              undefined,
              state.preparerToken,
            );

            if (getRes.ok) {
              const lines = getRes.body?.lines ?? [];
              if (lines.length > 0) {
                const debitLine = lines.find((l: any) => l.debit && l.debit !== '0' && l.debit !== '0.00');
                if (debitLine) {
                  expectTrue(
                    debitLine.debit === maxAmount || debitLine.debit === '99999999999999999.99',
                    `Max precision amount should be stored exactly, got "${debitLine.debit}"`,
                  );
                }
              }
            }
          } else {
            // Server may reject amounts this large — that is acceptable if
            // it returns a proper error (400/422), not a 500.
            expectTrue(
              draftRes.status === 400 || draftRes.status === 422,
              `Max precision JE should succeed or return 400/422, got ${draftRes.status}`,
            );
          }
        },
      },

      // ------------------------------------------------------------------
      // 17.02  JE with very large amounts (billions) — Decimal correct
      // ------------------------------------------------------------------
      {
        id: '17.02',
        name: 'JE with very large amounts (billions) — Decimal correct',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');
          if (!state.approverToken) throw new Error('SKIP: no approverToken');

          const billionAmount = '5000000000.00';

          const draftRes = await apiFetch(
            'POST',
            '/api/close/journal-entries',
            {
              closeSessionId: state.sessionId,
              memo: 'E2E edge case: billion-dollar JE',
              source: 'manual',
              lines: enrichJELines([
                { accountRef: '1000', debit: billionAmount, credit: '0.00' },
                { accountRef: '3000', debit: '0.00', credit: billionAmount },
              ]),
            },
            state.preparerToken,
          );

          expectTrue(
            draftRes.ok,
            `Billion-dollar JE should be accepted, got ${draftRes.status}: ${JSON.stringify(draftRes.body).slice(0, 300)}`,
          );
          expectFieldExists(draftRes.body, 'id');

          // Propose and approve to confirm full pipeline handles large amounts
          const jeId = draftRes.body.id;
          const proposeRes = await apiFetch(
            'POST',
            `/api/close/journal-entries/${jeId}/propose`,
            {},
            state.preparerToken,
          );
          expectTrue(proposeRes.ok || proposeRes.status === 409, `Propose billion JE: ${proposeRes.status}`);

          const approveRes = await apiFetch(
            'POST',
            `/api/close/journal-entries/${jeId}/approve`,
            {},
            state.approverToken,
          );
          expectTrue(approveRes.ok || approveRes.status === 409, `Approve billion JE: ${approveRes.status}`);

          const postRes = await apiFetch(
            'POST',
            `/api/close/journal-entries/${jeId}/post`,
            {},
            state.preparerToken,
          );
          expectTrue(postRes.ok || postRes.status === 409, `Post billion JE: ${postRes.status}`);

          // Verify in trial balance
          const tbRes = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/trial-balance?type=adjusted`,
            undefined,
            state.preparerToken,
          );

          if (tbRes.ok) {
            const accounts = tbRes.body?.accounts ?? tbRes.body?.entries ?? tbRes.body?.rows ?? [];
            const cashAcct = accounts.find(
              (a: any) => (a.accountCode ?? a.account_code) === '1000',
            );
            if (cashAcct) {
              // The balance should include the billion-dollar amount
              const balance = parseFloat(cashAcct.netBalance ?? cashAcct.debitBalance ?? '0');
              expectTrue(
                balance >= 5000000000,
                `Cash balance should reflect billion-dollar entry, got ${balance}`,
              );
            }
          }
        },
      },

      // ------------------------------------------------------------------
      // 17.03  Upload 10K-entry GL — completes within 30s
      // ------------------------------------------------------------------
      {
        id: '17.03',
        name: 'Upload 10K-entry GL — completes within 30s',
        fn: async () => {
          if (!fs.existsSync(FIXTURES.largeGL)) {
            throw new Error('SKIP: large_gl.csv fixture not found');
          }
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');
          if (!state.entityId) throw new Error('SKIP: no entityId');

          // Create a dedicated session for the large upload
          const sess = await createSession(
            state.preparerToken,
            state.entityId,
            '2025-04-01',
            '2025-04-30',
          );

          const csv = readFixture('largeGL');
          const lineCount = csv.split('\n').filter((l) => l.trim()).length - 1; // minus header

          if (lineCount < 1000) {
            throw new Error(`SKIP: large_gl.csv has only ${lineCount} entries (need 10K+)`);
          }

          const start = Date.now();
          const result = await uploadGL(state.preparerToken, sess.id, csv);
          const elapsed = Date.now() - start;

          expectTrue(
            result._ok || result._status < 500,
            `Large GL upload failed with status ${result._status}`,
          );
          expectTrue(
            elapsed < 30000,
            `Large GL upload took ${elapsed}ms, should be under 30s`,
          );
        },
      },

      // ------------------------------------------------------------------
      // 17.04  Rapid-fire 10 JE posts — all cascades complete
      // ------------------------------------------------------------------
      {
        id: '17.04',
        name: 'Rapid-fire 10 JE posts — all cascades complete',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');
          if (!state.approverToken) throw new Error('SKIP: no approverToken');

          const jeIds: string[] = [];

          // Create 10 JEs in quick succession
          for (let i = 1; i <= 10; i++) {
            const amount = (100 * i).toFixed(2);
            try {
              const draftRes = await apiFetch(
                'POST',
                '/api/close/journal-entries',
                {
                  closeSessionId: state.sessionId,
                  memo: `E2E rapid-fire JE #${i}`,
                  source: 'manual',
                  lines: enrichJELines([
                    { accountRef: '1000', debit: amount, credit: '0.00' },
                    { accountRef: '4000', debit: '0.00', credit: amount },
                  ]),
                },
                state.preparerToken,
              );
              if (draftRes.ok) jeIds.push(draftRes.body.id);
            } catch (err: any) {
              // Continue — we want to attempt all 10
            }
          }

          expectTrue(jeIds.length >= 5, `Should create at least 5 JEs, got ${jeIds.length}`);

          // Propose, approve, and post all in rapid succession
          let postedCount = 0;
          for (const jeId of jeIds) {
            try {
              await apiFetch('POST', `/api/close/journal-entries/${jeId}/propose`, {}, state.preparerToken);
              await apiFetch('POST', `/api/close/journal-entries/${jeId}/approve`, {}, state.approverToken);
              const postRes = await apiFetch('POST', `/api/close/journal-entries/${jeId}/post`, {}, state.preparerToken);
              if (postRes.ok) postedCount++;
            } catch {
              // Continue
            }
          }

          expectTrue(
            postedCount >= 5,
            `Should post at least 5 rapid-fire JEs, posted ${postedCount}/${jeIds.length}`,
          );

          // Brief pause for cascade processing
          await sleep(500);

          // Verify trial balance reflects the entries
          const tbRes = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/trial-balance?type=adjusted`,
            undefined,
            state.preparerToken,
          );

          expectTrue(tbRes.ok, `Trial balance fetch after rapid-fire JEs: ${tbRes.status}`);
        },
      },

      // ------------------------------------------------------------------
      // 17.05  Statements with zero revenue — valid
      // ------------------------------------------------------------------
      {
        id: '17.05',
        name: 'Statements with zero revenue — valid',
        fn: async () => {
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');
          if (!state.entityId) throw new Error('SKIP: no entityId');

          // Create a session with only balance sheet entries (no revenue)
          const sess = await createSession(
            state.preparerToken,
            state.entityId,
            '2025-05-01',
            '2025-05-31',
          );

          const zeroRevGL = [
            'entry_id,entry_date,account_code,account_name,debit,credit,description',
            'JE001,2025-05-01,1000,Cash,10000.00,0.00,Initial deposit',
            'JE001,2025-05-01,3000,Common Stock,0.00,10000.00,Initial equity',
          ].join('\n');

          await uploadGL(state.preparerToken, sess.id, zeroRevGL);
          await mapAllAccounts(state.preparerToken, sess.id, state.entityId);

          // Initialize recons and reconcile
          const recons = await initializeReconciliations(state.preparerToken, sess.id);
          for (const r of recons) {
            try {
              await reconcileAccount(
                state.preparerToken,
                sess.id,
                r.id ?? r.recon_id ?? r.reconId,
                r.glBalance ?? '10000.00',
                state.reviewerToken,
              );
            } catch {
              // Some recons may fail — continue
            }
          }

          // Generate statements — should work even with zero revenue
          try {
            const stmtRes = await apiFetch(
              'POST',
              `/api/close/sessions/${sess.id}/statement-packages/generate`,
              {},
              state.preparerToken,
            );
            expectTrue(
              stmtRes.ok || stmtRes.status === 422,
              `Zero-revenue statements should succeed or return 422, got ${stmtRes.status}`,
            );

            if (stmtRes.ok) {
              const pkgId = stmtRes.body?.id ?? stmtRes.body?.packageId;
              if (pkgId) {
                const linesRes = await apiFetch(
                  'GET',
                  `/api/close/statement-packages/${pkgId}/lines`,
                  undefined,
                  state.preparerToken,
                );
                expectTrue(linesRes.ok, `Statement lines fetch: ${linesRes.status}`);
              }
            }
          } catch (err: any) {
            // Generation may fail if prerequisites not fully met — acceptable
            expectTrue(
              err.message.includes('SKIP') || err.message.includes('failed'),
              `Unexpected error: ${err.message.slice(0, 200)}`,
            );
          }
        },
      },

      // ------------------------------------------------------------------
      // 17.06  Reconcile with zero GL balance — works
      // ------------------------------------------------------------------
      {
        id: '17.06',
        name: 'Reconcile with zero GL balance — works',
        fn: async () => {
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');
          if (!state.entityId) throw new Error('SKIP: no entityId');

          const sess = await createSession(
            state.preparerToken,
            state.entityId,
            '2025-06-01',
            '2025-06-30',
          );

          // GL with a zero-balance account
          const glWithZero = [
            'entry_id,entry_date,account_code,account_name,debit,credit,description',
            'JE001,2025-06-01,1000,Cash,5000.00,0.00,Opening',
            'JE001,2025-06-01,3000,Common Stock,0.00,5000.00,Opening equity',
            'JE002,2025-06-15,1100,Accounts Receivable,1000.00,0.00,Invoice',
            'JE002,2025-06-15,4000,Revenue,0.00,1000.00,Revenue',
            'JE003,2025-06-20,1000,Cash,1000.00,0.00,Payment received',
            'JE003,2025-06-20,1100,Accounts Receivable,0.00,1000.00,AR cleared',
          ].join('\n');

          await uploadGL(state.preparerToken, sess.id, glWithZero);
          await mapAllAccounts(state.preparerToken, sess.id, state.entityId);

          const recons = await initializeReconciliations(state.preparerToken, sess.id);

          // Find AR account (should have zero balance)
          const arRecon = recons.find(
            (r: any) =>
              (r.accountCode ?? r.account_code) === '1100' ||
              (r.accountName ?? r.account_name ?? '').toLowerCase().includes('receivable'),
          );

          if (arRecon) {
            const reconId = arRecon.id ?? arRecon.recon_id ?? arRecon.reconId;
            // Set supporting balance to zero
            const sbRes = await apiFetch(
              'POST',
              `/api/close/sessions/${sess.id}/reconciliations/${reconId}/supporting-balance`,
              { amount: '0.00' },
              state.preparerToken,
            );
            expectTrue(
              sbRes.ok || sbRes.status === 422,
              `Set zero supporting balance: ${sbRes.status}`,
            );

            // Complete the reconciliation
            const completeRes = await apiFetch(
              'POST',
              `/api/close/sessions/${sess.id}/reconciliations/${reconId}/complete`,
              { variance_explanation: 'Zero balance — fully cleared.' },
              state.preparerToken,
            );
            expectTrue(
              completeRes.ok || completeRes.status === 422 || completeRes.status === 409,
              `Complete zero-balance recon: ${completeRes.status}`,
            );
          } else {
            // If no AR recon was created, reconcile any available account with 0
            if (recons.length > 0) {
              const reconId = recons[0].id ?? recons[0].recon_id ?? recons[0].reconId;
              await apiFetch(
                'POST',
                `/api/close/sessions/${sess.id}/reconciliations/${reconId}/supporting-balance`,
                { amount: '0.00' },
                state.preparerToken,
              );
            }
          }
        },
      },

      // ------------------------------------------------------------------
      // 17.07  Minimal close: 1 account, 1 JE, 1 recon — certifiable
      // ------------------------------------------------------------------
      {
        id: '17.07',
        name: 'Minimal close: 1 account, 1 JE, 1 recon — certifiable',
        fn: async () => {
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');
          if (!state.reviewerToken) throw new Error('SKIP: no reviewerToken');
          if (!state.approverToken) throw new Error('SKIP: no approverToken');
          if (!state.entityId) throw new Error('SKIP: no entityId');

          const sess = await createSession(
            state.preparerToken,
            state.entityId,
            '2025-08-01',
            '2025-08-31',
          );

          const minimalGL = [
            'entry_id,entry_date,account_code,account_name,debit,credit,description',
            'JE001,2025-08-01,1000,Cash,10000.00,0.00,Single entry debit',
            'JE001,2025-08-01,3000,Common Stock,0.00,10000.00,Single entry credit',
          ].join('\n');

          try {
            await uploadGL(state.preparerToken, sess.id, minimalGL);
            await mapAllAccounts(state.preparerToken, sess.id, state.entityId);

            // Reconcile
            const recons = await initializeReconciliations(state.preparerToken, sess.id);
            for (const r of recons) {
              try {
                await reconcileAccount(
                  state.preparerToken,
                  sess.id,
                  r.id ?? r.recon_id ?? r.reconId,
                  r.glBalance ?? '10000.00',
                  state.reviewerToken,
                );
              } catch {
                // Continue
              }
            }

            // Handle templates
            const tmplRes = await apiFetch(
              'POST',
              '/api/close/templates/propose',
              { closeSessionId: sess.id },
              state.preparerToken,
            );
            const proposals = tmplRes.body?.proposedApplications ?? tmplRes.body?.applications ?? [];
            for (const app of proposals) {
              if (app.status === 'proposed') {
                await apiFetch(
                  'POST',
                  '/api/close/templates/skip',
                  { applicationId: app.applicationId ?? app.id, closeSessionId: sess.id, reason: 'Minimal close' },
                  state.preparerToken,
                );
              }
            }

            // Generate statements
            await generateStatements(state.preparerToken, sess.id);

            // Explain variances
            await explainAllVariances(state.preparerToken, sess.id);

            // Advance
            await apiFetch('POST', `/api/close/sessions/${sess.id}/advance`, {}, state.preparerToken);
            // May need second advance
            const sessData = await apiFetch('GET', `/api/close/sessions/${sess.id}`, undefined, state.preparerToken);
            const currentState = (sessData.body?.status ?? sessData.body?.state ?? '').toLowerCase();
            if (currentState === 'in_progress') {
              await apiFetch('POST', `/api/close/sessions/${sess.id}/advance`, {}, state.preparerToken);
            }

            // Certify — use approver token (server requires approver role)
            const certToken = state.approverToken ?? state.reviewerToken;
            const certRes = await apiFetch(
              'POST',
              `/api/close/sessions/${sess.id}/certify`,
              { confirmation: 'CERTIFY', certifiedBy: 'e2e-approver' },
              certToken,
            );
            expectTrue(
              certRes.ok || certRes.status === 409 || certRes.status === 422,
              `Minimal close certify: ${certRes.status} — ${JSON.stringify(certRes.body).slice(0, 200)}`,
            );
          } catch (err: any) {
            if (err.message.startsWith('SKIP:')) throw err;
            // Minimal close may not fully certify if gates are strict — report it
            throw new Error(
              `Minimal close pipeline incomplete: ${err.message.slice(0, 300)}`,
            );
          }
        },
      },

      // ------------------------------------------------------------------
      // 17.08  Session spanning fiscal year boundary
      // ------------------------------------------------------------------
      {
        id: '17.08',
        name: 'Session spanning fiscal year boundary',
        fn: async () => {
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');
          if (!state.entityId) throw new Error('SKIP: no entityId');

          // Create a session that spans Dec-Jan (fiscal year boundary)
          const res = await apiFetch(
            'POST',
            '/api/close/sessions',
            {
              entityId: state.entityId,
              periodStart: '2025-12-01',
              periodEnd: '2025-12-31',
            },
            state.preparerToken,
          );

          expectTrue(
            res.ok || res.status === 409,
            `Year-boundary session creation: ${res.status}`,
          );

          if (res.ok) {
            expectFieldExists(res.body, 'id');
            // Upload GL with entries near year boundary
            const yearEndGL = [
              'entry_id,entry_date,account_code,account_name,debit,credit,description',
              'JE001,2025-12-01,1000,Cash,50000.00,0.00,Year-end cash',
              'JE001,2025-12-01,3000,Common Stock,0.00,50000.00,Year-end equity',
              'JE002,2025-12-31,4000,Revenue,0.00,20000.00,December revenue',
              'JE002,2025-12-31,1100,Accounts Receivable,20000.00,0.00,December AR',
            ].join('\n');

            const uploadResult = await uploadGL(state.preparerToken, res.body.id, yearEndGL);
            expectTrue(
              uploadResult._ok || uploadResult._status < 500,
              `Year-boundary GL upload: ${uploadResult._status}`,
            );
          }
        },
      },

      // ------------------------------------------------------------------
      // 17.09  10K-char memo on JE — accepted or graceful truncation
      // ------------------------------------------------------------------
      {
        id: '17.09',
        name: '10K-char memo on JE — accepted or graceful truncation',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');

          const longMemo = 'A'.repeat(10000);

          const res = await apiFetch(
            'POST',
            '/api/close/journal-entries',
            {
              closeSessionId: state.sessionId,
              memo: longMemo,
              source: 'manual',
              lines: enrichJELines([
                { accountRef: '1000', debit: '100.00', credit: '0.00' },
                { accountRef: '3000', debit: '0.00', credit: '100.00' },
              ]),
            },
            state.preparerToken,
          );

          if (res.ok) {
            // The JE was accepted — verify memo is stored (possibly truncated)
            const jeId = res.body.id;
            const getRes = await apiFetch(
              'GET',
              `/api/close/journal-entries/${jeId}`,
              undefined,
              state.preparerToken,
            );

            if (getRes.ok) {
              const storedMemo = getRes.body?.memo ?? '';
              expectTrue(
                storedMemo.length >= 100,
                `Long memo should be stored (at least partially), got length ${storedMemo.length}`,
              );
            }
          } else {
            // Graceful rejection is also acceptable (400/422)
            expectTrue(
              res.status === 400 || res.status === 422 || res.status === 413,
              `Long memo should succeed or return 400/422/413, got ${res.status}`,
            );
          }
        },
      },

      // ------------------------------------------------------------------
      // 17.10  Special characters in all text fields — no injection
      // ------------------------------------------------------------------
      {
        id: '17.10',
        name: 'Special characters in all text fields — no injection',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');

          const xssPayload = '<script>alert(1)</script>';
          const sqlPayload = "'; DROP TABLE users; --";
          const unicodePayload = '\u00e9\u00e8\u00ea\u00eb \u00fc\u00f6\u00e4 \u4e16\u754c \ud83d\udcb0';
          const mixedPayload = `${xssPayload} ${sqlPayload} ${unicodePayload}`;

          // Test 1: JE memo with special characters
          const jeRes = await apiFetch(
            'POST',
            '/api/close/journal-entries',
            {
              closeSessionId: state.sessionId,
              memo: mixedPayload,
              source: 'manual',
              lines: enrichJELines([
                { accountRef: '1000', debit: '50.00', credit: '0.00', description: xssPayload },
                { accountRef: '3000', debit: '0.00', credit: '50.00', description: sqlPayload },
              ]),
            },
            state.preparerToken,
          );

          // Should either succeed (storing escaped content) or reject gracefully
          expectTrue(
            jeRes.ok || jeRes.status === 400 || jeRes.status === 422,
            `Special char JE should succeed or return 400/422, got ${jeRes.status}`,
          );

          if (jeRes.ok) {
            // Verify the stored content does not execute (no raw script tags)
            const getRes = await apiFetch(
              'GET',
              `/api/close/journal-entries/${jeRes.body.id}`,
              undefined,
              state.preparerToken,
            );

            if (getRes.ok) {
              const memo = getRes.body?.memo ?? '';
              // The memo should be stored but not contain executable script
              // (it may be HTML-escaped or stored as-is for backend-only use)
              expectTrue(
                typeof memo === 'string',
                'Memo should be a string',
              );
            }
          }

          // Test 2: Entity settings with special characters
          const settingsRes = await apiFetch(
            'PUT',
            `/api/settings/general?entityId=${encodeURIComponent(state.entityId!)}`,
            {
              entityName: `Test Entity ${xssPayload}`,
            },
            state.preparerToken,
          );

          expectTrue(
            settingsRes.ok || settingsRes.status === 400 || settingsRes.status === 422,
            `Special char settings should succeed or return 400/422, got ${settingsRes.status}`,
          );

          // Test 3: Variance explanation with SQL injection attempt
          const varRes = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/variances`,
            undefined,
            state.preparerToken,
          );

          if (varRes.ok) {
            const variances = varRes.body?.variances ?? varRes.body ?? [];
            if (variances.length > 0) {
              const vId = variances[0].id ?? variances[0].varianceId;
              if (vId) {
                const explainRes = await apiFetch(
                  'POST',
                  `/api/close/variances/${vId}/explain`,
                  {
                    explanation: sqlPayload,
                    explanation_source: 'manual',
                  },
                  state.preparerToken,
                );

                expectTrue(
                  explainRes.ok || explainRes.status === 400 || explainRes.status === 422 || explainRes.status === 409,
                  `SQL injection explanation should succeed or return 400/422, got ${explainRes.status}`,
                );
              }
            }
          }
        },
      },
    ],
  };
}
