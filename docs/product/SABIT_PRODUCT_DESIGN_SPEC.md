# SABIT PRODUCT DESIGN SPECIFICATION

> Designed from first principles based on the product brief. No existing implementation referenced.
> Generated: 2026-03-12

---

# SECTION A: UX RESEARCH



# Sabit Financial Close Engine -- UX Research Deliverables

---

# PART 1: USER RESEARCH PLAN

---

## 1.1 User Personas

### Persona 1: The Controller -- "Sarah Chen"

| Attribute | Detail |
|---|---|
| **Title** | Controller / Senior Accountant |
| **Company Profile** | PE-backed mid-market company, $50M--$500M revenue, 3--15 person accounting team |
| **Age Range** | 32--50 |
| **Education** | CPA, often MBA |
| **Tech Proficiency** | Intermediate. Proficient in Excel, ERP systems (NetSuite, Sage Intacct, QuickBooks Enterprise). Not a power user of modern SaaS tools. Suspicious of "AI" claims but desperate for efficiency. |
| **Frequency of Use** | Intensive use during monthly close (days 1--10 of each month). Light use mid-month for ad hoc adjustments or audit prep. Quarterly and annual close cycles are the highest-intensity periods. |
| **Goals** | (1) Close the books accurately within the PE-mandated timeline, typically 10 business days for monthly, 15 for quarterly. (2) Produce GAAP-compliant financial statements that will survive audit scrutiny. (3) Reduce the manual, error-prone spreadsheet work that currently consumes 60%+ of close time. (4) Have a defensible audit trail for every number on the financial statements. (5) Look competent and in control to the CFO and PE partners. |
| **Pain Points** | (1) Manual trial balance assembly from GL exports is tedious and error-prone. (2) Account classification to financial statement line items is inconsistent month over month when done manually. (3) Balance sheet reconciliations live in dozens of Excel files with no central tracking. (4) Adjusting journal entries require email-based approval workflows that are slow and lose context. (5) Variance analysis is done in Excel with manual commentary that PE partners find insufficient. (6) No single source of truth -- data lives across ERP, Excel, email, and shared drives. (7) Anxiety about errors that will surface during audit. (8) Pressure from PE operating partners who expect institutional-quality reporting from a mid-market team. |
| **Success Criteria** | (1) Close completed within deadline. (2) Zero material misstatements. (3) Clean audit opinion. (4) CFO signs off without extensive rework requests. (5) Time spent on close reduced by 40%+. |
| **Emotional State** | Ranges from controlled stress at close start to deep anxiety during reconciliation and variance analysis, to relief and pride when certification is complete. The reconciliation phase is where most controllers report feeling "underwater." |
| **Quote** | *"I spend the first ten days of every month terrified I'm going to miss something. By the time the CFO signs off, I'm already dreading next month."* |

### Persona 2: The CFO -- "David Park"

| Attribute | Detail |
|---|---|
| **Title** | Chief Financial Officer |
| **Company Profile** | Same PE-backed mid-market company. Reports to CEO and PE operating partner. |
| **Age Range** | 40--55 |
| **Tech Proficiency** | Low to intermediate for operational tools. Reviews outputs, does not produce them. Comfortable with dashboards and PDF reports. Will not tolerate clunky interfaces. |
| **Frequency of Use** | 2--4 sessions per close cycle (review draft statements, review flagged variances, final certification). Occasional ad hoc access for board prep or investor requests. |
| **Goals** | (1) Confidence that financial statements are materially correct before signing. (2) Quick identification of issues that need attention versus routine items. (3) Ability to explain any number to the PE operating partner on short notice. (4) Minimize personal liability risk from certification. (5) Demonstrate to PE that the finance function is well-controlled and improving. |
| **Pain Points** | (1) Receives financial statements as Excel files or PDFs with no easy way to drill into supporting detail. (2) Approval requests come via email with insufficient context. (3) Cannot easily see what changed between draft and final versions. (4) Variance explanations from the controller are often superficial. (5) Signing off feels like a leap of faith rather than a validated process. |
| **Success Criteria** | (1) Can review and certify within 2 hours per close. (2) Every variance above materiality has a clear, documented explanation. (3) Audit inquiries can be answered without involving the controller. (4) PE operating partner feedback is positive. |
| **Quote** | *"I'm signing my name to these numbers. I need to trust them, and right now trust requires too much manual verification."* |

### Persona 3: The PE Operating Partner -- "Maria Torres"

| Attribute | Detail |
|---|---|
| **Title** | Operating Partner / Portfolio Operations Director |
| **Company Profile** | Private equity firm with 8--25 portfolio companies. Responsible for operational improvement and financial oversight across the portfolio. |
| **Age Range** | 35--50 |
| **Tech Proficiency** | High for analytical tools. Comfortable with dashboards, data visualization, and SaaS platforms. Impatient with poor UX. |
| **Frequency of Use** | Weekly dashboard checks. Deep dives during portfolio company close cycles. Intensive use during quarterly board reporting and annual budget season. |
| **Goals** | (1) See the financial health of all portfolio companies in one view. (2) Identify companies that are off-plan immediately, without waiting for management to self-report. (3) Standardize financial reporting quality across the portfolio. (4) Reduce time from close to reported results. (5) Ensure all portfolio companies achieve clean audits. |
| **Pain Points** | (1) Each portfolio company reports in different formats, timelines, and levels of detail. (2) No way to compare companies on a normalized basis without manual work. (3) Relies on management teams to self-report issues, which introduces delay and bias. (4) Close timelines vary wildly across the portfolio, with some companies chronically late. (5) Cannot drill from a portfolio-level metric into the supporting detail. |
| **Success Criteria** | (1) All portfolio companies visible on one dashboard within 24 hours of close. (2) Can identify material variances across the portfolio without opening individual reports. (3) Close timeline compliance is 90%+ across the portfolio. (4) Board reporting prep time reduced by 50%. |
| **Quote** | *"I manage fifteen companies. I need to know which three need my attention this month, and I need to know that before they tell me."* |

### Persona 4: The External Auditor -- "James Wright"

| Attribute | Detail |
|---|---|
| **Title** | Audit Manager / Senior Auditor at a regional or national CPA firm |
| **Company Profile** | Performs annual audit or review engagement for the PE-backed company. |
| **Age Range** | 28--45 |
| **Tech Proficiency** | Intermediate. Uses audit-specific software (CaseWare, CCH, Workiva). Comfortable with structured data but not modern SaaS interfaces. |
| **Frequency of Use** | Concentrated during audit fieldwork (2--6 weeks per year per client). Occasional interim testing. Does NOT have a persistent login -- accesses via verification links. |
| **Goals** | (1) Independently verify that financial statements are materially correct. (2) Confirm that the close process has adequate internal controls. (3) Access supporting documentation for any financial statement line item. (4) Complete fieldwork efficiently without excessive back-and-forth with the client. (5) Verify the integrity of the digital certification. |
| **Pain Points** | (1) PBC (Prepared by Client) lists require dozens of follow-up requests. (2) Supporting documentation is scattered across systems. (3) Cannot independently verify that the trial balance ties to the GL. (4) Reconciliation workpapers are inconsistent in format and completeness. (5) Adjusting entry approvals are undocumented or documented in email threads that are hard to review. |
| **Success Criteria** | (1) Can verify certification without creating an account or logging in. (2) Full audit trail from financial statement line item back to GL transaction. (3) Reconciliation evidence is complete and consistently formatted. (4) Adjusting entry approval chain is documented with timestamps. (5) Fieldwork time reduced by 30%. |
| **Quote** | *"If I could see the complete trail from the financial statements back to the GL without sending a single PBC request, that would transform my fieldwork."* |

---

## 1.2 Top 20 User Stories

| # | Persona | User Story |
|---|---|---|
| 1 | Controller | As a controller, I want to upload my general ledger export from any accounting system so that I can begin the close process without manual data transformation. |
| 2 | Controller | As a controller, I want the system to automatically produce a trial balance from my GL upload so that I can verify account balances without building a TB in Excel. |
| 3 | Controller | As a controller, I want AI to classify my GL accounts to financial statement line items so that I can review and approve mappings rather than build them from scratch each period. |
| 4 | Controller | As a controller, I want to override or correct any AI account classification so that I maintain full control over how accounts appear on the financial statements. |
| 5 | Controller | As a controller, I want to reconcile each balance sheet account with supporting evidence (bank statements, sub-ledger reports, confirmations) so that every balance is substantiated. |
| 6 | Controller | As a controller, I want to see a reconciliation status dashboard showing which accounts are reconciled, in progress, or outstanding so that I can manage my close checklist. |
| 7 | Controller | As a controller, I want to create adjusting journal entries with supporting documentation and submit them for approval so that all adjustments follow a controlled workflow. |
| 8 | Controller | As a controller, I want the system to generate an income statement, balance sheet, cash flow statement, and statement of stockholders' equity using deterministic arithmetic from the adjusted trial balance so that I can trust the math is correct. |
| 9 | Controller | As a controller, I want the system to flag material variances between current and prior period with AI-drafted justifications so that I can review, edit, and finalize variance commentary efficiently. |
| 10 | Controller | As a controller, I want to certify the completed close with a digital signature so that there is a tamper-evident record that the statements were finalized as of a specific date and time. |
| 11 | CFO | As a CFO, I want to see a summary of all flagged variances with explanations before I sign so that I can focus my review on material items. |
| 12 | CFO | As a CFO, I want to drill from any financial statement line item into the supporting trial balance, reconciliation, and GL detail so that I can verify any number without asking the controller. |
| 13 | CFO | As a CFO, I want to approve or reject adjusting journal entries with comments so that the controller knows what needs revision without a separate email thread. |
| 14 | CFO | As a CFO, I want to co-sign the certified financial statements with my own digital signature so that there is a documented record of my review and approval. |
| 15 | CFO | As a CFO, I want to see the close status and timeline (what is done, what is pending, what is blocked) so that I know when the statements will be ready for my review. |
| 16 | Operating Partner | As an operating partner, I want to see all portfolio companies on a single dashboard with close status, key metrics, and flagged issues so that I can identify which companies need my attention. |
| 17 | Operating Partner | As an operating partner, I want to compare financial performance across portfolio companies using normalized metrics so that I can benchmark operational efficiency. |
| 18 | Operating Partner | As an operating partner, I want to see a timeline view showing each company's close progress against its deadline so that I can intervene before a company misses its reporting window. |
| 19 | Auditor | As an external auditor, I want to independently verify a digital certification of the financial statements without creating an account so that I can confirm statement integrity as part of my audit procedures. |
| 20 | Auditor | As an external auditor, I want to access the complete audit trail from financial statement line items through the trial balance to the GL, including reconciliations and adjusting entries, so that I can perform substantive testing efficiently. |

---

## 1.3 Controller Emotional Journey Map

The following maps the controller's emotional arc across the full close cycle, from initiation to certification. The vertical axis represents emotional state from high anxiety / low confidence to calm confidence / relief.

### Phase 1: Close Initiation (Day 1)

**Activities**: Close the sub-ledgers, run final GL reports, export the GL file.

**Emotional State**: MODERATE ANXIETY, DETERMINATION

The controller knows what lies ahead. There is a familiar dread mixed with resolve. The volume of work is known but the unknowns -- what errors will surface, what questions the PE partners will ask -- create background anxiety.

**Key Thought**: *"Here we go again. Let me just get the data out cleanly."*

**Design Implication**: The upload experience must be frictionless and confidence-building. Immediate validation feedback ("We found 4,238 transactions across 312 accounts") reduces the fear that something went wrong in the export.

---

### Phase 2: Trial Balance Generation (Day 1--2)

**Activities**: Upload GL, review auto-generated trial balance, verify totals tie to the ERP.

**Emotional State**: CAUTIOUS OPTIMISM

If the trial balance generates cleanly and ties to the ERP, this is the first moment of relief. The controller sees the system working. If there are discrepancies, anxiety spikes sharply.

**Key Thought**: *"Does it balance? Please let it balance."*

**Design Implication**: Show the TB total prominently with a clear balanced/unbalanced indicator. If unbalanced, provide specific diagnostic information (which accounts are off, by how much) rather than a generic error.

---

### Phase 3: Account Classification (Day 2--3)

**Activities**: Review AI-suggested account mappings to financial statement line items. Accept, modify, or reject suggestions.

**Emotional State**: SKEPTICISM TRANSITIONING TO TRUST

This is where the controller's relationship with the AI is tested. First-time users will be deeply skeptical and review every mapping. Repeat users will trust the system on familiar accounts and focus on new or reclassified accounts. The emotional dynamic is: "This better not make me look stupid if it gets something wrong."

**Key Thought**: *"I don't trust this yet, but if it's right on the ones I check, maybe I can trust the rest."*

**Design Implication**: Show confidence scores for each classification. Highlight new accounts or accounts where the AI's confidence is below a threshold. Make it trivially easy to override. Show the prior period mapping for comparison. Build trust through transparency, not through hiding the AI's work.

---

### Phase 4: Balance Sheet Reconciliation (Day 3--7)

**Activities**: Reconcile every balance sheet account. Upload supporting evidence. Resolve reconciling items.

**Emotional State**: PEAK ANXIETY -- THIS IS THE HARDEST PHASE

This is where controllers spend the most time, encounter the most surprises, and feel the most overwhelmed. Unreconciled differences, missing documentation, and inter-company discrepancies create compounding stress. The controller is managing dozens of reconciliations simultaneously, each at a different stage of completion.

**Key Thought**: *"I have 47 accounts to reconcile and 6 days. Some of these are going to be ugly."*

**Design Implication**: The reconciliation dashboard is the single most important screen in the product. It must show progress clearly (32 of 47 complete), surface the most problematic accounts (sorted by unreconciled difference magnitude), and make evidence attachment effortless. Progress visualization is psychologically critical -- the controller needs to see the number of completed reconciliations climbing.

---

### Phase 5: Adjusting Entries (Day 5--8)

**Activities**: Create adjusting journal entries. Attach documentation. Submit for CFO approval. Respond to rejection comments. Resubmit.

**Emotional State**: FRUSTRATION, DEPENDENCY

The controller's progress now depends on someone else (the CFO) responding to approval requests. This loss of control is emotionally difficult during a time-pressured close. Every hour an AJE sits in "pending approval" is an hour the controller cannot finalize the statements.

**Key Thought**: *"I submitted this two days ago. Why hasn't David approved it? I can't generate the statements until this clears."*

**Design Implication**: Real-time approval status with the ability to send reminder nudges. Show the CFO how many items are waiting and how long they have been waiting. For the controller, clearly indicate which items are blocking statement generation.

---

### Phase 6: Financial Statement Generation (Day 8--9)

**Activities**: Generate the four GAAP statements. Review for presentation accuracy. Compare to prior period.

**Emotional State**: ANTICIPATION, CAUTIOUS RELIEF

If the preceding phases were done well, statement generation should be clean. The controller is looking for presentation issues (line item groupings, subtotals, sign conventions) rather than substantive errors. There is a building sense of "we might actually finish on time."

**Key Thought**: *"Do these look right? Do the subtotals make sense? Will David have questions I can't answer?"*

**Design Implication**: Side-by-side current vs. prior period comparison. Clear indication of which line items changed materially. Every number must be clickable to drill into supporting detail so the controller can pre-answer CFO questions.

---

### Phase 7: Variance Analysis (Day 8--9)

**Activities**: Review AI-flagged material variances. Edit AI-drafted justifications. Add context. Finalize commentary.

**Emotional State**: COGNITIVE LOAD, EDITORIAL FOCUS

The controller shifts from "producer" to "editor" mode. The AI drafts are a starting point, not a final product. The controller needs to apply judgment, add context the AI cannot know (e.g., "this variance is due to the acquisition of XYZ Corp in Q3"), and ensure the commentary will satisfy the PE operating partner's scrutiny.

**Key Thought**: *"The AI got the direction right but the explanation is too generic. The PE partners will see through this."*

**Design Implication**: Present AI drafts as editable suggestions, not final text. Show the underlying data driving each variance. Allow the controller to accept, edit, or replace each justification. Track which justifications were AI-generated vs. human-written for audit purposes.

---

### Phase 8: Certification (Day 9--10)

**Activities**: Final review of the complete close package. Digital signature. Submission to CFO.

**Emotional State**: RELIEF, PRIDE, RESIDUAL ANXIETY

The close is done. The controller feels a mix of accomplishment and lingering worry ("Did I miss something?"). The digital signature is a psychologically significant moment -- it transforms the work from "draft" to "official."

**Key Thought**: *"I'm putting my name on this. I believe these numbers are right. ...I think."*

**Design Implication**: The certification screen should feel weighty and intentional, not casual. Show a summary of the complete close: number of accounts reconciled, adjusting entries processed, variances explained. Include a final checklist of completeness indicators. The signature action should require deliberate confirmation (not a single click).

---

### Emotional Arc Summary

```
Anxiety
  ^
  |         ****
  |        *    *
  |   **  *      *
  |  *  **        *
  | *              **
  |*                 ***
  |                     ****
  +----------------------------> Time
  Day1  Day3  Day5  Day7  Day9  Day10
  Upload  Class  Recon  AJE   Stmt  Cert
                  ^PEAK
```

**Highest Anxiety**: Balance sheet reconciliation (Days 3--7). This is where unknowns surface, where documentation gaps become visible, and where the controller has the least control over outcomes.

**Greatest Relief**: The moment after certification, when the close package is submitted to the CFO and the controller's active role shifts to "respond to questions" rather than "produce deliverables."

---

## 1.4 Competitive Landscape

### Direct Competitors

| Product | What They Get Right | What They Get Wrong |
|---|---|---|
| **FloQast** | Strong close management checklist. Good Excel reconciliation integration. Familiar to controllers. | Relies heavily on Excel templates. No AI classification. No financial statement generation. Essentially a task tracker on top of spreadsheets, not a replacement for them. No PE portfolio view. |
| **BlackLine** | Enterprise-grade reconciliation engine. Strong audit trail. Good matching capabilities. | Designed for large enterprises, not mid-market. Implementation takes 6--12 months. Expensive. UX is dense and intimidating. No AI-assisted variance commentary. No PE-specific features. |
| **Trintech Cadency** | Good reconciliation automation. Financial close task management. | Legacy UX. Complex configuration. Not purpose-built for PE-backed companies. No integrated financial statement generation. |
| **Workiva (Wdesk)** | Excellent at financial statement formatting and SEC reporting. Good collaboration features. | Focused on reporting, not close execution. Does not handle reconciliations. No GL ingestion. Positioned for public companies, not PE portfolio companies. |
| **Numeric** | Modern UX. Good variance analysis. Purpose-built for close management. | Limited reconciliation depth. No financial statement generation. No PE portfolio view. Relatively early stage. |

### Indirect Competitors / Current State

| Tool | Role in Current Workflow | Limitation Sabit Addresses |
|---|---|---|
| **Excel / Google Sheets** | Trial balance, reconciliations, adjusting entries, variance analysis, financial statements. Literally everything. | No workflow, no audit trail, no version control, no approval routing, no multi-company view, error-prone, non-scalable. |
| **ERP System (NetSuite, Sage Intacct)** | Source of GL data. Some have basic financial reporting. | ERPs are transactional systems, not close management systems. Their reporting is rigid, their reconciliation tools are minimal, and they have no PE-specific features. |
| **Email / Slack** | Approval workflows, commentary, question resolution. | No structured approval chain, no audit trail, context is lost across threads, impossible to track status. |

### Sabit's Competitive Differentiation

1. **End-to-end close engine**: No competitor covers GL upload through certified financial statements in a single product. Current solutions require stitching together 3--5 tools.
2. **AI-assisted but deterministic output**: AI handles classification and variance commentary (subjective tasks where it adds value). Financial statement arithmetic is deterministic (where correctness is non-negotiable). This hybrid approach is unique.
3. **PE portfolio architecture**: Purpose-built for the PE operating model with multi-company dashboards and standardized reporting. No competitor addresses this use case natively.
4. **Auditor verification without login**: The independent verification capability via certification link is novel and reduces audit friction significantly.
5. **Mid-market right-sizing**: More powerful than FloQast, more accessible than BlackLine. Designed for 3--15 person finance teams, not Fortune 500 shared service centers.

---

# PART 2: INFORMATION ARCHITECTURE

---

## 2.1 Complete Site Map

### Controller View

```
Home (Dashboard)
|
+-- Close Cycles
|   +-- Current Close (e.g., "February 2026 Monthly Close")
|   |   +-- Overview & Checklist
|   |   +-- GL Upload
|   |   |   +-- Upload File
|   |   |   +-- Upload History
|   |   |   +-- Field Mapping Configuration
|   |   +-- Trial Balance
|   |   |   +-- Full Trial Balance View
|   |   |   +-- Adjustments Overlay (pre- vs. post-adjustment)
|   |   |   +-- Export
|   |   +-- Account Classification
|   |   |   +-- Classification Review (all accounts)
|   |   |   +-- New / Unclassified Accounts
|   |   |   +-- Classification Rules & Overrides
|   |   |   +-- Mapping Template Management
|   |   +-- Reconciliations
|   |   |   +-- Reconciliation Dashboard (status overview)
|   |   |   +-- Individual Account Reconciliation
|   |   |   |   +-- Reconciliation Detail
|   |   |   |   +-- Evidence / Attachments
|   |   |   |   +-- Reconciling Items
|   |   |   |   +-- Sign-off
|   |   |   +-- Reconciliation Templates
|   |   +-- Adjusting Entries
|   |   |   +-- All Adjusting Entries (list view)
|   |   |   +-- Create New Entry
|   |   |   +-- Pending Approval
|   |   |   +-- Approved
|   |   |   +-- Rejected (with comments)
|   |   +-- Financial Statements
|   |   |   +-- Income Statement
|   |   |   +-- Balance Sheet
|   |   |   +-- Cash Flow Statement
|   |   |   +-- Statement of Stockholders' Equity
|   |   |   +-- Comparative View (current vs. prior period)
|   |   |   +-- Export / Print
|   |   +-- Variance Analysis
|   |   |   +-- Material Variances (flagged)
|   |   |   +-- Variance Detail & Commentary Editor
|   |   |   +-- Variance Report (exportable)
|   |   +-- Certification
|   |       +-- Pre-Certification Checklist
|   |       +-- Certification Summary
|   |       +-- Digital Signature
|   |       +-- Certification History
|   +-- Prior Closes (archive, searchable by period)
|
+-- Settings
|   +-- Company Profile
|   +-- Chart of Accounts Configuration
|   +-- GL Import Templates
|   +-- Materiality Thresholds
|   +-- User Management
|   +-- Notification Preferences
|   +-- Reconciliation Templates
|
+-- Help & Support
    +-- Knowledge Base
    +-- Contact Support
```

### CFO View

```
Home (Dashboard)
|
+-- Close Cycles
|   +-- Current Close
|   |   +-- Close Status Overview
|   |   +-- Financial Statements (read-only, drill-down enabled)
|   |   |   +-- Income Statement
|   |   |   +-- Balance Sheet
|   |   |   +-- Cash Flow Statement
|   |   |   +-- Statement of Stockholders' Equity
|   |   +-- Variance Analysis & Commentary
|   |   +-- Pending Approvals
|   |   |   +-- Adjusting Entries Requiring Approval
|   |   |   +-- Approval Detail (entry, documentation, controller notes)
|   |   +-- Reconciliation Summary (status only, drill-down available)
|   |   +-- Certification
|   |       +-- Review Summary
|   |       +-- Co-Sign / Digital Signature
|   +-- Prior Closes
|
+-- Settings
    +-- Notification Preferences
    +-- Approval Delegation
```

### Operating Partner View

```
Home (Portfolio Dashboard)
|
+-- Portfolio Overview
|   +-- All Companies Summary Table
|   +-- Close Timeline / Status Tracker
|   +-- Key Metrics Comparison
|   +-- Flagged Issues Across Portfolio
|
+-- Individual Company View
|   +-- Company Close Status
|   +-- Financial Statements (read-only)
|   +-- Variance Analysis & Commentary
|   +-- Historical Performance (trending)
|
+-- Reports
|   +-- Portfolio Comparison Report
|   +-- Close Timeline Compliance Report
|   +-- Export / Board Reporting Package
|
+-- Settings
    +-- Portfolio Configuration
    +-- Notification Preferences
    +-- Company Access Management
```

### Auditor View (No Login Required)

```
Verification Landing Page (accessed via unique URL)
|
+-- Certification Verification
|   +-- Certificate Details (company, period, signers, timestamp)
|   +-- Certificate Integrity Check (hash verification)
|   +-- Financial Statements (read-only, verified copy)
|
+-- Audit Access Portal (optional, credentialed)
    +-- Financial Statements with Drill-Down
    +-- Trial Balance
    +-- Reconciliation Workpapers
    +-- Adjusting Entry Log with Approvals
    +-- GL Detail (read-only)
    +-- Export Audit Package
```

---

## 2.2 Navigation Model

### Controller: Left Sidebar + Close Phase Stepper

**Primary Navigation**: Persistent left sidebar organized by close phase, not by feature. The sidebar reflects the workflow, not the data model.

```
SIDEBAR:
-----------------------------
[Company Logo / Name]
[Current Close: Feb 2026]
-----------------------------
  Dashboard
-----------------------------
CLOSE PHASES:
  1. GL Upload          [check]
  2. Trial Balance      [check]
  3. Classification     [in progress]
  4. Reconciliations    [not started]
  5. Adjusting Entries  [not started]
  6. Statements         [locked]
  7. Variance Analysis  [locked]
  8. Certification      [locked]
-----------------------------
PRIOR CLOSES
SETTINGS
HELP
-----------------------------
```

**Rationale**: Controllers think in phases, not features. The sidebar doubles as a progress tracker. Phases that depend on prior phases being complete show as locked (visible but not actionable) until prerequisites are met. Completed phases show a checkmark. The current phase is highlighted.

**Secondary Navigation**: Within each phase, horizontal tabs for sub-views (e.g., within Reconciliations: "Dashboard | By Account | Templates").

### CFO: Dashboard-First + Action-Oriented Tabs

**Primary Navigation**: The CFO lands on a dashboard showing close status and pending actions. Navigation is minimal because the CFO has a focused, approval-oriented workflow.

```
TOP BAR:
[Sabit Logo] [Company Name] [Close Period Selector] [Notifications Bell] [Profile]

TAB BAR:
  Overview | Statements | Variances | Approvals (3) | Certification
```

**Rationale**: The CFO does not need a sidebar with 8 phases. They need to see status, review statements, check variances, approve adjustments, and sign. The badge count on "Approvals" creates urgency. Everything is accessible within 2 clicks.

### Operating Partner: Portfolio Dashboard with Company Drill-Down

**Primary Navigation**: The operating partner lands on the portfolio dashboard. Navigation is hierarchical: portfolio level, then drill into individual companies.

```
TOP BAR:
[Sabit Logo] [Fund Name] [Notifications Bell] [Profile]

LEFT SIDEBAR:
  Portfolio Dashboard
  ----
  COMPANIES:
    Acme Corp          [Closed]
    Beta Industries    [In Progress - Day 7]
    Gamma Holdings     [In Progress - Day 3]
    Delta Services     [Not Started]
    ...
  ----
  Reports
  Settings
```

**Rationale**: The operating partner's mental model is "my portfolio" first, then individual companies. The sidebar shows all companies with their close status as inline badges, allowing the operating partner to see which companies need attention without clicking anything.

### Auditor: Single-Page Verification + Optional Deep Access

**Primary Navigation**: None. The auditor arrives at a single verification page via a unique URL. There is no login, no navigation, no sidebar. The page answers one question: "Are these financial statements authentic and unmodified?"

For auditors granted deeper access (via credentialed link), a simple tab bar provides access to audit workpapers.

```
TAB BAR (credentialed access only):
  Statements | Trial Balance | Reconciliations | Adjusting Entries | GL Detail | Export
```

**Rationale**: The auditor's primary interaction is verification, which must be frictionless. The credentialed access is a separate, deeper mode for fieldwork support. These two modes serve different audit procedures and should feel different.

---

## 2.3 Content Hierarchy by Page

### Controller Dashboard

| Priority | Content | Rationale |
|---|---|---|
| **Primary** | Close progress stepper showing current phase, % complete, and days remaining until deadline | The controller's first question every morning is "Where am I and how much is left?" |
| **Primary** | Blocking items panel: items that are preventing progress to the next phase (unapproved AJEs, unreconciled accounts above materiality) | Surface what needs action NOW. |
| **Secondary** | Recent activity feed: what happened since last login (approvals received, reconciliations completed by team members) | Provides continuity between sessions. |
| **Secondary** | Key metrics: accounts reconciled (32/47), AJEs pending (4), variances flagged (7) | Quick numerical status without clicking into sub-pages. |
| **Tertiary** | Prior close comparison: "This close: Day 6 of 10. Last close: certified Day 9." | Motivational and trend-tracking. Hidden below the fold or in a collapsible section. |

### Reconciliation Dashboard (Controller)

| Priority | Content | Rationale |
|---|---|---|
| **Primary** | Status summary bar: X reconciled, Y in progress, Z not started, with visual progress indicator | Answers "How much is done?" instantly. |
| **Primary** | Accounts table sorted by: (1) unreconciled difference (largest first), (2) materiality flag, (3) status | Surfaces the most problematic accounts first. The controller should see the hardest work at the top. |
| **Secondary** | Filters: by status, by financial statement section (current assets, long-term liabilities, etc.), by assigned preparer | Allows the controller to manage and delegate work. |
| **Secondary** | Due date / deadline column with color coding (green = on track, yellow = at risk, red = overdue) | Time pressure visualization. |
| **Tertiary** | Prior period reconciliation link for each account | Available but not prominent. Used for reference, not primary workflow. |

### CFO Variance Review Page

| Priority | Content | Rationale |
|---|---|---|
| **Primary** | Material variances table: line item, current period, prior period, dollar change, % change, AI-drafted commentary, controller-edited commentary | The CFO needs to see every material variance with its explanation in a single, scannable view. |
| **Primary** | Approval status for each variance: accepted by controller (ready for CFO review) vs. still in draft | The CFO should only review finalized commentary. |
| **Secondary** | Drill-down capability: click any line item to see supporting trial balance accounts, reconciliation status, and GL transactions | Enables the CFO to investigate any number that looks wrong. |
| **Tertiary** | Commentary edit capability: the CFO can add notes or request revisions | Used occasionally, not the primary flow. |

### Operating Partner Portfolio Dashboard

| Priority | Content | Rationale |
|---|---|---|
| **Primary** | Portfolio company table: company name, close status (phase + day), revenue (actual vs. plan), EBITDA (actual vs. plan), flagged issues count | The operating partner needs a single table that answers "Who needs my attention?" |
| **Primary** | Visual timeline: horizontal bars showing each company's close progress against its deadline | Visual pattern recognition for close timeline compliance. |
| **Secondary** | Flagged issues panel: material variances, missed deadlines, or controller-escalated items across the portfolio | Aggregated view of issues that may require operating partner intervention. |
| **Tertiary** | Trending charts: revenue and EBITDA trends by company over the last 6--12 months | Strategic context. Available on scroll or in a separate tab. |

### Auditor Verification Page

| Priority | Content | Rationale |
|---|---|---|
| **Primary** | Verification result: large, unambiguous indicator -- "VERIFIED: This certification is authentic and unmodified" or "VERIFICATION FAILED" | The auditor's only question. Answer it immediately and prominently. |
| **Primary** | Certificate details: company name, period, financial statements covered, controller signature, CFO signature, timestamp, cryptographic hash | Documentary evidence for the audit file. |
| **Secondary** | Financial statements: viewable and downloadable PDF of the certified statements | Allows the auditor to confirm the statements they are testing match the certified version. |
| **Tertiary** | Technical details: hash algorithm, certificate chain, verification method | For IT auditors or firms with specific technical verification requirements. Collapsed by default. |

---

# PART 3: USER FLOWS

---

## 3.1 Controller: Complete Close Flow

### Screen 1: Login / Dashboard

**Entry Point**: Controller logs in. Lands on the Controller Dashboard.

**Display**: Close progress stepper, blocking items, days remaining.

**Decision Point**: Is there an active close cycle?
- YES: Continue to the current phase (stepper highlights the active phase).
- NO: Prompt to "Start New Close Cycle" -- select period (month/quarter/year), confirm company.

**Action**: Controller clicks on the current active phase in the sidebar stepper, or clicks "Start New Close Cycle."

---

### Screen 2: Start New Close Cycle

**Display**: Period selector (month, quarter, year), company confirmation, close deadline date picker, option to carry forward settings from prior close (materiality thresholds, reconciliation templates, account mappings).

**Action**: Controller selects "February 2026 Monthly Close," confirms deadline of March 10, 2026, and clicks "Create Close Cycle."

**System Response**: Close cycle is created. Sidebar stepper populates with all 8 phases. Phase 1 (GL Upload) is active. Phases 2--8 are locked.

---

### Screen 3: GL Upload

**Display**:
- Upload area (drag-and-drop or file picker) accepting CSV, XLSX, QBO, and standard ERP export formats.
- Dropdown or auto-detect for source accounting system (NetSuite, Sage Intacct, QuickBooks, Xero, Other).
- Upload history showing prior uploads for this close cycle (if any -- allows re-upload if the first file was wrong).

**Action**: Controller drags their GL export file onto the upload area.

**System Response**: File upload progress bar. File parsing begins.

**Decision Point**: Does the system recognize the file format?
- YES: Proceed to field mapping confirmation.
- NO: Display error with specifics ("Expected columns: Account Number, Account Name, Debit, Credit. Found: [list of columns in file]. Please map your columns or re-export."). Show a manual field mapping interface.

---

### Screen 4: GL Upload -- Field Mapping Confirmation

**Display**:
- Detected fields mapped to Sabit's required fields (Account Number, Account Name, Period, Debit Amount, Credit Amount, Department, etc.).
- Preview of first 20 rows as parsed.
- Validation summary: total transactions, total debits, total credits, debit-credit difference (should be zero), date range detected, number of unique accounts.

**Decision Point**: Does the GL balance (total debits equal total credits)?
- YES: Green indicator. "GL is in balance."
- NO: Yellow warning. "GL is out of balance by $X. This may indicate a partial export. Proceed with caution or re-export."

**Action**: Controller reviews the mapping and preview, makes any corrections, clicks "Confirm & Process."

**System Response**: GL is processed. Trial Balance is generated. Phase 1 (GL Upload) shows a checkmark. Phase 2 (Trial Balance) unlocks and becomes active.

---

### Screen 5: Trial Balance

**Display**:
- Full trial balance: Account Number, Account Name, Debit Balance, Credit Balance, Net Balance.
- Summary totals at bottom: Total Debits, Total Credits, Difference (should be zero).
- Account type groupings: Assets, Liabilities, Equity, Revenue, Expenses.
- Search and filter capabilities.
- "Balance Check" indicator: green if debits equal credits, red if not.

**Action**: Controller reviews the trial balance. Compares to their ERP's TB report (likely open in another window or printed).

**Decision Point**: Does the TB match the ERP?
- YES: Controller clicks "Approve Trial Balance" to advance.
- NO: Controller can re-upload the GL (returns to Screen 3) or add a note explaining the known difference.

**System Response**: Phase 2 complete. Phase 3 (Account Classification) unlocks.

---

### Screen 6: Account Classification

**Display**:
- Table of all GL accounts with columns: Account Number, Account Name, Account Type (Asset/Liability/Equity/Revenue/Expense), AI-Suggested Financial Statement Line Item, Confidence Score, Prior Period Mapping, Status (Accepted/Pending Review/Override).
- Accounts are sorted with lowest confidence first (accounts needing the most human attention at the top).
- New accounts (not seen in prior closes) are highlighted with a "NEW" badge.
- Bulk action bar: "Accept All High Confidence (>95%)" button for efficiency.

**Action**: Controller reviews each account mapping (or bulk-accepts high-confidence mappings), modifies incorrect suggestions via dropdown selection of financial statement line items, and marks each as "Accepted."

**Decision Point**: Are any accounts unclassified or disputed?
- If YES: Controller must resolve all accounts before advancing. Unresolved accounts show in a "Requires Action" filter.
- If NO: All accounts are classified.

**Action**: Controller clicks "Finalize Classification."

**System Response**: Phase 3 complete. Phase 4 (Reconciliations) unlocks.

---

### Screen 7: Reconciliation Dashboard

**Display**:
- Status summary bar: "12 Reconciled | 8 In Progress | 27 Not Started | 47 Total Balance Sheet Accounts"
- Progress bar visualization.
- Accounts table: Account Name, Balance, Materiality Flag (above/below threshold), Status, Assigned To, Last Updated, Unreconciled Difference.
- Default sort: Status (Not Started first), then by balance size descending.
- Filter options: by status, by financial statement section, by assignee, by materiality.
- "Use Template" button for each account to apply a reconciliation template.

**Action**: Controller clicks on an account to begin reconciliation.

---

### Screen 8: Individual Account Reconciliation

**Display**:
- Account header: Account Number, Account Name, GL Balance (from TB), Target Balance (per evidence).
- Reconciliation workspace:
  - GL Balance (auto-populated from TB).
  - Evidence attachment area: drag-and-drop for bank statements, sub-ledger reports, confirmations, screenshots.
  - Reconciling items table: Description, Amount, Type (Timing Difference, Error, Other), Status (Open/Resolved).
  - Calculated unreconciled difference: GL Balance minus Evidence Balance plus/minus Reconciling Items. Highlighted green if zero, red if non-zero.
- Prior period reconciliation (collapsed, expandable for reference).
- Notes / comments section.

**Action**: Controller uploads evidence, adds reconciling items if any, and resolves the account.

**Decision Point**: Is the unreconciled difference zero (or within the immaterial threshold)?
- YES: Controller clicks "Sign Off on Reconciliation." Account status changes to "Reconciled."
- NO: Controller must either add reconciling items to explain the difference, identify an error requiring an adjusting entry, or flag the account for follow-up.

**System Response**: Account status updates on the dashboard. Progress bar advances.

**Loop**: Controller repeats Screen 8 for each balance sheet account. The dashboard (Screen 7) is always accessible to track progress.

**Advancement**: Phase 4 does not need to be 100% complete to unlock Phase 5 (Adjusting Entries), because reconciliations often reveal the need for adjustments. Once the first reconciliation is signed off, Phase 5 unlocks.

---

### Screen 9: Adjusting Entries List

**Display**:
- Table of all adjusting entries for this close cycle: Entry Number, Date, Description, Debit Account(s), Credit Account(s), Total Amount, Status (Draft/Pending Approval/Approved/Rejected), Created By, Approved By.
- Filter by status.
- "Create New Entry" button.
- Rejected entries are highlighted with the CFO's rejection comments visible inline.

**Action**: Controller clicks "Create New Entry."

---

### Screen 10: Create Adjusting Entry

**Display**:
- Entry form:
  - Date (defaults to close period end date).
  - Description / Memo (free text).
  - Line items: Account (searchable dropdown), Debit Amount, Credit Amount. Multiple lines allowed.
  - Running total: Total Debits, Total Credits, Difference (must be zero to save).
  - Supporting documentation attachment area.
  - Reversing entry toggle: "Auto-reverse in next period?" Yes/No.
  - Notes to approver (free text, visible to CFO).

**Decision Point**: Do debits equal credits?
- YES: "Submit for Approval" button is enabled.
- NO: Button is disabled. Difference is shown in red.

**Action**: Controller completes the entry form, attaches documentation, clicks "Submit for Approval."

**System Response**: Entry status changes to "Pending Approval." CFO receives a notification. Entry appears in CFO's "Pending Approvals" queue.

**Loop**: Controller creates additional AJEs as needed. Returns to the AJE list (Screen 9) between entries.

---

### Screen 11: Adjusting Entry -- Rejection Handling

**Trigger**: CFO rejects an adjusting entry with comments.

**Display**: The rejected entry on Screen 9 shows a red "Rejected" badge. Clicking into it shows the CFO's rejection comments, the original entry, and an "Edit & Resubmit" button.

**Action**: Controller reads the rejection comments, modifies the entry or adds additional documentation, clicks "Resubmit for Approval."

**System Response**: Entry status changes back to "Pending Approval." CFO is re-notified.

---

### Screen 12: Financial Statement Generation

**Prerequisites**: All reconciliations signed off. All adjusting entries approved (no pending or rejected entries remaining).

**Display**:
- Pre-generation checklist:
  - All balance sheet accounts reconciled: Yes/No
  - All adjusting entries approved: Yes/No
  - Trial balance in balance: Yes/No
  - Account classification finalized: Yes/No
- "Generate Financial Statements" button (enabled only when all checklist items are Yes).

**Action**: Controller clicks "Generate Financial Statements."

**System Response**: System calculates the adjusted trial balance (original TB + approved AJEs), then maps adjusted balances to financial statement line items per the approved classification, and generates four statements using deterministic arithmetic (addition, subtraction -- no AI, no estimation).

**Display Update**: Four tabs appear: Income Statement, Balance Sheet, Cash Flow Statement, Statement of Stockholders' Equity.

---

### Screen 13: Financial Statement Review

**Display** (one tab per statement):
- Formatted financial statement with standard GAAP presentation.
- Current period and prior period side by side.
- Dollar change and percentage change columns.
- Every line item is clickable -- clicking drills into the contributing TB accounts.
- Material variances (above threshold) are highlighted with a yellow flag icon.
- Footer: "Generated from adjusted trial balance using deterministic arithmetic. No AI was used in the calculation of these figures."

**Action**: Controller reviews each statement for presentation accuracy. Clicks through to verify line items if needed.

**Decision Point**: Are the statements presentationally correct?
- YES: Controller clicks "Approve Statements" to advance.
- NO: Controller identifies the issue. If it is a classification issue, they return to Phase 3. If it is a missing AJE, they return to Phase 5. If it is a presentation grouping issue (e.g., two line items should be combined), they use an inline "Edit Presentation" feature to adjust groupings without changing the underlying data.

**System Response**: Phase 6 complete. Phase 7 (Variance Analysis) unlocks.

---

### Screen 14: Variance Analysis

**Display**:
- Material variances table: Financial Statement, Line Item, Current Period, Prior Period, Dollar Change, Percentage Change, Materiality Flag, AI-Drafted Commentary, Controller Commentary (editable), Status (Draft/Finalized).
- Variances are sorted by absolute dollar change, largest first.
- Each variance row expands to show: the AI's full drafted justification, the underlying account-level detail, and prior period trends (last 3--6 periods).
- "Accept AI Draft" and "Edit" buttons per variance.
- Bulk action: "Accept All AI Drafts" (use with caution -- intended for routine variances).

**Action**: Controller reviews each material variance. For each:
1. Reads the AI-drafted commentary.
2. Decides: Accept as-is, Edit, or Write from scratch.
3. Marks as "Finalized."

**Decision Point**: Are all material variances addressed?
- YES: Controller clicks "Complete Variance Analysis."
- NO: Unfinalized variances prevent advancement.

**System Response**: Phase 7 complete. Phase 8 (Certification) unlocks.

---

### Screen 15: Pre-Certification Checklist

**Display**:
- Completeness checklist with automated verification:
  - GL uploaded and processed: Verified (timestamp)
  - Trial balance approved: Verified (timestamp)
  - All accounts classified: Verified (X accounts)
  - All balance sheet accounts reconciled: Verified (X accounts, total evidence items: Y)
  - All adjusting entries approved: Verified (X entries, total adjustment: $Z)
  - Financial statements generated: Verified (timestamp)
  - All material variances addressed: Verified (X variances with commentary)
- Close cycle summary statistics:
  - Total GL transactions processed: X
  - Balance sheet accounts reconciled: X
  - Adjusting entries processed: X
  - Material variances explained: X
  - Days to close: X of Y allowed
- "Proceed to Certification" button.

**Action**: Controller reviews the checklist, confirms everything is complete, clicks "Proceed to Certification."

---

### Screen 16: Certification

**Display**:
- Certification statement (legal text): "I, [Controller Name], certify that the financial statements for [Company Name] for the period ending [Date] have been prepared in accordance with GAAP and are materially correct to the best of my knowledge. This certification constitutes a digital signature and creates a tamper-evident record."
- Summary of what is being certified: the four financial statements with their key totals (Total Revenue, Net Income, Total Assets, Total Liabilities, Total Equity).
- Digital signature mechanism: "Type your full name to sign" field + "Sign & Certify" button.
- Confirmation: "This action cannot be undone. The certification will be timestamped and cryptographically sealed."

**Action**: Controller types their full name, clicks "Sign & Certify."

**System Response**: 
- Certification is created with a cryptographic hash.
- Timestamp is recorded.
- Close cycle status changes to "Controller Certified -- Pending CFO Review."
- CFO receives a notification that the close package is ready for review and co-signature.
- Controller sees a confirmation screen: "Close Certified. Awaiting CFO co-signature. You will be notified when the CFO completes their review."

**Phase 8 complete for the controller. Flow ends here unless the CFO requests revisions.**

---

### Screen 17: CFO Revision Request (Exception Flow)

**Trigger**: CFO reviews the close package and requests revisions (sends specific items back to the controller).

**Display**: Controller dashboard shows an alert: "CFO has requested revisions on [Close Cycle]. X items require your attention."

**Action**: Controller clicks the alert. Sees the specific items the CFO flagged with comments. Makes corrections (may involve re-reconciling an account, creating additional AJEs, or editing variance commentary). Re-submits the affected items.

**System Response**: Once all revision items are addressed, the controller can re-certify (returns to Screen 16). The prior certification is superseded and the audit trail shows the revision history.

---

## 3.2 CFO: Review and Certify Flow

### Screen 1: CFO Dashboard

**Entry Point**: CFO logs in or receives a notification that the close package is ready for review.

**Display**:
- Close status banner: "February 2026 Monthly Close -- Controller Certified [Date/Time]. Awaiting your review and co-signature."
- Summary card: Revenue, Net Income, Total Assets, Total Equity (current vs. prior period, with change indicators).
- Action items panel:
  - Pending AJE approvals: X entries (if any arrived before the final certification).
  - Material variances to review: X items.
  - Certification: Ready for co-signature.
- Close timeline: visual bar showing when the close cycle started, when each phase completed, and days remaining until board reporting deadline.

**Action**: CFO clicks into the area requiring their attention. Typical sequence: (1) review variances, (2) review statements, (3) certify.

---

### Screen 2: CFO Pending Approvals (Adjusting Entries)

**Display**:
- List of adjusting entries pending CFO approval.
- For each entry: Date, Description, Accounts affected, Total Amount, Controller's notes, Supporting documentation link.
- "Approve" and "Reject" buttons per entry.
- "Reject" expands a comment field for the CFO to explain what needs revision.

**Action**: CFO reviews each entry. Either approves (entry is finalized and flows into the adjusted TB) or rejects with comments (entry is sent back to the controller).

**Decision Point per entry**: Approve or Reject?
- APPROVE: Entry is applied. If this is the last pending entry, the controller can proceed with statement generation.
- REJECT: Entry returns to controller with CFO comments. Controller must revise and resubmit.

---

### Screen 3: CFO Financial Statement Review

**Display**:
- Four financial statements, presented identically to the controller's view (Screen 13) but read-only except for comment/annotation capability.
- Current vs. prior period side by side.
- Material variances highlighted.
- Every line item is clickable for drill-down (through TB to GL if needed).

**Action**: CFO reviews each statement. Clicks into any line item to verify the supporting detail.

**Decision Point**: Does the CFO have questions or concerns?
- YES: CFO can add annotations to specific line items. These annotations are visible to the controller as a "CFO Comment" flag. The CFO can choose to "Request Revision" on specific items (returns those items to the controller without rejecting the entire close).
- NO: CFO proceeds to variance review.

---

### Screen 4: CFO Variance Review

**Display**:
- Same variance table as the controller sees, but with controller-finalized commentary (not editable by the CFO).
- CFO can add their own notes or questions per variance.
- "Satisfied" toggle per variance: the CFO marks each as reviewed.
- Filter: "Show only unreviewed" to quickly see remaining items.

**Action**: CFO reads each variance and its commentary. Marks each as "Satisfied" or adds questions.

**Decision Point**: Are all variances satisfactorily explained?
- YES: CFO proceeds to certification.
- NO: CFO clicks "Request Revision" on specific variances, sending them back to the controller with comments.

---

### Screen 5: CFO Certification

**Display**:
- Certification summary (same as controller's Screen 15 pre-certification checklist, now showing controller's certification details).
- Controller's certification: Signed by [Name] on [Date/Time].
- CFO certification statement: "I, [CFO Name], have reviewed the financial statements for [Company Name] for the period ending [Date] and the close process supporting them. I certify that I have reviewed the material variances, the adjusted trial balance, and the supporting reconciliations, and I am satisfied that the financial statements are materially correct."
- "Type your full name to co-sign" field + "Co-Sign & Certify" button.

**Action**: CFO types their name, clicks "Co-Sign & Certify."

**System Response**:
- CFO signature is added to the certification.
- Certification is now dual-signed (Controller + CFO).
- Cryptographic hash is updated to include both signatures.
- Close cycle status changes to "Certified" (final).
- Operating partner dashboard is updated with this company's certified results.
- A unique verification URL is generated for auditor access.
- Controller is notified: "CFO has co-signed the February 2026 close."

---

## 3.3 Operating Partner: Portfolio Monitoring Flow

### Screen 1: Portfolio Dashboard

**Entry Point**: Operating partner logs in.

**Display**:
- Header: Fund name, number of portfolio companies, current reporting period.
- Portfolio summary table:

| Company | Close Status | Day | Deadline | Revenue (Actual) | Revenue (Plan) | Revenue Var % | EBITDA (Actual) | EBITDA (Plan) | EBITDA Var % | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
| Acme Corp | Certified | -- | Mar 10 | $12.4M | $13.0M | -4.6% | $2.1M | $2.5M | -16.0% | 2 |
| Beta Ind. | Reconciliation | Day 7 | Mar 12 | -- | -- | -- | -- | -- | -- | -- |
| Gamma Holdings | GL Upload | Day 3 | Mar 10 | -- | -- | -- | -- | -- | -- | -- |
| Delta Services | Not Started | -- | Mar 10 | -- | -- | -- | -- | -- | -- | -- |

- Companies that are certified show their financial metrics. Companies still in progress show their phase and day count.
- Close timeline visualization: horizontal Gantt-style chart showing each company's close progress as a bar against its deadline. Bars that extend past the deadline are red.
- Flagged issues count is clickable -- drills into that company's flagged variances.

**Action**: Operating partner scans the dashboard for issues. Clicks on any company row to drill in.

---

### Screen 2: Company Drill-Down

**Entry Point**: Operating partner clicks on a company from the portfolio dashboard.

**Display**:
- Company header: Name, close status, controller name, CFO name.
- If certified:
  - Financial statements (read-only, same format as CFO view).
  - Variance analysis with controller and CFO commentary.
  - Historical trending: revenue and EBITDA for the last 12 months as a line chart.
  - Certification details: who signed, when.
- If in progress:
  - Close phase stepper showing current status.
  - Estimated completion date (based on historical close velocity).
  - No financial data visible until certification is complete (prevents operating partner from seeing draft numbers that may change).

**Action**: Operating partner reviews the company's financials, variance commentary, and trends. Can export data for board reporting.

---

### Screen 3: Portfolio Comparison

**Entry Point**: Operating partner clicks "Reports" in the sidebar, then "Portfolio Comparison."

**Display**:
- Normalized comparison table for all certified companies:
  - Revenue growth (YoY, QoQ)
  - EBITDA margin
  - Close timeline (days to close)
  - Number of adjusting entries (indicator of close complexity)
  - Number of material variances
- Sorting and filtering by any column.
- Benchmarking against portfolio averages.
- Export to Excel or PDF for board packages.

**Action**: Operating partner creates the comparison, adjusts filters, exports for board reporting.

---

### Screen 4: Close Timeline Compliance

**Entry Point**: Operating partner clicks "Reports" in the sidebar, then "Close Timeline Compliance."

**Display**:
- Historical view: for each company, how many days their close took for each of the last 12 months.
- Trend line per company.
- Portfolio average trend line.
- Companies that consistently miss deadlines are flagged.
- Target deadline line for visual comparison.

**Action**: Operating partner identifies companies with deteriorating close performance for intervention.

---

## 3.4 Auditor: Independent Verification Flow

### Screen 1: Verification Landing Page

**Entry Point**: Auditor receives a verification URL (e.g., `https://app.sabit.com/verify/abc123xyz`). No login required.

**Display**:
- Sabit branding and "Independent Verification" header.
- Verification status -- large, prominent indicator:
  - Green checkmark with "VERIFIED": "This certification is authentic and has not been modified since signing."
  - OR Red X with "VERIFICATION FAILED": "This certification could not be verified. The document may have been modified. Contact the issuing party."
- Certificate details:
  - Company: [Name]
  - Period: [End date]
  - Statements Covered: Income Statement, Balance Sheet, Cash Flow Statement, Statement of Stockholders' Equity
  - Controller Signature: [Name], [Date/Time]
  - CFO Signature: [Name], [Date/Time]
  - Certification Hash: [SHA-256 hash value]
  - Verification Timestamp: [Current date/time -- when this verification was performed]
- "Download Certified Statements (PDF)" button.
- "Download Verification Certificate (PDF)" button -- a standalone document the auditor can include in their workpapers.

**Action**: Auditor views the verification result. Downloads the certified statements and the verification certificate for their audit file.

**No login, no account creation, no navigation required. This screen answers the auditor's question completely.**

---

### Screen 2: Audit Access Portal (Optional, Credentialed)

**Entry Point**: The company's controller or CFO generates a time-limited access link for the auditor through Sabit's settings. The auditor receives this link separately from the verification URL. Clicking it requires the auditor to verify their identity (email verification, not a full account).

**Display**:
- Tab bar: Statements | Trial Balance | Reconciliations | Adjusting Entries | GL Detail | Export
- Each tab provides read-only access to the underlying close data.

**Statements Tab**:
- Four financial statements with drill-down to TB accounts.
- Same drill-down capability the CFO has.

**Trial Balance Tab**:
- Full adjusted trial balance.
- Pre-adjustment and post-adjustment views.
- Adjusting entry impact overlay.

**Reconciliations Tab**:
- All balance sheet reconciliations.
- Evidence attachments are viewable and downloadable.
- Reconciling items with explanations.
- Sign-off history (who signed, when).

**Adjusting Entries Tab**:
- Complete list of adjusting entries with:
  - Entry details (accounts, amounts).
  - Supporting documentation.
  - Approval chain (submitted by, approved by, timestamps, any rejection/revision history).

**GL Detail Tab**:
- Searchable, filterable view of all GL transactions.
- Filter by account, date range, amount range, department.
- Export to CSV for auditor's own analysis tools.

**Export Tab**:
- "Download Complete Audit Package" button: generates a ZIP file containing all of the above in structured format (PDF statements, CSV TB, CSV GL, PDF reconciliations, PDF AJE log with approvals).

**Action**: Auditor navigates tabs to perform substantive testing, downloads evidence, and exports data for their workpapers.

**Access Expiration**: The credentialed link expires after a set period (configurable by the company, default 90 days). The auditor is shown the expiration date on every page. After expiration, the auditor must request a new link.

---

# APPENDIX: KEY DESIGN PRINCIPLES

These principles should guide every engineering and design decision for Sabit.

1. **Trust through transparency**: Every AI output must show its confidence level and be editable. Every calculation must be traceable to its inputs. The user must never wonder "where did this number come from?"

2. **Progress over perfection**: The close process is inherently sequential but not perfectly linear. Allow phases to unlock as soon as practically possible (e.g., the controller can start AJEs before all reconciliations are done) while enforcing hard prerequisites for critical gates (e.g., statements cannot generate until all AJEs are approved).

3. **Anxiety reduction through visibility**: The controller's primary emotional need is knowing where they stand. Progress indicators, completion percentages, blocking item alerts, and days-remaining counters are not nice-to-haves -- they are core to the product's value.

4. **Right information for the right persona**: The controller needs depth. The CFO needs confidence. The operating partner needs breadth. The auditor needs independence. The same underlying data is presented differently based on who is looking at it and why.

5. **Deterministic where it matters, intelligent where it helps**: Financial statement arithmetic is never AI-generated. It is addition and subtraction from the adjusted trial balance. AI is used for classification suggestions and variance commentary -- tasks where human judgment is required and AI accelerates the starting point. This distinction must be visible to users to build trust.

6. **Audit trail as architecture, not afterthought**: Every action in the system is logged with who, what, when, and why. This is not a feature -- it is a foundational architectural requirement. The audit trail supports both internal controls and external audit procedures.

7. **The auditor is not a user**: The auditor's primary interaction (verification) requires no account, no login, and no navigation. The secondary interaction (fieldwork access) is time-limited and read-only. Designing for the auditor means designing for minimal friction and maximum independence.

---

# SECTION B: UX ARCHITECTURE

# Sabit -- UX Architecture Specification

## Document Purpose

This document is the authoritative UX architecture for Sabit, a financial close engine for PE-backed mid-market companies. It specifies every page, every shared component, and every interaction pattern required to build the product. Engineering should treat this as a construction blueprint: if a detail is specified here, implement it exactly; if a detail is not specified, raise a question before improvising.

**Design language:** Dark-themed, data-dense, professional. Bloomberg Terminal meets Stripe Dashboard. Every pixel earns its place with information, not decoration.

**Personas:**
- Controller (primary operator, does the close work)
- CFO/Reviewer (reviews, approves, certifies)
- PE Operating Partner (monitors portfolio of entities)
- External Auditor (verifies certification without logging in)

**Close pipeline (strict sequential order):**
Upload GL, Trial Balance, Map Accounts, Reconcile Balance Sheet, Post Adjusting Entries, Generate Statements, Explain Variances, Review and Certify, Lock.

---

# Part 1: Page Specifications

---

## 1.1 Login

| Property | Value |
|---|---|
| **Title** | Sign In |
| **URL** | `/login` |
| **Layout** | Centered card on full-viewport dark background |
| **Auth required** | No |

**Primary content blocks:**
- Sabit wordmark centered above the card
- Card contains: email input, password input, "Sign In" button, "Forgot password?" link, "Create account" link
- Below the card: a single-line tagline ("Financial close infrastructure for PE-backed companies")

**Data requirements:**
- POST `/api/auth/login` on submit
- Response returns Bearer token and user profile (name, role, tenantId, entityIds)

**States:**

| State | Behavior |
|---|---|
| Default | Empty form, Sign In button enabled |
| Submitting | Button shows spinner, inputs disabled |
| Error (invalid credentials) | Inline error banner below password field: "Invalid email or password." Fields remain populated. |
| Error (network) | Toast notification: "Unable to reach server. Check your connection." |
| Success | Redirect to `/portfolio` |
| Already authenticated | Redirect to `/portfolio` immediately (check token in localStorage) |

**Actions:**
- Submit credentials
- Navigate to registration
- Navigate to password reset

**Connections:**
- Success -> `/portfolio`
- "Create account" -> `/register`
- "Forgot password" -> `/forgot-password`

---

## 1.2 Registration

| Property | Value |
|---|---|
| **Title** | Create Account |
| **URL** | `/register` |
| **Layout** | Centered card, same background as login |
| **Auth required** | No |

**Primary content blocks:**
- Card contains: full name, email, password, confirm password, company/entity name
- Below form: "Already have an account? Sign in" link
- Password strength indicator beneath the password field

**Data requirements:**
- POST `/api/auth/register`
- Validation: email format, password minimum 8 characters, passwords match, company name required

**States:**

| State | Behavior |
|---|---|
| Default | Empty form |
| Validation errors | Inline red text beneath each offending field |
| Submitting | Button spinner, inputs disabled |
| Success | Redirect to `/onboarding` |
| Conflict (email exists) | Inline error: "An account with this email already exists." |

**Connections:**
- Success -> `/onboarding`
- "Sign in" -> `/login`

---

## 1.3 Onboarding

| Property | Value |
|---|---|
| **Title** | Set Up Your Entity |
| **URL** | `/onboarding` |
| **Layout** | Centered narrow card, stepped wizard (3 steps) |
| **Auth required** | Yes |

**Steps:**

1. **Entity Details** -- Legal entity name, fiscal year end month, base currency, industry vertical
2. **Close Configuration** -- Materiality threshold (dollar amount), evidence policy (which account types require supporting documents), reconciliation requirements (which BS account types must be reconciled)
3. **Invite Team** -- Invite CFO/reviewer by email, assign roles. Optional; can skip and do later.

**Data requirements:**
- Step 1: POST `/api/portfolio/entities`
- Step 2: PUT `/api/close/evidence-policy`, PUT `/api/close/recon-requirements`
- Step 3: POST `/api/settings/team/invite`

**States:**

| State | Behavior |
|---|---|
| Step indicator | Top bar shows 1-2-3 with current step highlighted |
| Incomplete step | "Next" button disabled until required fields filled |
| Final step | "Finish Setup" button; success redirects to `/portfolio` |
| Skip team | "Skip for now" link on step 3 |

**Connections:**
- Finish -> `/portfolio`

---

## 1.4 Portfolio Dashboard

| Property | Value |
|---|---|
| **Title** | Portfolio |
| **URL** | `/portfolio` |
| **Layout** | Full-width, no sidebar. Top navigation bar. Card grid as main content. |
| **Auth required** | Yes |

**Primary content blocks:**

1. **Top bar:** Sabit wordmark (left), user name + role badge + avatar dropdown (right). Dropdown contains: Settings, Sign Out.
2. **Page header:** "Your Portfolio" title (left), "+ New Entity" button (right, Controller/admin only).
3. **Entity cards grid:** Responsive grid of entity cards. Each card shows:
   - Entity name (e.g., "Meridian SaaS Inc.")
   - Most recent close period and its status (OPEN, IN_PROGRESS, UNDER_REVIEW, CERTIFIED, LOCKED)
   - Progress bar: gates passing / total gates
   - Gate count text: "7 of 11 gates passing"
   - Previous certified periods as collapsed single-line items below, showing period name and "CERTIFIED" or "LOCKED" badge
   - "Open" button at card bottom navigates to that period's close dashboard
4. **Empty state:** When no entities exist, a centered illustration with "Create your first entity to begin" and the "+ New Entity" button.

**Data requirements:**
- GET `/api/portfolio/entities` -- returns list of entities with their most recent session status
- GET `/api/portfolio/summary` -- returns aggregate metrics for Operating Partner view
- For each entity with an active session: GET `/api/close/sessions/:id/readiness?format=gates` to populate gate counts

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton cards (3 placeholder cards with pulsing animation) |
| Empty (no entities) | Empty state with create prompt |
| Populated | Entity card grid |
| Error | Banner at top: "Failed to load portfolio. Retry." with retry button |
| PE Partner view | Shows all entities across portfolio companies. No "+ New Entity" button. Read-only. Additional aggregate row at top showing: total entities, entities in progress, entities certified this period. |

**Actions:**
- Click entity card -> navigate to `/close/[sessionId]/dashboard`
- Click "+ New Entity" -> navigate to `/onboarding` (or modal for quick create)
- Click prior certified period -> navigate to that session's review page (read-only)

**Connections:**
- Entity card -> `/close/[sessionId]/dashboard`
- "+ New Entity" -> `/onboarding`
- Settings (dropdown) -> `/settings/general`
- Sign Out -> `/login`

---

## 1.5 Close Dashboard (Command Center)

| Property | Value |
|---|---|
| **Title** | Close Dashboard |
| **URL** | `/close/[sessionId]/dashboard` |
| **Layout** | Left sidebar navigation + main content area. Sidebar is persistent across all close pages. |
| **Auth required** | Yes |

This is the most important page in the product. The controller lands here and can see everything about the current close at a glance.

**Sidebar navigation (persistent across all /close/ pages):**

| Nav Item | Badge |
|---|---|
| Dashboard | (none, current page indicator) |
| Trial Balance | Check or warning icon based on TB balanced state |
| Mapping | Count of unmapped accounts (e.g., "3") or green check |
| Reconciliation | Count of incomplete recons or green check |
| Adjustments | Count of draft/pending JEs or green check |
| Statements | "Stale" badge if regeneration needed, or green check |
| Variance | Count of unexplained variances or green check |
| Review & Certify | Lock icon if certified, otherwise gate count |
| --- (divider) | |
| Audit Trail | Total event count |
| Settings | (none) |

Sidebar header shows: entity name, period (e.g., "Feb 2026"), session status badge.

**Primary content blocks:**

1. **Page header:** Period title ("February 2026 Close"), status badge (OPEN / IN_PROGRESS / UNDER_REVIEW / CERTIFIED / LOCKED). Right side: "Prepare Close" button (lightning bolt icon, initiates AI-assisted pipeline) and "Manual mode" toggle.

2. **Pipeline tracker:** Horizontal stepper showing all 8 pipeline stages. Each step shows one of three states: completed (filled green circle + check), in progress (half-filled blue circle), not started (empty circle). Steps are connected by lines. Clicking a step navigates to that page.

3. **Attention panel:** "What Needs Attention" card. Lists every incomplete or failing gate as a row with: warning icon, description text, action link ("Go to Mapping ->"). Completed items shown with green check, sorted below incomplete items. This panel is the controller's single to-do list.

4. **Gate status panel:** Left column. Lists all 11 gates with pass/fail/pending indicator and detail text. Gates:
   - TB Balanced
   - All Accounts Mapped (count)
   - Reconciliations Complete (count)
   - Templates Resolved
   - Statements Current
   - Variances Explained (count)
   - No Blocking Issues
   - Evidence Policy Satisfied
   - Cross-Statement Ties
   - All Four Statements Exist
   - Material JEs Approved (count)

5. **Period summary panel:** Right column, beside gate status. Shows:
   - Total Revenue, Total Expense, Net Income
   - Total Assets, Total Liabilities, Total Equity
   - Accounting equation check: A = L + E with pass/fail
   - Period-over-period comparison: key metrics vs prior period with percentage change and directional arrows

6. **Recent activity feed:** Bottom section. Chronological feed of recent actions in this session. Each entry: timestamp, user name, description. Examples: "10:34 AM -- Jane posted JE-2026-02-012 (Depreciation)", "9:30 AM -- Jane uploaded GL (808 entries, TB balanced)".

**Data requirements:**
- GET `/api/close/sessions/:id` -- session metadata (entity, period, status)
- GET `/api/close/sessions/:id/readiness?format=gates` -- all gate statuses
- GET `/api/close/sessions/:id/trial-balance?type=adjusted` -- for period summary numbers
- GET `/api/close/sessions/:id/activity` -- recent activity feed (or audit trail filtered to recent)

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton layout: pipeline tracker placeholder, shimmer cards for attention/gates/summary |
| No GL uploaded | Pipeline tracker shows all steps as "not started". Attention panel shows single item: "Upload your general ledger to begin." with "Upload GL" button. Gates panel shows all gates as pending. Summary panel shows "No data yet." |
| In progress | Normal view as described above. Attention items dynamically update. |
| Under review | Banner at top: "This period is under review by [reviewer name]." Controller sees read-only view. Reviewer sees approve/reject actions on pending items. |
| Certified | Gold banner: "This period was certified by [name] on [date]." All content read-only. Certification artifact card visible. |
| Locked | Same as certified plus: "This period is locked and immutable." Lock icon in header. |
| Agent running | "Prepare Close" button replaced with progress panel showing agent steps completing in real-time (see Agent-Assisted Mode below). |

**Agent-Assisted Mode (triggered by "Prepare Close" button):**
A modal or inline expansion replaces the attention panel temporarily. Shows a live-updating checklist:
- "Generating mapping suggestions for [N] accounts..." -> "Auto-accepted [M] (HIGH confidence). [K] need your review. [Review ->]"
- "Initializing [N] reconciliations..." -> "Pre-populated [M] supporting balances. [K] need evidence. [Upload ->]"
- "Applying [N] recurring AJE templates..." -> "Created [N] draft journal entries. Awaiting approval. [Review ->]"
- "Generating financial statements..." -> done check
- "Drafting variance explanations for [N] material variances..." -> "All grounded in journal entry data. [Review ->]"
- Summary: "Readiness: [X]/11 gates passing. Remaining: [list of human actions needed]. Estimated time to complete: ~[M] minutes."

Each step shows a spinner while running, then a green check when complete.

**Actions:**
- Click pipeline step -> navigate to that page
- Click attention item link -> navigate to relevant page
- Click "Prepare Close" -> start agent workflow
- Click gate row -> navigate to relevant page for that gate

**Connections:**
- Every sidebar item and pipeline step links to its respective page
- Attention panel links lead to specific pages
- "Back to Portfolio" link in sidebar header -> `/portfolio`

---

## 1.6 GL Upload

| Property | Value |
|---|---|
| **Title** | Upload General Ledger |
| **URL** | `/close/[sessionId]/upload` (also accessible as first pipeline step from dashboard) |
| **Layout** | Sidebar + centered content area |
| **Auth required** | Yes (Controller role) |

**Primary content blocks:**

1. **Upload zone:** Large dashed-border drop zone. Accepts CSV files. Text: "Drop your general ledger CSV here, or click to browse." Accepted formats listed below: CSV with required columns (date, account code, account name, description, debit, credit). Link to download a sample template.

2. **Column mapping (after file selected):** Preview table showing first 5 rows of the uploaded CSV. Above each column: a dropdown to map the CSV column to a Sabit field (Date, Account Code, Account Name, Description, Debit, Credit). System attempts auto-detection of columns and pre-selects likely matches. Unmapped required columns highlighted in amber.

3. **Preview panel (after mapping confirmed):** Summary stats: total rows, total debits, total credits, debit/credit difference, unique account count. If difference is not zero, a red warning: "Trial balance does not balance. Difference: $[amount]. Review your data before proceeding." Table showing the derived trial balance by account: account code, name, debit total, credit total, net balance. Scrollable.

4. **Action bar:** "Cancel" (returns to dashboard), "Upload & Create Session" (commits the GL). If a session already exists for this period, the button reads "Re-upload GL" with a confirmation dialog warning that this replaces the current GL data.

**Data requirements:**
- POST `/api/gl/parse` -- sends CSV, returns preview (parsed rows, summary stats, trial balance preview). Does not persist.
- POST `/api/gl/ingest` -- commits the GL. Creates the close session if one does not exist, or replaces GL data in existing session.

**States:**

| State | Behavior |
|---|---|
| Empty | Drop zone visible, no file selected |
| File selected | File name shown, column mapping interface appears |
| Parsing | Spinner: "Analyzing your general ledger..." |
| Preview | Summary stats + TB preview table shown. "Upload" button enabled only if TB balances. |
| Unbalanced | Red warning banner. "Upload" button shows tooltip: "Trial balance must balance before uploading." Button disabled. |
| Uploading | Progress bar or spinner: "Uploading 808 entries..." |
| Success | Redirect to `/close/[sessionId]/dashboard`. Toast: "General ledger uploaded. 808 entries processed. Trial balance balanced." |
| Error (parse) | Inline error listing problematic rows: "Row 45: missing debit/credit value. Row 112: invalid date format." |
| Error (network) | Toast: "Upload failed. Please try again." |

**Connections:**
- Success -> `/close/[sessionId]/dashboard`
- Cancel -> `/close/[sessionId]/dashboard`

---

## 1.7 Trial Balance

| Property | Value |
|---|---|
| **Title** | Trial Balance |
| **URL** | `/close/[sessionId]/trial-balance` |
| **Layout** | Sidebar + full-width data table |
| **Auth required** | Yes |

**Primary content blocks:**

1. **Header row:** Title "Trial Balance", period label. Right side: toggle buttons "Unadjusted" / "Adjusted". When no AJEs have been posted, "Adjusted" shows a note: "No adjustments posted. Adjusted TB equals unadjusted TB."

2. **Summary bar:** Four metrics in a horizontal row:
   - Total Debits: $X,XXX,XXX.XX
   - Total Credits: $X,XXX,XXX.XX
   - Difference: $0.00 (green check if zero, red X if non-zero)
   - Accounts: [total] | Mapped: [mapped]/[total]

3. **Filter bar:**
   - Search input: "Search by account code or name..."
   - Account type filter pills: All, Asset, Liability, Equity, Revenue, Expense
   - Mapping status filter pills: All, Mapped, Unmapped

4. **Trial balance table:**

| Column | Width | Alignment | Notes |
|---|---|---|---|
| Account Code | 100px | Left | Monospace |
| Account Name | Flexible | Left | |
| Type | 100px | Left | Asset/Liability/Equity/Revenue/Expense |
| Debit | 140px | Right | Monospace, formatted with commas and 2 decimals |
| Credit | 140px | Right | Monospace, formatted with commas and 2 decimals |
| Net Balance | 140px | Right | Monospace. Positive = debit balance, negative in parentheses = credit balance |
| Mapping | 180px | Left | Shows mapped line item name with green check, or amber warning "Unmapped" |

   Unmapped account rows have an amber-tinted background.

5. **Row expansion:** Clicking any row expands it inline to show:
   - All GL entries that comprise this account's balance (date, description, debit, credit)
   - Subtotals: total debits, total credits for this account
   - If the account is unmapped: inline mapping dropdown to assign a taxonomy line item directly from this view
   - If viewing adjusted TB: a section showing adjustments applied to this account (JE reference, description, amount)

6. **Footer row:** Grand totals for Debit, Credit, Net Balance columns. Always visible (sticky footer).

**Data requirements:**
- GET `/api/close/sessions/:id/trial-balance?type=unadjusted` or `?type=adjusted`
- Response: array of account objects with code, name, type, debitTotal, creditTotal, netBalance, mappingStatus, mappedLineItem
- For row expansion: GET `/api/close/sessions/:id/trial-balance/:accountCode/entries` (or entries included in initial response)

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton table with 10 placeholder rows |
| Populated | Full table with data. Summary bar shows live totals. |
| Filtered | Table filtered to matching rows. Summary bar updates to show filtered totals vs full totals. |
| Empty (no GL) | Message: "Upload a general ledger to see the trial balance." with link to upload page. |
| Error | Banner: "Failed to load trial balance." with retry button. |
| Locked session | Read-only indicator in header. No inline mapping dropdowns. |

**Actions:**
- Toggle unadjusted/adjusted
- Search and filter
- Expand/collapse rows
- Inline mapping (from expanded row, if unmapped)
- Click "Unmapped" filter to focus on work items

**Connections:**
- Inline mapping links to `/close/[sessionId]/mapping`
- Clicking a mapping badge navigates to that account on the mapping page
- JE references in adjusted view link to `/close/[sessionId]/adjustments`

---

## 1.8 Account Mapping

| Property | Value |
|---|---|
| **Title** | Account Mapping |
| **URL** | `/close/[sessionId]/mapping` |
| **Layout** | Sidebar + main content area |
| **Auth required** | Yes (Controller role to edit) |

**Primary content blocks:**

1. **Header:** Title "Account Mapping", progress indicator: "[M] of [N] mapped ([P]%)". Right side: "Auto-Map Remaining" button (lightning bolt icon, triggers AI mapping for unmapped accounts only). "Bulk Accept" button: "Accept all HIGH confidence suggestions" (shown only when multiple high-confidence suggestions exist).

2. **Filter bar:** Dropdown: "Show: Unmapped Only" (default), "All Accounts", "Low Confidence". Count indicator: "[K] accounts need mapping".

3. **Unmapped account cards (default view):** Each unmapped account rendered as a card:
   - Account code + name + type + net balance (from TB)
   - AI suggestion section (if suggestion exists):
     - Suggested line item name
     - Confidence badge: HIGH (green, >=90%), MEDIUM (amber, 60-89%), LOW (red, <60%) with percentage
     - "Accept" button (green), "Reject" button (gray), manual dropdown "Select line item..." for override
   - If no AI suggestion: manual dropdown only
   - Low confidence suggestions show a warning note: "Low confidence -- please verify"

4. **Already-mapped section:** Collapsed by default with header "Already Mapped ([M] accounts)" and expand/collapse toggle. When expanded, shows a simple table: account code, name, mapped line item, confidence (if AI-mapped), "Change" button to re-map.

**Data requirements:**
- GET `/api/coa-mapping/rules?sessionId=:id` -- existing mapping rules
- GET `/api/coa-mapping/suggestions?sessionId=:id` -- AI suggestions with confidence scores
- GET `/api/coa-mapping/taxonomy` -- the full taxonomy (line items the accounts can map to)
- POST `/api/coa-mapping/rules` -- to save a mapping (accept or manual selection)
- DELETE `/api/coa-mapping/rules/:ruleId` -- to remove/change a mapping

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton cards |
| All mapped | Success state: green banner "All accounts mapped." Unmapped section empty. Already-mapped section visible. |
| Partially mapped | Unmapped cards shown. Progress bar and count in header. |
| AI running | "Auto-Map Remaining" button replaced with spinner: "Generating suggestions for [K] accounts..." Individual cards update as suggestions arrive. |
| No GL uploaded | Message: "Upload a general ledger to begin mapping." |
| Locked session | Read-only. No action buttons. |

**Actions:**
- Accept AI suggestion (single click)
- Reject AI suggestion (reveals manual dropdown)
- Manual mapping via dropdown selection
- Bulk accept all HIGH confidence
- Auto-map remaining (triggers AI)
- Change existing mapping

**Connections:**
- Account code links to that account's expanded row on trial balance page
- "Auto-Map" uses AI endpoint
- Progress feeds back to dashboard gate status

---

## 1.9 Reconciliation List

| Property | Value |
|---|---|
| **Title** | Reconciliation |
| **URL** | `/close/[sessionId]/reconciliation` |
| **Layout** | Sidebar + data table |
| **Auth required** | Yes |

**Primary content blocks:**

1. **Header:** Title "Reconciliation", progress: "[M] of [N] complete ([P]%)".

2. **Filter bar:** Dropdown: "Show: Incomplete" (default), "All", "Needs Evidence", "Complete". Count: "[K] reconciliations need attention".

3. **Reconciliation table:**

| Column | Alignment | Notes |
|---|---|---|
| Account | Left | Account code + name |
| GL Balance | Right | Monospace, from trial balance (auto-populated) |
| Supporting Balance | Right | Monospace. Dash if not yet entered. |
| Variance | Right | Monospace. Computed (GL - Supporting - Reconciling Items). Zero = green, non-zero = amber. |
| Reconciling Items | Center | Count of reconciling items, or dash |
| Evidence | Center | Count of attached files, or "None" in amber |
| Status | Center | Badge: Complete + Approved, Complete, In Progress, Needs Evidence, Not Started |

   Row click navigates to reconciliation detail page.

4. **Status legend:** Small legend below table explaining the status badges.

**Data requirements:**
- GET `/api/close/sessions/:id/reconciliations` -- list of all reconciliations with summary data
- Reconciliation list includes: accountId, accountCode, accountName, glBalance, supportingBalance, variance, reconcilingItemCount, evidenceCount, status

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton table |
| All complete | Green banner: "All reconciliations complete and approved." |
| Partial | Table with mixed statuses. Incomplete rows at top by default sort. |
| Empty (no recons initialized) | Message: "No reconciliations required for this period." or "Reconciliations will be initialized when the close is prepared." |
| Locked | Read-only. No row click navigation to detail. |

**Actions:**
- Click row -> navigate to reconciliation detail
- Filter by status
- Sort by any column

**Connections:**
- Row click -> `/close/[sessionId]/reconciliation/[reconId]`
- Account code link -> trial balance page, filtered to that account

---

## 1.10 Reconciliation Detail

| Property | Value |
|---|---|
| **Title** | Reconciliation: [Account Code] -- [Account Name] |
| **URL** | `/close/[sessionId]/reconciliation/[reconId]` |
| **Layout** | Sidebar + single-column content, scrollable |
| **Auth required** | Yes |

**Primary content blocks:**

1. **Back link:** "Back to Reconciliation List" at top.

2. **Account header:** Account code, name, type. Status badge (right side).

3. **Balance comparison section:**
   - GL Balance (from TB): right-aligned dollar amount. Read-only, auto-populated. Label shows source: "From adjusted trial balance".
   - Supporting Balance: right-aligned dollar amount with "Edit" button. Controller enters this from bank statement or subledger. Input field appears on Edit click.
   - Horizontal rule.
   - Gross Variance: computed (GL Balance - Supporting Balance). Read-only.

4. **Reconciling items section:**
   - Table of reconciling items. Each row: description (editable text), amount (editable dollar), remove button.
   - "Add Reconciling Item" button adds a new blank row.
   - Reconciling Items Total: sum of all items. Read-only, auto-computed.

5. **Unexplained variance:** Computed: Gross Variance - Reconciling Items Total. Displayed prominently. Green check if zero, red warning if non-zero. This is the number that must reach zero for the reconciliation to be "complete."

6. **Evidence section:**
   - List of attached files. Each: filename, upload timestamp, "View" button (opens in new tab or preview modal), "Remove" button.
   - "Upload Evidence" button. Accepts PDF, XLSX, CSV, PNG, JPG.
   - If evidence policy requires evidence for this account type and no files are attached: amber warning "Evidence required for this account type."

7. **Action bar:**
   - "Save Draft" -- saves current state without marking complete
   - "Complete Reconciliation" -- marks as complete. Disabled if unexplained variance is non-zero or required evidence is missing. Tooltip explains why disabled.
   - After completion: displays "Prepared by: [name] | [timestamp]"
   - "Approve" button (visible only to reviewer/CFO, and only after completion, and only if approver is a different user than preparer). After approval: displays "Approved by: [name] | [timestamp]"

**Data requirements:**
- GET `/api/close/sessions/:id/reconciliations/:reconId` -- full reconciliation data
- PUT `/api/close/sessions/:id/reconciliations/:reconId/supporting-balance` -- update supporting balance
- POST `/api/close/sessions/:id/reconciliations/:reconId/items` -- add reconciling item
- PUT `/api/close/sessions/:id/reconciliations/:reconId/items/:itemId` -- update item
- DELETE `/api/close/sessions/:id/reconciliations/:reconId/items/:itemId` -- remove item
- POST `/api/close/sessions/:id/reconciliations/:reconId/evidence` -- upload evidence file
- DELETE `/api/close/sessions/:id/reconciliations/:reconId/evidence/:evidenceId` -- remove evidence
- POST `/api/close/sessions/:id/reconciliations/:reconId/complete` -- mark complete
- POST `/api/close/sessions/:id/reconciliations/:reconId/approve` -- approve

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton layout for all sections |
| Not started | GL Balance populated, Supporting Balance empty (shows input prompt), no reconciling items, no evidence |
| In progress | Some fields populated, unexplained variance non-zero |
| Ready to complete | Unexplained variance is zero, evidence attached (if required). "Complete" button enabled. |
| Completed | All fields read-only except for reviewer. "Prepared by" shown. "Approve" button visible to eligible reviewer. |
| Approved | Fully read-only. Both "Prepared by" and "Approved by" stamps visible. |
| Locked session | Fully read-only. No action buttons. |

**Actions:**
- Edit supporting balance
- Add/edit/remove reconciling items
- Upload/remove evidence
- Save draft
- Complete reconciliation
- Approve (reviewer only)

**Connections:**
- Back -> `/close/[sessionId]/reconciliation`
- Account code -> trial balance filtered to this account
- Evidence file view -> opens file

---

## 1.11 Adjustments (Journal Entries and Templates)

| Property | Value |
|---|---|
| **Title** | Adjustments |
| **URL** | `/close/[sessionId]/adjustments` |
| **Layout** | Sidebar + tabbed content area |
| **Auth required** | Yes |

**Primary content blocks:**

1. **Header:** Title "Adjustments". Right side: "+ New Journal Entry" button.

2. **Tab bar:** Two tabs: "Templates", "Journal Entries".

3. **Templates tab:**
   - Table of AJE templates proposed for this period:

| Column | Notes |
|---|---|
| Template Name | e.g., "Monthly Depreciation" |
| Amount | Dollar amount |
| Status | Applied, Pending, Skipped |
| Action | "Apply" / "Skip" buttons for Pending templates. No action for Applied/Skipped. |

   - Applied templates show a green check. Skipped templates show a gray "Skipped" label with "Undo" option.
   - Applying a template creates a draft journal entry automatically.

4. **Journal Entries tab:**
   - Filter pills: All, Draft, Proposed, Approved, Posted
   - Journal entry table:

| Column | Alignment | Notes |
|---|---|---|
| JE ID | Left | Auto-generated sequential ID (e.g., JE-2026-02-001) |
| Description | Left | First line of memo |
| Total Amount | Right | Monospace. Sum of debit lines. |
| Status | Center | Badge: DRAFT, PROPOSED, APPROVED, POSTED, REJECTED |
| Created By | Left | User name |
| Action | Right | Context-dependent: Edit (draft), Submit (draft), Approve/Reject (proposed, reviewer only), Post (approved, controller) |

   - Row click expands inline to show full JE detail (see below).

5. **Expanded JE detail (inline):**
   - Debit/credit line items table:

| Column | Notes |
|---|---|
| Account (code + name) | Dropdown for drafts, read-only otherwise |
| Debit | Dollar amount or blank |
| Credit | Dollar amount or blank |

   - Totals row: Total Debits, Total Credits
   - Difference: must be $0.00 (validation)
   - Memo: full text
   - Evidence: list of attached files with view/remove
   - Approval history: chronological list of status changes with user, timestamp, and any rejection reason
   - Material threshold note: if total amount exceeds materiality threshold, shows "Evidence required" if no evidence attached

6. **JE creation form (modal):**
   - Description input
   - Line items: dynamic rows. Each row: account dropdown (searchable, shows code + name), debit input, credit input. Only one of debit/credit per line.
   - "Add Line" button
   - Running totals: Total Debits, Total Credits, Difference
   - Difference must be zero to save. If non-zero, save button disabled with tooltip.
   - Memo textarea (required, minimum 10 characters)
   - Evidence upload (optional unless amount exceeds materiality threshold)
   - Action buttons: "Save Draft", "Submit for Approval" (proposes the JE)

**Data requirements:**
- GET `/api/close/templates?sessionId=:id` -- templates for this period
- POST `/api/close/templates/apply` -- apply a template
- POST `/api/close/templates/skip` -- skip a template
- GET `/api/close/journal-entries?sessionId=:id` -- all JEs for this session
- POST `/api/close/journal-entries` -- create new JE
- PUT `/api/close/journal-entries/:id` -- update draft JE
- POST `/api/close/journal-entries/:id/propose` -- submit for approval
- POST `/api/close/journal-entries/:id/approve` -- approve
- POST `/api/close/journal-entries/:id/reject` -- reject (requires reason)
- POST `/api/close/journal-entries/:id/post` -- post approved JE
- POST `/api/close/journal-entries/:id/evidence` -- attach evidence

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton tabs and table |
| No templates | Templates tab shows: "No recurring templates configured. Set up templates in Settings." |
| No JEs | Journal Entries tab shows: "No journal entries for this period. Create one or apply a template." |
| JE validation error | Inline red text on the JE form: "Debits must equal credits" or "Memo is required" |
| Rejection | Rejected JE shows rejection reason in a red-bordered callout. JE returns to DRAFT status for editing. |
| Locked session | Read-only. No create/edit/approve/post actions. |

**Actions:**
- Apply/skip templates
- Create new journal entry
- Edit draft JE
- Submit for approval
- Approve/reject (reviewer)
- Post (controller, after approval)
- Attach/view/remove evidence

**Connections:**
- Account dropdowns reference the chart of accounts from the trial balance
- JE IDs referenced from variance analysis page
- Template configuration -> `/settings/templates`
- Posted JEs trigger TB recalculation (toast notification: "Trial balance updated. Statements may need regeneration.")

---

## 1.12 Financial Statements

| Property | Value |
|---|---|
| **Title** | Financial Statements |
| **URL** | `/close/[sessionId]/statements` |
| **Layout** | Sidebar + full-width main content |
| **Auth required** | Yes |

**Primary content blocks:**

1. **Header:** Title "Financial Statements". Right side: "Generate Statements" button. Below: "Last generated: [timestamp]" and status badge: "Current" (green) or "Stale -- regeneration needed" (amber).

2. **Stale warning banner (conditional):** When any mutation has occurred since the last generation (JE posted, mapping changed, GL re-uploaded), a persistent amber banner appears: "Data has changed since statements were last generated. Regenerate to see updated statements." with "Regenerate Now" button.

3. **Statement tabs:** Four tabs: Balance Sheet, Income Statement, Cash Flow Statement, Statement of Stockholders' Equity.

4. **Statement rendering:** Each statement rendered in formal GAAP presentation format:
   - Company name centered at top
   - Statement title centered
   - Period identifier ("As of February 28, 2026" for balance sheet, "For the Month Ended February 28, 2026" for income/cash flow/equity)
   - Hierarchical line items with proper indentation (category headers, line items, subtotals, totals, grand totals)
   - Dollar amounts right-aligned, monospace, formatted with commas and 2 decimals
   - Negative amounts in parentheses: ($350,000.00)
   - Subtotal lines preceded by a thin rule
   - Total lines preceded by a thick rule
   - Grand total lines double-underlined (standard accounting presentation)
   - Line items are clickable -- clicking drills down to show the contributing TB accounts and their balances

5. **Cross-statement validation section:** Below each statement, a validation panel:
   - Balance Sheet: "Assets ($X) = Liabilities + Equity ($Y)" with pass/fail
   - Income Statement: "Net Income ($X) ties to Balance Sheet retained earnings change" with pass/fail
   - Cash Flow: "Ending Cash ($X) ties to Balance Sheet cash" with pass/fail
   - Equity: "Ending Retained Earnings ($X) ties to Balance Sheet" with pass/fail

6. **Export bar:** "Download PDF", "Download Excel", "Print" buttons.

**Data requirements:**
- POST `/api/close/sessions/:id/statement-packages/generate` -- triggers statement generation
- GET `/api/close/statement-packages/:id/lines` -- returns line items for all four statements
- Statement line data includes: lineItemId, label, amount, indentLevel, lineType (header, item, subtotal, total, grandTotal), statementType

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton statement layout |
| Not yet generated | Message: "Financial statements have not been generated yet. All accounts must be mapped before generation." with "Generate" button (disabled if mapping incomplete). |
| Generating | Full-page spinner or progress bar: "Generating financial statements..." (typically fast, 2-5 seconds) |
| Generated and current | Statements displayed. Green "Current" badge. |
| Stale | Statements displayed but amber "Stale" banner and badge shown. |
| Validation failure | Failing validation checks shown in red with details. This should never happen if the backend arithmetic is correct, but the UI must surface it. |
| Locked session | Read-only. No generate button. |

**Actions:**
- Generate / regenerate statements
- Switch between statement tabs
- Drill down on line items
- Export to PDF / Excel / Print

**Connections:**
- Line item drilldown shows TB accounts (links to trial balance page filtered)
- Stale warning links conceptually to whatever caused staleness (JE posted, etc.)
- Export actions produce downloadable files

---

## 1.13 Variance Analysis

| Property | Value |
|---|---|
| **Title** | Variance Analysis |
| **URL** | `/close/[sessionId]/variance` |
| **Layout** | Sidebar + main content |
| **Auth required** | Yes |

**Primary content blocks:**

1. **Header:** Title "Variance Analysis", progress: "[M] of [N] explained ([P]%)". Period comparison label: "Feb 2026 vs Jan 2026". Right side: "Draft All Explanations" button (lightning bolt icon, triggers AI for all unexplained material variances).

2. **Filter bar:** Dropdown: "Show: Material Unexplained" (default), "All Variances", "Material Only", "Explained", "Unexplained". Count: "[K] variances need explanation".

3. **Variance table:**

| Column | Alignment | Notes |
|---|---|---|
| Line Item | Left | Financial statement line item name |
| Prior Period | Right | Monospace dollar amount |
| Current Period | Right | Monospace dollar amount |
| Change ($) | Right | Monospace, positive = increase, negative in parens |
| Change (%) | Right | Percentage with directional arrow (up green/red, down green/red depending on line item type) |
| Material? | Center | "Yes" badge (amber) or "No" (gray) |
| Status | Center | Badge: Explained + Approved, Explained, Needs Explanation, N/A (immaterial) |

   Rows with "Needs Explanation" status have amber background tint.
   Row click expands to show detail.

4. **Expanded variance detail (inline):**
   - Variance summary: line item, dollar change, percentage change
   - **Contributing entries section:** Table of journal entries that drove the change, showing JE ID, description, amount, and percentage contribution to the total variance. This grounds the explanation in actual data.
   - **AI-drafted explanation section:** Visually distinct container (left blue border, slightly different background shade to distinguish AI-generated content). Contains:
     - The explanation text (editable textarea when in edit mode)
     - Source attribution: "Generated by GL Investigation Engine -- all numbers verified against journal entry data"
     - Action buttons: "Edit" (makes text editable), "Approve Explanation" (green), "Regenerate" (gray, re-runs AI)
   - **If no AI draft exists:** "Draft Explanation" button to trigger AI for this single variance, or a blank textarea for manual entry.
   - **After approval:** Shows "Approved by [name] on [timestamp]". Text becomes read-only. "Revoke" button available (returns to unapproved state).

**Data requirements:**
- GET `/api/close/sessions/:id/variances` -- all variances with materiality flags, explanation status
- GET `/api/close/variances/:id/ai-draft` -- request AI-drafted explanation for a specific variance
- POST `/api/close/variances/:id/explain` -- save/approve an explanation
- Variance data includes: lineItemId, lineItemName, priorAmount, currentAmount, changeAmount, changePercent, isMaterial, explanation, explanationStatus, contributingEntries

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton table |
| All explained | Green banner: "All material variances explained and approved." |
| Partial | Table with mixed statuses. Unexplained material variances sorted to top. |
| No statements generated | Message: "Generate financial statements before analyzing variances." |
| AI drafting | Individual variance card shows spinner: "Drafting explanation..." Text appears when ready. |
| AI drafting all | "Draft All Explanations" button replaced with progress: "Drafting [M] of [N]..." Cards update as drafts arrive. |
| First period | Message: "This is the first close period. No prior period available for comparison. Variance analysis is not applicable." |
| Locked session | Read-only. No edit/approve/draft actions. |

**Actions:**
- Expand variance to see detail
- Draft AI explanation (single or all)
- Edit explanation text
- Approve explanation
- Regenerate AI explanation
- Revoke approval
- Filter by status/materiality

**Connections:**
- Contributing entry JE IDs link to the adjustments page, scrolled to that JE
- Line item names link to the statements page, scrolled to that line
- Progress feeds back to dashboard gate status

---

## 1.14 Review and Certify

| Property | Value |
|---|---|
| **Title** | Review & Certify |
| **URL** | `/close/[sessionId]/review` |
| **Layout** | Sidebar + centered single-column content |
| **Auth required** | Yes (CFO/Reviewer role to certify) |

This page is the culmination of the entire close process. It must feel significant.

**Primary content blocks:**

1. **Header:** Title "Review & Certify", period label.

2. **Certification readiness checklist:** A card listing all 11 gates. Each gate shows:
   - Pass/fail icon (green check or red X)
   - Gate name
   - Detail text (e.g., "60 / 60 accounts mapped", "Generated 10:45 AM")
   - If failing: the gate row is clickable and navigates to the relevant page to fix it

   Below the checklist: "[M] of 11 gates passing" summary. If all 11 pass, the text turns green and reads "All gates passing. Ready for certification."

3. **Statement summary card:** Four rows, one per statement:
   - Statement name, key metric (Total Assets, Net Income, Ending Cash, Total Equity), pass/fail badge
   - Cross-statement validation summary: "ALL TIES CONFIRMED" or specific failures listed

4. **Certification panel:** Visible only when all 11 gates pass. Contains:
   - Attestation text: "By certifying, you attest that: (1) All financial data has been reviewed. (2) All adjustments are supported and approved. (3) All material variances have been explained. (4) The financial statements are complete and accurate."
   - Warning text: "This will create an immutable, cryptographically signed certification artifact. The system will re-validate all gates at the moment of certification."
   - "Certify [Period]" button. Prominent, gold-accented. Disabled with tooltip if user lacks certifier role.

5. **Certification artifact card (post-certification):** Appears after successful certification. Gold-bordered card containing:
   - "CERTIFIED" header in gold
   - Certified by: [name]
   - Certified at: [full timestamp with timezone]
   - Session ID
   - Snapshot Hash: [truncated hash with copy button]
   - Signature: [truncated Ed25519 signature with copy button]
   - Audit Chain: [count] entries, verified (green check)
   - Evidence: [count] documents, manifest hash verified (green check)
   - Action buttons: "Download Audit Binder", "Verify Independently" (opens public verification URL), "Lock Period"

6. **Lock period (post-certification only):** "Lock Period" button triggers a confirmation dialog: "Locking this period is permanent and irreversible. No changes can be made after locking. Are you sure?" Two buttons: "Cancel", "Lock Period" (red, destructive). After locking, the entire session becomes immutable.

**Data requirements:**
- GET `/api/close/sessions/:id/readiness?format=gates` -- all gate statuses
- POST `/api/close/sessions/:id/certify` -- perform certification
- POST `/api/close/sessions/:id/lock` -- lock the period
- GET `/api/close/sessions/:id` -- session metadata including certification artifact if certified
- Certification response includes: certifiedBy, certifiedAt, snapshotHash, signature, auditChainCount, evidenceCount, artifactId

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton checklist and cards |
| Gates failing | Checklist shows failures. Certification panel hidden. Message below checklist: "Resolve all failing gates before certification." Failing gates are clickable links. |
| All gates passing | Checklist all green. Certification panel visible with attestation and button. |
| Certifying | Button shows spinner: "Certifying... Re-validating all gates." (This step re-runs all gate checks server-side.) |
| Certification failed | Red banner: "Certification failed. [Reason -- e.g., a gate that was passing now fails]." Checklist refreshes to show current state. |
| Certified | Gold banner. Certification artifact card visible. "Certify" button replaced with artifact. "Lock Period" button available. |
| Locked | Gold banner with lock icon: "This period is locked and immutable." No further actions available. |
| Controller view (non-certifier) | Checklist and summary visible. Certification panel shows: "Only users with the Reviewer/Certifier role can certify. Current reviewer: [name or 'None assigned']." |

**Actions:**
- Click failing gate -> navigate to fix
- Certify period (reviewer only)
- Download audit binder
- Open public verification URL
- Lock period (with confirmation)

**Connections:**
- Failing gate links -> respective pipeline pages
- "Verify Independently" -> `/verify/[artifactId]` (public page)
- "Download Audit Binder" -> file download
- Back to portfolio -> `/portfolio`

---

## 1.15 Audit Trail

| Property | Value |
|---|---|
| **Title** | Audit Trail |
| **URL** | `/close/[sessionId]/audit-trail` |
| **Layout** | Sidebar + full-width data table |
| **Auth required** | Yes |

**Primary content blocks:**

1. **Header:** Title "Audit Trail", event count: "[N] events". Hash chain status: "Hash chain: Verified" (green check) or "Hash chain: BROKEN" (red X, should never happen, but must be surfaced).

2. **Filter pills:** All, Close Events, Journal Entries, Reconciliation, Mapping, Evidence, Certification.

3. **Search:** Text search across event descriptions.

4. **Event table:**

| Column | Notes |
|---|---|
| Timestamp | Full datetime, most recent first |
| User | Name of user who performed action, or "System" for automated events |
| Event Type | Category badge (same as filter categories) |
| Description | What happened. For JEs: includes JE ID and amount. For recons: includes account code. For certification: includes artifact hash. |

   Each row expandable to show:
   - Full event detail as structured data
   - Before/after state comparison (JSON diff rendered as key-value changes, not raw JSON)
   - Hash chain linkage: "This record's hash includes the hash of the previous record" with hash values
   - Cascade effects: if this event triggered downstream changes (e.g., posting a JE invalidates statements), those cascade events listed

5. **Pagination:** Infinite scroll or paginated (50 events per page) given potentially large event counts.

**Data requirements:**
- GET `/api/close/sessions/:id/audit-trail?type=[filter]&page=[n]&search=[term]`
- Each audit entry includes: id, timestamp, userId, userName, eventType, description, beforeState, afterState, hash, previousHash

**States:**

| State | Behavior |
|---|---|
| Loading | Skeleton table |
| Populated | Event table with filters |
| Filtered | Table shows matching events. Count updates. |
| Empty | "No events recorded for this session yet." |
| Hash chain broken | Red banner: "ALERT: Audit trail integrity check failed. The hash chain has been broken at event [ID]. Contact support immediately." This is a security event. |

**Actions:**
- Filter by event type
- Search events
- Expand/collapse event detail
- Paginate or scroll

**Connections:**
- JE references link to adjustments page
- Recon references link to reconciliation detail
- Certification references link to review page

---

## 1.16 External Verification (Public)

| Property | Value |
|---|---|
| **Title** | Verify Certification |
| **URL** | `/verify` (landing) and `/verify/[artifactId]` (specific artifact) |
| **Layout** | Full-width, no sidebar, no authentication required. Clean, minimal layout with Sabit branding. |
| **Auth required** | No |

This is the page external auditors use. No login. No account. They arrive with an artifact ID or a link shared by the CFO.

**Primary content blocks:**

1. **Landing page (`/verify`):**
   - Sabit wordmark
   - Title: "Verify a Certification"
   - Description: "Enter a certification artifact ID to independently verify its authenticity and integrity."
   - Input field: "Artifact ID" with paste button
   - "Verify" button
   - Below: brief explanation of what verification checks (signature validity, hash chain integrity, statement accuracy)

2. **Verification result page (`/verify/[artifactId]`):**
   - Verification status header: large "VERIFIED" (green) or "VERIFICATION FAILED" (red) banner
   - Verification checks table:

| Check | Status | Detail |
|---|---|---|
| Digital Signature | Valid / Invalid | Ed25519 signature verified against public key |
| Snapshot Hash | Valid / Invalid | Computed hash matches stored hash |
| Audit Chain | Intact / Broken | [N] entries, all hashes chain correctly |
| Statement Integrity | Valid / Invalid | Recomputed totals match certified totals |

   - Certification metadata: entity name, period, certified by, certified at, locked status
   - Statement summary: key metrics from each of the four statements (Total Assets, Net Income, Ending Cash, Total Equity)
   - Public key information: the Ed25519 public key used for verification, with copy button
   - Note: "This verification was performed independently. No authentication was required. The cryptographic proof is self-contained."

**Data requirements:**
- GET `/api/verification/certification/artifacts/:artifactId` -- certification artifact data
- POST `/api/verification/certification/verify` -- runs verification checks, returns results
- GET `/api/verification/certification/public-key` -- returns the public key for independent verification

**States:**

| State | Behavior |
|---|---|
| Landing | Empty input, waiting for artifact ID |
| Verifying | Spinner: "Verifying certification artifact..." |
| Verified | Green banner. All checks shown with green marks. Metadata and summary displayed. |
| Verification failed | Red banner. Failing checks highlighted in red with explanation of what failed. |
| Artifact not found | Message: "No certification artifact found with this ID. Check the ID and try again." |
| Error | Message: "Verification service temporarily unavailable. Try again shortly." |

**Actions:**
- Enter artifact ID
- Verify
- Copy public key
- Print verification result (for audit files)

**Connections:**
- None (this is a terminal page for external users)
- Internally, the artifact ID is generated on the review/certify page

---

## 1.17 Settings

| Property | Value |
|---|---|
| **Title** | Settings |
| **URL** | `/settings/*` |
| **Layout** | Sidebar (close session sidebar if accessed from within a session, or top-nav if accessed from portfolio) + left tab navigation + right content area |
| **Auth required** | Yes (admin or controller role) |

**Settings tabs and their content:**

### 1.17.1 General Settings (`/settings/general`)
- Entity legal name (text input)
- Fiscal year end month (dropdown)
- Base currency (dropdown)
- Industry vertical (dropdown)
- Save button with toast confirmation

### 1.17.2 Reconciliation Settings (`/settings/reconciliation`)
- Table of balance sheet account types (Asset subtypes, Liability subtypes)
- Each row: account type name, toggle "Requires Reconciliation" (yes/no)
- Save button

### 1.17.3 Evidence Policy (`/settings/evidence-policy`)
- Materiality threshold: dollar amount input. JEs above this amount require evidence.
- Account types requiring evidence on reconciliation: checklist of account types
- Save button

### 1.17.4 Templates (`/settings/templates`)
- List of recurring AJE templates. Each template:
  - Name, description
  - Debit/credit line items (account + amount)
  - Recurrence: monthly
  - Status: active/inactive
- "Create Template" button opens a form similar to the JE creation form
- Edit/delete existing templates

### 1.17.5 Taxonomy (`/settings/taxonomy`)
- The financial statement taxonomy: the list of line items accounts can map to
- Organized by statement (Balance Sheet, Income Statement, Cash Flow, Equity) and by category (Current Assets, Non-Current Assets, etc.)
- Each line item: name, statement, category, display order
- Add/edit/remove line items
- "Reset to Default GAAP Taxonomy" button

### 1.17.6 Integrations (`/settings/integrations`)
- List of available ERP integrations (QuickBooks, Xero, NetSuite, Sage)
- Each shows: connected/disconnected status, last sync timestamp
- Connect/disconnect buttons
- This is a future feature; V1 shows the integration cards as "Coming Soon" with a "Request Access" button

### 1.17.7 Team and Roles (`/settings/team`)
- Table of team members: name, email, role (Controller, Reviewer, Admin, Viewer), last active, status (active/invited/deactivated)
- "Invite Member" button: email input + role dropdown
- Edit role dropdown on each row
- Deactivate/reactivate toggle
- Cannot deactivate yourself

**Data requirements:**
- GET/PUT `/api/settings/general`
- GET/PUT `/api/close/recon-requirements`
- GET/PUT `/api/close/evidence-policy`
- GET/POST/PUT/DELETE `/api/close/templates`
- GET/POST/PUT/DELETE `/api/coa-mapping/taxonomy`
- GET/PUT `/api/settings/integrations`
- GET/POST/PUT `/api/settings/team`

**States per tab:**

| State | Behavior |
|---|---|
| Loading | Skeleton form/table |
| Populated | Form fields filled with current values |
| Unsaved changes | Save button becomes prominent (primary color). Banner: "You have unsaved changes." |
| Saving | Button shows spinner |
| Saved | Toast: "[Setting name] saved." Button returns to default state. |
| Validation error | Inline errors on specific fields |
| Permission denied | Settings visible but inputs disabled. Message: "Only admins can modify settings." |

---

# Part 2: Component Specifications

---

## 2.1 Navigation and Layout Components

### 2.1.1 TopBar

**Purpose:** Global navigation bar present on every authenticated page.

**Variants:**
- `portfolio` -- shown on portfolio page (no entity/session context)
- `close-session` -- shown on close pages (includes entity name, period, status)

**Props/inputs:**
- `variant`: portfolio | close-session
- `entityName`: string (close-session variant only)
- `periodLabel`: string (close-session variant only)
- `sessionStatus`: OPEN | IN_PROGRESS | UNDER_REVIEW | CERTIFIED | LOCKED
- `userName`: string
- `userRole`: string
- `backLink`: { label, href } (optional, e.g., "Back to Portfolio")

**Visual description:** Full-width horizontal bar. Dark background (darkest shade). Left: Sabit wordmark. Center (close-session variant): entity name dropdown, period dropdown, status badge. Right: user name, role badge (small colored pill), avatar circle with dropdown menu.

**Where used:** Every authenticated page.

---

### 2.1.2 SessionSidebar

**Purpose:** Vertical navigation for close session pages. Shows pipeline steps with completion indicators.

**Props/inputs:**
- `sessionId`: string
- `currentPage`: string (which nav item is active)
- `gateStatuses`: object mapping each gate to pass/fail/pending
- `sessionStatus`: string
- `entityName`: string
- `periodLabel`: string

**Visual description:** Fixed left column, approximately 240px wide. Dark background, slightly lighter than TopBar. Top section: entity name (bold), period label, status badge. Below: vertical list of navigation items. Each item: icon, label, and a right-aligned badge (green check, amber warning with count, or nothing). Active item has a left border highlight and slightly lighter background. A divider line separates the main pipeline items (Dashboard through Review & Certify) from secondary items (Audit Trail, Settings). Bottom of sidebar: "Back to Portfolio" link.

**Where used:** All `/close/[sessionId]/*` pages.

---

### 2.1.3 PageHeader

**Purpose:** Consistent header for the main content area of each page.

**Props/inputs:**
- `title`: string
- `subtitle`: string (optional, e.g., period label)
- `progress`: { current, total, percent } (optional)
- `actions`: array of { label, icon, onClick, variant } (optional, right-side buttons)
- `statusBadge`: { label, color } (optional)

**Visual description:** Horizontal bar spanning the main content area. Title in large bold text (left). Subtitle in smaller gray text below title. Progress indicator (if provided) as text "[M] of [N] ([P]%)" with a thin progress bar below. Right side: action buttons.

**Where used:** Every close session page header.

---

### 2.1.4 StatusBadge

**Purpose:** Consistent status indicator used across the product.

**Variants:**
- `session-status`: OPEN (gray), IN_PROGRESS (blue), UNDER_REVIEW (amber), CERTIFIED (gold), LOCKED (gold with lock icon)
- `gate-status`: PASSING (green), FAILING (red), PENDING (gray)
- `je-status`: DRAFT (gray), PROPOSED (blue), APPROVED (green), POSTED (green, filled), REJECTED (red)
- `recon-status`: NOT_STARTED (gray), IN_PROGRESS (blue), COMPLETE (green), APPROVED (green, filled)
- `variance-status`: NEEDS_EXPLANATION (amber), EXPLAINED (blue), APPROVED (green), N/A (gray)
- `mapping-status`: MAPPED (green with check), UNMAPPED (amber with warning)

**Props/inputs:**
- `status`: string (the status value)
- `type`: string (which variant set to use)
- `size`: sm | md (default md)

**Visual description:** Small rounded pill. Background color matches the status. White or dark text depending on contrast. Optional icon before text (check, warning, lock). Small variant is 20px tall, medium is 24px tall.

**Where used:** Every table, every card, every header that displays status.

---

## 2.2 Data Display Components

### 2.2.1 FinancialTable

**Purpose:** Table optimized for displaying financial data with proper number formatting, alignment, and drill-down capability.

**Variants:**
- `standard` -- basic financial table (trial balance, reconciliation list)
- `statement` -- GAAP financial statement presentation (hierarchical, indented)
- `journal-entry` -- debit/credit entry table

**Props/inputs:**
- `columns`: array of column definitions { key, label, type (text|money|percent|badge|action), width, alignment }
- `rows`: array of data objects
- `expandable`: boolean (rows expand on click)
- `expandedContent`: function returning expanded row content
- `sortable`: boolean
- `defaultSort`: { key, direction }
- `stickyHeader`: boolean (default true)
- `stickyFooter`: boolean (for totals row)
- `footerRow`: object (totals)
- `highlightRule`: function (row) => "amber" | "red" | null (conditional row highlighting)
- `emptyMessage`: string
- `loading`: boolean

**Visual description:** Clean data table with no outer border. Thin horizontal rules between rows. Header row with uppercase small labels in gray. Data rows with white text. Money columns in monospace font, right-aligned, formatted with commas and 2 decimal places. Negative amounts in parentheses. Expandable rows show a subtle chevron on the left that rotates when expanded. Expanded content appears below the row with a slightly indented left border. Highlighted rows have a tinted background (amber for warning, red for error). Sticky header stays visible during scroll. Sticky footer (if present) stays visible at bottom.

**Where used:** Trial Balance, Reconciliation List, Adjustments (JE list and templates), Variance Analysis, Audit Trail, Statements.

---

### 2.2.2 StatementRenderer

**Purpose:** Renders a GAAP financial statement with proper hierarchical formatting.

**Props/inputs:**
- `companyName`: string
- `statementTitle`: string ("Balance Sheet", etc.)
- `periodDescription`: string ("As of February 28, 2026")
- `lines`: array of { label, amount, indentLevel (0-3), lineType (header|item|subtotal|total|grandTotal), clickable }
- `onLineClick`: function (lineId)
- `validations`: array of { description, passed }

**Visual description:** Formal financial statement layout. Company name centered, bold. Statement title centered below. Period centered below in lighter text. Line items rendered with indentation based on indentLevel. Headers are bold, no amount. Items show label (left) and amount (right). Subtotals preceded by a single thin underline on the amount column. Totals preceded by a single thick underline. Grand totals use double underline (the accounting convention). Clickable items show a subtle hover highlight. Below the statement body: validation checks rendered as a list with check/X icons.

**Where used:** Statements page only.

---

### 2.2.3 MoneyDisplay

**Purpose:** Consistently formats and displays dollar amounts throughout the product.

**Props/inputs:**
- `value`: string (Decimal string from API, never a JavaScript number)
- `size`: sm | md | lg
- `showSign`: boolean (show +/- prefix)
- `negativeFormat`: "parens" (default) | "minus"
- `color`: "default" | "positive" (green) | "negative" (red) | "muted" (gray)

**Visual description:** Monospace font. Right-aligned within its container. Formatted with comma thousand separators and exactly 2 decimal places. Negative values in parentheses by default: ($1,234.56). Dollar sign prefix. Size variants: sm = 12px, md = 14px, lg = 18px.

**Where used:** Every location where a dollar amount appears.

---

### 2.2.4 PercentChange

**Purpose:** Shows period-over-period percentage change with directional indicator.

**Props/inputs:**
- `value`: number (percentage)
- `direction`: "up" | "down" | "flat"
- `favorableDirection`: "up" | "down" (determines whether green or red -- e.g., revenue up = green, expense up = red)

**Visual description:** Arrow icon (up/down/flat dash) followed by percentage formatted to 1 decimal. Green when change is favorable, red when unfavorable, gray when flat (less than 0.5% change). Arrow and text are the same color.

**Where used:** Variance analysis table, dashboard period summary.

---

### 2.2.5 GateChecklist

**Purpose:** Renders the list of certification gates with pass/fail status.

**Props/inputs:**
- `gates`: array of { name, description, status (passing|failing|pending), detail, link }
- `summary`: { passing, total }
- `interactive`: boolean (whether failing gates are clickable links)

**Visual description:** Vertical list of gate items. Each item: left icon (green filled circle with check for passing, red circle with X for failing, gray circle for pending), gate name in white text, detail in gray text to the right. If interactive, failing gate rows show a right-pointing arrow and are clickable (cursor pointer, hover highlight). Below the list: summary text "[M] of [N] gates passing" with a thin progress bar. All-passing state: summary text turns green, all icons are green checks.

**Where used:** Close Dashboard (gate status panel), Review & Certify page (certification readiness checklist).

---

### 2.2.6 PipelineTracker

**Purpose:** Horizontal stepper showing the 8 close pipeline stages.

**Props/inputs:**
- `stages`: array of { id, label, status (completed|inProgress|notStarted), href }
- `currentStage`: string

**Visual description:** Horizontal row of circles connected by lines. Completed stages: filled green circle with white check, green connecting line to the left. In-progress stage: half-filled blue circle, blue connecting line to the left. Not started stages: empty gray circle, gray line. Labels below each circle. Current stage label is bold. Clicking any stage navigates to its page. On narrow viewports, labels may be hidden and shown on hover/tap.

**Where used:** Close Dashboard only.

---

## 2.3 Interactive Components

### 2.3.1 AIContentCard

**Purpose:** Visually distinguishes AI-generated content from system/human content.

**Props/inputs:**
- `content`: string (the AI-generated text)
- `source`: string (e.g., "GL Investigation Engine")
- `sourceNote`: string (e.g., "all numbers verified against journal entry data")
- `confidence`: number (0-100, optional)
- `editable`: boolean
- `onEdit`: function
- `onApprove`: function
- `onRegenerate`: function
- `onReject`: function
- `approvedBy`: { name, timestamp } (if already approved)

**Visual description:** Card with a distinct left border in blue/purple (the AI accent color). Background is very slightly tinted compared to surrounding content (subtle enough to be professional, distinct enough to notice). Top-right: small "AI" label badge. Content text in normal white. Below content: source attribution in small gray text with an info icon. If editable: text becomes a textarea on "Edit" click. Below the card: action buttons (Edit, Approve, Regenerate, Reject as applicable). If confidence is provided: small confidence badge (percentage in colored pill). Approved state: green border replaces blue, "Approved by [name] on [date]" footer.

**Where used:** Account mapping suggestions, variance explanations, agent-assisted mode summaries.

---

### 2.3.2 FileUploader

**Purpose:** Handles file uploads for evidence and GL data.

**Variants:**
- `dropzone` -- large drag-and-drop area (GL upload)
- `inline` -- compact upload button with file list (evidence on recons and JEs)

**Props/inputs:**
- `variant`: dropzone | inline
- `acceptedTypes`: array of MIME types or extensions
- `maxFileSize`: number (bytes)
- `multiple`: boolean
- `files`: array of existing files { id, name, uploadedAt, size }
- `onUpload`: function (file)
- `onRemove`: function (fileId)
- `required`: boolean
- `requiredMessage`: string (e.g., "Evidence required for this account type")

**Visual description:**
- Dropzone: large dashed-border rectangle. Center: upload icon, "Drop your file here, or click to browse" text, accepted formats listed below in small gray text. On drag-over: border becomes solid, background tints. On file selected: file name appears with a check mark.
- Inline: small "Upload" button with paperclip icon. Below: list of uploaded files, each showing filename (truncated with tooltip for long names), timestamp, "View" link, "Remove" button (X icon). If required and no files: amber text showing required message.

**Where used:** GL upload page (dropzone), reconciliation detail (inline), JE creation/detail (inline).

---

### 2.3.3 ConfirmationDialog

**Purpose:** Modal dialog for destructive or significant actions.

**Variants:**
- `destructive` -- red accent for irreversible actions (lock period, delete)
- `significant` -- gold accent for important actions (certify)
- `standard` -- neutral for normal confirmations

**Props/inputs:**
- `variant`: destructive | significant | standard
- `title`: string
- `message`: string (supports multiple lines)
- `confirmLabel`: string
- `cancelLabel`: string (default "Cancel")
- `onConfirm`: function
- `onCancel`: function
- `requiresTextConfirmation`: boolean (user must type a phrase to confirm, for destructive actions)
- `confirmationPhrase`: string (e.g., "LOCK PERIOD")

**Visual description:** Centered modal with dark overlay. Card with title, message text, and two buttons. Cancel button: gray/outline. Confirm button: colored based on variant (red for destructive, gold for significant, blue for standard). If text confirmation required: an input field labeled "Type '[phrase]' to confirm" and the confirm button remains disabled until the phrase is typed exactly.

**Where used:** Lock period, certify period, delete JE, re-upload GL (replacing existing data), deactivate team member.

---

### 2.3.4 Toast

**Purpose:** Transient notification messages.

**Variants:**
- `success` -- green accent, check icon
- `error` -- red accent, X icon
- `warning` -- amber accent, warning icon
- `info` -- blue accent, info icon

**Props/inputs:**
- `variant`: success | error | warning | info
- `message`: string
- `duration`: number (milliseconds, default 5000, 0 for persistent)
- `action`: { label, onClick } (optional action button within the toast)
- `dismissible`: boolean (default true)

**Visual description:** Small rectangular card that slides in from the top-right corner. Icon on the left, message text, optional action button as a text link, X close button on the right. Disappears after duration. Multiple toasts stack vertically. Dark background with colored left border matching variant.

**Where used:** Every page -- after saves, errors, status changes, background operations completing.

---

### 2.3.5 SearchInput

**Purpose:** Consistent search field with debounced input.

**Props/inputs:**
- `placeholder`: string
- `value`: string
- `onChange`: function
- `debounceMs`: number (default 300)
- `icon`: boolean (default true, shows magnifying glass)

**Visual description:** Standard text input with magnifying glass icon on the left inside the input. Darker background than the card it sits on. Rounded corners. On focus: subtle border glow in primary color. Clear button (X) appears on the right when text is entered.

**Where used:** Trial balance search, audit trail search, taxonomy search, account dropdowns.

---

### 2.3.6 FilterPills

**Purpose:** Horizontal row of selectable filter options.

**Props/inputs:**
- `options`: array of { value, label, count (optional) }
- `selected`: string (current selection)
- `onChange`: function

**Visual description:** Horizontal row of pill-shaped buttons. Selected pill has primary color background with white text. Unselected pills have transparent background with gray text and subtle border. If count is provided, it appears as a small number after the label (e.g., "Unmapped (3)"). On hover: unselected pills show a lighter background.

**Where used:** Trial balance (account type, mapping status), adjustments (JE status), variance (materiality, explanation status), audit trail (event type).

---

### 2.3.7 AccountDropdown

**Purpose:** Searchable dropdown for selecting an account from the chart of accounts.

**Props/inputs:**
- `accounts`: array of { code, name, type }
- `selectedCode`: string
- `onChange`: function
- `placeholder`: string (default "Select account...")
- `disabled`: boolean

**Visual description:** Standard dropdown that opens a scrollable list. List items show account code (monospace, left) and account name (right), with account type as a small badge. A search input at the top of the open dropdown filters the list as the user types. Selected item shows in the closed dropdown as "code -- name". Grouped by account type with small headers.

**Where used:** JE creation form (line item account selection), manual mapping dropdown.

---

### 2.3.8 TaxonomyDropdown

**Purpose:** Searchable dropdown for selecting a taxonomy line item (for account mapping).

**Props/inputs:**
- `lineItems`: array of { id, name, statement, category }
- `selectedId`: string
- `onChange`: function
- `placeholder`: string (default "Select line item...")

**Visual description:** Similar to AccountDropdown but grouped by statement (Balance Sheet, Income Statement, etc.) and then by category (Current Assets, Non-Current Assets, etc.). Each item shows the line item name. Search filters across all groups. Selected item shows the line item name with a small statement abbreviation badge (BS, IS, CF, EQ).

**Where used:** Account mapping page (manual mapping), trial balance expanded row (inline mapping).

---

### 2.3.9 ApprovalStamp

**Purpose:** Displays who performed an action and when, used for audit trail provenance.

**Props/inputs:**
- `action`: string (e.g., "Prepared by", "Approved by", "Certified by", "Posted by")
- `userName`: string
- `timestamp`: string (ISO datetime)
- `role`: string (optional)

**Visual description:** Single horizontal line of gray text. Format: "[Action]: [userName] | [formatted timestamp]". If role provided, shown as a small badge after the name. Timestamp formatted as "MMM DD, YYYY h:mm AM/PM". Subtle, not prominent -- this is informational provenance, not a call to action.

**Where used:** Reconciliation detail (prepared/approved), JE detail (approval history), certification artifact, variance explanations (approved).

---

### 2.3.10 EmptyState

**Purpose:** Placeholder content when a page or section has no data.

**Props/inputs:**
- `icon`: string (icon name)
- `title`: string (e.g., "No journal entries yet")
- `description`: string (e.g., "Create a journal entry or apply a template to get started.")
- `action`: { label, onClick, href } (optional CTA button)

**Visual description:** Centered vertically and horizontally in the available space. Large gray icon at top (48px). Title in white text below (18px). Description in gray text below (14px). If action provided: primary button below the description. The entire composition is compact and centered, not full-page.

**Where used:** Every page and section that can be empty: portfolio (no entities), trial balance (no GL), adjustments (no JEs), reconciliation (no recons), variance (no statements).

---

### 2.3.11 ProgressBar

**Purpose:** Visual indicator of completion progress.

**Props/inputs:**
- `current`: number
- `total`: number
- `size`: sm | md
- `showLabel`: boolean (show "X of Y" text)
- `color`: "default" (primary blue) | "success" (green when 100%)

**Visual description:** Thin horizontal bar (sm = 4px, md = 8px). Background is dark gray. Fill is primary color, width proportional to current/total. Animates smoothly when value changes. At 100%, fill turns green if color is "success". If showLabel: text "[current] of [total]" appears to the right of the bar.

**Where used:** Portfolio entity cards, page headers with progress, gate checklist summary.

---

### 2.3.12 EntityCard

**Purpose:** Card representing a single entity on the portfolio dashboard.

**Props/inputs:**
- `entityName`: string
- `currentPeriod`: { label, status, gatesPassing, gatesTotal }
- `priorPeriods`: array of { label, status }
- `onClick`: function

**Visual description:** Rectangular card with rounded corners, surface-colored background. Entity name as bold header. Below: current period label and StatusBadge. Progress bar showing gates passing / total. Gate count text below progress bar. Below that: prior periods as single-line items (period label + small status badge), collapsed after 2 visible. Bottom of card: "Open" button or link. Hover: subtle elevation increase (shadow).

**Where used:** Portfolio dashboard only.

---

### 2.3.13 ActivityFeed

**Purpose:** Chronological list of recent actions in a session.

**Props/inputs:**
- `events`: array of { timestamp, userName, description, type }
- `maxVisible`: number (default 10, shows "View all" link if more)

**Visual description:** Vertical list, no borders between items. Each item: timestamp in gray monospace (left, fixed width), user name in primary color (middle), description in white text (right, flexible). Events alternate with very subtle background tinting for readability. Newest events at top. If events exceed maxVisible, a "View full audit trail" link appears at the bottom.

**Where used:** Close Dashboard only.

---

### 2.3.14 CertificationArtifact

**Purpose:** Displays the cryptographic certification artifact after a period is certified.

**Props/inputs:**
- `certifiedBy`: string
- `certifiedAt`: string (ISO datetime)
- `sessionId`: string
- `snapshotHash`: string
- `signature`: string
- `auditChainCount`: number
- `auditChainVerified`: boolean
- `evidenceCount`: number
- `evidenceVerified`: boolean
- `artifactId`: string
- `locked`: boolean

**Visual description:** Card with gold border (2px). "CERTIFIED" header in gold text with a trophy or shield icon. Below: structured metadata in two columns (label left in gray, value right in white monospace). Hash and signature values truncated with "..." and a copy-to-clipboard button. Audit chain and evidence lines show counts with green check or red X. Below metadata: action buttons (Download Audit Binder, Verify Independently, Lock Period if not yet locked).

**Where used:** Review & Certify page (post-certification), portfolio dashboard (certified entity cards link here).

---

## 2.4 Form Components

### 2.4.1 JournalEntryForm

**Purpose:** Form for creating or editing a journal entry with debit/credit lines.

**Props/inputs:**
- `mode`: "create" | "edit"
- `initialData`: object (for edit mode)
- `accounts`: array (chart of accounts for dropdowns)
- `materialityThreshold`: number
- `onSaveDraft`: function
- `onSubmitForApproval`: function
- `onCancel`: function

**Visual description:** Modal (large, 800px wide) or full-page form. Description text input at top. Below: dynamic table of line items. Each row: AccountDropdown, debit money input, credit money input. Only one of debit/credit can have a value per row (enforced: entering debit clears credit and vice versa). "Add Line" button below the table adds a new empty row. Running totals row below: Total Debits, Total Credits, Difference. Difference shows green check when zero, red when non-zero. Memo textarea below totals (required, shows character count and minimum). Evidence section below memo (FileUploader inline variant). If total amount exceeds materiality threshold and no evidence attached: amber warning. Action buttons at bottom: "Cancel" (gray), "Save Draft" (outline), "Submit for Approval" (primary).

**Where used:** Adjustments page (new JE creation, edit draft JE).

---

### 2.4.2 ReconciliationForm

**Purpose:** The reconciliation workspace for a single account.

This is not a standalone component but rather the entire content of the Reconciliation Detail page (1.10). See that page specification for full detail. The form elements within it are: supporting balance inline edit, reconciling items dynamic list, evidence uploader, and action buttons.

---

## 2.5 Skeleton/Loading Components

### 2.5.1 SkeletonCard

**Purpose:** Loading placeholder for cards.

**Visual description:** Same dimensions as the card it replaces. Rounded corners, surface background color. Internal content replaced with animated gray rectangles (pulse/shimmer animation) approximating the card layout: a wide rectangle for title, a thin bar for progress, two short rectangles for metrics.

### 2.5.2 SkeletonTable

**Purpose:** Loading placeholder for tables.

**Props/inputs:**
- `rows`: number (default 5)
- `columns`: number

**Visual description:** Table header row with gray rectangles for column headers. Below: N rows of gray rectangles sized to approximate data cells. All rectangles have shimmer animation.

### 2.5.3 SkeletonForm

**Purpose:** Loading placeholder for forms and settings pages.

**Visual description:** Several horizontal pairs: gray rectangle (label width) on the left, longer gray rectangle (input width) on the right. Stacked vertically with spacing. Shimmer animation.

---

# Part 3: Interaction Patterns

---

## 3.1 Approval Workflow

The product has three approval flows. All follow the same visual pattern.

### 3.1.1 Journal Entry Approval Flow

```
DRAFT -> PROPOSED -> APPROVED -> POSTED
           |
           v
        REJECTED -> DRAFT (editable again)
```

**Step-by-step interaction:**

1. **Controller creates JE** in DRAFT status via the JE form. Can save and return later.
2. **Controller clicks "Submit for Approval"** -- JE status changes to PROPOSED. A toast confirms: "Journal entry submitted for approval." The JE row in the table shows "PROPOSED" badge in blue. The JE becomes read-only for the controller.
3. **Reviewer sees proposed JE** -- On the Adjustments page, the "Proposed" filter count increments. The JE row shows an "Approve" button (green) and "Reject" button (red). Reviewer can expand the JE to see all detail.
4. **Reviewer approves** -- Click "Approve". Status changes to APPROVED. ApprovalStamp appears: "Approved by [name] | [timestamp]". Toast: "Journal entry approved."
5. **Reviewer rejects** -- Click "Reject". A small inline form appears requesting a rejection reason (required text input). On submit: status changes to REJECTED. The JE returns to DRAFT and is editable by the controller. A red callout shows the rejection reason. Toast to controller: "Journal entry rejected. Reason: [reason]."
6. **Controller posts approved JE** -- Click "Post". Status changes to POSTED. The JE is now immutable. Toast: "Journal entry posted. Trial balance updated." The trial balance recalculates. Statements become stale.

**Visual cues at each stage:**
- DRAFT: gray badge, "Edit" and "Submit" buttons visible
- PROPOSED: blue badge, "Approve"/"Reject" visible to reviewer, read-only for controller
- APPROVED: green badge, "Post" visible to controller
- POSTED: filled green badge, no action buttons, lock icon
- REJECTED: red badge, rejection reason in red callout, "Edit" button re-enabled

### 3.1.2 Reconciliation Approval Flow

```
NOT_STARTED -> IN_PROGRESS -> COMPLETE -> APPROVED
```

**Steps:**
1. Controller enters supporting balance, adds reconciling items, uploads evidence.
2. Controller clicks "Complete Reconciliation" (only enabled when unexplained variance = $0.00 and evidence requirements met).
3. Reconciliation shows "Prepared by" stamp. Status: COMPLETE.
4. Reviewer (different user) clicks "Approve". Status: APPROVED. "Approved by" stamp appears.
5. Segregation of duties enforced: the "Approve" button is hidden for the user who completed the reconciliation. If only one user exists (setup phase), a warning is shown but approval is not blocked.

### 3.1.3 Variance Explanation Approval Flow

```
NEEDS_EXPLANATION -> EXPLAINED -> APPROVED
```

**Steps:**
1. Controller reviews AI-drafted explanation (or writes one manually).
2. Controller clicks "Approve Explanation" -- explanation is locked. ApprovalStamp appears.
3. "Revoke" option available (returns to EXPLAINED state for re-editing).

Note: Variance explanations do not require a separate reviewer in V1. The controller can self-approve. This is a deliberate design choice: variance explanations are narrative, not financial mutations, so segregation of duties is less critical.

---

## 3.2 Certification Ceremony

This is the most significant user interaction in the product. It must feel like signing a legal document.

### Step-by-step experience:

1. **Controller finishes all work.** All gates pass. Dashboard shows 11/11. Attention panel is empty or shows only green checks.

2. **Controller advances session to UNDER_REVIEW.** From the dashboard or from the Review & Certify page, controller clicks "Submit for Review." A confirmation dialog appears: "This will notify [reviewer name] that the close is ready for certification. You will not be able to make changes while the period is under review." Confirm -> status changes to UNDER_REVIEW. Controller now sees a blue banner on every page: "This period is under review."

3. **CFO/Reviewer navigates to Review & Certify page.** They see the full gate checklist, all green. Statement summary with cross-statement validation. They can click into any page to inspect detail (read-only access to all close data).

4. **CFO clicks "Certify [Period]."** The gold-accented button. A significant confirmation dialog appears:
   - Title: "Certify February 2026"
   - Attestation text (the 4 bullet points about reviewing data)
   - Warning: "This action creates a cryptographically signed, immutable certification artifact."
   - Two buttons: "Cancel" and "Certify" (gold)

5. **System re-validates.** After the CFO clicks "Certify," the UI shows a progress sequence:
   - "Re-validating all gates..." (each gate flashes briefly as it's checked, 1-2 seconds total)
   - "Computing snapshot hash..."
   - "Signing with Ed25519..."
   - "Recording to audit trail..."

6. **Certification complete.** The progress sequence finishes. The page transitions:
   - A gold banner sweeps in: "CERTIFIED"
   - The CertificationArtifact card appears with all cryptographic details
   - Confetti is explicitly NOT used. This is financial software. The gold accent and the weight of the artifact card convey significance without frivolity.
   - Toast: "Period certified successfully."

7. **Lock period (optional, separate action).** The CFO can click "Lock Period" on the artifact card. Confirmation dialog with text confirmation required: type "LOCK PERIOD" to confirm. After locking: status becomes LOCKED. A lock icon appears in the header. All data across all pages becomes permanently read-only. Toast: "Period locked. This action is irreversible."

### Visual design notes for certification:
- The gold accent color (#eab308) is reserved exclusively for certification-related elements. It appears nowhere else in the product. This makes it immediately recognizable.
- The attestation text uses a serif font for the legal feel, contrasting with the sans-serif used everywhere else.
- The artifact card has a subtle gold gradient border, not flat, to give it a "certificate" feel.
- Hash and signature values are displayed in full monospace with a slight letter-spacing increase for readability.

---

## 3.3 AI Content Presentation

All AI-generated content follows a strict visual and behavioral pattern to ensure the user always knows what is AI and what is system/human.

### Visual Distinction

| Characteristic | AI Content | System Content |
|---|---|---|
| Left border | Blue/purple (4px) | None |
| Background | Very slightly tinted (#1e2440 vs #1a2035) | Standard surface color |
| Label | Small "AI" badge, top-right corner | None |
| Source attribution | Always shown below content: "Generated by [engine name]" | None or "Computed by system" |
| Confidence indicator | Percentage badge when applicable | None |

### Behavioral Rules

1. **AI never auto-approves.** Every AI suggestion requires explicit human action (Accept, Approve, Confirm). There is no setting to enable auto-approval.

2. **AI is always editable.** Every AI-generated text (mapping suggestion, variance explanation) can be modified by the user before approval.

3. **AI shows provenance.** Variance explanations cite the specific journal entries that drove the change. Mapping suggestions show the confidence score and the pattern that triggered the suggestion.

4. **AI is regenerable.** Every AI-generated content has a "Regenerate" option that re-runs the AI. The previous content is replaced (not versioned in the UI, though versioned in the audit trail).

5. **AI loading states.** When AI is generating content:
   - Individual item: a shimmer animation inside the AIContentCard boundary, with text "Generating..."
   - Bulk operation (auto-map all, draft all explanations): a progress modal or inline tracker showing "Processing [M] of [N]..." with items appearing as they complete

6. **AI failures.** If AI fails to generate a suggestion:
   - Individual: the AIContentCard shows "Unable to generate suggestion. Try again or enter manually." with a "Retry" button and a manual input fallback.
   - Bulk: the progress tracker shows which items succeeded and which failed. Failed items are listed with "Retry" buttons.

---

## 3.4 Financial Table Behavior

### Sorting

- Default sort order is defined per page (e.g., trial balance by account code ascending, audit trail by timestamp descending, JEs by status then ID)
- Clicking a column header sorts by that column. First click: ascending. Second click: descending. Third click: returns to default sort.
- Active sort column shows a directional arrow in the header.
- Money columns sort numerically, not alphabetically.

### Drilling Down

- Expandable rows are indicated by a subtle right-facing chevron on the left side of the row.
- Clicking anywhere on the row (not just the chevron) toggles expansion.
- Expanded content slides down smoothly (200ms ease-out animation).
- Only one row can be expanded at a time (expanding a new row collapses the previous one). Exception: if a table is short (fewer than 10 rows), multiple can be open.
- Expanded content shows detail data relevant to that row (GL entries for a TB account, debit/credit lines for a JE, contributing entries for a variance).

### Filtering

- FilterPills component used for categorical filters (status, type).
- SearchInput used for text search (account name, description).
- Filters are combinable: e.g., search for "insurance" AND filter by "Unmapped".
- Active filters are reflected in the URL query string for shareability and back-button support.
- When filtered, the summary bar (if present) shows "Showing [M] of [N] [items]" and the filtered totals.

### Exporting

- Available on: Trial Balance, Financial Statements, Reconciliation List, Journal Entry List, Audit Trail.
- Export options: CSV (data tables), PDF (financial statements), Excel (data tables with formatting).
- Export respects current filters and sort order.
- Export button triggers immediate download. No modal or configuration step. The filename includes entity name, period, and export type (e.g., "Meridian_SaaS_Feb2026_TrialBalance.csv").

### Number Formatting Rules (Universal)

- All dollar amounts: monospace font, right-aligned, comma separators, exactly 2 decimal places, dollar sign prefix
- Negative amounts: parentheses notation -- ($1,234.56) -- not minus sign
- Zero amounts: $0.00 (not blank, not dash)
- Null/missing amounts: em-dash (--) in gray
- Percentages: 1 decimal place, no space before percent sign (12.3%)
- Counts: no decimal places, comma separators for thousands

---

## 3.5 Error Handling

### Error Hierarchy

Errors surface in four ways, used based on severity and scope:

| Method | When to Use | Visual | Dismissal |
|---|---|---|---|
| **Inline field error** | Form validation failure on a specific field | Red text below the field, red border on the field | Disappears when field value becomes valid |
| **Toast** | Transient errors (network timeout, save failure), non-blocking | Slide-in from top-right, 5-second auto-dismiss | Auto-dismiss or manual X |
| **Banner** | Page-level persistent state (stale data, under review, permission issues) | Full-width bar below the TopBar, colored by severity | Not dismissible (state-driven, disappears when state changes) |
| **Modal** | Blocking errors that require user acknowledgment (certification failed, data integrity issue) | Centered modal with overlay | User must click "OK" or "Retry" |

### Specific Error Scenarios

**Network errors:**
- API call fails: toast with "Unable to [action]. Check your connection and try again." Retry button in toast.
- API returns 500: toast with "Something went wrong. Try again or contact support." Include request ID in small text for support debugging.
- API returns 401: redirect to `/login` with toast "Your session has expired. Please sign in again."
- API returns 403: toast "You don't have permission to perform this action."

**Validation errors:**
- JE doesn't balance: inline under the totals row, "Debits must equal credits. Difference: $[amount]." Submit button disabled.
- Required field empty: inline under the field, "[Field name] is required." Submit button disabled.
- Materiality threshold exceeded without evidence: amber inline warning, not a blocking error on save-draft, but blocking on submit-for-approval.

**Data integrity errors:**
- Hash chain broken in audit trail: red banner, full-width, persistent: "ALERT: Audit trail integrity check failed. Contact support immediately." This is the highest-severity error in the product.
- Cross-statement tie failure: red text in the validation section of the statement, with specific details of what doesn't tie.
- Accounting equation failure (A != L+E): red validation result on the balance sheet, highly prominent.

**Optimistic UI and conflict handling:**
- Saving a reconciling item: optimistic update (item appears immediately), revert if API fails with toast error.
- Two users editing the same reconciliation: last-write-wins with a toast to the losing user: "This reconciliation was updated by [name]. Your page has been refreshed." The page re-fetches current data.
- Stale data: when navigating to a page, always fetch fresh data. No local caching of financial data beyond the React Query cache with short stale times (30 seconds for active close data).

---

## 3.6 Keyboard Navigation and Accessibility

### Keyboard Shortcuts (Global)

| Shortcut | Action |
|---|---|
| `?` | Show keyboard shortcut help overlay |
| `g` then `d` | Go to Dashboard |
| `g` then `t` | Go to Trial Balance |
| `g` then `m` | Go to Mapping |
| `g` then `r` | Go to Reconciliation |
| `g` then `a` | Go to Adjustments |
| `g` then `s` | Go to Statements |
| `g` then `v` | Go to Variance |
| `g` then `c` | Go to Review & Certify |
| `Esc` | Close modal/expanded row/dropdown |

### Focus Management

- Modals trap focus within themselves. Tab cycles through focusable elements. Esc closes.
- Expanding a table row moves focus to the first interactive element in the expanded content.
- After a toast appears, focus remains where it was (toasts are aria-live regions, not focus traps).
- After a form submission success, focus moves to the first element of the resulting state (e.g., after JE creation, focus moves to the new JE in the list).

### Screen Reader Considerations

- All StatusBadges include aria-label text (not just color: "Status: Approved" not just a green pill).
- Financial tables use proper `<table>` semantics with `<th>` scope attributes.
- The PipelineTracker uses `role="navigation"` with `aria-label="Close pipeline progress"`.
- AI content cards include `aria-label="AI-generated content"` to distinguish from system content.
- MoneyDisplay includes `aria-label` with the full unabbreviated amount.
- ConfirmationDialogs use `role="alertdialog"` with `aria-describedby` pointing to the message.

---

## 3.7 Responsive Behavior

### Breakpoint Strategy

| Breakpoint | Width | Target |
|---|---|---|
| Desktop (primary) | >= 1280px | Controller's primary workspace |
| Laptop | 1024px - 1279px | Slightly compressed, all features available |
| Tablet | 768px - 1023px | CFO review/approval on the go |
| Mobile | < 768px | Not a priority for V1, graceful degradation only |

### Per-Breakpoint Adaptations

**Desktop (>= 1280px):**
- SessionSidebar fully visible, 240px wide
- Financial tables show all columns
- Dashboard shows gate panel and summary panel side by side
- Statement rendering at full width

**Laptop (1024px - 1279px):**
- SessionSidebar collapses to icon-only mode (56px wide), expands on hover
- Financial tables may hide less-critical columns (e.g., hide "Type" on TB, show on expand)
- Dashboard panels stack vertically instead of side by side
- Everything functional, just tighter

**Tablet (768px - 1023px):**
- SessionSidebar becomes a hamburger menu overlay
- Tables become horizontally scrollable
- Approval buttons remain prominently sized (touch targets >= 44px)
- Review & Certify page remains fully functional (CFO approval use case)
- JE form takes full width

**Mobile (< 768px):**
- Banner: "Sabit is designed for desktop use. For the best experience, use a laptop or desktop computer."
- Core data is visible but editing is disabled
- External verification page (`/verify`) is fully responsive (auditor might verify on phone)

---

## 3.8 Loading and Transition Patterns

### Initial Page Load

Every page follows this sequence:
1. Layout renders immediately (sidebar, topbar, page header) with current data from React Query cache if available.
2. Skeleton content appears in the main content area.
3. API data loads. Skeletons are replaced with real content in a single swap (no progressive item-by-item loading that causes layout shifts).
4. If data load takes more than 3 seconds: a subtle spinner appears in the page header area. No full-page loading overlay.

### Navigation Transitions

- Sidebar navigation: instant swap of main content area. Sidebar remains static. Skeleton appears immediately in the new page content area.
- No page-level transition animations. This is a data-dense professional tool; snappy navigation is more important than smooth transitions.
- Browser back/forward works correctly (URL-based routing, filter state in query params).

### Long-Running Operations

Operations that take more than 2 seconds:
- Statement generation: progress indicator in the page header. "Generating..." text. Button disabled.
- AI operations (auto-map, draft explanations): progress tracker showing items completed / total. Individual items update as they complete.
- File upload: progress bar within the FileUploader component showing upload percentage.
- Certification: step-by-step progress sequence (see Certification Ceremony, section 3.2).

### Polling and Real-Time Updates

- Long-running AI operations: poll every 2 seconds for status updates.
- Two users on the same session: no real-time sync in V1. Data refreshes on page navigation and on explicit user action (save, approve, etc.).
- Stale data detection: after any mutation (POST/PUT/DELETE), invalidate related React Query caches so the next navigation to those pages fetches fresh data.

---

# Appendix A: Page Map Summary

| # | Page | URL | Persona | Key Action |
|---|---|---|---|---|
| 1 | Login | `/login` | All | Authenticate |
| 2 | Registration | `/register` | New user | Create account |
| 3 | Onboarding | `/onboarding` | New user | Set up entity |
| 4 | Portfolio | `/portfolio` | All authenticated | Select entity/period |
| 5 | Close Dashboard | `/close/[sessionId]/dashboard` | Controller, CFO | Monitor close progress |
| 6 | GL Upload | `/close/[sessionId]/upload` | Controller | Upload general ledger |
| 7 | Trial Balance | `/close/[sessionId]/trial-balance` | Controller, CFO | View/verify balances |
| 8 | Account Mapping | `/close/[sessionId]/mapping` | Controller | Classify accounts |
| 9 | Reconciliation List | `/close/[sessionId]/reconciliation` | Controller, CFO | Monitor recon progress |
| 10 | Reconciliation Detail | `/close/[sessionId]/reconciliation/[reconId]` | Controller, CFO | Reconcile single account |
| 11 | Adjustments | `/close/[sessionId]/adjustments` | Controller, CFO | Manage JEs and templates |
| 12 | Financial Statements | `/close/[sessionId]/statements` | Controller, CFO | View/generate statements |
| 13 | Variance Analysis | `/close/[sessionId]/variance` | Controller, CFO | Explain material changes |
| 14 | Review & Certify | `/close/[sessionId]/review` | CFO (certify), Controller (view) | Certify the close |
| 15 | Audit Trail | `/close/[sessionId]/audit-trail` | All | Inspect audit history |
| 16 | External Verification | `/verify`, `/verify/[artifactId]` | External Auditor | Verify certification |
| 17 | Settings (7 tabs) | `/settings/*` | Admin, Controller | Configure entity |

---

# Appendix B: Component Inventory

| # | Component | Type | Used On |
|---|---|---|---|
| 1 | TopBar | Layout | All authenticated pages |
| 2 | SessionSidebar | Layout | All close session pages |
| 3 | PageHeader | Layout | All close session pages |
| 4 | StatusBadge | Display | Everywhere |
| 5 | FinancialTable | Display | TB, Recon, Adjustments, Variance, Audit |
| 6 | StatementRenderer | Display | Statements page |
| 7 | MoneyDisplay | Display | Everywhere with dollar amounts |
| 8 | PercentChange | Display | Variance, Dashboard |
| 9 | GateChecklist | Display | Dashboard, Review & Certify |
| 10 | PipelineTracker | Display | Dashboard |
| 11 | AIContentCard | Interactive | Mapping, Variance |
| 12 | FileUploader | Interactive | GL Upload, Recon Detail, Adjustments |
| 13 | ConfirmationDialog | Interactive | Certify, Lock, Delete, Destructive actions |
| 14 | Toast | Interactive | Every page |
| 15 | SearchInput | Interactive | TB, Audit Trail, Dropdowns |
| 16 | FilterPills | Interactive | TB, Adjustments, Variance, Audit |
| 17 | AccountDropdown | Interactive | JE Form, TB inline mapping |
| 18 | TaxonomyDropdown | Interactive | Mapping page, TB inline mapping |
| 19 | ApprovalStamp | Display | Recon Detail, JE Detail, Variance, Certification |
| 20 | EmptyState | Display | Every page/section with possible empty state |
| 21 | ProgressBar | Display | Portfolio cards, Page headers, Gate checklist |
| 22 | EntityCard | Display | Portfolio dashboard |
| 23 | ActivityFeed | Display | Close Dashboard |
| 24 | CertificationArtifact | Display | Review & Certify |
| 25 | JournalEntryForm | Form | Adjustments page |
| 26 | SkeletonCard | Loading | Card-based pages |
| 27 | SkeletonTable | Loading | Table-based pages |
| 28 | SkeletonForm | Loading | Settings pages |

---

# Appendix C: Role-Permission Matrix

| Action | Controller | CFO/Reviewer | PE Partner | External Auditor |
|---|---|---|---|---|
| View portfolio | Own entities | Own entities | All entities | N/A |
| Create entity | Yes | No | No | No |
| Upload GL | Yes | No | No | No |
| Map accounts | Yes | No (view only) | No (view only) | N/A |
| Complete reconciliation | Yes | No | No | N/A |
| Approve reconciliation | No | Yes | No | N/A |
| Create/edit JE | Yes | No | No | N/A |
| Submit JE for approval | Yes | No | No | N/A |
| Approve/reject JE | No | Yes | No | N/A |
| Post JE | Yes (after approval) | Yes (after approval) | No | N/A |
| Generate statements | Yes | Yes | No | N/A |
| Draft variance explanation | Yes | No | No | N/A |
| Approve variance explanation | Yes | Yes | No | N/A |
| Submit for review | Yes | No | No | N/A |
| Certify period | No | Yes | No | N/A |
| Lock period | No | Yes | No | N/A |
| View audit trail | Yes | Yes | Yes (read-only) | N/A |
| Verify certification | N/A | N/A | N/A | Yes (no login) |
| Manage settings | Yes (admin) | No | No | N/A |
| Manage team | Yes (admin) | No | No | N/A |

---

# Appendix D: Session State Transition Rules

```
OPEN
  |
  v  (GL uploaded, any work begins)
IN_PROGRESS
  |
  v  (Controller clicks "Submit for Review", all gates pass)
UNDER_REVIEW
  |
  +---> (CFO reopens with reason) ---> IN_PROGRESS
  |
  v  (CFO certifies, all gates re-validated)
CERTIFIED
  |
  v  (CFO locks, irreversible)
LOCKED
```

**UI behavior per state:**

| State | Controller Can | CFO Can | Visual Indicator |
|---|---|---|---|
| OPEN | Upload GL, begin work | View | Gray "OPEN" badge |
| IN_PROGRESS | All editing actions | View, approve JEs/recons | Blue "IN PROGRESS" badge |
| UNDER_REVIEW | View only | Approve, certify, reopen | Amber "UNDER REVIEW" badge + banner |
| CERTIFIED | View only | Lock, download artifacts | Gold "CERTIFIED" badge + gold banner |
| LOCKED | View only | View only | Gold "LOCKED" badge with lock icon |


---

# SECTION C: UI DESIGN SYSTEM & VISUAL SPECIFICATION



# Sabit Design System & UI Specification

---

## 1. DESIGN SYSTEM

### 1.1 Color Palette

The palette is built around a cool-neutral dark foundation with a sharp blue primary that conveys precision and trust. Warm accents are used sparingly to draw attention to actions and AI-generated content.

#### Primary Colors

| Token | Hex | Usage |
|---|---|---|
| `primary-50` | `#EFF6FF` | Primary tint on light surfaces (rare) |
| `primary-100` | `#DBEAFE` | Hover backgrounds for primary elements |
| `primary-200` | `#BFDBFE` | Selected state backgrounds |
| `primary-300` | `#93C5FD` | Secondary text links |
| `primary-400` | `#60A5FA` | Active interactive elements |
| `primary-500` | `#3B82F6` | Primary brand color, primary buttons, focus rings |
| `primary-600` | `#2563EB` | Primary button hover |
| `primary-700` | `#1D4ED8` | Primary button active/pressed |
| `primary-800` | `#1E40AF` | Deep accent for headers |
| `primary-900` | `#1E3A8A` | Darkest primary, used in gradients |

#### Accent Colors

| Token | Hex | Usage |
|---|---|---|
| `accent-amber-400` | `#FBBF24` | AI-generated content indicator, attention markers |
| `accent-amber-500` | `#F59E0B` | AI badge backgrounds, hover state |
| `accent-amber-300` | `#FCD34D` | AI sparkle icon fills |
| `accent-violet-400` | `#A78BFA` | Certification and signature elements |
| `accent-violet-500` | `#8B5CF6` | Certification badge, digital seal |

#### Background Colors (Dark Theme Primary)

| Token | Hex | Usage |
|---|---|---|
| `bg-base` | `#0B0F1A` | Application root background |
| `bg-surface-1` | `#111827` | Primary card and panel background |
| `bg-surface-2` | `#1F2937` | Elevated cards, modals, dropdowns |
| `bg-surface-3` | `#374151` | Hover states on surface-1, input backgrounds |
| `bg-overlay` | `#000000B3` | Modal overlay (70% opacity black) |
| `bg-sidebar` | `#0D1117` | Sidebar navigation background |

#### Border Colors

| Token | Hex | Usage |
|---|---|---|
| `border-subtle` | `#1F2937` | Default borders between sections |
| `border-default` | `#374151` | Input borders, card outlines |
| `border-strong` | `#4B5563` | Emphasized borders, active input borders |
| `border-focus` | `#3B82F6` | Focus ring color (2px solid) |

#### Text Colors

| Token | Hex | Contrast on bg-surface-1 | Usage |
|---|---|---|---|
| `text-primary` | `#F9FAFB` | 15.4:1 | Headlines, primary content, financial totals |
| `text-secondary` | `#D1D5DB` | 10.9:1 | Body text, descriptions |
| `text-tertiary` | `#9CA3AF` | 6.3:1 | Labels, captions, timestamps |
| `text-muted` | `#6B7280` | 4.6:1 | Placeholder text, disabled labels (AA for large text only) |
| `text-inverse` | `#111827` | N/A | Text on light/colored backgrounds |
| `text-link` | `#60A5FA` | 7.1:1 | Interactive text links |

#### Status Colors

All status colors are calibrated for dark backgrounds. Each has a background tint, a text/icon foreground, and a border variant.

| Status | Foreground | Background | Border | Usage |
|---|---|---|---|---|
| Success | `#34D399` | `#064E3B` | `#065F46` | Reconciled, approved, balanced, certified |
| Warning | `#FBBF24` | `#78350F` | `#92400E` | Pending review, minor variance, AI suggestion |
| Error | `#F87171` | `#7F1D1D` | `#991B1B` | Unreconciled, rejected, material variance, out of balance |
| Info | `#60A5FA` | `#1E3A8A` | `#1D4ED8` | Informational notices, tips, system messages |
| Neutral | `#9CA3AF` | `#374151` | `#4B5563` | Draft, not started, inactive |

### 1.2 Typography Scale

**Primary Font Family:** Inter (Variable). Chosen for its excellent legibility at small sizes, tabular number support, and professional character.

**Monospace Font Family:** JetBrains Mono. Used exclusively for financial figures, account numbers, and any numeric data in tables.

#### Type Scale

| Token | Size | Line Height | Weight | Letter Spacing | Usage |
|---|---|---|---|---|---|
| `display-lg` | 36px / 2.25rem | 44px / 2.75rem | 700 | -0.025em | Page titles (rarely used) |
| `display-sm` | 30px / 1.875rem | 38px / 2.375rem | 700 | -0.025em | Section headers on dashboards |
| `heading-1` | 24px / 1.5rem | 32px / 2rem | 600 | -0.02em | Page-level headings |
| `heading-2` | 20px / 1.25rem | 28px / 1.75rem | 600 | -0.015em | Card titles, section headings |
| `heading-3` | 16px / 1rem | 24px / 1.5rem | 600 | -0.01em | Subsection headings |
| `body-lg` | 16px / 1rem | 24px / 1.5rem | 400 | 0 | Primary body text |
| `body-md` | 14px / 0.875rem | 20px / 1.25rem | 400 | 0 | Secondary body, table cells |
| `body-sm` | 12px / 0.75rem | 16px / 1rem | 400 | 0.01em | Captions, timestamps, helper text |
| `label` | 12px / 0.75rem | 16px / 1rem | 500 | 0.05em | Form labels, column headers (uppercase) |
| `mono-lg` | 16px / 1rem | 24px / 1.5rem | 500 | -0.02em | Financial totals, grand totals |
| `mono-md` | 14px / 0.875rem | 20px / 1.25rem | 400 | -0.02em | Standard financial figures |
| `mono-sm` | 12px / 0.75rem | 16px / 1rem | 400 | -0.01em | Small numeric references |

**Tabular Numbers:** All instances of JetBrains Mono must use `font-variant-numeric: tabular-nums` to ensure decimal-aligned columns.

### 1.3 Spacing Scale

Built on an 8px base grid. 4px is permitted only for tight internal component spacing (icon-to-label gaps, badge padding).

| Token | Value | Usage |
|---|---|---|
| `space-0` | 0px | Reset |
| `space-0.5` | 2px | Micro adjustments (icon optical alignment) |
| `space-1` | 4px | Internal component padding (badge, tag) |
| `space-2` | 8px | Tight spacing: icon-to-text, inline element gaps |
| `space-3` | 12px | Compact padding: table cell padding, small card padding |
| `space-4` | 16px | Default padding: card inner padding, form field spacing |
| `space-5` | 20px | Medium gaps between related groups |
| `space-6` | 24px | Section padding, gap between card groups |
| `space-8` | 32px | Large section spacing |
| `space-10` | 40px | Page-level section separation |
| `space-12` | 48px | Major layout gaps |
| `space-16` | 64px | Page top/bottom margins |
| `space-20` | 80px | Hero section spacing |
| `space-24` | 96px | Maximum layout spacing |

### 1.4 Border Radius Scale

| Token | Value | Usage |
|---|---|---|
| `radius-none` | 0px | Tables, full-bleed elements |
| `radius-sm` | 4px | Badges, tags, small chips |
| `radius-md` | 6px | Buttons, inputs, small cards |
| `radius-lg` | 8px | Cards, panels, dropdowns |
| `radius-xl` | 12px | Modals, large cards |
| `radius-2xl` | 16px | Feature callouts, hero cards |
| `radius-full` | 9999px | Avatars, circular indicators, pills |

### 1.5 Shadow Scale

Shadows in dark themes are subtle and rely more on border/background differentiation. These use black with varying opacity.

| Token | Value | Usage |
|---|---|---|
| `shadow-xs` | `0 1px 2px 0 rgba(0,0,0,0.3)` | Subtle lift for inline elements |
| `shadow-sm` | `0 2px 4px 0 rgba(0,0,0,0.3)` | Cards at rest |
| `shadow-md` | `0 4px 8px -1px rgba(0,0,0,0.4), 0 2px 4px -2px rgba(0,0,0,0.3)` | Elevated cards, dropdowns |
| `shadow-lg` | `0 8px 16px -2px rgba(0,0,0,0.5), 0 4px 8px -4px rgba(0,0,0,0.4)` | Modals, popovers |
| `shadow-xl` | `0 16px 32px -4px rgba(0,0,0,0.6), 0 8px 16px -8px rgba(0,0,0,0.4)` | Full-screen takeovers |
| `shadow-glow-primary` | `0 0 16px 2px rgba(59,130,246,0.15)` | Focus glow on primary actions |
| `shadow-glow-success` | `0 0 12px 2px rgba(52,211,153,0.12)` | Certification seal glow |

### 1.6 Icon System

**Library:** Lucide Icons (MIT-licensed fork of Feather Icons with expanded set).

**Style Rules:**
- Default stroke width: 1.5px (not 2px; the thinner stroke feels more refined and financial-grade)
- Size tokens: 16px (inline/table), 20px (buttons/nav), 24px (section headers), 32px (empty states), 48px (hero illustrations)
- Color: Icons inherit `currentColor` from their parent text color token
- Never use filled icons in the main interface. Reserve filled variants only for active navigation states (filled circle dot for active nav item)
- AI-related icons: Use the `Sparkles` icon from Lucide in `accent-amber-400` to consistently denote AI-generated content across the product

**Custom Icons (to be designed):**
- Sabit logo mark: An abstract geometric "S" that suggests a balanced ledger (two mirrored angular shapes)
- Digital certification seal: A shield with a checkmark, rendered as a detailed SVG with the violet accent gradient
- Verification badge: A circular seal with a signature wave line

---

## 2. KEY SCREEN DESCRIPTIONS

### 2.1 Login

**Layout:** Full viewport, split into two halves horizontally on desktop. On mobile, the left decorative panel is hidden.

**Left Panel (50% width):**
- Background: A subtle gradient from `#0B0F1A` to `#111827` running top-left to bottom-right
- Centered vertically: The Sabit logo mark at 64px, rendered in `primary-500` with a subtle `shadow-glow-primary`
- Below the logo (space-6 gap): The wordmark "Sabit" in `display-lg`, `text-primary`, weight 700
- Below the wordmark (space-3 gap): A tagline in `body-lg`, `text-tertiary`: "Financial Close Engine"
- In the bottom-left corner (space-8 from edges): A rotating set of trust indicators in `body-sm`, `text-muted` -- "SOC 2 Type II Certified" with a small shield icon, cycling every 5 seconds with a fade transition

**Right Panel (50% width):**
- Background: `bg-surface-1`
- Content centered both vertically and horizontally within the panel, constrained to a 400px max-width column
- Heading: "Sign in to Sabit" in `heading-1`, `text-primary`
- Below heading (space-2): "Enter your credentials to continue" in `body-md`, `text-tertiary`
- Below description (space-8): Email input field. Label "Email address" in `label` style (uppercase, `text-tertiary`, 500 weight). Input: 48px height, `bg-surface-3` background, `border-default` border, `radius-md`, `body-md` text. Focus state: `border-focus` blue border with `shadow-glow-primary`
- Below email (space-4): Password input field, same styling. Includes a visibility toggle icon (Eye/EyeOff from Lucide, 20px, `text-muted`) right-aligned inside the input
- Below password (space-2, right-aligned): "Forgot password?" link in `body-sm`, `text-link`
- Below forgot password (space-6): Primary button "Sign In" -- full width, 48px height, `primary-500` background, `text-inverse` text in `body-md` weight 600, `radius-md`. Hover: `primary-600`. Active: `primary-700` with slight inset shadow
- Below button (space-4): Divider line with centered text "or" in `body-sm`, `text-muted`, with `border-subtle` lines extending to each side
- Below divider (space-4): SSO button -- full width, 48px height, `bg-surface-3` background, `border-default` border, `text-secondary` text. Icon for SSO provider on the left. Text: "Continue with SSO"
- Bottom of panel (space-12 below SSO): "Need access? Contact your administrator" in `body-sm`, `text-muted`

**Eye flow:** Logo catches the eye on the left; the eye moves right to the form; the "Sign In" button is the strongest visual element due to blue fill against the dark background.

**Responsive (below 1024px):** Left panel hidden entirely. Right panel becomes full viewport. Logo and wordmark move above the form with space-8 below.

---

### 2.2 Controller Dashboard (During Active Close)

**Layout:** Fixed left sidebar (256px wide) plus main content area. Top bar within the main content area (64px height).

**Sidebar:**
- Background: `bg-sidebar` (`#0D1117`)
- Top: Sabit logo mark (32px) plus wordmark "Sabit" in `heading-3`, `text-primary`. Padding: space-4 all sides
- Below logo (space-6): Period selector dropdown showing "March 2026 Close" in `body-md`, `text-primary`, with a ChevronDown icon. Background `bg-surface-2`, `radius-md`, padding space-3. The month and year are bold; "Close" is regular weight
- Below period selector (space-6): Navigation list. Each item: 40px height, `radius-md`, padding-left space-3. Icon (20px, `text-tertiary`) plus label in `body-md`, `text-secondary`. Hover: `bg-surface-3`. Active: `bg-primary-500/10` background with `text-primary` text and `primary-400` icon, plus a 3px left border in `primary-500`
- Nav items in order: Dashboard (LayoutDashboard icon), GL Upload (Upload icon), Account Mapping (GitBranch icon), Trial Balance (Table icon), Reconciliations (CheckSquare icon), Adjusting Entries (FilePen icon), Financial Statements (FileText icon), Certification (Shield icon)
- Bottom of sidebar: User avatar (32px circle with initials, `bg-surface-3`, `text-secondary`), name in `body-sm`, `text-primary`, role "Controller" in `body-sm`, `text-muted`. Settings gear icon (16px) to the right

**Top Bar:**
- Background: `bg-surface-1` with a bottom border `border-subtle`
- Left side: Breadcrumb in `body-sm`, `text-tertiary`: "March 2026 Close" > "Dashboard"
- Right side: Close status pill -- "Day 3 of 5" in a pill shape (`radius-full`, padding space-1 horizontal space-2), `bg-surface-3`, `body-sm`, `text-secondary`. A small clock icon (16px) left of the text. To the right of the pill: notification bell icon (20px, `text-tertiary`) with a red dot indicator (8px circle, `error` foreground color, absolutely positioned top-right of the icon)

**Main Content (padding space-6 all sides):**

**Row 1: Close Progress Header**
- Left: "March 2026 Close" in `heading-1`, `text-primary`
- Right: "Close Checklist" button, secondary style (ghost button: `text-secondary`, `border-default`, `radius-md`, 36px height)
- Below heading (space-2): A horizontal progress bar. Full width, 8px height, `radius-full`. Track: `bg-surface-3`. Fill: gradient from `primary-500` to `primary-400`, currently at 60%. Below the bar (space-1): "5 of 8 tasks complete" in `body-sm`, `text-tertiary`

**Row 2: Status Cards (space-6 below, four cards in a row, equal width, gap space-4)**

Each card: `bg-surface-1`, `radius-lg`, `border-subtle` border, padding space-4, height approximately 120px.

Card 1 -- "Trial Balance": Status badge "Balanced" in success foreground on success background, `radius-sm`, `body-sm` weight 500. Large number: "$14,238,491" in `mono-lg`, `text-primary`. Label below: "Total Debits = Credits" in `body-sm`, `text-tertiary`. A small green CheckCircle icon (16px) in the top-right corner.

Card 2 -- "Reconciliations": Status badge "In Progress" in warning foreground on warning background. "23 / 31" in `mono-lg`, `text-primary`. Label: "Accounts Reconciled" in `body-sm`, `text-tertiary`. A CircularProgress indicator (24px) top-right showing 74% in `primary-400`.

Card 3 -- "Adjusting Entries": Status badge "Pending Approval" in warning foreground. "7" in `mono-lg`, `text-primary`. Label: "Entries Awaiting Review" in `body-sm`, `text-tertiary`. AlertCircle icon (16px, `accent-amber-400`) top-right.

Card 4 -- "Variances": Status badge "3 Material" in error foreground on error background. "3" in `mono-lg`, `text-primary`. Label: "Material Variances Flagged" in `body-sm`, `text-tertiary`. AlertTriangle icon (16px, `error` foreground) top-right.

**Row 3: Two-Column Layout (space-6 below, gap space-4)**

**Left Column (60% width): Recent Activity Feed**
- Card with heading "Recent Activity" in `heading-3`, `text-primary`, padding space-4
- List of activity items, each separated by `border-subtle` divider. Each item: 48px min-height, padding space-3 vertical
- Each item has: A colored dot (8px circle) on the left indicating type (blue for system, green for approval, amber for AI). Next to dot: description in `body-md`, `text-secondary` ("Sarah approved AJE #042"). Right-aligned: timestamp "2 min ago" in `body-sm`, `text-muted`
- Maximum 8 items shown, with "View all activity" link at bottom in `body-sm`, `text-link`

**Right Column (40% width): Close Calendar / Timeline**
- Card with heading "Close Timeline" in `heading-3`, `text-primary`, padding space-4
- Vertical timeline with 5 milestones. Each milestone: a circle (12px) on a vertical line (2px, `border-default`). Completed milestones: circle filled `success` foreground, text in `text-secondary`. Current milestone: circle filled `primary-500` with `shadow-glow-primary`, text in `text-primary`, weight 600. Future milestones: circle outline `border-default`, text in `text-muted`
- Milestone labels: "GL Upload", "Account Mapping", "Reconciliation", "AJE Review", "Certification"
- Date below each label in `body-sm`, `text-muted`

**Eye flow:** The progress bar is the dominant horizontal element and draws the eye first. Then the four status cards provide a snapshot. The variance card in error red pulls attention to unresolved issues.

---

### 2.3 GL Upload Flow

**Layout:** Full main content area (sidebar remains). This is a multi-step wizard.

**Step Indicator:**
- Horizontal stepper at top of content area, centered, max-width 600px
- Three steps: "Upload File", "Map Columns", "Confirm Import"
- Each step: circle (32px) with step number in `body-md`, connected by a line (2px). Completed steps: circle filled `success` foreground, line solid `success`. Current step: circle filled `primary-500`, number in `text-inverse`. Future steps: circle outlined `border-default`, number in `text-muted`, line dashed `border-default`

**Step 1 -- Upload File (centered content, max-width 640px):**
- Heading: "Upload General Ledger" in `heading-1`, `text-primary`, centered
- Subheading (space-2): "Export your GL from any accounting system as CSV, Excel, or QBO file" in `body-md`, `text-tertiary`, centered
- Below (space-8): Drop zone. A large dashed-border rectangle (`border-strong`, 2px dashed, `radius-xl`), 280px height, `bg-surface-2` background. Centered inside: Upload cloud icon (48px, `text-muted`), "Drag and drop your file here" in `body-lg`, `text-secondary`, and "or browse files" as a `text-link` clickable element below. Accepted formats noted below: ".csv, .xlsx, .xls, .qbo" in `body-sm`, `text-muted`
- Hover/drag-active state: border changes to `primary-500` solid, background gets a `primary-500` at 5% opacity tint, icon changes to `primary-400`
- Below drop zone (space-4): "Maximum file size: 50 MB" in `body-sm`, `text-muted`, centered
- When file is selected: Drop zone collapses to a single row showing file icon (FileSpreadsheet, 20px, `text-tertiary`), filename in `body-md`, `text-primary`, file size in `body-sm`, `text-muted`, and an X button to remove. A green check animation briefly plays
- Below file row (space-6): "Continue" primary button, right-aligned, 44px height

**Step 2 -- Map Columns:**
- Heading: "Map Your Columns" in `heading-2`, `text-primary`
- Subheading: "We detected your columns automatically. Verify the mappings below." in `body-md`, `text-tertiary`
- AI indicator: A small pill reading "AI Mapped" with the Sparkles icon (16px, `accent-amber-400`) and text in `accent-amber-400`, `radius-full`, `bg-surface-3`, positioned right of the subheading
- Below (space-6): A table with two columns. Left column: "Your File Column" showing the header names from the uploaded file in `mono-md`, `text-secondary`. Right column: "Sabit Field" showing a dropdown select for each row. AI-matched fields have the Sparkles icon (12px, `accent-amber-300`) next to the selected value. Unmatched rows have the dropdown in a warning border state
- Required fields marked with a red asterisk: Account Number, Account Name, Debit, Credit (or Net Amount), Date
- Preview row below each mapping: shows a sample value from the data in `mono-sm`, `text-muted`, preceded by "e.g." in italic
- Below table (space-6): "Back" ghost button on left, "Continue" primary button on right

**Step 3 -- Confirm Import:**
- Heading: "Confirm Import" in `heading-2`, `text-primary`
- Summary card (`bg-surface-2`, `radius-lg`, padding space-6): Shows file name, row count, date range detected, total debits, total credits, and whether debits equal credits (shown as a green "Balanced" badge or red "Out of Balance" warning)
- If out of balance: A prominent error banner below the summary card. `error` background, `radius-md`, padding space-4. AlertTriangle icon, "Debits and credits do not balance. Difference: $X,XXX.XX" in `body-md`, `text-primary` (on the red background, text is the light error foreground color)
- Below summary (space-6): "Back" ghost button on left, "Import GL" primary button on right. If balanced, button is enabled. If not, button is still enabled but labeled "Import Anyway" with a warning icon, and shows a confirmation dialog on click

---

### 2.4 Account Mapping with AI Suggestions

**Layout:** Full main content area. Two-panel layout.

**Top Section:**
- Heading: "Account Mapping" in `heading-1`, `text-primary`
- Subheading: "Classify each account to the correct financial statement line item" in `body-md`, `text-tertiary`
- Right-aligned controls: A filter dropdown ("All Accounts" / "Unmapped" / "AI Suggested" / "Manually Mapped"), and a search input (Search icon, placeholder "Search accounts...", 40px height, 280px width)
- Below controls (space-3): Progress indicator: "142 of 156 accounts mapped" with an inline progress bar (120px wide, 4px height, `primary-500` fill)

**Main Table:**
- Full width table with alternating row backgrounds: odd rows `bg-surface-1`, even rows `bg-surface-1` with a 2% white overlay (effectively `#141C2B`)
- Column headers: `label` style (12px, uppercase, weight 500, `text-muted`, letter-spacing 0.05em). Bottom border `border-default` (1px). Height 40px. Padding space-3 horizontal
- Columns: Account Number (120px, left-aligned), Account Name (flexible, left-aligned), Current Classification (200px, left-aligned), AI Suggestion (200px, left-aligned), Confidence (100px, center-aligned), Actions (120px, right-aligned)

**Row Details:**
- Account Number: `mono-md`, `text-tertiary`
- Account Name: `body-md`, `text-primary`, weight 500
- Current Classification: If mapped, shows the statement and line item as a two-line cell. Statement in `body-sm`, `text-muted` ("Balance Sheet"). Line item in `body-md`, `text-secondary` ("Cash & Equivalents"). If unmapped, shows a dash in `text-muted`
- AI Suggestion: Shown in a special container with a left border (3px, `accent-amber-400`), padding-left space-2. The Sparkles icon (14px, `accent-amber-300`) precedes the suggestion text in `body-md`, `text-secondary`. If no suggestion, the cell is empty
- Confidence: A small horizontal bar (48px wide, 4px height, `radius-full`). High confidence (>90%): `success` foreground fill. Medium (70-90%): `accent-amber-400` fill. Low (<70%): `error` foreground fill. Percentage text below in `mono-sm`, `text-muted`
- Actions: "Accept" button (compact, 28px height, `radius-sm`, `success` foreground text, transparent background, `success` border on hover) if AI suggestion exists. "Edit" button (compact, ghost style, `text-link`). Both in `body-sm`

**Accepting an AI Suggestion:** When "Accept" is clicked, the row briefly flashes with a `success` background at 10% opacity. The Current Classification column updates. The AI Suggestion column fades and shows a small "Accepted" badge in `success` foreground, `body-sm`.

**Bulk Actions Bar:** When multiple rows are selected via checkboxes (leftmost column, not described above -- each row has a 16px checkbox), a floating bar appears at the bottom of the viewport. `bg-surface-2`, `shadow-lg`, `radius-lg`, padding space-3 horizontal, space-2 vertical, centered. Shows: "X accounts selected", "Accept All AI Suggestions" primary button, "Assign Classification" secondary button, "Clear Selection" ghost button.

**Eye flow:** The table dominates the view. The amber left-border on AI suggestions creates a vertical visual channel that immediately shows which accounts have recommendations. The confidence bars add a scannable quality indicator.

---

### 2.5 Trial Balance

**Layout:** Full main content area. This screen is fundamentally a financial data table and must prioritize readability and precision.

**Header Row:**
- Left: "Trial Balance" in `heading-1`, `text-primary`. Below: "As of March 31, 2026" in `body-md`, `text-tertiary`
- Right: Action buttons group -- "Export" button (secondary, Download icon), "Print" button (secondary, Printer icon), period comparison toggle: a segmented control with "Current Period" and "Comparative" options. `bg-surface-3`, `radius-md`. Active segment: `primary-500` background, `text-inverse`. Inactive: `text-secondary`

**Filter Bar (space-4 below header):**
- Horizontal row of filter pills: "All Accounts" (active, `primary-500` bg), "Assets", "Liabilities", "Equity", "Revenue", "Expenses". Each pill: `radius-full`, `body-sm`, padding space-1 vertical space-3 horizontal, `bg-surface-3` inactive, `text-secondary` inactive

**Trial Balance Table:**
- Full width, no horizontal scroll on desktop. The table has grouped sections
- Column Headers: Account Number (140px), Account Name (flexible), Debit (160px, right-aligned), Credit (160px, right-aligned). When comparative mode is on, two additional columns appear: Prior Debit (140px), Prior Credit (140px), and a Variance column (120px)
- Header row: `bg-surface-2`, `label` style, height 44px. A bottom border of 2px `border-strong`

**Section Groups:** Accounts are grouped by financial statement classification. Each group has:
- A group header row: `bg-surface-2` at 60% opacity. Account type name ("ASSETS", "LIABILITIES & EQUITY", "REVENUE", "EXPENSES") in `label` style, `text-tertiary`. The row spans full width with text left-aligned. A collapse/expand chevron icon (16px) on the far left
- Individual account rows: 40px height, padding space-3 horizontal. Account number in `mono-md`, `text-muted`. Account name in `body-md`, `text-secondary`. Debit/Credit amounts in `mono-md`, `text-primary`, right-aligned. Zero values shown as a dash in `text-muted`

**Subtotal Rows:** At the bottom of each group, a subtotal row:
- `bg-surface-2` at 30% opacity
- Label in `body-md`, weight 600, `text-secondary` ("Total Assets")
- Amounts in `mono-md`, weight 600, `text-primary`
- Top border: 1px solid `border-default`

**Grand Total Row:** At the very bottom:
- `bg-surface-2`
- Label in `body-lg`, weight 700, `text-primary` ("TOTAL")
- Amounts in `mono-lg`, weight 700, `text-primary`
- Top border: 2px solid `text-primary` (a bright white double-line effect achieved by a 2px border with 2px gap, then another 1px border -- this is the classic accounting double-underline, implemented as a top border 2px plus a second element or box-shadow trick)
- Below total: "Debits - Credits = $0.00" in `mono-sm`. If zero, in `success` foreground. If non-zero, in `error` foreground with bold weight

**Eye flow:** The eye is drawn to the grand total row at the bottom due to its visual weight. The section headers in uppercase create clear scan points. The right-aligned numbers create a strong vertical axis that the eye can scan quickly.

---

### 2.6 Reconciliation List and Detail

#### Reconciliation List View

**Header:**
- "Reconciliations" in `heading-1`, `text-primary`
- "March 2026 Close" in `body-md`, `text-tertiary`
- Right side: Progress ring (48px diameter, 3px stroke). Percentage in center in `mono-md`, `text-primary`. Ring shows `success` foreground for completed portion, `bg-surface-3` for remainder. "23 of 31 Complete" below ring in `body-sm`, `text-tertiary`

**Filter/Sort Bar (space-4 below):**
- Status filter tabs: "All" (31), "Reconciled" (23), "In Progress" (5), "Not Started" (3). Each tab shows count in parentheses. Active tab has bottom border 2px `primary-500`
- Right side: Sort dropdown ("Sort by: Status"), search input

**List Table:**
- Columns: Account (flexible), Balance (140px, right-aligned), Status (120px), Assignee (140px), Last Updated (140px), Actions (80px)
- Account: Account number in `mono-sm`, `text-muted` above account name in `body-md`, `text-primary`. Two lines within one cell
- Balance: `mono-md`, `text-primary`
- Status: A badge/pill. Reconciled: `success` foreground on success background, CheckCircle icon (14px). In Progress: `warning` foreground on warning background, Clock icon. Not Started: `neutral` foreground on neutral background, Circle icon
- Assignee: Avatar circle (24px) with initials plus name in `body-sm`, `text-secondary`
- Last Updated: `body-sm`, `text-muted`, relative time ("2 hours ago")
- Actions: ChevronRight icon (20px, `text-muted`), clickable row

**Clicking a row navigates to the detail view.**

#### Reconciliation Detail View

**Layout:** Back arrow and breadcrumb at top: "Reconciliations > 1010 - Cash - Operating Account". The heading is the account name in `heading-1`. Account number in `mono-md`, `text-muted` to the right of the heading.

**Top Summary Bar:** A horizontal card (`bg-surface-2`, `radius-lg`, padding space-4), displaying four data points in a row:
- GL Balance: `mono-lg`, `text-primary`, label in `body-sm`, `text-tertiary`
- Supporting Balance: `mono-lg`, `text-primary`, label below
- Difference: `mono-lg`, in `success` foreground if zero, `error` foreground if non-zero. Label below
- Status: Badge, same styling as list view but larger

**Reconciliation Workspace (space-6 below, two columns, gap space-4):**

**Left Column (55%): Reconciling Items Table**
- Card with heading "Reconciling Items" in `heading-3`
- "Add Item" button, secondary, top-right of card
- Table columns: Date, Description, Amount, Type (Timing/Permanent), Evidence
- Each row: Date in `mono-sm`, `text-muted`. Description in `body-md`, `text-secondary`. Amount in `mono-md` (positive in `text-primary`, negative in `error` foreground with parentheses). Type as a small badge. Evidence: Paperclip icon (16px) with count, or "None" in `text-muted`
- Bottom of table: "Net Reconciling Items" in `body-md` weight 600 with amount in `mono-md` weight 600

**Right Column (45%): Evidence Panel**
- Card with heading "Supporting Documents" in `heading-3`
- Upload area: Compact drop zone (120px height, dashed border `border-default`, "Drop files or click to upload" in `body-sm`)
- Below: List of uploaded documents. Each: File icon (FileText, 16px) colored by type (PDF red, Excel green, image blue), filename in `body-sm`, `text-secondary`, upload date in `body-sm`, `text-muted`, "View" link. Thumbnail preview on hover for images/PDFs

**Bottom Section: Sign-Off**
- A full-width bar at the bottom of the detail view. `bg-surface-2`, `radius-lg`, padding space-4. Left: "This reconciliation is complete and accurate." text with a checkbox. Right: "Submit Reconciliation" primary button, disabled until checkbox is checked. When submitted, button changes to a green "Submitted" badge with the submitter name and timestamp.

---

### 2.7 Financial Statements -- Income Statement View

**Layout:** Full main content area. This screen mimics a formal GAAP financial statement rendered on screen.

**Document Container:** Centered, max-width 900px. `bg-surface-1`, `radius-xl`, `shadow-md`, padding space-8 top, space-6 sides, space-8 bottom. This container should feel like a formal document -- generous whitespace, precise typography.

**Document Header:**
- Company name: "Acme Holdings, LLC" in `heading-2`, `text-primary`, centered
- Statement title: "CONSOLIDATED STATEMENT OF OPERATIONS" in `label` style (12px, uppercase, letter-spacing 0.08em, `text-tertiary`), centered, space-2 below
- Period: "For the Three Months Ended March 31, 2026" in `body-md`, `text-tertiary`, centered, space-1 below
- "(Unaudited)" in `body-sm`, `text-muted`, italic, centered
- Below header (space-6): A thin horizontal rule, 1px, `border-subtle`

**Column Headers (space-4 below rule):**
- Right-aligned over the numbers column: "Current Period" and "Prior Period" in `label` style, `text-muted`. If single period, just one column. The labels sit above a 1px `border-default` line

**Statement Body:**

Every line item follows this structure:
- Left-aligned: Line item name in `body-md`, `text-secondary`
- Right-aligned: Amount in `mono-md`, `text-primary`, tabular-aligned at the decimal point

**Specific hierarchy:**

Revenue Section:
- "Revenue" as section header in `body-md`, weight 600, `text-primary`, no indent
- Individual revenue line items: indented space-6 from left, `body-md`, `text-secondary`, `mono-md` amounts
- "Total Revenue" in `body-md`, weight 600, `text-secondary`. Amount in `mono-md`, weight 600. Top border 1px `border-default` above the total amount only (not full width -- the line extends only over the number column, approximately 160px)

Cost of Revenue Section:
- Same pattern as revenue

**"Gross Profit"** line: `body-md`, weight 600, `text-primary`. Amount in `mono-md`, weight 600, `text-primary`. Bottom border 1px `border-default` under the amount.

Operating Expenses Section:
- Same indented pattern for individual items
- "Total Operating Expenses" subtotal

**"Operating Income"** in `body-lg`, weight 600, `text-primary`. Amount in `mono-lg`, weight 600. This line has slightly more vertical space above it (space-4 instead of space-2).

Other Income/Expense section, then:

**"Income Before Income Taxes"**, then tax lines, then:

**"Net Income"** -- This is the grand total. `body-lg`, weight 700, `text-primary`. Amount in `mono-lg`, weight 700. The classic double-underline appears below the amount: two horizontal lines (1px each, `text-primary`) separated by 2px of space. This is the strongest visual signal on the page.

**Comparative Column:** When enabled, prior period numbers appear in a second right-aligned column, in `mono-md`, `text-muted`. Variance column (optional toggle): shows delta as amount and percentage. Favorable variances (revenue up, expense down) in `success` foreground. Unfavorable in `error` foreground. AI-flagged material variances have the Sparkles icon (12px, `accent-amber-400`) and the row gets a left border 3px `accent-amber-400`.

**AI Variance Tooltip:** Clicking a Sparkles icon on a material variance row opens a popover (`bg-surface-2`, `shadow-lg`, `radius-lg`, max-width 360px, padding space-4). Header: "AI Variance Analysis" with Sparkles icon. Body: The AI-drafted justification in `body-md`, `text-secondary`. A thin `accent-amber-400` left border on the popover. Footer: "Edit Justification" link and "Approve" button.

**Statement Footer (space-6 below last line):**
- Horizontal rule 1px `border-subtle`
- "The accompanying notes are an integral part of these financial statements." in `body-sm`, `text-muted`, italic, centered

**Toolbar (fixed bottom or top of document):**
- Statement selector tabs: "Income Statement" (active), "Balance Sheet", "Cash Flow", "Equity"
- Active tab: bottom border 2px `primary-500`, `text-primary`. Inactive: `text-muted`
- Right side: "Export PDF" button, "Print" button

---

### 2.8 Certification Ceremony

This screen is the climactic moment of the close process. It should feel significant and ceremonial.

**Layout:** Centered single-column layout, max-width 680px, vertically centered in the viewport if content fits.

**Pre-Certification State (Controller view):**

**Header:** Shield icon (48px, `accent-violet-400`) with subtle `shadow-glow-success` (but using violet). Below: "Certify Financial Close" in `display-sm`, `text-primary`, centered. Below (space-2): "March 2026 Close Period" in `body-lg`, `text-tertiary`, centered.

**Readiness Checklist (space-8 below):** A card, `bg-surface-2`, `radius-xl`, padding space-6.
- Title: "Close Readiness" in `heading-3`, `text-primary`
- A list of checklist items, each 48px height:
  - CheckCircle icon (20px, `success` foreground) or XCircle icon (20px, `error` foreground) on the left
  - Item text in `body-md`, `text-secondary`. Completed items: normal. Incomplete: `text-primary` weight 600
  - Items: "Trial Balance is balanced", "All accounts reconciled (31/31)", "Adjusting entries approved (12/12)", "Financial statements generated", "Material variances documented (3/3)"
  - Completed items have a subtle strikethrough or simply the green check. The overall card shows a progress state: if all items are green, the card border changes to `success` border color

**Certification Statement (space-6 below, only visible when all items complete):**
- A formal text block with a left border 3px `accent-violet-400`, `bg-surface-2`, `radius-lg`, padding space-4
- Text in `body-md`, `text-secondary`, line-height generous (28px): "I certify that the financial statements for the period ended March 31, 2026 have been prepared in accordance with GAAP, all material accounts have been reconciled with supporting evidence, all adjusting entries have been reviewed and approved, and the financial data is complete and accurate to the best of my knowledge."
- Below text (space-4): Checkbox with label "I have reviewed and agree to the above certification statement" in `body-md`, `text-primary`

**Sign Button (space-6 below):**
- Large primary button, full width of the card, 56px height, `radius-lg`. Text: "Sign & Certify" with a pen icon (Pen, 20px) to the left. `primary-500` background, `text-inverse`, `heading-3` typography. Disabled state until checkbox is checked: `bg-surface-3`, `text-muted`
- On hover when enabled: `primary-600` with `shadow-glow-primary`

**Post-Certification State (after signing):**
- The entire page transitions (300ms ease). The checklist card and certification text fade up and are replaced by:
- A large certification seal SVG (120px), the custom shield-with-checkmark icon, rendered in `accent-violet-400` with a subtle animated glow (pulsing `shadow-glow-success` but violet tinted, 2-second cycle, very subtle)
- Below seal (space-4): "Close Certified" in `display-sm`, `text-primary`, centered
- Below (space-2): "Signed by Sarah Chen, Controller" in `body-lg`, `text-secondary`, centered
- Below (space-1): "March 12, 2026 at 11:47 PM EST" in `body-md`, `text-muted`, centered
- Below (space-6): Certification hash in a monospace block: `mono-sm`, `text-muted`, `bg-surface-3`, `radius-md`, padding space-2 space-3. Text: "Certification Hash: sha256:a7f3b2c1..." (truncated with "Copy" link)
- Below hash (space-4): "Awaiting CFO signature" status line with a Clock icon (16px, `accent-amber-400`) and text in `body-md`, `accent-amber-400`
- Below (space-6): Two buttons side by side -- "View Financial Statements" secondary button, "Share Verification Link" secondary button with a Link icon

**CFO Review:** The CFO sees the same post-certification state but with a "Review & Co-Sign" primary button instead of the awaiting message. After the CFO signs, both signatures appear stacked with timestamps.

---

### 2.9 Portfolio Dashboard (Operating Partner)

**Layout:** The sidebar for this role is narrower (220px) and has fewer items: Dashboard, Companies, Reports, Settings. The main content area is wider.

**Top Section:**
- Heading: "Portfolio Overview" in `display-sm`, `text-primary`
- Subheading: "Q1 2026 Close Cycle" in `body-lg`, `text-tertiary`
- Right side: Period selector dropdown, "Export All" button (secondary)

**Portfolio Summary Cards (space-6 below, three cards, gap space-4):**
- Card 1: "Total Companies" -- "12" in `display-lg`, `text-primary`. "All active" in `body-sm`, `success` foreground
- Card 2: "Closes Complete" -- "8 / 12" in `display-lg`, `text-primary`. Progress bar below (success fill). "67% complete" in `body-sm`, `text-tertiary`
- Card 3: "Avg Close Time" -- "4.2 days" in `display-lg`, `text-primary`. Trend arrow (down, `success` foreground) with "-0.8 days vs prior quarter" in `body-sm`, `success` foreground

**Company Grid (space-8 below):**
- Section heading: "Companies" in `heading-2`, `text-primary`. Right: View toggle (Grid/List icons, 20px). Filter dropdown: "All" / "In Progress" / "Certified" / "Not Started"
- Grid: 3 columns on desktop (1280px+), 2 columns on 1024px, 1 column on mobile. Gap space-4

**Each Company Card:**
- `bg-surface-1`, `radius-lg`, `border-subtle`, padding space-4. Height approximately 200px
- Top row: Company name in `heading-3`, `text-primary`. Status badge top-right (same badge system as reconciliation: Certified/In Progress/Not Started)
- Below (space-3): A mini progress bar showing close progress. 4px height, full width, `radius-full`. Shows 0-100% fill in `primary-500` (or `success` foreground if 100%)
- Below (space-3): Key metrics in a 2x2 mini-grid:
  - "Revenue" with amount in `mono-md`, `text-primary`
  - "Net Income" with amount in `mono-md`, `text-primary` (negative in `error` foreground with parentheses)
  - "Variances" with count in `mono-md`. "0" in `success` foreground, ">0" in `error` foreground
  - "Days in Close" with count in `mono-md`, `text-secondary`
- Bottom row (space-3, separated by `border-subtle` top border): Controller name with avatar (20px) in `body-sm`, `text-muted`. "View Details" link in `body-sm`, `text-link`, right-aligned

**Certified company cards** have a subtle top border (3px) in `accent-violet-400` and the certification seal icon (16px) next to the status badge.

**Bottom Section (space-8 below): Consolidated View**
- A wide table card. Heading: "Consolidated Financials" in `heading-2`
- Table columns: Company, Revenue, COGS, Gross Profit, OpEx, EBITDA, Net Income
- All amounts in `mono-md`, `text-primary`, right-aligned
- A "Total" row at bottom with bold weight, top double-border treatment
- Companies not yet certified have their row slightly dimmed (`text-muted` for all values) with a "Pending" badge

---

### 2.10 Public Verification Page

**Layout:** This is a standalone page, no sidebar, no authentication required. Minimal chrome. The page is accessible via a unique URL (e.g., `verify.sabit.com/abc123`).

**Background:** `bg-base` (`#0B0F1A`) full viewport.

**Content Container:** Centered, max-width 560px, vertically centered. `bg-surface-1`, `radius-2xl`, `shadow-xl`, padding space-8.

**Header:**
- Sabit logo mark (40px, `primary-500`) centered at top of card
- "Sabit" wordmark in `heading-3`, `text-primary`, centered, space-2 below logo
- Thin divider line `border-subtle`, space-4 below

**Verification Status (space-6 below divider):**

If verified:
- Large CheckCircle icon (64px, `success` foreground), centered
- "Verified" in `display-sm`, `success` foreground, centered, space-2 below
- "This financial close has been independently verified" in `body-md`, `text-secondary`, centered, space-1 below

If invalid/tampered:
- Large XCircle icon (64px, `error` foreground), centered
- "Verification Failed" in `display-sm`, `error` foreground
- "This certification could not be verified. It may have been modified." in `body-md`, `text-secondary`, centered

**Certificate Details (space-6 below, a bordered section):**
- Thin border `border-subtle`, `radius-lg`, padding space-4
- Details listed vertically, each a label-value pair with space-3 between pairs:
  - "Company": value in `body-md`, `text-primary`, weight 500
  - "Period": value in `body-md`, `text-secondary`
  - "Certified By": name and role, `body-md`, `text-secondary`
  - "Certification Date": full timestamp, `body-md`, `text-secondary`
  - "Co-Signed By": CFO name and role
  - "Co-Sign Date": timestamp
- Labels in `label` style (uppercase, `text-muted`, 12px)

**Certification Hash (space-4 below):**
- Full hash displayed in `mono-sm`, `text-muted`, word-break, within a `bg-surface-3` block, `radius-md`, padding space-3
- "Copy Hash" button (ghost, small) right-aligned below

**Footer (space-6 below):**
- "What is this?" expandable section (ChevronDown icon, `body-sm`, `text-link`). When expanded: explanatory text in `body-sm`, `text-tertiary` explaining that Sabit provides cryptographic verification of financial close certifications
- Thin divider, then "Powered by Sabit" in `body-sm`, `text-muted`, centered, with logo mark (16px) inline

**Eye flow:** The verification icon and status word are the immediate focal point. The eye then moves down through the structured details. The hash at the bottom provides technical proof for those who need it.

---

## 3. FINANCIAL DATA PRESENTATION RULES

### 3.1 Number Formatting

| Rule | Specification | Example |
|---|---|---|
| Decimal places | Always 2 decimal places for currency. No exceptions. | `1,234.56` not `1,234.6` |
| Thousands separator | Comma for every three digits | `1,234,567.89` |
| Currency symbol | Dollar sign prefix, no space. Shown on first line item in a column, subtotals, and totals. Not on every line. | `$1,234.56` on first row; `1,234.56` on subsequent rows |
| Negative values | Parentheses, never minus signs. This is GAAP convention. | `(1,234.56)` not `-1,234.56` |
| Zero values | Display as an en-dash character `--`, centered in the column, in `text-muted` | `--` |
| Alignment | All numbers right-aligned with decimal points vertically aligned. Use `font-variant-numeric: tabular-nums` to guarantee alignment. | Numbers stack cleanly |
| Percentage values | One decimal place, percent sign suffix, no space | `12.3%` |
| Basis points | Integer only, "bps" suffix | `150 bps` |

### 3.2 Subtotal and Total Hierarchy

| Level | Typography | Border Treatment | Background | Indentation |
|---|---|---|---|---|
| Line item | `mono-md`, weight 400, `text-primary` | None | None (alternating row tint) | Indented space-6 from section header |
| Section header | `body-md`, weight 600, `text-primary`, uppercase | None | `bg-surface-2` at 50% opacity | Flush left |
| Subtotal | `mono-md`, weight 600, `text-primary` | 1px solid `border-default` above the amount only | None | Same indent as line items, label flush left |
| Major subtotal | `mono-md`, weight 700, `text-primary` | 1px solid `border-strong` above | Slight `bg-surface-2` tint | Flush left |
| Grand total | `mono-lg`, weight 700, `text-primary` | Double underline below amount (two 1px lines separated by 2px) | `bg-surface-2` | Flush left, all caps label |

### 3.3 Positive, Negative, and Zero Treatment

| Value | Text Color | Format | Additional Treatment |
|---|---|---|---|
| Positive | `text-primary` (`#F9FAFB`) | `1,234.56` | None |
| Negative | `error` foreground (`#F87171`) | `(1,234.56)` | Parentheses only. Never red AND parentheses for the same reason -- in accounting, parentheses already denote negatives. The red is supplemental for visual scanning. |
| Zero | `text-muted` (`#6B7280`) | `--` (en-dash) | Dimmed to reduce visual noise |
| Credit balance in debit column | `text-primary` | `(1,234.56)` | Parentheses indicate contra-normal balance |

### 3.4 Comparative Data (Current vs Prior)

**Column Layout:** Current period values always appear in the leftmost data column. Prior period values appear to the right. This is a deliberate departure from some conventions -- the current period is what the user is working on and should be closer to the account names.

| Element | Current Period | Prior Period | Variance |
|---|---|---|---|
| Column header | "Current Period" or specific date in `label` style | "Prior Period" or specific date in `label` style | "Variance" and "Var %" in `label` style |
| Amount style | `mono-md`, `text-primary` | `mono-md`, `text-muted` (dimmed to establish clear hierarchy) | `mono-md` |
| Variance color | N/A | N/A | Favorable: `success` foreground (`#34D399`). Unfavorable: `error` foreground (`#F87171`). Neutral: `text-muted` |
| Variance direction | N/A | N/A | Favorable = revenue increase or expense decrease. Arrow icons (TrendingUp/TrendingDown, 14px) precede the variance amount |

**Important note on "favorable":** Revenue and income lines treat increases as favorable (green). Expense and cost lines treat decreases as favorable (green). The system must be aware of account type when coloring variances.

### 3.5 AI vs Deterministic Visual Distinction

This is a critical design principle. Users must always know whether a number was computed deterministically (arithmetic on their data) or generated/suggested by AI.

| Source | Indicator | Placement | Color System |
|---|---|---|---|
| Deterministic (arithmetic) | No indicator. This is the default. All financial statement numbers, trial balance totals, and reconciliation balances are deterministic. | N/A | Standard text colors |
| AI-generated content | Sparkles icon (14px) + "AI" label | Inline, to the left of the content | Icon and label in `accent-amber-400` (`#FBBF24`) |
| AI-suggested classification | Left border (3px) on the row + Sparkles icon | Left border on container; icon inline | Left border and icon in `accent-amber-400` |
| AI-drafted text (variance justifications) | Sparkles icon + amber left border on the text container | Above or beside the text block | `accent-amber-400` border, `accent-amber-300` icon |
| Human-edited AI content | Sparkles icon with a small pencil overlay (custom compound icon) + "AI Edited" label | Same placement as AI-generated | `accent-amber-400` icon with `text-tertiary` "Edited" annotation |
| Human-authored content | User avatar or initials icon | Inline | Standard colors, no amber |

**Rule:** No number on the four financial statements ever displays an AI indicator. All financial statement figures are deterministic. AI indicators only appear on: account classifications, variance justifications, reconciliation suggestions, and adjusting entry descriptions.

---

## 4. DARK THEME SPECIFICATION

### 4.1 Complete Dark Theme Color System

The dark theme is the primary (and for MVP, only) theme. All colors above are specified for dark theme. This section provides the systematic rationale and additional implementation guidance.

#### Background Elevation System

The dark theme uses progressively lighter backgrounds to indicate elevation, creating depth without shadows (which are less effective on dark backgrounds).

| Elevation Level | Hex | RGB | Usage |
|---|---|---|---|
| Level 0 (base) | `#0B0F1A` | `11, 15, 26` | Page background, app shell |
| Level 1 (surface) | `#111827` | `17, 24, 39` | Primary cards, sidebar, main panels |
| Level 2 (raised) | `#1F2937` | `31, 41, 55` | Modals, dropdowns, popovers, hover states on Level 1 |
| Level 3 (overlay) | `#374151` | `55, 65, 81` | Input fields, hover states on Level 2, selected states |
| Level 4 (emphasis) | `#4B5563` | `75, 85, 99` | Active states, pressed buttons, scroll track |

**Color temperature:** All backgrounds use a blue-tinted gray (note the blue channel is consistently higher than red in the RGB values). This creates a cohesive cool atmosphere appropriate for financial software used during nighttime hours.

#### Complete Text Color Hierarchy with Contrast Ratios

Measured against `bg-surface-1` (`#111827`):

| Token | Hex | Contrast Ratio | WCAG Level | Usage |
|---|---|---|---|---|
| `text-primary` | `#F9FAFB` | 15.4:1 | AAA | Headlines, financial figures, primary labels |
| `text-secondary` | `#D1D5DB` | 10.9:1 | AAA | Body text, descriptions, secondary data |
| `text-tertiary` | `#9CA3AF` | 6.3:1 | AA (normal text), AAA (large) | Labels, captions, column headers |
| `text-muted` | `#6B7280` | 4.6:1 | AA (large text only) | Placeholders, disabled text, zero values. NOT used for any text smaller than 14px bold or 18px regular |
| `text-link` | `#60A5FA` | 7.1:1 | AAA | Interactive text elements |

Measured against `bg-base` (`#0B0F1A`):

| Token | Hex | Contrast Ratio | WCAG Level |
|---|---|---|---|
| `text-primary` | `#F9FAFB` | 17.8:1 | AAA |
| `text-secondary` | `#D1D5DB` | 12.6:1 | AAA |
| `text-tertiary` | `#9CA3AF` | 7.2:1 | AAA |

### 4.2 Maintaining Financial Data Readability

Financial data demands higher readability than typical dark-theme content because errors in reading numbers have direct monetary consequences.

**Rules for financial data on dark backgrounds:**

1. **All financial figures use `text-primary` (`#F9FAFB`)** -- never `text-secondary` or lower. The only exception is prior-period comparative data, which uses `text-muted` when shown alongside current-period data to create clear visual hierarchy.

2. **Monospace font minimum size is 12px** -- Never render financial numbers below 12px. At 12px, JetBrains Mono remains legible on dark backgrounds due to its generous x-height.

3. **Row height minimum is 36px for financial tables** -- This prevents dense packing that causes misreading across rows. A 40px default is preferred.

4. **Alternating row tinting:** Odd rows use `bg-surface-1` (`#111827`). Even rows use a calculated tint of `#161E2E` (a subtle blend between surface-1 and surface-2). The contrast between alternating rows should be perceptible but not distracting. A 2-3% brightness difference is sufficient.

5. **Horizontal alignment guides:** Every financial table includes a subtle dotted leader line (1px dotted, `#1F2937`) connecting account names to their amounts when the gap exceeds 200px. This prevents the eye from drifting to the wrong row.

6. **Active row highlight:** On hover, financial table rows get a background of `#1A2332` (a slightly blue-shifted surface) with no transition delay. This provides immediate feedback on which row the cursor is over.

7. **Column separators:** Thin 1px borders (`border-subtle`) between major column groups (e.g., between account info columns and amount columns) in wide tables. These help the eye track across long rows.

### 4.3 Status Colors on Dark Backgrounds

Status colors on dark backgrounds must avoid two problems: being too dim to notice, and being too saturated to read text against. The solution is a three-layer system.

#### Status Color Specifications

**Success (Reconciled, Approved, Balanced)**

| Element | Hex | Usage |
|---|---|---|
| Foreground | `#34D399` | Icon fills, text, badge text. Contrast on `#111827`: 9.1:1 (AAA) |
| Background | `#064E3B` | Badge background, status row tint |
| Border | `#065F46` | Badge border, card left-accent border |
| Text on background | `#34D399` on `#064E3B` | Contrast: 5.2:1 (AA) |

**Warning (Pending, In Progress, AI Suggestions)**

| Element | Hex | Usage |
|---|---|---|
| Foreground | `#FBBF24` | Icon fills, text, badge text. Contrast on `#111827`: 10.7:1 (AAA) |
| Background | `#78350F` | Badge background, alert background |
| Border | `#92400E` | Badge border |
| Text on background | `#FBBF24` on `#78350F` | Contrast: 4.8:1 (AA) |

**Error (Rejected, Out of Balance, Material Variance)**

| Element | Hex | Usage |
|---|---|---|
| Foreground | `#F87171` | Icon fills, text, negative numbers. Contrast on `#111827`: 6.5:1 (AA, and AAA for large text) |
| Background | `#7F1D1D` | Badge background, error banner |
| Border | `#991B1B` | Badge border |
| Text on background | `#F87171` on `#7F1D1D` | Contrast: 4.5:1 (AA minimum met) |

**Info (System Messages, Tips)**

| Element | Hex | Usage |
|---|---|---|
| Foreground | `#60A5FA` | Icon fills, text. Contrast on `#111827`: 7.1:1 (AAA) |
| Background | `#1E3A8A` | Badge background, info banner |
| Border | `#1D4ED8` | Badge border |
| Text on background | `#60A5FA` on `#1E3A8A` | Contrast: 4.6:1 (AA) |

#### Status Color Application Rules

1. **Never use status foreground colors as backgrounds.** A green background is illegible in dark themes. Instead, use the muted background variant (`#064E3B`) with the foreground color (`#34D399`) for text/icon.

2. **Status badges always have three layers:** background fill (muted), border (slightly lighter than background), and text/icon (bright foreground). This creates a contained, readable element.

3. **Status colors are never used for decoration.** Every use of green, amber, or red must convey actual status information. Decorative elements use the neutral palette only.

4. **For colorblind accessibility:** Status is never communicated through color alone. Every status color is paired with: an icon (CheckCircle for success, AlertTriangle for warning, XCircle for error), text label (the word "Reconciled", "Pending", "Rejected"), or shape (progress rings, filled/empty indicators). This triple-encoding (color + icon + text) ensures accessibility for all forms of color vision deficiency.

### 4.4 WCAG AA Compliance Summary

| Requirement | Implementation | Status |
|---|---|---|
| Normal text contrast (4.5:1) | Minimum used is `text-muted` at 4.6:1, and only for large text or non-essential decorative labels. All readable content uses `text-tertiary` (6.3:1) or higher | Compliant |
| Large text contrast (3:1) | All large text (18px+ regular or 14px+ bold) uses `text-secondary` (10.9:1) or `text-primary` (15.4:1) | Exceeds AA |
| Non-text contrast (3:1) | All interactive borders, icons, and UI components use `border-strong` (4.2:1 against surface) or higher. Focus rings use `primary-500` (high visibility) | Compliant |
| Focus indicators | 2px solid `primary-500` (`#3B82F6`) outline with 2px offset. Creates a clearly visible blue ring around any focused element | Compliant |
| Touch targets | All interactive elements are minimum 44px in the touch dimension (height for buttons, both dimensions for icon buttons) | Compliant |
| Motion sensitivity | All animations respect `prefers-reduced-motion`. When reduced motion is preferred: no transitions, no glow animations, no progress bar animations. The certification seal glow becomes a static border. | Compliant |

---

This concludes the Sabit UI Design System specification. Every color value, spacing unit, and typographic choice is defined and ready for engineering implementation. The system is built dark-theme-first for the financial close use case, with accessibility woven into every decision rather than applied as an afterthought.
