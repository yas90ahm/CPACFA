/**
 * Dev-only diagnostics router: trial-balance ingest (supervisor quarantined).
 * Mounted only when NODE_ENV !== 'production'. Scope purge: supervisor moved to /experimental.
 */

import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { optionalAuth, attachTenantPool, requireTenantContext } from '../auth/middleware.js';
import trialBalanceRouter from './trial-balance/index.js';

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Too many requests', retryAfter: '1 minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();
router.use(apiLimiter);
router.use(optionalAuth);
router.use(attachTenantPool);
router.use(requireTenantContext);

router.use('/trial-balance', trialBalanceRouter);
router.use('/supervisor', (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Quarantined', message: 'Supervisor moved to /experimental. Use git history to restore.' });
});

export default router;
