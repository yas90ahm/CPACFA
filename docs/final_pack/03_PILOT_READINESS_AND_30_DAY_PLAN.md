# Pilot Readiness & 30-Day Pilot Plan (Operator View)

**Purpose:** Give a sponsor confidence that the pilot is safe, bounded, and reversible. Concrete and non-promissory.

---

## Pilot safety envelope

- **Parallel-run only.** The existing close and reporting process stays in place. The same period is closed and reported using existing tools; in parallel, the same (or a copy of) trial balance and close steps are run in this system. No cutover. No dependency on this system for closing the books or for external reporting.

- **Reversible.** Stopping the pilot means ceasing to use the system. No change is required to the existing close process, the GL, or any reporting workflow. Pilot data stays in the pilot database; it can be archived or deleted. No data is pushed to the GL during the pilot, so there is nothing to reverse in production systems.

- **Limited scope.** Single entity, single period (or a small set of periods). One tenant. One pilot environment. No automated GL posting; no production dependency.

- **Destructive operations guarded.** Schema reset and similar destructive operations require an explicit environment flag (`ALLOW_DB_RESET`) and are refused when that flag is not set and the environment is not test. Staging and production never allow destructive ops even if the flag is set. This reduces the risk of accidental wipe of the pilot database.

---

## Required inputs

- **Database.** A persistent database (e.g. Postgres) with the schema applied. Production mode requires it and disallows in-memory fallbacks for staging, audit log, and period lock.

- **Tenant and auth.** At least one tenant. Authentication and authorization configured so that requests carry tenant and, where required, role (preparer, reviewer, approver).

- **Trial balance data.** For ingest: a file (e.g. CSV/XLSX) or equivalent payload with account and debit/credit columns. For resolve-ingest: a staged identifier and an adjustment array with amounts and provenance (e.g. human_entered with signer).

- **Close session and workflow.** For certified export (validation only in pilot): a close session advanced to certified status (after checklist and lock), and the period and entity context needed for the export gate and integrity check.

---

## What will NOT happen in the pilot

- **No automated GL posting.** Pushing entries or adjustments to an external GL is not enabled during the pilot. The GL remains untouched by this system.

- **No production dependency.** The official close, reporting, and filing do not use this system. They depend only on existing tools and the GL.

- **No use of certified output for production reporting.** Certified export may be exercised in the pilot for validation only (to confirm the system blocks when it should and allows when it should). Output is not used for regulatory filing or external audit opinion.

---

## Weekly plan (4 weeks)

### Week 1: Environment and first upload

| What happens | Inputs | Outputs reviewed | Roles |
|--------------|--------|------------------|-------|
| Deploy pilot database and application; create one tenant. | Database and tenant config; access for pilot users. | Application responds; tenant is isolated. | IT (deploy, tenant); Controller or delegate (scope). |
| Assign roles (at least one preparer, one approver). | Role assignment. | Users can access with correct role. | Controller or delegate. |
| Upload a **balanced** trial balance. | Trial balance file (CSV/XLSX) that balances. | Success response; data accepted (and where applicable written to period trial balance in pilot). | Preparer (upload); Controller or delegate (review). |
| Upload an **imbalanced** trial balance. | Trial balance file that deliberately does not balance. | Staged status, staged identifier, message that data is not saved to main ledger until resolve-ingest. Period trial balance in pilot not updated. | Preparer (upload); Controller or delegate (review). |
| Correct the imbalanced upload via resolve-ingest. | Staged identifier; adjustment lines with amounts and provenance (e.g. human_entered, signer). | Success; period trial balance in pilot reflects corrected data. | Approver or delegate (supply adjustment); Controller or delegate (review). |

**Check:** Imbalanced uploads never appear in the period trial balance until a valid resolve-ingest with provenance is submitted.

---

### Week 2: Close workflow and draft export

| What happens | Inputs | Outputs reviewed | Roles |
|--------------|--------|------------------|-------|
| Create close session for pilot entity and period. | Entity, period, session parameters. | Session created; session ID and status. | Preparer (create); Controller or delegate (review). |
| Initialize and complete checklist (as implemented). | Session ID; completion of steps. | Checklist state; status progression. | Preparer (steps); Reviewer or delegate (review). |
| Advance session status (e.g. in progress → ready for review → finalized → locked). | Session ID; status transitions. | Session status after each step. | Preparer/Reviewer; Controller or delegate (review). |
| Request period lock. | Period label; lock reason; identity of locker. | Lock succeeds only when actor has approver role; lock recorded. | Approver (lock); Controller or delegate (review). |
| Request **draft** export (no certification). | Session and period context; financial statement data and clean ledger for payload. | Draft PDF (or equivalent) with draft labeling (e.g. not certified, for internal use). | Preparer or Reviewer (request); Controller and Audit (review). |

**Check:** Close workflow and draft export work as expected. Certified export is not used for any decision.

---

### Week 3: Certification path and gates (validation only)

| What happens | Inputs | Outputs reviewed | Roles |
|--------------|--------|------------------|-------|
| Request certified export **before** session is certified. | Same payload as draft but certified mode. | Error: certified export requires session to be certified. No certified document. | Preparer or Reviewer (request); Controller and Audit (review). |
| Certify the close session (approver role). | Session ID; certifier identity; memo. | Session status becomes certified. | Approver (certify); Controller (review). |
| Request certified export **after** certification. | Session ID; period; payload passing balance and integrity. | Either certified document (if gate and integrity pass) or error. Outcome for evaluation only. | Approver or delegate (request); Controller and Audit (review). |
| Optionally trigger a scenario where gate or integrity should fail. | Depends on implementation. | Error; no certified document. | Controller or Audit (design); both (review). |

**Check:** Certified export is refused when the session is not certified or when the gate or integrity check fails. When all conditions are met, certified export may succeed; that output is for validation only.

---

### Week 4: Journal entry lifecycle and decision point

| What happens | Inputs | Outputs reviewed | Roles |
|--------------|--------|------------------|-------|
| Create JE (draft), propose, approve. | JE lines; approver identity. | JE moves to approved; approval recorded. | Preparer (create, propose); Approver (approve); Controller (review). |
| Request post. | JE ID; identity of user posting. | If Shadow Auditor configured to block: post refused, JE remains approved. Otherwise post may succeed. Outcome recorded. | Approver (post); Controller and Audit (review). |
| Role check: preparer attempts approver-only action (e.g. period lock or certify). | Request with preparer-role identity. | Action refused; audit log shows insufficient role. | Auditor or delegate (attempt); Controller (review). |
| **Pilot decision meeting.** | Week 1–4 observations; documented success/failure criteria. | Go / no-go: continue, extend, or stop with no operational impact. | Controller (owner); Audit (control and trail); Executive sponsor (decision). |

**Check:** Role enforcement and Shadow Auditor block (when configured) behave as documented. Decision point is clear; stopping requires no unwind of production dependencies.

---

## Roles involved (no names)

| Role | Responsibility during pilot |
|------|------------------------------|
| **Controller (or delegate)** | Owns pilot scope and success criteria; reviews inputs and outputs each week; signs off on decision. |
| **Preparer** | Uploads trial balance; creates and proposes journal entries; completes checklist steps; requests draft export. |
| **Reviewer** | Reviews checklist and status; may request draft export; reviews outputs. |
| **Approver** | Supplies or approves adjustments with provenance; approves journal entries; performs period lock and certification; requests certified export (validation only). |
| **Auditor (internal or delegate)** | Reviews staging behavior, export gate behavior, role enforcement, and audit trail. |
| **IT / Security** | Deploys and maintains pilot environment; manages tenant and access; does not own accounting or certification decisions. |
| **Executive sponsor** | Approves pilot; attends decision point. |

---

## Exit conditions

- **Options at decision point:** (1) Continue or extend the pilot. (2) Stop and archive or delete pilot data; no change to existing close or reporting. (3) Proceed to a later phase only after explicit approval and without creating operational dependency on this system for the current close or reporting.

- **No promise of outcomes.** This plan describes what is done each week and who is involved. Success is measured against observed behavior (e.g. imbalance never on ledger without resolve-ingest; certified export blocked when required; role enforcement; audit chain verification), not business results.

- **Reversibility.** Regardless of the decision, stopping use of the pilot system does not require reversing any step in the official close, GL, or external reporting. Zero operational dependency.

---

*All steps and roles are consistent with current system behavior. No new capabilities are asserted.*
