# Blind Frontend Code Review: Sovereign CPA Engine (Sabit)

**Reviewer**: Senior Frontend Developer (cold review, no prior context)
**Date**: 2026-03-13
**Codebase**: Next.js 14 + React 18 + TypeScript + Tailwind CSS
**Total Files Analyzed**: 118 .tsx components, 36 query modules, 25 type definition files

---

## Executive Summary

This is an **impressively well-architected financial application** for a mid-market product. The codebase demonstrates genuine domain expertise in financial software: money is never converted to JavaScript floats for computation, there is a disciplined separation between backend arithmetic and frontend display, and the design token system is comprehensive. The shared component library (40 components) is well-stocked and consistently used. The main weaknesses are oversized page components (14 files exceed 500 lines, the largest at 1,474), some inconsistency in how base URLs are resolved across the codebase, and limited accessibility coverage outside of modal components.

**Overall Grade: B+**

---

## 1. ARCHITECTURE -- Grade: A-

**Framework**: Next.js 14.2.3 with App Router, React 18.2, TypeScript 5.3 (strict mode)

**Strengths**:
- Clean App Router layout hierarchy: `app/layout.tsx` (root) > `app/close/[sessionId]/layout.tsx` (session shell) > individual page components. This is textbook Next.js architecture.
- Provider composition is well-ordered in `app/providers.tsx` (lines 9-22): ThemeProvider > AuthProvider > QueryClientProvider > ErrorBoundary. The QueryClient is created via `useState` to avoid re-creation on re-renders -- correct pattern.
- React Query configured with sensible defaults: 30s stale time, 1 retry, refetch on window focus (`app/providers.tsx:11`).
- `TrialBalanceProvider` context at the session layout level (`app/close/[sessionId]/layout.tsx:217-219`) provides shared trial balance state to all child pages without prop drilling.
- Route protection is handled at the layout level (`app/close/[sessionId]/layout.tsx:93-102`) using role-based visibility checks -- prevents unauthorized route access.
- Sidebar collapse state persisted to localStorage with keyboard shortcut (Ctrl+B) and responsive auto-collapse (`layout.tsx:50-59`).

**Weaknesses**:
- The `app/close/[sessionId]/layout.tsx` has 6 separate `useEffect` hooks (lines 50-108). These could be consolidated or extracted into custom hooks. The `useKeyboardShortcuts` hook exists in `hooks/` but is not used here -- the layout manually adds keyboard event listeners instead.
- No middleware.ts for auth -- route protection is client-side only. An unauthenticated user would momentarily see protected pages before being redirected.

**State Management**: React Query for server state, React Context for auth/theme/trial-balance. No additional state library needed for this complexity level -- good decision.

**Data Fetching**: Centralized `apiFetch<T>()` function in `lib/api.ts` with typed generics. Query hooks in `lib/queries/` provide the data layer.

---

## 2. COMPONENT REUSE -- Grade: A-

**Shared Component Library** (40 components in `components/shared/`):

| Component | Purpose | Quality |
|-----------|---------|---------|
| `MoneyCell.tsx` | Financial number display with GAAP formatting | Excellent |
| `DataTable.tsx` | Generic sortable table with expandable rows | Good |
| `FinancialTable.tsx` | Specialized financial table with grouping/subtotals | Good |
| `StatusBadge.tsx` | Status indicators with config-driven styling | Excellent |
| `SlideOverPanel.tsx` | Slide-over drawer with focus trap | Good |
| `ConfirmDialog.tsx` | Confirmation modal with severity levels | Good |
| `MoneyInput.tsx` | Money input with formatting | Good |
| `ErrorBoundary.tsx` | Class-based error boundary | Good |
| `FilterBar.tsx`, `SearchableSelect.tsx` | Form controls | Good |
| `PipelineStepper.tsx`, `GateIndicator.tsx` | Process visualization | Good |
| `EmptyState.tsx`, `Skeleton.tsx` | Loading/empty states | Good |
| `FileUploadZone.tsx`, `EvidenceAttachment.tsx` | File handling | Good |

**Reuse Evidence**:
- `MoneyCell` is the canonical money display component. The `fmtMoney()` function from `lib/money.ts` is called 64 times across 25 files. Almost all money formatting goes through the centralized pipeline.
- `StatusBadge` uses a config-driven pattern (`STATUS_CONFIG` record on lines 31-74) that prevents ad-hoc badge implementations. Legacy variant support is maintained via `LEGACY_MAP` for backward compatibility.
- `DataTable` and `FinancialTable` provide two table abstractions: one for general data, one for financial reporting. This is a thoughtful split.
- `SlideOverPanel` and `ConfirmDialog` both use `focus-trap-react` for modal focus management.

**Inline badge count**: Only 1 instance of inline `rounded-full text-xs px-2` badge pattern found. The `StatusBadge` component is used consistently.

**Issue**: The sidebar badge rendering (`components/shell/Sidebar.tsx`, lines 251-289) has repetitive inline badge markup for different badge types. This could be extracted into a reusable `SidebarBadge` component.

---

## 3. API INTEGRATION -- Grade: B+

**Centralized API Client** (`lib/api.ts`):
- Generic `apiFetch<T>()` with typed responses
- Configurable base URL via `NEXT_PUBLIC_API_URL` env var with localhost fallback
- JWT Bearer token from auth context via getter function pattern
- 401 handling triggers global auth expired handler
- Custom `ApiError` class with status code and error code
- Separate `apiUpload<T>()` for multipart/form-data uploads

**Query Layer** (`lib/queries/` -- 36 files):
- Consistent pattern across all query files: `useQuery` with `queryKey`, `queryFn`, `enabled` guard, and 30s `staleTime`
- Adapter functions (e.g., `toReconciliation()`, `toTrialBalanceRow()`) normalize backend responses to frontend types
- Mutations use `useMutation` with `queryClient.invalidateQueries()` for cache busting

**Critical Issue -- Inconsistent Base URL Resolution**:

| File | Base URL | Port |
|------|----------|------|
| `lib/api.ts:45` | `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'` | 3001 |
| `lib/auth.tsx:36` | `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'` | 3001 |
| `lib/queries/export.ts:5` | `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'` | **3000** |
| `app/register/page.tsx:8-9` | `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'` | 3001 |

The `export.ts` query file defaults to port **3000** while everything else defaults to **3001**. This will silently fail in development if only `localhost:3001` is running.

**Second Issue -- Bypassing `apiFetch()`**:
Several page components make direct `fetch()` calls instead of using the centralized client:
- `app/close/[sessionId]/audit-binder/page.tsx:393` -- direct fetch for export
- `app/close/[sessionId]/variance/page.tsx:276` -- constructs its own base URL
- `app/close/[sessionId]/statements/page.tsx:362` -- direct fetch for PDF export
- `app/close/[sessionId]/reconciliation/page.tsx:746` -- direct fetch
- `app/close/[sessionId]/review/CertificationRecord.tsx:64,100` -- direct fetch (2 instances)

These bypass error handling, auth token management, and 401 interception.

---

## 4. TYPE SAFETY -- Grade: A-

**TypeScript Config**: Strict mode enabled (`tsconfig.json:7`). Incremental compilation. Path alias `@/*` for clean imports.

**`any` Usage**: Only **8 occurrences** across 4 files. This is remarkably low for a 118-component codebase.
- `lib/queries/budget.ts` -- 2 uses (lazy typed API responses)
- `lib/queries/ebitda.ts` -- 1 use
- `components/shared/FinancialTable.tsx` -- 4 uses (generic render function type, `textAlign as any` cast)
- `app/close/[sessionId]/fx-translation/page.tsx` -- 1 use

**Type Definition Files** (25 files in `lib/types/`):
- Financial types use `string` for all money values with JSDoc comments like `/** Decimal string from backend -- never convert to JS number */` (`lib/types/trial-balance.ts:9-14`). This is a critical design decision documented directly in the types.
- Union types for statuses: `ReconStatus`, `MappingStatus`, `VarianceExplanationStatus`, `AccountType`
- Exhaustive type for reconciling item types (16 variants in `lib/types/reconciliation.ts:3-19`)

**Adapter Pattern** (`lib/adapters.ts`, `lib/queries/*.ts`):
- Backend responses are explicitly mapped to frontend types in adapter functions like `toCloseSession()`, `toTrialBalanceRow()`, `toReconciliation()`. This prevents type leakage from API responses.
- Uses `Record<string, unknown>` for raw API responses (90 occurrences across 27 files) rather than `any` -- correct defensive typing.

**Minor Issue**: The `FinancialTable` component uses `Record<string, any>` for row data (lines 20-30). This loses type safety for consumers. A generic type parameter would be better.

---

## 5. PERFORMANCE -- Grade: B

**Positive**:
- React Query provides caching with 30s stale time across all queries
- `useMemo` and `useCallback` used in 30+ files (162 total instances)
- `FinancialTable` row component is extracted as a separate `FinancialTableRow` function to enable potential memoization
- Font loading uses `display: 'swap'` for all 3 fonts (`app/layout.tsx:10,17,23`)
- Dark mode theme script injected before React hydration to prevent FOUC (`app/layout.tsx:44-47`)
- CSS custom properties for theming avoids runtime style recalculation

**Concerns**:

**14 files exceed 500 lines** (many over 700-1000):

| File | Lines | Issue |
|------|-------|-------|
| `app/portfolio/consolidated/page.tsx` | 1,474 | Largest file -- likely mixing data, logic, rendering |
| `app/close/[sessionId]/gl-quality/page.tsx` | 1,371 | Same pattern |
| `app/close/[sessionId]/dashboard/page.tsx` | 1,318 | Same pattern |
| `app/close/[sessionId]/review/page.tsx` | 1,147 | Same pattern |
| `app/close/[sessionId]/trial-balance/page.tsx` | 1,090 | Same pattern |
| `app/close/[sessionId]/reconciliation/[reconId]/page.tsx` | 1,064 | Same pattern |

These page components are "God components" -- they handle data fetching, business logic, and rendering in a single file. At 1,000+ lines, they become difficult to maintain and test.

- `FinancialTableRow` is NOT wrapped in `React.memo()` despite being a list item component rendered in a loop (`FinancialTable.tsx:309`). For large financial tables (100+ rows), this means every sort or selection change re-renders all rows.
- No code splitting via `dynamic()` imports. All 118 components load eagerly. The specialized modules (Fixed Assets, Deferred Tax, Stock Compensation, Impairment, Segments, FX Translation, Consolidation) are rarely accessed but still loaded.
- The `standalone` output mode is commented out in `next.config.js:4` -- Docker deployments include the full `node_modules`.
- No image optimization configuration in `next.config.js`.

---

## 6. CODE ORGANIZATION -- Grade: B+

**Directory Structure**:
```
app/                  # Next.js App Router pages
  close/[sessionId]/  # 20+ sub-routes for close workflow
  portfolio/          # Portfolio views
  settings/           # Settings pages
  login/, register/   # Auth pages
components/
  shared/             # 40 reusable components
  shell/              # Layout shell (Sidebar, TopBar, etc.)
  dashboards/         # Role-specific dashboards
  auth/               # Auth-related components
  close/              # Close-specific components
  ingest/             # Data ingestion components
  investigation/      # Investigation components
hooks/                # Custom hooks (only 1: useKeyboardShortcuts)
lib/
  api.ts              # API client
  auth.tsx            # Auth context
  money.ts            # Money formatting (pure string manipulation)
  format.ts           # Formatting utilities
  permissions.ts      # Role-based permissions
  adapters.ts         # Backend-to-frontend adapters
  utils.ts            # General utilities (cn, date helpers)
  types/              # 25 type definition files
  queries/            # 36 React Query hook files
styles/
  tokens.css          # Design tokens (light + dark)
  typography.css      # Typography styles
```

**Strengths**:
- File naming is consistent: PascalCase for components, kebab-case for types and queries
- Clear separation: types in `lib/types/`, queries in `lib/queries/`, shared components in `components/shared/`
- Role-based permissions centralized in `lib/permissions.ts` with 20+ capability functions
- Design tokens in `styles/tokens.css` with complete light/dark theme coverage (130+ CSS custom properties)

**Weaknesses**:
- Only 1 custom hook (`useKeyboardShortcuts.ts`). The keyboard shortcut logic in `app/close/[sessionId]/layout.tsx` duplicates this functionality instead of using it.
- No `__tests__/` directory found anywhere. No test files at all.
- Page components in `app/close/[sessionId]/` embed sub-components (e.g., `GLUploadFlow.tsx`, `OpenStateDashboard.tsx`, `StatementTable.tsx`) as sibling files rather than in a dedicated sub-directory. This is acceptable for small counts but becomes messy as pages grow.
- No barrel exports for `components/shared/` -- each component must be imported individually.

---

## 7. DATA FLOW (Financial Data) -- Grade: A

This is the strongest area of the codebase.

**Philosophy** (documented in `lib/money.ts:1-8`):
> "Money values are STRINGS throughout the frontend. They arrive from the API as strings (Decimal.js serialized). They display as strings. They NEVER become JavaScript Numbers for financial computation."

**Implementation**:
- `fmtMoney()` (`lib/money.ts:16-56`) formats money using **pure string manipulation** -- no `Number()` or `parseFloat()` in the formatting path. It splits on `.`, pads decimals, adds commas via regex, and wraps negatives in parentheses. This is exactly correct for GAAP financial display.
- `toMoneyString()` (`lib/money.ts:118-130`) coerces API values to money strings. Handles `null`, `undefined`, empty strings, and legacy `number` types.
- Every adapter function (e.g., `toTrialBalanceRow()` in `lib/queries/trial-balance.ts:10-31`) passes money fields through `toMoneyString()` during normalization.
- Type definitions annotate money fields with JSDoc: `/** Decimal string from backend -- never convert to JS number */` (`lib/types/trial-balance.ts:9`).

**Where `parseFloat()` IS used** (55 occurrences) -- all explicitly marked:
- `cmpMoney()` for UI sorting only, with comment: "Uses parseFloat -- acceptable for ordering, NOT for financial computation" (`lib/money.ts:61`)
- `sumMoneyStrings()` for display-only totals, with comment: "Uses parseFloat internally -- acceptable because this is visual-only" (`lib/money.ts:97-100`)
- `MoneyCell.computeVariance()` for percentage display only (`components/shared/MoneyCell.tsx:30-31`)
- `FinancialTable` grand total calculation (`components/shared/FinancialTable.tsx:270-274`)

**Edge case handling in `fmtMoney()`**:
- `null`, `undefined`, `'null'`, `'undefined'`, empty string -> dash or zero
- Already-formatted input (with `$`, commas, parentheses) is stripped before re-formatting
- Zero detection handles `'0'`, `'0.00'`, `'-0'`, `'-0.00'`
- Negatives shown in GAAP parentheses: `(1,234.56)`, optionally with dollar sign: `$(1,234.56)`

**`toFixed()` usage** (35 occurrences across 17 files): All in display-only contexts (formatting for `MoneyInput` blur, variance percentage display, display-only sums). None in financial computation paths.

**Minor concern**: `sumMoneyStrings()` in `lib/money.ts:102-112` uses `parseFloat` accumulation which can introduce floating-point drift over many values. For a visual-only sum this is acceptable, but the comment should note the precision limitation for large datasets.

---

## Top 10 Code Quality Risks

### 1. **Inconsistent Base URL in `lib/queries/export.ts`** (Severity: High)
Port 3000 vs 3001 fallback will cause silent failures in development.
File: `lib/queries/export.ts:5`

### 2. **6 direct `fetch()` calls bypassing `apiFetch()`** (Severity: High)
These bypass auth token management, error handling, and 401 interception. If a token expires during an export, the user gets a cryptic error instead of being redirected to login.
Files: `audit-binder/page.tsx:393`, `variance/page.tsx:276`, `statements/page.tsx:362`, `reconciliation/page.tsx:746`, `CertificationRecord.tsx:64,100`

### 3. **No test files anywhere** (Severity: High)
Zero test coverage. The `package.json` has no test runner configured. For a financial application handling GAAP-compliant data, `fmtMoney()`, `parseMoney()`, and the adapter functions are high-value test targets.

### 4. **14 page components exceed 500 lines** (Severity: Medium)
God components mixing data fetching, business logic, and rendering. The `consolidated/page.tsx` at 1,474 lines is unmaintainable without extraction.

### 5. **No `React.memo()` on `FinancialTableRow`** (Severity: Medium)
Financial tables can have 100+ rows. Without memoization, every sort/select/expand action re-renders all rows. File: `components/shared/FinancialTable.tsx:309`

### 6. **No code splitting for specialized modules** (Severity: Medium)
Fixed Assets, Deferred Tax, Stock Compensation, Impairment, Segments, FX Translation, and Consolidation are used by a minority of users but loaded for all. `next/dynamic` should lazy-load these routes.

### 7. **Client-side-only auth protection** (Severity: Medium)
No `middleware.ts` for server-side auth checks. Protected pages flash briefly before redirect.

### 8. **Limited accessibility beyond modals** (Severity: Medium)
Only 8 of 40 shared components have `aria-*` or `role=` attributes (17 total ARIA attributes in shared components). The `DataTable` lacks `role="table"`, `role="row"`, `role="cell"` attributes. The `FinancialTable` has no ARIA attributes at all. Sidebar navigation lacks `nav` landmark `aria-label`.

### 9. **`FinancialTable` uses `Record<string, any>`** (Severity: Low)
Loses type safety for all consumers. Should use a generic type parameter like `DataTable<T>` does.

### 10. **Duplicate keyboard shortcut registration** (Severity: Low)
`app/close/[sessionId]/layout.tsx` registers Ctrl+B and Ctrl+K via raw `addEventListener` (lines 62-90) despite `hooks/useKeyboardShortcuts.ts` existing for this exact purpose.

---

## What the Codebase Does Well

1. **Financial data integrity**: The "money as strings" discipline is exceptional. The JSDoc annotations, the pure-string `fmtMoney()` implementation, and the explicit `parseFloat` annotations show genuine understanding of floating-point hazards in financial software.

2. **Design token system**: 130+ CSS custom properties in `styles/tokens.css` with complete dark theme. Components reference tokens via `var()` consistently. The Tailwind config maps semantic names to CSS variables. This is production-grade theming.

3. **Role-based access control**: `lib/permissions.ts` provides 20+ capability functions with separation of duties (SoD) enforcement. Sidebar visibility, settings access, and action permissions are all centralized. SoD checks like "cannot approve own journal entries" are enforced.

4. **Shared component library quality**: 40 shared components with consistent APIs. `MoneyCell` supports 4 variants, `StatusBadge` is config-driven, `ConfirmDialog` has 3 severity levels with text confirmation support. These aren't thin wrappers -- they encode real domain knowledge.

5. **API adapter pattern**: Every query file transforms raw API responses through typed adapter functions. This prevents backend schema changes from propagating through the UI. The `Record<string, unknown>` typing for raw responses is defensive and correct.

6. **Zero mock imports remaining**: A `grep` for `import.*from.*mock` returns zero results. The migration from mock data to real APIs is complete.

7. **Error handling architecture**: Custom `ApiError` class, centralized error messages in `getErrorMessage.ts` with user-friendly status-code-specific messages, `ErrorBoundary` at provider and layout levels, and an `AuthExpired` handler that protects against hydration race conditions.

8. **Sidebar UX polish**: Collapsible sidebar with persistent state, keyboard shortcut, responsive auto-collapse, role-based item visibility, badge counts from live data, promoted "Review & Certify" CTA during UNDER_REVIEW state, and collapsible navigation groups.

---

## Prioritized Recommendations

### P0 -- Fix Before Next Deploy

1. **Fix `lib/queries/export.ts` base URL** -- Change port 3000 to 3001 (or better: import `getBaseUrl` from `lib/api.ts` to eliminate duplication).

2. **Migrate direct `fetch()` calls to `apiFetch()`** -- Create `apiFetchBlob()` in `lib/api.ts` for the download use cases, then update the 6 files that bypass the centralized client.

### P1 -- Next Sprint

3. **Add tests for critical financial utilities** -- `fmtMoney()`, `parseMoney()`, `toMoneyString()`, `isMoneyZero()`, `isMoneyNegative()`, `sumMoneyStrings()`. These are pure functions -- test setup is trivial.

4. **Add `React.memo()` to `FinancialTableRow`** -- One-line change with significant performance impact for large tables.

5. **Extract God components** -- Start with the 6 files over 1,000 lines. Split into: data hook, business logic hook, presentational sub-components, and page orchestrator.

6. **Add `middleware.ts`** for server-side auth redirect -- prevents protected page flash and reduces client-side complexity.

### P2 -- Next Quarter

7. **Lazy-load specialized modules** -- Use `next/dynamic` for the 7 specialized module routes. These are behind "Specialized Modules" in the sidebar (collapsed by default) and used infrequently.

8. **Improve accessibility** -- Add `role` attributes to `DataTable` and `FinancialTable`. Add `aria-label` to sidebar navigation. Ensure all interactive elements have keyboard support.

9. **Consolidate keyboard shortcut handling** -- Use the existing `useKeyboardShortcuts` hook in the session layout instead of raw event listeners.

10. **Add barrel exports** for `components/shared/` -- reduces import boilerplate across the codebase.

---

## Summary Grades

| Area | Grade | Key Factor |
|------|-------|------------|
| Architecture | A- | Clean App Router hierarchy, good provider composition |
| Component Reuse | A- | 40 shared components, consistent usage |
| API Integration | B+ | Centralized client, but 6 bypass instances and port mismatch |
| Type Safety | A- | Strict mode, only 8 `any` uses, typed adapters |
| Performance | B | Good caching, but no memoization on list items, no code splitting |
| Code Organization | B+ | Clear structure, but oversized pages and no tests |
| Data Flow (Financial) | A | Best-in-class money handling with pure string formatting |

**Overall: B+** -- A well-built financial application with strong domain-specific engineering. The main investment needed is in testing, component decomposition, and performance optimization for large data sets.
