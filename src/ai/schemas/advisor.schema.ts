/**
 * Strict JSON schema for Advisor pillar: proposals only; no posting or ledger mutation.
 * Amounts require provenance; SOURCE_LINE_AMOUNT requires sourceRef.
 */

import { z } from 'zod';

const AmountProvenanceSchema = z.enum([
  'SOURCE_LINE_AMOUNT',
  'HUMAN_ENTERED_AMOUNT',
  'DETERMINISTIC_ENGINE_AMOUNT',
]);

const SourceRefSchema = z.object({
  ledgerLineId: z.string().optional(),
  tbRowId: z.string().optional(),
});

const ProposalLineSchema = z.object({
  dr_account_key: z.string(),
  cr_account_key: z.string(),
  // amount field intentionally omitted — AI must not produce amounts.
  // Amounts are populated by the deterministic engine or human after approval.
  amountProvenance: AmountProvenanceSchema,
  sourceRef: SourceRefSchema.optional(),
  note: z.string().optional(),
}).refine(
  (data) => {
    if (data.amountProvenance === 'SOURCE_LINE_AMOUNT') {
      return data.sourceRef != null && (data.sourceRef?.ledgerLineId != null || data.sourceRef?.tbRowId != null);
    }
    return true;
  },
  { message: 'SOURCE_LINE_AMOUNT requires sourceRef with ledgerLineId or tbRowId', path: ['sourceRef'] }
);

const ProposalTypeSchema = z.enum([
  'reclass',
  'accrual_candidate',
  'deferral_candidate',
  'lease_candidate',
  'mapping_fix',
  'other',
]);

export const AdvisorProposalSchema = z.object({
  proposal_id: z.string(),
  type: ProposalTypeSchema,
  rationale: z.string(),
  rule_ids: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  requires_human_confirmation: z.boolean(),
  lines: z.array(ProposalLineSchema),
  missing_inputs: z.array(z.string()),
});

export const AdvisorOutputSchema = z.object({
  prompt_version: z.string(),
  proposals: z.array(AdvisorProposalSchema),
});

export type AdvisorProposal = z.infer<typeof AdvisorProposalSchema>;
export type AdvisorOutput = z.infer<typeof AdvisorOutputSchema>;
export type ProposalLine = z.infer<typeof ProposalLineSchema>;
