/**
 * Certified Evidence Manifest — built at certification time.
 * Deterministic: sort by journalEntryId, then evidenceId.
 * No file storage; proof + reference metadata only.
 */

import type { Pool, PoolClient } from 'pg';

/** Pool or client (for transactional writes). Both expose .query(). */
type Queryable = Pool | PoolClient;
import type {
  EvidenceManifest,
  EvidenceManifestJournalEntry,
  EvidenceLinkInManifest,
} from '../types/ledger_snapshot.js';
import { listJournalEntries } from '../db/repositories/journal_entry_repository.js';
import { listEvidenceForCloseSession } from '../db/repositories/evidence_repository.js';

/**
 * Build evidence manifest for a close session.
 * For each journal entry (sorted by id), list evidence links (sorted by evidenceId).
 * Empty manifest when no evidence. Stable empty structure for determinism.
 */
export async function buildEvidenceManifest(
  client: Queryable,
  tenantId: string,
  closeSessionId: string
): Promise<EvidenceManifest> {
  const [jes, evidenceList] = await Promise.all([
    listJournalEntries(client as Pool, tenantId, { closeSessionId }),
    listEvidenceForCloseSession(client as Pool, tenantId, closeSessionId),
  ]);

  const evidenceByJe = new Map<string, EvidenceLinkInManifest[]>();
  for (const e of evidenceList) {
    const jeId = e.link.objectId;
    const link: EvidenceLinkInManifest = {
      evidenceId: e.id,
      hashSha256: e.hashSha256,
      sizeBytes: e.sizeBytes,
      attachedBy: e.attachedBy,
      attachedAt: e.attachedAt,
      ...(e.mimeType != null && { mimeType: e.mimeType }),
      ...(e.externalUri != null && { externalUri: e.externalUri }),
      ...(e.externalProvider != null && { externalProvider: e.externalProvider }),
      ...(e.label != null && { label: e.label }),
      ...(e.link.role != null && { role: e.link.role }),
      ...(e.link.requiredness != null && { requiredness: e.link.requiredness }),
      ...(e.link.assertionType != null && { assertionType: e.link.assertionType }),
    };
    const arr = evidenceByJe.get(jeId) ?? [];
    arr.push(link);
    evidenceByJe.set(jeId, arr);
  }

  const journalEntries: EvidenceManifestJournalEntry[] = [];
  for (const je of jes) {
    const links = evidenceByJe.get(je.id) ?? [];
    links.sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
    journalEntries.push({
      journalEntryId: je.id,
      evidenceLinks: links,
    });
  }
  journalEntries.sort((a, b) => a.journalEntryId.localeCompare(b.journalEntryId));

  return { journalEntries };
}
