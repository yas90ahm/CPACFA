/**
 * Audit auditor routes: auditor/verify, auditor/internal-controls-chat.
 */

import { Router, type Request, type Response } from 'express';
import { justifyWithRAG } from '../../services/justification_service.js';
import { getAuditorToken } from './audit_shared.js';
import { handleAuditError } from './audit_shared.js';
import { validateBody } from '../../middleware/validationMiddleware.js';
import { auditorVerifyBodySchema, internalControlsChatBodySchema } from '../../schemas/auditSchemas.js';

const router = Router();

/** POST /api/audit/auditor/verify */
router.post('/auditor/verify', validateBody(auditorVerifyBodySchema), (req: Request, res: Response) => {
  try {
    const auditorToken = getAuditorToken();
    if (auditorToken === null) {
      return res.status(503).json({ error: 'Auditor portal not configured', message: 'Set AUDITOR_PORTAL_TOKEN in production.' });
    }
    const token = (req.body.token ?? '').trim();
    const valid = token === auditorToken;
    res.json({ valid });
  } catch (err) {
    handleAuditError(res, err, 'Verify error');
  }
});

/** POST /api/audit/auditor/internal-controls-chat */
router.post('/auditor/internal-controls-chat', validateBody(internalControlsChatBodySchema), async (req: Request, res: Response) => {
  try {
    const auditorToken = getAuditorToken();
    if (auditorToken === null) {
      return res.status(503).json({ error: 'Auditor portal not configured', message: 'Set AUDITOR_PORTAL_TOKEN in production.' });
    }
    const token = (req.body.token ?? '').trim();
    if (token !== auditorToken) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid or missing auditor token.' });
      return;
    }
    const question = req.body.question;
    const scopedQuestion = `Internal controls: ${question}`;
    const response = await justifyWithRAG(scopedQuestion, { framework: 'FASB' });
    res.json({
      question: question,
      scopedQuestion: scopedQuestion,
      irac: response.irac,
      sourceTag: response.sourceTag,
      formatted: response.formatted,
    });
  } catch (err) {
    handleAuditError(res, err, 'Internal controls chat error');
  }
});

export default router;
