# Business Documents

**Source:** Current codebase only. No prior documents, READMEs, or reports were used. All statements are defensible from code, tests, schema, and runtime behavior.

**Tone:** No marketing language, buzzwords, or hype. Written for senior ops, controllership, and audit professionals.

---

# DOCUMENT 1: OPERATIONAL BUSINESS PROSPECTUS

## Purpose

Explain what the system does, why it exists, and how it is used — in business terms.

---

## 1) The business problem being solved

- **Imbalanced data reaching the ledger.** Trial balance uploads that do not balance (debits ≠ credits within tolerance) must not be written to the period trial balance. The system prevents this by staging imbalanced uploads and requiring an explicit human-supplied adjustment before any write to the main ledger.

- **Certification without verification.** Certified financial reports must not be issued unless the close session is certified, the audit trail chain is valid, and the balance sheet and trial balance pass defined integrity checks. The system blocks certified export when any of these conditions fail.

- **Uncontrolled posting.** Journal entries must pass balance checks and a pre-post review (Shadow Auditor). When that review returns a block, the system refuses to post and leaves the entry in an approved-but-not-posted state.

- **Unattributed adjustments.** Adjustments used to resolve staged imbalances or to post journal entries require a declared provenance for every amount (e.g. human-entered, engine calculation, or exact source-line). The system rejects adjustments that lack valid provenance.

- **Weakened segregation.** Critical actions (period lock, certify close, journal entry approval and post) are gated by role (preparer, reviewer, approver). The system checks the actor’s role before allowing the action and records the result in the audit log.

---

## 2) What the system actually does today

- **Trial balance ingestion.** Accepts uploads (e.g. CSV/XLSX). If the trial balance does not balance within tolerance, it is stored in a staging area with a staged identifier; nothing is written to the period trial balance until a human provides an adjustment via resolve-ingest and the combined result balances.

- **Human-in-the-loop (HITL) staging.** Proposals (e.g. trial balance fix, journal entry) can be placed in a staging area with status pending. A human approves or rejects via a defined interface; approval can be recorded with an optional signer. Rejection can include a reason. Only after approval can the system proceed with the corresponding action (e.g. applying the adjustment to the ledger).

- **Close workflow.** Close sessions are created per entity/period. Checklist items can be initialized, listed, and completed. Session status can progress (e.g. in progress, ready for review, finalized, locked). Period lock is a separate step and requires approver role. Certification is a separate step and requires approver role; the session must reach a certified status before certified export is allowed.

- **Journal entry lifecycle.** Journal entries move through draft → proposed → approved → posted (and optionally exported). Propose and approve are distinct steps. Posting runs balance validation and the Shadow Auditor; if the Shadow Auditor returns block, the post is refused. Segregation rules require approver role for approval and post.

- **Export and Truth Gate.** Export can be requested in draft or certified mode. Draft can be produced with appropriate labeling (e.g. not certified, for internal use); certified export is only allowed when the close session is certified, the export gate passes (audit chain valid, server-side materiality checks), and the final integrity check passes (trial balance and balance sheet equation within tolerance, no material reliance on plug accounts). If any of these fail, certified export is blocked and the caller receives an error.

- **Audit trail.** Material events (e.g. mapping updates, JE approval, JE posting, export, certify close, bridge commands) are appended to an audit ledger. The ledger is append-only and hash-chained; each entry references the previous entry’s hash. Verification recomputes the chain; if the chain is invalid, the export gate blocks certified export.

- **GL post-back.** Pushing close adjustments or journal entries to an external general ledger is **disabled by default**. When disabled, the system returns a “not implemented” style response. It can be enabled via configuration; the implementation does not assume an external GL is present.

---

## 3) What decisions it supports — and what it explicitly does NOT decide

**Supports:**

- Whether an uploaded trial balance is allowed onto the ledger (only if it balances or is corrected via a human-supplied, provenance-declared adjustment).
- Whether a certified report can be issued (only if session is certified, gate passes, and integrity check passes).
- Whether a journal entry can be posted (only if balanced and not blocked by the Shadow Auditor).
- Whether a user can perform a controlled action (role check: preparer, reviewer, approver).
- Whether to escalate a proposal to a human (e.g. by amount threshold or critical policy change); the system can place items in staging and wait for approval/rejection.

**Does not decide:**

- The accounting treatment of a transaction (e.g. lease classification, revenue timing). It can store and display classifications and suggestions; it does not replace professional judgment.
- Whether the entity is a going concern or whether disclosures are adequate; it can flag and suggest, not conclude.
- What the “correct” adjustment is for an imbalanced upload; the human supplies the adjustment and provenance.
- Whether to lock a period or certify the close; the human initiates these actions, and the system enforces role and sequence.

---

## 4) Where it fits in an enterprise environment

- **Downstream of transaction capture.** The system consumes trial balance data (upload) and optional prior-period or comparative data. It does not replace the ERP or GL; it operates on data provided to it (e.g. uploads, manual entry, or adjustments created within the system). Optional push to an external GL is off by default.

- **Parallel to the close process.** Close sessions, checklists, and statuses model a close process. The system can run alongside existing close tools; certification and export gates apply to what has been certified and verified inside this system.

- **Read/write within its own store.** It writes to its own database (tenant-scoped): staging, period trial balance, journal entries, close sessions, audit ledger, shadow audit findings, etc. It does not directly modify an external GL unless GL post-back is explicitly enabled and implemented for that target.

- **Single-tenant isolation.** All persistent data is keyed by tenant. There is no cross-tenant access in the implemented logic. Suitable for one organization (or one tenant per organization) using a dedicated environment.

---

## 5) What risks it reduces

- **Control failure (imbalance).** Prevents unbalanced trial balance or balance sheet from being treated as part of the main ledger until a human has corrected it and the result balances.

- **Audit friction.** Hash-chained audit ledger and export gate give auditors a verifiable, tamper-evident sequence of material events; certified export is blocked if the chain is broken.

- **Certification risk.** Certified output cannot be produced without a certified session and passing gate and integrity checks, reducing the risk of issuing “certified” reports that do not meet the defined mathematical and procedural bar.

- **Segregation.** Role checks and audit logging create a clear record of who performed lock, certification, approval, and post, supporting segregation of duties.

- **Attribution.** Amount provenance (human-entered, engine, source-line) forces every material amount to be attributed, reducing the risk of unsubstantiated or AI-invented numbers being posted.

---

## 6) Who would own this internally

- **Primary:** Controllership or Finance Operations — responsible for the close process, period lock, certification, and integrity of numbers used for external reporting.

- **Secondary:** Internal Audit — interested in the audit trail, export gate, and segregation; can use the system’s behavior to assess control design and operating effectiveness.

- **Involved but not sole owner:** IT — deploys and operates the system, database, and integrations; does not own the accounting or certification decisions.

---

# DOCUMENT 2: MARKET FIT ANALYSIS (WHO THIS IS FOR)

## Purpose

Determine who would realistically adopt this system first.

---

## 1) Ideal customer profile(s) inferred from system behavior

- **Organizations that already run a formal close.** The system assumes close sessions, checklists, status progression, period lock, and certification. It fits where these concepts already exist and are owned by controllership or finance ops.

- **Organizations that need a defensible audit trail.** The hash-chained audit ledger and the requirement that certified export depend on chain verification appeal to entities under audit or regulatory scrutiny.

- **Organizations that accept human-in-the-loop.** Staging, approval/rejection, and provenance (human-entered amounts) assume that humans review and sign off on adjustments and high-value or policy-sensitive actions. The system is not designed for fully unattended automation.

- **Single-tenant or tenant-per-org deployment.** The data model is tenant-scoped with no cross-tenant access. Best fit: one legal entity or one tenant per entity, with a dedicated database/environment.

---

## 2) Jobs-to-be-done the system clearly supports

- **Keep imbalanced data off the ledger** until a human has corrected it and the books balance.

- **Issue certified reports only when the close is certified and integrity checks pass** — i.e. gate certification and export on verification, not only on workflow completion.

- **Enforce segregation** (preparer vs reviewer vs approver) for lock, certify, and JE approval/post.

- **Maintain a tamper-evident record** of material events and block certified export if that record is invalid.

- **Block journal entry post** when a pre-post review (Shadow Auditor) returns a block, and record the finding for audit.

- **Require provenance for every amount** in adjustments so that numbers are traceable to human, engine, or source.

---

## 3) Organizational maturity required to use this safely

- **Defined close process.** Someone must own close sessions, checklist, lock, and certification. Without that, certified export and readiness checks have no clear meaning.

- **Role assignment.** Preparer, reviewer, and approver must be assigned and respected; the system enforces role at the API/action level.

- **Willingness to correct in the system.** Staged imbalances are resolved by human-supplied adjustments with provenance; the organization must be willing to provide those corrections and not expect the system to “fix” numbers automatically.

- **Database and operations.** Production behavior disallows in-memory fallbacks for staging, audit log, period lock, and similar; a persistent database and tenant context are required. Operations must support that.

---

## 4) Who should NOT use this system

- **Organizations that need the system to “decide” accounting treatment.** The system validates balance and sequence; it does not replace judgment on recognition, measurement, or disclosure.

- **Organizations that cannot support HITL.** If no one will approve/reject staging items or supply adjustments with provenance, the staging and resolve-ingest flow is a poor fit.

- **Organizations that need real-time sync with an external GL as the system of record.** GL post-back is off by default and optional; the system is not built as the primary GL or a real-time GL replica.

- **Multi-tenant SaaS providers** looking for a single shared instance across many unrelated entities with cross-tenant features; the design is single-tenant (one tenant per org/environment).

- **Organizations that expect AI to generate final amounts without human attribution.** Amounts require provenance; AI-suggested amounts must be tagged and/or approved by a human; the system blocks unprovenanced amounts.

---

## 5) What stage of company lifecycle this fits

- **Mature or regulated** is the best fit: formal close, certification, audit trail, and segregation matter most where there is external reporting, audit, or regulatory expectation.

- **Growth-stage** companies that already run a disciplined close and want better control over imbalance, certification, and audit trail can use it, but they must have the process and roles in place.

- **Early-stage** companies with minimal close process or no need for certified output and audit chain have less obvious need for the system’s strictness and controls.

---

# DOCUMENT 3: MARKET COMPARISON (CATEGORY-BASED)

## Purpose

Compare this system to existing solution categories — not to specific vendors.

---

| Dimension | This system | Traditional ERP / GL | Close management tools | Audit management platforms | AI accounting tools | Spreadsheet-based close |
|-----------|-------------|----------------------|--------------------------|----------------------------|----------------------|--------------------------|
| **Determinism** | Balance and integrity checks are deterministic (trial balance, balance sheet equation, tolerance). Certified export depends on these checks. | GL posting rules and validations are deterministic; reporting may vary. | Often workflow and checklist driven; balance may be assumed or checked elsewhere. | Focus on audit procedures, sampling, workpapers; not primarily a balance engine. | Often mix of deterministic rules and model outputs; balance may or may not be enforced. | User-defined formulas; no built-in enforcement of balance or chain. |
| **Auditability** | Append-only, hash-chained audit ledger; chain verified before certified export. Tamper-evident by design. | Audit logs vary by product; rarely hash-chained in the same way. | Task and status history; not necessarily a cryptographic chain. | Workpaper and evidence tracking; chain of custody varies. | Depends on implementation; often not a primary focus. | No native audit chain; versioning depends on tool/user. |
| **Human accountability** | Staging requires approve/reject; amount provenance required (human_entered, engine, source); role checks for lock, certify, approve, post. | Segregation and approval vary by module and configuration. | Checklist sign-offs and assignees. | Reviewer and sign-off on workpapers. | Often advisory; human accountability depends on design. | Entirely on the user; no built-in roles or provenance. |
| **Ability to block unsafe actions** | Blocks: certified export when gate or integrity fails; JE post when Shadow Auditor blocks; write to ledger until imbalance is resolved; actions when role is insufficient. | GL may block invalid entries; reporting and “certification” may not be gated. | May block task progression; rarely gate on mathematical integrity. | May block sign-off until steps complete; not balance-focused. | Varies; may warn without blocking. | No automatic blocking. |
| **Role of AI** | Optional: classification, suggestions, Shadow Auditor, narrative drafting. AI cannot post unprovenanced amounts. On AI failure, Shadow Auditor fails open (warn only); balance and gate remain fail-closed. | Typically not AI-driven in core GL. | Some use AI for task suggestion or anomaly; not core. | AI for sampling or risk; not core. | Central: suggestions, categorization, sometimes posting. | User-driven; AI if added via external tools. |
| **Certification integrity** | Certified export only after session certified, export gate (chain + materiality), and final integrity check (balance, no plug abuse). Explicit refusal when any check fails. | “Certified” or “closed” is often a status flag; may not tie to verification. | Close “complete” when checklist is done; may not verify balance. | Audit opinion is separate; platform tracks procedures. | Varies; certification may be workflow-only. | No system-level certification; user attests. |

---

# DOCUMENT 4: DIFFERENTIATION & NON-GOALS

## Purpose

Clarify what makes this system different and what it intentionally does not do.

---

## 1) Differentiators provable from code

- **Imbalanced data never reaches the ledger without human correction.** When trial balance does not balance, the upload is staged and the response states that data is not saved to the main ledger; resolve-ingest requires a human-supplied adjustment and re-verification before write.

- **Certified export is physically blocked when the audit chain or integrity fails.** The export gate calls chain verification and server-side materiality checks; certified export returns an error when the gate disallows. Final integrity check (balance sheet equation, trial balance balance, plug detection) also blocks certified export when it fails.

- **Amount provenance is required.** Resolve-ingest and adjustment flows validate that every non-zero amount has a valid provenance (e.g. human_entered, engine_calculation, ledger_exact). Requests without valid provenance are rejected with a clear error.

- **Shadow Auditor can block post.** Before posting a journal entry, the system runs deterministic and optional AI checks. If the result severity is block, the post is refused and the entry remains approved but not posted; findings are stored.

- **Segregation is enforced for critical actions.** Period lock, certify close, and journal entry approve/post require the approver role; the system checks role and records the outcome in the audit log.

- **Production disallows in-memory fallbacks.** When the environment is production, the code throws if staging, audit log, or period lock would use in-memory storage instead of the database, preventing silent data loss.

- **GL post-back is off by default.** Pushing to an external GL returns a “disabled” style response unless explicitly enabled via configuration.

---

## 2) Explicit non-goals (what this system will not become)

- **It is not a replacement for the general ledger.** It does not run the primary books of record; it consumes trial balance and adjustments and can optionally push to an external GL when enabled.

- **It does not automate accounting conclusions.** It does not decide lease classification, revenue timing, or adequacy of disclosures; it can store and suggest, and it can block post or export when rules are not met.

- **It does not certify or opine.** “Certified” in this system means “session is marked certified and gates passed”; it is an internal control state, not an external audit opinion or regulatory filing.

- **It is not a multi-tenant shared service** with cross-tenant visibility or shared data; tenant isolation is strict.

- **It does not allow certified export when the audit chain is invalid or when balance/integrity checks fail.** There is no configured bypass for that in production.

---

## 3) Tradeoffs made intentionally

- **AI: fail-open for Shadow Auditor, fail-closed for math and export.** If the AI part of the Shadow Auditor fails, the system records a warning and does not block the post (fail-open). Balance checks, export gate, and integrity checks do not depend on AI; they are deterministic and fail-closed (block when they fail).

- **Draft vs certified.** Draft export can be allowed (under configurable policy) for internal use with clear labeling, even when balance or chain would block certified. Certified export has no such relaxation.

- **Human must supply the fix for imbalance.** The system does not auto-generate the correcting entry for an imbalanced upload; it stages and waits for a human-supplied adjustment with provenance. This favors control and attribution over automation.

- **Optional GL post-back.** Pushing to an external GL is disabled by default, so the default deployment does not assume or modify an external system of record.

---

## 4) Why those tradeoffs make sense for regulated environments

- **Fail-closed math and export** ensure that certification and reporting cannot be issued when the system has detected a broken chain or failed integrity check, which supports regulatory and audit expectations.

- **Fail-open AI** avoids blocking the close when an optional AI component fails, while still recording the failure for review; the critical path (balance, chain, gate) remains deterministic.

- **Required provenance and HITL** give a clear line of accountability for every amount and for approvals, which supports audit and regulatory requirements for attribution and segregation.

- **No certified bypass** and **production no-memory fallback** reduce the risk of misconfiguration or silent failure that could undermine reliance on the system in a regulated context.

---

# DOCUMENT 5: PILOT SUITABILITY & ADOPTION PATH

## Purpose

Explain how an external organization would realistically try this system.

---

## 1) Safest pilot entry point

- **Single entity, single period.** One close session for one entity and one period (e.g. one month or one quarter) so that scope is bounded and the close workflow (checklist, lock, certify) can be exercised end-to-end without affecting other entities or periods.

- **Trial balance upload and resolve-ingest only.** Start by uploading a trial balance (balanced or intentionally imbalanced). If imbalanced, use the staged identifier and resolve-ingest with a human-supplied adjustment and provenance. Confirm that the ledger is only updated after a balancing resolution. No need to enable GL post-back or certified export in the first iteration.

- **Draft export only.** Request draft export to verify that the system produces output with the expected disclaimers and labeling. Do not request certified export until the close session is certified and the export gate and integrity checks are understood.

---

## 2) Parallel-run model

- **Keep existing close and reporting in place.** Run the pilot as a parallel process: same period closed and reported using existing tools; in parallel, run the same (or a copy of) trial balance and close steps in this system. Compare outputs (e.g. draft PDF, binder structure) and behavior (e.g. when imbalance is staged, when export is blocked).

- **Compare gate outcomes.** Intentionally create conditions that should block certified export (e.g. invalid chain, or session not certified) and confirm that the system returns an error and does not produce certified output. Repeat with conditions that should allow certified export after certification and passing checks.

- **No cutover until criteria are met.** Do not switch reporting or certification to this system until the organization has defined and met success criteria (see below) and is satisfied with control and audit trail behavior.

---

## 3) Required inputs

- **Database.** A persistent database (e.g. Postgres) with the schema applied; production mode requires it and disallows in-memory fallbacks for staging, audit log, and period lock.

- **Tenant and auth.** At least one tenant; authentication and authorization configured so that requests carry tenant and, where required, role (preparer, reviewer, approver).

- **Trial balance data.** For ingest: a file (e.g. CSV/XLSX) or equivalent payload with account and debit/credit columns. For resolve-ingest: a staged identifier and an adjustment array with amounts and provenance (e.g. human_entered with signer).

- **Close session and workflow.** For certified export: a close session that has been advanced to certified status (after checklist and lock as implemented), and the period and entity context needed for the export gate and integrity check.

---

## 4) Outputs they would evaluate

- **Staging response.** When an imbalanced trial balance is uploaded, the response should indicate staged status, staged identifier, and a message that data is not saved to the main ledger until resolve-ingest. Verify that no row appears in the period trial balance for that period until a valid resolve-ingest is executed.

- **Resolve-ingest result.** After sending a balancing adjustment with valid provenance, the response should indicate success and the period trial balance should reflect the combined data. Requests with invalid or missing provenance should be rejected.

- **Export responses.** Draft export should return a document with the expected draft labeling. Certified export with a non-certified session (or with a failed gate or integrity check) should return an error and no certified document. Certified export with a certified session and passing gate and integrity should return the document.

- **Journal entry post.** When the Shadow Auditor is configured to block (e.g. for testing), a post request should return an error and the journal entry should remain in approved state; when the Shadow Auditor allows, post should succeed and the entry should move to posted.

- **Audit ledger and chain.** After material events, the audit ledger should show append-only entries; verification should report valid. Any tampering or break in the chain should cause verification to fail and certified export to be blocked.

---

## 5) Criteria for success/failure

- **Success:** (a) Imbalanced uploads never write to the period trial balance until resolve-ingest with valid provenance. (b) Certified export is refused when the session is not certified or when the gate or final integrity check fails. (c) Role checks prevent preparers from performing approver-only actions (e.g. period lock, certify). (d) Shadow Auditor block prevents post and leaves the JE approved but not posted. (e) Audit ledger verification passes when the chain is intact and fails when it is not.

- **Failure:** (a) Unbalanced data appears in the period trial balance without a valid resolve-ingest. (b) Certified export succeeds despite an uncertified session or a failed gate or integrity check. (c) In-memory fallbacks are used in production for staging, audit log, or period lock. (d) Amounts are accepted without valid provenance where the system is designed to require it.

---

## 6) Exit conditions (how to stop with zero damage)

- **No cutover means no operational dependency.** If the pilot is parallel-only and no external reporting or GL posting depends on this system, stopping the pilot means simply ceasing to use it. Existing close and reporting continue unchanged.

- **Data scope.** Pilot data (one tenant, one or a few periods) can be isolated. Discontinuing the pilot does not require migrating data out of an external GL if GL post-back was never enabled or was only used in a test environment.

- **Destructive operations are guarded.** Schema reset and similar destructive operations require an explicit environment flag and are refused when that flag is not set and the environment is not test, so accidental wipe of the pilot database is prevented by the implemented guards.

- **Recommendation.** Define the pilot duration and decision point in advance. If success criteria are not met or the organization decides not to adopt, stop sending new data and optionally archive or delete the pilot tenant data; no change to the existing close or reporting process is required if the pilot was parallel-only.

---

*End of business documents. All claims are tied to current code, tests, schema, or runtime behavior. Where something is not implemented (e.g. GL post-back, cross-tenant use), it is stated clearly.*
