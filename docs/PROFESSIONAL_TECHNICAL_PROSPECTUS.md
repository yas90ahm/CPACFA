# Professional Technical Prospectus

**Verification over Trust**

This document describes the technical capabilities of the application as implemented. It is based strictly on the existing codebase and does not assert features or behaviors that are not present in the implementation.

---

## Section 1: Core System Capabilities

### 1.1 Staging and Quarantine of Imbalanced Data

The system is designed so that **imbalanced data never reaches the main ledger** until it has been corrected. When a trial balance is submitted and the sum of debits does not equal the sum of credits within the allowed tolerance, the system does not write to the period trial balance or any production ledger. Instead, it places the upload in a **staging area** and returns a staged identifier. The user is informed that the data does not balance and that it has been staged for human review. A separate, explicit step—human-in-the-loop resolution with a user-supplied adjustment—is required before the corrected data can be applied. Until that resolution is completed, the main ledger remains unchanged. This ensures that the accounting equation is never violated by raw or uncorrected input.

### 1.2 The Truth Gate

The system enforces a **Truth Gate** before any **certified** financial report or export can be produced. Certified exports are only allowed when:

- The close session has been formally certified for the period.
- An export gate check passes: the tamper-evident audit chain for the tenant is verified, and any server-side materiality or rounding checks for the period are satisfied.
- A final integrity check passes: the trial balance balances (debits equal credits within tolerance), the balance sheet equation holds (Assets = Liabilities + Equity within tolerance), and the ledger is not deemed to rely on suspicious “plug” accounts (e.g. Suspense, Miscellaneous, or Other) absorbing a material share of activity.

If any of these conditions fail, the system **blocks** the certified export and returns an error. Draft workpapers may be produced for internal use with appropriate watermarks and disclaimers, but **no certified PDF or CSV is issued** when the Truth Gate fails. This makes it impossible to issue official financial reports that do not meet a defined mathematical and structural integrity standard.

### 1.3 The Digital Supervisor (Shadow Auditor)

The system includes a **Shadow Auditor** that evaluates journal entries before they are posted. This component runs both deterministic checks and optional AI-assisted checks. It does not change amounts; it only flags or blocks. When the Shadow Auditor determines that a journal entry should be **blocked** (for example, when it touches restricted or related-party accounts, or when the AI-assisted assessment returns a block severity), the system **prevents the post** from completing. The user receives a clear refusal and a stable error code; the journal entry remains in an approved-but-not-posted state. The Shadow Auditor’s findings are stored for audit and can be included in the audit trail and binder. Thus the system acts as a **digital supervisor** with the authority to block non-compliant or flagged actions before they affect the ledger.

---

## Section 2: Data Privacy & Institutional Security

### 2.1 Tenant Isolation and Privacy

All persistent data is **scoped by tenant**. Every request that touches business data is associated with a tenant identifier. Staging items, journal entries, close sessions, audit ledger entries, shadow audit findings, and exports are stored and retrieved by tenant. There is no cross-tenant access in the implemented logic. The architecture supports a **privacy model** where each institution’s data is isolated. The implementation does not send tenant data to external AI training sets; tenant-scoped data is used only in the context of the application’s own processing and storage.

### 2.2 Tamper-Evident Audit Trail

The system maintains an **append-only, hash-chained audit ledger** for material events. Each new entry includes a reference to the previous entry’s hash, and its own hash is computed over a canonical representation of the entry (including event type, snapshots, rationale, and the previous hash). Entries are not updated or deleted. Verification consists of walking the chain in order and recomputing each entry’s hash from the stored payload and the previous entry’s hash; if any link is broken or altered, verification fails. This creates a **tamper-evident** record: any change to an existing entry or to the order of entries would invalidate the chain. The result of this verification is used by the export gate before any certified export is allowed.

### 2.3 Fail-Closed Security Posture

Certified exports are **fail-closed**. The export gate and the final integrity check run on the server using stored state and the audit chain. If the audit chain verification fails, or if the balance sheet or trial balance integrity checks fail, or if materiality or plug-detection rules are violated, the system **refuses** to generate the certified output and returns an error. There is no option to bypass these checks for certified mode in production. Draft outputs may be allowed under controlled conditions for internal review, but **official certified statements and audit binder exports are physically blocked** when data integrity or the audit chain is compromised.

---

## Section 3: Product Specification Sheet

### 3.1 Supported Accounting Jurisdictions

The application’s internal rules and standard-selection logic support the following reporting frameworks as first-class options:

- **United States** — US GAAP  
- **Canada** — ASPE (Accounting Standards for Private Enterprises) or IFRS for publicly accountable entities  
- **United Kingdom** — FRS 102 (Financial Reporting Standard 102)  

Standard-specific citations (e.g. ASC, IAS) and topic-level resolution (e.g. lease, revenue, foreign exchange) are driven by the selected framework.

### 3.2 Professional Deliverables

The system produces:

- **Full Audit Binders** — Bundles of financial statements with justification chains and, for each line, links to source documents and timestamped reasoning. Available in PDF and CSV. Certified binder export is only allowed when the close session is certified and the export gate and final integrity check pass.
- **Certified Statements** — Balance sheet, profit and loss, and related outputs in PDF or CSV with no draft watermark, issued only after certification and successful Truth Gate checks.
- **Draft Workpapers** — Preliminary PDFs (and optionally CSV) clearly marked as draft, not certified, and for internal or review use only. These may be produced under configurable rules (e.g. with or without imbalance warnings) and do not require a certified session.

### 3.3 Hard Integrity Standard

The default **rounding and materiality tolerance** used for balance checks (trial balance: debits vs credits; balance sheet: Assets vs Liabilities + Equity) and for certified outputs is **0.01** (one cent or one unit in the smallest currency unit). The implementation treats this as the standard for “zero tolerance” in the FASB/IFRS sense for certified material: certified exports are not issued when the gap between debits and credits, or between assets and liabilities plus equity, exceeds this tolerance. This constitutes a **hard integrity standard** for all certified outputs.

---

## Section 4: Market Differentiation

### 4.1 Deterministic Machine of Proof vs Administrative Checklist

Many accounting and close-management tools are **administrative**: they track tasks, due dates, and human sign-offs. The close is “complete” when the checklist is done, regardless of whether the underlying numbers actually balance or whether the audit trail is intact.

This application is built as a **deterministic machine of proof**. It does not only record that a human performed a step; it **verifies** that the mathematics hold. Trial balance ingestion either balances (within tolerance) or is staged for correction; it is not written to the main ledger until a human-approved correction is applied and the result balances. Journal entries are validated for balance before they can be proposed and approved; the Shadow Auditor can block posting when entries do not meet policy or risk rules. Certified exports are only produced after the system has verified the audit chain and re-checked the balance sheet equation and trial balance. If verification fails, the export is refused. The system therefore **performs and validates the work**—it proves that the books balance and that the chain of events is intact—rather than only recording that a human asserted completion. The posture is **verification over trust**: the institution can rely on the outputs because the system has enforced and checked the rules, not only the workflow.

---

*Document generated from the implemented codebase. No code snippets, file paths, or internal function names are included; all statements above correspond to behaviors and data flows present in the application.*
