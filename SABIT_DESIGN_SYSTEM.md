# Sabit Design System — Ledger Palette
**Version:** 1.0 · March 2026  
**Status:** Binding — all frontend work references this file  
**Authority:** UX Manifesto "Visible Veracity" + Ledger palette selection

---

## How to Use This File

Every frontend prompt begins with:
> "Use the Sabit Ledger design system defined in `SABIT_DESIGN_SYSTEM.md`. Do not introduce any color, font size, or spacing value outside this token system."

Claude Code reads this file at the start of every frontend task. No exceptions.

---

## The UX Manifesto — "Visible Veracity"

**Core Philosophy: If the user can't see the work, the work didn't happen.**

In high-stakes finance, silence is not a feature — it is a liability. The Sabit backend is a Nuclear Reactor of cryptographic certainty and AI intelligence. The frontend is its Command Center — not a Beige Console.

The controller's job is judgment. Sabit's job is everything else.

### Principle 0 — The Confirmation Model *(The Foundation)*
Sabit acts first. The controller confirms, adjusts, or overrides. No screen asks the controller to enter data that Sabit can provide. Every input field arrives pre-filled or justified empty with a visible explanation of why Sabit could not fill it.
- Pre-filled fields carry a provenance label: "From prior period" / "Matched from bank statement" / "AI classified at 98%"
- Empty fields carry a justification: "No prior period data — enter manually"
- The controller's job is reviewing and approving a prepared package, not building one from scratch

### Principle 1 — The Provenance Principle *(No Black Box AI)*
Every Accept/Reject button is accompanied by the Why. AI suggestions are proposals with evidence, not answers.
- Show: classification layer, confidence score (visual bar), ASC citation, XBRL element ID on expand
- Header stat on every mapping page: "Sabit classified 78 of 79 accounts automatically — 1 needs your review"
- The controller trusts Sabit because they can see the logic, not because Sabit is "smart"

### Principle 2 — Ceremonial Security *(The Digital Ink Rule)*
Cryptographic signatures are not form submissions. They are legal attestations.
- The Certify moment must feel heavy — proportional to its legal and financial significance
- Show: artifact hash (first 16 chars, labeled), Ed25519 signature, certifier name, timestamp locked in
- Provide: "Certificate of Close" download, auditor verification link, acknowledgment required before dismissal
- The certification screen is the product's climax — design it accordingly

### Principle 3 — Narrative-Driven Auditing *(Human-Readable Logs)*
Audit trails are for humans, not databases.
- No raw GUIDs, no camelCase event types, no user ID strings
- Transform `user-177302...` → `Sarah Miller (Controller)`
- Transform `close_session_transition` → `Advanced close to Under Review — all 8 required gates passed`
- Transform `je_posted` → `Sarah posted Journal Entry #47: Depreciation expense ($24,500) — Shadow Auditor verified 3 checks`
- Audit trail header: "Chain integrity verified ✓ — 847 records, no tampering detected"

### Principle 4 — The Pulse of the Engine *(Event-Driven Vigilance)*
The engine speaks when it acts. Not before, not after.
- Verification indicators are event-driven, not ambient — a badge always green becomes wallpaper
- When a JE posts: "Shadow Auditor: 3 checks passed ✓" badge appears for 4 seconds, then collapses to small verified icon
- When cascade re-runs: subtle "Sabit rechecked 4 gates — all passing" notification
- When a gate fails: prominent alert with specific reason
- Silence means everything is passing. The pulse speaks only when something changes.

### Principle 5 — Contextual Flow *(Kill the Orphans)*
No standalone pages. Every module is a step in a journey.
- Persistent Progress Rail on every page
- Example rail: `Gate 6 of 11 · ASC 842 · 3 JEs proposed · Close day 5 of 10 · 2 gates remaining before Under Review`
- Adjustments stage shows unified review queue: "Sabit proposed entries from 11 of 13 modules"
- Completed stages show what Sabit did: "AI classified 78 accounts automatically. 1 required your review."

### Principle 6 — Technical Honesty *(Reflect the Math)*
The display is purposeful. The math is exact.
- Financial figures displayed at GAAP presentation precision — dollars and cents
- Discrepancies flagged at the materiality threshold, not at floating-point resolution
- If a discrepancy exceeds materiality: the gate fails, the close cannot advance, the controller sees exactly which account, the discrepancy amount, and the action that resolves it
- Sub-cent precision is an internal guarantee, not a display concern
- "Block on it" — not "flag it"

### The Litmus Test
> **"Does this screen make a $200M CFO feel like they are looking at a cryptographically certified truth — or a shared spreadsheet?"**
>
> If the answer is spreadsheet: it does not ship.

---

## Color System — Ledger Palette

### Base Colors (Raw Palette)

| Token | Hex | Role |
|-------|-----|------|
| `ledger-50` | `#F5F0E8` | Page background — the paper |
| `ledger-100` | `#EDE6D6` | Card and surface background |
| `ledger-200` | `#DDD5C2` | Borders, dividers, rules |
| `ledger-400` | `#8B7A5E` | Placeholder and hint text |
| `ledger-600` | `#5C4F3A` | Secondary text, labels |
| `ledger-900` | `#2C2416` | Primary text — the ink. Also the certification screen background. |

### Semantic Accent Colors

| Token | Hex | Semantic Role | Usage Rule |
|-------|-----|---------------|------------|
| `gold` | `#B8860B` | Certified / verified / signed | **Only** for certification artifacts, Ed25519 states, hash-chain verified badges. Never for warnings. Gold means "this is final and trusted." |
| `forest` | `#2D6A4F` | Success / gate passing / human confirmed | Gate passing, high-confidence mapping accepted by human, reconciliation complete, shadow auditor passed |
| `amber` | `#8B6914` | Warning / needs review / low confidence | Low confidence mappings, variances needing explanation, items awaiting approval |
| `rust` | `#C44B2B` | Blocking / gate failed / error | Gate failures, blocking issues, validation errors. Never decorative. |
| `ink-blue` | `#3B6EA5` | System / AI action | Everything Sabit did autonomously. Blue = Sabit acted. Green = human confirmed. This color encodes agency. |

### Background Tints (For Badges and State Surfaces)

| Token | Hex | Pairs With |
|-------|-----|------------|
| `gold-bg` | `#F5EDD0` | gold text on gold-bg |
| `forest-bg` | `#E0EDE8` | forest text on forest-bg |
| `amber-bg` | `#F0E8D0` | amber text on amber-bg |
| `rust-bg` | `#F5E4DE` | rust text on rust-bg |
| `ink-blue-bg` | `#E0EAF5` | ink-blue text on ink-blue-bg |

### CSS Custom Properties — Paste Into Global Stylesheet

```css
:root {
  /* Base surfaces */
  --color-page-bg:        #F5F0E8;
  --color-surface:        #EDE6D6;
  --color-surface-raised: #E6DEC9;
  --color-border:         #DDD5C2;
  --color-border-strong:  #C8BEA8;

  /* Text */
  --color-text-primary:   #2C2416;
  --color-text-secondary: #5C4F3A;
  --color-text-muted:     #8B7A5E;

  /* Certified / Gold — use only for cryptographic states */
  --color-certified:         #B8860B;
  --color-certified-bg:      #F5EDD0;
  --color-certified-surface: #2C2416; /* dark background for cert screen */

  /* Success / Forest — human confirmed, gate passing */
  --color-success:    #2D6A4F;
  --color-success-bg: #E0EDE8;

  /* Warning / Amber — needs attention */
  --color-warning:    #8B6914;
  --color-warning-bg: #F0E8D0;

  /* Blocking / Rust — gate failed, error */
  --color-blocking:    #C44B2B;
  --color-blocking-bg: #F5E4DE;

  /* System / Ink Blue — Sabit acted */
  --color-system:    #3B6EA5;
  --color-system-bg: #E0EAF5;
}
```

### Tailwind Config Extension

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        ledger: {
          50:  '#F5F0E8',
          100: '#EDE6D6',
          200: '#DDD5C2',
          400: '#8B7A5E',
          600: '#5C4F3A',
          900: '#2C2416',
        },
        gold:     '#B8860B',
        'gold-bg': '#F5EDD0',
        forest:   '#2D6A4F',
        'forest-bg': '#E0EDE8',
        amber:    '#8B6914',
        'amber-bg': '#F0E8D0',
        rust:     '#C44B2B',
        'rust-bg': '#F5E4DE',
        'ink-blue': '#3B6EA5',
        'ink-blue-bg': '#E0EAF5',
      },
      backgroundColor: {
        page:    '#F5F0E8',
        surface: '#EDE6D6',
      },
    },
  },
}
```

---

## The Four Rules That Never Break

**Rule 1 — Gold is only for certified/verified states.**  
Never use gold for highlights, warnings, hover states, or decorative purposes. When a user sees gold, they know the system has cryptographically sealed something. This meaning must be consistent across every screen, every component, every release.

**Rule 2 — Ink blue means Sabit acted. Forest green means a human confirmed.**  
These two colors encode agency. Blue = the system did this autonomously. Green = a human reviewed and confirmed. Never swap them. Never use either for decoration.

**Rule 3 — The dark surface (`#2C2416`) appears only on the Certificate of Close.**  
The ink-dark background is used exactly once — the certification moment. It should feel like opening a vault. Nowhere else: not modals, not sidebars, not navigation, not loading states.

**Rule 4 — No pure white anywhere in the product.**  
`#FFFFFF` does not exist in this palette. The lightest surface is `ledger-50` (`#F5F0E8`). This includes modals, tooltips, dropdowns, popovers, and skeleton loaders.

---

## Typography

### Typeface Roles

| Typeface | Variable | Role | Where Used |
|----------|----------|------|------------|
| Anthropic Sans / system sans | `var(--font-sans)` | All UI text | Everywhere |
| Serif (Georgia / system serif) | `var(--font-serif)` | Certification only | Entity name on Certificate of Close screen only |
| Monospace | `var(--font-mono)` | Technical data | Hashes, artifact IDs, account codes, Decimal amounts |

> **The serif rule:** Serif appears exactly once — the company name on the Certificate of Close. This makes the certification feel like a signed document, not a UI component. Using serif anywhere else dilutes this effect. Do not use serif in navigation, headers, cards, tables, or any other context.

### Type Scale

| Role | Size | Weight | Style | Example |
|------|------|--------|-------|---------|
| Certificate title | 22px | 500 | Serif | `CloudMetrics Demo Inc.` |
| Page title | 18px | 500 | Sans | `February 2026 Close` |
| Section header | 15px | 500 | Sans | `Day 5 of 10 — 7 gates passing` |
| Body / table rows | 13px | 400 | Sans | `4100 · Product Revenue → Revenue` |
| Labels / badges | 11px | 500 | Sans · uppercase · 0.06em tracking | `XBRL · ASC 606 · 98%` |
| Technical data | 11px | 400 | Mono | `a3f9d2c1e8b47f92...` |

### Typography Rules

- **Two weights only:** 400 (regular) and 500 (medium). Never 600, 700, or bold. Heavy weights fight the calm of the ledger palette.
- **Sentence case everywhere** — never ALL CAPS in prose. Uppercase only for badge labels and section tags (11px, tracked).
- **Monospace for all financial data** — account codes, hash values, artifact IDs, Decimal amounts. Never sans-serif for these.
- **Line height:** 1.65 for body text, 1.4 for labels and badges, 1.0 for large display numbers.

---

## Spacing & Layout

### Spacing Scale (rem-based)

| Token | Value | Use |
|-------|-------|-----|
| `space-1` | 4px | Icon padding, tight gaps |
| `space-2` | 8px | Badge padding, inline gaps |
| `space-3` | 12px | Row padding, compact cards |
| `space-4` | 16px | Standard card padding |
| `space-6` | 24px | Section spacing |
| `space-8` | 32px | Page section breaks |
| `space-12` | 48px | Major layout gaps |

### Border Radius

| Token | Value | Use |
|-------|-------|-----|
| `radius-sm` | 6px | Badges, small pills |
| `radius-md` | 8px | Inputs, table rows |
| `radius-lg` | 10px | Cards |
| `radius-xl` | 14px | Page-level containers |
| `radius-2xl` | 16px | Modal panels |

### Border Width
- Default borders: `1px solid var(--color-border)` — `#DDD5C2`
- Strong borders (focus, selected): `1px solid var(--color-border-strong)` — `#C8BEA8`
- Never use 2px borders except for focus rings

---

## Component Patterns

### Confidence Bar (Mapping Page)
```
≥ 80%  → forest green bar + forest badge "98% · XBRL ASC 606"
60–79% → amber bar + amber badge "74% · Needs review"  
< 60%  → rust bar + rust badge "52% · Manual review required"
Prior period → ink-blue badge "Prior period · 100%"
```

### Gate Status Indicator
```
Passing  → forest dot + "Gate passing" (do not show unless user expands)
Failing  → rust dot + specific reason always visible
Blocked  → rust dot + "Blocking — close cannot advance" + action link
```

### Shadow Auditor Badge
- Appears on JE row immediately after post
- Fades after 4 seconds to a small verified icon (✓)
- On hover/expand: lists the specific checks that ran
- Copy: "Shadow Auditor: 3 checks passed"
- Never persistent — event-driven only

### Provenance Label
Appears on any pre-filled input field:
```
"From prior period"           → ink-blue label
"Matched from bank statement" → ink-blue label  
"AI classified at 98%"        → ink-blue label + confidence score
"No prior period data"        → muted label explaining why empty
```

### Certification Screen (The Only Dark Screen)
- Background: `#2C2416` (ledger-900)
- Company name: serif, 22px, `#F5F0E8`
- Badge/label: gold, uppercase, tracked
- Hash display: monospace, 11px, `#8B7A5E`
- Primary button: gold background, `#2C2416` text — "Download Certificate"
- Ghost button: `#5C4F3A` border, `#DDD5C2` text — "Verify Independently"
- This screen requires explicit acknowledgment before dismissal

### Progress Rail
Persistent on every close-related page. Shows:
```
Gate {N} of 11 · {Module/Stage name} · {N} JEs proposed · Close day {N} of {N} · {N} gates remaining before {next state}
```
Background: `ledger-100` (`#EDE6D6`)
Text: `ledger-600` (`#5C4F3A`)
Active gate highlighted in forest green

---

## Color Encoding — Agency Model

This is the most important semantic rule in the system.

| Color | Meaning | Example |
|-------|---------|---------|
| Ink blue (`#3B6EA5`) | Sabit acted autonomously | "AI classified at 98%" badge, auto-proposed JE, pre-filled balance |
| Forest green (`#2D6A4F`) | Human confirmed / gate passing | Accepted mapping, completed reconciliation, passed gate |
| Amber (`#8B6914`) | Needs human attention | Low confidence suggestion, unexplained variance, pending approval |
| Rust (`#C44B2B`) | Blocking — human must act | Failed gate, blocking issue, validation error |
| Gold (`#B8860B`) | Cryptographically sealed | Certified state, hash verified, Ed25519 signature |

A controller reading any screen should be able to understand the state of work from color alone — without reading a single label.

---

## What Never Ships

These patterns violate the design system and must be rejected in PR review:

- `#FFFFFF` anywhere in the UI
- Any color not in the token system
- Gold used for anything other than certified/signed states
- Serif typeface outside the Certificate of Close screen
- The dark `#2C2416` surface anywhere other than the certification screen
- Ambient (always-on) verification badges — the pulse is event-driven only
- Raw event types, user IDs, or GUIDs in any user-facing text
- Input fields asking the controller to enter data Sabit can provide
- Module pages with no visible connection to the gate pipeline
- Hardcoded hex values in component code — always use CSS custom properties

---

## File Maintenance

This file is updated when:
- A new color or semantic role is added (requires explicit decision, not designer discretion)
- A new component pattern is established
- A manifesto principle is revised

**Do not add colors to this file without a documented reason.** The Ledger palette is intentionally constrained. Every new color dilutes the semantic meaning of the existing ones.

Last updated: 2026-03-26  
Maintained by: Yasir (product) + Claude Code (implementation reference)
