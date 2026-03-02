# CPA Accounting Language & Workflow Audit

**Auditor perspective:** Senior CPA performing a month-end close for a PE-backed mid-market company ($100M-$1B revenue). Would I use this engine? What language is wrong, misleading, or missing?

**Verdict:** The accounting model (equations, gates, Decimal precision, cross-statement ties) is **production-grade GAAP-correct**. The terminology and workflow have **37 issues** ranging from wrong words to missing concepts that would make a controller hesitate.

---

## SEVERITY LEGEND

- **WRONG** — Incorrect accounting term or concept. Must fix before shipping to a CPA.
- **MISLEADING** — Technically defensible but will confuse or concern a practitioner.
- **MISSING** — A concept or feature a CPA expects that doesn't exist.
- **POLISH** — Correct but could be more precise. Fix when convenient.

---

## PART 1: TERMINOLOGY ISSUES (21 findings)

### T-01 [WRONG] "Cash Flow" tab should be "Cash Flows" (plural)
- **Where:** `statements/page.tsx:23` — tab label `"Cash Flow"`
- **Why:** ASC 230 title is "Statement of Cash Flows." The plural is not optional; it refers to multiple categories of cash flow (operating, investing, financing). The statement header correctly says "STATEMENT OF CASH FLOWS" but the tab contradicts it.
- **Fix:** Change tab to `"Cash Flows"`

### T-02 [WRONG] "Adjusting Entries" page title covers ALL journal entries
- **Where:** `adjustments/page.tsx:354` — heading `"Adjusting Entries"`
- **Why:** Not all entries posted during close are adjusting entries. GAAP distinguishes:
  - **Adjusting entries (AJEs):** Accruals, deferrals, depreciation, amortization
  - **Reclassifying entries (RJEs):** Move amounts between accounts for presentation
  - **Correcting entries:** Fix prior-period errors
  - **Eliminating entries:** Intercompany elimination (consolidation)
  The page handles all types but labels them all "Adjusting." A controller posting a reclassifying entry would question whether the system understands the difference.
- **Fix:** Rename to `"Journal Entries"` (the page subtitle already says "Templates and journal entries for this period"). Keep "AJE" as a source tag for entries originating from templates.

### T-03 [WRONG] "Ingest" is data-engineering jargon
- **Where:** `GLUploadFlow.tsx:518` — button `"Ingest & Begin Close"`, `TBUploadFlow.tsx:357`
- **Why:** CPAs don't "ingest" data. They "import," "upload," or "load" a general ledger.
- **Fix:** `"Import & Begin Close"`

### T-04 [WRONG] "Generate Statements" implies no human judgment
- **Where:** `statements/page.tsx:251,290` — button `"Generate Statements"`, `dashboard/page.tsx:55` — pipeline step `"Generate"`
- **Why:** CPAs "prepare," "compile," or "draft" financial statements. "Generate" implies a machine did it without professional oversight. For an engine that automates the arithmetic but requires human mapping, reconciliation, and review, "Prepare" is more accurate and less likely to alarm auditors.
- **Fix:** `"Prepare Statements"` / pipeline step `"Prepare"`

### T-05 [MISLEADING] "Variance" is overloaded — two different concepts
- **Where:** Reconciliation pages use "Variance" for GL-vs-supporting-balance difference. Variance analysis page uses "Variance" for period-over-period change.
- **Why:** These are fundamentally different:
  - **Reconciliation variance** = difference between GL balance and external source (bank statement). CPAs call this a "reconciling difference" or simply "difference."
  - **Period-over-period variance** = change from prior period. This is the correct use of "variance" in financial analysis (flux analysis).
  Using the same word for both creates confusion. A controller seeing "Over tolerance by $500 variance" on recon and "Material variance: $50,000" on P&L analysis will conflate unrelated concepts.
- **Fix:** Reconciliation pages: rename to `"Difference"` or `"Reconciling Difference"`. Keep `"Variance"` for period-over-period analysis only.

### T-06 [MISLEADING] "Supporting Balance" is imprecise
- **Where:** `reconciliation/[reconId]/page.tsx:522`
- **Why:** CPAs call this the "confirmed balance," "independent balance," "third-party balance," or name the specific source ("Bank balance," "Subledger balance," "Loan statement balance"). "Supporting Balance" sounds like it supports the GL, but it's actually the independent number you're comparing TO the GL.
- **Fix:** Display as `"{Source Document Type} Balance"` when source is known (e.g., "Bank Statement Balance"), fall back to `"Confirmed Balance"` when generic.

### T-07 [MISLEADING] Reconciling item types are bank-reconciliation-only
- **Where:** `reconciliation/[reconId]/page.tsx:41-46` — types: Outstanding Check, Deposit in Transit, Bank Fee, Timing Difference, Error Correction, Other
- **Why:** These only apply to bank accounts. A mid-market company reconciles 20+ account types:
  - **PP&E:** Additions, Disposals, Depreciation, Impairment, Transfers
  - **Prepaids:** New payments, Amortization, Reclassifications
  - **Accrued liabilities:** New accruals, Payments, Reversals
  - **Debt:** Borrowings, Repayments, Interest accrual, Amortization of discount
  - **Revenue/AR:** Billings, Collections, Write-offs, Allowance changes
  - **Inventory:** Purchases, COGS, Write-downs, Adjustments
  A controller reconciling PP&E has no applicable item type except "Other." This makes the system look like it was designed for bank recs only.
- **Fix:** Make reconciling item types configurable per account type, or expand the default list to include: `Accrual, Amortization, Depreciation, Addition, Disposal, Reclassification, Write-off, Payment, Collection, Borrowing, Repayment, Intercompany, Roll-forward Adjustment`

### T-08 [MISLEADING] "Mark Complete" is software-speak
- **Where:** `reconciliation/[reconId]/page.tsx:446`
- **Why:** CPAs "sign off" on a workpaper. "Mark Complete" sounds like checking a box. "Sign Off" or "Submit for Review" conveys professional responsibility.
- **Fix:** `"Sign Off"` (if no reviewer required) or `"Submit for Review"` (if reviewer required)

### T-09 [MISLEADING] "Propose" for journal entries is unusual
- **Where:** `JournalEntryForm.tsx:252` — `"Save & Propose"`, `AdjustmentsEntriesTab.tsx:150`
- **Why:** Standard workflow is Draft → Submit for Approval → Approved → Posted. "Propose" implies tentativeness. CPAs "submit" entries for review/approval.
- **Fix:** `"Submit for Approval"`

### T-10 [MISLEADING] "Advance the session to IN_PROGRESS"
- **Where:** `GLUploadFlow.tsx:508`, `TBUploadFlow.tsx:348`
- **Why:** Technical system language exposed to users. A controller doesn't think in terms of "sessions" or "state machines."
- **Fix:** `"Begin the period close"` or `"Start the close process"`

### T-11 [MISLEADING] "Cascade effects" in toast messages
- **Where:** `adjustments/page.tsx:465` — `"Cascade effects: Adjusted TB updated, statements marked stale, reconciliation GL balances refreshed."`
- **Why:** "Cascade" is a technical/database term. CPAs would understand: "The adjusted trial balance has been updated. Financial statements need to be regenerated. Reconciliation GL balances have been refreshed."
- **Fix:** Rewrite in plain accounting language without the word "cascade."

### T-12 [MISLEADING] Pipeline step "Adjust" implies only AJEs
- **Where:** `dashboard/page.tsx:54`
- **Why:** Same as T-02. The step covers all journal entries, not just adjustments.
- **Fix:** `"Entries"` or `"Journal Entries"`

### T-13 [MISLEADING] "Hash-chain verified" in audit trail
- **Where:** `audit-trail/page.tsx:349`
- **Why:** CPAs care about "tamper-evident" or "immutable." "Hash-chain" is cryptography jargon. IT auditors will understand it; financial statement auditors won't.
- **Fix:** `"Tamper-evident audit log"` (keep hash-chain detail in the technical section below)

### T-14 [POLISH] "Stockholders' Equity" vs entity type
- **Where:** `statements/page.tsx:24,346`
- **Why:** "Stockholders' Equity" is correct for corporations. LLCs use "Members' Equity." Partnerships use "Partners' Equity." PE-backed companies may be any of these. The statement title should adapt to entity type.
- **Fix:** Make configurable per entity: `"Stockholders' Equity"` / `"Members' Equity"` / `"Partners' Capital"` / `"Owner's Equity"`

### T-15 [POLISH] "For the Period Ended" should adapt to period length
- **Where:** `statements/page.tsx:299,331,347`
- **Why:** Monthly close: "For the Month Ended January 31, 2026." Quarterly: "For the Quarter Ended March 31, 2026." Annual: "For the Year Ended December 31, 2026." The generic "For the Period Ended" is acceptable but less professional.
- **Fix:** Derive period length from start/end dates and use appropriate label.

### T-16 [POLISH] Statement abbreviations "IS", "BS", "CF", "EQ"
- **Where:** `variance/page.tsx:18-21`
- **Why:** "IS" for Income Statement is uncommon in US practice (more common: "P&L"). "BS" for Balance Sheet is common. "CF" is fine. "EQ" is unusual (more common: "SCE" for Statement of Changes in Equity).
- **Fix:** Consider full names in the dropdown: `"Income Statement"`, `"Balance Sheet"`, `"Cash Flows"`, `"Equity"`

### T-17 [POLISH] "Entity" should be "Company" in user-facing text
- **Where:** `close/page.tsx:214`, `settings/general\page.tsx:85`, portfolio page, various
- **Why:** "Entity" is technically correct (legal entity) but controllers think in terms of "companies." "Entity" is more common in consolidation/intercompany contexts. For the primary use case (single-company close), "Company" is more natural.
- **Fix:** User-facing: `"Company"`. Internal/API: keep `entity`.

### T-18 [POLISH] "Controller (Preparer)" conflates two roles
- **Where:** `settings/team/page.tsx:112`
- **Why:** In larger teams, the Controller manages the close but Staff Accountants prepare individual workpapers. The system conflates Controller = Preparer. For a 2-person team this is fine; for a 10-person accounting department, the Controller delegates preparation and reviews the work before the CFO certifies.
- **Fix:** Consider splitting into `"Staff Accountant (Preparer)"` and `"Controller (Close Manager)"`, or note that the Controller role can prepare and delegate.

### T-19 [POLISH] "Reject" button should be "Return for Revision"
- **Where:** `JournalEntryForm.tsx:259`, `reconciliation/[reconId]/page.tsx:476`
- **Why:** "Reject" has finality. In practice, a reviewer sends work back with comments for the preparer to revise. "Return for Revision" or "Request Changes" is more collaborative and accurate.
- **Fix:** `"Return for Revision"` with required comment.

### T-20 [POLISH] "Evidence" could be "Supporting Documentation"
- **Where:** Used throughout: evidence policy, recon evidence, JE evidence columns
- **Why:** "Evidence" is audit terminology (AU-C 500). In the close context, controllers call these "supporting documents," "backup," or "attachments." "Evidence" is technically correct but sounds like you're building a legal case.
- **Fix:** Consider `"Supporting Documents"` for user-facing labels. Keep `evidence` in the API/database.

### T-21 [POLISH] Variance threshold text: "or 10%"
- **Where:** `variance/page.tsx:220` — `"Threshold: $50,000 or 10%"`
- **Why:** Should clarify whether it's AND or OR logic. "Material if change exceeds $50,000 OR 10% of prior period" is clearer. CPAs need to know the exact rule.
- **Fix:** `"Material if dollar change >= $X or percentage change >= Y%"`

---

## PART 2: WORKFLOW ISSUES (10 findings)

### W-01 [MISSING] No reversing entries
- **Why:** Many month-end accruals (accrued payroll, accrued interest, revenue accruals) must be reversed on the first day of the next period. Without auto-reversing entries, the controller must manually create offsetting entries each month. This is a top-5 close management feature.
- **Impact:** Every controller will ask "where do I mark this as a reversing entry?" on day one.
- **Fix:** Add a `"Reverse in next period"` checkbox on journal entries. When the next period opens, auto-create draft reversing entries.

### W-02 [MISSING] No roll-forward schedules
- **Why:** Balance sheet reconciliation for accounts like PP&E, debt, and equity requires a roll-forward: Opening Balance + Additions - Disposals = Closing Balance. The current recon module compares GL to a supporting balance but doesn't present the activity that bridges opening to closing. This is how every CPA reconciles non-cash accounts.
- **Impact:** Controllers will build roll-forwards in Excel and upload them as evidence, defeating the purpose of the tool.
- **Fix:** Add a roll-forward view for reconciliations that shows: Prior Period Closing → Activity (by reconciling item) → Current Period Closing.

### W-03 [MISSING] No flux analysis (budget-to-actual)
- **Why:** Period-over-period variance analysis is one dimension. CPAs also compare actual to budget/forecast. PE firms specifically want to see budget-to-actual variance with explanations. This is table stakes for PE-backed companies.
- **Impact:** Controllers will maintain a separate budget-to-actual analysis in Excel.
- **Fix:** Allow budget upload (or integration); add budget column to variance analysis.

### W-04 [MISSING] No disclosure / notes checklist
- **Why:** Financial statements include notes (significant accounting policies, debt terms, contingencies, subsequent events, related party transactions, etc.). The system generates the four face statements but not the notes. For a complete close, the controller needs a disclosure checklist.
- **Impact:** Controllers will maintain disclosure checklists in Excel or Word.
- **Fix:** Add a "Notes & Disclosures" section with a configurable checklist (can start as a simple checklist with completion tracking).

### W-05 [MISSING] No multi-currency support
- **Why:** PE-backed mid-market companies frequently have international subsidiaries or foreign-currency transactions. The system is USD-only. FX translation (ASC 830) requires: transaction-level gains/losses + period-end translation of foreign sub financials.
- **Impact:** Companies with any foreign operations cannot use the tool for a complete close.
- **Fix:** Phase 2 feature. At minimum, support functional currency per entity and FX translation at the trial balance level.

### W-06 [MISSING] No consolidation
- **Why:** The portfolio view shows multiple entities but there's no way to produce consolidated financial statements (eliminating intercompany balances, minority interest, etc.). PE firms with multiple portfolio companies need this.
- **Impact:** Consolidation done outside the system.
- **Fix:** Phase 2 feature. Start with simple elimination entries.

### W-07 [MISSING] No analytical procedures / reasonableness checks
- **Why:** CPAs perform analytical procedures as part of close: comparing current balances to expectations, identifying unusual fluctuations, checking relationships between accounts (e.g., revenue vs AR, COGS vs inventory). The variance analysis covers P-o-P but not ratio analysis or reasonableness checks.
- **Impact:** Minor — most controllers do this mentally. But automated flags would add value.
- **Fix:** Add optional analytical checks (current ratio, DSO, inventory turns, gross margin %) with alerts when outside expected ranges.

### W-08 [MISLEADING] Reconciliation and adjustments shown as sequential, but they're iterative
- **Where:** Dashboard pipeline: `Upload → Map → Recon → Adjust → Generate`
- **Why:** In practice, recon and adjustments happen simultaneously and iteratively. A reconciliation may reveal the need for an AJE. Posting the AJE changes the TB, which changes recon GL balances. The system correctly handles this (cascade refresh), but the linear pipeline UI suggests a waterfall process.
- **Fix:** Show Recon and Adjust as parallel/iterative steps in the pipeline, or add a note: "Reconciliation and journal entries are iterative — changes to one may affect the other."

### W-09 [MISLEADING] No visible close calendar / task assignments
- **Why:** Controllers manage the close against a calendar (Day 1: Bank recs, Day 2: Revenue accruals, Day 3: Payroll, etc.). The system tracks what's done but doesn't show a target schedule. The "What Needs Attention" section is reactive, not proactive.
- **Impact:** Controllers will maintain a separate close calendar.
- **Fix:** Add a close calendar or task timeline with target completion dates per step.

### W-10 [POLISH] The approval threshold should be configurable
- **Why:** Requiring two-person approval for every JE creates friction for small teams. Many companies approve only entries above a materiality threshold (e.g., entries > $10,000 require approval; smaller entries can be self-approved by the controller). The current system requires approval for ALL entries.
- **Fix:** Add configurable auto-approval threshold in evidence policy settings.

---

## PART 3: WHAT THE ENGINE GETS RIGHT (a CPA's compliments)

These are things that would make a controller trust the system:

1. **"Prove every significant balance sheet account"** — This is real CPA language. Correct and reassuring.

2. **A = L + E hard gate** — The fact that you literally cannot serve unbalanced statements is the #1 requirement. Non-negotiable and correctly implemented.

3. **Debits = Credits enforcement everywhere** — From GL upload through certification. No workarounds.

4. **Posted entries are immutable** — Database triggers prevent UPDATE/DELETE. This is what auditors want to see.

5. **Segregation of duties** — Preparer cannot approve own work. Hardened in production with no bypass. This is SOX-grade.

6. **Cross-statement validation at certification** — Four tie-checks (BS equation, NI tie, cash tie, equity tie) all run at the moment of certification. This catches errors that individual checks miss.

7. **Ed25519 cryptographic signing** — Overkill for most mid-market companies, but PE firms and their auditors will love the tamper-evident certification artifacts.

8. **Audit binder export** — CPAs live and die by the audit binder. Having an export function is essential.

9. **Evidence threshold per JE** — Materiality-based documentation requirements are exactly how real close processes work.

10. **Tolerance at $0.01 hard cap** — The fact that the integrity gate tolerance cannot exceed one penny, regardless of configuration, shows the developers understand that the accounting equation is sacred.

11. **Decimal.js + NUMERIC(20,2)** — No floating-point in any financial path. This is the correct engineering decision for financial software.

12. **"All financial data has been reviewed"** attestation at certification — This mirrors SOX 302 certification language. Appropriate for the market.

13. **Variance explanation with minimum character count** — Prevents "N/A" or single-word explanations. Forces controllers to actually document their analysis.

14. **Stale statement detection** — When AJEs are posted after statement generation, the system flags statements as stale and requires regeneration. This prevents certifying outdated statements.

15. **Hash-chained audit ledger** — Every action is recorded, hash-linked to the previous action, and cannot be modified retroactively. This is bank-grade auditability.

---

## PART 4: PRIORITY MATRIX

### Must-fix before shipping to CPAs (blocks adoption)

| # | Issue | Effort |
|---|-------|--------|
| T-02 | "Adjusting Entries" → "Journal Entries" | 1 hour |
| T-03 | "Ingest" → "Import" | 30 min |
| T-04 | "Generate" → "Prepare" | 30 min |
| T-05 | Overloaded "Variance" → "Difference" in recon | 2 hours |
| T-07 | Bank-only reconciling item types | 4 hours |
| W-01 | No reversing entries | 2-3 days |

### Should-fix before GA (will get feedback)

| # | Issue | Effort |
|---|-------|--------|
| T-01 | "Cash Flow" → "Cash Flows" | 5 min |
| T-06 | "Supporting Balance" → "Confirmed Balance" | 1 hour |
| T-08 | "Mark Complete" → "Sign Off" | 30 min |
| T-09 | "Propose" → "Submit for Approval" | 1 hour |
| T-10 | "Advance session" → "Begin close" | 30 min |
| T-11 | "Cascade effects" → plain language | 30 min |
| T-12 | Pipeline "Adjust" → "Entries" | 5 min |
| T-13 | "Hash-chain verified" → "Tamper-evident" | 15 min |
| W-02 | Roll-forward schedules | 1-2 weeks |
| W-08 | Pipeline shows recon/adjust as iterative | 2 hours |
| W-10 | Configurable approval threshold | 2 days |

### Nice-to-have (competitive differentiation)

| # | Issue | Effort |
|---|-------|--------|
| T-14 | Entity-type-aware equity statement title | 1 day |
| T-15 | Period-length-aware statement headers | 1 day |
| T-17 | "Entity" → "Company" in UI | 2 hours |
| T-19 | "Reject" → "Return for Revision" | 1 hour |
| W-03 | Budget-to-actual variance | 2-3 weeks |
| W-04 | Disclosure / notes checklist | 1-2 weeks |
| W-07 | Analytical procedures / ratio analysis | 1-2 weeks |
| W-09 | Close calendar / task timeline | 1-2 weeks |

### Future phases (enterprise features)

| # | Issue | Effort |
|---|-------|--------|
| W-05 | Multi-currency (ASC 830) | 1-2 months |
| W-06 | Consolidation / elimination entries | 1-2 months |

---

## PART 5: FINAL VERDICT

**Would I use this engine for a real month-end close?**

**Yes, with caveats.** The accounting model is sound — the equations are enforced, the precision is correct, the controls are real. I've seen Big 4 audit software with weaker integrity gates. The cross-statement validation at certification is particularly impressive.

**What would stop me today:**

1. The terminology makes it feel like engineers built it (they did), not accountants. "Ingest," "Generate," "Cascade," "Hash-chain" — these words create distance between the tool and its users. A 30-minute terminology pass fixes this.

2. The reconciliation module is obviously designed around bank reconciliations. My first non-cash recon (PP&E, prepaids, debt) would force me back to Excel because the item types don't fit. Expanding the reconciling categories is the single highest-impact improvement.

3. No reversing entries is a daily-use gap. Every month-end close has accruals that reverse on Day 1 of the next month. Without this, I'm creating manual entries every period for something the system should handle.

**What would make me switch from Excel:**

The engine already handles the hardest parts — the math is right, the statements tie, the audit trail is real, and I can't accidentally serve unbalanced financials. That's worth the terminology friction. Fix the six "must-fix" items and this is a credible tool for a real close.
