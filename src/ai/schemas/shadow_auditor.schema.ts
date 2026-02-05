/**
 * Strict JSON schema for Shadow Auditor pillar output. Validated with Zod.
 */

import { z } from 'zod';

export const ShadowAuditorFindingSchema = z.object({
  code: z.string(),
  message: z.string(),
  rule_ids: z.array(z.string()),
  refs: z.array(z.string()),
});

export const ShadowAuditorOutputSchema = z.object({
  prompt_version: z.string(),
  severity: z.enum(['ok', 'warn', 'block']),
  confidence: z.number().min(0).max(1),
  findings: z.array(ShadowAuditorFindingSchema),
});

export type ShadowAuditorFinding = z.infer<typeof ShadowAuditorFindingSchema>;
export type ShadowAuditorOutput = z.infer<typeof ShadowAuditorOutputSchema>;
