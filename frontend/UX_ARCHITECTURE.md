# Sabit -- UX Architecture Specification

## Document Purpose

This document is the authoritative UX architecture for Sabit, a financial close engine for PE-backed mid-market companies. It specifies every page, every shared component, and every interaction pattern required to build the product. Engineering should treat this as a construction blueprint: if a detail is specified here, implement it exactly; if a detail is not specified, raise a question before improvising.

**Design language:** Dark-themed, data-dense, professional. Bloomberg Terminal meets Stripe Dashboard. Every pixel earns its place with information, not decoration.

**Personas:**
- Controller (primary operator, does the close work)
- CFO/Reviewer (reviews, approves, certifies)
- PE Operating Partner (monitors portfolio of entities)
- External Auditor (verifies certification without logging in)

**Close pipeline (strict sequential order):**
Upload GL, Trial Balance, Map Accounts, Reconcile Balance Sheet, Post Adjusting Entries, Generate Statements, Explain Variances, Review and Certify, Lock.

---

# Part 1: Page Specifications

---

## 1.1 Login

| Property | Value |
|---|---|
| **Title** | Sign In |
| **URL** | `/login` |
| **Layout** | Centered card on full-viewport dark background |
| **Auth required** | No |

**Primary content blocks:**
- Sabit wordmark centered above the card
- Card contains: email input, password input, "Sign In" button, "Forgot password?" link, "Create account" link
- Below the card: a single-line tagline ("Financial close infrastructure for PE-backed companies")

**Data requirements:**
- POST `/api/auth/login` on submit
- Response returns Bearer token and user profile (name, role, tenantId, entityIds)

**States:**

| State | Behavior |
|---|---|
| Default | Empty form, Sign In button enabled |
| Submitting | Button shows spinner, inputs disabled |
| Error (invalid credentials) | Inline error banner below password field: "Invalid email or password." Fields remain populated. |
| Error (network) | Toast notification: "Unable to reach server. Check your connection." |
| Success | Redirect to `/portfolio` |
| Already authenticated | Redirect to `/portfolio` immediately (check token in localStorage) |

**Actions:**
- Submit credentials
- Navigate to registration
- Navigate to password reset

**Connections:**
- Success -> `/portfolio`
- "Create account" -> `/register`
- "Forgot password" -> `/forgot-password`

---

## 1.2 Registration

| Property | Value |
|---|---|
| **Title** | Create Account |
| **URL** | `/register` |
| **Layout** | Centered card, same background as login |
| **Auth required** | No |

**Primary content blocks:**
- Card contains: full name, email, password, confirm password, company/entity name
- Below form: "Already have an account? Sign in" link
- Password strength indicator beneath the password field

**Data requirements:**
- POST `/api/auth/register`
- Validation: email format, password minimum 8 characters, passwords match, company name required

**States:**

| State | Behavior |
|---|---|
| Default | Empty form |
| Validation errors | Inline red text beneath each offending field |
| Submitting | Button spinner, inputs disabled |
| Success | Redirect to `/onboarding` |
| Conflict (email exists) | Inline error: "An account with this email already exists." |

**Connections:**
- Success -> `/onboarding`
- "Sign in" -> `/login`

---

## 1.3 Onboarding

| Property | Value |
|---|---|
| **Title** | Set Up Your Entity |
| **URL** | `/onboarding` |
| **Layout** | Centered narrow card, stepped wizard (3 steps) |
| **Auth required** | Yes |

**Steps:**

1. **Entity Details** -- Legal entity name, fiscal year end month, base currency, industry vertical
2. **Close Configuration** -- Materiality threshold (dollar amount), evidence policy (which account types require supporting documents), reconciliation requirements (which BS account types must be reconciled)
3. **Invite Team** -- Invite CFO/reviewer by email, assign roles. Optional; can skip and do later.

**Data requirements:**
- Step 1: POST `/api/portfolio/entities`
- Step 2: PUT `/api/close/evidence-policy`, PUT `/api/close/recon-requirements`
- Step 3: POST `/api/settings/team/invite`

**States:**

| State | Behavior |
|---|---|
| Step indicator | Top bar shows 1-2-3 with current step highlighted |
| Incomplete step | "Next" button disabled until required fields filled |
| Final step | "Finish Setup" button; success redirects to `/portfolio` |
| Skip team | "Skip for now" link on step 3 |

**Connections:**
- Finish -> `/portfolio`

---

## 1.4 Portfolio Dashboard

| Property | Value |
|---|---|
| **Title** | Portfolio |
| **URL** | `/portfolio` |
| **Layout** | Full-width, no sidebar. Top navigation bar. Card grid as main content. |
| **Auth required** | Yes |

**Primary content blocks:**

1. **Top bar:** Sabit wordmark (left), user name + role badge + avatar dropdown (right). Dropdown contains: Settings, Sign Out.
2. **Page header:** "Your Portfolio" title (left), "+ New Entity" button (right, Controller/admin only).
3. **Entity cards grid:** Responsive grid of entity cards. Each card shows:
   - Entity name (e.g., "Meridian SaaS Inc.")
   - Most recent close period and its status (OPEN, IN_PROGRESS, UNDER_REVIEW, CERTIFIED, LOCKED)
   - Progress bar: gates passing / total gates
   - Gate count text: "7 of 11 gates passing"
   - Previous certified periods as collapsed single-line items below, showing period name and "CERTIFIED" or "LOCKED" badge
   - "Open" button at card bottom navigates to that period's close dashboard
4. **Empty state:** When no entities exist, a centered illustration with "Create your first entity to begin" and the "+ New Entity" button.

**Data requirements:**
- GET `/api/portfolio/entities` -- returns list of entities with their most recent session status
- GET `/api/portfolio/summary` -- returns aggregate metrics for Operating Partner view
- For each entity with an active session: GET `/api/close/sessions/:id/readiness?format=gates` to populate gate counts

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton cards (3 placeholder cards with pulsing animation) |
| Empty (no entities) | Empty state with create prompt |
| Populated | Entity card grid |
| Error | Banner at top: "Failed to load portfolio. Retry." with retry button |
| PE Partner view | Shows all entities across portfolio companies. No "+ New Entity" button. Read-only. Additional aggregate row at top showing: total entities, entities in progress, entities certified this period. |

**Actions:**
- Click entity card -> navigate to `/close/[sessionId]/dashboard`
- Click "+ New Entity" -> navigate to `/onboarding` (or modal for quick create)
- Click prior certified period -> navigate to that session's review page (read-only)

**Connections:**
- Entity card -> `/close/[sessionId]/dashboard`
- "+ New Entity" -> `/onboarding`
- Settings (dropdown) -> `/settings/general`
- Sign Out -> `/login`

---

## 1.5 Close Dashboard (Command Center)

| Property | Value |
|---|---|
| **Title** | Close Dashboard |
| **URL** | `/close/[sessionId]/dashboard` |
| **Layout** | Left sidebar navigation + main content area. Sidebar is persistent across all close pages. |
| **Auth required** | Yes |

This is the most important page in the product. The controller lands here and can see everything about the current close at a glance.

**Sidebar navigation (persistent across all /close/ pages):**

| Nav Item | Badge |
|---|---|
| Dashboard | (none, current page indicator) |
| Trial Balance | Check or warning icon based on TB balanced state |
| Mapping | Count of unmapped accounts (e.g., "3") or green check |
| Reconciliation | Count of incomplete recons or green check |
| Adjustments | Count of draft/pending JEs or green check |
| Statements | "Stale" badge if regeneration needed, or green check |
| Variance | Count of unexplained variances or green check |
| Review & Certify | Lock icon if certified, otherwise gate count |
| --- (divider) | |
| Audit Trail | Total event count |
| Settings | (none) |

Sidebar header shows: entity name, period (e.g., "Feb 2026"), session status badge.

**Primary content blocks:**

1. **Page header:** Period title ("February 2026 Close"), status badge (OPEN / IN_PROGRESS / UNDER_REVIEW / CERTIFIED / LOCKED). Right side: "Prepare Close" button (lightning bolt icon, initiates AI-assisted pipeline) and "Manual mode" toggle.

2. **Pipeline tracker:** Horizontal stepper showing all 8 pipeline stages. Each step shows one of three states: completed (filled green circle + check), in progress (half-filled blue circle), not started (empty circle). Steps are connected by lines. Clicking a step navigates to that page.

3. **Attention panel:** "What Needs Attention" card. Lists every incomplete or failing gate as a row with: warning icon, description text, action link ("Go to Mapping ->"). Completed items shown with green check, sorted below incomplete items. This panel is the controller's single to-do list.

4. **Gate status panel:** Left column. Lists all 11 gates with pass/fail/pending indicator and detail text. Gates:
   - TB Balanced
   - All Accounts Mapped (count)
   - Reconciliations Complete (count)
   - Templates Resolved
   - Statements Current
   - Variances Explained (count)
   - No Blocking Issues
   - Evidence Policy Satisfied
   - Cross-Statement Ties
   - All Four Statements Exist
   - Material JEs Approved (count)

5. **Period summary panel:** Right column, beside gate status. Shows:
   - Total Revenue, Total Expense, Net Income
   - Total Assets, Total Liabilities, Total Equity
   - Accounting equation check: A = L + E with pass/fail
   - Period-over-period comparison: key metrics vs prior period with percentage change and directional arrows

6. **Recent activity feed:** Bottom section. Chronological feed of recent actions in this session. Each entry: timestamp, user name, description. Examples: "10:34 AM -- Jane posted JE-2026-02-012 (Depreciation)", "9:30 AM -- Jane uploaded GL (808 entries, TB balanced)".

**Data requirements:**
- GET `/api/close/sessions/:id` -- session metadata (entity, period, status)
- GET `/api/close/sessions/:id/readiness?format=gates` -- all gate statuses
- GET `/api/close/sessions/:id/trial-balance?type=adjusted` -- for period summary numbers
- GET `/api/close/sessions/:id/activity` -- recent activity feed (or audit trail filtered to recent)

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton layout: pipeline tracker placeholder, shimmer cards for attention/gates/summary |
| No GL uploaded | Pipeline tracker shows all steps as "not started". Attention panel shows single item: "Upload your general ledger to begin." with "Upload GL" button. Gates panel shows all gates as pending. Summary panel shows "No data yet." |
| In progress | Normal view as described above. Attention items dynamically update. |
| Under review | Banner at top: "This period is under review by [reviewer name]." Controller sees read-only view. Reviewer sees approve/reject actions on pending items. |
| Certified | Gold banner: "This period was certified by [name] on [date]." All content read-only. Certification artifact card visible. |
| Locked | Same as certified plus: "This period is locked and immutable." Lock icon in header. |
| Agent running | "Prepare Close" button replaced with progress panel showing agent steps completing in real-time (see Agent-Assisted Mode below). |

**Agent-Assisted Mode (triggered by "Prepare Close" button):**
A modal or inline expansion replaces the attention panel temporarily. Shows a live-updating checklist:
- "Generating mapping suggestions for [N] accounts..." -> "Auto-accepted [M] (HIGH confidence). [K] need your review. [Review ->]"
- "Initializing [N] reconciliations..." -> "Pre-populated [M] supporting balances. [K] need evidence. [Upload ->]"
- "Applying [N] recurring AJE templates..." -> "Created [N] draft journal entries. Awaiting approval. [Review ->]"
- "Generating financial statements..." -> done check
- "Drafting variance explanations for [N] material variances..." -> "All grounded in journal entry data. [Review ->]"
- Summary: "Readiness: [X]/11 gates passing. Remaining: [list of human actions needed]. Estimated time to complete: ~[M] minutes."

Each step shows a spinner while running, then a green check when complete.

**Actions:**
- Click pipeline step -> navigate to that page
- Click attention item link -> navigate to relevant page
- Click "Prepare Close" -> start agent workflow
- Click gate row -> navigate to relevant page for that gate

**Connections:**
- Every sidebar item and pipeline step links to its respective page
- Attention panel links lead to specific pages
- "Back to Portfolio" link in sidebar header -> `/portfolio`

---

## 1.6 GL Upload

| Property | Value |
|---|---|
| **Title** | Upload General Ledger |
| **URL** | `/close/[sessionId]/upload` (also accessible as first pipeline step from dashboard) |
| **Layout** | Sidebar + centered content area |
| **Auth required** | Yes (Controller role) |

**Primary content blocks:**

1. **Upload zone:** Large dashed-border drop zone. Accepts CSV files. Text: "Drop your general ledger CSV here, or click to browse." Accepted formats listed below: CSV with required columns (date, account code, account name, description, debit, credit). Link to download a sample template.

2. **Column mapping (after file selected):** Preview table showing first 5 rows of the uploaded CSV. Above each column: a dropdown to map the CSV column to a Sabit field (Date, Account Code, Account Name, Description, Debit, Credit). System attempts auto-detection of columns and pre-selects likely matches. Unmapped required columns highlighted in amber.

3. **Preview panel (after mapping confirmed):** Summary stats: total rows, total debits, total credits, debit/credit difference, unique account count. If difference is not zero, a red warning: "Trial balance does not balance. Difference: $[amount]. Review your data before proceeding." Table showing the derived trial balance by account: account code, name, debit total, credit total, net balance. Scrollable.

4. **Action bar:** "Cancel" (returns to dashboard), "Upload & Create Session" (commits the GL). If a session already exists for this period, the button reads "Re-upload GL" with a confirmation dialog warning that this replaces the current GL data.

**Data requirements:**
- POST `/api/gl/parse` -- sends CSV, returns preview (parsed rows, summary stats, trial balance preview). Does not persist.
- POST `/api/gl/ingest` -- commits the GL. Creates the close session if one does not exist, or replaces GL data in existing session.

**States:**

| State | Behavior |
|---|---|
| Empty | Drop zone visible, no file selected |
| File selected | File name shown, column mapping interface appears |
| Parsing | Spinner: "Analyzing your general ledger..." |
| Preview | Summary stats + TB preview table shown. "Upload" button enabled only if TB balances. |
| Unbalanced | Red warning banner. "Upload" button shows tooltip: "Trial balance must balance before uploading." Button disabled. |
| Uploading | Progress bar or spinner: "Uploading 808 entries..." |
| Success | Redirect to `/close/[sessionId]/dashboard`. Toast: "General ledger uploaded. 808 entries processed. Trial balance balanced." |
| Error (parse) | Inline error listing problematic rows: "Row 45: missing debit/credit value. Row 112: invalid date format." |
| Error (network) | Toast: "Upload failed. Please try again." |

**Connections:**
- Success -> `/close/[sessionId]/dashboard`
- Cancel -> `/close/[sessionId]/dashboard`

---

## 1.7 Trial Balance

| Property | Value |
|---|---|
| **Title** | Trial Balance |
| **URL** | `/close/[sessionId]/trial-balance` |
| **Layout** | Sidebar + full-width data table |
| **Auth required** | Yes |

**Primary content blocks:**

1. **Header row:** Title "Trial Balance", period label. Right side: toggle buttons "Unadjusted" / "Adjusted". When no AJEs have been posted, "Adjusted" shows a note: "No adjustments posted. Adjusted TB equals unadjusted TB."

2. **Summary bar:** Four metrics in a horizontal row:
   - Total Debits: $X,XXX,XXX.XX
   - Total Credits: $X,XXX,XXX.XX
   - Difference: $0.00 (green check if zero, red X if non-zero)
   - Accounts: [total] | Mapped: [mapped]/[total]

3. **Filter bar:**
   - Search input: "Search by account code or name..."
   - Account type filter pills: All, Asset, Liability, Equity, Revenue, Expense
   - Mapping status filter pills: All, Mapped, Unmapped

4. **Trial balance table:**

| Column | Width | Alignment | Notes |
|---|---|---|---|
| Account Code | 100px | Left | Monospace |
| Account Name | Flexible | Left | |
| Type | 100px | Left | Asset/Liability/Equity/Revenue/Expense |
| Debit | 140px | Right | Monospace, formatted with commas and 2 decimals |
| Credit | 140px | Right | Monospace, formatted with commas and 2 decimals |
| Net Balance | 140px | Right | Monospace. Positive = debit balance, negative in parentheses = credit balance |
| Mapping | 180px | Left | Shows mapped line item name with green check, or amber warning "Unmapped" |

   Unmapped account rows have an amber-tinted background.

5. **Row expansion:** Clicking any row expands it inline to show:
   - All GL entries that comprise this account's balance (date, description, debit, credit)
   - Subtotals: total debits, total credits for this account
   - If the account is unmapped: inline mapping dropdown to assign a taxonomy line item directly from this view
   - If viewing adjusted TB: a section showing adjustments applied to this account (JE reference, description, amount)

6. **Footer row:** Grand totals for Debit, Credit, Net Balance columns. Always visible (sticky footer).

**Data requirements:**
- GET `/api/close/sessions/:id/trial-balance?type=unadjusted` or `?type=adjusted`
- Response: array of account objects with code, name, type, debitTotal, creditTotal, netBalance, mappingStatus, mappedLineItem
- For row expansion: GET `/api/close/sessions/:id/trial-balance/:accountCode/entries` (or entries included in initial response)

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton table with 10 placeholder rows |
| Populated | Full table with data. Summary bar shows live totals. |
| Filtered | Table filtered to matching rows. Summary bar updates to show filtered totals vs full totals. |
| Empty (no GL) | Message: "Upload a general ledger to see the trial balance." with link to upload page. |
| Error | Banner: "Failed to load trial balance." with retry button. |
| Locked session | Read-only indicator in header. No inline mapping dropdowns. |

**Actions:**
- Toggle unadjusted/adjusted
- Search and filter
- Expand/collapse rows
- Inline mapping (from expanded row, if unmapped)
- Click "Unmapped" filter to focus on work items

**Connections:**
- Inline mapping links to `/close/[sessionId]/mapping`
- Clicking a mapping badge navigates to that account on the mapping page
- JE references in adjusted view link to `/close/[sessionId]/adjustments`

---

## 1.8 Account Mapping

| Property | Value |
|---|---|
| **Title** | Account Mapping |
| **URL** | `/close/[sessionId]/mapping` |
| **Layout** | Sidebar + main content area |
| **Auth required** | Yes (Controller role to edit) |

**Primary content blocks:**

1. **Header:** Title "Account Mapping", progress indicator: "[M] of [N] mapped ([P]%)". Right side: "Auto-Map Remaining" button (lightning bolt icon, triggers AI mapping for unmapped accounts only). "Bulk Accept" button: "Accept all HIGH confidence suggestions" (shown only when multiple high-confidence suggestions exist).

2. **Filter bar:** Dropdown: "Show: Unmapped Only" (default), "All Accounts", "Low Confidence". Count indicator: "[K] accounts need mapping".

3. **Unmapped account cards (default view):** Each unmapped account rendered as a card:
   - Account code + name + type + net balance (from TB)
   - AI suggestion section (if suggestion exists):
     - Suggested line item name
     - Confidence badge: HIGH (green, >=90%), MEDIUM (amber, 60-89%), LOW (red, <60%) with percentage
     - "Accept" button (green), "Reject" button (gray), manual dropdown "Select line item..." for override
   - If no AI suggestion: manual dropdown only
   - Low confidence suggestions show a warning note: "Low confidence -- please verify"

4. **Already-mapped section:** Collapsed by default with header "Already Mapped ([M] accounts)" and expand/collapse toggle. When expanded, shows a simple table: account code, name, mapped line item, confidence (if AI-mapped), "Change" button to re-map.

**Data requirements:**
- GET `/api/coa-mapping/rules?sessionId=:id` -- existing mapping rules
- GET `/api/coa-mapping/suggestions?sessionId=:id` -- AI suggestions with confidence scores
- GET `/api/coa-mapping/taxonomy` -- the full taxonomy (line items the accounts can map to)
- POST `/api/coa-mapping/rules` -- to save a mapping (accept or manual selection)
- DELETE `/api/coa-mapping/rules/:ruleId` -- to remove/change a mapping

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton cards |
| All mapped | Success state: green banner "All accounts mapped." Unmapped section empty. Already-mapped section visible. |
| Partially mapped | Unmapped cards shown. Progress bar and count in header. |
| AI running | "Auto-Map Remaining" button replaced with spinner: "Generating suggestions for [K] accounts..." Individual cards update as suggestions arrive. |
| No GL uploaded | Message: "Upload a general ledger to begin mapping." |
| Locked session | Read-only. No action buttons. |

**Actions:**
- Accept AI suggestion (single click)
- Reject AI suggestion (reveals manual dropdown)
- Manual mapping via dropdown selection
- Bulk accept all HIGH confidence
- Auto-map remaining (triggers AI)
- Change existing mapping

**Connections:**
- Account code links to that account's expanded row on trial balance page
- "Auto-Map" uses AI endpoint
- Progress feeds back to dashboard gate status

---

## 1.9 Reconciliation List

| Property | Value |
|---|---|
| **Title** | Reconciliation |
| **URL** | `/close/[sessionId]/reconciliation` |
| **Layout** | Sidebar + data table |
| **Auth required** | Yes |

**Primary content blocks:**

1. **Header:** Title "Reconciliation", progress: "[M] of [N] complete ([P]%)".

2. **Filter bar:** Dropdown: "Show: Incomplete" (default), "All", "Needs Evidence", "Complete". Count: "[K] reconciliations need attention".

3. **Reconciliation table:**

| Column | Alignment | Notes |
|---|---|---|
| Account | Left | Account code + name |
| GL Balance | Right | Monospace, from trial balance (auto-populated) |
| Supporting Balance | Right | Monospace. Dash if not yet entered. |
| Variance | Right | Monospace. Computed (GL - Supporting - Reconciling Items). Zero = green, non-zero = amber. |
| Reconciling Items | Center | Count of reconciling items, or dash |
| Evidence | Center | Count of attached files, or "None" in amber |
| Status | Center | Badge: Complete + Approved, Complete, In Progress, Needs Evidence, Not Started |

   Row click navigates to reconciliation detail page.

4. **Status legend:** Small legend below table explaining the status badges.

**Data requirements:**
- GET `/api/close/sessions/:id/reconciliations` -- list of all reconciliations with summary data
- Reconciliation list includes: accountId, accountCode, accountName, glBalance, supportingBalance, variance, reconcilingItemCount, evidenceCount, status

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton table |
| All complete | Green banner: "All reconciliations complete and approved." |
| Partial | Table with mixed statuses. Incomplete rows at top by default sort. |
| Empty (no recons initialized) | Message: "No reconciliations required for this period." or "Reconciliations will be initialized when the close is prepared." |
| Locked | Read-only. No row click navigation to detail. |

**Actions:**
- Click row -> navigate to reconciliation detail
- Filter by status
- Sort by any column

**Connections:**
- Row click -> `/close/[sessionId]/reconciliation/[reconId]`
- Account code link -> trial balance page, filtered to that account

---

## 1.10 Reconciliation Detail

| Property | Value |
|---|---|
| **Title** | Reconciliation: [Account Code] -- [Account Name] |
| **URL** | `/close/[sessionId]/reconciliation/[reconId]` |
| **Layout** | Sidebar + single-column content, scrollable |
| **Auth required** | Yes |

**Primary content blocks:**

1. **Back link:** "Back to Reconciliation List" at top.

2. **Account header:** Account code, name, type. Status badge (right side).

3. **Balance comparison section:**
   - GL Balance (from TB): right-aligned dollar amount. Read-only, auto-populated. Label shows source: "From adjusted trial balance".
   - Supporting Balance: right-aligned dollar amount with "Edit" button. Controller enters this from bank statement or subledger. Input field appears on Edit click.
   - Horizontal rule.
   - Gross Variance: computed (GL Balance - Supporting Balance). Read-only.

4. **Reconciling items section:**
   - Table of reconciling items. Each row: description (editable text), amount (editable dollar), remove button.
   - "Add Reconciling Item" button adds a new blank row.
   - Reconciling Items Total: sum of all items. Read-only, auto-computed.

5. **Unexplained variance:** Computed: Gross Variance - Reconciling Items Total. Displayed prominently. Green check if zero, red warning if non-zero. This is the number that must reach zero for the reconciliation to be "complete."

6. **Evidence section:**
   - List of attached files. Each: filename, upload timestamp, "View" button (opens in new tab or preview modal), "Remove" button.
   - "Upload Evidence" button. Accepts PDF, XLSX, CSV, PNG, JPG.
   - If evidence policy requires evidence for this account type and no files are attached: amber warning "Evidence required for this account type."

7. **Action bar:**
   - "Save Draft" -- saves current state without marking complete
   - "Complete Reconciliation" -- marks as complete. Disabled if unexplained variance is non-zero or required evidence is missing. Tooltip explains why disabled.
   - After completion: displays "Prepared by: [name] | [timestamp]"
   - "Approve" button (visible only to reviewer/CFO, and only after completion, and only if approver is a different user than preparer). After approval: displays "Approved by: [name] | [timestamp]"

**Data requirements:**
- GET `/api/close/sessions/:id/reconciliations/:reconId` -- full reconciliation data
- PUT `/api/close/sessions/:id/reconciliations/:reconId/supporting-balance` -- update supporting balance
- POST `/api/close/sessions/:id/reconciliations/:reconId/items` -- add reconciling item
- PUT `/api/close/sessions/:id/reconciliations/:reconId/items/:itemId` -- update item
- DELETE `/api/close/sessions/:id/reconciliations/:reconId/items/:itemId` -- remove item
- POST `/api/close/sessions/:id/reconciliations/:reconId/evidence` -- upload evidence file
- DELETE `/api/close/sessions/:id/reconciliations/:reconId/evidence/:evidenceId` -- remove evidence
- POST `/api/close/sessions/:id/reconciliations/:reconId/complete` -- mark complete
- POST `/api/close/sessions/:id/reconciliations/:reconId/approve` -- approve

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton layout for all sections |
| Not started | GL Balance populated, Supporting Balance empty (shows input prompt), no reconciling items, no evidence |
| In progress | Some fields populated, unexplained variance non-zero |
| Ready to complete | Unexplained variance is zero, evidence attached (if required). "Complete" button enabled. |
| Completed | All fields read-only except for reviewer. "Prepared by" shown. "Approve" button visible to eligible reviewer. |
| Approved | Fully read-only. Both "Prepared by" and "Approved by" stamps visible. |
| Locked session | Fully read-only. No action buttons. |

**Actions:**
- Edit supporting balance
- Add/edit/remove reconciling items
- Upload/remove evidence
- Save draft
- Complete reconciliation
- Approve (reviewer only)

**Connections:**
- Back -> `/close/[sessionId]/reconciliation`
- Account code -> trial balance filtered to this account
- Evidence file view -> opens file

---

## 1.11 Adjustments (Journal Entries and Templates)

| Property | Value |
|---|---|
| **Title** | Adjustments |
| **URL** | `/close/[sessionId]/adjustments` |
| **Layout** | Sidebar + tabbed content area |
| **Auth required** | Yes |

**Primary content blocks:**

1. **Header:** Title "Adjustments". Right side: "+ New Journal Entry" button.

2. **Tab bar:** Two tabs: "Templates", "Journal Entries".

3. **Templates tab:**
   - Table of AJE templates proposed for this period:

| Column | Notes |
|---|---|
| Template Name | e.g., "Monthly Depreciation" |
| Amount | Dollar amount |
| Status | Applied, Pending, Skipped |
| Action | "Apply" / "Skip" buttons for Pending templates. No action for Applied/Skipped. |

   - Applied templates show a green check. Skipped templates show a gray "Skipped" label with "Undo" option.
   - Applying a template creates a draft journal entry automatically.

4. **Journal Entries tab:**
   - Filter pills: All, Draft, Proposed, Approved, Posted
   - Journal entry table:

| Column | Alignment | Notes |
|---|---|---|
| JE ID | Left | Auto-generated sequential ID (e.g., JE-2026-02-001) |
| Description | Left | First line of memo |
| Total Amount | Right | Monospace. Sum of debit lines. |
| Status | Center | Badge: DRAFT, PROPOSED, APPROVED, POSTED, REJECTED |
| Created By | Left | User name |
| Action | Right | Context-dependent: Edit (draft), Submit (draft), Approve/Reject (proposed, reviewer only), Post (approved, controller) |

   - Row click expands inline to show full JE detail (see below).

5. **Expanded JE detail (inline):**
   - Debit/credit line items table:

| Column | Notes |
|---|---|
| Account (code + name) | Dropdown for drafts, read-only otherwise |
| Debit | Dollar amount or blank |
| Credit | Dollar amount or blank |

   - Totals row: Total Debits, Total Credits
   - Difference: must be $0.00 (validation)
   - Memo: full text
   - Evidence: list of attached files with view/remove
   - Approval history: chronological list of status changes with user, timestamp, and any rejection reason
   - Material threshold note: if total amount exceeds materiality threshold, shows "Evidence required" if no evidence attached

6. **JE creation form (modal):**
   - Description input
   - Line items: dynamic rows. Each row: account dropdown (searchable, shows code + name), debit input, credit input. Only one of debit/credit per line.
   - "Add Line" button
   - Running totals: Total Debits, Total Credits, Difference
   - Difference must be zero to save. If non-zero, save button disabled with tooltip.
   - Memo textarea (required, minimum 10 characters)
   - Evidence upload (optional unless amount exceeds materiality threshold)
   - Action buttons: "Save Draft", "Submit for Approval" (proposes the JE)

**Data requirements:**
- GET `/api/close/templates?sessionId=:id` -- templates for this period
- POST `/api/close/templates/apply` -- apply a template
- POST `/api/close/templates/skip` -- skip a template
- GET `/api/close/journal-entries?sessionId=:id` -- all JEs for this session
- POST `/api/close/journal-entries` -- create new JE
- PUT `/api/close/journal-entries/:id` -- update draft JE
- POST `/api/close/journal-entries/:id/propose` -- submit for approval
- POST `/api/close/journal-entries/:id/approve` -- approve
- POST `/api/close/journal-entries/:id/reject` -- reject (requires reason)
- POST `/api/close/journal-entries/:id/post` -- post approved JE
- POST `/api/close/journal-entries/:id/evidence` -- attach evidence

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton tabs and table |
| No templates | Templates tab shows: "No recurring templates configured. Set up templates in Settings." |
| No JEs | Journal Entries tab shows: "No journal entries for this period. Create one or apply a template." |
| JE validation error | Inline red text on the JE form: "Debits must equal credits" or "Memo is required" |
| Rejection | Rejected JE shows rejection reason in a red-bordered callout. JE returns to DRAFT status for editing. |
| Locked session | Read-only. No create/edit/approve/post actions. |

**Actions:**
- Apply/skip templates
- Create new journal entry
- Edit draft JE
- Submit for approval
- Approve/reject (reviewer)
- Post (controller, after approval)
- Attach/view/remove evidence

**Connections:**
- Account dropdowns reference the chart of accounts from the trial balance
- JE IDs referenced from variance analysis page
- Template configuration -> `/settings/templates`
- Posted JEs trigger TB recalculation (toast notification: "Trial balance updated. Statements may need regeneration.")

---

## 1.12 Financial Statements

| Property | Value |
|---|---|
| **Title** | Financial Statements |
| **URL** | `/close/[sessionId]/statements` |
| **Layout** | Sidebar + full-width main content |
| **Auth required** | Yes |

**Primary content blocks:**

1. **Header:** Title "Financial Statements". Right side: "Generate Statements" button. Below: "Last generated: [timestamp]" and status badge: "Current" (green) or "Stale -- regeneration needed" (amber).

2. **Stale warning banner (conditional):** When any mutation has occurred since the last generation (JE posted, mapping changed, GL re-uploaded), a persistent amber banner appears: "Data has changed since statements were last generated. Regenerate to see updated statements." with "Regenerate Now" button.

3. **Statement tabs:** Four tabs: Balance Sheet, Income Statement, Cash Flow Statement, Statement of Stockholders' Equity.

4. **Statement rendering:** Each statement rendered in formal GAAP presentation format:
   - Company name centered at top
   - Statement title centered
   - Period identifier ("As of February 28, 2026" for balance sheet, "For the Month Ended February 28, 2026" for income/cash flow/equity)
   - Hierarchical line items with proper indentation (category headers, line items, subtotals, totals, grand totals)
   - Dollar amounts right-aligned, monospace, formatted with commas and 2 decimals
   - Negative amounts in parentheses: ($350,000.00)
   - Subtotal lines preceded by a thin rule
   - Total lines preceded by a thick rule
   - Grand total lines double-underlined (standard accounting presentation)
   - Line items are clickable -- clicking drills down to show the contributing TB accounts and their balances

5. **Cross-statement validation section:** Below each statement, a validation panel:
   - Balance Sheet: "Assets ($X) = Liabilities + Equity ($Y)" with pass/fail
   - Income Statement: "Net Income ($X) ties to Balance Sheet retained earnings change" with pass/fail
   - Cash Flow: "Ending Cash ($X) ties to Balance Sheet cash" with pass/fail
   - Equity: "Ending Retained Earnings ($X) ties to Balance Sheet" with pass/fail

6. **Export bar:** "Download PDF", "Download Excel", "Print" buttons.

**Data requirements:**
- POST `/api/close/sessions/:id/statement-packages/generate` -- triggers statement generation
- GET `/api/close/statement-packages/:id/lines` -- returns line items for all four statements
- Statement line data includes: lineItemId, label, amount, indentLevel, lineType (header, item, subtotal, total, grandTotal), statementType

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton statement layout |
| Not yet generated | Message: "Financial statements have not been generated yet. All accounts must be mapped before generation." with "Generate" button (disabled if mapping incomplete). |
| Generating | Full-page spinner or progress bar: "Generating financial statements..." (typically fast, 2-5 seconds) |
| Generated and current | Statements displayed. Green "Current" badge. |
| Stale | Statements displayed but amber "Stale" banner and badge shown. |
| Validation failure | Failing validation checks shown in red with details. This should never happen if the backend arithmetic is correct, but the UI must surface it. |
| Locked session | Read-only. No generate button. |

**Actions:**
- Generate / regenerate statements
- Switch between statement tabs
- Drill down on line items
- Export to PDF / Excel / Print

**Connections:**
- Line item drilldown shows TB accounts (links to trial balance page filtered)
- Stale warning links conceptually to whatever caused staleness (JE posted, etc.)
- Export actions produce downloadable files

---

## 1.13 Variance Analysis

| Property | Value |
|---|---|
| **Title** | Variance Analysis |
| **URL** | `/close/[sessionId]/variance` |
| **Layout** | Sidebar + main content |
| **Auth required** | Yes |

**Primary content blocks:**

1. **Header:** Title "Variance Analysis", progress: "[M] of [N] explained ([P]%)". Period comparison label: "Feb 2026 vs Jan 2026". Right side: "Draft All Explanations" button (lightning bolt icon, triggers AI for all unexplained material variances).

2. **Filter bar:** Dropdown: "Show: Material Unexplained" (default), "All Variances", "Material Only", "Explained", "Unexplained". Count: "[K] variances need explanation".

3. **Variance table:**

| Column | Alignment | Notes |
|---|---|---|
| Line Item | Left | Financial statement line item name |
| Prior Period | Right | Monospace dollar amount |
| Current Period | Right | Monospace dollar amount |
| Change ($) | Right | Monospace, positive = increase, negative in parens |
| Change (%) | Right | Percentage with directional arrow (up green/red, down green/red depending on line item type) |
| Material? | Center | "Yes" badge (amber) or "No" (gray) |
| Status | Center | Badge: Explained + Approved, Explained, Needs Explanation, N/A (immaterial) |

   Rows with "Needs Explanation" status have amber background tint.
   Row click expands to show detail.

4. **Expanded variance detail (inline):**
   - Variance summary: line item, dollar change, percentage change
   - **Contributing entries section:** Table of journal entries that drove the change, showing JE ID, description, amount, and percentage contribution to the total variance. This grounds the explanation in actual data.
   - **AI-drafted explanation section:** Visually distinct container (left blue border, slightly different background shade to distinguish AI-generated content). Contains:
     - The explanation text (editable textarea when in edit mode)
     - Source attribution: "Generated by GL Investigation Engine -- all numbers verified against journal entry data"
     - Action buttons: "Edit" (makes text editable), "Approve Explanation" (green), "Regenerate" (gray, re-runs AI)
   - **If no AI draft exists:** "Draft Explanation" button to trigger AI for this single variance, or a blank textarea for manual entry.
   - **After approval:** Shows "Approved by [name] on [timestamp]". Text becomes read-only. "Revoke" button available (returns to unapproved state).

**Data requirements:**
- GET `/api/close/sessions/:id/variances` -- all variances with materiality flags, explanation status
- GET `/api/close/variances/:id/ai-draft` -- request AI-drafted explanation for a specific variance
- POST `/api/close/variances/:id/explain` -- save/approve an explanation
- Variance data includes: lineItemId, lineItemName, priorAmount, currentAmount, changeAmount, changePercent, isMaterial, explanation, explanationStatus, contributingEntries

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton table |
| All explained | Green banner: "All material variances explained and approved." |
| Partial | Table with mixed statuses. Unexplained material variances sorted to top. |
| No statements generated | Message: "Generate financial statements before analyzing variances." |
| AI drafting | Individual variance card shows spinner: "Drafting explanation..." Text appears when ready. |
| AI drafting all | "Draft All Explanations" button replaced with progress: "Drafting [M] of [N]..." Cards update as drafts arrive. |
| First period | Message: "This is the first close period. No prior period available for comparison. Variance analysis is not applicable." |
| Locked session | Read-only. No edit/approve/draft actions. |

**Actions:**
- Expand variance to see detail
- Draft AI explanation (single or all)
- Edit explanation text
- Approve explanation
- Regenerate AI explanation
- Revoke approval
- Filter by status/materiality

**Connections:**
- Contributing entry JE IDs link to the adjustments page, scrolled to that JE
- Line item names link to the statements page, scrolled to that line
- Progress feeds back to dashboard gate status

---

## 1.14 Review and Certify

| Property | Value |
|---|---|
| **Title** | Review & Certify |
| **URL** | `/close/[sessionId]/review` |
| **Layout** | Sidebar + centered single-column content |
| **Auth required** | Yes (CFO/Reviewer role to certify) |

This page is the culmination of the entire close process. It must feel significant.

**Primary content blocks:**

1. **Header:** Title "Review & Certify", period label.

2. **Certification readiness checklist:** A card listing all 11 gates. Each gate shows:
   - Pass/fail icon (green check or red X)
   - Gate name
   - Detail text (e.g., "60 / 60 accounts mapped", "Generated 10:45 AM")
   - If failing: the gate row is clickable and navigates to the relevant page to fix it

   Below the checklist: "[M] of 11 gates passing" summary. If all 11 pass, the text turns green and reads "All gates passing. Ready for certification."

3. **Statement summary card:** Four rows, one per statement:
   - Statement name, key metric (Total Assets, Net Income, Ending Cash, Total Equity), pass/fail badge
   - Cross-statement validation summary: "ALL TIES CONFIRMED" or specific failures listed

4. **Certification panel:** Visible only when all 11 gates pass. Contains:
   - Attestation text: "By certifying, you attest that: (1) All financial data has been reviewed. (2) All adjustments are supported and approved. (3) All material variances have been explained. (4) The financial statements are complete and accurate."
   - Warning text: "This will create an immutable, cryptographically signed certification artifact. The system will re-validate all gates at the moment of certification."
   - "Certify [Period]" button. Prominent, gold-accented. Disabled with tooltip if user lacks certifier role.

5. **Certification artifact card (post-certification):** Appears after successful certification. Gold-bordered card containing:
   - "CERTIFIED" header in gold
   - Certified by: [name]
   - Certified at: [full timestamp with timezone]
   - Session ID
   - Snapshot Hash: [truncated hash with copy button]
   - Signature: [truncated Ed25519 signature with copy button]
   - Audit Chain: [count] entries, verified (green check)
   - Evidence: [count] documents, manifest hash verified (green check)
   - Action buttons: "Download Audit Binder", "Verify Independently" (opens public verification URL), "Lock Period"

6. **Lock period (post-certification only):** "Lock Period" button triggers a confirmation dialog: "Locking this period is permanent and irreversible. No changes can be made after locking. Are you sure?" Two buttons: "Cancel", "Lock Period" (red, destructive). After locking, the entire session becomes immutable.

**Data requirements:**
- GET `/api/close/sessions/:id/readiness?format=gates` -- all gate statuses
- POST `/api/close/sessions/:id/certify` -- perform certification
- POST `/api/close/sessions/:id/lock` -- lock the period
- GET `/api/close/sessions/:id` -- session metadata including certification artifact if certified
- Certification response includes: certifiedBy, certifiedAt, snapshotHash, signature, auditChainCount, evidenceCount, artifactId

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton checklist and cards |
| Gates failing | Checklist shows failures. Certification panel hidden. Message below checklist: "Resolve all failing gates before certification." Failing gates are clickable links. |
| All gates passing | Checklist all green. Certification panel visible with attestation and button. |
| Certifying | Button shows spinner: "Certifying... Re-validating all gates." (This step re-runs all gate checks server-side.) |
| Certification failed | Red banner: "Certification failed. [Reason -- e.g., a gate that was passing now fails]." Checklist refreshes to show current state. |
| Certified | Gold banner. Certification artifact card visible. "Certify" button replaced with artifact. "Lock Period" button available. |
| Locked | Gold banner with lock icon: "This period is locked and immutable." No further actions available. |
| Controller view (non-certifier) | Checklist and summary visible. Certification panel shows: "Only users with the Reviewer/Certifier role can certify. Current reviewer: [name or 'None assigned']." |

**Actions:**
- Click failing gate -> navigate to fix
- Certify period (reviewer only)
- Download audit binder
- Open public verification URL
- Lock period (with confirmation)

**Connections:**
- Failing gate links -> respective pipeline pages
- "Verify Independently" -> `/verify/[artifactId]` (public page)
- "Download Audit Binder" -> file download
- Back to portfolio -> `/portfolio`

---

## 1.15 Audit Trail

| Property | Value |
|---|---|
| **Title** | Audit Trail |
| **URL** | `/close/[sessionId]/audit-trail` |
| **Layout** | Sidebar + full-width data table |
| **Auth required** | Yes |

**Primary content blocks:**

1. **Header:** Title "Audit Trail", event count: "[N] events". Hash chain status: "Hash chain: Verified" (green check) or "Hash chain: BROKEN" (red X, should never happen, but must be surfaced).

2. **Filter pills:** All, Close Events, Journal Entries, Reconciliation, Mapping, Evidence, Certification.

3. **Search:** Text search across event descriptions.

4. **Event table:**

| Column | Notes |
|---|---|
| Timestamp | Full datetime, most recent first |
| User | Name of user who performed action, or "System" for automated events |
| Event Type | Category badge (same as filter categories) |
| Description | What happened. For JEs: includes JE ID and amount. For recons: includes account code. For certification: includes artifact hash. |

   Each row expandable to show:
   - Full event detail as structured data
   - Before/after state comparison (JSON diff rendered as key-value changes, not raw JSON)
   - Hash chain linkage: "This record's hash includes the hash of the previous record" with hash values
   - Cascade effects: if this event triggered downstream changes (e.g., posting a JE invalidates statements), those cascade events listed

5. **Pagination:** Infinite scroll or paginated (50 events per page) given potentially large event counts.

**Data requirements:**
- GET `/api/close/sessions/:id/audit-trail?type=[filter]&page=[n]&search=[term]`
- Each audit entry includes: id, timestamp, userId, userName, eventType, description, beforeState, afterState, hash, previousHash

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton table |
| Populated | Event table with filters |
| Filtered | Table shows matching events. Count updates. |
| Empty | "No events recorded for this session yet." |
| Hash chain broken | Red banner: "ALERT: Audit trail integrity check failed. The hash chain has been broken at event [ID]. Contact support immediately." This is a security event. |

**Actions:**
- Filter by event type
- Search events
- Expand/collapse event detail
- Paginate or scroll

**Connections:**
- JE references link to adjustments page
- Recon references link to reconciliation detail
- Certification references link to review page

---

## 1.16 External Verification (Public)

| Property | Value |
|---|---|
| **Title** | Verify Certification |
| **URL** | `/verify` (landing) and `/verify/[artifactId]` (specific artifact) |
| **Layout** | Full-width, no sidebar, no authentication required. Clean, minimal layout with Sabit branding. |
| **Auth required** | No |

This is the page external auditors use. No login. No account. They arrive with an artifact ID or a link shared by the CFO.

**Primary content blocks:**

1. **Landing page (`/verify`):**
   - Sabit wordmark
   - Title: "Verify a Certification"
   - Description: "Enter a certification artifact ID to independently verify its authenticity and integrity."
   - Input field: "Artifact ID" with paste button
   - "Verify" button
   - Below: brief explanation of what verification checks (signature validity, hash chain integrity, statement accuracy)

2. **Verification result page (`/verify/[artifactId]`):**
   - Verification status header: large "VERIFIED" (green) or "VERIFICATION FAILED" (red) banner
   - Verification checks table:

| Check | Status | Detail |
|---|---|---|
| Digital Signature | Valid / Invalid | Ed25519 signature verified against public key |
| Snapshot Hash | Valid / Invalid | Computed hash matches stored hash |
| Audit Chain | Intact / Broken | [N] entries, all hashes chain correctly |
| Statement Integrity | Valid / Invalid | Recomputed totals match certified totals |

   - Certification metadata: entity name, period, certified by, certified at, locked status
   - Statement summary: key metrics from each of the four statements (Total Assets, Net Income, Ending Cash, Total Equity)
   - Public key information: the Ed25519 public key used for verification, with copy button
   - Note: "This verification was performed independently. No authentication was required. The cryptographic proof is self-contained."

**Data requirements:**
- GET `/api/verification/certification/artifacts/:artifactId` -- certification artifact data
- POST `/api/verification/certification/verify` -- runs verification checks, returns results
- GET `/api/verification/certification/public-key` -- returns the public key for independent verification

**States:**

| State | Behavior |
|---|---|
| Landing | Empty input, waiting for artifact ID |
| Verifying | Spinner: "Verifying certification artifact..." |
| Verified | Green banner. All checks shown with green marks. Metadata and summary displayed. |
| Verification failed | Red banner. Failing checks highlighted in red with explanation of what failed. |
| Artifact not found | Message: "No certification artifact found with this ID. Check the ID and try again." |
| Error | Message: "Verification service temporarily unavailable. Try again shortly." |

**Actions:**
- Enter artifact ID
- Verify
- Copy public key
- Print verification result (for audit files)

**Connections:**
- None (this is a terminal page for external users)
- Internally, the artifact ID is generated on the review/certify page

---

## 1.17 Settings

| Property | Value |
|---|---|
| **Title** | Settings |
| **URL** | `/settings/*` |
| **Layout** | Sidebar (close session sidebar if accessed from within a session, or top-nav if accessed from portfolio) + left tab navigation + right content area |
| **Auth required** | Yes (admin or controller role) |

**Settings tabs and their content:**

### 1.17.1 General Settings (`/settings/general`)
- Entity legal name (text input)
- Fiscal year end month (dropdown)
- Base currency (dropdown)
- Industry vertical (dropdown)
- Save button with toast confirmation

### 1.17.2 Reconciliation Settings (`/settings/reconciliation`)
- Table of balance sheet account types (Asset subtypes, Liability subtypes)
- Each row: account type name, toggle "Requires Reconciliation" (yes/no)
- Save button

### 1.17.3 Evidence Policy (`/settings/evidence-policy`)
- Materiality threshold: dollar amount input. JEs above this amount require evidence.
- Account types requiring evidence on reconciliation: checklist of account types
- Save button

### 1.17.4 Templates (`/settings/templates`)
- List of recurring AJE templates. Each template:
  - Name, description
  - Debit/credit line items (account + amount)
  - Recurrence: monthly
  - Status: active/inactive
- "Create Template" button opens a form similar to the JE creation form
- Edit/delete existing templates

### 1.17.5 Taxonomy (`/settings/taxonomy`)
- The financial statement taxonomy: the list of line items accounts can map to
- Organized by statement (Balance Sheet, Income Statement, Cash Flow, Equity) and by category (Current Assets, Non-Current Assets, etc.)
- Each line item: name, statement, category, display order
- Add/edit/remove line items
- "Reset to Default GAAP Taxonomy" button

### 1.17.6 Integrations (`/settings/integrations`)
- List of available ERP integrations (QuickBooks, Xero, NetSuite, Sage)
- Each shows: connected/disconnected status, last sync timestamp
- Connect/disconnect buttons
- This is a future feature; V1 shows the integration cards as "Coming Soon" with a "Request Access" button

### 1.17.7 Team and Roles (`/settings/team`)
- Table of team members: name, email, role (Controller, Reviewer, Admin, Viewer), last active, status (active/invited/deactivated)
- "Invite Member" button: email input + role dropdown
- Edit role dropdown on each row
- Deactivate/reactivate toggle
- Cannot deactivate yourself

**Data requirements:**
- GET/PUT `/api/settings/general`
- GET/PUT `/api/close/recon-requirements`
- GET/PUT `/api/close/evidence-policy`
- GET/POST/PUT/DELETE `/api/close/templates`
- GET/POST/PUT/DELETE `/api/coa-mapping/taxonomy`
- GET/PUT `/api/settings/integrations`
- GET/POST/PUT `/api/settings/team`

**States per tab:**

| State | Behavior |
|---|---|
| Loading | Skeleton form/table |
| Populated | Form fields filled with current values |
| Unsaved changes | Save button becomes prominent (primary color). Banner: "You have unsaved changes." |
| Saving | Button shows spinner |
| Saved | Toast: "[Setting name] saved." Button returns to default state. |
| Validation error | Inline errors on specific fields |
| Permission denied | Settings visible but inputs disabled. Message: "Only admins can modify settings." |

---

# Part 2: Component Specifications

---

## 2.1 Navigation and Layout Components

### 2.1.1 TopBar

**Purpose:** Global navigation bar present on every authenticated page.

**Variants:**
- `portfolio` -- shown on portfolio page (no entity/session context)
- `close-session` -- shown on close pages (includes entity name, period, status)

**Props/inputs:**
- `variant`: portfolio | close-session
- `entityName`: string (close-session variant only)
- `periodLabel`: string (close-session variant only)
- `sessionStatus`: OPEN | IN_PROGRESS | UNDER_REVIEW | CERTIFIED | LOCKED
- `userName`: string
- `userRole`: string
- `backLink`: { label, href } (optional, e.g., "Back to Portfolio")

**Visual description:** Full-width horizontal bar. Dark background (darkest shade). Left: Sabit wordmark. Center (close-session variant): entity name dropdown, period dropdown, status badge. Right: user name, role badge (small colored pill), avatar circle with dropdown menu.

**Where used:** Every authenticated page.

---

### 2.1.2 SessionSidebar

**Purpose:** Vertical navigation for close session pages. Shows pipeline steps with completion indicators.

**Props/inputs:**
- `sessionId`: string
- `currentPage`: string (which nav item is active)
- `gateStatuses`: object mapping each gate to pass/fail/pending
- `sessionStatus`: string
- `entityName`: string
- `periodLabel`: string

**Visual description:** Fixed left column, approximately 240px wide. Dark background, slightly lighter than TopBar. Top section: entity name (bold), period label, status badge. Below: vertical list of navigation items. Each item: icon, label, and a right-aligned badge (green check, amber warning with count, or nothing). Active item has a left border highlight and slightly lighter background. A divider line separates the main pipeline items (Dashboard through Review & Certify) from secondary items (Audit Trail, Settings). Bottom of sidebar: "Back to Portfolio" link.

**Where used:** All `/close/[sessionId]/*` pages.

---

### 2.1.3 PageHeader

**Purpose:** Consistent header for the main content area of each page.

**Props/inputs:**
- `title`: string
- `subtitle`: string (optional, e.g., period label)
- `progress`: { current, total, percent } (optional)
- `actions`: array of { label, icon, onClick, variant } (optional, right-side buttons)
- `statusBadge`: { label, color } (optional)

**Visual description:** Horizontal bar spanning the main content area. Title in large bold text (left). Subtitle in smaller gray text below title. Progress indicator (if provided) as text "[M] of [N] ([P]%)" with a thin progress bar below. Right side: action buttons.

**Where used:** Every close session page header.

---

### 2.1.4 StatusBadge

**Purpose:** Consistent status indicator used across the product.

**Variants:**
- `session-status`: OPEN (gray), IN_PROGRESS (blue), UNDER_REVIEW (amber), CERTIFIED (gold), LOCKED (gold with lock icon)
- `gate-status`: PASSING (green), FAILING (red), PENDING (gray)
- `je-status`: DRAFT (gray), PROPOSED (blue), APPROVED (green), POSTED (green, filled), REJECTED (red)
- `recon-status`: NOT_STARTED (gray), IN_PROGRESS (blue), COMPLETE (green), APPROVED (green, filled)
- `variance-status`: NEEDS_EXPLANATION (amber), EXPLAINED (blue), APPROVED (green), N/A (gray)
- `mapping-status`: MAPPED (green with check), UNMAPPED (amber with warning)

**Props/inputs:**
- `status`: string (the status value)
- `type`: string (which variant set to use)
- `size`: sm | md (default md)

**Visual description:** Small rounded pill. Background color matches the status. White or dark text depending on contrast. Optional icon before text (check, warning, lock). Small variant is 20px tall, medium is 24px tall.

**Where used:** Every table, every card, every header that displays status.

---

## 2.2 Data Display Components

### 2.2.1 FinancialTable

**Purpose:** Table optimized for displaying financial data with proper number formatting, alignment, and drill-down capability.

**Variants:**
- `standard` -- basic financial table (trial balance, reconciliation list)
- `statement` -- GAAP financial statement presentation (hierarchical, indented)
- `journal-entry` -- debit/credit entry table

**Props/inputs:**
- `columns`: array of column definitions { key, label, type (text|money|percent|badge|action), width, alignment }
- `rows`: array of data objects
- `expandable`: boolean (rows expand on click)
- `expandedContent`: function returning expanded row content
- `sortable`: boolean
- `defaultSort`: { key, direction }
- `stickyHeader`: boolean (default true)
- `stickyFooter`: boolean (for totals row)
- `footerRow`: object (totals)
- `highlightRule`: function (row) => "amber" | "red" | null (conditional row highlighting)
- `emptyMessage`: string
- `loading`: boolean

**Visual description:** Clean data table with no outer border. Thin horizontal rules between rows. Header row with uppercase small labels in gray. Data rows with white text. Money columns in monospace font, right-aligned, formatted with commas and 2 decimal places. Negative amounts in parentheses. Expandable rows show a subtle chevron on the left that rotates when expanded. Expanded content appears below the row with a slightly indented left border. Highlighted rows have a tinted background (amber for warning, red for error). Sticky header stays visible during scroll. Sticky footer (if present) stays visible at bottom.

**Where used:** Trial Balance, Reconciliation List, Adjustments (JE list and templates), Variance Analysis, Audit Trail, Statements.

---

### 2.2.2 StatementRenderer

**Purpose:** Renders a GAAP financial statement with proper hierarchical formatting.

**Props/inputs:**
- `companyName`: string
- `statementTitle`: string ("Balance Sheet", etc.)
- `periodDescription`: string ("As of February 28, 2026")
- `lines`: array of { label, amount, indentLevel (0-3), lineType (header|item|subtotal|total|grandTotal), clickable }
- `onLineClick`: function (lineId)
- `validations`: array of { description, passed }

**Visual description:** Formal financial statement layout. Company name centered, bold. Statement title centered below. Period centered below in lighter text. Line items rendered with indentation based on indentLevel. Headers are bold, no amount. Items show label (left) and amount (right). Subtotals preceded by a single thin underline on the amount column. Totals preceded by a single thick underline. Grand totals use double underline (the accounting convention). Clickable items show a subtle hover highlight. Below the statement body: validation checks rendered as a list with check/X icons.

**Where used:** Statements page only.

---

### 2.2.3 MoneyDisplay

**Purpose:** Consistently formats and displays dollar amounts throughout the product.

**Props/inputs:**
- `value`: string (Decimal string from API, never a JavaScript number)
- `size`: sm | md | lg
- `showSign`: boolean (show +/- prefix)
- `negativeFormat`: "parens" (default) | "minus"
- `color`: "default" | "positive" (green) | "negative" (red) | "muted" (gray)

**Visual description:** Monospace font. Right-aligned within its container. Formatted with comma thousand separators and exactly 2 decimal places. Negative values in parentheses by default: ($1,234.56). Dollar sign prefix. Size variants: sm = 12px, md = 14px, lg = 18px.

**Where used:** Every location where a dollar amount appears.

---

### 2.2.4 PercentChange

**Purpose:** Shows period-over-period percentage change with directional indicator.

**Props/inputs:**
- `value`: number (percentage)
- `direction`: "up" | "down" | "flat"
- `favorableDirection`: "up" | "down" (determines whether green or red -- e.g., revenue up = green, expense up = red)

**Visual description:** Arrow icon (up/down/flat dash) followed by percentage formatted to 1 decimal. Green when change is favorable, red when unfavorable, gray when flat (less than 0.5% change). Arrow and text are the same color.

**Where used:** Variance analysis table, dashboard period summary.

---

### 2.2.5 GateChecklist

**Purpose:** Renders the list of certification gates with pass/fail status.

**Props/inputs:**
- `gates`: array of { name, description, status (passing|failing|pending), detail, link }
- `summary`: { passing, total }
- `interactive`: boolean (whether failing gates are clickable links)

**Visual description:** Vertical list of gate items. Each item: left icon (green filled circle with check for passing, red circle with X for failing, gray circle for pending), gate name in white text, detail in gray text to the right. If interactive, failing gate rows show a right-pointing arrow and are clickable (cursor pointer, hover highlight). Below the list: summary text "[M] of [N] gates passing" with a thin progress bar. All-passing state: summary text turns green, all icons are green checks.

**Where used:** Close Dashboard (gate status panel), Review & Certify page (certification readiness checklist).

---

### 2.2.6 PipelineTracker

**Purpose:** Horizontal stepper showing the 8 close pipeline stages.

**Props/inputs:**
- `stages`: array of { id, label, status (completed|inProgress|notStarted), href }
- `currentStage`: string

**Visual description:** Horizontal row of circles connected by lines. Completed stages: filled green circle with white check, green connecting line to the left. In-progress stage: half-filled blue circle, blue connecting line to the left. Not started stages: empty gray circle, gray line. Labels below each circle. Current stage label is bold. Clicking any stage navigates to its page. On narrow viewports, labels may be hidden and shown on hover/tap.

**Where used:** Close Dashboard only.

---

## 2.3 Interactive Components

### 2.3.1 AIContentCard

**Purpose:** Visually distinguishes AI-generated content from system/human content.

**Props/inputs:**
- `content`: string (the AI-generated text)
- `source`: string (e.g., "GL Investigation Engine")
- `sourceNote`: string (e.g., "all numbers verified against journal entry data")
- `confidence`: number (0-100, optional)
- `editable`: boolean
- `onEdit`: function
- `onApprove`: function
- `onRegenerate`: function
- `onReject`: function
- `approvedBy`: { name, timestamp } (if already approved)

**Visual description:** Card with a distinct left border in blue/purple (the AI accent color). Background is very slightly tinted compared to surrounding content (subtle enough to be professional, distinct enough to notice). Top-right: small "AI" label badge. Content text in normal white. Below content: source attribution in small gray text with an info icon. If editable: text becomes a textarea on "Edit" click. Below the card: action buttons (Edit, Approve, Regenerate, Reject as applicable). If confidence is provided: small confidence badge (percentage in colored pill). Approved state: green border replaces blue, "Approved by [name] on [date]" footer.

**Where used:** Account mapping suggestions, variance explanations, agent-assisted mode summaries.

---

### 2.3.2 FileUploader

**Purpose:** Handles file uploads for evidence and GL data.

**Variants:**
- `dropzone` -- large drag-and-drop area (GL upload)
- `inline` -- compact upload button with file list (evidence on recons and JEs)

**Props/inputs:**
- `variant`: dropzone | inline
- `acceptedTypes`: array of MIME types or extensions
- `maxFileSize`: number (bytes)
- `multiple`: boolean
- `files`: array of existing files { id, name, uploadedAt, size }
- `onUpload`: function (file)
- `onRemove`: function (fileId)
- `required`: boolean
- `requiredMessage`: string (e.g., "Evidence required for this account type")

**Visual description:**
- Dropzone: large dashed-border rectangle. Center: upload icon, "Drop your file here, or click to browse" text, accepted formats listed below in small gray text. On drag-over: border becomes solid, background tints. On file selected: file name appears with a check mark.
- Inline: small "Upload" button with paperclip icon. Below: list of uploaded files, each showing filename (truncated with tooltip for long names), timestamp, "View" link, "Remove" button (X icon). If required and no files: amber text showing required message.

**Where used:** GL upload page (dropzone), reconciliation detail (inline), JE creation/detail (inline).

---

### 2.3.3 ConfirmationDialog

**Purpose:** Modal dialog for destructive or significant actions.

**Variants:**
- `destructive` -- red accent for irreversible actions (lock period, delete)
- `significant` -- gold accent for important actions (certify)
- `standard` -- neutral for normal confirmations

**Props/inputs:**
- `variant`: destructive | significant | standard
- `title`: string
- `message`: string (supports multiple lines)
- `confirmLabel`: string
- `cancelLabel`: string (default "Cancel")
- `onConfirm`: function
- `onCancel`: function
- `requiresTextConfirmation`: boolean (user must type a phrase to confirm, for destructive actions)
- `confirmationPhrase`: string (e.g., "LOCK PERIOD")

**Visual description:** Centered modal with dark overlay. Card with title, message text, and two buttons. Cancel button: gray/outline. Confirm button: colored based on variant (red for destructive, gold for significant, blue for standard). If text confirmation required: an input field labeled "Type '[phrase]' to confirm" and the confirm button remains disabled until the phrase is typed exactly.

**Where used:** Lock period, certify period, delete JE, re-upload GL (replacing existing data), deactivate team member.

---

### 2.3.4 Toast

**Purpose:** Transient notification messages.

**Variants:**
- `success` -- green accent, check icon
- `error` -- red accent, X icon
- `warning` -- amber accent, warning icon
- `info` -- blue accent, info icon

**Props/inputs:**
- `variant`: success | error | warning | info
- `message`: string
- `duration`: number (milliseconds, default 5000, 0 for persistent)
- `action`: { label, onClick } (optional action button within the toast)
- `dismissible`: boolean (default true)

**Visual description:** Small rectangular card that slides in from the top-right corner. Icon on the left, message text, optional action button as a text link, X close button on the right. Disappears after duration. Multiple toasts stack vertically. Dark background with colored left border matching variant.

**Where used:** Every page -- after saves, errors, status changes, background operations completing.

---

### 2.3.5 SearchInput

**Purpose:** Consistent search field with debounced input.

**Props/inputs:**
- `placeholder`: string
- `value`: string
- `onChange`: function
- `debounceMs`: number (default 300)
- `icon`: boolean (default true, shows magnifying glass)

**Visual description:** Standard text input with magnifying glass icon on the left inside the input. Darker background than the card it sits on. Rounded corners. On focus: subtle border glow in primary color. Clear button (X) appears on the right when text is entered.

**Where used:** Trial balance search, audit trail search, taxonomy search, account dropdowns.

---

### 2.3.6 FilterPills

**Purpose:** Horizontal row of selectable filter options.

**Props/inputs:**
- `options`: array of { value, label, count (optional) }
- `selected`: string (current selection)
- `onChange`: function

**Visual description:** Horizontal row of pill-shaped buttons. Selected pill has primary color background with white text. Unselected pills have transparent background with gray text and subtle border. If count is provided, it appears as a small number after the label (e.g., "Unmapped (3)"). On hover: unselected pills show a lighter background.

**Where used:** Trial balance (account type, mapping status), adjustments (JE status), variance (materiality, explanation status), audit trail (event type).

---

### 2.3.7 AccountDropdown

**Purpose:** Searchable dropdown for selecting an account from the chart of accounts.

**Props/inputs:**
- `accounts`: array of { code, name, type }
- `selectedCode`: string
- `onChange`: function
- `placeholder`: string (default "Select account...")
- `disabled`: boolean

**Visual description:** Standard dropdown that opens a scrollable list. List items show account code (monospace, left) and account name (right), with account type as a small badge. A search input at the top of the open dropdown filters the list as the user types. Selected item shows in the closed dropdown as "code -- name". Grouped by account type with small headers.

**Where used:** JE creation form (line item account selection), manual mapping dropdown.

---

### 2.3.8 TaxonomyDropdown

**Purpose:** Searchable dropdown for selecting a taxonomy line item (for account mapping).

**Props/inputs:**
- `lineItems`: array of { id, name, statement, category }
- `selectedId`: string
- `onChange`: function
- `placeholder`: string (default "Select line item...")

**Visual description:** Similar to AccountDropdown but grouped by statement (Balance Sheet, Income Statement, etc.) and then by category (Current Assets, Non-Current Assets, etc.). Each item shows the line item name. Search filters across all groups. Selected item shows the line item name with a small statement abbreviation badge (BS, IS, CF, EQ).

**Where used:** Account mapping page (manual mapping), trial balance expanded row (inline mapping).

---

### 2.3.9 ApprovalStamp

**Purpose:** Displays who performed an action and when, used for audit trail provenance.

**Props/inputs:**
- `action`: string (e.g., "Prepared by", "Approved by", "Certified by", "Posted by")
- `userName`: string
- `timestamp`: string (ISO datetime)
- `role`: string (optional)

**Visual description:** Single horizontal line of gray text. Format: "[Action]: [userName] | [formatted timestamp]". If role provided, shown as a small badge after the name. Timestamp formatted as "MMM DD, YYYY h:mm AM/PM". Subtle, not prominent -- this is informational provenance, not a call to action.

**Where used:** Reconciliation detail (prepared/approved), JE detail (approval history), certification artifact, variance explanations (approved).

---

### 2.3.10 EmptyState

**Purpose:** Placeholder content when a page or section has no data.

**Props/inputs:**
- `icon`: string (icon name)
- `title`: string (e.g., "No journal entries yet")
- `description`: string (e.g., "Create a journal entry or apply a template to get started.")
- `action`: { label, onClick, href } (optional CTA button)

**Visual description:** Centered vertically and horizontally in the available space. Large gray icon at top (48px). Title in white text below (18px). Description in gray text below (14px). If action provided: primary button below the description. The entire composition is compact and centered, not full-page.

**Where used:** Every page and section that can be empty: portfolio (no entities), trial balance (no GL), adjustments (no JEs), reconciliation (no recons), variance (no statements).

---

### 2.3.11 ProgressBar

**Purpose:** Visual indicator of completion progress.

**Props/inputs:**
- `current`: number
- `total`: number
- `size`: sm | md
- `showLabel`: boolean (show "X of Y" text)
- `color`: "default" (primary blue) | "success" (green when 100%)

**Visual description:** Thin horizontal bar (sm = 4px, md = 8px). Background is dark gray. Fill is primary color, width proportional to current/total. Animates smoothly when value changes. At 100%, fill turns green if color is "success". If showLabel: text "[current] of [total]" appears to the right of the bar.

**Where used:** Portfolio entity cards, page headers with progress, gate checklist summary.

---

### 2.3.12 EntityCard

**Purpose:** Card representing a single entity on the portfolio dashboard.

**Props/inputs:**
- `entityName`: string
- `currentPeriod`: { label, status, gatesPassing, gatesTotal }
- `priorPeriods`: array of { label, status }
- `onClick`: function

**Visual description:** Rectangular card with rounded corners, surface-colored background. Entity name as bold header. Below: current period label and StatusBadge. Progress bar showing gates passing / total. Gate count text below progress bar. Below that: prior periods as single-line items (period label + small status badge), collapsed after 2 visible. Bottom of card: "Open" button or link. Hover: subtle elevation increase (shadow).

**Where used:** Portfolio dashboard only.

---

### 2.3.13 ActivityFeed

**Purpose:** Chronological list of recent actions in a session.

**Props/inputs:**
- `events`: array of { timestamp, userName, description, type }
- `maxVisible`: number (default 10, shows "View all" link if more)

**Visual description:** Vertical list, no borders between items. Each item: timestamp in gray monospace (left, fixed width), user name in primary color (middle), description in white text (right, flexible). Events alternate with very subtle background tinting for readability. Newest events at top. If events exceed maxVisible, a "View full audit trail" link appears at the bottom.

**Where used:** Close Dashboard only.

---

### 2.3.14 CertificationArtifact

**Purpose:** Displays the cryptographic certification artifact after a period is certified.

**Props/inputs:**
- `certifiedBy`: string
- `certifiedAt`: string (ISO datetime)
- `sessionId`: string
- `snapshotHash`: string
- `signature`: string
- `auditChainCount`: number
- `auditChainVerified`: boolean
- `evidenceCount`: number
- `evidenceVerified`: boolean
- `artifactId`: string
- `locked`: boolean

**Visual description:** Card with gold border (2px). "CERTIFIED" header in gold text with a trophy or shield icon. Below: structured metadata in two columns (label left in gray, value right in white monospace). Hash and signature values truncated with "..." and a copy-to-clipboard button. Audit chain and evidence lines show counts with green check or red X. Below metadata: action buttons (Download Audit Binder, Verify Independently, Lock Period if not yet locked).

**Where used:** Review & Certify page (post-certification), portfolio dashboard (certified entity cards link here).

---

## 2.4 Form Components

### 2.4.1 JournalEntryForm

**Purpose:** Form for creating or editing a journal entry with debit/credit lines.

**Props/inputs:**
- `mode`: "create" | "edit"
- `initialData`: object (for edit mode)
- `accounts`: array (chart of accounts for dropdowns)
- `materialityThreshold`: number
- `onSaveDraft`: function
- `onSubmitForApproval`: function
- `onCancel`: function

**Visual description:** Modal (large, 800px wide) or full-page form. Description text input at top. Below: dynamic table of line items. Each row: AccountDropdown, debit money input, credit money input. Only one of debit/credit can have a value per row (enforced: entering debit clears credit and vice versa). "Add Line" button below the table adds a new empty row. Running totals row below: Total Debits, Total Credits, Difference. Difference shows green check when zero, red when non-zero. Memo textarea below totals (required, shows character count and minimum). Evidence section below memo (FileUploader inline variant). If total amount exceeds materiality threshold and no evidence attached: amber warning. Action buttons at bottom: "Cancel" (gray), "Save Draft" (outline), "Submit for Approval" (primary).

**Where used:** Adjustments page (new JE creation, edit draft JE).

---

### 2.4.2 ReconciliationForm

**Purpose:** The reconciliation workspace for a single account.

This is not a standalone component but rather the entire content of the Reconciliation Detail page (1.10). See that page specification for full detail. The form elements within it are: supporting balance inline edit, reconciling items dynamic list, evidence uploader, and action buttons.

---

## 2.5 Skeleton/Loading Components

### 2.5.1 SkeletonCard

**Purpose:** Loading placeholder for cards.

**Visual description:** Same dimensions as the card it replaces. Rounded corners, surface background color. Internal content replaced with animated gray rectangles (pulse/shimmer animation) approximating the card layout: a wide rectangle for title, a thin bar for progress, two short rectangles for metrics.

### 2.5.2 SkeletonTable

**Purpose:** Loading placeholder for tables.

**Props/inputs:**
- `rows`: number (default 5)
- `columns`: number

**Visual description:** Table header row with gray rectangles for column headers. Below: N rows of gray rectangles sized to approximate data cells. All rectangles have shimmer animation.

### 2.5.3 SkeletonForm

**Purpose:** Loading placeholder for forms and settings pages.

**Visual description:** Several horizontal pairs: gray rectangle (label width) on the left, longer gray rectangle (input width) on the right. Stacked vertically with spacing. Shimmer animation.

---

# Part 3: Interaction Patterns

---

## 3.1 Approval Workflow

The product has three approval flows. All follow the same visual pattern.

### 3.1.1 Journal Entry Approval Flow

```
DRAFT -> PROPOSED -> APPROVED -> POSTED
           |
           v
        REJECTED -> DRAFT (editable again)
```

**Step-by-step interaction:**

1. **Controller creates JE** in DRAFT status via the JE form. Can save and return later.
2. **Controller clicks "Submit for Approval"** -- JE status changes to PROPOSED. A toast confirms: "Journal entry submitted for approval." The JE row in the table shows "PROPOSED" badge in blue. The JE becomes read-only for the controller.
3. **Reviewer sees proposed JE** -- On the Adjustments page, the "Proposed" filter count increments. The JE row shows an "Approve" button (green) and "Reject" button (red). Reviewer can expand the JE to see all detail.
4. **Reviewer approves** -- Click "Approve". Status changes to APPROVED. ApprovalStamp appears: "Approved by [name] | [timestamp]". Toast: "Journal entry approved."
5. **Reviewer rejects** -- Click "Reject". A small inline form appears requesting a rejection reason (required text input). On submit: status changes to REJECTED. The JE returns to DRAFT and is editable by the controller. A red callout shows the rejection reason. Toast to controller: "Journal entry rejected. Reason: [reason]."
6. **Controller posts approved JE** -- Click "Post". Status changes to POSTED. The JE is now immutable. Toast: "Journal entry posted. Trial balance updated." The trial balance recalculates. Statements become stale.

**Visual cues at each stage:**
- DRAFT: gray badge, "Edit" and "Submit" buttons visible
- PROPOSED: blue badge, "Approve"/"Reject" visible to reviewer, read-only for controller
- APPROVED: green badge, "Post" visible to controller
- POSTED: filled green badge, no action buttons, lock icon
- REJECTED: red badge, rejection reason in red callout, "Edit" button re-enabled

### 3.1.2 Reconciliation Approval Flow

```
NOT_STARTED -> IN_PROGRESS -> COMPLETE -> APPROVED
```

**Steps:**
1. Controller enters supporting balance, adds reconciling items, uploads evidence.
2. Controller clicks "Complete Reconciliation" (only enabled when unexplained variance = $0.00 and evidence requirements met).
3. Reconciliation shows "Prepared by" stamp. Status: COMPLETE.
4. Reviewer (different user) clicks "Approve". Status: APPROVED. "Approved by" stamp appears.
5. Segregation of duties enforced: the "Approve" button is hidden for the user who completed the reconciliation. If only one user exists (setup phase), a warning is shown but approval is not blocked.

### 3.1.3 Variance Explanation Approval Flow

```
NEEDS_EXPLANATION -> EXPLAINED -> APPROVED
```

**Steps:**
1. Controller reviews AI-drafted explanation (or writes one manually).
2. Controller clicks "Approve Explanation" -- explanation is locked. ApprovalStamp appears.
3. "Revoke" option available (returns to EXPLAINED state for re-editing).

Note: Variance explanations do not require a separate reviewer in V1. The controller can self-approve. This is a deliberate design choice: variance explanations are narrative, not financial mutations, so segregation of duties is less critical.

---

## 3.2 Certification Ceremony

This is the most significant user interaction in the product. It must feel like signing a legal document.

### Step-by-step experience:

1. **Controller finishes all work.** All gates pass. Dashboard shows 11/11. Attention panel is empty or shows only green checks.

2. **Controller advances session to UNDER_REVIEW.** From the dashboard or from the Review & Certify page, controller clicks "Submit for Review." A confirmation dialog appears: "This will notify [reviewer name] that the close is ready for certification. You will not be able to make changes while the period is under review." Confirm -> status changes to UNDER_REVIEW. Controller now sees a blue banner on every page: "This period is under review."

3. **CFO/Reviewer navigates to Review & Certify page.** They see the full gate checklist, all green. Statement summary with cross-statement validation. They can click into any page to inspect detail (read-only access to all close data).

4. **CFO clicks "Certify [Period]."** The gold-accented button. A significant confirmation dialog appears:
   - Title: "Certify February 2026"
   - Attestation text (the 4 bullet points about reviewing data)
   - Warning: "This action creates a cryptographically signed, immutable certification artifact."
   - Two buttons: "Cancel" and "Certify" (gold)

5. **System re-validates.** After the CFO clicks "Certify," the UI shows a progress sequence:
   - "Re-validating all gates..." (each gate flashes briefly as it's checked, 1-2 seconds total)
   - "Computing snapshot hash..."
   - "Signing with Ed25519..."
   - "Recording to audit trail..."

6. **Certification complete.** The progress sequence finishes. The page transitions:
   - A gold banner sweeps in: "CERTIFIED"
   - The CertificationArtifact card appears with all cryptographic details
   - Confetti is explicitly NOT used. This is financial software. The gold accent and the weight of the artifact card convey significance without frivolity.
   - Toast: "Period certified successfully."

7. **Lock period (optional, separate action).** The CFO can click "Lock Period" on the artifact card. Confirmation dialog with text confirmation required: type "LOCK PERIOD" to confirm. After locking: status becomes LOCKED. A lock icon appears in the header. All data across all pages becomes permanently read-only. Toast: "Period locked. This action is irreversible."

### Visual design notes for certification:
- The gold accent color (#eab308) is reserved exclusively for certification-related elements. It appears nowhere else in the product. This makes it immediately recognizable.
- The attestation text uses a serif font for the legal feel, contrasting with the sans-serif used everywhere else.
- The artifact card has a subtle gold gradient border, not flat, to give it a "certificate" feel.
- Hash and signature values are displayed in full monospace with a slight letter-spacing increase for readability.

---

## 3.3 AI Content Presentation

All AI-generated content follows a strict visual and behavioral pattern to ensure the user always knows what is AI and what is system/human.

### Visual Distinction

| Characteristic | AI Content | System Content |
|---|---|---|
| Left border | Blue/purple (4px) | None |
| Background | Very slightly tinted (#1e2440 vs #1a2035) | Standard surface color |
| Label | Small "AI" badge, top-right corner | None |
| Source attribution | Always shown below content: "Generated by [engine name]" | None or "Computed by system" |
| Confidence indicator | Percentage badge when applicable | None |

### Behavioral Rules

1. **AI never auto-approves.** Every AI suggestion requires explicit human action (Accept, Approve, Confirm). There is no setting to enable auto-approval.

2. **AI is always editable.** Every AI-generated text (mapping suggestion, variance explanation) can be modified by the user before approval.

3. **AI shows provenance.** Variance explanations cite the specific journal entries that drove the change. Mapping suggestions show the confidence score and the pattern that triggered the suggestion.

4. **AI is regenerable.** Every AI-generated content has a "Regenerate" option that re-runs the AI. The previous content is replaced (not versioned in the UI, though versioned in the audit trail).

5. **AI loading states.** When AI is generating content:
   - Individual item: a shimmer animation inside the AIContentCard boundary, with text "Generating..."
   - Bulk operation (auto-map all, draft all explanations): a progress modal or inline tracker showing "Processing [M] of [N]..." with items appearing as they complete

6. **AI failures.** If AI fails to generate a suggestion:
   - Individual: the AIContentCard shows "Unable to generate suggestion. Try again or enter manually." with a "Retry" button and a manual input fallback.
   - Bulk: the progress tracker shows which items succeeded and which failed. Failed items are listed with "Retry" buttons.

---

## 3.4 Financial Table Behavior

### Sorting

- Default sort order is defined per page (e.g., trial balance by account code ascending, audit trail by timestamp descending, JEs by status then ID)
- Clicking a column header sorts by that column. First click: ascending. Second click: descending. Third click: returns to default sort.
- Active sort column shows a directional arrow in the header.
- Money columns sort numerically, not alphabetically.

### Drilling Down

- Expandable rows are indicated by a subtle right-facing chevron on the left side of the row.
- Clicking anywhere on the row (not just the chevron) toggles expansion.
- Expanded content slides down smoothly (200ms ease-out animation).
- Only one row can be expanded at a time (expanding a new row collapses the previous one). Exception: if a table is short (fewer than 10 rows), multiple can be open.
- Expanded content shows detail data relevant to that row (GL entries for a TB account, debit/credit lines for a JE, contributing entries for a variance).

### Filtering

- FilterPills component used for categorical filters (status, type).
- SearchInput used for text search (account name, description).
- Filters are combinable: e.g., search for "insurance" AND filter by "Unmapped".
- Active filters are reflected in the URL query string for shareability and back-button support.
- When filtered, the summary bar (if present) shows "Showing [M] of [N] [items]" and the filtered totals.

### Exporting

- Available on: Trial Balance, Financial Statements, Reconciliation List, Journal Entry List, Audit Trail.
- Export options: CSV (data tables), PDF (financial statements), Excel (data tables with formatting).
- Export respects current filters and sort order.
- Export button triggers immediate download. No modal or configuration step. The filename includes entity name, period, and export type (e.g., "Meridian_SaaS_Feb2026_TrialBalance.csv").

### Number Formatting Rules (Universal)

- All dollar amounts: monospace font, right-aligned, comma separators, exactly 2 decimal places, dollar sign prefix
- Negative amounts: parentheses notation -- ($1,234.56) -- not minus sign
- Zero amounts: $0.00 (not blank, not dash)
- Null/missing amounts: em-dash (--) in gray
- Percentages: 1 decimal place, no space before percent sign (12.3%)
- Counts: no decimal places, comma separators for thousands

---

## 3.5 Error Handling

### Error Hierarchy

Errors surface in four ways, used based on severity and scope:

| Method | When to Use | Visual | Dismissal |
|---|---|---|---|
| **Inline field error** | Form validation failure on a specific field | Red text below the field, red border on the field | Disappears when field value becomes valid |
| **Toast** | Transient errors (network timeout, save failure), non-blocking | Slide-in from top-right, 5-second auto-dismiss | Auto-dismiss or manual X |
| **Banner** | Page-level persistent state (stale data, under review, permission issues) | Full-width bar below the TopBar, colored by severity | Not dismissible (state-driven, disappears when state changes) |
| **Modal** | Blocking errors that require user acknowledgment (certification failed, data integrity issue) | Centered modal with overlay | User must click "OK" or "Retry" |

### Specific Error Scenarios

**Network errors:**
- API call fails: toast with "Unable to [action]. Check your connection and try again." Retry button in toast.
- API returns 500: toast with "Something went wrong. Try again or contact support." Include request ID in small text for support debugging.
- API returns 401: redirect to `/login` with toast "Your session has expired. Please sign in again."
- API returns 403: toast "You don't have permission to perform this action."

**Validation errors:**
- JE doesn't balance: inline under the totals row, "Debits must equal credits. Difference: $[amount]." Submit button disabled.
- Required field empty: inline under the field, "[Field name] is required." Submit button disabled.
- Materiality threshold exceeded without evidence: amber inline warning, not a blocking error on save-draft, but blocking on submit-for-approval.

**Data integrity errors:**
- Hash chain broken in audit trail: red banner, full-width, persistent: "ALERT: Audit trail integrity check failed. Contact support immediately." This is the highest-severity error in the product.
- Cross-statement tie failure: red text in the validation section of the statement, with specific details of what doesn't tie.
- Accounting equation failure (A != L+E): red validation result on the balance sheet, highly prominent.

**Optimistic UI and conflict handling:**
- Saving a reconciling item: optimistic update (item appears immediately), revert if API fails with toast error.
- Two users editing the same reconciliation: last-write-wins with a toast to the losing user: "This reconciliation was updated by [name]. Your page has been refreshed." The page re-fetches current data.
- Stale data: when navigating to a page, always fetch fresh data. No local caching of financial data beyond the React Query cache with short stale times (30 seconds for active close data).

---

## 3.6 Keyboard Navigation and Accessibility

### Keyboard Shortcuts (Global)

| Shortcut | Action |
|---|---|
| `?` | Show keyboard shortcut help overlay |
| `g` then `d` | Go to Dashboard |
| `g` then `t` | Go to Trial Balance |
| `g` then `m` | Go to Mapping |
| `g` then `r` | Go to Reconciliation |
| `g` then `a` | Go to Adjustments |
| `g` then `s` | Go to Statements |
| `g` then `v` | Go to Variance |
| `g` then `c` | Go to Review & Certify |
| `Esc` | Close modal/expanded row/dropdown |

### Focus Management

- Modals trap focus within themselves. Tab cycles through focusable elements. Esc closes.
- Expanding a table row moves focus to the first interactive element in the expanded content.
- After a toast appears, focus remains where it was (toasts are aria-live regions, not focus traps).
- After a form submission success, focus moves to the first element of the resulting state (e.g., after JE creation, focus moves to the new JE in the list).

### Screen Reader Considerations

- All StatusBadges include aria-label text (not just color: "Status: Approved" not just a green pill).
- Financial tables use proper `<table>` semantics with `<th>` scope attributes.
- The PipelineTracker uses `role="navigation"` with `aria-label="Close pipeline progress"`.
- AI content cards include `aria-label="AI-generated content"` to distinguish from system content.
- MoneyDisplay includes `aria-label` with the full unabbreviated amount.
- ConfirmationDialogs use `role="alertdialog"` with `aria-describedby` pointing to the message.

---

## 3.7 Responsive Behavior

### Breakpoint Strategy

| Breakpoint | Width | Target |
|---|---|---|
| Desktop (primary) | >= 1280px | Controller's primary workspace |
| Laptop | 1024px - 1279px | Slightly compressed, all features available |
| Tablet | 768px - 1023px | CFO review/approval on the go |
| Mobile | < 768px | Not a priority for V1, graceful degradation only |

### Per-Breakpoint Adaptations

**Desktop (>= 1280px):**
- SessionSidebar fully visible, 240px wide
- Financial tables show all columns
- Dashboard shows gate panel and summary panel side by side
- Statement rendering at full width

**Laptop (1024px - 1279px):**
- SessionSidebar collapses to icon-only mode (56px wide), expands on hover
- Financial tables may hide less-critical columns (e.g., hide "Type" on TB, show on expand)
- Dashboard panels stack vertically instead of side by side
- Everything functional, just tighter

**Tablet (768px - 1023px):**
- SessionSidebar becomes a hamburger menu overlay
- Tables become horizontally scrollable
- Approval buttons remain prominently sized (touch targets >= 44px)
- Review & Certify page remains fully functional (CFO approval use case)
- JE form takes full width

**Mobile (< 768px):**
- Banner: "Sabit is designed for desktop use. For the best experience, use a laptop or desktop computer."
- Core data is visible but editing is disabled
- External verification page (`/verify`) is fully responsive (auditor might verify on phone)

---

## 3.8 Loading and Transition Patterns

### Initial Page Load

Every page follows this sequence:
1. Layout renders immediately (sidebar, topbar, page header) with current data from React Query cache if available.
2. Skeleton content appears in the main content area.
3. API data loads. Skeletons are replaced with real content in a single swap (no progressive item-by-item loading that causes layout shifts).
4. If data load takes more than 3 seconds: a subtle spinner appears in the page header area. No full-page loading overlay.

### Navigation Transitions

- Sidebar navigation: instant swap of main content area. Sidebar remains static. Skeleton appears immediately in the new page content area.
- No page-level transition animations. This is a data-dense professional tool; snappy navigation is more important than smooth transitions.
- Browser back/forward works correctly (URL-based routing, filter state in query params).

### Long-Running Operations

Operations that take more than 2 seconds:
- Statement generation: progress indicator in the page header. "Generating..." text. Button disabled.
- AI operations (auto-map, draft explanations): progress tracker showing items completed / total. Individual items update as they complete.
- File upload: progress bar within the FileUploader component showing upload percentage.
- Certification: step-by-step progress sequence (see Certification Ceremony, section 3.2).

### Polling and Real-Time Updates

- Long-running AI operations: poll every 2 seconds for status updates.
- Two users on the same session: no real-time sync in V1. Data refreshes on page navigation and on explicit user action (save, approve, etc.).
- Stale data detection: after any mutation (POST/PUT/DELETE), invalidate related React Query caches so the next navigation to those pages fetches fresh data.

---

# Appendix A: Page Map Summary

| # | Page | URL | Persona | Key Action |
|---|---|---|---|---|
| 1 | Login | `/login` | All | Authenticate |
| 2 | Registration | `/register` | New user | Create account |
| 3 | Onboarding | `/onboarding` | New user | Set up entity |
| 4 | Portfolio | `/portfolio` | All authenticated | Select entity/period |
| 5 | Close Dashboard | `/close/[sessionId]/dashboard` | Controller, CFO | Monitor close progress |
| 6 | GL Upload | `/close/[sessionId]/upload` | Controller | Upload general ledger |
| 7 | Trial Balance | `/close/[sessionId]/trial-balance` | Controller, CFO | View/verify balances |
| 8 | Account Mapping | `/close/[sessionId]/mapping` | Controller | Classify accounts |
| 9 | Reconciliation List | `/close/[sessionId]/reconciliation` | Controller, CFO | Monitor recon progress |
| 10 | Reconciliation Detail | `/close/[sessionId]/reconciliation/[reconId]` | Controller, CFO | Reconcile single account |
| 11 | Adjustments | `/close/[sessionId]/adjustments` | Controller, CFO | Manage JEs and templates |
| 12 | Financial Statements | `/close/[sessionId]/statements` | Controller, CFO | View/generate statements |
| 13 | Variance Analysis | `/close/[sessionId]/variance` | Controller, CFO | Explain material changes |
| 14 | Review & Certify | `/close/[sessionId]/review` | CFO (certify), Controller (view) | Certify the close |
| 15 | Audit Trail | `/close/[sessionId]/audit-trail` | All | Inspect audit history |
| 16 | External Verification | `/verify`, `/verify/[artifactId]` | External Auditor | Verify certification |
| 17 | Settings (7 tabs) | `/settings/*` | Admin, Controller | Configure entity |

---

# Appendix B: Component Inventory

| # | Component | Type | Used On |
|---|---|---|---|
| 1 | TopBar | Layout | All authenticated pages |
| 2 | SessionSidebar | Layout | All close session pages |
| 3 | PageHeader | Layout | All close session pages |
| 4 | StatusBadge | Display | Everywhere |
| 5 | FinancialTable | Display | TB, Recon, Adjustments, Variance, Audit |
| 6 | StatementRenderer | Display | Statements page |
| 7 | MoneyDisplay | Display | Everywhere with dollar amounts |
| 8 | PercentChange | Display | Variance, Dashboard |
| 9 | GateChecklist | Display | Dashboard, Review & Certify |
| 10 | PipelineTracker | Display | Dashboard |
| 11 | AIContentCard | Interactive | Mapping, Variance |
| 12 | FileUploader | Interactive | GL Upload, Recon Detail, Adjustments |
| 13 | ConfirmationDialog | Interactive | Certify, Lock, Delete, Destructive actions |
| 14 | Toast | Interactive | Every page |
| 15 | SearchInput | Interactive | TB, Audit Trail, Dropdowns |
| 16 | FilterPills | Interactive | TB, Adjustments, Variance, Audit |
| 17 | AccountDropdown | Interactive | JE Form, TB inline mapping |
| 18 | TaxonomyDropdown | Interactive | Mapping page, TB inline mapping |
| 19 | ApprovalStamp | Display | Recon Detail, JE Detail, Variance, Certification |
| 20 | EmptyState | Display | Every page/section with possible empty state |
| 21 | ProgressBar | Display | Portfolio cards, Page headers, Gate checklist |
| 22 | EntityCard | Display | Portfolio dashboard |
| 23 | ActivityFeed | Display | Close Dashboard |
| 24 | CertificationArtifact | Display | Review & Certify |
| 25 | JournalEntryForm | Form | Adjustments page |
| 26 | SkeletonCard | Loading | Card-based pages |
| 27 | SkeletonTable | Loading | Table-based pages |
| 28 | SkeletonForm | Loading | Settings pages |

---

# Appendix C: Role-Permission Matrix

| Action | Controller | CFO/Reviewer | PE Partner | External Auditor |
|---|---|---|---|---|
| View portfolio | Own entities | Own entities | All entities | N/A |
| Create entity | Yes | No | No | No |
| Upload GL | Yes | No | No | No |
| Map accounts | Yes | No (view only) | No (view only) | N/A |
| Complete reconciliation | Yes | No | No | N/A |
| Approve reconciliation | No | Yes | No | N/A |
| Create/edit JE | Yes | No | No | N/A |
| Submit JE for approval | Yes | No | No | N/A |
| Approve/reject JE | No | Yes | No | N/A |
| Post JE | Yes (after approval) | Yes (after approval) | No | N/A |
| Generate statements | Yes | Yes | No | N/A |
| Draft variance explanation | Yes | No | No | N/A |
| Approve variance explanation | Yes | Yes | No | N/A |
| Submit for review | Yes | No | No | N/A |
| Certify period | No | Yes | No | N/A |
| Lock period | No | Yes | No | N/A |
| View audit trail | Yes | Yes | Yes (read-only) | N/A |
| Verify certification | N/A | N/A | N/A | Yes (no login) |
| Manage settings | Yes (admin) | No | No | N/A |
| Manage team | Yes (admin) | No | No | N/A |

---

# Appendix D: Session State Transition Rules

```
OPEN
  |
  v  (GL uploaded, any work begins)
IN_PROGRESS
  |
  v  (Controller clicks "Submit for Review", all gates pass)
UNDER_REVIEW
  |
  +---> (CFO reopens with reason) ---> IN_PROGRESS
  |
  v  (CFO certifies, all gates re-validated)
CERTIFIED
  |
  v  (CFO locks, irreversible)
LOCKED
```

**UI behavior per state:**

| State | Controller Can | CFO Can | Visual Indicator |
|---|---|---|---|
| OPEN | Upload GL, begin work | View | Gray "OPEN" badge |
| IN_PROGRESS | All editing actions | View, approve JEs/recons | Blue "IN PROGRESS" badge |
| UNDER_REVIEW | View only | Approve, certify, reopen | Amber "UNDER REVIEW" badge + banner |
| CERTIFIED | View only | Lock, download artifacts | Gold "CERTIFIED" badge + gold banner |
| LOCKED | View only | View only | Gold "LOCKED" badge with lock icon |
