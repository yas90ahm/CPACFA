/**
 * Snapshot GL helpers — extract GL data from certified snapshots.
 * v4 snapshots include generalLedger; v3 snapshots do not.
 */

import type { LedgerSnapshot, LedgerSnapshotPayload, GeneralLedgerSnapshotEntry } from '../types/ledger_snapshot.js';

export interface ExtractedGLData {
  entries: GeneralLedgerSnapshotEntry[];
  entryCount: number;
  lineCount: number;
}

/**
 * Extract GL data from certified snapshot.
 * Returns null if snapshot does not contain GL (v3 or TB-only).
 */
export function extractGLFromSnapshot(snapshot: LedgerSnapshot | { snapshotPayloadJson: LedgerSnapshotPayload }): ExtractedGLData | null {
  const payload =
    typeof snapshot.snapshotPayloadJson === 'string'
      ? (JSON.parse(snapshot.snapshotPayloadJson) as LedgerSnapshotPayload)
      : snapshot.snapshotPayloadJson;

  if (!payload.generalLedger || !Array.isArray(payload.generalLedger) || payload.generalLedger.length === 0) {
    return null;
  }

  const entries = payload.generalLedger;
  const lineCount = entries.reduce((sum, e) => sum + (e.lines?.length ?? 0), 0);

  return {
    entries,
    entryCount: entries.length,
    lineCount,
  };
}

/**
 * Check if snapshot includes GL (v4).
 */
export function snapshotIncludesGL(snapshot: LedgerSnapshot | { snapshotPayloadJson: LedgerSnapshotPayload }): boolean {
  return extractGLFromSnapshot(snapshot) !== null;
}
