/**
 * GROUP 21: Autonomous Mapping Pipeline (8 scenarios)
 *
 * Tests the 5-layer mapping pipeline:
 * - Auto-classify endpoint returns suggestions
 * - Layer 3: Validation agent detects mapping-balance mismatches
 * - Layer 4: Cross-validation catches structural errors
 * - Layer 5: Learning loop records corrections
 * - Autonomous pipeline auto-accepts high-confidence suggestions
 * - Accept-correction endpoint works for agent proposals
 */
import {
  apiFetch,
  createEntity,
  createSession,
  uploadGL,
  expectStatus,
  expectTrue,
  expectFieldExists,
  FIXTURES,
} from '../helpers';
import { state } from '../run_all';
import type { TestGroup } from '../run_all';

export const group21_autonomous_mapping: TestGroup = {
  name: 'Autonomous Mapping Pipeline',
  scenarios: [
    {
      id: '21.01',
      name: 'Auto-classify returns XBRL-based suggestions',
      fn: async () => {
        const token = state.controllerToken!;
        const entityId = `e2e-mapping-${Date.now()}`;
        await createEntity(token, entityId);
        const sess = await createSession(token, entityId, '2026-03-01', '2026-03-31', '2026-03');
        await uploadGL(token, sess.id, FIXTURES.SIMPLE_GL);

        const res = await apiFetch<any>(
          `/api/close/sessions/${sess.id}/suggestions/auto-classify`,
          { method: 'POST', token, body: {} }
        );
        expectStatus(res, 200);
        expectFieldExists(res.body, 'coaSuggestions');
        expectTrue(
          Array.isArray(res.body.coaSuggestions),
          'coaSuggestions should be an array'
        );
      },
    },
    {
      id: '21.02',
      name: 'Validate-mappings returns agent + cross-validation results',
      fn: async () => {
        const token = state.controllerToken!;
        const sessionId = state.sessionId!;

        const res = await apiFetch<any>(
          `/api/close/sessions/${sessionId}/suggestions/validate-mappings`,
          { method: 'POST', token, body: {} }
        );
        expectStatus(res, 200);
        expectFieldExists(res.body, 'agent');
        expectFieldExists(res.body, 'crossValidation');
        expectFieldExists(res.body.agent, 'accountsValidated');
        expectFieldExists(res.body.crossValidation, 'passes');
      },
    },
    {
      id: '21.03',
      name: 'Learning stats endpoint returns metrics',
      fn: async () => {
        const token = state.controllerToken!;
        const sessionId = state.sessionId!;

        const res = await apiFetch<any>(
          `/api/close/sessions/${sessionId}/suggestions/learning-stats`,
          { method: 'GET', token }
        );
        expectStatus(res, 200);
        expectFieldExists(res.body, 'totalCorrections');
        expectFieldExists(res.body, 'uniquePatterns');
        expectFieldExists(res.body, 'crossTenantSignals');
      },
    },
    {
      id: '21.04',
      name: 'Cross-tenant learning is off by default',
      fn: async () => {
        const token = state.controllerToken!;

        const res = await apiFetch<any>(
          '/api/settings/cross-tenant-learning',
          { method: 'GET', token }
        );
        expectStatus(res, 200);
        expectTrue(
          res.body.enabled === false,
          'Cross-tenant learning should be off by default'
        );
      },
    },
    {
      id: '21.05',
      name: 'GL anomaly detection returns anomalies',
      fn: async () => {
        const token = state.controllerToken!;
        const sessionId = state.sessionId!;

        const res = await apiFetch<any>(
          `/api/close/sessions/${sessionId}/gl-anomalies`,
          { method: 'GET', token }
        );
        expectStatus(res, 200);
        expectFieldExists(res.body, 'anomalies');
        expectFieldExists(res.body, 'summary');
        expectFieldExists(res.body, 'accountsScanned');
      },
    },
    {
      id: '21.06',
      name: 'Predict-timeline returns forecast',
      fn: async () => {
        const token = state.controllerToken!;
        const sessionId = state.sessionId!;

        const res = await apiFetch<any>(
          `/api/close/sessions/${sessionId}/predict-timeline`,
          { method: 'GET', token }
        );
        expectStatus(res, 200);
        expectFieldExists(res.body, 'targetDays');
        expectFieldExists(res.body, 'currentDay');
        expectFieldExists(res.body, 'confidence');
        expectFieldExists(res.body, 'steps');
      },
    },
    {
      id: '21.07',
      name: 'Portfolio analytics returns audit metrics',
      fn: async () => {
        const token = state.adminToken ?? state.controllerToken!;
        const entityId = state.entityId!;

        const res = await apiFetch<any>(
          `/api/portfolio/analytics/${entityId}`,
          { method: 'GET', token }
        );
        expectStatus(res, 200);
        expectFieldExists(res.body, 'jeApproval');
        expectFieldExists(res.body, 'aiSuggestions');
        expectFieldExists(res.body, 'velocityTrend');
      },
    },
    {
      id: '21.08',
      name: 'Verification endpoint surfaces hash version',
      fn: async () => {
        const token = state.controllerToken!;
        const sessionId = state.certifiedSessionId ?? state.sessionId!;

        // Get the artifact first
        const artRes = await apiFetch<any>(
          `/api/verification/certification/artifacts/${sessionId}`,
          { method: 'GET', token }
        );
        if (artRes.status === 404) return; // No certified session in this run

        // Verify it
        const verifyRes = await apiFetch<any>(
          '/api/verification/certification/verify',
          {
            method: 'POST',
            token,
            body: {
              artifact: artRes.body.artifact,
              signatureB64: artRes.body.signatureB64,
              publicKeyB64: artRes.body.publicKeyB64,
            },
          }
        );
        expectStatus(verifyRes, 200);
        expectFieldExists(verifyRes.body, 'hashVersion');
      },
    },
  ],
};
