# Sovereign CPA Engine — Implementation Overview

## Architecture & Structure

### Project Structure

```
CPACFA/
├── src/                    # Backend (TypeScript/Node.js)
│   ├── agents/             # LLM agents (Supervisor, tools)
│   ├── ai/                 # AI orchestrator, adapters, prompts, schemas
│   ├── auth/               # JWT auth, middleware
│   ├── bridge/             # Protocol bridge
│   ├── db/                 # Postgres, migrations, repositories
│   ├── lib/                # Utilities (canonical_json, snapshot_hash, cert_signing, env)
│   ├── llm/                # Provider, guardrails
│   ├── memory/             # Policy memory, vector store
│   ├── middleware/        # Request ID, validation
│   ├── routes/             # Express routers (audit, close, export, trial-balance, etc.)
│   ├── services/           # Business logic (210+ files)
│   ├── types/              # TypeScript interfaces
│   └── utils/              # Decimal, line ID helpers
├── frontend/               # Next.js 14 + React
│   ├── app/                # Pages (auditor, consolidation, diagnostics, login)
│   ├── components/         # CFO dashboard, agentic panels, upload zones
│   └── lib/                # API client, auth
├── migrations/             # SQL migrations (074+)
├── tests/                  # Jest (unit + integration)
├── connectors/             # Python ERP adapters
└── mcp_server/             # Python MCP server
```

### Tech Stack

- **Backend:** Node.js 18+, TypeScript, Express, pg (Postgres)
- **Frontend:** Next.js 14, React 18, Tailwind
- **AI:** Anthropic SDK, optional Mistral/OpenAI
- **PDF:** pdf-lib
- **Auth:** JWT, bcrypt

### Organization

- **Monorepo:** Single workspace with backend (`src/`), frontend (`frontend/`), shared config
- **Layered:** Routes → Services → Repositories → DB
- **Database:** Postgres (control DB + per-tenant BYOD). Tenant pools from `tenants.database_url`; shared control DB when no URL.

---

## Core Deterministic Layer Implementation

### Accounting Entries (Debits/Credits)

Entries are modeled as `LedgerSnapshotEntry`:

```ts
// src/types/ledger_snapshot.ts
interface LedgerSnapshotEntry {
  lineId?: string;
  accountName: string;
  debit: number;
  credit: number;
  accountCode?: string;
  description?: string;
  amountProvenance?: AmountProvenance;
}
```

Stored in:
- `period_trial_balance` (tenant, period_label, entries JSON)
- `ledger_snapshots` (snapshot_payload_json)
- `journal_entry_lines` (with amount_provenance)

### Accounting Equation Enforcement

**Integrity Gate** (`src/services/integrity_gate_service.ts`):

- `runIntegrityGate()` enforces:
  - Trial balance: `|totalDebits - totalCredits| <= tolerance`
  - Balance sheet: `|totalAssets - (totalLiabilities + totalEquity)| <= tolerance`
- Tolerance from `shared/config/financial_rules.json` (roundingTolerance)
- `assertIntegrityGateOrThrow()` throws `MathematicalIntegrityError` (422) on failure

```ts
// src/services/integrity_gate_service.ts (excerpt)
export function runIntegrityGate(input: IntegrityGateInput): IntegrityGateResult {
  const tolerance = input.tolerance ?? getToleranceForGate();
  const { totalDebits, totalCredits } = getTrialBalanceTotals(input.trialBalance);
  const { totalAssets, totalLiabilities, totalEquity } = input.balanceSheet;

  const trialBalanceGapExceeds = absGt(totalDebits, totalCredits, tolerance);
  const trialBalanceBalances = !trialBalanceGapExceeds;

  const rhs = totalLiabilities + totalEquity;
  const balanceSheetGapExceeds = absGt(totalAssets, rhs, tolerance);
  const balanceSheetBalances = !balanceSheetGapExceeds;

  const passed = trialBalanceBalances && balanceSheetBalances;
  return { passed, error: passed ? undefined : INTEGRITY_GATE_CRITICAL_MESSAGE, checks: { trialBalanceBalances, balanceSheetBalances } };
}
```

**Truth Gate** (`src/services/integrity_check.ts`, `certified_statements_service.ts`):

- `finalIntegrityCheck()` runs before certified export
- Plug detection: blocks when Suspense/Miscellaneous/Other accounts absorb ≥90% of net activity

### State Transitions (Draft → Locked → Certified)

```ts
// src/services/close_session_service.ts
const ALLOWED_TRANSITIONS = {
  draft: ['in_progress'],
  in_progress: ['draft', 'ready_for_review'],
  ready_for_review: ['in_progress', 'finalized'],
  finalized: ['ready_for_review', 'locked'],
  locked: ['certified'],
  certified: [],
};
```

- Transitions enforced in `advanceSession()` and `updateCloseSessionStatus()`
- Certification only from `locked`; requires readiness (checklist) and no blockers

### Certification Validation

Before certification (`certifyCloseSession`):

1. Session must be `locked`
2. `buildCertifiedStatementsFromSnapshot()` runs Truth Gate (TB balance, BS equation, plug detection)
3. Evidence policy check (`checkEvidencePolicyForCertification`)
4. Snapshot created from adjusted TB + evidence manifest
5. Certification artifact built (hash + Ed25519 sign)
6. Audit ledger `certify_close` event

### Snapshots

- **Storage:** `ledger_snapshots` (id, tenant_id, period_label, snapshot_payload_json, snapshot_hash, hash_version, close_session_id)
- **Payload:** `trialBalance` (entries, totalDebits, totalCredits), optional `entries`, optional `evidenceManifest`
- **Source:** `createSnapshotFromTrialBalanceAndEntries()` in `ledger_snapshot_service.ts`

### Hashing (SHA-256)

- **Snapshot:** `hashSnapshotPayload()` in `src/lib/snapshot_hash.ts`
  - Canonical JSON via `canonicalStringifyKeysOnly`
  - Entries sorted by `entrySortKey` (accountName, debit, credit, lineId, accountCode, description, provenance)
  - Amounts as canonical strings (v2+ via `normalizeMoney()`)
  - hash_version 3: includes `evidenceManifest`
- **Hash version:** `getHashVersionForStorage()` returns 3 (HASH_VERSION_WITH_EVIDENCE_MANIFEST)

```ts
// src/lib/snapshot_hash.ts (excerpt)
export function hashSnapshotPayload(payload: LedgerSnapshotPayload, options?: HashSnapshotPayloadOptions): string {
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

### Audit Ledger (Append-Only, Hash-Chained)

- **Table:** `audit_ledger` (id, tenant_id, period_label, event_type, deterministic_flag_snapshot, previous_entry_hash, entry_hash, hash_version)
- **Hash chain:** Each entry's `entry_hash` = SHA-256(canonical payload including `previous_entry_hash`)
- **Versions:** v1 (raw JSON key order), v2 (canonical sorted keys + normalized ISO timestamps)
- **Verification:** `verifyChain()` in `audit_ledger_service.ts` walks chain (ordered by created_at), recomputes hashes per version, checks links

```ts
// src/db/repositories/audit_ledger_repository.ts (excerpt)
function computeEntryHashV2(payload: HashPayload): string {
  const canonical = JSON.stringify({
    tenantId: payload.tenantId,
    periodLabel: payload.periodLabel,
    eventType: payload.eventType,
    deterministicFlagSnapshot: canonicalizeForHash(payload.deterministicFlagSnapshot),
    agentDissentSnapshot: canonicalizeForHash(payload.agentDissentSnapshot),
    userPromptRationale: payload.userPromptRationale,
    previousEntryHash: payload.previousEntryHash,
    createdAt: payload.createdAt,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
```

---

## Evidence Anchoring

### Implementation

- **Evidence links:** `tenant_evidence_links` (links evidence to journal entries)
- **Evidence manifest:** Built at certification in `evidence_manifest_service.ts`
  - Sorted by journalEntryId, then evidenceId
  - Contains: evidenceId, hashSha256, sizeBytes, mimeType, attachedBy, attachedAt
- **Snapshot inclusion:** `evidenceManifest` in snapshot payload when present
- **Hash version 3:** Evidence manifest included in snapshot hash when `hashVersion >= HASH_VERSION_WITH_EVIDENCE_MANIFEST`

---

## Certification & Export Gating

### Export Gate (`src/services/export_gate_service.ts`)

- **Blocks:** rounding gap exceeds materiality, aggregate rounding exceeds materiality, audit chain invalid
- **Materiality:** Read from `period_export_checks` (DB); caller must not supply flags
- **Integration:** When `ENABLE_INTEGRATED_SUPERVISOR`, blocks on unresolved CPA-CFA conflicts; also blocks on RESOLUTION_MISMATCH (resolved conflict count ≠ ledger `user_induced_variance` count)
- **Blocks (403):** CRITICAL_TAMPER_ALERT, TAMPERING_ATTEMPT_DETECTED, UNRESOLVED_CONFLICTS_ALERT, RESOLUTION_MISMATCH

### Certified Export

- **Certified path:** Requires `closeSessionId` + `session.status === 'certified'`
- **Formats:** PDF (document package), CSV (clean ledger)
- **Binder:** GET `/api/audit/binder` — statements + justification chain + deep links
- **Watermark:** Draft PDFs get "DRAFT — NOT CERTIFIED"; when `ALLOW_IMBALANCED_DRAFT_EXPORT` and imbalanced: "IMBALANCED by $X — For review only"

---

## Agentic/Advisory Layer

### AI Pillars (`ai_orchestrator.ts`)

- **Justifier:** IRAC justification for adjustments
- **Shadow Auditor:** Audit-style review
- **Classifier:** Account classification for ingest
- **Advisor:** Proposal suggestions for imbalanced TB

### Non-Mutation of Certified State

- AI outputs stored in `tenant_ai_proposals`, `ai_call_log` — not written to ledger
- HITL staging: proposed actions stay `pending` until human approves via webhook
- Human resolution via `POST /api/hitl/resolve-ingest` — user supplies correction; not AI-generated amounts
- Certified statements built from snapshot only; AI does not compute totals for certified path

---

## Current Functionality

### User Flows

1. **Trial balance ingest:** Upload CSV/XLSX → parse → if balanced → period_trial_balance; if imbalanced → `tenant_hitl_staging` via `submitToStaging()` (ingest.ts, parser.ts, result_generator.ts, buildFinancialStatements.ts, proposeTrialBalanceAdjustment.ts)
2. **Close session:** Create → advance (draft→…→locked) → certify
3. **Certification:** Locked + readiness → snapshot + artifact → certified
4. **Export:** Draft (watermarked) or Certified (requires certified session)
5. **Audit binder:** Certified statements + justification chain
6. **Verification:** Snapshots, audit chain, evidence manifest, certification artifacts

### UI (Frontend)

- CFO dashboard
- File upload zones, smart ingestion
- Agentic panels (HITL banner, policy proposals)
- Auditor transparency dashboard
- Consolidation view
- Login/register

### Testing

- **Unit:** 42 tests (canonical_json, integrity_gate, audit_ledger, close_session, export_gate, etc.)
- **Integration:** 34 tests (certification_pipeline, export_certified_gate, session_centric_hardening, evidence_*, etc.)
- **Smoke:** persistence_resume, integrity_gate

---

## What's Missing or Incomplete

### Gaps

- **OCR/PDF ingest:** Mentioned in fileIngestion; not implemented
- **Comparative/cash flow:** Prior-period TB required for some flows; partial
- **ERP connectors:** Python adapters exist; integration with TS backend partial
- **Agent tools:** `buildFinancialStatements`, `proposeTrialBalanceAdjustment` — some paths may be stubbed

### Known Limitations

- **MODE=dev:** Permissive (REQUIRE_AUTH=false, AI_MOCK allowed); not for production
- **ALLOW_IMBALANCED_DRAFT_EXPORT:** When true, draft export allows imbalanced data (watermarked banner in PDF). Prod/demo: forced to false (`runtime_mode.ts`)
- **ALLOW_LEGACY_CERTIFIED_SOURCE:** Query param `?allowLegacyCertifiedSource=1` or env allows legacy source when no certified snapshot; audited and headered. Prod/demo: forced to false
- **Body tenant injection:** Allowed only in dev when `isBodyTenantInjectionAllowed()`; disabled in prod/demo

### Placeholder/Stub Code

- `AI_MOCK` / `AI_MOCK_CLASSIFIER` / `AI_MOCK_ADVISOR` return deterministic strings instead of live LLM calls
- Some routes may return 404 when feature flags off (e.g. ENABLE_DEV_API, CPA_ENABLED)
