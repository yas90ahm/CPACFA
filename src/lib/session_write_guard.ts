/**
 * Session write guard: blocks modifications to certified or locked close sessions.
 * Call at the top of write route handlers BEFORE any service logic.
 */

import type { Response } from 'express';
import type { Pool } from 'pg';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';

const FROZEN_STATUSES: readonly string[] = ['certified', 'locked'];

/**
 * Returns true if session is writable, false if frozen (409 already sent).
 * Usage: `if (!await guardSessionWritable(res, pool, tenantId, sessionId)) return;`
 */
export async function guardSessionWritable(
  res: Response,
  pool: Pool,
  tenantId: string,
  sessionId: string
): Promise<boolean> {
  const session = await getCloseSessionById(pool, tenantId, sessionId);
  if (!session) {
    res.status(404).json({ error: 'Close session not found' });
    return false;
  }
  if (FROZEN_STATUSES.includes(session.status)) {
    res.status(409).json({
      error: `Session is ${session.status}; modifications are not allowed.`,
      code: 'SESSION_FROZEN',
    });
    return false;
  }
  return true;
}
