# Sabit Blind UX Audit

**Method:** Zero-code expectations audit. Neither agent read any source files. All findings derived purely from the product description, simulating what a VC, customer, or auditor would expect.
**Auditors:** UX Researcher (persona expectations) + UX Architect (structural expectations)
**Date:** 2026-03-11

---

## I. EXPECTED PAGE MAP

### Authentication & Entry

| Page | Purpose | Data Shown | Actions |
|------|---------|------------|---------|
| **Login** | Authenticate, route to role-appropriate landing | Branding, SSO option, email/password, MFA prompt | Login, SSO redirect, password reset, "Request Access" |
| **Role-Based Landing** | Orient user immediately after login | Controller → close workspace, CFO → certification queue, OP → portfolio, Fund → aggregation | Auto-route by role |

### Controller Pages (The Workhorse)

| Page | Purpose | Data Shown | Actions |
|------|---------|------------|---------|
| **Period Selection / Close Manager** | Select/create close period | List of periods with status (Draft, In Progress, Pending Review, Certified, Archived), days elapsed vs target, completion % per phase | Open, create, clone mappings, archive |
| **GL Upload / Ingestion** | Upload general ledger | Upload zone (drag-drop), validation results, column mapper, row count, date range, debit/credit totals with zero-balance check | Upload, map columns, preview, confirm |
| **Account Classification / Mapping** | Map GL accounts to statement line items | Table: Account #, Name, AI Suggestion, Confidence, Statement (IS/BS/CF/EQ), Line Item, Prior Period Mapping, Status | Accept AI, override, bulk-accept high-confidence, filter, lock |
| **Trial Balance** | Foundation of all statements | See Section III for full spec | Filter, sort, drill-down, export |
| **Reconciliation Workspace** | Reconcile balance sheet accounts | Account list with GL balance, reconciled balance, difference, status, preparer, reviewer, due date | Open detail, attach evidence, add reconciling items, submit for review |
| **Reconciliation Detail** | Deep dive per account | GL balance, supporting schedule, roll-forward, reconciling items, evidence, approval history, comments | Add items, attach docs, notes, submit/return |
| **Adjusting Journal Entries** | Post adjustments before statements | Entry list: number, date, description, accounts, debit/credit, status, preparer, approver | Create, edit draft, submit, approve/reject, view TB impact |
| **Statement Generation** | Generate 4 GAAP statements | Pre-gen checklist, generation status, preview, mathematical proof (BS balances, IS→RE, CF→cash) | Run generation, preview, resolve blockers, regenerate |
| **Variance Analysis** | Flag and explain material variances | See Section III for full spec | Review, accept/edit AI justifications, mark explained, submit |
| **Statement Review (x4)** | View each statement presentation-ready | Full GAAP statement, comparative periods, drill-down | Drill-down, comment, flag, export PDF/Excel |

### CFO / Reviewer Pages

| Page | Purpose | Data Shown | Actions |
|------|---------|------------|---------|
| **Certification Dashboard** | Show what needs CFO review | Period status, items requiring review (AJEs, recons, justifications), open vs total count, gate status | Navigate to items, approve/reject |
| **Certification Gates** | Present 11 gates as checklist | Each gate: name, description, Pass/Fail/Not Evaluated, evidence summary, timestamp | Click into gate detail, acknowledge, proceed |
| **Certification Ceremony** | The signing moment | All 4 statements in final form, 11 gates green, certifier name/title, certification statement, hash preview | Final review, type name to sign, apply Ed25519 signature |

### PE Operating Partner Pages

| Page | Purpose | Data Shown | Actions |
|------|---------|------------|---------|
| **Portfolio Dashboard** | Single view of all companies | Table/cards: company name, period, status, days to close vs target, red flags, last certified, trend | Click into company, filter, sort, export. **Read-only.** |
| **Company Detail (Read-Only)** | Drill into specific company | Certified statements, key metrics (revenue, EBITDA, cash, debt), trends, certification history | View, export. **No edit.** |
| **Portfolio Comparison** | Compare metrics across companies | Selectable cross-company metrics, normalized comparisons, trend lines | Select metrics/companies, export |

### Fund Controller Pages

| Page | Purpose | Data Shown | Actions |
|------|---------|------------|---------|
| **Aggregation Workspace** | Consolidate portfolio financials for LP reporting | Company list with cert status, selection UI, aggregated financials, elimination entries | Select companies/periods, run aggregation, add eliminations, export |
| **Export Center** | Generate formatted exports | Available formats (Excel, PDF, CSV, API), templates, period/company selection | Configure, generate, download, schedule recurring |

### Shared / Cross-Cutting Pages

| Page | Purpose | Data Shown | Actions |
|------|---------|------------|---------|
| **Audit Trail** | Complete action history | Timestamp, user, action, entity, before/after values, hash chain status | Search, filter, export, verify chain |
| **Public Verification (/verify)** | Independent certification verification, no login | Hash/certificate input, verification result: company, period, certifier, timestamp, chain integrity | Enter hash, verify, view result |
| **Audit Binder** | Auto-generated evidence package | TOC, all statements, recons with evidence, AJEs with approvals, justifications, cert details, audit trail | Generate, download PDF/ZIP, share link |
| **Settings / Admin** | Configuration | Users/roles, company details, integrations, close calendar, notifications, API keys | CRUD operations |

---

## II. EXPECTED USER JOURNEYS

### Controller: Login → Certified Financial Statements

| Step | Page | Clicks | Time | Friction Tolerance |
|------|------|--------|------|-------------------|
| 1. Login | Login | 1 | 30s | ZERO |
| 2. Open/Create Period | Period Selection | 1-2 | 1 min | LOW — near-instant, carry-forward mappings automatically |
| 3. Upload GL | GL Upload | 2-3 | 2-5 min | MODERATE first time (column mapping), ZERO subsequent |
| 4. Map Accounts | Account Mapping | 5-20 | 10-45 min | HIGH first close, LOW subsequent (only new accounts) |
| 5. Review Trial Balance | Trial Balance | 2-3 | 5-10 min | LOW — verification step |
| 6. Reconcile BS Accounts | Reconciliation | 10-30/acct | **1-3 hours** | HIGH — core work, system makes it efficient |
| 7. Post Adjustments | Adjusting Entries | 3-5/entry | 15-30 min | MODERATE |
| 8. Generate Statements | Statement Generation | 2-3 | **1-2 min** | ZERO — button click, seconds to compute |
| 9. Variance Analysis | Variance | 5-15 | 15-45 min | MODERATE — AI drafts save enormous time |
| 10. Submit for Review | Submit | 1-2 | 1 min | ZERO |
| **TOTAL** | | **40-80** (repeat) | **2-4 hours** (repeat) | First close: 6-10 hours |

**Critical moment:** Step 8 is the **aha moment** — one click produces four complete GAAP statements. This must be near-instant. If generation takes >30 seconds, something is architecturally wrong.

### CFO: Login → Signed Certification

| Step | Page | Clicks | Time | Friction Tolerance |
|------|------|--------|------|-------------------|
| 1. Login | Login | 1 | 30s | ZERO |
| 2. Review Open Items | Certification Dashboard | 5-15 | 10-20 min | LOW — reviewable in-context, approve/reject one-click |
| 3. Review Statements | Statement Views | 4-8 | 10-20 min | LOW — instant render, fast drill-down |
| 4. Review Gates | Certification Gates | 1-2 | 5-10 min | ZERO — read-and-confirm |
| 5. Certify | Certification Ceremony | 2-3 | 2-5 min | **DELIBERATE FRICTION EXPECTED** — typing name to sign |
| **TOTAL** | | **15-30** | **30-60 min** | |

### Operating Partner: Login → Portfolio Status Understood

| Step | Page | Clicks | Time | Friction Tolerance |
|------|------|--------|------|-------------------|
| 1. Login | Login | 1 | 30s | ZERO |
| 2. Scan Portfolio | Portfolio Dashboard | **0** | 1-3 min | **ZERO — must answer "where do things stand?" without ANY clicks** |
| 3. Drill Into Flagged | Company Detail | 1-3/company | 5-10 min | LOW — one click from dashboard |
| 4. Export | Export | 1-2 | 1 min | ZERO |
| **TOTAL** | | **5-10** | **5-15 min** | |

### Fund Controller: Login → Consolidated Data Exported

| Step | Page | Clicks | Time | Friction Tolerance |
|------|------|--------|------|-------------------|
| 1. Login | Login | 1 | 30s | ZERO |
| 2. Select Companies/Periods | Aggregation | 5-10 | 5 min | LOW — default "all companies, current period" |
| 3. Review Aggregated Data | Aggregation | 3-5 | 10-20 min | MODERATE — elimination entries are real work |
| 4. Export | Export Center | 2-3 | 5 min | ZERO |
| **TOTAL** | | **12-20** | **30-60 min** | |

---

## III. EXPECTED DATA DISPLAYS

### Trial Balance

**Columns (minimum):**
- Account Number
- Account Name
- Financial Statement Classification (IS/BS)
- Beginning Balance (Debit/Credit)
- Period Activity Debits
- Period Activity Credits
- Ending Balance (Debit/Credit)
- Adjusting Entries (separate column showing AJE impact)
- Adjusted Ending Balance

**Totals:** Total Debits = Total Credits displayed prominently with visual pass/fail indicator. Subtotals by classification (total assets, total liabilities, total equity, total revenue, total expenses).

**Filters:** By statement (BS/IS), by classification (current assets, etc.), by activity (accounts with movement only), by mapping status, by variance flag, by search.

**Critical:** Drill-down from any amount to underlying journal entries is mandatory.

### Income Statement

**Hierarchy (top to bottom):**
```
Revenue
  Gross Revenue (by stream)
  Less: Discounts, Returns, Allowances
  = NET REVENUE
Cost of Goods Sold / Cost of Revenue
  = GROSS PROFIT (with gross margin %)
Operating Expenses
  SG&A
  R&D
  D&A
  Other operating
  = TOTAL OPERATING EXPENSES
= OPERATING INCOME (EBITDA line for PE)
Other Income/Expense
  Interest income/expense
  Gain/loss on disposal
  Other non-operating
= INCOME BEFORE TAXES
Income Tax Expense
= NET INCOME
```

**Required:** Current period, prior period, variance ($), variance (%), YTD. Every line clickable → drill to GL accounts → journal entries. PE firms expect EBITDA prominently displayed.

### Balance Sheet

**Sections:**
```
ASSETS
  Current Assets
    Cash & Equivalents
    AR (gross) → Less: Allowance for Doubtful Accounts → AR (net)    [contra visible]
    Inventory (with method notation)
    Prepaid Expenses
    Other Current
    = TOTAL CURRENT ASSETS
  Non-Current Assets
    PP&E (gross) → Less: Accumulated Depreciation → PP&E (net)       [contra visible]
    Intangibles (gross) → Less: Accumulated Amortization → net       [contra visible]
    Goodwill
    ROU Assets (ASC 842)
    Other Non-Current
    = TOTAL NON-CURRENT ASSETS
  = TOTAL ASSETS

LIABILITIES
  Current Liabilities
    AP, Accrued, Current Debt, Current Lease, Deferred Rev, Other
    = TOTAL CURRENT LIABILITIES
  Non-Current Liabilities
    LT Debt, Non-Current Lease, Deferred Rev, DTL, Other
    = TOTAL NON-CURRENT LIABILITIES
  = TOTAL LIABILITIES

STOCKHOLDERS' EQUITY
  Common Stock, APIC, Retained Earnings, AOCI, Treasury Stock       [contra visible]
  = TOTAL EQUITY

= TOTAL LIABILITIES + EQUITY  [must equal TOTAL ASSETS — visual verification]
```

**Critical:** Contra accounts (Allowance, Accum Depr, Treasury Stock) must be visible as deductions, not netted invisibly. A = L + E must be displayed with pass/fail indicator. Any imbalance, even one cent, is a system error.

### Cash Flow Statement (Indirect Method)

**Sections:**
```
OPERATING ACTIVITIES
  Net Income
  + Adjustments (D&A, SBC, Deferred Tax, Gain/Loss)
  + Changes in Working Capital (AR, Inventory, Prepaid, AP, Accrued, Deferred Rev)
  = NET CASH FROM OPERATIONS

INVESTING ACTIVITIES
  Purchases/Sales of PP&E, Investments, Acquisitions
  = NET CASH FROM INVESTING

FINANCING ACTIVITIES
  Borrowings/Repayments, Equity, Dividends, Buybacks
  = NET CASH FROM FINANCING

NET CHANGE IN CASH
+ BEGINNING CASH BALANCE  [must tie to prior period BS]
= ENDING CASH BALANCE     [must tie to current period BS cash line]
```

**Critical:** Ending cash MUST equal BS cash. Beginning cash MUST equal prior period ending. Both ties displayed with pass/fail.

### Statement of Stockholders' Equity

**Columns:** Common Stock | APIC | Retained Earnings | AOCI | Treasury Stock | Total Equity

**Rows:** Beginning Balance → Net Income → OCI → Stock Issuances → SBC → Dividends → Treasury Stock Transactions → Other → Ending Balance

**Critical:** Beginning = prior period ending. Net Income from IS flows to Retained Earnings. Ending ties to BS equity.

### Reconciliation

**Per account:** Account #/name, GL ending balance, supporting balance, reconciling items (description, amount, type), reconciled balance, variance, status (Not Started / In Progress / Reconciled / Approved), preparer + timestamp, reviewer + timestamp, attached evidence.

**Evidence:** File attachment with inline preview. Bank statements, cleared checks, subledger reports. Segregation of duties: preparer cannot approve own reconciliation.

### Variance Analysis

**Comparisons:** Current vs prior period (default), current vs prior year same period, current vs budget, YTD vs prior YTD.

**Columns:** Line item, current amount, comparison amount, variance ($), variance (%), materiality flag, justification status, justification text.

**Materiality:** Configurable threshold (default: 10% AND >$X absolute floor). AI drafts IRAC justifications for flagged variances.

---

## IV. EXPECTED AI INTERACTIONS

### Where AI Should Appear

| Area | AI Role | Trust Signals |
|------|---------|---------------|
| **Account Classification** | Suggest statement line item per GL account | Confidence score, reasoning ("Account 4100 classified as Revenue based on name pattern + prior period"), prior mapping reference, easy override dropdown |
| **Variance Justifications** | Draft IRAC-format explanations | Labeled "AI-Generated Draft — Review Required", cite specific data ("Revenue +$142K due to 47 new JEs to Account 4100"), controller must explicitly accept/edit |
| **Shadow Auditor** | Review close for errors/patterns | Questions not assertions ("Prepaid Insurance not adjusted this period — prior 6 periods show $4,200/mo amortization. Intentional?"), advisory panel |
| **GAAP Advisor** | Contextual guidance | Cite specific ASC references, tooltip/expandable panel, triggered by context not by default |
| **Reconciliation Hints** | Suggest reconciling items | Cautious, clearly labeled ("3 checks totaling $12,400 cleared bank Feb 2 — may be outstanding at Jan 31") |

### Where AI Must NOT Appear

- Dollar amounts on financial statements (all deterministic arithmetic)
- Posting journal entries (suggest only, controller executes)
- Approving anything (reconciliations, AJEs, certifications are human decisions)
- Modifying trial balance or any financial table (AI is read-only on financial data)

### Visual Treatment of AI

- Distinct left-border color (calm purple/indigo, not brand primary)
- Sparkle/wand icon on all AI output
- AI values in italic or dashed underline until confirmed
- Accepted suggestions transform: AI border disappears, "AI-assisted" tag remains in metadata (hover only)
- Persistent boundary statement: "AI assists with classification, analysis, and drafting. AI never computes financial amounts or writes to financial records."
- Edit trail: original AI output + human edit both preserved in audit trail

---

## V. EXPECTED TRUST SIGNALS

### Mathematical Proof (Non-Negotiable)

**Cross-statement integrity checks, always visible:**
- BS: Assets = Liabilities + Equity (show equation and result)
- IS → Equity: Net Income flows to Retained Earnings (show link)
- CF → BS: Ending cash = BS cash line (show reconciliation)
- TB: Total Debits = Total Credits (show totals)
- Each check: prominent pass/fail indicator, not buried in a report

**Drill-down chain must never break:** Statement line → GL accounts → individual journal entries → source (original GL / AJE with approval chain). If a CFO clicks "AR: $1,247,000" on BS, they must see every account and every transaction.

**Precision:** Show cents. If presentation rounds to thousands, full precision available on hover. Rounding differences explicitly handled, never silently absorbed.

### The Certification Ceremony

**Must feel like signing a legal document because it IS one.**

Expected elements:
- Full display of all 4 statements (on page or one click away)
- All 11 gates green
- Clear certification statement: "I, [Name], [Title], certify that the financial statements of [Company] for the period ending [Date] have been prepared in accordance with GAAP and are mathematically verified. This certification is cryptographically signed and any subsequent modification will invalidate the signature."
- **Deliberate signing action: type full name** (not click a checkbox). Validates against profile. Has more psychological weight.
- Confirmation screen: Ed25519 signature hash, timestamp, downloadable certificate, verification URL
- **No confetti.** This is a fiduciary act, not a game achievement.
- Post-certification: locked icon everywhere, green "Certified" badge, all data non-editable

### The Verification Page (/verify)

**Must work without login.** This is for external parties.

- Accept certification hash or certificate file upload
- Display: company, period, certifier name+title, timestamp, hash chain integrity
- Show statement totals (Total Assets, Net Income, Ending Cash, Total Equity) for spot-check
- Clear "Verified" or "Verification Failed" with explanation

**Why this is the most powerful sales tool:** A PE firm's auditor pastes the hash and independently confirms these are the exact certified statements. Eliminates an entire category of fraud and error.

### The Audit Trail

- Hash-chained tamper evidence: every action hashed, chain to previous
- After certification: "No data modified since certification on [date]. Hash chain intact."
- Shows: who, what, when, before/after values, approval chains, file checksums, AI suggestion accept/reject
- Searchable: "show every AJE posted after the 15th" — instant answer

### Visual Trust Signals

- **Number consistency:** Same number on every page. If IS shows Net Income $247,312.89, equity statement and CF must match exactly. One-cent discrepancy destroys trust.
- **Format consistency:** Parenthetical negatives everywhere, currency symbols consistent, decimal places consistent.
- **Professional presentation:** Standard accounting formatting. Proper indentation. Right-aligned numbers. Underlines for subtotals. Double underlines for totals.
- **Status visibility:** Where are we? What's done? What remains? What blocks progress? Always visible, always honest, always actionable.
- **Error prevention over correction:** Unbalanced AJE cannot be saved. Unmapped account blocks generation. Unexplained variance blocks certification.

---

## VI. OPTIMAL INFORMATION ARCHITECTURE

### Navigation Philosophy

Single application shell with role-aware visibility. Not four apps. The backend knows who you are; the UI shows what you need. Period selector must be persistent — everything is scoped to a fiscal period.

### Proposed Sidebar Structure

```
GROUP: OVERVIEW
  Dashboard                    [All roles]

GROUP: CLOSE PIPELINE
  1. General Ledger            [Controller]
  2. Trial Balance             [Controller, CFO read-only]
  3. Account Mapping           [Controller]
  4. Reconciliation            [Controller, CFO read-only]
  5. Adjusting Entries         [Controller, CFO approver]
  6. Financial Statements      [Controller, CFO, PE read-only, Fund read-only]
  7. Certification             [CFO primary, Controller read-only]

GROUP: REVIEW & EVIDENCE
  Variance Analysis            [Controller, CFO]
  Audit Trail                  [All roles]
  Audit Binder                 [CFO, PE, Fund]

GROUP: PORTFOLIO (PE roles only)
  Portfolio Dashboard          [PE, Fund]
  Company Status               [PE, Fund]
  LP Export                    [Fund]

GROUP: SETTINGS (bottom-pinned)
  Company Settings             [Controller, CFO]
  Chart of Accounts            [Controller]
  Users & Roles                [CFO]
```

### Progressive Disclosure

- **Visible by default:** Current pipeline step and one step forward/back
- **Muted with lock icon:** Steps whose prerequisites aren't met
- **Collapsed by default:** AI Advisor (right-side drawer, invoked by user — AI never interrupts)
- **Pipeline stepper:** Horizontal 7-step bar at top of content area on every pipeline page (GL → TB → Map → Recon → Adjust → Statements → Certify)

### Navigation Rules

- Two levels maximum in sidebar (groups → pages). No third level. Depth handled via in-page tabs/filters/drill-downs.
- Three-level nav in financial software creates orientation anxiety — unacceptable when certifying numbers.
- Pipeline stepper doubles as progress indicator AND navigation.

---

## VII. CRITICAL UX PATTERNS

### Money Display (Non-Negotiable Rules)

| Rule | Specification |
|------|---------------|
| Alignment | Right-aligned in columns. Always. No exceptions. |
| Decimals | 2 decimal places. Hover for full precision. |
| Negatives | Parentheses: `($1,234.56)` not `-$1,234.56`. Muted red color. |
| Zeros | Dash `—` for line items. `$0.00` for subtotals/totals. |
| Thousands | Commas. Always. `$1,234,567.89` |
| Currency symbol | First row + total row of each column. Suppressed interior rows. |
| Subtotals | Thin rule above, bold weight, indented label |
| Grand totals | Double rule above (accounting convention), bold, larger font |
| Numerals | `font-variant-numeric: tabular-nums` on every monetary cell |
| Variance | Absolute + percentage. Favorable = green, unfavorable = amber/red |

### Table Behavior

- Sticky headers on vertical scroll, sticky first column on horizontal scroll
- Subtle row striping (2-3% opacity difference)
- Hover highlight for horizontal tracking
- Default sort: financial statement order (not alphabetical)
- **No pagination.** Virtualized scrolling. Accountants need full picture; pagination hides context.

### Approval Flow

```
DRAFT (amber) → SUBMITTED (blue, Pending Review) → APPROVED (green) / REJECTED (red)
```

- Approve: inline confirmation expansion (not modal). "Confirm approval of JE-2024-0047 for $45,231.00?" with Confirm/Cancel.
- Reject: mandatory comment explaining why.
- Batch approval: select multiple + confirm with count and total dollar impact.
- No "undo" on approvals. Reversing entry is the correct accounting response.

### Error Severity Tiers

| Tier | Visual | Behavior |
|------|--------|----------|
| **Blocking** (red, octagon) | Top banner, specific remediation | Not dismissible. Disappears when resolved. |
| **Warning** (amber, triangle) | Inline + warnings panel | Requires acknowledgment. Unacknowledged warnings block certification. |
| **Info** (blue, circle-i) | Subtle inline notes | Dismissible. |

Gate failures specifically: Never "Gate 7 failed." Instead: "Gate 7: All reconciliations complete — 3 of 47 accounts unreconciled" with direct link to filtered reconciliation page.

### Certification Ceremony

- Full-page dedicated view (not modal, not sidebar)
- 11 gates as vertical checklist
- Summary panel: period, total assets/liabilities/equity/net income, A=L+E verification
- Click "Certify" → full-screen overlay with:
  - Certifier's legal name displayed
  - Certification statement in legal language
  - Text input to type full name (validates against profile)
  - "Sign and Certify" disabled until name matches
  - No cancel button in primary area (small "Return to review" link top-left)
- Post-certification: signature, hash, timestamp, verification URL, download cert
- **No confetti. No celebration animation.** Fiduciary act, not achievement.

---

## VIII. COMPONENT LIBRARY SPECIFICATION

### Required Shared Components

| Component | Purpose | Key Props | Used Where |
|-----------|---------|-----------|------------|
| **MoneyCell** | Display monetary value with correct format/alignment | `value`, `variant` (line-item/subtotal/grand-total), `showVariance`, `comparisonValue`, `zeroDisplay` (dash/zero), `locked` | Every financial table, every statement, recons, AJEs, dashboard, portfolio |
| **FinancialTable** | Table optimized for financial data | `columns` (with type: text/money/pct/date), `data`, `groupBy`, `showSubtotals`, `showGrandTotal`, `sortable`, `selectable`, `stickyColumns`, `locked`, `emptyState`, `loadingState` | TB, recon, AJEs, all 4 statements, mapping, audit trail, portfolio |
| **StatusBadge** | Entity state indicator | `status` (not-started/in-progress/draft/submitted/pending-review/approved/rejected/complete/certified/locked/error/warning), `size`, `showIcon`, `showLabel` | Pipeline steps, AJE status, recon status, gates, cert, portfolio |
| **GateIndicator** | Certification gate pass/fail | `gateNumber`, `gateName`, `status` (passed/failed/not-evaluated), `detail`, `failureLink`, `progress` | Certification page, dashboard, pipeline tooltip |
| **PipelineStepper** | 7-step close progress | `steps`, `currentStep`, `compact`, `interactive`, `showLabels` | Top of every pipeline page, dashboard card, portfolio row |
| **ApprovalAction** | Approve/reject with confirmation | `entityType`, `entitySummary`, `dollarImpact`, `onApprove`, `onReject`, `batchMode`, `disabled` | AJE review, recon sign-off, mapping override |
| **AISuggestionCard** | AI output display, distinct from confirmed data | `suggestionType`, `suggestion`, `confidence`, `reasoning`, `gaapCitation`, `onAccept`, `onModify`, `onDismiss`, `accepted` | Mapping, variance, recon, advisor |
| **EvidenceAttachment** | Upload/display supporting documents | `attachments`, `onUpload`, `onRemove`, `acceptedTypes`, `maxSize`, `readOnly`, `required` | Recon detail, AJE detail, variance justification, audit binder |
| **ConfirmationDialog** | High-stakes confirmation | `severity` (standard/critical/ceremony), `title`, `message`, `requiresTextInput`, `requiredText`, `showImpactSummary` | Certification (ceremony), period rollback (critical), AJE deletion (standard) |
| **PeriodSelector** | Fiscal period context | `currentPeriod`, `availablePeriods`, `showStatus`, `compactMode`, `allowComparison` | Top bar (always), statement gen, variance, dashboard |
| **EmptyState** | No-data with helpful guidance | `icon`, `title`, `description`, `actionLabel`, `onAction`, `variant` (first-time/no-results/prerequisite-missing) | Every pipeline page, search results, filtered views |
| **HashDisplay** | Cryptographic hash display | `hash`, `truncate`, `copyable`, `verificationUrl`, `chainPosition`, `verified`, `showQR` | Audit trail, certification, verification, binder footer |

---

## IX. STATE MANAGEMENT PATTERNS

### Per-Page State Matrix

| Page | Loading | Empty | Error | Partial | Complete | Locked |
|------|---------|-------|-------|---------|----------|--------|
| **GL Upload** | N/A (user-initiated) | Upload dropzone + "No GL for [Period]" + sample file link | Validation report listing ALL errors, not just first. Download error report. | Preview table with column mapping confirmation. Row count + debit/credit sanity check. | Summary: rows, date range, debits=credits. Green check. "Proceed to TB." | Read-only. "Period certified. GL data is immutable." |
| **Mapping** | Skeleton table with account count in header | "Requires trial balance. Complete TB step first." | "AI classification unavailable. Map manually or retry." Show table with empty suggestion column. | Progress bar "234/312 mapped (75%)". Unmapped rows amber. Filters: All/Unmapped/AI/Manual. | "All 312 mapped. 287 by AI, 25 manual." Green check. | Read-only. AI column hidden. Who-confirmed-when on hover. |
| **Reconciliation** | Skeleton table with account count + total $ | "Requires completed mapping." | Per-account errors inline. Variance amounts displayed. | "12/47 accounts reconciled. Unreconciled: $1.2M." Sort by largest unreconciled. | "47/47 reconciled. All within threshold." | Read-only. Evidence viewable not editable. |
| **Adjustments** | Skeleton list with count | Positive: "No AJEs needed. TB and recon are clean. Proceed to Statements or create AJE." | Validation inline (must balance, required fields). "Draft saved. Try again." | Filter bar with counts: Draft(3)/Pending(2)/Approved(7)/Rejected(1). CFO defaults to Pending. | "12 AJEs approved. Net impact: +$456K net income." | Read-only. No Create button. |
| **Statements** | Per-statement progress: "Generating IS... BS... CF... Equity..." | "Requires completed recon and approved AJEs." Show unmet prerequisites. | "BS does not balance. Assets($X) != L+E($Y). Diff: $Z." Link to source of error. | Cards per statement: generated(green)/pending(gray)/failed(red). View completed while others process. | "4/4 generated. A=$X = L+E. Verified." View/download/print. Proceed to Certification. | Certified badge + signature + hash + verification URL in footer. |
| **Variance** | Skeleton table. "Calculating against [comparison]..." | "Requires 2 periods with statements." | "Comparison period unavailable." | "8/14 material variances justified." AI cards on unjustified. | "14/14 justified. Largest: $X (Y%)." | Read-only. IRAC text with AI attribution. |
| **Certification** | Gates resolving one-by-one (satisfying to watch) | "Requires all prior steps." Show pipeline progress. | "Unable to evaluate Gate 4. Retry." Specific gate failures. | Gates: some green, some red with detail+links, some gray. "Certify" disabled: "3 gates must pass." | All green. "Certify" enabled. Maximum attention moment. | Certification record: badge, sig, hash, URL, timestamp. Permanent. |

### Cross-Cutting State Rules

| Rule | Specification |
|------|---------------|
| **No optimistic updates for financial data** | Every mutation waits for server confirmation. Brief loading indicator on affected element. |
| **Stale data protection** | If another user modifies data: "[User] updated [entity] at [time]. Refresh to see changes." Never silently merge. |
| **No offline mode** | Financial data requires server validation + audit trail. Connection lost → persistent banner, disable mutations, read-only cached view with warning. |
| **Session timeout** | 15-30 min inactivity. Warn at 80% ("5 min remaining"). Force re-auth on timeout. |

---

## X. SUMMARY: HIGHEST-RISK UX AREAS

Five areas where execution determines success or failure:

1. **First-time setup friction.** Initial GL upload + account mapping is the moment of truth. If a controller spends 4 hours mapping and gets bad results, they never return. AI classification must be excellent on day one.

2. **Cross-statement integrity visualization.** The four statements tying together mathematically is the single most important trust feature. This cannot be a report you run. It must be visible at all times, like a heartbeat monitor.

3. **The certification ceremony.** Too casual → CFO doesn't trust it. Too cumbersome → CFO resents it. Balance: firm, clear, deliberate action with full context visible.

4. **The /verify page.** The product's most powerful sales tool. When a PE firm's auditor verifies statements independently without logging in, Sabit proves it is not just another SaaS tool but a cryptographic trust layer over financial data.

5. **AI boundary clarity.** The line between "AI suggests" and "system computes" must be architecturally and visually unambiguous. Any perception that AI produces dollar amounts will be a deal-breaker for every CPA, auditor, and regulator.

---

*This audit represents expected user mental models based solely on the product description. No source code, design files, or live product were reviewed. Compare against actual implementation to identify expectation gaps.*
