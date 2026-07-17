# Sovereign CPA Engine — Deterministic Core Audit

**Audit Date:** 2025-02-07  
**Scope:** Integrity gate, state machine, snapshot hash, audit ledger, export gate, evidence anchoring, AI boundaries, HITL, multi-tenant isolation, env validation, error handling, and test coverage.

---

## AREA 1: INTEGRITY GATE ENFORCEMENT

**Status:** ✅ IMPLEMENTED

### 1.1 Where is `runIntegrityGate()` called?

| Location | File | Context |
|----------|------|---------|
| `finalIntegrityCheck()` | `src/services/integrity_check.ts:40` | Wraps runIntegrityGate for export/binder |
| `buildFinancialStatements` (agent tool) | `src/agents/tools/buildFinancialStatements.ts:244` | Agent tool checks gate before returning |
| `runProfessionalReview` | `src/routes/audit/audit_professional_review.ts:50` | Professional review UX |

### 1.2 Where is `assertIntegrityGateOrThrow()` called?

| Location | File | Context |
|----------|------|---------|
| `validateTrialBalanceAndBalanceSheet()` | `src/services/integrity_gate_service.ts:186` | Validates TB/BS (used by audit_export_service) |
| `statementGenerator.ts` | `src/services/statementGenerator.ts:97` | `generateStatements()` — throws before output |

### 1.3 Callers of `finalIntegrityCheck()` (Truth Gate)

| Location | File | Context |
|----------|------|---------|
| `buildCertifiedStatementsFromSnapshot()` | `src/services/certified_statements_service.ts:73` | Certification path |
| `audit_export_service` | `src/services/audit_export_service.ts:198, 213` | Certified binder/export |
| `export.ts` (PDF) | `src/routes/export.ts:290` | PDF export |
| `export.ts` (CSV) | `src/routes/export.ts:610` | CSV export |
| `precheck_board_ready_service` | `src/services/precheck_board_ready_service.ts:202` | Board-ready precheck |

### 1.4 Code paths to certification or export that DON'T call integrity gate

- **Certification:** `certifyCloseSession()` → `buildCertifiedStatementsFromSnapshot()` → `finalIntegrityCheck()`. **Enforced.**
- **Export PDF/CSV:** Both call `finalIntegrityCheck()` before serving. **Enforced.**
- **Binder:** `getCertifiedStatementsForBinder()` uses `buildCertifiedStatementsFromSnapshot()` internally; route also runs `checkExportGate()`. **Enforced.**

### 1.5 Tolerance parameter

- **Source:** Default from `getToleranceForGate()` in `integrity_gate_service.ts` — reads `shared/config/financial_rules.json` (`roundingTolerance` or `materiality.defaultThreshold` per `equations.debits_equal_credits.toleranceKey`).
- **Override:** `IntegrityGateInput.tolerance` is optional. Callers can pass `tolerance` (e.g. `getRoundingTolerance()`). **No user input override** — tolerance comes from config or service, not request body.

### 1.6 `MathematicalIntegrityError` catch-and-continue

- **ingest.ts:705–724:** Caught to return 422 with `blocked: true` — does NOT continue; returns error response.
- **parser.ts:363–365, 472–474:** Same — returns 422.
- **buildFinancialStatements.ts:294:** Agent tool catches to return failure to agent — does NOT persist.
- **close_sessions.ts:578:** Caught for 422 response — does NOT certify.

No code path catches `MathematicalIntegrityError` and continues to certification or export.

### 1.7 Integrity gate enforcement by flow

| Flow | Mechanism | Enforced? |
|------|------------|-----------|
| **Trial balance ingest** | `buildValidatedStatements()` in `financialStatements.ts` — own TB/BS check, throws `MathematicalIntegrityError` (same semantics as gate) | ✅ Yes (duplicate logic, not `runIntegrityGate`) |
| **Close session certification** | `buildCertifiedStatementsFromSnapshot()` → `finalIntegrityCheck()` | ✅ Yes |
| **Certified export (PDF/CSV)** | `finalIntegrityCheck()` before serving; certified path also requires `session.status === 'certified'` | ✅ Yes |
| **Binder creation** | `getCertifiedStatementsForBinder()` uses certified statements path; `checkExportGate()` + Truth Gate | ✅ Yes |

**Note:** Ingest uses `financialStatements.buildValidatedStatements` (duplicate TB/BS logic) rather than `runIntegrityGate`. Semantics match; consolidation possible.

---

## AREA 2: STATE MACHINE ENFORCEMENT

**Status:** ✅ IMPLEMENTED

### 2.1 ALLOWED_TRANSITIONS

```ts
// src/services/close_session_service.ts:27-35
const ALLOWED_TRANSITIONS: Record<CloseSessionStatus, CloseSessionStatus[]> = {
  draft: ['in_progress'],
  in_progress: ['draft', 'ready_for_review'],
  ready_for_review: ['in_progress', 'finalized'],
  finalized: ['ready_for_review', 'locked'],
  locked: ['certified'],
  certified: [],
};
```

### 2.2 Functions that modify `close_sessions.status`

| Function | File | Mechanism |
|----------|------|------------|
| `updateCloseSessionStatusInternal()` | `close_session_service.ts:179-201` | Validates transition, calls `repo.updateCloseSessionStatus()` |
| `advanceSession()` | `close_session_service.ts` | Uses `updateCloseSessionStatusInternal()` |
| `certifyCloseSession()` | `close_session_service.ts:219-357` | Uses `repo.updateCertification()` (sets status='certified') |

### 2.3 Direct SQL bypassing state machine

- **close_session_repository.ts:196:** `UPDATE close_sessions SET status = $1` — called **only** from `updateCloseSessionStatus()`, which is invoked **only** by `updateCloseSessionStatusInternal()`.
- **close_session_repository.ts:216:** `UPDATE close_sessions SET status = 'certified'` — in `updateCertification()`, called **only** from `certifyCloseSession()`.
- No raw SQL from routes or other services updates `close_sessions.status` directly.

### 2.4 `certifyCloseSession()` status check

```ts
// close_session_service.ts:227-232
if (session.status !== 'locked') {
  throw new CloseSessionError(
    `Certification only allowed from locked; current status is ${session.status}`,
    'NOT_LOCKED'
  );
}
```

Also re-checked inside transaction at lines 298-302.

### 2.5 Backward transitions

- **certified → locked:** Not allowed — `certified: []` means no transitions out.
- State machine is strictly forward except explicit back transitions (e.g. `in_progress` → `draft`).

### 2.6 State transitions logged to audit_ledger

- `advanceSession()` records `close_lock` when transitioning to `locked` via `recordMaterialEvent()`.
- `certifyCloseSession()` records `certify_close`.
- `advanceSession()` does not record every intermediate transition (e.g. draft→in_progress); only material events.

---

## AREA 3: SNAPSHOT HASH DETERMINISM

**Status:** ✅ IMPLEMENTED

### 3.1 `hashSnapshotPayload()` function

```ts
// src/lib/snapshot_hash.ts:193-206
export function hashSnapshotPayload(
  payload: LedgerSnapshotPayload,
  options?: HashSnapshotPayloadOptions
): string {
  const hashVersion = options?.hashVersion ?? HASH_VERSION_CANONICAL_MONEY;
  const useCanonicalMoney = hashVersion !== HASH_VERSION_LEGACY;
  const hashInput = buildHashInput(payload, { useCanonicalMoney });
  if (hashVersion >= HASH_VERSION_WITH_EVIDENCE_MANIFEST) {
    const manifest = payload.evidenceManifest ?? { journalEntries: [] };
    hashInput.evidenceManifest = manifest;
  }
  validateHashInput(hashInput);
  const json = canonicalStringifyKeysOnly(hashInput);
  return createHash('sha256').update(json, 'utf8').digest('hex');
}
```

### 3.2 `canonicalStringifyKeysOnly()`

- **File:** `src/lib/canonical_json.ts`
- Recursively sorts object keys alphabetically, omits undefined, preserves array order (caller must pre-sort domain arrays).
- Used when domain arrays (entries) are pre-sorted by `entrySortKey`.

### 3.3 `entrySortKey()`

```ts
// src/lib/snapshot_hash.ts:46-59
function entrySortKey(e: LedgerSnapshotEntry): string {
  const prov = e.amountProvenance != null ? canonicalStringifyLegacy(e.amountProvenance) : '';
  return [
    String(e.accountName ?? ''),
    normalizeMoney(e.debit ?? 0),
    normalizeMoney(e.credit ?? 0),
    String(e.lineId ?? ''),
    String(e.accountCode ?? ''),
    String(e.description ?? ''),
    prov,
  ].join('\0');
}
```

Fields: accountName, debit, credit, lineId, accountCode, description, amountProvenance.

### 3.4 Amount normalization (v2+)

- v2+: `toCanonicalMoneyPayload()` uses `normalizeMoney()` for debit, credit, totalDebits, totalCredits.
- Eliminates JS float drift.

### 3.5 Evidence manifest in hash (v3)

- When `hashVersion >= HASH_VERSION_WITH_EVIDENCE_MANIFEST` (3), `evidenceManifest` is added to `hashInput` before serialization.

### 3.6 Non-deterministic fields in hash

- **Timestamps:** Not in hash input (`buildHashInput` uses only `hash_version`, `trialBalance`, `entries`, `evidenceManifest`).
- **UUIDs:** Not in hash input; `lineId` may be stable from provenance.
- **Map/Set:** Not used in hash input; objects use sorted keys.

### 3.7 `buildHashInput()` stripping

- Uses `normalizePayloadForHash()` — sorts entries by `entrySortKey`.
- `toCanonicalMoneyPayload()` normalizes amounts; no id, createdAt, or DB-generated fields.

### 3.8 Test for same snapshot → same hash

- **`tests/integration/snapshot_reproducibility.test.ts`:** Certified session snapshot rebuilt deterministically; recomputed hash === stored `snapshot_hash`.

---

## AREA 4: AUDIT LEDGER CHAIN VERIFICATION

**Status:** ✅ IMPLEMENTED

### 4.1 `verifyChain()` function

```ts
// src/db/repositories/audit_ledger_repository.ts:175-234
export async function verifyChain(pool: Queryable, tenantId: string): Promise<AuditLedgerVerifyResult> {
  const r = await pool.query<VerifyRow>(
    `SELECT ... FROM audit_ledger WHERE tenant_id = $1 ORDER BY created_at ASC`,
    [tenantId]
  );
  let prevHash: string | null = null;
  for (const row of rows) {
    const version = row.hash_version === HASH_VERSION_V2 ? HASH_VERSION_V2 : HASH_VERSION_V1;
    const payload = { ... };
    const computed = version === HASH_VERSION_V2 ? computeEntryHashV2(payload) : computeEntryHashV1(payload);
    if (computed !== row.entry_hash) {
      return { valid: false, brokenAtEntryId: row.id, message: 'Hash mismatch', ... };
    }
    if (row.previous_entry_hash !== prevHash) {
      return { valid: false, brokenAtEntryId: row.id, message: 'Chain link broken (previous_entry_hash)', ... };
    }
    prevHash = row.entry_hash;
  }
  return { valid: true, entryCount: rows.length, verifiedAt, ... };
}
```

### 4.2 v1 vs v2 hash handling

- v1: Raw JSON key order, `createdAt` as stored.
- v2: `canonicalizeForHash()` for deterministic payload; sorted keys + normalized values.

### 4.3 `computeEntryHashV1` vs `computeEntryHashV2`

- V1: `JSON.stringify` of raw payload.
- V2: `canonicalizeForHash()` on `deterministicFlagSnapshot` and `agentDissentSnapshot`.

### 4.4 Verification checks

- ✅ `ORDER BY created_at ASC`
- ✅ First entry: `prevHash` starts null; first row must have `previous_entry_hash === null`
- ✅ Recomputes each entry hash and compares to stored
- ✅ Each `previous_entry_hash` must match prior `entry_hash`

### 4.5 Return values

- **Success:** `{ valid: true, entryCount, verifiedAt, latestEntryHash, latestEntryId }`
- **Failure:** `{ valid: false, brokenAtEntryId, message, entryCount, verifiedAt }`

### 4.6 Test coverage

- **audit_chain_verification.test.ts:** Valid chain returns 200 verified:true; broken chain (tampered hash) returns verified:false.
- **export_certified_gate.test.ts:** Export gate blocks on chain failure.
- **audit_ledger_service.test.ts:** Unit tests for chain logic.

---

## AREA 5: EXPORT GATE ENFORCEMENT

**Status:** ✅ IMPLEMENTED

### 5.1 `checkExportGate()` validations

1. **Materiality (period_export_checks):** `roundingGapExceedsMateriality`, `aggregateRoundingExceedsMateriality` → CRITICAL_TAMPER_ALERT
2. **Audit chain:** `verifyChain()` → CRITICAL_TAMPER_ALERT if invalid
3. **Integration:** When `ENABLE_INTEGRATED_SUPERVISOR`, blocks on unresolved conflicts, RESOLUTION_MISMATCH

### 5.2 HTTP status and error messages

- **403:** `allowed: false` with `alert: CRITICAL_TAMPER_ALERT` | `UNRESOLVED_CONFLICTS_ALERT` | `RESOLUTION_MISMATCH`
- Export routes return 403 with `code` from gate result.

### 5.3 Routes exporting certified data

| Route | File | Calls checkExportGate? |
|-------|------|------------------------|
| POST /api/export/pdf (certified) | export.ts | ✅ Yes (line 174) |
| POST /api/export/csv (certified) | export.ts | ✅ Yes (line 545) |
| GET /api/audit/binder | audit_binder.ts | ✅ Yes (line 105) |

### 5.4 Bypass flags

| Flag | Effect | Prod/demo forced |
|------|--------|------------------|
| `allowLegacyCertifiedSource` | Use legacy source when no certified snapshot | Forced false |
| `exportBypassCertification` | Ignored; audit tampering_attempt if present | N/A |
| `skipValidation` | Not present | N/A |
| `bypassGate` | Not present | N/A |

### 5.5 Prod/demo bypass enforcement

- `runtime_mode.ts` `applyModeDefaults()` forces `ALLOW_LEGACY_CERTIFIED_SOURCE=false`, `ALLOW_IMBALANCED_DRAFT_EXPORT=false` in prod/demo.

---

## AREA 6: DRAFT VS CERTIFIED EXPORT

**Status:** ✅ IMPLEMENTED

### 6.1 PDF creation

- **File:** `src/services/pdf_export.ts`
- **Function:** `createPdfFromStructuredPayload()`

### 6.2 Draft watermark logic

```ts
// pdf_export.ts:196-205
const isDraft = payload.exportMode === 'draft';
if (isDraft) {
  page.drawText('DRAFT — NOT CERTIFIED. This document is for internal/review use only...', ...);
  if (payload.imbalanceAmount != null && !Number.isNaN(payload.imbalanceAmount)) {
    page.drawText(`IMBALANCED by $${Math.abs(payload.imbalanceAmount).toFixed(2)} — For review only.`, ...);
  }
}
// ...
if (isDraft) {
  for (const p of pages) {
    p.drawText('DRAFT — NOT CERTIFIED' + imbalanceLabel, { ... rotate: degrees(-30) });
  }
}
```

### 6.3 Certified watermark

- Certified exports: no watermark. `isDraft` is false when `exportMode === 'certified'`.

### 6.4 Watermark condition

- **session.status:** Used to set `exportMode`; certified requires `session.status === 'certified'`.
- **ALLOW_IMBALANCED_DRAFT_EXPORT:** When true and imbalanced, draft export allowed with `imbalanceAmount` banner; prod/demo forces false.

### 6.5 Certified export hash/timestamp

- Certified PDF headers: `X-Certified-Snapshot-Hash`, `X-Certified-Snapshot-Hash-Version`, `X-Certified-Source`.
- `compliancePackage.ledgerHash` shown in PDF when present.

---

## AREA 7: EVIDENCE ANCHORING

**Status:** ✅ IMPLEMENTED

### 7.1 Evidence–journal entry linkage

- **Tables:** `evidence_records`, `evidence_links` (object_type='journal_entry', object_id=je.id)
- **Repo:** `evidence_repository.ts` — `listEvidenceForCloseSession()` joins evidence to JEs via links

### 7.2 Manifest building

```ts
// evidence_manifest_service.ts:25-67
export async function buildEvidenceManifest(...): Promise<EvidenceManifest> {
  const [jes, evidenceList] = await Promise.all([...]);
  const evidenceByJe = new Map<...>();
  for (const e of evidenceList) {
    const link: EvidenceLinkInManifest = {
      evidenceId: e.id,
      hashSha256: e.hashSha256,
      sizeBytes: e.sizeBytes,
      attachedBy: e.attachedBy,
      attachedAt: e.attachedAt,
      ...
    };
    evidenceByJe.get(jeId)?.push(link);
  }
  journalEntries.sort((a, b) => a.journalEntryId.localeCompare(b.journalEntryId));
  links.sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
  return { journalEntries };
}
```

### 7.3 When manifest is generated

- At certification in `certifyCloseSession()` before creating snapshot.

### 7.4 Manifest fields per evidence

- evidenceId, hashSha256, sizeBytes, mimeType, attachedBy, attachedAt, optional: externalUri, externalProvider, label, role, requiredness, assertionType

### 7.5 Evidence hash (SHA-256)

- **Storage:** `evidence_records.hash_sha256` — provided at create time via `CreateEvidenceRecordInput.hashSha256`.
- **Compute:** Caller must compute; repository does not hash file content. No placeholder in manifest service — value comes from DB.

### 7.6 Manifest in snapshot payload

- Yes — `createSnapshotFromTrialBalanceAndEntries()` accepts `evidenceManifest` and includes it in payload.

### 7.7 Manifest in snapshot hash (v3)

- Yes — when `hashVersion >= 3`, `evidenceManifest` included in `hashInput`.

### 7.8 Sorting

- Journal entries: `journalEntryId.localeCompare`
- Evidence links per JE: `evidenceId.localeCompare`

---

## AREA 8: EVIDENCE POLICY ENFORCEMENT

**Status:** ✅ IMPLEMENTED

### 8.1 `checkEvidencePolicyForCertification()`

- **File:** `src/services/evidence_policy_service.ts:56`
- **Called from:** `close_session_service.certifyCloseSession()`, `close_checklist_readiness_service.computeReadiness()`

### 8.2 Policy checks

- Reads `evidence_policy` (enforcement_mode, materialityThreshold, requiredAssertionTypes by JE type).
- For each material JE (amount >= threshold): requires evidence with matching assertion type.
- `effectiveMode`: 'off' | 'warn_only' | 'hard_block'

### 8.3 Configurable policies

- `enforcementMode`, `materialityThreshold`, `requiredAssertionTypes` (per JE type, e.g. reconciliation, manual_entry).

### 8.4 Certification block

- When `effectiveMode === 'hard_block'` and required evidence missing → `hardBlockers` → `CloseSessionError` in certification.

### 8.5 Enforcement modes

- `off`: no check
- `warn_only`: soft warnings
- `hard_block`: blocks certification

---

## AREA 9: AI MUTATION BOUNDARIES

**Status:** ✅ IMPLEMENTED — AI does not mutate certified state

### 9.1 Database writes in src/ai/

- **ai_call_log_repository.ts:** `INSERT INTO ai_call_log` — audit log only; no ledger/snapshot/close_session writes.

### 9.2 Database writes in src/agents/

- None — agents call services; no direct DB writes.

### 9.3 AI writes to deterministic tables

- **ledger_snapshots:** No
- **period_trial_balance:** No (ingest writes; AI may influence via HITL proposals)
- **close_sessions:** No
- **journal_entry_lines:** No (posting is human-triggered)
- **audit_ledger:** No

### 9.4 AI output storage

- `tenant_ai_proposals` — proposals
- `ai_call_log` — request/response log
- `tenant_hitl_staging` — via `submitToStaging()` (service, not AI direct)

### 9.5 HITL resolution

- Human-triggered via `POST /api/hitl/resolve` (approve/reject) or `resolve-ingest` equivalent.
- AI does not auto-apply; proposals stay pending until human approves.

---

## AREA 10: HITL STAGING FOR IMBALANCED TRIAL BALANCE

**Status:** ✅ IMPLEMENTED

### 10.1 `submitToStaging()`

- **File:** `src/services/hitl_orchestrator.ts:106`
- Persists to `tenant_hitl_staging` when pool/tenantId provided.

### 10.2 Imbalanced TB → staging vs period_trial_balance

- Ingest/parser call `buildValidatedStatements`; if it throws `MathematicalIntegrityError`, flow goes to HITL staging (e.g. `submitToStaging` in ingest, parser, result_generator, proposeTrialBalanceAdjustment).
- Balanced TB → normal ingest → `period_trial_balance`.

### 10.3 Resolution endpoint

- `POST /api/hitl/resolve` — body: `{ id, action: 'approve'|'reject', reason?, signedBy? }`
- Overrides (policy_change, flag_override) append to audit_ledger.
- `receiveHumanApproval()` / `receiveHumanRejection()` update staging status.

### 10.4 Resolution requires user input

- Yes — `action` and optional `reason`/`signedBy` from request body; no AI auto-resolve.

### 10.5 Post-resolution validation

- Approved items may trigger bridge commands or justification creation; trial balance re-validation occurs on subsequent ingest/build, not automatically on approval.

### 10.6 Resolution attribution

- `signedBy` stored; `approvedAt`/`approvedBy`, `rejectedAt`/`rejectedReason` in staging item.

---

## AREA 11: MULTI-TENANT ISOLATION

**Status:** ⚠️ PARTIAL — Requires systematic review

### 11.1 Repository tenant filtering

- Repositories use `WHERE tenant_id = $1` (or equivalent) for tenant-scoped tables.
- Count grep shows tenant_id used across repositories.

### 11.2 Body tenant injection

- **Guard:** `isBodyTenantInjectionAllowed()` in `src/lib/env.ts`
- Returns false when: mode=prod|demo, REQUIRE_AUTH=true, REQUIRE_TENANT_CONTEXT=true
- Used in ingest (`injectTenantFromBody`) — only when allowed.

### 11.3 Control/shared tables

- `tenants`, `audit_ledger` (tenant_id filtered), migrations — some control tables may not have tenant_id; expected for shared config.

---

## AREA 12: ENVIRONMENT VALIDATION

**Status:** ✅ IMPLEMENTED

### 12.1 Startup validation

- **applyModeDefaults()** — `runtime_mode.ts` — called at server startup
- **assertDeploymentConfigSafe()** — `deployment_config_guard.ts` — REQUIRE_AUTH, REQUIRE_TENANT_CONTEXT
- **assertSigningKeysInStrictMode()** — `cert_signing.ts` — signing keys in prod/demo
- **assertNoDestructiveInStagingOrProduction()** — destructive guards

### 12.2 Conflicting config checks

- Prod/demo: `REQUIRE_AUTH=false` → throw/exit
- Prod/demo: `REQUIRE_TENANT_CONTEXT=false` → throw/exit
- Prod/demo: `ALLOW_LEGACY_CERTIFIED_SOURCE=true`, `ALLOW_IMBALANCED_DRAFT_EXPORT=true` → forced to false
- `ENABLE_DEV_API=true` → forced to false in prod/demo

### 12.3 Required env vars

- `DATABASE_URL` — checked by `isDbConfigured()`; readiness fails if not configured
- `JWT_SECRET` — used by auth; not explicitly validated at startup (auth may fail at runtime)

---

## AREA 13: ERROR HANDLING CONSISTENCY

**Status:** ⚠️ PARTIAL — Generally consistent

### 13.1 HTTP status codes used

- **400:** Validation, missing params (e.g. periodLabel, closeSessionId)
- **401:** Unauthorized
- **403:** Export gate blocked, close session not found for certified export, tampering
- **404:** Resource not found
- **409:** CPA-CFA conflict
- **422:** MathematicalIntegrityError, final integrity check failed, advance blocked
- **500:** Unhandled errors via send500

### 13.2 Custom error classes

- `MathematicalIntegrityError` — 422
- `CloseSessionError` — various codes
- `CertifiedIntegrityError` — certification Truth Gate
- Export gate returns `allowed: false` with alert codes

### 13.3 Inconsistencies

- Some routes may use 404 for "feature disabled" where 403 might be more appropriate; no major inconsistencies found in core paths.

---

## AREA 14: TEST COVERAGE

**Status:** ✅ IMPLEMENTED — Good coverage

### 14.1 Test counts

- **Unit:** ~42 files in `tests/unit/`
- **Integration:** ~34 files in `tests/integration/`

### 14.2 Coverage by area

| Area | Unit Tests | Integration Tests |
|------|------------|-------------------|
| Integrity gate | statementGenerator_integrity_gate.test.ts | integrity_gate_422.test.ts |
| Snapshot hash | ledger_snapshot_hash.test.ts | snapshot_reproducibility.test.ts |
| Audit chain | audit_ledger_service.test.ts | audit_chain_verification.test.ts |
| State machine | close_session_service.test.ts | close_sessions_advance.test.ts |
| Export gate | export_gate_service.test.ts | export_certified_gate.test.ts |
| Evidence manifest | — | evidence_manifest_certification.test.ts, evidence_manifest_verification.test.ts |
| Evidence policy | evidence_policy_service.test.ts | evidence_policy_enforcement.test.ts |

### 14.3 Gaps

- No dedicated E2E test driving full flow from ingest → certify → export.
- Some edge cases in evidence hashing (caller-provided vs server-computed) could use more tests.

---

## AREA 15: KNOWN ISSUES AND TODOS

**Status:** ⚠️ PARTIAL — Minor items

### 15.1 Stubs / placeholders

| File | Line | Notes |
|------|------|-------|
| `gaap_reconciliation_service.ts` | 3 | "Stub: pass-through with optional future LIFO/FIFO..." |
| `fixed_asset_service.ts` | 95 | "units_of_production: stub, no usage input" |
| `fixed_asset_service.ts` | 217 | "Switch to SL when SL > DDB not implemented" |
| `audit_forensics.ts` | 10 | "stub (agentic forensics quarantined)" |
| `job_handlers.ts` | 25 | "TODO: load session/document and run agentic cleanup" |

### 15.2 TODO/FIXME/XXX

- `agentic_fx_currency.ts:17` — "XXX" in prompt placeholder (currency code), not a code TODO
- No critical TODOs in deterministic core paths

### 15.3 Console.log / debug

- `runtime_mode.ts`, `deployment_config_guard.ts` — `console.warn` for dev banners; appropriate
- No obvious debug logs in production paths

---

## SUMMARY

### Production-ready

- Integrity gate (TB balance, BS equation, plug detection)
- State machine (close session transitions)
- Snapshot hash determinism (SHA-256, v3 with evidence manifest)
- Audit ledger chain verification
- Export gate (chain, materiality, conflicts)
- Draft vs certified PDF watermarking
- Evidence anchoring and manifest
- Evidence policy enforcement
- AI mutation boundaries (no certified state mutation)
- HITL staging and human resolution
- Environment validation (MODE, auth, tenant context)

### Partially implemented

- Multi-tenant isolation: systematic audit of all repositories recommended
- Error handling: minor inconsistencies possible
- Ingest path: uses duplicate integrity logic in `financialStatements` instead of `runIntegrityGate`

### Missing

- No critical gaps in deterministic core
- E2E test for full ingest → certify → export flow
- Some fixed-asset and reconciliation stubs (outside core)

### Critical issues

- **None** — Deterministic core appears sound; no paths bypass integrity gate, state machine, or export gate in production configuration.
