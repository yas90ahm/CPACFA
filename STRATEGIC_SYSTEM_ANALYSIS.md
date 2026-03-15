# Strategic System Analysis -- Sovereign CPA Engine ("Sabit")

Grounded exclusively in executable source code (.ts, .tsx, .sql, .json). No markdown or documentation files were consulted.

---

## 1. System Definition

### What This System Is

Sabit is a **month-end financial close automation engine** that takes a company's raw general ledger data and produces four certified, cryptographically signed financial statements: Balance Sheet, Income Statement (P&L), Cash Flow Statement, and Statement of Changes in Stockholders' Equity.

The system enforces a strict linear pipeline with immutability guarantees at every stage. It is not a general-purpose accounting system -- it is a **close-process orchestration engine** that sits downstream of an ERP or GL system.

### Complete Data Lifecycle

**Stage 1: GL Ingestion**
Raw financial data enters via CSV or Excel upload through `src/services/gl_upload_service.ts`. The service:
- Auto-detects header rows by scoring cells against 35+ known GL header names (lines 27-35)
- Handles Excel (.xlsx/.xls) and CSV formats, including password-protected file rejection (line 100)
- Validates each journal entry group balances (debits = credits) using Decimal.js arithmetic
- Imbalanced entries are routed to HITL (Human-In-The-Loop) staging for manual resolution rather than silently dropped
- Balanced entries are persisted to `general_ledger_lines` table
- A derived trial balance is automatically built from the GL via `gl_to_tb_aggregation_service.ts` and saved as the unadjusted TB

**Stage 2: Account Classification and Mapping**
Each GL account is mapped to a financial statement line item (e.g., "Account 4100" to `fs_revenue_product`). The mapping engine in `src/services/financialStatements.ts` uses a deterministic, data-driven bucketing system with 60+ FS line IDs organized into taxonomy sets:
- `BS_CURRENT_ASSET_FS_LINES`, `BS_NONCURRENT_ASSET_FS_LINES` (lines 121-145)
- `COGS_FS_LINES`, `OPEX_FS_LINES`, `OTHER_INCOME_FS_LINES`, `TAX_FS_LINES` (lines 288-294)
- `OCI_FS_LINES`, `DISCONTINUED_FS_LINES` for ASC 220 and ASC 205-20 compliance (lines 75-80)
- Fallback by `accountType` when `fsLineId` is absent (lines 186-192)

AI suggests mappings but never writes them directly. Every AI mapping suggestion is recorded in the audit ledger as `ai_mapping_suggestion_accepted/edited/rejected` (`src/services/certification_artifact_service.ts`, lines 129-142).

**Stage 3: Reconciliation**
`src/services/period_reconciliation_service.ts` manages balance sheet account reconciliation:
- When a close session enters IN_PROGRESS, reconciliations auto-initialize for all required accounts (line 62)
- GL balances auto-populate from the adjusted TB (line 43-54)
- Preparer enters supporting balance and adds reconciling items
- Variance and unexplained variance are DB-computed (GENERATED columns)
- Supporting documentation upload is **mandatory** to complete (lines 376-383)
- Segregation of duties: reviewer cannot approve a reconciliation they prepared (lines 431-436)
- Prior period data carries forward with full audit trail (`carried_from_period`, `original_created_at`) via `carryForwardItems` (lines 632-655)

**Stage 4: Adjusting Journal Entries**
`src/services/journal_entry_service.ts` enforces a strict lifecycle: `draft -> proposed -> approved -> posted -> exported`
- Every JE must balance exactly (Decimal.js, lines 428-441)
- Every line requires `amountProvenance` metadata (lines 74-86)
- Segregation of duties enforced in production: approver cannot equal creator (lines 151-156)
- Prior-period posting prevention: cannot post to dates covered by certified/locked sessions (lines 469-497)
- Shadow Auditor runs pre-post checks and can **block** posting (lines 288-299)
- Evidence threshold: JEs exceeding materiality threshold require uploaded supporting documents (lines 266-283)
- Posted JEs are **immutable** via PostgreSQL triggers (`migrations/155_je_immutability_exported_status.sql`)
- Reversals create new JEs with flipped debits/credits; original remains untouched (lines 620-694)

**Stage 5: Statement Generation**
`src/services/financialStatements.ts` builds all four statements:
- Balance Sheet per ASC 210-10-45 with current/noncurrent classification (line 201)
- P&L per ASC 220-10-45 with PE-standard intermediate subtotals: gross profit, operating income, EBITDA (lines 334-411)
- Cash Flow per ASC 230 indirect method (`src/services/cashFlow.ts`) with non-cash add-backs: D&A, deferred tax, unrealized FX, SBC (lines 96-108)
- Statement of Changes in Equity (`src/services/equityChanges.ts`) with OCI per ASC 220 (lines 23-29)

All arithmetic uses `Decimal.js` through utility functions `from()`, `round2()`, `sumRound2()`, `minus()`, `plus()` -- never JavaScript floating-point (`src/utils/decimal.js`).

**Stage 6: Variance Analysis**
`src/services/variance_analysis_service.ts` computes period-over-period changes:
- Material variances (default >= 5% change) must be explained before certification (lines 219-242)
- AI can draft explanations but they require human review; AI usage is tracked as `ai_draft` or `ai_edited` (lines 83-123)
- Variance classification and full-year impact projection available (lines 185-216)

**Stage 7: Gates Between Stages**
The close session state machine (`src/services/close_session_service.ts`, lines 1-18) enforces:
```
OPEN -> IN_PROGRESS -> UNDER_REVIEW -> CERTIFIED -> LOCKED
```
- `IN_PROGRESS -> UNDER_REVIEW`: Gated by `computeReadiness()` which checks reconciliation completeness, statement generation, variance explanations, evidence policy (lines 604-615)
- `UNDER_REVIEW -> CERTIFIED`: Re-validates everything fresh (no cache), requires approver role, runs cross-statement validation (lines 258-489)
- `CERTIFIED -> IN_PROGRESS`: Reopen requires CFO-level authority + reason (minimum 10 characters) (lines 646-726)
- `CERTIFIED -> LOCKED`: Terminal state, no undo (lines 728-755)
- Auto-lock after configurable days (default 30) via `autoLockCertifiedSessions` (lines 762-785)

**Stage 8: Certification and Locking**
`certifyCloseSession()` (lines 258-489) performs:
1. Row-level lock (`SELECT ... FOR UPDATE`) to prevent concurrent certification races (lines 270-283)
2. Staleness check: rejects if statements changed since last generation (lines 288-293)
3. Readiness re-check with hard blockers (lines 295-311)
4. Trial balance integrity gate (debits = credits, A = L + E) (lines 351-359)
5. Cross-statement validation: 5 hard checks including cash tie, equity tie, retained earnings tie (`src/services/cross_statement_validation.ts`, lines 27-127)
6. Ledger snapshot creation (immutable JSONB payload with SHA-256 hash)
7. Evidence manifest building and hash binding
8. Audit chain verification (`verifyChain`)
9. Ed25519 digital signature of the certification artifact (`src/lib/cert_signing.ts`)
10. Certification artifact persistence with all validation results embedded

**What "Locked" Means:**
- `LOCKED` is the terminal state; the `ALLOWED_TRANSITIONS` map has `locked: []` (line 51 of close_session_service.ts)
- Posted/exported JEs have PostgreSQL `BEFORE UPDATE/DELETE` triggers that raise exceptions (migration 155)
- Ledger snapshots are immutable (JSONB payload + SHA-256 hash, verified at export)
- Audit ledger is append-only, hash-chained (SHA-256), with DB-level immutability triggers checked in the verification portal
- Ed25519 signature over the artifact hash means any tampering with the certified data is cryptographically detectable

**How Data Exits:**
- Certified statements via audit binder (PDF/CSV export, gated by integrity check and chain verification)
- Board packages via the statement package API
- Public verification via the `/verify` page where anyone with a session ID can independently verify the Ed25519 signature, audit chain integrity, and evidence manifest binding

---

## 2. Pain Point Mapping

### Real-World Risks Prevented

**Race Condition Guards**
- `certifyCloseSession` acquires `SELECT ... FOR UPDATE` row lock before any state mutation (close_session_service.ts:270-283). This prevents the scenario where two CFOs simultaneously click "Certify" and create duplicate certification artifacts.
- `advanceSession` wraps state transitions in `withTransaction` + `getCloseSessionByIdForUpdate` (close_session_service.ts:841-843). This prevents concurrent advance races where two preparers advance the same session.
- JE approval uses `expectedStatus` optimistic concurrency: `updateJournalEntryStatus(pool, id, tenantId, 'approved', { expectedStatus: 'proposed' })` (journal_entry_service.ts:157-159). If another approver already approved it, the update returns null and the service provides a descriptive error including who already approved.
- Reconciliation approval uses the same `expectedStatus` pattern (period_reconciliation_service.ts:445-459).

**Immutability Triggers (What Cannot Be Modified)**
- Posted and exported JEs: PostgreSQL `BEFORE UPDATE` and `BEFORE DELETE` triggers raise exceptions (migration 155, lines 8-30). This prevents the real-world risk of a controller "fixing" a posted entry directly instead of creating a reversal.
- JE lines of posted entries: separate trigger checks parent status (migration 155, lines 33-61).
- Zero-zero lines rejected at creation (journal_entry_service.ts:60-66) -- prevents the common data quality issue of placeholder lines.
- JE memo required (minimum 5 characters at draft, enforced again at post) -- prevents the common audit finding of unexplained entries (journal_entry_service.ts:53-58, 243-245).

**Cross-Statement Validation (Mathematical Guarantees)**
`src/services/cross_statement_validation.ts` enforces 5 hard checks at certification:
1. Balance sheet equation: A = L + E (lines 55-63)
2. Net income tie: IS net income = Equity statement net income (lines 67-76)
3. Cash tie: CF ending cash = BS cash (lines 79-88)
4. Equity tie: Equity statement closing equity = BS total equity (lines 91-99)
5. Retained earnings tie: closing = opening + changes + OCI (lines 103-124)

All comparisons use `Decimal.js` (line 34: `const d = (n: number) => decimalFrom(n).toDecimalPlaces(2)`). Any hard check failure blocks certification entirely (close_session_service.ts:367-371).

**Integrity Gate (Kill Switch)**
`src/services/integrity_gate_service.ts` is the primary mathematical gatekeeper:
- `assertIntegrityGateOrThrow` throws `MathematicalIntegrityError` (HTTP 422) when debits != credits OR when A != L+E (lines 194-215)
- Tolerance is hard-capped at $0.01 (`MAX_ROUNDING_TOLERANCE = 0.01`, line 135). Even if the config file specifies a higher tolerance, the code clamps it. This prevents the risk of a misconfigured tolerance silently accepting imbalanced statements.
- Rounding adjustment: when statement-level rounding creates a micro-imbalance <= $0.01, a "Rounding adjustment" line is added to equity so statements tie exactly (financialStatements.ts:240-247). This prevents the common frustration of $0.01 rounding differences blocking certification.

**Suspicious Plug Detection**
`detectSuspiciousPlugs` (integrity_gate_service.ts:47-79) catches AI or user attempts to force balance by dumping everything into "Miscellaneous", "Suspense", or "Other" accounts. If plug accounts absorb >= 90% of net activity, the report is flagged as `balanced_but_high_risk` with a mandatory audit alert (financialStatements.ts:510-521).

**AI Boundary (What AI Cannot Do)**
`src/lib/ai_boundary.ts` uses `AsyncLocalStorage` to track per-request advisory context:
- `assertNoAiMutationContext()` throws `[AI_BOUNDARY] Mutation path cannot be invoked from AI context` when any AI code attempts to call mutation paths (lines 55-62)
- Called at the start of `certifyCloseSession`, `lockCloseSession`, `reopenCloseSession` (close_session_service.ts:263, 685, 730)
- Per-request scope via `runInBoundaryScope` middleware (server.ts:89) prevents false positives from concurrent requests
- AI justifications are saved with status `draft` requiring human review (journal_entry_service.ts:384)
- AI variance explanations are never auto-saved to database; returned for human review (variance_analysis_service.ts:168)

**Audit Ledger (Tamper Prevention)**
`src/db/repositories/audit_ledger_repository.ts` implements a SHA-256 hash chain:
- Each entry's hash includes `previousEntryHash` creating a blockchain-like chain (lines 50-82)
- v2 hashing uses canonical JSON (sorted keys + normalized timestamps) for deterministic verification across DB round-trips (lines 30-41, 70-82)
- `verifyChain` walks every entry in chronological order and recomputes hashes; any modification breaks the chain (lines 413-438)
- Checkpoint support for incremental verification (lines 322-386) enables sub-second checks on large chains while still maintaining full audit trail

**Cascade Engine (Staleness Prevention)**
`src/services/cascade_engine.ts` is the "nervous system" that prevents stale data:
- Every financial mutation (AJE posted, recon completed, mapping changed, TB re-ingested) triggers a synchronous cascade (lines 196-328)
- Cascade refreshes GL balances on reconciliations; if a completed recon is now over tolerance, it automatically reverts to `in_progress` and creates a blocking issue (period_reconciliation_service.ts:217-260)
- Statements are marked stale via `setStatementsStaleSince` (cascade_engine.ts:274) preventing certification with outdated statements (close_session_service.ts:288-293)
- Recursion guard with max depth of 3 (line 39) prevents infinite cascade loops
- Performance target: < 2000ms for full cascade; steps 3/4/5 run in parallel (lines 267-303)

**Decimal.js Usage (Precision Prevention)**
Every financial calculation uses `Decimal.js` through `src/utils/decimal.js`:
- `sumRound2` for all totals (prevents salami-slicing, noted explicitly at financialStatements.ts:114)
- `round2` for display amounts
- `from` for safe construction
- Database uses `NUMERIC(20,2)` for money columns
- JE balance validation: `diff.isZero()` on Decimal, not JavaScript `=== 0` (journal_entry_service.ts:434)
- This prevents the classic floating-point bug where `0.1 + 0.2 !== 0.3` causes phantom imbalances in financial data

**Segregation of Duties**
- JE approval: `approvedBy !== createdBy` enforced in production, bypassable in dev only (journal_entry_service.ts:33-38, 151-156)
- Recon approval: `preparedBy !== reviewerId` (period_reconciliation_service.ts:431-436)
- Certification: requires `approver` role via `canPerform(actorRole, 'certify_close')` (close_session_service.ts:264)
- Rejection requires minimum 10-character reason (close_session_service.ts:509-511, journal_entry_service.ts:193)

---

## 3. Commercial Viability

### Not Generic -- Highly Specialized for PE-Backed Mid-Market

This is **not** a general-purpose accounting system or ERP. It is a purpose-built **financial close orchestration engine** targeting a specific niche: private equity-backed portfolio companies in the $100M-$1B revenue range.

**Evidence of PE vertical focus:**
- Portfolio and entity routes (`src/routes/portfolio.ts`, server.ts:216): cross-entity portfolio dashboard designed for PE operating partners
- Multi-entity consolidation support (server.ts:229: `consolidationRouter`)
- PE-standard P&L intermediate subtotals: gross profit, operating income, income before tax, EBITDA with specific D&A and interest expense extraction (financialStatements.ts:369-386)
- EBITDA calculation: `netIncome + tax + interestExpense + D&A` (financialStatements.ts:376-386) -- this is a PE fund reporting requirement
- Entity hierarchy patterns (`migrations/168_pe_hierarchy.sql`)
- EBITDA addbacks (`migrations/165_ebitda_addbacks.sql`)
- `fund_controller` patterns in the tenant/entity model

**Market positioning:**
- This is a **closed-loop vertical SaaS** -- not white-label, not a platform
- Target buyer: PE operating partners and portfolio company CFOs who currently close books manually in Excel over 10-15 days
- Value proposition: reduce close cycle time while providing cryptographic proof of statement integrity

**Competitive moat in the code:**

1. **Cryptographic certification chain**: The combination of Ed25519 signatures + SHA-256 hash-chained audit ledger + immutable ledger snapshots creates a "trust without trusting Sabit" story. The `/verify` page (frontend/app/verify/page.tsx) allows any third party to independently verify statement integrity using standard crypto libraries. No competitor in the mid-market close automation space offers this.

2. **AI boundary enforcement**: The `AsyncLocalStorage`-based AI boundary (src/lib/ai_boundary.ts) is architecturally unique. AI can suggest but never write to financial tables -- enforced at runtime in ALL environments, not just production. This is a direct answer to the "can I trust AI with my financial data?" objection.

3. **Mathematical kill switch**: The integrity gate with hard-capped $0.01 tolerance (integrity_gate_service.ts:135-148) that blocks ALL API paths returning financial data is a belt-and-suspenders approach that no Excel-based process can replicate.

4. **Cascade engine**: The synchronous cascade (cascade_engine.ts) that propagates mutations through reconciliations, statements, and readiness gates within <2s eliminates the class of bugs where an AJE is posted but statements show stale numbers.

5. **166 database migrations**: The schema depth (166 migrations covering everything from basic tenant schema through XBRL taxonomy anchoring, multi-currency GL, audit chain checkpoints, and PE hierarchy) represents years of domain-specific iteration that would be expensive to replicate.

---

## 4. The 'Sellable' Feature

### The Certification and Verification Pipeline

The single most complete, demo-ready, and commercially differentiated feature is the **end-to-end certification and verification pipeline** spanning:

1. `src/services/close_session_service.ts` (certifyCloseSession, 230 lines of certification logic)
2. `src/services/integrity_gate_service.ts` (mathematical kill switch, 216 lines)
3. `src/services/cross_statement_validation.ts` (5 cross-statement tie checks, 127 lines)
4. `src/services/certification_artifact_service.ts` (artifact building + AI metadata, 192 lines)
5. `src/lib/cert_signing.ts` (Ed25519 signing with environment-aware key management, 169 lines)
6. `src/db/repositories/audit_ledger_repository.ts` (hash-chain verification with checkpoint optimization, 507 lines)
7. `frontend/app/verify/page.tsx` (public verification portal, 711 lines)
8. `frontend/app/close/[sessionId]/review/page.tsx` (certification ceremony UI, 1400+ lines)

**Why this feature wins:**

**Deepest implementation**: The certification path is the most heavily instrumented code in the system. `certifyCloseSession` alone executes 10 sequential validation steps (row lock, staleness check, readiness, trial balance integrity, cross-statement validation, snapshot, evidence manifest, audit chain verification, Ed25519 signature, artifact persistence) -- each with specific error codes and human-readable failure messages.

**Most comprehensive error handling**: Every failure mode has a named error code (`NOT_UNDER_REVIEW`, `HARD_BLOCKERS`, `SESSION_DATA_MISSING`, `VALIDATION`, `INSUFFICIENT_ROLE`, `REOPEN_REASON_REQUIRED`, `REOPEN_FORBIDDEN_LOCKED`, `REOPEN_UNAUTHORIZED` -- close_session_service.ts:56-57). The system distinguishes between "evidence policy violation" and "general hard blocker" (lines 297-309) for targeted remediation guidance.

**Strongest trust/verification story**: The verification portal (frontend/app/verify/page.tsx) has four tabs:
- Certificate Lookup: search by session ID, display Ed25519 signature, SHA-256 snapshot hash, public key, validation results (lines 71-263)
- Chain Verification: visual chain link display with DB enforcement status (append-only trigger, snapshot immutability trigger) (lines 266-396)
- Evidence Manifest: cryptographic binding verification between evidence and snapshot (lines 399-525)
- Public Key: instructions for independent verification using any standard crypto library (lines 528-622)

**Least work to demo**: A single happy-path demo showing GL upload through certification, followed by independent verification on the `/verify` page, tells the entire product story in under 10 minutes. The verification page works without authentication -- an auditor can verify a certification without any Sabit credentials, using only a session ID and the public key.

**Bug-free indicators**:
- Row-level locking prevents concurrent certification races (close_session_service.ts:270-283)
- Optimistic concurrency on all status transitions prevents double-certification
- Staleness guard prevents certifying with outdated statements (line 288-293)
- Cross-statement validation is recomputed fresh at certification time, never cached (cross_statement_validation.ts:5)
- The hash chain uses canonical JSON with sorted keys to survive DB round-trips (audit_ledger_repository.ts:30-41)
- Checkpoint-based incremental verification prevents O(n) chain walks on every certification (audit_ledger_repository.ts:322-386)
- Auto-generated keys in dev/test ensure signatures always work; production requires explicit key configuration or startup fails (cert_signing.ts:76-83)

---

## Summary

Sabit is a vertically specialized financial close engine targeting PE-backed mid-market companies. Its competitive moat lies in the intersection of three properties no competitor offers simultaneously: (1) deterministic financial computation with mathematical kill switches, (2) cryptographic certification with Ed25519 signatures and hash-chained audit trails, and (3) AI advisory with hard runtime boundaries preventing AI from ever writing financial data. The certification and verification pipeline is the most sellable feature because it directly addresses the CFO's question: "How do I know these numbers are right, and how do I prove it to my auditor?"
