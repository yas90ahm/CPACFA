/**
 * Immutable ledger snapshot: canonical TB + entries, stored with SHA-256 hash for certification/export.
 */

import type { AmountProvenance } from './amount_provenance.js';

export type LedgerSnapshotSource = 'precheck' | 'close_session' | 'import';

/** One line in the snapshot (trial balance or applicable journal line). */
export interface LedgerSnapshotEntry {
  /** Stable line ID (UUID) from TB parse/ingest; present for trial balance lines. */
  lineId?: string;
  accountName: string;
  debit: number;
  credit: number;
  accountCode?: string;
  description?: string;
  /** Amount provenance for JE/adjustment lines; persisted for audit trail. */
  amountProvenance?: AmountProvenance;
}

/** One evidence link in the certified manifest (proof + reference metadata only). */
export interface EvidenceLinkInManifest {
  evidenceId: string;
  hashSha256: string;
  sizeBytes: number;
  mimeType?: string;
  externalUri?: string;
  externalProvider?: string;
  label?: string;
  role?: string;
  requiredness?: string;
  assertionType?: string;
  attachedBy: string;
  attachedAt: string;
  storagePath?: string;
  verified?: boolean;
}

/** One journal entry with its evidence links in the manifest. */
export interface EvidenceManifestJournalEntry {
  journalEntryId: string;
  evidenceLinks: EvidenceLinkInManifest[];
}

/** Certified evidence manifest: deterministic, sorted by journalEntryId then evidenceId. */
export interface EvidenceManifest {
  journalEntries: EvidenceManifestJournalEntry[];
}

/** Canonical payload stored in snapshot_payload_json. */
export interface LedgerSnapshotPayload {
  trialBalance: {
    entries: LedgerSnapshotEntry[];
    totalDebits: number;
    totalCredits: number;
  };
  /** Additional entries (e.g. applied adjustments) in deterministic order. */
  entries?: LedgerSnapshotEntry[];
  /** Certified evidence manifest (v3+). Sorted by journalEntryId, then evidenceId. Empty when no evidence. */
  evidenceManifest?: EvidenceManifest;
}

export interface LedgerSnapshot {
  id: string;
  tenantId: string;
  periodLabel: string;
  createdAt: string;
  createdBy?: string;
  source: LedgerSnapshotSource;
  snapshotPayloadJson: LedgerSnapshotPayload;
  snapshotHash: string;
  hashVersion: number;
  closeSessionId?: string;
}

/** Input entry for TB: may include lineId. Input entry for JE: may include amountProvenance. */
export interface CreateLedgerSnapshotEntryInput {
  lineId?: string;
  accountName: string;
  debit: number;
  credit: number;
  accountCode?: string;
  description?: string;
  amountProvenance?: AmountProvenance;
}

export interface CreateLedgerSnapshotInput {
  tenantId: string;
  periodLabel: string;
  createdBy?: string;
  source: LedgerSnapshotSource;
  trialBalance: {
    entries: CreateLedgerSnapshotEntryInput[];
    totalDebits: number;
    totalCredits: number;
  };
  entries?: CreateLedgerSnapshotEntryInput[];
  closeSessionId?: string;
  /** Evidence manifest for v3+ snapshots. Built at certification time. */
  evidenceManifest?: EvidenceManifest;
}
