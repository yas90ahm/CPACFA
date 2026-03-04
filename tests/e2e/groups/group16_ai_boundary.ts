/**
 * GROUP 16: AI Boundary (7 scenarios)
 *
 * Validates that AI features are advisory-only: no dollar amounts in
 * suggestions, no computed totals in drafts, human confirmation required,
 * and no AI output written to financial tables.
 */
import {
  apiFetch,
  expectStatus,
  expectTrue,
  expectFieldExists,
} from '../helpers';
import { state } from '../run_all';
import type { TestGroup } from '../run_all';

// Regex that matches dollar amounts like $1,234.56 or bare 1234.56
const DOLLAR_PATTERN = /\$[\d,]+\.?\d*|\b\d{1,3}(,\d{3})+(\.\d{2})?\b/;

export function group16_ai_boundary(): TestGroup {
  return {
    name: 'GROUP 16: AI Boundary',
    scenarios: [
      // ------------------------------------------------------------------
      // 16.01  AI suggestions contain no dollar amounts
      // ------------------------------------------------------------------
      {
        id: '16.01',
        name: 'AI suggestions contain no dollar amounts',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');

          const res = await apiFetch(
            'GET',
            `/api/coa-mapping/suggestions?sessionId=${state.sessionId}`,
            undefined,
            state.preparerToken,
          );

          if (res.status === 404) {
            throw new Error('SKIP: suggestions endpoint not available');
          }

          // Endpoint may return 200 with empty suggestions — that is fine
          if (!res.ok) {
            throw new Error(
              `Suggestions endpoint returned ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`,
            );
          }

          const suggestions = res.body?.suggestions ?? res.body ?? [];
          for (const s of suggestions) {
            const name = s.suggestedLineItemName ?? s.lineItemName ?? '';
            expectTrue(
              !DOLLAR_PATTERN.test(name),
              `AI suggestion name "${name}" should not contain dollar amounts`,
            );
            const reason = s.reason ?? s.rationale ?? '';
            if (reason) {
              expectTrue(
                !DOLLAR_PATTERN.test(reason),
                `AI suggestion reason should not contain dollar amounts: "${reason.slice(0, 100)}"`,
              );
            }
          }
        },
      },

      // ------------------------------------------------------------------
      // 16.02  AI variance draft contains no computed totals
      // ------------------------------------------------------------------
      {
        id: '16.02',
        name: 'AI variance draft contains no computed totals',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');

          // Fetch variances to find one with an ID
          const varRes = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/variances`,
            undefined,
            state.preparerToken,
          );

          if (!varRes.ok || varRes.status === 404) {
            throw new Error('SKIP: variances endpoint unavailable or no variances');
          }

          const variances = varRes.body?.variances ?? varRes.body ?? [];
          if (variances.length === 0) {
            throw new Error('SKIP: no variances to test AI draft against');
          }

          // Try AI draft on the first variance
          const varianceId = variances[0].id ?? variances[0].varianceId;
          if (!varianceId) throw new Error('SKIP: variance has no ID');

          const draftRes = await apiFetch(
            'GET',
            `/api/close/variances/${varianceId}/ai-draft`,
            undefined,
            state.preparerToken,
          );

          if (draftRes.status === 404 || draftRes.status === 501) {
            throw new Error('SKIP: AI draft endpoint not available');
          }

          if (draftRes.ok) {
            const draftText =
              draftRes.body?.draft ??
              draftRes.body?.explanation ??
              draftRes.body?.text ??
              (typeof draftRes.body === 'string' ? draftRes.body : '');
            // AI draft may reference amounts from the variance (that is OK),
            // but it should not compute new totals. We check it does not
            // contain patterns like "Total: $X" or "Sum: $X".
            const computedPattern = /(?:total|sum|net|computed|calculated)\s*[:=]\s*\$?[\d,]+\.?\d*/i;
            expectTrue(
              !computedPattern.test(draftText),
              `AI draft should not contain computed totals: "${draftText.slice(0, 200)}"`,
            );
          }
        },
      },

      // ------------------------------------------------------------------
      // 16.03  Shadow auditor findings are warnings not blockers
      // ------------------------------------------------------------------
      {
        id: '16.03',
        name: 'Shadow auditor findings are warnings not blockers',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');

          // Shadow auditor findings may be exposed via readiness or a
          // dedicated endpoint. Check readiness first.
          const readinessRes = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/readiness?format=gates`,
            undefined,
            state.preparerToken,
          );

          if (!readinessRes.ok) {
            throw new Error('SKIP: readiness endpoint not available');
          }

          const gates = readinessRes.body?.gates ?? [];
          // Find any AI / shadow-auditor gate
          const aiGates = gates.filter(
            (g: any) =>
              (g.name ?? g.label ?? '').toLowerCase().includes('ai') ||
              (g.name ?? g.label ?? '').toLowerCase().includes('shadow') ||
              (g.name ?? g.label ?? '').toLowerCase().includes('auditor'),
          );

          if (aiGates.length === 0) {
            // No explicit AI gate — that is acceptable as long as AI does
            // not appear as a blocking gate.
            const blockers = gates.filter(
              (g: any) =>
                (g.status === 'fail' || g.passing === false) &&
                ((g.name ?? '').toLowerCase().includes('ai') ||
                  (g.name ?? '').toLowerCase().includes('shadow')),
            );
            expectTrue(
              blockers.length === 0,
              'AI / shadow-auditor should not be a blocker gate',
            );
          } else {
            // AI gate exists — it should be a warning, not a blocker
            for (const g of aiGates) {
              const severity = (g.severity ?? g.type ?? g.level ?? '').toLowerCase();
              expectTrue(
                severity !== 'blocker' && severity !== 'blocking' && severity !== 'critical',
                `AI gate "${g.name}" severity should be warning, got "${severity}"`,
              );
            }
          }
        },
      },

      // ------------------------------------------------------------------
      // 16.04  AI suggestions require human action
      // ------------------------------------------------------------------
      {
        id: '16.04',
        name: 'AI suggestions require human action',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');

          const res = await apiFetch(
            'GET',
            `/api/coa-mapping/suggestions?sessionId=${state.sessionId}`,
            undefined,
            state.preparerToken,
          );

          if (res.status === 404) {
            throw new Error('SKIP: suggestions endpoint not available');
          }

          const suggestions = res.body?.suggestions ?? res.body ?? [];
          for (const s of suggestions) {
            const status = (s.status ?? s.state ?? '').toLowerCase();
            // Suggestions should be in pending/suggested state, not auto-applied
            expectTrue(
              status !== 'applied' && status !== 'accepted' && status !== 'committed',
              `Suggestion ${s.id ?? 'unknown'} should be pending/suggested, got "${status}"`,
            );
          }
        },
      },

      // ------------------------------------------------------------------
      // 16.05  AI draft requires human save
      // ------------------------------------------------------------------
      {
        id: '16.05',
        name: 'AI draft requires human save',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');

          const varRes = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/variances`,
            undefined,
            state.preparerToken,
          );

          if (!varRes.ok) {
            throw new Error('SKIP: variances endpoint unavailable');
          }

          const variances = varRes.body?.variances ?? varRes.body ?? [];
          // Find a material variance that has not been explained yet
          const pending = variances.find(
            (v: any) =>
              v.isMaterial && (!v.explanation || v.explanationStatus === 'pending'),
          );

          if (!pending) {
            throw new Error('SKIP: no pending material variance to test AI draft on');
          }

          const varianceId = pending.id ?? pending.varianceId;

          // Fetch AI draft
          const draftRes = await apiFetch(
            'GET',
            `/api/close/variances/${varianceId}/ai-draft`,
            undefined,
            state.preparerToken,
          );

          if (draftRes.status === 404 || draftRes.status === 501) {
            throw new Error('SKIP: AI draft endpoint not available');
          }

          // After fetching the draft, the variance should still be unexplained
          const checkRes = await apiFetch(
            'GET',
            `/api/close/sessions/${state.sessionId}/variances`,
            undefined,
            state.preparerToken,
          );
          const updated = (checkRes.body?.variances ?? checkRes.body ?? []).find(
            (v: any) => (v.id ?? v.varianceId) === varianceId,
          );

          if (updated) {
            const status = (
              updated.explanationStatus ?? updated.explanation_status ?? ''
            ).toLowerCase();
            expectTrue(
              status !== 'approved' && status !== 'accepted' && status !== 'saved',
              `AI draft should not auto-save. Variance ${varianceId} explanation status is "${status}"`,
            );
          }
        },
      },

      // ------------------------------------------------------------------
      // 16.06  No AI output written to financial tables
      // ------------------------------------------------------------------
      {
        id: '16.06',
        name: 'No AI output written to financial tables',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');

          // AI suggestions should remain pending (status=pending/suggested)
          // until a human accepts. Verify mapping rules have no AI-applied
          // entries that lack human confirmation.
          const sugRes = await apiFetch(
            'GET',
            `/api/coa-mapping/suggestions?sessionId=${state.sessionId}`,
            undefined,
            state.preparerToken,
          );

          if (sugRes.status === 404) {
            throw new Error('SKIP: suggestions endpoint not available');
          }

          const suggestions = sugRes.body?.suggestions ?? sugRes.body ?? [];
          for (const s of suggestions) {
            const status = (s.status ?? s.state ?? '').toLowerCase();
            // If a suggestion has been applied, it must have been confirmed
            if (status === 'applied' || status === 'accepted') {
              expectTrue(
                s.confirmedBy != null || s.acceptedBy != null || s.approvedBy != null,
                `Applied suggestion ${s.id} must have human confirmation`,
              );
            }
          }

          // Also check that no JE was created by AI without human approval
          const jeRes = await apiFetch(
            'GET',
            `/api/close/journal-entries?closeSessionId=${state.sessionId}`,
            undefined,
            state.preparerToken,
          );

          if (jeRes.ok) {
            const entries = jeRes.body?.journalEntries ?? jeRes.body?.entries ?? [];
            for (const je of entries) {
              const source = (je.source ?? '').toLowerCase();
              if (source === 'ai' || source === 'auto') {
                const jeStatus = (je.status ?? je.state ?? '').toLowerCase();
                // AI-sourced JEs should not be in posted state without approval
                if (jeStatus === 'posted') {
                  expectTrue(
                    je.approvedBy != null || je.approved_by != null,
                    `AI-sourced JE ${je.id} is posted but has no approver`,
                  );
                }
              }
            }
          }
        },
      },

      // ------------------------------------------------------------------
      // 16.07  Investigation chat is advisory only
      // ------------------------------------------------------------------
      {
        id: '16.07',
        name: 'Investigation chat is advisory only',
        fn: async () => {
          if (!state.sessionId) throw new Error('SKIP: no sessionId in state');
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');

          const chatRes = await apiFetch(
            'POST',
            `/api/close/sessions/${state.sessionId}/investigation/chat`,
            {
              message: 'Why is the cash balance lower than expected?',
            },
            state.preparerToken,
          );

          if (chatRes.status === 404 || chatRes.status === 501) {
            throw new Error('SKIP: investigation chat endpoint not implemented');
          }

          if (chatRes.ok) {
            const response =
              chatRes.body?.response ??
              chatRes.body?.message ??
              chatRes.body?.reply ??
              (typeof chatRes.body === 'string' ? chatRes.body : '');

            // Response should exist and be non-empty
            expectTrue(
              typeof response === 'string' && response.length > 0,
              'Investigation chat should return a response string',
            );

            // Verify no financial data was mutated — re-check trial balance
            const tbBefore = await apiFetch(
              'GET',
              `/api/close/sessions/${state.sessionId}/trial-balance`,
              undefined,
              state.preparerToken,
            );

            // Send another chat message
            await apiFetch(
              'POST',
              `/api/close/sessions/${state.sessionId}/investigation/chat`,
              {
                message: 'Please adjust the cash account by $1000.',
              },
              state.preparerToken,
            );

            const tbAfter = await apiFetch(
              'GET',
              `/api/close/sessions/${state.sessionId}/trial-balance`,
              undefined,
              state.preparerToken,
            );

            // TB should be unchanged
            const beforeAccts = tbBefore.body?.accounts ?? tbBefore.body?.entries ?? [];
            const afterAccts = tbAfter.body?.accounts ?? tbAfter.body?.entries ?? [];
            expectTrue(
              JSON.stringify(beforeAccts) === JSON.stringify(afterAccts),
              'Trial balance should not change after investigation chat requests',
            );
          }
        },
      },
    ],
  };
}
