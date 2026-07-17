# SABIT UI REALITY CHECK — March 5, 2026

Every screen in the frontend, described from the user's perspective. No backend files were read. Only .tsx files.

---

## SECTION 1: THE CONTROLLER'S SCREEN-BY-SCREEN EXPERIENCE

### 1. Login Screen (`/login`)

**What's on screen:** Dark-themed centered card. "Sabit" in italic display font, "Financial Close Engine" subtitle. Two fields: Email and Password. A "Sign in" button. A "Don't have an account? Register" link at the bottom.

**What the user can do:**
- Type email and password
- Click "Sign in" — button shows "Signing in..." while loading
- If login fails, a red error banner appears below the inputs with the error message
- Click "Register" link to navigate to `/register`

**What they CAN'T do:**
- No "Forgot Password" link exists anywhere
- The tenant ID field exists in code but is hidden (`type="hidden"`). Multi-tenant users have no visible way to switch tenants
- No SSO / OAuth option

---

### 2. First Thing After Login (`/` → redirect → `/close`)

**What happens:** The root page shows "Redirecting..." and checks the user's role. Controllers go to `/close`, operating partners go to `/portfolio`.

**Close Sessions List (`/close`):**

**What's on screen:** A TopBar with entity name. Below it, "Month-End Close" heading with entity name. A purple "+ New Close Session" button in the top right. Below that, a table of existing sessions with columns: Period, Status, Started, Duration, Preparer, Reviewer, Gates (e.g. "5/9"), Issues (count badge).

**What the user can do:**
- Click "+ New Close Session" — a slide-over panel opens with: Entity dropdown, Period Start date picker, Period End date picker. Dates default to the prior month. Cancel and "Create Session" buttons at bottom
- Click any row in the sessions table to navigate to that session's dashboard
- The most recent IN_PROGRESS session has a blue left-border accent

**What they CAN'T do:**
- No way to delete or archive a close session
- No way to rename or edit a session after creation
- No search or filter on the sessions list
- No pagination — all sessions rendered in one table
- No way to see which entity a session belongs to if there are multiple entities (table doesn't show entity column)

---

### 3. Creating a New Close

**What's on screen:** Slide-over panel from the right.

**What the user can do:**
- Select entity from dropdown (populated from entities API)
- Pick period start and end dates (defaults to last month)
- Click "Create Session" — on success, navigates to the new session's dashboard with a toast: "Session created for [period]. Prior period account mappings and AJE templates will carry forward automatically."
- If no entities exist, shows "No entities found. Create one in Settings first."

**What they CAN'T do:**
- No way to clone a prior session
- No way to set the preparer/reviewer during creation
- No fiscal year or quarter selection — only free-form date range

---

### 4. Uploading Their Data (OPEN State Dashboard)

**What's on screen:** When a session is in OPEN state, the dashboard shows a simplified upload-focused view instead of the full pipeline dashboard.

Content: Period label and entity name at top with "OPEN" badge. A card titled "Start Your Close" with explanatory text. A drag-and-drop file zone saying "Drop your GL export here — or click to browse" with hint "Accepted: CSV, Excel (.xlsx, .xls)".

Below the drop zone, an "OR" divider, then either:
- "Sync from ERP" button (if ERP connection exists)
- Gray box: "No ERP connection configured. Connect your accounting system in Settings..." with a link

Below that: "Upload Trial Balance Directly" button.

At the bottom: "Prior Period Reference" section showing the most recent CERTIFIED/LOCKED session with a link to view it.

**What the user can do:**
- Drag and drop a CSV/Excel file into the GL upload zone
- When a GL file is selected, a **GLUploadFlow** component appears showing: column mapping UI (ColumnMapper), then a parse preview, then "Confirm & Import" which ingests the GL and advances the session to IN_PROGRESS. On success, redirects to dashboard with toast showing account count and unmapped count.
- Click "Upload Trial Balance Directly" — shows a separate file zone for TB upload (TBUploadFlow). After upload, same flow: preview, confirm, ingest.
- Click "Sync from ERP" (if available)
- Click "← Back to start" to return to the main upload screen

**What they CAN'T do:**
- No way to re-upload or replace GL data after the first upload without creating a new session
- The "Sync from ERP" button exists but has no onClick handler — it's a dead button
- No progress indicator during file parsing (just a loading state)

---

### 5. Reviewing the Trial Balance (`/close/[sessionId]/trial-balance`)

**What's on screen:** "Trial Balance" heading with period label and adjusted/unadjusted label. Top right has: "Show prior period" checkbox, "Show original currency" checkbox (only if multi-currency data exists), "Export CSV" button, "Unadjusted" / "Adjusted" toggle buttons.

Below that, a summary bar showing: Total Debits, Total Credits, Difference (green if balanced, red if not), Account Count, and either "Unmapped: N" (amber) or "All mapped" (green).

Below, a FilterBar with search input ("Search by code or name..."), type filter pills (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE), and mapping filter pills (All, Mapped, Unmapped).

Main content: a DataTable with columns: Account Code (with NEW/INACTIVE badges), Account Name (with "contra" label), Account Type (color-coded pill), Debit Balance, Credit Balance, Net Balance. When "Show prior period" is checked, additional columns appear: Prior balance, Change amount (amber if material), Change %.  When "Show original currency" is checked: Orig Currency, Orig Debit, Orig Credit, FX Rate. Always a Mapping column showing the mapped reporting line name or "⚠ Unmapped", and a Status dot (green=mapped, amber=unmapped).

**What the user can do:**
- Toggle between Adjusted and Unadjusted view
- Toggle prior period comparison on/off
- Toggle original currency display (multi-currency only)
- Export filtered data as CSV (generates and downloads immediately)
- Search accounts by code or name
- Filter by account type (pills are toggleable)
- Filter by mapping status
- Sort by any column with sort indicators
- Click any row to expand it — shows GL journal entries for that account (date, description, debit, credit, source badge AJE/GL, JE number). If the account is unmapped, shows a "Map this account →" link to the mapping page
- Click column headers to sort ascending/descending

**What they CAN'T do:**
- No way to edit account balances directly
- No inline mapping — must go to mapping page
- No way to add manual adjustments directly from TB view
- No drill-down into JE detail from the expanded entries (clicking a JE number doesn't link anywhere)
- Footer shows totals but only for debits/credits, not net

---

### 6. Mapping Accounts (`/close/[sessionId]/mapping`)

**What's on screen:** Two-panel layout. Left panel: "Account Mapping" with the trial balance data. A filter/search bar at top. A DataTable showing all TB accounts with columns for Account Code, Account Name, Net Balance, and current mapping (dropdown or display). There are "Mapped" and "Unmapped" filter tabs. Each unmapped row has a searchable dropdown to select a taxonomy line. A "Save" button to persist mapping changes.

Right panel has two tabs: "AI Suggestions" and "Taxonomy Reference".

**AI Suggestions tab:** Shows a list of AI-generated mapping suggestions. Each suggestion card (AISuggestionCard component) shows: account code and name, suggested taxonomy line, confidence band (HIGH/MEDIUM/LOW with percentage), and whether it was auto-accepted. Shows alternative suggestions. Has "Accept" and "Reject" buttons per suggestion. An "Accept All" button at top to bulk-accept all suggestions. When accepted, the mapping is saved and audit trail records the AI source.

**Taxonomy tab:** A navigable tree of all taxonomy lines (Revenue → sub-lines, Expenses → sub-lines, etc.). Clicking a leaf node highlights it and can be used to assign mappings. Shows count of mapped accounts and summed balance per taxonomy line.

**What the user can do:**
- Search/filter accounts
- Change the mapping for any account via a searchable dropdown
- Save mappings (bulk save)
- View AI suggestions and accept/reject individually
- Click "Accept All" to accept all high-confidence suggestions at once
- Browse taxonomy tree for reference
- Navigate from here back to TB if needed

**What they CAN'T do:**
- No way to create a new taxonomy line from the mapping page (must go to Settings > Taxonomy)
- No undo after accepting a mapping (though they can change it again)
- No way to see why the AI suggested a particular mapping beyond the alternatives shown
- No bulk reject

---

### 7. Reconciling Accounts — List View (`/close/[sessionId]/reconciliation`)

**What's on screen:** "Reconciliations" heading with period label. A summary section showing count of reconciliations by status. Filter/search bar. A DataTable with columns: Account Code, Account Name, GL Balance, Supporting Balance, Difference, Status (badge), Assigned To, and an Actions column.

**What the user can do:**
- View all reconciliations required for the period
- Filter by status (Pending, In Progress, Completed, Approved)
- Search by account
- Click a row to navigate to the reconciliation detail page
- See which accounts have differences between GL and supporting balance

**What they CAN'T do:**
- No way to create a new reconciliation manually from this page
- No bulk operations (bulk complete, bulk assign)
- No way to export the reconciliation status list

---

### 8. Reconciling a Single Account — Detail View (`/close/[sessionId]/reconciliation/[reconId]`)

**What's on screen:** Account header showing the account code, name, GL balance, supporting balance, and the difference. Status badge. An "Add Items" section to add reconciling items (date, description, amount). A running "Reconciled Balance" that updates as items are added. Evidence upload zone. Notes field. "Complete" button and "Approve" button.

**What the user can do:**
- Enter the supporting balance
- Add reconciling items (each with date, description, amount)
- Upload evidence files (supporting documents)
- Add notes
- Mark the reconciliation as complete
- If reviewer, approve the reconciliation
- See if the difference is within tolerance

**What they CAN'T do:**
- No way to import reconciling items from a CSV
- No way to link to specific JEs that explain a difference
- No way to see the prior period's reconciliation for comparison

---

### 9. Working with Journal Entries (`/close/[sessionId]/adjustments`)

**What's on screen:** Two tabs at top: "Entries" and "Templates".

**Entries tab (AdjustmentsEntriesTab):**
- Search input ("Search by JE # or memo...")
- Status filter pills: All, Draft, Proposed, Approved, Posted, Rejected
- "+ New Journal Entry" button (top right)
- DataTable with columns: JE #, Date, Memo, Debit Total, Credit Total, Status (badge, with reversal indicator ↺), Source (Template/Manual), Evidence (paperclip icon with count, red if required but missing), Created By, Actions

Action buttons per status:
- **Draft:** Edit, Propose, Delete
- **Proposed:** View, Approve, Reject
- **Approved:** View, Post
- **Posted:** View only
- **Rejected:** Edit, Delete

Clicking a row expands it showing: full memo, line-by-line debit/credit breakdown with account codes, totals row, evidence file list, full audit trail (created by, proposed by, approved by, posted by with timestamps), and rejection reason if rejected.

Posted entries have a green left border. Rejected entries have a red left border.

**What the user can do (JE form — JournalEntryForm):**
- Enter: Date, Memo (required, min length enforced), Reversal Date (optional, for auto-reversing entries)
- Add journal entry lines: Account Code (searchable dropdown of TB accounts), Account Name (auto-populated), Debit amount, Credit amount
- Add multiple lines with + button
- Remove lines with X button
- See running debit/credit totals and out-of-balance warning
- Upload evidence files via drag-and-drop
- Save as Draft, or Save and Propose

**What they CAN'T do:**
- No way to attach evidence to a posted JE (evidence upload is only in the form)
- No copy/duplicate JE functionality
- No way to filter by date range
- No way to see the effect on the trial balance before posting

**Templates tab (AdjustmentsTemplatesTab):**
- Table showing AJE templates with: Template Name, Frequency (Monthly/Quarterly/Annual), Accounts (debit ↔ credit), Amount, Period Status (Pending/Applied/Skipped/Auto-applied), Applied/Skipped By, Action
- For pending: "Apply" and "Skip" buttons
- Skip requires a reason (min 10 characters, textarea)
- "Apply All Remaining" button for bulk apply
- Progress bar showing N/M resolved
- Applied templates link to their resulting JE
- Skipped templates can be un-skipped with "Undo Skip"
- Confirmation dialogs before applying/bulk-applying

**What they CAN'T do:**
- No way to create new templates from this page (must go to Settings > Templates)
- No way to edit template amounts for this period (it's the fixed template amount)
- No way to reorder templates

---

### 10. Working with Templates (Settings > Templates: `/settings/templates`)

**What's on screen:** "AJE Templates" heading. A list of existing templates. A form to create new templates with fields: Name, Frequency (Monthly/Quarterly/Annual), Debit Account Code, Debit Account Name, Credit Account Code, Credit Account Name, Amount, Description. "Create Template" button.

**What the user can do:**
- View all templates
- Create a new template
- Edit existing templates
- Delete templates

**What they CAN'T do:**
- No way to set effective dates (always active)
- No way to disable a template without deleting it
- No way to see which periods a template has been applied/skipped in

---

### 11. Looking at Financial Statements (`/close/[sessionId]/statements`)

**What's on screen:** "Financial Statements" heading with period label. A "Generate Statements" button (prominent, purple). If statements are stale, shows a yellow "Statements Stale" banner with "Regenerate" button. Tabs for each statement: Income Statement, Balance Sheet, Cash Flow Statement, Statement of Stockholders' Equity.

Each statement is rendered as a **StatementTable**: a hierarchical table showing line items with: Line Item Name (indented by hierarchy depth), Current Period amount, Prior Period amount (if available). Subtotal rows are bold. Grand total rows are bold with top/bottom borders. Section headers have backgrounds.

The **EquityTable** for the equity statement has a different layout: rows for beginning balance, net income, dividends, other changes, ending balance with columns for common stock, retained earnings, AOCI, total.

An "Export PDF" button. A "Validation" section showing cross-statement validation checks (e.g., "Balance Sheet balances: Assets = Liabilities + Equity" with pass/fail indicators).

**What the user can do:**
- Generate/regenerate statements (button click → loading → statements appear)
- Switch between the four statement tabs
- See current and prior period side by side
- See validation checks and their pass/fail status
- Export as PDF
- See when statements are stale (adjustments were posted after last generation)

**What they CAN'T do:**
- No way to add footnotes or disclosures
- No way to customize statement formatting
- No way to adjust the line hierarchy from this page
- No drill-down from a statement line to the underlying accounts
- No way to manually override a line amount (system is deterministic — which is by design)

---

### 12. Reviewing Variances (`/close/[sessionId]/variance`)

**What's on screen:** "Variance Analysis" heading. A table showing all statement line items with material period-over-period changes. Columns: Line Item, Current Period, Prior Period, Change ($), Change (%), Material (yes/no badge), Explanation Status (Pending/Explained/Approved).

For each variance row, an expandable detail showing:
- The variance amounts
- An "AI Draft" button that generates an AI explanation
- A text area for the controller to write/edit their explanation
- "Submit Explanation" button
- If AI-drafted, shows the AI draft text with "Use AI Draft" / "Edit" options

**What the user can do:**
- View all material variances
- Click "AI Draft" to get an AI-generated explanation
- Write or edit their own explanation
- Accept the AI draft or modify it
- Submit explanations
- See status of each variance explanation

**What they CAN'T do:**
- No way to mark a variance as "not material" / override materiality
- No way to attach supporting documents to a variance explanation
- No way to see trends (more than one prior period)
- No approval workflow for variance explanations (just submit)

---

### 13. The Review and Certification Experience (`/close/[sessionId]/review`)

**What's on screen:** Two main sections:

**CertificationChecklist:** A list of readiness gates with pass/fail indicators. Each gate shows: name, status (passing/failing), detail text, and a link to the relevant page. Gates include: GL uploaded, All accounts mapped, All reconciliations complete, All AJE templates resolved, Statements generated (not stale), All material variances explained, etc. Progress bar at top showing X/Y gates passing.

Below the checklist: An "Advance" / "Submit for Review" button (when IN_PROGRESS and all gates pass). When under review: "Certify" button (for CFO/reviewer). When certifying: confirmation dialog.

**CertificationRecord** (appears after certification): A green-bordered card showing:
- "CERTIFIED" label with checkmark icon
- Certified by, Certified at, Period, Entity
- Cryptographic Proof section: SHA-256 snapshot hash (expandable), Ed25519 signature, Public Key (expandable), Verification status
- "Verify Independently" button — calls verification endpoint and shows pass/fail
- "Download Artifact" button — downloads JSON certification artifact
- "View Snapshot" button — modal showing full certification snapshot JSON
- Cross-Statement Validation results at certification time
- **Audit Binder Export:** "Export PDF" and "Export JSON" buttons for the complete audit binder

**What the user can do:**
- See exactly which gates are passing/failing and navigate to fix them
- Advance the session state (IN_PROGRESS → UNDER_REVIEW → CERTIFIED → LOCKED)
- Certify the close (creates cryptographic proof)
- Verify the certification signature independently
- Download certification artifacts (JSON)
- View the full certification snapshot
- Export the audit binder as PDF or JSON
- Lock the session (terminal, irreversible)

**What they CAN'T do:**
- No way to add reviewer comments before certifying
- No way to request changes (no "send back with comments" flow)
- No dual sign-off (single certifier only)

---

### 14. The Board Package (`/close/[sessionId]/board-package`)

**What's on screen:** "Board Package" heading. A page that assembles a board-ready package from the certified financial statements. Shows: financial highlights (revenue, net income, key metrics), statement summaries, and an "Export PDF" button.

**What the user can do:**
- View the assembled board package
- Export as PDF
- See key financial highlights

**What they CAN'T do:**
- No way to add narrative/commentary sections
- No way to customize which metrics appear
- No way to add charts or visualizations
- No way to add supplementary schedules

---

### 15. The Audit Trail (`/close/[sessionId]/audit-trail`)

**What's on screen:** "Audit Trail" heading. A chronological list of all events for the close session. Each entry shows: timestamp, user, event type, description, and optionally before/after state.

**What the user can do:**
- Scroll through the full audit trail
- See who did what and when
- See before/after state for certain events

**What they CAN'T do:**
- No search or filter on the audit trail
- No date range filter
- No export option
- No way to filter by event type (mapping changes vs. JE actions vs. recon, etc.)

---

### 16. Every Settings Page

#### Settings Hub (`/settings`)
**What's on screen:** Grid of cards linking to sub-pages: General, Team, Integrations, Templates, Reconciliation, Evidence Policy, Taxonomy.

#### General Settings (`/settings/general`)
**What's on screen:** Entity name, fiscal year end, reporting currency, materiality thresholds. Save button.

**What the user can do:** Edit entity name, fiscal year, currency, thresholds. Save.

#### Team (`/settings/team`)
**What's on screen:** List of team members with roles. Invite form.

**What the user can do:** View team members, invite new users by email with role selection, remove users.

#### Integrations (`/settings/integrations`)
**What's on screen:** List of available integrations (ERP connections). Status indicators.

**What the user can do:** View integration status. Connect/disconnect. (Appears to be informational — no deep configuration UI visible.)

#### Templates (`/settings/templates`)
**What's on screen:** AJE template management. Create/edit/delete templates.

#### Reconciliation Requirements (`/settings/reconciliation`)
**What's on screen:** Configuration for which accounts require reconciliation. Tolerance settings.

**What the user can do:** Set which accounts need reconciliation, set tolerance thresholds, configure auto-population.

#### Evidence Policy (`/settings/evidence-policy`)
**What's on screen:** "Evidence Policy" heading. "When supporting documentation is required" subtitle. Three sections:
1. **Journal Entry Evidence Threshold:** A money input for the threshold amount. Entries above this require evidence.
2. **Reconciliation Evidence:** Checkbox "Always require at least one supporting document for reconciliation completion"
3. **Save Policy** button with loading state

A toast notification appears on save (success or error).

**What the user can do:** Set the JE evidence threshold, toggle reconciliation evidence requirement, save.

**What they CAN'T do:** Nothing notable missing — this page is clean after the decorative fields were removed.

#### Taxonomy (`/settings/taxonomy`)
**What's on screen:** "Financial Statement Taxonomy" heading. A collapsible tree showing all reporting line items organized by hierarchy (Revenue → sub-lines, etc.). Each custom line has a "Custom" badge. Hovering over custom lines reveals pencil (edit) and trash (delete) icons.

Below the tree: "+ Add Custom Line Item" button that opens an inline form with: Line Name, Statement (PL/BS/CF/OCI dropdown), Normal Balance (Debit/Credit), Parent Section (dropdown filtered by statement).

Delete shows a confirmation bar with warning about mapping rule references.

**What the user can do:** Browse the full taxonomy tree, expand/collapse sections, create custom lines, edit custom lines (name, normal balance, parent), delete custom lines (with confirmation), see which lines are custom vs standard.

**What they CAN'T do:**
- Cannot edit or delete standard (seeded) taxonomy lines
- No way to reorder lines within a section
- No way to see which accounts are mapped to each line (must go to mapping page)

---

### 17. Fixed Assets Page (`/close/[sessionId]/fixed-assets`)

**What's on screen:** A page for managing fixed asset schedules — depreciation calculations, asset register entries, and disposal tracking.

**What the user can do:** View fixed asset schedules, add assets, run depreciation calculations.

**What they CAN'T do:** This appears to be a standalone tool — no obvious connection back to the JE workflow (depreciation JEs should flow into the adjustments pipeline).

---

### 18. Deferred Tax Page (`/close/[sessionId]/deferred-tax`)

**What's on screen:** Deferred tax asset/liability tracking. Temporary differences schedule.

**What the user can do:** View and manage deferred tax items.

---

### 19. Stock Compensation Page (`/close/[sessionId]/stock-compensation`)

**What's on screen:** Stock-based compensation expense tracking. Grant-level detail, vesting schedules, fair value calculations.

**What the user can do:** View stock comp schedules.

---

### 20. Impairment Page (`/close/[sessionId]/impairment`)

**What's on screen:** Impairment testing for goodwill and intangible assets.

**What the user can do:** View impairment test results.

---

### 21. Segment Reporting Page (`/close/[sessionId]/segments`)

**What's on screen:** Segment-level financial reporting.

**What the user can do:** View segment data.

---

### 22. Consolidation Page (`/close/[sessionId]/consolidation`)

**What's on screen:** "Consolidation" heading with a merge icon. A "Saved" / "Saving..." indicator in the top right. Two side-by-side panels:

**Left panel — Entities:** Add entity form (name + currency inputs + "+" button). List of added entities showing name and currency.

**Right panel — Elimination Rules:** Form with Rule Name, Amount Type (Balance/Fixed/Formula dropdown), Debit Account, Credit Account, and conditionally an Amount field. "+ Add Rule" button. List of added rules.

Below the panels: Reporting Currency input, Period Label input, "Run Consolidation" button.

After running: Balance Check card (Balanced/Imbalanced with green/red icon), NCI Equity and NCI Net Income cards. Consolidated Trial Balance table (Account, Amount, Side debit/credit color-coded, Source entity/elimination badge). Elimination Journal Entries table.

**What the user can do:**
- Add entities with their currencies
- Add elimination rules (intercompany, etc.)
- Set reporting currency and period label
- Run consolidation — see consolidated TB and elimination JEs
- **Config auto-saves with debounce** — survives page refresh

**What they CAN'T do:**
- No way to delete an entity or rule after adding (no remove button)
- No way to import entity balances (entities have empty balance lines)
- No way to map entities to real close sessions
- Results don't flow into the main statements pipeline
- No ownership percentage for partial consolidation

---

### 23. FX Translation Page (`/close/[sessionId]/fx-translation`)

**What's on screen:** "FX Translation" heading with globe icon. "Saved" / "Saving..." indicator. Two mode tabs: "Current-Rate Translation" and "Temporal Remeasurement".

**FX Rates section:** Five inputs: Source Currency, Reporting Currency, Closing Rate, Average Rate, Historic Rate.

**Balance Lines section:** Add line button. Each line has: Label, Amount, Currency, Balance Type (Monetary/Non-monetary/Equity/Income/Expense). Multiple lines supported.

"Translate" or "Remeasure" button depending on active tab.

**Translation results:** Total Translated and CTA (Equity) cards. Table with Account, Original amount, Currency, Rate Type, Translated amount.

**Remeasurement results:** Remeasurement Gain/Loss card (green positive, red negative). Same table structure.

**What the user can do:**
- Switch between translation and remeasurement modes
- Enter FX rates
- Add balance lines with amounts
- Run translation/remeasurement
- **Config auto-saves with debounce** — survives page refresh

**What they CAN'T do:**
- No way to import rates from the exchange rates module
- No way to delete individual balance lines
- Results don't flow into the main statements pipeline
- No CTA roll-forward

---

### 24. Other Pages

**Register (`/register`):** Standard registration form with name, email, password, company name. Creates account and redirects.

---

## SECTION 2: THE OPERATING PARTNER'S SCREEN-BY-SCREEN EXPERIENCE

### 1. Login Screen

Same as controller. After login, redirected to `/portfolio`.

### 2. Portfolio Dashboard (`/portfolio`)

**What's on screen:** TopBar in "portfolio" mode showing "Portfolio Dashboard" label with NotificationBell. Main content shows:

**Summary cards** at top: Total Entities count, Entities in Close (actively being worked), Average Close Duration, entities with Issues.

**Entity table:** Each row shows: Entity Name, Current Period, Close Status (badge), Gate Progress (X/Y passing), Duration, Issues count, Last Activity timestamp. Clicking a row navigates to that entity's close session dashboard.

**What the user can do:**
- View portfolio-wide metrics at a glance
- See which entities are in active close
- See which entities have blocking issues
- Click into any entity to view their close session in detail (read-only)
- See the notification bell (see below)

**What they CAN'T do:**
- No way to create entities or sessions from the portfolio view
- No way to compare entities side by side
- No charting or trend visualization
- No way to drill into specific metrics (clicking a summary card does nothing)
- No way to filter or sort the entity table
- No export of portfolio status

### 3. What Happens When They Click Into a Company

They navigate to the close session layout with sidebar and all pages. The layout detects `operating_partner` role and sets `isReadOnly = true`. The TopBar shows a "Back to Portfolio" link.

A **ReadOnlyBanner** component exists but it's only rendered by pages that import it — it's NOT automatically shown by the layout. So the operating partner may not always see a clear indication they're read-only unless specific pages render the banner.

### 4. The Notification Bell

**What's on screen:** A bell icon in the TopBar. When clicked, shows a dropdown with recent notifications fetched from `/api/notifications`. Each notification shows a message and timestamp. Unread count badge on the bell icon.

**What the user can do:**
- Click bell to see notifications
- See unread count
- Click individual notifications

**What they CAN'T do:**
- No way to mark notifications as read
- No notification preferences/settings
- No way to filter notifications by type

### 5. Other Pages

The operating partner can access all close session pages via the sidebar but is expected to be read-only. The sidebar navigation is identical to the controller's.

---

## SECTION 3: WHAT THE AI DOES THAT THE USER CAN SEE

### 1. Account Mapping Suggestions (Mapping page)

**Where:** Right panel of the mapping page, "AI Suggestions" tab.

**What the user sees:** A list of cards (AISuggestionCard component). Each card has:
- A sparkle icon (✦) and "AI Suggestion" label — **clearly marked as AI-generated**
- The account code and name
- Suggested taxonomy line
- Confidence badge: HIGH (green), MEDIUM (amber), LOW (red) with percentage
- Alternative suggestions (up to 2)
- Auto-accepted badge if confidence was high enough for auto-accept
- Accept and Reject buttons

**Can they accept/reject/edit?** Yes. Accept applies the mapping. Reject dismisses it. They can also manually pick a different mapping from the alternatives or the dropdown, which is effectively editing the AI suggestion.

**Proactive or on-demand?** The suggestions appear automatically when there are unmapped accounts. The AI runs proactively.

### 2. Variance Explanation AI Drafts (Variance page)

**Where:** Variance detail expansion on the variance page.

**What the user sees:** An "AI Draft" button per material variance. Clicking it generates an AI-written explanation. The draft text appears in/near the explanation text area. The user can "Use AI Draft" to accept it or edit it manually.

**Is it obvious it's AI?** Yes, the button says "AI Draft" and the text is presented as a draft to be reviewed.

**Proactive or on-demand?** On-demand — user must click the "AI Draft" button.

### 3. Where AI Does NOT Appear

- No AI in reconciliation
- No AI in journal entry creation
- No AI in financial statement generation (statements are deterministic arithmetic)
- No AI in the review/certification process
- No AI in the board package
- No AI assistant/chatbot anywhere

---

## SECTION 4: WHAT THE SYSTEM DOES AUTOMATICALLY THAT THE USER CAN SEE

### Gates That Block Progress

**Where they appear:** Dashboard (Gate Status section with progress bar), Review page (CertificationChecklist), and the StateMachineBanner at the top of every page within a session.

**What the user sees when blocked:** The StateMachineBanner shows the current state and "X gates remaining" with the advance button either disabled or absent. On the dashboard, each failing gate shows an empty circle (vs. green checkmark for passing) with a detail like "32/52 mapped" and links to the relevant page.

**Specific gates visible:**
- GL uploaded
- All accounts mapped (count/total)
- All reconciliations complete (count/total)
- All AJE templates resolved (count/total)
- Statements generated (not stale)
- All material variances explained (count/total)
- No blocking issues

### Issues That Auto-Detect

**Where they appear:** The IssuePanel (slide-over from right, triggered by issue count badge in sidebar or by events). Shows issue title, severity, description, and creation timestamp.

**Does the user see them?** Yes. The sidebar shows a badge count for blocking issues. The dashboard's "What Needs Attention" section lists issues as attention items with links.

### Auto-Resolution

**Not visually clear.** There is no UI that explicitly says "this issue was auto-resolved." Issues may disappear from the panel when resolved, but the user wouldn't see a notification or log entry explaining it.

### Cascade Effects

**Statements Stale:** When a JE is posted after statements were generated, `statementsStale` becomes true. The user sees:
- A yellow "Stale" badge on the Statements sidebar link
- On the statements page itself, a yellow banner saying "Statements are stale — regenerate"
- On the dashboard, an attention item: "Statements stale — regeneration needed"

This is well-communicated.

### Carry-Forward Between Periods

**What the user sees:** When creating a new session, a toast says "Prior period account mappings and AJE templates will carry forward automatically." The mapping rules and templates appear populated from prior period without the user doing anything.

**What they don't see:** No diff showing "these mappings were carried forward from [prior period]." No way to see what was carried vs. what was new.

---

## SECTION 5: THE HITL EXPERIENCE — DOES IT EXIST IN THE UI?

### Is there a review queue?

**Partially.** The dashboard's "What Needs Attention" section acts as a lightweight inbox. It lists: unmapped accounts, incomplete reconciliations, unresolved AJE templates, JEs awaiting approval, stale statements, unexplained variances. Each item links to the relevant page. This is the closest thing to a review queue.

**But it's not a true inbox.** Items are categories ("5 accounts unmapped"), not individual actionable items. The controller must navigate to each page and work through items there.

### When the AI suggests a mapping, where does the controller see it?

On the **Mapping page**, right panel, AI Suggestions tab. They must navigate to this specific page. There is no notification or dashboard item that says "3 new AI mapping suggestions ready for review."

### When the AI drafts a variance explanation, where does the controller see it?

On the **Variance page** only. They must click "AI Draft" per variance. There's no proactive notification.

### When the system detects a problem, where does the controller see it?

- **Dashboard → "What Needs Attention"** section (primary)
- **Sidebar badges** (unmapped count, recon incomplete count, adjustments pending, variance unexplained)
- **IssuePanel** (for system-detected close issues)
- **StateMachineBanner** (gates remaining count)

### Can the controller work from a single inbox?

**No.** The dashboard's attention list is read-only — it links out to different pages. There is no unified inbox where the controller can accept/reject/resolve items without navigating away.

### Does the system show "what changed since yesterday"?

**No.** The audit trail exists but has no "since your last visit" filter. The dashboard shows "Recent Activity" (last 8 audit events with relative timestamps), which is the closest thing, but it's a raw event log, not a curated "here's what changed."

### Is there UI showing AI learning from corrections?

**No.** The backend tracks AI suggestion accept/reject/edit events in the audit ledger, but there is no UI surface that shows the controller "your corrections improved AI accuracy" or "AI confidence has increased based on your feedback."

---

## SECTION 6: WHAT'S MISSING FROM THE USER'S PERSPECTIVE

### Missing Pages

| Missing Page | Why It's Expected |
|---|---|
| **Forgot Password page** | Login has no password reset flow |
| **User Profile / Account Settings** | No way to change password, name, or preferences |
| **Entity Management page** | General Settings edits one entity. No way to create additional entities or manage a multi-entity setup |
| **Close Calendar / Timeline view** | No calendar showing close deadlines, milestones, or SLA tracking |
| **Help / Documentation page** | No in-app help, tooltips, or onboarding guide |
| **Comparison / Benchmarking page** | Operating partner has no way to compare entities' performance or close efficiency |

### Missing Features on Existing Pages

| Page | Missing Feature |
|---|---|
| **Login** | Forgot password, SSO/OAuth, tenant switcher |
| **Close Sessions List** | Search, filter, pagination, delete/archive session, entity column |
| **Dashboard** | Personalized "Good morning" greeting, close deadline/SLA countdown, task assignments per user |
| **Trial Balance** | JE number link to JE detail, inline mapping, manual balance adjustment |
| **Mapping** | Create taxonomy line inline, bulk reject suggestions, undo history |
| **Reconciliation List** | Bulk operations, export, create new recon manually |
| **Reconciliation Detail** | Import items from CSV, link to JEs, prior period comparison |
| **Journal Entries** | Copy/duplicate JE, date range filter, attach evidence to posted JE, preview effect on TB |
| **Statements** | Footnotes/disclosures, line drill-down to accounts, customizable formatting |
| **Variance** | Override materiality, attach documents, multi-period trends, approval workflow |
| **Review** | Reviewer comments, "send back with comments" flow, dual sign-off |
| **Board Package** | Narrative sections, custom metrics, charts, supplementary schedules |
| **Audit Trail** | Search, filter by event type, date range filter, export |
| **Portfolio** | Sort/filter entity table, compare entities, charts/trends, export |
| **Consolidation** | Remove entities/rules, import entity balances, ownership percentages |
| **FX Translation** | Remove balance lines, import rates from exchange rate module |
| **Fixed Assets / Deferred Tax / Stock Comp / Impairment / Segments** | These pages exist but feel disconnected from the main close pipeline — their outputs don't visibly flow into JEs or statements |

### Dead Ends

| Location | Issue |
|---|---|
| **"Sync from ERP" button** (Open State Dashboard) | Has no onClick handler — clicking it does nothing |
| **Portfolio summary cards** | Clicking "Total Entities" or "Average Close Duration" does nothing — they're display-only |
| **Consolidation entity/rule lists** | No way to remove items once added (no delete/X button) |
| **FX Translation balance lines** | No way to remove a line once added |
| **Fixed Assets / Deferred Tax / Stock Comp / Impairment / Segments** | These pages exist in the sidebar but their output doesn't connect back to the JE or statement pipeline — they're informational islands |
| **Notification bell notifications** | Can be viewed but not marked as read or acted upon |

### Confusing Experiences

| Location | Confusion |
|---|---|
| **OPEN state → IN_PROGRESS transition** | After uploading GL, the session silently advances to IN_PROGRESS. No explicit "Begin Close" moment — could confuse first-time users |
| **Read-only mode for operating partners** | The ReadOnlyBanner exists but isn't rendered by the layout — operating partners see the full sidebar and may try to click edit buttons before realizing they can't |
| **Advance vs. Certify vs. Lock** | Three separate state transitions with no clear explanation of what each means. A first-time user wouldn't know the difference between UNDER_REVIEW and CERTIFIED |
| **Stale statements** | The system tells you statements are stale but doesn't explain why (which JE caused it). The user has to guess |
| **Prior period comparison** | Appears on the TB and variance pages but not on the reconciliation or statements pages. Inconsistent |
| **Consolidation and FX Translation** | These are in the sidebar nav but have no connection to the main close pipeline. A controller might think they need to run consolidation as part of the close, when these are actually standalone tools |
| **Auto-accepted AI mappings** | The AI may auto-accept high-confidence mappings without the user seeing them first. There's a badge on the card, but if all are auto-accepted, the user may not realize AI made decisions for them |
