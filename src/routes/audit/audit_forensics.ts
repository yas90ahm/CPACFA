/**
 * Audit forensics route: dashboard/forensic-anomalies.
 * FUTURE: Agentic gap analyzer not implemented; returns empty list (deterministic audit only).
 */

import { Router, type Request, type Response } from 'express';

const router = Router();

/** GET /api/audit/dashboard/forensic-anomalies — returns empty list. FUTURE: agentic forensics not implemented. */
router.get('/dashboard/forensic-anomalies', async (_req: Request, res: Response) => {
  res.json({
    forensic_anomalies: [],
    count: 0,
    message: 'Forensic anomalies (agentic) are quarantined. Use GAAP consistency and reconciliation summary for sovereign scope.',
  });
});

export default router;
