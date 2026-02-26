/**
 * Audit sampling routes: sampling POST/GET, suggest-size, design, :runId, :runId/narrative, :runId/test-results.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import type { SamplingInput } from '../../types/audit_evidence.js';
import { runSampling } from '../../services/sampling_service.js';
import { suggestSampleSize } from '../../services/sampling_design_service.js';
import { storeSamplingResult, getSamplingResult, updateSamplingTestResults } from '../../services/sampling_result_store.js';
// QUARANTINED — Agentic sampling narrative not in MVP architecture
// import { generateSamplingNarrativeAgentic } from '../../services/agentic_sampling_narrative.js';
import { validateBody } from '../../middleware/validationMiddleware.js';
import { samplingBodySchema, samplingDesignBodySchema, samplingTestResultsBodySchema } from '../../schemas/auditSchemas.js';
import { handleAuditError } from './audit_shared.js';

const router = Router();

/** POST /api/audit/sampling */
router.post('/sampling', validateBody(samplingBodySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const body = req.body as SamplingInput;
    const result = runSampling(body);
    const stored = await storeSamplingResult(result, pool, tenantId);
    res.json({
      ...result,
      runId: stored.runId,
      createdAt: stored.createdAt,
      periodLabel: stored.periodLabel,
      materialityThreshold: stored.materialityThreshold,
      populationCount: stored.populationCount,
    });
  } catch (err) {
    handleAuditError(res, err, 'Sampling error');
  }
});

/** GET /api/audit/sampling/suggest-size */
router.get('/sampling/suggest-size', (req: Request, res: Response) => {
  try {
    const populationSize = Number(req.query.populationSize);
    if (!Number.isFinite(populationSize) || populationSize < 0) {
      res.status(400).json({ error: 'Missing or invalid populationSize query' });
      return;
    }
    const risk = req.query.risk != null ? Number(req.query.risk) : undefined;
    const confidenceLevel = req.query.confidenceLevel != null ? Number(req.query.confidenceLevel) : undefined;
    const materialityThreshold = req.query.materialityThreshold != null ? Number(req.query.materialityThreshold) : undefined;
    const preferRiskBased = String(req.query.preferRiskBased ?? '') === 'true';
    const result = suggestSampleSize(populationSize, {
      risk: Number.isFinite(risk) ? risk : undefined,
      confidenceLevel: Number.isFinite(confidenceLevel) ? confidenceLevel : undefined,
      materialityThreshold: Number.isFinite(materialityThreshold) ? materialityThreshold : undefined,
      preferRiskBased,
    });
    res.json(result);
  } catch (err) {
    handleAuditError(res, err, 'Sampling design error');
  }
});

/** POST /api/audit/sampling/design */
router.post('/sampling/design', validateBody(samplingDesignBodySchema), (req: Request, res: Response) => {
  try {
    const body = req.body as { populationSize: number; risk?: number; confidenceLevel?: number; materialityThreshold?: number; preferRiskBased?: boolean };
    const result = suggestSampleSize(body.populationSize, {
      risk: body.risk,
      confidenceLevel: body.confidenceLevel,
      materialityThreshold: body.materialityThreshold,
      preferRiskBased: body.preferRiskBased,
    });
    res.json(result);
  } catch (err) {
    handleAuditError(res, err, 'Sampling design error');
  }
});

/** GET /api/audit/sampling/:runId */
router.get('/sampling/:runId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const runId = req.params.runId ?? '';
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    if (!runId) {
      res.status(400).json({ error: 'Missing runId' });
      return;
    }
    const run = await getSamplingResult(runId, pool, tenantId);
    if (!run) {
      res.status(404).json({ error: 'Sampling run not found' });
      return;
    }
    const payload: Record<string, unknown> = { ...run };
    // QUARANTINED — Agentic sampling narrative not in MVP architecture
    // if (includeNarrative) {
    //   payload.narrative = await generateSamplingNarrativeAgentic(run);
    // }
    res.json(payload);
  } catch (err) {
    handleAuditError(res, err, 'Sampling error');
  }
});

// QUARANTINED — Agentic sampling narrative not in MVP architecture
// /** POST /api/audit/sampling/:runId/narrative */
// router.post('/sampling/:runId/narrative', async (req: Request, res: Response) => {
//   try {
//     const tenantId = getTenantId(req) ?? 'default';
//     const pool = getTenantPool(req);
//     const runId = req.params.runId ?? '';
//     if (!runId) {
//       res.status(400).json({ error: 'Missing runId' });
//       return;
//     }
//     const run = await getSamplingResult(runId, pool, tenantId);
//     if (!run) {
//       res.status(404).json({ error: 'Sampling run not found' });
//       return;
//     }
//     const narrative = await generateSamplingNarrativeAgentic(run);
//     res.json({ runId, narrative });
//   } catch (err) {
//     handleAuditError(res, err, 'Sampling error');
//   }
// });

/** POST /api/audit/sampling/:runId/test-results */
router.post('/sampling/:runId/test-results', validateBody(samplingTestResultsBodySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const runId = req.params.runId ?? '';
    const body = req.body as { testResults: { id: string; result: 'pass' | 'fail' | 'exception'; note?: string }[] };
    if (!runId) {
      res.status(400).json({ error: 'Missing runId' });
      return;
    }
    const updated = await updateSamplingTestResults(runId, body.testResults, pool, tenantId);
    if (!updated) {
      res.status(404).json({ error: 'Sampling run not found' });
      return;
    }
    res.json(updated);
  } catch (err) {
    handleAuditError(res, err, 'Sampling test results error');
  }
});

export default router;
