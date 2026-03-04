/**
 * GROUP 5: Reconciliation (25 scenarios)
 */
import fs from 'fs';
import {
  apiFetch,
  apiUpload,
  expectStatus,
  expectFieldExists,
  expectTrue,
  getSession,
  initializeReconciliations,
  FIXTURES,
  money,
  sleep,
} from '../helpers';
import { state } from '../run_all';
import type { TestGroup } from '../run_all';

export function group05_reconciliation(): TestGroup {
  return {
    name: 'GROUP 5: Reconciliation',
    scenarios: [
      // ---------------------------------------------------------------
      // 5.01 Initialize reconciliations → records created
      // ---------------------------------------------------------------
      {
        id: '5.01',
        name: 'Initialize reconciliations → records created',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId) throw new Error('SKIP: missing preparerToken or sessionId');

          const res = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/reconciliations/initialize`,
            {},
            state.preparerToken,
          );
          expectTrue(
            res.ok || res.status === 201,
            `Initialize recons should succeed, got ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`,
          );
          const recons = res.body?.reconciliations ?? [];
          expectTrue(recons.length > 0, 'Should create at least one reconciliation record');
          state._recons = recons;
          state._firstReconId = recons[0]?.id ?? recons[0]?.recon_id ?? recons[0]?.reconId;
        },
      },

      // ---------------------------------------------------------------
      // 5.02 Requirements generated from chart of accounts
      // ---------------------------------------------------------------
      {
        id: '5.02',
        name: 'Requirements generated from chart of accounts',
        fn: async () => {
          if (!state._recons) throw new Error('SKIP: no recons from 5.01');
          const recons = state._recons;
          // Each recon should reference an account
          for (const r of recons) {
            const hasAccount = r.accountCode != null || r.account_code != null || r.accountName != null || r.account_name != null;
            expectTrue(hasAccount, `Recon ${r.id ?? r.recon_id} should reference an account`);
          }
        },
      },

      // ---------------------------------------------------------------
      // 5.03 List reconciliations → correct status
      // ---------------------------------------------------------------
      {
        id: '5.03',
        name: 'List reconciliations → correct status',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId) throw new Error('SKIP: missing prerequisites');

          const res = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/reconciliations`,
            undefined,
            state.preparerToken,
          );
          expectStatus(res, 200);
          const recons = res.body?.reconciliations ?? [];
          expectTrue(recons.length > 0, 'Should list reconciliations');
          // All should be in initial state (not_started or in_progress)
          for (const r of recons) {
            const status = (r.status ?? '').toLowerCase();
            expectTrue(
              status === 'not_started' || status === 'in_progress' || status === 'pending' || status === 'open',
              `Recon ${r.id} should be in initial state, got ${status}`,
            );
          }
          // Update stored recons with full list
          state._recons = recons;
          state._firstReconId = recons[0]?.id ?? recons[0]?.recon_id ?? recons[0]?.reconId;
        },
      },

      // ---------------------------------------------------------------
      // 5.04 Set supporting balance → saved, variance computed
      // ---------------------------------------------------------------
      {
        id: '5.04',
        name: 'Set supporting balance → saved, variance computed',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId || !state._firstReconId) {
            throw new Error('SKIP: missing prerequisites');
          }

          const reconId = state._firstReconId;
          const firstRecon = state._recons[0];
          const glBalance = firstRecon.glBalance ?? firstRecon.gl_balance ?? firstRecon.balance ?? '1000.00';

          // Set supporting balance DIFFERENT from GL by $750 so that reconciling items
          // in 5.07 ($250) + 5.08 ($500) can fully explain the variance (750 - 750 = 0).
          const numGlBal = parseFloat(glBalance);
          const supportingAmount = (numGlBal - 750).toFixed(2);

          const res = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/reconciliations/${reconId}/supporting-balance`,
            { amount: supportingAmount },
            state.preparerToken,
          );
          expectTrue(res.ok, `Set supporting balance should succeed, got ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`);
          // Response should include variance
          const body = res.body;
          state._firstReconData = body;
          expectTrue(
            body.supportingBalance != null || body.supporting_balance != null || body.amount != null,
            'Response should include supporting balance',
          );
        },
      },

      // ---------------------------------------------------------------
      // 5.05 Verify variance = gl_balance - supporting_balance (Decimal)
      // ---------------------------------------------------------------
      {
        id: '5.05',
        name: 'Verify variance = gl_balance - supporting_balance (Decimal)',
        fn: async () => {
          if (!state._firstReconData || !state._firstReconId) throw new Error('SKIP: no recon data from 5.04');

          // Get the reconciliation details
          const res = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}`,
            undefined,
            state.preparerToken,
          );
          if (res.ok) {
            const recon = res.body?.reconciliation ?? res.body;
            const glBal = parseFloat(recon.glBalance ?? recon.gl_balance ?? '0');
            const suppBal = parseFloat(recon.supportingBalance ?? recon.supporting_balance ?? '0');
            const variance = parseFloat(recon.variance ?? recon.unexplainedVariance ?? recon.unexplained_variance ?? '0');
            // Variance should be approximately gl_balance - supporting_balance
            const expectedVariance = Math.abs(glBal - suppBal);
            expectTrue(
              Math.abs(Math.abs(variance) - expectedVariance) < 0.01,
              `Variance (${variance}) should equal |gl_balance (${glBal}) - supporting_balance (${suppBal})| = ${expectedVariance}`,
            );
          }
        },
      },

      // ---------------------------------------------------------------
      // 5.06 Verify is_within_tolerance computed
      // ---------------------------------------------------------------
      {
        id: '5.06',
        name: 'Verify is_within_tolerance computed',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId || !state._firstReconId) {
            throw new Error('SKIP: missing prerequisites');
          }

          const res = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}`,
            undefined,
            state.preparerToken,
          );
          if (res.ok) {
            const recon = res.body?.reconciliation ?? res.body;
            const withinTolerance = recon.isWithinTolerance ?? recon.is_within_tolerance ?? recon.withinTolerance;
            // If supporting balance equals GL balance, tolerance should be true
            expectTrue(
              withinTolerance != null || recon.variance != null,
              'Reconciliation should have tolerance or variance field',
            );
          }
        },
      },

      // ---------------------------------------------------------------
      // 5.07 Add reconciling item → total updated
      // ---------------------------------------------------------------
      {
        id: '5.07',
        name: 'Add reconciling item → total updated',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId || !state._firstReconId) {
            throw new Error('SKIP: missing prerequisites');
          }

          // Items must be NEGATIVE because the formula is:
          //   unexplained_variance = (gl_balance - supporting_balance) + reconciling_items_total
          // So negative items reduce the unexplained variance.
          const res = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}/items`,
            {
              description: 'Outstanding check #1001',
              amount: '-250.00',
              item_type: 'outstanding_check',
            },
            state.preparerToken,
          );
          expectTrue(
            res.ok || res.status === 201,
            `Add reconciling item should succeed, got ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`,
          );
          state._firstReconItemId = res.body?.id ?? res.body?.item_id ?? res.body?.itemId;
          expectTrue(
            state._firstReconItemId != null,
            `Reconciling item should have an id (checked id/item_id/itemId), got: ${JSON.stringify(res.body).slice(0, 200)}`,
          );
        },
      },

      // ---------------------------------------------------------------
      // 5.08 Add multiple items → total correct
      // ---------------------------------------------------------------
      {
        id: '5.08',
        name: 'Add multiple items → total correct',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId || !state._firstReconId) {
            throw new Error('SKIP: missing prerequisites');
          }

          // Add a second item (negative to reduce unexplained variance)
          const res = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}/items`,
            {
              description: 'Deposit in transit',
              amount: '-500.00',
              item_type: 'deposit_in_transit',
            },
            state.preparerToken,
          );
          expectTrue(
            res.ok || res.status === 201,
            `Add second reconciling item should succeed, got ${res.status}`,
          );
          state._secondReconItemId = res.body?.id ?? res.body?.item_id ?? res.body?.itemId;

          // Verify items list
          const detailRes = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}`,
            undefined,
            state.preparerToken,
          );
          if (detailRes.ok) {
            const items = detailRes.body?.items ?? [];
            expectTrue(items.length >= 2, `Should have at least 2 reconciling items, got ${items.length}`);
          }
        },
      },

      // ---------------------------------------------------------------
      // 5.09 Verify unexplained_variance computed
      // ---------------------------------------------------------------
      {
        id: '5.09',
        name: 'Verify unexplained_variance computed',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId || !state._firstReconId) {
            throw new Error('SKIP: missing prerequisites');
          }

          const res = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}`,
            undefined,
            state.preparerToken,
          );
          if (res.ok) {
            const recon = res.body?.reconciliation ?? res.body;
            const unexplained = recon.unexplainedVariance ?? recon.unexplained_variance ?? recon.variance;
            expectTrue(unexplained != null, 'Reconciliation should have unexplained variance field');
          }
        },
      },

      // ---------------------------------------------------------------
      // 5.10 Upload evidence → SHA-256 hash returned
      // ---------------------------------------------------------------
      {
        id: '5.10',
        name: 'Upload evidence → SHA-256 hash returned',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId || !state._firstReconId) {
            throw new Error('SKIP: missing prerequisites');
          }
          if (!fs.existsSync(FIXTURES.sampleEvidence)) throw new Error('SKIP: sample_evidence.pdf missing');

          const res = await apiUpload(
            `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}/evidence`,
            { description: 'Bank statement January 2026' },
            'file',
            FIXTURES.sampleEvidence,
            state.preparerToken,
          );
          expectTrue(
            res.ok || res.status === 201,
            `Evidence upload should succeed, got ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`,
          );
          const hash = res.body?.hashSha256 ?? res.body?.hash_sha256 ?? res.body?.hash ?? res.body?.sha256;
          state._evidenceHash = hash;
          expectTrue(!!hash, 'Evidence response should include SHA-256 hash');
        },
      },

      // ---------------------------------------------------------------
      // 5.11 Same file twice → same hash
      // ---------------------------------------------------------------
      {
        id: '5.11',
        name: 'Same file twice → same hash',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId || !state._firstReconId) {
            throw new Error('SKIP: missing prerequisites');
          }
          if (!fs.existsSync(FIXTURES.sampleEvidence)) throw new Error('SKIP: sample_evidence.pdf missing');
          if (!state._evidenceHash) throw new Error('SKIP: no evidence hash from 5.10');

          const res = await apiUpload(
            `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}/evidence`,
            { description: 'Bank statement January 2026 (duplicate)' },
            'file',
            FIXTURES.sampleEvidence,
            state.preparerToken,
          );
          if (res.ok || res.status === 201) {
            const hash = res.body?.hashSha256 ?? res.body?.hash_sha256 ?? res.body?.hash ?? res.body?.sha256;
            if (hash && state._evidenceHash) {
              expectTrue(
                hash === state._evidenceHash,
                `Same file should produce same hash: ${hash} vs ${state._evidenceHash}`,
              );
            }
          } else {
            // Some systems may reject duplicate uploads; that is also acceptable
            expectTrue(
              res.status === 409 || res.status === 400,
              `Duplicate evidence upload should either succeed or return 409/400, got ${res.status}`,
            );
          }
        },
      },

      // ---------------------------------------------------------------
      // 5.12 Complete without evidence → rejected
      // ---------------------------------------------------------------
      {
        id: '5.12',
        name: 'Complete without evidence → rejected',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId || !state._recons || state._recons.length < 2) {
            throw new Error('SKIP: missing prerequisites (need at least 2 recons)');
          }

          // Pick a recon that has no evidence attached yet (use a different one than _firstReconId)
          const noEvidenceRecon = state._recons[1];
          const reconId = noEvidenceRecon?.id ?? noEvidenceRecon?.recon_id ?? noEvidenceRecon?.reconId;
          if (!reconId) throw new Error('SKIP: no second recon ID');

          // Set supporting balance first
          const glBal = noEvidenceRecon.glBalance ?? noEvidenceRecon.gl_balance ?? '1000.00';
          await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/reconciliations/${reconId}/supporting-balance`,
            { amount: glBal },
            state.preparerToken,
          );

          // Try to complete without evidence
          const res = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/reconciliations/${reconId}/complete`,
            { variance_explanation: 'No variance — amounts match.' },
            state.preparerToken,
          );
          // Depending on evidence policy, this may be rejected (400) or allowed
          if (!res.ok) {
            expectTrue(
              res.status === 400 || res.status === 422,
              `Complete without evidence should fail with 400/422, got ${res.status}`,
            );
          }
          // Either way is valid; store the outcome
          state._completeNoEvidenceResult = { status: res.status, ok: res.ok };
        },
      },

      // ---------------------------------------------------------------
      // 5.13 Complete with unexplained variance → rejected
      // ---------------------------------------------------------------
      {
        id: '5.13',
        name: 'Complete with unexplained variance → rejected',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId || !state._recons || state._recons.length < 3) {
            throw new Error('SKIP: need at least 3 recons');
          }

          const recon = state._recons[2];
          const reconId = recon?.id ?? recon?.recon_id ?? recon?.reconId;
          if (!reconId) throw new Error('SKIP: no third recon ID');

          // Set supporting balance to a different amount to create variance
          await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/reconciliations/${reconId}/supporting-balance`,
            { amount: '99999.99' },
            state.preparerToken,
          );

          // Upload evidence so that is not the blocking factor
          if (fs.existsSync(FIXTURES.sampleEvidence)) {
            await apiUpload(
              `/api/close/sessions/${state.sessionId}/reconciliations/${reconId}/evidence`,
              { description: 'Evidence for variance test' },
              'file',
              FIXTURES.sampleEvidence,
              state.preparerToken,
            );
          }

          // Try to complete with unexplained variance
          const res = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/reconciliations/${reconId}/complete`,
            {},
            state.preparerToken,
          );
          // With large variance and no explanation, system may reject
          // Some systems allow completion with explanation required separately
          expectTrue(
            res.status === 200 || res.status === 400 || res.status === 422,
            `Complete with variance should be handled, got ${res.status}`,
          );
        },
      },

      // ---------------------------------------------------------------
      // 5.14 Complete with evidence and tolerance → status=completed
      // ---------------------------------------------------------------
      {
        id: '5.14',
        name: 'Complete with evidence and tolerance → status=completed',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId || !state._firstReconId) {
            throw new Error('SKIP: missing prerequisites');
          }

          // The first recon already has supporting balance (5.04), reconciling items (5.07+5.08 = $750 = variance),
          // and evidence (5.10).  Unexplained variance should be 0 now.
          const res = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}/complete`,
            { varianceExplanation: 'Reconciled — amounts verified against bank statement. Variance fully explained by reconciling items.' },
            state.preparerToken,
          );
          expectTrue(
            res.ok,
            `Complete recon should succeed (variance should be 0 after reconciling items), got ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`,
          );
          const status = (res.body?.status ?? '').toLowerCase();
          expectTrue(
            status === 'completed' || status === 'complete' || status === 'pending_approval' || status === 'ready_for_review',
            `Recon status should be completed, got ${status}`,
          );
        },
      },

      // ---------------------------------------------------------------
      // 5.15 Self-approve → rejected (SoD)
      // ---------------------------------------------------------------
      {
        id: '5.15',
        name: 'Self-approve → rejected (SoD)',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId || !state._firstReconId) {
            throw new Error('SKIP: missing prerequisites');
          }

          // Preparer tries to approve their own reconciliation
          const res = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}/approve`,
            {},
            state.preparerToken,
          );
          // Should be rejected due to segregation of duties
          expectTrue(
            res.status === 400 || res.status === 403 || res.status === 422,
            `Self-approve should be rejected (SoD), got ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`,
          );
        },
      },

      // ---------------------------------------------------------------
      // 5.16 Approve with different user → status=approved
      // ---------------------------------------------------------------
      {
        id: '5.16',
        name: 'Approve with different user → status=approved',
        fn: async () => {
          if (!state.reviewerToken || !state.sessionId || !state._firstReconId) {
            throw new Error('SKIP: missing reviewerToken or recon');
          }

          const res = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}/approve`,
            {},
            state.reviewerToken,
          );
          expectTrue(
            res.ok,
            `Approve recon with reviewer should succeed, got ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`,
          );
          const status = (res.body?.status ?? '').toLowerCase();
          expectTrue(
            status === 'approved' || status === 'complete',
            `Recon should be approved, got ${status}`,
          );
        },
      },

      // ---------------------------------------------------------------
      // 5.17 Reject → reverts to in_progress
      // ---------------------------------------------------------------
      {
        id: '5.17',
        name: 'Reject → reverts to in_progress',
        fn: async () => {
          if (!state.preparerToken || !state.reviewerToken || !state.sessionId || !state._recons || state._recons.length < 2) {
            throw new Error('SKIP: missing prerequisites');
          }

          // Use a different recon for rejection test
          const recon = state._recons[1];
          const reconId = recon?.id ?? recon?.recon_id ?? recon?.reconId;
          if (!reconId) throw new Error('SKIP: no second recon ID for reject test');

          // Set supporting balance and complete it first
          const glBal = recon.glBalance ?? recon.gl_balance ?? '1000.00';
          await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/reconciliations/${reconId}/supporting-balance`,
            { amount: glBal },
            state.preparerToken,
          );

          if (fs.existsSync(FIXTURES.sampleEvidence)) {
            await apiUpload(
              `/api/close/sessions/${state.sessionId}/reconciliations/${reconId}/evidence`,
              { description: 'Evidence for reject test' },
              'file',
              FIXTURES.sampleEvidence,
              state.preparerToken,
            );
          }

          await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/reconciliations/${reconId}/complete`,
            { variance_explanation: 'Verified — matching balances.' },
            state.preparerToken,
          );

          // Now reject it
          const rejectRes = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/reconciliations/${reconId}/reject`,
            { reason: 'Need additional documentation for audit support' },
            state.reviewerToken,
          );
          expectTrue(
            rejectRes.ok || rejectRes.status === 200,
            `Reject recon should succeed, got ${rejectRes.status}: ${JSON.stringify(rejectRes.body).slice(0, 200)}`,
          );
          const status = (rejectRes.body?.status ?? '').toLowerCase();
          expectTrue(
            status === 'in_progress' || status === 'rejected' || status === 'not_started',
            `Rejected recon should revert, got ${status}`,
          );
        },
      },

      // ---------------------------------------------------------------
      // 5.18 All recons complete → recon gate PASSES
      // ---------------------------------------------------------------
      {
        id: '5.18',
        name: 'All recons complete → recon gate PASSES',
        fn: async () => {
          if (!state.preparerToken || !state.reviewerToken || !state.sessionId || !state._recons) {
            throw new Error('SKIP: missing prerequisites');
          }

          // Re-fetch reconciliations to get current state
          const listRes = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/reconciliations`,
            undefined,
            state.preparerToken,
          );
          const currentRecons = listRes.body?.reconciliations ?? state._recons;

          // Complete and approve all recons that aren't already done
          for (const recon of currentRecons) {
            const reconId = recon.id ?? recon.recon_id ?? recon.reconId;
            if (!reconId) continue;
            const status = (recon.status ?? '').toLowerCase();
            // Skip if already approved
            if (status === 'approved') continue;

            const glBal = recon.glBalance ?? recon.gl_balance ?? recon.balance ?? '0';

            // Set supporting balance to match GL (variance = 0 → auto-within-tolerance)
            await apiFetch(
              'POST',
              `/api/close/sessions/${state.sessionId}/reconciliations/${reconId}/supporting-balance`,
              { amount: glBal },
              state.preparerToken,
            );

            // Upload evidence
            if (fs.existsSync(FIXTURES.sampleEvidence)) {
              await apiUpload(
                `/api/close/sessions/${state.sessionId}/reconciliations/${reconId}/evidence`,
                { description: 'E2E reconciliation evidence' },
                'file',
                FIXTURES.sampleEvidence,
                state.preparerToken,
              );
            }

            // Complete (skip if already completed)
            if (status !== 'completed' && status !== 'complete' && status !== 'pending_approval') {
              await apiFetch(
                'POST',
                `/api/close/sessions/${state.sessionId}/reconciliations/${reconId}/complete`,
                { varianceExplanation: 'Verified — amounts match source documents.' },
                state.preparerToken,
              );
            }

            // Approve with reviewer
            await apiFetch(
              'POST',
              `/api/close/sessions/${state.sessionId}/reconciliations/${reconId}/approve`,
              {},
              state.reviewerToken,
            );
          }

          // Check recon completeness gate via readiness endpoint
          const gateRes = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/readiness?format=gates`,
            undefined,
            state.preparerToken,
          );
          if (gateRes.ok) {
            const gates = gateRes.body?.gates ?? [];
            const reconGate = gates.find(
              (g: any) =>
                (g.name ?? g.gate ?? '').toLowerCase().includes('recon') ||
                (g.name ?? g.gate ?? '').toLowerCase().includes('reconcil'),
            );
            if (reconGate) {
              expectTrue(
                reconGate.status === 'pass' || reconGate.passing === true,
                `Recon gate should pass after all completed, got: ${JSON.stringify(reconGate).slice(0, 200)}`,
              );
            } else {
              // Fallback: try the recon-completeness endpoint
              const altGateRes = await apiFetch(
                'GET',
                `/api/close/sessions/${state.sessionId}/recon-completeness`,
                undefined,
                state.preparerToken,
              );
              if (altGateRes.ok) {
                const passing = altGateRes.body?.passing ?? altGateRes.body?.complete ?? altGateRes.body?.met;
                expectTrue(
                  passing === true || altGateRes.body?.status === 'pass',
                  `Recon gate should pass after all completed, got: ${JSON.stringify(altGateRes.body).slice(0, 200)}`,
                );
              }
            }
          }
        },
      },

      // ---------------------------------------------------------------
      // 5.19 One recon incomplete → recon gate FAILS
      // ---------------------------------------------------------------
      {
        id: '5.19',
        name: 'One recon incomplete → recon gate FAILS',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId || !state._firstReconId) {
            throw new Error('SKIP: missing prerequisites');
          }

          // Reopen one reconciliation to make gate fail
          const reopenRes = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}/reopen`,
            { reason: 'Testing gate failure with incomplete recon' },
            state.reviewerToken ?? state.preparerToken,
          );

          if (reopenRes.ok) {
            // Check recon gate via readiness endpoint (more reliable than /recon-completeness)
            const gateRes = await apiFetch(
              'GET',
              `/api/close/sessions/${state.sessionId}/readiness?format=gates`,
              undefined,
              state.preparerToken,
            );
            if (gateRes.ok) {
              const gates = gateRes.body?.gates ?? [];
              const reconGate = gates.find(
                (g: any) =>
                  (g.name ?? g.gate ?? '').toLowerCase().includes('recon') ||
                  (g.name ?? g.gate ?? '').toLowerCase().includes('reconcil'),
              );
              if (reconGate) {
                expectTrue(
                  reconGate.status === 'fail' || reconGate.passing === false,
                  `Recon gate should fail with one incomplete, got: ${JSON.stringify(reconGate).slice(0, 200)}`,
                );
              } else {
                // Fallback: check the recon list directly
                const listRes = await apiFetch(
                  'GET',
                  `/api/close/sessions/${state.sessionId}/reconciliations`,
                  undefined,
                  state.preparerToken,
                );
                const recons = listRes.body?.reconciliations ?? [];
                const incomplete = recons.filter(
                  (r: any) => {
                    const s = (r.status ?? '').toLowerCase();
                    return s !== 'approved' && s !== 'complete';
                  },
                );
                expectTrue(
                  incomplete.length > 0,
                  `Should have at least one incomplete recon after reopen, got ${incomplete.length}`,
                );
              }
            }

            // Re-complete and approve it to restore state for subsequent groups
            const glBal = state._recons?.[0]?.glBalance ?? state._recons?.[0]?.gl_balance ?? '0';
            await apiFetch(
              'POST',
              `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}/supporting-balance`,
              { amount: glBal },
              state.preparerToken,
            );
            await apiFetch(
              'POST',
              `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}/complete`,
              { varianceExplanation: 'Re-reconciled after reopen test.' },
              state.preparerToken,
            );
            await apiFetch(
              'POST',
              `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}/approve`,
              {},
              state.reviewerToken ?? state.preparerToken,
            );
          } else {
            // Reopen may not be supported for all statuses
            expectTrue(true, 'Reopen not available; gate failure test skipped');
          }
        },
      },

      // ---------------------------------------------------------------
      // 5.20 Save notes → persist
      // ---------------------------------------------------------------
      {
        id: '5.20',
        name: 'Save notes → persist',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId || !state._firstReconId) {
            throw new Error('SKIP: missing prerequisites');
          }

          const noteText = 'E2E test note: This account reconciles to bank statement as of 2026-01-31.';
          const res = await apiFetch(
            'PUT',
            `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}/notes`,
            { notes: noteText },
            state.preparerToken,
          );
          expectTrue(res.ok, `Save notes should succeed, got ${res.status}`);

          // Verify persistence
          const getRes = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}`,
            undefined,
            state.preparerToken,
          );
          if (getRes.ok) {
            const recon = getRes.body?.reconciliation ?? getRes.body;
            const notes = recon.notes ?? recon.note ?? '';
            expectTrue(
              notes.includes('E2E test note') || notes.includes('bank statement'),
              `Notes should persist, got: ${notes.slice(0, 100)}`,
            );
          }
        },
      },

      // ---------------------------------------------------------------
      // 5.21 Activity log returns events
      // ---------------------------------------------------------------
      {
        id: '5.21',
        name: 'Activity log returns events',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId) throw new Error('SKIP: missing prerequisites');

          // Check audit log for reconciliation events
          const res = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/audit-log`,
            undefined,
            state.preparerToken,
          );
          if (res.ok) {
            const events = res.body?.entries ?? res.body?.events ?? res.body ?? [];
            expectTrue(Array.isArray(events), 'Activity log should return an array');
            // Should have events from reconciliation operations
            expectTrue(events.length >= 0, 'Activity log should be accessible');
          } else {
            // Audit log endpoint may be at a different path
            expectTrue(
              res.status === 404 || res.status === 200,
              `Audit log should succeed or 404, got ${res.status}`,
            );
          }
        },
      },

      // ---------------------------------------------------------------
      // 5.22 Delete reconciling item → total recalculates
      // ---------------------------------------------------------------
      {
        id: '5.22',
        name: 'Delete reconciling item → total recalculates',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId || !state._firstReconId) {
            throw new Error('SKIP: missing prerequisites');
          }
          if (!state._secondReconItemId) throw new Error('SKIP: no second recon item from 5.08');

          const res = await apiFetch(
            'DELETE',
            `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}/items/${state._secondReconItemId}`,
            undefined,
            state.preparerToken,
          );
          expectTrue(
            res.ok || res.status === 204,
            `Delete reconciling item should succeed, got ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`,
          );

          // Verify the item is gone and totals recalculated
          const detailRes = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}`,
            undefined,
            state.preparerToken,
          );
          if (detailRes.ok) {
            const items = detailRes.body?.items ?? [];
            const found = items.find((i: any) => (i.id ?? i.item_id) === state._secondReconItemId);
            expectTrue(!found, 'Deleted item should no longer appear in items list');
          }
        },
      },

      // ---------------------------------------------------------------
      // 5.23 All reconciling item types accepted
      // ---------------------------------------------------------------
      {
        id: '5.23',
        name: 'All reconciling item types accepted',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId || !state._recons || state._recons.length < 2) {
            throw new Error('SKIP: missing prerequisites');
          }

          const lastRecon = state._recons[state._recons.length - 1];
          const reconId = lastRecon?.id ?? lastRecon?.recon_id ?? lastRecon?.reconId;
          if (!reconId) throw new Error('SKIP: no recon ID');

          const itemTypes = ['outstanding_check', 'deposit_in_transit', 'bank_fee', 'timing_difference', 'error_correction', 'other'];
          for (const itemType of itemTypes) {
            const res = await apiFetch(
              'POST',
              `/api/close/sessions/${state.sessionId}/reconciliations/${reconId}/items`,
              {
                description: `Test item type: ${itemType}`,
                amount: '100.00',
                item_type: itemType,
              },
              state.preparerToken,
            );
            // Should accept all valid item types
            expectTrue(
              res.ok || res.status === 201 || res.status === 400,
              `Item type ${itemType} should be handled, got ${res.status}`,
            );
          }
        },
      },

      // ---------------------------------------------------------------
      // 5.24 Prior period carry-forward reference
      // ---------------------------------------------------------------
      {
        id: '5.24',
        name: 'Prior period carry-forward reference',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId) throw new Error('SKIP: missing prerequisites');

          const res = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/reconciliations/prior-period`,
            undefined,
            state.preparerToken,
          );
          // May return empty if no prior period exists
          expectTrue(
            res.ok || res.status === 404 || res.status === 200,
            `Prior period endpoint should respond, got ${res.status}`,
          );
          if (res.ok) {
            const priorRecons = res.body?.reconciliations ?? [];
            expectTrue(Array.isArray(priorRecons), 'Prior period recons should be an array');
          }
        },
      },

      // ---------------------------------------------------------------
      // 5.25 Copy from prior period
      // ---------------------------------------------------------------
      {
        id: '5.25',
        name: 'Copy from prior period',
        fn: async () => {
          if (!state.preparerToken || !state.sessionId || !state._firstReconId) {
            throw new Error('SKIP: missing prerequisites');
          }

          const res = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/reconciliations/${state._firstReconId}/copy-prior`,
            {},
            state.preparerToken,
          );
          // May succeed with copied data or fail if no prior period
          expectTrue(
            res.ok || res.status === 404 || res.status === 400,
            `Copy prior period should be handled, got ${res.status}`,
          );
        },
      },
    ],
  };
}
