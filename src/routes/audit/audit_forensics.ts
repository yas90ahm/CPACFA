/**
 * Audit forensics route: dashboard/forensic-anomalies.
 * Scope: agentic gap analyzer quarantined; returns empty list (deterministic audit only).
 */

import { Router, type Request, type Response } from 'express';

const router = Router();

/** GET /api/audit/dashboard/forensic-anomalies — stub (agentic forensics quarantined). */
router.get('/dashboard/forensic-anomalies', async (_req: Request, res: Response) => {
  res.json({
    forensic_anomalies: [],
    count: 0,
    message: 'Forensic anomalies (agentic) are quarantined. Use GAAP consistency and reconciliation summary for sovereign scope.',
  });
});

export default router;
