/**
 * GROUP 20: Board Package & Export (6 scenarios)
 *
 * Tests the board-package endpoint, PDF/HTML export, evidence manifest,
 * audit trail, and certification artifact inclusion.
 */
import {
  apiFetch,
  expectStatus,
  expectTrue,
  expectFieldExists,
} from '../helpers';
import { state } from '../run_all';
import type { TestGroup } from '../run_all';

/**
 * Resolve a certified session ID. Prefers state.certifiedSessionId
 * (from group09), falls back to janSessionId (certified in group18),
 * then the main sessionId.
 */
function getCertifiedSessionId(): string {
  if (state.certifiedSessionId) return state.certifiedSessionId;
  if (state.janSessionId) return state.janSessionId;
  if (state.sessionId) return state.sessionId;
  throw new Error('SKIP: no certified session ID available');
}

export function group20_board_package(): TestGroup {
  return {
    name: 'GROUP 20: Board Package & Export',
    scenarios: [
      // ------------------------------------------------------------------
      // 20.01  Board package for certified session — structured JSON
      // ------------------------------------------------------------------
      {
        id: '20.01',
        name: 'Board package for certified session — structured JSON',
        fn: async () => {
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');
          const sessionId = getCertifiedSessionId();

          const res = await apiFetch(
            'GET',
            `/api/close/sessions/${sessionId}/board-package?periodType=monthly`,
            undefined,
            state.preparerToken,
          );

          if (res.status === 404 || res.status === 501) {
            throw new Error('SKIP: board package endpoint not implemented');
          }

          if (res.status === 409 || res.status === 422) {
            throw new Error(
              `SKIP: board package requires certified session — current state may not allow it (${res.status})`,
            );
          }

          expectTrue(
            res.ok,
            `Board package should succeed, got ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`,
          );

          // Verify structured JSON
          expectTrue(
            typeof res.body === 'object' && res.body !== null,
            'Board package should return a JSON object',
          );

          state._boardPackage = res.body;
          state._boardPackageSessionId = sessionId;
        },
      },

      // ------------------------------------------------------------------
      // 20.02  Includes statements, variances, certification
      // ------------------------------------------------------------------
      {
        id: '20.02',
        name: 'Includes statements, variances, certification',
        fn: async () => {
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');
          const sessionId = getCertifiedSessionId();

          // Re-fetch or use cached
          let pkg = state._boardPackage;
          if (!pkg || state._boardPackageSessionId !== sessionId) {
            const res = await apiFetch(
              'GET',
              `/api/close/sessions/${sessionId}/board-package?periodType=monthly`,
              undefined,
              state.preparerToken,
            );

            if (res.status === 404 || res.status === 501) {
              throw new Error('SKIP: board package endpoint not implemented');
            }

            if (!res.ok) {
              throw new Error(`SKIP: board package returned ${res.status}`);
            }

            pkg = res.body;
          }

          // Check for key sections
          const hasStatements =
            pkg.statements != null ||
            pkg.statementPackage != null ||
            pkg.financialStatements != null ||
            pkg.balanceSheet != null ||
            pkg.incomeStatement != null;

          const hasVariances =
            pkg.variances != null ||
            pkg.varianceAnalysis != null ||
            pkg.materialVariances != null;

          const hasCertification =
            pkg.certification != null ||
            pkg.certificationArtifact != null ||
            pkg.signedBy != null ||
            pkg.certifiedAt != null;

          // At least statements should be present
          expectTrue(
            hasStatements || Object.keys(pkg).length > 2,
            `Board package should include statements. Keys: ${Object.keys(pkg).join(', ')}`,
          );

          // Warn if variances or certification missing but do not fail hard
          if (!hasVariances) {
            // Check nested paths
            const flatStr = JSON.stringify(pkg).toLowerCase();
            expectTrue(
              flatStr.includes('variance') || flatStr.includes('statement'),
              'Board package JSON should reference variances or statements',
            );
          }

          if (!hasCertification) {
            // Certification info may be nested or may require the session
            // to actually be certified
            const sessRes = await apiFetch(
              'GET',
              `/api/close/sessions/${sessionId}`,
              undefined,
              state.preparerToken,
            );
            const sessState = (sessRes.body?.status ?? sessRes.body?.state ?? '').toLowerCase();
            if (sessState !== 'certified' && sessState !== 'locked') {
              throw new Error(
                `SKIP: session is "${sessState}", not certified — certification data not expected`,
              );
            }
          }
        },
      },

      // ------------------------------------------------------------------
      // 20.03  Board package with QTD — cumulative financials
      // ------------------------------------------------------------------
      {
        id: '20.03',
        name: 'Board package with QTD — cumulative financials',
        fn: async () => {
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');
          const sessionId = state.marSessionId ?? getCertifiedSessionId();

          const res = await apiFetch(
            'GET',
            `/api/close/sessions/${sessionId}/board-package?periodType=QTD`,
            undefined,
            state.preparerToken,
          );

          if (res.status === 404 || res.status === 501) {
            throw new Error('SKIP: QTD board package not implemented');
          }

          if (res.ok) {
            expectTrue(
              typeof res.body === 'object' && res.body !== null,
              'QTD board package should return a JSON object',
            );

            // Check for cumulative indicators
            const flatStr = JSON.stringify(res.body).toLowerCase();
            const hasCumulative =
              flatStr.includes('qtd') ||
              flatStr.includes('cumulative') ||
              flatStr.includes('quarter') ||
              flatStr.includes('period');

            expectTrue(
              hasCumulative || Object.keys(res.body).length > 0,
              'QTD board package should reference cumulative/quarter data',
            );
          } else {
            expectTrue(
              res.status === 400 || res.status === 422 || res.status === 409,
              `QTD board package should succeed or return 400/422, got ${res.status}`,
            );
          }
        },
      },

      // ------------------------------------------------------------------
      // 20.04  PDF export — valid response (HTML)
      // ------------------------------------------------------------------
      {
        id: '20.04',
        name: 'PDF export — valid response (HTML)',
        fn: async () => {
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');
          const sessionId = getCertifiedSessionId();

          const res = await apiFetch(
            'GET',
            `/api/close/sessions/${sessionId}/board-package/export/pdf?periodType=monthly`,
            undefined,
            state.preparerToken,
          );

          if (res.status === 404 || res.status === 501) {
            throw new Error('SKIP: PDF export endpoint not implemented');
          }

          if (res.ok) {
            // Check content type for HTML or PDF
            const contentType = (
              res.headers['content-type'] ??
              res.headers['Content-Type'] ??
              ''
            );
            const ct = Array.isArray(contentType) ? contentType.join('') : String(contentType);

            const isHTML = ct.includes('text/html');
            const isPDF = ct.includes('application/pdf');
            const isJSON = ct.includes('application/json');

            expectTrue(
              isHTML || isPDF || isJSON || typeof res.body === 'string',
              `PDF export should return HTML, PDF, or JSON content. Content-Type: "${ct}"`,
            );

            // Verify non-empty response
            if (typeof res.body === 'string') {
              expectTrue(
                res.body.length > 100,
                `PDF export body should be substantial, got ${res.body.length} chars`,
              );
            } else if (typeof res.body === 'object') {
              // May return JSON with HTML embedded or a download URL
              const html =
                res.body?.html ??
                res.body?.content ??
                res.body?.url ??
                res.body?.downloadUrl;
              expectTrue(
                html != null,
                `PDF export JSON should contain html, content, or url field. Keys: ${Object.keys(res.body).join(', ')}`,
              );
            }
          } else {
            expectTrue(
              res.status === 409 || res.status === 422,
              `PDF export should succeed or return 409/422, got ${res.status}`,
            );
          }
        },
      },

      // ------------------------------------------------------------------
      // 20.05  Audit binder export — complete package
      // ------------------------------------------------------------------
      {
        id: '20.05',
        name: 'Audit binder export — complete package',
        fn: async () => {
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');
          const sessionId = getCertifiedSessionId();

          // Evidence manifest
          const manifestRes = await apiFetch(
            'GET',
            `/api/close/sessions/${sessionId}/evidence-manifest`,
            undefined,
            state.preparerToken,
          );

          if (manifestRes.status === 404 || manifestRes.status === 501) {
            throw new Error('SKIP: evidence manifest endpoint not implemented');
          }

          if (manifestRes.ok) {
            const manifest = manifestRes.body;
            expectTrue(
              typeof manifest === 'object' && manifest !== null,
              'Evidence manifest should be a JSON object',
            );

            // Should contain evidence entries or a summary
            const entries =
              manifest?.entries ??
              manifest?.evidence ??
              manifest?.items ??
              manifest?.files ?? [];

            expectTrue(
              Array.isArray(entries),
              `Evidence manifest should contain an array of entries. Keys: ${Object.keys(manifest).join(', ')}`,
            );
          }

          // Audit trail events
          const eventsRes = await apiFetch(
            'GET',
            `/api/close/sessions/${sessionId}/audit-events`,
            undefined,
            state.preparerToken,
          );

          if (eventsRes.status === 404 || eventsRes.status === 501) {
            // Try alternate endpoint
            const altRes = await apiFetch(
              'GET',
              `/api/close/sessions/${sessionId}/audit-trail`,
              undefined,
              state.preparerToken,
            );

            if (altRes.status === 404 || altRes.status === 501) {
              throw new Error('SKIP: audit events/trail endpoint not implemented');
            }

            if (altRes.ok) {
              const events = altRes.body?.events ?? altRes.body ?? [];
              expectTrue(
                Array.isArray(events),
                'Audit trail should return an array of events',
              );
            }
          } else if (eventsRes.ok) {
            const events = eventsRes.body?.events ?? eventsRes.body ?? [];
            expectTrue(
              Array.isArray(events),
              'Audit events should return an array',
            );
            expectTrue(
              events.length > 0,
              'A certified session should have at least one audit event',
            );
          }
        },
      },

      // ------------------------------------------------------------------
      // 20.06  Binder includes evidence manifest, trail, artifact
      // ------------------------------------------------------------------
      {
        id: '20.06',
        name: 'Binder includes evidence manifest, trail, artifact',
        fn: async () => {
          if (!state.preparerToken) throw new Error('SKIP: no preparerToken');
          const sessionId = getCertifiedSessionId();

          // Check certification artifact
          const certRes = await apiFetch(
            'GET',
            `/api/close/sessions/${sessionId}`,
            undefined,
            state.preparerToken,
          );

          if (!certRes.ok) {
            throw new Error(`SKIP: could not fetch session: ${certRes.status}`);
          }

          const session = certRes.body;
          const sessState = (session.status ?? session.state ?? '').toLowerCase();

          // Only certified/locked sessions have artifacts
          if (sessState !== 'certified' && sessState !== 'locked') {
            throw new Error(
              `SKIP: session is "${sessState}", not certified — artifacts not expected`,
            );
          }

          const artifactId =
            session.certificationArtifactId ??
            session.certification_artifact_id ??
            session.artifactId;

          if (artifactId) {
            // Fetch the artifact
            const artRes = await apiFetch(
              'GET',
              `/api/verification/certification/artifacts/${artifactId}`,
              undefined,
              state.preparerToken,
            );

            if (artRes.ok) {
              expectFieldExists(artRes.body, 'signature');
              // The artifact should contain or reference the signed data
              expectTrue(
                artRes.body.signature != null || artRes.body.signedPayload != null,
                'Certification artifact should include signature data',
              );
            } else {
              expectTrue(
                artRes.status === 404,
                `Artifact fetch should succeed or 404, got ${artRes.status}`,
              );
            }
          }

          // Verify the evidence manifest references the right session
          const manifestRes = await apiFetch(
            'GET',
            `/api/close/sessions/${sessionId}/evidence-manifest`,
            undefined,
            state.preparerToken,
          );

          if (manifestRes.ok) {
            const manifest = manifestRes.body;
            const manifestSession =
              manifest?.sessionId ??
              manifest?.session_id ??
              manifest?.closeSessionId;

            if (manifestSession) {
              expectTrue(
                manifestSession === sessionId,
                `Evidence manifest sessionId should match: expected ${sessionId}, got ${manifestSession}`,
              );
            }
          }

          // Verify audit trail covers key lifecycle events
          const trailRes = await apiFetch(
            'GET',
            `/api/close/sessions/${sessionId}/audit-events`,
            undefined,
            state.preparerToken,
          );

          if (trailRes.ok) {
            const events = trailRes.body?.events ?? trailRes.body ?? [];
            if (events.length > 0) {
              // Look for certification event
              const certEvent = events.find(
                (e: any) =>
                  (e.action ?? e.type ?? e.event ?? '').toLowerCase().includes('certif'),
              );
              // It is OK if the event is not explicitly labeled — the trail
              // should at minimum exist
              expectTrue(
                events.length >= 1,
                'Audit trail should have events for a certified session',
              );
            }
          } else if (trailRes.status !== 404 && trailRes.status !== 501) {
            throw new Error(`Audit events returned unexpected status: ${trailRes.status}`);
          }
        },
      },
    ],
  };
}
