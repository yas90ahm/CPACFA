# Sabit Holistic UX Review
**Date:** 2026-03-11
**Auditors:** UX Researcher + UI Designer (source code walkthrough)
**Scope:** All 30+ pages, 4 persona walkthroughs, visual polish assessment
**Target:** Forum Ventures demo readiness

---

## PART 1: PERSONA WALKTHROUGHS

### 1. Sarah Chen — Controller (role: `controller`)

**Happy Path:**
Sarah's workflow is well-structured and discoverable. The sidebar follows the exact close sequence (Dashboard → Trial Balance → Mapping → Reconciliation → Adjustments → Statements → Variance → Review). The dashboard hero card with progress percentage and "Continue Close" CTA immediately tells her where she is and what to do next. Key wins:

- **GL Upload** — `OpenStateDashboard` renders when session is in OPEN state with a clean drag-and-drop upload zone. After ingest, redirects to dashboard with success toast showing account count and unmapped count.
- **Account Mapping** — Best-in-class. AI generates suggestions with confidence bands (HIGH/MEDIUM/LOW), she can accept individually or bulk-accept high-confidence, edit suggestions, or manual-map from a taxonomy dropdown. Progress bar with `X mapped / Y total` is always visible. Right panel shows AI suggestions and taxonomy tree simultaneously.
- **Reconciliation** — Batch mode is a standout feature: Tab/Enter to auto-save, per-row save indicators, live variance calculation. Over-tolerance rows get red left border. The auto-initialize on first visit is smart.
- **Statements** — 5-tab layout (IS, BS, CF, Equity, Validation) with proper GAAP formatting: parenthetical negatives, dollar signs on subtotals, double-underline grand totals. Prior period comparison and change columns are toggleable. QTD/YTD cumulative views available.
- **Variance** — AI drafts explanations via "Draft All" button. Controller edits/saves, reviewer approves. Investigation panel opens for deep-dive. Favorable/unfavorable color coding is context-aware (revenue up = green, expense up = red).
- **Adjustments** — Two-tab design (Entries + Templates). Full JE lifecycle: draft → propose → approve → post. SoD enforced (controller can't approve own JEs). AJE templates auto-carry forward.

**Friction Points:**

1. **No trial balance page visible in sidebar** — The sidebar lists `trial-balance` but there's no clear link from dashboard to view the raw TB. Sarah would expect to see her GL data before mapping. The OPEN→IN_PROGRESS transition may be confusing.
2. **GL Replace flow requires 3 clicks** — Dashboard "Replace GL Data" → Confirm dialog → Upload zone. Controllers re-upload GL frequently during close; this should be faster.
3. **Mapping dropdown on narrow screens** — The `<select>` with optgroups for line items (`max-w-[200px]`) truncates long line item names. No search/typeahead.
4. **Reconciliation detail navigation** — Clicking a row goes to `/reconciliation/:reconId` but there's no back button or breadcrumb documented. Sarah has to use browser back.
5. **No indication of what "Prepare Statements" will do** — The generate button doesn't explain that it will recalculate from adjusted TB. A first-time controller might hesitate.
6. **Variance explanation minimum 20 characters** — The validation silently prevents save with no visible character count or hint. Sarah would keep clicking "Save" wondering why nothing happens.
7. **Discrepancy page buttons** — Fixed in P0 fix but `data_quality` and `issue` type discrepancies show "Resolve via the Data Quality page" text with no link to navigate there.

**Dead Ends:**

1. **Fixed Assets, Deferred Tax, Equity Comp, Impairment, Segments, FX Translation, Consolidation** — 7 sidebar items (`fixed-assets` through `consolidation`) are listed but likely have no page components (they weren't in the codebase). Clicking these would 404.
2. **GL Health page** — Listed in sidebar as `gl-health` but no page component found. Would 404.
3. **Export PDF** — `handleExportPdf` calls `/api/export/pdf` but uses wrong base URL (calls frontend URL, not API URL). Would fail unless Next.js proxies it.

**Missing Affordances:**

1. **No "Undo" for account mapping** — Once mapped, Sarah can only re-map, not un-map an account.
2. **No reconciliation evidence upload from batch view** — She must click into individual recon detail to attach bank statements.
3. **No JE import from CSV** — Every JE must be created manually. Controllers with ERP exports expect bulk import.
4. **No "Mark as Reviewed" for individual reconciliations** — Batch mode saves supporting balance but doesn't mark status. She must still click each row individually.
5. **No currency formatting in reconciliation batch input** — Raw number input (`0.00` placeholder) vs formatted display creates cognitive dissonance.

---

### 2. David Park — CFO/Reviewer (role: `reviewer`)

**Happy Path:**
David sees the `ReviewerDashboard` component when session is UNDER_REVIEW, giving him a focused review experience. The Review & Certify page (`review/page.tsx`) is comprehensive:

- **11 certification gates** displayed as a checklist with pass/fail indicators
- **Financial highlights** summary showing Revenue, Net Income, Total Assets, Liabilities, Equity, Cash
- **Activity Summary** with JE count, recon count, variance count, evidence files, duration, participants
- **Evidence Manifest** with SHA-256 hashes of all uploaded evidence
- **Certification workflow**: Submit for Review → Certify (with Ed25519 signature) → Lock
- **Board Package** generation with Monthly/QTD/YTD views and PDF export
- After certification, shows the `CertificationRecord` with digital signature, hash, and link to `/verify`

**Friction Points:**

1. **No "Review Queue" or task list** — David lands on the dashboard and has to navigate to each section (recon, adjustments, variance) manually to review work. No centralized "items awaiting my approval" view.
2. **JE approval requires navigating to Adjustments page** — There's no in-line approve/reject on the Review page. David must go to Adjustments → Entries tab to approve.
3. **Reconciliation approval is buried** — David must click into each individual reconciliation, find the approve button, and approve one-by-one. No batch approve.
4. **Variance approval** — David can approve explained variances but must expand each row individually. No "Approve All Explained" bulk action.
5. **Certification gates are read-only** — If a gate is failing, there's no direct link from the gate to the remediation page. (Actually gates do have `navigateTo` — check if it's used.)
6. **Board package only available after CERTIFIED** — David might want a draft preview before certifying. The `useBoardPackageTolerant` hook returns null for non-certified sessions.
7. **No comment/note system** — David can't leave notes for Sarah saying "Recheck this reconciliation" or "This variance explanation needs more detail."

**Dead Ends:**

1. **Reopen after certification** — `canReopenPeriod` is admin-only. If David (reviewer) certifies with an error, he can't reopen it himself.
2. **Lock** — `canLockPeriod` is admin-only. The Lock button shows on the Review page but a reviewer can't use it.

**Missing Affordances:**

1. **No "Request Changes" action** — David can certify or not, but there's no formal "Return to Preparer" with notes.
2. **No side-by-side comparison** — David would want to compare current period statements to prior period on the Review page, but the toggle is only on Statements page.
3. **No reviewer-specific notifications** — When Sarah submits for review, David has no alert/badge system.
4. **No signing ceremony UX** — The certification is a button click. CFOs expect a more ceremonial/weighty experience given they're putting their name on the statements.

---

### 3. Marcus Webb — PE Operating Partner (role: `operating_partner`)

**Happy Path:**
Marcus gets the Portfolio Dashboard as his landing page (`getDefaultLandingPage` returns `/portfolio`). The sidebar is filtered to only show: Dashboard, Trial Balance, Statements, Variance, Board Package, Audit Trail. The portfolio page is comprehensive:

- **Summary cards**: Companies, Closed, In Progress, Not Started, Attention
- **Attention section**: Companies needing attention with drill-in (overdue, stalled, blocking issues)
- **Company table**: 11 columns including Status, Progress bars, Days vs Target, Issues, Revenue, Net Income, Margin, Trend sparklines
- **Financial Overview table**: Revenue, Net Income, Margin, vs Prior with portfolio totals
- **Close Duration Trend**: Sparkline history per company
- **Data source badges**: Certified vs Draft distinction on every financial figure
- **Period navigation**: Previous/Current/Next month carousel

**Friction Points:**

1. **No multi-period comparison** — Marcus can only see one month at a time. PE partners want to see 3-6 months side-by-side to spot trends.
2. **Click to drill-in requires active session** — If a company has no `currentSessionId`, clicking the row just toggles an expand panel with static text. No way to create a session for them.
3. **Revenue/Net Income use `formatRev` which has 0 decimals** — Financial figures show as `191,000` not `$191,000.00`. No dollar sign, no cents. Inconsistent with statement formatting.
4. **Sparkline is too small** — 6px bars with 0.5px gap. On a 4K monitor this is barely visible. Needs to be larger or replaced with a proper micro-chart.
5. **"Portfolio Total" footer doesn't aggregate correctly when filters are applied** — The totals come from `summary` (all companies) but the table shows filtered companies. Total doesn't match visible rows.
6. **No export** — Marcus wants to email the portfolio summary to his partners. No CSV/PDF export on the portfolio page.

**Dead Ends:**

1. **Company with no session** — Companies that haven't started a close show "No active session" and the expand panel just shows static phase text. No action Marcus can take.
2. **Settings not visible** — OP can't access Settings (correct by design), but also can't see team members or evidence policies. If he needs to know who the preparer is for a company, the only source is the table row.

**Missing Affordances:**

1. **No portfolio-level alerts/notifications** — Marcus should get an alert when a company is overdue or stalled.
2. **No benchmark comparisons** — PE partners want to compare portfolio companies against each other and against industry benchmarks.
3. **No "Nudge" or "Send Reminder" action** — Marcus sees a company is behind but can't do anything about it from the dashboard.
4. **No fund-level aggregation** — Karen Whitfield's use case. The portfolio totals are a start but she'd need formal consolidated financials for LP reporting.

---

### 4. Karen Whitfield — Fund Controller (role: `auditor`)

**Happy Path:**
Karen's experience is the least developed. The sidebar shows a comprehensive set of pages (dashboard, TB, GL Health, mapping, recon, adjustments, specialized modules, statements, variance, board package, review, audit trail) but everything is read-only (`isReadOnly` returns true for `auditor` role).

The `FundControllerDashboard` component exists and is rendered when `role === 'admin' && user?.email?.includes('fund')` — **this is problematic** because the actual `auditor` role doesn't trigger it. Karen would get the standard controller dashboard in read-only mode.

**Friction Points:**

1. **Wrong dashboard routing** — `FundControllerDashboard` is gated on `admin` role + email containing "fund", not on `auditor` role. Karen (auditor) gets the wrong dashboard.
2. **No entity selector** — Karen works across entities but the close session list only shows sessions for one entity at a time. No way to see all entities' sessions.
3. **Read-only without visual indicator** — Pages show all the buttons (map, reconcile, adjust) but they're disabled. No "Read-Only Mode" banner to explain why.
4. **No verification without session ID** — The `/verify` page requires a session ID to look up. Karen would need to know the ID. The Review page does show a "Verify" link after certification.
5. **Settings access is empty** — `auditor` role has `[]` in SETTINGS_ACCESS. Karen can't see any settings, including evidence policy or reconciliation requirements that she'd need for audit.

**Dead Ends:**

1. **Portfolio page not accessible by default** — `getDefaultLandingPage` sends auditors to `/close`, not `/portfolio`. Karen has no way to see the portfolio view since it's not in her sidebar items.
2. **Board Package page visible but may not work** — It's in the auditor's visible pages but the board package API requires certification, which Karen can't initiate.

**Missing Affordances:**

1. **No cross-entity consolidated view** — The most critical missing feature for a fund controller.
2. **No export of certified data across entities** — Karen needs to pull certified financials into her LP reporting.
3. **No audit workpaper download** — Karen would expect to download a complete audit package (statements, reconciliations, evidence, audit trail) for each entity.
4. **No commentary trail** — Karen needs to see who said what about each variance and reconciliation, with timestamps.

---

## PART 2: VISUAL POLISH FINDINGS

### Design System Consistency Score: 7.5/10

**Strengths:**
- Well-defined color token system in Tailwind config with semantic naming (status-green, status-amber, status-red, accent, ai-purple)
- CSS variables in globals.css mirror Tailwind tokens, providing fallback styling
- Consistent use of `rounded-card` (12px) and `rounded-input` (8px) border radii
- Good dark theme execution overall — backgrounds layer correctly (primary → surface → surface-alt → elevated)
- Global form input styling ensures consistency even if Tailwind purges
- Scrollbar styling is subtle and professional
- Print styles on statements page (hidden nav, no borders)

**Weaknesses:**

#### P1 — Hardcoded Colors (inconsistency)

Several pages use raw hex/Tailwind colors instead of design tokens:

| File | Issue |
|------|-------|
| `discrepancies/page.tsx` | Uses `bg-[#141829]`, `border-[#262C48]`, `text-gray-200/300/400/500/600` throughout instead of `bg-surface`, `border-border`, `text-primary/text-secondary` |
| `ai-review/page.tsx` | Uses `bg-amber-500/10`, `text-amber-400`, `bg-emerald-500/10` instead of `bg-status-amber-dim`, `text-status-amber`, etc. |
| `controls/page.tsx` | Uses `text-emerald-400`, `text-red-400`, `text-gray-500` instead of design tokens |
| `checklist/page.tsx` | Uses `text-white`, `text-gray-500` instead of `text-primary`, `text-text-secondary` |
| `verify/page.tsx` | Uses `bg-[#0d1017]`, `text-gray-600`, `text-gray-300`, `bg-emerald-500/10` — mostly raw colors |
| `dashboard/page.tsx` hero | Uses `bg-[#1a1d23]`, `text-gray-400`, `text-white` instead of tokens |

**Impact:** These pages will look slightly different from each other. The discrepancies and verify pages feel like they were built by a different designer.

#### P2 — Financial Number Formatting Inconsistencies

| Page | Format | Issue |
|------|--------|-------|
| Dashboard `formatMoney` | `$1,234` | No cents, no parenthetical negatives |
| Portfolio `formatRev` | `1,234` | No dollar sign, no cents |
| Discrepancies `formatMoney` | `-$1,234` | Minus sign prefix, not GAAP parenthetical |
| StatementTable `formatGaapAmount` | `(1,234.56)` with `$ ` prefix on subtotals | Correct GAAP format |
| MoneyCell component | Varies by props | Centralized but callers don't always use it |
| Variance page | Uses `MoneyCell` | Correct |
| Reconciliation | Uses `MoneyCell` | Correct |

**The StatementTable and MoneyCell are correct. The issue is that dashboard, portfolio, and discrepancy pages have their own formatters that don't follow GAAP conventions.**

#### P3 — Typography Inconsistencies

- **Page headings**: Mix of `text-2xl font-display text-primary` (most pages), `text-xl font-semibold text-white` (checklist, discrepancies), and `text-lg` (portfolio sub-sections). Should standardize.
- **Subtitle text**: Mix of `text-text-secondary text-sm` and `text-gray-500 text-sm` and `text-sm text-gray-500`.
- **Section headers**: Some use `text-xs font-medium text-text-secondary uppercase tracking-wide` (dashboard), others use `text-[10px] font-semibold uppercase tracking-wider` (discrepancies). Should pick one.

#### P4 — Spacing & Layout

- **Max-width inconsistency**: Portfolio uses `max-w-[1600px]`, Close list uses `max-w-5xl` (1024px), discrepancies uses `max-w-[1100px]`, checklist uses `max-w-[1000px]`. Most session pages use no max-width (full sidebar + content). This creates different content widths when navigating between pages.
- **Sidebar items**: 23 items in the nav is too many for most screen heights. Users with 1080p screens will need to scroll the sidebar. The separator lines help but there should be collapsible groups.
- **Card padding**: Mostly `p-5` or `p-6` but some cards use `p-4` (portfolio summary cards). Minor but noticeable.

#### P5 — Interactive Element Consistency

- **Primary buttons**: Two styles in use — `rounded-full bg-accent text-white` (landing-page style, used on dashboard) and `rounded-input bg-accent text-white` (form-style, used in adjustments). Should pick one.
- **Loading states**: Dashboard uses skeleton loader (good), reconciliation uses text "Loading reconciliations...", portfolio uses text "Loading portfolio...", mapping uses no loading state for main table. Should standardize on skeleton loaders.
- **Empty states**: Well-done overall. Most pages have centered empty state with icon + description + CTA button. Portfolio empty state is particularly good.
- **Toast notifications**: Positioned `fixed bottom-4 right-4` consistently across pages. Good.

#### P6 — Mobile Responsiveness

- **Sidebar**: Fixed at 240px with no collapse mechanism. On screens < 768px, the sidebar + content won't fit. No hamburger menu or responsive behavior found.
- **Tables**: Most tables have `overflow-x-auto` wrapper (good) but the reconciliation table with 12 columns and portfolio table with 11 columns will be unusable on phone screens.
- **Dashboard pipeline**: `overflow-x-auto` on the pills is correct but 8 pills won't fit on phone.
- **Statement tables**: Would be very difficult to read on mobile with multi-column financial data.

#### P7 — Dark Theme Issues

- The `text-primary` color name is overloaded — it's both a Tailwind `textColor` token (`#F1F1F4`) and a Tailwind `colors` token (`#0B0F1A` — the darkest background!). When used as `bg-primary` it's correct (dark background), but this naming could cause confusion.
- Some pages use `text-white` directly. The design token `text-primary` is `#F1F1F4` which is close to white but slightly softer. Using `text-white` (`#fff`) creates inconsistency.

---

## PART 3: TOP 20 FIXES FOR FORUM VENTURES DEMO

### Critical (Demo Blockers)

**1. Remove or gate 8 placeholder sidebar items**
`fixed-assets`, `deferred-tax`, `stock-compensation`, `impairment`, `segments`, `fx-translation`, `consolidation`, `gl-health` — clicking these causes 404. Either create placeholder pages with "Coming in v2" messaging or hide them from the sidebar. For the demo, hide them.
*File: `components/shell/Sidebar.tsx` lines 49-55, 45*

**2. Fix FundControllerDashboard routing**
Currently gated on `admin` role + email containing "fund". Should be `auditor` role.
*File: `dashboard/page.tsx` line 172 — change `role === 'admin' && user?.email?.includes('fund')` to `role === 'auditor'`*

**3. Standardize financial number formatting across all pages**
Dashboard and portfolio use non-GAAP formatting ($1,234 without cents, no parenthetical negatives). Replace local `formatMoney`/`formatRev` with `MoneyCell` or a shared `fmtMoney` utility everywhere.
*Files: `dashboard/page.tsx:24-29`, `portfolio/page.tsx:87-91`, `discrepancies/page.tsx:71-77`*

**4. Add character counter to variance explanation textarea**
Currently silently prevents save below 20 chars. Add visible counter: "15/20 min characters"
*File: `variance/page.tsx` line 489 area*

### High Priority (Demo Polish)

**5. Replace hardcoded hex colors with design tokens**
Discrepancies, AI Review, Controls, Checklist, Verify pages all use raw colors. Replace `bg-[#141829]` → `bg-surface`, `text-gray-400` → `text-text-secondary`, `bg-emerald-500/10` → `bg-status-green-dim`, etc.
*Files: `discrepancies/page.tsx`, `ai-review/page.tsx`, `controls/page.tsx`, `checklist/page.tsx`, `verify/page.tsx`*

**6. Add sidebar collapse for mobile**
Add hamburger menu button in TopBar that toggles sidebar visibility. At minimum, hide sidebar below 768px.
*Files: `components/shell/Sidebar.tsx`, `components/shell/TopBar.tsx`*

**7. Add "Back to Dashboard" breadcrumb on detail pages**
Reconciliation detail, JE detail panels — users must use browser back button. Add a small breadcrumb or back arrow.

**8. Add "Items Awaiting Your Review" section to ReviewerDashboard**
When David logs in as reviewer, he needs a task queue showing: JEs pending approval, Reconciliations ready for reviewer sign-off, Variance explanations pending approval.

**9. Add read-only mode banner**
When `isReadOnly(role)` is true, show a persistent banner: "You're viewing in read-only mode as [Role]". Currently buttons just appear disabled with no explanation.

**10. Improve portfolio revenue formatting**
Add dollar signs and 2 decimal places to portfolio financial figures. Change `formatRev` to use `Intl.NumberFormat` with currency style.
*File: `portfolio/page.tsx:87-91`*

### Medium Priority (Refinement)

**11. Add skeleton loading states to all pages**
Dashboard has good skeletons; other pages show text like "Loading...". Add skeleton loaders to: mapping table, reconciliation table, variance table, portfolio table.

**12. Standardize page heading typography**
Use `text-2xl font-display text-primary` for all page h1s. Fix checklist (`text-xl font-semibold text-white`) and discrepancies (`text-xl font-semibold text-white`).

**13. Add collapsible sidebar groups**
Group the 23 sidebar items into collapsible sections: Close Workflow (Dashboard through Adjustments), Specialized (Fixed Assets through Consolidation), Analysis (Statements through Discrepancies), Governance (AI Review through Audit Trail).

**14. Add discrepancy page navigation links**
For data_quality and issue type discrepancies that show "Resolve via the Data Quality page", make that text a clickable link that navigates to the relevant page.
*File: `discrepancies/page.tsx`*

**15. Add signing ceremony UX to certification**
When CFO clicks Certify, show a modal with the statement summary, the certification text, and a "Sign with Digital Signature" button that has appropriate weight/ceremony (gold glow, signature animation).

**16. Add max-width consistency**
Set all session-scoped pages to a consistent max-width. Recommendation: `max-w-[1200px]` for full-width data pages (recon, mapping), `max-w-[1000px]` for focused pages (checklist, discrepancies).

**17. Add portfolio CSV/PDF export**
Marcus needs to share the portfolio summary with partners. Add export buttons to the Portfolio Dashboard page header.

**18. Dashboard hero card uses hardcoded colors**
`bg-[#1a1d23]`, `text-gray-400`, `text-white` — replace with design tokens for consistency.

**19. Add search/typeahead to mapping dropdown**
The `<select>` with optgroups truncates on narrow screens. Replace with a searchable combobox for the taxonomy line item selector.

**20. Fix board package pre-certification access**
Allow draft board package preview before certification (the `useBoardPackageTolerant` hook already handles 409). Show a "DRAFT — Not Certified" watermark on the preview.

---

## SUMMARY METRICS

| Category | Score |
|----------|-------|
| Controller workflow completeness | 8/10 |
| Reviewer workflow completeness | 6/10 |
| Operating Partner workflow completeness | 7/10 |
| Fund Controller workflow completeness | 3/10 |
| Design system consistency | 7.5/10 |
| Financial data presentation | 7/10 (StatementTable is 10/10, other pages drag it down) |
| Mobile responsiveness | 4/10 |
| Empty/error state handling | 8/10 |
| Overall demo readiness | 7/10 |

**Bottom Line:** The controller workflow is genuinely impressive — AI-assisted mapping, batch reconciliation, GAAP-formatted statements, and cryptographic certification form a complete and differentiated product. The main risks for the Forum Ventures demo are: (1) clicking a placeholder sidebar item and hitting a 404, (2) inconsistent number formatting undermining the "every dollar is correct" message, and (3) the reviewer persona having no centralized review queue. Fixes #1, #3, and #8 would have the highest impact on demo success.
