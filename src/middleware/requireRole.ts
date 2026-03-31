/**
 * RBAC middleware: restrict route access to specific roles.
 * Usage: router.post('/admin-action', requireRole('system_admin'), handler)
 *        router.get('/reports', requireRole('admin', 'approver', 'reviewer'), handler)
 */

import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../auth/middleware.js';

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const userRole = req.role;
    if (!userRole) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }
    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Role '${userRole}' is not authorized for this action. Required: ${allowedRoles.join(', ')}`,
      });
      return;
    }
    next();
  };
}
