/**
 * Zod schemas for reporting API request validation.
 */

import { z } from 'zod';

export const suggestCommentarySchema = z.object({
  reportType: z.string().min(1, 'reportType required'),
  periodLabel: z.string().optional(),
  keyNumbers: z.record(z.number()).optional(),
});
