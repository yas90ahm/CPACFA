/**
 * Evidence Anchoring (Phase 1): proof + reference metadata only.
 * We do NOT store files; evidence remains in external systems.
 * Phase 2A: assertion_type, claimed_amount, etc.
 */

export const ASSERTION_TYPES = [
  'invoice_support',
  'bank_support',
  'reconciliation',
  'approval',
  'contract_support',
  'calc_support',
  'other',
] as const;
export type AssertionType = (typeof ASSERTION_TYPES)[number];

export interface EvidenceRecord {
  id: string;
  tenantId: string;
  hashSha256: string;
  sizeBytes: number;
  mimeType?: string;
  externalUri?: string;
  externalProvider?: string;
  label?: string;
  attachedBy: string;
  attachedAt: string;
  integrityVersion: string;
}

export interface EvidenceLink {
  id: string;
  tenantId: string;
  evidenceId: string;
  objectType: string;
  objectId: string;
  role?: string;
  requiredness: 'optional' | 'required';
  createdBy: string;
  createdAt: string;
  assertionType?: AssertionType;
  claimedAmount?: string;
  claimedCurrency?: string;
  claimedPeriod?: string;
  note?: string;
}

export interface CreateEvidenceRecordInput {
  hashSha256: string;
  sizeBytes: number;
  mimeType?: string;
  externalUri?: string;
  externalProvider?: string;
  label?: string;
  attachedBy: string;
}

export interface LinkEvidenceInput {
  evidenceId: string;
  objectType: 'journal_entry';
  objectId: string;
  assertionType: AssertionType;
  role?: string;
  requiredness?: 'optional' | 'required';
  createdBy: string;
  claimedAmount?: string;
  claimedCurrency?: string;
  claimedPeriod?: string;
  note?: string;
}
