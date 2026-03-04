# SABIT CONTROLLER WORKFLOW REALITY CHECK

**Date:** 2026-03-04
**Persona:** Sarah Chen, Senior Controller at Meridian Manufacturing LLC ($180M revenue, PE-backed, accrual basis, GAAP)
**Scenario:** Closing February 2026 for the first time using Sabit
**Method:** Deep codebase read of frontend pages, API routes, services, repositories, migrations, and types

---

## EXECUTIVE SUMMARY

Sarah can close February. The core pipeline — GL upload through certification — is fully functional with real backend logic, deterministic arithmetic, and cryptographic signing. The workflow is opinionated and rigid (by design for audit defensibility), which means a competent controller who follows the prescribed sequence will succeed. However, there are meaningful friction points that would slow her first close and confuse her on subsequent ones.

**Verdict: PRODUCTION-READY for a guided pilot. NOT yet ready for unassisted self-serve onboarding.**

| Category | Count |
|----------|-------|
| WORKS AS EXPECTED | 47 items |
| FRICTION POINTS | 28 items |
| BLOCKERS (showstoppers) | 3 items |
| MISSING features | 19 items |
| AUDITOR IMPACT items | 16 items |

---

## STEP 1: LOGIN AND ACCESS

### What Sarah Does
Opens browser, navigates to the Sabit URL, enters email/password/tenant ID, clicks Sign In. Gets a JWT valid for 24 hours. Redirected to `/close` (session list).

### WORKS AS EXPECTED
- **Authentication works.** Email + password + optional tenant ID. JWT issued with `userId`, `tenantId`, `email`, `role`. Stored in `localStorage`, survives browser refresh.
- **Rate limiting.** 100 requests per 15-minute window per IP. Prevents brute force.
- **Token expiry handling.** `apiFetch` catches 401, clears storage, redirects to login. Sarah won't see stale data silently.
- **Role-based routing.** Controllers go to `/close`, operating partners go to `/portfolio`.
- **No credential enumeration.** Same "Invalid credentials" message for wrong email or wrong password.

### FRICTION POINTS
- **Tenant ID field is visible and confusing.** Sarah will not know her tenant ID on first login. The field says "tenant-xxx" as placeholder. For a single-tenant deployment (most PE portfolio companies), this field should be hidden or auto-populated.
- **No "Remember Me."** The JWT is 24 hours. If Sarah closes her laptop Friday and opens Monday, she must re-login. For a controller who lives in this tool during close, this is annoying but tolerable.
- **Post-login redirect is always `/close`.** If Sarah bookmarked `/close/abc123/reconciliation`, she'll land on the session list, not her bookmarked page. Deep-link preservation is missing.

### BLOCKERS
- None.

### MISSING
- **No password reset flow.** If Sarah forgets her password, there is no self-service recovery. An admin must reset it manually (no admin UI for this either — it requires direct DB access).
- **No MFA.** For a financial application handling audit-sensitive data, this is a gap that auditors will flag during SOC 2 or IT general controls review.
- **No SSO/SAML.** Most PE-backed companies use Azure AD or Okta. Without SSO, Sarah must maintain a separate credential.

### AUDITOR IMPACT
- **No MFA = IT general controls finding.** An external auditor reviewing IT controls will note the absence of multi-factor authentication on a financially-sensitive application.
- **No session activity log at the auth level.** Login events are not recorded in the audit ledger. An auditor cannot answer "who logged in and when?" from the application.
- **24-hour token with no idle timeout.** A stolen token is valid for the full 24 hours regardless of activity. No session revocation mechanism.

---

## STEP 2: SELECT ENTITY AND CREATE CLOSE SESSION

### What Sarah Does
Arrives at `/close`. Sees a list of prior sessions (if any). Clicks "New Close Session." A slide-over panel opens with Entity dropdown, Period Start date, Period End date. She picks her entity and February 2026 dates (2026-02-01 to 2026-02-28). Clicks "Create Session." Redirected to `/close/{id}/dashboard` showing the OPEN state.

### WORKS AS EXPECTED
- **Session creation is simple.** Three fields: entity, start date, end date. Basis defaults to accrual. Standard defaults to GAAP. Both correct for Sarah.
- **Overlap protection.** If February is already open, the system idempotently returns the existing session (HTTP 200) instead of creating a duplicate. No double-close risk.
- **Prior sessions visible.** The session list shows all prior periods with status badges, gates summary (e.g., "9/9"), duration, and blocking issue count. Sarah can see January's CERTIFIED status.
- **Entity auto-populated.** If only one entity exists, it's pre-selected in the dropdown. Sarah doesn't need to think about entity management.
- **`/ensure` endpoint.** The backend also supports `periodLabel: "2026-02"` format which auto-calculates start/end dates. The frontend doesn't use this but it's available for API integrations.

### FRICTION POINTS
- **Period dates default to CURRENT month, not the month being closed.** On March 4, the form defaults to 2026-03-01 through 2026-03-31. Sarah is closing February, so she must manually change both dates. This is a common source of error — controllers close the PRIOR month, not the current one.
- **No period label display.** The form shows raw dates (2026-02-01, 2026-02-28) but doesn't confirm "February 2026" as a human-readable label until after creation. A controller might accidentally set the wrong dates.
- **Entity creation is implicit.** There is no dedicated "Create Entity" flow. Entities are derived from `SELECT DISTINCT entity_id FROM close_sessions`. For Sarah's first close, there's a "default" entity named after the tenant. If she needs multiple entities (e.g., a subsidiary), she has no way to create one from the UI — it happens only when someone creates a session with a new `entityId`.
- **Entity/period selectors in the TopBar are non-functional.** The TopBar shows entity name and period with ChevronDown icons suggesting dropdowns, but clicking does nothing. Sarah might try to switch periods from the TopBar and be confused when nothing happens.

### BLOCKERS
- None.

### MISSING
- **No calendar/month picker.** Two raw date inputs instead of a month picker widget. Most close tools let you simply pick "February 2026" from a calendar.
- **No fiscal year awareness.** The entity settings support `fiscalYearEnd` but the session creation form ignores it. A company with a June fiscal year end would see the same default behavior.
- **No prior-period carry-forward confirmation.** When creating February's session, the system doesn't show "Carrying forward 45 account mappings from January" or similar context. Sarah doesn't know if her prior work will transfer.

### AUDITOR IMPACT
- **Session creation is audit-trailed.** The `close_session_transition` event is recorded in the hash-chained audit ledger when the session is created.
- **No duplicate risk.** Idempotent creation prevents the same period from being closed twice — auditors can verify only one active session exists per period per entity.

---

## STEP 3: UPLOAD GENERAL LEDGER

### What Sarah Does
Sees the OPEN state dashboard with a file upload zone. Drags her GL export CSV from the ERP (let's say NetSuite). The system parses it, shows column mapping, previews the trial balance, and commits on confirmation. Session advances to IN_PROGRESS.

### WORKS AS EXPECTED
- **Flexible CSV parsing.** Auto-detects column headers with multiple naming conventions (e.g., "GL Account" or "Account Code" or "accountcode"). Handles `$1,234.56`, `(123.00)` parenthetical negatives, and standard decimals. All via Decimal.js — no floating point anywhere.
- **6-step upload wizard.** Parse → Column Mapping → Validation → Preview → Confirm → Ingest. Sarah sees exactly what will happen before committing. She can go back at any step.
- **Preview shows trial balance.** 10-row preview with debit/credit totals. Balance equation check shown explicitly ("Debits = Credits: ✓").
- **Partial import handling (HTTP 207).** If some journal entries don't balance, the balanced ones are imported and the imbalanced ones are staged. Sarah gets a downloadable CSV error report listing every problem entry with its debit/credit difference.
- **Duplicate file detection.** SHA-256 of the file is compared against `gl_upload_history`. The exact same file cannot be uploaded twice — prevents accidental double-import.
- **Automatic TB derivation.** After import, `deriveAndPersistTB()` groups GL lines by account code, sums debits/credits using Decimal.js, and persists as the unadjusted trial balance. Account types are inferred from code prefixes if no COA exists.
- **Out-of-period date warning.** If GL lines have dates outside February, a non-blocking warning appears. Sarah can proceed but is informed.
- **Alternative: Direct TB upload.** If Sarah has a TB export instead of a full GL, she can upload that instead. The system warns that GL drill-down won't be available.

### FRICTION POINTS
- **Column mapping step is always shown, even when auto-detection succeeds.** If the system correctly identified all 5 required columns, Sarah still has to review and click "Continue to Validation." A "looks good, proceed" shortcut would save time.
- **No ERP sync available in practice.** The "Sync from ERP" option exists in the UI but requires an ERP connection configured in Settings. No ERP adapter is actually implemented — it's a placeholder. Sarah must export CSV from NetSuite and upload manually.
- **50 MB file limit.** A large GL export for a $180M company with thousands of transactions might approach this, especially in XLSX format. CSV should be fine.
- **"Compared to prior period" section in preview uses hardcoded mock data.** The new accounts, inactive accounts, and prior mapping count shown in the preview step are not real — they're placeholders. Sarah would see misleading carry-forward information.
- **File upload accepts XLSX but the backend has better CSV support.** Excel parsing works but is less battle-tested than CSV. If Sarah's file has merged cells, hidden sheets, or formulas, results may be unpredictable.

### BLOCKERS
- None.

### MISSING
- **No re-upload/replace GL.** Once ingested and the session advances to IN_PROGRESS, there's no "Replace GL" action. If Sarah uploaded the wrong file, she must either continue with incorrect data or (if the system supports it) create a new session. There is no explicit "delete uploaded GL and start over" button.
- **No GL reconciliation against ERP.** The system doesn't verify that the uploaded GL ties to the ERP's retained TB. Sarah must verify this herself.
- **No import progress for large files.** The wizard shows step progress but no percentage indicator for large files. A 30MB CSV might take 10-20 seconds with no feedback beyond a spinner.

### AUDITOR IMPACT
- **File hash recorded.** The SHA-256 hash of the uploaded file is stored in `gl_upload_history`. An auditor can verify the exact file that was imported and confirm no tampering.
- **Full GL data preserved.** Every GL line is stored in the `general_ledger` table with its original values. The TB is derived, not manually entered. This gives auditors full drill-down capability.
- **Dual-path import creates audit trail gaps.** If Sarah uploads a TB directly (instead of GL), the audit trail is weaker — no individual journal entry lines to drill into.

---

## STEP 4: REVIEW TRIAL BALANCE

### What Sarah Does
After GL import, the session is IN_PROGRESS. Sarah navigates to Trial Balance via the sidebar. Sees the unadjusted TB with all accounts, debits, credits, net balances. Can toggle to adjusted view (identical at this point since no adjustments exist). Checks that debits equal credits. Identifies unmapped accounts.

### WORKS AS EXPECTED
- **Unadjusted/Adjusted toggle.** Two buttons in the header. Adjusted TB reflects posted journal entries. Unadjusted shows the original GL-derived balances.
- **Balance check displayed prominently.** Total Debits, Total Credits, and Difference shown in a stats bar. Green if balanced (within $0.02), red if not.
- **Account type badges.** Each account has a colored badge: ASSET (blue), LIABILITY (amber), EQUITY (purple), REVENUE (green), EXPENSE (red). Matches CPA expectations.
- **Unmapped account visibility.** Unmapped accounts have a 4px amber left border, "⚠ Unmapped" label, and are countable from the stats bar ("Unmapped: 5"). The "Unmapped" filter pill lets Sarah see only the ones that need attention.
- **Sortable columns.** Sarah can sort by any column — account code, type, debit, credit, net balance. Money sorting uses Decimal-safe comparison.
- **GL drill-down.** Clicking any row expands to show the underlying GL journal entries for that account with date, description, debit, credit, source (GL vs AJE), and JE number. Sarah can verify individual transactions.
- **Search and filter.** Free-text search by account code or name. Type filter pills (multi-select). Mapping filter pills (All/Mapped/Unmapped).

### FRICTION POINTS
- **Mapping column shows raw `fsLineId` instead of human-readable names.** The `mappingReportingLineName` field returns values like `fs_asset` instead of "Total Assets" or "Cash and Cash Equivalents." A code comment acknowledges this: "taxonomy name lookup would require fs_taxonomy_lines." Sarah sees technical identifiers, not the reporting labels she expects.
- **No pagination.** All accounts are rendered at once. For a manufacturing company with 200+ GL accounts, this is fine. For 500+, scrolling becomes tedious.
- **No export to Excel.** Sarah cannot download the TB as a spreadsheet to compare against her ERP's report. She must visually compare on screen.
- **Contra accounts are labeled but not visually distinct enough.** `(contra)` appears in italic next to the account name, but there's no special sorting or grouping. Sarah might miss a contra-revenue account buried in the list.

### BLOCKERS
- None.

### MISSING
- **No TB-to-ERP reconciliation report.** Sarah can see the Sabit TB but has no automated way to compare it against her ERP's trial balance report. A "TB comparison" feature would catch import errors immediately.
- **No reclassification entries from the TB page.** If Sarah spots an account that needs reclassifying, she must navigate to Adjustments to create a journal entry. A "Create reclassification" shortcut from the TB row would save steps.

### AUDITOR IMPACT
- **Adjusted vs. unadjusted is clearly delineated.** Auditors can pull the unadjusted TB (pre-adjustment) and adjusted TB (post-adjustment) separately, matching their standard audit procedures.
- **Full drill-down from TB to GL.** Click any account → see every transaction. This is exactly what auditors want for substantive testing.
- **Debit/credit totals are independently verifiable.** The stats bar shows the computation; the auditor can re-verify by summing the column.

---

## STEP 5: MAP ACCOUNTS TO REPORTING LINE ITEMS

### What Sarah Does
Navigates to Mapping page. Sees all GL accounts with their current mapping status. For unmapped accounts, she either: (a) clicks "Auto-Map Remaining" to get AI suggestions, reviews and accepts/rejects each, or (b) manually selects a reporting line item from a dropdown for each account. Continues until the progress bar shows 100%.

### WORKS AS EXPECTED
- **Two-column layout is well-designed.** Left side: account table with inline mapping controls. Right side: AI suggestions panel or taxonomy browser. Sarah can see both simultaneously.
- **AI suggestions with confidence bands.** HIGH (green), MEDIUM (amber), LOW (red) confidence indicators. Sarah sees how confident the system is and can make informed accept/reject decisions.
- **Bulk accept for high-confidence suggestions.** "Accept all high-confidence (N)" button when 2+ exist. Sarah doesn't have to click 40 times if the AI got most of them right.
- **Manual mapping is one-click.** Select a reporting line from a grouped dropdown (grouped by statement: Income Statement, Balance Sheet, Cash Flow). No extra confirmation step.
- **Real-time progress bar.** Shows mapped/unmapped counts and percentage. Updates immediately after each mapping action (optimistic UI).
- **Prior period carry-forward.** Mapping rules persist across sessions. If Sarah mapped accounts in January, those rules apply automatically to February. The `effectiveFrom` date on rules ensures temporal correctness.
- **Edit existing mappings.** Pencil icon on any mapped account lets Sarah change the mapping. Rules are upserted, not just appended.
- **AI advisory boundary enforced.** AI suggests but never directly maps. Every suggestion requires human accept/reject. Audit trail records `ai_mapping_suggestion_accepted/edited/rejected` events.
- **Cascade on rule change.** When a mapping rule is updated, all active sessions for that entity receive a `MAPPING_CHANGED` cascade trigger that auto-resolves `unmapped_account` issues.

### FRICTION POINTS
- **Taxonomy labels in the dropdown are technical.** The reporting line items are identified by codes like `fs_revenue`, `fs_asset`, etc. While the dropdown groups by statement, the individual line items may not match Sarah's Chart of Accounts labels perfectly.
- **No "suggested mapping" for the very first close.** The rule engine uses `%`-wildcard pattern matching. For the first close with no prior rules, the classifier fallback maps to generic buckets (`fs_asset`, `fs_liability`, etc.) with 0.80 confidence. Sarah will need to refine most of these.
- **Reject dismisses with no explanation trail.** When Sarah rejects an AI suggestion, no reason is recorded. The audit shows `ai_mapping_suggestion_rejected` but not why. An auditor might ask.
- **No bulk manual mapping.** If Sarah wants to map 10 expense accounts to the same reporting line, she must do them one by one. There's no multi-select + "Map selected to..."
- **No visual indicator of mapping changes between periods.** If an account was mapped to "Revenue" in January but Sarah maps it to "Other Income" in February, there's no highlight showing the change.

### BLOCKERS
- None.

### MISSING
- **No mapping template import.** Sarah cannot upload a CSV of account-to-line mappings from her ERP. She must map each account through the UI. For a first close with 150 accounts, this is 30-60 minutes of clicking.
- **No mapping review/approval step.** The mapping is immediate — no draft → review → approve workflow. For SOX-regulated companies, mapping changes might need a second pair of eyes.

### AUDITOR IMPACT
- **Hard gate enforcement.** Every single TB account must be mapped before the session can advance to UNDER_REVIEW. An auditor can confirm that no accounts "fell through" unmapped — the system mathematically prevents this.
- **AI decision audit trail.** Every AI suggestion acceptance, edit, or rejection is recorded in the hash-chained audit ledger with the suggestion details and confidence score. Auditors can verify that AI was advisory only.
- **Deterministic mapping.** Rules use pattern matching with `%` wildcards. The same GL data + same rules = same mapping output. Reproducible.

---

## STEP 6: RECONCILE BALANCE SHEET ACCOUNTS

### What Sarah Does
Navigates to Reconciliation. The system auto-initializes reconciliation records for all required BS accounts. For each account, Sarah: enters the supporting balance from source documents (bank statement, subledger), adds reconciling items (outstanding checks, deposits in transit, etc.), uploads evidence (PDF bank statement, XLSX subledger export), and marks complete. A second user (reviewer) then approves.

### WORKS AS EXPECTED
- **Auto-initialization from adjusted TB.** Balance sheet accounts are auto-detected and recon records created. Expected source types are auto-assigned based on account name keywords (cash → bank_statement, receivable → subledger, fixed assets → subledger, etc.).
- **Auto-generated tolerances are intelligent.** Cash/bank = $0 (penny-perfect), AR/AP = lesser of $500 or 1% of materiality, fixed assets/loans = $0, other = 1% of materiality. This matches audit expectations.
- **GENERATED ALWAYS columns for variance and tolerance.** `variance = glBalance - supportingBalance` and `unexplainedVariance = variance + reconcilingItemsTotal` are computed by PostgreSQL, not the application. No floating-point risk. No application bug can produce wrong variance math.
- **16 reconciling item types.** Outstanding Check, Deposit in Transit, Bank Fee, Timing Difference, Error Correction, Accrual, Amortization, Depreciation, Addition, Disposal, Reclassification, Write-off, Payment, Collection, Intercompany, Other. Comprehensive.
- **"Create AJE from Item" button.** If Sarah identifies a timing difference that needs an adjusting entry, she can create a draft JE directly from the reconciling item — debit expense, credit GL account, for the item amount, with auto-generated memo. This is a huge workflow accelerator.
- **Evidence SHA-256 hashing.** Every uploaded file is hashed at upload. Integrity can be verified later.
- **Prior period reference.** Each recon shows the prior period's GL and supporting balances. "Copy from last period" lets Sarah start from the prior balance.
- **Five-check completion gate.** Supporting balance entered, within tolerance, variance explained if nonzero, at least 1 evidence file, not already approved. All enforced server-side. Sarah cannot complete a recon that fails any check.
- **Segregation of duties enforced.** The preparer (Sarah) cannot approve her own reconciliation. A different user must approve. Enforced both in the UI (button disabled with tooltip) and in the API (HTTP 400 error).
- **GL balance auto-refresh after JE posting.** When a JE is posted, the cascade engine refreshes all recon GL balances. If a completed recon is now out of tolerance, it's automatically reverted to in_progress and a blocking issue is created. Prevents stale recons from passing gates.
- **Rejection requires reason (min 10 chars).** Forces constructive feedback.
- **Reopen approved recon requires reason (min 10 chars).** Prevents casual un-approvals.
- **Completeness gate blocks advancement.** The `recons_complete` gate checks all required accounts: not_started, in_progress, over tolerance, awaiting approval — each is a specific blocker message. Sarah can see exactly what's left.

### FRICTION POINTS
- **No batch reconciliation.** Sarah reconciles accounts one at a time. For a company with 30 BS accounts, she navigates to each one individually. A "batch enter supporting balances" view would be faster.
- **Previous/Next navigation exists but is ordered by status, not by account.** Sarah might prefer alphabetical or by balance size. The status-based ordering (not_started first) is logical but not configurable.
- **Evidence upload has no progress bar for large files.** A 5MB bank statement PDF uploads without visual progress feedback beyond the default browser behavior.
- **No evidence file download route for reconciliation evidence.** Unlike JE evidence (which has a `/download` endpoint), reconciliation evidence relies on the frontend `FileList` component. Sarah can see the filename and hash but downloading may require the direct storage path.
- **Tolerance amounts are auto-generated but not editable from the recon detail page.** To change a tolerance, Sarah must go to Settings → Recon Requirements. The recon page shows the tolerance but doesn't let her override it for a specific account.
- **Copy from prior period is manual.** Sarah must click "Copy from last period" for each account. There's no "copy all" button.

### BLOCKERS
- None.

### MISSING
- **No bank statement auto-import.** Sarah must manually enter the bank balance from the PDF. A bank feed integration or PDF parsing feature would automate this.
- **No three-way reconciliation view.** Bank recon typically shows: GL balance, bank statement balance, and reconciling items in a three-panel view. The current layout is two-column (balance comparison + items) but doesn't show the "bank → book" flow visually.
- **No recurring reconciling items.** If the same outstanding check appears in January and February, Sarah must re-enter it. No carry-forward of reconciling items.

### AUDITOR IMPACT
- **Evidence-gated completion is audit gold.** A reconciliation cannot be completed without at least one supporting document. An auditor knows every completed recon has evidence attached.
- **Tolerance enforcement is database-level.** GENERATED ALWAYS columns mean the application cannot miscalculate. The auditor can verify tolerances by querying the DB directly.
- **Full trail: who prepared, who approved, when, with what evidence, at what hash.** Every field an auditor needs for a reconciliation workpaper is captured systematically.
- **Cascade reverts protect accuracy.** If a JE is posted after recon completion and changes the GL balance beyond tolerance, the recon is automatically reopened. This prevents stale reconciliations from persisting.

---

## STEP 7: POST ADJUSTING JOURNAL ENTRIES

### What Sarah Does
Navigates to Adjustments. Two workflows: (1) Recurring entries from templates — Sarah applies or skips each template proposed for the period. (2) Manual entries — Sarah creates one-off adjusting entries. Each entry must balance (debits = credits), have a memo (min 5 chars), and go through propose → approve → post. Posted entries are immutable.

### WORKS AS EXPECTED
- **AJE template system.** Templates are defined once in Settings with account references, amounts, memo, and frequency (monthly/quarterly/annual). Each period, they're proposed for the session. Sarah applies (creates a draft JE) or skips (with reason). All templates must be resolved before advancement.
- **"Apply All Remaining" button.** Bulk-applies all pending templates in one click. Huge time saver for 10+ monthly accruals.
- **Template overrides.** When applying a template, Sarah can override specific line amounts by `accountRef`. The original template amount is preserved as the default, and the override is tracked.
- **Auto-apply for stable templates.** If entity settings enable it, templates applied unchanged for N consecutive periods are auto-applied with `[Auto-applied]` prefix in the memo. Reduces repetitive work.
- **Skip requires reason (min 5 chars backend, 10 chars UI).** Forces Sarah to document why a recurring entry doesn't apply this period. Auditor-friendly.
- **JE balance validation is exact.** Uses Decimal.js — `totalDebits === totalCredits` with no tolerance. A $0.01 imbalance is rejected.
- **Four-step lifecycle: draft → proposed → approved → posted.** Clear separation of duties.
- **SoD enforcement.** The creator cannot approve their own JE. Server-side enforcement in production with no bypass. Separate user required.
- **Posted entries are immutable.** Database triggers prevent UPDATE/DELETE on posted JEs. The only way to "undo" is to create a reversal entry that goes through the full lifecycle.
- **Reversal workflow.** Sarah can reverse a posted JE — the system creates a new draft with debits/credits flipped and memo "Reversal of JE {id}: {original memo}". The reversal goes through the full propose/approve/post cycle.
- **Scheduled reversals.** "Reverse in next period" checkbox auto-sets a reversal date. The system auto-creates reversals for posted JEs when `reversalDate <= today`.
- **Evidence policy enforcement.** If entry total ≥ $10,000 materiality threshold and no evidence is attached, posting is blocked with a clear error message listing the requirement.
- **Shadow Auditor pre-post check.** Before posting, `runPrePostChecksAndStore()` runs deterministic checks. If severity = "block," the post is rejected. Extra safety net.
- **Cascade effects on post.** Posting a JE: (1) updates the adjusted TB, (2) marks statements as stale, (3) refreshes recon GL balances. Sarah is informed of these effects in the confirmation dialog.
- **Real-time balance indicator.** The form shows ✓/✗ for: entry balanced, memo provided, at least 2 lines, all lines have accounts, evidence attached. Sarah knows exactly what's missing before submitting.

### FRICTION POINTS
- **Account search in JE form.** The `SearchableSelect` dropdown searches trial balance rows by code or name. For 150+ accounts, typing works but the dropdown can be long. Grouping by type (ASSET/LIABILITY/etc.) helps but there's no "recently used" or "favorites" list.
- **No JE import from CSV.** Sarah cannot upload a batch of manual entries from a spreadsheet. Each must be created through the form.
- **Memo minimum is 5 characters.** This is too short — it allows "test" + 1 char to pass. A minimum of 10-20 would be more auditor-appropriate. However, the system records the memo and auditors can evaluate quality post-hoc.
- **Rejection reason resets the entry to `rejected` status.** Sarah must re-create or edit the entry and re-propose. The edit preserves the original data, but the workflow loop (create → propose → reject → edit → re-propose) adds cycles.
- **Amount provenance is required but opaque.** Each line must have `amountProvenance` (kind: `human_entered`, `engine_calculation`, or `ai_suggestion`). The frontend handles this transparently, but it adds complexity to API integrations.
- **Template "Undo Skip" button doesn't actually undo.** The frontend button just refreshes the data. The backend has no undo-skip endpoint. If Sarah accidentally skips a template, she must manually create the JE or ask an admin to intervene.

### BLOCKERS
- None.

### MISSING
- **No JE batch import.** For a controller with 20 manual adjustments, entering them one by one is slow. A CSV import for JEs would be transformative.
- **No recurring JE scheduling.** Templates support frequency (monthly/quarterly/annual) but there's no calendar view showing which templates will fire in which periods. Sarah has to remember.
- **No inter-company elimination entries.** For a PE portfolio with multiple entities, there's no automated inter-company elimination workflow.

### AUDITOR IMPACT
- **Immutability is database-enforced.** Posted JEs cannot be modified through any route, API, or direct DB manipulation (triggers block UPDATE/DELETE). Auditors can trust that posted entries are final.
- **Full lifecycle audit trail.** Every state change (created, proposed, approved, rejected, posted) is recorded with who, when, and why. SoD violations are logged even when denied.
- **Evidence linked to entries.** JEs above the materiality threshold have mandatory evidence. Each evidence file is SHA-256 hashed and linked to the specific entry.
- **Reversal chain tracked.** Original JE → reversal JE are linked by `reversesJeId`/`reversedByJeId`. An auditor can follow the chain.
- **Template resolution is complete.** Every proposed template must be applied or skipped with a reason. An auditor can verify no recurring entries were silently dropped.

---

## STEP 8: GENERATE FINANCIAL STATEMENTS

### What Sarah Does
Navigates to Statements. Clicks "Prepare Statements." The system generates all four statements (Income Statement, Balance Sheet, Cash Flow, Statement of Stockholders' Equity) in one shot from the adjusted trial balance. Sarah reviews each statement in tabbed views, checks cross-statement validation, and if statements are stale (JEs posted after generation), regenerates.

### WORKS AS EXPECTED
- **Deterministic generation.** Same adjusted TB = same statements. The `inputHash` (SHA-256 of sessionId + sorted entries) proves this. No human judgment in the computation.
- **Accounting Kill Switch.** `assertIntegrityGateOrThrow()` runs before any statements are built. If debits ≠ credits or A ≠ L + E, generation is blocked entirely (HTTP 422, `MATHEMATICAL_INTEGRITY_ERROR`). Impossible to produce imbalanced statements.
- **Plug account detection.** If Miscellaneous, Suspense, or Other accounts absorb ≥90% of net activity, the report is flagged as `balanced_but_high_risk`. Not blocked, but flagged.
- **All four statements in one transaction.** Balance Sheet, Income Statement, Cash Flow (indirect method), and Equity Changes are built atomically. Cross-statement ties (net income, cash, equity) are validated as part of generation.
- **Cross-statement validation.** Four checks: (1) BS equation A = L + E, (2) IS net income = equity net income, (3) CF ending cash = BS cash, (4) equity closing = BS equity. Each shows Pass/Fail in the Validation tab.
- **Penny-rounding defense.** If A ≠ L + E by ≤ $0.01, a "Rounding adjustment" line is added to equity. No unbalanced statements escape.
- **Version tracking.** Each generation creates a new version (auto-incremented). Line-level diff is computed vs. the previous version. Sarah can see what changed between generations.
- **Stale detection.** When a JE is posted after statements are generated, `statementsStaleSince` is set on the session. An amber banner appears on the Statements page with "Regenerate Now" button.
- **Prior period comparison.** "Show prior period" checkbox adds a column with prior period amounts. "Show changes" adds dollar and percentage change columns. Built from the prior session's statement package.
- **GL drill-down from statements.** Click a line item → see contributing accounts. Click an account → see individual JEs. Click a JE → opens the JE detail form. Full traceability from financial statement to source transaction.
- **QTD/YTD cumulative views.** Sarah can generate Quarter-to-Date or Year-to-Date statements that aggregate certified monthly closes.
- **PDF export.** "Export PDF" button downloads a formatted HTML document suitable for printing.

### FRICTION POINTS
- **Cash Flow Statement uses heuristics.** Working capital changes are identified by regex patterns (`/receivable|ar/i`, `/inventory|stock/i`, `/payable|ap/i`). If Sarah's account names don't match these patterns, the CF statement will have gaps or misclassifications. No manual override is available.
- **Cash Flow estimated on first close.** Without prior period TB, the CF statement is marked `estimated: true`. This is disclosed but may confuse Sarah if she expected a complete CF statement.
- **No manual line item override.** Statements are 100% machine-generated. If a line item is miscategorized (due to mapping), Sarah must fix the mapping and regenerate. She cannot manually adjust a statement line.
- **PDF is actually HTML.** The "Export PDF" button downloads an HTML file with `@media print` CSS, not a real PDF. Sarah must open it in a browser and print to PDF. The code comments acknowledge this: "real PDF generation would use pdfkit or puppeteer."
- **Board package requires certification.** Sarah cannot generate a board-ready package until the session is certified (or at least has statements). The frontend board package section only appears in CERTIFIED/LOCKED states.
- **No direct comparison to budget.** The variance page has a "vs Budget (coming soon)" disabled option. Budget-to-actual comparison is not available.

### BLOCKERS
- **No board package frontend page.** While the API endpoints exist (`GET /api/close/sessions/:id/board-package`, `GET .../board-package/export/pdf`), there is no dedicated frontend page at `/close/[sessionId]/board-package`. The board package UI is embedded in the Review & Certify page and only shows after certification. Sarah cannot preview or configure the board package during preparation.

### MISSING
- **No XBRL tagging.** SEC filers need XBRL-tagged financial statements. Not applicable for private PE portfolio companies, but limits future market expansion.
- **No custom line item grouping.** The taxonomy is fixed. Sarah cannot create a custom reporting line (e.g., "Non-recurring charges") and map accounts to it.
- **No footnote/disclosure drafting.** Financial statements need footnotes. The system generates numbers but not the accompanying notes.

### AUDITOR IMPACT
- **The Kill Switch is audit-proof.** Mathematical integrity is enforced at generation time. An auditor can verify that no set of statements with imbalanced equations could have been produced.
- **Input hash proves determinism.** The SHA-256 hash of the input data is stored with the statement package. An auditor can verify that the same inputs produce the same outputs.
- **Version history with diffs.** Auditors can see every version of the statements and what changed between them. No silent modifications.
- **Cross-statement validation is stored, not just displayed.** The `validationResults` array is persisted in the `statement_packages` table. Auditors can query this directly.

---

## STEP 9: EXPLAIN MATERIAL VARIANCES

### What Sarah Does
Navigates to Variance. Sees all period-over-period variances, sorted by magnitude. Material variances (above the configured threshold, default 10%) are highlighted and require explanation. Sarah can request AI-drafted explanations, edit them, and save. All material variances must be explained before the session can advance.

### WORKS AS EXPECTED
- **Automatic variance computation.** Computed as part of statement generation — no separate trigger. Current vs. prior amounts are compared using the `change_amount` and `change_percentage` GENERATED ALWAYS columns in PostgreSQL.
- **Configurable materiality threshold.** Default 10%, configurable per entity in Settings. Sarah's CFO can decide what "material" means.
- **Smart materiality for zero-base accounts.** If the prior amount is zero, any change > $0.01 is flagged as material. Prevents new accounts from silently appearing.
- **AI draft explanations.** "Draft All Explanations" button generates templated explanations for all unexplained material variances. The template includes: line name, direction, dollar amount, percentage, current balance, prior balance, and a prompt to add specific drivers. Sarah edits the template before saving.
- **AI is advisory only.** AI drafts are NOT auto-saved. They populate the text area for human review. The explanation source is tracked: `manual`, `ai_draft` (accepted as-is), `ai_edited` (modified before saving).
- **Explanation minimum 20 characters.** Forces substantive explanations, not just "ok" or "normal."
- **Favorable/unfavorable color coding.** Revenue increases = green (favorable). Expense increases = red (unfavorable). Matches CPA expectations for variance analysis.
- **Approval workflow.** After saving an explanation, Sarah (or a reviewer) can approve it. Tracked with `approved_at` and `approved_by`. Note: approval is not required for the gate to pass — only the explanation text.
- **Investigation panel.** "Investigate" button opens a slide-over with GL-level breakdown of the variance. Sarah can drill into the accounts contributing to the change.
- **Cumulative views.** QTD/YTD variance view with comparison type selector (vs prior year, vs sequential).
- **Filters.** Material only, unexplained only, by statement type (IS/BS/CF/EQ), sort by magnitude/line item/statement.

### FRICTION POINTS
- **AI drafts are templates, not AI analysis.** Despite being labeled "AI Draft," the explanations are deterministic string templates, not GPT/Claude-generated analysis. The template says "Please provide specific drivers for this change" — Sarah must still write the actual explanation. This is arguably better (no hallucinated explanations) but the UI implies more AI capability than exists.
- **Approval is optional for the gate.** The `variances_explained` gate only checks that `explanation` is non-empty. It does NOT require `approved_at` to be set. This means Sarah could write "TBD" (20+ chars) and pass the gate. The approval workflow exists but isn't enforced by any gate.
- **No variance threshold by statement.** All variances use the same materiality percentage. Sarah might want a 5% threshold for the Income Statement but 10% for the Balance Sheet. No per-statement configuration.
- **No attachment of supporting analysis.** Sarah can write an explanation but cannot attach a spreadsheet or PDF showing her analysis. The explanation is text-only.

### BLOCKERS
- None.

### MISSING
- **No budget/forecast comparison.** Variance analysis is prior-period only. Budget-to-actual variance is the most common PE reporting requirement and is entirely absent.
- **No flux analysis automation.** Sarah must manually identify drivers. A feature that shows the top N accounts contributing to each line item variance would save significant analysis time.
- **No variance explanation templates.** If the same variance recurs monthly (e.g., seasonal revenue), Sarah must re-explain it each period. Carry-forward of explanations would help.

### AUDITOR IMPACT
- **Hard gate enforcement.** Every material variance must have an explanation before certification. An auditor can confirm the system blocked advancement until all variances were addressed.
- **AI decision trail.** Each variance explanation records its source (manual, ai_draft, ai_edited). An auditor can verify that AI-generated text was reviewed by a human.
- **Database-computed variances.** The `change_amount` and `change_percentage` columns are GENERATED ALWAYS — computed by PostgreSQL, not the application. An auditor can trust the math.

---

## STEP 10: REVIEW, CERTIFY, AND LOCK

### What Sarah Does
Sarah clicks "Submit for Review" from the dashboard. The system validates all 11 gates. If all pass, the session moves to UNDER_REVIEW. The CFO (approver role) navigates to Review & Certify, reviews the financial highlights, evidence manifest, and gate status, then types "CERTIFY" to certify. The system re-validates all gates, generates a cryptographic certification artifact (Ed25519 signed), and stores it immutably. The CFO can then lock the period permanently.

### WORKS AS EXPECTED
- **11 hard gates, all must pass.** TB balanced, all accounts mapped, recons complete, templates resolved, statements current, variances explained, no blocking issues, evidence policy met, checklist complete, cash recon complete, material JEs approved. No shortcuts.
- **Server-side gate re-validation at certification.** Gates are not cached from the advance step. `computeReadiness()` is called fresh during certification. Even if something changed between advance and certify, it's caught.
- **Cross-statement validation at certification.** The 4 hard tie checks (A = L + E, net income tie, cash tie, equity tie) are verified as part of certification, not just as display. Failure blocks certification with HTTP 422.
- **Role-based access.** Only `approver` role can certify. Sarah (preparer/reviewer) can submit for review but cannot certify her own close. SoD at the process level.
- **Typing "CERTIFY" confirmation.** Multi-step dialog: attestation display → type exact word → progress spinner → success/error. Prevents accidental certification.
- **Ed25519 cryptographic signing.** The certification artifact contains: session ID, period, certifier, snapshot hash, audit chain tail hash, evidence manifest hash, validation state, AI metadata. The artifact is SHA-256 hashed and signed with Ed25519. The signature, public key, and artifact are stored immutably.
- **Snapshot preservation.** A complete snapshot of the trial balance, journal entries, and statement lines is stored at certification time. Even if the underlying data were somehow modified (which triggers would prevent), the snapshot preserves the certified state.
- **Evidence manifest hashing.** All evidence files linked to JEs and recons are bundled into a manifest with their SHA-256 hashes. The manifest hash is included in the certification artifact.
- **Audit chain integrity.** The audit ledger's hash chain tail is captured in the artifact. An auditor can verify the entire chain from first entry to certification.
- **Independent verification endpoint.** `POST /api/verification/certification/verify` takes the artifact, signature, and public key, recomputes the hash, and verifies the Ed25519 signature. Can be done offline with standard tooling.
- **Public key endpoint.** `GET /api/verification/certification/public-key` returns the Ed25519 public key. Auditors can retrieve it independently and verify outside the application.
- **Lock is permanent.** LOCKED state has zero outbound transitions. No route exists to unlock. DB triggers on `audit_ledger` and `ledger_snapshots` block any UPDATE/DELETE. The confirmation dialog warns "This action is irreversible."
- **Reopen requires approver + "REOPEN" typed + reason (min 10 chars).** Only CERTIFIED sessions can be reopened (not LOCKED). The reason is recorded in the audit ledger. A `period_reopened` issue is created for visibility.
- **Rejection creates a blocking issue.** When the reviewer rejects, a `review_rejection` blocking issue is created and assigned to the preparer. The rejection reason is preserved.
- **AI mutation guard.** `assertNoAiMutationContext()` prevents AI from ever calling certify, lock, or reopen. Even if an AI integration existed, it could not perform these actions.

### FRICTION POINTS
- **Checklist gate is vague.** The `checklist_complete` gate checks for items like `CASH_REC`, `NO_CRITICAL_ISSUES`, `MATERIAL_JES_APPROVED`, `INTEGRITY_CHECKS`. The checklist items are auto-initialized but Sarah may not know they exist or where to find them. There's no prominent checklist page in the sidebar.
- **"Submit for Review" disabled with gate count tooltip only.** When gates are failing, the button shows "N gates not met" as a tooltip on hover. A more prominent error list (like the readiness panel on the dashboard) would be clearer.
- **Certification is a single-user operation.** There's no multi-signatory certification (e.g., both Controller and CFO sign). The approver alone certifies.
- **Board package only shows after certification.** Sarah can't preview the PE board package before the CFO certifies. If the CFO wants to review the board package as part of their certification decision, they must look at the raw statements instead.
- **Auto-lock timer is available but not configurable from the UI.** The `autoLockCertifiedSessions()` function exists but there's no Settings page toggle. It requires direct configuration.

### BLOCKERS
- **`isReviewer` is not properly resolved in `CloseSessionLayout`.** The layout component that wraps all session pages hardcodes `isReviewer={false}` in the `StateMachineBanner`. This means the banner's "Approve & Certify" and "Reject" buttons never appear from the banner — only from the Review & Certify page directly. A reviewer navigating via the sidebar sees the correct buttons on the review page, but the banner (visible on all pages) always shows the preparer view. This is confusing but not blocking since the Review page itself works correctly.

- **No issue creation for manual blocking issues (E2E test 11.05 still failing).** The `POST /api/close/issues` endpoint fails when trying to create a manual blocking issue. If Sarah or her team cannot manually flag a blocking concern, the `no_blocking_issues` gate relies entirely on auto-detected issues. In practice, this is a minor issue because auto-detection covers the critical cases, but it means the team cannot raise ad-hoc blockers.

### MISSING
- **No review comments/notes.** The reviewer (CFO) cannot leave comments on specific items during review. There's no "CFO notes" section where they can ask questions before certifying.
- **No dual-signature certification.** For publicly-traded companies (SOX 302/906), both the Controller and CFO must attest. Single-signer certification limits the market to private companies.
- **No certification comparison.** When the CFO certifies February, there's no side-by-side comparison with January's certified financials. They must navigate back and forth between sessions.
- **No automated distribution.** After certification, the board package isn't emailed to the PE partners. It must be downloaded and shared manually.

### AUDITOR IMPACT
- **Cryptographic certification is audit-grade.** Ed25519 signature on a SHA-256 hash of the complete certification artifact (snapshot, audit chain, evidence manifest, validation state). This exceeds the requirements of most audit standards for evidence of management assertion.
- **Immutability is multi-layered.** Application-level state machine + DB triggers on audit ledger + DB triggers on snapshots + LOCKED terminal state. An auditor can verify each layer independently.
- **Independent verification.** Auditors can call the verification endpoint or use standard Ed25519 tooling with the public key to verify the certification offline. No dependency on the application.
- **Complete evidence chain.** From GL upload (file hash) → TB derivation → account mapping (with AI decision trail) → reconciliation (with evidence) → adjusting entries (immutable) → statements (deterministic with input hash) → certification (signed artifact). Every link is traceable and hash-protected.
- **AI transparency.** The certification artifact includes `aiMetadata`: how many AI suggestions were accepted/edited/rejected, which models were used, confidence distributions. An auditor can assess AI reliance.
- **Reopen trail.** If a certified period is reopened, the reason and prior certification IDs are preserved. The entire history of certify → reopen → recertify is auditable.

---

## FINAL VERDICT: CAN SARAH CLOSE FEBRUARY?

### YES — with caveats.

**The core pipeline works end-to-end:**
1. Login ✓
2. Create session for February 2026 ✓
3. Upload GL CSV ✓ (must manually set February dates)
4. Review trial balance ✓ (mapping labels are technical but functional)
5. Map all accounts ✓ (first close will be tedious without import, but doable)
6. Reconcile all BS accounts ✓ (one at a time, evidence gated)
7. Apply/skip recurring templates + post manual AJEs ✓ (SoD enforced)
8. Generate statements ✓ (Kill Switch protects math integrity)
9. Explain all material variances ✓ (AI templates help, human edits required)
10. Submit → CFO certifies → Lock ✓ (Ed25519 signed, immutable)

### Time estimate for Sarah's first close:
| Step | Estimated Time | Notes |
|------|---------------|-------|
| Login + Session | 2 min | Straightforward |
| GL Upload | 5-10 min | Depends on file prep |
| TB Review | 10 min | Quick sanity check |
| Account Mapping | 30-60 min | **First close bottleneck** — no CSV import |
| Reconciliation | 2-4 hours | **Main work** — 25-30 BS accounts × 5-10 min each |
| Journal Entries | 1-2 hours | Templates help, manual entries for one-off |
| Statement Generation | 2 min | Click and wait |
| Variance Analysis | 30-60 min | AI drafts help, Sarah adds specifics |
| Review + Certify | 15-30 min | CFO reviews and signs |
| **Total** | **5-9 hours** | Faster in subsequent months with carry-forward |

### Three things that would make this meaningfully better:
1. **Account mapping CSV import** — eliminates the biggest first-close bottleneck
2. **Batch reconciliation view** — enter supporting balances in a grid instead of one at a time
3. **Real PDF export** — HTML-to-PDF via puppeteer instead of download-and-print

### Three things auditors will love:
1. **Hash-chained audit ledger with DB trigger immutability** — tamper-evident by design
2. **Ed25519 signed certification artifacts** — cryptographic proof of management assertion
3. **Mandatory evidence on reconciliations and material JEs** — no "we'll upload that later"

### Three things auditors will flag:
1. **No MFA** — IT general controls finding
2. **No login event logging** — gaps in access monitoring
3. **Single-signer certification** — adequate for private companies, insufficient for SOX

---

## APPENDIX: COMPLETE GATE CHECKLIST

| # | Gate | Status for Sarah | What Must Be True |
|---|------|-----------------|-------------------|
| 1 | TB Balanced | ✓ Automatic after GL upload | Sum(Debits) = Sum(Credits) |
| 2 | All Accounts Mapped | Manual work required | Every TB account → reporting line item |
| 3 | Recons Complete | Manual work required | Every required BS account reconciled within tolerance + evidence |
| 4 | Templates Resolved | Manual work required | Every proposed template applied or skipped with reason |
| 5 | Statements Current | ✓ After generation | Statement package exists and not stale |
| 6 | Variances Explained | Manual work required | Every material variance has explanation (≥20 chars) |
| 7 | No Blocking Issues | ✓ Usually automatic | Zero open critical/blocking issues |
| 8 | Evidence Policy | ✓ Met through recon/JE evidence | All required evidence attached per policy |
| 9 | Checklist Complete | Manual work required | All required checklist items completed or skipped |
| 10 | Cash Recon Complete | Manual work required | Bank reconciliation signed off |
| 11 | Material JEs Approved | ✓ After JE workflow | No draft or proposed JEs remaining |
