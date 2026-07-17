# COLD READ — PRODUCT INFERENCE FROM CODEBASE ONLY

*Inferred from `src/`, `tests/`, `migrations/`, `package.json` only. No .md/.txt/.docx referenced. Quarantine code excluded.*

---

## 1) What is this?

This is a **financial close and audit preparation platform** for finance teams. It ingests trial balances (CSV/XLSX or synced from accounting software), builds Balance Sheet and P&L, runs month-end close with journal entries, reconciliations, and checklists, and produces certified audit binders and exports.

The system sits between accounting systems (QuickBooks, Xero, NetSuite) and auditors. It organizes the close process through a status lifecycle (draft → in_progress → ready_for_review → finalized → locked → certified), enforces accounting rules (debits=credits, Assets=Liabilities+Equity), and maintains an append-only, hash-chained audit ledger of human overrides and material events. Certified exports and audit binders are gated behind certification and cryptographic verification.

**Evidence:** `package.json` — "Enterprise-grade agentic financial platform — Trial Balance to Balance Sheet & P&L"; `src/server.ts` lines 118–176 — trial-balance, justification, audit, export, close, verification, accounting-integration routes; `migrations/051_audit_ledger.sql` — hash-chained, append-only ledger; `migrations/065_tenant_close_sessions.sql` — close sessions with status; `migrations/060_period_trial_balance.sql` — TB storage; `migrations/083_ledger_snapshots.sql` — immutable snapshots with SHA-256 hash.

---

## 2) How do people use it? (inferred workflow)

**Onboarding:** User runs guided setup (`GET /api/onboarding/state`, `POST /api/onboarding/advance`), sets entity info (`POST /api/onboarding/entity-info`), imports Chart of Accounts (`POST /api/onboarding/coa-import`), optionally uses agentic CoA mapping (`POST /api/onboarding/suggest-coa-mapping`) and first close guide (`GET /api/onboarding/first-close-guide`).

**Ingestion:** User uploads a TB file (CSV/XLSX) via `POST /api/trial-balance/ingest` or syncs from accounting software via `POST /api/accounting-integration/sync-trial-balance`. System parses, classifies accounts, builds financial statements. AI classifiers and advisors may suggest adjustments. Imbalanced ingest can be sent to HITL staging for human approval/rejection; approved overrides append to audit ledger.

**Close:** User creates or ensures a close session for an entity and period (`POST /api/close/sessions/ensure`, `POST /api/close/sessions`). Sessions move through statuses via `POST /api/close/sessions/:id/advance`. User adds journal entries, runs reconciliations, completes checklist items. Period lock requires approver role. Certification (`POST /api/close/sessions/:id/certify`) requires approver, locked status, no hard blockers (including evidence policy when enforced), and Truth Gate pass.

**Export:** Draft export is available before certification; certified export (PDF/CSV) and audit binder require `closeSessionId` and `session.status === 'certified'`. Export gate checks audit ledger chain, materiality flags (from DB only), and conflict resolution when Integration is enabled.

**Verification:** Auditor uses `GET /api/verification/snapshots/:snapshotId` and `GET /api/verification/audit-chain` to verify snapshot hashes and ledger chain integrity.

**Ambiguity:** The exact UX flow is unclear from code. Whether users first ingest TB then create a session, or create a session then ingest, is not enforced. Close session and `period_trial_balance` are linked via `period_label`, not a foreign key. `full_close_flow.test.ts` line 38 uses `NODE_ENV === 'production' ? '/api/trial-balance/ingest' : '/api-dev/trial-balance/ingest'` — two ingest paths exist depending on environment.

---

## 3) What problems does it seem designed to prevent?

| Failure mode | Enforcement point |
|--------------|-------------------|
| **Unbalanced ledger** | `integrity_gate_service.ts` — `MathematicalIntegrityError` when totalDebits ≠ totalCredits or Assets ≠ Liabilities+Equity; `shared/config/financial_rules.json` defines equations and tolerance |
| **Plug accounts / fudging** | `integrity_gate_service.ts` — `detectSuspiciousPlugs()` flags accounts named Miscellaneous/Suspense/Other absorbing >90% of net activity |
| **Client-supplied materiality bypass** | `export_gate_service.ts` lines 9–12 — "Zero-trust: materiality flags are read only from period_export_checks (DB)"; `export.ts` lines 112–118 — rejects `roundingGapExceedsMateriality` / `aggregateRoundingExceedsMateriality` in body with 403 TAMPERING_ATTEMPT_DETECTED |
| **Certification bypass** | `export.ts` lines 76–91 — `auditBypassFlagIfPresent()` logs tampering_attempt when `exportBypassCertification` sent; in production it is ignored; certified export requires `session.status === 'certified'` (lines 151–156) |
| **Tampered audit trail** | `audit_ledger_repository.ts` — append-only, hash-chained entries; `verifyChain()` used by export gate and verification routes |
| **Cross-tenant access (IDOR)** | `close_session_repository.ts` — all queries use `tenant_id`; `verification/snapshots.ts` line 45 — `snapshot.tenantId !== tenantId` returns 404; `tests/integration/close_session_idor.test.ts` and `security_adversarial.test.ts` verify tenant A cannot access tenant B data |
| **Same person preparing and certifying** | `segregation_service.ts` — `certify_close` requires approver; `je_post`, `period_lock` require approver; preparer cannot certify |
| **Missing evidence on material JEs** | `evidence_policy_service.ts` — `checkEvidencePolicyForCertification()` when policy.enforcement_mode is hard_block |
| **Overlapping close periods** | `migrations/065_tenant_close_sessions.sql` — EXCLUDE constraint prevents overlapping daterange for same tenant+entity |

---

## 4) What trust claims does it make?

**What it CAN prove/verify:**
- **Audit ledger chain integrity** — `verifyChain()` in `audit_ledger_service.ts`; `GET /api/verification/audit-chain` returns verified/entryCount/lastEntryHash
- **Snapshot hash** — `recomputeAndVerifySnapshotHash()` in `ledger_snapshot_service.ts`; `GET /api/verification/snapshots/:snapshotId` returns storedHash, recomputedHash, hashMatches
- **Evidence manifest** — `buildEvidenceManifest()`; `GET /api/verification/evidence-manifest/:snapshotId` for line-level evidence linkage
- **Certified source** — Response headers `X-Certified-Source`, `X-Certified-Snapshot-Id`, `X-Certified-Snapshot-Hash` on binder/export
- **Mathematical balance** — Integrity gate blocks unbalanced TB; certification requires Truth Gate pass via `buildCertifiedStatementsFromSnapshot()` in `close_session_service.ts` lines 283–288

**What it CANNOT prove (from code):**
- **Who actually certified** — `certified_by` is stored but not cryptographically signed; a compromised approver account could certify maliciously
- **Time of certification** — `certified_at` is stored but not in a verifiable timestamp authority
- **Out-of-band edits** — Direct DB access could alter data; there is no write-ahead log or external attestation
- **AI output correctness** — Justifier, classifier, advisor outputs are not formally verified; they inform human decisions

---

## 5) Who are the implied users?

| Role | Inferred from |
|------|---------------|
| **Controller / Preparer** | `closeRole.ts` — preparer; `segregation_service.ts` — preparer can do checklist but not certify |
| **Reviewer** | `close_checklist_complete` requires reviewer; `variance_confirm` requires reviewer |
| **Approver / CFO** | `period_lock`, `je_post`, `certify_close` require approver |
| **Auditor** | `audit_binder.ts` — binder certified-only; `verification/snapshots.ts`, `audit_chain.ts` — read-only verification endpoints; `pbc_index.ts` — PBC (provided-by-client) index for audit prep |
| **Admin** | `tenants.ts` — PATCH/GET tenant; `accounting_integration.ts` — create connections |

---

## 6) Score (0–10)

**Overall readiness: 6.5**

| Sub-score | Value | Reasons (evidence) | Biggest risk/confusion |
|-----------|-------|--------------------|-------------------------|
| **Close workflow completeness** | 7 | Sessions, JEs, reconciliations, checklist, certify, statement packages all wired; `full_close_flow.test.ts` proves ingest→session→JE→recon→readiness→verifyChain→export | Close session and period_trial_balance not FK-linked; status transitions complex; "advance" can block on readiness |
| **Integrity & audit trail** | 8 | Hash-chained ledger, snapshot hashing, export gate, materiality from DB, tampering detection | Legacy certified source (`ALLOW_LEGACY_CERTIFIED_SOURCE`) and v1/v2 hash versions add complexity |
| **Security & multi-tenancy** | 7 | Tenant-scoped queries, IDOR tests, JWT tenantId, `isBodyTenantInjectionAllowed()` blocks body tenant in strict modes | `REQUIRE_AUTH=false` allows unauthenticated API in non-production; `deployment_config_guard.ts` enforces production but dev can run without auth |
| **API surface clarity** | 5 | Many routes; overlapping concerns (adjustments vs journal-entries); CPA module behind env flag; dev router at `/api-dev` only in non-production | Hard to know which endpoints are primary; `full_close_flow.test.ts` uses `/api-dev/trial-balance/ingest` in non-production |
| **Configuration & deployment** | 5 | Env vars control auth, tenant context, legacy source, imbalanced draft, Integration; `deployment_config_guard.ts` enforces production rules | Many env flags; `REQUIRE_AUTH=false` + `REQUIRE_TENANT_CONTEXT=false` is a footgun; BYOD `database_url` per tenant |

---

## 7) Top 12 surprises

1. **Auth can be fully disabled in non-production** — `REQUIRE_AUTH=false` makes `optionalAuth` used for all /api routes (`server.ts` lines 99–108). Production blocks this via `deployment_config_guard.ts`, but non-production can run without auth.

2. **Two ingest paths** — `full_close_flow.test.ts` line 38 uses `/api-dev/trial-balance/ingest` when `NODE_ENV !== 'production'`; dev router only mounted when `NODE_ENV !== 'production'` (`server.ts`). In production, ingest is `/api/trial-balance/ingest` with requireAuth.

3. **Body tenant injection** — `isBodyTenantInjectionAllowed()` allows `tenantId` from request body in dev when strict flags are off (`env.ts` lines 16–21). `ingest.ts` lines 83–102 use `injectTenantFromBody` middleware. Production disables it.

4. **Legacy certified source** — `ALLOW_LEGACY_CERTIFIED_SOURCE` lets binder/export use last-registered statements when no certified snapshot exists (`env.ts` line 29). Default false; creates two trust paths.

5. **Imbalanced draft export** — `ALLOW_IMBALANCED_DRAFT_EXPORT=true` lets draft PDF/CSV export imbalanced ledger with watermark (`env.ts` line 26). Policy A (default) requires balance.

6. **Close session status complexity** — Six statuses with strict transitions; `certify` only from `locked`; `advance` can block on readiness hard blockers. `AdvanceBlockedError` triggers rollback; error handling differs per route.

7. **Hash version split** — `audit_ledger_repository.ts` supports v1 (legacy) and v2 (canonical) hash; `ledger_snapshots` has `hash_version`; verification must handle both.

8. **Evidence policy is opt-in** — `evidence_policy_service.ts` — when `enforcement_mode` is 'off', no checks. Hard block only when policy exists and mode is hard_block.

9. **Integration / CPA-CFA conflicts** — When `ENABLE_INTEGRATED_SUPERVISOR` is true, export gate blocks on unresolved conflicts and requires `periodLabel`; adds another failure mode for export.

10. **Export gate bug** — `export_gate_service.ts` lines 99–108: when `resolvedCount !== ledgerResolutionCount`, the gate returns `allowed: true` with a message about mismatch. It does not block export; the comment says "Integrity check" but the behavior is permissive.

11. **Job worker runs by default** — `server.ts` starts `runWorkerLoop` when `JOB_WORKER_ENABLED` is not false; background jobs poll DB. Tests may need to account for async job completion.

12. **Precheck is stateless** — `precheck.ts` board-ready check takes trialBalance and journalEntries in body; no DB, no close session. Useful for pre-close validation but separate from the live close flow.
