# SABIT UI DESIGN SYSTEM -- BLIND REVIEW

**Reviewer**: Senior UI Designer (cold review, no prior exposure)
**Date**: 2026-03-13
**Scope**: All .tsx, .ts, and .css files in `frontend/`
**Overall Design System Maturity**: B+

---

## EXECUTIVE SUMMARY

Sabit has a surprisingly mature design system for a product in active wiring-up phase. The foundation is strong: a comprehensive CSS custom property token system with full light/dark theme coverage, a thoughtful typography scale built for financial data, and a centralized money formatting utility that correctly avoids floating-point arithmetic. The weak points are a dual-pattern problem (some components use inline `style={{ ... var(--token) }}` while others use Tailwind config semantic classes), a handful of legacy components with hardcoded hex colors, and the certification ceremony -- while functional -- does not fully leverage the serif attestation typography or gold color palette defined in the tokens.

---

## PHASE 2: DETAILED ASSESSMENT

---

### 1. DESIGN TOKENS -- Grade: A

**File**: `styles/tokens.css` (212 lines)

**Token Count**: 106 custom properties across 12 categories:
- Backgrounds (15 tokens): base, surface, raised, sunken, overlay, nav, header, table, AI, certified
- Text (10 tokens): primary, secondary, tertiary, inverse, link, number, number-negative, number-total, AI label
- Borders (8 tokens): default, strong, subtle, focus, AI, table-header, total-single, total-double
- Interactive (9 tokens): primary/hover/pressed, secondary/hover, ghost/hover, destructive/hover
- Status (12 tokens): success/warning/error/info each with bg and border variants, plus neutral
- AI (6 tokens): primary, muted, bg, border, badge-bg, badge-text
- Certification (7 tokens): primary, secondary, gold, gold-light, bg, border, lock-icon
- Spacing (10 tokens): 4px grid from 4px to 64px
- Radii (4 tokens): sm/md/lg/xl
- Shadows (4 tokens): sm/md/lg/xl
- Transitions (3 tokens): fast/normal/slow
- Z-index (6 tokens): base through toast

**Dark Theme**: Complete. All 106 tokens remapped in `[data-theme="dark"]` block (lines 133-212). Shadows adjusted with higher opacity for dark backgrounds. AI purple shifts from deep to lighter violet. Certification green shifts from deep forest to bright emerald.

**Semantic Quality**: Excellent. Tokens are domain-specific, not generic:
- `--text-number-negative` (not `--color-red-700`)
- `--bg-certified` (not `--bg-green-50`)
- `--ai-badge-text` (not `--color-purple-800`)
- `--border-total-double` (not `--border-black`)

**Assessment**: This is a production-quality token system. The 12-category taxonomy covers the domain comprehensively. The naming convention is consistent (`--{category}-{semantic-name}`). The only missing piece: no token for `white` text on primary buttons (currently hardcoded as `'white'` or `'#ffffff'` in ~8 places).

---

### 2. COLOR CONSISTENCY -- Grade: B-

**Violation Counts**:

| Pattern | Count | Severity |
|---|---|---|
| Correct: `var(--token)` in TSX | 3,169 | -- |
| Correct: Tailwind semantic classes (`text-primary`, `bg-surface`, etc.) | 1,141 | -- |
| Tailwind raw color utilities (`text-red-500`, `bg-gray-200`, etc.) | 137 | Medium |
| Hardcoded hex in TSX (`#fff`, `#7C5CFC`, etc.) | 106 | High |
| Raw Tailwind colors (`text-gray-500`, `bg-blue-500`, etc.) | 117 | Medium |
| `bg-white` / `text-black` (theme-breaking) | 1 | High |
| `#ffffff` / `#000000` | 4 | High |

**Compliance Calculation**:
- Total color references: ~4,675
- Correct usage (var + semantic classes): ~4,310
- Violations: ~365
- **Compliance rate: ~92%**

**Worst Offender**: `components/shared/AgentActivityPanel.tsx` -- 25+ hardcoded hex colors (`#141829`, `#262C48`, `#7C5CFC`, `#0d1017`, `#1a1d2e`). This component appears to be a dark-mode-only widget that completely bypasses the token system. It will break in light theme.

**Second Worst**: `components/shared/AuditDefenseExport.tsx` -- same pattern, same hardcoded dark palette.

**Common Violation Pattern**: `color: '#fff'` on primary buttons instead of `color: 'var(--text-inverse)'` or using the `accent-contrast` Tailwind mapping. Found in:
- `statements/page.tsx` (lines 294, 414, 455)
- `variance/page.tsx` (lines 310, 334, 822)
- `adjustments/page.tsx` (line 565)

---

### 3. TYPOGRAPHY -- Grade: A-

**File**: `styles/typography.css` (192 lines)

**Font Stack**:
- Primary: Inter (400/500/600/700) via `next/font` with `--font-sans` variable
- Monospace: JetBrains Mono (400/500) via `next/font` with `--font-mono` variable
- Serif: Source Serif 4 (400) via `next/font` with `--font-serif` variable

**Type Scale**: 13 defined classes covering display, h1-h4, body, body-strong, table-header, table-cell, table-number, table-subtotal, table-total, caption, caption-strong, badge, mono, attestation.

**Financial Typography**:
- `font-variant-numeric: tabular-nums lining-nums` applied globally on `.font-mono`, `.tabular-nums`, and `[data-currency]` (globals.css line 26-29)
- `tabular-nums` usage count: 90 references across TSX and CSS files -- excellent coverage
- Sub-11px font sizes: 0 instances -- no readability violations
- `font-mono` usage: 190 instances -- heavily used for account codes, hashes, and financial data
- Table header font: 11px uppercase with 0.06em tracking -- proper GAAP presentation
- Accounting indentation: 4 levels (0/24/48/72px) defined in typography.css

**Assessment**: The typography system is well-designed for financial data presentation. The `type-attestation` class (Source Serif 4, 15px, 1.65 line-height) provides appropriate gravitas for certification text. One weakness: `MoneyCell.tsx` uses inline Tailwind classes (`text-[0.8125rem]`) rather than the CSS type classes (`type-table-number`), creating a parallel system. The MoneyCell does correctly apply `tabular-nums` and right-alignment.

---

### 4. FINANCIAL DATA PRESENTATION -- Grade: A

**MoneyCell Component**: `components/shared/MoneyCell.tsx` (104 lines)

**Formatting** (via `lib/money.ts`):
- Negative amounts: Parenthetical notation `(1,234.56)` -- correct GAAP convention
- Currency prefix: Optional `$` sign on subtotals/totals
- Zero display: Configurable dash `--` or `0.00`
- Null handling: Returns dash or `$0.00` based on context
- Decimal places: Always 2 (string slicing, never `toFixed()`)
- Comma grouping: Regex-based, no `Number()` conversion
- **Critical**: Money values stay as strings throughout. The comment at line 1-8 of `money.ts` is explicit: "They NEVER become JavaScript Numbers for financial computation."

**Variants**: 4 levels of hierarchy:
- `line-item`: 13px, normal weight
- `subtotal`: 13px, semibold, top border
- `total`: 14px, bold, top border
- `grand-total`: 14px, bold, double underline (via `border-total-double` CSS class)

**Alignment**: Right-aligned (`text-right block`), `tabular-nums lining-nums`, `letter-spacing: 0.01em` -- all correct for financial tables.

**Color Coding**:
- Negative: `var(--text-number-negative)` (red)
- Total/Grand-total: `var(--text-number-total)` (near-black)
- Zero/dash: `var(--text-tertiary)` (gray)

**Number() Usage**: Found in 18 places, all in non-financial contexts:
- Form inputs for fixed assets (cost, useful life), deferred tax (book basis, tax basis), FX rates, stock compensation shares -- these are form parsing, not financial computation. Backend performs actual arithmetic. Acceptable.

**Manual money formatting** (`toLocaleString`/`toFixed`): 92 references. Most are in `money.ts` itself (`toFixed(2)` for display-only sum) and CSV export formatting. The StatementTable uses `fmtMoney()` exclusively.

**Assessment**: This is the strongest area. The `fmtMoney()` function performs pure string manipulation with no floating-point intermediary for display formatting. The parenthetical negative notation, tabular-nums, right-alignment, and GAAP double-underline convention are all textbook.

---

### 5. AI CONTENT DISTINCTION -- Grade: A-

**Components**:
- `AISuggestionCard.tsx` (301 lines): Full-featured card with 5 states (loading, error, accepted, pending, legacy wrapper)
- `AISuggestionBadge.tsx` (35 lines): Inline badge component

**Visual Language**: Consistent purple + dashed border pattern:
- Border: `1.5px dashed var(--ai-border)` (purple dashed)
- Background: `var(--ai-bg)` (light lavender / dark deep purple)
- Badge: `var(--ai-badge-bg)` + `var(--ai-badge-text)` (purple chip)
- Icon: Sparkles from lucide-react, consistently used
- Label text: `var(--text-ai-label)` (deep purple)

**States**:
- **Pending**: Dashed purple border, lavender bg, "AI Suggested" badge with Sparkles icon
- **Loading**: Skeleton shimmer with AI colors
- **Accepted**: Solid border (drops to default), "Accepted (originally AI-suggested)" sub-label
- **Error**: Error state with retry option
- **Confidence**: Visual bar with color thresholds (>=90 purple, >=70 amber, <70 red with "LOW CONFIDENCE" badge)

**AI Icons**: Sparkles (primary), Brain (AI review page, discrepancies), Loader2 (generating states)

**Advisory Language**: Explicit "advisory only" positioning. The card shows model name, confidence percentage, GAAP citation, and reasoning -- allowing users to make informed decisions.

**Assessment**: The AI visual language is well-differentiated. The dashed border is a strong signal that content is machine-generated. The confidence bar with color breakpoints is excellent for financial use cases where AI suggestions require scrutiny. Minor gap: `AgentActivityPanel.tsx` uses hardcoded colors (`#7C5CFC`) instead of `var(--ai-primary)`, creating inconsistency.

---

### 6. CERTIFICATION CEREMONY -- Grade: B+

**File**: `app/close/[sessionId]/review/page.tsx` (lines 664-949)

**Ceremony Flow** (4 steps):
1. **Input**: Attestation text displayed, user must type `CERTIFY` (monospace input)
2. **Progress**: Spinning animation with "Certifying period... Validating ties and generating certification artifact"
3. **Complete**: Full-screen success overlay with seal, attestation, signatures, summary
4. **Error**: Error state with message

**Visual Treatment**:
- Seal: 64px circle with `3px double var(--cert-primary)` border, green checkmark icon
- Title: `CERTIFIED` in 30px display font, green (`var(--status-success)`)
- Attestation text: Source Serif 4 serif font, 15px, 1.65 line height, on `var(--bg-certified)` background, `var(--cert-primary)` text color -- this is the only place serif font is used for ceremony content
- Digital signatures: Ed25519 signature and SHA-256 hash displayed in mono font on sunken background
- Summary grid: 6 metric cards (Gates, Statements, Recons, AJEs, Variances, Evidence)
- A = L + E verification badge in green
- Actions: Download Certificate, View Board Package, Lock Period

**CertificationRecord.tsx** (309 lines): Post-certification persistent display with:
- Gold border (`border-2 border-certified`)
- Expandable signature and hash display
- Independent verification button (calls `/api/verification/certification/verify`)
- Audit binder export (PDF + JSON)
- Cross-statement validation results

**What Works Well**:
- Type `CERTIFY` confirmation is appropriate ceremony friction
- Serif font for attestation text provides gravitas
- Cryptographic proof displayed (signature, hash, public key)
- A = L + E verification badge

**What Could Be Better**:
- The seal uses `var(--status-success)` (green) rather than `var(--cert-gold)` -- the gold tokens exist but are barely used in the ceremony itself
- No `var(--cert-gold-light)` glow effect on the seal (shadow-glow-gold is defined in tailwind config but unused here)
- The completion state uses `var(--status-success)` for the CERTIFIED title, not the cert-specific green (`var(--cert-primary)`)
- Attestation text could use the `type-attestation` CSS class instead of inline style with `fontFamily: '"Source Serif 4", serif'`

---

### 7. DARK/LIGHT THEME -- Grade: B+

**Theme Infrastructure**:
- `ThemeProvider.tsx`: React context with `light`/`dark` toggle, localStorage persistence (`sabit-theme` key)
- Flash prevention: Inline `<script>` in `layout.tsx` reads localStorage before React hydrates
- Dual mechanism: Sets both `data-theme` attribute (for CSS vars) and `.dark` class (for Tailwind `dark:` variants)
- `TopBar.tsx`: Confirmed theme toggle exists in the shell

**Token Coverage**: All 106 tokens have dark variants. Dark theme is not an afterthought -- colors are carefully chosen (e.g., shadows get 3-5x higher opacity, success green shifts from `#15803D` to `#4ADE80`).

**Theme-Breaking Patterns**:
- `bg-white`: 1 instance (`PipelineStepper.tsx` line 87)
- `#ffffff` / `#fff`: ~8 instances, all for button text on primary backgrounds (should be `var(--text-inverse)`)
- `AgentActivityPanel.tsx`: ~25 hardcoded dark-mode colors that will look wrong in light theme
- `AuditDefenseExport.tsx`: ~10 hardcoded dark-mode colors

**Would Theme Switching Work?**: For 95% of the application, yes. The core flows (trial balance, statements, reconciliation, adjustments, review) all use tokens and would switch cleanly. The two agent/AI panel components would break.

---

### 8. VISUAL HIERARCHY -- Grade: B+

**Financial Statements** (`statements/page.tsx` + `StatementTable.tsx`):
- Headers: Center-aligned entity name in `text-lg font-display`, statement name in uppercase `text-sm font-medium`, period date in `text-sm` secondary color
- Section headers: Indent level 0, bold, no amount -- proper GAAP presentation
- Line items: Indented via `paddingLeft: ${indentLevel * 24}px`, normal weight
- Subtotals: Top border, semibold, dollar sign prefix
- Grand totals: `border-t-2 border-b-[3px] border-double`, bold, dollar sign prefix
- Negative amounts: Red (`text-status-red`)
- Budget variance: Green (favorable) / Red (unfavorable) color coding

**Trial Balance** (`trial-balance/page.tsx`):
- Sticky balance banner at top (green if balanced, red if not)
- Account type groups with collapsible headers
- Alternating row backgrounds (`bg-surface` / `bg-table-row-alt`)
- Hover state with `bg-table-row-hover`
- Account type chips with semantic background colors (assets=blue, liabilities=amber, revenue=green, expense=red, equity=purple)
- Drill-down with left border accent (`3px solid var(--interactive-primary)`)
- Sticky footer with grand totals

**Review Page**:
- 3-column grid for Financial Highlights / Activity Summary / Evidence Manifest
- Clear hierarchy: H1 display title, H2 section titles with icons, detail text in secondary color
- State-dependent UI: Different primary actions based on session state (Submit / Certify / Lock)

**What Works Well**: The indentation system, accounting underlines (single for subtotal, double for grand total), and sticky headers/footers create a professional financial document feel. The balance banner provides immediate visual feedback.

**What Could Be Better**: The StatementTable component uses mixed patterns -- some Tailwind classes reference the config (`text-primary`, `border-border`) while the parent page uses inline styles with `var()`. This creates maintenance overhead.

---

## VIOLATION SUMMARY

| Category | Count | Impact |
|---|---|---|
| Hardcoded hex colors in TSX | 106 | Theme-breaking in dark mode |
| Raw Tailwind color utilities | 254 | Bypasses token system |
| Hardcoded `white`/`#fff` on buttons | ~8 | Should use `--text-inverse` |
| `bg-white` / `text-black` | 1 | Theme-breaking |
| AgentActivityPanel hardcoded colors | ~25 | Component entirely off-system |
| AuditDefenseExport hardcoded colors | ~10 | Component entirely off-system |
| MoneyCell using inline sizes vs type classes | 1 component | Parallel typography system |
| Certification seal not using gold tokens | 1 component | Underutilizes defined tokens |

---

## TOP 10 VISUAL DESIGN ISSUES

1. **AgentActivityPanel.tsx completely bypasses the token system** -- 25+ hardcoded hex colors (`#141829`, `#7C5CFC`, `#262C48`). This component will look broken in light theme. Must be migrated to AI tokens.

2. **AuditDefenseExport.tsx same problem** -- hardcoded dark-mode palette. Same migration needed.

3. **Button text color `#fff` / `white` hardcoded in 8+ places** -- A `--text-inverse` token exists but is not used. Should be `color: 'var(--text-inverse)'` or mapped through Tailwind's `accent-contrast`.

4. **Dual styling pattern creates maintenance burden** -- Some components use `style={{ color: 'var(--text-secondary)' }}` while others use `className="text-text-secondary"` or `className="text-secondary"`. The codebase has BOTH patterns for the same semantic meaning. Should converge on one.

5. **MoneyCell does not use the CSS typography classes** -- `type-table-number`, `type-table-subtotal`, `type-table-total` exist in `typography.css` but `MoneyCell.tsx` recreates them with inline Tailwind (`text-[0.8125rem] font-normal leading-[1.385]`). These will diverge if the type scale changes.

6. **Certification seal uses success green instead of gold** -- `var(--cert-gold)` and `var(--cert-gold-light)` tokens are defined, plus `shadow-glow-gold` in tailwind config, but the certification seal at line 791-796 uses `var(--status-success)` and `var(--status-success-bg)`. The seal should be gold to feel like a formal certification.

7. **Attestation text uses inline fontFamily instead of CSS class** -- Line 809: `fontFamily: '"Source Serif 4", serif'` should use `className="type-attestation"` which is already defined in `typography.css` with the same font and optimized metrics.

8. **137 raw Tailwind color utility usages** -- `text-gray-500`, `text-red-500`, etc. These bypass the token system and will not respond to theme changes. Most are in older components.

9. **StatementTable mixing Tailwind config classes with inline styles** -- The same file uses `text-primary`, `border-border`, `text-status-red`, `bg-surface-alt/50` (Tailwind) alongside parent page using `style={{ color: 'var(--text-primary)' }}`. Should converge.

10. **No `prefers-reduced-motion` handling** -- The token system defines transitions but there is no `@media (prefers-reduced-motion: reduce)` rule. The certification spinner, skeleton animations, and hover transforms should respect user motion preferences.

---

## WHAT THE DESIGN SYSTEM DOES WELL

1. **Token taxonomy is domain-perfect** -- 106 tokens organized by function (backgrounds, text, borders, interactive, status, AI, certification). Financial-specific tokens like `--text-number-negative`, `--border-total-single`, `--border-total-double` show deep domain understanding.

2. **Money formatting is flawless** -- `fmtMoney()` in `lib/money.ts` does pure string manipulation. No `Number()` in the formatting path. Parenthetical negatives, comma grouping, dash for zero -- all GAAP-correct.

3. **Typography for financial data is thoughtful** -- `tabular-nums lining-nums` applied globally on money-related elements. Accounting underlines (single and double) implemented via CSS pseudo-elements. 4-level indentation system for financial statement hierarchy.

4. **Full dark theme with zero placeholders** -- Every token has a dark variant. Dark mode was designed, not generated. Shadow opacities increase 3-5x, colors shift to maintain contrast ratios, status colors adjust to work on dark backgrounds.

5. **AI content is visually distinct** -- Purple palette + dashed border + Sparkles icon + confidence bar creates a clear "this is AI-generated" signal. The accepted state explicitly labels content as "originally AI-suggested."

6. **Theme infrastructure prevents flash** -- Inline script in `<head>` reads localStorage before React hydrates, preventing the white flash that plagues most dark-mode implementations.

7. **Font loading is optimized** -- All three fonts loaded via `next/font/google` with `display: 'swap'` and CSS variables, ensuring no FOIT and proper fallback chains.

8. **Certification ceremony has appropriate friction** -- Type `CERTIFY` confirmation, attestation text in serif font, cryptographic proof display, A = L + E verification badge. The ceremony feels like signing a legal document.

9. **Accounting underlines implemented correctly** -- `border-total-double` uses a pseudo-element with 3px gap between lines, matching traditional GAAP presentation of grand totals.

10. **Z-index system prevents stacking conflicts** -- 6 levels from `--z-base` (0) to `--z-toast` (500) with clear semantic naming.

---

## PRIORITIZED RECOMMENDATIONS

### P0 -- Must Fix (Theme / Correctness)

1. **Migrate AgentActivityPanel.tsx to token system** -- Replace all 25+ hardcoded hex colors with AI and surface tokens. This component will break in light theme.

2. **Migrate AuditDefenseExport.tsx to token system** -- Same issue, same fix.

3. **Replace `#fff` / `white` with `var(--text-inverse)`** -- 8 instances across statements, variance, and adjustments pages. Add a `--text-on-primary` token if `--text-inverse` is not semantically right.

### P1 -- Should Fix (Consistency)

4. **Converge on one styling pattern** -- Pick either inline `style={{ color: 'var(--text-secondary)' }}` or Tailwind classes `text-secondary`. The Tailwind config already maps these. Recommendation: use Tailwind classes for the common cases, inline styles only for computed/dynamic values.

5. **MoneyCell should use typography CSS classes** -- Replace inline Tailwind sizes with `type-table-number`, `type-table-subtotal`, `type-table-total` class names.

6. **Eliminate 137 raw Tailwind color utilities** -- Audit and replace `text-gray-500` with `text-tertiary`, `text-red-500` with `text-status-red`, etc.

7. **Certification seal should use gold tokens** -- Replace `var(--status-success)` with `var(--cert-gold)` for the seal border and icon. Apply `shadow-glow-gold` for gravitas.

### P2 -- Nice to Have (Polish)

8. **Add `prefers-reduced-motion` media query** -- Disable transitions, animations, and transforms for users who request reduced motion.

9. **Use `type-attestation` class in certification ceremony** -- Instead of inline `fontFamily`.

10. **Add missing `--text-on-primary` token** -- For white text on interactive-primary buttons. Currently hardcoded as `white` in ~20 places.

11. **Create a `--color-white` token** -- For the 1 instance of `bg-white` and any future needs for a theme-aware "absolute white."

---

## GRADE SUMMARY

| Area | Grade | Notes |
|---|---|---|
| 1. Design Tokens | A | 106 tokens, 12 categories, full dark theme |
| 2. Color Consistency | B- | 92% compliance, but 35 hardcoded-hex violations in 2 components |
| 3. Typography | A- | Excellent financial type system, minor parallel pattern in MoneyCell |
| 4. Financial Data Presentation | A | GAAP-correct formatting, string-only money, parenthetical negatives |
| 5. AI Content Distinction | A- | Strong purple/dashed visual language, 1 off-system component |
| 6. Certification Ceremony | B+ | Good ceremony, underuses gold tokens and serif CSS class |
| 7. Dark/Light Theme | B+ | Full coverage, 2 components will break, 8 hardcoded `#fff` |
| 8. Visual Hierarchy | B+ | Professional financial layout, mixed styling patterns |
| **Overall** | **B+** | Strong foundation, needs cleanup pass on legacy components |

---

*Review performed on 62 TSX files across `app/` and `components/` directories.*
*Token file: `styles/tokens.css` (212 lines), Typography: `styles/typography.css` (192 lines), Config: `tailwind.config.ts` (94 lines), Globals: `app/globals.css` (105 lines).*
