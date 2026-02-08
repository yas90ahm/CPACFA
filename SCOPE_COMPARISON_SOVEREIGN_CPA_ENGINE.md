# SCOPE COMPARISON — CODEBASE vs SOVEREIGN CPA ENGINE

*Compares codebase (src/, tests/, migrations/, package.json) against the Sovereign CPA Engine scope. No .md/.txt/.docx referenced.*

---

## 1. Core Purpose

| Scope Claim | Code Evidence | Status |
|-------------|---------------|--------|
| Deterministic financial certification infrastructure layer | `financialStatements.ts` — `buildValidatedStatements` enforces Debits=Credits, Assets=L+E; `certified_statements_service.ts` — `buildCertifiedStatementsFromSnapshot`; `integrity_gate_service.ts` — MathematicalIntegrityError | ✅ **ALIGNED** |
| Does not replace ERP, audit firms, or GAAP interpretation | `accounting_integration.ts` — syncs from QuickBooks/Xero/NetSuite; `server.ts` — audit routes for auditor verification; no GAAP interpretation engine | ✅ **ALIGNED** |
| Ensures structural soundness, mathematical consistency, governance before external exposure | `buildValidatedStatements` enforces equations; `close_session_service.ts` — certification gates; `period_lock_service.ts`; `segregation_service.ts` | ✅ **ALIGNED** |
| Prevents uncertified or structurally invalid states from being exported | `export.ts` — certified export requires `session.status === 'certified'`; `export_gate_service.ts` — checkExportGate blocks on chain/materiality; `audit_binder.ts` — requireCertifiedSession | ✅ **ALIGNED** |

---

## 2. Core Philosophy — Deterministic vs Agentic

| Scope Claim | Code Evidence | Status |
|-------------|---------------|--------|
| Deterministic layer enforces mathematical correctness | `financialStatements.ts` lines 4–7 — "Accounting Kill Switch"; `MathematicalIntegrityError` when totalDebits ≠ totalCredits or Assets ≠ L+E | ✅ **ALIGNED** |
| Deterministic layer controls state transitions (draft → locked → certified) | `close_session_service.ts` — `ALLOWED_TRANSITIONS`; `certify` only from `locked`; `advance` enforces readiness | ✅ **ALIGNED** |
| Deterministic layer creates immutable, canonical snapshots | `ledger_snapshot_service.ts` — `createSnapshotFromTrialBalanceAndEntries`; `snapshot_hash.ts` — canonical JSON + SHA-256 | ✅ **ALIGNED** |
| Deterministic layer is rule-based and non-agentic; cannot be overridden by AI | `financialStatements.ts` — `buildValidatedStatements` is pure; no AI in path. Agentic classification suggests overrides; `accountClassifier.ts` line 109 — "Statement totals are always derived from deterministic rules and/or user-confirmed overrides" | ✅ **ALIGNED** |
| Agentic layer assists with classification, flags anomalies, drafts narratives, suggests corrections | `classifyAccountsAgentic`, `runClassifier`, `runAdvisor`, `runJustifier`, `generateApprovalSummaryAgentic`, etc. | ✅ **ALIGNED** |
| Agentic layer cannot compute totals, override invariants, mutate certified states, or certify | Certification requires human approver (`segregation_service.ts` — `certify_close` requires approver); `buildCertifiedStatementsFromSnapshot` is deterministic; AI never calls certify | ✅ **ALIGNED** |
| Agentic layer is advisory only | `types/financial.ts` line 175 — "Boundary between Fact Data (deterministic) and Inferred Data (agentic)"; `accountClassifier.ts` — suggestedOverrides require user confirmation | ✅ **ALIGNED** |

---

## 3. Deterministic Certification Scope

| Scope Claim | Code Evidence | Status |
|-------------|---------------|--------|
| Debits equal credits | `financialStatements.ts` — `buildValidatedStatements` throws MathematicalIntegrityError on imbalance | ✅ **ALIGNED** |
| Balance sheet equation integrity | `financialStatements.ts` — check (B) Total Assets == Total Liabilities + Total Equity | ✅ **ALIGNED** |
| No plug usage beyond tolerance | `integrity_gate_service.ts` — `detectSuspiciousPlugs()` flags Miscellaneous/Suspense/Other >90%; `certified_statements_service.ts` — `finalIntegrityCheck` includes plug detection | ✅ **ALIGNED** |
| Period locking before certification | `close_session_service.ts` — certify only from `locked`; `period_lock_service.ts`; `segregation_service.ts` — `period_lock` requires approver | ✅ **ALIGNED** |
| Non-bypass certification gates | `export.ts` — `auditBypassFlagIfPresent` logs tampering_attempt; production never honors bypass | ✅ **ALIGNED** |
| Explicit human attribution for journal entries | `journal_entry.ts` — `createdBy`; `close_session_repository.ts` — `certified_by` | ✅ **ALIGNED** |
| Immutable certified snapshots | `ledger_snapshots` table; `evidence_manifest_service.ts` — "Deterministic: sort by journalEntryId, then evidenceId" | ✅ **ALIGNED** |
| Deterministic snapshot hashing (canonical JSON + SHA-256) | `snapshot_hash.ts` — `hashSnapshotPayload`; `canonicalStringifyKeysOnly`; `createHash('sha256')` | ✅ **ALIGNED** |
| Snapshot reproducibility guarantees | `ledger_snapshot_service.ts` — `buildSnapshotPayloadFromInput`; `recomputeAndVerifySnapshotHash` | ✅ **ALIGNED** |
| Export gating tied strictly to certified state | `export.ts` — `session.status !== 'certified'` returns 403; `export_gate_service.ts` — checkExportGate | ✅ **ALIGNED** |
| Hash-chained audit ledger verification | `audit_ledger_repository.ts` — append-only, hash-chained; `verifyChain` | ✅ **ALIGNED** |
| Certification guarantees: frozen state, reproducible snapshot, traceable chain, deterministic export | `close_session_service.ts` — `certifyCloseSession` creates snapshot, records certify_close; `certified_statements_service.ts` — `buildCertifiedStatementsFromSnapshot` | ✅ **ALIGNED** |

---

## 4. Evidence Anchoring Module (Optional)

| Scope Claim | Code Evidence | Status |
|-------------|---------------|--------|
| Anchors evidence proofs to accounting events | `evidence_manifest_service.ts` — `buildEvidenceManifest` links evidence to journal entries; `evidence_repository.ts` — `listEvidenceForCloseSession` | ✅ **ALIGNED** |
| Does not store files | `evidence_manifest_service.ts` — stores hashSha256, sizeBytes, mimeType, externalUri; no file storage | ✅ **ALIGNED** |
| SHA-256 hash of external documents | `evidence_manifest_service.ts` line 40 — `hashSha256` in manifest | ✅ **ALIGNED** |
| Metadata (size, MIME type, URI reference) | `evidence_manifest_service.ts` — `sizeBytes`, `mimeType`, `externalUri`, `externalProvider` | ✅ **ALIGNED** |
| Attachment attribution and timestamp | `evidence_manifest_service.ts` — `attachedBy`, `attachedAt` | ✅ **ALIGNED** |
| Immutable linkage to journal entries | `evidence_manifest_service.ts` — `journalEntryId` + `evidenceLinks`; deterministic sort | ✅ **ALIGNED** |
| Inclusion of evidence manifest in certified snapshot payload | `evidence_manifest_service.ts`; `ledger_snapshot_service.ts` — `createSnapshotFromTrialBalanceAndEntries` accepts `evidenceManifest`; `snapshot_hash.ts` — v3 includes evidence manifest in hash | ✅ **ALIGNED** |
| Deterministic ordering of evidence records | `evidence_manifest_service.ts` — sort by journalEntryId, then evidenceId | ✅ **ALIGNED** |
| Snapshot-level binding of financial state and evidence state | `snapshot_hash.ts` — `HASH_VERSION_WITH_EVIDENCE_MANIFEST`; payload includes evidenceManifest | ✅ **ALIGNED** |

---

## 5. Evidence Enforcement Module (Optional, Configurable)

| Scope Claim | Code Evidence | Status |
|-------------|---------------|--------|
| Tenants may enable policy-based enforcement | `evidence_policy_repository.ts`; `evidence_policy_service.ts` — `getEvidencePolicy`; `enforcement_mode` (off, warn_only, hard_block) | ✅ **ALIGNED** |
| Materiality thresholds | `evidence_policy_service.ts` — `materialityThreshold`; `computeJeAmount` | ✅ **ALIGNED** |
| Required evidence for certain JE types | `evidence_policy_service.ts` — `requiredAssertionTypes` by JE type | ✅ **ALIGNED** |
| Warn-only or hard block at certification | `evidence_policy_service.ts` — `checkEvidencePolicyForCertification` returns hardBlockers; `close_session_service.ts` — certification throws if hardBlockers | ✅ **ALIGNED** |
| Certification cannot complete if required evidence missing (when enforced) | `close_session_service.ts` — `checkEvidencePolicyForCertification`; readiness hardBlockers include evidence policy | ✅ **ALIGNED** |

---

## 6. Certified Evidence Manifest

| Scope Claim | Code Evidence | Status |
|-------------|---------------|--------|
| At certification time, deterministic Evidence Manifest | `close_session_service.ts` — `buildEvidenceManifest` called at certify; `evidence_manifest_service.ts` — deterministic sort | ✅ **ALIGNED** |
| Journal entries included in certified state | `evidence_manifest_service.ts` — `listJournalEntries` for closeSessionId | ✅ **ALIGNED** |
| Linked evidence records, evidence hashes, attribution data | `evidence_manifest_service.ts` — `EvidenceLinkInManifest` with hashSha256, attachedBy, attachedAt | ✅ **ALIGNED** |
| Manifest included in snapshot payload and covered by snapshot hash | `evidence_manifest_service.ts`; `ledger_snapshot_service.ts` — `createSnapshotFromTrialBalanceAndEntries` accepts evidenceManifest; `snapshot_hash.ts` — v3 hash includes evidenceManifest | ✅ **ALIGNED** |
| Binds Financial State + Evidence State into single certified artifact | `snapshot_hash.ts` — `HASH_VERSION_WITH_EVIDENCE_MANIFEST`; payload structure | ✅ **ALIGNED** |

---

## 7. Audit Ledger & Chain Verification

| Scope Claim | Code Evidence | Status |
|-------------|---------------|--------|
| All structural state transitions recorded in append-only ledger | `audit_ledger_repository.ts` — append-only; `audit_ledger_service.ts` — `recordOverride`, `recordMaterialEvent` | ✅ **ALIGNED** |
| Hash-chained | `audit_ledger_repository.ts` — `previousEntryHash`, `entry_hash`; `computeEntryHashV1/V2` | ✅ **ALIGNED** |
| Verifiable through deterministic chain verification | `audit_ledger_repository.ts` — `verifyChain` | ✅ **ALIGNED** |
| Detects mutation, tampering, truncation | `verifyChain` checks chain continuity | ✅ **ALIGNED** |
| Can be independently verified | `GET /api/verification/audit-chain` | ✅ **ALIGNED** |

---

## 8. Read-Only Auditor Verification Surface (Optional)

| Scope Claim | Code Evidence | Status |
|-------------|---------------|--------|
| Verify snapshot hash integrity | `GET /api/verification/snapshots/:snapshotId` — `recomputeAndVerifySnapshotHash` | ✅ **ALIGNED** |
| Verify audit chain continuity | `GET /api/verification/audit-chain` | ✅ **ALIGNED** |
| Verify evidence manifest hashes | `GET /api/verification/evidence-manifest/:snapshotId` | ✅ **ALIGNED** |
| Confirm certification timestamp and state immutability | Snapshot returns `createdAt`; chain returns `verifiedAt`; no explicit attestation of immutability | ⚠️ **PARTIAL** — timestamp stored but not cryptographically signed |

---

## 9. Export and Binder Gating

| Scope Claim | Code Evidence | Status |
|-------------|---------------|--------|
| Blocks binder and certified export if no certified snapshot exists | `audit_export_service.ts` — `getCertifiedStatementsForBinder` returns null when no snapshot; default requires certified snapshot | ✅ **ALIGNED** |
| Blocks if chain verification fails | `export_gate_service.ts` — `verifyChain`; returns CRITICAL_TAMPER_ALERT | ✅ **ALIGNED** |
| Blocks if snapshot hash verification fails | Truth Gate in `buildCertifiedStatementsFromSnapshot`; `finalIntegrityCheck` | ✅ **ALIGNED** |
| Blocks if required evidence (when enforced) is missing | `evidence_policy_service.ts` — hardBlockers block certification | ✅ **ALIGNED** |
| Exports derive strictly from certified state | `getCertifiedStatementsForBinder`; `buildCertifiedStatementsFromSnapshot` | ✅ **ALIGNED** |
| No silent fallback unless explicitly configured for legacy support | `env.ts` — `ALLOW_LEGACY_CERTIFIED_SOURCE`; default false | ✅ **ALIGNED** |

---

## 10. What the System Explicitly Does Not Do

| Scope Claim | Code Evidence | Status |
|-------------|---------------|--------|
| Does not replace ERP | `accounting_integration.ts` — syncs from QuickBooks/Xero/NetSuite; does not replace | ✅ **ALIGNED** |
| Does not store primary accounting records | `period_trial_balance` stores uploaded/synced TB; close adjustments and JEs are close-specific; not primary GL | ✅ **ALIGNED** |
| Does not replace audit opinion | Verification endpoints are read-only; no audit opinion | ✅ **ALIGNED** |
| Does not interpret GAAP judgment autonomously | AI suggests; human overrides recorded; no autonomous GAAP interpretation | ✅ **ALIGNED** |
| Does not replace document management systems | Evidence anchoring stores hashes/metadata; no file storage | ✅ **ALIGNED** |
| Does not eliminate audit fees | No claim in code | N/A |
| Does not certify management assertions beyond structural validity | Certification is structural (Truth Gate, evidence policy); no management assertion certification | ✅ **ALIGNED** |

---

## 11. Intended Outcome

| Scope Claim | Code Evidence | Status |
|-------------|---------------|--------|
| Eliminate structural surprise before external exposure | `buildValidatedStatements`; `finalIntegrityCheck`; export gate | ✅ **ALIGNED** |
| Prevent undocumented post-close mutations | Audit ledger; period lock; certified snapshot | ✅ **ALIGNED** |
| Reduce evidence scramble during audit | Evidence manifest; evidence anchoring; PBC index | ✅ **ALIGNED** |
| Provide deterministic, reproducible financial state | Snapshot hashing; canonical JSON | ✅ **ALIGNED** |
| Bind financial data and supporting evidence immutably | Evidence manifest in snapshot hash | ✅ **ALIGNED** |
| Collapse the gap between financial preparation and defensibility | Close workflow; certification; export gating | ✅ **ALIGNED** |

---

## 12. Market Position

| Scope Claim | Code Evidence | Status |
|-------------|---------------|--------|
| Deterministic pre-certification and financial state integrity protocol | `financialStatements.ts`; `integrity_gate_service.ts`; `certified_statements_service.ts` | ✅ **ALIGNED** |
| Operates alongside existing systems | `accounting_integration.ts`; syncs TB, pushes JEs | ✅ **ALIGNED** |
| Strengthens governance, traceability, audit readiness | Audit ledger; segregation; evidence policy; verification endpoints | ✅ **ALIGNED** |
| Without replacing accounting software or auditors | No replacement; verification surface for auditors | ✅ **ALIGNED** |

---

## GAPS AND DIVERGENCES

### Scope gaps (code does not fully implement)

1. **Legacy certified source** — `ALLOW_LEGACY_CERTIFIED_SOURCE` allows bypass when no certified snapshot exists. Scope says "No silent fallback unless explicitly configured"; this is configurable but creates two trust paths.

2. **Imbalanced draft export** — `ALLOW_IMBALANCED_DRAFT_EXPORT` allows draft export of imbalanced ledger with watermark. Scope emphasizes structural validity; draft export of invalid data is a policy choice.

3. **Export gate resolved-count mismatch** — `export_gate_service.ts` lines 99–108: when `resolvedCount !== ledgerResolutionCount`, gate returns `allowed: true` with informational message. Scope implies strict gating; this does not block.

4. **Certification timestamp** — No TSA or cryptographic signing of `certified_at`. Scope implies verifiable immutability; code stores timestamp only.

### Code beyond scope (not in scope statement)

1. **Agentic onboarding** — CoA mapping suggestions, first close guide. Scope mentions agentic advisory; onboarding is in scope.

2. **HITL staging** — Human approval workflow for overrides. Scope implies human attribution; HITL is explicit workflow.

3. **Pipelines** — Bank tx, AP/AR aging, payroll accrual. Scope focuses on certification; pipelines are operational.

4. **Data quality rules** — Configurable rules, exceptions, agentic remediation. Scope does not mention.

5. **Approvals** — Multi-step workflows, agentic summary. Scope does not mention.

5. **CPA module** — Optional `/api/cpa` when `CPA_ENABLED=true`. Scope does not mention CPA module.

---

## SUMMARY

| Category | Aligned | Partial | Gap |
|----------|---------|---------|-----|
| Core Purpose | 4 | 0 | 0 |
| Core Philosophy | 7 | 0 | 0 |
| Deterministic Certification | 12 | 0 | 0 |
| Evidence Anchoring | 9 | 0 | 0 |
| Evidence Enforcement | 5 | 0 | 0 |
| Certified Evidence Manifest | 5 | 0 | 0 |
| Audit Ledger | 5 | 0 | 0 |
| Auditor Verification | 3 | 1 | 0 |
| Export Gating | 6 | 0 | 0 |
| Does Not Do | 6 | 0 | 0 |
| Intended Outcome | 6 | 0 | 0 |
| Market Position | 4 | 0 | 0 |

**Overall:** The codebase strongly aligns with the Sovereign CPA Engine scope. The deterministic layer, certification gates, evidence anchoring, audit ledger, and export gating are implemented as specified. The main gaps are: (1) optional legacy certified source and imbalanced draft export env flags, (2) export gate not blocking on resolved-count mismatch, (3) no cryptographic signing of certification timestamp. The agentic layer is advisory; it does not compute totals or certify.
