/**
 * Strict JSON schema for Justifier pillar output (IRAC memo). Validated with Zod.
 */

import { z } from 'zod';

export const JustifierIRACSchema = z.object({
  issue: z.string(),
  rule: z.string(),
  analysis: z.string(),
  conclusion: z.string(),
});

export const JustifierOutputSchema = z.object({
  prompt_version: z.string(),
  irac: JustifierIRACSchema,
  memo_markdown: z.string(),
  rule_ids: z.array(z.string()),
  facts_used: z.array(z.string()),
});

export type JustifierIRAC = z.infer<typeof JustifierIRACSchema>;
export type JustifierOutput = z.infer<typeof JustifierOutputSchema>;
