/**
 * Audit forensics route: dashboard/forensic-anomalies.
 * Uses internal agentic_gap_analyzer for forensic scans.
 */

import { Router, type Request, type Response } from 'express';
import { analyzeGapsAgentic } from '../../services/agentic_gap_analyzer.js';
import { handleAuditError } from './audit_shared.js';

const router = Router();

/** GET /api/audit/dashboard/forensic-anomalies — forensic scan via agentic gap analyzer */
router.get('/dashboard/forensic-anomalies', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const scan_since = req.query.scan_since as string | undefined;
    const created_by = req.query.created_by as string | undefined;
    const flag_type = req.query.flag_type as string | undefined;

    const ledgerSummary =
      [scan_since && `scan_since=${scan_since}`, created_by && `created_by=${created_by}`, flag_type && `flag_type=${flag_type}`]
        .filter(Boolean)
        .join('; ') || 'Forensic scan requested; no filters.';

    const gaps = await analyzeGapsAgentic({
      ledgerSummary,
      metadata: {
        transactionCount: limit,
      },
    });

    const forensic_anomalies = gaps.slice(0, limit).map((g) => ({
      id: g.id,
      type: g.type,
      title: g.title,
      description: g.description,
      urgency: g.urgency,
      suggestion: g.suggestion,
    }));

    res.json({
      forensic_anomalies,
      count: forensic_anomalies.length,
    });
  } catch (err) {
    handleAuditError(res, err, 'Dashboard error');
  }
});

export default router;
