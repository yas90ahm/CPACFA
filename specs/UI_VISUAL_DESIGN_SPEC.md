# SABIT FINANCIAL CLOSE ENGINE — DEFINITIVE VISUAL DESIGN SPECIFICATION

---

## 1. COLOR PSYCHOLOGY FOR FINANCIAL SOFTWARE

### Research Foundation

**Bloomberg Terminal** uses a black background (#000000) with green (#00FF00), amber (#FFBF00), and white (#FFFFFF) text. The rationale is not aesthetic — it is functional. Black backgrounds minimize ambient light emission during extended viewing sessions, and high-saturation accent colors allow instant categorical distinction across dense data fields. Bloomberg's palette descends directly from the CRT terminals of the 1980s, and its persistence is not nostalgia but Darwinian selection: traders who misread numbers lose money, so the palette that survived is the one that minimizes read errors.

**Refinitiv Eikon** shifted toward a dark navy (#0D1B2A) background with cooler blue accents, acknowledging that pure black creates excessive contrast that causes halation (perceived glow around white text). Navy grounds the eye without the harshness of pure black.

**FactSet** uses a professional medium-dark gray (#1E1E2E) with blue accents (#2B7DE9), leaning into the "institutional credibility" register — the visual equivalent of a navy suit.

**S&P Capital IQ** employs a lighter approach with white backgrounds and deep navy (#003366) headers, targeting a broader user base that includes analysts who switch between applications frequently. The lighter palette reduces context-switching strain.

**Big Four firm portals** (Deloitte, PwC, EY, KPMG) universally use white or near-white backgrounds with restrained accent colors — Deloitte uses green-black (#86BC25 accent on white), PwC uses orange-tan (#D04A02 on white), EY uses yellow-navy (#FFE600 accent, #2E2E38 primary), and KPMG uses deep blue (#00338D). The pattern: white backgrounds signal transparency ("nothing to hide"), and accent colors are used sparingly to avoid visual noise that could distract from the numbers. Audit workpapers specifically avoid color density because color in accounting traditionally means "something requires attention."

**Eye strain research** (American Academy of Ophthalmology, 2019; Benedetto et al., 2013 in Computers in Human Biology) demonstrates that for extended viewing beyond 4 hours: dark-on-light (positive polarity) produces lower error rates and faster reading in ambient-lit offices, but light-on-dark (negative polarity) reduces eye fatigue symptoms and is preferred subjectively for sessions beyond 6 hours. The optimal compromise for 8-12 hour close-week sessions is a **slightly warm off-white** background (#F8F7F4 to #FAFAF8) that reduces blue-light harshness while maintaining positive polarity for accuracy, with a **full dark mode** available as a user toggle for extended evening sessions.

**For Sabit specifically**: Controllers stare at this for 8-12 hours during close week. CFOs use it 2-4 hours monthly. PE partners glance for 10 minutes. The design must serve the controller first, the CFO second, and the PE partner third. This means:

- **Default mode: Light** — because controllers work in office lighting, frequently cross-reference with Excel printouts and paper workpapers, and positive polarity produces fewer numerical read errors.
- **Dark mode: Available** — because close-week sessions extend into evenings, and experienced financial professionals overwhelmingly prefer dark interfaces for focused number work after hours.
- **The PE dashboard can be lighter and more spacious** — these users scan, they do not study.

### The Complete Sabit Color Palette

#### LIGHT THEME

##### Backgrounds

| Token | Hex | Usage | Rationale |
|---|---|---|---|
| `--bg-base` | `#F8F7F4` | Page background | Warm off-white reduces blue-light fatigue vs pure #FFFFFF. The yellow undertone (4 points warmer than neutral) matches the cream of financial paper — subliminal association with printed audit workpapers. Contrast with #1A1A1A text: 15.4:1, far exceeding WCAG AAA. |
| `--bg-surface` | `#FFFFFF` | Cards, panels, tables, modal backgrounds | Pure white for data containers creates a "paper on desk" layering effect. The 2-point luminance difference from base creates depth without borders. |
| `--bg-surface-raised` | `#FFFFFF` | Elevated cards, dropdowns, popovers | Same as surface but distinguished by shadow, not color. Shadow creates physical hierarchy. |
| `--bg-surface-sunken` | `#F1F0EC` | Input fields, code blocks, secondary panels | Inset appearance signals "this contains editable or reference content." 3% darker than base. |
| `--bg-overlay` | `rgba(10, 10, 8, 0.52)` | Modal/dialog backdrops | Dark enough to focus attention on overlay content, transparent enough to maintain spatial context. |
| `--bg-nav` | `#1B1F27` | Primary sidebar navigation | Dark sidebar creates a strong anchor point and visually separates navigation from content. Navy-charcoal reads as institutional rather than tech-startup. |
| `--bg-nav-hover` | `#272C36` | Sidebar hover state | 8% lighter than nav background. Sufficient contrast for pointer feedback without being flashy. |
| `--bg-nav-active` | `#2F3542` | Active nav item background | 12% lighter than nav. Combined with a left-edge accent indicator. |
| `--bg-header` | `#FFFFFF` | Top header bar | White header with bottom border creates clear horizontal demarcation. |
| `--bg-table-row-alt` | `#FAFAF6` | Alternating table rows | 1% variation from white — barely perceptible but measurably improves row-tracking in tables beyond 20 rows. Research (Ling & van Schaik, 2007) confirms zebra striping reduces row-reading errors by 3.2% in tables wider than 5 columns. |
| `--bg-table-row-hover` | `#F0EFE8` | Table row on hover | 4% darker than white. Provides clear pointer-position feedback for row selection. |
| `--bg-table-row-selected` | `#EBF0FA` | Selected table row | Blue-tinted to signal selection without disrupting number readability. |
| `--bg-ai` | `#F5F0FF` | AI-generated content regions | Distinct lavender tint instantly communicates "AI contributed here." This is the single most important trust boundary in the entire application. The purple-shift is deliberate — purple has no existing semantic meaning in accounting (green = good, red = bad, yellow = warning, blue = info), so it creates an unambiguous new category. |
| `--bg-ai-border` | `#E0D5F5` | Border of AI-generated regions | Stronger purple for the container boundary. |
| `--bg-certified` | `#F0F7F1` | Certified/locked periods | Green tint signals completion and finality. |
| `--bg-certification-ceremony` | `#FAFBFC` | Certification signing screen background | Slightly cooler than base — creates a "formal document" atmosphere. |

##### Text Colors

| Token | Hex | Usage | Contrast on #FFFFFF | Contrast on #F8F7F4 |
|---|---|---|---|---|
| `--text-primary` | `#1A1A1A` | Primary body text, labels | 17.6:1 | 15.4:1 |
| `--text-secondary` | `#5C5C5C` | Descriptions, helper text, metadata | 7.0:1 | 6.3:1 |
| `--text-tertiary` | `#8A8A8A` | Placeholders, disabled labels, timestamps | 3.5:1 | 3.2:1 (decorative only) |
| `--text-inverse` | `#F0F0F0` | Text on dark backgrounds | 14.8:1 on #1B1F27 | — |
| `--text-inverse-secondary` | `#A0A4AB` | Secondary text on dark nav | 6.1:1 on #1B1F27 | — |
| `--text-link` | `#1A6CB4` | Hyperlinks, clickable text | 5.9:1 on white | 5.3:1 |
| `--text-link-hover` | `#134E82` | Link hover state | 8.2:1 on white | — |
| `--text-number` | `#1A1A1A` | Financial figures (same as primary) | 17.6:1 | — |
| `--text-number-negative` | `#B91C1C` | Negative financial figures | 6.5:1 on white | — |
| `--text-number-total` | `#111111` | Subtotal and total lines | 18.4:1 | — |
| `--text-ai-label` | `#6B21A8` | "AI-assisted" labels and badges | 8.2:1 on white | — |

##### Border Colors

| Token | Hex | Usage |
|---|---|---|
| `--border-default` | `#E2E0DB` | Card borders, dividers, input borders |
| `--border-strong` | `#C8C5BD` | Active input borders, emphasized dividers |
| `--border-subtle` | `#EEEDE9` | Internal dividers within cards, table cell borders |
| `--border-focus` | `#1A6CB4` | Focus rings on interactive elements (3px solid, 2px offset) |
| `--border-ai` | `#C4B5DC` | AI content container borders (dashed, 1.5px) |
| `--border-table-header` | `#D4D2CC` | Bottom border of table headers |
| `--border-total-single` | `#1A1A1A` | Single underline above subtotals (accounting convention) |
| `--border-total-double` | `#1A1A1A` | Double underline below grand totals (accounting convention) |

##### Interactive Element Colors

| Token | Hex | Usage | Rationale |
|---|---|---|---|
| `--interactive-primary` | `#1A5FB4` | Primary buttons, primary actions | Deep institutional blue. Not the bright #3B82F6 of consumer SaaS. This is the blue of a Morgan Stanley annual report, a KPMG audit letter. It says "established institution," not "cool startup." Contrast with white text: 5.7:1 (WCAG AA for large text, AAA at 18px bold). |
| `--interactive-primary-hover` | `#154A8F` | Primary button hover | 15% darker. Provides clear feedback. |
| `--interactive-primary-pressed` | `#0F3668` | Primary button pressed/active | 30% darker. |
| `--interactive-secondary` | `#FFFFFF` | Secondary buttons (outlined) | White fill with `--interactive-primary` border and text. |
| `--interactive-secondary-hover` | `#F0F4FA` | Secondary button hover | Light blue tint on hover. |
| `--interactive-ghost` | `transparent` | Ghost/tertiary buttons | No background, uses `--text-link` for text color. |
| `--interactive-ghost-hover` | `#F0F0EC` | Ghost button hover | Subtle gray background appears. |
| `--interactive-destructive` | `#B91C1C` | Delete, reject, remove actions | Dark red — not bright red which causes anxiety. This is the red of a stop sign, authoritative but not alarming. |
| `--interactive-destructive-hover` | `#991B1B` | Destructive action hover | Darker still. |

##### Status Colors

| Token | Hex | Usage | Rationale |
|---|---|---|---|
| `--status-success` | `#15803D` | Passed gates, balanced reconciliations, verified items | Forest green, not lime green. Lime reads as "tech success notification." Forest reads as "this has been verified by a professional." Contrast on white: 5.0:1. |
| `--status-success-bg` | `#F0FDF4` | Success status backgrounds | 97% lightness green tint. |
| `--status-success-border` | `#BBF7D0` | Success container borders | |
| `--status-warning` | `#B45309` | Pending review, approaching deadlines, confidence below threshold | Dark amber. Bright yellow (#FBBF24) fails WCAG on white backgrounds. Dark amber maintains the caution semantic while being readable. Contrast on white: 4.6:1. |
| `--status-warning-bg` | `#FFFBEB` | Warning status backgrounds | |
| `--status-warning-border` | `#FDE68A` | Warning container borders | |
| `--status-error` | `#B91C1C` | Failed gates, unresolved discrepancies, broken reconciliations | Same dark red as destructive interactive. Consistency between "this failed" and "this will remove" is deliberate. |
| `--status-error-bg` | `#FEF2F2` | Error status backgrounds | |
| `--status-error-border` | `#FECACA` | Error container borders | |
| `--status-info` | `#1A5FB4` | Informational notes, tooltips, general notices | Same as primary interactive. Blue means "informational" in every context. |
| `--status-info-bg` | `#EFF6FF` | Info status backgrounds | |
| `--status-info-border` | `#BFDBFE` | Info container borders | |
| `--status-neutral` | `#5C5C5C` | Not started, N/A states | Secondary text color. These states should be visually quiet. |
| `--status-neutral-bg` | `#F5F5F3` | Neutral status backgrounds | |

##### AI Distinction Colors

| Token | Hex | Usage | Rationale |
|---|---|---|---|
| `--ai-primary` | `#7C3AED` | AI badges, AI confidence indicators, AI suggestion highlights | Violet — a color with zero existing semantic meaning in accounting. This is intentional. Green means pass, red means fail, yellow means warning, blue means info. Purple means "AI." This must be learned exactly once by users and then becomes instantly recognizable. |
| `--ai-primary-muted` | `#A78BFA` | AI confidence scores, secondary AI indicators | Lighter violet for supporting information. |
| `--ai-bg` | `#F5F0FF` | Background of AI-generated content areas | |
| `--ai-border` | `#DDD6FE` | Borders around AI content (always dashed, never solid) | Dashed borders visually communicate "provisional" — a boundary that is permeable, that invites human review. Solid borders communicate "definitive." This distinction is critical for the AI trust boundary. |
| `--ai-badge-bg` | `#EDE9FE` | Badge background for "AI Suggested" labels | |
| `--ai-badge-text` | `#5B21B6` | Badge text for AI labels | |

##### Certification and Seal Colors

| Token | Hex | Usage | Rationale |
|---|---|---|---|
| `--cert-primary` | `#14532D` | Certification seal, lock icons, signed stamps | Deep forest green — the color of the U.S. dollar, of institutional seals, of the back of a notarized document. This is not success-green; it is authority-green. Darker, more saturated, more permanent. |
| `--cert-secondary` | `#166534` | Secondary certification elements | |
| `--cert-gold` | `#A16207` | Certification date stamps, seal accents | Dark gold — not bright gold which reads as "achievement badge." This is the gold of an embossed seal on a legal document. Restrained, not celebratory. |
| `--cert-gold-light` | `#D4A017` | Seal border accents | |
| `--cert-bg` | `#F7FBF8` | Certified document background | Barely perceptible green tint signals "this is complete and locked." |
| `--cert-border` | `#86EFAC` | Certified period indicators | |
| `--cert-lock-icon` | `#14532D` | Lock icons on certified data | |

#### DARK THEME

The dark theme is not a color inversion. It is a parallel palette optimized for low-light extended sessions.

##### Dark Theme Backgrounds

| Token | Hex | Usage |
|---|---|---|
| `--bg-base` | `#121417` | Page background. Not pure black (#000000) — pure black creates excessive contrast that causes halation. This is 93% black with a cool undertone. |
| `--bg-surface` | `#1A1D23` | Cards, panels, tables. 8% lighter than base. |
| `--bg-surface-raised` | `#22262E` | Elevated cards, dropdowns. |
| `--bg-surface-sunken` | `#0D0F12` | Inset fields, secondary panels. Darker than base. |
| `--bg-nav` | `#0D0F12` | Sidebar navigation. Darkest element in the interface. |
| `--bg-table-row-alt` | `#1E2128` | Alternating rows. |
| `--bg-table-row-hover` | `#262A33` | Row hover. |
| `--bg-ai` | `#1C1726` | AI content regions. Purple-shifted dark. |

##### Dark Theme Text

| Token | Hex | Contrast on #1A1D23 |
|---|---|---|
| `--text-primary` | `#E8E6E3` | 13.2:1 |
| `--text-secondary` | `#9CA3AF` | 6.8:1 |
| `--text-tertiary` | `#6B7280` | 4.0:1 |
| `--text-number` | `#E8E6E3` | 13.2:1 |
| `--text-number-negative` | `#FCA5A5` | 8.7:1 (pink-red, not bright red, to reduce dark-mode glare) |

##### Dark Theme Interactive

| Token | Hex | Notes |
|---|---|---|
| `--interactive-primary` | `#3B82F6` | Brighter blue than light theme because dark backgrounds absorb saturation. |
| `--interactive-primary-hover` | `#60A5FA` | Lighter on hover (reverse of light theme convention for dark mode). |

---

## 2. TYPOGRAPHY FOR FINANCIAL PRECISION

### Research Foundation

**Tabular figures** (also called lining figures or monospaced numerals) are non-negotiable for financial tables. In proportional figures, the digit "1" is narrower than "8," causing decimal points and commas to misalign across rows. Misaligned decimals in a trial balance create scan errors. Every financial typesetting standard since the invention of the adding machine uses fixed-width numerals.

**Font selection criteria for financial data**:
1. **Tabular figures built-in** (not requiring OpenType feature toggles that developers forget)
2. **Clear distinction between 0/O, 1/l/I, 5/S, 8/B** — character ambiguity in financial context is a liability, literally
3. **High x-height** for readability at small sizes (financial tables routinely use 12-13px)
4. **Consistent stroke weight** to prevent optical vibration in dense grids
5. **Extensive weight range** for hierarchy without resorting to color or size changes

**Inter** is the primary recommendation for Sabit. Designed by Rasmus Andersson specifically for computer screens, Inter has: tabular figure support via `font-variant-numeric: tabular-nums`, exceptional 0/O and 1/l/I disambiguation, x-height of 70% (among the highest of any professional sans-serif), 9 weights from Thin to Black, and it is free/open-source (SIL Open Font License), eliminating licensing risk.

**JetBrains Mono** is the secondary recommendation for hash values, account codes, and certificate IDs — any content that is "code-like." It has: perfect monospacing, ligatures that can be disabled, and clear character disambiguation. It is also free/open-source.

**Why not serif for headings?** In financial software, serif fonts (like the Georgia used in early Bloomberg web interfaces or the Times New Roman of SEC filings) convey authority on paper but reduce readability on screens at the sizes used for UI headings. More importantly, mixing serif headings with sans-serif body creates visual inconsistency that undermines the "system" feeling. Sabit should feel like one system, not a document with a letterhead. However: the certification ceremony screen will use a single serif element (the attestation language) to invoke the legal-document register. This controlled exception reinforces the gravity of that specific moment.

### Complete Typography Specification

#### Font Stack

```css
/* Primary — UI text, labels, descriptions, body */
--font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI',
                 Roboto, 'Helvetica Neue', Arial, sans-serif;

/* Numeric — Financial figures, dollar amounts, percentages */
/* Same family, but with tabular-nums forced */
--font-numeric: 'Inter', sans-serif;
/* Applied via: font-variant-numeric: tabular-nums lining-nums; */

/* Monospace — Account codes, hash values, certificate IDs, audit trail entries */
--font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code',
              'SF Mono', Consolas, monospace;

/* Serif — ONLY used for certification attestation language */
--font-serif: 'Source Serif 4', 'Georgia', 'Times New Roman', serif;
```

#### Type Scale

The scale follows a 1.200 (minor third) ratio, starting from 13px as the base. 13px is the optimal size for financial data tables per Beymer et al. (2008) — 12px causes strain after 4 hours, 14px wastes precious horizontal space in multi-column tables.

| Token | Size (px) | Size (rem) | Weight | Line Height | Letter Spacing | Use Case |
|---|---|---|---|---|---|---|
| `--type-display` | 30px | 1.875rem | 600 (SemiBold) | 1.2 (36px) | -0.02em | Dashboard headline ("December 2025 Close"), portfolio company name on detail page |
| `--type-h1` | 24px | 1.5rem | 600 | 1.25 (30px) | -0.015em | Page titles ("Trial Balance", "Income Statement") |
| `--type-h2` | 20px | 1.25rem | 600 | 1.3 (26px) | -0.01em | Section headers ("Operating Expenses", "Reconciliation Summary") |
| `--type-h3` | 16px | 1rem | 600 | 1.375 (22px) | -0.005em | Card titles, subsection headers |
| `--type-h4` | 14px | 0.875rem | 600 | 1.4 (19.6px) | 0em | Small section labels, filter group headers |
| `--type-body` | 14px | 0.875rem | 400 (Regular) | 1.5 (21px) | 0em | Body text, descriptions, help text |
| `--type-body-strong` | 14px | 0.875rem | 500 (Medium) | 1.5 (21px) | 0em | Emphasized body text, form labels |
| `--type-table-header` | 11px | 0.6875rem | 600 | 1.3 (14.3px) | 0.06em | Table column headers — UPPERCASE, letter-spaced for visual distinction from data |
| `--type-table-cell` | 13px | 0.8125rem | 400 | 1.385 (18px) | 0em | Table data cells — the most common text element in the app |
| `--type-table-number` | 13px | 0.8125rem | 400 | 1.385 (18px) | 0.01em | Dollar amounts in tables — slightly increased letter-spacing aids comma reading |
| `--type-table-subtotal` | 13px | 0.8125rem | 600 | 1.385 (18px) | 0.01em | Subtotal rows — SemiBold weight distinguishes from data rows |
| `--type-table-total` | 14px | 0.875rem | 700 (Bold) | 1.385 (19.4px) | 0.01em | Total and Grand Total rows — larger and bolder |
| `--type-caption` | 12px | 0.75rem | 400 | 1.4 (16.8px) | 0.01em | Captions, footnotes, timestamps, metadata |
| `--type-caption-strong` | 12px | 0.75rem | 600 | 1.4 (16.8px) | 0.01em | Badge text, status labels |
| `--type-badge` | 11px | 0.6875rem | 600 | 1.0 (11px) | 0.04em | Small badges, tags, chips — UPPERCASE |
| `--type-mono` | 12px | 0.75rem | 400 | 1.5 (18px) | 0em | Hash values, certificate IDs, account codes |
| `--type-attestation` | 15px | 0.9375rem | 400 | 1.65 (24.75px) | 0em | Certification attestation language — uses --font-serif |

#### Financial Statement Typography Hierarchy

This hierarchy uses ONLY font weight, size, indentation, and the traditional accounting convention of single and double underlines. No background colors, no icons, no colored text. The numbers speak.

```
REVENUE                          (11px, SemiBold, uppercase, letter-spacing 0.06em, color --text-secondary)
  Product Revenue      1,234,567  (13px, Regular, indent 24px, color --text-primary)
  Service Revenue        456,789  (13px, Regular, indent 24px)
                       ---------  (single 1px solid line above subtotal, color --border-total-single)
Total Revenue          1,691,356  (13px, SemiBold, indent 0px, font-weight 600)
                                  (2px bottom margin before next section)

COST OF REVENUE                   (11px, SemiBold, uppercase, letter-spacing 0.06em, --text-secondary)
  Direct Costs           567,890  (13px, Regular, indent 24px)
  Direct Labor           234,567  (13px, Regular, indent 24px)
                       ---------
Total Cost of Revenue    802,457  (13px, SemiBold, indent 0px)

                       ---------
GROSS PROFIT             888,899  (14px, Bold 700, indent 0px, --text-number-total)
                       =========  (double 1px line below, 2px gap between lines)
```

The critical conventions:
- **Section headers** (Revenue, Cost of Revenue): 11px uppercase with letter-spacing, using `--text-secondary` color. These are labels, not data.
- **Line items**: 13px regular, indented 24px from the left margin. These are the raw data.
- **Sub-line items** (if any): 13px regular, indented 48px.
- **Subtotals**: 13px SemiBold (600), 0px indent, preceded by a single 1px solid line over the number column only.
- **Major totals** (Gross Profit, Operating Income, Net Income): 14px Bold (700), 0px indent, followed by a double underline (two 1px lines separated by 2px gap).
- **Grand Total** (Net Income, the final line): 14px Bold (700), 0px indent, double underline, and the row receives `--bg-certified` background (#F0F7F1) once the period is certified.

#### Number Formatting Rules

All dollar amounts use `font-variant-numeric: tabular-nums lining-nums;` and are right-aligned. Specific formatting:

- Positive amounts: `1,234,567` — no dollar sign in table cells (the column header says "USD"). No unnecessary decimals for whole amounts. If the column contains any cents, ALL rows show two decimals for alignment.
- Negative amounts: `(1,234,567)` — parenthetical notation, not minus signs. This is GAAP convention. Color: `--text-number-negative` (#B91C1C). The parentheses plus red color provide redundant encoding (color alone fails for color-blind users; parentheses alone are too subtle for quick scanning).
- Zero amounts: `—` — em dash, not "0" or "0.00" or "-". This reduces visual noise in sparse tables and is standard in financial reporting.
- Percentages: `12.3%` — one decimal unless context requires two. Right-aligned.
- Account codes: `4010` — JetBrains Mono, left-aligned.

---

## 3. LAYOUT ARCHITECTURE FOR FINANCIAL WORKFLOWS

### Navigation Architecture: Left Sidebar

**Decision: Fixed left sidebar, not top navigation.**

Rationale: Financial software requires vertical space for table rows. A top navigation bar consumes 56-64px of vertical space across every page — that is 2-3 table rows lost permanently. A left sidebar consumes horizontal space, but financial tables in Sabit have at most 6-8 columns; the tables do not need the full viewport width. Furthermore, a left sidebar provides a persistent visual anchor for orientation — critical when a controller is deep in reconciliation and needs to quickly navigate to the trial balance. Bloomberg, Refinitiv, and every institutional-grade financial tool uses sidebar navigation.

### Master Layout Specification

```
+------------------------------------------------------------------------------+
| VIEWPORT (min: 1280px, optimal: 1440px, max: 1920px)                        |
|                                                                              |
| +--------+-----------------------------------------------------------+      |
| |        | TOP HEADER BAR (height: 56px)                             |      |
| |        | [Entity selector] [Period selector]   [Notifications][User]|      |
| |        +-----------------------------------------------------------+      |
| |  NAV   |                                                           |      |
| |SIDEBAR |                    MAIN CONTENT AREA                      |      |
| |        |                                                           |      |
| |Width:  |  +-------------------------------------+ +---------------+|      |
| | 240px  |  |     PRIMARY CONTENT                 | |  CONTEXTUAL   ||      |
| |        |  |     (flex: 1, min-width: 680px)     | |  SIDEBAR      ||      |
| |Collap- |  |                                     | |  (width:320px)||      |
| |sible   |  |                                     | |  (conditional)||      |
| |to 64px |  |                                     | |               ||      |
| |        |  +-------------------------------------+ +---------------+|      |
| |        |                                                           |      |
| +--------+-----------------------------------------------------------+      |
+------------------------------------------------------------------------------+
```

### Exact Dimensions

| Element | Value | Notes |
|---|---|---|
| Sidebar width (expanded) | 240px | Fits "Reconciliation" and "Income Statement" without truncation |
| Sidebar width (collapsed) | 64px | Icons only, tooltip on hover |
| Top header height | 56px | Contains entity/period selectors, search, notifications, user avatar |
| Content area horizontal padding | 32px left, 32px right | |
| Content area top padding | 24px (below header) | |
| Content area bottom padding | 32px | |
| Contextual sidebar width | 320px | Appears on specific screens (mapping detail, reconciliation evidence) |
| Maximum content width | 1200px | Beyond this, content centers with equal margins. Financial tables should not stretch to 1920px — the eye cannot track a row across 1920px. |
| Minimum viewport width | 1280px | Below this, display "Sabit is designed for desktop use" with minimum graceful degradation |

### Table Dimensions

| Property | Value | Rationale |
|---|---|---|
| Table row height | 40px | 18px line-height + 11px top padding + 11px bottom padding. Taller than consumer SaaS (32px) because financial data requires more vertical breathing room to prevent row-reading errors. Shorter than a full "card-row" (48px+) to maximize data density. |
| Table header height | 44px | Slightly taller than data rows to create clear visual hierarchy. |
| Table cell horizontal padding | 12px (text columns), 16px (number columns) | Number columns get more padding for visual separation from adjacent columns. |
| Column min-widths | Account Code: 80px, Account Name: 200px, Type: 80px, Dollar amounts: 120px | Dollar amounts need 120px to fit "(1,234,567.89)" with padding. |
| Table border | Bottom border only on rows: 1px solid #EEEDE9 | Full grid borders create visual noise. Bottom-only borders create row lanes. |
| Table header border | Bottom border: 2px solid #D4D2CC | Thicker than data rows to emphasize the header/data boundary. |
| Pinned column shadow | `4px 0 8px -2px rgba(0,0,0,0.08)` on the right edge of pinned columns | When table scrolls horizontally, pinned columns cast a subtle shadow to indicate scroll state. |

### Financial Statement Indentation

| Level | Left Padding | Example |
|---|---|---|
| Level 0: Section header | 0px | "REVENUE" |
| Level 1: Line item | 24px | "Product Revenue" |
| Level 2: Sub-line item | 48px | "Domestic Product Revenue" |
| Level 3: Detail | 72px | Rarely used; exists for complex chart of accounts |
| Level 0: Subtotal/Total | 0px | "Total Revenue", "Gross Profit" |

### Card Specifications

| Property | Value |
|---|---|
| Card border-radius | 8px |
| Card border | 1px solid #E2E0DB |
| Card shadow | `0 1px 3px 0 rgba(0,0,0,0.04), 0 1px 2px -1px rgba(0,0,0,0.04)` |
| Card shadow (hover, if interactive) | `0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)` |
| Card header padding | 20px 24px |
| Card body padding | 0px 24px 24px 24px (if header present) or 24px (if no header) |
| Card header border-bottom | 1px solid #EEEDE9 |

### Spacing System (based on 4px grid)

| Token | Value | Usage |
|---|---|---|
| `--space-1` | 4px | Minimum gap, icon-to-text gap within tight elements |
| `--space-2` | 8px | Gap between badge and label, inline element spacing |
| `--space-3` | 12px | Cell padding, tight component internal padding |
| `--space-4` | 16px | Standard padding within small components, gap between related items |
| `--space-5` | 20px | Card header padding, form field vertical gap |
| `--space-6` | 24px | Card body padding, section gap within a page |
| `--space-8` | 32px | Major section gap, page padding |
| `--space-10` | 40px | Large section separation |
| `--space-12` | 48px | Page section dividers |
| `--space-16` | 64px | Major page sections (e.g., between dashboard zones) |

### Responsive Behavior

| Breakpoint | Width | Behavior |
|---|---|---|
| Desktop Large | 1440px+ | Full layout as specified above |
| Desktop Standard | 1280px-1439px | Contextual sidebar overlays rather than pushing content |
| Desktop Minimum | 1024px-1279px | Sidebar collapses to 64px (icons only). Contextual sidebar becomes a slide-out panel. |
| Below 1024px | <1024px | Full-screen message: "Sabit is designed for desktop browsers. For the best experience, please use a screen width of 1280 pixels or wider." No attempt at mobile responsiveness — this is professional financial software used during close week on workstation monitors. Attempting a mobile layout would compromise the precision that is the entire value proposition. |

### Grid System

The content area uses a 12-column CSS Grid with the following properties:

```css
.grid-layout {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 24px; /* --space-6 */
}
```

Dashboard cards snap to: 3-column (25%), 4-column (33.3%), 6-column (50%), 8-column (66.6%), 12-column (100%) widths.


---

## 4. TRUST SIGNALS IN FINANCIAL SOFTWARE

### 4.1 Verified vs. Unverified Data

Every piece of data in Sabit has a verification state. The visual treatment must make this state instantly apparent without requiring the user to click or hover.

**Verified data (deterministic computation or human-confirmed)**:
- No special indicator. Verified is the default expected state. Adding a green checkmark to every verified item creates visual noise and paradoxically reduces trust by implying that verification is exceptional rather than normal. The ABSENCE of any warning is the trust signal.
- Verified rows in tables: standard `--text-primary` color, no background tint.
- Verified financial statements: standard rendering.

**Unverified data (pending review, not yet confirmed)**:
- Left border treatment: 3px solid `--status-warning` (#B45309) on the left edge of the row or container.
- Background: `--status-warning-bg` (#FFFBEB) -- subtle yellow tint.
- A small "PENDING REVIEW" badge (11px uppercase, `--status-warning` text on `--status-warning-bg` background, 4px 8px padding, 4px border-radius) appears in the rightmost action column.
- Interactive: clicking the badge opens the review/confirm flow.

**Rejected data (failed gate, broken reconciliation)**:
- Left border treatment: 3px solid `--status-error` (#B91C1C).
- Background: `--status-error-bg` (#FEF2F2).
- "REQUIRES ATTENTION" badge in `--status-error` styling.

**Locked data (period is certified)**:
- Background: `--bg-certified` (#F0F7F1) -- green tint.
- A lock icon (16px, `--cert-lock-icon` color) appears inline before the period label.
- All interactive elements within locked data are disabled (opacity 0.5, cursor not-allowed).
- Tooltip on hover: "This period was certified by [Name] on [Date]. Data is locked."

### 4.2 The AI Trust Boundary

This is the most critical trust design decision in the entire application. The AI in Sabit classifies accounts and drafts audit justifications. It never touches numbers. The visual design must make this boundary absolutely unambiguous.

**AI-generated content is ALWAYS contained within a visually distinct region:**

Visual specifications for the AI container:
- **Border**: 1.5px dashed `--ai-border` (#DDD6FE). Dashed, never solid. The visual language: dashed means "provisional, awaiting your decision."
- **Background**: `--ai-bg` (#F5F0FF). The lavender tint is immediately distinguishable from the white of system-computed data and the warm off-white of the page background.
- **Border-radius**: 8px.
- **Padding**: 16px.
- **Badge**: Always present. The "AI SUGGESTED" badge uses a star/sparkle icon (14px SVG) to the left of the text. The sparkle is the universal "AI" symbol established by industry convention.
- **Content within**: Uses standard `--text-primary` for readability, but the container boundary makes clear this content has a different provenance.

The AI container structure:

- Top-left: Badge reading "AI SUGGESTED" (11px uppercase, #5B21B6 on #EDE9FE, 4px border-radius)
- Body: Suggested mapping text, e.g. "4010 -> Revenue - Product"
- Confidence bar: 120px wide, 6px tall, #7C3AED fill, #E5E7EB track
- Justification text in standard body style
- Action buttons: [Accept] [Modify] [Reject] inside the AI region

**Confidence score visualization:**
- Horizontal bar, 120px wide, 6px tall, border-radius 3px.
- Fill: `--ai-primary` (#7C3AED) for the filled portion.
- Track: `--border-default` (#E2E0DB) for the unfilled portion.
- Numeric label: "94%" in `--type-caption-strong` (12px SemiBold), color `--ai-primary`.
- Color thresholds: 90-100% fill is `--ai-primary` (#7C3AED). 70-89% is `--status-warning` (#B45309). Below 70% is `--status-error` (#B91C1C) and the suggestion gets a "LOW CONFIDENCE" secondary badge.

**When AI content is accepted by a human:**
- The dashed border becomes solid `--border-default` (#E2E0DB).
- The background changes from `--ai-bg` to `--bg-surface` (#FFFFFF).
- The "AI SUGGESTED" badge changes to "ACCEPTED" in green (`--status-success` on `--status-success-bg`), with a smaller "(originally AI-suggested)" caption below in 11px `--text-tertiary`.
- The confidence bar disappears.
- The Accept/Modify/Reject buttons are replaced by "[Edit]" link.

This transition visually communicates: "A human has taken ownership of this decision. It is no longer provisional."

**What the AI never touches (and how to show it):**
- Dollar amounts are never inside an AI-bordered region.
- Financial totals have NO AI badge, NO purple, NO dashed borders.
- If a financial statement line item was classified by AI, the line item itself renders normally in the statement. But in the account mapping screen, the mapping that drove that classification shows its AI provenance. The separation: AI informs WHERE a number appears; arithmetic determines WHAT the number is.

### 4.3 The Certification Ceremony

The certification moment is the most important interaction in the entire application. A CFO is attaching their professional name to the accuracy of these financial statements. It must feel like signing a legal document -- solemn, deliberate, irreversible.

**Visual metaphor: The signing of a legal document, not the submission of a web form.**

Key elements:
- **Attestation language in serif font** (`--font-serif`, 15px, line-height 1.65) -- the only place in the entire application that uses serif typography. This signals "legal document" instantly. The attestation reads like a legal statement, not a UI label.
- **Pre-sign gate checklist**: A vertical list of requirements, each with a green checkmark icon (20px, `--status-success`) and the check description. ALL gates must be green before the sign button activates. Failed gates show a red X (20px, `--status-error`) and the sign button remains disabled with explanatory text.
- **The signature action**: NOT a standard button. A rectangular field (width: 360px, height: 56px) with a 2px solid `--cert-primary` (#14532D) border, interior label "Click to apply digital signature" in 14px SemiBold, centered. When clicked, it triggers a modal confirmation.
- **Confirmation modal**: Dark overlay (#0A0A08 at 52% opacity). Centered white card (480px wide). The modal contains: the attestation text again in full, the signer name and title (pulled from their profile), a timestamp in `--font-mono`, and two buttons: "Cancel" (secondary) and "Sign and Certify" (primary, but in `--cert-primary` green instead of standard `--interactive-primary` blue to semantically signal "finality" rather than "action").
- **Post-signature state**: The financial statement receives a seal overlay in the header area -- a circular seal element (64px diameter) with a double-ring border in `--cert-gold` (#A16207), containing a checkmark icon in `--cert-primary`. Next to it: "Certified by [Name], CPA" in 14px SemiBold, and the date-time in 12px `--font-mono`. The entire page background shifts to `--cert-bg` (#F7FBF8). All edit controls disappear. The page becomes read-only with the visual permanence of a printed, signed document.

### 4.4 Audit Trail Immutability

Every action in Sabit is logged in an immutable audit trail. The visual design must convey "this cannot be altered."

**Audit trail entries use:**
- `--font-mono` (JetBrains Mono, 12px) for all content -- monospace font signals "system log, machine-generated, untouched."
- Background: `--bg-surface-sunken` (#F1F0EC) -- inset appearance signals "this is a record, not interactive content."
- Each entry has: timestamp (left-aligned, `--text-secondary`), actor name (left-aligned, `--text-primary`), action description, and a truncated hash (8 characters) of the entry in `--text-tertiary` with a copy icon.
- Entries are separated by 1px `--border-subtle` bottom borders.
- The trail scrolls vertically with the most recent entry at the top.
- A "Chain Integrity: Verified" indicator at the top of the trail list: a small shield icon (16px, `--status-success`) with text in 12px SemiBold `--status-success`.

### 4.5 Status Indicators

A unified status system used across all screens:

| Status | Shape | Color | Background | Label | Use |
|---|---|---|---|---|---|
| Complete/Passed | Circle with checkmark, 18px | `--status-success` (#15803D) | `--status-success-bg` (#F0FDF4) | "COMPLETE" or "PASSED" | Gate passed, reconciliation balanced, mapping confirmed |
| In Progress | Circle, half-filled, 18px | `--interactive-primary` (#1A5FB4) | `--status-info-bg` (#EFF6FF) | "IN PROGRESS" | Active workflow step, partial reconciliation |
| Pending Review | Circle, empty outline, 18px | `--status-warning` (#B45309) | `--status-warning-bg` (#FFFBEB) | "PENDING" | Awaiting human review, AI suggestion not yet acted on |
| Failed/Error | Circle with X, 18px | `--status-error` (#B91C1C) | `--status-error-bg` (#FEF2F2) | "FAILED" or "EXCEPTION" | Gate failed, reconciliation unbalanced, variance exceeded threshold |
| Not Started | Circle, empty outline, dashed, 18px | `--status-neutral` (#5C5C5C) | `--status-neutral-bg` (#F5F5F3) | "NOT STARTED" | Step not yet begun |
| Locked/Certified | Lock icon, 18px | `--cert-primary` (#14532D) | `--bg-certified` (#F0F7F1) | "CERTIFIED" | Period locked and signed |

**Shapes matter**: Circles for all statuses maintain consistency. The interior treatment (check, X, half-fill, empty, dashed) provides discrimination for color-blind users. Status is NEVER communicated by color alone.

### 4.6 Conveying Deterministic Computation

To communicate "this number was computed by deterministic arithmetic and is provably correct," the design uses:

- **No AI badge** -- the absence of an AI indicator IS the trust signal. Numbers without the purple AI boundary are by definition system-computed.
- **Computation provenance tooltip**: Hovering over any total or computed figure shows a tooltip with the computation formula. Example: hovering over "Gross Profit: 888,899" shows "Revenue (1,691,356) minus Cost of Revenue (802,457) = 888,899". Font: `--font-mono`, 12px. Background: `--bg-nav` (dark). Text: `--text-inverse`.
- **"All Debits = All Credits" indicator**: On the trial balance screen, a persistent banner at the top shows "Total Debits: 5,234,567 | Total Credits: 5,234,567 | Difference: 0" with a green checkmark when balanced. If there is any difference, this banner turns red with the difference amount and an exclamation mark. This is the most fundamental trust indicator in the entire system.
- **Hash chain badge**: On financial statements, a small "Traceable to GL" badge (12px, `--text-secondary`, with a chain-link icon) indicates the number can be traced back to the uploaded general ledger through deterministic arithmetic.


---

## 5. THE 10 MOST IMPORTANT SCREENS

### SCREEN 1: LOGIN

**Purpose**: First impression. Must communicate "this is serious financial software where professionals sign their names to numbers."

**Visual Hierarchy** (most to least important):
1. Product mark and name
2. Login form
3. Security indicators
4. Background atmosphere

**Layout**:
- Full viewport, no scroll.
- Two-panel layout: left 55% (brand panel), right 45% (login panel).
- Left panel: `--bg-nav` (#1B1F27) background -- the same dark navy-charcoal as the in-app sidebar, creating brand consistency from first contact.
- Right panel: `--bg-base` (#F8F7F4) -- warm off-white.

**Left Panel -- Brand Atmosphere**:
- Vertically and horizontally centered content block.
- Product name "SABIT" in 42px, weight 700 (Bold), letter-spacing 0.12em, color #FFFFFF. All uppercase. The wide letter-spacing conveys institutional formality -- like the nameplate of a financial institution, not the logo of a consumer app. Font: Inter.
- Below, 8px gap: tagline "Financial Close Engine" in 16px, weight 400, letter-spacing 0.08em, color `--text-inverse-secondary` (#A0A4AB). Uppercase.
- 48px below the tagline: a single horizontal line, 80px wide, 1px tall, color `--text-inverse-secondary` at 40% opacity. This is a visual pause -- a separator that says "what follows is different."
- 32px below the line: "Deterministic financial statements. Every dollar provably correct." in 15px, weight 400, line-height 1.6, color `--text-inverse-secondary`. Sentence case. Maximum width 320px, left-aligned to the centered block. This is the only sentence on the login page, and it states the product core promise.
- No decorative images, no gradients, no illustrations, no background patterns. The left panel is almost entirely empty dark space. This negative space is a deliberate trust signal -- it says "we do not need to convince you with visuals; the product speaks for itself." Consumer SaaS logins use hero images and testimonials because they must sell. Enterprise financial software uses restraint because the buyer already committed.

**Right Panel -- Login Form**:
- Vertically centered, horizontally centered with 64px left/right padding.
- Maximum form width: 360px.
- "Sign In" heading: 24px, weight 600, `--text-primary` (#1A1A1A). 0px top margin (centered vertically).
- 8px below heading: "Enter your credentials to continue." in 14px, weight 400, `--text-secondary` (#5C5C5C).
- 32px below subtext: Email field.
  - Label: "Email Address" in 13px, weight 500, `--text-primary`. Label is ABOVE the field, not inside it (placeholders disappear on focus, creating disorientation).
  - Input field: width 100% (360px), height 44px, background `--bg-surface-sunken` (#F1F0EC), border 1px solid `--border-default` (#E2E0DB), border-radius 6px, font 14px Regular, padding 0 12px. Placeholder text: "you@company.com" in `--text-tertiary` (#8A8A8A).
  - Focus state: border-color `--border-focus` (#1A6CB4), box-shadow `0 0 0 3px rgba(26, 95, 180, 0.12)`, background transitions to #FFFFFF.
- 20px below email field: Password field (identical styling, with show/hide toggle icon at 20px, right-aligned inside the field, `--text-tertiary`, clickable).
- 12px below password field: "Forgot password?" link, right-aligned, 13px, `--text-link` (#1A6CB4), no underline (underline on hover).
- 32px below: Sign In button. Width 100%, height 48px, background `--interactive-primary` (#1A5FB4), color white, 15px SemiBold (600), border-radius 6px, no border, cursor pointer. Hover: `--interactive-primary-hover` (#154A8F). Active: `--interactive-primary-pressed` (#0F3668). The button is intentionally taller (48px vs the standard 40px) to create visual weight for the primary action.
- 24px below: horizontal rule with "or" centered (a visual divider). 1px solid `--border-default`, with "or" in 12px `--text-tertiary` on a `--bg-base` background chip.
- 16px below: SSO button. Width 100%, height 44px, background `--bg-surface` (#FFFFFF), border 1px solid `--border-default`, border-radius 6px, 14px Medium (500) `--text-primary`. Text: "Continue with SSO". Hover: background `--interactive-secondary-hover` (#F0F4FA), border-color `--border-strong`.

**Security Indicators (bottom of right panel)**:
- Positioned 32px from the bottom of the right panel, centered.
- A row of three items separated by 12px " | " dividers in `--text-tertiary`:
  - Shield icon (14px) + "SOC 2 Type II" in 11px SemiBold uppercase `--text-tertiary`
  - Lock icon (14px) + "256-bit Encryption" in same
  - Checkmark-shield icon (14px) + "AICPA Compliant" in same
- These are not decorative. Controllers and CFOs evaluate software security during procurement. Seeing compliance badges on the login page reinforces the decision to trust this system with financial data.

**Loading/Error States**:
- Login button loading: text changes to "Signing In..." with a 16px spinner icon to the left (white, 2px stroke, animates with CSS rotation at 0.8s per cycle). Background color does not change. Button becomes `pointer-events: none`.
- Error: A banner appears between the password field and the Sign In button. 12px vertical margin above and below. Background `--status-error-bg`, border 1px solid `--status-error-border`, border-radius 6px, padding 12px 16px. Error icon (16px, `--status-error`) left-aligned, error message right of icon in 13px Regular `--status-error`. Example: "Invalid email or password. Please try again."

---

### SCREEN 2: CONTROLLER DASHBOARD

**Purpose**: The command center during close week. A controller opens this at 7 AM and it tells them exactly where things stand and what needs their attention. Dense but navigable.

**Visual Hierarchy** (most to least important):
1. Period status and close progress
2. Attention items (what needs action NOW)
3. Gate status pipeline
4. Summary metrics
5. Recent activity

**Layout**:
- Full width of content area (up to 1200px centered).
- No contextual sidebar on this screen.
- Four zones stacked vertically, with horizontal subdivision within zones.

**Zone 1: Page Header (height: approximately 100px including padding)**

Top left: page title "Close Dashboard" in `--type-h1` (24px SemiBold), `--text-primary`.
Same line, right-aligned: Entity name ("Acme Holdings LLC") in 14px Medium `--text-secondary`, a 6px gray dot separator, and the period "December 2025" in 14px SemiBold `--text-primary`, followed by a status badge -- either "IN PROGRESS" (blue badge, as defined in section 4.5) or "CERTIFIED" (green lock badge).

Below the title line, 8px gap: a single-line text -- "Close started Dec 28. Day 4 of 10. Target: Jan 6." -- in 13px Regular `--text-secondary`. This gives the controller temporal orientation without requiring them to count.

Below, 16px gap: a horizontal progress bar (full content width, 8px tall, border-radius 4px).
- Track: `--border-default` (#E2E0DB).
- Fill: a gradient from `--interactive-primary` (#1A5FB4) on the left to a lighter `#3B82F6` on the right, clipped to the current progress percentage.
- Above the bar, right-aligned to the fill point: the percentage "64%" in 12px SemiBold `--interactive-primary`.
- Below the bar, right-aligned: "5 of 8 gates passed" in 12px Regular `--text-secondary`.

**Zone 2: Attention Items + Summary Metrics (two columns, 8-column + 4-column grid)**

Left column (8 of 12 grid columns): **"Needs Your Attention" Card**

- Card with `--bg-surface` background, standard card border and shadow.
- Card header: "Needs Your Attention" in `--type-h3` (16px SemiBold), with a count badge "4" in a circle (20px diameter, `--status-error` background, white text, 11px Bold) to the right of the title.
- Card body: A list of 4-6 items, each item is a row (height 52px, bottom border 1px `--border-subtle`):
  - Left: Status icon (18px, as defined in section 4.5 -- red X for errors, amber circle for pending).
  - 12px gap.
  - Middle (flex: 1): Primary text in 13px Medium `--text-primary` ("Reconciliation: Operating Cash Account -- $14,230 unexplained variance"). Secondary text below in 12px Regular `--text-secondary` ("Bank balance: $234,567 | GL balance: $248,797").
  - Right: A ghost button "Resolve" in 13px Medium `--text-link`.
- If there are more than 5 items, the card shows 5 with a "View all 12 items" link at the bottom (13px `--text-link`).
- If there are ZERO attention items: the card shows a centered illustration-free message "No items need your attention" in 14px `--text-secondary` with a green checkmark icon (24px). This moment of calm in close week is worth celebrating with visual relief.

Right column (4 of 12 grid columns): **Summary Metrics Stack**

Four small metric cards stacked vertically with 16px gap between them. Each card:
- `--bg-surface` background, standard card styling.
- Padding: 16px 20px.
- Top: Label in 12px SemiBold uppercase `--text-secondary`, letter-spacing 0.04em. ("TOTAL ACCOUNTS", "MAPPED ACCOUNTS", "RECONCILED", "VARIANCE").
- Below, 4px gap: Value in 28px SemiBold `--text-primary` ("79", "76/79", "18/24", "$14,230").
- The "VARIANCE" card uses `--text-number-negative` (#B91C1C) for the value if variance is non-zero, and `--status-success` (#15803D) with "$0" if all variances are resolved.
- Below value, 4px gap: a micro progress bar (full card width, 4px tall, border-radius 2px) showing completion ratio. Fill color matches the status (blue for in-progress, green for complete).

**Zone 3: Gate Status Pipeline (full width)**

24px below Zone 2. A horizontal pipeline showing all gates in order. This is the visual backbone of the close workflow.

Card container, full width. Card header: "Close Workflow Gates" in `--type-h3`. Card body:

A horizontal sequence of 8 gate items connected by a line. Each gate:
- Width: calculated as (content-width - 7 x 16px gap) / 8. On a 1136px content area (1200px - 64px padding), that is approximately 128px per gate.
- Vertical layout within each gate:
  - Status icon (24px, centered): green check, blue half-circle, amber empty circle, red X, or gray dashed circle (per section 4.5).
  - 8px below: Gate name in 12px SemiBold `--text-primary`, centered, max 2 lines ("Trial Balance Upload", "Account Mapping", "Reconciliation", "Adjustments", "Statement Generation", "Variance Review", "CFO Review", "Certification").
  - 4px below: Status label in 11px Regular, color matching the status color, centered ("Complete", "In Progress", "Not Started", etc.).
- Connecting line between gates: a horizontal line at the vertical center of the status icon, 1px solid. The line is `--status-success` between completed gates and `--border-default` between incomplete gates.
- The current active gate has a subtle glow: `box-shadow: 0 0 0 4px rgba(26, 95, 180, 0.12)` around the icon.

**Zone 4: Recent Activity (full width)**

24px below Zone 3. A card with the last 10 audit trail entries.
- Card header: "Recent Activity" in `--type-h3`, with a "View Full Audit Trail" link right-aligned in 13px `--text-link`.
- Card body: list of entries. Each entry is a row (40px height):
  - Timestamp in `--font-mono` 12px `--text-tertiary` (left, 140px fixed width). Format: "Dec 31, 2:14 PM".
  - Actor avatar (24px circle, initials in 11px Bold white on `--interactive-primary` background) -- only if different from the previous entry, otherwise invisible (prevents visual stuttering).
  - 8px gap.
  - Action description in 13px Regular `--text-primary`. Example: "Uploaded general ledger (2,847 entries, $5.2M total)."
  - Action type badge right-aligned: "UPLOAD" / "MAPPING" / "RECONCILIATION" etc. in 10px SemiBold uppercase, `--text-secondary` on `--status-neutral-bg`, 3px 6px padding, border-radius 3px.

---

### SCREEN 3: TRIAL BALANCE

**Purpose**: 79 accounts, 6 columns. The controller scans this to verify the GL upload is correct and to get an overview of all balances. This is the foundational data view.

**Visual Hierarchy**:
1. Debit/Credit balance indicator (MUST balance)
2. The data table
3. Filters and search
4. Export actions

**Layout**:

**Balance Banner (sticky, pinned to top of content area)**

A horizontal banner, full content width, height 48px, background `--bg-surface`, bottom border 2px solid `--status-success` (if balanced) or 2px solid `--status-error` (if unbalanced). Padding: 0 24px. Flex layout, items centered vertically.

When balanced:
- Left: Green checkmark icon (20px) + "Trial Balance: In Balance" in 14px SemiBold `--status-success`.
- Center: "Total Debits: $5,234,567.00" in 13px `--font-mono` Regular `--text-primary`, 24px gap, "Total Credits: $5,234,567.00" in same, 24px gap, "Difference: $0.00" in same but `--status-success` color.
- Right: "as of Dec 31, 2025" in 12px Regular `--text-tertiary`.

When unbalanced:
- Banner border becomes `--status-error`.
- Left icon becomes red exclamation (20px) + "Trial Balance: OUT OF BALANCE" in 14px SemiBold `--status-error`.
- "Difference: $1,234.00" in `--status-error` color, Bold.
- Entire banner background shifts to `--status-error-bg` (#FEF2F2).

**Toolbar Row (below banner, 16px gap)**

Height: 44px. Flex layout.
- Left: Search input (width 280px, height 36px, `--bg-surface-sunken` background, magnifying glass icon inside left, placeholder "Search accounts..." in 13px). Standard focus styling.
- 12px gap: Filter dropdown "Type" (Select, height 36px, width 140px, options: All, Asset, Liability, Equity, Revenue, Expense). Styled with `--bg-surface` background, `--border-default` border, 13px Regular text, 6px border-radius, chevron-down icon right.
- 12px gap: Filter dropdown "Balance" (All, Debit, Credit, Zero).
- Right-aligned: "Export CSV" button (secondary style, 36px height, 13px Medium). 8px gap. "Print" button (ghost style, 36px height).

**The Table**

Below toolbar, 16px gap. The table occupies the remaining vertical space (scrollable).

Table header row (44px height, `--bg-surface-sunken` #F1F0EC background, sticky top):

| Column | Width | Alignment | Header Text |
|---|---|---|---|
| Account Code | 100px | Left | "ACCT CODE" |
| Account Name | flex: 1 (fills remaining) | Left | "ACCOUNT NAME" |
| Type | 100px | Left | "TYPE" |
| Debit | 140px | Right | "DEBIT (USD)" |
| Credit | 140px | Right | "CREDIT (USD)" |
| Net Balance | 140px | Right | "NET BALANCE" |

Header text: `--type-table-header` (11px SemiBold uppercase, letter-spacing 0.06em, `--text-secondary`). Bottom border: 2px solid `--border-table-header`.

Data rows (40px height each):
- Account Code: `--font-mono`, 13px Regular, `--text-primary`. Example: "1010".
- Account Name: 13px Regular, `--text-primary`. Example: "Cash and Cash Equivalents". Truncated with ellipsis if longer than the column.
- Type: 12px Regular, `--text-secondary`. A small chip badge with subtle background: "Asset" on `--status-info-bg`, "Liability" on `--status-warning-bg`, "Revenue" on `--status-success-bg`, "Expense" on `--status-error-bg`, "Equity" on `--ai-badge-bg`. This color coding creates scannable visual lanes by account type.
- Debit: `--font-numeric` (Inter with tabular-nums), 13px Regular, right-aligned, `--text-primary`. Displays "$1,234,567" or em-dash if zero.
- Credit: Same styling as Debit.
- Net Balance: Same styling but negative values in parentheses with `--text-number-negative` color.

Row styling:
- Alternating rows: even rows get `--bg-table-row-alt` (#FAFAF6).
- Hover: `--bg-table-row-hover` (#F0EFE8).
- Bottom border: 1px solid `--border-subtle` (#EEEDE9).
- Clickable: entire row is clickable (cursor: pointer). Clicking expands an inline detail panel below the row (see below).

**Row Expansion (account detail inline)**:
- When a row is clicked, an expansion panel appears below it. Height: auto (content-dependent). Background: `--bg-surface-sunken`. Padding: 16px 24px. Left border: 3px solid `--interactive-primary`.
- Contains: Account description (if any), last 5 journal entries contributing to this balance (mini-table: Date, Description, Amount -- 3 columns, compact 32px rows), and a "View Full Account Detail" link.
- Clicking the expanded row again collapses it.

**Footer (sticky bottom, pinned)**:

Height: 52px. Background: `--bg-surface`. Top border: 2px solid `--border-table-header`.
- The footer row shows totals. Account Code column: blank. Account Name column: "TOTAL" in 14px Bold uppercase. Type column: blank. Debit column: total debits in `--type-table-total` (14px Bold, `--text-number-total`). Credit column: total credits in same. Net Balance: total net balance in same. If balanced, Net Balance shows "$0" in `--status-success` Bold.

The footer row has a subtle `--bg-certified` (#F0F7F1) background tint when the totals balance.

**Empty State**: If no accounts are loaded (pre-upload), the table area shows: centered vertically, an upload-cloud icon (48px, `--text-tertiary`), below: "Upload your General Ledger to begin" in 16px Medium `--text-secondary`, below: "Drop a CSV or Excel file here, or" + "Browse Files" button (primary, 40px height). The upload interaction begins here.

---

### SCREEN 4: ACCOUNT MAPPING

**Purpose**: AI suggests how each GL account maps to the financial statement line items. The controller reviews, accepts, modifies, or rejects each suggestion. This is where the AI trust boundary is most critical.

**Visual Hierarchy**:
1. Mapping progress (how much is done)
2. AI suggestions requiring review
3. Confirmed mappings
4. Manual override option

**Layout**:

**Header Area**:
- Page title "Account Mapping" in `--type-h1`.
- Right-aligned: "Auto-accept High Confidence (>95%)" toggle switch (off by default). Label in 13px Medium `--text-secondary`. Standard toggle: 44px wide, 24px tall, track in `--border-default` when off, `--status-success` when on, thumb 20px white circle.
- Below title, 8px: progress text "62 of 79 accounts mapped (78%)" in 13px Regular `--text-secondary`, with a progress bar below (full width, 6px tall, `--interactive-primary` fill).

**Mapping Table**:

7 columns:

| Column | Width | Content |
|---|---|---|
| Account Code | 80px | GL account code, `--font-mono` |
| Account Name | flex: 1 (200px min) | GL account name |
| GL Type | 80px | Asset/Liability/etc. chip |
| Suggested Mapping | 200px | AI suggested financial statement line |
| Confidence | 100px | Confidence score + bar |
| Status | 100px | Badge: Pending/Accepted/Rejected/Manual |
| Actions | 120px | Accept/Reject buttons |

Table header: standard `--type-table-header` styling.

**Row variants based on status:**

*Pending AI Suggestion (not yet reviewed)*:
- Full row background: `--ai-bg` (#F5F0FF).
- Left border: 3px solid `--ai-primary` (#7C3AED).
- "Suggested Mapping" cell shows the AI suggestion with a tiny "AI" sparkle badge (inline, 10px) before the text.
- "Confidence" cell: percentage in 12px SemiBold (color: `--ai-primary` if >90%, `--status-warning` if 70-89%, `--status-error` if <70%) + horizontal bar (60px wide, 4px tall).
- "Status" cell: "PENDING" badge in `--status-warning` styling (11px uppercase, amber).
- "Actions" cell: "Accept" button (compact, 28px height, 12px SemiBold, `--status-success` background, white text, 4px border-radius, 8px 12px padding) and "Reject" link (12px `--status-error`, no background).

*Accepted (AI suggestion confirmed by human)*:
- Background: `--bg-surface` (white).
- No left border.
- "Suggested Mapping" cell: shows the mapping text normally, no sparkle badge.
- "Status" cell: "ACCEPTED" badge in `--status-success` styling (green).
- "Actions" cell: "Edit" link in 12px `--text-link`.

*Rejected (AI suggestion rejected, needs manual mapping)*:
- Background: `--status-error-bg` (#FEF2F2).
- Left border: 3px solid `--status-error`.
- "Suggested Mapping" cell: strikethrough text in `--text-tertiary`, with a "Select mapping..." dropdown below.
- "Status" cell: "NEEDS MAPPING" badge in `--status-error` styling.
- "Actions" cell: "Save" button (primary style, compact) once manual selection is made.

*Manual Override*:
- Background: white.
- Left border: 3px solid `--status-info` (#1A5FB4).
- "Status" cell: "MANUAL" badge in blue styling.
- A small caption below the mapping: "Overridden from AI suggestion: [original]" in 11px `--text-tertiary`.

**Batch Actions Bar** (appears when multiple rows are selected via checkboxes):
- Sticky bar at the bottom of the table, 52px height, `--bg-nav` (#1B1F27) background, text white.
- Left: "12 accounts selected" in 14px Medium white.
- Right: "Accept All" button (green), "Reject All" button (ghost, white border), "Clear Selection" link.

**Contextual Sidebar (320px, slides in from right when a row is expanded)**:
- Shows the full AI reasoning for the selected account.
- Header: "AI Classification Detail" with "AI SUGGESTED" badge.
- Body (inside the AI-bordered container -- dashed 1.5px `--ai-border`, `--ai-bg` background):
  - "Suggested Mapping: Revenue - Product" in 14px SemiBold.
  - "Confidence: 94%" with full confidence bar.
  - Section: "Reasoning" (13px body text): the AI explanation of why this classification was chosen.
  - Section: "Similar Accounts" (mini-table): other accounts classified the same way, for pattern verification.
  - Section: "Historical Mapping" (if available): how this account was mapped in prior periods.
- Below the AI container: "Override" button (secondary) to manually select a different mapping.

---

### SCREEN 5: RECONCILIATION

**Purpose**: Bank balance vs GL balance vs reconciling items. The controller reconciles each account and uploads evidence. Must reduce anxiety about discrepancies -- present them as routine tasks, not emergencies.

**Visual Hierarchy**:
1. Reconciliation summary (how many done, how many remain)
2. Individual reconciliation status per account
3. Reconciling item details
4. Evidence upload

**Layout**:

**Summary Bar** (full width, below page header):
Three summary cards in a horizontal row (3 equal columns):

Card 1: "RECONCILED" -- count and progress bar in `--status-success`.
Card 2: "IN PROGRESS" -- count and progress bar in `--interactive-primary`.
Card 3: "NOT STARTED" -- count and progress bar in `--status-neutral`.

Each card: 100px height, `--bg-surface` background, standard card styling, centered content. Number in 28px SemiBold. Label in 12px SemiBold uppercase.

**Account List (left 60% of content area)**:

A vertical list of accounts requiring reconciliation. Each account is a card-row:
- Height: 72px.
- Left: status icon (24px, per section 4.5).
- 16px gap.
- Middle (flex: 1): Account name in 14px Medium `--text-primary` ("Operating Cash Account -- Chase ****4521"). Below: "GL Balance: $248,797.00 | Bank Balance: $234,567.00" in 12px `--font-mono` `--text-secondary`.
- Right: Variance amount. If zero: "$0.00" in `--status-success`. If non-zero: "$14,230.00" in 14px SemiBold `--text-number-negative`, with "UNEXPLAINED" badge below in `--status-error` styling.
- Clickable: entire card-row. Clicking shows the detail in the right panel.
- Selected state: left border 3px `--interactive-primary`, background `--bg-table-row-selected`.

**Reconciliation Detail Panel (right 40% of content area)**:

When an account is selected, this panel shows:

**Header**: Account name in 16px SemiBold. Status badge right-aligned.

**Balance Comparison Block**: A visual layout showing:

- Two balance boxes side by side with "vs" between them
- Left box: "GL BALANCE" label (11px SemiBold uppercase --text-secondary), "$248,797.00" value (18px SemiBold --text-primary)
- Right box: "BANK BALANCE" label and value in same styling
- Each balance box: 160px wide, 80px tall, `--bg-surface-sunken` background, 8px border-radius, centered content
- Below both boxes, centered: "DIFFERENCE: $14,230.00"
- Difference styling: If non-zero: 16px Bold `--text-number-negative` with a warning icon. If zero: 16px Bold `--status-success`.

**Reconciling Items Table**:
- Below the balance block, 24px gap.
- Header: "Reconciling Items" in `--type-h3`, with "Add Item" button (secondary, compact) right-aligned.
- Table columns: Date (80px), Description (flex: 1), Amount (120px right-aligned), Type (100px -- "Outstanding Check" / "Deposit in Transit" / "Bank Fee" / "Other"), Evidence (80px -- paperclip icon if attached, empty if not).
- Each item row: 40px height, standard table styling.
- Below table: "Explained Amount: $12,100.00" and "Remaining Unexplained: $2,130.00" in a summary row.
- If Remaining Unexplained is $0.00: "Mark as Reconciled" button activates (primary green `--status-success`).
- If non-zero: "Mark as Reconciled" button is disabled with tooltip "Resolve all reconciling items first."

**Evidence Upload Zone**:
- Below reconciling items, 16px gap.
- Drop zone: dashed 2px `--border-default` border, 120px height, border-radius 8px, centered content.
- Interior: cloud-upload icon (32px, `--text-tertiary`), text "Drop evidence here or click to upload" in 13px `--text-secondary`.
- Accepted file types: PDF, PNG, JPG, XLSX, CSV. Listed below in 11px `--text-tertiary`.
- Uploaded files appear as chips below the drop zone: filename (truncated to 24 chars), file type icon, size, "x" remove button. Chip: `--bg-surface-sunken` background, 8px border-radius, 32px height, 8px 12px padding.


---

### SCREEN 6: INCOME STATEMENT

**Purpose**: The GAAP income statement. Revenue through Net Income. Every line traces to the GL. This is a financial statement that professionals will print, review, and sign.

**Visual Hierarchy**:
1. Statement identification (entity, period, basis)
2. The numbers (the actual financial statement)
3. Certification status
4. Drill-down capability

**Layout**:

**Statement Header**:
- Centered text block (maximum width 600px, centered in content area). This mimics the centering convention of printed financial statements.
- Line 1: Entity name "ACME HOLDINGS LLC" in 14px SemiBold uppercase, letter-spacing 0.06em, `--text-primary`. Centered.
- Line 2: "STATEMENT OF OPERATIONS" in 12px SemiBold uppercase, letter-spacing 0.08em, `--text-secondary`. Centered.
- Line 3: "For the Period Ended December 31, 2025" in 13px Regular, `--text-secondary`. Centered.
- Line 4: "(Expressed in United States Dollars)" in 12px Regular italic, `--text-tertiary`. Centered.
- Below: 24px gap, then 1px `--border-default` full-width horizontal line.

**Certification Seal (if certified)**:
- Positioned in the top-right of the statement area, 8px from the top, 0px from the right.
- Circular seal: 56px diameter, border 2px solid `--cert-gold` (#A16207), inner border 2px solid `--cert-primary` (#14532D) with 2px gap. Interior: checkmark icon 20px `--cert-primary`.
- Below seal: "Certified" in 11px SemiBold `--cert-primary`. "Jan 5, 2026" in 10px `--font-mono` `--text-tertiary`.

**The Financial Statement Table**:

This is NOT a standard data table. It is a financial statement rendered as structured typography. It uses a two-column layout: Description (left, flex: 1) and Amount (right, 160px).

No visible table borders. No header row. No alternating row colors (these would make it look like a data table, not a financial statement). The visual hierarchy is achieved entirely through indentation, font weight, and accounting underlines.

Content area: max-width 800px, centered. This narrower width improves readability and matches the proportions of a printed financial statement.

The complete Income Statement structure:

**REVENUE** (Section Header: 11px SemiBold uppercase, letter-spacing 0.06em, --text-secondary, indent 0px)
- Product Revenue: 1,234,567 (Line item: 13px Regular, --text-primary, indent 24px)
- Service Revenue: 456,789 (Line item: 13px Regular, indent 24px)
- (Single 1px solid line over amount column)
- Total Revenue: 1,691,356 (Subtotal: 13px SemiBold 600, indent 0px)

**COST OF REVENUE** (Section Header)
- Direct Costs: 567,890
- Direct Labor: 234,567
- (Single line)
- Total Cost of Revenue: 802,457

- (Single line)
- **GROSS PROFIT: 888,899** (Major Total: 14px Bold 700, --text-number-total, indent 0px)
- (Double underline: two 1px lines, 2px gap)

**OPERATING EXPENSES** (Section Header)
- Sales and Marketing: 234,567
- General and Administrative: 156,789
- Research and Development: 89,012
- Depreciation and Amortization: 45,678
- (Single line)
- Total Operating Expenses: 526,046

- (Single line)
- **OPERATING INCOME: 362,853** (Major Total)
- (Double underline)

**OTHER INCOME (EXPENSE)** (Section Header)
- Interest Expense: (78,900) (negative, parenthetical, --text-number-negative)
- Other Income: 5,432
- (Single line)
- Total Other Income (Expense): (73,468)

- (Single line)
- **INCOME BEFORE INCOME TAXES: 289,385** (Major Total)

- Income Tax Provision: 72,346

- (Single line)
- **NET INCOME: 217,039** (Grand Total: 14px Bold 700, indent 0px)
- (Double-double underline: two sets of double lines -- traditional accounting mark of final total)

Typography specifications (exactly as defined in Section 2):
- Section Header: 11px SemiBold uppercase, letter-spacing 0.06em, `--text-secondary`, indent 0px.
- Line item: 13px Regular, `--text-primary`, indent 24px. Numbers right-aligned in amount column.
- Subtotal: 13px SemiBold (600), `--text-primary`, indent 0px. Preceded by single 1px line over amount column only.
- Major Total: 14px Bold (700), `--text-number-total` (#111111), indent 0px. Followed by double underline (two 1px lines, 2px gap between).
- Grand Total (Net Income): 14px Bold (700), `--text-number-total`, indent 0px. Followed by DOUBLE double underline.
- Row height for all lines: 32px (more spacious than data tables because this is a presentation document, not a working table).
- Negative amounts: parenthetical, `--text-number-negative`.
- Zero amounts: em dash.

**Drill-down Interaction**:
- Every line item amount is clickable (cursor: pointer). On hover: the amount gets an underline decoration in `--text-link` color, and a small "drill" icon (12px, arrow-down-right) appears to the right.
- Clicking opens a slide-out panel (320px, right side) showing the journal entries that compose that line item. This panel has a mini-table: Date, Account, Description, Debit, Credit.
- A "Traceable to GL" badge (as defined in section 4.6) appears at the top of the drill panel.

**Footer (below the statement)**:
- 32px below the last line.
- "See accompanying notes to financial statements." in 12px italic Regular `--text-tertiary`. Centered.
- Below: a row of action buttons, centered. "Download PDF" (secondary, icon: download), "Print" (ghost, icon: printer), "View Audit Trail" (ghost, icon: list).

---

### SCREEN 7: CERTIFICATION CEREMONY

**Purpose**: The CFO signs their name to the financial statements. This is the most consequential interaction in the application. It must feel irreversible, deliberate, and legal.

**Visual Hierarchy**:
1. Attestation language (what they are agreeing to)
2. Gate checklist (prerequisites)
3. The signature action
4. Confirmation

**Layout**:

This screen breaks from the standard application layout. No sidebar navigation is visible. The nav sidebar collapses to 0px width. The header simplifies to show only the entity name and a "Back to Dashboard" text link. This isolation creates a "document signing room" -- a separate space from the working application.

Background: `--bg-certification-ceremony` (#FAFBFC) -- slightly cooler than the standard base, creating a formal atmosphere.

Content: Centered, max-width 680px. Vertically, generous padding: 48px top.

**Step 1: Statement Summary**

- "Certification of Financial Statements" in `--type-display` (30px SemiBold), `--text-primary`, centered.
- 8px below: "Acme Holdings LLC -- Period Ended December 31, 2025" in 14px Regular `--text-secondary`, centered.
- 32px below: a summary card with key figures. Card background `--bg-surface`, standard styling, padding 24px.
  - Grid of 4 metrics (2x2):
    - "Total Revenue: $1,691,356"
    - "Net Income: $217,039"
    - "Total Assets: $3,456,789"
    - "Total Equity: $1,234,567"
  - Each: label in 12px SemiBold uppercase `--text-secondary`, value in 20px SemiBold `--text-primary`.
  - Below the grid: "View complete financial statements" link in 13px `--text-link`.

**Step 2: Gate Checklist (24px below summary)**

- "Pre-Certification Requirements" in `--type-h2` (20px SemiBold).
- A vertical checklist. Each item (48px height, bottom border 1px `--border-subtle`):
  - Left: Status icon (20px). Green check if passed, red X if failed.
  - 12px gap: Requirement text in 14px Regular `--text-primary`. Example: "All accounts mapped to financial statement line items."
  - Right: "Passed" in 12px SemiBold `--status-success` or "Failed: 3 accounts unmapped" in 12px SemiBold `--status-error` with a "Resolve" link.

Requirements (in order):
1. "Trial balance is in balance (Debits = Credits)"
2. "All accounts mapped to financial statement line items"
3. "All reconciliations complete (0 unexplained variances)"
4. "All adjusting entries reviewed and posted"
5. "Financial statements generated from current trial balance"
6. "Variance review completed (all variances within threshold or explained)"
7. "Shadow audit: 0 critical findings, 0 open exceptions"

If ANY gate is failed:
- The attestation section below is hidden.
- In its place: a yellow alert box (`--status-warning-bg`, `--status-warning-border` border, padding 20px) with text: "All pre-certification requirements must be satisfied before signing. Resolve the items above to proceed." In 14px Regular `--status-warning`.

**Step 3: Attestation Language (24px below gate checklist, only visible when all gates pass)**

A bordered box: 2px solid `--border-strong` (#C8C5BD), border-radius 4px, padding 32px 40px, background #FFFFFF.

The attestation text, in `--font-serif` (Source Serif 4), 15px Regular, line-height 1.65, `--text-primary`:

"I, [Full Name], [Title], of [Entity Name], hereby certify that the accompanying financial statements for the period ended [Period End Date] have been prepared in accordance with Generally Accepted Accounting Principles (GAAP), and that to the best of my knowledge and belief:

1. The financial statements fairly present, in all material respects, the financial position and results of operations of the entity;

2. All accounts have been properly classified and reconciled;

3. All material adjustments have been recorded; and

4. The underlying data has been verified through deterministic computation, and every dollar amount is traceable to the source general ledger.

I understand that this certification creates an immutable record and cannot be revoked."

[Full Name] and [Title] are rendered in 15px SemiBold `--text-primary` (not placeholder-gray -- these are pulled from the user profile and displayed as definitive).

**Step 4: The Signing Action (24px below attestation)**

Centered: a rectangular signing area.
- Width: 360px, height: 60px, border: 2px solid `--cert-primary` (#14532D), border-radius 4px, background #FFFFFF.
- Interior: centered, "Apply Digital Signature" in 15px SemiBold `--cert-primary`. Below in 11px Regular `--text-tertiary`: "This action is irreversible."
- Hover: background shifts to `--cert-bg` (#F7FBF8), subtle box-shadow appears.
- Cursor: pointer.

Clicking triggers the **Confirmation Modal**:

- Overlay: `--bg-overlay` (rgba(10, 10, 8, 0.52)).
- Modal: centered, 520px wide, `--bg-surface` background, border-radius 12px (slightly larger radius than standard cards for gravitas), padding 40px, box-shadow `0 24px 48px -12px rgba(0,0,0,0.25)`.
- Modal header: "Confirm Certification" in 20px SemiBold `--text-primary`, centered.
- 16px below: summary text in 14px Regular `--text-secondary`: "You are about to certify the financial statements for Acme Holdings LLC for the period ended December 31, 2025."
- 24px below: a detail block. `--bg-surface-sunken` background, 8px border-radius, padding 16px:
  - "Certified by: [Full Name], CPA" in 13px SemiBold `--text-primary`.
  - "Title: Chief Financial Officer" in 13px Regular `--text-secondary`.
  - "Timestamp: 2026-01-05T14:23:07Z" in 12px `--font-mono` `--text-secondary`.
  - "Certificate Hash: a7f3b2c1..." in 12px `--font-mono` `--text-tertiary`.
- 32px below: two buttons, full width, stacked vertically (not side-by-side -- stacking prevents accidental clicking of the wrong button).
  - "Sign and Certify" button: width 100%, height 52px, background `--cert-primary` (#14532D), color white, 16px SemiBold, border-radius 6px. Hover: darken to #0F3D20.
  - 12px below: "Cancel" button: width 100%, height 44px, ghost style, 14px Regular `--text-secondary`, no background, no border. Hover: `--bg-surface-sunken` background.

**Post-Certification State**:

After signing, the modal closes. The entire certification page transforms:

- Background: `--cert-bg` (#F7FBF8).
- The attestation box border becomes 2px solid `--cert-primary`.
- A large certification seal appears centered above the attestation (80px diameter): double-ring border (`--cert-gold` outer, `--cert-primary` inner), checkmark icon 28px `--cert-primary`, "CERTIFIED" text below seal in 11px SemiBold uppercase `--cert-primary`.
- Below the attestation: the signer information block. "Certified by [Full Name], CPA" in 16px SemiBold `--text-primary`. "[Title], [Entity]" in 14px Regular `--text-secondary`. "January 5, 2026 at 2:23 PM EST" in 13px `--font-mono` `--text-secondary`. "Certificate ID: CERT-2025-12-001" in 12px `--font-mono` `--text-tertiary`.
- All interactive elements on the page are gone. The page is now read-only -- a historical record.
- A single action button remains at the bottom: "Return to Dashboard" (primary style).

---

### SCREEN 8: PORTFOLIO DASHBOARD

**Purpose**: PE operating partner lands here. They manage 15 portfolio companies. They want to know in 3 seconds: who is on track, who is behind, and what needs escalation. They will spend 10 minutes here weekly.

**Visual Hierarchy**:
1. "Who needs my attention?" (entities with problems)
2. Overall portfolio close status
3. Key financial metrics across entities
4. Individual entity detail

**Layout**:

This screen has NO sidebar navigation. PE operating partners have a simplified navigation: the sidebar is replaced by a top navigation bar (56px height, `--bg-nav` background) with: "SABIT" logo left-aligned, "Portfolio Dashboard" centered in 15px SemiBold white, and "Entity Detail | Settings | Account" links right-aligned in 13px Regular `--text-inverse-secondary`.

Content area: full viewport width (no sidebar), max-width 1400px centered (wider than standard because entity cards need horizontal space), padding 32px.

**Header Zone**:

Left: "Portfolio Overview" in `--type-display` (30px SemiBold). Right: period selector dropdown ("December 2025", 14px Medium, standard dropdown styling) and "Export Report" button (secondary).

Below, 8px: "15 portfolio companies | 12 closed | 2 in progress | 1 not started" in 14px Regular `--text-secondary`.

Below, 24px: **Attention Banner** (only appears if any entities need attention).
- Full width, `--status-warning-bg` background, `--status-warning-border` border, border-radius 8px, padding 16px 24px.
- Left: amber alert-triangle icon (20px).
- Text: "2 companies require attention: Acme Holdings (3 unresolved variances), Beta Corp (certification overdue)" in 14px Regular `--text-primary`.
- Right: "View Details" link in 14px Medium `--text-link`.

**Entity Card Grid (main content, below header 24px)**:

CSS Grid, 3 columns (3 of 12, i.e., each card is 4 columns wide), 24px gap.

Each entity card:
- Width: fills grid column. Height: approximately 220px (content-dependent).
- `--bg-surface` background, standard card border and shadow.
- Hover: elevated shadow (shadow-md), transform translateY(-2px). Cursor pointer. Entire card is clickable (navigates to entity detail).
- **Top section** (padding 20px 24px 16px 24px):
  - Left: Entity name in 16px SemiBold `--text-primary`. Truncated with ellipsis at 20 characters.
  - Right: Status indicator (per section 4.5 -- green check "CERTIFIED", blue half "IN PROGRESS", red X "OVERDUE", gray dash "NOT STARTED").
  - Below entity name, 4px: Industry tag in 11px Regular `--text-tertiary` ("SaaS | Healthcare IT").
- **Progress bar** (full card width, no side padding, 4px height):
  - Green section = completed gates, blue section = in-progress gate, gray section = remaining gates. This is a segmented bar, not a single fill.
  - "6/8 gates" label right-aligned above bar in 11px `--text-tertiary`.
- **Metrics section** (padding 16px 24px):
  - Two-column micro grid:
    - "Revenue" in 11px SemiBold uppercase `--text-secondary`. "$1.69M" in 18px SemiBold `--text-primary`.
    - "EBITDA" in 11px SemiBold uppercase `--text-secondary`. "$412K" in 18px SemiBold `--text-primary`.
  - Below: "EBITDA Margin: 24.3%" in 12px Regular `--text-secondary`.
- **Bottom bar** (padding 12px 24px, top border 1px `--border-subtle`):
  - Left: Close deadline "Due: Jan 6" in 12px Regular `--text-secondary`. If overdue: "Overdue by 3 days" in 12px SemiBold `--status-error`.
  - Right: Controller avatar (24px circle) + name in 12px Regular `--text-secondary`.

**Cards with problems get special treatment**:
- If entity has any `--status-error` conditions: left border of card becomes 3px solid `--status-error`. This draws the eye immediately.
- If entity is overdue: the bottom bar background becomes `--status-error-bg`.

**Sorting**: Above the grid, a sort control. "Sort by:" dropdown with options: Status (default -- problems first), Company Name (A-Z), EBITDA, Revenue, Close Progress. 13px Regular `--text-secondary`, standard dropdown.


---

### SCREEN 9: PUBLIC VERIFICATION

**Purpose**: An external auditor visits this page with a certificate ID. They are verifying that a certification is genuine, unaltered, and cryptographically valid. They trust nothing. The page must convey integrity through technical precision without being inaccessible to non-technical auditors.

**Visual Hierarchy**:
1. Verification result (VALID or INVALID -- this is the only thing they care about)
2. Certificate details
3. Financial statement preview
4. Technical verification details (hash chain)

**Layout**:

This is a PUBLIC page. No login required. No application chrome. No sidebar, no header navigation.

Full viewport. Background: `--bg-base` (#F8F7F4).

Centered content block, max-width 720px, padding 48px top.

**Top: Sabit Identity**
- "SABIT" in 20px Bold, letter-spacing 0.1em, `--text-primary`, centered.
- "Financial Close Verification" in 13px Regular `--text-secondary`, centered.
- 32px below: 1px `--border-default` horizontal line.

**Verification Input** (if the user arrives without a certificate ID in the URL):
- 32px below the line.
- "Enter Certificate ID" in `--type-h2` (20px SemiBold), centered.
- Input field: width 480px, height 48px, centered, `--font-mono` 14px, placeholder "CERT-2025-12-001", standard input styling.
- "Verify" button below (primary, 48px height, 200px width, centered).

**Verification Result** (appears after verification, or immediately if certificate ID is in the URL):

*If VALID:*

- A large verification block, centered.
- Top: green shield icon (48px, `--status-success`) centered.
- Below, 12px: "CERTIFICATE VERIFIED" in 20px Bold uppercase `--status-success`, letter-spacing 0.06em, centered.
- Below, 8px: "This certification is valid and has not been altered." in 14px Regular `--text-secondary`, centered.
- Below, 32px: Details card (`--bg-surface`, standard card, padding 32px):
  - Grid of details (2 columns, 24px row gap):
    - "Entity:" (label 12px SemiBold `--text-secondary`) / "Acme Holdings LLC" (value 14px Regular `--text-primary`)
    - "Period:" / "December 31, 2025"
    - "Certified By:" / "Jane Smith, CPA, Chief Financial Officer"
    - "Certification Date:" / "January 5, 2026 at 2:23 PM EST" (value in `--font-mono` 13px)
    - "Certificate ID:" / "CERT-2025-12-001" (value in `--font-mono` 13px)
  - Below, 24px: Certification seal (same design as post-certification state -- 64px circle with double-ring border, checkmark).

- Below the details card, 24px: "Financial Statement Summary" section.
  - A condensed view of key figures:
    - "Total Revenue: $1,691,356" in 14px Regular `--text-primary`.
    - "Net Income: $217,039"
    - "Total Assets: $3,456,789"
    - "Total Liabilities: $2,222,222"
    - "Total Equity: $1,234,567"
  - Each on its own line, `--font-numeric` with tabular figures, right-aligned amounts. Labels left-aligned.
  - "Download Complete Statements (PDF)" link below in 13px `--text-link`.

- Below, 24px: "Technical Verification" expandable section (collapsed by default).
  - Chevron-down icon + "Technical Details" in 14px Medium `--text-primary`. Click to expand.
  - Expanded content (`--bg-surface-sunken` background, 16px padding, `--font-mono` throughout):
    - "Document Hash (SHA-256):" + hash value (64 characters, broken into 8-character groups separated by spaces, 12px `--font-mono` `--text-primary`). Copy icon button right-aligned.
    - "Signature Hash:" + signature hash, same treatment.
    - "Previous Certificate Hash:" + hash (or "GENESIS" if first certification).
    - "Chain Length: 12 certificates" in 12px.
    - "Verification Method: SHA-256 hash chain with RSA-2048 digital signature" in 12px `--text-secondary`.
    - A "Verify Independently" section: instructions for verifying the hash outside Sabit. "To verify independently, compute SHA-256 of the statement document and compare with the Document Hash above." In 12px Regular `--text-secondary`.

*If INVALID:*

- Red shield-X icon (48px, `--status-error`) centered.
- "VERIFICATION FAILED" in 20px Bold uppercase `--status-error`, centered.
- "This certificate ID was not found or the certification has been compromised." in 14px Regular `--text-secondary`, centered.
- Below: a card with possible reasons (list items with bullet points):
  - "The certificate ID may be incorrect"
  - "The certification may have been superseded by a re-certification"
  - "Contact the issuing entity for clarification"
- "Try Another Certificate" button (secondary) centered below.

---

### SCREEN 10: DISCREPANCY RESOLVER

**Purpose**: Every problem in one place. Shadow audit findings, reconciliation exceptions, unexplained variances. Must frame problems as routine tasks, not crises. A controller opening this screen should think "I have 12 items to work through" not "everything is broken."

**Visual Hierarchy**:
1. Total count and categorization (numbers, not feelings)
2. Severity classification (critical vs. minor)
3. Individual items with resolution path
4. Resolution actions

**Layout**:

**Page Header**:
- "Discrepancy Resolution" in `--type-h1` (24px SemiBold).
- Below, 8px: "12 items to resolve | 3 critical | 5 standard | 4 informational" in 14px Regular `--text-secondary`. The phrasing "items to resolve" (not "errors" or "problems") reduces anxiety. These are work items, not failures.

**Filter/Sort Bar (below header, 16px gap)**:

Height 44px. Horizontal layout.
- Tab-style filter buttons (horizontally arranged, button-group styling):
  - "All (12)" -- default selected. Selected state: `--interactive-primary` background, white text. Unselected: `--bg-surface` background, `--text-secondary` text, `--border-default` border.
  - "Critical (3)"
  - "Standard (5)"
  - "Informational (4)"
  - "Resolved (8)" -- for reviewing completed items
- Right-aligned: "Sort by:" dropdown (Severity, Date, Category, Amount).

**Discrepancy Category breakdown** (below filter bar, 16px gap):

Three category summary cards, horizontal row:

Card 1: "RECONCILIATION EXCEPTIONS" -- icon: two-arrows-diverge (20px, `--status-error`), count "5", sub-text "Total unexplained: $23,450" in 12px `--text-secondary`.
Card 2: "VARIANCE ALERTS" -- icon: chart-trending (20px, `--status-warning`), count "4", sub-text "Max variance: $8,200" in 12px `--text-secondary`.
Card 3: "SHADOW AUDIT FINDINGS" -- icon: magnifying-glass (20px, `--interactive-primary`), count "3", sub-text "1 critical finding" in 12px `--text-secondary`.

Each card: 180px height, 4-column grid width, `--bg-surface`, standard card styling, centered content, clickable (filters the list below).

**Discrepancy List (main content, below cards, 24px gap)**:

A vertical list of discrepancy items. Each item is a card:

- Full width, `--bg-surface`, standard card styling. Variable height based on content (typically 120-160px).
- Left border: 4px solid -- color based on severity:
  - Critical: `--status-error` (#B91C1C)
  - Standard: `--status-warning` (#B45309)
  - Informational: `--status-info` (#1A5FB4)
  - Resolved: `--status-success` (#15803D)
- **Card header area** (padding 16px 20px 12px 20px):
  - Left: Severity badge ("CRITICAL" in `--status-error` red badge styling, or "STANDARD" in `--status-warning`, or "INFO" in `--status-info`).
  - 8px right: Category badge ("RECONCILIATION" / "VARIANCE" / "AUDIT FINDING") in `--text-secondary` on `--status-neutral-bg`, 11px SemiBold uppercase.
  - Right: Date discovered in 12px `--font-mono` `--text-tertiary` ("Discovered Dec 30, 2025").
- **Card body** (padding 0 20px 16px 20px):
  - Title: "Operating Cash Account: $14,230 unexplained variance" in 14px SemiBold `--text-primary`.
  - Below, 4px: Description in 13px Regular `--text-secondary`. "Bank balance of $234,567 does not match GL balance of $248,797. Difference of $14,230 has 3 identified reconciling items totaling $12,100, leaving $2,130 unexplained."
  - Below, 8px: A "Related Items" tag if this discrepancy connects to others: "Related: Recon-004, Variance-007" in 12px `--font-mono` `--text-link`, clickable.
- **Card footer** (padding 12px 20px, top border 1px `--border-subtle`, background `--bg-surface-sunken`):
  - Left: "Assigned to: [Controller Name]" in 12px Regular `--text-secondary`.
  - Right: Action buttons:
    - "Open Reconciliation" (ghost button, 12px Medium `--text-link`) -- navigates to the relevant reconciliation screen.
    - "Add Note" (ghost button, 12px Medium `--text-secondary`).
    - "Mark Resolved" (compact primary button, 28px height, 12px SemiBold, `--status-success` background if all sub-items are addressed, disabled if not).

**Resolved items**:
- When an item is marked resolved, its card transitions: left border to `--status-success`, severity badge to "RESOLVED" in green, card body becomes slightly muted (text opacity 0.7), and a resolution note appears: "Resolved by [Name] on [Date]: [Note]" in 12px italic `--text-secondary`.

**Empty State** (all discrepancies resolved):
- Centered content: large green checkmark icon (64px), "All Discrepancies Resolved" in 20px SemiBold `--status-success`, "Your close period is clear for certification." in 14px Regular `--text-secondary`. "Proceed to Certification" button (primary).


---

## 6. GLOBAL COMPONENT SPECIFICATIONS

### Buttons

| Variant | Height | Padding | Font | Background | Border | Radius |
|---|---|---|---|---|---|---|
| Primary | 40px | 0 20px | 14px SemiBold (600) white | `--interactive-primary` | none | 6px |
| Primary Large | 48px | 0 24px | 15px SemiBold white | `--interactive-primary` | none | 6px |
| Primary Compact | 32px | 0 12px | 12px SemiBold white | `--interactive-primary` | none | 4px |
| Secondary | 40px | 0 20px | 14px Medium `--interactive-primary` | white | 1px solid `--interactive-primary` | 6px |
| Ghost | 40px | 0 16px | 14px Medium `--text-link` | transparent | none | 6px |
| Destructive | 40px | 0 20px | 14px SemiBold white | `--interactive-destructive` | none | 6px |
| Certification | 52px | 0 24px | 16px SemiBold white | `--cert-primary` | none | 6px |

All buttons: transition `all 150ms ease`. Focus: `outline: 2px solid var(--border-focus); outline-offset: 2px`. Disabled: `opacity: 0.5; cursor: not-allowed; pointer-events: none`.

### Form Inputs

| Property | Value |
|---|---|
| Height | 40px (standard), 36px (compact), 44px (large) |
| Background | `--bg-surface-sunken` (#F1F0EC) |
| Border | 1px solid `--border-default` |
| Border-radius | 6px |
| Font | 14px Regular `--text-primary` |
| Padding | 0 12px |
| Focus border | `--border-focus` (#1A6CB4) |
| Focus shadow | `0 0 0 3px rgba(26, 95, 180, 0.12)` |
| Focus background | #FFFFFF |
| Error border | `--status-error` |
| Error shadow | `0 0 0 3px rgba(185, 28, 28, 0.08)` |
| Error message | 12px Regular `--status-error`, 4px below input |
| Label | 13px Medium (500) `--text-primary`, 6px below label to input |

### Badges/Chips

| Variant | Background | Text Color | Font | Padding | Radius |
|---|---|---|---|---|---|
| Status (success) | `--status-success-bg` | `--status-success` | 11px SemiBold uppercase, 0.02em spacing | 3px 8px | 4px |
| Status (warning) | `--status-warning-bg` | `--status-warning` | same | 3px 8px | 4px |
| Status (error) | `--status-error-bg` | `--status-error` | same | 3px 8px | 4px |
| Status (info) | `--status-info-bg` | `--status-info` | same | 3px 8px | 4px |
| AI | `--ai-badge-bg` | `--ai-badge-text` | same, with sparkle icon | 3px 8px | 4px |
| Neutral | `--status-neutral-bg` | `--text-secondary` | same | 3px 8px | 4px |

### Modals

| Property | Value |
|---|---|
| Overlay | rgba(10, 10, 8, 0.52) |
| Container max-width | 480px (standard), 640px (large), 520px (certification) |
| Background | #FFFFFF |
| Border-radius | 12px |
| Padding | 32px (standard), 40px (certification) |
| Shadow | `0 24px 48px -12px rgba(0,0,0,0.25)` |
| Header | 20px SemiBold `--text-primary` |
| Close button | 20px X icon, top-right, 12px from edges, `--text-tertiary`, hover `--text-primary` |

### Tooltips

| Property | Value |
|---|---|
| Background | `--bg-nav` (#1B1F27) |
| Text | 12px Regular `--text-inverse` (#F0F0F0) |
| Padding | 8px 12px |
| Border-radius | 6px |
| Max-width | 280px |
| Shadow | `0 4px 12px rgba(0,0,0,0.15)` |
| Arrow | 6px CSS triangle, same background color |
| Delay | 400ms hover before show, 150ms fade-in |

### Scrollbars (custom)

Scrollbar styling:
- Width: 8px
- Track: transparent
- Thumb: #C8C5BD, border-radius 4px, 2px transparent border with background-clip padding-box
- Thumb hover: #8A8A8A

### Loading States

- **Full-page loader**: centered spinner (32px, 2.5px stroke, `--interactive-primary`, CSS rotation animation 1s linear infinite) + "Loading..." in 14px Regular `--text-secondary` below.
- **Inline/button loader**: 16px spinner in current text color, replaces button text.
- **Table skeleton**: rows of rectangular pulses. Each cell has a rounded rectangle (border-radius 4px, height 14px, width 60-80% of column) that pulses between `--bg-surface-sunken` and `--border-default` in a 1.5s ease-in-out infinite animation. 10 rows shown.
- **Card skeleton**: card outline with three rectangular pulses for title, body, and metadata.

### Transitions and Animations

| Interaction | Duration | Easing | Property |
|---|---|---|---|
| Button hover | 150ms | ease | background-color, transform, box-shadow |
| Button press | 75ms | ease | transform (scale 0.98) |
| Card hover | 200ms | ease | box-shadow, transform |
| Input focus | 150ms | ease | border-color, box-shadow, background |
| Modal open | 200ms | ease-out | opacity (0 to 1), transform (translateY 8px to 0) |
| Modal close | 150ms | ease-in | opacity, transform |
| Sidebar collapse | 200ms | ease | width |
| Contextual panel slide | 250ms | ease-out | transform (translateX) |
| Toast notification | 300ms | ease-out | transform (translateY), opacity |
| Row expand | 200ms | ease | height, opacity |
| Status transition | 300ms | ease | color, background-color |

**Reduced motion**: All animations respect `prefers-reduced-motion: reduce`. When active, all transitions become instant (0ms duration) except opacity fades which reduce to 100ms.


---

## 7. SIDEBAR NAVIGATION SPECIFICATION

The sidebar was referenced throughout the screen designs but needs its own complete spec.

**Structure (top to bottom, 240px expanded width):**

**Logo Zone** (height: 56px, aligned with top header):
- Padding: 0 20px.
- "SABIT" in 16px Bold, letter-spacing 0.08em, `--text-inverse` (#F0F0F0). Vertically centered.
- Collapsed state (64px width): "S" monogram in 18px Bold, centered.

**Entity/Period Zone** (below logo, padding: 12px 16px):
- Current entity name: 13px SemiBold `--text-inverse`, truncated with ellipsis.
- Current period: 12px Regular `--text-inverse-secondary`.
- Click to open entity/period switcher dropdown (overlays the sidebar, 280px wide, `--bg-surface` white card with search, entity list, period selector).
- Bottom border: 1px solid rgba(255,255,255,0.08).

**Primary Navigation** (below entity zone, padding-top: 12px):

Each nav item: height 40px, padding 0 16px, border-radius 6px (within 8px side margins, so actual clickable area is 224px wide). 4px gap between items.

| Icon (20px) | Label (13px Medium) | Route |
|---|---|---|
| LayoutDashboard | Dashboard | /dashboard |
| Upload | GL Upload | /upload |
| Table | Trial Balance | /trial-balance |
| GitBranch | Account Mapping | /mapping |
| Scale | Reconciliation | /reconciliation |
| FileText | Financial Statements | /statements (expands) |
| AlertTriangle | Discrepancies | /discrepancies |
| ShieldCheck | Certification | /certification |

"Financial Statements" expands on click to show sub-items (indented 20px, 36px height, 12px Regular):
- Income Statement
- Balance Sheet
- Cash Flow Statement
- Equity Statement

**Icon + text color (default):** `--text-inverse-secondary` (#A0A4AB).
**Hover:** background `--bg-nav-hover` (#272C36), text `--text-inverse` (#F0F0F0).
**Active (current page):** background `--bg-nav-active` (#2F3542), text `--text-inverse`, left border 3px solid `--interactive-primary` (#1A5FB4) inset.

**Notification badges**: If a nav item has attention items (e.g., Discrepancies has 12 unresolved), a small count badge appears to the right of the label: 18px diameter circle, `--status-error` background, white text 10px Bold. Maximum display: "99+".

**Bottom Zone** (pinned to bottom of sidebar):
- Separator: 1px solid rgba(255,255,255,0.08), 16px margin from nav items.
- Settings item: gear icon + "Settings" (same nav item styling).
- Help item: question-mark-circle icon + "Help & Support".
- 12px below: User avatar (32px circle, initials, white text on `--interactive-primary` background) + name (13px Medium `--text-inverse`) + role (11px Regular `--text-inverse-secondary`). Clickable, opens user menu dropdown.

**Collapsed state (64px):**
- Only icons shown, centered (20px icons in 40px square hover targets).
- Tooltip on hover: nav label appears as a tooltip to the right of the icon.
- Entity/period zone: hidden.
- User zone: only avatar shown.
- Collapse toggle: chevron icon at the bottom of the logo zone. Click toggles between 240px and 64px. Transition: 200ms ease on width.

---

## 8. TOP HEADER BAR SPECIFICATION

Height: 56px. Background: `--bg-header` (#FFFFFF). Bottom border: 1px solid `--border-default`. Position: sticky top, z-index 200 (`--z-sticky`). Extends from sidebar right edge to viewport right edge.

**Layout (flex, items centered vertically, padding 0 24px):**

Left zone:
- Breadcrumb: "Dashboard / Trial Balance" in 13px Regular `--text-secondary`. Separator: "/" in `--text-tertiary`. Last item (current page): `--text-primary` Medium. Each previous item is a link (`--text-link` on hover). Only shows 2-3 levels.

Center zone (flex: 1): empty (breadcrumb and actions fill the sides).

Right zone (flex items, 16px gap between items):
- **Search trigger**: Magnifying glass icon (20px `--text-secondary`) + "Search..." text (13px `--text-tertiary`) in a pill-shaped button (36px height, 200px width, `--bg-surface-sunken` background, `--border-default` border, border-radius 18px). Click opens command palette overlay (560px wide, centered horizontally, 200px from top, `--bg-surface` white, shadow-xl, border-radius 12px, search input + results list).
- **Notifications bell**: Bell icon (20px, `--text-secondary`). If unread: red dot (8px, `--status-error`) top-right of icon. Click opens dropdown panel (360px wide, max-height 480px, `--bg-surface`, shadow-lg, anchored to the bell icon top-right).
- **Theme toggle**: Sun/moon icon (20px, `--text-secondary`). Click toggles `data-theme` attribute. Transition: 200ms.
- **User avatar**: 32px circle, initials. Click opens dropdown: name, email, role, divider, "Account Settings", "Sign Out".


---

## 9. ACCESSIBILITY SPECIFICATION

### Keyboard Navigation

Every interactive element is reachable via Tab. Tab order follows visual layout (left-to-right, top-to-bottom). Skip-link: first focusable element is a visually hidden "Skip to main content" link that becomes visible on focus (positioned top-center, `--bg-nav` background, `--text-inverse` text, padding 8px 16px, z-index 500).

**Focus indicators**: 2px solid `--border-focus` (#1A6CB4) with 2px offset. In dark mode: 2px solid `--border-focus` (#60A5FA). Focus ring is ALWAYS visible on keyboard focus (`:focus-visible`), NEVER on mouse click (`:focus:not(:focus-visible)` removes outline).

**Table keyboard navigation**: Arrow keys move between cells. Enter on a row opens the detail/expansion. Escape closes expansions and modals. Space toggles checkboxes and selection.

### Screen Reader Support

- All pages have `<title>` elements: "Trial Balance | Sabit" format.
- Landmark roles: `<nav>` for sidebar, `<main>` for content, `<header>` for top bar, `<aside>` for contextual sidebars.
- Tables use `<thead>`, `<tbody>`, `<th scope="col">` and `<th scope="row">`.
- Status badges include `aria-label`: the badge "CRITICAL" has `aria-label="Severity: Critical"`.
- Dynamic content updates use `aria-live="polite"` for non-urgent updates (progress changes) and `aria-live="assertive"` for errors.
- Modals trap focus (first and last focusable elements wrap). Escape closes. Opening modal sets focus to modal heading. Closing returns focus to the trigger element.
- Icons that are purely decorative: `aria-hidden="true"`. Icons that convey meaning: `aria-label="[description]"`.
- Color is NEVER the sole indicator. All status indicators use shape + color + label (triple encoding).

### Color Blind Safety

The palette was selected with protanopia, deuteranopia, and tritanopia in mind:
- Red (error) and green (success) are always accompanied by distinct shapes (X vs checkmark) and labels ("FAILED" vs "PASSED").
- The AI purple is distinguishable from all status colors under all forms of color blindness (verified by simulating the palette through Coblis color blindness simulator).
- Warning amber is distinguishable from both error red and success green under deuteranopia (the most common form).

### Text Scaling

The interface maintains usability at 200% browser zoom. At 150% and above:
- Sidebar collapses to icon-only mode automatically.
- Table horizontal scroll activates with pinned first two columns.
- Cards stack vertically instead of in grid layouts.

---

## 10. ICON SYSTEM

**Icon library**: Lucide Icons (MIT license, consistent stroke-based design, 24px grid, 1.5px stroke width). Lucide is the community-maintained fork of Feather Icons with a larger icon set.

**Sizing**:
- Navigation icons: 20px
- Status icons: 18px
- Inline icons: 16px
- Hero/empty-state icons: 48px or 64px
- Button icons: 16px (compact), 18px (standard)

**Color**: Icons inherit the text color of their context unless they are status icons (which use status colors).

**Custom icons** (not in Lucide, must be created as SVGs):
- "AI Sparkle": a 4-point star used in AI badges. 14px. Fill `--ai-primary`.
- "Certification Seal": the double-ring checkmark seal described in section 4.3. Available at 56px, 64px, and 80px.
- "Hash Chain": a stylized chain link icon for audit trail references. 16px.

---

## 11. TOAST NOTIFICATION SYSTEM

Toasts appear in the bottom-right of the viewport, 24px from edges, stacked vertically with 8px gap between. Maximum 3 visible; older ones queue.

Each toast: 360px width, auto height (typically 56-80px), `--bg-surface` background (or `--bg-nav` in dark mode), shadow-lg, border-radius 8px, border-left 4px solid (color by type: success/warning/error/info). Padding: 12px 16px.

Content: Icon (18px, status color) left-aligned. Title in 13px SemiBold `--text-primary`, message in 12px Regular `--text-secondary`. Close X button top-right (16px, `--text-tertiary`).

Auto-dismiss: success toasts after 4 seconds, info after 5 seconds. Error and warning toasts persist until manually dismissed.

Enter animation: slide up 16px + fade in, 300ms ease-out. Exit: fade out, 200ms ease-in.

---

## 12. DATA EXPORT AND PRINT STYLES

**Print stylesheet** (`@media print`):
- Hide: sidebar, header, all buttons, all interactive elements, all shadows, all tooltips.
- Show: content area only, full width.
- Financial statements: use `--font-serif` for all text. Black text on white background. Standard accounting formatting preserved.
- Tables: visible borders (1px solid #000) on all cells for printability.
- Certification seal: renders in grayscale with high contrast.
- Page breaks: `page-break-before: always` on each financial statement. `page-break-inside: avoid` on cards and table sections.
- Footer: each printed page gets "Generated from Sabit | [Entity] | [Date] | Page X of Y" in 10px.

**PDF Export**: Generated server-side using the print stylesheet as the base. Adds: company letterhead zone (40px top margin for entity logo if configured), page numbers, "CONFIDENTIAL" watermark option (45-degree diagonal, 20% opacity, 72pt).


---

## 13. CSS VARIABLE IMPLEMENTATION

The complete set of tokens for developer implementation. Copy this directly into your root stylesheet.

### Light Theme (Default)

```css
:root {
  /* === BACKGROUNDS === */
  --bg-base: #F8F7F4;
  --bg-surface: #FFFFFF;
  --bg-surface-raised: #FFFFFF;
  --bg-surface-sunken: #F1F0EC;
  --bg-overlay: rgba(10, 10, 8, 0.52);
  --bg-nav: #1B1F27;
  --bg-nav-hover: #272C36;
  --bg-nav-active: #2F3542;
  --bg-header: #FFFFFF;
  --bg-table-row-alt: #FAFAF6;
  --bg-table-row-hover: #F0EFE8;
  --bg-table-row-selected: #EBF0FA;
  --bg-ai: #F5F0FF;
  --bg-certified: #F0F7F1;
  --bg-certification-ceremony: #FAFBFC;

  /* === TEXT === */
  --text-primary: #1A1A1A;
  --text-secondary: #5C5C5C;
  --text-tertiary: #8A8A8A;
  --text-inverse: #F0F0F0;
  --text-inverse-secondary: #A0A4AB;
  --text-link: #1A6CB4;
  --text-link-hover: #134E82;
  --text-number: #1A1A1A;
  --text-number-negative: #B91C1C;
  --text-number-total: #111111;
  --text-ai-label: #6B21A8;

  /* === BORDERS === */
  --border-default: #E2E0DB;
  --border-strong: #C8C5BD;
  --border-subtle: #EEEDE9;
  --border-focus: #1A6CB4;
  --border-ai: #C4B5DC;
  --border-table-header: #D4D2CC;
  --border-total-single: #1A1A1A;
  --border-total-double: #1A1A1A;

  /* === INTERACTIVE === */
  --interactive-primary: #1A5FB4;
  --interactive-primary-hover: #154A8F;
  --interactive-primary-pressed: #0F3668;
  --interactive-secondary-hover: #F0F4FA;
  --interactive-ghost-hover: #F0F0EC;
  --interactive-destructive: #B91C1C;
  --interactive-destructive-hover: #991B1B;

  /* === STATUS === */
  --status-success: #15803D;
  --status-success-bg: #F0FDF4;
  --status-success-border: #BBF7D0;
  --status-warning: #B45309;
  --status-warning-bg: #FFFBEB;
  --status-warning-border: #FDE68A;
  --status-error: #B91C1C;
  --status-error-bg: #FEF2F2;
  --status-error-border: #FECACA;
  --status-info: #1A5FB4;
  --status-info-bg: #EFF6FF;
  --status-info-border: #BFDBFE;
  --status-neutral: #5C5C5C;
  --status-neutral-bg: #F5F5F3;

  /* === AI === */
  --ai-primary: #7C3AED;
  --ai-primary-muted: #A78BFA;
  --ai-bg: #F5F0FF;
  --ai-border: #DDD6FE;
  --ai-badge-bg: #EDE9FE;
  --ai-badge-text: #5B21B6;

  /* === CERTIFICATION === */
  --cert-primary: #14532D;
  --cert-secondary: #166534;
  --cert-gold: #A16207;
  --cert-gold-light: #D4A017;
  --cert-bg: #F7FBF8;
  --cert-border: #86EFAC;
  --cert-lock-icon: #14532D;

  /* === TYPOGRAPHY === */
  --font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Consolas, monospace;
  --font-serif: 'Source Serif 4', 'Georgia', 'Times New Roman', serif;

  --type-display-size: 1.875rem;
  --type-display-weight: 600;
  --type-display-line-height: 1.2;
  --type-display-letter-spacing: -0.02em;

  --type-h1-size: 1.5rem;
  --type-h1-weight: 600;
  --type-h1-line-height: 1.25;
  --type-h1-letter-spacing: -0.015em;

  --type-h2-size: 1.25rem;
  --type-h2-weight: 600;
  --type-h2-line-height: 1.3;
  --type-h2-letter-spacing: -0.01em;

  --type-h3-size: 1rem;
  --type-h3-weight: 600;
  --type-h3-line-height: 1.375;
  --type-h3-letter-spacing: -0.005em;

  --type-body-size: 0.875rem;
  --type-body-weight: 400;
  --type-body-line-height: 1.5;

  --type-table-header-size: 0.6875rem;
  --type-table-header-weight: 600;
  --type-table-header-line-height: 1.3;
  --type-table-header-letter-spacing: 0.06em;

  --type-table-cell-size: 0.8125rem;
  --type-table-cell-weight: 400;
  --type-table-cell-line-height: 1.385;

  --type-caption-size: 0.75rem;
  --type-caption-weight: 400;
  --type-caption-line-height: 1.4;

  --type-badge-size: 0.6875rem;
  --type-badge-weight: 600;
  --type-badge-letter-spacing: 0.04em;

  /* === SPACING === */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* === SHADOWS === */
  --shadow-sm: 0 1px 3px 0 rgba(0,0,0,0.04), 0 1px 2px -1px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04);
  --shadow-xl: 0 24px 48px -12px rgba(0,0,0,0.25);

  /* === TRANSITIONS === */
  --transition-fast: 150ms ease;
  --transition-normal: 200ms ease;
  --transition-slow: 300ms ease;

  /* === RADII === */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;

  /* === Z-INDEX SCALE === */
  --z-base: 0;
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-overlay: 300;
  --z-modal: 400;
  --z-toast: 500;
}
```

### Dark Theme

```css
[data-theme="dark"] {
  --bg-base: #121417;
  --bg-surface: #1A1D23;
  --bg-surface-raised: #22262E;
  --bg-surface-sunken: #0D0F12;
  --bg-overlay: rgba(0, 0, 0, 0.65);
  --bg-nav: #0D0F12;
  --bg-nav-hover: #1A1D23;
  --bg-nav-active: #22262E;
  --bg-header: #1A1D23;
  --bg-table-row-alt: #1E2128;
  --bg-table-row-hover: #262A33;
  --bg-table-row-selected: #1A2536;
  --bg-ai: #1C1726;
  --bg-certified: #0F2418;
  --bg-certification-ceremony: #14171B;

  --text-primary: #E8E6E3;
  --text-secondary: #9CA3AF;
  --text-tertiary: #6B7280;
  --text-inverse: #1A1A1A;
  --text-inverse-secondary: #5C5C5C;
  --text-link: #60A5FA;
  --text-link-hover: #93C5FD;
  --text-number: #E8E6E3;
  --text-number-negative: #FCA5A5;
  --text-number-total: #F3F2F0;
  --text-ai-label: #C4B5FC;

  --border-default: #2E3340;
  --border-strong: #3D4451;
  --border-subtle: #252930;
  --border-focus: #60A5FA;
  --border-ai: #4C3A6B;
  --border-table-header: #3D4451;

  --interactive-primary: #3B82F6;
  --interactive-primary-hover: #60A5FA;
  --interactive-primary-pressed: #2563EB;
  --interactive-secondary-hover: #1A2536;
  --interactive-ghost-hover: #22262E;
  --interactive-destructive: #EF4444;
  --interactive-destructive-hover: #F87171;

  --status-success: #4ADE80;
  --status-success-bg: #0F2418;
  --status-success-border: #166534;
  --status-warning: #FBBF24;
  --status-warning-bg: #1C1708;
  --status-warning-border: #854D0E;
  --status-error: #F87171;
  --status-error-bg: #1F0D0D;
  --status-error-border: #991B1B;
  --status-info: #60A5FA;
  --status-info-bg: #0C1929;
  --status-info-border: #1E40AF;
  --status-neutral: #9CA3AF;
  --status-neutral-bg: #1E2128;

  --ai-primary: #A78BFA;
  --ai-primary-muted: #7C3AED;
  --ai-bg: #1C1726;
  --ai-border: #4C3A6B;
  --ai-badge-bg: #2E1F5E;
  --ai-badge-text: #C4B5FC;

  --cert-primary: #4ADE80;
  --cert-secondary: #22C55E;
  --cert-gold: #FBBF24;
  --cert-gold-light: #F59E0B;
  --cert-bg: #0F2418;
  --cert-border: #166534;
  --cert-lock-icon: #4ADE80;

  --shadow-sm: 0 1px 3px 0 rgba(0,0,0,0.3), 0 1px 2px -1px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.4), 0 2px 4px -2px rgba(0,0,0,0.3);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.5), 0 4px 6px -4px rgba(0,0,0,0.4);
  --shadow-xl: 0 24px 48px -12px rgba(0,0,0,0.6);
}
```

---

## 14. DESIGN PHILOSOPHY SUMMARY

This specification encodes three principles into every visual decision:

**Trust through restraint.** The palette is muted. The typography is professional. The animations are subtle. There are no gradients, no illustrations, no playful colors. Every element exists because it serves a function. The restraint itself is the trust signal -- it communicates "we take this as seriously as you do."

**Precision through typography.** The financial statement hierarchy uses only font weight, size, indentation, and accounting underlines. No background colors, no icons, no decorative elements. The numbers are the interface. Tabular figures ensure alignment. Parenthetical notation follows GAAP convention. Em dashes replace zeros to reduce noise. Every typographic decision serves the controller who must read these numbers accurately at 11 PM on close night.

**Confidence through consistency.** The status system uses the same shapes, colors, and labels everywhere. The AI boundary uses the same purple dashed container everywhere. The spacing system follows a strict 4px grid. The color tokens are named semantically, not by hue. A developer can implement any new screen by composing existing tokens and patterns. A controller can navigate any screen because the visual language is predictable. Predictability is confidence.

---

*This is the definitive visual design specification for Sabit Financial Close Engine. A senior frontend developer should be able to implement any screen in this application without asking a single design question.*
