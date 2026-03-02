# Sabit — UX Design Specification

## Design Philosophy

**One principle governs every screen:** The controller should always know three things — where am I, what's done, and what do I do next.

**Design language:** Dark theme (the screenshots show this is already established). Clean, data-dense, professional. This is financial infrastructure software used by controllers and CFOs — not a consumer app. Think Bloomberg Terminal meets Stripe Dashboard. Dense but organized. Every pixel earns its place with information, not decoration.

**Typography:** Monospace for all dollar amounts (alignment matters in financial tables). Sans-serif for labels and navigation. Numbers right-aligned in every table, always.

**Color system:**
- Background: Dark navy/charcoal (#0f1629 or similar)
- Surface: Slightly lighter (#1a2035)
- Card/Panel: (#242b3d)
- Text primary: White (#ffffff)
- Text secondary: Grey (#8892a7)
- Accent/Primary: Blue (#6366f1) — for active states, primary buttons
- Success: Green (#22c55e) — for passed gates, completed items
- Warning: Amber (#f59e0b) — for items needing attention
- Error: Red (#ef4444) — for failed gates, errors
- Certified: Gold (#eab308) — for the certification moment

---

## Page 1: Portfolio Dashboard

**URL:** `/portfolio`
**Who sees this:** Everyone after login. Operating partners see all entities. Controllers see their entities.

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  SABIT          [User Name ▾] [Role Badge]              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Your Portfolio                              [+ Entity] │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │  Meridian SaaS    │  │  Acme Corp       │            │
│  │  ──────────────── │  │  ──────────────── │            │
│  │  Jan 2026         │  │  Feb 2026        │            │
│  │  ● CERTIFIED      │  │  ◐ IN PROGRESS   │            │
│  │                    │  │                   │            │
│  │  Feb 2026         │  │  7/11 gates ✓     │            │
│  │  ◐ IN PROGRESS    │  │  ████████░░ 64%   │            │
│  │  9/11 gates ✓     │  │                   │            │
│  │  ██████████░ 82%  │  │  [Open →]         │            │
│  │                    │  │                   │            │
│  │  [Open →]         │  └──────────────────┘            │
│  └──────────────────┘                                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Key decisions:**
- Each entity is a card showing the most recent period and its status
- Progress bar = gates passing / total gates (visual at-a-glance health)
- Prior certified periods shown as collapsed line items under the entity
- Operating partner view shows all entities across portfolio companies
- Click entity card → goes to that entity's close dashboard for the active period

---

## Page 2: Close Dashboard (The Command Center)

**URL:** `/close/[sessionId]/dashboard`
**Who sees this:** Controller (primary), CFO (review mode)
**This is the most important page in the app.**

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  SABIT    ← Portfolio    [Meridian SaaS ▾]  [Feb 2026 ▾]  OPEN │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  February 2026 Close                    [⚡ Prepare Close]      │
│  Status: IN PROGRESS                    [Manual mode ↓]         │
│                                                                 │
│  ┌─── PIPELINE ──────────────────────────────────────────────┐  │
│  │ ✅ Upload  → ✅ Map  → ◐ Recon → ○ Adjust → ○ Generate   │  │
│  │            → ○ Variance → ○ Review → ○ Certify            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─── WHAT NEEDS ATTENTION ──────────────────────────────────┐  │
│  │                                                            │  │
│  │  ⚠ 3 accounts unmapped              [Go to Mapping →]     │  │
│  │  ⚠ 8 reconciliations incomplete     [Go to Recon →]       │  │
│  │  ⚠ 1 AJE template not resolved      [Go to Adjustments →] │  │
│  │  ✅ Trial balance balanced                                 │  │
│  │  ✅ All journal entries approved                           │  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─── GATE STATUS ───────────┐  ┌─── PERIOD SUMMARY ────────┐  │
│  │                            │  │                            │  │
│  │  ✅ TB Balanced            │  │  Total Revenue  $2,450,000 │  │
│  │  ⚠  Accounts Mapped 57/60 │  │  Total Expense  $1,890,000 │  │
│  │  ⚠  Recons Complete  4/12 │  │  Net Income       $560,000 │  │
│  │  ⚠  Templates Resolved    │  │  Total Assets   $8,200,000 │  │
│  │  ○  Statements Current    │  │  Total Liab.    $3,100,000 │  │
│  │  ○  Variances Explained   │  │  Total Equity   $5,100,000 │  │
│  │  ✅ No Blocking Issues    │  │                            │  │
│  │  ✅ Evidence Policy        │  │  A = L + E  ✅             │  │
│  │  ○  Cross-Statement Ties  │  │                            │  │
│  │  ○  All Statements Exist  │  │  vs Jan 2026:              │  │
│  │  ✅ Material JEs Approved │  │  Revenue    ▲ 12.3%        │  │
│  │                            │  │  Net Income ▲  8.1%        │  │
│  │  7 of 11 passing           │  │  Assets     ▲  3.4%        │  │
│  │                            │  │                            │  │
│  └────────────────────────────┘  └────────────────────────────┘  │
│                                                                 │
│  ┌─── RECENT ACTIVITY ───────────────────────────────────────┐  │
│  │  10:34 AM  Jane posted JE-2026-02-012 (Depreciation)      │  │
│  │  10:22 AM  Jane completed recon for Account 1010 (Cash)   │  │
│  │   9:45 AM  System: 3 AJE templates proposed for Feb       │  │
│  │   9:30 AM  Jane uploaded GL (808 entries, TB balanced)     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Agent-Assisted Mode:**

When user clicks "⚡ Prepare Close":

```
┌─── AGENT PREPARING CLOSE ────────────────────────────────────┐
│                                                               │
│  ⚡ Preparing February 2026 close...                          │
│                                                               │
│  ✅ Generated mapping suggestions for 60 accounts             │
│     Auto-accepted 52 (HIGH confidence)                        │
│     8 need your review                           [Review →]   │
│                                                               │
│  ✅ Initialized 12 reconciliations                            │
│     Pre-populated 4 supporting balances from ERP              │
│     8 need bank statements                       [Upload →]   │
│                                                               │
│  ✅ Applied 5 recurring AJE templates                         │
│     Created 5 draft journal entries                           │
│     Awaiting your approval                       [Review →]   │
│                                                               │
│  ✅ Generated financial statements                            │
│                                                               │
│  ✅ Drafted variance explanations for 6 material variances    │
│     All grounded in actual journal entry data    [Review →]   │
│                                                               │
│  ───────────────────────────────────────────────────────────  │
│  Readiness: 7/11 gates passing                                │
│  Remaining: Review 8 mappings, upload 8 bank statements,      │
│  approve 5 JEs, review 6 variance explanations                │
│                                                               │
│  Estimated time to complete: ~30 minutes                      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## Page 3: Trial Balance

**URL:** `/close/[sessionId]/trial-balance`

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Trial Balance                    [Unadjusted] [Adjusted]       │
│  February 2026                    No adjustments posted          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Total Debits: $4,250,000.00    Total Credits: $4,250,000.00   │
│  Difference: $0.00 ✅           Accounts: 60    Mapped: 57/60  │
│                                                                 │
│  [Search by code or name...]                                    │
│  [All] [Asset] [Liability] [Equity] [Revenue] [Expense]        │
│  [All] [Mapped ✅] [Unmapped ⚠]                                │
│                                                                 │
│  ┌────────┬──────────────────┬────────┬────────────┬──────────┐ │
│  │ Code   │ Account Name     │ Type   │ Net Balance│ Mapping  │ │
│  ├────────┼──────────────────┼────────┼────────────┼──────────┤ │
│  │ 1010   │ Chase Checking   │ Asset  │  $245,000  │ Cash ✅  │ │
│  │ 1020   │ BofA Savings     │ Asset  │  $180,000  │ Cash ✅  │ │
│  │ 1100   │ Accounts Recv.   │ Asset  │  $520,000  │ AR ✅    │ │
│  │ 1200   │ Prepaid Insurance│ Asset  │   $36,000  │ ⚠ --    │ │
│  │ ...    │ ...              │        │            │          │ │
│  └────────┴──────────────────┴────────┴────────────┴──────────┘ │
│                                                                 │
│  Unmapped accounts are highlighted with amber row background    │
│  Click any row to expand: shows GL entries that comprise the    │
│  balance, debit total, credit total, and mapping dropdown       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key decisions:**
- Unmapped accounts highlighted in amber — impossible to miss
- Filter for unmapped accounts lets controller focus on what needs attention
- Expandable rows show the underlying GL entries (drilldown into the number)
- Net Balance column, not separate debit/credit columns (cleaner, controller can toggle if they want detail)
- Adjusted toggle shows the effect of posted AJEs inline

---

## Page 4: Mapping

**URL:** `/close/[sessionId]/mapping`

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Account Mapping                    57 of 60 mapped (95%)       │
│  February 2026                      [⚡ Auto-Map Remaining]      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Show: Unmapped Only ▾]   3 accounts need mapping              │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 1200  Prepaid Insurance     Asset     $36,000              │ │
│  │                                                            │ │
│  │  AI Suggestion: Prepaid Expenses (92% confidence)          │ │
│  │  [✅ Accept]  [✗ Reject]  [Manual ▾ select line item]      │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ 2150  Deferred Revenue      Liability  $85,000             │ │
│  │                                                            │ │
│  │  AI Suggestion: Deferred Revenue (97% confidence)          │ │
│  │  [✅ Accept]  [✗ Reject]  [Manual ▾ select line item]      │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ 5600  Miscellaneous Exp.    Expense    $12,400             │ │
│  │                                                            │ │
│  │  AI Suggestion: Other Operating Expenses (74% conf.)       │ │
│  │  ⚠ Low confidence — please verify                          │ │
│  │  [✅ Accept]  [✗ Reject]  [Manual ▾ select line item]      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ── Already Mapped (57 accounts) ────────────── [Expand ▾] ──  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key decisions:**
- Default view shows ONLY unmapped accounts — controller sees exactly what needs their attention
- AI suggestions shown inline with confidence badges (green HIGH, amber MEDIUM, red LOW)
- Accept/Reject is one click, not a separate page
- "Auto-Map Remaining" button runs the agent for just this step
- Already-mapped accounts collapsed by default but expandable for review
- Bulk accept: "Accept all HIGH confidence suggestions" button when multiple exist

---

## Page 5: Reconciliation

**URL:** `/close/[sessionId]/reconciliation`

**Layout — List View:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Reconciliation                     4 of 12 complete (33%)      │
│  February 2026                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Show: Incomplete ▾]   8 reconciliations need attention        │
│                                                                 │
│  ┌─────────┬──────────────┬───────────┬───────────┬──────────┐ │
│  │ Account │ GL Balance   │ Support.  │ Variance  │ Status   │ │
│  ├─────────┼──────────────┼───────────┼───────────┼──────────┤ │
│  │ 1010    │ $245,000.00  │ $245,000  │    $0.00  │ ✅ Done  │ │
│  │ Chase   │              │           │           │ Approved │ │
│  ├─────────┼──────────────┼───────────┼───────────┼──────────┤ │
│  │ 1020    │ $180,000.00  │     —     │     —     │ ⚠ Need  │ │
│  │ BofA    │              │           │           │ evidence │ │
│  ├─────────┼──────────────┼───────────┼───────────┼──────────┤ │
│  │ 1100    │ $520,000.00  │ $518,500  │ $1,500.00 │ ◐ Open  │ │
│  │ AR      │              │           │ 2 items   │          │ │
│  └─────────┴──────────────┴───────────┴───────────┴──────────┘ │
│                                                                 │
│  Click any row to open reconciliation detail →                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Layout — Detail View (click into a reconciliation):**

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Reconciliation List                                  │
│                                                                 │
│  1100 — Accounts Receivable                    Status: OPEN     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GL Balance (from TB):           $520,000.00                    │
│  Supporting Balance:             $518,500.00   [Edit]           │
│  ──────────────────────────────────────────                     │
│  Variance:                         $1,500.00   (computed by DB) │
│                                                                 │
│  RECONCILING ITEMS                                              │
│  ┌────────────────────────────────┬────────────┐                │
│  │ Invoice #4521 — timing diff.  │  $1,200.00 │  [✗ Remove]    │
│  │ Credit memo pending           │    $300.00 │  [✗ Remove]    │
│  └────────────────────────────────┴────────────┘                │
│  Reconciling Items Total:          $1,500.00                    │
│  [+ Add Reconciling Item]                                       │
│                                                                 │
│  UNEXPLAINED VARIANCE:               $0.00  ✅                  │
│                                                                 │
│  EVIDENCE                                                       │
│  ┌────────────────────────────────────────────┐                 │
│  │  📎 AR_Aging_Feb2026.xlsx  (uploaded 10:15) │  [View] [✗]    │
│  └────────────────────────────────────────────┘                 │
│  [+ Upload Evidence]                                            │
│                                                                 │
│  [Complete Reconciliation]     [Save Draft]                     │
│                                                                 │
│  ── After completion: ──────────────────────────────            │
│  Prepared by: Jane Controller  |  Feb 15, 2026 10:22 AM        │
│  [Approve] (requires different user)                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key decisions:**
- GL Balance is auto-populated — controller never types this
- Variance is computed by database (GENERATED column) — shown as read-only
- Unexplained variance updates in real-time as reconciling items are added
- Evidence is mandatory — Complete button disabled without at least one attachment
- Approve requires a different user (segregation of duties shown in UI)
- The entire reconciliation is on one page — no multi-step wizard

---

## Page 6: Adjustments (Journal Entries + Templates)

**URL:** `/close/[sessionId]/adjustments`

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Adjustments                        [+ New Journal Entry]       │
│  February 2026                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Templates] [Journal Entries]                                  │
│                                                                 │
│  ── TEMPLATES (3 proposed, 1 pending) ──────────────────────── │
│                                                                 │
│  ┌────────────────────────────┬──────────┬──────────┬────────┐ │
│  │ Template                   │ Amount   │ Status   │ Action │ │
│  ├────────────────────────────┼──────────┼──────────┼────────┤ │
│  │ Monthly Depreciation       │ $12,500  │ Applied  │  ✅    │ │
│  │ Insurance Amortization     │  $3,000  │ Applied  │  ✅    │ │
│  │ Accrued Payroll            │ $45,000  │ Pending  │ [Apply]│ │
│  │                            │          │          │ [Skip] │ │
│  └────────────────────────────┴──────────┴──────────┴────────┘ │
│                                                                 │
│  ── JOURNAL ENTRIES (8 total) ─────────────────────────────── │
│                                                                 │
│  [All] [Draft] [Proposed] [Approved] [Posted]                   │
│                                                                 │
│  ┌──────────┬────────────────────┬──────────┬────────┬───────┐ │
│  │ JE ID    │ Description        │ Amount   │ Status │       │ │
│  ├──────────┼────────────────────┼──────────┼────────┼───────┤ │
│  │ JE-02-01 │ Depreciation       │ $12,500  │ POSTED │       │ │
│  │ JE-02-02 │ Insurance amort.   │  $3,000  │ POSTED │       │ │
│  │ JE-02-03 │ Revenue accrual    │ $28,000  │ APPR.  │[Post] │ │
│  │ JE-02-04 │ Legal accrual      │$220,000  │ DRAFT  │[Edit] │ │
│  └──────────┴────────────────────┴──────────┴────────┴───────┘ │
│                                                                 │
│  Click any JE to expand: see debit/credit lines, memo,         │
│  evidence attachments, approval history                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**JE Creation / Edit (inline or modal):**

```
┌─────────────────────────────────────────────────────────────────┐
│  New Journal Entry                                              │
│                                                                 │
│  Description: [Accrue legal settlement - Acme Corp         ]    │
│                                                                 │
│  ┌──────────┬──────────────────┬────────────┬────────────────┐  │
│  │ Account  │ Name             │ Debit      │ Credit         │  │
│  ├──────────┼──────────────────┼────────────┼────────────────┤  │
│  │ [5200 ▾] │ Legal Expense    │ $220,000   │                │  │
│  │ [2100 ▾] │ Accrued Liab.    │            │ $220,000       │  │
│  │ [+ Add Line]                │            │                │  │
│  └──────────┴──────────────────┴────────────┴────────────────┘  │
│                                                                 │
│  Total Debits:  $220,000.00                                     │
│  Total Credits: $220,000.00                                     │
│  Difference:    $0.00  ✅        (must be zero to save)         │
│                                                                 │
│  📎 Evidence: [Upload supporting document]                      │
│     Required for entries ≥ $50,000 materiality threshold        │
│                                                                 │
│  [Save Draft]  [Submit for Approval]                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Page 7: Financial Statements

**URL:** `/close/[sessionId]/statements`

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Financial Statements               [Generate Statements]       │
│  February 2026                      Last generated: 10:45 AM    │
│                                     Status: ✅ Current           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Balance Sheet] [Income Statement] [Cash Flow] [Equity]        │
│                                                                 │
│  ══ BALANCE SHEET ══════════════════════════════════════════     │
│  Meridian SaaS Inc.                                             │
│  As of February 28, 2026                                        │
│                                                                 │
│  ASSETS                                                         │
│    Current Assets                                               │
│      Cash and Cash Equivalents          $   425,000.00          │
│      Accounts Receivable                    520,000.00          │
│      Prepaid Expenses                        36,000.00          │
│    ─────────────────────────────────────────────────            │
│    Total Current Assets                     981,000.00          │
│                                                                 │
│    Non-Current Assets                                           │
│      Property and Equipment               1,200,000.00          │
│      Less: Accumulated Depreciation        (350,000.00)         │
│      Intangible Assets                      400,000.00          │
│    ─────────────────────────────────────────────────            │
│    Total Non-Current Assets               1,250,000.00          │
│                                                                 │
│  ─────────────────────────────────────────────────              │
│  TOTAL ASSETS                          $  2,231,000.00          │
│  ═════════════════════════════════════════════════              │
│                                                                 │
│  LIABILITIES AND STOCKHOLDERS' EQUITY                           │
│    Current Liabilities                                          │
│      Accounts Payable                  $    180,000.00          │
│      Accrued Liabilities                    285,000.00          │
│      Deferred Revenue                        85,000.00          │
│    ─────────────────────────────────────────────────            │
│    Total Current Liabilities                550,000.00          │
│    ...                                                          │
│                                                                 │
│  ── VALIDATION ──────────────────────────────────────────────   │
│  ✅ Assets ($2,231,000) = Liabilities + Equity ($2,231,000)     │
│  ✅ Net Income ties to Income Statement ($560,000)              │
│  ✅ Cash ties to Cash Flow Statement ($425,000)                 │
│  ✅ Retained Earnings ties to Equity Statement                  │
│                                                                 │
│  Click any line item to drill down to contributing accounts     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key decisions:**
- Statements rendered like actual financial statements — proper GAAP presentation with subtotals, indentation, underlines
- Cross-statement validation shown directly below each statement (not on a separate page)
- Clickable line items drill down to the underlying TB accounts
- Tab interface for switching between the four statements
- "Stale" warning banner if any mutation has occurred since generation
- Monospace numbers, right-aligned, consistent formatting throughout

---

## Page 8: Variance Analysis

**URL:** `/close/[sessionId]/variance`

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Variance Analysis                  4 of 6 explained (67%)      │
│  Feb 2026 vs Jan 2026              [⚡ Draft All Explanations]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Show: Material Unexplained ▾]  2 variances need explanation   │
│                                                                 │
│  ┌────────────────┬────────────┬────────────┬───────┬────────┐ │
│  │ Line Item      │ Jan 2026   │ Feb 2026   │ Δ     │ Status │ │
│  ├────────────────┼────────────┼────────────┼───────┼────────┤ │
│  │ Legal Expense  │    $42,000 │   $262,000 │ +524% │ ⚠ Need │ │
│  │                │            │            │       │ explan.│ │
│  ├────────────────┼────────────┼────────────┼───────┼────────┤ │
│  │ Revenue        │ $2,180,000 │ $2,450,000 │ +12%  │ ✅     │ │
│  │                │            │            │       │Approved│ │
│  └────────────────┴────────────┴────────────┴───────┴────────┘ │
│                                                                 │
│  ── Click "Legal Expense" to expand: ────────────────────────  │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Legal Expense: +$220,000 (+524%)                          │ │
│  │                                                            │ │
│  │  TOP CONTRIBUTING ENTRIES:                                  │ │
│  │  • JE-02-04: Accrued legal settlement    $220,000 (100%)  │ │
│  │                                                            │ │
│  │  AI-DRAFTED EXPLANATION:                                   │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │ Legal expense increased $220,000 (524%) primarily    │  │ │
│  │  │ driven by the Acme Corp patent litigation settlement │  │ │
│  │  │ accrual recorded in JE-2026-02-04. Excluding this    │  │ │
│  │  │ one-time item, legal expense was flat at $42,000.    │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │  [✏ Edit]  [✅ Approve Explanation]  [🔄 Regenerate]       │ │
│  │                                                            │ │
│  │  Source: GL Investigation Engine — all numbers verified    │ │
│  │  against journal entry data                                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key decisions:**
- Default view shows only material unexplained variances
- Expanding a variance shows the contributing journal entries (provenance)
- AI-drafted explanation is editable — controller can modify before approving
- "Source" tag confirms numbers came from GL, not from AI
- "Draft All Explanations" button runs the agent for just this step
- Approved explanations show who approved and when

---

## Page 9: Review & Certify

**URL:** `/close/[sessionId]/review`

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Review & Certify                                               │
│  February 2026                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─── CERTIFICATION READINESS ───────────────────────────────┐  │
│  │                                                            │  │
│  │  ✅ Trial balance balanced         Debits = Credits        │  │
│  │  ✅ All accounts mapped            60 / 60                 │  │
│  │  ✅ Reconciliations complete       12 / 12 approved        │  │
│  │  ✅ Templates resolved             3 applied, 0 skipped    │  │
│  │  ✅ Statements current             Generated 10:45 AM      │  │
│  │  ✅ Variances explained            6 / 6 approved          │  │
│  │  ✅ No blocking issues             0 open                  │  │
│  │  ✅ Evidence policy satisfied      All required attached    │  │
│  │  ✅ Cross-statement ties           A=L+E, NI, Cash, RE ✓  │  │
│  │  ✅ All four statements exist      BS, P&L, CF, Equity     │  │
│  │  ✅ Material JEs approved          8 / 8                   │  │
│  │                                                            │  │
│  │  11 of 11 gates passing                                    │  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─── STATEMENT SUMMARY ─────────────────────────────────────┐  │
│  │                                                            │  │
│  │  Balance Sheet        Total Assets:    $2,231,000  ✅      │  │
│  │  Income Statement     Net Income:        $560,000  ✅      │  │
│  │  Cash Flow            Ending Cash:       $425,000  ✅      │  │
│  │  Equity               Total Equity:    $1,681,000  ✅      │  │
│  │                                                            │  │
│  │  Cross-statement validation: ALL TIES CONFIRMED            │  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─── CERTIFY ───────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  By certifying, you attest that:                           │  │
│  │  • All financial data has been reviewed                    │  │
│  │  • All adjustments are supported and approved              │  │
│  │  • All material variances have been explained              │  │
│  │  • The financial statements are complete and accurate      │  │
│  │                                                            │  │
│  │  This will create an immutable, cryptographically signed   │  │
│  │  certification artifact. The system will re-validate all   │  │
│  │  gates at the moment of certification.                     │  │
│  │                                                            │  │
│  │              [ 🔒 Certify February 2026 ]                  │  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ── After certification: ──────────────────────────────────── │
│                                                                 │
│  ┌─── CERTIFICATION ARTIFACT ────────────────────────────────┐  │
│  │                                                            │  │
│  │  🏆 CERTIFIED                                              │  │
│  │                                                            │  │
│  │  Certified by:    Sarah CFO                                │  │
│  │  Certified at:    Feb 20, 2026 3:45:12 PM UTC              │  │
│  │  Snapshot Hash:   a1b2c3d4e5f6...                          │  │
│  │  Signature:       Ed25519: 7f8e9d0c...                     │  │
│  │  Audit Chain:     847 entries, verified ✅                  │  │
│  │  Evidence:        23 documents, manifest hash verified ✅   │  │
│  │                                                            │  │
│  │  [Download Audit Binder]  [Verify Independently]           │  │
│  │  [Lock Period]                                             │  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key decisions:**
- The certification moment feels significant — gold accent color, attestation language
- All 11 gates visible with detail, not just pass/fail
- Statement summary with cross-statement validation confirmation
- After certification: the artifact displayed prominently with hash, signature, chain verification
- Lock Period is a separate action after certification (with confirmation dialog)
- Certify button disabled (greyed) with explanatory tooltip when any gate fails

---

## Page 10: Audit Trail

**URL:** `/close/[sessionId]/audit-trail`

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Audit Trail                        847 events                  │
│  February 2026                      Hash chain: ✅ Verified      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [All] [Close Events] [Journal Entries] [Reconciliation]        │
│  [Mapping] [Evidence] [Certification]                           │
│                                                                 │
│  ┌──────────┬───────────────┬──────────────────────────────┐    │
│  │ Time     │ User          │ Event                        │    │
│  ├──────────┼───────────────┼──────────────────────────────┤    │
│  │ 3:45 PM  │ Sarah CFO     │ Period CERTIFIED             │    │
│  │          │               │ Artifact: a1b2c3...          │    │
│  ├──────────┼───────────────┼──────────────────────────────┤    │
│  │ 3:44 PM  │ Sarah CFO     │ Advanced to UNDER_REVIEW     │    │
│  ├──────────┼───────────────┼──────────────────────────────┤    │
│  │ 2:30 PM  │ Jane Ctrl     │ Variance explanation approved│    │
│  │          │               │ Line: Legal Expense +524%    │    │
│  ├──────────┼───────────────┼──────────────────────────────┤    │
│  │ 2:15 PM  │ Jane Ctrl     │ JE-02-04 POSTED              │    │
│  │          │               │ Legal accrual $220,000       │    │
│  │          │               │ Cascade: TB recalc, stmts    │    │
│  │          │               │ invalidated                  │    │
│  └──────────┴───────────────┴──────────────────────────────┘    │
│                                                                 │
│  Each row expandable to show before/after state (JSONB)         │
│  Hash chain icon shows linkage: record N hash includes N-1      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Page 11: Settings

**URL:** `/settings/*`

Settings remains as tabs (General, Reconciliation, Evidence Policy, Templates, Taxonomy, Integrations, Team & Roles) — this is already structured correctly in the current UI. The main fixes needed:

- Save button must actually work (wired to API with toast feedback)
- Form validation on all fields before save
- Entity name and branding propagated throughout the app
- Team page shows current users with their roles and last activity

---

## Navigation Structure

**Sidebar (within a close session):**

```
Dashboard          ← The command center
Trial Balance      ← View the numbers
Mapping            ← Classify accounts  
Reconciliation     ← Prove balances
Adjustments        ← Journal entries & templates
Statements         ← The output
Variance           ← Explain changes
Review & Certify   ← The finish line
────────────
Audit Trail        ← The proof
Settings           ← Configuration
```

This matches the pipeline order. The controller works top-to-bottom. Each page shows its completion status in the nav (green check, amber warning, or count badge).

---

## Interaction Patterns (Apply Everywhere)

**1. Progressive disclosure.** Show what needs attention first, collapse what's done. Every list page defaults to "show incomplete/needs attention" filter.

**2. Inline actions.** Accept a mapping, approve an explanation, complete a reconciliation — all without navigating to a new page. Modals or inline expansion, never new pages for single actions.

**3. Context always visible.** The header always shows: entity name, period, status, gates passing. The controller never wonders "which period am I looking at."

**4. Numbers are sacred.** Dollar amounts always formatted with commas and two decimals. Always right-aligned. Always monospace. Never computed client-side — always from the API. Every computed number shows its source (GL, DB-computed, deterministic arithmetic).

**5. Proof at every step.** Validation badges (✅ ⚠ ✗) next to every gate, every reconciliation, every statement. The controller can see at a glance that the math is right without clicking into detail.

**6. Agent assistance is optional and transparent.** The ⚡ icon indicates agent actions. Every agent action shows what it did and why. The controller can always switch to manual mode. Agent never auto-approves — it prepares, human approves.

---

## Role-Based Differences

**Controller:** Sees everything. Can create, edit, submit. Cannot certify (needs reviewer/certifier role).

**Reviewer/CFO:** Sees everything in read-only during UNDER_REVIEW status. Can approve JEs, approve reconciliations, approve variance explanations, certify, lock.

**Operating Partner:** Sees Portfolio Dashboard with all entities. Can drill into any entity's close but cannot edit. Sees aggregate health metrics.

---

## Mobile Considerations

Not a priority for V1. Controllers do closes at a desk with a large monitor. However, the review/approval flow should work on tablet for CFOs who approve on the go. The Review & Certify page and JE approval flow should be responsive.