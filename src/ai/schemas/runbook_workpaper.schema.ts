import { z } from 'zod';

const conciseText = z.string().trim().min(1).max(800);

export const RunbookWorkpaperOutputSchema = z.object({
  prompt_version: z.literal('runbook_workpaper_v2.0.0'),
  conclusion: z.enum(['ready_for_review', 'exception_noted', 'insufficient_information']),
  summary: conciseText,
  procedures_performed: z.array(conciseText).max(12),
  exceptions: z.array(conciseText).max(12),
  reviewer_questions: z.array(conciseText).max(12),
  evidence_keys: z.array(z.string().trim().min(1).max(120)).max(20),
  requires_human_confirmation: z.literal(true),
});

export type RunbookWorkpaperOutput = z.infer<typeof RunbookWorkpaperOutputSchema>;
