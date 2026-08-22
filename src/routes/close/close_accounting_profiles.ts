import { Router, type Request, type Response } from 'express';
import {
  CanadianAspeProfileError,
  getCanadianAspeCloseProfile,
  parseCloseFrequency,
} from '../../services/canadian_aspe_close_profile.js';

const router = Router();

/** Static, versioned control contract for the first Canadian close harness. */
router.get('/accounting-profiles/ca-aspe', (req: Request, res: Response) => {
  try {
    const frequency = parseCloseFrequency(req.query.frequency, 'monthly');
    res.json({ profile: getCanadianAspeCloseProfile(frequency) });
  } catch (error) {
    if (error instanceof CanadianAspeProfileError) {
      res.status(400).json({ error: error.message, code: error.code });
      return;
    }
    throw error;
  }
});

export default router;
