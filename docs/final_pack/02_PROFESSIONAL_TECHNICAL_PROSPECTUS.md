# Professional Technical Prospectus

**Purpose:** Credibility for technical and audit readers. Based on current implementation only.

---

## Core system pillars

### Deterministic math and the Truth Gate

Before any **certified** financial export (PDF or CSV) is produced, the system runs:

1. **Export gate.** Server-side check: the tamper-evident audit chain for the tenant is verified; period-level materiality state is read from the database (not from the client). When an integrated supervisor is enabled, unresolved conflicts for the period can also block export. If the chain is invalid or materiality is breached, the gate fails and certified export is blocked.

2. **Final integrity check.** Trial balance must balance (debits equal credits within tolerance). The balance sheet equation (Assets = Liabilities + Equity) must hold within tolerance. Optionally, the ledger is checked for material reliance on “plug” accounts (e.g. Suspense, Miscellaneous, Other); if plug use is suspicious, export is blocked.

These checks are deterministic. They do not depend on AI. If they fail, the system refuses to generate certified output and returns an error. Draft outputs can be produced for internal use with appropriate labeling and do not require the Truth Gate to pass.

---

### Staging quarantine for imbalance

When a trial balance is submitted and the sum of debits does not equal the sum of credits within the allowed tolerance, the system does **not** write to the period trial balance. The upload is placed in a staging area and a staged identifier is returned. The user is informed that the data does not balance and that it has been staged for human review. A separate, explicit step—resolve-ingest with a human-supplied adjustment and declared provenance—is required before the corrected data can be applied. Until then, the main ledger is unchanged.

---

### Human attribution and provenance

Every amount used to resolve a staged imbalance or in adjustments must have a valid provenance (e.g. human_entered, engine_calculation, ledger_exact). The system rejects requests that lack valid provenance for non-zero amounts. Lock, certification, and journal entry approval/post are gated by role (preparer, reviewer, approver). The system checks the actor’s role before allowing the action and records the outcome in the audit log. The system does not decide the “correct” adjustment; the human supplies it and the system enforces balance and attribution.

---

### Audit binder and hash-chain verification

Material events (e.g. mapping updates, JE approval, JE posting, export, certify close) are appended to an audit ledger. The ledger is append-only and hash-chained: each entry includes a reference to the previous entry’s hash, and its own hash is computed over a canonical representation of the entry. Entries are not updated or deleted. Verification walks the chain in order and recomputes each entry’s hash; if any link is broken or altered, verification fails. The result of this verification is used by the export gate: certified export is blocked when the chain is invalid. Audit binder exports (certified) include this chain and are only produced when the close session is certified and the export gate and final integrity check pass.

---

## AI layer

Where present, the AI layer is **advisory only**:

- **Shadow Auditor.** A pre-post review runs before a journal entry is posted. It includes deterministic checks (e.g. restricted accounts, materiality) and optional AI-assisted checks. The AI does not edit or compute amounts; it only flags. Output is a severity (ok, warn, block) and findings. The **caller** blocks the post when severity is “block”; the journal entry remains in approved-but-not-posted state and findings are stored. **On AI failure, the Shadow Auditor fails open:** the system records a warning (e.g. AI_FAILED) and does not block the post, so the close is not held up by an AI outage. Balance checks and the export gate do not depend on AI and remain fail-closed.

- **Other pillars (e.g. classifier, justifier, advisor).** Used for classification, narrative, or suggestions. They do not post to the ledger or calculate totals. Outputs are logged (e.g. to `ai_call_log`) with tenant and pillar for audit. Amounts that affect the ledger still require human-supplied provenance; AI cannot post unprovenanced amounts.

---

## Reliability posture

- **If AI fails:** The Shadow Auditor records a warning and does not block the post (fail-open). Deterministic checks (balance, export gate, integrity check) do not use AI; they remain enforced. Certified export still depends only on session certification, chain verification, and integrity checks.

- **What gates still enforce correctness:** Trial balance and balance sheet integrity are enforced by deterministic code. The export gate uses server-side state and the audit ledger chain. Certified export cannot be produced when the chain is invalid or when the final integrity check fails. There is no configured bypass for these checks in production.

- **Production behavior.** When the environment is production, the code disallows in-memory fallbacks for staging, audit log, and period lock. A persistent database and tenant context are required; otherwise the application throws rather than silently using memory.

---

*All statements above are tied to current code and tests. No future features are asserted.*
