/**
 * Audit forensics route: dashboard/forensic-anomalies.
 */

import { Router, type Request, type Response } from 'express';
import { BACKEND_PYTHON_URL } from './audit_shared.js';
import { handleAuditError } from './audit_shared.js';

const router = Router();

/** GET /api/audit/dashboard/forensic-anomalies */
router.get('/dashboard/forensic-anomalies', async (req: Request, res: Response) => {
  try {
    if (!BACKEND_PYTHON_URL) {
      res.json({
        forensic_anomalies: [],
        count: 0,
        message: 'Set BACKEND_PYTHON_URL to Python backend for Forensic Skeptic / Audit Dashboard data.',
      });
      return;
    }
    const limit = req.query.limit ?? '200';
    const scan_since = req.query.scan_since as string | undefined;
    const created_by = req.query.created_by as string | undefined;
    const flag_type = req.query.flag_type as string | undefined;
    const params = new URLSearchParams({ limit: String(limit) });
    if (scan_since) params.set('scan_since', scan_since);
    if (created_by) params.set('created_by', created_by);
    if (flag_type) params.set('flag_type', flag_type);
    const url = `${BACKEND_PYTHON_URL.replace(/\/$/, '')}/api/audit/dashboard/forensic-anomalies?${params.toString()}`;
    const resp = await fetch(url);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      res.status(resp.status).json(data);
      return;
    }
    res.json(data);
  } catch (err) {
    handleAuditError(res, err, 'Dashboard error');
  }
});

export default router;
