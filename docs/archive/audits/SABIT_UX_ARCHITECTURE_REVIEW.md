# Sabit UX Architecture Review

**Auditors:** UX Architect + UX Researcher (dual-agent audit)
**Date:** 2026-03-11
**Scope:** Full frontend codebase (`frontend/`), 40+ pages, 28 shared components, 30 query modules

---

## I. INFORMATION ARCHITECTURE REDESIGN PROPOSAL

### Current State

The sidebar contains 22 nav items organized into 4 collapsible groups plus Settings:

| Group | Items | Default |
|-------|-------|---------|
| Close Pipeline | Dashboard, Trial Balance, Mapping, Reconciliation, Adjustments | Open |
| Statements & Analysis | Statements, Variance, GL Health, Discrepancies | Open |
| Specialized Modules | Fixed Assets, Deferred Tax, Equity Comp, Impairment, Segments, FX Translation, Consolidation | **Collapsed** |
| Governance | AI Review, Controls, Checklist, Board Package, Review & Certify, Audit Trail | Open |

Role visibility is well-implemented in `lib/permissions.ts`:
- **Controller** sees all 22 pages
- **Reviewer** sees all 22 pages (read-only on most)
- **Operating Partner** sees 6 pages: Dashboard, TB, Statements, Variance, Board Package, Audit Trail
- **Fund Controller** shares portfolio page with OP (no dedicated view)
- **Auditor** sees 18 pages (broad read-only access)

### Assessment: Task-Based vs Feature-Based

**Positive:** The IA is organized by workflow phase (task-based), which is correct. Groups 1 and 2 mirror the close pipeline steps.

**Problem 1 — CFO "Review & Certify" is buried.** It's the 5th item in the 4th group. David Park's primary action — certify a close — requires scrolling past 16 items. The UNDER_REVIEW highlight (`bg-accent-dim/50`) is too subtle for the persona's most critical task.

**Problem 2 — Specialized Modules collapsed by default.** Controllers using Fixed Assets, Deferred Tax, etc. during daily close work face an extra click every session. For a PE-backed company with goodwill impairment, this section is used every close.

**Problem 3 — Fund Controller has no dedicated view.** Karen Whitfield must use the same portfolio page as Marcus Webb despite fundamentally different needs (quarterly aggregation vs weekly monitoring). `FundControllerDashboard.tsx` exists as an embedded component but has no dedicated route.

**Problem 4 — Operating Partner sidebar overhead.** Marcus sees only 6 items scattered across 3 groups. For a 10-minute weekly check, the collapsed group structure adds visual noise. The portfolio page correctly has no sidebar, but once he drills into an entity, the full sidebar appears.

### Proposed IA

**For Controller (Sarah Chen):**
- Move "Checklist" into Close Pipeline (it's her daily tracker)
- Open Specialized Modules by default (or remember user's preference)
- Add a "quick jump" keyboard shortcut (Ctrl+K) for direct navigation to any page

**For CFO/Reviewer (David Park):**
- When session state is UNDER_REVIEW, surface a prominent "Review & Certify" card at the TOP of the sidebar (above Close Pipeline)
- The dashboard should auto-switch to ReviewerDashboard showing a review queue

**For Operating Partner (Marcus Webb):**
- Remove sidebar for this role inside entity drill-downs; use horizontal tabs instead
- The 6-item subset is correct; horizontal tabs would consume less space and match the portfolio page's sidebar-free layout

**For Fund Controller (Karen Whitfield):**
- Add `/portfolio/consolidated` route with cross-entity financial aggregation
- Dedicated quarterly view: consolidated TB, combined statements, variance across entities

### Wireframe: Reviewer Sidebar State (UNDER_REVIEW)

```
┌──────────────────────┐
│ ★ REVIEW & CERTIFY   │  ← Promoted to top, accent background
│   Ready for review   │
├──────────────────────┤
│ ▾ Close Pipeline     │
│   Dashboard          │
│   Trial Balance      │
│   ...                │
├──────────────────────┤
│ ▾ Governance         │
│   AI Review          │
│   Controls           │
│   ...                │
└──────────────────────┘
```

---

## II. DESIGN SYSTEM AUDIT

### Token Architecture

**File:** `tailwind.config.ts` (lines 17-60) + `globals.css` (lines 7-39)

The token system is well-designed:
- **Background scale:** 7 levels (primary → hover)
- **Text scale:** 4 levels (primary → muted)
- **Status colors:** green/amber/red/blue with -dim variants
- **Accent:** #7C5CFC with dim/hover/contrast variants

**Issue: Duplicate definitions.** Every color is defined twice — once in Tailwind config and again as CSS variables in globals.css. Risk of drift between them.

### Money Formatting — 7 DISTINCT PATTERNS (Should Be 1)

| # | Pattern | Files | Problem |
|---|---------|-------|---------|
| 1 | `MoneyCell` component (via `fmtMoney`) | 19 files | Correct canonical path |
| 2 | `fmtMoney()` directly | 6 files | Acceptable (same logic as MoneyCell) |
| 3 | `formatMoney()` from `lib/format.ts` | 3 files | Wrapper — OK but unnecessary indirection |
| 4 | Local `formatRev()` wrapping `fmtMoney` | 1 file (portfolio) | Recently fixed but wrapper remains |
| 5 | Local `formatMoney()` using `Intl.NumberFormat` | 4 files | **VIOLATION:** Converts strings to Number() |
| 6 | Inline `Number().toLocaleString()` | 3 files | **VIOLATION:** Same Number() conversion |
| 7 | `StatementTable.tsx` own formatting | 1 file | Uses `toLocaleString` directly |

**Critical:** Patterns 5 and 6 violate the project's own rule at `lib/money.ts` line 7: *"They NEVER become JavaScript Numbers for financial computation."* Files: `GLUploadFlow.tsx`, `TBUploadFlow.tsx`, `FundControllerDashboard.tsx`, `OperatingPartnerDashboard.tsx`, `fx-translation/page.tsx`, `consolidation/page.tsx`, `variance/page.tsx` (lines 287-289 use `Number().toLocaleString()` in the same file that also imports `MoneyCell`).

**Patterns 5 and 6 also use `minimumFractionDigits: 0`** — no cents displayed, inconsistent with the GAAP 2-decimal standard used everywhere else.

### Raw Hex Values vs Design Tokens

**328 raw hex color values** found across 20 `.tsx` files. Worst offenders:

| File | Count |
|------|-------|
| `components/shared/OnboardingWizard.tsx` | 40 |
| `app/verify/page.tsx` | 35 |
| `components/dashboards/FundControllerDashboard.tsx` | 23 |
| `components/shared/AIInsightsPanel.tsx` | 22 |
| `app/close/[sessionId]/ai-review/page.tsx` | 22 |
| `app/close/[sessionId]/discrepancies/page.tsx` | 21 |
| `components/dashboards/ReviewerDashboard.tsx` | 20 |
| `components/shared/SmartCloseAssistant.tsx` | 20 |

### Tailwind text-gray-* / text-white Bypass

**326 occurrences of `text-gray-*`, `text-white`, or `text-black`** across 30 files bypass the semantic token system (`text-primary`, `text-secondary`, `text-tertiary`). Worst offenders:

| File | Count |
|------|-------|
| `app/verify/page.tsx` | 54 |
| `app/close/[sessionId]/discrepancies/page.tsx` | 38 |
| `components/dashboards/ReviewerDashboard.tsx` | 32 |
| `components/dashboards/FundControllerDashboard.tsx` | 31 |
| `components/dashboards/OperatingPartnerDashboard.tsx` | 27 |
| `components/shared/AIInsightsPanel.tsx` | 27 |

These files were likely built before the token system was established.

### Badge Style Proliferation

`StatusBadge` exists at `components/shared/StatusBadge.tsx` with 5 semantic variants — but is imported in only **6 files**. Meanwhile, **18+ inline badge patterns** duplicate the same visual pattern (`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium`) across:
- `trial-balance/page.tsx` (4 instances)
- `reconciliation/page.tsx` (4 instances)
- `mapping/page.tsx` (3 instances)
- `board-package/page.tsx` (2 instances)
- `dashboard/page.tsx`, `FilterBar.tsx`, `CertificationChecklist.tsx` (1 each)

### Typography Violations

Beyond the standard Tailwind scale, the codebase uses arbitrary sizes:
- `text-[10px]` — used in TopBar, StateMachineBanner, OnboardingWizard, FundControllerDashboard, mapping/page.tsx
- `text-[9px]` — verify/page.tsx (lines 298, 390, 391)
- `text-[8px]` — verify/page.tsx (line 286)

These are below WCAG recommended minimums and should be replaced with `text-xs` (12px) minimum.

### Design Token Recommendations

1. **Eliminate CSS variable duplication** — use Tailwind config as the single source; reference tokens via `theme()` in globals.css if needed
2. **Create `text-caption` token** — for small labels, set floor at 11px
3. **Create `text-overline` token** — for uppercase labels (currently `text-xs font-semibold uppercase tracking-wider`)
4. **Add `border-border` to all input/card classes** — many still use raw `border` without the token color
5. **Add `rounded-input` / `rounded-card`** — standardize radius usage (currently mixed `rounded`, `rounded-lg`, `rounded-md`, `rounded-input`, `rounded-card`)

---

## III. COMPONENT ARCHITECTURE AUDIT

### Shared Component Inventory (28 in `components/shared/`)

| Component | Imports | Assessment |
|-----------|---------|------------|
| `DataTable` | 11 files | Core workhorse, well-designed |
| `MoneyCell` | 19 files | Good adoption, but 10+ files bypass it |
| `StatusBadge` | 6 files | **Severely underused** — 18+ inline duplicates |
| `Skeleton` (4 exports) | **0 files** | **DEAD CODE** — never imported |
| `ErrorBoundary` | 2 files | Only global + session layout |
| `SlideOverPanel` | Multiple | Good adoption |
| `ConfirmDialog` | 2 files | Used in adjustments, recon |
| `AISuggestionCard` | Multiple | AI suggestion display |
| `FileUploadZone` | GL upload | Well-used |

### Tables NOT Using DataTable (12 hand-rolled tables)

1. `app/portfolio/page.tsx` — portfolio company table
2. `app/close/page.tsx` — session list table
3. `components/dashboards/OperatingPartnerDashboard.tsx` — company table
4. `components/dashboards/FundControllerDashboard.tsx` — company table
5. `components/investigation/InvestigationPanel.tsx` — GL entries table
6. `app/settings/team/page.tsx` — team members table
7. `app/settings/reconciliation/page.tsx` — recon requirements table
8. `app/settings/templates/page.tsx` — templates table
9. `app/close/[sessionId]/board-package/page.tsx` — statement tables (2)
10. `app/close/[sessionId]/statements/StatementTable.tsx` — specialized GAAP display
11. `app/close/[sessionId]/statements/EquityTable.tsx` — equity statement
12. `app/close/[sessionId]/dashboard/GLUploadFlow.tsx` — TB preview table

### DataTable Missing overflow-x-auto

**Critical:** `DataTable.tsx` line 86 uses `overflow-hidden`. Any table wider than viewport **clips** content instead of scrolling. This affects 11 pages. Should be `overflow-x-auto`.

### Missing Shared Components

1. **`EmptyState`** — Every page implements its own "no data" UI with inconsistent messaging. Examples: "No close sessions yet" (close/page.tsx:122), "No fixed assets yet" (fixed-assets:113), "No variance data yet" (variance:359). Should be a shared `<EmptyState icon={X} title="..." description="..." action={<Button />} />`.

2. **`PageHeader`** — Most pages repeat `<h1>` + subtitle + action buttons. No shared component.

3. **`DateDisplay`** — `new Date().toLocaleString()` called 15+ times with inconsistent formatting.

4. **`ConfirmButton`** — Several pages combine button + confirmation logic inline.

---

## IV. STATE MANAGEMENT ARCHITECTURE

### Loading States — Inconsistent

- **Pattern A (most pages):** `if (isLoading) return <Loader2 className="w-6 h-6 animate-spin" />` — generic centered spinner with no content placeholders
- **Pattern B (DataTable):** Built-in `loading` prop renders pulse-animated skeleton rows — well-designed but only available in DataTable
- **Pattern C (Skeleton.tsx):** `PageSkeleton`, `TableSkeleton`, `CardSkeleton` — **built but never imported anywhere**

### Error States — Minimal

- `ErrorBoundary` wraps only 2 places (global providers + session layout). No page-level boundaries.
- A single component error in any close page crashes the entire session layout.
- Mutations use `toast.error()` from sonner. No explicit `onError` handlers on most queries.

### React Query Patterns — Generally Good

30 query files with 202 combined hooks and 75 `invalidateQueries` calls:
- Consistent `STALE_TIME = 30_000` (30s) across most queries
- Well-structured query keys: `['close-session', sessionId]`
- Mutations properly invalidate related queries
- `enabled` guards prevent queries from firing without required IDs
- No global error handler configured (queries fail silently)

### Responsive Architecture — Desktop Only

- **38 total responsive breakpoint usages** across 26 files — extremely low
- **Sidebar is not responsive:** Fixed 240px, no hamburger, no collapse. Unusable below ~1024px.
- **DataTable clips on narrow viewports** (overflow-hidden instead of overflow-x-auto)
- **Zero `md:hidden` / `hidden md:` patterns** — no mobile-specific layout
- **Portfolio page is marginally tablet-usable** (no sidebar on that route, overflow-x-auto on table)
- Print support exists (`print:hidden` on sidebar/topbar, `print:pl-0` on content)

---

## V. COMPETITIVE UX GAPS

### BlackLine User Reviews (G2/TrustRadius)

**Praised:** Account reconciliation automation, journal entry management, task tracking for month-end close, customer support.

**Criticized:** Complex/time-consuming setup and implementation, confusing navigation around data sources, cumbersome permissions management, multi-currency workarounds, many workflows still labor-intensive.

### FloQast User Reviews (G2/TrustRadius)

**Praised:** Intuitive interface for multi-task management, close process automation with SOX compliance, workload analysis/deadline tracking, centralized document repo, team collaboration.

**Criticized:** High pricing at scale, slow performance during critical close periods, complex implementation, limited editing (can't edit posted comments), weak customer support.

### 5 Patterns Where Sabit Is Demonstrably Better

| # | Pattern | Sabit Advantage | Competitor Gap |
|---|---------|----------------|----------------|
| 1 | **Zero-Setup Mapping Intelligence** | AI auto-mapping + prior period carry-forward means month 2 is near-zero-setup | Both criticized for complex implementation |
| 2 | **Statement Generation** | One-click generation of 4 GAAP statements | Neither generates statements — they only track tasks |
| 3 | **Mathematically Verified Close** | Ed25519 cryptographic signing + public verification page | No competitor offers mathematical proof of close integrity |
| 4 | **Batch Reconciliation** | Spreadsheet-like batch mode with Tab/Enter auto-save and live variance | FloQast users complain about tedious per-account workflows |
| 5 | **AI-Drafted Variance Explanations** | "Draft All Explanations" generates commentary for all material variances at once | Both require manual variance commentary — the most time-consuming narrative task |

---

## VI. PERSONA TIMING ANALYSIS

### Controller Workflow: 79 GL Accounts, Complete Close

| Step | Page | Est. Time | Est. Clicks | Notes |
|------|------|-----------|-------------|-------|
| 1. GL Upload | OpenStateDashboard | 2-3 min | 3-4 | Drag-and-drop, auto-column detection |
| 2. Account Mapping | mapping/page.tsx | 5-15 min (1st) / 1-2 min (repeat) | 5-15 | Auto-map + bulk accept high-confidence |
| 3. Reconciliation | reconciliation/page.tsx | **30-60 min** | 40-80 | **LONGEST STEP** — batch mode helps |
| 4. Adjusting Entries | adjustments/page.tsx | 15-25 min | 15-25 | Template carry-forward saves time |
| 5. Statement Generation | statements/page.tsx | 1-2 min | 1-2 | **AHA MOMENT** — one click |
| 6. Variance Analysis | variance/page.tsx | **15-30 min** | 10-20 | AI draft all saves massive time |
| 7. Review & Certify | review/page.tsx | 5-10 min | 5-8 | Gate checklist + certification |
| **TOTAL** | | **73-145 min** | **79-154** | **1.2-2.4 hours per close** |

### Three Longest Steps — Improvement Proposals

**1. Reconciliation (30-60 min) — Biggest Opportunity**
- Add CSV/Excel import for supporting balances (controllers have bank/subledger spreadsheets already)
- Auto-populate from prior period when balance is unchanged (equity accounts, fixed assets)
- One-click "mark as reconciled" for accounts where GL = supporting balance exactly (zero variance)

**2. Variance Analysis (15-30 min)**
- Auto-save explanations on debounce instead of requiring "Save" click per variance
- Keyboard navigation: after saving one explanation, auto-expand next unexplained variance
- Pre-fill immaterial-to-material variances with template text

**3. Adjusting Entries (15-25 min)**
- "Save and Post" shortcut for single-person entities (skip propose → approve → post)
- "Clone from last period" for one-off entries that recur but aren't templated
- Show running adjusted TB impact as entries are created

### First-Time User Experience

**Aha Moment:** Statement generation (Step 5) — seeing four complete GAAP statements generated from one click. **Problem:** Takes 50-100 minutes to reach.

**Recommendation:** Create a "demo close" or "sample data" option that lets evaluators generate statements from pre-loaded data in <60 seconds. Let them experience the magic immediately, then understand the pipeline.

**Onboarding Issues:**
- The 7-step OnboardingWizard has 2 dead steps (TB step says "skip for now"; Statements step is purely informational)
- After onboarding "Complete", user goes to `/` with no bridge to "now create your first close session"
- No in-context help, tooltips, or `?` help icons anywhere in the app
- Step labels use `text-[9px]` and `text-[10px]` — below legibility threshold

### Expert User Efficiency

**Keyboard Shortcuts:** Virtually none exist. Only Enter/Escape handlers on specific inputs.

**Missing:**
- Ctrl+K for quick navigation
- Ctrl+N for new journal entry
- Ctrl+S for save
- Arrow keys for variance navigation
- Ctrl+1 through Ctrl+7 for pipeline step jumps

**Batch Operations:** Some exist (batch recon, bulk accept mappings, draft all explanations, apply all templates), but missing:
- Bulk approve journal entries
- Bulk approve variance explanations
- Multi-select in any table
- Select-all pattern

**Smart Defaults (Good):**
- Mapping rules persist across sessions
- AJE templates carry forward
- Period dates default to prior month

**Missing Learning:**
- No "this account was reconciled by [person] last month" suggestion
- No "last month this step took X minutes" benchmark
- No "your close cycle improved from 8 days to 5 days" trend
- No saved filter/sort preferences per user

---

## VII. ACCESSIBILITY AUDIT

### Contrast Failures

**272 instances of gray-on-dark text** across 22 files:

| Pattern | Contrast Ratio | WCAG AA | Files |
|---------|---------------|---------|-------|
| `text-gray-400` on dark bg | ~5.5:1 | Pass for large text, **fail at text-[10px]** | 15 files |
| `text-gray-500` on dark bg | ~3.5:1 | **FAIL** at all sizes | 18 files |
| `text-gray-600` on dark bg | ~2.5:1 | **FAIL** at all sizes | 12 files |
| `text-gray-700` on dark bg | ~1.8:1 | **SEVERE FAIL** | OnboardingWizard |

### Font Size Violations

`text-[10px]` used for financial data in: OnboardingWizard, FundControllerDashboard (KPI labels), ReviewerDashboard (cert hashes), mapping/page.tsx (confidence bands). This is ~7.5pt — below minimum legible size for many users, especially the target demographic (controllers, age 35-55, long hours).

`text-xs` (12px) used **405 times across 68 files** — acceptable per WCAG but pushes readability limits for dense financial data.

### ARIA and Semantics

**30 aria attributes across 16 files** — minimal but partially present:

**Good:**
- `SlideOverPanel`: `role="dialog"`, `aria-modal`, `aria-labelledby`
- `ConfirmDialog`: `role="dialog"`, `aria-modal`, `aria-labelledby`
- Variance expand buttons: `aria-label={isExpanded ? 'Collapse' : 'Expand'}`

**Missing:**
- No `aria-sort` on DataTable sorted columns
- No `scope="col"` on `<th>` elements
- No `aria-live` regions for toast notifications
- No `aria-busy` on loading states
- No `aria-describedby` linking inputs to errors
- DataTable clickable rows have no `role="button"` or `tabIndex` (close/page.tsx does this correctly — should be in DataTable itself)

### Focus Trap — ABSENT

- `SlideOverPanel` focuses first element on open but does **not** trap focus — Tab escapes to content behind overlay
- `ConfirmDialog` handles Escape but has no focus management
- Raw dialogs in `adjustments/page.tsx` (line 444-460) and `dashboard/page.tsx` (line 278-309) have no ARIA, no focus management

### Color-Only Indicators

- Variance direction: green/red text only (no icon/text alternative)
- Reconciliation tolerance: red/green only (MoneyCell shows number, but pass/fail is color-only)
- Pipeline step status: uses color + icons (Check/Circle) — partially accessible

### Form Labels — Mixed

**Properly labeled:** Login, Onboarding entity setup, Close session creation, Variance textarea

**Placeholder-only (no label):** Consolidation inputs (6+), Fixed Assets inputs (6), FX Translation inputs (3), FilterBar search, Reconciliation batch mode inputs

---

## VIII. TOP 15 STRUCTURAL IMPROVEMENTS

Ordered by impact on demo readiness and overall product quality.

### Tier 1: Critical for Demo (Do First)

| # | Fix | Impact | Effort | Files |
|---|-----|--------|--------|-------|
| 1 | **Eliminate remaining money format violations** — Replace all `Intl.NumberFormat` and `toLocaleString` in GLUploadFlow, TBUploadFlow, OperatingPartnerDashboard, FundControllerDashboard, fx-translation, consolidation, StatementTable, variance/page.tsx lines 287-289, settings/templates with `fmtMoney`/`MoneyCell` | Financial data displayed inconsistently. Some paths convert decimal strings to Number(), violating project safety rules. Demo evaluators will notice $1,234 vs $1,234.56 vs (1,234.56) | S | 10 files |
| 2 | **Add `overflow-x-auto` to DataTable** — Change `overflow-hidden` to `overflow-x-auto` at DataTable.tsx line 86 | 11 pages using DataTable will clip financial columns on narrower viewports. During demo on a projector (typically 1280px), wide tables will lose rightmost columns | XS | 1 file, 1 line |
| 3 | **Replace all raw hex colors and `text-gray-*` with design tokens** — 328 raw hex values + 326 `text-gray-*` usages across ~25 files | Visual inconsistency destroys polish. The landing page has a cohesive dark theme; the app has 650+ off-palette colors. Focus on the 6 worst files first: OnboardingWizard, verify, FundControllerDashboard, ReviewerDashboard, OperatingPartnerDashboard, AIInsightsPanel | L | 25 files |
| 4 | **Add keyboard shortcut system** — At minimum: Ctrl+K for quick navigation overlay, arrow keys in variance list to move between items | Expert controllers (Sarah Chen, 6th monthly close) have zero keyboard efficiency tools. BlackLine and FloQast are criticized for being slow — keyboard shortcuts are a demo-visible differentiator | M | New component + integration |
| 5 | **Create demo/sample data mode** — Pre-loaded GL with 79 accounts, prior period data, some mappings already done. New user reaches statement generation in <60 seconds | The aha moment (seeing 4 GAAP statements generated) takes 50-100 minutes to reach. Every demo, investor meeting, and evaluation trial suffers this delay | M | New route + seed data |

### Tier 2: High Impact, Medium Effort

| # | Fix | Impact | Effort | Files |
|---|-----|--------|--------|-------|
| 6 | **Promote "Review & Certify" when UNDER_REVIEW** — Surface a prominent card/link at the top of the sidebar when session state is UNDER_REVIEW | CFO's primary action buried as 5th item in 4th group. David Park should see his one job immediately | S | Sidebar.tsx |
| 7 | **Adopt StatusBadge everywhere** — Replace 18+ inline badge patterns with the existing `StatusBadge` component | Inconsistent badge styling across trial-balance, reconciliation, mapping, board-package. Shared component already exists but is used in only 6 of 24+ locations | M | 12 files |
| 8 | **Create shared EmptyState component** — Icon + title + description + optional CTA button. Replace per-page empty state implementations | Empty states vary from helpful ("Upload a GL to see health analysis") to unhelpful (DataTable's "No data"). Consistent component improves perceived polish | S | New component + 15 files |
| 9 | **Fix focus trap in modals** — Add focus trap to SlideOverPanel and ConfirmDialog. Add ARIA to raw dialogs in adjustments and dashboard | WCAG violation. Keyboard users cannot navigate modals properly. Tab escapes to content behind overlay | S | 4 files |
| 10 | **Fix contrast failures** — Replace `text-gray-500/600/700` on dark backgrounds with `text-text-secondary` (passes AA). Eliminate `text-[10px]` and `text-[9px]` (use `text-xs` minimum) | 272 contrast violations. text-gray-700 on dark bg has 1.8:1 ratio (WCAG requires 4.5:1). Onboarding step labels nearly invisible | M | 22 files |

### Tier 3: Important, Lower Urgency

| # | Fix | Impact | Effort | Files |
|---|-----|--------|--------|-------|
| 11 | **Add CSV import for reconciliation supporting balances** — Let controllers upload a spreadsheet of account balances instead of typing each one | Saves 20-40 minutes per close on the single longest workflow step. Controllers already have bank/subledger exports | M | reconciliation/page.tsx |
| 12 | **Delete dead Skeleton components or adopt them** — Either remove `Skeleton.tsx` (0 imports) or replace all `Loader2` spinners with content-shaped skeletons | Dead code or missed opportunity. Content-shaped loading states (cards, tables) look significantly more polished than generic spinners | S-M | Skeleton.tsx + 15 pages |
| 13 | **Add page-level ErrorBoundary** — Wrap each page route in an ErrorBoundary so a single component error doesn't crash the entire session layout | Currently only 2 ErrorBoundary instances exist. A JS error in any close page crashes the sidebar + topbar + all content | S | layout.tsx |
| 14 | **Fix onboarding dead steps** — Remove or activate the "Trial Balance" and "Statements" onboarding steps that do nothing actionable | 2 of 7 onboarding steps add friction without value. "Trial Balance" says "skip for now." "Statements" shows 4 boxes with no interaction | S | OnboardingWizard.tsx |
| 15 | **Add responsive sidebar collapse** — Hamburger menu on <1024px, collapsed icon-only mode on tablets | Sidebar consumes 23% of viewport on screens <1024px. Controllers checking close status on phones/tablets cannot use the app. Portfolio page works on tablet (no sidebar) but close pages don't | M | Sidebar.tsx + layout.tsx |

### Effort Key
- **XS:** < 30 minutes, 1 file
- **S:** 1-2 hours, 1-4 files
- **M:** 3-8 hours, 5-15 files
- **L:** 1-2 days, 15+ files

---

## IX. SUMMARY METRICS

| Metric | Current | Target |
|--------|---------|--------|
| Money formatting patterns | 7 | 1 (fmtMoney/MoneyCell) |
| Raw hex colors in .tsx | 328 | 0 |
| text-gray-* bypassing tokens | 326 | 0 |
| Inline badge duplicates | 18+ | 0 (use StatusBadge) |
| Dead shared components | 4 (Skeleton exports) | 0 |
| WCAG AA contrast failures | 272 instances | 0 |
| Focus trap implementations | 0 | All modals/dialogs |
| Keyboard shortcuts | 0 | 5+ (Ctrl+K, arrows, Ctrl+S, Ctrl+N, Escape) |
| Responsive breakpoint usages | 38 | 200+ |
| Pages using DataTable | 11 of 23 tables | 18+ (StatementTable and specialized tables exempt) |
| Time to aha moment (new user) | 50-100 min | <60 seconds (demo mode) |
| Controller close time (79 accounts) | 73-145 min | 45-90 min (with improvements) |
