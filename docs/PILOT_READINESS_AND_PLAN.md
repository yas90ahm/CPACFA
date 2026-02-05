# Pilot Readiness & 30-Day Plan

**Source:** Current codebase and BUSINESS_DOCUMENTS.md only. No new capabilities; no speculation; no marketing language.

**Audience:** Senior operators, controllers, audit leaders, and executives who may sponsor a pilot.

---

# DOCUMENT A: PILOT READINESS & RISK STATEMENT

## Purpose

Allow a senior person to sponsor a pilot without reputational risk. Plain, conservative, risk-aware language.

---

## What this pilot cannot break

- **The existing close process.** The pilot is run in parallel. The current month-end or quarter-end close, reporting, and sign-off continue on existing tools and calendars. This system is not used for any step that the organization relies on for external reporting or internal close completion.

- **The general ledger.** Pushing entries or adjustments to an external GL is turned off by default. The pilot does not enable it. No posting from this system to the company’s GL occurs during the pilot. The GL remains the system of record and is not modified by this system.

- **Existing close or audit tools.** The system does not replace or integrate into current close or audit platforms for the pilot. It runs alongside them. No cutover is implied.

- **Production data outside the pilot.** The system uses its own database and a dedicated pilot tenant. It does not read from or write to the ERP, GL, or existing close tool databases. Only data sent into the pilot (e.g. trial balance uploads, close session data) lives in the pilot database.

---

## What systems it does NOT touch

- **General ledger (ERP).** No connection for posting is used when GL post-back is disabled. The system does not touch the GL.

- **Existing close management or checklist tools.** They continue to be used as today. This system is not wired into them for the pilot.

- **External reporting or filing.** No output from this system is used for regulatory filing or external audit opinion. Draft outputs are for internal review only.

- **Other tenants or environments.** Data is scoped to a single tenant. Other tenants or production environments are not accessed or changed.

---

## What happens if the system fails mid-close

- **The close is not delayed.** Because the pilot is parallel, the official close is done on the existing process. If this system is unavailable or fails, the close still completes on the current tools and timeline.

- **No rework in the GL or in reporting.** Nothing that runs in production (close, reporting, filing) depends on this system. There is no rollback or rework required in the GL or in external reports if the pilot system fails.

- **Pilot data.** Any data created in the pilot (staged items, trial balance in the pilot’s period table, close sessions, journal entries, audit ledger) remains in the pilot database. It can be reviewed later or discarded; it does not affect the books of record.

---

## What data is and is not at risk

- **At risk (only within the pilot):** Data stored in the pilot database: trial balance uploads, staged items, close sessions, checklist state, journal entries, audit ledger entries, and any draft exports generated. This data is isolated to the pilot tenant and the pilot database. Loss or corruption affects only the pilot and does not affect the GL or existing close/reporting.

- **Not at risk:** The general ledger, existing close tool data, existing audit workpapers, and any system used for external reporting or filing. The pilot does not write to them. They are not at risk from this pilot.

- **Reversibility.** Stopping the pilot means no longer using the system. No data need be migrated back from an external GL (because nothing was pushed there). The only cleanup, if desired, is to archive or delete the pilot tenant’s data in the pilot database; the existing close and reporting process is unchanged.

---

## Human accountability during the pilot

- **Staging and adjustments.** When an imbalanced trial balance is staged, a human must supply the correcting adjustment and declare provenance (e.g. human-entered). The system rejects adjustments without valid provenance. Approve/reject of staging items is done by a human; the system records the outcome.

- **Roles.** The system enforces roles (preparer, reviewer, approver) for actions such as period lock, certification, and journal entry approval and post. A preparer cannot perform approver-only actions; the system checks and records the result. Who did what is recorded in the audit log.

- **Certification and lock.** Period lock and close certification are initiated by a human (with the required role). The system does not lock or certify on its own; it enforces that the actor has the right role and then records the action.

- **No unattributed automation.** Amounts used to fix an imbalance or in adjustments must have a declared source (human, engine, or source-line). The system does not allow unprovenanced amounts to be applied. Accountability for the numbers remains with the humans who approve and supply them.

---

## Why this is reversible with zero operational dependency

- **No operational dependency.** The official close, reporting, and filing do not use this system during the pilot. They depend only on existing tools and the GL. Therefore there is no operational dependency on this system to close the books or to report.

- **Stopping the pilot.** The organization stops sending data to the pilot and stops using the pilot environment. No change is required to the existing close process, the GL, or any reporting workflow. No “turn-off” of a production dependency is involved.

- **Data.** Pilot data stays in the pilot database. If the pilot is discontinued, that data can be archived or deleted. No data was sent to the GL or to external parties, so there is nothing to reverse in production systems.

- **Guards against accidental damage.** Destructive operations (e.g. schema reset) require an explicit environment flag and are refused when that flag is not set and the environment is not test. This reduces the risk of accidental wipe of the pilot database during the pilot.

---

*All statements above are consistent with current system behavior: parallel run, GL post-back disabled, single-tenant pilot database, role checks, provenance requirements, and guarded destructive operations.*

---

# DOCUMENT B: 30-DAY PILOT PLAN (OPERATOR VIEW)

## Purpose

Show what actually happens during a pilot, week by week. Operator view: inputs, outputs, roles, decision point. Parallel-run only; no GL post-back; draft outputs first; no promises of outcomes.

---

## Assumptions

- **Parallel run only.** The existing close and reporting process is unchanged. This system runs alongside it.
- **No GL post-back.** Pushing to an external GL is not enabled. No entries are sent to the company GL from this system.
- **Draft outputs first.** The pilot focuses on draft exports and internal review. Certified export may be exercised later in the pilot for validation only; it is not used for any production reporting.
- **Single entity, single period (or a small set of periods).** Scope is bounded to one entity and one or a few periods (e.g. one month or one quarter).

---

## Week 1: Environment and first upload

**Objective:** Stand up the pilot environment and confirm that imbalanced data does not reach the ledger until a human corrects it.

| What happens | Inputs required | Outputs reviewed | Who is involved |
|--------------|-----------------|------------------|-----------------|
| Pilot database and application are deployed; one tenant is created. | Database and tenant configuration; access for pilot users. | Confirmation that the application responds and that the tenant is isolated. | IT (deploy, tenant); Controller or delegate (confirm scope). |
| Roles are assigned for the pilot (at least one preparer, one approver). | Role assignment (preparer, reviewer, approver) for pilot users. | Confirmation that users can access with the correct role. | Controller or delegate (assign roles). |
| A **balanced** trial balance is uploaded. | Trial balance file (e.g. CSV/XLSX) for the pilot period that already balances. | Response indicating success and that data was accepted (and, where applicable, written to the period trial balance in the pilot). | Preparer (upload); Controller or delegate (review). |
| An **imbalanced** trial balance is uploaded. | Trial balance file that deliberately does not balance (e.g. debits ≠ credits). | Response indicating staged status, a staged identifier, and a message that data is not saved to the main ledger until resolve-ingest. Confirmation that the period trial balance in the pilot was not updated with the imbalanced data. | Preparer (upload); Controller or delegate (review). |
| The imbalanced upload is corrected via resolve-ingest. | Staged identifier; adjustment lines with amounts and provenance (e.g. human_entered and signer). | Response indicating success; period trial balance in the pilot now reflects the corrected data. | Approver or delegate (supply adjustment and provenance); Controller or delegate (review). |

**End of Week 1 check:** Imbalanced uploads never appear in the period trial balance until a human has submitted a valid resolve-ingest with provenance. No new capabilities are assumed; behavior is observed and recorded.

---

## Week 2: Close workflow and draft export

**Objective:** Run the close workflow (session, checklist, status) in the pilot and produce draft export only.

| What happens | Inputs required | Outputs reviewed | Who is involved |
|--------------|-----------------|------------------|-----------------|
| A close session is created for the pilot entity and period. | Entity and period; session parameters (e.g. basis, standard). | Session created; session ID and status. | Preparer (create session); Controller or delegate (review). |
| Checklist is initialized and completed (as implemented). | Session ID; completion of checklist steps. | Checklist state and any status progression. | Preparer (complete steps); Reviewer or delegate (review). |
| Session status is advanced (e.g. in progress → ready for review → finalized → locked). | Session ID; status transitions. | Session status after each step. | Preparer / Reviewer (advance status); Controller or delegate (review). |
| Period lock is requested. | Period label; lock reason; identity of locker. | Lock succeeds only when the actor has the approver role; lock is recorded. | Approver (lock); Controller or delegate (review). |
| **Draft** export is requested (no certification). | Session and period context; financial statement data and clean ledger for the export payload. | Draft PDF (or equivalent) with draft labeling (e.g. not certified, for internal use). No certified output is requested or used. | Preparer or Reviewer (request draft); Controller and Audit (review output). |

**End of Week 2 check:** Close workflow and draft export work as expected. Certified export is not used for any decision. Existing close and reporting continue on current tools.

---

## Week 3: Certification path and gates (validation only)

**Objective:** Validate that certified export is blocked when it should be, and that it is allowed only when the session is certified and gates pass. No use of certified output for production reporting.

| What happens | Inputs required | Outputs reviewed | Who is involved |
|--------------|-----------------|------------------|-----------------|
| Certified export is requested **before** the session is certified. | Same payload as draft but with certified mode. | Error response: certified export requires session to be certified. No certified document is produced. | Preparer or Reviewer (request); Controller and Audit (review response). |
| The close session is certified (approver role). | Session ID; certifier identity; memo. | Session status becomes certified. | Approver (certify); Controller (review). |
| Certified export is requested **after** certification. | Session ID; period; payload passing balance and integrity checks. | Either a certified document (if the export gate and final integrity check pass) or an error (e.g. chain invalid, integrity failed). Outcome is recorded for evaluation only. | Approver or delegate (request); Controller and Audit (review). |
| Optionally: one scenario where the export gate or integrity check should fail is triggered. | Depends on implementation (e.g. period with known issue). | Error response; no certified document. | Controller or Audit (design scenario); both (review). |

**End of Week 3 check:** Certified export is refused when the session is not certified or when the gate or integrity check fails. When all conditions are met, certified export may succeed; that output is for validation only, not for production reporting.

---

## Week 4: Journal entry lifecycle and decision point

**Objective:** Exercise journal entry draft → propose → approve → post (including Shadow Auditor block when configured) and confirm role enforcement. Then hold the pilot decision.

| What happens | Inputs required | Outputs reviewed | Who is involved |
|--------------|-----------------|------------------|-----------------|
| A journal entry is created (draft), proposed, and approved. | JE lines (account, debit, credit); approver identity. | JE moves to approved state. Approval is recorded. | Preparer (create, propose); Approver (approve); Controller (review). |
| Post is requested. | JE ID; identity of user posting. | If the pre-post review (Shadow Auditor) is configured to block in the pilot: post is refused and the JE remains approved. If not configured to block: post may succeed and the JE becomes posted. Outcome is recorded. | Approver (post); Controller and Audit (review). |
| Role check: a user with preparer role attempts an approver-only action (e.g. period lock or certify). | Request with preparer-role identity. | Action is refused; audit log shows insufficient role. | Auditor or delegate (attempt); Controller (review). |
| **Pilot decision meeting.** | Week 1–4 observations; success/failure criteria from BUSINESS_DOCUMENTS.md (e.g. imbalance never on ledger without resolve-ingest; certified export blocked when gate or integrity fails; role enforcement; Shadow Auditor block when configured). | Go / no-go: continue evaluation, extend pilot, or stop with no operational impact. | Controller (owner); Audit (control and trail); Executive sponsor (decision). |

**End of Week 4:** Decision point. If the organization stops the pilot, it stops using the system; existing close and reporting are unchanged. No operational dependency to unwind.

---

## Roles (no names)

| Role | Responsibility during pilot |
|------|-----------------------------|
| **Controller (or delegate)** | Owns pilot scope and success criteria; reviews inputs and outputs each week; signs off on decision. |
| **Preparer** | Uploads trial balance; creates and proposes journal entries; completes checklist steps; requests draft export. |
| **Reviewer** | Reviews checklist and status; may request draft export; reviews outputs. |
| **Approver** | Supplies or approves adjustments with provenance; approves journal entries; performs period lock and certification; requests certified export (for validation only). |
| **Auditor (internal or delegate)** | Reviews staging behavior, export gate behavior, role enforcement, and audit trail; validates that controls behave as documented. |
| **IT** | Deploys and maintains pilot environment; manages tenant and access; does not own accounting or certification decisions. |
| **Executive sponsor** | Approves pilot; attends decision point; does not need to operate the system. |

---

## Decision point at the end of the pilot

- **Options:** (1) Continue or extend the pilot with the same or adjusted scope. (2) Stop the pilot and archive or delete pilot data; no change to existing close or reporting. (3) Proceed to a later phase (e.g. broader scope or different use case) only after explicit approval and without creating operational dependency on this system for the current close or reporting.

- **No promise of outcomes.** This plan describes what is done each week and who is involved. It does not promise that the organization will adopt the system or that any particular business result will follow. Success is measured against the criteria in BUSINESS_DOCUMENTS.md (e.g. imbalance never on ledger without resolve-ingest; certified export blocked when required; role enforcement; audit chain verification).

- **Reversibility.** Regardless of the decision, stopping use of the pilot system does not require reversing any step in the official close, GL, or external reporting. Zero operational dependency.

---

*All steps and roles are consistent with current system behavior: staging, resolve-ingest, provenance, close workflow, role checks, draft vs certified export, export gate, and Shadow Auditor. No new capabilities are asserted.*
