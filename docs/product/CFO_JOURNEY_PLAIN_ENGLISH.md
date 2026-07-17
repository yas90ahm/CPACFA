# Controller/CFO Journey — Plain English (Code-Based Only)

*Assumes a non-technical finance user with a basic integration or script. No UI invented; only behavior supported by endpoints and responses.*

---

## 1) What is the first thing they would do?

They would either **upload their trial balance** or **create/ensure a close session for a period**.

- **Upload path:** The script sends their ERP export (CSV or XLSX) to the system. The system expects a file with account name, debit, and credit columns. If the file is empty or columns cannot be determined, the system responds with an error telling them to fix the file or confirm column mapping.
- **Close path:** The script calls “ensure session” with an **entity ID** and a **period** (e.g. `2025-01`). The system creates a new “close session” for that period in draft, or returns the existing one. That session is the container for the rest of the process.

**Refs:** `POST /api/trial-balance/ingest` (file upload), `POST /api/close/sessions/ensure` (body: `entityId`, `periodLabel`).

---

## 2) What do they need (inputs)?

- **Authentication:** A valid token (Bearer) so the system knows who they are and which tenant they belong to. Without it, in production the system returns 401 Unauthorized.
- **Tenant context:** In production, the system also requires that the tenant has a database attached. If not, it returns 503 “Tenant context required.”
- **For ingest:** A CSV or XLSX file (field name `file`), and optionally `periodLabel`, `entityId`, `closeSessionId` in the body. If the trial balance is out of balance, the system can stage it for “human in the loop” resolution instead of saving to the main ledger.
- **For ensure session:** `entityId` and `periodLabel` in the body. If either is missing, the system returns 400 with “entityId and periodLabel are required.”
- **For advance/certify:** The **close session ID** returned from ensure (or from creating a session), and for certify a **certifiedBy** name. Advance may require an “approver” role; otherwise the system returns an error about insufficient role.

**Refs:** `src/auth/middleware.ts`, `src/routes/close/close_sessions.ts`, `src/routes/trial-balance/ingest.ts`.

---

## 3) What happens when they run board-ready-pack?

They send a **period** and a **trial balance** (array of account name, debit, credit). Optionally they can send **journal entries** and a **close session ID**.

- The system runs a **structural precheck** (no database, no AI): it checks that debits equal credits, that a balance sheet equation holds, and similar structural rules.
- The response includes a **verdict** (e.g. pass/fail) and the **period label**. If they passed a **close session ID** and the session exists, the response also includes a **PBC index** (evidence index) and **trust tokens** (e.g. certified snapshot ID, snapshot hash, hash version, certified source).

If they send the wrong shape (e.g. `trialBalance` not an array), the system returns 400 with a clear code and message (e.g. `TRIAL_BALANCE_NOT_ARRAY`). They get a **plain-English view** of whether the numbers are structurally “board ready” and, when linked to a close session, evidence and trust tokens for that session.

**Refs:** `POST /api/precheck/board-ready-pack`, `src/routes/precheck.ts` (body: `periodLabel`, `trialBalance`, optional `journalEntries`, optional `closeSessionId`).

---

## 4) What happens when it says NOT_READY?

When they call **advance** and the close is not ready to move forward, the system responds with **422** and code **NOT_READY**. The response body includes:

- **statusBefore** and **statusAfter** (unchanged),
- **actionTaken: 'none'**,
- **blockers**: a list of items, each with **code**, **message**, **remediation**, and **details**.

The **message** and **remediation** are human-readable. Typical blockers come from the readiness check, for example:

- “Checklist not initialized; run initializeChecklistTemplate first.”
- “Cash reconciliation not complete; bank recon run(s) require sign-off.”
- “X critical issue(s) open; resolve or waive before close.”
- “X journal entry(ies) in draft or proposed; approve or reject before close.”
- “Audit ledger chain verification failed.”
- “Rounding gap exceeds materiality; resolve before close.”

So the CFO sees **why** they cannot advance and a short **remediation** line (e.g. “Complete checklist, resolve issues, and ensure integrity before advancing.”). They must address those items (via the same system or process) and call advance again.

**Refs:** `POST /api/close/sessions/:id/advance` returns 422 with `code: 'NOT_READY'`, `blockers` array; `src/services/close_session_service.ts` (AdvanceBlocker, mapHardBlockersToBlockers); `src/services/close_checklist_readiness_service.ts` (hardBlockers strings).

---

## 5) What happens when they use advance?

They call advance with the **close session ID** (and optionally **certifiedBy**). The system:

- **If the session is certified:** It does nothing and returns success with **actionTaken: 'none'**.
- **If the session is locked:** It tries to **certify** the close (same as the certify endpoint). If certification succeeds, it returns **actionTaken: 'certified'** and includes **certifiedSnapshotId**, **snapshotHash**, **hashVersion**. If certification fails (e.g. hard blockers or wrong role), it returns 422 NOT_READY with the blockers.
- **If the session is draft, in_progress, ready_for_review, or finalized:** It moves the session **step by step toward locked** (draft → in_progress → ready_for_review → finalized → locked). Before moving to finalized or locked, it re-checks readiness; if any hard blocker exists, it returns 422 NOT_READY. When it reaches **locked**, it records a “close lock” event in the audit ledger and returns success with **actionTaken: 'locked'**.

So in one call they can go from draft all the way to locked (or certified if they started at locked), or get a clear NOT_READY and a list of blockers.

**Refs:** `POST /api/close/sessions/:id/advance`, `src/services/close_session_service.ts` (advanceSession, nextStatusTowardLocked, recordMaterialEvent for close_lock and certify_close).

---

## 6) What happens when it becomes certified?

When the session becomes **certified** (either by calling **certify** or by **advance** from locked):

- The system creates a **ledger snapshot** of the trial balance (and any approved adjustments) and stores a **hash** of that snapshot.
- It records a **certify_close** event in the **audit ledger** (append-only, hash-chained).
- The session **status** is set to **certified** and linked to that snapshot.

After that:

- **Audit binder** (e.g. GET binder, GET binder/export/pdf, GET binder/export/csv) can be used **only** for a **certified** session. The system checks the session status and runs the export gate (chain verification, materiality, and optionally unresolved conflicts). If the gate fails, export is blocked with a 403 and a clear alert/message.
- **Certified export** (e.g. POST export/pdf or export/csv with **exportMode: 'certified'** and **closeSessionId**) uses that **certified snapshot** as the source of truth. The system will not use “draft” or uncertified data for certified export.

So “certified” means: **this period’s numbers are locked, hashed, and the only source the system will use for certified binder and certified export.**

**Refs:** `src/services/close_session_service.ts` (certifyCloseSession, createSnapshotFromTrialBalanceAndEntries, recordMaterialEvent('certify_close')); `src/routes/audit/audit_binder.ts` (requireCertifiedSession, getCertifiedStatementsForBinder); `src/routes/export.ts` (exportMode certified, checkExportGate).

---

## 7) What do they receive that is valuable?

- **From ingest:** Balance sheet, P&L, optional cash flow and other outputs; quality checks; data gaps; links to audit binder, GAAP consistency, reconciliation summary, and todos. If the file was balanced and accepted, they have a single place that connects their TB to statements and audit-style links.
- **From board-ready-pack:** A structural “board ready” verdict and, when tied to a close session, trust tokens (snapshot ID, hash) and PBC-style evidence index.
- **From advance (when successful):** Clear status progression (draft → … → locked → certified), and when certified, **certifiedSnapshotId**, **snapshotHash**, **hashVersion** — proof of what was certified and that it hasn’t changed.
- **From binder:** A JSON **audit binder** (statements + structure) for a certified session; optional **PDF** and **CSV** exports of the same certified content. Response headers can include certified snapshot ID and hash for audit trail.
- **From export:** **PDF** document package and **clean ledger CSV** in either draft or certified mode. Certified mode uses only the certified snapshot and is gated by chain and materiality.

So the **valuable outputs** are: **structured financials**, **board-ready check**, **certified snapshot + hash**, **audit binder (JSON/PDF/CSV)**, and **exportable PDF/CSV** tied to a certified close.

**Refs:** Ingest response shape in `src/routes/trial-balance/ingest.ts`; board-ready-pack in `src/routes/precheck.ts`; advance response in `src/routes/close/close_sessions.ts`; binder and export in `src/routes/audit/audit_binder.ts`, `src/routes/export.ts`.

---

## 8) What problem does this actually solve for them?

- **Single place for period close:** They get one “close session” per entity/period. They can run ingest, then move that session through draft → locked → certified and know exactly what state it’s in.
- **No certified export until the system says so:** Certified PDF/CSV and binder are only available after the session is certified and the export gate passes (ledger chain, materiality, and optionally conflict checks). So they cannot accidentally export “certified” output from incomplete or tampered data.
- **Clear blockers:** When they try to advance and something is missing (checklist, cash rec, open issues, draft JEs, integrity), they get a list of **blockers** with messages and remediation instead of a generic error.
- **Audit trail:** Lock and certify are written to an append-only, hash-chained ledger. The certified snapshot is hashed; binder/export can expose that hash so auditors can verify what was certified.
- **Structural sanity check:** Board-ready-pack gives a quick, stateless check that debits = credits and the balance sheet equation holds before they invest in the full close.

So the system solves: **controlled, gated period close with a clear path to “certified” and to audit-ready export, with explicit blockers and an audit trail.**

**Refs:** Close session state machine and readiness in `src/services/close_session_service.ts`, `src/services/close_checklist_readiness_service.ts`; export gate in `src/services/export_gate_service.ts`; audit ledger in `src/services/audit_ledger_service.ts`, `src/db/repositories/audit_ledger_repository.ts`.

---

## 9) Where would they get confused?

- **APIs and tokens:** They don’t understand “Bearer token” or “tenant context.” A script or integration must handle auth and tenant; otherwise they see 401/503 and may not know what to fix.
- **entityId and periodLabel:** Ensure session requires **entityId** and **periodLabel**. If the script doesn’t ask for “company/entity name or ID” and “period (e.g. 2025-01),” they get 400 and may not know what to send.
- **Close session ID:** Many steps (advance, certify, binder, certified export) need the **closeSessionId** returned from ensure or create. If the script doesn’t save and reuse it, they can’t advance or get the binder.
- **NOT_READY without context:** The blockers are plain text (e.g. “Checklist not initialized”), but the **actions** (e.g. “run initializeChecklistTemplate”) are system/API concepts. They may not know there is an endpoint to initialize the checklist or how to “resolve” critical issues or “approve” JEs unless the script or docs map those to concrete steps.
- **Roles:** Certify (and advance from locked to certified) requires an **approver** role. If their token has a different role, they get an error about “Insufficient role: certify_close requires approver” and may not know how to get an approver token.
- **Column mapping:** If the TB file has nonstandard columns, ingest can return **requiresColumnConfirmation: true** and ask for confirmation or HITL resolve. A non-technical user may not know how to “confirm columns” or use “resolve-ingest.”
- **Imbalanced file:** If the uploaded TB doesn’t balance, the system may stage it for HITL and not save to the main ledger. They might think the upload “worked” but not realize they must fix and resolve the staging item.

**Refs:** All of the above from route validation and error responses in `src/routes/`, `src/auth/middleware.ts`, `src/services/close_session_service.ts`, `src/routes/trial-balance/ingest.ts`.

---

## 10) What would feel “magical” vs strict or frustrating?

**Magical:**

- **One advance call** moving draft → locked (or locked → certified) in a single step, without clicking through multiple screens.
- **Board-ready-pack** giving an immediate structural yes/no and, with a close session, **trust tokens** (snapshot ID, hash) that feel like “proof” the numbers are locked.
- **Certified snapshot + hash** returned on certify/advance: a concrete “this is what we certified” they can point to.
- **Binder and certified export** only appearing when the system allows it (certified + gate passed), so it feels like the system “won’t let them” export the wrong thing.

**Strict / frustrating:**

- **Cannot advance** until checklist is initialized, cash rec is signed off (if any), no critical issues, no draft/proposed JEs, and integrity passes. If any one fails, they get NOT_READY and must fix it — no “override” in the implemented flow.
- **Certify only from locked** and **only with approver role**. If they forget to advance to locked first or use a non-approver token, they get a clear but strict error.
- **Export gate:** If the ledger chain is broken or materiality is exceeded (or unresolved conflicts when that flag is on), certified export returns 403 with an alert. They cannot “force” certified export.
- **File and column rules:** Ingest is strict about file format and balance. Wrong columns or imbalanced TB leads to 400, staging, or “confirm mapping” — they must fix the file or go through HITL.
- **Tenant and auth:** In production, no token or no tenant context means 401/503. The “magic” only works once the script has set up auth and tenant correctly.

**Refs:** Same as above; behavior is entirely from endpoint logic and response codes/messages in the codebase.

---

## One paragraph for a CFO (plain English)

**For a CFO:** This system is a **controlled month-end close and audit-ready export** tool. You give it your trial balance (from your ERP) and a period; it stores the numbers and can produce balance sheet and P&L. You then run a “close” for that period: the system walks you from draft to locked to certified by checking that your checklist is done, reconciliations are signed off, there are no critical issues or unapproved journal entries, and the books pass integrity checks. Until those are satisfied, it refuses to move to “locked” or “certified” and tells you exactly what’s missing. Once certified, it creates a frozen, hashed snapshot of the period and only then allows you to pull an audit binder and certified PDF/CSV. So you get a single, gated path from “my TB is in” to “this period is certified and here’s the export,” with clear blockers and an audit trail — no certified export without passing the checks the system enforces.
