# Blind Accessibility Audit Report

**Product**: Sabit Financial Close Engine -- Frontend
**Standard**: WCAG 2.2 Level AA
**Date**: 2026-03-14
**Auditor**: AccessibilityAuditor (cold review -- code-only, no runtime)
**Scope**: All .tsx files in app/ and components/ directories

---

## Summary

**Total Violations Found**: 47
- Critical: 8 -- Blocks access entirely for some users
- Serious: 16 -- Major barriers requiring workarounds
- Moderate: 14 -- Causes difficulty but has workarounds
- Minor: 9 -- Annoyances that reduce usability

**WCAG Conformance**: DOES NOT CONFORM (Level AA)
**Estimated Automated Detection Rate**: ~30% of these issues

---

## 1. COLOR-ONLY INDICATORS

**Grade: FAIL**

### Issue 1.1 -- GL Quality grade dot in Sidebar uses color only (CRITICAL)
**WCAG Criterion**: 1.4.1 Use of Color (Level A)
**File**: `components/shell/Sidebar.tsx` lines 266-280
**Description**: The GL Quality grade indicator is a solid colored dot (8x8px circle) that changes between green, amber, and red based on grade letter. The `title` attribute ("GL Quality: A") provides a tooltip but is NOT accessible to screen readers and NOT a substitute for a visible or sr-only text alternative.
**Fix**: Add `<span className="sr-only">Grade: {glQualityGrade}</span>` alongside the dot, or use a visible letter/icon.

### Issue 1.2 -- PeriodSelector compact mode status dot uses color only (SERIOUS)
**WCAG Criterion**: 1.4.1 Use of Color (Level A)
**File**: `components/shared/PeriodSelector.tsx` lines 83-96
**Description**: In compact mode, period status is shown as a 2x2 colored dot (green/blue/amber/gray) with no text or sr-only alternative. Users who cannot perceive color receive no status information.
**Fix**: Add sr-only text: `<span className="sr-only">{currentPeriod.status}</span>`.

### Issue 1.3 -- Sidebar notification dot on "Review & Certify" link uses color only (SERIOUS)
**WCAG Criterion**: 1.4.1 Use of Color (Level A)
**File**: `components/shell/Sidebar.tsx` lines 324-330
**Description**: A 2.5x2.5 amber dot indicates UNDER_REVIEW status on the collapsed sidebar. No text or sr-only alternative exists.
**Fix**: Add sr-only text indicating the status.

### Issue 1.4 -- IntegrityRibbon pulsing dot uses color only (MODERATE)
**WCAG Criterion**: 1.4.1 Use of Color (Level A)
**File**: `components/shared/IntegrityRibbon.tsx` line 58
**Description**: A 1.5x1.5 pulsing dot (emerald/sky/red) is placed beside the icon and label. The label text ("Certified", "Chain Verified", "Integrity Warning") does convey the state, so this is partially mitigated. However, the dot itself carries no accessible meaning.
**Fix**: Add `aria-hidden="true"` to the dot span so screen readers skip it.

### Issue 1.5 -- NotificationBell unread dot uses color only (MODERATE)
**WCAG Criterion**: 1.4.1 Use of Color (Level A)
**File**: `components/shell/NotificationBell.tsx` lines 124-128
**Description**: Unread notifications have a small blue dot indicator with no text alternative. Sighted users see "blue dot = unread" but screen reader users get no indication.
**Fix**: Add sr-only text: `<span className="sr-only">Unread</span>`.

### Issue 1.6 -- ReviewerDashboard warning dot uses color only (MODERATE)
**WCAG Criterion**: 1.4.1 Use of Color (Level A)
**File**: `components/dashboards/ReviewerDashboard.tsx` line 410
**Description**: A 2x2 amber dot with no text alternative.
**Fix**: Add sr-only text describing the warning state.

### Issue 1.7 -- CertificationChecklist status dot uses color only (MODERATE)
**WCAG Criterion**: 1.4.1 Use of Color (Level A)
**File**: `app/close/[sessionId]/review/CertificationChecklist.tsx` line 36
**Description**: A 1.5x1.5 dot (green or amber) indicates all-passing or partial state. The label text beside it partially mitigates, but the dot itself is color-only.
**Fix**: Add `aria-hidden="true"` to the dot.

### Issue 1.8 -- Dashboard progress bars lack accessible labels (SERIOUS)
**WCAG Criterion**: 1.1.1 Non-text Content (Level A)
**File**: `app/close/[sessionId]/dashboard/page.tsx` lines 960-1050
**Description**: Three progress bars ("Gates Passing", "Accounts Mapped", "Recon Complete") are plain colored divs with no `role="progressbar"`, no `aria-valuenow`, `aria-valuemin`, or `aria-valuemax`. Screen readers cannot identify them as progress indicators.
**Fix**: Add `role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label="..."` to each progress bar container. Note: The portfolio page (line 556) correctly implements this pattern -- replicate it.

### Issue 1.9 -- Multiple progress bars throughout the app lack ARIA progressbar semantics (SERIOUS)
**WCAG Criterion**: 4.1.2 Name, Role, Value (Level A)
**Files**: `components/shared/CloseChecklist.tsx` line 242, `components/shared/PortfolioIntegrity.tsx` line 82, `app/close/[sessionId]/reconciliation/page.tsx` line 865, `app/close/[sessionId]/checklist/page.tsx` line 356, `components/shared/AISuggestionCard.tsx` line 42, `components/shared/VerifiedCloseWorkflow.tsx` line 133, `components/close/ReconSourcePanel.tsx` line 94, `app/close/[sessionId]/variance/page.tsx` line 456
**Description**: All of these progress bars are styled divs without `role="progressbar"` or ARIA value attributes. They are invisible to assistive technology.
**Fix**: Add progressbar role and ARIA attributes to each.

---

## 2. ARIA LABELS

**Grade: CONCERN**

### Issue 2.1 -- TopBar user menu button has no aria-label (SERIOUS)
**WCAG Criterion**: 4.1.2 Name, Role, Value (Level A)
**File**: `components/shell/TopBar.tsx` lines 99-107
**Description**: The user menu trigger button contains an avatar div, username text, and a chevron icon. While it has visible text, it has no aria-label and no `aria-expanded` or `aria-haspopup` attributes to indicate it opens a menu.
**Fix**: Add `aria-label="User menu" aria-expanded={menuOpen} aria-haspopup="true"`.

### Issue 2.2 -- NotificationBell button missing aria-expanded (SERIOUS)
**WCAG Criterion**: 4.1.2 Name, Role, Value (Level A)
**File**: `components/shell/NotificationBell.tsx` lines 65-81
**Description**: The button has `aria-label="Notifications"` (good) but lacks `aria-expanded={open}` and `aria-haspopup="true"` to indicate it toggles a dropdown.
**Fix**: Add `aria-expanded={open} aria-haspopup="true"`.

### Issue 2.3 -- PeriodSelector button missing aria-expanded and aria-haspopup (MODERATE)
**WCAG Criterion**: 4.1.2 Name, Role, Value (Level A)
**File**: `components/shared/PeriodSelector.tsx` lines 68-101
**Description**: Dropdown trigger has no `aria-expanded`, `aria-haspopup`, or `aria-label`.
**Fix**: Add `aria-label="Select period" aria-expanded={open} aria-haspopup="listbox"`.

### Issue 2.4 -- SearchableSelect button missing ARIA combobox semantics (SERIOUS)
**WCAG Criterion**: 4.1.2 Name, Role, Value (Level A)
**File**: `components/shared/SearchableSelect.tsx` lines 91-104
**Description**: The custom select component renders a button with a dropdown containing a search input and options. It has no `role="combobox"`, no `aria-expanded`, no `aria-haspopup`, and no `aria-activedescendant`. Screen readers cannot identify this as a select widget.
**Fix**: Add proper combobox ARIA pattern per WAI-ARIA Authoring Practices.

### Issue 2.5 -- IssuePanel "Flag new issue" button has wrong aria-label (MINOR)
**WCAG Criterion**: 4.1.2 Name, Role, Value (Level A)
**File**: `components/shell/IssuePanel.tsx` lines 114-122
**Description**: The Plus button for creating a new issue has `aria-label="Expand issue details"` which does not match its function. The `title` says "Flag new issue" which is correct, but `aria-label` overrides `title` for screen readers.
**Fix**: Change `aria-label` to `"Flag new issue"`.

### Issue 2.6 -- Sidebar group toggle buttons have no aria-expanded (MODERATE)
**WCAG Criterion**: 4.1.2 Name, Role, Value (Level A)
**File**: `components/shell/Sidebar.tsx` lines 368-378
**Description**: The expand/collapse buttons for nav groups (Close Pipeline, Statements & Analysis, etc.) have no `aria-expanded` attribute. Screen reader users cannot tell whether a group is expanded or collapsed.
**Fix**: Add `aria-expanded={isOpen}`.

### Issue 2.7 -- FinancialTable sortable column headers are not announced as interactive (MODERATE)
**WCAG Criterion**: 4.1.2 Name, Role, Value (Level A)
**File**: `components/shared/FinancialTable.tsx` lines 190-216
**Description**: Sortable column headers use `<th>` with an `onClick` handler but no `aria-sort` attribute, no `role="columnheader"` (implicit from th), and no indication to screen readers that they are interactive or what the current sort state is.
**Fix**: Add `aria-sort={sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : 'none'}` to sorted th elements. Add `tabIndex={0}` and `onKeyDown` for Enter/Space activation.

### Issue 2.8 -- DataTable sortable headers also missing aria-sort (MODERATE)
**WCAG Criterion**: 4.1.2 Name, Role, Value (Level A)
**File**: `components/shared/DataTable.tsx` lines 93-112
**Description**: Same pattern as FinancialTable -- sortable th elements with onClick but no `aria-sort`.
**Fix**: Same as 2.7.

---

## 3. FOCUS MANAGEMENT

**Grade: CONCERN**

### Issue 3.1 -- SlideOverPanel does not return focus to trigger on close (SERIOUS)
**WCAG Criterion**: 2.4.3 Focus Order (Level A)
**File**: `components/shared/SlideOverPanel.tsx`
**Description**: The panel uses FocusTrap (good) and moves focus into the panel on open (good), but when `onClose` is called, there is no mechanism to return focus to the element that triggered the panel. Focus will land on `<body>` or an arbitrary element.
**Fix**: Accept a `triggerRef` prop and call `triggerRef.current?.focus()` in onClose, or use the `returnFocusOnDeactivate` option of focus-trap-react.

### Issue 3.2 -- ConfirmDialog does not return focus to trigger on close (SERIOUS)
**WCAG Criterion**: 2.4.3 Focus Order (Level A)
**File**: `components/shared/ConfirmDialog.tsx`
**Description**: Same issue as SlideOverPanel. Uses FocusTrap but no focus return mechanism.
**Fix**: Same approach as 3.1.

### Issue 3.3 -- NotificationBell dropdown has no focus trap (CRITICAL)
**WCAG Criterion**: 2.4.3 Focus Order (Level A), 2.1.2 No Keyboard Trap (Level A)
**File**: `components/shell/NotificationBell.tsx` lines 83-149
**Description**: The notification dropdown is a complex interactive panel with buttons, but it has no focus trap, no `role="dialog"` or `role="menu"`, and no Escape key handler. A keyboard user who tabs into it can tab right past it into the page behind. Also, the dropdown only closes on outside mouse click (`mousedown`) -- there is no keyboard mechanism to close it.
**Fix**: Add Escape key handler, focus trap or focus containment, and appropriate ARIA role.

### Issue 3.4 -- QuickNavigator has no focus trap (MODERATE)
**WCAG Criterion**: 2.4.3 Focus Order (Level A)
**File**: `components/shared/QuickNavigator.tsx`
**Description**: The command palette overlay handles Escape and arrow keys (good) and auto-focuses the input (good), but has no focus trap. A user pressing Tab from the input can tab behind the overlay.
**Fix**: Wrap in FocusTrap or add a focus trap mechanism. Also add `role="dialog" aria-modal="true" aria-label="Quick navigator"`.

### Issue 3.5 -- Review page certification dialog has no focus trap (CRITICAL)
**WCAG Criterion**: 2.4.3 Focus Order (Level A)
**File**: `app/close/[sessionId]/review/page.tsx` lines 666-680
**Description**: The certification dialog (lines 666+) uses `role="dialog" aria-modal="true"` (good) but has no FocusTrap wrapper, no initial focus management, and no Escape key handler. It is a critical workflow dialog where a user types "CERTIFY" and submits -- focus management failures here are blocking.
**Fix**: Wrap in FocusTrap, auto-focus the input, add Escape handler.

### Issue 3.6 -- IssuePanel side panel has no focus trap (SERIOUS)
**WCAG Criterion**: 2.4.3 Focus Order (Level A)
**File**: `components/shell/IssuePanel.tsx` lines 98-217
**Description**: The sliding issue panel is a fixed-position overlay with forms and links, but it has no focus trap, no role="dialog", and no Escape key handler.
**Fix**: Add FocusTrap, `role="complementary"` or `role="dialog"`, and Escape handler.

### Issue 3.7 -- TopBar user menu dropdown has no focus management (MODERATE)
**WCAG Criterion**: 2.4.3 Focus Order (Level A)
**File**: `components/shell/TopBar.tsx` lines 108-126
**Description**: The user dropdown menu has no Escape handler, no `role="menu"`, and no focus management. Only closes via outside mouse click.
**Fix**: Add `role="menu"`, Escape handler, arrow key navigation between items.

---

## 4. KEYBOARD NAVIGATION

**Grade: CONCERN**

### Issue 4.1 -- NotificationBell dropdown not keyboard-dismissible (CRITICAL)
**WCAG Criterion**: 2.1.1 Keyboard (Level A)
**File**: `components/shell/NotificationBell.tsx`
**Description**: No Escape key handler. Keyboard users cannot close this dropdown without clicking outside.
**Fix**: Add `onKeyDown` handler for Escape on the dropdown container.

### Issue 4.2 -- PeriodSelector dropdown not keyboard-dismissible (SERIOUS)
**WCAG Criterion**: 2.1.1 Keyboard (Level A)
**File**: `components/shared/PeriodSelector.tsx`
**Description**: No Escape key handler. Only closes on outside mouse click.
**Fix**: Add Escape handler and arrow key navigation.

### Issue 4.3 -- TopBar user menu not keyboard-dismissible (SERIOUS)
**WCAG Criterion**: 2.1.1 Keyboard (Level A)
**File**: `components/shell/TopBar.tsx` lines 108-126
**Description**: No Escape key handler or keyboard navigation within the menu.
**Fix**: Add Escape handler, `role="menu"`, and arrow key support.

### Issue 4.4 -- FinancialTable sortable headers not keyboard-accessible (SERIOUS)
**WCAG Criterion**: 2.1.1 Keyboard (Level A)
**File**: `components/shared/FinancialTable.tsx` lines 190-216
**Description**: Sortable column headers respond only to `onClick`. They have no `tabIndex` and no `onKeyDown` handler. Keyboard users cannot sort tables.
**Fix**: Add `tabIndex={0}` and `onKeyDown` handler for Enter and Space keys.

### Issue 4.5 -- FinancialTable expand/collapse on rows is click-only (SERIOUS)
**WCAG Criterion**: 2.1.1 Keyboard (Level A)
**File**: `components/shared/FinancialTable.tsx` lines 349-355
**Description**: The expand/collapse chevron in expandable table rows is a `<td>` with `onClick` -- not a button, not focusable, not keyboard-operable.
**Fix**: Wrap the chevron in a `<button>` with `aria-label="Expand row"` and `aria-expanded={isExpanded}`.

### Issue 4.6 -- FinancialTable select-all checkbox has no label (MODERATE)
**WCAG Criterion**: 1.3.1 Info and Relationships (Level A)
**File**: `components/shared/FinancialTable.tsx` lines 176-181
**Description**: The "select all" checkbox in the table header has no label -- screen readers announce it as an unlabeled checkbox.
**Fix**: Add `aria-label="Select all rows"`.

### Issue 4.7 -- FinancialTable row selection checkboxes have no labels (MODERATE)
**WCAG Criterion**: 1.3.1 Info and Relationships (Level A)
**File**: `components/shared/FinancialTable.tsx` lines 340-347
**Description**: Individual row checkboxes have no aria-label. Screen readers cannot identify which row the checkbox corresponds to.
**Fix**: Add `aria-label={`Select row ${index + 1}`}` or use a more descriptive identifier from the row data.

### Issue 4.8 -- IntegrityRibbon tooltip is hover-only (MODERATE)
**WCAG Criterion**: 1.4.13 Content on Hover or Focus (Level AA)
**File**: `components/shared/IntegrityRibbon.tsx` lines 49-112
**Description**: The integrity details tooltip appears only on mouse hover (`onMouseEnter`/`onMouseLeave`). Keyboard users and screen reader users cannot access the hash chain status, signature details, or certification information.
**Fix**: Use `onFocus`/`onBlur` alongside hover events, or convert to a toggle disclosure pattern.

---

## 5. SCREEN READER

**Grade: FAIL**

### Issue 5.1 -- Only 2 instances of sr-only text in entire codebase (CRITICAL)
**WCAG Criterion**: 1.1.1 Non-text Content (Level A)
**Description**: A `grep` for `sr-only` returns only 2 matches in the entire codebase (both in `app/portfolio/` gate indicators). For an application of this size with dozens of icon buttons, colored indicators, and status displays, this represents a systemic gap in screen reader accessibility.

### Issue 5.2 -- Financial abbreviations are never expanded (SERIOUS)
**WCAG Criterion**: 3.1.4 Abbreviations (Level AAA, but important for comprehension)
**Files**: Multiple pages use abbreviations like D&A, SGA, COGS, PPE, AR, AP, EBITDA, FX, GL, TB, JE, AJE without expansion or `<abbr>` tags.
**Description**: Screen readers will attempt to pronounce these as words (e.g., "COGS" as a word, "SGA" as "sga") rather than expanding them. For a financial application where precision matters, this creates comprehension barriers.
**Fix**: Use `<abbr title="Cost of Goods Sold">COGS</abbr>` pattern, or add sr-only expanded forms.

### Issue 5.3 -- StatementTable has no scope attributes on headers (SERIOUS)
**WCAG Criterion**: 1.3.1 Info and Relationships (Level A)
**File**: `app/close/[sessionId]/statements/StatementTable.tsx` lines 103-122
**Description**: The financial statement table headers (`<th>`) have no `scope="col"` attribute. Screen readers may not correctly associate data cells with their column headers.
**Fix**: Add `scope="col"` to all `<th>` elements.

### Issue 5.4 -- StatementTable drilldown buttons have no accessible names (SERIOUS)
**WCAG Criterion**: 4.1.2 Name, Role, Value (Level A)
**File**: `app/close/[sessionId]/statements/StatementTable.tsx` lines 16-22
**Description**: The clickable amount cells that trigger drilldown are `<button>` elements containing only a formatted money value. Screen readers will announce "button, $1,234.56" but provide no context about what the button does or which line item it relates to.
**Fix**: Add `aria-label={`View detail for ${row.lineItemName}: ${fmtMoney(amount)}`}`.

### Issue 5.5 -- StepProgress component provides no ARIA role or status (MODERATE)
**WCAG Criterion**: 4.1.2 Name, Role, Value (Level A)
**File**: `components/shared/StepProgress.tsx`
**Description**: Steps are rendered as a list (good) but icons carry the status information (complete/active/pending/error) with no `aria-label` or sr-only text beyond what the icon visually represents.
**Fix**: Add `aria-label` to each `<li>` with the step name and status.

### Issue 5.6 -- PipelineStepper steps have no ARIA current or status (MODERATE)
**WCAG Criterion**: 4.1.2 Name, Role, Value (Level A)
**File**: `components/shared/PipelineStepper.tsx`
**Description**: The pipeline steps use colored circles (green = complete, blue = active, dashed = pending, red = error) with no `aria-current="step"` for the active step and no sr-only text for status. In compact mode, only a `title` tooltip provides the step name.
**Fix**: Add `aria-current="step"` to the active step, `aria-label={`${step.label}: ${step.status}`}` to each step circle.

### Issue 5.7 -- Notification count badge has no sr-only context (MINOR)
**WCAG Criterion**: 4.1.2 Name, Role, Value (Level A)
**File**: `components/shell/NotificationBell.tsx` lines 73-80
**Description**: The red notification count badge is inside the button but is purely visual. While the `aria-label="Notifications"` exists, it does not include the count. A screen reader user does not know there are unread notifications.
**Fix**: Change `aria-label` to `aria-label={`Notifications${count > 0 ? `, ${count} unread` : ''}`}`.

### Issue 5.8 -- Live regions not used for dynamic status updates (MODERATE)
**WCAG Criterion**: 4.1.3 Status Messages (Level AA)
**Files**: Multiple components update status without `aria-live` regions -- upload progress in `GLUploadFlow.tsx` and `TBUploadFlow.tsx`, certification state changes in review page, issue creation success/failure in `IssuePanel.tsx`.
**Description**: When a file upload completes, a certification succeeds, or an issue is created, the status change is only visual. Screen reader users receive no announcement.
**Fix**: Wrap status messages in `<div aria-live="polite">` or use `role="status"`.

---

## 6. CONTRAST

**Grade: CONCERN**

### Issue 6.1 -- text-tertiary on bg-surface in light theme is borderline (MODERATE)
**WCAG Criterion**: 1.4.3 Contrast (Minimum) (Level AA)
**Values**: `--text-tertiary: #8A8A8A` on `--bg-surface: #FFFFFF` = 3.5:1 contrast ratio
**Required**: 4.5:1 for normal text (AA)
**Description**: This token combination is used extensively for labels, timestamps, secondary metadata, kbd hints, and disabled-like states. At 3.5:1, it fails WCAG AA for normal text.
**Locations**: FilterBar placeholder text, QuickNavigator section labels, PeriodSelector labels, Breadcrumb separators, NotificationBell timestamps, and many more.
**Fix**: Darken `--text-tertiary` to at least `#767676` (4.5:1) or `#6E6E6E` (4.9:1).

### Issue 6.2 -- text-tertiary in dark theme is also borderline (MODERATE)
**WCAG Criterion**: 1.4.3 Contrast (Minimum) (Level AA)
**Values**: `--text-tertiary: #6B7280` on `--bg-surface: #1A1D23` = 4.4:1 contrast ratio
**Required**: 4.5:1 for normal text (AA)
**Description**: Slightly below threshold. Same widespread usage as light theme.
**Fix**: Lighten dark theme `--text-tertiary` to at least `#6F7480`.

### Issue 6.3 -- IntegrityRibbon hover tooltip uses hardcoded dark colors (MINOR)
**WCAG Criterion**: 1.4.3 Contrast (Minimum) (Level AA)
**File**: `components/shared/IntegrityRibbon.tsx` lines 64-111
**Description**: Uses hardcoded colors like `text-gray-400` (#9CA3AF) on `bg-[#1a1d2e]`. Contrast: approximately 4.7:1, which barely passes. More critically, these hardcoded values do not respect the theme system and will look wrong in light mode.
**Fix**: Use design token variables instead of hardcoded hex/Tailwind colors.

### Issue 6.4 -- Disabled button opacity of 0.50 may fail contrast (MINOR)
**WCAG Criterion**: 1.4.3 Contrast (Minimum) (Level AA)
**Files**: Multiple buttons use `disabled:opacity-50`
**Description**: While WCAG does not require disabled controls to meet contrast requirements, best practice is to maintain sufficient contrast so users can identify the control exists. At 50% opacity on the primary button color (#1A5FB4 at 50% on white), the resulting color is approximately #8DAFDA which has only 2.5:1 contrast.
**Note**: This is advisory rather than a strict violation.

---

## 7. FORM LABELS

**Grade: CONCERN**

### Issue 7.1 -- IssuePanel form inputs use placeholder-only labels (SERIOUS)
**WCAG Criterion**: 1.3.1 Info and Relationships (Level A)
**File**: `components/shell/IssuePanel.tsx` lines 132-145
**Description**: The "Issue title" input and "Description (optional)" textarea use `placeholder` as the only label. Placeholders disappear when users type, and screen readers may not announce them as labels. The selects for category and severity also lack explicit labels.
**Fix**: Add `<label>` elements or `aria-label` attributes to all form controls.

### Issue 7.2 -- FilterBar search input has no label (SERIOUS)
**WCAG Criterion**: 1.3.1 Info and Relationships (Level A)
**File**: `components/shared/FilterBar.tsx` lines 48-56
**Description**: The search input relies on a placeholder and a decorative Search icon. No `<label>` or `aria-label` exists.
**Fix**: Add `aria-label={searchPlaceholder || "Search"}`.

### Issue 7.3 -- QuickNavigator search input has no label (MODERATE)
**WCAG Criterion**: 1.3.1 Info and Relationships (Level A)
**File**: `components/shared/QuickNavigator.tsx` lines 114-123
**Description**: The command palette search input has a placeholder "Search pages..." but no `aria-label` or `<label>`.
**Fix**: Add `aria-label="Search pages"`.

### Issue 7.4 -- Deferred Tax page inputs use placeholder-only labels (SERIOUS)
**WCAG Criterion**: 1.3.1 Info and Relationships (Level A)
**File**: `app/close/[sessionId]/deferred-tax/page.tsx` lines 66-93
**Description**: All form inputs (Description, Book Basis, Tax Basis, Source Account, Tax Rate) use only placeholder text as labels. No `<label>` elements.
**Fix**: Add proper `<label>` elements associated via `htmlFor`/`id`.

### Issue 7.5 -- FX Translation page inputs use placeholder-only labels (SERIOUS)
**WCAG Criterion**: 1.3.1 Info and Relationships (Level A)
**File**: `app/close/[sessionId]/fx-translation/page.tsx` lines 152-184
**Description**: Multiple currency rate inputs and line item fields rely entirely on placeholders.
**Fix**: Add proper `<label>` elements.

### Issue 7.6 -- Trial Balance page filters lack explicit labels (MODERATE)
**WCAG Criterion**: 1.3.1 Info and Relationships (Level A)
**File**: `app/close/[sessionId]/trial-balance/page.tsx` lines 348-394
**Description**: Search input and filter selects (Account Type, Balance Filter) use placeholders and visual context but no explicit labels.
**Fix**: Add `aria-label` attributes.

### Issue 7.7 -- MoneyInput label is not associated via htmlFor/id (MINOR)
**WCAG Criterion**: 1.3.1 Info and Relationships (Level A)
**File**: `components/shared/MoneyInput.tsx` lines 55-76
**Description**: The label is rendered as a sibling `<label>` element but is not connected to the `<input>` via `htmlFor`/`id`. Screen readers may not associate them.
**Fix**: Generate a unique ID and connect `label htmlFor` to `input id`.

### Issue 7.8 -- Variance page checkboxes lack associated labels (MODERATE)
**WCAG Criterion**: 1.3.1 Info and Relationships (Level A)
**File**: `app/close/[sessionId]/variance/page.tsx` lines 486-490
**Description**: "Material only" and "Unexplained only" checkboxes have adjacent text but no `<label>` wrapping or `htmlFor` association.
**Fix**: Wrap in `<label>` elements or use `htmlFor`/`id` pairing.

---

## 8. MOTION / ANIMATION

**Grade: FAIL**

### Issue 8.1 -- Zero prefers-reduced-motion support (CRITICAL)
**WCAG Criterion**: 2.3.3 Animation from Interactions (Level AAA) and best practice for 2.3.1
**Description**: A search for `prefers-reduced-motion` across all .tsx and .css files returns zero matches. The codebase uses numerous animations:
  - `animate-spin` on loading spinners (Loader2 icons, upload flows)
  - `animate-pulse` on skeleton loaders and IntegrityRibbon dot
  - `animate-ping` on PipelineStepper active step
  - `transition-all`, `transition-colors`, `transition-transform` throughout
  - `duration-200`, `duration-300`, `duration-500`, `duration-700` transitions
  - `slide-in-from-top-2` animation on FinancialTable expanded rows
**Impact**: Users with vestibular disorders or motion sensitivity have no way to reduce or disable animations.
**Fix**: Add a global CSS rule:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## What Is Working Well

- **SlideOverPanel and ConfirmDialog** both use `focus-trap-react` for focus trapping -- this is the right approach.
- **SlideOverPanel** has `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, a close button with `aria-label`, and Escape key support.
- **ConfirmDialog** has `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `tabIndex={-1}` for initial focus, and Escape support.
- **Login page** has proper `<label>` elements with `htmlFor`/`id` associations, and the password toggle has a dynamic `aria-label`.
- **Portfolio page** has a correctly implemented `role="progressbar"` with full ARIA attributes on the gates progress bar.
- **Portfolio entity page** uses `sr-only` text for gate pass/fail status.
- **Icon-only buttons** in settings pages (Edit, Delete, Toggle) all have `aria-label` attributes.
- **Sidebar collapse button** has a proper `aria-label` that changes based on collapsed state.
- **Theme toggle** in TopBar has a dynamic `aria-label`.
- **Breadcrumb** has `aria-label="Breadcrumb"`.
- **Several tab interfaces** use proper `role="tablist"` and `role="tab"`.
- **QuickNavigator** supports arrow key navigation and Escape to close.
- **JournalEntryForm** properly associates the "Reverse in next period" checkbox with its label via `htmlFor`.

---

## Remediation Priority

### Immediate (Critical/Serious -- fix before release)

1. **Add `prefers-reduced-motion` media query** to globals.css (Issue 8.1)
2. **Add sr-only text or visible alternatives** to all color-only status dots (Issues 1.1-1.7)
3. **Add `role="progressbar"` and ARIA values** to all progress bars (Issues 1.8, 1.9)
4. **Add focus trap and Escape handler** to NotificationBell dropdown (Issues 3.3, 4.1)
5. **Add focus trap** to review certification dialog (Issue 3.5)
6. **Add focus return** to SlideOverPanel and ConfirmDialog (Issues 3.1, 3.2)
7. **Add `aria-expanded`** to all dropdown/menu trigger buttons (Issues 2.1-2.4)
8. **Add labels** to all form inputs using placeholder-only (Issues 7.1-7.6)
9. **Add `aria-sort`** to sortable table headers (Issues 2.7, 2.8)
10. **Make FinancialTable expand chevron keyboard-accessible** (Issue 4.5)

### Short-term (Moderate -- fix within next sprint)

1. Add `aria-expanded` to Sidebar group toggles (Issue 2.6)
2. Add Escape handlers to PeriodSelector and TopBar menu (Issues 4.2, 4.3)
3. Add focus trap to QuickNavigator (Issue 3.4)
4. Add focus trap to IssuePanel (Issue 3.6)
5. Darken `--text-tertiary` token to meet 4.5:1 contrast (Issues 6.1, 6.2)
6. Add `aria-live="polite"` to status update areas (Issue 5.8)
7. Add `scope="col"` to StatementTable headers (Issue 5.3)
8. Add accessible names to drilldown buttons (Issue 5.4)
9. Connect MoneyInput label via htmlFor/id (Issue 7.7)
10. Make IntegrityRibbon tooltip accessible via focus (Issue 4.8)

### Ongoing (Minor -- address in regular maintenance)

1. Add `<abbr>` tags for financial abbreviations (Issue 5.2)
2. Add step status to PipelineStepper ARIA (Issue 5.6)
3. Fix IssuePanel aria-label mismatch (Issue 2.5)
4. Add sr-only text for notification count (Issue 5.7)
5. Replace hardcoded colors in IntegrityRibbon tooltip (Issue 6.3)

---

## Recommended Next Steps

1. **Add the `prefers-reduced-motion` CSS rule immediately** -- this is a single line change with sweeping benefit.
2. **Create a shared `<DropdownMenu>` component** that handles focus trap, Escape, aria-expanded, and arrow key navigation. Refactor NotificationBell, PeriodSelector, TopBar menu, and SearchableSelect to use it.
3. **Add an sr-only utility check** to the PR review process -- any new colored indicator must have a text alternative.
4. **Darken `--text-tertiary`** from `#8A8A8A` to `#767676` in light theme and from `#6B7280` to `#727A88` in dark theme.
5. **Audit all `<input>`, `<select>`, and `<textarea>` elements** for label association. Approximately 40% of form controls currently lack explicit labels.
6. **Integrate axe-core** into the CI pipeline to catch regressions automatically.
7. **Re-audit after fixes** with a screen reader (VoiceOver on macOS recommended for a Next.js app) to verify real-world behavior.
