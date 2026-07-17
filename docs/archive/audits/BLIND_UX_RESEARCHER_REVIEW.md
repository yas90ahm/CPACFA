# Blind UX Researcher Review: Sovereign CPA Engine ("Sabit")

**Reviewer**: UX Researcher (CPA background)
**Date**: March 13, 2026
**Method**: Blind first-time code review of all 27 frontend .tsx files
**Scope**: Complete product surface area -- login through certification and lock

---

## Executive Summary

**Overall Grade: 3.6 / 5.0 (B-)**

Sabit is a structurally impressive financial close automation platform that demonstrates deep domain expertise. The pipeline architecture faithfully mirrors the real-world close process, the gate-based progression prevents premature advancement, and the cryptographic certification layer is a genuinely differentiating trust feature. The permission model correctly enforces Separation of Duties, and the AI integration is appropriately scoped as advisory-only -- a critical design decision for financial software.

However, the product suffers from three systemic UX problems that will create friction for every persona:

1. **Cognitive overload on high-density pages** -- Reconciliation, variance, and review pages pack 10-15 columns of financial data with minimal progressive disclosure. Controllers will spend their first week learning the interface rather than closing books.

2. **Weak cross-page wayfinding** -- The pipeline is linear but the navigation does not consistently communicate "where am I, what did I just finish, and what do I need to do next." Gate failures on the dashboard link to fix pages, but those pages do not link back or confirm the gate is now satisfied.

3. **Under-developed first-time experience** -- The OnboardingWizard covers initial setup but does not carry contextual guidance into the close workflow itself. FirstTimeGuide tooltips exist but are localStorage-based singletons that disappear permanently after one dismissal with no way to resurface them.

The product's strengths are real and significant: the state machine is correctly modeled, the audit trail is genuinely tamper-evident, the verification portal is a best-in-class trust differentiator, and the role-based access control is granular without being brittle. With targeted UX improvements focused on progressive disclosure, contextual guidance, and workflow continuity, this product can move from a 3.6 to a 4.5.

---

## Detailed Evaluation

### 1. Information Architecture (Score: 3.5 / 5)

**What works:**
- The sidebar groups are logically organized into four categories: Close Pipeline, Statements & Analysis, Specialized Modules, and Governance. This mirrors how accounting teams think about the close.
- Badge counts on sidebar items (unmapped accounts, incomplete recons, pending adjustments, unexplained variances) provide real-time status without requiring page visits.
- The UNDER_REVIEW state correctly promotes "Review & Certify" to the top of the sidebar, reflecting the shifted priority.
- Role-based sidebar visibility is well-calibrated: Operating Partners see 6 pages (appropriate for their oversight role), auditors see 18 pages (they need read access to everything), fund controllers see only 2 portfolio pages.

**Friction points:**
- **No breadcrumb navigation.** When a controller drills from the reconciliation list into a specific account reconciliation (`/reconciliation/[reconId]`), there is no visible breadcrumb showing the path. The prev/next navigation between recons partially compensates, but users lose spatial context.
- **Sidebar badge semantics are inconsistent.** Some badges show counts (unmapped: 12), others show status indicators. The GL Quality badge shows a letter grade (A-F) which is a different information type than numeric counts. A first-time user cannot predict what clicking a badge will reveal.
- **The Audit Binder page is a table-of-contents that links to existing pages.** It does not aggregate content inline or provide a unified export view. An auditor expecting a consolidated binder will find a navigation hub instead, which duplicates what the sidebar already provides.
- **Four sidebar groups with 15+ items is at the edge of scannability.** Research consistently shows that navigation menus beyond 7-9 items require grouping cues that are stronger than subtle section headers.

**Recommendation (Effort: S):** Add breadcrumb navigation to all drill-down pages. Standardize badge types: use numeric counts for actionable items and status icons for informational items. Consider collapsing sidebar groups by default with expand-on-hover or expand-on-click behavior.

---

### 2. Controller Workflow (Score: 3.5 / 5)

**What works:**
- The GL upload flow is the best-designed interaction in the product. The multi-step progression (parse, map columns, validate, preview, confirm, ingest) gives the controller confidence at every stage. The auto-detection of column mappings reduces manual work. The trial balance preview with balance check before committing is exactly what a controller needs.
- The pipeline stepper on the dashboard provides a clear visual of the 8-step close process with completion indicators.
- Batch operations are well-supported: batch accept AI mapping suggestions, batch entry mode for reconciliation supporting balances, bulk apply templates.
- The reconciliation batch entry mode with inline editing, auto-save on blur, and real-time variance computation is thoughtfully designed for the high-volume data entry that reconciliation requires.

**Friction points:**
- **No save-and-continue pattern.** When a controller finishes mapping accounts and needs to move to reconciliation, there is no explicit "proceed to next step" action. They must manually navigate via the sidebar. The pipeline stepper on the dashboard is read-only -- it shows status but does not provide navigation.
- **The adjustments page splits into Journal Entries and Templates tabs, but the workflow relationship between them is unclear.** A first-time controller may not understand that templates generate journal entries, or that "Apply" on a template creates a draft JE that still needs the propose/approve/post lifecycle.
- **Reconciliation auto-initialization is invisible.** The page silently creates reconciliation records on first visit. This is efficient but the controller receives no confirmation of what was created, no explanation of why certain accounts were included, and no ability to configure which accounts require reconciliation before initialization.
- **The GL replace flow warns about downstream data reset but does not show specifically what will be lost.** A controller who has completed 30 reconciliations needs to know exactly what will be wiped before re-uploading.
- **No keyboard shortcuts for high-frequency actions.** Batch entry mode in reconciliation would benefit from Tab-to-next-field and Shift+Tab navigation, but these are not documented or guaranteed by the current implementation.

**Recommendation (Effort: M):** Add a "Continue to [Next Step]" button at the bottom of each pipeline page that appears when the current step's gate is satisfied. Make the pipeline stepper on the dashboard clickable. Add a pre-initialization confirmation dialog for reconciliation showing which accounts will be created.

---

### 3. CFO Workflow (Score: 3.0 / 5)

**What works:**
- The ReviewerDashboard is purpose-built for the CFO persona with sections for items awaiting approval, certification readiness, AI justification review, digital signature status, and recent activity.
- The certification flow requires typed confirmation ("CERTIFY") which prevents accidental certification -- appropriate friction for an irreversible action.
- The board package generation with monthly/QTD/YTD periods is a valuable time-saver.
- The read-only banner clearly communicates that the CFO is in review mode, not edit mode.

**Friction points:**
- **The ReviewerDashboard does not show the financial statements themselves.** The CFO's primary job during review is to read the financial statements and verify they look correct. The dashboard shows metadata (pending approvals, gate status) but the CFO must navigate away to the Statements page to actually review the numbers. This is a critical workflow gap.
- **Approval actions are scattered across multiple pages.** JE approvals are on the Adjustments page, recon approvals are on individual recon detail pages, variance explanations are on the Variance page. The ReviewerDashboard links to these pages but does not provide inline approval capability. A CFO reviewing a close will bounce between 4-5 pages.
- **No "approve all" or bulk approval pattern.** If there are 15 journal entries awaiting approval, the CFO must approve each individually. For reconciliations, they must drill into each one.
- **The certification readiness checklist shows 5 items but does not indicate which are blocking.** All items appear equal even if only one is preventing certification.
- **The reopen flow (UNDER_REVIEW back to IN_PROGRESS) requires a reason, which is good, but there is no way to attach the reason to specific items that need fixing.** The CFO cannot say "reopen because JE #47 has the wrong amount" -- they can only provide a general text reason.

**Recommendation (Effort: M):** Add a financial statement summary section to the ReviewerDashboard with key line items and period-over-period changes. Implement an approval queue that aggregates all pending approvals (JEs, recons, variances) into a single reviewable list with inline approve/reject actions. Add blocking/non-blocking indicators to the certification checklist.

---

### 4. PE Partner Workflow (Score: 3.5 / 5)

**What works:**
- The portfolio page is well-designed for the PE oversight use case: KPI cards (EBITDA, Revenue, Avg Close Days, Certified count), company table with sparkline trends, and alerts with severity styling.
- "Companies Needing Attention" with overdue/stalled indicators surfaces exactly the information a PE partner needs without requiring them to drill into individual entities.
- The entity drill-down provides tabs for overview, statements, EBITDA, variance, and audit trail -- a complete read-only view of each portfolio company.
- Period navigation (prev/next month) allows quick comparison across periods.

**Friction points:**
- **The portfolio page has 11 columns in the company table.** On a laptop screen, this will require horizontal scrolling. PE partners typically review on laptops during meetings or travel. The most important columns (company name, status, close progress, EBITDA) should be visible without scrolling.
- **No cross-entity comparison view.** A PE partner managing 10 portfolio companies wants to compare EBITDA margins, revenue growth, or close timelines across entities in a single view. The current design requires drilling into each entity individually.
- **The consolidated view tab exists but its implementation is unclear from the code.** Fund controllers are routed to `/portfolio/consolidated` but the portfolio page shows Entity View / Consolidated View as tabs on the same page. The relationship between these is ambiguous.
- **Alerts lack actionability.** The alerts section shows warnings but does not provide direct links to the specific entity/page that needs attention. Dismissing an alert removes it with no undo.
- **No email digest or scheduled report capability.** PE partners want to receive a weekly summary without logging into the platform.

**Recommendation (Effort: S):** Prioritize the first 5-6 columns in the company table and make remaining columns toggleable. Add direct "View" links on alerts that navigate to the relevant entity and page. Consider a cross-entity comparison dashboard as a medium-term feature.

---

### 5. Auditor Workflow (Score: 3.0 / 5)

**What works:**
- The verification portal (`/verify`) is genuinely excellent. The four-tab structure (Certificate Lookup, Chain Verification, Evidence Manifest, Public Key) covers every verification need. The "How to Verify" instructions are clear. The independent re-verification button is a trust differentiator that no competitor offers.
- The audit trail page with hash chain integrity verification, rich filtering (15 event types), and expandable event cards showing before/after state with computed diffs is comprehensive.
- The controls page provides a structured testing framework with passed/failed/not-tested status and evidence attachment.
- Auditors have read access to 18 pages -- appropriately broad without including administrative functions.

**Friction points:**
- **The Audit Binder is a navigation hub, not a binder.** Auditors expect to open an audit binder and see all workpapers organized in sections with actual content. The current page shows 7 section descriptions with "View full page" links. This adds a click to every audit task and does not support the auditor's mental model of a physical binder.
- **The Export ZIP and Export PDF buttons on the audit binder appear to be non-functional (no click handlers beyond the button elements).** An auditor's primary need is to export a complete binder for offline review or inclusion in their own audit management system.
- **No PBC (Prepared by Client) list.** Auditors maintain a list of items requested from the client. There is no structured way to request specific documents or track which requests are fulfilled.
- **The evidence manifest on the review page shows file hashes, but there is no way to download all evidence files in bulk.** Auditors need to download all supporting documents for a specific reconciliation or the entire close.
- **The controls page does not map to standard audit assertions (existence, completeness, valuation, rights/obligations, presentation).** While the page supports assertions as a field, there is no structured framework guiding the auditor through assertion-based testing.
- **No sampling guidance.** Auditors need to select samples from transaction populations. There is no sampling tool or integration.

**Recommendation (Effort: L):** Redesign the Audit Binder to display inline content for each section (summary data, key metrics, evidence counts) rather than just links. Implement functional ZIP/PDF export. Add a PBC request tracking feature as a medium-term enhancement.

---

### 6. Cognitive Load (Score: 3.0 / 5)

**What works:**
- Design tokens (CSS custom properties) provide consistent visual language across all pages. Colors, borders, and surfaces use a coherent system.
- Empty states are handled consistently with the EmptyState component providing icon, title, description, and CTA.
- Loading states use skeleton screens rather than spinners, reducing perceived wait time.
- Financial data formatting is consistent: Decimal strings, proper debit/credit presentation, GAAP-compliant statement headers.

**Friction points:**
- **The reconciliation list page has 12 columns.** Even on a wide monitor, this creates scanning difficulty. Columns like Preparer, Reviewer, Prior Period Balance, and Evidence Count are useful but secondary. They should be available on demand rather than always visible.
- **The variance page layers three independent controls: period view (Current/QTD/YTD), comparison type, and materiality threshold.** Combined with the filter, search, and classification controls, a first-time user faces 6+ interactive elements before seeing any data.
- **The trial balance page displays all accounts in a single flat list.** With hundreds of GL accounts, even with search and type filters, this is overwhelming. There is no hierarchical grouping by account type (Assets > Current Assets > Cash) that controllers expect from their chart of accounts.
- **Modal dialogs are used for both lightweight confirmations and complex data entry (JE creation).** The JE creation slide-over panel is appropriate for its complexity, but the same pattern is used inconsistently -- some actions use modals, others use inline expansion, others use full-page navigation.
- **The dashboard packs financial highlights, pipeline stepper, gates checklist, day tracker, and progress ring into a single view.** Each component is individually well-designed but the aggregate is dense. There is no visual hierarchy guiding the eye to the most important information first.
- **Color coding is used heavily but the legend is implicit.** Red/yellow/green for status, blue for interactive elements, purple for AI suggestions -- the user must learn the color vocabulary through exposure rather than explicit documentation.

**Recommendation (Effort: M):** Implement progressive disclosure on data-dense pages: show 5-7 key columns by default with a "Show more columns" toggle. Add column customization so controllers can configure their preferred view. Group trial balance accounts by type with collapsible sections. Add a "What do these colors mean?" tooltip or legend to data-dense pages.

---

### 7. Error Recovery (Score: 3.5 / 5)

**What works:**
- The ErrorBoundary component catches rendering errors, displays a helpful message ("Your data is safe"), and provides both "Reload Page" and "Report Issue" actions. This is exactly the right pattern for financial software where data loss anxiety is high.
- The GL upload flow handles partial imports (207 status) gracefully with downloadable error reports. Validation errors during upload show the expected CSV format, allowing the user to self-correct.
- The gate system itself is an error prevention mechanism -- it prevents the controller from advancing to the next step with incomplete work.
- JE rejection requires a minimum 10-character reason, ensuring the rejector provides actionable feedback.
- Toast notifications provide feedback for both success and error states.

**Friction points:**
- **No undo for destructive actions.** Posting a journal entry is explicitly described as irreversible (database triggers prevent UPDATE/DELETE), but there is no "reverse entry" workflow. In accounting, the standard recovery pattern is to post a reversing entry, not to undo the original. The product does not guide users toward this pattern.
- **The recon auto-initialization has no undo.** If the system creates reconciliation records for the wrong accounts, the user cannot delete them or reconfigure which accounts require reconciliation.
- **Alert dismissal on the portfolio page has no undo.** Once dismissed, the alert is gone.
- **The "Lock" action on the review page is described as terminal and permanent with no recovery path.** While this is architecturally correct (immutability is a feature), the UX does not sufficiently communicate the gravity of this action. The typed confirmation pattern used for "CERTIFY" should also be used for "LOCK."
- **Network errors during multi-step flows (GL upload, batch reconciliation save) show generic error messages.** The user cannot distinguish between "your session expired" and "the server is down" and "one of your 30 rows had invalid data."
- **No auto-save for in-progress work.** The reconciliation batch entry mode saves on blur, but the JE creation form, variance explanations, and other text-heavy inputs do not auto-save. Browser crash or accidental navigation loses work.

**Recommendation (Effort: S):** Add typed confirmation for the Lock action. Add a "Create Reversing Entry" action on posted JEs. Implement auto-save with draft status for all form inputs longer than a single field. Add specific error messages for network failures vs. validation errors vs. session expiration.

---

### 8. Trust Signals (Score: 4.0 / 5)

**What works:**
- The login page displays three security badges: SOC 2 Type II, 256-bit Encryption, AICPA Compliant. These are the exact credentials that financial professionals look for.
- The verification portal is a standout feature. The ability for anyone to independently verify a certification using the public key, without needing an account, is a powerful trust mechanism that positions Sabit above competitors.
- The hash-chained audit trail with visual chain links showing integrity status (verified/broken) provides transparent tamper evidence.
- Ed25519 digital signatures for certification are prominently displayed with full cryptographic details on the ReviewerDashboard.
- The evidence manifest on the review page shows individual file hashes, allowing verification of document integrity.
- The "Your data is safe" message in the ErrorBoundary is a small but important trust signal during error states.
- Database enforcement checks in the verification portal (append-only trigger, snapshot immutability) go beyond application-level trust to demonstrate infrastructure-level integrity.

**Friction points:**
- **The security badges on the login page are self-asserted, not linked to actual certification documents.** A cautious CFO would want to click on "SOC 2 Type II" and see the actual attestation report or at least a link to request it.
- **Hash values are displayed as raw hex strings.** While technically accurate, most financial users cannot interpret these. A "Verified" badge with a "Show technical details" expandable would serve both audiences.
- **The certification artifact page does not explain what the signature proves.** It shows the Ed25519 public key and signature, but does not explain in plain language: "This signature proves that these specific financial statements were certified by [name] on [date] and have not been modified since."

**Recommendation (Effort: S):** Add a plain-language explanation above each cryptographic element: "What does this prove?" Link security badges on the login page to relevant documentation. Default to showing "Verified" status badges with hash details behind a "Technical details" toggle.

---

### 9. AI Transparency (Score: 4.0 / 5)

**What works:**
- AI is explicitly scoped as advisory-only: it suggests account mappings and drafts variance explanations but never computes dollar amounts or writes to financial tables. This is the correct architectural decision for financial software and it is communicated clearly.
- The AISuggestionCard component provides a consistent UI pattern for AI suggestions across mapping and variance pages.
- Confidence scores are visualized with color-coded bars on the mapping page, giving users a quantitative basis for accepting or rejecting suggestions.
- The auto-accept threshold (95% confidence) is user-configurable, not hidden. Users opt into automation rather than having it imposed.
- The HITL (Human-in-the-Loop) staging area on the ReviewerDashboard shows AI justifications that require CFO review before finalization.
- The "Generate AI Suggestions" button makes AI invocation explicit rather than automatic -- the user decides when to use AI.

**Friction points:**
- **AI suggestions do not show reasoning.** The mapping page shows a confidence percentage but does not explain why the AI suggested mapping "Account 4100" to "Revenue." A controller needs to understand the basis to trust the suggestion. Was it based on account name matching, historical patterns, or industry standards?
- **No feedback loop.** When a user rejects an AI suggestion and selects a different mapping, this correction is not visually acknowledged as training data. The user does not know if their corrections will improve future suggestions.
- **The AI draft for variance explanations does not cite its data sources.** When the AI drafts "Revenue increased 15% due to new customer acquisition," the user cannot verify whether the AI analyzed transaction-level data or is generating plausible text.
- **No AI confidence threshold documentation.** Users can set auto-accept at 95% but there is no guidance on what confidence levels mean, how they are calculated, or what threshold is appropriate for their use case.

**Recommendation (Effort: M):** Add a "Why this suggestion?" expandable section to each AI suggestion showing the reasoning and data sources. Display a brief note when corrections are captured: "Your correction will improve future suggestions." Add tooltips or help text explaining confidence score methodology.

---

### 10. First-Time Experience (Score: 2.5 / 5)

**What works:**
- The OnboardingWizard provides a structured 7-step introduction covering entity setup, chart of accounts import, trial balance configuration, and an AI-generated close guide. The progress bar with step labels gives clear positional context.
- The FirstTimeGuide component provides dismissable tooltips that can wrap any element.
- The login page auto-redirects authenticated users and routes them to role-appropriate landing pages.

**Friction points:**
- **The OnboardingWizard covers setup but not the close workflow.** After completing onboarding, the controller lands on the dashboard with no guidance on what to do first. The pipeline stepper shows 8 steps but does not explain what each step involves or how long it typically takes.
- **FirstTimeGuide tooltips are localStorage-based and disappear permanently after dismissal.** There is no "Help" menu or "Show tips again" option. A controller who dismisses a tooltip on day 1 cannot resurface it on day 5 when they actually need it.
- **No interactive tutorial or guided close walkthrough.** The first close is the most critical moment for user adoption. A "Start your first close" guided experience that walks through each pipeline step with sample data would dramatically improve time-to-value.
- **Role-specific onboarding is absent.** The OnboardingWizard is the same for all roles. A CFO does not need to learn about GL upload; they need to understand the review and certification flow. A PE partner needs a 2-minute overview of portfolio monitoring, not a 7-step setup wizard.
- **No contextual help within close workflow pages.** Pages like reconciliation and adjustments are feature-rich but provide no embedded documentation. A "?" icon linking to relevant help content would reduce the learning curve.
- **The product does not track onboarding completion or prompt users who abandon the wizard.** If a controller closes the wizard at step 3 and returns the next day, they start from scratch or not at all -- the state is not persisted to the backend.
- **No sample/demo data option.** New users cannot explore the product with realistic data before committing their own financial information. This is especially important for evaluation by CFOs and PE partners who want to see the product in action before purchasing.

**Recommendation (Effort: L):** Create role-specific onboarding flows (controller: 7 steps, CFO: 3 steps, PE partner: 2 steps). Add a persistent "Help" menu that resurfaces dismissed tooltips and links to contextual documentation. Build a guided first-close walkthrough that accompanies the controller through each pipeline step. Implement a demo mode with sample data for evaluators.

---

## Top 10 Friction Points (Ranked by Severity)

| Rank | Friction Point | Affected Persona(s) | Severity | Area |
|------|---------------|---------------------|----------|------|
| 1 | No guided first-close walkthrough; tooltips disappear permanently | All, especially Controller | Critical | First-Time Experience |
| 2 | CFO approval actions scattered across 4-5 separate pages with no unified queue | CFO | High | CFO Workflow |
| 3 | Audit Binder is a link hub, not an actual binder with inline content | Auditor | High | Auditor Workflow |
| 4 | Reconciliation page displays 12 columns with no progressive disclosure | Controller | High | Cognitive Load |
| 5 | No "Continue to Next Step" navigation between pipeline stages | Controller | High | Controller Workflow |
| 6 | AI suggestions show confidence scores but no reasoning or data sources | Controller, CFO | Medium | AI Transparency |
| 7 | Financial statements not visible on ReviewerDashboard; CFO must navigate away | CFO | Medium | CFO Workflow |
| 8 | No cross-entity comparison view for PE portfolio analysis | PE Partner | Medium | PE Partner Workflow |
| 9 | No auto-save for in-progress form inputs; browser crash loses work | Controller | Medium | Error Recovery |
| 10 | Hash values displayed as raw hex with no plain-language explanation | Auditor, CFO | Low | Trust Signals |

---

## Recommendations Summary

### High Priority -- Immediate Action (Effort: S = Small, days; M = Medium, 1-2 weeks)

| # | Recommendation | Effort | Impact |
|---|---------------|--------|--------|
| 1 | Add "Continue to [Next Step]" button on pipeline pages when gate is satisfied | S | Reduces navigation friction for every close |
| 2 | Add breadcrumb navigation to all drill-down pages | S | Improves spatial orientation across product |
| 3 | Add typed confirmation for Lock action (matching CERTIFY pattern) | S | Prevents irreversible mistakes |
| 4 | Add plain-language explanations above cryptographic elements | S | Makes trust signals accessible to non-technical users |
| 5 | Implement progressive disclosure on reconciliation page (5-7 default columns) | M | Reduces cognitive load on highest-traffic page |
| 6 | Build unified approval queue on ReviewerDashboard with inline actions | M | Eliminates CFO page-hopping during review |
| 7 | Add "Why this suggestion?" reasoning to AI suggestions | M | Increases AI suggestion acceptance rate |

### Medium Priority -- Next Quarter (Effort: M-L)

| # | Recommendation | Effort | Impact |
|---|---------------|--------|--------|
| 8 | Create role-specific onboarding flows (3 variants) | M | Reduces time-to-productivity per persona |
| 9 | Add persistent Help menu with re-surfaceable tooltips | M | Supports ongoing learning beyond day 1 |
| 10 | Redesign Audit Binder with inline content summaries and functional export | L | Transforms auditor experience from navigation to review |
| 11 | Add cross-entity comparison dashboard for PE partners | M | Enables portfolio-level analysis without drilling |
| 12 | Group trial balance by account type with collapsible hierarchy | M | Matches controller mental model of chart of accounts |
| 13 | Implement auto-save with draft status for all multi-field forms | M | Prevents data loss and reduces save anxiety |

### Long-Term Opportunities (Effort: L = Large, 1+ months)

| # | Recommendation | Effort | Impact |
|---|---------------|--------|--------|
| 14 | Build guided first-close walkthrough with sample data | L | Single highest-impact first-time experience improvement |
| 15 | Add PBC request tracking for auditor workflow | L | Opens new value stream for auditor collaboration |
| 16 | Implement email digest / scheduled reports for PE partners | L | Reduces login friction for oversight persona |
| 17 | Add demo mode with realistic sample data for evaluators | L | Accelerates sales cycle and evaluation confidence |

---

## Product Strengths

These are the areas where Sabit demonstrates genuinely excellent UX thinking that should be preserved and amplified:

1. **The GL Upload Flow is best-in-class.** The multi-step progression with auto-detection, validation, preview, and balance check before commit is exactly what controllers need. The error handling (partial imports with downloadable error reports, expected format display) is thorough. This flow should be the template for all other multi-step interactions in the product.

2. **The Verification Portal is a market differentiator.** No competing financial close product offers a public, unauthenticated verification portal with independent cryptographic re-verification. The four-tab structure covers every verification scenario. The "How to Verify" instructions make cryptographic concepts accessible. This feature alone could win deals with audit-sensitive PE firms.

3. **AI is correctly scoped as advisory-only.** In financial software, the temptation to let AI "do more" is strong. Sabit resists this temptation at an architectural level: AI never computes dollars or writes to financial tables. Every suggestion requires human confirmation. The auto-accept threshold is user-controlled. This is the right trust calibration for the CPA profession.

4. **The gate system prevents errors by design.** Rather than relying on warnings or confirmations, the product structurally prevents premature advancement. You cannot certify with unexplained variances. You cannot post a journal entry without a memo. You cannot skip reconciliation. This "impossible to do wrong" approach is more effective than any number of warning dialogs.

5. **The permission model enforces Separation of Duties without being brittle.** The `canApproveJE` function correctly prevents the creator from approving their own journal entry. Role visibility is granular (6 different role definitions) without creating an administration burden. The system correctly distinguishes between "cannot see" (sidebar visibility) and "cannot act" (action permissions).

6. **The audit trail is genuinely tamper-evident.** The hash-chained, append-only log with before/after state diffs and visual chain integrity verification goes beyond checkbox compliance. The database-level triggers preventing modification of posted entries, combined with the application-level hash chain, create defense-in-depth that auditors can independently verify.

7. **Batch operations respect the controller's workflow.** Batch accept for AI mapping suggestions, batch entry mode for reconciliation, bulk apply for templates -- these are not afterthoughts. They demonstrate understanding that controllers process hundreds of accounts and need efficient bulk operations, not one-at-a-time interactions.

8. **The state machine is correctly modeled and visually communicated.** The five states (OPEN, IN_PROGRESS, UNDER_REVIEW, CERTIFIED, LOCKED) with their transition rules are enforced at the API level and communicated in the UI through banners, badges, and conditional rendering. The UI correctly adapts its entire presentation based on the current state.

9. **Design token consistency across all 27 files.** Every page uses the same CSS custom property system for colors, borders, and surfaces. This creates visual coherence even across feature-rich pages with very different content types. The design system is clearly documented and consistently applied.

10. **Empty states and loading states are handled with care.** Every data-dependent page has a skeleton loading state (not spinners) and a meaningful empty state with icon, explanation, and CTA. The EmptyState component is reused consistently. This attention to transitional states shows maturity in the frontend architecture.

---

## Score Summary

| Area | Score | Notes |
|------|-------|-------|
| Information Architecture | 3.5 | Strong grouping, weak wayfinding between pages |
| Controller Workflow | 3.5 | Excellent GL upload, missing inter-step navigation |
| CFO Workflow | 3.0 | Good review dashboard, scattered approval actions |
| PE Partner Workflow | 3.5 | Strong portfolio view, needs cross-entity comparison |
| Auditor Workflow | 3.0 | Excellent verification portal, weak audit binder |
| Cognitive Load | 3.0 | Consistent design system, dense data pages |
| Error Recovery | 3.5 | Good error boundaries, missing undo/auto-save |
| Trust Signals | 4.0 | Industry-leading verification, needs plain language |
| AI Transparency | 4.0 | Correctly scoped, needs reasoning transparency |
| First-Time Experience | 2.5 | Wizard exists, no workflow-level guidance |
| **Overall** | **3.6** | **Structurally sound, needs UX polish** |

---

*This review was conducted as a blind first-time evaluation reading only .tsx source files with no prior documentation, user guides, or design specifications. Findings reflect the experience a new user would have encountering the product for the first time, evaluated through the lens of a CPA-trained UX researcher familiar with financial close processes.*
