# SABIT CUSTOMER JOURNEY SPECIFICATION

> The definitive build specification for every screen, every decision, every handoff.
> Generated: 2026-03-12
> Designed from first principles — no existing implementation referenced.

This document specifies the complete customer journey for all 5 personas of the Sabit financial close engine. Developers should implement every screen exactly as described.

---

# TABLE OF CONTENTS

1. SARAH CHEN — Controller (Screens 1-9)
2. SARAH CHEN — Controller (Screens 10-20)
3. SARAH CHEN — Controller (Decision Trees, Handoffs, Edge Cases, Keyboard Patterns)
4. DAVID PARK — CFO/Reviewer (Complete Specification)
5. MARCUS WEBB — PE Operating Partner (Screens)
6. MARCUS WEBB — PE Operating Partner (Decisions, Edge Cases, Notifications)
7. KAREN WHITFIELD — Fund Controller (Screens)
8. KAREN WHITFIELD — Fund Controller (Decisions, Edge Cases, Notifications)
9. JAMES WRIGHT — External Auditor (Screens)
10. JAMES WRIGHT — External Auditor (Decisions, Edge Cases, Notifications)
11. CROSS-PERSONA — Handoffs, Notification Matrix, First-Time Experience

---

# SABIT BUILD SPECIFICATION: SARAH CHEN -- CONTROLLER
# Complete Screen-by-Screen Journey & Interaction Specification

---

## A. COMPLETE SCREEN-BY-SCREEN JOURNEY

---

### SCREEN 1: LOGIN
**URL**: `/login`
**Time spent**: 15-30 seconds
**Emotional state**: Neutral to slightly anxious (close week pressure)

#### Layout
- Centered card on a neutral gray background (#F5F5F5)
- Sabit logo top center, tagline "Financial Close Engine" beneath
- Email input field (autofilled if remembered)
- Password input field
- "Sign in" primary button (full width of card)
- "Forgot password?" text link below button
- "Sign in with SSO" secondary button below divider line
- Footer: Terms of Service | Privacy Policy

#### Actions
- Enter email and password, click Sign In
- Click SSO button to redirect to company IdP (Okta, Azure AD)
- Click Forgot Password to trigger reset email flow

#### Decisions
- None. Mechanical step.

#### Navigation Trigger
- Successful authentication redirects to `/portfolio`
- If Sarah has only one company assigned, skip portfolio and go to `/sessions` for that company

#### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Wrong password | Red inline text below password field: "Incorrect email or password. Try again or reset your password." | Focus returns to password field, field clears |
| Account locked (5 attempts) | Red banner: "Account locked for 15 minutes. Contact your administrator or reset your password." | Forgot password link highlighted |
| SSO failure | Red banner: "SSO authentication failed. Contact your IT administrator. Error code: [CODE]" | Fallback to email/password if enabled |
| Network error | Red banner: "Unable to connect. Check your internet connection and try again." | Retry button appears |
| Session expired (returning user) | Yellow banner above login card: "Your session expired. Please sign in again." | Normal login flow |

#### API Data Requirements
- `POST /auth/login` -- email, password
- `POST /auth/sso/initiate` -- provider ID
- Response: JWT token, user profile, assigned companies[], role

#### Loading State
- Sign In button shows spinner, text changes to "Signing in..."
- All inputs disabled during authentication

#### Empty State
- N/A

---

### SCREEN 2: PORTFOLIO SELECTOR
**URL**: `/portfolio`
**Time spent**: 5-10 seconds
**Emotional state**: Neutral, task-oriented

**Note**: Sarah typically works on ONE company. If she is a controller at a PE platform company with add-on acquisitions, she may see 2-4 entities. Most controllers see 1.

#### Layout
- Top navigation bar: Sabit logo (left), notification bell with badge count, user avatar/initials dropdown (right)
- Page title: "Your Companies"
- Grid of company cards (1-4 cards typical for controller)
  - Each card shows:
    - Company name (bold, 16px)
    - Entity type tag: "Platform" or "Add-on"
    - Current close status pill: "Open -- Feb 2026" (blue), "In Review" (amber), "Certified" (green), "No Active Close" (gray)
    - Last certified period: "Last certified: Jan 2026"
    - Days since period end: "12 days since period end" (turns red after 15 days)
- If only 1 company: auto-redirect to that company's session list, skip this screen entirely

#### Actions
- Click a company card to navigate to that company's session list
- Notification bell opens notification drawer (slide-in from right)
- User avatar dropdown: Profile Settings, Keyboard Shortcuts, Sign Out

#### Decisions
- Which company to work on (trivial for single-company controllers)

#### Navigation Trigger
- Click company card goes to `/companies/{companyId}/sessions`

#### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| No companies assigned | Empty state: illustration + "No companies assigned to your account. Contact your administrator." | Link to support email |
| API failure loading companies | Error card: "Unable to load companies. Retry." | Retry button |

#### API Data Requirements
- `GET /users/me/companies` -- returns company[], each with: id, name, entityType, currentSession { status, period }, lastCertifiedPeriod, daysSincePeriodEnd
- `GET /notifications/unread-count` -- returns count for bell badge

#### Loading State
- Skeleton cards (gray pulsing rectangles matching card layout), 1-4 cards

#### Empty State
- Illustration of an empty folder
- "No companies assigned to your account."
- "Contact your administrator to get access."

---

### SCREEN 3: SESSION LIST (CLOSE PERIODS)
**URL**: `/companies/{companyId}/sessions`
**Time spent**: 10-30 seconds
**Emotional state**: Focused, planning mode

#### Layout
- Left sidebar (persistent from here forward):
  - Company name at top with switcher chevron (if multi-company)
  - Navigation links (grayed out until a session is selected):
    - Dashboard
    - GL Upload
    - Trial Balance
    - Account Mapping
    - Reconciliation
    - Adjustments
    - Financial Statements
    - EBITDA Bridge
    - Budget Comparison
    - Variance Analysis
    - Certification
  - Bottom of sidebar: Settings, Help

- Main content area:
  - Page title: "Close Periods" with subtitle showing company name
  - "New Close Period" primary button (top right)
  - Table of sessions, most recent first:
    - Period column: "February 2026" (formatted month-year for monthly, "Q4 2025" for quarterly)
    - Status column: pill badge -- Draft (gray), In Progress (blue), In Review (amber), Certified (green), Reopened (red)
    - Progress column: horizontal progress bar with fraction "7/11 steps complete"
    - Created column: date
    - Last activity column: relative time "2 hours ago"
    - Actions column: "Open" button (primary for in-progress), "View" (for certified), overflow menu (duplicate, delete if draft)
  - Pagination if more than 24 periods (unlikely in first years)

#### Actions
- Click "New Close Period" to create a new session
- Click "Open" / row click to enter that session
- Click "View" on certified sessions to see read-only certified data
- Overflow menu: "Duplicate period settings" (copies mappings, templates, tolerance configs), "Delete" (only for Draft status, requires confirmation modal)

#### New Close Period Flow (Modal)
- Modal title: "Create New Close Period"
- Fields:
  - Period type: Monthly / Quarterly / Annual (radio buttons)
  - Period: Month picker (defaults to next unclosed month)
  - Fiscal year: auto-populated based on company settings
  - Copy settings from: dropdown of previous periods (default: most recent)
  - Checkboxes for what to copy: Account mappings, Reconciliation templates, Adjustment templates, Tolerance thresholds, Budget data
- "Create" primary button, "Cancel" secondary
- On create: navigates to `/companies/{companyId}/sessions/{sessionId}/dashboard`

#### Decisions
- Create new period or continue existing one
- What to copy from prior period
- Monthly vs quarterly vs annual close type

#### Navigation Trigger
- Clicking Open/View or creating new session goes to session dashboard

#### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Period already exists | Modal inline error: "A close period for February 2026 already exists." | Highlight existing period in table |
| Cannot delete non-draft | Toast: "Only draft periods can be deleted." | N/A |
| API failure | Error banner above table: "Unable to load close periods." | Retry button |

#### API Data Requirements
- `GET /companies/{companyId}/sessions` -- returns session[], each with: id, period, periodType, status, progress { completed, total }, createdAt, lastActivityAt
- `POST /companies/{companyId}/sessions` -- create new session with config
- `DELETE /companies/{companyId}/sessions/{sessionId}` -- delete draft session

#### Loading State
- Skeleton table rows (6 rows of pulsing gray bars)

#### Empty State (First-Time User)
- Illustration of a calendar with a plus sign
- "No close periods yet"
- "Create your first close period to get started."
- "New Close Period" primary button centered

---

### SCREEN 4: SESSION DASHBOARD
**URL**: `/companies/{companyId}/sessions/{sessionId}/dashboard`
**Time spent**: 1-3 minutes on entry, revisited frequently (20+ times during close)
**Emotional state**: Assessment mode -- "where am I, what's left"

#### Layout
- Left sidebar: now active with session context. Current session period shown below company name ("February 2026 -- Monthly Close"). All nav links now active based on progress.
  - Each nav link shows a status icon:
    - Gray circle: not started
    - Blue half-circle: in progress
    - Green checkmark: complete
    - Red exclamation: has errors/blockers
    - Amber clock: waiting for review

- Main content area, top to bottom:

**Header Row**:
- Period title: "February 2026 Monthly Close"
- Status pill: "In Progress"
- Days indicator: "Day 3 of close" (calculated from period end date)
- Target close date: "Target: Mar 15, 2026" (configurable)
- "Submit for Review" button (disabled until all gates pass, with tooltip showing blockers)

**Progress Pipeline** (horizontal stepper):
- Visual pipeline with 11 steps as connected nodes:
  1. GL Upload
  2. Trial Balance
  3. Account Mapping
  4. Reconciliation
  5. Adjustments
  6. Income Statement
  7. Balance Sheet
  8. Cash Flow
  9. Equity Statement
  10. EBITDA Bridge
  11. Variance Analysis
- Each node: green (complete), blue (current), gray (upcoming), red (blocked)
- Clicking any node navigates to that screen
- Below the pipeline: "7 of 11 complete -- Estimated 2.5 hours remaining"

**Gate Checklist** (card):
- Title: "Certification Gates"
- List of pass/fail requirements:
  - [ ] Trial balance is balanced (net zero)
  - [ ] All accounts mapped to financial statements
  - [ ] All balance sheet accounts reconciled within tolerance
  - [ ] All adjusting entries approved
  - [ ] All four statements generated and cross-validated
  - [ ] All material variances explained
  - [ ] EBITDA bridge reconciles to income statement
  - [ ] Budget comparison reviewed (if budget uploaded)
- Each item: green check or red X with clickable link to the relevant screen
- Summary: "6 of 8 gates passing"

**Alerts Card**:
- Title: "Action Required" with count badge
- List of items needing attention, each with icon, description, and "Go" link:
  - "3 accounts need manual mapping (confidence below 50%)"
  - "1 reconciliation over tolerance ($50,238 unreconciled)"
  - "2 adjusting entries rejected by reviewer -- feedback attached"
  - "1 material variance needs explanation ($125K revenue)"
- Sorted by severity (blockers first)

**Period Comparison Card** (only if prior period exists):
- Side-by-side mini metrics:
  - Total revenue: $42.1M vs $41.8M prior month (+0.7%)
  - Total EBITDA: $8.2M vs $7.9M (+3.8%)
  - Total assets: $312M vs $310M
  - Net income: $3.1M vs $2.9M
- Spark lines showing 6-month trend for each

**Activity Feed** (right column or below):
- Chronological list of recent actions:
  - "Sarah uploaded GL file (2,847 records) -- 2 hours ago"
  - "AI mapped 342 of 367 accounts (93% auto-mapped) -- 2 hours ago"
  - "David rejected JE-0023 with comment -- 45 min ago"
- Last 10 items, "View all" link to activity log

#### Actions
- Click any pipeline step to navigate there
- Click any gate item to navigate to relevant screen
- Click any alert "Go" link to navigate to the issue
- Click "Submit for Review" when all gates pass
- Refresh dashboard (auto-refreshes every 60 seconds via polling or WebSocket)

#### Decisions
- What to work on next (guided by alerts and gate checklist)
- Whether the close is progressing on schedule

#### Navigation Trigger
- Clicking pipeline steps, gate items, or alerts navigates to specific screens
- "Submit for Review" navigates to submission confirmation screen

#### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Session not found | Redirect to session list with toast: "Close period not found." | Select a valid session |
| Partial data load failure | Individual cards show inline error with retry | Card-level retry buttons |
| Stale data | Yellow banner: "Data may be outdated. Last refreshed 5 min ago." | Manual refresh button |

#### API Data Requirements
- `GET /sessions/{sessionId}/dashboard` -- returns:
  - session metadata (period, status, createdAt, targetCloseDate)
  - pipeline steps[] with status enum
  - gates[] with pass/fail boolean and details
  - alerts[] with severity, description, link
  - periodComparison { current: metrics, prior: metrics, trends[] }
  - activityFeed[] with actor, action, timestamp
- `GET /sessions/{sessionId}/progress` -- lightweight endpoint for polling

#### Loading State
- Skeleton layout matching all cards: gray pulsing rectangles for each card area
- Pipeline shows as gray dots connected by gray lines

#### Empty State
- Fresh session (just created):
  - Pipeline all gray
  - Gate checklist all unchecked
  - Alerts: single item "Upload your general ledger to begin the close process" with "Upload GL" button
  - No period comparison (first close) or comparison shown with "No prior period data"
  - Activity feed: "Session created by Sarah Chen -- just now"

---

### SCREEN 5: GL UPLOAD
**URL**: `/companies/{companyId}/sessions/{sessionId}/gl-upload`
**Time spent**: 2-10 minutes (depends on file issues)
**Emotional state**: Hopeful but wary -- "will the file work this time?"

**Context**: Sarah exports a trial balance or general ledger from her accounting system (NetSuite, Sage Intacct, QuickBooks Enterprise, SAP B1, or sometimes a CSV from a legacy system). The file formats vary wildly. This is the single most anxiety-inducing step because file format issues are common.

#### Layout
- Page title: "General Ledger Upload"
- Subtitle: "February 2026 Monthly Close"

**Upload Zone** (when no file uploaded yet):
- Large dashed-border drop zone (400px tall, full width minus sidebar)
- Icon: cloud with up arrow
- Primary text: "Drag and drop your general ledger file here"
- Secondary text: "or click to browse"
- Supported formats listed: ".csv, .xlsx, .xls, .tsv, .qbo, .iif"
- Max file size: "Up to 50MB"
- Below drop zone: "Download template" link for each major accounting system (NetSuite, Sage Intacct, QuickBooks, SAP B1, Generic CSV)

**Upload Progress** (during upload):
- Drop zone replaced by progress card:
  - File name and size
  - Progress bar with percentage
  - "Processing..." status text
  - Cancel button
- Three-phase progress:
  1. "Uploading file..." (0-30%)
  2. "Parsing and validating..." (30-70%)
  3. "Analyzing structure..." (70-100%)

**Upload Complete -- Validation Results** (after processing):
- Success banner (green) or warning banner (amber) or error banner (red)

**Success case**:
- Green banner: "GL uploaded successfully. 2,847 journal entries parsed across 367 accounts."
- Summary card:
  - File: "GL_Feb2026_Export.xlsx"
  - Records parsed: 2,847
  - Unique accounts: 367
  - Date range: Feb 1, 2026 -- Feb 28, 2026
  - Total debits: $145,234,891.23
  - Total credits: $145,234,891.23
  - Balance check: "Balanced" (green check) or "UNBALANCED" (red, with difference shown)
  - Currency: USD
  - New accounts (vs prior period): 3 highlighted with names
  - Missing accounts (in prior but not current): 0 or count with list

**Preview table**:
- First 20 rows of parsed data in a table:
  - Account Number | Account Name | Debit | Credit | Department | Description
- Column headers show detected mapping (with edit icons to re-map columns)
- "Show all [2,847] rows" expandable

**Column Mapping Panel** (if auto-detection uncertain):
- Left column: Detected columns from file
- Right column: Required Sabit fields (Account Number, Account Name, Debit, Credit, optional: Department, Description, Date, Reference)
- Drag-and-drop or dropdown mapping
- Auto-detected mappings shown with confidence indicator
- "Confirm Mapping" button

**Action buttons** (bottom right):
- "Re-upload" secondary button (replaces current file)
- "Proceed to Trial Balance" primary button (enabled only if balanced and mapped)
- If unbalanced: "Proceed Anyway" warning button with confirmation modal

#### Actions
- Drag and drop file or click to browse
- Download template for specific accounting system
- Re-map columns if auto-detection failed
- Preview parsed data
- Re-upload a different file
- Proceed to trial balance

#### Decisions
- Is the file correct and complete?
- Are columns mapped correctly?
- If unbalanced: proceed or re-export from accounting system?
- If new/missing accounts: expected or error?

#### Navigation Trigger
- "Proceed to Trial Balance" goes to `/sessions/{sessionId}/trial-balance`
- "Proceed Anyway" (unbalanced) shows confirmation modal, then proceeds

#### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Unsupported file format | Red banner: "Unsupported file format. Please upload .csv, .xlsx, .xls, .tsv, .qbo, or .iif" | Re-upload link |
| File too large | Red banner: "File exceeds 50MB limit. Try exporting a smaller date range or removing unnecessary columns." | Re-upload link |
| Parse failure | Red banner: "Unable to parse file. The file may be corrupted or password-protected. Try re-exporting from your accounting system." | Re-upload link, link to troubleshooting guide |
| Missing required columns | Amber banner: "Could not detect required columns: Account Number, Debit/Credit. Please map columns manually." | Column mapping panel opens automatically |
| Duplicate account numbers | Amber banner: "Found 3 duplicate account numbers. Records have been consolidated. Review the trial balance carefully." | Link to duplicates list |
| Unbalanced GL | Red banner: "Trial balance is unbalanced. Debits exceed credits by $1,234.56. This must be resolved before certification." | "Re-upload" or "Proceed Anyway" options |
| Date range mismatch | Amber banner: "GL contains transactions outside February 2026 (found dates in Jan 2026). 12 out-of-period entries excluded." | Show excluded entries, option to include |
| Network interruption during upload | Red banner: "Upload interrupted. Please try again." | Re-upload, auto-resume if supported |
| Previous GL exists for this session | Confirmation modal: "A GL has already been uploaded for this period. Uploading a new file will replace the existing data and reset trial balance, mappings, and reconciliations. Continue?" | Confirm or cancel |

#### API Data Requirements
- `POST /sessions/{sessionId}/gl/upload` -- multipart file upload, returns job ID
- `GET /sessions/{sessionId}/gl/upload/{jobId}/status` -- poll for processing status
- `GET /sessions/{sessionId}/gl/summary` -- returns parsed summary, balance check, account counts
- `GET /sessions/{sessionId}/gl/preview?limit=20` -- returns first 20 parsed rows
- `GET /sessions/{sessionId}/gl/column-mapping` -- returns detected and required column mappings
- `PUT /sessions/{sessionId}/gl/column-mapping` -- save manual column mappings
- `GET /templates/gl/{systemType}` -- download template file

#### Loading State
- Upload progress bar as described
- After upload: skeleton cards for summary and preview table

#### Empty State
- The drop zone IS the empty state -- no file uploaded yet
- If prior period had a GL: subtle hint text "Last period: GL_Jan2026_Export.xlsx (2,791 records)"

---

### SCREEN 6: TRIAL BALANCE
**URL**: `/companies/{companyId}/sessions/{sessionId}/trial-balance`
**Time spent**: 3-10 minutes
**Emotional state**: Verification mode -- "do the numbers tie out?"

#### Layout
- Page title: "Trial Balance"
- Subtitle: "February 2026 -- 367 accounts"

**Summary Bar** (horizontal, sticky at top below page title):
- Total Debits: $145,234,891.23
- Total Credits: $145,234,891.23
- Net Balance: $0.00 (green if zero, red if non-zero)
- Accounts: 367
- "Balanced" green pill or "UNBALANCED by $X" red pill

**Filter/Search Bar**:
- Search input: "Search accounts by number or name..."
- Filter dropdowns:
  - Account type: All | Assets | Liabilities | Equity | Revenue | Expenses
  - Balance: All | Debit balance | Credit balance | Zero balance
  - Status: All | Mapped | Unmapped | New (vs prior period)
- "Export" button (CSV/Excel)

**Trial Balance Table** (the core of this screen):
| Column | Width | Notes |
|--------|-------|-------|
| Account Number | 120px | Sortable, left-aligned |
| Account Name | 250px+ flex | Sortable, left-aligned, truncated with tooltip |
| Prior Period Balance | 140px | Right-aligned, grayed if no prior. Clicking opens prior period detail |
| Current Debit | 140px | Right-aligned, formatted with commas |
| Current Credit | 140px | Right-aligned, formatted with commas |
| Ending Balance | 140px | Right-aligned, bold. Positive=debit, negative=credit. Color-coded by variance from prior |
| Change | 100px | Right-aligned, shows dollar change and % change. Red if >10% change |
| Mapping Status | 100px | Pill: "Mapped" (green), "Unmapped" (gray), "Review" (amber) |

- Rows grouped by account type (Assets, Liabilities, Equity, Revenue, Expenses) with subtotal rows
- Subtotal rows have gray background, bold text
- Grand total row at bottom: bold, with balance check
- Alternating white/light gray row backgrounds
- Row hover: light blue highlight
- Row click: navigates to account detail (reconciliation or mapping depending on context)
- Sticky header row on scroll

**Comparison Column Toggle** (above table):
- Toggle: "Show prior period" (on by default if prior exists)
- Toggle: "Show budget" (if budget uploaded)
- Toggle: "Show variance" (shows absolute and percentage change columns)

#### Actions
- Search and filter accounts
- Sort by any column (click header)
- Click account row to navigate to account detail
- Export trial balance to CSV/Excel
- Toggle comparison columns
- Click "Proceed to Account Mapping" button (bottom right)

#### Decisions
- Do the numbers look right at a high level?
- Any unexpected new accounts or missing accounts?
- Any dramatic balance changes that need investigation?
- Is the trial balance balanced?

#### Navigation Trigger
- Row click goes to account detail
- "Proceed to Account Mapping" goes to `/sessions/{sessionId}/account-mapping`
- Breadcrumb navigation available

#### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| No GL uploaded | Redirect to GL Upload with toast: "Upload a general ledger first." | GL Upload screen |
| Stale data (GL re-uploaded) | Yellow banner: "The general ledger was re-uploaded. Trial balance has been regenerated." | Dismiss |
| Calculation error | Red banner: "Trial balance calculation error. Contact support." | Support link |

#### API Data Requirements
- `GET /sessions/{sessionId}/trial-balance` -- returns full trial balance with all accounts, balances, prior period comparison, mapping status
- Query params: `?search=`, `?accountType=`, `?balanceType=`, `?mappingStatus=`, `?sort=`, `?order=`
- `GET /sessions/{sessionId}/trial-balance/summary` -- returns totals, balance check, account count
- `GET /sessions/{sessionId}/trial-balance/export?format=csv` -- returns downloadable file

#### Loading State
- Summary bar: skeleton numbers
- Table: 15 skeleton rows with pulsing gray bars in each column

#### Empty State
- N/A (redirects to GL Upload if no data)

---

### SCREEN 7: ACCOUNT MAPPING
**URL**: `/companies/{companyId}/sessions/{sessionId}/account-mapping`
**Time spent**: 5-45 minutes (first close: 30-45 min; repeat close: 5-10 min reviewing AI suggestions)
**Emotional state**: First close -- tedious but necessary. Repeat -- satisfaction as AI handles most of it.

**Context**: Each GL account must be mapped to a financial statement line item. Sabit uses AI to suggest mappings based on account name, number patterns, and prior period mappings. This is where Sarah's accounting expertise is critical.

#### Layout
- Page title: "Account Mapping"
- Subtitle: "Map general ledger accounts to financial statement line items"

**Progress Bar** (top):
- "342 of 367 accounts mapped (93%)" with green progress bar
- Three segments visualized:
  - Green: "Auto-accepted (high confidence)" -- 298 accounts
  - Amber: "Needs review (medium confidence)" -- 44 accounts
  - Red: "Manual mapping required (low confidence)" -- 25 accounts

**Filter Bar**:
- Tabs: "All (367)" | "Needs Review (44)" | "Unmapped (25)" | "Auto-Mapped (298)" | "Manually Mapped (0)"
- Search: "Search accounts..."
- Filter: Statement -- All | Income Statement | Balance Sheet | Cash Flow | Equity

**Mapping Table**:
| Column | Width | Notes |
|--------|-------|-------|
| Select checkbox | 40px | For bulk actions |
| Account Number | 120px | Left-aligned |
| Account Name | 200px | Left-aligned |
| Ending Balance | 130px | Right-aligned |
| AI Suggestion | 200px | Shows suggested statement line item with confidence badge |
| Confidence | 90px | High (green, >85%), Medium (amber, 50-85%), Low (red, <50%) |
| Mapped To | 200px | Dropdown selector for financial statement line item |
| Statement | 120px | Auto-populated: IS, BS, CF, EQ |
| Actions | 80px | Accept (check), Edit (pencil), History (clock) |

**AI Suggestion Detail** (inline expansion on row click or hover):
- "AI suggests: Revenue -- Product Sales"
- Reasoning: "Account name 'Product Revenue - Enterprise' matches pattern. Prior period mapped to same line. 98% confidence."
- "Accept" green button | "Edit" to pick different line | "Override with..." dropdown

**Bulk Actions Bar** (appears when checkboxes selected):
- "Accept all selected AI suggestions" primary button
- "Map selected to..." dropdown
- "X selected" counter
- "Clear selection"

**Financial Statement Line Item Selector** (dropdown/modal):
- Hierarchical dropdown organized by statement:
  - Income Statement
    - Revenue
      - Product Revenue
      - Service Revenue
      - Other Revenue
    - Cost of Goods Sold
      - Direct Materials
      - Direct Labor
      - Manufacturing Overhead
    - Operating Expenses
      - Selling, General & Administrative
      - Research & Development
      - Depreciation & Amortization
    - Other Income/Expense
      - Interest Income
      - Interest Expense
      - Other Income
      - Other Expense
    - Tax Provision
  - Balance Sheet
    - Current Assets
      - Cash and Cash Equivalents
      - Accounts Receivable
      - Inventory
      - Prepaid Expenses
      - Other Current Assets
    - Non-Current Assets
      - Property, Plant & Equipment
      - Intangible Assets
      - Goodwill
      - Other Non-Current Assets
    - Current Liabilities
      - Accounts Payable
      - Accrued Liabilities
      - Current Portion of Long-Term Debt
      - Deferred Revenue (Current)
      - Other Current Liabilities
    - Non-Current Liabilities
      - Long-Term Debt
      - Deferred Revenue (Non-Current)
      - Deferred Tax Liability
      - Other Non-Current Liabilities
    - Stockholders' Equity
      - Common Stock
      - Additional Paid-In Capital
      - Retained Earnings
      - Accumulated Other Comprehensive Income
  - (Cash Flow and Equity statement mappings derived from BS/IS mappings with override option)
- Search within dropdown
- "Create custom line item" option at bottom (requires approval from CFO for new line items)

**Mapping History Panel** (slide-out on history icon click):
- Shows prior period mappings for this account
- "Account 4100 - Product Revenue"
  - Jan 2026: Mapped to "Revenue -- Product Sales" by AI (accepted by Sarah)
  - Dec 2025: Mapped to "Revenue -- Product Sales" by AI (accepted by Sarah)
  - Nov 2025: Mapped to "Revenue -- Product Sales" by Sarah (manual, first close)

#### Actions
- Accept individual AI suggestions (check icon)
- Edit individual mappings (dropdown)
- Bulk accept all high-confidence suggestions
- Bulk accept selected suggestions
- Search and filter accounts
- View mapping history
- Create custom line items (with CFO approval requirement)
- "Accept all high confidence" batch button (processes all >85% in one click)
- "Run AI mapping" button (re-runs AI on unmapped accounts)

#### Decisions (per account)
- Accept AI suggestion or override?
- For low-confidence: which statement line item is correct?
- For new accounts (not in prior period): what is this account?
- For ambiguous accounts (e.g., "Miscellaneous"): requires Sarah's judgment

#### Navigation Trigger
- "Proceed to Reconciliation" button (bottom right, enabled when all accounts mapped)
- Sidebar navigation always available

#### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Unmapped accounts remaining | "Proceed" button disabled, tooltip: "25 accounts still need mapping" | Filter to unmapped |
| AI service unavailable | Amber banner: "AI mapping suggestions temporarily unavailable. You can map accounts manually." | Manual mapping still works |
| Custom line item creation failure | Toast: "Unable to create line item. Try again." | Retry |
| Mapping conflict (two accounts to same line with opposite expectations) | Amber inline warning on affected rows | Sarah resolves manually |

#### API Data Requirements
- `GET /sessions/{sessionId}/account-mapping` -- returns all accounts with current mappings, AI suggestions, confidence scores
- Query params: `?status=`, `?search=`, `?statement=`, `?sort=`
- `PUT /sessions/{sessionId}/account-mapping/{accountId}` -- update single mapping
- `PUT /sessions/{sessionId}/account-mapping/bulk` -- bulk update mappings (array of {accountId, lineItemId})
- `POST /sessions/{sessionId}/account-mapping/accept-ai` -- accept all high-confidence AI suggestions
- `GET /sessions/{sessionId}/account-mapping/{accountId}/history` -- mapping history for one account
- `GET /financial-statement-line-items` -- returns hierarchical line item taxonomy
- `POST /financial-statement-line-items` -- create custom line item (requires CFO approval flag)

#### Loading State
- Progress bar: skeleton
- Table: 15 skeleton rows

#### Empty State
- If no GL uploaded: redirect to GL Upload
- If GL just uploaded and AI is still processing: "AI is analyzing your accounts and generating mapping suggestions. This typically takes 30-60 seconds." with spinner

---

### SCREEN 8: RECONCILIATION LIST
**URL**: `/companies/{companyId}/sessions/{sessionId}/reconciliation`
**Time spent**: 5-15 minutes scanning list, then 10-60 minutes in detail screens
**Emotional state**: Methodical, sometimes frustrated when items don't reconcile

**Context**: Only BALANCE SHEET accounts require reconciliation. Income statement accounts flow through. Sarah reconciles cash to bank statements, AR to subledger, AP to subledger, fixed assets to schedules, debt to loan statements, etc. The goal is to verify that every balance sheet account balance is supported by evidence.

#### Layout
- Page title: "Balance Sheet Reconciliation"
- Subtitle: "Reconcile balance sheet accounts with supporting evidence"

**Summary Bar** (sticky):
- Total accounts to reconcile: 45
- Reconciled: 38 (green)
- In progress: 4 (blue)
- Over tolerance: 2 (red)
- Not started: 1 (gray)
- Total unreconciled amount: $52,341.89 (red if non-zero, green "$0.00" if fully reconciled)

**Filter Bar**:
- Tabs: "All (45)" | "Over Tolerance (2)" | "In Progress (4)" | "Not Started (1)" | "Reconciled (38)"
- Search: "Search accounts..."
- Sort: "By status" | "By balance (largest first)" | "By account number"

**Reconciliation Table**:
| Column | Width | Notes |
|--------|-------|-------|
| Account Number | 100px | |
| Account Name | 200px | |
| GL Balance | 130px | Right-aligned, from trial balance |
| Reconciled Balance | 130px | Right-aligned, sum of reconciling items |
| Difference | 120px | Right-aligned. Green $0, amber within tolerance, red over tolerance |
| Tolerance | 80px | Configurable per account (default: $100 or 0.5% of balance, whichever is greater) |
| Status | 100px | Pill: Reconciled (green), In Progress (blue), Over Tolerance (red), Not Started (gray) |
| Method | 100px | Pill: Bank Match, Subledger, Schedule, Manual, N/A |
| Evidence | 60px | Paperclip icon with count of attached documents |
| Actions | 80px | "Open" button |

- Rows sorted by status (Over Tolerance first, then In Progress, Not Started, Reconciled)
- Row click opens reconciliation detail

**Tolerance Configuration** (gear icon in header):
- Modal to set default and per-account tolerances
- Default tolerance: $100 or 0.5% of balance (whichever greater)
- Per-account overrides table
- "Apply to all future periods" checkbox

#### Actions
- Click row to open reconciliation detail
- Filter and search
- Configure tolerances
- Export reconciliation summary
- "Mark N/A" for accounts that don't require reconciliation (e.g., retained earnings flows from equity statement)
- Bulk upload supporting documents

#### Decisions
- Which accounts to reconcile first (usually largest balances and over-tolerance items)
- Whether tolerance thresholds are appropriate
- Which accounts can be marked N/A

#### Navigation Trigger
- Row click goes to `/sessions/{sessionId}/reconciliation/{accountId}`
- "Proceed to Adjustments" button (enabled when all accounts reconciled or N/A)

#### API Data Requirements
- `GET /sessions/{sessionId}/reconciliation` -- returns all BS accounts with reconciliation status, balances, differences
- `GET /sessions/{sessionId}/reconciliation/summary` -- returns counts by status, total unreconciled
- `PUT /sessions/{sessionId}/reconciliation/tolerances` -- update tolerance settings

#### Loading State
- Summary bar: skeleton numbers
- Table: 12 skeleton rows

#### Empty State
- If no account mapping done: "Complete account mapping first to identify balance sheet accounts."
- If no BS accounts: "No balance sheet accounts found. Review your account mapping."

---

### SCREEN 9: RECONCILIATION DETAIL
**URL**: `/companies/{companyId}/sessions/{sessionId}/reconciliation/{accountId}`
**Time spent**: 2-30 minutes per account (cash accounts take longest due to bank matching)
**Emotional state**: Detective mode -- tracking down every penny

#### Layout
- Breadcrumb: Reconciliation > 1010 - Cash and Cash Equivalents
- Page title: Account name and number
- Status pill and last modified timestamp

**Account Summary Card** (top):
- GL Balance: $4,523,891.23
- Reconciled Balance: $4,473,652.34
- Unreconciled Difference: $50,238.89 (red, over tolerance)
- Tolerance: $500.00
- Prior Period Balance: $4,312,456.78
- Change from Prior: +$211,434.45 (+4.9%)

**Reconciliation workspace** (varies by method):

**METHOD 1: Bank Statement Matching** (for cash accounts)
- Two-panel layout:
  - LEFT panel: "GL Transactions" -- list of GL entries for this account
    - Table: Date | Description | Reference | Amount | Status (Matched/Unmatched)
    - Unmatched items highlighted in amber
  - RIGHT panel: "Bank Statement" -- uploaded or connected bank transactions
    - Upload zone for bank statement (CSV/PDF/OFX)
    - Table: Date | Description | Reference | Amount | Status (Matched/Unmatched)
    - Unmatched items highlighted in amber

- **Auto-match results** (shown after bank statement upload):
  - "Auto-matched 234 of 251 transactions (93%)"
  - Match criteria: exact amount + date within 3 days + fuzzy description match
  - Matched pairs shown with connecting lines or grouped rows

- **Manual match interface**:
  - Click GL transaction, then click bank transaction to create match
  - Multi-select for one-to-many matches (e.g., one GL entry = 3 bank transactions)
  - "Suggest matches" button for AI-assisted matching of remaining items
  - "Mark as timing difference" for items that clear next period
  - "Mark as outstanding" for checks not yet cleared

- **Reconciling Items Section** (below the two panels):
  - Table of items explaining the difference:
    - Outstanding checks: $12,345.67
    - Deposits in transit: $8,234.00
    - Bank fees not yet recorded: $156.22
    - Timing differences: $29,503.00
    - Total reconciling items: $50,238.89
    - Adjusted bank balance: $4,523,891.23 (should match GL)
  - "Add reconciling item" button
  - Each item: editable description, amount, category dropdown

**METHOD 2: Subledger Reconciliation** (for AR, AP)
- Single panel with subledger summary:
  - Upload subledger aging report or connect to ERP subledger
  - Summary: GL Balance vs Subledger Total vs Difference
  - Aging buckets shown: Current | 30 days | 60 days | 90 days | 120+ days
  - Reconciling items: reserves, write-offs, reclassifications

**METHOD 3: Schedule-Based** (for fixed assets, prepaid, debt)
- Upload supporting schedule (depreciation schedule, amortization schedule, loan statement)
- Summary: GL Balance vs Schedule Balance vs Difference
- Line-item detail if schedule is structured

**METHOD 4: Manual** (for other accounts)
- Free-form reconciliation:
  - GL balance shown
  - Table of supporting items with: Description | Amount | Evidence attachment
  - Running total of supporting items
  - Difference calculated

**Evidence Panel** (right sidebar or below):
- List of attached documents with thumbnails
- Upload zone: "Drag files or click to attach evidence"
- Supported: PDF, images, Excel, CSV
- Each document: name, upload date, size, preview on click
- "Required evidence" checklist (configurable): Bank statement, Subledger report, Supporting schedule

**Completion Section** (bottom):
- "Mark as Reconciled" button (enabled only when difference is within tolerance)
- If over tolerance: "Submit with Exception" button (requires written explanation, goes to CFO for approval)
- Explanation text area (required if submitting with exception): "Explain the unreconciled difference..."
- Signoff: "I confirm this account is reconciled and the balance is fairly stated." checkbox

#### Actions
- Upload bank statement and trigger auto-matching
- Manually match transactions
- Add reconciling items
- Attach evidence documents
- Mark timing differences and outstanding items
- Mark as reconciled (within tolerance)
- Submit with exception (over tolerance, requires explanation)
- Navigate to next unreconciled account ("Next" button in header)

#### Decisions
- Is the difference explained by reconciling items?
- Are all reconciling items valid and documented?
- Should over-tolerance items be escalated or can they be resolved?
- Is the evidence sufficient for audit purposes?

#### Navigation Trigger
- "Next Account" button navigates to next unreconciled account
- "Back to List" returns to reconciliation list
- "Mark as Reconciled" returns to list with success toast
- Sidebar navigation always available

#### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Bank statement parse failure | Red banner: "Unable to parse bank statement. Try a different format (CSV recommended)." | Re-upload |
| Auto-match timeout | Amber banner: "Auto-matching is taking longer than expected. You can match manually while it processes." | Background processing continues |
| Document upload failure | Toast: "Failed to upload [filename]. Try again." | Retry |
| Cannot mark reconciled (over tolerance) | Button disabled, tooltip: "Difference ($50,238.89) exceeds tolerance ($500.00). Add reconciling items or submit with exception." | Guide to resolution |
| Concurrent edit | Amber banner: "Another user is viewing this reconciliation." | Real-time sync or lock |

#### API Data Requirements
- `GET /sessions/{sessionId}/reconciliation/{accountId}` -- full reconciliation detail
- `GET /sessions/{sessionId}/reconciliation/{accountId}/gl-transactions` -- paginated GL transactions
- `POST /sessions/{sessionId}/reconciliation/{accountId}/bank-statement` -- upload bank statement
- `GET /sessions/{sessionId}/reconciliation/{accountId}/bank-transactions` -- parsed bank transactions
- `POST /sessions/{sessionId}/reconciliation/{accountId}/auto-match` -- trigger auto-matching
- `PUT /sessions/{sessionId}/reconciliation/{accountId}/matches` -- save manual matches
- `POST /sessions/{sessionId}/reconciliation/{accountId}/reconciling-items` -- add/update reconciling items
- `POST /sessions/{sessionId}/reconciliation/{accountId}/evidence` -- upload evidence document
- `PUT /sessions/{sessionId}/reconciliation/{accountId}/complete` -- mark reconciled
- `PUT /sessions/{sessionId}/reconciliation/{accountId}/submit-exception` -- submit with exception explanation

#### Loading State
- Account summary: skeleton card
- Transaction panels: skeleton table rows
- Evidence panel: skeleton list

#### Empty State
- No bank statement: "Upload a bank statement to begin auto-matching" with upload zone
- No reconciling items: "No reconciling items added. If GL and bank/subledger balances match, mark as reconciled."
- No evidence: "No evidence attached. Attach supporting documents for audit purposes."



---

# SARAH CHEN -- CONTROLLER (continued)
# Screens 10-17: Adjustments through Certification

---

### SCREEN 10: ADJUSTMENTS LIST
**URL**: `/companies/{companyId}/sessions/{sessionId}/adjustments`
**Time spent**: 5-20 minutes managing list, plus time in individual entries
**Emotional state**: Detail-oriented, cautious (adjustments change the numbers)

**Context**: Adjusting journal entries (AJEs) are the corrections and accruals Sarah needs to record that aren't in the GL export. Common types: accrued expenses, prepaid amortization, depreciation, revenue recognition adjustments, intercompany eliminations, inventory reserves, bad debt provisions. Some are routine (same every month with updated amounts), some are non-routine (one-time corrections). All require CFO approval.

#### Layout
- Page title: "Adjusting Entries"
- Subtitle: "February 2026 -- 14 entries totaling $1,234,567.89 net impact"

**Summary Bar** (sticky):
- Total entries: 14
- Approved: 8 (green)
- Pending approval: 3 (amber)
- Rejected: 2 (red)
- Draft: 1 (gray)
- Net impact on net income: -$234,567.89

**Action Bar**:
- "New Adjusting Entry" primary button
- "Apply Templates" secondary button (dropdown showing available templates)
- "Import AJEs" tertiary button (upload AJEs from Excel)
- Filter tabs: "All (14)" | "Pending (3)" | "Rejected (2)" | "Draft (1)" | "Approved (8)"
- Search: "Search by description, account, or JE number..."

**Templates Quick-Apply Section** (collapsible card, shown by default on first visit):
- Title: "Recurring Templates"
- Grid of template cards (created from prior period or configured):
  - "Monthly Depreciation" -- Auto-calculated from fixed asset schedule, $45,678
  - "Prepaid Amortization" -- Monthly straight-line, $12,345
  - "Accrued Payroll" -- Based on payroll calendar, estimated $89,234
  - "Inventory Reserve" -- Based on aging formula, $23,456
  - "Revenue Recognition" -- ASC 606 adjustments, manual amount
- Each card: template name, prior period amount, "Apply" button, "Edit before applying" link
- "Manage Templates" link to template configuration

**Adjusting Entries Table**:
| Column | Width | Notes |
|--------|-------|-------|
| JE Number | 80px | Auto-generated: AJE-2026-02-001 |
| Description | 250px | Truncated with tooltip |
| Type | 100px | Pill: Routine (blue), Non-Routine (purple), Reclassification (teal), Correction (orange) |
| Debit Account(s) | 150px | Account number and name |
| Credit Account(s) | 150px | Account number and name |
| Amount | 120px | Right-aligned, total entry amount |
| P&L Impact | 100px | Net income effect: positive (green), negative (red), zero (gray) |
| Status | 100px | Draft (gray), Pending (amber), Approved (green), Rejected (red) |
| Reviewer | 100px | Avatar/initials of assigned reviewer |
| Actions | 100px | Edit (pencil), Delete (trash, draft only), Resubmit (arrow, rejected only), View (eye, approved) |

- Row click opens entry detail/edit
- Rejected entries have red left border and show rejection reason preview

**Totals Row** (fixed at bottom of table):
- Total debits: $X
- Total credits: $X (must equal debits)
- Net P&L impact: $X

#### Actions
- Create new adjusting entry
- Apply templates (individual or bulk)
- Import from Excel
- Edit draft/rejected entries
- Resubmit rejected entries with revisions
- Delete draft entries
- Filter, search, sort
- Export all AJEs to Excel

#### Decisions
- Which recurring templates to apply (amounts may need updating)
- Whether non-routine entries are needed
- How to address rejected entries (revise or discuss with CFO)
- Whether all necessary adjustments have been captured

#### Navigation Trigger
- "New Adjusting Entry" opens entry form (screen 10a)
- Row click opens entry detail (screen 10a in edit mode)
- "Proceed to Generate Statements" enabled when all entries approved or no entries pending/rejected

#### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Unbalanced entry | Cannot save: "Entry must balance. Debits ($X) do not equal credits ($Y)." | Fix amounts |
| Duplicate JE number | Should not happen (auto-generated) but: "JE number already exists." | Auto-increment |
| Template apply failure | Toast: "Unable to apply template. Template may reference accounts not in current GL." | Edit template or create manual entry |
| Import parse failure | Modal showing errors: "Row 3: Unrecognized account 9999. Row 7: Amount missing." | Fix Excel and re-import |

#### API Data Requirements
- `GET /sessions/{sessionId}/adjustments` -- returns all AJEs with status, accounts, amounts
- `GET /sessions/{sessionId}/adjustments/summary` -- counts by status, net impact
- `GET /sessions/{sessionId}/adjustments/templates` -- available templates for this company
- `POST /sessions/{sessionId}/adjustments` -- create new entry
- `POST /sessions/{sessionId}/adjustments/apply-template/{templateId}` -- apply template
- `POST /sessions/{sessionId}/adjustments/import` -- upload Excel import
- `GET /sessions/{sessionId}/adjustments/export` -- download Excel

#### Loading State
- Summary bar: skeleton numbers
- Table: 8 skeleton rows

#### Empty State
- No adjusting entries and templates available: "No adjusting entries yet. Apply recurring templates or create a new entry."
- No templates available (first close): "No adjusting entries yet. Create your first adjusting entry. You can save entries as templates for future periods."

---

### SCREEN 10a: ADJUSTING ENTRY FORM
**URL**: `/companies/{companyId}/sessions/{sessionId}/adjustments/new` or `.../adjustments/{entryId}`
**Time spent**: 2-10 minutes per entry
**Emotional state**: Careful, precise -- an error here ripples through statements

#### Layout
- Page title: "New Adjusting Entry" or "Edit AJE-2026-02-003"
- If editing rejected entry: red banner showing rejection reason from David: "Rejection reason: Amount seems high for monthly accrual. Please verify against actual payroll data. -- David Park, Mar 5"

**Entry Form**:
- **JE Number**: Auto-generated, read-only (editable for imported entries)
- **Description**: Text input (required), 200 char max. "Monthly depreciation -- all fixed asset classes"
- **Type**: Radio buttons: Routine | Non-Routine | Reclassification | Correction
- **Effective Date**: Date picker, defaults to last day of period (Feb 28, 2026)
- **Reversing Entry**: Toggle. If on: "This entry will auto-reverse on [first day of next period]"
- **Memo / Supporting Detail**: Rich text area for longer explanation, formulas, references

**Entry Lines** (the actual journal entry):
- Table:
  | Line | Account | Description | Debit | Credit |
  |------|---------|-------------|-------|--------|
  | 1 | [Account selector dropdown] | [text] | $45,678.00 | |
  | 2 | [Account selector dropdown] | [text] | | $45,678.00 |
  | + Add line | | | | |
- Account selector: searchable dropdown showing account number + name, filtered to mapped accounts
- Running totals: Total Debits | Total Credits | Difference (red if non-zero)
- "Add line" button adds a new blank row
- Delete icon (X) on each line to remove
- Tab key moves through: Account > Description > Debit > Credit > next line Account

**Attachments**:
- Upload zone: "Attach supporting documentation"
- Common attachments: depreciation schedule, payroll register, invoice copies
- List of attached files with preview capability

**Impact Preview** (real-time, updates as amounts change):
- Card showing:
  - Income Statement impact: +/- $X on net income
  - Balance Sheet accounts affected: list
  - EBITDA impact: +/- $X (highlights if this is an EBITDA add-back candidate)

**Action Buttons** (bottom, sticky):
- "Save as Draft" secondary button
- "Submit for Approval" primary button
- "Save as Template" tertiary button (for recurring entries)
- "Cancel" text link
- If editing rejected entry: "Resubmit for Approval" primary button

#### Actions
- Fill out entry lines
- Attach supporting documents
- Save as draft (no approval needed)
- Submit for approval (sends to CFO queue)
- Save as template for future periods
- Cancel and discard

#### Decisions
- Are the accounts correct?
- Are the amounts accurate?
- Should this be a reversing entry?
- Is the supporting documentation sufficient?
- Ready to submit or save as draft?

#### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Entry not balanced | Inline: "Entry must balance. Difference: $123.45" Submit button disabled. | Fix amounts |
| Account not found | Dropdown shows "No matching accounts" | Check account mapping |
| Missing required fields | Red outline on empty required fields on submit attempt | Fill required fields |
| Amount is zero | Warning: "Line 2 has a zero amount. Remove empty lines before submitting." | Remove or fill |

#### API Data Requirements
- `POST /sessions/{sessionId}/adjustments` -- create new entry
- `PUT /sessions/{sessionId}/adjustments/{entryId}` -- update entry
- `PUT /sessions/{sessionId}/adjustments/{entryId}/submit` -- submit for approval
- `POST /sessions/{sessionId}/adjustments/{entryId}/attachments` -- upload file
- `POST /sessions/{sessionId}/adjustments/templates` -- save as template
- `GET /sessions/{sessionId}/accounts` -- for account selector dropdown

---

### SCREEN 11: GENERATE STATEMENTS
**URL**: `/companies/{companyId}/sessions/{sessionId}/generate`
**Time spent**: 1-3 minutes (mostly waiting for generation)
**Emotional state**: Anticipation -- "moment of truth"

**Context**: This is a confirmation/trigger screen. Sabit generates all four GAAP financial statements plus EBITDA bridge using deterministic arithmetic from the mapped trial balance plus approved adjustments. No AI in the calculation -- pure arithmetic. The generation also runs cross-statement validation checks.

#### Layout
- Page title: "Generate Financial Statements"
- Subtitle: "Review inputs and generate all statements"

**Pre-Generation Checklist** (card):
- Each item is a prerequisite with pass/fail icon:
  - [green check] Trial balance is balanced
  - [green check] All 367 accounts mapped to financial statements
  - [green check] All 45 balance sheet accounts reconciled
  - [green check] All 14 adjusting entries approved
  - [amber warning] Budget data uploaded (optional -- "Skip" or "Upload budget" link)
  - [green check] Prior period data available for comparison
- Summary: "All required prerequisites met. Ready to generate."
- If any required item fails: red text explaining what's missing, with navigation link

**Input Summary** (collapsible card):
- Trial balance: 367 accounts, $145M total activity
- Adjustments: 14 entries, net impact -$234K on net income
- Prior period: January 2026 (certified)
- Budget: Uploaded (or "Not uploaded")

**Generation Options** (card):
- Statement format: "Standard GAAP" (only option for now, future: IFRS)
- Comparative periods: Toggle "Include prior period column" (default on)
- EBITDA bridge: Toggle "Generate EBITDA bridge" (default on)
  - Add-back configuration link: opens modal to configure PE add-backs
- Rounding: "Round to nearest dollar" | "Round to nearest thousand" | "No rounding"
- Cash flow method: "Indirect method" (default, standard for PE reporting)

**EBITDA Add-Back Configuration** (modal from link):
- Table of configurable add-backs:
  | Add-Back Category | Included | Amount | Account(s) |
  |-------------------|----------|--------|------------|
  | Depreciation & Amortization | [x] | Auto-calculated | 6100-6199 |
  | Stock-Based Compensation | [x] | Auto-calculated | 6200-6249 |
  | One-Time Restructuring | [x] | Manual: $125,000 | 6500 |
  | Management Fees | [x] | Auto-calculated | 6300 |
  | Transaction Costs | [ ] | $0 | -- |
  | Non-Cash Rent Adjustment | [ ] | $0 | -- |
  | Owner Compensation Adjustment | [ ] | $0 | -- |
  | Other (custom) | [+] | | |
- Each row: toggle inclusion, amount (auto or manual), linked accounts
- "Add custom add-back" button
- Prior period add-backs shown for comparison
- Save button

**Generate Button** (large, centered):
- "Generate All Statements" primary button
- Disabled with tooltip if prerequisites not met

**Generation Progress** (after clicking generate):
- Progress card replacing the button:
  - Step 1: "Aggregating trial balance data..." [check]
  - Step 2: "Applying adjusting entries..." [check]
  - Step 3: "Generating Income Statement..." [check]
  - Step 4: "Generating Balance Sheet..." [spinner]
  - Step 5: "Generating Cash Flow Statement..." [pending]
  - Step 6: "Generating Statement of Equity..." [pending]
  - Step 7: "Generating EBITDA Bridge..." [pending]
  - Step 8: "Running cross-statement validation..." [pending]
  - Step 9: "Calculating variances..." [pending]
- Total time: typically 5-15 seconds
- Cancel button (rare use)

**Generation Complete**:
- Green success banner: "All statements generated successfully."
- Or amber warning: "Statements generated with 2 validation warnings."
- Validation results card:
  - [green] Assets = Liabilities + Equity (BS balanced)
  - [green] Net income flows from IS to Retained Earnings
  - [green] Cash flow reconciles: Beginning cash + net cash = Ending cash
  - [green] EBITDA bridge reconciles to operating income
  - [amber] Revenue change >10% vs prior period -- review recommended
  - Each item clickable to navigate to relevant statement
- "Review Statements" primary button
- "Regenerate" secondary button (if changes needed)

#### Actions
- Review prerequisites
- Configure EBITDA add-backs
- Set generation options
- Generate statements
- Review validation results
- Navigate to statement review

#### Decisions
- Are EBITDA add-backs configured correctly?
- Are generation options correct (rounding, comparatives)?
- Do validation results look right?

#### Navigation Trigger
- "Review Statements" goes to Income Statement (first statement in sequence)
- Validation item clicks go to specific statements

#### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Prerequisites not met | Checklist shows red items, generate button disabled | Fix missing items |
| Generation failure | Red banner: "Statement generation failed. Error in [specific step]." | Retry, or contact support |
| Cross-statement validation failure (hard) | Red banner: "Critical: Balance sheet does not balance. Assets ($X) != Liabilities + Equity ($Y). This indicates a mapping error." | Link to account mapping |
| Timeout | Amber banner: "Generation is taking longer than expected. Please wait or refresh." | Auto-retry |

#### API Data Requirements
- `GET /sessions/{sessionId}/generate/prerequisites` -- returns checklist items with pass/fail
- `GET /sessions/{sessionId}/ebitda-config` -- returns add-back configuration
- `PUT /sessions/{sessionId}/ebitda-config` -- update add-back configuration
- `POST /sessions/{sessionId}/generate` -- trigger generation, returns job ID
- `GET /sessions/{sessionId}/generate/{jobId}/status` -- poll generation progress
- `GET /sessions/{sessionId}/generate/validation` -- returns validation results

---

### SCREEN 12: INCOME STATEMENT REVIEW
**URL**: `/companies/{companyId}/sessions/{sessionId}/statements/income-statement`
**Time spent**: 3-10 minutes
**Emotional state**: Analytical -- comparing to expectations and prior period

#### Layout
- Page title: "Income Statement"
- Subtitle: "For the month ended February 28, 2026"
- Statement tab bar: **Income Statement** | Balance Sheet | Cash Flow | Equity | EBITDA Bridge

**Statement Header**:
- Company name: "[Company Name]"
- Statement title: "Consolidated Statement of Income"
- Period: "For the Month Ended February 28, 2026" and "Year-to-Date"
- Comparative: "With Comparative Period Ended January 31, 2026"
- Generated timestamp: "Generated Mar 5, 2026 at 2:34 PM"

**Column Headers** (across):
| Current Month | Prior Month | Change ($) | Change (%) | YTD Current | YTD Prior Year | YTD Change ($) | YTD Change (%) |

**Statement Body** (standard multi-step income statement):
```
Revenue
  Product Revenue                    $XX,XXX    $XX,XXX    $X,XXX    X.X%
  Service Revenue                    $XX,XXX    $XX,XXX    $X,XXX    X.X%
  Other Revenue                      $XX,XXX    $XX,XXX    $X,XXX    X.X%
                                    --------   --------
Total Revenue                       $XX,XXX    $XX,XXX    $X,XXX    X.X%

Cost of Goods Sold
  Direct Materials                   $XX,XXX    ...
  Direct Labor                       $XX,XXX    ...
  Manufacturing Overhead             $XX,XXX    ...
                                    --------
Total COGS                          $XX,XXX    ...

GROSS PROFIT                        $XX,XXX    ...         ...       XX.X%
Gross Margin                         XX.X%      XX.X%

Operating Expenses
  Selling, General & Administrative  $XX,XXX    ...
  Research & Development             $XX,XXX    ...
  Depreciation & Amortization        $XX,XXX    ...
                                    --------
Total Operating Expenses            $XX,XXX    ...

OPERATING INCOME (EBIT)             $XX,XXX    ...         ...       XX.X%
Operating Margin                     XX.X%      XX.X%

Other Income / (Expense)
  Interest Income                    $XX,XXX    ...
  Interest Expense                  ($XX,XXX)   ...
  Other Income / (Expense)           $XX,XXX    ...
                                    --------
Total Other Income / (Expense)      $XX,XXX    ...

INCOME BEFORE TAXES                 $XX,XXX    ...
  Income Tax Provision              ($XX,XXX)   ...

NET INCOME                          $XX,XXX    ...         ...       XX.X%
Net Margin                           XX.X%      XX.X%
```

**Formatting**:
- Negative numbers in parentheses: ($1,234)
- Subtotal lines have top border (single line) and bold text
- Total lines have double top border and bold text
- Margin percentages shown in lighter gray text
- Variance columns: green for favorable, red for unfavorable (relative to line type -- revenue increase = green, expense increase = red)
- Material variances (>5% or >$50K) have amber highlight on the cell with clickable variance flag icon

**Row Interactions**:
- Hover on any line item: light blue background
- Click any line item: expands to show underlying GL accounts with individual balances
  - Expanded view shows: Account Number | Account Name | Current Balance | Prior Balance | AJE Impact
  - Click individual account: navigates to that account's trial balance detail
- Click variance flag icon: navigates to variance analysis for that line item
- Right-click: "Drill to GL detail", "Add note", "Flag for review"

**Statement Actions** (top right toolbar):
- "Export" dropdown: PDF | Excel | CSV
- "Print" button
- "Add Note" button (adds annotation visible to reviewers)
- "Compare to Budget" toggle (adds budget column if budget uploaded)
- Column visibility: checkboxes for which columns to show/hide
- Zoom: increase/decrease font size for readability

**Notes Panel** (collapsible, right side or bottom):
- List of notes/annotations added to specific line items
- Each note: line item reference, note text, author, timestamp
- "Add note" for general statement notes

#### Actions
- Drill into any line item to see underlying accounts
- Click variance flags to navigate to variance analysis
- Export statement in various formats
- Add annotations for reviewer
- Toggle budget comparison columns
- Navigate between statement tabs

#### Decisions
- Do the numbers make sense? Are there unexpected results?
- Which variances need investigation?
- Are there annotations needed for the reviewer?

#### Navigation Trigger
- Tab bar to switch between statements
- Variance flag click goes to variance analysis
- "Next: Balance Sheet" button (bottom right)

#### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Statements not generated | Redirect to Generate screen with message | Generate statements |
| Stale statements (AJEs changed after generation) | Amber banner: "Statements may be outdated. Adjusting entries were modified after last generation. Regenerate?" | "Regenerate" button |

#### API Data Requirements
- `GET /sessions/{sessionId}/statements/income-statement` -- returns full structured statement with all line items, amounts, comparisons, variances, materiality flags
- `GET /sessions/{sessionId}/statements/income-statement/drill/{lineItemId}` -- returns underlying GL accounts for a line item
- `GET /sessions/{sessionId}/statements/income-statement/export?format=pdf` -- export
- `GET /sessions/{sessionId}/statements/income-statement/notes` -- annotations
- `POST /sessions/{sessionId}/statements/income-statement/notes` -- add annotation

---

### SCREEN 13: BALANCE SHEET REVIEW
**URL**: `/companies/{companyId}/sessions/{sessionId}/statements/balance-sheet`
**Time spent**: 3-8 minutes
**Emotional state**: Verification -- "does it balance?"

#### Layout
- Same structural template as Income Statement with tab bar, export tools, drill-down capability

**Statement Body** (classified balance sheet):
```
ASSETS
Current Assets
  Cash and Cash Equivalents          $X,XXX,XXX    $X,XXX,XXX
  Accounts Receivable, net           $X,XXX,XXX    ...
  Inventory                          $X,XXX,XXX    ...
  Prepaid Expenses                   $X,XXX,XXX    ...
  Other Current Assets               $X,XXX,XXX    ...
                                    ----------
Total Current Assets                $XX,XXX,XXX    ...

Non-Current Assets
  Property, Plant & Equipment, net   $X,XXX,XXX    ...
  Intangible Assets, net             $X,XXX,XXX    ...
  Goodwill                           $X,XXX,XXX    ...
  Other Non-Current Assets           $X,XXX,XXX    ...
                                    ----------
Total Non-Current Assets            $XX,XXX,XXX    ...

TOTAL ASSETS                       $XXX,XXX,XXX    ...

LIABILITIES AND STOCKHOLDERS' EQUITY
Current Liabilities
  Accounts Payable                   $X,XXX,XXX    ...
  Accrued Liabilities                $X,XXX,XXX    ...
  Current Portion of LTD             $X,XXX,XXX    ...
  Deferred Revenue                   $X,XXX,XXX    ...
  Other Current Liabilities          $X,XXX,XXX    ...
                                    ----------
Total Current Liabilities           $XX,XXX,XXX    ...

Non-Current Liabilities
  Long-Term Debt                    $XX,XXX,XXX    ...
  Deferred Tax Liability             $X,XXX,XXX    ...
  Other Non-Current Liabilities      $X,XXX,XXX    ...
                                    ----------
Total Non-Current Liabilities       $XX,XXX,XXX    ...

Total Liabilities                   $XX,XXX,XXX    ...

Stockholders' Equity
  Common Stock                       $X,XXX,XXX    ...
  Additional Paid-In Capital         $X,XXX,XXX    ...
  Retained Earnings                  $X,XXX,XXX    ...
  AOCI                               $X,XXX,XXX    ...
                                    ----------
Total Stockholders' Equity          $XX,XXX,XXX    ...

TOTAL LIABILITIES & EQUITY        $XXX,XXX,XXX    ...
```

**Balance Check Banner** (always visible at top of statement):
- Green: "Balanced -- Total Assets ($XXX,XXX,XXX) = Total Liabilities & Equity ($XXX,XXX,XXX)"
- Red: "UNBALANCED -- Total Assets ($XXX,XXX,XXX) != Total Liabilities & Equity ($XXX,XXX,XXX). Difference: $X,XXX" with "Investigate" button

**Additional Metrics** (below statement):
- Current Ratio: X.X
- Quick Ratio: X.X
- Debt-to-Equity: X.X
- Working Capital: $X,XXX,XXX
- Compared to prior period and covenant thresholds if configured

**Reconciliation Status Indicators** (per line item):
- Each balance sheet line item shows a small icon: green check (reconciled), amber warning (reconciled with exception), no icon (N/A)
- Click icon navigates to reconciliation detail for that account group

#### All other interactions, error states, API patterns follow same structure as Income Statement.

#### API Data Requirements
- `GET /sessions/{sessionId}/statements/balance-sheet` -- full structured statement
- Same drill-down, export, and note patterns as income statement
- `GET /sessions/{sessionId}/statements/balance-sheet/metrics` -- calculated ratios

---

### SCREEN 14: CASH FLOW STATEMENT REVIEW
**URL**: `/companies/{companyId}/sessions/{sessionId}/statements/cash-flow`
**Time spent**: 3-8 minutes
**Emotional state**: Analytical -- cash flow is where PE partners focus

#### Statement Body (indirect method):
```
CASH FLOWS FROM OPERATING ACTIVITIES
  Net Income                                      $X,XXX,XXX
  Adjustments for non-cash items:
    Depreciation & Amortization                    $X,XXX,XXX
    Stock-Based Compensation                         $XXX,XXX
    Deferred Income Taxes                            $XXX,XXX
    Other non-cash items                             $XXX,XXX
  Changes in working capital:
    (Increase)/Decrease in Accounts Receivable     ($XXX,XXX)
    (Increase)/Decrease in Inventory               ($XXX,XXX)
    (Increase)/Decrease in Prepaid Expenses          $XXX,XXX
    Increase/(Decrease) in Accounts Payable          $XXX,XXX
    Increase/(Decrease) in Accrued Liabilities       $XXX,XXX
    Increase/(Decrease) in Deferred Revenue          $XXX,XXX
                                                  ----------
Net Cash from Operating Activities                $X,XXX,XXX

CASH FLOWS FROM INVESTING ACTIVITIES
  Purchases of PP&E                              ($X,XXX,XXX)
  Proceeds from asset sales                          $XXX,XXX
  Acquisitions, net of cash                      ($X,XXX,XXX)
  Other investing activities                         $XXX,XXX
                                                  ----------
Net Cash from Investing Activities               ($X,XXX,XXX)

CASH FLOWS FROM FINANCING ACTIVITIES
  Proceeds from debt                              $X,XXX,XXX
  Repayment of debt                              ($X,XXX,XXX)
  Debt issuance costs                              ($XXX,XXX)
  Equity contributions                               $XXX,XXX
  Distributions                                  ($X,XXX,XXX)
                                                  ----------
Net Cash from Financing Activities               ($X,XXX,XXX)

Net Change in Cash                                $X,XXX,XXX
Beginning Cash Balance                            $X,XXX,XXX
                                                  ----------
ENDING CASH BALANCE                              $X,XXX,XXX
```

**Cash Reconciliation Check** (banner):
- Green: "Cash reconciles. Ending cash ($X) matches Balance Sheet cash ($X)."
- Red: "Cash does not reconcile. Statement ending cash ($X) vs BS cash ($X). Difference: $X."

**Free Cash Flow Supplement** (below statement):
- Operating cash flow - CapEx = Free Cash Flow
- FCF margin
- Comparison to prior period

#### API Data Requirements
- `GET /sessions/{sessionId}/statements/cash-flow` -- full structured statement
- Same patterns as other statements

---

### SCREEN 15: STATEMENT OF EQUITY REVIEW
**URL**: `/companies/{companyId}/sessions/{sessionId}/statements/equity`
**Time spent**: 1-3 minutes
**Emotional state**: Quick check -- equity statement is usually straightforward

#### Statement Body (tabular rollforward):
```
                        Common    APIC      Retained    AOCI      Total
                        Stock               Earnings
Beginning Balance       $XXX      $XXX      $XXX        $XXX      $XXX
  Net Income            --        --        $XXX        --        $XXX
  Other Comprehensive   --        --        --          $XXX      $XXX
  Stock Compensation    --        $XXX      --          --        $XXX
  Distributions         --        --       ($XXX)       --       ($XXX)
  Other                 --        --        $XXX        --        $XXX
                       ------    ------    ------      ------    ------
Ending Balance          $XXX      $XXX      $XXX        $XXX      $XXX
```

**Validation Check**:
- Net income from IS matches retained earnings change
- Ending equity matches balance sheet total equity

#### API Data Requirements
- `GET /sessions/{sessionId}/statements/equity` -- full structured statement

---

### SCREEN 16: EBITDA BRIDGE REVIEW
**URL**: `/companies/{companyId}/sessions/{sessionId}/statements/ebitda-bridge`
**Time spent**: 5-15 minutes (PE partners care deeply about this)
**Emotional state**: High stakes -- this is what the PE firm uses for valuation

#### Layout
- Page title: "EBITDA Bridge"
- Subtitle: "Adjusted EBITDA Reconciliation -- February 2026"

**Visual Bridge Chart** (waterfall chart):
- Horizontal waterfall showing:
  - Starting point: Net Income ($X,XXX,XXX) [blue bar]
  - + Interest Expense ($XXX,XXX) [green bar going up]
  - + Income Taxes ($XXX,XXX) [green bar]
  - + Depreciation & Amortization ($XXX,XXX) [green bar]
  - = EBITDA ($X,XXX,XXX) [subtotal bar, darker blue]
  - + Add-backs (individual bars per configured add-back):
    - Stock-Based Compensation ($XXX,XXX) [green]
    - One-Time Restructuring ($XXX,XXX) [green]
    - Management Fees ($XXX,XXX) [green]
    - Non-Recurring Legal ($XXX,XXX) [green]
  - = Adjusted EBITDA ($X,XXX,XXX) [total bar, dark blue/green]
- Each bar labeled with amount and percentage of revenue
- Hover on bar: tooltip with detail and source accounts
- Click on bar: drill to underlying GL accounts

**Tabular Detail** (below chart):
| Line Item | Current Month | Prior Month | Change | YTD | LTM |
|-----------|--------------|-------------|--------|-----|-----|
| Net Income | $X,XXX | $X,XXX | X.X% | $X,XXX | $X,XXX |
| + Interest | $XXX | $XXX | ... | ... | ... |
| + Taxes | $XXX | ... | ... | ... | ... |
| + D&A | $XXX | ... | ... | ... | ... |
| **EBITDA** | **$X,XXX** | **$X,XXX** | **X.X%** | **$X,XXX** | **$X,XXX** |
| + Add-back 1 | $XXX | ... | ... | ... | ... |
| + Add-back 2 | $XXX | ... | ... | ... | ... |
| **Adjusted EBITDA** | **$X,XXX** | **$X,XXX** | **X.X%** | **$X,XXX** | **$X,XXX** |

**Key Metrics** (cards below table):
- EBITDA Margin: XX.X% (vs prior: XX.X%)
- Adjusted EBITDA Margin: XX.X%
- LTM Adjusted EBITDA: $XX,XXX,XXX (critical for PE valuation)
- Revenue Multiple (if configured): X.Xx
- EBITDA Multiple (if configured): X.Xx

**Add-Back Detail** (expandable per add-back):
- Click any add-back line: shows underlying journal entries, GL accounts, and supporting documents
- "Edit add-back" link to modify configuration (goes back to Generate screen config modal)

**Reconciliation Check** (banner):
- Green: "EBITDA bridge reconciles to Income Statement operating income."
- Red: "EBITDA bridge does not reconcile. Difference: $X. Check add-back configuration."

#### Actions
- Drill into any bridge component
- Export bridge (PDF/Excel)
- Edit add-back configuration (links to generate screen)
- Toggle between monthly, quarterly, YTD, LTM views
- Add annotations for reviewer

#### API Data Requirements
- `GET /sessions/{sessionId}/statements/ebitda-bridge` -- full bridge data with all components
- `GET /sessions/{sessionId}/statements/ebitda-bridge/trend` -- monthly trend data for sparklines
- Same drill-down patterns as other statements

---

### SCREEN 17: BUDGET COMPARISON
**URL**: `/companies/{companyId}/sessions/{sessionId}/budget-comparison`
**Time spent**: 5-15 minutes
**Emotional state**: Explanatory -- "why did we miss/beat budget?"

#### Layout
- Page title: "Actual vs Budget Comparison"
- Subtitle: "February 2026"

**Budget Upload** (if no budget uploaded):
- Upload zone: "Upload your budget file (CSV or Excel)"
- Template download link
- Expected format: Account Number | Account Name | Budget Amount (monthly)
- Or: Annual budget with monthly breakdown

**Comparison Table** (if budget exists):
| Line Item | Actual | Budget | Variance ($) | Variance (%) | Favorable? | YTD Actual | YTD Budget | YTD Var |
|-----------|--------|--------|-------------|-------------|------------|-----------|-----------|---------|
- Organized by financial statement line items (same hierarchy as IS)
- Color coding: green for favorable variance, red for unfavorable
- Material variances (configurable threshold, default >5% or >$25K) highlighted with amber background
- Click any row to drill into underlying accounts

**Variance Summary Card** (top):
- Revenue: $X actual vs $X budget (X% over/under)
- EBITDA: $X actual vs $X budget (X% over/under)
- Net Income: $X actual vs $X budget (X% over/under)
- CapEx: $X actual vs $X budget

**Visualization**:
- Toggle: Table view | Chart view
- Chart view: grouped bar chart showing Actual vs Budget by major category

#### Actions
- Upload/replace budget
- Drill into line items
- Export comparison
- Toggle table/chart view
- Flag variances for explanation (links to variance analysis)

#### API Data Requirements
- `POST /sessions/{sessionId}/budget/upload` -- upload budget file
- `GET /sessions/{sessionId}/budget-comparison` -- full comparison data
- `GET /sessions/{sessionId}/budget-comparison/summary` -- key metrics
- `GET /sessions/{sessionId}/budget-comparison/export`

---

### SCREEN 18: VARIANCE ANALYSIS
**URL**: `/companies/{companyId}/sessions/{sessionId}/variance-analysis`
**Time spent**: 15-45 minutes (the most intellectually demanding screen)
**Emotional state**: Analytical pressure -- must explain every material variance credibly

**Context**: This is where Sarah must explain why numbers changed. PE firms and auditors expect clear, defensible variance explanations. Sabit AI drafts IRAC-format explanations (Issue, Rule, Analysis, Conclusion) that Sarah reviews and edits.

#### Layout
- Page title: "Variance Analysis"
- Subtitle: "Material variances requiring explanation"

**Summary Bar**:
- Total material variances: 8
- Explained: 5 (green)
- AI draft ready for review: 2 (blue)
- Unexplained: 1 (red)
- Full-year impact projected: $2.3M

**Variance Table**:
| Column | Width | Notes |
|--------|-------|-------|
| Line Item | 200px | Financial statement line item |
| Current | 120px | Current period amount |
| Comparison | 120px | Prior period or budget amount |
| Variance ($) | 110px | Dollar change |
| Variance (%) | 80px | Percentage change |
| Materiality | 80px | "Material" (red) or "Immaterial" (gray) |
| Full-Year Impact | 120px | Projected annualized impact |
| Explanation Status | 120px | Explained (green), AI Draft (blue), Unexplained (red), Rejected (orange) |
| Actions | 80px | Edit, View, Accept AI |

- Only material variances shown by default (toggle to show all)
- Sorted by absolute variance amount descending
- Row click opens variance detail

**Materiality Threshold Configuration** (gear icon):
- Absolute threshold: $50,000 (default)
- Percentage threshold: 5% (default)
- Logic: material if EITHER threshold exceeded
- PE-specific overrides: EBITDA line items have lower threshold ($25,000 or 2%)

---

### SCREEN 18a: VARIANCE DETAIL / EXPLANATION
**URL**: `/companies/{companyId}/sessions/{sessionId}/variance-analysis/{varianceId}`
**Time spent**: 3-10 minutes per variance
**Emotional state**: Thinking hard, crafting narrative

#### Layout
- Breadcrumb: Variance Analysis > Revenue -- Product Sales
- Title: Line item name with variance amount and percentage

**Variance Summary Card**:
- Current: $12,345,678
- Prior: $11,890,432
- Variance: +$455,246 (+3.8%)
- Budget: $12,100,000 (if budget uploaded)
- Budget variance: +$245,678 (+2.0%)
- Full-year impact (annualized): +$5,462,952
- Trend sparkline: 6-month trend for this line item

**AI-Drafted Explanation** (card with blue AI indicator):
- Title: "AI-Generated Explanation (IRAC Format)"
- Badge: "AI Draft -- Review Required"

```
ISSUE:
Product revenue increased by $455,246 (3.8%) compared to prior month,
exceeding both the prior period and budget by 2.0%.

RULE:
Revenue recognition follows ASC 606. Product revenue is recognized at
point of delivery for hardware and ratably for subscription components.

ANALYSIS:
The increase is primarily driven by:
1. Enterprise segment new customer wins: 3 new contracts totaling $280K
   in monthly recurring revenue, commencing February 2026.
2. Seasonal uplift in Q1 consistent with historical pattern (Feb avg
   +3.2% over prior 3 years).
3. Price increase effective Jan 1, 2026 (+2.5%) contributing approximately
   $175K monthly impact.

Partially offset by:
- Churn of 2 mid-market accounts ($45K combined monthly impact)

CONCLUSION:
The variance is favorable and primarily driven by organic growth through
new customer acquisition and contractual price increases. The trend is
expected to continue through Q1 with full-year projected impact of +$5.5M
on revenue. No concerns regarding revenue recognition or unusual items.
```

- Source indicators: which data the AI used (GL accounts, prior periods, contracts from notes)

**Sarah's Actions on AI Draft**:
- "Accept as-is" green button (accepts AI draft verbatim)
- "Edit and accept" opens rich text editor pre-filled with AI draft
- "Reject and write manually" clears AI draft, opens blank editor
- "Request new AI draft" button (regenerates with different parameters)

**Manual Explanation Editor** (if editing or writing manually):
- Rich text editor with IRAC section headers pre-populated
- Character count and minimum length indicator (minimum 200 characters)
- "Attach evidence" button for supporting documents
- "Link to GL accounts" -- select specific accounts that drive the variance

**Drill-Down Data** (below explanation):
- Table of underlying GL accounts contributing to this variance:
  | Account | Current | Prior | Change | % of Total Variance |
  |---------|---------|-------|--------|-------------------|
  | 4100 - Enterprise Product Revenue | $8.2M | $7.8M | +$400K | 88% |
  | 4110 - Mid-Market Product Revenue | $3.1M | $3.1M | -$0K | 0% |
  | 4120 - SMB Product Revenue | $1.0M | $0.9M | +$55K | 12% |

**Approval Status** (after submission):
- "Submitted for review" (amber) or "Approved by David Park" (green) or "Rejected: [reason]" (red)

#### Actions
- Accept, edit, or reject AI draft
- Write manual explanation
- Attach evidence
- Link to specific GL accounts
- Submit explanation for review
- Navigate to next unexplained variance

#### API Data Requirements
- `GET /sessions/{sessionId}/variance-analysis/{varianceId}` -- variance detail with AI draft
- `POST /sessions/{sessionId}/variance-analysis/{varianceId}/ai-draft` -- regenerate AI draft
- `PUT /sessions/{sessionId}/variance-analysis/{varianceId}/explanation` -- save explanation
- `PUT /sessions/{sessionId}/variance-analysis/{varianceId}/submit` -- submit for review
- `GET /sessions/{sessionId}/variance-analysis/{varianceId}/drill-down` -- underlying accounts

---

### SCREEN 19: SUBMIT FOR REVIEW
**URL**: `/companies/{companyId}/sessions/{sessionId}/submit`
**Time spent**: 2-5 minutes
**Emotional state**: Relief mixed with anxiety -- handing off to the CFO

#### Layout
- Page title: "Submit for CFO Review"
- Subtitle: "February 2026 Monthly Close"

**Final Gate Checklist** (comprehensive, all must pass):
- [green] Trial balance is balanced
- [green] All accounts mapped (367/367)
- [green] All balance sheet accounts reconciled (45/45, 2 with approved exceptions)
- [green] All adjusting entries approved (14/14)
- [green] Income statement generated and validated
- [green] Balance sheet generated and balanced
- [green] Cash flow statement reconciles to balance sheet
- [green] Statement of equity reconciles
- [green] EBITDA bridge reconciles to income statement
- [green] All material variances explained (8/8)
- [amber] Budget comparison reviewed (optional)
- Summary: "10 of 10 required gates passing. 1 optional item pending."

**Close Package Summary** (what David will receive):
- Card listing all deliverables:
  - Income Statement (current month + YTD, with comparatives)
  - Balance Sheet (with comparatives)
  - Cash Flow Statement
  - Statement of Stockholders' Equity
  - EBITDA Bridge with Add-backs
  - Budget Comparison (if applicable)
  - 8 Variance Explanations
  - 45 Reconciliation Summaries
  - 14 Approved Adjusting Entries
  - Supporting Evidence (47 documents attached)

**Submission Note** (optional):
- Text area: "Add a note for the reviewer (optional)"
- Placeholder: "Any context David should know about this close? Unusual items, areas of focus..."

**Submission Confirmation**:
- "Submit for Review" primary button (large)
- Warning text: "Once submitted, you cannot make changes unless the reviewer sends it back."
- Checkbox: "I confirm that I have reviewed all financial statements and the data is complete and accurate to the best of my knowledge."

**After Submission**:
- Green success page: "Close package submitted for review"
- "David Park has been notified and will review the package."
- "You will be notified when the review is complete or if changes are needed."
- Estimated review time based on David's historical pattern: "David typically reviews within 24 hours."
- Link to view the submitted package (read-only)
- Link to return to dashboard

#### Actions
- Review final checklist
- Add submission note
- Confirm and submit
- View submitted package (read-only)

#### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Gates not passing | Submit button disabled with list of failing gates | Fix each failing gate |
| Submission failure | Toast: "Unable to submit. Try again." | Retry |
| Session already submitted | Banner: "This close has already been submitted for review on [date]." | View submission |

#### API Data Requirements
- `GET /sessions/{sessionId}/submit/gates` -- all gate checks with pass/fail
- `GET /sessions/{sessionId}/submit/package-summary` -- summary of deliverables
- `POST /sessions/{sessionId}/submit` -- submit for review with optional note
- Triggers notification to David

---

### SCREEN 20: WAITING / POST-SUBMISSION
**URL**: `/companies/{companyId}/sessions/{sessionId}/dashboard` (same dashboard, different state)
**Time spent**: Checking periodically until David reviews
**Emotional state**: Waiting, checking email/notifications

#### Layout Changes from Normal Dashboard
- Status pill: "In Review" (amber)
- "Submitted for review on Mar 5, 2026 at 4:23 PM"
- "Reviewer: David Park"
- All editing disabled -- read-only mode
- Banner: "This close is under review. You will be notified of the outcome."
- Activity feed shows: "Submitted for review by Sarah Chen -- 2 hours ago"

**If David sends back with feedback**:
- Status changes to "Changes Requested" (red)
- Red banner: "Changes requested by David Park on Mar 6, 2026"
- Feedback card showing David's comments:
  - General comment: "Revenue variance explanation needs more detail on new customer contracts."
  - Specific item rejections:
    - "Variance #3 (Revenue): Rejected -- Please include specific contract references"
    - "AJE-007 (Accrued bonus): Rejected -- Amount changed since last discussion, please verify"
- Each rejected item has a "Go to item" link
- "Mark as addressed" checkbox for each feedback item
- "Resubmit for Review" button (enabled when all feedback addressed)

**If David certifies**:
- Status changes to "Certified" (green)
- Green banner with confetti animation (subtle): "This close has been certified by David Park on Mar 6, 2026"
- Certification details:
  - Certified by: David Park, CFO
  - Certification timestamp: Mar 6, 2026, 10:15 AM EST
  - Digital signature: Ed25519 hash displayed (truncated with "copy full hash" button)
  - Audit trail hash chain: verified (green check)
- All data now locked and immutable
- "Download Certified Package" button (PDF bundle)
- "View Audit Trail" link

#### API Data Requirements
- `GET /sessions/{sessionId}/review-status` -- current review state, feedback items
- `GET /sessions/{sessionId}/certification` -- certification details if certified
- WebSocket or polling for real-time status updates



---

# SARAH CHEN -- CONTROLLER
# Sections B through H: Decision Trees, Handoffs, Edge Cases, Notifications, Data, Keyboard

---

## B. DECISION TREE -- EVERY BRANCH SARAH FACES

### B1. GL Upload Decision Tree

```
START: Sarah clicks "Upload GL"
  |
  v
File selected/dropped
  |
  v
[System] Parse file
  |
  +---> Parse FAILS
  |       |
  |       +---> File format unsupported --> Show error, list supported formats, offer templates
  |       +---> File corrupted/password-protected --> Show error, suggest re-export
  |       +---> File too large (>50MB) --> Show error, suggest splitting or smaller export
  |       +---> Encoding issue --> Show error, suggest UTF-8 CSV export
  |
  +---> Parse SUCCEEDS
          |
          v
        [System] Detect column structure
          |
          +---> Column mapping HIGH confidence (>90% match to known schema)
          |       |
          |       v
          |     Show auto-detected mapping preview
          |       |
          |       +---> Sarah confirms mapping --> Proceed to validation
          |       +---> Sarah edits mapping --> Manual column mapping interface --> Confirm --> Proceed
          |
          +---> Column mapping LOW confidence (<90%)
          |       |
          |       v
          |     Show column mapping interface with best guesses
          |       |
          |       v
          |     Sarah maps columns manually --> Confirm --> Proceed
          |
          +---> Required columns MISSING (no Account Number or no Debit/Credit)
                  |
                  v
                Show error: "Required columns not found"
                  |
                  v
                Sarah re-uploads with correct format or maps manually

        [System] Validate parsed data
          |
          +---> BALANCED (total debits = total credits)
          |       |
          |       +---> No new/missing accounts vs prior --> Clean upload, proceed to TB
          |       +---> New accounts found (not in prior period)
          |       |       |
          |       |       v
          |       |     Show list of new accounts with amber highlight
          |       |       |
          |       |       +---> Sarah confirms new accounts are expected --> Proceed
          |       |       +---> Sarah realizes file is wrong --> Re-upload
          |       |
          |       +---> Missing accounts (in prior but not current)
          |               |
          |               v
          |             Show list of missing accounts with amber warning
          |               |
          |               +---> Sarah confirms accounts closed/inactive --> Proceed (zero balance carried)
          |               +---> Sarah realizes GL export was filtered wrong --> Re-upload
          |
          +---> UNBALANCED (debits != credits)
                  |
                  v
                Show red warning with difference amount
                  |
                  +---> Difference is small (<$1) --> Likely rounding, Sarah proceeds with warning
                  +---> Difference is moderate ($1-$1000)
                  |       |
                  |       +---> Sarah investigates, identifies source (often suspense account)
                  |       +---> Re-uploads corrected GL from accounting system
                  |       +---> Or: proceeds with "Proceed Anyway" (will create gate failure)
                  |
                  +---> Difference is large (>$1000)
                          |
                          v
                        Sarah MUST go back to accounting system and fix
                          |
                          v
                        Re-uploads corrected GL

        [System] Check for prior GL upload in this session
          |
          +---> No prior upload --> Clean first upload
          +---> Prior upload exists
                  |
                  v
                Confirmation modal: "Replace existing GL? This resets TB, mappings, recons, adjustments."
                  |
                  +---> Sarah confirms --> Replace, all downstream data regenerated
                  +---> Sarah cancels --> Keep existing GL

        [System] Check date range
          |
          +---> All transactions within period --> Clean
          +---> Transactions outside period found
                  |
                  v
                Amber warning: "12 transactions dated outside Feb 2026"
                  |
                  +---> Sarah excludes out-of-period entries (default) --> Proceed
                  +---> Sarah includes them (toggle) --> Proceed with note
```

### B2. Account Mapping Decision Tree

```
For EACH unmapped account:
  |
  v
[System] AI analyzes account name, number, prior mapping, balance behavior
  |
  +---> Confidence >= 85% (HIGH)
  |       |
  |       v
  |     Auto-mapped, shown in "Auto-Mapped" tab
  |       |
  |       +---> Sarah batch-accepts all high confidence ("Accept All High Confidence" button)
  |       +---> Sarah reviews individually
  |               |
  |               +---> Agrees with AI --> Accept (one click)
  |               +---> Disagrees --> Override with correct line item
  |
  +---> Confidence 50-84% (MEDIUM)
  |       |
  |       v
  |     Shown in "Needs Review" tab with AI suggestion and reasoning
  |       |
  |       v
  |     Sarah reviews each one:
  |       |
  |       +---> AI suggestion is correct --> Accept
  |       +---> AI suggestion is close but wrong category --> Edit to correct line item
  |       +---> AI suggestion is completely wrong --> Map manually from line item hierarchy
  |       +---> Account is ambiguous ("Miscellaneous" accounts)
  |               |
  |               +---> Sarah investigates GL detail for this account
  |               +---> Maps based on the nature of transactions
  |               +---> May need to split account across two line items
  |                     (creates a mapping rule: "60% SGA, 40% COGS" -- rare but possible)
  |
  +---> Confidence < 50% (LOW)
          |
          v
        Shown in "Unmapped" tab with no suggestion or very uncertain suggestion
          |
          v
        Sarah MUST map manually:
          |
          +---> Account name is clear enough --> Sarah maps directly
          +---> Account name is cryptic (e.g., "Acct 9999")
          |       |
          |       v
          |     Sarah checks GL detail/transactions for this account
          |       |
          |       v
          |     Maps based on transaction nature
          |
          +---> Account is NEW (no prior period history)
          |       |
          |       v
          |     Sarah knows what this account is from her chart of accounts knowledge
          |       |
          |       v
          |     Maps accordingly
          |
          +---> Account does not fit any existing line item
                  |
                  v
                "Create custom line item" (requires CFO approval flag)
                  |
                  +---> Sarah creates new line item with justification
                  +---> Item flagged for David's approval during his review

AFTER all accounts mapped:
  |
  +---> All 367 mapped --> Gate passes, "Proceed to Reconciliation" enabled
  +---> Some unmapped --> Gate fails, "Proceed" disabled with count of remaining
```

### B3. Reconciliation Decision Tree

```
For EACH balance sheet account:
  |
  v
[System] Determine reconciliation method based on account type and prior config
  |
  +---> Cash accounts --> Bank Statement Matching method
  |       |
  |       v
  |     Sarah uploads bank statement (CSV/PDF/OFX)
  |       |
  |       +---> Parse succeeds
  |       |       |
  |       |       v
  |       |     [System] Auto-match GL entries to bank transactions
  |       |       |
  |       |       +---> All matched (100% match rate) --> difference = $0
  |       |       |       |
  |       |       |       v
  |       |       |     Sarah reviews matches, marks as reconciled
  |       |       |
  |       |       +---> Partial match (e.g., 93%)
  |       |               |
  |       |               v
  |       |             Sarah reviews unmatched items:
  |       |               |
  |       |               +---> Timing difference (check not cleared) --> Mark as "Outstanding check"
  |       |               +---> Deposit in transit --> Mark as "Deposit in transit"
  |       |               +---> Bank fee not in GL --> Mark as "Bank fee, record AJE"
  |       |               |       |
  |       |               |       v
  |       |               |     Creates adjusting entry from reconciliation screen (opens AJE form)
  |       |               +---> Error in GL --> Mark as "Error, record correcting AJE"
  |       |               +---> Requires manual match (1-to-many or many-to-1)
  |       |                       |
  |       |                       v
  |       |                     Sarah selects GL entries + bank entries to match manually
  |       |
  |       +---> Parse fails --> Error message, re-upload in different format
  |
  +---> AR/AP accounts --> Subledger method
  |       |
  |       v
  |     Sarah uploads aging report from ERP
  |       |
  |       v
  |     [System] Compares GL balance to subledger total
  |       |
  |       +---> Match within tolerance --> Sarah reviews, marks reconciled
  |       +---> Difference exists
  |               |
  |               v
  |             Sarah adds reconciling items (reserves, reclasses, timing)
  |               |
  |               +---> Reconciling items explain difference --> Mark reconciled
  |               +---> Cannot explain --> Submit with exception + explanation
  |
  +---> Fixed Assets / Debt / Prepaids --> Schedule method
  |       |
  |       v
  |     Sarah uploads supporting schedule
  |       |
  |       v
  |     GL balance vs schedule balance compared
  |       |
  |       (same reconcile or exception flow as above)
  |
  +---> Other accounts (e.g., accrued liabilities) --> Manual method
  |       |
  |       v
  |     Sarah lists supporting items with amounts
  |       |
  |       v
  |     Supporting items total compared to GL balance
  |       |
  |       (same reconcile or exception flow)
  |
  +---> Non-applicable accounts (retained earnings, AOCI) --> Mark N/A
          |
          v
        Sarah marks as "N/A -- derived from equity rollforward"

TOLERANCE CHECK for each account:
  |
  +---> Difference <= tolerance --> "Mark as Reconciled" enabled (green button)
  +---> Difference > tolerance
          |
          +---> Sarah adds more reconciling items to reduce difference
          +---> Cannot reduce below tolerance
                  |
                  v
                "Submit with Exception" (amber button)
                  |
                  v
                Sarah writes exception explanation (required text field)
                  |
                  v
                Exception goes to David's approval queue
```

### B4. Adjustments Decision Tree

```
START: Sarah reviews adjustments needed
  |
  v
RECURRING TEMPLATES available?
  |
  +---> YES (repeat close, templates exist)
  |       |
  |       v
  |     Sarah reviews template list:
  |       |
  |       +---> Template amount is fixed (depreciation) --> "Apply" directly
  |       +---> Template amount needs updating (accrued payroll)
  |       |       |
  |       |       v
  |       |     "Edit before applying" --> update amount --> Apply
  |       +---> Template no longer relevant --> Skip (do not apply)
  |       +---> "Apply all templates" button for bulk application
  |
  +---> NO (first close)
          |
          v
        Sarah creates each entry manually
          |
          v
        Saves routine entries as templates for future periods

For EACH adjusting entry:
  |
  v
Sarah creates/edits the entry:
  |
  +---> Entry BALANCED (debits = credits) --> Can submit
  +---> Entry UNBALANCED --> Cannot submit, inline error shows difference
  |
  v
Sarah submits for approval --> Entry goes to David's queue
  |
  v
WAIT for David's response:
  |
  +---> David APPROVES --> Entry status turns green, entry is included in statements
  +---> David REJECTS with comment
          |
          v
        Sarah sees rejection on dashboard alerts and in adjustments list
          |
          v
        Sarah opens rejected entry, reads David's comment
          |
          +---> Sarah agrees with feedback --> Edits entry, resubmits
          +---> Sarah disagrees --> Edits with explanation of why original was correct, resubmits
          +---> Sarah needs more info --> Contacts David outside system (Slack/email/call)
                  |
                  v
                Returns to edit and resubmit
```

### B5. Variance Analysis Decision Tree

```
[System] flags material variances after statement generation
  |
  v
For EACH material variance:
  |
  +---> AI draft explanation available?
  |       |
  |       +---> YES
  |       |       |
  |       |       v
  |       |     Sarah reads AI draft:
  |       |       |
  |       |       +---> Draft is accurate and complete --> "Accept as-is"
  |       |       +---> Draft is mostly right, needs edits --> "Edit and accept"
  |       |       |       |
  |       |       |       v
  |       |       |     Sarah edits specific sections (adds contract names, corrects amounts)
  |       |       |       |
  |       |       |       v
  |       |       |     Saves edited version
  |       |       |
  |       |       +---> Draft is wrong or unhelpful --> "Reject and write manually"
  |       |       |       |
  |       |       |       v
  |       |       |     Sarah writes explanation from scratch using IRAC template
  |       |       |
  |       |       +---> Draft seems off, want a redo --> "Request new AI draft"
  |       |               |
  |       |               v
  |       |             AI regenerates with potentially different approach
  |       |
  |       +---> NO (AI could not generate, insufficient data)
  |               |
  |               v
  |             Sarah writes explanation manually
  |
  v
Sarah attaches evidence if needed (contracts, schedules, analysis)
  |
  v
Sarah submits explanation for review
  |
  v
WAIT for David:
  |
  +---> David approves --> Variance marked as explained (green)
  +---> David rejects with feedback
          |
          v
        Sarah revises explanation and resubmits
```

### B6. Submission Gate Decision Tree

```
Sarah clicks "Submit for Review" from dashboard or proceeds to submission screen
  |
  v
[System] evaluates ALL gates:
  |
  +---> ALL required gates PASS
  |       |
  |       v
  |     Submission screen shows all green checks
  |       |
  |       v
  |     Sarah adds optional note, checks confirmation box
  |       |
  |       v
  |     "Submit" button enabled --> Sarah clicks
  |       |
  |       v
  |     Session status changes to "In Review"
  |     David receives notification
  |     Sarah enters read-only mode
  |
  +---> SOME gates FAIL
          |
          v
        Submission screen shows red X items with remediation links
          |
          v
        Sarah clicks each failing gate link to go fix the issue:
          |
          +---> Unmapped accounts --> Account Mapping screen
          +---> Unreconciled accounts --> Reconciliation list
          +---> Pending/rejected AJEs --> Adjustments list
          +---> Missing variance explanations --> Variance Analysis
          +---> Statements not generated --> Generate screen
          +---> Cross-validation failures --> Statement that fails
          |
          v
        Sarah fixes each issue, returns to submission screen
          |
          v
        Gates re-evaluated automatically (or manual "Re-check" button)
          |
          v
        When all pass --> Submit enabled
```

---

## C. INTER-PERSONA HANDOFFS

### C1. Sarah Submits for David's Review

**What Sarah does**:
1. Clicks "Submit for Review" on submission screen
2. Adds optional note: "Revenue was strong this month due to 3 new enterprise deals. Bonus accrual is estimated pending final calc from HR."
3. Checks confirmation checkbox
4. Clicks "Submit"

**What happens in the system**:
1. Session status changes from "In Progress" to "In Review"
2. All session data becomes read-only for Sarah
3. Notification created for David
4. Audit trail entry: "Session submitted for review by Sarah Chen at [timestamp]"
5. Email sent to David (if email notifications enabled)
6. Dashboard push notification for David (if logged in)

**What David sees** (on his next login or immediately if online):
1. Notification bell badge increments
2. Notification: "Sarah Chen submitted February 2026 close for [Company Name] for your review."
3. Company card on his portfolio shows status change to "In Review"
4. Review Queue shows new item with all deliverables
5. Sarah's submission note appears at the top of the review

**What Sarah sees after submission**:
1. Dashboard banner: "Submitted for review -- Waiting for David Park"
2. All edit buttons disabled/hidden
3. Activity feed: "Submitted for review -- [timestamp]"
4. Can still VIEW all screens in read-only mode
5. Can still add notes/annotations (visible to David during review)

### C2. David Rejects with Comments

**What David does**:
1. Reviews close package, finds issues
2. Rejects specific items (AJE, variance explanation, reconciliation exception) with individual comments
3. Adds general comment: "Good close overall, but need more detail on revenue variance and the bonus accrual seems high."
4. Clicks "Request Changes"

**What happens in the system**:
1. Session status changes from "In Review" to "Changes Requested"
2. Individual items marked as rejected with David's comments
3. Notification created for Sarah
4. Session unlocked for Sarah's editing (only on rejected items and related screens)
5. Audit trail entry logged

**What Sarah sees**:
1. Notification: "David Park has requested changes to your February 2026 close."
2. Dashboard:
   - Status pill: "Changes Requested" (red)
   - Red banner with David's general comment
   - Alerts card now shows rejected items:
     - "Variance #3 (Revenue): Rejected -- 'Please include specific contract references and deal values.'"
     - "AJE-007 (Accrued bonus): Rejected -- 'Amount seems high. Was this validated against HR data?'"
   - Each alert has a "Go to item" link
3. Adjustments screen: rejected AJE has red border, David's comment shown inline
4. Variance analysis: rejected explanation has red border, David's comment shown inline
5. "Resubmit for Review" button appears on dashboard (disabled until all feedback addressed)
6. Each feedback item has a "Mark as addressed" checkbox

**Sarah's workflow to address feedback**:
1. Clicks "Go to item" for each rejected item
2. Reads David's comment
3. Makes changes (edits AJE amount, revises variance explanation)
4. Checks "Mark as addressed" for each item
5. When all addressed: "Resubmit for Review" button enables
6. Clicks "Resubmit" with optional response note
7. David gets another notification

### C3. David Certifies

**What David does**:
1. Reviews all items, all pass
2. Clicks "Certify" on certification ceremony screen
3. Authenticates (re-enters password or MFA)
4. Ed25519 digital signature applied

**What happens in the system**:
1. Session status changes to "Certified"
2. All data cryptographically locked (hash-chained audit trail sealed)
3. Ed25519 digital signature generated
4. Certification record created with timestamp, signer, hash
5. Notifications sent to: Sarah, Marcus (PE partner), Karen (fund controller)
6. Data becomes available on Marcus's portfolio dashboard
7. Data becomes available for Karen's LP reporting aggregation
8. Audit binder automatically compiled

**What Sarah sees**:
1. Notification: "David Park has certified the February 2026 close for [Company Name]."
2. Dashboard:
   - Status pill: "Certified" (green)
   - Green banner: "Close certified by David Park on Mar 6, 2026 at 10:15 AM"
   - Subtle celebration animation (confetti particles, 2 seconds, respectful)
   - Certification details card:
     - Certifier: David Park, CFO
     - Timestamp: Mar 6, 2026, 10:15:23 AM EST
     - Digital signature hash: `a7f3b2c1...` (truncated, "Copy full hash" button)
     - Audit trail hash: `e9d4f5a8...`
     - Verification URL: `https://verify.sabit.com/cert/[hash]` (shareable with auditors)
3. All screens become read-only with "Certified" watermark (subtle, top-right corner)
4. "Download Certified Package" button (PDF bundle of all statements + audit trail)
5. "Download Audit Binder" button (complete package for auditors)
6. "Reopen Period" button (requires CFO approval, red warning styling)

---

## D. FIRST-TIME VS REPEAT EXPERIENCE

### D1. First Close (No Prior History)

**What's different**:
- Session list: empty state with onboarding illustration
- Creating first session: no "Copy settings from" option (no prior periods)
- GL Upload: no "Prior period" comparison column. No "missing accounts" check.
- Account Mapping:
  - AI has NO prior mappings to learn from -- relies only on account name/number patterns
  - Confidence scores are LOWER across the board (expect 60-70% high confidence vs 90%+ on repeat)
  - Sarah must manually map more accounts (potentially 30-40% manual vs 5-10% on repeat)
  - No "prior period mapping" column in mapping history
  - Takes 30-45 minutes instead of 5-10 minutes
- Trial Balance: no "Prior Period" column, no "Change" columns. Sarah cannot do period-over-period analysis.
- Reconciliation:
  - No templates, no prior method assignments
  - Sarah must upload evidence for every account from scratch
  - No auto-suggested reconciliation method
  - Takes 2-3x longer than repeat
- Adjustments:
  - No templates available
  - Sarah creates every entry manually
  - System prompts: "Save as template for future periods?" after each entry
  - Takes 2x longer
- Statements: no comparative columns (or "Prior period: N/A" shown)
- EBITDA Bridge: no trend data, no LTM calculation
- Variance Analysis: no prior period variances to compare. Budget comparison only (if budget uploaded).
- Budget: must be uploaded fresh
- Overall: first close takes 12-16 hours vs 6-8 hours for repeat

**Onboarding elements (first close only)**:
- Welcome modal on first login: "Welcome to Sabit. Let's walk through your first close."
- Optional guided tour (dismissible): tooltip highlights on key features
- Contextual help icons on each screen with "First time? Here's what to do" expandable sections
- Empty states with clear CTAs instead of blank screens
- Progress celebration micro-interactions at each milestone

### D2. Second Close (First Repeat)

**What's different**:
- Account mapping: prior period mappings carry forward. AI confidence jumps to 85-90%.
  - Most accounts auto-map with high confidence
  - Sarah reviews the "Needs Review" tab (5-15 accounts) and confirms
  - New accounts (if any) still need manual mapping
- Trial Balance: prior period column populated, change columns active
- Reconciliation: prior period methods and templates available
  - System pre-assigns reconciliation method based on prior period
  - Bank matching templates carry forward
- Adjustments: templates available from first close
  - "Apply all recurring templates" button works
  - Sarah updates amounts where needed
- Statements: comparative columns populated
- Variance Analysis: prior period comparison available. AI drafts have more context.
- Overall: second close takes 8-10 hours

### D3. Sixth Close (Expert Mode)

**What's different**:
- AI confidence on mapping: 95%+ for most accounts. "Accept all" handles nearly everything.
- Reconciliation: highly templated. Sarah focuses only on exceptions.
- Adjustments: templates auto-apply with minimal editing.
- Variance Analysis: AI drafts are highly accurate (learned from Sarah's prior edits and accepted patterns).
- System learns Sarah's tolerance thresholds, preferred rounding, export formats.
- Dashboard shows trends and patterns: "Close cycle time trending down: 8 days -> 5 days"
- Keyboard shortcuts second nature. Batch operations frequent.
- Overall: close takes 4-6 hours

### D4. Year-End Close

**What's different from monthly**:
- Additional adjustments: year-end accruals, bonus true-ups, audit adjustments, tax provision
- More adjusting entries: 25-40 vs 10-15 for monthly
- Reconciliations: more rigorous, full schedules required (not just roll-forwards)
- Auditor scrutiny: James Wright will review everything
  - Sarah ensures audit binder is complete
  - Evidence requirements are higher
  - Reconciliation tolerance may be tightened
- Additional statements: may need quarterly breakdowns within annual
- Year-end EBITDA bridge: full-year with quarterly trending
- Budget comparison: full-year actual vs budget
- Variance explanations: more detailed, auditor-quality
- Equity statement: captures all year-end equity events
- Tax provision: requires separate calculation input
- Intercompany: elimination entries for consolidated reporting (if multi-entity)
- Timeline: 2-3 weeks instead of 1 week
- Overall: 20-40 hours of controller time

---

## E. EDGE CASES

### E1. GL Has Missing Accounts vs Prior Period

**Scenario**: February GL is missing 5 accounts that existed in January.

**Detection**: System compares current GL accounts to prior period account list after upload.

**User Experience**:
1. After GL upload, amber warning banner: "5 accounts from the prior period are not in the current GL."
2. Missing accounts listed in a card:
   | Account | Prior Balance | Possible Reason |
   |---------|--------------|-----------------|
   | 1250 - Security Deposits | $45,000 | Account may have been closed |
   | 4500 - Consulting Revenue | $0 | Zero balance, may be intentional |
   | ... | ... | ... |
3. Sarah's options for each:
   - "Expected -- account closed/inactive" --> Account excluded, zero balance carried in mapping
   - "Error -- should be in GL" --> Sarah returns to accounting system to re-export
   - "Reclassified -- merged into another account" --> Sarah maps the old account to the new one
4. Cannot proceed until all missing accounts are addressed (acknowledged or re-uploaded)

### E2. AI Confidence Below 50% on Multiple Accounts

**Scenario**: 40 accounts have AI confidence below 50% (common first close or after chart of accounts restructuring).

**User Experience**:
1. Account Mapping screen shows alarming red count: "40 accounts require manual mapping"
2. System offers help:
   - "Would you like to upload your chart of accounts with descriptions?" -- additional context helps AI
   - "Would you like to map by account number range?" -- batch mapping tool
3. Batch mapping tool:
   - "Map all accounts 4000-4999 to Revenue" with sub-category assignment
   - "Map all accounts 5000-5999 to COGS"
   - Table shows account ranges with suggested line items
4. After batch mapping, remaining stragglers shown individually
5. Sarah can request AI to re-analyze with new context from batch mappings
6. Time impact: adds 20-40 minutes to mapping phase

### E3. Reconciliation Has $50K Unreconciled Difference

**Scenario**: Cash account has $50,238 unreconciled difference (well above $500 tolerance).

**User Experience**:
1. Reconciliation list shows account in red: "Over Tolerance" status
2. Sarah opens reconciliation detail
3. Dashboard alert: "1 reconciliation over tolerance ($50,238 unreconciled)"
4. In reconciliation detail:
   - GL Balance: $4,523,891.23
   - Bank Balance: $4,473,652.34
   - Difference: $50,238.89
   - Tolerance: $500.00
5. Sarah investigates:
   - Reviews unmatched GL transactions (may find uncleared checks)
   - Reviews unmatched bank transactions (may find bank fees or auto-debits not recorded)
   - Identifies: $45,000 outstanding check #4523 (timing) + $3,238.89 bank wire fee not recorded + $2,000 deposit in transit
6. Sarah adds reconciling items:
   - Outstanding check #4523: $45,000 (timing difference)
   - Bank wire fee: $3,238.89 (needs AJE)
   - Deposit in transit: $2,000 (timing difference)
   - Total reconciling items: $50,238.89
7. Adjusted difference: $0.00 -- within tolerance
8. For the bank wire fee: Sarah clicks "Create AJE" from reconciliation screen
   - Pre-populated AJE form: Dr. Bank Fees $3,238.89, Cr. Cash $3,238.89
   - Submits for David's approval
9. Marks account as reconciled
10. If Sarah CANNOT fully explain the difference:
    - "Submit with Exception" button
    - Required explanation: "Investigating $2,000 discrepancy between GL and bank. Suspect timing issue with ACH payment. Will resolve by month-end."
    - This goes to David for approval or rejection

### E4. JE Rejected by David with Feedback

**Scenario**: David rejects AJE-007 (accrued bonus) with comment.

**User Experience**:
1. Sarah receives notification (bell icon, email, and/or Slack webhook)
2. Notification text: "David Park rejected AJE-007 (Accrued Executive Bonus). Comment: 'Amount of $425,000 seems high for monthly accrual. Last month was $380,000. Did HR confirm the increase?'"
3. Sarah's dashboard shows alert: "1 adjusting entry rejected -- feedback attached"
4. Sarah navigates to Adjustments list, sees AJE-007 with red "Rejected" status
5. Sarah clicks to open:
   - Red banner at top: "Rejected by David Park on Mar 5, 2026"
   - David's comment displayed prominently
   - Entry form is EDITABLE again
   - Sarah's options:
     a. Revise amount: changes $425K to $395K, adds supporting note: "Confirmed with HR -- $395K reflects updated compensation for new VP hire. See attached HR memo."
     b. Keep amount with justification: adds note: "Amount confirmed with HR. Increase from $380K due to new VP of Engineering hired Jan 15. See attached offer letter."
     c. Add attachment: uploads HR memo or compensation schedule
6. Sarah clicks "Resubmit for Approval"
7. David receives new notification with the revision history visible

### E5. Cross-Statement Validation Fails

**Scenario**: After generation, balance sheet does not balance.

**User Experience**:
1. Generation completes with red error banner: "Critical validation failure"
2. Validation results show:
   - [red X] Balance sheet: Assets ($312,456,789) != Liabilities + Equity ($312,451,234). Difference: $5,555.
3. Sarah's investigation path:
   - Click "Investigate" button next to the failing validation
   - System shows diagnostic: "The difference of $5,555 may be caused by:"
     - Unmapped accounts: check if any accounts are mapped to a statement but not correctly categorized
     - Rounding errors: check rounding configuration
     - Adjustment errors: check if any adjustments are one-sided
   - Quick-check results:
     - "Found: Account 3200 (Misc Equity Adjustment) has balance of $5,555 and is mapped to Equity but not included in any equity line item sub-category."
4. Sarah goes to Account Mapping, fixes the mapping for Account 3200
5. Returns to Generate screen, clicks "Regenerate"
6. Validation now passes

### E6. Variance Explanation Rejected

**Scenario**: David rejects Sarah's variance explanation for revenue.

**User Experience**:
1. Sarah receives notification: "David Park rejected your revenue variance explanation. Comment: 'Need specific contract names and signed dates, not just counts.'"
2. Sarah opens Variance Analysis, navigates to the rejected item
3. Red banner with David's comment
4. Sarah's prior explanation is preserved (can see what she submitted)
5. Sarah edits:
   - Changes "3 new contracts totaling $280K" to:
   - "New contracts: Acme Corp ($120K/month, signed Jan 28, 2026), Globex Inc ($95K/month, signed Feb 3, 2026), Initech LLC ($65K/month, signed Feb 10, 2026). Total new MRR: $280K."
6. Attaches contract summaries as evidence
7. Resubmits
8. David reviews revised explanation

### E7. Reopen a Certified Period

**Scenario**: After certification, Sarah discovers a material error that requires correction.

**User Experience**:
1. Sarah navigates to the certified session
2. Everything is read-only with "Certified" green status
3. Sarah clicks "Reopen Period" button (bottom of dashboard, styled as a dangerous action)
4. Warning modal:
   - Title: "Reopen Certified Period?"
   - Body: "Reopening a certified period will:
     - Invalidate the current certification and digital signature
     - Notify the CFO, PE operating partners, and fund controllers
     - Require full re-certification after changes
     - Create an audit trail entry recording the reopening reason
     This action requires CFO approval."
   - Required field: "Reason for reopening" (text area, minimum 50 characters)
   - "Request Reopening" button (amber) | "Cancel" button
5. Sarah fills in reason: "Discovered that revenue for contract #4523 was recorded in February but the delivery milestone was not met until March 1. Need to reverse $85,000 of revenue and recognize in March."
6. Clicks "Request Reopening"
7. David receives notification: "Sarah Chen requests reopening the February 2026 certified close. Reason: [shown]"
8. David approves or denies from his Approval Queue
9. If approved:
   - Session status changes to "Reopened" (red)
   - Previous certification details preserved in audit trail
   - Sarah can now edit (make corrections, add adjustments)
   - Must re-submit and re-certify through full process
   - Marcus and Karen are notified that February numbers are being revised
   - Dashboard shows "Reopened from certification" with original certification details

---

## F. NOTIFICATIONS

### F1. Notification Triggers for Sarah

| Trigger | Channel | Message | Priority |
|---------|---------|---------|----------|
| AJE approved by David | In-app bell, email | "David Park approved AJE-007 (Accrued Executive Bonus)." | Normal |
| AJE rejected by David | In-app bell, email, optional Slack | "David Park rejected AJE-007. Comment: '[first 100 chars]'" | High |
| Variance explanation approved | In-app bell | "David Park approved your revenue variance explanation." | Normal |
| Variance explanation rejected | In-app bell, email | "David Park rejected your revenue variance explanation. Comment: '[first 100 chars]'" | High |
| Reconciliation exception approved | In-app bell | "David Park approved reconciliation exception for 1010 Cash." | Normal |
| Reconciliation exception rejected | In-app bell, email | "David Park rejected reconciliation exception for 1010 Cash." | High |
| Review complete -- changes requested | In-app bell, email, optional Slack | "David Park has requested changes to your February 2026 close. 3 items need attention." | Critical |
| Close certified | In-app bell, email | "David Park has certified the February 2026 close." | High |
| Period reopened (by David) | In-app bell, email | "David Park has reopened the February 2026 close. Changes may be required." | Critical |
| Reopen request approved | In-app bell, email | "David Park approved your request to reopen February 2026." | High |
| Reopen request denied | In-app bell, email | "David Park denied your request to reopen February 2026. Comment: '[reason]'" | High |
| GL processing complete | In-app bell | "Your general ledger has been processed. 2,847 records parsed." | Normal |
| AI mapping complete | In-app bell | "AI has mapped 342 of 367 accounts (93%). 25 accounts need manual review." | Normal |
| Statement generation complete | In-app bell | "Financial statements generated. 2 validation warnings." | Normal |
| Close target date approaching | In-app bell, email | "February 2026 close target date is in 2 days (Mar 15). 3 items remaining." | High |
| Close target date passed | In-app bell, email | "February 2026 close target date has passed. 3 items still outstanding." | Critical |

### F2. Notification Display

**In-App Bell**:
- Red badge with unread count on bell icon in top nav
- Click opens notification drawer (slide from right, 400px wide)
- Each notification:
  - Icon (type-based: check, X, clock, alert)
  - Title (bold): "AJE Rejected"
  - Body: "David Park rejected AJE-007 (Accrued Executive Bonus). Comment: 'Amount seems high...'"
  - Timestamp: "2 hours ago" (relative) with full timestamp on hover
  - "Go to item" link
  - Unread indicator (blue dot)
  - Mark as read on click
- "Mark all as read" link at top
- "Notification settings" link at bottom

**Email Notifications**:
- From: notifications@sabit.com
- Subject: "[Sabit] AJE-007 rejected by David Park -- February 2026 Close"
- Body: HTML email with:
  - Company name and period
  - Action description
  - David's comment (if applicable)
  - "View in Sabit" CTA button (deep link to specific item)
  - Unsubscribe / notification preferences link

**Notification Preferences** (in user settings):
- Per-notification-type toggles:
  - In-app: always on (cannot disable)
  - Email: on/off per notification type
  - Slack webhook: URL configuration + on/off per type
- Quiet hours: "Don't send emails between 10 PM and 7 AM"
- Digest mode: "Send daily digest instead of individual emails"

---

## G. DATA REQUIREMENTS PER SCREEN (SUMMARY)

| Screen | Primary API Endpoint | Key Data | Typical Payload Size | Cache Strategy |
|--------|---------------------|----------|---------------------|----------------|
| Login | `POST /auth/login` | JWT, user profile, companies | <1KB | No cache |
| Portfolio | `GET /users/me/companies` | Company list with status | <5KB | 60s cache |
| Session List | `GET /companies/{id}/sessions` | Session list with progress | <10KB | 30s cache |
| Dashboard | `GET /sessions/{id}/dashboard` | Pipeline, gates, alerts, activity, comparison | 10-50KB | 30s cache, WebSocket for updates |
| GL Upload | `POST /sessions/{id}/gl/upload` | File upload (1-50MB), job status polling | Upload: large, Status: <1KB | No cache |
| Trial Balance | `GET /sessions/{id}/trial-balance` | All accounts with balances, comparisons | 50-200KB (367 accounts) | 60s cache |
| Account Mapping | `GET /sessions/{id}/account-mapping` | Accounts with AI suggestions, confidence | 50-200KB | 60s cache |
| Recon List | `GET /sessions/{id}/reconciliation` | BS accounts with status, balances | 10-50KB | 30s cache |
| Recon Detail | `GET /sessions/{id}/reconciliation/{accountId}` | Transactions, matches, evidence | 50KB-2MB (depends on transaction volume) | No cache (live data) |
| Adjustments List | `GET /sessions/{id}/adjustments` | All AJEs with status | 10-50KB | 30s cache |
| AJE Form | `GET /sessions/{id}/adjustments/{entryId}` | Single entry detail | <10KB | No cache |
| Generate | `POST /sessions/{id}/generate` | Job trigger and status | <5KB | No cache |
| Income Statement | `GET /sessions/{id}/statements/income-statement` | Full statement with all columns | 20-100KB | Until regeneration |
| Balance Sheet | `GET /sessions/{id}/statements/balance-sheet` | Full statement | 20-100KB | Until regeneration |
| Cash Flow | `GET /sessions/{id}/statements/cash-flow` | Full statement | 10-50KB | Until regeneration |
| Equity | `GET /sessions/{id}/statements/equity` | Full statement | 5-20KB | Until regeneration |
| EBITDA Bridge | `GET /sessions/{id}/statements/ebitda-bridge` | Bridge data with trends | 10-50KB | Until regeneration |
| Budget Comparison | `GET /sessions/{id}/budget-comparison` | Actual vs budget all line items | 20-100KB | Until regeneration |
| Variance Analysis | `GET /sessions/{id}/variance-analysis` | All variances with explanations | 20-100KB | 30s cache |
| Variance Detail | `GET /sessions/{id}/variance-analysis/{id}` | Single variance with AI draft, drill-down | 10-50KB | No cache |
| Submit | `GET /sessions/{id}/submit/gates` | Gate checklist | <5KB | No cache |

### Loading State Patterns (consistent across all screens)
- **Skeleton screens**: gray pulsing rectangles matching the layout structure
- **Progressive loading**: show header/navigation immediately, then content
- **Optimistic updates**: for actions like "Accept AI mapping," update UI immediately, roll back on failure
- **Background processing indicators**: for long operations (GL processing, statement generation), show progress bar with step-by-step status
- **Stale data indicators**: yellow banner when data may be outdated, with refresh button

### Empty State Patterns (consistent across all screens)
- **First-time empty**: illustration + welcoming text + primary CTA ("Upload your first GL")
- **Filtered empty**: "No results match your filters. Try adjusting your search." + "Clear filters" button
- **Dependency empty**: "Complete [previous step] first to see data here." + link to previous step
- **Error empty**: "Unable to load data. Please try again." + "Retry" button + "Contact support" link

### Error State Patterns (consistent across all screens)
- **Network error**: red banner at top, retry button, data preserved locally
- **Validation error**: inline red text below the specific field, field highlighted with red border
- **Server error (500)**: full-page error with "Something went wrong. Our team has been notified. Try again or contact support."
- **Permission error (403)**: "You don't have access to this resource. Contact your administrator."
- **Not found (404)**: "This page doesn't exist. It may have been moved or deleted." with link to dashboard
- **Concurrent edit conflict**: amber banner "This item was modified by another user. Refresh to see the latest version." with "Refresh" and "Keep my changes" options

---

## H. KEYBOARD AND EFFICIENCY PATTERNS

### H1. Global Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Ctrl+K` / `Cmd+K` | Open command palette (universal search/action) | Any screen |
| `Ctrl+/` / `Cmd+/` | Show keyboard shortcuts help overlay | Any screen |
| `Ctrl+S` / `Cmd+S` | Save current work (auto-save is on, but manual save for confidence) | Any editable screen |
| `Ctrl+Enter` | Submit current form / confirm current action | Forms, modals |
| `Escape` | Close modal / drawer / cancel current action | Modals, drawers |
| `Alt+1` through `Alt+9` | Navigate to sidebar items (1=Dashboard, 2=GL Upload, etc.) | Any screen with sidebar |
| `Alt+N` | Open notifications drawer | Any screen |
| `Alt+Left` | Navigate back (browser back) | Any screen |

### H2. Command Palette (`Ctrl+K`)

- Opens a centered modal with search input
- Type to search across:
  - Screens: "trial balance," "reconciliation," "adjustments"
  - Accounts: "4100 Product Revenue," "1010 Cash"
  - Actions: "new adjusting entry," "upload GL," "generate statements"
  - Entities: "AJE-007," "Variance #3"
- Results shown as a list, navigate with arrow keys, Enter to select
- Most recent / frequently used shown by default

### H3. Screen-Specific Shortcuts

**Account Mapping Screen**:
| Shortcut | Action |
|----------|--------|
| `A` | Accept AI suggestion for focused row |
| `E` | Edit mapping for focused row |
| `Space` | Toggle checkbox for focused row |
| `Ctrl+A` | Select all visible rows |
| `Ctrl+Shift+A` | Accept all selected AI suggestions |
| `Up/Down` arrows | Move between rows |
| `Tab` | Move to next unmapped account |

**Reconciliation Detail (Bank Matching)**:
| Shortcut | Action |
|----------|--------|
| `M` | Start manual match mode |
| `Enter` | Confirm selected match |
| `T` | Mark selected item as timing difference |
| `O` | Mark as outstanding |
| `N` | Next unmatched item |

**Adjusting Entry Form**:
| Shortcut | Action |
|----------|--------|
| `Tab` | Move through fields: Account > Description > Debit > Credit > next line |
| `Ctrl+L` | Add new line |
| `Ctrl+D` | Delete current line |
| `Ctrl+Enter` | Submit for approval |
| `Ctrl+Shift+S` | Save as draft |

**Trial Balance / Statement Tables**:
| Shortcut | Action |
|----------|--------|
| `Up/Down` | Navigate rows |
| `Enter` or `Right` | Drill into row (expand or navigate) |
| `Left` or `Escape` | Collapse or go back |
| `Ctrl+F` | Focus search/filter input |
| `Ctrl+E` | Export current view |

### H4. Tab Order and Focus Management

- Every screen follows a logical tab order: header actions > filters > table headers > table rows > footer actions
- Forms: top-to-bottom, left-to-right within rows
- Modals trap focus (cannot tab outside modal)
- After actions (save, submit): focus moves to the next logical item (e.g., after accepting a mapping, focus moves to next unmapped account)
- Error states: focus moves to first error field
- Skip links: "Skip to main content" link at top of page (accessibility)

### H5. Batch Operations

| Screen | Batch Operation | How |
|--------|----------------|-----|
| Account Mapping | Accept all high-confidence AI suggestions | "Accept All High Confidence" button or `Ctrl+Shift+A` |
| Account Mapping | Map selected accounts to same line item | Select multiple > "Map selected to..." dropdown |
| Reconciliation List | Mark multiple accounts as N/A | Select checkboxes > "Mark as N/A" button |
| Adjustments | Apply all recurring templates | "Apply All Templates" button |
| Variance Analysis | Accept all AI drafts | "Accept All AI Drafts" button (only for high-quality drafts) |
| Trial Balance | Export all data | "Export" button (CSV/Excel) |

### H6. Auto-Save Behavior

- **Reconciliation detail**: every change auto-saved after 2-second debounce. Green "Saved" indicator in header.
- **Adjusting entry form**: draft auto-saved every 30 seconds and on blur. "Draft saved at 2:34 PM" text.
- **Variance explanation**: auto-saved every 30 seconds. "Last saved: 2:34 PM" indicator.
- **Account mapping**: each individual mapping saved immediately on selection (no explicit save needed).
- **Tolerance configuration**: saved on modal close/confirm.
- **IMPORTANT**: auto-save does NOT submit for approval. Submission is always explicit.

### H7. Preference Persistence

Stored per user, synced across sessions:
- Table column visibility and widths
- Sort preferences per table
- Filter defaults (e.g., "always start on Needs Review tab in Account Mapping")
- Sidebar collapsed/expanded state
- Theme preference (light/dark, if supported)
- Notification preferences (email on/off per type)
- Export format preference (CSV vs Excel)
- Dashboard card order (if customizable)
- Rounding preference
- Last viewed session (auto-open on login)
- Command palette recent searches



---

# SABIT BUILD SPECIFICATION: DAVID PARK -- CFO/REVIEWER
# Complete Screen-by-Screen Journey & Interaction Specification

---

## A. COMPLETE SCREEN-BY-SCREEN JOURNEY

---

### SCREEN 1: LOGIN
**URL**: `/login`
**Time spent**: 15-30 seconds
**Emotional state**: Task-switching from other CFO duties, wants efficiency

Identical to Sarah's login experience. Same screen, same flows. David likely uses SSO via company Okta/Azure AD. After authentication, David is redirected to `/portfolio` (if multi-company) or directly to his primary company's review dashboard.

**Key difference from Sarah**: David may manage multiple entities (platform + add-ons in a PE rollup), so portfolio view is more relevant to him.

---

### SCREEN 2: PORTFOLIO / COMPANY SELECTOR
**URL**: `/portfolio`
**Time spent**: 10-30 seconds
**Emotional state**: Scanning for what needs attention

#### Layout
Same structural layout as Sarah's, but with REVIEWER-SPECIFIC information:

- Top nav: Sabit logo, notification bell (typically has badge -- CFOs get more notifications), user avatar dropdown
- Page title: "Your Companies"
- Company cards (David may see 1-6 entities):
  - Each card shows:
    - Company name (bold)
    - Entity type: "Platform" or "Add-on"
    - Current close status pill:
      - "Awaiting Your Review" (red pulsing dot) -- THIS IS THE KEY DIFFERENCE
      - "In Progress" (blue) -- Sarah is still working
      - "Certified" (green) -- Done
      - "Changes Requested" (amber) -- David sent it back, waiting for Sarah
    - Items pending your action: "3 items need your approval"
    - Last certified period with date
    - Days since period end
  - Cards with "Awaiting Your Review" are sorted FIRST and have a subtle red left border

**Key difference from Sarah**: David's cards prioritize what needs HIS action. The portfolio is an action-oriented inbox, not a work selection screen.

#### Actions
- Click company card to go to that company's review dashboard
- Badge counts on cards guide David to where he's needed

#### Navigation Trigger
- Click card goes to `/companies/{companyId}/review` (NOT session list -- David goes straight to review)

#### API Data Requirements
- `GET /users/me/companies` -- same endpoint as Sarah, but includes: pendingApprovalCount, reviewStatus per company
- `GET /users/me/pending-actions/summary` -- aggregate pending items across all companies

---

### SCREEN 3: REVIEW DASHBOARD
**URL**: `/companies/{companyId}/review`
**Time spent**: 5-15 minutes (this is David's primary screen)
**Emotional state**: Evaluative, looking for issues, time-pressured

**Context**: David does NOT navigate the same way Sarah does. He does not go screen-by-screen through GL upload, trial balance, mapping, etc. He lands on a REVIEW DASHBOARD that surfaces everything needing his attention. He reviews from the approval queue, dips into details when needed, and returns to the queue.

#### Layout
- Left sidebar (simplified for reviewer role):
  - Company name with switcher
  - Navigation:
    - Review Dashboard (current)
    - Approval Queue
    - Financial Statements
    - EBITDA Bridge
    - Audit Trail
    - Settings
  - Active close period shown: "February 2026 -- In Review"

- Main content area:

**Header**:
- Period: "February 2026 Monthly Close"
- Status pill: "In Review" (amber) or "Changes Requested" (red) or "Ready to Certify" (green)
- Submitted by: "Sarah Chen on Mar 5, 2026 at 4:23 PM"
- Sarah's submission note (if provided): italicized block quote

**Action Required Card** (most prominent, top of page):
- Title: "Your Approval Queue" with count badge
- List of items needing David's action:
  - **Adjusting Entries** (3 pending):
    - AJE-007: Accrued Executive Bonus -- $425,000 [Review]
    - AJE-012: Year-End Tax Provision -- $89,234 [Review]
    - AJE-014: Revenue Reclassification -- $12,500 [Review]
  - **Reconciliation Exceptions** (1 pending):
    - 1010 Cash: $50,238 over tolerance, exception submitted [Review]
  - **Variance Explanations** (2 pending):
    - Revenue -- Product Sales: +$455K (+3.8%) [Review]
    - SGA -- Travel: +$89K (+45%) [Review]
  - **Custom Line Items** (1 pending):
    - New line item: "Cloud Infrastructure Costs" requested by Sarah [Approve/Deny]
- Each item: clickable to go to detail review, quick-action buttons (Approve/Reject) visible on hover
- "Approve All" button at bottom (bold action, requires confirmation modal)

**Financial Summary Card**:
- Side-by-side key metrics (current vs prior):
  - Revenue: $42.1M vs $41.8M (+0.7%)
  - Gross Profit: $25.3M vs $24.9M (+1.6%)
  - EBITDA: $8.2M vs $7.9M (+3.8%)
  - Adjusted EBITDA: $9.1M vs $8.6M (+5.8%)
  - Net Income: $3.1M vs $2.9M (+6.9%)
  - Free Cash Flow: $5.2M vs $4.8M (+8.3%)
- Each metric: current, prior, change, mini sparkline (6 month)
- Click any metric to drill into the relevant statement

**Gate Status Card**:
- Same gate checklist as Sarah's dashboard, but David sees it as a verification tool
- All gates should be passing (Sarah submitted only when they pass)
- If any fail (edge case: data changed during review): red warning

**Close Timeline Card**:
- Visual timeline showing:
  - Period end: Feb 28
  - GL uploaded: Mar 1
  - Mapping complete: Mar 2
  - Reconciliation complete: Mar 4
  - Adjustments submitted: Mar 5
  - Submitted for review: Mar 5 (current)
  - Target certification: Mar 10
  - Days remaining: 5

**Comparison to Prior Closes Card** (David's unique view):
- Table showing close cycle metrics over past 6 months:
  | Month | Days to Close | Open Items at Submission | David Review Time | Total AJEs |
  |-------|--------------|------------------------|-------------------|-----------|
  | Feb 2026 | 5 days | 0 | Pending | 14 |
  | Jan 2026 | 6 days | 0 | 4 hours | 12 |
  | Dec 2025 | 8 days | 2 | 8 hours | 22 |
  | ... | ... | ... | ... | ... |
- Trend indicators: "Close cycle improving -- 3 day reduction over 6 months"

#### Actions
- Click any approval queue item to review in detail
- Quick approve/reject from queue (with comment for reject)
- Click financial metrics to drill into statements
- "Approve All" for batch approval (dangerous -- requires confirmation)
- View gate status
- Access full statements via sidebar

#### Navigation Trigger
- Approval queue items navigate to detail review screens
- Financial metrics navigate to statement screens
- Sidebar navigation to full statement views

#### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| No pending review | Banner: "No close pending your review for this company." | Shows last certified period |
| Data loading failure | Individual cards show retry buttons | Card-level retry |
| Session was reopened while reviewing | Red banner: "This session has been modified since your review began. Please refresh." | Refresh button |

#### API Data Requirements
- `GET /companies/{companyId}/review/dashboard` -- returns: session metadata, approval queue items, financial summary, gate status, timeline, historical close metrics
- `GET /companies/{companyId}/review/approval-queue` -- detailed queue with all pending items
- `GET /companies/{companyId}/review/financial-summary` -- key metrics with comparisons and trends

---

### SCREEN 4: APPROVAL QUEUE
**URL**: `/companies/{companyId}/review/approval-queue`
**Time spent**: 10-30 minutes (this is where David spends most of his review time)
**Emotional state**: Decisive, focused, looking for red flags

**Context**: This is David's INBOX for the close. Every item needing his approval is here. He works through it top to bottom, making approve/reject decisions. This must be extremely efficient -- David has 2-4 hours per month for this across potentially multiple companies.

#### Layout
- Page title: "Approval Queue"
- Subtitle: "February 2026 -- 7 items pending your review"

**Filter Tabs**:
- "All Pending (7)" | "Adjusting Entries (3)" | "Reconciliation Exceptions (1)" | "Variance Explanations (2)" | "Other (1)"
- "Completed" tab: shows items already approved/rejected in this review cycle

**Queue Table/List** (card-based, not a traditional table -- each item gets enough space):

Each queue item is a card with:

**ADJUSTING ENTRY CARD**:
```
+------------------------------------------------------------------+
| AJE-007: Accrued Executive Bonus                    [Routine]     |
|                                                                    |
| Amount: $425,000.00                                               |
| Impact: Net Income -$425,000 | EBITDA: No impact (add-back)      |
| Prior Month: $380,000 (+11.8% change)                             |
|                                                                    |
| Dr. 6200 Compensation Expense    $425,000                        |
|    Cr. 2300 Accrued Liabilities           $425,000               |
|                                                                    |
| Supporting docs: payroll_register_feb.pdf, hr_memo.pdf            |
| Submitted by: Sarah Chen, Mar 5, 2026                            |
|                                                                    |
| [View Full Detail]    [Approve (green)]    [Reject (red)]        |
+------------------------------------------------------------------+
```

**RECONCILIATION EXCEPTION CARD**:
```
+------------------------------------------------------------------+
| Reconciliation Exception: 1010 Cash & Cash Equivalents            |
|                                                                    |
| GL Balance: $4,523,891.23                                         |
| Reconciled Balance: $4,473,652.34                                 |
| Unreconciled: $50,238.89 (Tolerance: $500.00)                    |
|                                                                    |
| Sarah's explanation:                                               |
| "Outstanding check #4523 ($45,000) + bank wire fee not yet        |
| recorded ($3,238.89) + deposit in transit ($2,000). AJE created   |
| for bank fee. Remaining items are timing differences."             |
|                                                                    |
| Reconciling items: 3 items totaling $50,238.89                    |
| Evidence attached: bank_statement_feb.pdf, check_register.pdf     |
|                                                                    |
| [View Full Reconciliation]  [Approve Exception]  [Reject]        |
+------------------------------------------------------------------+
```

**VARIANCE EXPLANATION CARD**:
```
+------------------------------------------------------------------+
| Variance: Revenue -- Product Sales                                |
| Current: $12,345,678  Prior: $11,890,432  Change: +$455,246 (3.8%)|
| Full-Year Impact: +$5.5M                                         |
|                                                                    |
| Explanation (IRAC):                                                |
| ISSUE: Product revenue increased by $455,246 (3.8%)...            |
| RULE: Revenue recognition follows ASC 606...                       |
| ANALYSIS: The increase is primarily driven by:                     |
|   1. Enterprise segment new customer wins: 3 new contracts...      |
|   2. Seasonal uplift in Q1...                                      |
|   3. Price increase effective Jan 1...                             |
| CONCLUSION: The variance is favorable and primarily driven by...   |
|                                                                    |
| [AI-Generated badge] [Accepted by Sarah with edits]               |
| Evidence: contract_summaries.pdf                                   |
|                                                                    |
| [View Full Analysis]     [Approve]     [Reject with Comment]      |
+------------------------------------------------------------------+
```

**Queue item interaction**:
- Expand/collapse to see full detail without navigating away
- "Approve" button: one click (turns green with checkmark, item moves to "Completed" tab)
- "Reject" button: opens inline comment field
  - Comment input: "Provide feedback for Sarah..." (required, minimum 20 characters)
  - "Confirm Rejection" button
  - Comment is sent as notification to Sarah
- "View Full Detail" link: navigates to the detail screen for deeper investigation

**Batch Actions** (top of queue):
- "Approve All Remaining" button (amber, requires confirmation modal):
  - Modal: "Are you sure you want to approve all 7 remaining items? This cannot be undone."
  - "I have reviewed each item" checkbox (required)
  - "Approve All" button
- "Reject All" button: NOT provided. Rejections must be individual with specific comments.

**Completed Items Tab**:
- Shows items David has already acted on in this review cycle
- Each shows: item, action taken (Approved/Rejected), David's comment (if rejected), timestamp
- "Undo" button available for 5 minutes after action (changes back to pending)

#### Actions
- Review each queue item
- Approve individual items (one click)
- Reject with required comment
- View full detail for any item
- Batch approve all
- Undo recent actions (within 5 minutes)
- Filter by item type

#### Decisions (per item)
- **AJE**: Is the amount reasonable? Is it supported by documentation? Is it consistent with prior periods? Does it make accounting sense?
- **Reconciliation exception**: Is the explanation credible? Are the reconciling items legitimate? Is the evidence sufficient?
- **Variance explanation**: Is the explanation thorough and accurate? Does it address the root cause? Is the full-year impact assessment reasonable?
- **Custom line items**: Is the new line item appropriate for the chart of accounts?

#### Navigation Trigger
- "View Full Detail" navigates to detail screens
- After all items processed: "All items reviewed" banner with "Proceed to Statements" button

#### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Item already acted on (concurrent reviewer) | "This item was already approved by [delegate name]." | Refresh queue |
| Approval failed | Toast: "Unable to approve. Try again." | Retry |
| Session modified during review | Banner: "Session data has been modified. Some items may have changed." | Refresh button |

#### API Data Requirements
- `GET /companies/{companyId}/review/approval-queue` -- all pending items with full detail for inline display
- `PUT /sessions/{sessionId}/adjustments/{entryId}/approve` -- approve AJE
- `PUT /sessions/{sessionId}/adjustments/{entryId}/reject` -- reject AJE with comment
- `PUT /sessions/{sessionId}/reconciliation/{accountId}/approve-exception` -- approve exception
- `PUT /sessions/{sessionId}/reconciliation/{accountId}/reject-exception` -- reject with comment
- `PUT /sessions/{sessionId}/variance-analysis/{varianceId}/approve` -- approve explanation
- `PUT /sessions/{sessionId}/variance-analysis/{varianceId}/reject` -- reject with comment
- `PUT /sessions/{sessionId}/review/approve-all` -- batch approve
- `PUT /sessions/{sessionId}/review/undo/{actionId}` -- undo recent action

#### Loading State
- Skeleton cards (3-4 cards with pulsing gray blocks)

#### Empty State
- All items approved: "All items reviewed. Proceed to financial statements for final review." with "Review Statements" button
- No items pending (session not yet submitted): "No close package pending review. Sarah Chen is working on the February 2026 close." with progress indicator

---

### SCREEN 5: REVIEW FINANCIAL STATEMENTS
**URL**: `/companies/{companyId}/review/statements/{statementType}`
**Time spent**: 10-20 minutes reviewing all four statements + EBITDA bridge
**Emotional state**: Analytical, verifying, looking for anomalies

**Context**: David reviews the same statements Sarah generated (Income Statement, Balance Sheet, Cash Flow, Equity, EBITDA Bridge). His VIEW is identical to Sarah's statement screens but with REVIEWER-SPECIFIC capabilities.

#### Layout Additions (on top of Sarah's statement layout)

**Reviewer Toolbar** (sticky bar above statement):
- "Approved by [count]/[total] items in queue" progress indicator
- "Add Review Comment" button
- "Flag Issue" button (creates a flagged item that blocks certification)
- "Compare to..." dropdown: Prior Month | Prior Year | Budget | Forecast
- Status: "Reviewing" (amber) or "Reviewed" (green, after David marks complete)
- "Mark as Reviewed" button (per statement)

**Sarah's Annotations** (visible to David):
- If Sarah added notes to any line items, they appear as blue annotation icons
- Click to see Sarah's note in a tooltip/popover
- David can reply to annotations

**Review Comments** (David's notes):
- David can click any line item and add a review comment
- Comments appear as amber icons on the line item
- Comments are visible to Sarah if David sends the close back
- Comment form: text input + severity selector (Info, Question, Issue)
- "Issue" severity comments become blockers for certification

**Variance Flags on Statements**:
- Material variances are highlighted (same as Sarah's view)
- David can click variance flags to see the explanation Sarah submitted
- Inline preview: shows first 2 lines of explanation with "Read full" expansion
- If variance explanation is already approved: green check next to the flag
- If not yet reviewed: amber "Pending" badge

**Cross-Statement Navigation**:
- Tab bar: IS | BS | CF | Equity | EBITDA Bridge
- Each tab shows a "Reviewed" green check after David marks it reviewed

#### Actions (David-specific)
- Review each statement
- Add review comments to specific line items
- Flag issues that block certification
- Mark each statement as "Reviewed"
- Compare to different periods/budget
- Reply to Sarah's annotations
- Drill into any line item (same as Sarah)
- Export statements

#### Decisions
- Do the numbers make sense at a macro level?
- Are there any anomalies or red flags?
- Is the EBITDA bridge accurate with correct add-backs?
- Are the financial statements presentation-ready for PE reporting?

#### Navigation Trigger
- Tab bar for switching between statements
- After all statements marked "Reviewed": "Proceed to Certification" button appears

#### API Data Requirements
- Same statement endpoints as Sarah's view
- `POST /sessions/{sessionId}/statements/{type}/review-comments` -- add comment
- `PUT /sessions/{sessionId}/statements/{type}/mark-reviewed` -- mark statement as reviewed
- `GET /sessions/{sessionId}/statements/{type}/annotations` -- Sarah's annotations

---

### SCREEN 6: REVIEW EBITDA BRIDGE (DEEP DIVE)
**URL**: `/companies/{companyId}/review/statements/ebitda-bridge`
**Time spent**: 5-15 minutes (David's highest-scrutiny screen after EBITDA is what PE reports on)
**Emotional state**: High stakes -- this number goes to the PE fund, covenant calculations depend on it

#### Layout
Same as Sarah's EBITDA Bridge screen, with these additions:

**PE Context Card** (David-specific, above the bridge):
- LTM Adjusted EBITDA: $104.5M
- Senior debt covenant: EBITDA must be > $80M (green: "Covenant met, 31% headroom")
- Total leverage ratio: 4.2x (covenant max: 5.5x, green: "Within covenant")
- PE fund reporting deadline: "LP reports due Mar 20 -- 14 days"
- "This data will flow to Marcus Webb's portfolio dashboard upon certification."

**Add-Back Scrutiny Panel**:
- Each add-back has a "Verify" button
- David can mark add-backs as "Verified" or "Questioned"
- "Questioned" add-backs become review comments sent back to Sarah
- Add-back trend: shows each add-back's amount over last 12 months
  - Flags add-backs that are growing: "One-time restructuring has been added back for 6 consecutive months. Is this truly non-recurring?"

**Comparatives**:
- Side-by-side: current month, prior month, same month prior year, budget
- LTM rolling calculation shown with monthly breakdown

#### Decisions
- Are add-backs legitimate and defensible?
- Is the LTM EBITDA trend consistent?
- Will this number satisfy covenant requirements?
- Is this presentation-ready for PE reporting?

#### API Data Requirements
- Same as Sarah's EBITDA bridge endpoints
- `GET /sessions/{sessionId}/ebitda-bridge/covenants` -- covenant thresholds and compliance
- `GET /sessions/{sessionId}/ebitda-bridge/add-back-trends` -- 12-month add-back history
- `PUT /sessions/{sessionId}/ebitda-bridge/add-backs/{id}/verify` -- mark add-back as verified

---

### SCREEN 7: BUDGET VARIANCE REVIEW
**URL**: `/companies/{companyId}/review/budget-comparison`
**Time spent**: 5-10 minutes
**Emotional state**: Evaluative -- is the company performing to plan?

Same as Sarah's Budget Comparison screen, with reviewer overlays:

**Board/PE Presentation Context**:
- Banner: "Budget variance data will be included in the PE portfolio dashboard."
- Highlight items with >10% variance (PE partners will ask about these)
- "Prepare talking points" section: auto-generated bullet points for PE discussion
  - "Revenue 2% above budget, driven by 3 new enterprise contracts"
  - "SGA 8% above budget, primarily due to unplanned legal costs ($45K)"
  - "EBITDA 5% above budget"

**David can add commentary**:
- "CFO Commentary" text area for each major variance
- This commentary flows to Marcus's dashboard as context

#### API Data Requirements
- Same as Sarah's budget comparison endpoints
- `PUT /sessions/{sessionId}/budget-comparison/cfo-commentary` -- save commentary

---

### SCREEN 8: GATE CHECKLIST (PRE-CERTIFICATION)
**URL**: `/companies/{companyId}/review/certification/gates`
**Time spent**: 2-5 minutes
**Emotional state**: Final verification, high responsibility

#### Layout
- Page title: "Certification Checklist"
- Subtitle: "Final verification before certifying February 2026"

**Comprehensive Gate List** (more detailed than Sarah's submission gates):

**Data Integrity Gates** (system-verified, cannot be overridden):
- [green] Trial balance is balanced (net: $0.00)
- [green] All accounts mapped to financial statements (367/367)
- [green] Income Statement foots (revenue - expenses = net income: verified)
- [green] Balance Sheet balances (assets = liabilities + equity: verified)
- [green] Cash flow reconciles to balance sheet cash
- [green] Equity statement reconciles to balance sheet equity
- [green] EBITDA bridge reconciles to income statement

**Review Completeness Gates** (David-verified):
- [green] All adjusting entries reviewed (14/14 approved)
- [green] All reconciliation exceptions reviewed (1/1 approved)
- [green] All material variance explanations reviewed (8/8 approved)
- [green] Income statement reviewed and marked complete
- [green] Balance sheet reviewed and marked complete
- [green] Cash flow statement reviewed and marked complete
- [green] Equity statement reviewed and marked complete
- [green] EBITDA bridge reviewed (add-backs verified)
- [amber] CFO commentary added for PE reporting (optional)

**Audit Trail Gate**:
- [green] Complete audit trail with no gaps
- Hash chain integrity: verified
- All actions logged with timestamps and actors

**Summary**:
- "All required gates passing. Ready to certify."
- Or: "X gates failing. Address before certification." with links to each

#### Actions
- Review each gate status
- Click failing gates to navigate to the issue
- Mark optional items as complete
- Proceed to certification ceremony

#### Navigation Trigger
- "Proceed to Certification" button (enabled only when all required gates pass)

#### API Data Requirements
- `GET /sessions/{sessionId}/certification/gates` -- comprehensive gate list with all checks

---

### SCREEN 9: CERTIFICATION CEREMONY
**URL**: `/companies/{companyId}/review/certification/certify`
**Time spent**: 1-3 minutes
**Emotional state**: Gravity, responsibility -- signing off on financials

**Context**: This is the most consequential action in the system. David is digitally signing that the financial statements are accurate and complete. The Ed25519 digital signature and hash-chained audit trail create a cryptographic record of this certification. This is not a casual "click approve" -- it is a formal signing ceremony.

#### Layout
- Page title: "Certify Financial Statements"
- Subtitle: "February 2026 Monthly Close -- Final Certification"

**Certification Summary** (clean, formal presentation):
- Company name in large text
- Period: "For the Month Ended February 28, 2026"
- Prepared by: Sarah Chen, Controller
- Reviewed and certified by: David Park, Chief Financial Officer

**Deliverables Being Certified** (checklist with document icons):
- [doc icon] Consolidated Statement of Income
- [doc icon] Consolidated Balance Sheet
- [doc icon] Consolidated Statement of Cash Flows
- [doc icon] Consolidated Statement of Stockholders' Equity
- [doc icon] Adjusted EBITDA Bridge
- [doc icon] Variance Analysis Report
- [doc icon] Budget Comparison Report (if applicable)
- [doc icon] Reconciliation Summary (45 accounts)
- [doc icon] Adjusting Entry Register (14 entries)
- [doc icon] Complete Audit Trail

**Key Metrics Being Certified**:
- Revenue: $42,145,678
- Net Income: $3,123,456
- Total Assets: $312,456,789
- Adjusted EBITDA: $9,123,456
- LTM Adjusted EBITDA: $104,523,456

**Certification Statement** (formal, must be read and acknowledged):
```
I, David Park, Chief Financial Officer of [Company Name], hereby certify
that the accompanying financial statements for the month ended February 28,
2026, have been prepared in accordance with Generally Accepted Accounting
Principles (GAAP) and present fairly, in all material respects, the
financial position, results of operations, and cash flows of the Company.

I have reviewed the adjusting entries, reconciliations, and variance
analyses supporting these statements and believe them to be complete and
accurate.

This certification is protected by an Ed25519 digital signature and
hash-chained audit trail ensuring the integrity and immutability of the
certified data.
```

**Acknowledgment Section**:
- Checkbox 1: "I have reviewed all financial statements and supporting documentation."
- Checkbox 2: "I confirm the financial data is complete and accurate to the best of my knowledge."
- Checkbox 3: "I understand this certification creates an immutable digital record."

**Authentication**:
- After checking all boxes, David must re-authenticate:
  - "Enter your password to certify" (password field)
  - Or: "Verify with your authenticator app" (MFA code field)
  - This prevents accidental certification and verifies identity

**Certify Button**:
- Large, prominent: "Certify and Sign" (green, full width)
- Disabled until all checkboxes checked and authentication provided
- On click: brief processing animation ("Generating digital signature...")

**Post-Certification Confirmation**:
- Full-page success state:
  - Green checkmark animation
  - "Financial statements certified successfully"
  - Certification ID: CERT-2026-02-001
  - Digital signature: `Ed25519:a7f3b2c1d8e9f4...` (full hash, copy button)
  - Audit trail hash: `SHA-256:e9d4f5a8b7c2...`
  - Timestamp: "March 6, 2026, 10:15:23 AM EST"
  - Verification URL: `https://verify.sabit.com/cert/CERT-2026-02-001`
  - "This URL can be shared with auditors for independent verification"

- **Action buttons**:
  - "Download Certified Package" (PDF bundle)
  - "Download Audit Binder" (complete package for auditors)
  - "Copy Verification URL"
  - "Return to Dashboard"

- **Notifications sent**:
  - Sarah Chen: "February 2026 close certified"
  - Marcus Webb: "February 2026 financials certified for [Company Name] -- dashboard updated"
  - Karen Whitfield: "Certified data available for LP reporting aggregation"

#### Actions
- Read certification statement
- Check acknowledgment boxes
- Re-authenticate
- Certify and sign
- Download certified package
- Share verification URL

#### Decisions
- Am I confident in these numbers? (The ceremony design forces a pause for reflection)
- Is everything truly ready?

#### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Authentication fails | "Incorrect password. Please try again." | Retry password |
| Signing error | "Unable to generate digital signature. Please try again." | Retry |
| Gates became invalid (data changed) | Red banner: "Certification cannot proceed. Gate [X] is no longer passing." | Return to gates |
| Network failure during signing | "Certification interrupted. Please verify the status." | Check certification status page |

#### API Data Requirements
- `GET /sessions/{sessionId}/certification/summary` -- certification summary data
- `POST /sessions/{sessionId}/certification/authenticate` -- verify password/MFA
- `POST /sessions/{sessionId}/certification/certify` -- execute certification, generate signature
  - Response: certificationId, signature, auditTrailHash, timestamp, verificationUrl
- `GET /sessions/{sessionId}/certification/status` -- check if certification completed (for recovery)
- `GET /sessions/{sessionId}/certification/package` -- download certified package

---

### SCREEN 10: POST-CERTIFICATION DASHBOARD
**URL**: `/companies/{companyId}/review` (same URL, different state)
**Time spent**: Brief -- David checks that everything propagated correctly
**Emotional state**: Relief, satisfaction, moving on to next company

#### Layout Changes
- Status pill: "Certified" (green)
- Green banner: "February 2026 close certified on Mar 6, 2026"
- All approval queue items show as approved
- Financial summary shows "Certified" stamp
- New section: "Certification Record"
  - Certifier, timestamp, signature hash, verification URL
- "Download" buttons for certified package and audit binder
- "Reopen Period" button (red, dangerous -- requires confirmation, sends notifications)

**If David manages multiple companies**:
- After certifying one company, the portfolio selector highlights the next company needing review
- Efficient flow: certify Company A, click "Next Company" to go straight to Company B's review

---

## B. DECISION TREE -- EVERY BRANCH DAVID FACES

### B1. Adjusting Entry Review

```
David sees AJE in approval queue
  |
  v
Reviews: amount, accounts, description, type, attachments
  |
  +---> Amount is reasonable and consistent with prior periods
  |       |
  |       +---> Supporting documentation is attached and adequate
  |       |       |
  |       |       v
  |       |     APPROVE (one click)
  |       |
  |       +---> No documentation attached
  |               |
  |               v
  |             REJECT: "Please attach supporting documentation (payroll register, schedule, etc.)"
  |
  +---> Amount has changed significantly from prior period (>10%)
  |       |
  |       v
  |     David reviews explanation (is the change justified?)
  |       |
  |       +---> Justified (new hire, rate change, etc.) --> APPROVE
  |       +---> Not justified or unclear --> REJECT: "Amount increased 11.8% from prior. Please explain."
  |
  +---> Accounting treatment seems wrong (wrong accounts, wrong sign)
  |       |
  |       v
  |     REJECT: "Debit should be to account 6200 not 6100. Please correct."
  |
  +---> David wants more information but doesn't want to reject
          |
          v
        Adds review comment (not a rejection): "FYI -- confirm this with HR before next close."
          |
          v
        APPROVE with comment
```

### B2. Variance Explanation Review

```
David sees variance explanation in queue
  |
  v
Reviews: variance amount, explanation quality, evidence
  |
  +---> Explanation is thorough, specific, and supported
  |       |
  |       v
  |     APPROVE
  |
  +---> Explanation is vague or generic ("Revenue increased due to market conditions")
  |       |
  |       v
  |     REJECT: "Explanation too vague. Need specific drivers: which customers, which products, what amounts."
  |
  +---> Explanation contradicts David's knowledge of the business
  |       |
  |       v
  |     REJECT: "The new customer contracts you mention were signed in March, not February. Please verify timing."
  |
  +---> AI-generated explanation accepted by Sarah without edits
  |       |
  |       v
  |     David reviews AI output quality:
  |       |
  |       +---> AI explanation is accurate and specific --> APPROVE
  |       +---> AI explanation has generic/hallucinated details
  |               |
  |               v
  |             REJECT: "AI-generated explanation references 'seasonal patterns' but our Q1 is typically flat. Please revise with actual drivers."
  |
  +---> Full-year impact projection seems off
          |
          v
        REJECT: "Full-year impact assumes linear extrapolation but this was a one-time event. Please adjust projection."
```

### B3. Reconciliation Exception Review

```
David sees reconciliation exception in queue
  |
  v
Reviews: account, GL balance, reconciled balance, difference, Sarah's explanation
  |
  +---> Difference is fully explained by legitimate reconciling items
  |       |
  |       +---> Items are documented with evidence --> APPROVE exception
  |       +---> Items are plausible but no evidence --> REJECT: "Please attach bank statement showing outstanding check."
  |
  +---> Difference is large and explanation is weak
  |       |
  |       v
  |     REJECT: "A $50K difference on a $4.5M account (1.1%) is significant. Need specific reconciling items, not general explanations."
  |
  +---> Difference suggests a real error (not timing)
          |
          v
        REJECT: "This appears to be a real discrepancy, not a timing issue. Investigate and post a correcting entry."
```

### B4. Certification Decision

```
David has reviewed all queue items and statements
  |
  v
All gates passing?
  |
  +---> YES
  |       |
  |       v
  |     David comfortable with the numbers?
  |       |
  |       +---> YES
  |       |       |
  |       |       v
  |       |     Proceed to certification ceremony
  |       |       |
  |       |       v
  |       |     Read certification statement, check boxes, authenticate
  |       |       |
  |       |       v
  |       |     CERTIFY
  |       |
  |       +---> NO (something seems off but he can't pinpoint it)
  |               |
  |               v
  |             Options:
  |               +---> "Request Changes" with general comment: "Revenue trend seems unusual. Let's discuss before certifying."
  |               +---> Schedule call with Sarah (outside Sabit)
  |               +---> Flag specific items for further investigation
  |
  +---> NO (gates failing)
          |
          v
        Cannot certify. "Request Changes" to send back to Sarah with specific issues.
```

### B5. Reopen Decision

```
David receives request to reopen (from Sarah) or decides to reopen
  |
  v
Reviews reason for reopening
  |
  +---> Material error that affects reported numbers
  |       |
  |       v
  |     APPROVE reopening
  |       |
  |       v
  |     Marcus and Karen are notified that numbers are being revised
  |
  +---> Minor correction that doesn't affect key metrics
  |       |
  |       v
  |     APPROVE but note: "Approve, but please keep the correction minimal."
  |
  +---> Request seems unnecessary (cosmetic or immaterial)
          |
          v
        DENY: "This is immaterial. Address in next period."
```

---

## C. INTER-PERSONA HANDOFFS

### C1. What David Sees When Sarah Submits

Covered in Sarah's handoff section C1. Key additions from David's perspective:

1. **Notification**: bell icon badge, email, and optional Slack/Teams webhook
2. **Portfolio card**: company status changes to "Awaiting Your Review" with red pulsing indicator
3. **Review Dashboard**: populates with full close package
4. **Approval Queue**: all items appear as "Pending" cards
5. **Statements**: available for review with Sarah's annotations
6. **Timeline**: shows submission timestamp, David's target review window

### C2. What Sarah Sees When David Rejects

Covered in Sarah's handoff section C2. Key additions from David's perspective:

**David's rejection workflow**:
1. David clicks "Reject" on a queue item
2. Comment field appears (required, minimum 20 characters)
3. David types specific, actionable feedback
4. David can reject individual items while approving others
5. When David clicks "Request Changes" (general send-back):
   - Can add a general comment covering all rejections
   - Can specify urgency: "Please address by [date]"
   - Session status changes from "In Review" to "Changes Requested"
   - David can continue reviewing other companies while Sarah works on fixes

### C3. What Marcus Webb (PE Partner) Sees When David Certifies

**Trigger**: David certifies February 2026 close.

**What happens on Marcus's side**:
1. Marcus's portfolio dashboard updates automatically (within minutes)
2. Company card for this entity shows updated financials
3. Notification to Marcus: "[Company Name] February 2026 financials certified by David Park."
4. EBITDA trend chart updates with new data point
5. Covenant proximity indicators recalculate
6. If any covenant is within 10% of breach: amber alert on Marcus's dashboard
7. Portfolio-level aggregation recalculates (total AUM EBITDA, etc.)
8. Karen's fund controller aggregation is updated with certified data

---

## D. FIRST-TIME VS REPEAT EXPERIENCE

### D1. First Close (David's First Review)

- David sees onboarding prompt: "Welcome to your review dashboard. Here's how certification works."
- Guided tour highlighting: Approval Queue, Statement Review, Certification
- No historical comparison data (prior close metrics unavailable)
- No trend sparklines
- Certification ceremony includes additional educational text about Ed25519 signatures
- David may take 3-4 hours for first review (vs 1-2 hours for repeat)

### D2. Second Close

- Prior period comparisons available in all statements
- Close cycle metrics begin tracking (1 data point)
- David develops a routine: queue first, then statements, then certify
- Review time: 2-3 hours

### D3. Sixth Close

- David has pattern recognition: knows which items are routine and which need scrutiny
- Historical close metrics show trends
- AI explanations have improved (David's prior feedback trained the pattern)
- David may batch-approve routine items, focus only on anomalies
- Review time: 1-2 hours
- May configure "auto-approve" for certain recurring AJE types under $X threshold (future feature)

### D4. Year-End Close

- More scrutiny: David reviews every item individually (no batch approve)
- Auditor awareness: David knows James Wright will review this close
- Additional checks: ensure audit binder is complete
- May request additional reconciliation documentation from Sarah
- Review time: 4-8 hours over several sessions
- Certification statement carries more weight (annual vs monthly)

---

## E. EDGE CASES

### E1. David is Unavailable -- Delegate Must Certify

**Scenario**: David is traveling, ill, or unreachable. Close deadline approaching.

**User Experience**:
1. Company settings > Delegation: David has pre-configured a delegate (e.g., VP of Finance)
2. If no delegate configured and David is unresponsive:
   - Sarah sees: "Awaiting review by David Park. Submitted 3 days ago. No response."
   - Sarah cannot escalate within system (must contact David or PE firm directly)
   - No auto-escalation (financial certification is too serious for auto-delegation)
3. If delegate is configured:
   - After configurable timeout (default: 48 hours), delegate receives notification
   - "David Park has not reviewed the February 2026 close. As designated delegate, you may review and certify."
   - Delegate logs in with their own credentials
   - Sees same review dashboard as David
   - Certification statement shows delegate name: "Certified by [Delegate Name] as delegated authority for David Park, CFO"
   - David and Marcus are notified of delegate certification
   - Audit trail records the delegation

**Configuration** (David's settings):
- "Delegate reviewer": dropdown of company users with appropriate role
- "Delegation triggers after": 24 hours | 48 hours | 72 hours | Manual only
- "Notify me when delegate acts": on/off

### E2. David Finds a Material Error During Review

**Scenario**: David notices revenue is overstated by $500K due to a contract misclassification.

**User Experience**:
1. David is reviewing Income Statement, notices Product Revenue seems high
2. Drills into Product Revenue line item, sees Account 4100 includes $500K from a contract that should be Deferred Revenue
3. David has two options:

**Option A: Reject and send back to Sarah**
1. David clicks "Flag Issue" on the revenue line
2. Adds comment: "Account 4100 includes $500K from the TechCorp contract. This contract has a delivery milestone in March -- revenue should be deferred. Please create a reclassification AJE."
3. David clicks "Request Changes"
4. Session goes back to Sarah with specific feedback
5. Sarah creates a reclassification AJE (Dr. Revenue $500K, Cr. Deferred Revenue $500K)
6. Sarah resubmits
7. David re-reviews and certifies

**Option B: Minor correction -- David asks Sarah to fix and re-submit quickly**
1. David adds review comment on the line item
2. Calls Sarah directly (outside system)
3. Sarah posts the correction AJE while session is "Changes Requested"
4. Fast turnaround: David re-reviews the specific item and certifies

**In all cases**: the error, correction, and communication are logged in the audit trail.

### E3. David Needs to Reopen a Certified Period

**Scenario**: After certification, external auditor James Wright finds a material misstatement requiring correction.

**User Experience**:
1. David navigates to the certified session (Feb 2026)
2. Clicks "Reopen Period" button
3. Warning modal (same as described in Sarah's section, but David can execute directly):
   - "Reopening will invalidate the digital signature"
   - "All stakeholders will be notified"
   - "Numbers on Marcus's dashboard will be marked as 'Under Revision'"
   - Reason required: "External audit identified $200K revenue misstatement requiring ASC 606 correction."
4. David clicks "Reopen"
5. Session status: "Reopened" (red)
6. Notifications sent to: Sarah, Marcus, Karen
7. Marcus's dashboard: company card shows "Numbers Under Revision" (red warning)
8. Karen's aggregation: certified data marked as provisional
9. Sarah makes corrections
10. Full re-certification cycle

---

## F. NOTIFICATIONS

### F1. Notification Triggers for David

| Trigger | Channel | Message | Priority |
|---------|---------|---------|----------|
| Sarah submits close for review | In-app, email, Slack | "Sarah Chen submitted February 2026 close for [Company Name] for your review. 7 items pending." | Critical |
| Sarah resubmits after changes | In-app, email | "Sarah Chen resubmitted February 2026 close with requested changes. 2 items revised." | High |
| Close target date approaching (David hasn't reviewed) | In-app, email | "February 2026 close for [Company Name] awaits your review. Target: Mar 10 (3 days away)." | High |
| Close target date passed (David hasn't reviewed) | In-app, email | "February 2026 close for [Company Name] is overdue for review. Submitted 5 days ago." | Critical |
| Sarah requests period reopening | In-app, email | "Sarah Chen requests reopening the February 2026 certified close. Reason: '[first 100 chars]'" | Critical |
| Delegate certifies on David's behalf | In-app, email | "[Delegate Name] certified February 2026 for [Company Name] as your delegate." | High |
| Auditor (James Wright) requests access | In-app, email | "James Wright (External Auditor) accessed the audit binder for February 2026." | Normal |
| Covenant proximity alert | In-app, email | "[Company Name] LTM EBITDA is within 15% of senior debt covenant minimum." | Critical |
| Cross-statement validation warning | In-app | "Statements for [Company Name] have a validation warning. Review before certifying." | High |

### F2. Notification Display

Same notification infrastructure as Sarah's (bell, email, Slack webhook). Key differences:
- David's notifications emphasize urgency and business impact
- Covenant alerts are David-specific (Sarah doesn't see these)
- "Items pending your review" count is always visible in the top nav: "Review (7)" badge

---

## G. DATA REQUIREMENTS PER SCREEN

| Screen | Primary API Endpoint | Key Data | Payload Size | Cache |
|--------|---------------------|----------|-------------|-------|
| Portfolio | `GET /users/me/companies` | Companies with review status, pending counts | <10KB | 60s |
| Review Dashboard | `GET /companies/{id}/review/dashboard` | Queue summary, financials, gates, timeline, trends | 20-50KB | 30s |
| Approval Queue | `GET /companies/{id}/review/approval-queue` | Full detail of all pending items | 20-100KB | No cache (live) |
| Financial Statements | `GET /sessions/{id}/statements/{type}` | Same as Sarah's endpoints | 20-100KB per statement | Until regeneration |
| EBITDA Bridge | `GET /sessions/{id}/statements/ebitda-bridge` + covenants + trends | Bridge + PE context | 20-50KB | Until regeneration |
| Budget Comparison | `GET /sessions/{id}/budget-comparison` | Same as Sarah | 20-100KB | Until regeneration |
| Gate Checklist | `GET /sessions/{id}/certification/gates` | All gates, comprehensive | <10KB | No cache |
| Certification | `POST /sessions/{id}/certification/certify` | Certification execution | <5KB | No cache |
| Post-Certification | `GET /sessions/{id}/certification/status` | Cert record, signature, hashes | <5KB | Immutable after cert |

### David-Specific API Endpoints (not shared with Sarah)
- `GET /users/me/pending-actions/summary` -- aggregate pending items across all companies
- `PUT /sessions/{id}/adjustments/{entryId}/approve` -- approve AJE
- `PUT /sessions/{id}/adjustments/{entryId}/reject` -- reject AJE
- `PUT /sessions/{id}/reconciliation/{accountId}/approve-exception`
- `PUT /sessions/{id}/reconciliation/{accountId}/reject-exception`
- `PUT /sessions/{id}/variance-analysis/{varianceId}/approve`
- `PUT /sessions/{id}/variance-analysis/{varianceId}/reject`
- `PUT /sessions/{id}/review/approve-all` -- batch approve
- `PUT /sessions/{id}/review/request-changes` -- send back to Sarah
- `POST /sessions/{id}/statements/{type}/review-comments`
- `PUT /sessions/{id}/statements/{type}/mark-reviewed`
- `POST /sessions/{id}/certification/authenticate`
- `POST /sessions/{id}/certification/certify`
- `POST /sessions/{id}/reopen` -- reopen certified period
- `PUT /sessions/{id}/reopen-requests/{requestId}/approve` -- approve Sarah's reopen request
- `PUT /sessions/{id}/reopen-requests/{requestId}/deny`
- `PUT /companies/{id}/settings/delegation` -- configure delegate
- `PUT /sessions/{id}/budget-comparison/cfo-commentary`
- `PUT /sessions/{id}/ebitda-bridge/add-backs/{id}/verify`



---

# MARCUS WEBB -- PE OPERATING PARTNER
# COMPLETE SCREEN-BY-SCREEN JOURNEY

Marcus monitors 15-23 portfolio companies. He spends 10 minutes per week maximum.
His mental model: "Show me problems. If there are no problems, I'm done."

---

## SCREEN 1: LOGIN

**URL**: `/login`
**Time spent**: 15 seconds
**Emotional state**: Impatient. Marcus is checking Sabit between board calls or from his phone in a car.

### Layout
```
+----------------------------------------------------------+
|  [Sabit Logo]                                            |
|                                                          |
|  Welcome back, Marcus                                    |
|  [Email field, pre-filled if remembered]                 |
|  [Password field]                                        |
|  [Sign In button, full-width, primary color]             |
|                                                          |
|  [SSO: Sign in with Okta] [Sign in with Azure AD]       |
|  [Forgot password link]                                  |
+----------------------------------------------------------+
```

### Content Blocks
- **Logo**: Top-center, 40px height
- **Welcome message**: If returning user and email is stored in localStorage, show "Welcome back, Marcus". Otherwise show "Sign in to Sabit".
- **Email field**: `type="email"`, autofocus, autocomplete="email"
- **Password field**: `type="password"`, autocomplete="current-password", show/hide toggle icon
- **Sign In button**: Full width, 48px height, primary brand color, text "Sign In"
- **SSO buttons**: Below divider line reading "or". Each SSO button is full width, outlined style, provider logo left-aligned, text center-aligned. Only show SSO options configured for Marcus's fund.
- **Forgot password**: Small text link, centered below SSO buttons

### Actions Available
1. Enter credentials and submit
2. Click SSO provider button
3. Click "Forgot password"

### Decisions Made
- None. Marcus wants to get past this screen as fast as possible.

### Navigation Triggers
- Successful authentication -> redirect to `/portfolio` (Portfolio Dashboard)
- Failed authentication -> inline error, stay on page
- Forgot password -> `/reset-password`
- SSO click -> redirect to IdP, then callback to `/portfolio`

### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Wrong password | Red text below password field: "Incorrect password. Try again or reset your password." Password field gets red border. Field is NOT cleared. | User retries or clicks reset |
| Account locked (5 failures) | Red banner: "Account temporarily locked. Try again in 15 minutes or contact your fund administrator." Sign In button disabled, grayed out. | Wait or contact admin |
| SSO failure | Red banner: "SSO sign-in failed. Contact your IT administrator. Error: [provider_error_code]" | Retry or use password |
| Network error | Red banner: "Unable to connect. Check your internet connection and try again." Retry button appears. | Retry |
| Session expired (redirected here) | Yellow info banner at top: "Your session expired. Please sign in again." | Normal sign-in |

### API Data Requirements
- **POST** `/api/v1/auth/login` -- body: `{ email, password }`
- **Response**: `{ access_token, refresh_token, user: { id, name, role, fund_id, mfa_required } }`
- **If MFA required**: redirect to `/login/mfa` (not detailed here, standard TOTP/SMS flow)

---

## SCREEN 2: PORTFOLIO DASHBOARD (Primary Screen)

**URL**: `/portfolio`
**Time spent**: 3-4 minutes (this is where Marcus spends most of his time)
**Emotional state**: Scanning mode. He wants to see red/yellow/green at a glance. If everything is green, he's done in 90 seconds.

### Layout
```
+----------------------------------------------------------+
| [Sabit Logo]  Portfolio Overview    [Bell icon w/ badge]  |
|               Fund: Apex Growth III  [Marcus W. avatar v] |
+----------------------------------------------------------+
| ALERT BAR (conditional -- only if alerts exist)           |
| [!] 3 companies require attention         [View All ->]  |
+----------------------------------------------------------+
|                                                          |
| KPI STRIP (horizontal row of 4 cards)                    |
| +------------+ +------------+ +------------+ +----------+|
| | Portfolio   | | Avg Close  | | Companies  | | Covenant ||
| | EBITDA      | | Cycle      | | Certified  | | Alerts   ||
| | $847.2M     | | 4.2 days   | | 18/21      | | 2        ||
| | +3.1% QoQ   | | -0.8 days  | | 86% done   | | [!] warn ||
| +------------+ +------------+ +------------+ +----------+|
|                                                          |
| ENTITY GRID                                              |
| [Search entities...] [Filter: All | Attention | On Track]|
| [Sort: Status | EBITDA | Close Date | Name]              |
|                                                          |
| +------------------------------------------------------+ |
| | ATTENTION NEEDED (sorted to top, red/yellow left bar) | |
| |                                                       | |
| | Meridian Manufacturing    $42.1M EBITDA   Close: 8d   | |
| | [RED] Covenant w/in 3%    Overdue 3 days  [->]        | |
| |                                                       | |
| | Cascade Logistics         $67.3M EBITDA   Close: 5d   | |
| | [YELLOW] EBITDA -4.2% MoM  On track      [->]        | |
| |                                                       | |
| +------------------------------------------------------+ |
| | ON TRACK                                              | |
| |                                                       | |
| | Summit Healthcare         $91.0M EBITDA   Close: 3d   | |
| | [GREEN] Certified          Complete       [->]        | |
| |                                                       | |
| | ... (remaining entities)                              | |
| +------------------------------------------------------+ |
|                                                          |
| [Export Board Package v]                                  |
+----------------------------------------------------------+
```

### Content Blocks -- Detailed

#### Top Navigation Bar
- **Left**: Sabit logo (links to `/portfolio`), page title "Portfolio Overview"
- **Center-right**: Fund name as label text, non-interactive. If Marcus has access to multiple funds, this becomes a dropdown selector.
- **Right**: Notification bell icon with red badge showing unread count. Clicking opens notification panel (slide-in from right). User avatar with dropdown: Settings, Help, Sign Out.

#### Alert Bar
- **Condition**: Only renders if `alerts.length > 0`
- **Background**: `--color-warning-50` (light amber)
- **Left**: Warning icon + text: "{count} companies require attention"
- **Right**: "View All" link that scrolls to and filters the entity grid to show only attention-needed companies
- **Dismiss**: No dismiss. This bar persists as long as alerts exist.

#### KPI Strip
Four cards in a horizontal row. On mobile, these become a 2x2 grid.

**Card 1: Portfolio EBITDA (Aggregate)**
- **Label**: "Portfolio EBITDA" (small, muted text)
- **Value**: Dollar amount, formatted with 1 decimal, e.g., "$847.2M"
- **Subtext**: QoQ change with directional arrow. Green if positive, red if negative. E.g., "+3.1% QoQ" with up arrow.
- **Click**: Navigates to `/portfolio/ebitda-trends`

**Card 2: Average Close Cycle**
- **Label**: "Avg Close Cycle"
- **Value**: Days with 1 decimal, e.g., "4.2 days"
- **Subtext**: Change from prior period. Green if negative (faster), red if positive (slower). E.g., "-0.8 days" with down arrow.
- **Click**: No navigation. Tooltip on hover: "Average business days from period end to certification across all active entities."

**Card 3: Companies Certified**
- **Label**: "Companies Certified"
- **Value**: Fraction, e.g., "18/21"
- **Subtext**: Percentage + context, e.g., "86% done -- March 2026 close"
- **Progress bar**: Thin bar below the value, filled proportionally, green fill on gray track.
- **Click**: No navigation. Highlights uncertified entities in the grid below.

**Card 4: Covenant Alerts**
- **Label**: "Covenant Alerts"
- **Value**: Count of entities with covenant proximity warnings, e.g., "2"
- **Subtext**: If count > 0, show warning icon + "Action needed". If 0, show green check + "All clear".
- **Click**: Navigates to `/portfolio/covenants` OR filters entity grid to covenant-flagged entities.

#### Entity Grid
This is the primary data table. Each row represents one portfolio company.

**Search bar**: Text input, placeholder "Search entities...", searches by company name. Debounced 300ms. Results filter in real-time.

**Filter tabs**: Segmented control with options:
- "All" (default) -- shows all entities
- "Attention" -- shows only red/yellow status entities
- "On Track" -- shows only green status entities
- "Certified" -- shows only fully certified entities

**Sort control**: Dropdown or clickable column headers. Options: Status (default, attention first), EBITDA (descending), Close Date (ascending, overdue first), Name (alphabetical).

**Entity Row -- Anatomy**:
```
+--+----------------------------------------------------+
|  | Company Name                    EBITDA    Close     |
|  | Status Badge  Status Detail     Trend     Status    |
|  |                                           [-> btn]  |
+--+----------------------------------------------------+
 ^
 | Color bar: 4px left border
 | Red = attention required
 | Yellow = warning
 | Green = on track / certified
```

**Row fields**:
| Field | Source | Format |
|-------|--------|--------|
| Company Name | `entity.name` | Text, 16px, font-weight 600 |
| EBITDA | `entity.current_period.ebitda` | "$XX.XM" formatted |
| EBITDA Trend | `entity.ebitda_mom_change` | Small spark line (last 6 months) OR percentage with arrow |
| Close Cycle | `entity.current_period.close_days` | "X days" |
| Close Status | Computed from `entity.current_period.status` | "Certified", "In Progress", "Overdue X days", "Not Started" |
| Status Badge | Computed from alerts | Pill-shaped badge with icon + short text |
| Arrow button | -- | Chevron-right icon, navigates to entity detail |

**Row grouping**: Rows are grouped into sections with headers:
1. "Attention Needed" (red/yellow status) -- always expanded, sorted by severity
2. "In Progress" (active close, no alerts) -- expanded by default
3. "Certified" (close complete) -- collapsed by default, click header to expand

**Row click behavior**: Entire row is clickable. Navigates to `/portfolio/{entity_id}`.

#### Export Button
- **Position**: Bottom-right of page content, sticky on scroll
- **Style**: Secondary button with dropdown caret
- **Dropdown options**:
  - "Board Package (PDF)" -- generates a multi-entity board summary PDF
  - "Board Package (PPTX)" -- generates PowerPoint with one slide per entity
  - "Raw Data (Excel)" -- exports entity grid data as XLSX
  - "Custom Report..." -- opens report builder modal (future feature, grayed out with "Coming Soon" tooltip)

### Actions Available
1. Click entity row -> navigate to entity detail
2. Click KPI card -> navigate to relevant drill-down
3. Search / filter / sort entities
4. Click notification bell -> view alerts
5. Export board package
6. Switch fund (if multi-fund access)
7. Sign out

### Decisions Made on This Screen
- "Are there problems?" -- Scan alert bar and red/yellow rows
- "Which company needs my attention first?" -- Top of attention section
- "Is the close on track overall?" -- KPI strip gives aggregate view
- "Do I need to call anyone?" -- Overdue companies or covenant alerts trigger this
- "Am I done?" -- If all green, yes

### Navigation Triggers
| User Action | Destination | Condition |
|-------------|-------------|-----------|
| Click entity row | `/portfolio/{entity_id}` | Always |
| Click Portfolio EBITDA KPI | `/portfolio/ebitda-trends` | Always |
| Click Covenant Alerts KPI | `/portfolio/covenants` | Always |
| Click Export > Board Package | Triggers download, stays on page | Always |
| Click notification bell | Slide-in notification panel | Always |
| Click avatar > Settings | `/settings` | Always |
| Click avatar > Sign Out | `/login` | Always |

### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Portfolio data fails to load | Full-page error: "Unable to load portfolio data. Our team has been notified." Retry button. | Retry or wait |
| Single entity data fails | That entity row shows gray state: "Unable to load" with retry icon | Click retry icon on row |
| Export fails | Toast notification: "Export failed. Please try again." | Retry export |
| No entities in portfolio | Empty state: illustration + "No portfolio companies yet. Companies will appear here once they're added to your fund." | Contact fund admin |
| Stale data (>1 hour old) | Yellow banner below nav: "Data last updated {time}. Refresh to see latest." Refresh button. | Click refresh |

### Loading States
- **Initial load**: Skeleton screen. KPI strip shows 4 gray pulsing rectangles. Entity grid shows 6 skeleton rows with pulsing bars.
- **Search/filter**: Inline spinner in search field. Grid filters instantly (client-side if <50 entities, server-side otherwise).
- **Export**: Button shows spinner and text changes to "Generating..." Button is disabled during generation. On complete: browser download triggers, button resets, toast: "Board package downloaded."

### API Data Requirements
```
GET /api/v1/portfolio/{fund_id}/dashboard
Response: {
  fund: { id, name, vintage_year },
  kpis: {
    aggregate_ebitda: { value, currency, qoq_change_pct },
    avg_close_cycle_days: { value, change_from_prior },
    certification_progress: { certified_count, total_count, period_label },
    covenant_alert_count: number
  },
  alerts: [
    { id, entity_id, entity_name, type, severity, message, created_at }
  ],
  entities: [
    {
      id, name, sector,
      current_period: {
        period_end, status, close_days, ebitda, ebitda_currency,
        ebitda_mom_change_pct, certified_at, certified_by
      },
      alerts: [ { type, severity, message } ],
      covenant_proximity: { nearest_covenant, headroom_pct }
    }
  ]
}
```

---

## SCREEN 3: ENTITY DETAIL

**URL**: `/portfolio/{entity_id}`
**Time spent**: 1-2 minutes per entity (only visits 2-3 entities per session, usually only flagged ones)
**Emotional state**: Investigative. Marcus is here because something was flagged. He wants to understand the problem and decide whether to act.

### Layout
```
+----------------------------------------------------------+
| [<- Back to Portfolio]  Meridian Manufacturing            |
|                         March 2026 Close                  |
+----------------------------------------------------------+
| ENTITY KPI STRIP                                         |
| +----------+ +----------+ +----------+ +-----------+     |
| | Revenue  | | EBITDA   | | EBITDA   | | Close     |     |
| | $142.3M  | | $42.1M   | | Margin   | | Status    |     |
| | +2.1% MoM| | -1.3% MoM| | 29.6%   | | Day 8/5   |     |
| +----------+ +----------+ +----------+ +-----------+     |
+----------------------------------------------------------+
|                                                          |
| [Financial Summary] [EBITDA Bridge] [Variances] [Close]  |
|                                                          |
| TAB CONTENT AREA                                         |
| (content changes based on selected tab)                  |
|                                                          |
+----------------------------------------------------------+
```

### Content Blocks

#### Breadcrumb / Back Navigation
- Left-aligned: Back arrow + "Back to Portfolio" (links to `/portfolio`)
- Entity name: Large heading, 24px, bold
- Period context: Below entity name, muted text: "March 2026 Close"

#### Entity KPI Strip
Four cards, same pattern as portfolio KPIs but entity-specific.

**Card 1: Revenue**
- Value: Current period revenue, e.g., "$142.3M"
- Subtext: MoM change with arrow and color

**Card 2: EBITDA**
- Value: Current period EBITDA, e.g., "$42.1M"
- Subtext: MoM change. Red if declining.

**Card 3: EBITDA Margin**
- Value: EBITDA / Revenue as percentage, e.g., "29.6%"
- Subtext: Change from prior period in basis points, e.g., "-120 bps"

**Card 4: Close Status**
- Value: "Day {current}/{target}", e.g., "Day 8/5"
- Subtext: If overdue, red text: "Overdue 3 days". If on track, green: "On track". If certified, green check: "Certified {date}".

#### Tab Navigation
Horizontal tab bar with four tabs:

**Tab 1: Financial Summary** (default)
- Condensed income statement: Revenue, COGS, Gross Profit, OpEx (by category), EBITDA, D&A, EBIT, Interest, Tax, Net Income
- Each line shows: Current Month | Prior Month | YTD | Budget | Variance
- Variance column is color-coded: green if favorable, red if unfavorable, bold if material (>5%)
- Material variances have a small info icon that shows AI-drafted explanation on hover/click
- This is READ-ONLY for Marcus. No editing capability.

**Tab 2: EBITDA Bridge**
- Waterfall chart showing EBITDA walk from prior period to current period
- Bars: Prior Period EBITDA -> Revenue Impact -> COGS Impact -> OpEx Impact -> One-Time Items -> Add-Backs -> Current Period EBITDA
- Below chart: Table with line-item detail for each bridge category
- Add-backs section clearly labeled with PE add-back categories (management fees, transaction costs, one-time restructuring, etc.)
- Each add-back shows: Description, Amount, Classification, Approved By

**Tab 3: Variances**
- List of material variances (>5% or >$X threshold, configurable per entity)
- Each variance card shows:
  - Account/Category name
  - Actual vs Budget vs Prior Period
  - Variance amount and percentage
  - AI-drafted IRAC justification (collapsible, expanded by default for top 3)
  - Full-year impact projection: "If this trend continues, full-year EBITDA impact: -$2.1M"
  - Status: "Reviewed by CFO" or "Pending CFO review"

**Tab 4: Close Status**
- Timeline/checklist showing close process steps:
  - GL Upload (complete, date)
  - Trial Balance (complete, date)
  - Account Classification (complete, date)
  - Reconciliation (in progress, X/Y accounts reconciled)
  - Adjusting Entries (pending approval, X entries)
  - Financial Statement Generation (not started)
  - CFO Review (not started)
  - Certification (not started)
- Each step shows: status icon, step name, completion date or blocker, assigned person

### Actions Available
1. Navigate between tabs
2. Hover/click variance explanations to read AI-drafted IRAC
3. Click "View Full Financial Statements" link (in Financial Summary tab) -> `/portfolio/{entity_id}/statements`
4. Click "Export Entity Report" button -> downloads single-entity PDF
5. Click back to return to portfolio
6. Click close status items to see detail

### Decisions Made
- "What's wrong with this company?" -- KPIs and variance tab answer this
- "Is this a real problem or a timing issue?" -- IRAC explanations help
- "Do I need to call the CFO?" -- If material issues are unexplained or pending review
- "What's the full-year impact?" -- Projection answers this

### Navigation Triggers
| User Action | Destination |
|-------------|-------------|
| Click Back to Portfolio | `/portfolio` |
| Click tab | Changes tab content, URL updates to `/portfolio/{entity_id}?tab={tab_name}` |
| Click "View Full Financial Statements" | `/portfolio/{entity_id}/statements` |
| Click Export | Triggers download |

### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Entity not found | "This company was not found or you don't have access." Back to Portfolio button. | Navigate back |
| Partial data load failure | Affected tab shows: "Unable to load {tab} data." Retry link. Other tabs still work. | Retry tab |
| No current period data | Info state: "No close in progress for March 2026. Last certified period: February 2026." Link to view last period. | View prior period |

### API Data Requirements
```
GET /api/v1/portfolio/{fund_id}/entities/{entity_id}/detail
Response: {
  entity: { id, name, sector, fiscal_year_end },
  current_period: {
    period_end, status, close_day, target_close_days,
    certified_at, certified_by
  },
  kpis: {
    revenue: { value, mom_change_pct },
    ebitda: { value, mom_change_pct },
    ebitda_margin: { value, change_bps },
  },
  financial_summary: {
    line_items: [
      { label, current_month, prior_month, ytd, budget, variance_amt, variance_pct, is_material, ai_explanation }
    ]
  },
  ebitda_bridge: {
    prior_ebitda, current_ebitda,
    components: [ { label, amount, category } ],
    addbacks: [ { description, amount, classification, approved_by } ]
  },
  variances: [
    { id, account, actual, budget, prior, variance_amt, variance_pct,
      irac_justification, full_year_impact, cfo_reviewed, cfo_reviewed_at }
  ],
  close_status: {
    steps: [
      { name, status, completed_at, assigned_to, blocker }
    ]
  }
}
```

---

## SCREEN 4: EBITDA TRENDS

**URL**: `/portfolio/ebitda-trends`
**Time spent**: 1-2 minutes
**Emotional state**: Analytical. Marcus is looking for patterns across the portfolio.

### Layout
```
+----------------------------------------------------------+
| [<- Back to Portfolio]  EBITDA Trends                     |
+----------------------------------------------------------+
| CONTROLS                                                  |
| Period: [Last 6 months v]  View: [All | By Sector v]     |
| Display: [$ Absolute] [% Margin] toggle                  |
+----------------------------------------------------------+
|                                                          |
| TREND CHART (multi-line or stacked area)                 |
| Y-axis: EBITDA ($M or %)                                 |
| X-axis: Months                                           |
| One line per entity, color-coded                         |
| Hover shows tooltip with entity name + value             |
|                                                          |
| Legend below chart (clickable to toggle lines)            |
+----------------------------------------------------------+
|                                                          |
| TREND TABLE                                              |
| Entity | Oct | Nov | Dec | Jan | Feb | Mar | Trend      |
| -------|-----|-----|-----|-----|-----|-----|-------       |
| Summit | 91  | 92  | 94  | 93  | 95  | 91  | [sparkline]|
| ...    |     |     |     |     |     |     |             |
+----------------------------------------------------------+
```

### Content Blocks

#### Controls Bar
- **Period selector**: Dropdown: "Last 3 months", "Last 6 months" (default), "Last 12 months", "YTD", "Custom range"
- **View selector**: "All" shows every entity. "By Sector" groups and colors lines by sector (Healthcare, Manufacturing, etc.)
- **Display toggle**: Two-button segmented control. "$ Absolute" shows dollar values. "% Margin" shows EBITDA margin percentage.

#### Trend Chart
- **Type**: Multi-line chart. Each entity is one line.
- **Interaction**: Hover on any point shows tooltip: Entity name, period, EBITDA value, MoM change. Click on a line highlights it and dims others. Click on legend item toggles line visibility.
- **Highlighting**: Entities with declining EBITDA (3+ consecutive months) have their line drawn thicker with a warning icon at the latest data point.
- **Zero/negative**: If any entity has negative EBITDA, the chart shows a zero baseline with negative area shaded red.

#### Trend Table
- Tabular data below the chart showing the same information in grid format
- Each cell is color-coded: green background if MoM increase, red if decrease, neutral if flat (<1% change)
- Last column "Trend" shows a miniature sparkline and an arrow (up/down/flat)
- Row click navigates to entity detail

### Actions Available
1. Change time period
2. Toggle view mode (all vs by sector)
3. Toggle display (absolute vs margin)
4. Hover for data points
5. Click entity in chart or table -> navigate to entity detail
6. Export chart as PNG or data as CSV (small export icon top-right of chart)

### API Data Requirements
```
GET /api/v1/portfolio/{fund_id}/ebitda-trends?months=6
Response: {
  period_range: { start, end },
  entities: [
    {
      id, name, sector,
      periods: [
        { period_end, ebitda, ebitda_margin, revenue, mom_change_pct }
      ],
      consecutive_decline_months: number
    }
  ]
}
```

---

## SCREEN 5: COVENANT PROXIMITY

**URL**: `/portfolio/covenants`
**Time spent**: 30-60 seconds (only visits if KPI shows alerts)
**Emotional state**: Concerned. Marcus is here because something is close to breaching.

### Layout
```
+----------------------------------------------------------+
| [<- Back to Portfolio]  Covenant Monitoring                |
+----------------------------------------------------------+
|                                                          |
| COVENANT GRID                                            |
| +------------------------------------------------------+ |
| | Entity         | Covenant        | Current | Limit   | |
| |                |                 | Value   |         | |
| |----------------|-----------------|---------|---------|  |
| | Meridian Mfg   | Leverage Ratio  | 3.8x   | 4.0x   | |
| |                | [=========95%===  ]       | 5% headroom|
| |                | DSCR            | 1.22x  | 1.15x  | |
| |                | [======78%====    ]       | 6% headroom|
| |----------------|-----------------|---------|---------|  |
| | Cascade Log    | Leverage Ratio  | 3.2x   | 4.0x   | |
| |                | [====60%===       ]       | 20% headroom|
| +------------------------------------------------------+ |
|                                                          |
| Color key: [RED <5%] [YELLOW 5-15%] [GREEN >15%]        |
+----------------------------------------------------------+
```

### Content Blocks

#### Covenant Grid
- Grouped by entity, each entity shows all its tracked covenants
- Each covenant row shows:
  - Covenant name (e.g., "Total Leverage Ratio", "DSCR", "Fixed Charge Coverage")
  - Current calculated value
  - Covenant limit/threshold
  - Visual progress bar showing proximity (fills from left; red when >85% of limit consumed)
  - Headroom percentage text
- **Color coding**:
  - Red: <5% headroom (critical)
  - Yellow: 5-15% headroom (warning)
  - Green: >15% headroom (healthy)
- Entities sorted by worst covenant headroom ascending (most critical first)

#### Trend Sparkline
- Next to each covenant, a small sparkline showing the last 6 periods of that ratio
- Directional arrow indicating whether the ratio is improving or deteriorating

### Actions Available
1. Click entity name -> navigate to entity detail
2. Hover covenant bar for exact values and calculation formula
3. Export covenant summary

### Error States
- No covenants configured: "No covenants are being tracked. Covenants are configured by the fund controller."
- Missing data for calculation: Yellow warning: "Insufficient data to calculate {covenant_name} for {period}. Last calculated: {date}."

### API Data Requirements
```
GET /api/v1/portfolio/{fund_id}/covenants
Response: {
  entities: [
    {
      id, name,
      covenants: [
        {
          name, type, current_value, limit_value, headroom_pct,
          direction, // "must_not_exceed" or "must_not_fall_below"
          trend: [ { period, value } ], // last 6 periods
          status: "critical" | "warning" | "healthy",
          calculation_formula: string
        }
      ]
    }
  ]
}
```

---

## SCREEN 6: FINANCIAL STATEMENTS (Read-Only)

**URL**: `/portfolio/{entity_id}/statements`
**Time spent**: 30-60 seconds (Marcus rarely drills this deep)
**Emotional state**: Verification mode. He's confirming something specific, not reading the whole statement.

### Layout
```
+----------------------------------------------------------+
| [<- Back to Entity]  Financial Statements                 |
|                      Meridian Manufacturing - March 2026   |
+----------------------------------------------------------+
| STATEMENT SELECTOR                                        |
| [Income Statement] [Balance Sheet] [Cash Flow] [Equity]  |
+----------------------------------------------------------+
|                                                          |
| SELECTED STATEMENT                                       |
| (Standard GAAP-formatted financial statement)             |
| Current Period | Prior Period | YTD | Prior YTD           |
|                                                          |
| [Certification badge if certified]                       |
| Certified by: David Chen, CFO                            |
| Date: March 8, 2026                                      |
| Signature ID: sig_a8f3...                                |
| [Verify Certification ->]                                |
+----------------------------------------------------------+
| [Download PDF] [Download Excel]                           |
+----------------------------------------------------------+
```

### Content Blocks

#### Statement Selector
- Four tabs for the four GAAP statements: Income Statement, Balance Sheet, Statement of Cash Flows, Statement of Changes in Equity
- Default: Income Statement

#### Statement Display
- Standard GAAP-formatted financial statement rendered as an HTML table
- Columns: Current Period, Prior Period, YTD Actual, Prior YTD
- Indentation and grouping follow GAAP presentation standards
- All numbers are read-only
- Material line items (>5% of total or >5% variance) are subtly highlighted with left border

#### Certification Badge
- Only appears if the period is certified
- Shows: green shield icon, "Certified" label, certifier name, date, truncated signature ID
- "Verify Certification" link opens the public verification page in a new tab

### Actions Available
1. Switch between statements
2. Download PDF or Excel
3. Click "Verify Certification" to open public verification
4. Navigate back to entity detail

### API Data Requirements
```
GET /api/v1/portfolio/{fund_id}/entities/{entity_id}/statements?type={statement_type}
Response: {
  entity: { id, name },
  period: { end_date, fiscal_year },
  statement_type: "income_statement" | "balance_sheet" | "cash_flow" | "equity",
  line_items: [
    {
      label, indent_level, is_subtotal, is_total,
      current_period, prior_period, ytd, prior_ytd,
      variance_pct, is_material
    }
  ],
  certification: {
    certified: boolean,
    certified_by: { name, title },
    certified_at: datetime,
    signature_id: string,
    verification_url: string
  } | null
}
```

---

## SCREEN 7: BOARD PACKAGE EXPORT (Modal/Flow)

**URL**: Modal overlay on `/portfolio`, no URL change (or `/portfolio/export` if full page)
**Time spent**: 30-60 seconds
**Emotional state**: Task-oriented. Marcus needs a deliverable for a board meeting.

### Layout
```
+----------------------------------------------------------+
| EXPORT BOARD PACKAGE                              [X]     |
+----------------------------------------------------------+
| Select Companies                                          |
| [x] Select All (21 companies)                            |
| [x] Summit Healthcare           [x] Meridian Mfg         |
| [x] Cascade Logistics           [x] Apex Retail          |
| ... (scrollable list with checkboxes)                    |
+----------------------------------------------------------+
| Report Period                                             |
| [March 2026 v]  Include prior period comparison: [x]     |
+----------------------------------------------------------+
| Include Sections                                          |
| [x] Executive Summary with KPIs                          |
| [x] EBITDA Bridge per Company                            |
| [x] Material Variance Analysis                           |
| [x] Covenant Status                                      |
| [x] Financial Statements                                 |
| [ ] Close Process Timeline                               |
+----------------------------------------------------------+
| Format: [PDF v]                                          |
| [Generate Board Package]                                  |
+----------------------------------------------------------+
```

### Content Blocks
- **Company selector**: Checkbox list of all portfolio entities. "Select All" toggle. Each checkbox shows company name. Pre-selected: all entities. Marcus can deselect companies not relevant to the board.
- **Period selector**: Dropdown of available periods. Defaults to most recent. Toggle for prior period comparison column.
- **Section selector**: Checkboxes for each section of the report. All checked by default except "Close Process Timeline" (internal detail).
- **Format selector**: Dropdown: PDF (default), PowerPoint, Excel
- **Generate button**: Primary action button.

### Actions Available
1. Select/deselect companies
2. Choose period
3. Toggle report sections
4. Choose format
5. Generate and download

### States
- **Generating**: Button shows spinner, text: "Generating... This may take 30-60 seconds." Progress bar if possible.
- **Complete**: Auto-download triggers. Toast: "Board package downloaded." Modal closes.
- **Error**: Red text in modal: "Generation failed. Please try again or contact support." Retry button.

### API Data Requirements
```
POST /api/v1/portfolio/{fund_id}/export/board-package
Body: {
  entity_ids: [string],
  period_end: date,
  include_prior_period: boolean,
  sections: [string], // e.g., ["executive_summary", "ebitda_bridge", ...]
  format: "pdf" | "pptx" | "xlsx"
}
Response: {
  job_id: string,
  status: "processing"
}

// Poll for completion:
GET /api/v1/export/jobs/{job_id}
Response: {
  status: "processing" | "complete" | "failed",
  download_url: string | null,
  error: string | null
}
```

---

## TIME BUDGET ACROSS SCREENS (10 minutes/week)

| Screen | Time | Frequency | Notes |
|--------|------|-----------|-------|
| Login | 15s | Weekly | SSO makes this fast |
| Portfolio Dashboard | 3-4 min | Weekly | Primary screen, scanning mode |
| Entity Detail | 1-2 min each | 2-3 entities/week | Only flagged entities |
| EBITDA Trends | 1-2 min | Biweekly | Pattern recognition |
| Covenant Proximity | 30-60s | As needed | Only when alerts exist |
| Financial Statements | 30-60s | Rarely | Specific verification only |
| Board Package Export | 30-60s | Monthly/Quarterly | Before board meetings |

**Typical weekly session**: Login (15s) -> Dashboard scan (3 min) -> Drill into 2 flagged entities (3 min) -> Done (total: ~6 min)

**Quarterly board prep session**: Login (15s) -> Dashboard (2 min) -> EBITDA Trends (2 min) -> Covenants (1 min) -> 3-4 entity drilldowns (5 min) -> Export board package (1 min) -> Done (total: ~11 min, slightly over budget but acceptable for quarterly)


---

# MARCUS WEBB -- DECISION TREES, HANDOFFS, SCENARIOS, EDGE CASES

---

## B. DECISION TREE

### Decision Tree 1: Alert Triage (Portfolio Dashboard)

```
Marcus opens Portfolio Dashboard
  |
  +-- Alert bar visible?
  |     |
  |     +-- YES: Read alert count and scan entity grid "Attention" section
  |     |     |
  |     |     +-- Covenant alert? (red, <5% headroom)
  |     |     |     |
  |     |     |     +-- Click entity row -> Entity Detail
  |     |     |     +-- Check EBITDA Bridge tab for root cause
  |     |     |     +-- Check Variances tab for AI explanation
  |     |     |     +-- DECISION: Is this a trend or one-time?
  |     |     |           |
  |     |     |           +-- Trend (3+ months declining) -> Call CFO immediately
  |     |     |           +-- One-time -> Note it, monitor next month
  |     |     |           +-- Unclear -> Call CFO for clarification
  |     |     |
  |     |     +-- Close overdue? (>target days)
  |     |     |     |
  |     |     |     +-- How many days overdue?
  |     |     |           |
  |     |     |           +-- 1-2 days -> Acceptable variance, no action
  |     |     |           +-- 3-5 days -> Check Close Status tab for blocker
  |     |     |           |     +-- Blocker is staffing? -> Call CFO
  |     |     |           |     +-- Blocker is data? -> Acceptable, monitor
  |     |     |           +-- 5+ days -> Escalate. Call CFO. Consider if systemic.
  |     |     |
  |     |     +-- EBITDA declining?
  |     |           |
  |     |           +-- Single month decline -> Check variance explanation
  |     |           |     +-- Seasonal/expected -> No action
  |     |           |     +-- Unexpected -> Read IRAC, decide if call needed
  |     |           +-- 3+ month decline -> ALWAYS drill in
  |     |                 +-- Entity Detail -> EBITDA Bridge -> Variances
  |     |                 +-- Call CFO with specific questions
  |     |
  |     +-- NO: Scan KPI strip
  |           |
  |           +-- All metrics healthy -> Done (90 seconds total)
  |           +-- Any KPI yellow -> Quick scan of entity grid
  |           +-- Session complete
  |
  +-- All entities certified?
        |
        +-- YES: Session complete. Marcus closes Sabit.
        +-- NO: Check which are outstanding
              +-- Expected (within target) -> No action
              +-- Unexpected (should be done) -> Note for follow-up
```

### Decision Tree 2: Board Meeting Prep

```
Marcus needs board package (quarterly)
  |
  +-- Open Portfolio Dashboard
  +-- Review EBITDA Trends screen for narrative
  |     +-- Identify top performers and underperformers
  |     +-- Note any inflection points to discuss
  |
  +-- Review Covenant Proximity
  |     +-- Any within 15%? -> Include in board discussion
  |     +-- All healthy? -> Brief mention, move on
  |
  +-- Drill into 3-5 key entities
  |     +-- Top 2-3 by EBITDA contribution
  |     +-- Any with material variances
  |     +-- Any with covenant concerns
  |     +-- For each: review EBITDA Bridge and Variances tabs
  |
  +-- Export Board Package
        +-- Select relevant companies (may exclude smaller ones)
        +-- Include: Exec Summary, EBITDA Bridge, Variances, Covenants
        +-- Format: PowerPoint for board, PDF for backup
        +-- Download and forward to board secretary / upload to board portal
```

### Decision Tree 3: Exit / Sale Due Diligence

```
Portfolio company is in exit process
  |
  +-- Marcus needs clean, auditable financial data
  |
  +-- Entity Detail -> Financial Summary tab
  |     +-- Review 12-month trend (change period selector)
  |     +-- Verify EBITDA consistency and add-back classification
  |
  +-- EBITDA Bridge tab
  |     +-- Confirm all add-backs are defensible
  |     +-- Check that add-back classifications match buyer expectations
  |     +-- Export bridge detail for banker / buyer data room
  |
  +-- Financial Statements screen
  |     +-- Download all 4 statements for trailing 12 months
  |     +-- Verify certification status for each period
  |     +-- Note any periods that were re-certified (flag for diligence)
  |
  +-- Covenant screen
  |     +-- Confirm current compliance for exit consent requirements
  |
  +-- Board Package Export
        +-- Generate comprehensive single-entity package
        +-- Include all sections with prior period comparison
        +-- Share with investment banking team
```

---

## C. INTER-PERSONA HANDOFFS

### What Marcus Sees When David (CFO) Certifies

**Trigger**: David completes certification at a portfolio company.

**What changes for Marcus on next visit**:
1. **Portfolio Dashboard**: Entity row status changes from "In Progress" to "Certified" with green indicator. The row moves from "In Progress" section to "Certified" section. KPI card "Companies Certified" increments (e.g., 18/21 becomes 19/21). If this was the last company, the progress bar fills to 100%.
2. **Entity Detail**: Close Status tab shows all steps complete with green checkmarks. Certification badge appears on Financial Statements.
3. **No push notification for routine certification.** Marcus only gets notified when things go wrong, not when they go right. Exception: If this entity was previously flagged as overdue, Marcus receives a "Resolved" notification.

### What Marcus Sees When a Company is Overdue

**Trigger**: An entity exceeds its target close cycle days without certification.

**What changes for Marcus**:
1. **Notification**: If overdue by 3+ days, Marcus receives an email digest (not immediate push): "Meridian Manufacturing is 3 days overdue on March 2026 close. Target: 5 days. Current: Day 8."
2. **Portfolio Dashboard**: Entity row gets red left border and moves to "Attention Needed" section. Alert bar appears or increments. Close Status shows "Overdue 3 days" in red text.
3. **Entity Detail**: Close Status tab shows which step is blocking. If it's reconciliation, shows how many accounts remain. If it's approval, shows who hasn't approved.

### What Marcus Can Communicate Back

Marcus is a consumer, not a producer in Sabit. He does NOT:
- Create or edit any financial data
- Approve or reject anything
- Write comments or annotations in the system
- Assign tasks or set deadlines

Marcus's communication is EXTERNAL to Sabit:
- Calls the CFO (David) directly if something is concerning
- Emails the fund controller (Karen) if he needs aggregated data
- Forwards board package exports to board members via email
- Raises issues in board meetings or operating partner calls

**Future feature consideration**: A "Flag for Discussion" button on any entity that sends a notification to the CFO saying "Marcus Webb has flagged Meridian Manufacturing for discussion." This creates a lightweight in-system communication path. NOT in v1.

---

## D. FIRST-TIME VS REPEAT EXPERIENCE

### First Time Seeing a New Portfolio Company

**Context**: A new acquisition closes. The fund controller (Karen) adds the entity to the fund in Sabit. Marcus sees it for the first time.

**What happens**:
1. **Portfolio Dashboard**: New entity appears in the grid with a "New" badge (small blue pill) next to the company name. This badge persists for Marcus until he clicks into the entity detail (tracked per-user).
2. **Entity row state**: Shows "Not Started" or "Awaiting First Close" status. EBITDA and trend data are empty ("--" placeholder). Covenant columns show "Not Configured" if covenants haven't been set up yet.
3. **Entity Detail**: Mostly empty. A contextual banner appears: "This is a new portfolio company. Financial data will appear after the first close cycle is completed." Tabs are present but show empty states with explanatory text.
4. **KPI Strip**: The denominators update (e.g., "18/22" instead of "18/21"), reflecting the new entity in the total count.

### Routine Weekly Review

**Typical 6-minute session**:
1. Login via SSO (15 seconds)
2. Dashboard loads. Eyes go to: (a) Alert bar -- any red? (b) KPI strip -- anything unexpected? (c) Entity grid attention section.
3. If nothing flagged: scan the first few entity rows, confirm reasonable numbers, close. Total: 2 minutes.
4. If 1-2 flagged: click into each, spend 60-90 seconds reviewing the specific issue, close. Total: 5-6 minutes.
5. Marcus does not review every entity every week. He trusts the system to surface problems.

### Quarterly Board Prep

**15-20 minute session** (Marcus accepts going over his 10-min budget quarterly):
1. Login. Dashboard review.
2. EBITDA Trends screen: 2 minutes reviewing portfolio-wide patterns. Notes mental talking points.
3. Covenant Proximity screen: 1 minute confirming compliance.
4. Drill into 3-5 entities that are notable (top performers, underperformers, new acquisitions): 6-8 minutes.
5. Export Board Package: select all companies, include all sections, generate PowerPoint. 1 minute.
6. Download, quick visual scan of output (outside Sabit), forward to team.

### Exit/Sale Scenario

**30-45 minute session** (rare, 1-2 times per year):
1. Extended drill into the target entity across all time periods available.
2. Downloads all financial statements for trailing 24 months.
3. Reviews every EBITDA bridge and add-back classification.
4. May request Karen to generate specific consolidated reports.
5. May share audit trail / certification data with external advisors.
6. This is the one scenario where Marcus uses the product deeply. The interface must support extended analysis without friction.

---

## E. EDGE CASES

### Edge Case 1: Company Misses Close Target by 5+ Days

**Trigger**: `entity.current_period.close_days > entity.target_close_days + 5`

**System behavior**:
1. **Day Target+1**: Entity status changes to "Overdue" with yellow indicator. Alert logged internally.
2. **Day Target+3**: Alert promoted to red. If Marcus has email notifications enabled, this appears in his next daily digest email.
3. **Day Target+5**: Critical alert. Red badge on entity row. If Marcus hasn't logged in for 3+ days, system sends a standalone email (not digest): "Action may be needed: Meridian Manufacturing is 5+ days overdue on March close."
4. **Dashboard impact**: Entity row shows red left border. Alert bar count increments. "Attention Needed" section always shows this entity first.

**What Marcus does**:
- Clicks into entity. Checks Close Status tab to see WHERE the process stalled.
- Identifies blocker (reconciliation gap, missing evidence, approval bottleneck, staffing issue).
- Calls the CFO or has the fund controller escalate.

**Edge within the edge**: What if the company has NO controller (turnover, see Edge Case 4)? The close status tab would show "No active users assigned to this entity." Marcus would escalate to the fund controller (Karen) or his own operating team to help the company find interim help.

### Edge Case 2: EBITDA Declines 3 Consecutive Months

**Trigger**: `entity.consecutive_decline_months >= 3`

**System behavior**:
1. **Entity row**: EBITDA trend sparkline clearly shows downward trajectory. A new status badge appears: "EBITDA Declining (3 months)" with a downward trend icon.
2. **EBITDA Trends screen**: This entity's line is highlighted / drawn thicker. A marker or annotation appears at the third consecutive decline point.
3. **Entity Detail**: EBITDA KPI card shows red text and downward arrow. A contextual alert banner appears at the top of the entity detail page: "EBITDA has declined for 3 consecutive months. Full-year impact projection: -$X.XM from budget."
4. **Notification**: Included in Marcus's next digest email: "{Entity} EBITDA has declined 3 consecutive months (Oct: $X, Nov: $X, Dec: $X). Cumulative decline: X%."

**What Marcus does**:
- This is always an investigation. He reviews the Variance tab for root cause explanations.
- Reviews EBITDA Bridge to see which components are driving the decline (revenue drop vs cost increase vs lost add-backs).
- Calls CFO with specific questions derived from the data.
- If the decline is operational (not accounting timing), this likely becomes a board discussion topic.

### Edge Case 3: Covenant Within 5% of Threshold

**Trigger**: `covenant.headroom_pct <= 5`

**System behavior**:
1. **Portfolio Dashboard**: Covenant Alerts KPI card shows count > 0 with red styling. Entity row gets covenant-specific alert badge: "Leverage 3.8x / 4.0x limit" in red.
2. **Covenant Proximity screen**: Entity and covenant highlighted with red bar. Headroom percentage displayed prominently: "5% headroom" or "3% headroom" in red text.
3. **Entity Detail**: Alert banner at top of page: "Covenant proximity warning: Total Leverage Ratio is within 5% of the 4.0x limit."
4. **Notification**: This is one of the few events that triggers a STANDALONE email to Marcus (not just digest): "Covenant Alert: Meridian Manufacturing Total Leverage Ratio is 3.82x against a 4.0x covenant. Headroom: 4.5%. Immediate review recommended."

**What Marcus does**:
- This is the highest-urgency alert in Marcus's workflow. Covenant breach has real financial and legal consequences.
- Reviews the trend: is this deteriorating or was it a spike?
- Reviews EBITDA Bridge to understand what's driving leverage up (typically EBITDA decline or debt increase).
- Calls CFO immediately. This may trigger a lender communication, waiver request, or operational intervention.
- May request Karen to run consolidated covenant analysis if multiple entities are at risk.

### Edge Case 4: Controller Turnover at a Portfolio Company

**Trigger**: The controller (Sarah) at a portfolio company leaves. A new person either hasn't been onboarded or is new to Sabit.

**System behavior**:
This is mostly an administrative event that Marcus experiences indirectly:

1. **If the old controller is deactivated**: Close process may stall. Marcus sees this as an overdue close (Edge Case 1). The Close Status tab may show steps assigned to a deactivated user: "[Sarah Mitchell - Deactivated] Reconciliation - In Progress."
2. **If a new controller is onboarded**: Marcus sees no direct change. The new controller's name appears in Close Status and certification metadata going forward.
3. **If NO controller is active**: The entity effectively goes dark. No close activity. Marcus sees: "No close activity for March 2026. Last activity: February 15, 2026." This is a red flag.
4. **Dashboard impact**: The entity shows "Stalled" status after 10+ days of no activity, distinct from "Overdue" (which means the process started but is behind).

**What Marcus does**:
- Notices the stall through normal dashboard monitoring.
- Contacts the portfolio company's CFO (David) to understand the situation.
- If controller vacancy is prolonged, may engage the fund's operations team to provide interim support.
- Does NOT handle user provisioning in Sabit. That's Karen's or the CFO's responsibility.

### Edge Case 5: Data Exists but is Uncertified Past Deadline

**Context**: Financial statements have been generated but the CFO hasn't signed off. The data is "visible but not official."

**System behavior**:
- Entity row shows "Pending Certification" status in yellow
- Financial Statements screen shows a yellow banner: "These statements have not been certified. Data may change."
- EBITDA values on the dashboard show with a "draft" indicator (small "D" badge or italicized text)
- Board Package Export: if Marcus tries to include an uncertified entity, a warning modal appears: "Meridian Manufacturing March 2026 data has not been certified. Include draft data in board package? [Include as Draft] [Exclude] [Cancel]"
- If included as draft, every page of the export for that entity has a watermark: "DRAFT - PENDING CERTIFICATION"

---

## F. NOTIFICATIONS

### Notification Delivery Channels

Marcus receives notifications through two channels:
1. **In-app**: Badge on bell icon in top nav. Clicking opens notification panel.
2. **Email**: Either digest (daily summary) or standalone (critical alerts only).

Marcus does NOT receive:
- SMS/text messages (not appropriate for this persona)
- Mobile push notifications (v1; potential v2 feature if mobile app is built)
- Slack/Teams messages (not integrated in v1)

### Notification Triggers

| Event | In-App | Email | Priority |
|-------|--------|-------|----------|
| Entity close overdue by 3+ days | Badge update | Daily digest | Medium |
| Entity close overdue by 5+ days | Badge update | Standalone email | High |
| Covenant within 5% of threshold | Badge update | Standalone email | Critical |
| Covenant within 10% of threshold | Badge update | Daily digest | Medium |
| EBITDA decline 3+ consecutive months | Badge update | Daily digest | Medium |
| All entities certified for period | Badge update | Daily digest | Low (good news) |
| New entity added to portfolio | Badge update | Daily digest | Low |
| Entity re-certified (period reopened and re-closed) | Badge update | Daily digest | Medium |
| Entity close stalled (no activity 10+ days) | Badge update | Standalone email | High |
| Board package export completed | Toast notification | None | Low |

### In-App Notification Panel

```
+----------------------------------+
| Notifications            [Mark all read]
+----------------------------------+
| [RED DOT] Today                  |
|                                  |
| Covenant Alert                   |
| Meridian Mfg leverage ratio      |
| within 5% of 4.0x limit         |
| 2 hours ago                      |
| [View Entity ->]                 |
+----------------------------------+
| [RED DOT] Yesterday              |
|                                  |
| Close Overdue                    |
| Cascade Logistics March close    |
| is 3 days overdue                |
| 1 day ago                        |
| [View Entity ->]                 |
+----------------------------------+
| Earlier                          |
|                                  |
| All Clear                        |
| Summit Healthcare March 2026     |
| close certified                  |
| 3 days ago                       |
+----------------------------------+
```

**Panel behavior**:
- Slides in from right side of screen, overlays content
- Maximum width: 400px
- Scrollable if many notifications
- Each notification has: icon (color-coded by severity), title, description (1-2 lines), timestamp, action link
- Unread notifications have a red dot. Clicking a notification marks it as read.
- "Mark all read" link at top clears all red dots.
- Notifications persist for 30 days, then auto-archive.

### Email Templates

**Daily Digest Email** (sent at 7:00 AM in Marcus's timezone if there are items):
```
Subject: Sabit Portfolio Digest - March 10, 2026

Hi Marcus,

Here's your portfolio summary:

ATTENTION NEEDED (2 items)
- Cascade Logistics: March close overdue by 3 days
- Apex Retail: EBITDA declined for 3rd consecutive month (-8.2% cumulative)

PROGRESS UPDATE
- 19 of 21 companies certified for March 2026
- Average close cycle: 4.2 days

[View Portfolio Dashboard]
```

**Standalone Critical Email** (sent immediately):
```
Subject: [ACTION] Covenant Alert - Meridian Manufacturing

Marcus,

Meridian Manufacturing's Total Leverage Ratio is 3.82x against a 4.0x covenant limit (4.5% headroom).

This ratio has deteriorated from 3.45x two months ago.

Recommended action: Review with CFO David Chen.

[View Covenant Details]  [View Entity Detail]
```

### What Marcus Can Do From a Notification

| Notification Type | In-App Action | Email Action |
|------------------|---------------|--------------|
| Covenant alert | Click -> Entity Detail, Covenant tab | Click link -> Entity Detail |
| Close overdue | Click -> Entity Detail, Close Status tab | Click link -> Entity Detail |
| EBITDA decline | Click -> Entity Detail, EBITDA Bridge tab | Click link -> Entity Detail |
| Certification complete | Click -> Entity Detail, Statements tab | Click link -> Entity Detail |
| New entity | Click -> Entity Detail (with "New" badge) | Click link -> Entity Detail |

Marcus cannot take any action ON the notification itself (no approve/reject, no reply, no snooze). Notifications are informational triggers that lead him into the application.

---

## G. DATA REQUIREMENTS PER SCREEN (Summary)

Covered inline within each screen specification in Section A. Consolidated API endpoint list:

| Screen | Primary Endpoint | Method |
|--------|-----------------|--------|
| Login | `/api/v1/auth/login` | POST |
| Portfolio Dashboard | `/api/v1/portfolio/{fund_id}/dashboard` | GET |
| Entity Detail | `/api/v1/portfolio/{fund_id}/entities/{entity_id}/detail` | GET |
| EBITDA Trends | `/api/v1/portfolio/{fund_id}/ebitda-trends` | GET |
| Covenant Proximity | `/api/v1/portfolio/{fund_id}/covenants` | GET |
| Financial Statements | `/api/v1/portfolio/{fund_id}/entities/{entity_id}/statements` | GET |
| Board Package Export | `/api/v1/portfolio/{fund_id}/export/board-package` | POST |
| Export Job Status | `/api/v1/export/jobs/{job_id}` | GET |
| Notifications | `/api/v1/users/{user_id}/notifications` | GET |
| Mark Notification Read | `/api/v1/users/{user_id}/notifications/{id}/read` | PATCH |


---

# KAREN WHITFIELD -- FUND CONTROLLER
# COMPLETE SCREEN-BY-SCREEN JOURNEY

Karen aggregates certified financial data across portfolio companies for LP reporting.
She works quarterly, with peak activity in the 2-3 weeks following quarter end.
Her mental model: "Is everything certified? Can I pull it all together for the LP report?"

---

## SCREEN 1: LOGIN

**URL**: `/login`
**Time spent**: 15 seconds
**Emotional state**: Determined. Karen is under deadline pressure. LP reporting deadlines are firm.

Same login screen as Marcus. After authentication, Karen is redirected to `/fund` (Fund Dashboard) based on her role.

One difference: Karen may have access to multiple funds. If so, after login she sees a fund selector before the dashboard:

### Fund Selector (conditional, only if multi-fund access)
**URL**: `/funds`
```
+----------------------------------------------------------+
| [Sabit Logo]                           [Karen W. avatar] |
+----------------------------------------------------------+
|                                                          |
| Select Fund                                              |
|                                                          |
| +----------------------------------------------------+  |
| | Apex Growth Fund III                                |  |
| | 21 companies | Q4 2025: 18/21 certified            |  |
| | [->]                                                |  |
| +----------------------------------------------------+  |
| | Apex Growth Fund IV                                 |  |
| | 8 companies | Q4 2025: 8/8 certified               |  |
| | [->]                                                |  |
| +----------------------------------------------------+  |
| | Apex Opportunities Fund I                           |  |
| | 5 companies | Q4 2025: 3/5 certified               |  |
| | [->]                                                |  |
| +----------------------------------------------------+  |
+----------------------------------------------------------+
```

Each fund card shows: Fund name, entity count, current quarter certification progress. Click navigates to `/fund/{fund_id}`.

---

## SCREEN 2: FUND DASHBOARD

**URL**: `/fund/{fund_id}`
**Time spent**: 2-3 minutes
**Emotional state**: Monitoring. Karen is checking certification status and identifying blockers.

### Layout
```
+----------------------------------------------------------+
| [Sabit Logo]  Fund Dashboard       [Bell icon] [Karen v] |
|               Apex Growth Fund III                        |
+----------------------------------------------------------+
| CERTIFICATION STATUS BAR                                  |
| Q1 2026 Close: 18 of 21 certified   [======86%====    ] |
| Target deadline: April 15, 2026 (34 days remaining)      |
+----------------------------------------------------------+
|                                                          |
| KPI STRIP                                                |
| +------------+ +------------+ +------------+ +---------+ |
| | Fund NAV   | | Aggregate  | | LP Report  | | Open    | |
| | $2.14B     | | EBITDA     | | Status     | | Items   | |
| | +1.8% QoQ  | | $847.2M    | | Not Started| | 14      | |
| +------------+ +------------+ +------------+ +---------+ |
|                                                          |
| CERTIFICATION GRID                                       |
| [Filter: All | Certified | Pending | Overdue]           |
|                                                          |
| +------------------------------------------------------+ |
| | PENDING CERTIFICATION (3 companies)                   | |
| |                                                       | |
| | Meridian Mfg    | Controller: Sarah M.  | Day 8/5    | |
| | Status: Reconciliation in progress | Est: 2 days     | |
| | [Send Reminder] [View Detail ->]                      | |
| |                                                       | |
| | Apex Retail     | Controller: [Vacant]  | Day 12/5   | |
| | Status: Stalled - no active controller | [CRITICAL]   | |
| | [Escalate] [View Detail ->]                           | |
| |                                                       | |
| | Cascade Log     | Controller: Mike R.   | Day 6/5    | |
| | Status: CFO review pending | Est: 1 day              | |
| | [Send Reminder] [View Detail ->]                      | |
| +------------------------------------------------------+ |
| | CERTIFIED (18 companies)                [Collapse ^]  | |
| |                                                       | |
| | Summit Healthcare  | Certified Mar 3  | 3 days       | |
| | [Download Data] [View Statements ->]                  | |
| | ...                                                   | |
| +------------------------------------------------------+ |
|                                                          |
| [Download All Certified Data] [Start LP Report Process]  |
+----------------------------------------------------------+
```

### Content Blocks -- Detailed

#### Certification Status Bar
- **Left text**: "{Period} Close: {certified_count} of {total_count} certified"
- **Progress bar**: Wide, full-width below text. Green fill for certified percentage. Animated when updating.
- **Below bar**: "Target deadline: {date} ({days_remaining} days remaining)". Text turns yellow when <14 days remain and not all certified. Turns red when <7 days remain.

#### KPI Strip
Four cards:

**Card 1: Fund NAV** (Net Asset Value)
- Value: Aggregate fund NAV
- Subtext: QoQ change

**Card 2: Aggregate EBITDA**
- Value: Sum of all entity EBITDAs for current period
- Subtext: QoQ change with directional indicator

**Card 3: LP Report Status**
- Value: "Not Started" | "In Progress" | "Submitted" | "Acknowledged"
- Subtext: If "Not Started" and deadline approaching, shows "Due in {days} days"
- This card acts as a state machine for Karen's quarterly workflow

**Card 4: Open Items**
- Value: Count of unresolved items across all entities (pending reconciliations, unapproved entries, unsigned certifications)
- Subtext: "Across {n} companies"
- Red if count > 0 and deadline < 14 days

#### Certification Grid
This is Karen's primary working view. Each row is a portfolio company.

**Row anatomy for PENDING companies**:
```
+--------------------------------------------------------------+
| [Status Color Bar]                                            |
| Company Name          | Controller: Name        | Day X/Y    |
| Status: Current step description                | Est: N days |
| [Send Reminder button] [View Detail -> link]                  |
+--------------------------------------------------------------+
```

**Fields**:
| Field | Source | Notes |
|-------|--------|-------|
| Company Name | `entity.name` | 16px, bold |
| Controller | `entity.controller.name` | If vacant: red text "[Vacant]" with warning icon |
| Close Day | `entity.current_period.close_days` / `entity.target_close_days` | Red if over target |
| Status Description | `entity.current_period.current_step` | Human-readable: "Reconciliation in progress", "CFO review pending", etc. |
| Estimated Completion | AI-calculated or manual estimate | "Est: 2 days" or "Unknown" if stalled |
| Send Reminder | Button | Sends an email to entity's controller and CFO. Button shows "Sent" and is disabled for 24 hours after clicking. |
| Escalate | Button (only for critical items) | Sends email to Marcus (PE operating partner) + entity CFO. Used when close is critically stalled. |
| View Detail | Link | Navigates to `/fund/{fund_id}/entities/{entity_id}` |

**Row anatomy for CERTIFIED companies**:
```
+--------------------------------------------------------------+
| [Green bar]                                                   |
| Company Name    | Certified: Date    | Close cycle: N days   |
| [Download Data button] [View Statements -> link]              |
+--------------------------------------------------------------+
```

**Certified section** is collapsed by default (click header to expand) since Karen mostly cares about pending items.

**Download Data button**: Downloads certified financial data for that single entity as an Excel file. This is the raw data Karen uses for LP report aggregation.

#### Bottom Action Buttons

**"Download All Certified Data"**:
- Downloads a single Excel workbook with one sheet per certified entity
- Each sheet contains: trial balance, income statement, balance sheet, cash flow, EBITDA bridge
- Only includes certified entities. If not all are certified, a warning appears: "3 entities are not yet certified and will not be included. Download certified data only? [Download] [Wait for All]"
- File naming convention: `{fund_name}_certified_data_{period}_{timestamp}.xlsx`

**"Start LP Report Process"**:
- Opens the LP Report flow (Screen 4)
- Only enabled when certification progress >= threshold (configurable, default 100%)
- If not all certified, button shows tooltip: "All companies must be certified before starting the LP report. 3 companies remaining."
- Override available: Karen can hold Shift+Click or use a "Proceed with Available Data" option if deadline pressure requires it, but a warning modal appears documenting which entities are missing

### Actions Available
1. Filter certification grid (All / Certified / Pending / Overdue)
2. Send reminder to individual entity's controller/CFO
3. Escalate critical items to PE operating partner
4. View entity detail for any company
5. Download individual entity's certified data
6. Download all certified data as bulk export
7. Start LP report process
8. Switch funds (via nav dropdown if multi-fund)

### Decisions Made
- "Is everything certified?" -- Certification status bar answers immediately
- "What's blocking?" -- Pending section shows each blocker
- "Do I need to escalate?" -- Overdue + stalled entities trigger this
- "Can I start the LP report?" -- Only when certification threshold is met
- "Do I proceed with incomplete data?" -- Deadline pressure decision

### Navigation Triggers
| User Action | Destination |
|-------------|-------------|
| Click entity row | `/fund/{fund_id}/entities/{entity_id}` |
| Click "Start LP Report" | `/fund/{fund_id}/lp-report` |
| Click "Download All" | Triggers download, stays on page |
| Click "Send Reminder" | Sends email, button changes to "Sent", stays on page |
| Click "Escalate" | Opens confirmation modal, then sends email |
| Click fund selector in nav | `/funds` (fund picker) |

### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Dashboard data fails to load | Full-page error with retry | Retry |
| Single entity data fails | Row shows gray "Unable to load" state | Row-level retry |
| Download fails | Toast: "Download failed. Please try again." | Retry |
| Reminder send fails | Toast: "Reminder could not be sent. Please try again." Button resets to "Send Reminder". | Retry |
| No entities in fund | Empty state: "No companies in this fund. Contact your fund administrator." | Admin action |

### Loading States
- **Initial load**: Skeleton screen with pulsing certification bar, 4 KPI cards, and 6 entity rows
- **Download All**: Button shows spinner + "Preparing download..." (may take 10-30 seconds for large portfolios). Progress percentage if available from backend.
- **Send Reminder**: Button shows spinner for 1-2 seconds, then changes to "Sent" with checkmark

### API Data Requirements
```
GET /api/v1/fund/{fund_id}/dashboard
Response: {
  fund: { id, name, vintage_year },
  certification: {
    period: { end_date, label },
    certified_count: number,
    total_count: number,
    target_deadline: date,
    days_remaining: number
  },
  kpis: {
    fund_nav: { value, qoq_change_pct },
    aggregate_ebitda: { value, qoq_change_pct },
    lp_report_status: "not_started" | "in_progress" | "submitted" | "acknowledged",
    open_items_count: number,
    open_items_entity_count: number
  },
  entities: [
    {
      id, name, sector,
      controller: { id, name, email } | null,
      cfo: { id, name, email },
      current_period: {
        period_end, status, close_days, target_close_days,
        current_step, estimated_days_remaining,
        certified_at, certified_by
      },
      reminder_sent_at: datetime | null, // for disabling reminder button
      is_critical: boolean
    }
  ]
}
```

---

## SCREEN 3: ENTITY DETAIL (Karen's View)

**URL**: `/fund/{fund_id}/entities/{entity_id}`
**Time spent**: 1-3 minutes per entity
**Emotional state**: Investigative when pending; verification when certified.

### Layout
```
+----------------------------------------------------------+
| [<- Back to Fund Dashboard]  Meridian Manufacturing       |
|                              Q1 2026 Close                |
+----------------------------------------------------------+
| STATUS BANNER                                             |
| [Yellow] Close in progress - Day 8 of 5-day target       |
| Controller: Sarah Mitchell | CFO: David Chen              |
| [Send Reminder] [View Close Timeline]                     |
+----------------------------------------------------------+
|                                                          |
| [Certification] [Financial Data] [Reconciliation Status] |
| [Audit Trail]                                            |
|                                                          |
| TAB CONTENT                                              |
+----------------------------------------------------------+
```

### Tabs

**Tab 1: Certification** (default for pending; shows cert details if certified)
- **If pending**: Shows checklist of certification prerequisites with status:
  - All accounts reconciled: 47/52 (yellow, in progress)
  - All adjusting entries approved: 8/8 (green, complete)
  - Financial statements generated: Yes (green)
  - CFO review: Not started (gray)
  - Digital signature: Not applied (gray)
- **If certified**: Shows certification details:
  - Certified by: Name, title, date, time
  - Signature ID: Full Ed25519 signature hash
  - Hash chain: Link to verification page
  - "Verify Certification" button -> opens public verification
  - Download certification certificate (PDF)

**Tab 2: Financial Data**
- Condensed view of all four GAAP statements (selectable)
- Current period vs prior period columns
- READ-ONLY for Karen (she does not edit entity-level data)
- "Download" button per statement (Excel or PDF)
- "Download All Statements" button for bulk download
- Each statement shows whether it was generated from certified or draft data

**Tab 3: Reconciliation Status**
- Table of all balance sheet accounts and their reconciliation status
- Columns: Account Name | Balance | Reconciled | Evidence | Reconciler | Date
- Status indicators: Green check (reconciled with evidence), Yellow (reconciled, evidence pending), Red (not reconciled), Gray (not required / immaterial)
- Aggregate stats at top: "47 of 52 accounts reconciled (90%)"
- Karen uses this to understand WHERE the close process is stuck
- Click on any account row shows reconciliation detail in a slide-out panel

**Tab 4: Audit Trail**
- Chronological log of all actions taken on this entity's close
- Each entry: Timestamp, User, Action, Detail
- Examples:
  - "Mar 1 09:14 | Sarah Mitchell | Uploaded GL | 14,328 transactions"
  - "Mar 2 14:22 | Sarah Mitchell | Completed reconciliation | Accounts Receivable"
  - "Mar 3 10:00 | AI System | Generated variance explanations | 7 material variances"
  - "Mar 5 16:45 | David Chen | Approved adjusting entry | AJE-2026-003"
- Filter by: User, Action type, Date range
- Export as CSV
- This provides Karen with transparency into each company's process without needing to contact the controller

### Actions Available
1. Navigate between tabs
2. Send reminder to controller/CFO (from status banner)
3. Download financial data (individual statements or bulk)
4. View reconciliation details
5. Export audit trail
6. Verify certification (if certified)
7. Navigate back to fund dashboard

### API Data Requirements
```
GET /api/v1/fund/{fund_id}/entities/{entity_id}/detail
Response: {
  entity: { id, name, controller, cfo },
  period: { end_date, status, close_days, target },
  certification: {
    prerequisites: [ { name, status, detail } ],
    // OR if certified:
    certified_by, certified_at, signature_id, hash_chain_url
  },
  financials: {
    statements_available: ["income_statement", "balance_sheet", ...],
    data_status: "certified" | "draft"
  },
  reconciliation: {
    total_accounts, reconciled_count,
    accounts: [
      { name, balance, status, evidence_attached, reconciler, date }
    ]
  },
  audit_trail: [
    { timestamp, user, action, detail }
  ]
}
```

---

## SCREEN 4: CONSOLIDATION VIEW / LP REPORT BUILDER

**URL**: `/fund/{fund_id}/lp-report`
**Time spent**: 10-20 minutes (this is Karen's primary quarterly deliverable)
**Emotional state**: Focused, detail-oriented. Errors here reflect on her professionally.

### Layout
```
+----------------------------------------------------------+
| [<- Back to Fund Dashboard]  LP Report Builder            |
|                              Apex Growth III - Q1 2026    |
+----------------------------------------------------------+
| STEP INDICATOR                                            |
| [1. Verify Data] -> [2. Consolidate] -> [3. Review] ->   |
| [4. Export]                                               |
+----------------------------------------------------------+
|                                                          |
| STEP CONTENT (changes with each step)                    |
|                                                          |
+----------------------------------------------------------+
| [Back] [Continue ->]                                      |
+----------------------------------------------------------+
```

### Step 1: Verify Data

```
+----------------------------------------------------------+
| DATA VERIFICATION                                         |
|                                                          |
| All 21 companies certified for Q1 2026? [YES - green]    |
| (or: 18 of 21 certified. 3 pending. [Proceed anyway?])   |
|                                                          |
| ENTITY CHECKLIST                                         |
| [x] Summit Healthcare    Certified Mar 3    $91.0M EBITDA|
| [x] Meridian Mfg         Certified Mar 8    $42.1M EBITDA|
| ...                                                      |
| [ ] Apex Retail           PENDING            --          |
|     [Exclude from report] [Use draft data]               |
|                                                          |
| CURRENCY CHECK                                           |
| All entities reporting in USD? [YES]                     |
| (or: 2 entities in EUR, 1 in GBP. FX rates applied:     |
|  EUR/USD: 1.0842 (as of Mar 31, 2026)                   |
|  GBP/USD: 1.2651 (as of Mar 31, 2026)                   |
|  [Edit FX Rates] [Use ECB rates - auto])                 |
|                                                          |
| CONSISTENCY CHECK                                        |
| Chart of accounts alignment: 21/21 mapped [GREEN]        |
| (or: 2 entities have unmapped accounts. [View issues])   |
|                                                          |
| INTERCOMPANY ELIMINATIONS                                |
| Intercompany balances detected: $4.2M across 3 pairs     |
| [Review eliminations] [Auto-eliminate matching balances]  |
+----------------------------------------------------------+
```

**Content**:
- Automated pre-flight checks that validate data readiness
- Certification status check: all entities must be certified (or explicitly excluded/overridden)
- Currency check: identifies non-USD entities, shows applied FX rates, allows manual override
- Consistency check: verifies chart of accounts mapping is complete across all entities
- Intercompany elimination check: identifies intercompany balances that need to be eliminated in consolidation

**Actions**:
- Exclude entities from report
- Use draft data for uncertified entities (with warning)
- Edit FX rates manually
- Review and approve intercompany eliminations
- Continue to Step 2

### Step 2: Consolidate

```
+----------------------------------------------------------+
| CONSOLIDATED FINANCIAL DATA                               |
|                                                          |
| [Income Statement] [Balance Sheet] [Cash Flow] [EBITDA]  |
|                                                          |
| CONSOLIDATED INCOME STATEMENT                            |
| (Aggregated across all included entities)                |
|                                                          |
| Revenue                           $2,847.3M              |
|   Entity breakdown: [expand ->]                          |
| Cost of Goods Sold                ($1,712.8M)            |
| Gross Profit                      $1,134.5M              |
| ...                                                      |
| Consolidated EBITDA               $847.2M                |
|                                                          |
| VARIANCE FROM PRIOR QUARTER                              |
| Revenue: +$142.1M (+5.3%)                                |
| EBITDA: +$28.4M (+3.5%)                                  |
| Margin: -20 bps (29.8% -> 29.6%)                        |
|                                                          |
| [Expand line items] [Show entity breakdown]              |
+----------------------------------------------------------+
```

**Content**:
- Consolidated versions of all four GAAP statements
- Each line item is expandable to show per-entity breakdown
- Intercompany eliminations shown as a separate line
- Currency translation gains/losses shown if applicable
- Prior quarter comparison with variance highlighting
- EBITDA bridge at the fund level (sum of all entity bridges)

**Actions**:
- Switch between statements
- Expand/collapse entity-level detail
- Toggle prior quarter comparison
- Flag any line item for review (adds a note)
- Continue to Step 3

### Step 3: Review

```
+----------------------------------------------------------+
| REVIEW & ANNOTATION                                       |
|                                                          |
| AUTOMATED CHECKS                                         |
| [PASS] Balance sheet balances (A = L + E)                |
| [PASS] Cash flow reconciles to balance sheet cash        |
| [PASS] Retained earnings rolls forward correctly         |
| [WARN] EBITDA margin declined 20 bps QoQ - add note?    |
| [PASS] All intercompany balances eliminated              |
|                                                          |
| LP COMMENTARY (optional)                                 |
| [Text area for Karen to add quarterly commentary]        |
| "Fund performance was consistent with expectations...     |
|  Two portfolio companies experienced margin compression   |
|  due to raw material cost increases..."                   |
|                                                          |
| ATTACHMENTS                                              |
| [+ Add supporting document]                              |
| - Q1_2026_portfolio_summary.pdf (uploaded)               |
|                                                          |
| APPROVAL                                                 |
| [ ] I have reviewed the consolidated data and confirm    |
|     its accuracy for LP reporting.                       |
| [Continue to Export ->]                                   |
+----------------------------------------------------------+
```

**Content**:
- Automated validation checks that verify mathematical integrity
- Warnings for items that may need commentary (material variances, margin changes)
- Free-text commentary field for Karen to add narrative for LPs
- Document attachment for supplementary materials
- Confirmation checkbox (acts as Karen's sign-off on the consolidated data)

**Actions**:
- Review check results
- Write/edit commentary
- Attach documents
- Check confirmation box
- Continue to export

### Step 4: Export

```
+----------------------------------------------------------+
| EXPORT LP REPORT PACKAGE                                  |
|                                                          |
| FORMAT OPTIONS                                           |
| [x] Consolidated Financial Statements (PDF)              |
| [x] Entity-Level Detail (Excel workbook)                 |
| [x] EBITDA Bridge - Fund Level (PDF)                     |
| [x] EBITDA Bridge - Entity Level (Excel)                 |
| [ ] Covenant Summary (PDF)                               |
| [x] Fund Commentary (PDF)                                |
| [ ] Audit Trail Summary (PDF)                            |
|                                                          |
| CERTIFICATION                                            |
| Package will include digital certification:              |
| Hash: sha256:a8f3c2...                                   |
| Signed by: Karen Whitfield, Fund Controller              |
| Timestamp: March 12, 2026 14:30 UTC                      |
|                                                          |
| DELIVERY                                                 |
| [x] Download to local machine                           |
| [ ] Send to LP portal (integration required)             |
| [ ] Email to distribution list                           |
|                                                          |
| [Generate & Download Package]                             |
+----------------------------------------------------------+
```

**Content**:
- Checkbox list of report components to include
- Digital certification details (the LP report package itself gets a hash and signature)
- Delivery method selection
- Generate button triggers report assembly

**Actions**:
- Select/deselect report components
- Choose delivery method
- Generate and download

**Post-export state**: After successful generation, the screen shows a success confirmation with download link, and the Fund Dashboard KPI "LP Report Status" updates to "Submitted."

### API Data Requirements
```
// Step 1: Data verification
GET /api/v1/fund/{fund_id}/lp-report/verify
Response: {
  certification_status: { certified_count, total_count, pending_entities },
  currency_check: { all_usd: boolean, non_usd_entities, fx_rates },
  consistency_check: { aligned_count, total_count, unmapped_accounts },
  intercompany: { total_amount, pairs: [ { entity_a, entity_b, amount } ] }
}

// Step 2: Consolidated data
GET /api/v1/fund/{fund_id}/lp-report/consolidated?period={period_end}
Response: {
  statements: {
    income_statement: { line_items: [...], entity_breakdown: {...} },
    balance_sheet: { ... },
    cash_flow: { ... },
    equity: { ... }
  },
  ebitda_bridge: { fund_level: {...}, entity_level: [...] },
  prior_period_comparison: { ... },
  eliminations: [ { description, amount } ]
}

// Step 3: Validation checks
POST /api/v1/fund/{fund_id}/lp-report/validate
Body: { period_end, included_entity_ids, fx_overrides }
Response: {
  checks: [ { name, status, detail } ],
  warnings: [ { message, suggestion } ]
}

// Step 4: Generate export
POST /api/v1/fund/{fund_id}/lp-report/generate
Body: {
  period_end, included_entity_ids, components: [string],
  commentary: string, attachments: [file_id],
  delivery_method: "download" | "portal" | "email"
}
Response: {
  job_id, status: "processing",
  certification: { hash, signer, timestamp }
}

// Poll for completion
GET /api/v1/export/jobs/{job_id}
```

---

## SCREEN 5: DOWNLOAD / DATA EXPORT CENTER

**URL**: `/fund/{fund_id}/exports`
**Time spent**: 1-2 minutes
**Emotional state**: Administrative. Karen is retrieving previously generated reports or downloading data.

### Layout
```
+----------------------------------------------------------+
| [<- Back to Fund Dashboard]  Export History                |
+----------------------------------------------------------+
|                                                          |
| RECENT EXPORTS                                           |
| +------------------------------------------------------+ |
| | LP Report Package - Q1 2026                          | |
| | Generated: Mar 12, 2026 14:30 | By: Karen Whitfield | |
| | Components: 5 files | Size: 24.3 MB                  | |
| | Hash: sha256:a8f3c2...                               | |
| | [Download Package] [Verify Hash] [View Contents]     | |
| +------------------------------------------------------+ |
| | Board Package - March 2026                           | |
| | Generated: Mar 10, 2026 09:15 | By: Marcus Webb      | |
| | [Download Package]                                    | |
| +------------------------------------------------------+ |
| | Certified Data Export - February 2026                 | |
| | Generated: Feb 8, 2026 16:22 | By: Karen Whitfield  | |
| | [Download Package]                                    | |
| +------------------------------------------------------+ |
|                                                          |
| [Generate New Export v]                                   |
+----------------------------------------------------------+
```

### Content
- Chronological list of all exports generated for this fund
- Each entry shows: name, generation date, who generated it, file count, total size, hash
- Download link (packages are retained for 90 days)
- Verify hash link (confirms the export hasn't been tampered with since generation)
- View contents link (shows list of files in the package)

### Actions
1. Download any previous export
2. Verify hash of any export
3. Generate new export (opens export modal)
4. Filter by date range or type

### API Data Requirements
```
GET /api/v1/fund/{fund_id}/exports
Response: {
  exports: [
    {
      id, name, type, generated_at, generated_by,
      file_count, total_size_bytes, hash,
      download_url, expires_at
    }
  ]
}
```


---

# KAREN WHITFIELD -- DECISION TREES, HANDOFFS, SCENARIOS, EDGE CASES

---

## B. DECISION TREE

### Decision Tree 1: Quarterly LP Report Workflow

```
Karen logs in at start of LP reporting cycle
  |
  +-- Fund Dashboard: Check certification status bar
  |
  +-- All entities certified?
  |     |
  |     +-- YES (100%):
  |     |     +-- Click "Start LP Report Process"
  |     |     +-- Proceed through 4-step wizard
  |     |     +-- Step 1: Verify (auto-checks pass) -> Continue
  |     |     +-- Step 2: Consolidate (review aggregated data) -> Continue
  |     |     +-- Step 3: Review (add commentary, run checks) -> Continue
  |     |     +-- Step 4: Export (generate package, download)
  |     |     +-- Done. LP report submitted.
  |     |
  |     +-- NO (some pending):
  |           |
  |           +-- How many days until LP deadline?
  |           |     |
  |           |     +-- >14 days: Monitor. Send reminders to pending entities.
  |           |     |     +-- Check back daily.
  |           |     |     +-- Decision point: which entities are likely to certify in time?
  |           |     |
  |           |     +-- 7-14 days: Escalate. Send reminders + escalate critical ones.
  |           |     |     +-- Click "Send Reminder" on each pending entity row
  |           |     |     +-- For entities >5 days overdue, click "Escalate" to notify Marcus
  |           |     |     +-- Check entity detail to understand specific blockers
  |           |     |
  |           |     +-- <7 days: Pressure decision.
  |           |           |
  |           |           +-- Is the missing entity material to the fund?
  |           |           |     |
  |           |           |     +-- YES (>5% of fund EBITDA):
  |           |           |     |     +-- Cannot proceed without it. Double down on escalation.
  |           |           |     |     +-- Call CFO directly (outside Sabit).
  |           |           |     |     +-- If truly stuck: proceed with draft data + disclaimer.
  |           |           |     |
  |           |           |     +-- NO (<5% of fund EBITDA):
  |           |           |           +-- Proceed with "Exclude from report" option
  |           |           |           +-- Add note in LP commentary explaining exclusion
  |           |           |           +-- Submit supplemental data later when certified
  |           |           |
  |           |           +-- Override: Start LP Report with available data
  |           |                 +-- Warning modal documents excluded/draft entities
  |           |                 +-- Exported package includes disclaimer pages
  |
  +-- After submission: Update LP Report Status to "Submitted"
       +-- Await LP acknowledgment
       +-- Monitor for any restatements that would require amendment
```

### Decision Tree 2: Data Discrepancy

```
Karen reviewing consolidated data (Step 2 of LP Report)
  |
  +-- Numbers look unexpected (EBITDA doesn't match mental model)
  |
  +-- Expand entity breakdown for the line item
  |     |
  |     +-- Identify which entity is the outlier
  |     |
  |     +-- Click entity name -> View entity detail in new tab
  |     |     +-- Check EBITDA bridge tab
  |     |     +-- Check variance explanations
  |     |     +-- Check audit trail for any late adjusting entries
  |     |
  |     +-- Is the discrepancy explainable?
  |           |
  |           +-- YES (timing, seasonal, known event):
  |           |     +-- Add note in LP commentary explaining it
  |           |     +-- Continue with consolidation
  |           |
  |           +-- NO (unexplained):
  |           |     +-- Contact entity controller/CFO for clarification
  |           |     +-- Do NOT proceed until resolved
  |           |     +-- If entity needs to restate/re-certify:
  |           |           +-- Wait for re-certification
  |           |           +-- Restart LP report process with corrected data
  |           |
  |           +-- INTERCOMPANY ISSUE (balances don't net to zero):
  |                 +-- Review intercompany elimination detail
  |                 +-- Identify mismatched entity pair
  |                 +-- Contact both entities' controllers
  |                 +-- One or both must correct and re-certify
```

### Decision Tree 3: Currency Translation

```
Consolidation includes non-USD entities
  |
  +-- System auto-applies FX rates (ECB rates as of period end date)
  |
  +-- Are auto-applied rates acceptable?
  |     |
  |     +-- YES: Continue
  |     |
  |     +-- NO (fund uses different rate source):
  |           +-- Click "Edit FX Rates"
  |           +-- Enter manual rates per currency
  |           +-- System recalculates all non-USD entities
  |           +-- Review translation gain/loss impact
  |           +-- If material: add note in LP commentary
  |
  +-- Translation gain/loss
        |
        +-- Immaterial (<1% of EBITDA): No action needed
        +-- Material (>1% of EBITDA): Add LP commentary explaining impact
        +-- Unusual (spike from prior quarter): Investigate if operational or FX-driven
```

---

## C. INTER-PERSONA HANDOFFS

### What Karen Sees When Certification Status Changes

**Entity certifies** (controller completes, CFO signs):
1. Fund Dashboard certification count increments (e.g., 18/21 -> 19/21)
2. Progress bar advances
3. Entity row moves from "Pending" section to "Certified" section
4. "Download Data" button becomes available for that entity
5. If this was the last entity: "Start LP Report Process" button becomes enabled (green, no longer grayed out)
6. Karen receives in-app notification: "{Entity} Q1 2026 data certified by {CFO name}"

**Entity re-certifies** (period reopened, data changed, re-signed):
1. If Karen has NOT yet started LP report: certification status stays green, but a "Re-certified" badge appears with the new date. Karen should re-download data.
2. If Karen HAS already started or completed LP report: CRITICAL ALERT. Red banner on Fund Dashboard: "Meridian Manufacturing re-certified Q1 2026 data after your LP report was generated. Review changes and consider regenerating." Standalone email also sent.

### What Karen Can Request from Specific Companies

Karen cannot edit entity data, but she can:
1. **Send Reminder**: Automated email to entity controller + CFO with message: "Karen Whitfield, Fund Controller at Apex Growth III, is requesting certification of {period} data. LP reporting deadline: {date}."
2. **Escalate**: Automated email to Marcus (PE operating partner) + entity CFO flagging the delay.
3. **Request clarification**: NOT in v1 as an in-app message. Karen contacts controllers via email/phone outside of Sabit.
4. **Future feature**: In-app messaging thread per entity where Karen can ask questions and controller can respond. Threaded, async, with email notifications.

### What Karen Communicates to CFOs About Deadline Pressure

The "Send Reminder" function is Karen's primary tool. The system-generated email includes:
- Fund name and reporting period
- LP reporting deadline date and days remaining
- Current entity certification status
- List of outstanding items (e.g., "5 accounts pending reconciliation, CFO review not started")
- Link for the CFO to go directly to their close workflow

Karen can customize the reminder urgency level:
- "Standard" (default): Professional tone, informational
- "Urgent" (7 days before deadline): Adds emphasis, CC's operating partner
- "Critical" (at/past deadline): Strong language, CC's operating partner, flags in Marcus's dashboard

---

## D. FIRST-TIME VS REPEAT EXPERIENCE

### First Quarterly Cycle

**Context**: Karen is using Sabit for the first time for LP reporting. She has been onboarded and can log in.

**Experience**:
1. **Fund Dashboard**: Shows certification grid. This is familiar territory for Karen -- she's used to tracking certification status in spreadsheets. The interface should feel immediately comprehensible.
2. **First time "Start LP Report" click**: A brief overlay explains the 4-step process: "The LP Report Builder will guide you through data verification, consolidation, review, and export. Each step includes automated checks." Dismiss with "Got it" button. This overlay appears once (per user, tracked in localStorage or user preferences).
3. **Step 1 walkthrough**: Contextual tooltips appear on first use:
   - On certification check: "The system verifies all entities are certified. Uncertified entities can be excluded or included with draft data."
   - On currency check: "FX rates are automatically sourced from ECB. You can override these rates manually."
   - On intercompany: "Intercompany balances are detected automatically. Review and approve eliminations before consolidation."
4. **Step 2 consolidation**: First-time tooltip: "Click any line item to see the entity-level breakdown. Expand rows to trace numbers back to individual companies."
5. **Steps 3-4**: Minimal guidance needed; review and export are self-explanatory.

**Subsequent quarters**: All tooltips and overlays are suppressed. Karen goes directly through the workflow. The interface remembers her previous selections (report components, FX rate source preference).

### Repeat Quarterly Cycle

Karen's quarterly routine follows a predictable pattern:
1. **Week 1 post-quarter-end**: Login every 1-2 days to check certification progress. 2-minute sessions. Send reminders as needed.
2. **Week 2**: Certification should be mostly complete. Karen drills into any pending entities to understand blockers. Escalates if needed. 5-10 minute sessions.
3. **Week 3**: All (or nearly all) certified. Karen runs the LP report wizard. 15-20 minute session for the full process.
4. **Week 4**: Export submitted. Karen monitors for any restatements. Minimal time in Sabit.

### Year-End vs Quarterly

Year-end LP reporting is the same workflow but with:
- Higher stakes (annual LP reporting is the most scrutinized)
- More entities needing attention (year-end close is more complex)
- Additional report components (annual letters, K-1 supporting data)
- Karen spends 2-3x more time on review step
- Commentary is more detailed

---

## E. EDGE CASES

### Edge Case 1: Not All Companies Certified by LP Reporting Deadline

**Trigger**: `certification.certified_count < certification.total_count` AND `certification.days_remaining <= 0`

**System behavior**:
1. **Fund Dashboard**: Deadline text turns red: "Target deadline: April 15, 2026 (OVERDUE)". Progress bar shows incomplete with red segment for missing entities.
2. **"Start LP Report" button**: Changes from disabled to enabled with a warning state -- orange button instead of green, text reads "Start LP Report (Incomplete Data)".
3. **Click the button**: Warning modal appears:
   ```
   LP Report with Incomplete Data

   3 entities are not certified for Q1 2026:
   - Apex Retail (stalled, no controller)
   - Meridian Manufacturing (CFO review pending)
   - BrightPath Education (reconciliation in progress)

   These entities represent $87.3M EBITDA (10.3% of fund total).

   Options:
   [Exclude and Proceed] - Report without these entities.
                           Include a disclosure noting excluded entities.
   [Use Draft Data]      - Include uncertified data with "DRAFT" watermark.
                           Data may change when entities certify.
   [Cancel]              - Wait for certification.
   ```
4. **If "Exclude and Proceed"**: LP report wizard starts with excluded entities clearly marked. Step 1 shows them grayed out. Step 2 consolidated data excludes them. Step 3 auto-generates a disclosure paragraph: "The following entities were excluded from this report pending certification: [list]. Supplemental data will be provided upon certification."
5. **If "Use Draft Data"**: LP report includes all entities but every page/sheet referencing uncertified entities has a "DRAFT" watermark. Export cover page includes a prominent disclaimer.

**What Karen does**: This is a judgment call. Karen weighs materiality (10.3% is material) against deadline pressure. She likely calls Marcus and the fund's CFO (her boss) to discuss. In most cases, she uses draft data for material entities and excludes immaterial ones.

### Edge Case 2: Restatement After Export

**Trigger**: An entity re-certifies a period after Karen has already generated and submitted the LP report.

**System behavior**:
1. **Immediate alert**: Red banner on Fund Dashboard: "DATA CHANGE: Meridian Manufacturing re-certified Q1 2026 on April 20. Your LP report (generated April 15) may contain outdated data."
2. **Email notification**: Standalone email to Karen with details of what changed.
3. **Export History**: The original export now shows a yellow warning badge: "Entity data changed after generation. Consider regenerating."
4. **Impact assessment**: System calculates the impact of the change:
   - "Revenue changed by +$1.2M (+0.04% of fund total)"
   - "EBITDA changed by -$0.3M (-0.04% of fund total)"
   - If impact is <1% of fund totals, suggest: "Impact is immaterial. You may choose to issue a supplemental update or note for next quarter."
   - If impact is >1%, suggest: "Impact may be material. Consider issuing a restated LP report."

**What Karen does**:
- Reviews the impact assessment
- If immaterial: notes it for next quarter's commentary, no immediate action
- If material: regenerates LP report with updated data, issues amendment to LPs
- In either case, documents the event in the audit trail

### Edge Case 3: Currency Translation Discrepancies

**Trigger**: FX rates applied to non-USD entities produce results that don't match Karen's expectations or prior reports.

**System behavior**:
1. **Step 1 of LP Report**: Currency check section highlights any FX rates that differ >2% from prior quarter's rates. Yellow warning: "EUR/USD rate changed 3.2% from prior quarter (1.0512 -> 1.0842). This will impact translation of 2 entities."
2. **Step 2**: Translation gain/loss line item is highlighted if material. Expandable detail shows impact per entity: "Meridian GmbH: Translation gain of $1.4M due to EUR/USD movement."
3. **Comparative view**: If Karen toggles prior quarter comparison, she can see how much of the consolidated change is operational vs FX-driven.

**What Karen does**:
- Verifies the FX rates are correct for the fund's rate policy (some funds use average rate, some use period-end spot rate)
- If the fund uses a different rate source (e.g., Bloomberg instead of ECB), manually overrides
- Adds commentary explaining FX impact to LPs
- If translation creates material distortion, may present results in both USD and local currency

### Edge Case 4: New Entity Added to Fund Mid-Quarter

**Trigger**: A new acquisition closes and is added to the fund during the reporting period.

**System behavior**:
1. **Fund Dashboard**: New entity appears in the certification grid with a "New" badge. Total entity count increases (21 -> 22). Progress denominator increases, which drops the percentage (18/21 = 86% -> 18/22 = 82%).
2. **Certification status**: New entity shows "Not Started" or "Partial Period" status.
3. **LP Report implications**: Step 1 (Verify Data) flags the new entity: "BrightPath Education was added to the fund on February 15, 2026. Q1 data covers a partial period (Feb 15 - Mar 31). Include in consolidated report?"
4. **Options for Karen**:
   - Include with pro-rata annotation: "Include partial-period data. Report will note the acquisition date and partial-period coverage."
   - Exclude with disclosure: "Exclude from consolidation. Report will note the new acquisition and state that full-period data will be included starting Q2."
   - Include without annotation: "Include as-is. No special treatment."

**What Karen does**:
- Follows the fund's LP reporting policy for new acquisitions (usually a defined approach)
- Most funds disclose new acquisitions separately in LP commentary
- Karen adds a section to the commentary describing the acquisition
- If the entity's close isn't complete yet (just acquired, still onboarding), Karen excludes and discloses

---

## F. NOTIFICATIONS

### Notification Triggers for Karen

| Event | In-App | Email | Priority |
|-------|--------|-------|----------|
| Entity certified | Badge update | Daily digest | Medium |
| All entities certified (100%) | Badge update + toast | Standalone email | High (good news) |
| Entity overdue by 3+ days | Badge update | Daily digest | Medium |
| Entity overdue by 5+ days | Badge update | Standalone email | High |
| Entity stalled (no activity 10+ days) | Badge update | Standalone email | High |
| Entity re-certified after LP export | Badge update + red banner | Standalone email | Critical |
| LP deadline in 14 days | Badge update | Standalone email | Medium |
| LP deadline in 7 days with uncertified entities | Badge update | Standalone email | High |
| LP deadline passed with uncertified entities | Badge update + red banner | Standalone email | Critical |
| New entity added to fund | Badge update | Daily digest | Low |
| Export job completed | Toast | None | Low |
| Reminder delivery confirmation | None | None (silent) | -- |

### Email Templates

**Daily Digest** (sent at 8:00 AM Karen's timezone, only if there are items):
```
Subject: Sabit Fund Update - Apex Growth III - March 12, 2026

Hi Karen,

CERTIFICATION STATUS - Q1 2026
19 of 21 companies certified (90%)
LP deadline: April 15, 2026 (34 days remaining)

CERTIFIED TODAY
- BrightPath Education (certified by James O., Mar 11)

STILL PENDING
- Apex Retail (Day 12, stalled - no controller assigned)
- Meridian Manufacturing (Day 8, CFO review pending)

[View Fund Dashboard]
```

**Critical Standalone Email**:
```
Subject: [ACTION] Restatement Alert - Meridian Manufacturing

Karen,

Meridian Manufacturing re-certified Q1 2026 financial data on April 20, 2026.

Your LP report package (generated April 15) may contain outdated data.

IMPACT ASSESSMENT:
- Revenue: +$1.2M (+0.04% of fund total) - IMMATERIAL
- EBITDA: -$0.3M (-0.04% of fund total) - IMMATERIAL
- Net Income: -$0.8M (-0.12% of fund total) - IMMATERIAL

Recommended action: Note for next quarter. No immediate restatement required.

[View Impact Detail]  [Regenerate LP Report]
```

---

## G. DATA REQUIREMENTS PER SCREEN (Summary)

| Screen | Primary Endpoint | Method |
|--------|-----------------|--------|
| Fund Selector | `/api/v1/user/{user_id}/funds` | GET |
| Fund Dashboard | `/api/v1/fund/{fund_id}/dashboard` | GET |
| Entity Detail | `/api/v1/fund/{fund_id}/entities/{entity_id}/detail` | GET |
| LP Report Step 1 | `/api/v1/fund/{fund_id}/lp-report/verify` | GET |
| LP Report Step 2 | `/api/v1/fund/{fund_id}/lp-report/consolidated` | GET |
| LP Report Step 3 | `/api/v1/fund/{fund_id}/lp-report/validate` | POST |
| LP Report Step 4 | `/api/v1/fund/{fund_id}/lp-report/generate` | POST |
| Export History | `/api/v1/fund/{fund_id}/exports` | GET |
| Send Reminder | `/api/v1/fund/{fund_id}/entities/{entity_id}/reminder` | POST |
| Escalate | `/api/v1/fund/{fund_id}/entities/{entity_id}/escalate` | POST |
| Notifications | `/api/v1/users/{user_id}/notifications` | GET |


---

# JAMES WRIGHT -- EXTERNAL AUDITOR
# COMPLETE SCREEN-BY-SCREEN JOURNEY

James audits portfolio companies during a 2-6 week annual engagement.
His mental model: "Trust nothing. Verify everything. Document my procedures."
James has TWO entry paths: public verification (no login) and authenticated audit access.

---

## SCREEN 1: PUBLIC VERIFICATION PAGE (No Login Required)

**URL**: `/verify` (base) or `/verify/{signature_id}` (direct link)
**Time spent**: 30-60 seconds
**Emotional state**: Professional skepticism. James needs to independently confirm certification integrity.

### Layout -- Landing (no signature ID in URL)
```
+----------------------------------------------------------+
| [Sabit Logo]        Independent Verification              |
+----------------------------------------------------------+
|                                                          |
| Verify Financial Statement Certification                 |
|                                                          |
| Enter the certification ID or paste the full             |
| verification URL provided by your client.                |
|                                                          |
| +----------------------------------------------------+  |
| | [Certification ID or URL input field]              |  |
| +----------------------------------------------------+  |
| [Verify]                                                 |
|                                                          |
| -- OR --                                                 |
|                                                          |
| Upload the signed certification file:                    |
| [Drop file here or click to browse]                      |
|                                                          |
+----------------------------------------------------------+
| How verification works:                                   |
| 1. The client provides a certification ID after          |
|    completing their financial close.                      |
| 2. We verify the Ed25519 digital signature and           |
|    hash chain without accessing the underlying data.     |
| 3. You receive a pass/fail result with details.          |
|                                                          |
| No account or login is required for verification.        |
| [Learn more about Sabit's certification process]          |
+----------------------------------------------------------+
```

### Content Blocks

#### Verification Input
- **Text input**: Full-width, large (48px height), placeholder: "Enter certification ID (e.g., cert_a8f3c2d1e4...)"
- **Accepts**: Certification ID string (e.g., `cert_a8f3c2d1e4b5f6a7`), full URL (e.g., `https://app.sabit.com/verify/cert_a8f3c2d1e4b5f6a7`), or raw Ed25519 signature string
- **Verify button**: Full-width primary button below input
- **OR divider**: Visual separator
- **File upload**: Drop zone for `.sabit-cert` file (a signed JSON file containing the certification metadata). Drag-and-drop supported, or click to browse. Accepts only `.sabit-cert` or `.json` files.

#### Explainer Section
- Brief, trust-building explanation of how verification works
- Emphasizes independence: "No account or login is required"
- Link to a detailed technical explanation page (static marketing/docs page)

### Actions Available
1. Enter certification ID and click Verify
2. Paste URL and click Verify
3. Upload certification file
4. Click "Learn more" for technical documentation

### Navigation Triggers
| User Action | Destination |
|-------------|-------------|
| Click Verify with valid input | `/verify/{signature_id}` (verification result) |
| Click Verify with invalid input | Stay on page, show error |
| Upload valid file | `/verify/{signature_id}` (auto-extracted from file) |
| Click "Learn more" | `/docs/certification` (static page, new tab) |

### Error States
| Error | Display | Recovery |
|-------|---------|----------|
| Empty input | Red border on input: "Please enter a certification ID" | Enter ID |
| Invalid format | Red text: "This doesn't look like a valid certification ID. Expected format: cert_[32 hex characters]" | Re-enter |
| Network error | Red banner: "Unable to connect to verification service. Please try again." | Retry |
| File wrong type | Red text below upload: "Unsupported file type. Please upload a .sabit-cert or .json file." | Re-upload |
| File corrupt/unparseable | Red text: "Unable to read this file. It may be corrupted." | Re-upload or use manual entry |

### API Data Requirements
```
// No API call on landing page. Verification happens on result page.
// Input validation is client-side only.
```

---

## SCREEN 2: VERIFICATION RESULT

**URL**: `/verify/{signature_id}`
**Time spent**: 1-2 minutes
**Emotional state**: Moment of truth. James is evaluating whether the certification is trustworthy.

### Layout -- PASS Result
```
+----------------------------------------------------------+
| [Sabit Logo]        Independent Verification              |
+----------------------------------------------------------+
|                                                          |
| +------------------------------------------------------+ |
| | [Large Green Shield Icon]                            | |
| |                                                      | |
| | VERIFICATION PASSED                                  | |
| |                                                      | |
| | The digital signature and hash chain are valid.      | |
| | This certification has not been tampered with.       | |
| +------------------------------------------------------+ |
|                                                          |
| CERTIFICATION DETAILS                                    |
| +------------------------------------------------------+ |
| | Entity:          Meridian Manufacturing, Inc.         | |
| | Period:          Quarter ended March 31, 2026         | |
| | Certified by:    David Chen, CFO                     | |
| | Certified at:    March 8, 2026 16:42:31 UTC          | |
| | Signature ID:    cert_a8f3c2d1e4b5f6a78901234567     | |
| | Signature Algo:  Ed25519                             | |
| | Public Key:      ed25519:b4c8d9...                   | |
| +------------------------------------------------------+ |
|                                                          |
| HASH CHAIN VERIFICATION                                  |
| +------------------------------------------------------+ |
| | Chain Length:     847 blocks                          | |
| | Chain Status:    INTACT (all hashes verified)        | |
| | Genesis Block:   March 1, 2026 00:00:00 UTC          | |
| | Latest Block:    March 8, 2026 16:42:31 UTC          | |
| | Chain Hash:      sha256:f7e6d5c4b3a2...              | |
| |                                                      | |
| | [View Full Hash Chain ->]                            | |
| +------------------------------------------------------+ |
|                                                          |
| STATEMENT HASHES                                         |
| +------------------------------------------------------+ |
| | Income Statement:   sha256:a1b2c3d4e5...   [MATCH]  | |
| | Balance Sheet:      sha256:f6g7h8i9j0...   [MATCH]  | |
| | Cash Flow:          sha256:k1l2m3n4o5...   [MATCH]  | |
| | Equity:             sha256:p6q7r8s9t0...   [MATCH]  | |
| | Trial Balance:      sha256:u1v2w3x4y5...   [MATCH]  | |
| +------------------------------------------------------+ |
|                                                          |
| CERTIFICATION HISTORY                                    |
| +------------------------------------------------------+ |
| | This period has been certified 1 time.               | |
| | (or: This period has been certified 2 times.         | |
| |  Original: Mar 5, 2026 14:00 UTC                    | |
| |  Re-certified: Mar 8, 2026 16:42 UTC                | |
| |  Reason for re-certification: "Corrected AJE-003")  | |
| +------------------------------------------------------+ |
|                                                          |
| [Download Verification Report (PDF)]                     |
| [Verify Another Certification]                           |
|                                                          |
| Want deeper access? [Request Audit Access ->]            |
+----------------------------------------------------------+
```

### Layout -- FAIL Result
```
+----------------------------------------------------------+
| [Sabit Logo]        Independent Verification              |
+----------------------------------------------------------+
|                                                          |
| +------------------------------------------------------+ |
| | [Large Red X Icon]                                   | |
| |                                                      | |
| | VERIFICATION FAILED                                  | |
| |                                                      | |
| | The digital signature could not be verified.         | |
| | This certification may have been altered.            | |
| +------------------------------------------------------+ |
|                                                          |
| FAILURE DETAILS                                          |
| +------------------------------------------------------+ |
| | Failure Type:  SIGNATURE_MISMATCH                    | |
| | Detail:        The Ed25519 signature does not match  | |
| |                the certified data hash.              | |
| |                                                      | |
| | This means one or more of the following:             | |
| | - The certified data was modified after signing      | |
| | - The signature was corrupted during transmission    | |
| | - The certification ID is invalid or expired         | |
| |                                                      | |
| | RECOMMENDED ACTION:                                  | |
| | Contact the entity's management and your engagement  | |
| | partner immediately. Do not rely on this data.       | |
| +------------------------------------------------------+ |
|                                                          |
| [Download Failure Report (PDF)]                          |
| [Verify Another Certification]                           |
| [Contact Support]                                         |
+----------------------------------------------------------+
```

### Content Blocks

#### Pass/Fail Banner
- **PASS**: Green background, shield icon, reassuring text
- **FAIL**: Red background, X icon, alarming text
- This is the most important visual on the page. James's eyes go here first.

#### Certification Details
- Read-only metadata about the certification
- Entity name, period, certifier, timestamp
- Full signature ID and algorithm
- Public key (allows James to independently verify the signature using his own Ed25519 library if he chooses)

#### Hash Chain Verification
- Chain length: number of events in the audit chain
- Chain status: "INTACT" (all sequential hashes verified) or "BROKEN AT BLOCK {n}" (hash chain violation)
- Genesis and latest block timestamps define the scope
- "View Full Hash Chain" link shows detailed chain explorer (Screen 2a)

#### Statement Hashes
- Each financial statement's hash is listed
- "MATCH" or "MISMATCH" against the certified hashes
- This lets James verify that specific statements haven't been altered independently

#### Certification History
- Shows how many times this period has been certified
- If re-certified: shows all certification events with timestamps and reasons
- This is critically important for auditors -- re-certification is a risk indicator

### Actions Available
1. Download verification report as PDF (for James's workpapers)
2. Verify another certification
3. View full hash chain detail
4. Request audit access (for deeper investigation)
5. Contact support (if verification fails)

### Navigation Triggers
| User Action | Destination |
|-------------|-------------|
| Click "View Full Hash Chain" | `/verify/{signature_id}/chain` |
| Click "Download Verification Report" | Triggers PDF download |
| Click "Verify Another" | `/verify` |
| Click "Request Audit Access" | `/audit/request` (or modal) |
| Click "Contact Support" | Opens email to support@sabit.com with pre-filled subject |

### Error States
| Error | Display |
|-------|---------|
| Certification ID not found | "No certification found with this ID. Verify the ID is correct. It may have been revoked." |
| Verification service temporarily unavailable | "Verification service is temporarily unavailable. Please try again in a few minutes." |
| Expired certification | "This certification has been superseded by a newer certification. [View current certification]" |

### API Data Requirements
```
GET /api/v1/verify/{signature_id}
// NOTE: This is a PUBLIC endpoint. No authentication required.
Response: {
  status: "pass" | "fail",
  certification: {
    signature_id, entity_name, period_end, period_label,
    certified_by: { name, title },
    certified_at: datetime,
    signature_algorithm: "Ed25519",
    public_key: string,
    signature: string
  },
  hash_chain: {
    length: number,
    status: "intact" | "broken",
    broken_at_block: number | null,
    genesis_timestamp: datetime,
    latest_timestamp: datetime,
    chain_hash: string
  },
  statement_hashes: [
    { statement_type, hash, status: "match" | "mismatch" }
  ],
  certification_history: [
    { version, certified_at, certified_by, reason }
  ],
  failure_detail: {
    type: string,
    message: string
  } | null
}
```

---

## SCREEN 2a: HASH CHAIN EXPLORER

**URL**: `/verify/{signature_id}/chain`
**Time spent**: 2-5 minutes (only if James wants to inspect individual chain blocks)
**Emotional state**: Deep skepticism or intellectual curiosity. Most auditors will never visit this page; those who do are either thorough or suspicious.

### Layout
```
+----------------------------------------------------------+
| [<- Back to Verification Result]  Hash Chain Explorer      |
|                                   Meridian Manufacturing   |
+----------------------------------------------------------+
| Chain: 847 blocks | Status: INTACT | Period: Q1 2026     |
+----------------------------------------------------------+
|                                                          |
| CHAIN VISUALIZATION                                      |
| [Block 1] -> [Block 2] -> ... -> [Block 847]            |
| (horizontal scrollable chain with zoom)                   |
|                                                          |
| BLOCK LIST (paginated table)                             |
| +------------------------------------------------------+ |
| | Block | Timestamp           | Action          | Hash | |
| |-------|---------------------|-----------------|------| |
| | 847   | Mar 8 16:42:31      | Certification   | f7e6 | |
| | 846   | Mar 8 16:42:30      | Statement Gen   | d5c4 | |
| | 845   | Mar 8 16:40:12      | AJE Approval    | b3a2 | |
| | 844   | Mar 7 14:22:05      | Reconciliation  | 9180 | |
| | ...   |                     |                 |      | |
| | 1     | Mar 1 00:00:00      | GL Upload       | a1b2 | |
| +------------------------------------------------------+ |
|                                                          |
| BLOCK DETAIL (shown when a block is selected)            |
| +------------------------------------------------------+ |
| | Block 845                                            | |
| | Timestamp: March 8, 2026 16:40:12 UTC                | |
| | Action: Adjusting Entry Approved                     | |
| | Actor: David Chen (CFO)                              | |
| | Detail: AJE-2026-003 approved ($142,500 debit to    | |
| |         Accrued Expenses, credit to Cash)            | |
| | Previous Hash: sha256:b3a29180...                    | |
| | Block Hash:    sha256:d5c4b3a2...                    | |
| | Computed Hash: sha256:d5c4b3a2... [MATCH]            | |
| +------------------------------------------------------+ |
|                                                          |
| [Download Full Chain (JSON)]                              |
+----------------------------------------------------------+
```

### Content Blocks

#### Chain Visualization
- Horizontal chain of blocks, rendered as connected rectangles
- Green blocks = verified, Red blocks = hash mismatch (if any)
- Scrollable/zoomable for long chains
- Click any block to see detail below

#### Block List
- Paginated table showing all blocks in reverse chronological order
- Columns: Block number, Timestamp, Action type, Truncated hash
- Click a row to expand and show block detail
- Search/filter by action type

#### Block Detail Panel
- Expanded view of a single block
- Shows full content: timestamp, action, actor, detail text
- Shows hash verification: previous block hash, this block's hash, independently computed hash, and MATCH/MISMATCH status
- This allows James to independently verify that each block correctly chains from its predecessor

### Actions Available
1. Scroll/zoom chain visualization
2. Click blocks to inspect
3. Search/filter blocks by action type
4. Download full chain as JSON (for James to run his own verification scripts)
5. Navigate back to verification result

### API Data Requirements
```
GET /api/v1/verify/{signature_id}/chain?page={n}&per_page=50
// PUBLIC endpoint, no auth required
Response: {
  chain_metadata: { length, status, genesis, latest },
  blocks: [
    {
      number, timestamp, action_type, actor,
      detail, previous_hash, block_hash
    }
  ],
  pagination: { page, per_page, total_pages }
}

GET /api/v1/verify/{signature_id}/chain/download
// Returns full chain as JSON file
```

---

## SCREEN 3: AUDIT ACCESS REQUEST (Transition to Authenticated)

**URL**: `/audit/request` (or modal on verification result page)
**Time spent**: 2-3 minutes
**Emotional state**: Administrative. James needs authenticated access for deeper audit work.

### Layout
```
+----------------------------------------------------------+
| [Sabit Logo]        Request Audit Access                   |
+----------------------------------------------------------+
|                                                          |
| To access the full audit binder, sample selection, and   |
| detailed workpapers, you need authenticated access.      |
|                                                          |
| This request will be sent to the entity's management     |
| for approval.                                            |
|                                                          |
| YOUR INFORMATION                                         |
| Firm: [Deloitte & Touche LLP          ]                  |
| Name: [James Wright                    ]                  |
| Email: [james.wright@deloitte.com      ]                 |
| Role: [External Auditor v              ]                  |
|                                                          |
| ENGAGEMENT DETAILS                                       |
| Entity: [Meridian Manufacturing v      ] (or pre-filled) |
| Engagement Type: [Annual Audit v]                        |
| Period: [Year ended December 31, 2025 v]                 |
|                                                          |
| ACCESS SCOPE                                             |
| [x] Audit Binder (evidence, reconciliations, workpapers)|
| [x] Financial Statements (all four GAAP statements)      |
| [x] Sample Selection Tool                               |
| [x] Hash Chain Verification (detailed)                   |
| [ ] Adjusting Entry History                              |
| [ ] Prior Period Comparatives                            |
|                                                          |
| [Submit Access Request]                                   |
|                                                          |
| Already have access? [Sign In ->]                        |
+----------------------------------------------------------+
```

### Content
- Form collects auditor identity and engagement details
- Scope checkboxes let James request specific access levels
- Request is sent to the entity's CFO (David) for approval
- Turnaround is typically 1-4 hours during business hours

### Actions Available
1. Fill in form fields
2. Select access scope
3. Submit request
4. Sign in if already has an account

### Post-Submission State
```
+----------------------------------------------------------+
| [Green check]                                             |
|                                                          |
| Access Request Submitted                                  |
|                                                          |
| Your request has been sent to Meridian Manufacturing's    |
| management for approval.                                 |
|                                                          |
| You will receive an email at james.wright@deloitte.com   |
| when access is granted.                                  |
|                                                          |
| Request ID: req_b7c8d9e0...                              |
| Submitted: March 12, 2026 10:15 AM                       |
|                                                          |
| While you wait, you can:                                 |
| [Verify another certification]                           |
| [View public documentation]                              |
+----------------------------------------------------------+
```

### API Data Requirements
```
POST /api/v1/audit/access-request
Body: {
  firm_name, auditor_name, auditor_email, role,
  entity_id, engagement_type, period_end,
  requested_scopes: [string]
}
Response: {
  request_id, status: "pending",
  submitted_at, estimated_turnaround: "4 hours"
}
```

---

## SCREEN 4: AUDITOR LOGIN & DASHBOARD

**URL**: `/audit/login` then `/audit/{entity_id}`
**Time spent**: 1-2 minutes on dashboard, then navigates to specific tools
**Emotional state**: Methodical. James is beginning structured audit work.

### Login
Same login form as other personas but at `/audit/login`. James's account is provisioned when the CFO approves his access request. He receives an email with a temporary password and login link.

### Auditor Dashboard
**URL**: `/audit/{entity_id}`

```
+----------------------------------------------------------+
| [Sabit Logo]  Audit Workspace       [James W.] [Sign Out]|
|               Meridian Manufacturing                      |
|               Year ended December 31, 2025                |
+----------------------------------------------------------+
| ENGAGEMENT SUMMARY                                        |
| +----------+ +----------+ +----------+ +-----------+     |
| | Cert     | | Audit    | | Samples  | | Open      |     |
| | Status   | | Binder   | | Selected | | Items     |     |
| | Verified | | 142 docs | | 0 / --   | | 0         |     |
| +----------+ +----------+ +----------+ +-----------+     |
+----------------------------------------------------------+
|                                                          |
| QUICK ACCESS                                             |
| +------------------------------------------------------+ |
| | [icon] Financial Statements                          | |
| | Review all four GAAP statements with drill-down      | |
| +------------------------------------------------------+ |
| | [icon] Audit Binder                                  | |
| | Evidence files, reconciliations, supporting docs     | |
| +------------------------------------------------------+ |
| | [icon] Sample Selection                              | |
| | Select and review transaction samples                | |
| +------------------------------------------------------+ |
| | [icon] Hash Chain Verification                       | |
| | Verify the complete audit trail integrity            | |
| +------------------------------------------------------+ |
| | [icon] Workpaper Download                            | |
| | Export data for your audit software                  | |
| +------------------------------------------------------+ |
|                                                          |
| CERTIFICATION DETAILS                                    |
| Certified by: David Chen, CFO | March 8, 2026           |
| Signature: [verified badge] cert_a8f3c2d1e4...          |
| [Verify independently (public page) ->]                  |
+----------------------------------------------------------+
```

### Content Blocks

#### Engagement Summary KPIs
- **Certification Status**: "Verified" (green) or "Not Verified" (gray) or "Failed" (red)
- **Audit Binder**: Total document count
- **Samples Selected**: Progress of sample selection work (0/-- until James starts)
- **Open Items**: Count of issues James has flagged (initially 0)

#### Quick Access Cards
Five large cards linking to the main audit tools. Each card has an icon, title, and one-line description. Click navigates to the respective screen.

#### Certification Details
- Summary of the certification for reference
- Link to independently verify on the public verification page

### Actions Available
1. Navigate to any of the five audit tools
2. Verify certification independently
3. Sign out

### API Data Requirements
```
GET /api/v1/audit/{entity_id}/dashboard
Response: {
  entity: { id, name },
  engagement: { type, period_end, access_granted_at, scopes },
  certification: { status, signature_id, certified_by, certified_at },
  stats: {
    binder_document_count: number,
    samples_selected: number,
    samples_total: number | null,
    open_items: number
  }
}
```

---

## SCREEN 5: AUDIT BINDER

**URL**: `/audit/{entity_id}/binder`
**Time spent**: 30-60 minutes (James's primary workspace during fieldwork)
**Emotional state**: Deep work. Methodical review of evidence. This is the core of James's audit engagement.

### Layout
```
+----------------------------------------------------------+
| [<- Back to Audit Workspace]  Audit Binder                |
|                               Meridian Mfg - FY 2025     |
+----------------------------------------------------------+
| BINDER NAVIGATION (left sidebar, 250px)                   |
| +-------------------+                                     |
| | SECTIONS          |  DOCUMENT VIEWER (right panel)      |
| |                   |  +--------------------------------+ |
| | v Trial Balance   |  | Account: Accounts Receivable   | |
| | v Income Statement|  | Balance: $14,328,451           | |
| | v Balance Sheet   |  | Reconciled: Yes                | |
| |   > Cash          |  | Reconciler: Sarah Mitchell     | |
| |   > Accts Recv [*]|  | Date: March 5, 2026            | |
| |   > Inventory     |  |                                | |
| |   > Fixed Assets  |  | RECONCILIATION DETAIL          | |
| |   > Accts Pay     |  | GL Balance: $14,328,451        | |
| |   > Accrued Exp   |  | Sub-ledger: $14,328,451        | |
| |   > Long-term Debt|  | Difference: $0.00              | |
| |   > Equity        |  |                                | |
| | v Adjusting Entries|  | SUPPORTING EVIDENCE            | |
| | v Reconciliations |  | [pdf] AR Aging Report (234KB)  | |
| | v Bank Statements |  | [pdf] Top 10 Customer Confirms | |
| | v Variance Reports|  | [xls] AR Detail by Customer    | |
| | v AI Explanations |  | [pdf] Bank Statement Match     | |
| |                   |  |                                | |
| | FILTERS           |  | [Download All Evidence]        | |
| | Material only [x] |  | [Flag Issue]                   | |
| | With evidence [x] |  +--------------------------------+ |
| | Reconciled only [ ]|                                    |
| +-------------------+                                     |
+----------------------------------------------------------+
```

### Content Blocks

#### Left Sidebar: Binder Navigation
- Tree structure organized by financial statement section
- Expandable/collapsible sections
- Each leaf node is an account or document
- Indicators:
  - `[*]` = Flagged / has issue
  - Green dot = Reconciled with evidence
  - Yellow dot = Reconciled, evidence incomplete
  - Red dot = Not reconciled
  - No dot = Immaterial / not required
- Click any node to load its detail in the right panel
- **Filters at bottom**: Toggle material-only view, filter by evidence status

#### Right Panel: Document Viewer
- Shows detail for the selected account/document
- For balance sheet accounts: reconciliation detail + supporting evidence
- For adjusting entries: entry detail + approval history
- For bank statements: matched transactions + supporting docs
- For variance reports: IRAC explanations + supporting data
- For AI explanations: AI-drafted text with clear labeling "AI-GENERATED CONTENT"

**Evidence Files**:
- Listed with file type icon, name, and size
- Click to preview (PDF viewer inline, images inline, Excel opens in new tab)
- "Download All Evidence" button downloads a ZIP of all files for the selected account
- "Flag Issue" button lets James mark this account for follow-up (creates an "open item")

#### Flag Issue Modal
```
+----------------------------------+
| Flag Issue                       |
|                                  |
| Account: Accounts Receivable     |
|                                  |
| Issue Type: [v Select]           |
|  - Missing Evidence              |
|  - Insufficient Evidence         |
|  - Reconciliation Discrepancy    |
|  - Unusual Transaction           |
|  - Other                         |
|                                  |
| Description:                     |
| [                               ]|
| [                               ]|
|                                  |
| Severity: [Low] [Medium] [High] |
|                                  |
| [Flag Issue]  [Cancel]           |
+----------------------------------+
```

Flagged issues appear on the auditor dashboard as "Open Items" and can be exported in the workpaper download.

### Actions Available
1. Navigate binder tree
2. View account details and reconciliation
3. Preview/download evidence files
4. Flag issues on any account
5. Filter binder by materiality or evidence status
6. Download all evidence for an account (ZIP)
7. Download entire binder (ZIP, may be very large)

### Error States
| Error | Display |
|-------|---------|
| Evidence file not found | "This file is no longer available. It may have been removed by entity management. Contact your client." |
| Binder loading timeout | "Loading took longer than expected. This entity has a large binder. Retry with filtered view?" |
| Access denied to section | "Your access does not include {section}. Request expanded access from entity management." |

### API Data Requirements
```
GET /api/v1/audit/{entity_id}/binder
Response: {
  sections: [
    {
      name, type,
      items: [
        {
          id, name, account_number,
          balance, reconciled, reconciler, reconciled_at,
          evidence_count, has_issues, is_material,
          status: "complete" | "partial" | "missing"
        }
      ]
    }
  ]
}

GET /api/v1/audit/{entity_id}/binder/items/{item_id}
Response: {
  account: { name, number, balance, ... },
  reconciliation: { gl_balance, sub_ledger_balance, difference, detail },
  evidence: [
    { id, filename, type, size_bytes, preview_url, download_url }
  ],
  adjusting_entries: [ ... ],
  issues: [ { id, type, description, severity, flagged_by, flagged_at } ]
}

POST /api/v1/audit/{entity_id}/binder/items/{item_id}/issues
Body: { type, description, severity }
```

---

## SCREEN 6: SAMPLE SELECTION

**URL**: `/audit/{entity_id}/samples`
**Time spent**: 15-30 minutes (critical audit procedure)
**Emotional state**: Methodical, deliberate. Sample selection methodology must be defensible.

### Layout
```
+----------------------------------------------------------+
| [<- Back to Audit Workspace]  Sample Selection            |
+----------------------------------------------------------+
| SAMPLING PARAMETERS                                       |
| +------------------------------------------------------+ |
| | Population: [Revenue Transactions v]                 | |
| | Period: [Year ended December 31, 2025]               | |
| | Total Population: 14,328 transactions | $142.3M      | |
| |                                                      | |
| | Methodology: [Monetary Unit Sampling v]              | |
| | Confidence Level: [95% v]                            | |
| | Tolerable Misstatement: [$500,000      ]             | |
| | Expected Misstatement: [$50,000        ]             | |
| |                                                      | |
| | Calculated Sample Size: 47 transactions              | |
| |                                                      | |
| | [Generate Random Sample] [Manual Selection]          | |
| +------------------------------------------------------+ |
+----------------------------------------------------------+
| SELECTED SAMPLE                                           |
| +------------------------------------------------------+ |
| | # | Date     | Description      | Amount    | Status | |
| |---|----------|------------------|-----------|--------| |
| | 1 | Jan 15   | Invoice #4521    | $312,450  | [Rev]  | |
| | 2 | Feb 03   | Invoice #4687    | $89,200   | [Pend] | |
| | 3 | Mar 22   | Invoice #4891    | $1,245,300| [Rev]  | |
| | ...                                                   | |
| | 47| Dec 28   | Invoice #5901    | $67,800   | [Pend] | |
| +------------------------------------------------------+ |
|                                                          |
| Sample Coverage: $12.4M of $142.3M (8.7%)               |
| Reviewed: 23 of 47 (49%)                                 |
|                                                          |
| [Export Sample List (Excel)] [Export with Evidence (ZIP)] |
+----------------------------------------------------------+
```

### Content Blocks

#### Sampling Parameters
- **Population selector**: Dropdown to choose which transaction population to sample (Revenue, Disbursements, Payroll, Journal Entries, etc.)
- **Period**: Auto-filled from engagement period, editable for interim testing
- **Population stats**: Total count and dollar amount, auto-calculated from entity data
- **Methodology**: Dropdown: Monetary Unit Sampling (MUS), Random, Stratified Random, Judgmental
- **Confidence and misstatement inputs**: Standard audit sampling parameters. Pre-filled with common defaults.
- **Calculated sample size**: Auto-calculated based on methodology and parameters. Shows the formula used.
- **Generate Random Sample**: System generates a statistically random sample based on methodology. Seeds the random selection with a documented seed for reproducibility.
- **Manual Selection**: Allows James to add specific transactions by ID (for targeted testing)

#### Selected Sample Table
- Shows all selected transactions
- Columns: Row number, Date, Description, Amount, Review Status
- Review Status: "Reviewed" (green, James has examined it), "Pending" (gray), "Issue" (red, James flagged a problem)
- Click a row to view transaction detail + supporting evidence (opens in a slide-out panel similar to binder)
- Sort by any column

#### Sample Stats
- Coverage statistics: dollar coverage as percentage of population
- Review progress: how many James has reviewed vs total sample size

### Actions Available
1. Configure sampling parameters
2. Generate random sample
3. Add manual selections
4. Review individual transactions (click row)
5. Mark transactions as reviewed / flag issues
6. Export sample list
7. Export sample with all supporting evidence

### API Data Requirements
```
GET /api/v1/audit/{entity_id}/samples/populations
Response: {
  populations: [
    { id, name, transaction_count, total_amount, currency }
  ]
}

POST /api/v1/audit/{entity_id}/samples/calculate
Body: {
  population_id, methodology, confidence_level,
  tolerable_misstatement, expected_misstatement
}
Response: {
  calculated_sample_size: number,
  formula_description: string
}

POST /api/v1/audit/{entity_id}/samples/generate
Body: {
  population_id, sample_size, methodology, seed
}
Response: {
  sample_id, transactions: [
    { id, date, description, amount, reference_number }
  ]
}

GET /api/v1/audit/{entity_id}/samples/{sample_id}/transactions/{transaction_id}
Response: {
  transaction: { ... },
  evidence: [ { filename, type, size, preview_url, download_url } ],
  review_status: "pending" | "reviewed" | "issue",
  issue: { type, description } | null
}

PATCH /api/v1/audit/{entity_id}/samples/{sample_id}/transactions/{transaction_id}
Body: { review_status, issue }
```

---

## SCREEN 7: STATEMENT REVIEW (Auditor View)

**URL**: `/audit/{entity_id}/statements`
**Time spent**: 20-40 minutes
**Emotional state**: Analytical. James is performing substantive analytical procedures.

### Layout
```
+----------------------------------------------------------+
| [<- Back to Audit Workspace]  Financial Statement Review   |
+----------------------------------------------------------+
| [Income Statement] [Balance Sheet] [Cash Flow] [Equity]  |
+----------------------------------------------------------+
|                                                          |
| INCOME STATEMENT - Meridian Manufacturing                 |
| Year ended December 31, 2025                              |
|                                                          |
| +------------------------------------------------------+ |
| |                  | Current | Prior  | Var $  | Var %  | |
| |                  | Year    | Year   |        |        | |
| |------------------|---------|--------|--------|--------| |
| | Revenue          | 542.1M  | 518.3M | +23.8M | +4.6% | |
| |  [drill ->]      |         |        |        | [AI]   | |
| | COGS             |(328.4M) |(310.1M)| -18.3M | +5.9% | |
| |  [drill ->]      |         |        |        | [!]    | |
| | Gross Profit     | 213.7M  | 208.2M | +5.5M  | +2.6% | |
| | ...              |         |        |        |        | |
| | EBITDA           | 168.4M  | 162.1M | +6.3M  | +3.9% | |
| |  Add-backs:      |         |        |        |        | |
| |  Mgmt fees       | 4.2M    | 3.8M   | +0.4M  | +10.5%| |
| |  Restructuring   | 2.1M    | --     | +2.1M  | NEW   | |
| +------------------------------------------------------+ |
|                                                          |
| AUDITOR ANNOTATIONS                                      |
| COGS +5.9% vs Revenue +4.6% -> Margin compression.      |
| Investigate raw material costs. [AI flag]                |
|                                                          |
| [Flag for workpaper] [Add annotation]                    |
| [Export with annotations (Excel)]                        |
+----------------------------------------------------------+
```

### Content Blocks

#### Statement Table
- Standard financial statement with current year, prior year, and variance columns
- Each line item has:
  - `[drill ->]` link: expands to show sub-account detail
  - `[AI]` icon: indicates an AI-generated explanation exists. Click to view.
  - `[!]` icon: system-flagged variance (>5% or exceeds materiality threshold). Highlighted row.
- Add-backs section clearly delineated for PE-specific items

#### AI Explanation Indicator
When James clicks `[AI]` on a line item:
```
+-----------------------------------------------+
| AI-Generated Explanation                       |
| [AI GENERATED - AUDITOR: Exercise professional |
|  skepticism. Verify against source documents.] |
|                                                |
| ISSUE: COGS increased 5.9% while revenue      |
| increased only 4.6%, resulting in 130 bps      |
| margin compression.                            |
|                                                |
| RULE: Per ASC 330, inventory cost increases    |
| should be evaluated for proper period cutoff   |
| and lower of cost or NRV assessment.           |
|                                                |
| APPLICATION: Raw material costs increased 8.2% |
| in H2 2025 due to global supply constraints.   |
| Management represents this is a market-wide    |
| condition affecting all competitors similarly.  |
|                                                |
| CONCLUSION: The margin compression is           |
| consistent with industry trends. However,      |
| auditor should verify inventory valuation and  |
| confirm no obsolescence issues.                |
|                                                |
| [View Supporting Evidence]                     |
| [Flag: Insufficient Explanation]               |
| [Flag: Requires Corroboration]                 |
+-----------------------------------------------+
```

CRITICAL: AI explanations are clearly labeled as AI-generated. The system explicitly reminds auditors to exercise professional skepticism. James can flag AI explanations as insufficient or requiring corroboration.

#### Auditor Annotations
- James can add freeform text annotations on any line item
- Annotations are stored per-auditor, per-entity, per-period
- Exportable with the statements for inclusion in workpapers

### Actions Available
1. Switch between four statements
2. Drill into line items
3. View AI-generated explanations
4. Flag AI explanations as needing corroboration
5. Add freeform annotations
6. Flag line items for workpaper inclusion
7. Export statements with annotations

### API Data Requirements
```
GET /api/v1/audit/{entity_id}/statements/{type}
Response: {
  statement_type, period_end,
  columns: ["current_year", "prior_year", "variance_amount", "variance_pct"],
  line_items: [
    {
      id, label, indent_level, is_subtotal, is_total,
      values: { current_year, prior_year, variance_amount, variance_pct },
      is_material, has_ai_explanation, ai_explanation_id,
      drill_down_available: boolean,
      auditor_annotations: [ { id, text, created_at } ]
    }
  ],
  addbacks: [ { description, current_year, prior_year, variance } ]
}

GET /api/v1/audit/{entity_id}/ai-explanations/{explanation_id}
Response: {
  id, account, generated_at,
  irac: { issue, rule, application, conclusion },
  supporting_evidence: [ { id, filename, type } ],
  auditor_flags: [ { type, flagged_by, flagged_at } ]
}

POST /api/v1/audit/{entity_id}/statements/{type}/annotations
Body: { line_item_id, text }

POST /api/v1/audit/{entity_id}/ai-explanations/{id}/flag
Body: { type: "insufficient" | "requires_corroboration", note }
```

---

## SCREEN 8: WORKPAPER DOWNLOAD

**URL**: `/audit/{entity_id}/workpapers`
**Time spent**: 5-10 minutes
**Emotional state**: Administrative, packaging. James is preparing to take data back to his audit software.

### Layout
```
+----------------------------------------------------------+
| [<- Back to Audit Workspace]  Workpaper Download          |
+----------------------------------------------------------+
|                                                          |
| SELECT WORKPAPER COMPONENTS                              |
|                                                          |
| FINANCIAL STATEMENTS                                     |
| [x] Income Statement (with annotations)                  |
| [x] Balance Sheet (with annotations)                     |
| [x] Statement of Cash Flows                              |
| [x] Statement of Changes in Equity                       |
|                                                          |
| AUDIT EVIDENCE                                           |
| [x] Complete Audit Binder (142 documents)                |
| [x] Reconciliation Summaries                             |
| [x] Bank Statement Matches                               |
| [x] Adjusting Entry Details with Approvals               |
|                                                          |
| SAMPLING                                                 |
| [x] Sample Selection Methodology & Parameters            |
| [x] Selected Samples with Evidence                       |
| [x] Sample Results & Exceptions                          |
|                                                          |
| VERIFICATION                                             |
| [x] Certification Verification Report                    |
| [x] Hash Chain Export (JSON)                             |
| [x] Digital Signature Details                             |
|                                                          |
| AI-GENERATED CONTENT                                     |
| [x] Variance Explanations (IRAC format)                  |
| [x] AI Content Flags & Auditor Notes                     |
|                                                          |
| OTHER                                                    |
| [x] Audit Trail / Activity Log                           |
| [x] Flagged Issues Summary                               |
| [x] Auditor Annotations Export                           |
|                                                          |
| FORMAT                                                   |
| Primary: [Excel Workbook v] (financial data)             |
| Evidence: [ZIP Archive] (PDF/document files)             |
| Verification: [JSON + PDF] (machine + human readable)    |
|                                                          |
| Estimated package size: 847 MB                           |
|                                                          |
| [Generate Workpaper Package]                              |
+----------------------------------------------------------+
```

### Content
- Comprehensive checklist of all exportable components
- All checked by default (James can deselect what he doesn't need)
- Format options per category
- Estimated download size
- Generation may take several minutes for large packages

### Actions Available
1. Select/deselect components
2. Choose formats
3. Generate and download
4. View generation progress

### Post-Generation
- Progress bar during generation
- On completion: auto-download triggers
- Package is a ZIP containing organized folders:
  ```
  workpapers_meridian_mfg_fy2025/
  ├── financial_statements/
  │   ├── income_statement.xlsx
  │   ├── balance_sheet.xlsx
  │   ├── cash_flow.xlsx
  │   └── equity.xlsx
  ├── audit_evidence/
  │   ├── reconciliations/
  │   ├── bank_statements/
  │   └── adjusting_entries/
  ├── sampling/
  │   ├── methodology.pdf
  │   ├── selected_samples.xlsx
  │   └── evidence/
  ├── verification/
  │   ├── certification_report.pdf
  │   ├── hash_chain.json
  │   └── signature_details.pdf
  ├── ai_content/
  │   ├── variance_explanations.pdf
  │   └── auditor_flags.xlsx
  └── other/
      ├── audit_trail.xlsx
      ├── flagged_issues.xlsx
      └── annotations.xlsx
  ```

### API Data Requirements
```
POST /api/v1/audit/{entity_id}/workpapers/generate
Body: {
  components: [string],
  formats: { financial: "xlsx", evidence: "zip", verification: "json_pdf" }
}
Response: { job_id, status: "processing", estimated_size_bytes }

GET /api/v1/export/jobs/{job_id}
Response: { status, progress_pct, download_url, error }
```

---

## TIME BUDGET ACROSS SCREENS (2-6 weeks fieldwork)

| Screen | Time per Visit | Frequency | Total over Engagement |
|--------|---------------|-----------|----------------------|
| Public Verification | 1-2 min | Once at start | 2 min |
| Audit Access Request | 2-3 min | Once | 3 min |
| Auditor Dashboard | 1-2 min | Daily during fieldwork | 30 min |
| Audit Binder | 30-60 min | Daily, multiple sessions | 15-25 hours |
| Sample Selection | 15-30 min | 3-5 populations | 2-3 hours |
| Statement Review | 20-40 min | Multiple passes | 4-8 hours |
| Hash Chain Explorer | 2-5 min | Once or twice | 10 min |
| Workpaper Download | 5-10 min | 2-3 times (interim + final) | 20 min |

James spends the vast majority of his Sabit time in the Audit Binder and Statement Review screens.


---

# JAMES WRIGHT -- DECISION TREES, HANDOFFS, SCENARIOS, EDGE CASES

---

## B. DECISION TREE

### Decision Tree 1: Verification Outcome

```
James receives certification ID from client (David/Sarah)
  |
  +-- Navigate to /verify
  +-- Enter certification ID
  +-- System returns result
  |
  +-- PASS:
  |     |
  |     +-- Check certification history
  |     |     |
  |     |     +-- Certified once (clean): Proceed to audit binder work
  |     |     |
  |     |     +-- Re-certified (multiple versions):
  |     |           +-- Read reason for re-certification
  |     |           +-- Was re-certification before or after original audit date?
  |     |           |     +-- Before: Acceptable if reason is routine
  |     |           |     +-- After: RED FLAG. Investigate what changed.
  |     |           +-- Compare statement hashes between versions
  |     |           +-- Document re-certification in workpapers
  |     |
  |     +-- Check all statement hashes match: All MATCH -> good
  |     +-- Download verification report PDF for workpapers
  |     +-- Proceed to request audit access (or login if already granted)
  |
  +-- FAIL:
        |
        +-- What type of failure?
        |     |
        |     +-- SIGNATURE_MISMATCH:
        |     |     +-- CRITICAL. Data may have been tampered with.
        |     |     +-- DO NOT proceed with audit.
        |     |     +-- Download failure report PDF.
        |     |     +-- Contact engagement partner IMMEDIATELY.
        |     |     +-- Contact client management (David/Sarah) for explanation.
        |     |     +-- Document in workpapers as potential integrity issue.
        |     |     +-- Consider implications for engagement continuation.
        |     |
        |     +-- HASH_CHAIN_BROKEN:
        |     |     +-- SERIOUS. Audit trail has been compromised.
        |     |     +-- Identify which block(s) are broken.
        |     |     +-- Request explanation from client.
        |     |     +-- May require expanded testing procedures.
        |     |     +-- Document and discuss with engagement partner.
        |     |
        |     +-- CERTIFICATION_NOT_FOUND:
        |     |     +-- Likely wrong ID. Ask client to re-send.
        |     |     +-- If client insists ID is correct: escalate.
        |     |
        |     +-- CERTIFICATION_EXPIRED:
        |           +-- Period was re-certified. Use the new certification ID.
        |           +-- If no new certification exists: ask why it was revoked.
        |
        +-- In all failure cases: DO NOT rely on the data until resolved.
```

### Decision Tree 2: Audit Binder Review

```
James opens Audit Binder for an account
  |
  +-- Is account material?
  |     |
  |     +-- YES: Full review required
  |     |     |
  |     |     +-- Is account reconciled?
  |     |     |     |
  |     |     |     +-- YES with evidence:
  |     |     |     |     +-- Review reconciliation (GL to sub-ledger)
  |     |     |     |     +-- Examine supporting evidence
  |     |     |     |     +-- Is evidence sufficient?
  |     |     |     |     |     +-- YES: Mark as reviewed, move to next
  |     |     |     |     |     +-- NO: Flag issue "Insufficient Evidence"
  |     |     |     |     |           +-- Request additional evidence from Sarah
  |     |     |     |     +-- Any reconciling items?
  |     |     |     |           +-- Immaterial: Note and move on
  |     |     |     |           +-- Material: Investigate each item
  |     |     |     |
  |     |     |     +-- YES without evidence:
  |     |     |     |     +-- Flag issue "Missing Evidence"
  |     |     |     |     +-- Cannot rely on reconciliation without evidence
  |     |     |     |     +-- Request evidence from Sarah
  |     |     |     |
  |     |     |     +-- NOT reconciled:
  |     |     |           +-- Flag issue "Reconciliation Missing"
  |     |     |           +-- Material unreconciled balance = audit finding
  |     |     |           +-- Communicate to David (CFO) as deficiency
  |     |     |
  |     |     +-- Check for bank statement matching
  |     |     +-- Check for adjusting entries on this account
  |     |     +-- Review AI-generated explanations with skepticism
  |     |
  |     +-- NO (immaterial):
  |           +-- Brief scan, no detailed testing required
  |           +-- Note materiality assessment in workpapers
  |           +-- Move to next account
  |
  +-- After all accounts reviewed:
        +-- Compile flagged issues list
        +-- Determine if issues require expanded testing
        +-- If expanded testing needed -> go to Sample Selection
        +-- If clean -> proceed to Statement Review for analytical procedures
```

### Decision Tree 3: Sample Review

```
James has selected a sample of transactions
  |
  +-- For each transaction in sample:
  |     |
  |     +-- Examine transaction detail
  |     +-- Review supporting evidence (invoice, PO, receipt, etc.)
  |     |
  |     +-- Does evidence support the transaction?
  |     |     |
  |     |     +-- YES: Mark as "Reviewed", no exceptions
  |     |     |
  |     |     +-- PARTIALLY: Note exception, continue
  |     |     |     +-- Document what is missing
  |     |     |     +-- Request additional evidence
  |     |     |
  |     |     +-- NO: Mark as "Issue"
  |     |           +-- Document the nature of the issue
  |     |           +-- Determine if this is an isolated error or systemic
  |     |           +-- DECISION: Expand sample?
  |     |                 |
  |     |                 +-- Isolated (first exception in many items): Continue
  |     |                 +-- Pattern (2+ similar exceptions): EXPAND SAMPLE
  |     |                 |     +-- Increase sample size by 50-100%
  |     |                 |     +-- Generate additional random selections
  |     |                 |     +-- May need to stratify differently
  |     |                 +-- Material single item: ESCALATE
  |     |                       +-- Discuss with engagement partner
  |     |                       +-- May require management representation letter
  |
  +-- After all items reviewed:
        +-- Calculate exception rate
        +-- Does exception rate exceed tolerable misstatement?
        |     +-- YES: Potential audit finding. Expand scope or qualify.
        |     +-- NO: Conclude that account is fairly stated (within tolerance)
        +-- Document results in workpapers
        +-- Export sample results
```

### Decision Tree 4: AI Explanation Evaluation

```
James encounters an AI-generated IRAC explanation
  |
  +-- Read the explanation
  |
  +-- Is the explanation substantively reasonable?
  |     |
  |     +-- YES:
  |     |     +-- Does it reference verifiable facts?
  |     |     |     +-- YES: Cross-reference facts against evidence in binder
  |     |     |     |     +-- Facts confirmed: Accept explanation as supporting
  |     |     |     |     +-- Facts not confirmed: Flag "Requires Corroboration"
  |     |     |     +-- NO: Flag "Insufficient - Lacks Specificity"
  |     |     |
  |     |     +-- Is it used verbatim in management representations?
  |     |           +-- If James suspects management is using AI text as their own
  |     |             analysis without independent verification:
  |     |           +-- Flag "Requires Management Attestation"
  |     |           +-- Note in workpapers: "AI-generated content. Auditor to
  |     |             verify management has independently corroborated."
  |     |
  |     +-- NO (explanation is generic, boilerplate, or factually questionable):
  |           +-- Flag "Insufficient Explanation"
  |           +-- Do NOT rely on AI explanation as audit evidence
  |           +-- Request management's own explanation
  |           +-- Document in workpapers that AI explanation was rejected
  |
  +-- In ALL cases:
        +-- James never relies solely on AI-generated explanations
        +-- They are treated as a starting point, not evidence
        +-- All material items require corroborating evidence
        +-- Workpapers must clearly distinguish AI content from auditor analysis
```

---

## C. INTER-PERSONA HANDOFFS

### James Receives Certification ID from Sarah/David

**Trigger**: The entity's financial close is complete. David (CFO) signs the certification. Sarah or David communicates the certification ID to James.

**How James receives it**:
- James does NOT receive the certification ID through Sabit (he has no account yet, or may only use public verification).
- Delivery methods (all external to Sabit):
  - Email from David: "James, the FY 2025 financials for Meridian Manufacturing have been certified. Verification ID: cert_a8f3c2d1e4b5f6a7. You can verify at https://app.sabit.com/verify/cert_a8f3c2d1e4b5f6a7"
  - PBC (Prepared by Client) list: certification ID included in the standard PBC request response
  - Audit management letter: certification details included

**What James does next**:
1. Goes to `/verify/{signature_id}` to independently verify
2. Downloads verification report for workpapers
3. If he needs deeper access, requests audit access
4. Begins audit binder review once access is granted

### James Requests Additional Evidence from Sarah

**Context**: During audit binder review, James finds missing or insufficient evidence for a material account.

**How this handoff works in Sabit**:
1. James flags the issue in the audit binder ("Flag Issue" button)
2. The flag creates an "Open Item" visible on his auditor dashboard
3. The flag ALSO triggers a notification to the entity:
   - Sarah (controller) receives an in-app notification: "External auditor has flagged Accounts Receivable for additional evidence."
   - David (CFO) receives the same notification
   - Notification includes: account name, issue type, James's description
4. Sarah provides additional evidence by uploading files to the account's evidence section
5. When Sarah uploads, James receives a notification: "New evidence uploaded for Accounts Receivable by Sarah Mitchell."
6. James reviews the new evidence and resolves or maintains the flag.

**Important**: James does NOT have write access to the entity's data. He cannot modify financial data, reconciliations, or adjusting entries. He can only:
- View data (read-only)
- Flag issues (creates notifications)
- Add annotations (visible only to his auditor workspace)
- Select samples
- Download data

### James Reports Findings to David

**How James communicates findings**:
1. **Within Sabit**: James's flagged issues are visible to David in the entity's admin panel. David can see a "Auditor Issues" section showing all flags, their severity, and descriptions.
2. **Outside Sabit**: James communicates findings in standard audit deliverables (management letters, deficiency notices, etc.) prepared outside the system.
3. **Sabit export supports this**: James exports his flagged issues list as part of the workpaper download. This export includes: issue type, account, description, severity, status, and any evidence gaps identified.

### What James Sees from Other Personas' Activity

- **From Sarah**: Reconciliation completions, evidence uploads, GL processing activity
- **From David**: Certification events, approvals of adjusting entries, sign-offs
- **From Marcus**: Nothing. James has no visibility into PE operating partner activity.
- **From Karen**: Nothing. James has no visibility into fund-level aggregation.
- **From other auditors**: If multiple auditors from the same firm are working on the engagement, they share the same auditor workspace and can see each other's flags and annotations.

---

## D. FIRST-TIME VS REPEAT EXPERIENCE

### First Audit of This Client (Year 1)

**Context**: James's firm is auditing this entity for the first time. No baseline exists in Sabit for James. Maximum professional skepticism.

**Experience differences**:

1. **Public Verification**: Same experience. No prior context to compare against.

2. **Audit Access Request**: James must go through the full request flow. He has no existing account. Entity management must approve. May take 1-4 hours.

3. **Auditor Dashboard**:
   - "Samples Selected" shows 0 (no prior year samples to reference)
   - No prior year comparatives available in statement review
   - No baseline for "what does normal look like" at this entity

4. **Audit Binder**:
   - James must understand the entity's chart of accounts for the first time
   - More time spent navigating the structure and understanding account relationships
   - Cannot compare to prior year evidence quality
   - First-time contextual guidance: "This is your first engagement with this entity. The binder is organized by financial statement section. Use the left sidebar to navigate."

5. **Sample Selection**:
   - No prior year sample results to reference
   - James likely selects larger sample sizes (no baseline to reduce scope)
   - Methodology documentation is especially important

6. **Statement Review**:
   - Prior year column may show data from predecessor auditor's period (if entity was on Sabit before) or may be empty
   - James must establish his own analytical expectations from scratch
   - More annotations needed to document initial understanding

7. **Time impact**: First-year audit takes 50-100% longer than subsequent years. James spends more time in the audit binder (understanding vs. confirming).

### Subsequent Year Audit (Year 2+)

**Context**: James audited this entity last year. He has a baseline. Trust is building.

**Experience differences**:

1. **Login**: James already has an account. Goes directly to `/audit/login`. Access may need to be re-activated for the new period (CFO approval, but streamlined).

2. **Auditor Dashboard**:
   - Shows prior year engagement stats for comparison
   - "Prior Year: 52 samples, 2 issues flagged, 0 material findings"
   - This helps James calibrate current year effort

3. **Audit Binder**:
   - James can compare current year evidence to prior year (toggle "Show Prior Year" option)
   - Accounts that had issues last year are highlighted
   - Reconciliation quality can be assessed as "improving", "consistent", or "deteriorating"
   - Less time needed for navigation (familiar structure)

4. **Sample Selection**:
   - Prior year sample results available for reference
   - If prior year was clean, James may reduce sample size
   - System suggests: "Prior year sample: 47 items, 0 exceptions. Suggested current year: 40 items."

5. **Statement Review**:
   - Prior year comparatives are fully available
   - Year-over-year variance analysis is automatic
   - James's prior year annotations carry forward as reference (clearly labeled "Prior Year Note")
   - AI explanations can be compared: "Similar explanation was provided last year for this variance"

### Interim vs Year-End Fieldwork

**Interim (mid-year testing)**:
- James works with partial-year data
- Sample selection covers transactions through the interim date
- Statement review uses interim (unaudited) financials
- Audit binder shows reconciliations as of interim date
- Goal: complete significant testing early, reduce year-end crunch

**Year-End**:
- Full-year data is certified
- James performs roll-forward procedures (testing from interim date to year-end)
- Statement review uses final certified financials
- All accounts are expected to be fully reconciled
- Workpaper download includes both interim and year-end packages

**System support for interim/year-end**:
- Auditor dashboard shows engagement stage: "Interim" or "Year-End"
- Sample selection allows scoping to date ranges
- Binder navigation shows reconciliation status at both interim and year-end dates
- Statement review has a three-column view: Interim | Year-End | Change

---

## E. EDGE CASES

### Edge Case 1: Hash Chain Shows Tampering

**Trigger**: Verification returns FAIL with `HASH_CHAIN_BROKEN` status.

**System behavior**:
1. **Verification Result page**: Red FAIL banner. Hash Chain section shows: "Chain Status: BROKEN AT BLOCK 412"
2. **Detail**: "Block 412 hash does not match the hash computed from block content and block 411. The chain integrity is compromised from block 412 forward."
3. **Hash Chain Explorer**: Block 412 is highlighted in red. All subsequent blocks are highlighted in yellow ("unverifiable -- depends on broken block").
4. **Block 412 detail shows**: Previous hash (from block 411), stored hash (what was recorded), computed hash (what it should be based on content), and MISMATCH indicator.

**What James does**:
- Downloads the failure report and chain export immediately
- Contacts engagement partner: this is a material concern about data integrity
- Contacts client management (David) for explanation
- Possible benign explanations:
  - System migration or data restoration introduced a gap
  - Bug in the hash computation (software issue, not fraud)
- Possible malign explanations:
  - Someone modified historical data after the fact
  - Audit trail was manipulated to conceal changes
- **Audit impact**: Cannot rely on audit trail from block 412 forward. Must perform additional substantive procedures. May need to disclaim on certain areas.

### Edge Case 2: Certification Was Made Then Period Reopened and Re-Certified

**Trigger**: `certification_history.length > 1` for the audit period.

**System behavior**:
1. **Verification Result**: Certification History section shows both events:
   ```
   Version 1: Certified March 5, 2026 14:00 UTC by David Chen
   Version 2: Re-certified March 8, 2026 16:42 UTC by David Chen
   Reason: "Corrected adjusting entry AJE-2026-003 for insurance accrual"
   ```
2. **Statement hashes differ**: The hashes for Version 1 and Version 2 are different, meaning the financial statements changed.
3. **Audit Binder**: The adjusting entry section shows AJE-2026-003 with full detail:
   - Original entry (in Version 1)
   - Modified entry (in Version 2)
   - Who changed it, when, and the stated reason
   - Approval workflow for the change

**What James does**:
- Evaluates the reason for re-certification:
  - Routine correction (caught an error before audit): Lower concern
  - Correction AFTER auditor questions (management adjusting to match auditor expectations): Higher concern
  - Multiple re-certifications: Pattern of unreliable initial close process
- Reviews the specific changes between versions
- Documents in workpapers: the fact of re-certification, what changed, the reason, and his assessment
- If re-certification was AFTER James communicated a finding: document this separately as it could indicate management bias

### Edge Case 3: Evidence Files Missing for Material Reconciliations

**Trigger**: James clicks into a material balance sheet account and finds reconciliation status "Reconciled" but evidence section is empty or has only trivial documents.

**System behavior**:
1. **Audit Binder**: Account shows green "Reconciled" dot in sidebar BUT evidence count shows "0 files" or files that don't support the reconciliation (e.g., a blank template was uploaded).
2. **No system-level flag**: Sabit allows a reconciliation to be marked complete without evidence (this is the entity's discretion). The system does not enforce evidence quality.

**What James does**:
1. Flags the issue: "Missing Evidence" with severity "High"
2. Description: "Accounts Receivable ($14.3M) is marked as reconciled but no supporting evidence (aging report, customer confirmations, sub-ledger detail) has been uploaded."
3. This triggers a notification to Sarah and David
4. James cannot proceed with this account until evidence is provided
5. If evidence is not provided within a reasonable timeframe:
   - This becomes a scope limitation
   - James documents it as a potential material weakness in internal controls
   - May result in a qualified audit opinion or scope limitation paragraph

### Edge Case 4: AI-Drafted Explanations Used Verbatim

**Trigger**: James reviews management's variance explanations and notices they are identical to the AI-generated IRAC text in Sabit.

**System behavior**:
- Sabit clearly labels all AI-generated content with "[AI-GENERATED]" badges
- The statement review screen shows an `[AI]` icon next to any variance explanation that is system-generated
- If the entity's management representation letter contains text that matches AI-generated explanations word-for-word, this is visible to James

**What James does**:
1. Flags the explanation: "Requires Management Attestation"
2. Adds annotation: "Variance explanation appears to be AI-generated text used without modification. Auditor requires management's independent corroboration of the facts stated."
3. Requests a meeting or written confirmation from management (David) that they have independently verified the AI-generated analysis
4. Documents in workpapers: "Management's variance explanations for [accounts] appear to be AI-generated content from the Sabit system. Per AS 2810, the auditor is required to evaluate whether management has sufficient basis for its representations. Auditor requested and obtained management's independent confirmation."
5. If management cannot independently confirm: the AI explanation is NOT audit evidence. James must obtain alternative evidence.

### Edge Case 5: Auditor Access Revoked Mid-Engagement

**Trigger**: Entity management revokes James's audit access (perhaps due to billing dispute, personnel change, or adversarial situation).

**System behavior**:
1. **On next login**: James sees: "Your access to Meridian Manufacturing has been revoked by entity management on [date]. Contact your engagement partner and client management."
2. **Data previously downloaded**: Still available on James's local machine
3. **In-progress work**: Flagged issues and annotations are preserved in Sabit but inaccessible to James until access is restored
4. **Notification**: James receives email: "Your audit access to Meridian Manufacturing has been revoked."

**What James does**:
- Contacts engagement partner immediately (this is a scope limitation)
- Engagement partner contacts entity management to understand and resolve
- If access is not restored: potential withdrawal from engagement or scope limitation in audit report
- Documents the event in workpapers

---

## F. NOTIFICATIONS

### Notification Triggers for James

James receives minimal notifications. He is not a daily user of the system. Most of his work is on-demand during fieldwork.

| Event | In-App | Email | Priority |
|-------|--------|-------|----------|
| Audit access granted | Badge (if logged in) | Standalone email | High |
| Audit access revoked | N/A (can't log in) | Standalone email | Critical |
| New evidence uploaded for flagged account | Badge | Standalone email | Medium |
| Entity re-certified during engagement | Badge | Standalone email | High |
| Flagged issue responded to by entity | Badge | Standalone email | Medium |
| Workpaper export job completed | Toast | None | Low |
| Access expiring in 7 days | Badge | Standalone email | Medium |

### Email Templates

**Access Granted**:
```
Subject: Audit Access Granted - Meridian Manufacturing

James,

Your audit access request for Meridian Manufacturing (FY 2025) has been approved by David Chen, CFO.

Access scope: Full audit binder, financial statements, sample selection, hash chain verification

You can log in at: https://app.sabit.com/audit/login
Your temporary password has been sent in a separate email.

Access expires: June 30, 2026 (unless extended)

[Log In to Audit Workspace]
```

**Evidence Uploaded for Flagged Account**:
```
Subject: New Evidence Uploaded - Accounts Receivable - Meridian Manufacturing

James,

Sarah Mitchell has uploaded new evidence for an account you flagged:

Account: Accounts Receivable
Your flag: Missing Evidence (flagged March 14, 2026)

New files uploaded:
- AR_Aging_Report_Dec2025.pdf (342 KB)
- Customer_Confirmations_Dec2025.pdf (1.2 MB)
- AR_Subledger_Detail.xlsx (89 KB)

[Review Evidence in Audit Binder]
```

---

## G. DATA REQUIREMENTS PER SCREEN (Summary)

| Screen | Primary Endpoint | Method | Auth |
|--------|-----------------|--------|------|
| Public Verification (landing) | None (client-side only) | -- | None |
| Verification Result | `/api/v1/verify/{signature_id}` | GET | None (public) |
| Hash Chain Explorer | `/api/v1/verify/{signature_id}/chain` | GET | None (public) |
| Hash Chain Download | `/api/v1/verify/{signature_id}/chain/download` | GET | None (public) |
| Audit Access Request | `/api/v1/audit/access-request` | POST | None |
| Auditor Login | `/api/v1/auth/login` | POST | Basic |
| Auditor Dashboard | `/api/v1/audit/{entity_id}/dashboard` | GET | Bearer |
| Audit Binder (tree) | `/api/v1/audit/{entity_id}/binder` | GET | Bearer |
| Audit Binder (item detail) | `/api/v1/audit/{entity_id}/binder/items/{item_id}` | GET | Bearer |
| Flag Issue | `/api/v1/audit/{entity_id}/binder/items/{item_id}/issues` | POST | Bearer |
| Sample Populations | `/api/v1/audit/{entity_id}/samples/populations` | GET | Bearer |
| Calculate Sample Size | `/api/v1/audit/{entity_id}/samples/calculate` | POST | Bearer |
| Generate Sample | `/api/v1/audit/{entity_id}/samples/generate` | POST | Bearer |
| Transaction Detail | `/api/v1/audit/{entity_id}/samples/{sid}/transactions/{tid}` | GET | Bearer |
| Update Review Status | `/api/v1/audit/{entity_id}/samples/{sid}/transactions/{tid}` | PATCH | Bearer |
| Statement Review | `/api/v1/audit/{entity_id}/statements/{type}` | GET | Bearer |
| AI Explanation Detail | `/api/v1/audit/{entity_id}/ai-explanations/{id}` | GET | Bearer |
| Flag AI Explanation | `/api/v1/audit/{entity_id}/ai-explanations/{id}/flag` | POST | Bearer |
| Add Annotation | `/api/v1/audit/{entity_id}/statements/{type}/annotations` | POST | Bearer |
| Generate Workpapers | `/api/v1/audit/{entity_id}/workpapers/generate` | POST | Bearer |
| Export Job Status | `/api/v1/export/jobs/{job_id}` | GET | Bearer |


---

# CROSS-PERSONA SPECIFICATIONS
# HANDOFF MAP, NOTIFICATION MATRIX, FIRST-TIME EXPERIENCE

---

## INTER-PERSONA HANDOFF MAP

This map covers all five personas (Sarah, David, Marcus, Karen, James) even though only three are the focus of this document. Handoffs involving Sarah and David are included for completeness since they are upstream/downstream of the three focus personas.

### Complete Handoff Table

| # | From | To | Trigger | What Sender Does | What Receiver Sees | Latency |
|---|------|----|---------|-----------------|-------------------|---------|
| 1 | Sarah (Controller) | David (CFO) | Close steps complete, ready for review | Sarah clicks "Submit for CFO Review" on the close workflow. All reconciliations complete, AJEs approved, statements generated. | David's approval queue shows a new item: "{Entity} {Period} ready for review." Badge on his dashboard increments. Email notification sent. | Real-time (in-app), <5 min (email) |
| 2 | David (CFO) | Sarah (Controller) | David requests changes during review | David rejects an adjusting entry or flags a reconciliation issue. Adds comment explaining required change. | Sarah sees the item back in her workflow with "Changes Requested" status and David's comment. In-app notification + email. | Real-time |
| 3 | David (CFO) | Marcus (PE Partner) | David certifies the period | David applies Ed25519 digital signature, completing certification. | Marcus's portfolio dashboard updates: entity status changes to "Certified", KPI count increments. If entity was previously flagged overdue, a "Resolved" notification appears. No push notification for routine certification. | Dashboard updates within 1 minute. No immediate notification. Appears in next daily digest. |
| 4 | David (CFO) | Karen (Fund Controller) | David certifies the period | Same as #3 | Karen's fund dashboard certification count increments. Progress bar advances. Entity row moves to "Certified" section. "Download Data" becomes available. In-app notification: "{Entity} certified." | Real-time (dashboard), digest (email) |
| 5 | David (CFO) | James (Auditor) | David shares certification ID | David sends certification ID to James via email (external to Sabit). May also be included in PBC list. | James receives email with certification ID and verification URL. No in-app notification (James may not have a Sabit account yet). | Manual, depends on when David sends email. Usually 1-24 hours after certification. |
| 6 | Sarah (Controller) | James (Auditor) | Sarah uploads evidence for flagged account | Sarah uploads files to the account's evidence section in response to James's flag. | James receives in-app notification (if logged in) + email: "New evidence uploaded for {account} by {Sarah}." Flag status changes to "Evidence Provided." | Real-time (in-app), <5 min (email) |
| 7 | David (CFO) | James (Auditor) | David approves audit access request | David reviews James's access request in entity admin panel and clicks "Approve." | James receives email with login credentials and access confirmation. Can now log in to auditor workspace. | 1-4 hours (during business hours), up to 24 hours |
| 8 | James (Auditor) | Sarah (Controller) | James flags issue in audit binder | James clicks "Flag Issue" on an account, enters issue type and description. | Sarah receives in-app notification: "External auditor flagged {account}: {issue_type}." Visible in her entity admin panel under "Auditor Issues." | Real-time |
| 9 | James (Auditor) | David (CFO) | James flags issue in audit binder | Same trigger as #8. CFO is always CC'd on auditor flags. | David sees the same notification as Sarah. Also visible in his approval/admin panel. | Real-time |
| 10 | Karen (Fund Controller) | Sarah (Controller) | Karen sends close reminder | Karen clicks "Send Reminder" on the entity row in her fund dashboard. | Sarah receives email: "Karen Whitfield is requesting certification of {period} data. LP deadline: {date}." In-app notification appears. | <5 min (email) |
| 11 | Karen (Fund Controller) | David (CFO) | Karen sends close reminder | Same trigger as #10. CFO is always CC'd on fund controller reminders. | David receives the same email and in-app notification as Sarah. | <5 min (email) |
| 12 | Karen (Fund Controller) | Marcus (PE Partner) | Karen escalates a critical item | Karen clicks "Escalate" on a critically overdue entity. Confirms in modal. | Marcus receives standalone email: "{Entity} escalated by fund controller. Close is {X} days overdue." In-app notification with "Escalated" severity. | <5 min (email), real-time (in-app) |
| 13 | Marcus (PE Partner) | David (CFO) | Marcus has concerns about entity | Marcus calls or emails David OUTSIDE of Sabit. No in-system handoff exists for Marcus->David in v1. | David receives a phone call or email. No Sabit notification. | External, immediate |
| 14 | Marcus (PE Partner) | Karen (Fund Controller) | Marcus requests specific data | Marcus contacts Karen OUTSIDE of Sabit (email/phone). | Karen receives request externally. Uses Sabit to pull the data, then sends back externally. | External, varies |
| 15 | David (CFO) | Karen (Fund Controller) | David re-certifies after Karen exported | David reopens a period, makes changes, and re-certifies. | CRITICAL: Karen receives standalone email + red banner on fund dashboard: "Entity re-certified after your LP report was generated." Impact assessment included. | Real-time (in-app), <5 min (email) |
| 16 | David (CFO) | James (Auditor) | David re-certifies during audit engagement | David reopens and re-certifies while James is doing fieldwork. | James receives standalone email + in-app notification: "Entity re-certified. Statement hashes have changed." Re-certification history updated on verification page. | Real-time (in-app), <5 min (email) |
| 17 | Sarah (Controller) | Karen (Fund Controller) | Sarah completes a close step | Sarah completes reconciliation or other close step. | Karen's entity detail page (audit trail tab) shows the step completion. No direct notification to Karen for individual steps -- she monitors aggregate status. | Dashboard refresh on next visit |
| 18 | Karen (Fund Controller) | David (CFO) | Karen escalates through "Urgent" reminder | Karen sends an "Urgent" or "Critical" level reminder. | David receives email with heightened urgency language. Marcus is CC'd on "Critical" reminders. | <5 min (email) |
| 19 | System | All relevant personas | Automated alerts (overdue, covenant, EBITDA) | System detects threshold breach. | Notifications sent per notification matrix below. | Per schedule (real-time for critical, digest for routine) |

---

## NOTIFICATION MATRIX

### Event-to-Persona Notification Mapping

Legend:
- **IM** = Immediate (in-app toast + email within 5 minutes)
- **DG** = Digest (included in next daily digest email; in-app badge updated immediately)
- **DB** = Dashboard (badge/counter update on next page load; no email)
- **--** = No notification

| # | Event | Sarah (Controller) | David (CFO) | Marcus (PE Partner) | Karen (Fund Controller) | James (Auditor) |
|---|-------|-------------------|-------------|--------------------|-----------------------|-----------------|
| 1 | GL uploaded successfully | DB | -- | -- | -- | -- |
| 2 | Trial balance generated | DB | -- | -- | -- | -- |
| 3 | AI account classification complete | IM | -- | -- | -- | -- |
| 4 | Reconciliation completed (single account) | DB | -- | -- | -- | -- |
| 5 | All reconciliations complete | IM | DG | -- | -- | -- |
| 6 | Bank statement match completed | DB | -- | -- | -- | -- |
| 7 | Adjusting entry created | DB | IM | -- | -- | -- |
| 8 | Adjusting entry approved by CFO | IM | DB | -- | -- | -- |
| 9 | Adjusting entry rejected by CFO | IM | DB | -- | -- | -- |
| 10 | Financial statements generated | IM | DG | -- | -- | -- |
| 11 | Close submitted for CFO review | DB | IM | -- | -- | -- |
| 12 | CFO review complete, changes requested | IM | DB | -- | -- | -- |
| 13 | Period certified (signed) | IM | DB | DB | DG | -- |
| 14 | Period re-certified | IM | DB | DG | IM | IM |
| 15 | Close overdue by 3 days | DG | DG | DG | DG | -- |
| 16 | Close overdue by 5+ days | IM | IM | IM | IM | -- |
| 17 | Close stalled (no activity 10+ days) | -- | DG | IM | IM | -- |
| 18 | Covenant within 10% of threshold | -- | DG | DG | DG | -- |
| 19 | Covenant within 5% of threshold | -- | IM | IM | IM | -- |
| 20 | EBITDA decline 3+ consecutive months | -- | DG | DG | DG | -- |
| 21 | Material variance flagged by AI | IM | DG | -- | -- | -- |
| 22 | All entities certified (fund level) | -- | -- | DG | IM | -- |
| 23 | LP report deadline in 14 days | -- | -- | -- | IM | -- |
| 24 | LP report deadline in 7 days (incomplete) | -- | DG | DG | IM | -- |
| 25 | LP report deadline passed (incomplete) | -- | IM | IM | IM | -- |
| 26 | Fund controller sends reminder | IM | IM | -- | DB | -- |
| 27 | Fund controller escalates | IM | IM | IM | DB | -- |
| 28 | Auditor flags issue | IM | IM | -- | -- | DB |
| 29 | Evidence uploaded for auditor flag | -- | -- | -- | -- | IM |
| 30 | Audit access request received | -- | IM | -- | -- | -- |
| 31 | Audit access granted | -- | DB | -- | -- | IM |
| 32 | Audit access revoked | -- | DB | -- | -- | IM |
| 33 | New entity added to fund | -- | -- | DG | DG | -- |
| 34 | Controller user deactivated | -- | IM | -- | DG | -- |
| 35 | Export/report generation complete | DB | DB | DB | DB | DB |

### Notification Delivery Schedule

| Channel | Delivery Time | Recipient |
|---------|--------------|-----------|
| In-app toast | Immediate, if user is online | All personas |
| In-app badge | Immediate, visible on next page load | All personas |
| Standalone email | Within 5 minutes of trigger | Marked "IM" above |
| Daily digest email | 7:00 AM user's local timezone | Marked "DG" above, aggregated |
| No email | Never | Marked "DB" or "--" above |

### Notification Preferences (User-Configurable)

Each user can adjust notification preferences in Settings:

```
NOTIFICATION PREFERENCES

Email Notifications:
  [x] Immediate alerts (critical events)
  [x] Daily digest (routine updates)
  [ ] All events (receive email for every event)

Daily Digest Time: [7:00 AM v]

Mute Notifications:
  [ ] Mute all notifications for 24 hours
  [ ] Mute non-critical notifications

Channel Preferences (future):
  [ ] Slack integration (coming soon)
  [ ] Microsoft Teams integration (coming soon)
```

---

## FIRST-TIME EXPERIENCE (FTX) SPECIFICATION

### FTX: MARCUS WEBB -- PE OPERATING PARTNER

#### What Marcus Sees on First Login

**Scenario**: Marcus's fund has just been set up in Sabit. Some portfolio companies may already be onboarded; others may not yet have data.

**Step 1: Welcome Screen** (appears once, after first successful login)
```
+----------------------------------------------------------+
| Welcome to Sabit, Marcus                                  |
|                                                          |
| Your portfolio dashboard is your command center.          |
| Here's what you need to know:                            |
|                                                          |
| [Illustration: dashboard overview with labeled callouts]  |
|                                                          |
| 1. ALERT BAR shows companies that need your attention    |
| 2. KPI STRIP gives you portfolio-wide health at a glance |
| 3. ENTITY GRID lists all companies, sorted by urgency    |
| 4. Click any company to see details                      |
|                                                          |
| Your typical session: 5-10 minutes per week.              |
| We surface problems so you don't have to hunt for them.  |
|                                                          |
| [Got It, Take Me to My Dashboard ->]                     |
+----------------------------------------------------------+
```

This is a single-page overlay, not a multi-step onboarding wizard. Marcus has no patience for lengthy tutorials.

**Step 2: Dashboard with Contextual Hints** (first visit only)

On the portfolio dashboard, three small tooltip callouts appear (non-blocking, can be dismissed individually or all at once):

1. **Tooltip on Alert Bar**: "When companies need attention, alerts appear here. Red = urgent, yellow = monitor."
2. **Tooltip on Entity Row**: "Click any company row to drill into financial details, EBITDA bridge, and close status."
3. **Tooltip on Export Button**: "Generate board packages for your board meetings from here."

A small "Dismiss all tips" link appears at the bottom of the page.

**Step 3: Empty/Sparse State**

If the portfolio has few or no companies with data yet:
```
+----------------------------------------------------------+
| Portfolio Overview                                        |
+----------------------------------------------------------+
| Your portfolio is being set up.                          |
|                                                          |
| 3 of 18 companies have been onboarded to Sabit.          |
| Financial data will appear as companies complete their    |
| first close cycle.                                       |
|                                                          |
| Companies onboarded:                                     |
| [Green] Summit Healthcare    First close in progress     |
| [Green] Meridian Mfg         First close in progress     |
| [Green] Cascade Logistics    Awaiting GL upload          |
|                                                          |
| Companies pending onboarding: 15                         |
| [View onboarding status ->]                              |
+----------------------------------------------------------+
```

#### Setup Steps Required
None. Marcus does not configure anything. His account is provisioned by the fund administrator. Portfolio companies are added by the fund controller (Karen) or system admin.

#### When Guidance Stops
- Welcome overlay: shown once, never again
- Dashboard tooltips: shown on first visit, dismissed permanently on click or "Dismiss all"
- Empty state messaging: disappears automatically as companies come online
- "New" badges on new entities: disappear after Marcus clicks into the entity detail

---

### FTX: KAREN WHITFIELD -- FUND CONTROLLER

#### What Karen Sees on First Login

**Scenario**: Karen's fund has just been set up. She may need to add portfolio companies and configure fund settings.

**Step 1: Welcome Screen**
```
+----------------------------------------------------------+
| Welcome to Sabit, Karen                                   |
|                                                          |
| As fund controller, you'll use Sabit to:                 |
|                                                          |
| 1. MONITOR certification progress across portfolio       |
|    companies                                             |
| 2. AGGREGATE certified financial data for LP reporting   |
| 3. GENERATE consolidated reports and export packages      |
|                                                          |
| Let's set up your fund.                                  |
|                                                          |
| [Start Setup ->]                                         |
+----------------------------------------------------------+
```

**Step 2: Fund Setup Wizard** (multi-step, only shown if fund is not yet configured)

```
STEP 1 OF 4: FUND DETAILS
+----------------------------------------------------------+
| Fund Name: [Apex Growth Fund III        ]                |
| Fund Type: [Buyout v]                                    |
| Vintage Year: [2019 v]                                   |
| Reporting Currency: [USD v]                               |
| Fiscal Year End: [December 31 v]                          |
| [Continue ->]                                            |
+----------------------------------------------------------+

STEP 2 OF 4: PORTFOLIO COMPANIES
+----------------------------------------------------------+
| Add your portfolio companies.                            |
| You can add more later from Fund Settings.               |
|                                                          |
| [+ Add Company]                                          |
|                                                          |
| Added:                                                   |
| 1. Summit Healthcare Services     [Edit] [Remove]        |
| 2. Meridian Manufacturing, Inc.   [Edit] [Remove]        |
| 3. Cascade Logistics Group        [Edit] [Remove]        |
|                                                          |
| [Continue ->]                                            |
+----------------------------------------------------------+

For each "Add Company":
+----------------------------------+
| Company Name: [               ]  |
| Entity ID (from Sabit): [     ]  |
| -- OR --                         |
| Invite company to Sabit:         |
| CFO Email: [                  ]  |
| Controller Email: [           ]  |
| [Add Company]                    |
+----------------------------------+

STEP 3 OF 4: LP REPORTING
+----------------------------------------------------------+
| Configure your LP reporting schedule.                    |
|                                                          |
| Reporting Frequency: [Quarterly v]                       |
| Q1 LP Deadline: [April 30 v]                             |
| Q2 LP Deadline: [July 31 v]                              |
| Q3 LP Deadline: [October 31 v]                           |
| Q4 / Annual LP Deadline: [March 31 v]                    |
|                                                          |
| Target close cycle (days from period end): [5 v]         |
| This sets the certification target for all entities.     |
| Individual entities can override this.                   |
|                                                          |
| [Continue ->]                                            |
+----------------------------------------------------------+

STEP 4 OF 4: TEAM ACCESS
+----------------------------------------------------------+
| Who else needs access to the fund dashboard?             |
|                                                          |
| PE Operating Partners:                                   |
| [+ Invite] Marcus Webb  marcus@apex.com  [Invited]      |
|                                                          |
| Other Fund Controllers:                                  |
| [+ Invite]                                               |
|                                                          |
| [Complete Setup ->]                                      |
+----------------------------------------------------------+
```

**Step 3: Fund Dashboard with First-Time Tooltips**

After setup, Karen lands on the fund dashboard with contextual hints:

1. **Tooltip on Certification Status Bar**: "Track how many companies have certified each period. The bar fills as companies complete their close."
2. **Tooltip on Send Reminder button**: "Send automated reminders to companies that haven't certified yet."
3. **Tooltip on Start LP Report**: "When all companies are certified, start the LP report builder to aggregate and export."

#### Setup Steps Required
1. Fund details (name, type, currency, fiscal year)
2. Portfolio companies (add entities or invite new companies)
3. LP reporting schedule (deadlines and target close cycle)
4. Team access (invite PE partners and other fund users)

Karen can skip any step and complete it later from Settings. A "Setup Progress" indicator appears on the dashboard until all steps are complete: "Setup: 3 of 4 steps complete. [Complete setup ->]"

#### When Guidance Stops
- Welcome overlay and setup wizard: shown once
- Dashboard tooltips: dismissed on first click, never shown again
- Setup progress indicator: disappears when all 4 steps are complete
- "New" badges on new entities: disappear after Karen clicks into entity detail

---

### FTX: JAMES WRIGHT -- EXTERNAL AUDITOR

#### What James Sees on First Visit

**Scenario A: James comes to the public verification page (no account)**

No onboarding or setup needed. The verification page is self-explanatory. The "How verification works" section at the bottom serves as in-context education.

If James pastes a certification ID and verifies successfully, he sees the result with a "Want deeper access?" call-to-action at the bottom, guiding him to request audit access if needed.

**Scenario B: James's audit access has been granted and he logs in for the first time**

**Step 1: Welcome Screen**
```
+----------------------------------------------------------+
| Welcome to Sabit Audit Workspace, James                   |
|                                                          |
| You have been granted audit access to:                   |
| Meridian Manufacturing, Inc.                              |
| Year ended December 31, 2025                              |
|                                                          |
| Your access includes:                                    |
| [check] Audit Binder (evidence, reconciliations)         |
| [check] Financial Statements (all four GAAP statements)  |
| [check] Sample Selection Tool                            |
| [check] Hash Chain Verification (detailed)               |
|                                                          |
| Access expires: June 30, 2026                            |
|                                                          |
| IMPORTANT NOTES:                                         |
| - All access is read-only. You cannot modify entity data.|
| - You can flag issues and add annotations for your       |
|   workpapers.                                            |
| - AI-generated content is clearly labeled. Exercise      |
|   professional skepticism as required by auditing        |
|   standards.                                             |
|                                                          |
| [Enter Audit Workspace ->]                               |
+----------------------------------------------------------+
```

**Step 2: Auditor Dashboard with Guided Tour**

On first visit to the dashboard, a brief guided tour (4 steps) highlights the main tools:

```
TOUR STEP 1 OF 4:
[Callout pointing to Financial Statements card]
"Review all four GAAP financial statements with prior year
comparatives and AI-generated variance explanations."
[Next ->]

TOUR STEP 2 OF 4:
[Callout pointing to Audit Binder card]
"Access the complete audit binder organized by financial
statement section. Review reconciliations, evidence files,
and adjusting entries."
[Next ->]

TOUR STEP 3 OF 4:
[Callout pointing to Sample Selection card]
"Select transaction samples using standard audit
methodologies (MUS, random, stratified). Review supporting
evidence for each sampled item."
[Next ->]

TOUR STEP 4 OF 4:
[Callout pointing to Workpaper Download card]
"Export everything you need for your audit software.
Organized packages with financial data, evidence,
verification reports, and your annotations."
[Done]
```

Tour can be skipped at any step with a "Skip tour" link. Never shown again after completion or skip.

#### Setup Steps Required
None for James directly. His account is provisioned when the CFO approves his access request. James does not configure anything in the system.

#### Contextual Guidance Specifics

**In Audit Binder (first visit)**:
- Tooltip on left sidebar: "Navigate by financial statement section. Click any account to see its reconciliation detail and supporting evidence."
- Tooltip on "Flag Issue" button: "Flag accounts that need additional evidence or have discrepancies. The entity's controller and CFO will be notified."
- Tooltip on material filter: "Toggle to show only material accounts (those exceeding your firm's materiality threshold as configured by your entity)."

**In Sample Selection (first visit)**:
- Tooltip on methodology dropdown: "Choose your sampling methodology. The system calculates required sample size based on your parameters."
- Tooltip on "Generate Random Sample": "The system generates a statistically random sample and documents the seed for reproducibility."

**On AI-Generated Content (every time, not just first visit)**:
- Every AI explanation carries a persistent header: "[AI-GENERATED CONTENT] This explanation was produced by Sabit's AI system. Exercise professional skepticism per AS 2810. Verify against source documents."
- This header is NOT part of FTX; it appears permanently on all AI content for all auditor users.

#### When Guidance Stops
- Welcome screen: shown once
- Dashboard tour: shown once, skippable
- Binder/sample tooltips: shown on first visit to each screen, dismissed permanently
- AI content headers: NEVER disappear. These are permanent for the auditor role.
- Access expiration reminder: appears 30 days before, then 14 days, then 7 days

---

## FTX COMPARISON MATRIX

| Aspect | Marcus (PE Partner) | Karen (Fund Controller) | James (Auditor) |
|--------|--------------------|-----------------------|-----------------|
| Welcome screen | Single page, brief | Single page, leads to setup wizard | Single page, scope summary |
| Setup required | None | 4-step fund setup wizard | None |
| Guided tour | No (3 tooltip callouts only) | No (3 tooltip callouts only) | Yes (4-step guided tour) |
| Empty state handling | Sparse portfolio message | Setup progress indicator | N/A (data exists before auditor arrives) |
| Time to productive | <30 seconds after login | 5-10 minutes (if setup needed) | <1 minute after login |
| Guidance persistence | Dismissed after first interaction | Dismissed after first interaction | AI warnings persist permanently |
| Skip option | "Dismiss all tips" link | "Skip" on each setup step | "Skip tour" link |
| Re-access guidance | Not available (one-time only) | Settings > "Re-run setup wizard" | Not available (one-time only) |


---

