# Executive Overview

**Purpose:** Orientation for senior operators, controllers, and audit leaders. Not a sales document.

---

## What it is

A close and certification control layer that sits downstream of the general ledger. It accepts trial balance and close data, enforces balance and integrity checks, and can produce draft or certified exports. It does not replace the ERP or GL. In a pilot, it runs in parallel to the existing close; the GL and current close tools remain the system of record.

---

## What it does today

- **Stages imbalanced trial balance.** If an upload does not balance (debits ≠ credits within tolerance), the data is held in staging. Nothing is written to the period trial balance until a human supplies a correcting adjustment with declared provenance (e.g. human-entered, engine, source-line). The system rejects adjustments without valid provenance.

- **Close workflow.** Close sessions exist per entity/period. Checklist items can be completed; session status can progress to locked and certified. Period lock and certification require the approver role. The system checks role and records the action in the audit log.

- **Journal entry lifecycle.** Journal entries move through draft → proposed → approved → posted. Approval and post require the approver role. Before post, balance validation and a pre-post review (Shadow Auditor) run. If the Shadow Auditor returns a block, the post is refused and the entry stays approved but not posted. Findings are stored for audit.

- **Export and Truth Gate.** Export can be requested in draft or certified mode. **Certified** export is only allowed when: (1) the close session is certified, (2) the export gate passes (audit chain verified, server-side materiality checks), and (3) the final integrity check passes (trial balance and balance sheet equation within tolerance; optional plug-account checks). If any of these fail, certified export is blocked and the caller receives an error. Draft export can be produced with clear draft labeling for internal use.

- **Audit trail.** Material events (e.g. JE approval, JE post, export, certify close) are appended to an append-only, hash-chained audit ledger. Each entry references the previous entry’s hash. Verification recomputes the chain; if the chain is invalid, the export gate blocks certified export.

- **GL post-back is off by default.** Pushing adjustments or journal entries to an external GL is disabled unless explicitly enabled via configuration. When disabled, the system returns a “not implemented” style response. The pilot does not enable GL post-back.

---

## What it does NOT do

- Does not replace the general ledger or ERP. It consumes data provided to it (uploads, manual entry, adjustments). It does not run the primary books of record.

- Does not decide accounting treatment (e.g. lease classification, revenue timing). It can store and display classifications and suggestions; it does not replace professional judgment.

- Does not auto-correct an imbalanced upload. The human supplies the correcting adjustment and provenance; the system enforces that the result balances and that amounts are attributed.

- Does not certify or opine in a regulatory or audit-opinion sense. “Certified” here means the close session is marked certified and the Truth Gate (export gate + integrity check) has passed inside the system.

- Does not assume real-time sync with an external GL. Optional GL post-back is a separate, disabled-by-default capability.

---

## Where it sits

- **Downstream of transaction capture.** It consumes trial balance data (e.g. CSV/XLSX upload) and optional prior-period or comparative data. It does not read directly from the ERP or GL unless an integration is explicitly built and enabled.

- **Parallel to the close process.** Close sessions and checklists model a close process. The system can run alongside existing close tools. Certification and export gates apply only to what has been certified and verified inside this system.

- **Read/write within its own store.** It writes to its own database (tenant-scoped): staging, period trial balance, journal entries, close sessions, audit ledger. It does not modify an external GL unless GL post-back is explicitly enabled. In the pilot, GL post-back is not enabled.

- **Single-tenant.** All persistent data is keyed by tenant. There is no cross-tenant access in the implemented logic.

---

## Who owns it internally

- **Primary:** Controllership or Finance Operations — responsible for the close process, period lock, certification, and integrity of numbers used for reporting. They own success criteria and pilot scope.

- **Secondary:** Internal Audit — interested in the audit trail, export gate behavior, and segregation. Can use the system to assess control design and operating effectiveness.

- **Involved but not sole owner:** IT — deploys and operates the system, database, and access; does not own accounting or certification decisions.

---

## What “pilot success” looks like

Pilot success is measured by observed behavior, not business outcomes. Success means:

1. Imbalanced trial balance uploads never appear in the period trial balance until a human has submitted a valid resolve-ingest with provenance.

2. Certified export is refused when the close session is not certified, when the export gate fails (e.g. invalid audit chain, materiality breach), or when the final integrity check fails.

3. Role checks prevent preparers from performing approver-only actions (e.g. period lock, certify close, approve/post journal entries).

4. When the Shadow Auditor is configured to block, the post is refused and the journal entry remains in approved-but-not-posted state; findings are stored.

5. The audit ledger chain verification passes when the chain is intact and fails when it is not; certified export is blocked when verification fails.

6. Production does not use in-memory fallbacks for staging, audit log, or period lock; a persistent database and tenant context are required.

7. Amounts used in resolve-ingest or adjustments are rejected when they lack valid provenance.

---

*All statements above are consistent with current codebase behavior. No future capabilities are implied.*
