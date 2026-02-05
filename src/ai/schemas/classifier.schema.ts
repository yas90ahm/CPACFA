/**
 * Strict JSON schema for Classifier pillar output (metadata only; no amounts).
 */

import { z } from 'zod';

export const ClassifierResultItemSchema = z.object({
  source_id: z.string(),
  object_type: z.string(),
  fs_placement: z.string(),
  suggested_accounts: z.array(z.string()),
  rule_tags: z.array(z.string()),
  missing_inputs: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const ClassifierOutputSchema = z.object({
  prompt_version: z.string(),
  results: z.array(ClassifierResultItemSchema),
});

export type ClassifierResultItem = z.infer<typeof ClassifierResultItemSchema>;
export type ClassifierOutput = z.infer<typeof ClassifierOutputSchema>;
