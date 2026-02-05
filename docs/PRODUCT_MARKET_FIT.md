# Product–Market Fit Analysis

**Source:** Current codebase and existing business documents only. No marketing language, TAM/SAM/SOM, roadmap promises, personas, or speculative features.

**Audience:** Senior operators, finance leaders, controllers, audit partners, and internal innovation sponsors.

**Tone:** Internal strategy memo. Conservative. Every claim supported by current system behavior or documented pilot constraints.

---

## SECTION 1 — What problem this system is actually built to solve

The system addresses a narrow set of **operational and control** problems in the close and certification path:

1. **Imbalanced data reaching the ledger.** Organizations that move trial balance or adjusted data into a period ledger risk posting debits and credits that do not balance. The system prevents that by staging any imbalanced upload and refusing to write to the period trial balance until a human supplies a correcting adjustment with declared provenance. The “correct” adjustment is not decided by the system; the human supplies it and the system enforces that the combined result balances and that every amount has a source.

2. **Certification without verification.** Issuing a “certified” report or package without checking that the close was actually certified, that the audit trail is intact, and that the balance sheet and trial balance pass integrity checks creates reputational and regulatory risk. The system blocks certified export when the session is not certified, when the export gate fails (e.g. invalid audit chain, materiality breach), or when the final integrity check fails (e.g. balance sheet equation, trial balance balance, plug abuse). Draft export remains available for internal use with clear labeling.

3. **Uncontrolled posting.** Journal entries that bypass balance checks or a pre-post review can introduce error or override controls. The system runs balance validation and an optional pre-post review (Shadow Auditor). When that review returns a block, the post is refused and the entry stays in approved-but-not-posted state; findings are stored for audit. Segregation is enforced: approval and post require the approver role.

4. **Unattributed adjustments.** Adjustments and fixes that cannot be traced to a human, an engine, or a source line weaken accountability and auditability. The system requires a valid provenance for every amount used in resolve-ingest and in adjustments; requests without it are rejected.

5. **Weakened segregation.** Period lock, close certification, and journal entry approval/post are sensitive duties. The system gates these actions by role (preparer, reviewer, approver), checks the actor before allowing the action, and records the outcome in an append-only, hash-chained audit ledger. Certified export is blocked if the chain is invalid.

These are **control and process** problems: they are about *whether* bad data can reach the ledger, *whether* certified output can be produced when it should not be, and *who* did what. The system does not solve accounting judgment (e.g. lease classification, revenue timing) or replace the need for a formal close process; it enforces gates and attribution around data and actions that already assume such a process exists.

---

## SECTION 2 — Ideal-fit environments

Environments where the current system is a strong fit share the following characteristics. All are inferred from what the system does and requires today.

**Company type**

- **Formal close process.** Close sessions, checklists, period lock, and certification are concepts the organization already uses. Controllership or finance operations owns the close. The system fits where this governance already exists, not where it must be created from scratch.

- **External reporting or audit scrutiny.** The organization issues financial statements or packages that are audited or filed. There is a defined need for a defensible audit trail and for certification to be gated on verification, not only on workflow completion.

- **Single entity or tenant-per-entity.** The implemented data model is tenant-scoped with no cross-tenant access. Best fit is one legal entity (or one tenant per entity) with a dedicated environment, not a multi-tenant shared service across many unrelated entities.

**Finance maturity**

- **Manual or semi-manual adjustments are accepted.** Staged imbalances are resolved by human-supplied adjustments with provenance. The organization is willing to have a person supply the fix and declare its source rather than expect the system to auto-correct.

- **Roles are defined and used.** Preparer, reviewer, and approver are assigned and respected. The system enforces these roles at the action level; the organization must be willing to assign and use them.

- **Database and operations are in place.** Production disallows in-memory fallbacks for staging, audit log, and period lock. A persistent database (e.g. Postgres) and tenant context are required. IT or operations can support deployment and access control.

**System landscape**

- **Trial balance or adjusted data is available for upload.** The system consumes trial balance (e.g. CSV/XLSX) and optional prior-period or comparative data. It does not replace the ERP or GL; it operates on data provided to it. Fit is strongest where that data can be extracted and uploaded (or equivalent API payload) for a parallel or downstream process.

- **Exports are tolerated as a separate step.** Draft and certified export are produced from data inside the system. The organization is willing to treat export as an output to review or compare rather than requiring real-time sync with an external GL as the system of record. GL post-back is off by default and not required for the pilot.

**Organizational mindset**

- **Risk-aware over speed-only.** The value of the system is in blocking unsafe actions (imbalance on ledger, certified export when gate fails, post when Shadow Auditor blocks) and in enforcing provenance and roles. Organizations that prioritize “fast close at any cost” and resist gates or extra steps will find the system friction-heavy. Fit is better where control and auditability are explicitly valued.

---

## SECTION 3 — Non-fit environments (explicit exclusions)

Environments where this system **should not** be deployed, and why. Based on current behavior and documented non-goals.

**Organizations that need the system to decide accounting treatment**

- The system validates balance, sequence, and provenance; it does not decide recognition, measurement, or disclosure. It can store and display classifications and suggestions but does not replace professional judgment. If the primary need is “the system should tell us how to account for X,” another category of tool (policy engine, expert system, or advisory) is more appropriate. Here the system would be a poor fit because it deliberately does not make those decisions.

**Organizations that cannot support human-in-the-loop**

- Staging requires approve/reject by a human. Resolve-ingest requires a human-supplied adjustment and provenance. If no one will perform these steps or the culture expects fully unattended automation, the staging and resolve-ingest flow will stall or be bypassed in practice. The assumption that humans will correct and attribute breaks; the system is built on that assumption.

**Organizations that need real-time sync with an external GL as system of record**

- GL post-back is disabled by default. The system is not built as the primary GL or a real-time GL replica. If the requirement is “one source of truth, always in sync with the ERP,” the system does not meet it. A GL-centric or integration-heavy solution is more appropriate.

**Multi-tenant SaaS providers (many unrelated entities on one instance)**

- The design is single-tenant: tenant-scoped data, no cross-tenant access. Deploying as a shared service across many unrelated entities would require architectural changes not present today. Such environments should not be considered a fit for the current system.

**Organizations that expect AI to generate final amounts without human attribution**

- Every amount in adjustments and resolve-ingest must have a valid provenance (e.g. human_entered, engine_calculation, ledger_exact). The system rejects unprovenanced amounts. If the expectation is that AI-generated numbers are posted without human sign-off or attribution, the system will block that flow. Fit requires acceptance of human accountability for amounts.

**Early-stage or minimal-close environments**

- Where there is no formal close, no certification, and no audit scrutiny, the strictness of the system (staging, gates, roles, chain) has little to anchor to. The system would add process and cost without a clear control problem to solve. Better to defer until the organization has a defined close and a need for defensible certification and audit trail.

---

## SECTION 4 — Buyer, user, and blocker dynamics

**Economic buyer (who would fund a pilot)**

- **Controllership or Finance Operations leadership.** They own the close process, period lock, and certification. They feel the pain of imbalance risk, certification risk, and audit friction. They can authorize a parallel pilot and allocate preparer/reviewer/approver time. Often the same function that would “own” the system internally (see BUSINESS_DOCUMENTS Document 1).

- **Internal innovation or transformation sponsor.** A senior operator or finance leader who wants to test a control-focused, audit-friendly layer without changing the existing close or GL. They fund the pilot as an experiment with a clear exit (no cutover, no operational dependency).

**Day-to-day users (who touches it)**

- **Preparers.** Upload trial balance, create and propose journal entries, complete checklist steps, request draft export. They interact with staging (e.g. viewing staged items) and may supply adjustment details for an approver to submit with provenance.

- **Reviewers.** Review checklist and status; may request draft export; review outputs for comparison with existing process.

- **Approvers.** Supply or approve adjustments with provenance; approve journal entries; perform period lock and close certification; request certified export when validating gates. They must have the approver role; the system enforces it.

**Approvers and blockers**

- **Internal Audit.** Cares about audit trail, export gate behavior, segregation, and whether certified export is truly gated. They can be supporters if the system demonstrates blocking behavior and chain verification; they can block if they do not trust the design or if the pilot is rushed into production without validation. Likely objection: “We need to see the controls work in a parallel run before we rely on any output.” This is aligned with the documented pilot model (parallel run, no cutover until criteria are met).

- **IT / Security.** Must deploy and operate the database and application, manage tenant and access, and satisfy security and compliance. Objections may center on: another system to maintain, database and auth requirements, and “who owns data in the pilot.” The answers are in the pilot docs: dedicated pilot tenant and DB; no touch to GL or production close tools; reversibility by ceasing use.

- **Operations / Close process owner.** May resist “extra work” (staging, resolve-ingest, role discipline) if close speed is the primary goal. Objection: “We already close on time; why add steps?” Strong fit requires that control and auditability are valued enough to accept those steps in exchange for gates and attribution.

**Why objections occur**

- **“We need the system to fix the numbers.”** The system does not auto-generate the correcting entry for an imbalanced upload; it stages and waits for a human-supplied adjustment. Organizations that expect automatic correction will be disappointed; the design favors control and attribution over automation.

- **“We need one system of record, always in sync with the GL.”** The system is not the GL and does not assume real-time sync. GL post-back is off by default. Objection is valid for a different requirement; the system does not aim to meet it.

- **“We can’t assign approvers or don’t have segregation.”** The system requires preparer/reviewer/approver and enforces role for lock, certify, approve, and post. Without that, the system’s value (enforced segregation, audit trail of who did what) is diminished and adoption will be awkward.

---

## SECTION 5 — Adoption trigger conditions

Conditions that typically need to exist before this system is welcomed. None guarantee adoption; they increase the likelihood that the value proposition is relevant.

- **Recurring audit findings or regulator focus** on close controls, certification, or audit trail. The organization is already under pressure to improve evidence of who did what and whether certified output is properly gated. The system’s behavior (block certified export when gate fails, hash-chained ledger, role enforcement) directly addresses that.

- **Painful or high-friction close cycles** where imbalance or rework is common and the organization wants to prevent bad data from reaching the ledger and to enforce a clear sequence (e.g. no certified output until session is certified and integrity checks pass). The system’s staging and export gate align with that.

- **Distrust of upstream data or manual adjustments.** Where trial balance or adjustments come from multiple sources and there is concern about unattributed or unbalanced data, the requirement for provenance and for human correction of staged imbalance fits. The organization must be willing to have humans supply the fix.

- **Need for defensible certification.** Where “certified” must mean “session certified and verification passed,” not just “checklist done,” the export gate and integrity check provide a technical basis for that. This matters most when external audit or regulators expect verification, not just workflow completion.

- **Desire to run a parallel control layer** without replacing the existing close or GL. The pilot model (parallel run, no cutover, no GL post-back) fits organizations that want to test a control and audit layer with a clear exit and no operational dependency.

---

## SECTION 6 — Why this is a pilot-first product

The system naturally enters via parallel run, limited scope, and controlled pilots for the following reasons, all supported by current design and documented pilot constraints.

- **It does not replace the GL or the existing close.** It consumes trial balance and optional data, runs close workflow and gates within its own store, and can produce draft or certified export. It does not assume it is the system of record for the books. Therefore the only low-risk way to adopt is to run it in parallel and compare behavior and outputs before any cutover.

- **GL post-back is off by default.** The default deployment does not push to an external GL. Pilots are run without GL post-back, so there is no dependency on the system for posting. That makes “try then stop” straightforward: no data to reverse in the GL.

- **Certification and export gates are strict.** Certified export is blocked when the session is not certified or when the gate or integrity check fails. Organizations need to see that behavior in a safe setting (e.g. single entity, single period, draft first) before relying on it. A pilot is the right way to validate that the system blocks when it should and allows when it should.

- **Success and failure criteria are defined.** Documented criteria (e.g. imbalance never on ledger without resolve-ingest; certified export refused when gate or integrity fails; role checks and Shadow Auditor block behave as designed) give a clear bar for the pilot. The decision point is “did we observe these behaviors?” not “did we achieve a business outcome?” That favors a bounded pilot over a broad rollout.

- **Exit is zero operational dependency.** If the pilot is parallel-only and no cutover has occurred, stopping means ceasing to use the system. Existing close and reporting are unchanged. No migration or rollback in production systems is required. That makes sponsors willing to approve a pilot they would not approve as a big-bang rollout.

---

## SECTION 7 — Signals of strong vs weak product–market fit

**Feedback that suggests strong fit**

- Controllership or audit explicitly values the fact that imbalanced data cannot reach the ledger until a human corrects it and that certified export is blocked when the session is not certified or when the gate or integrity check fails.

- The organization is willing to assign preparer/reviewer/approver and to have approvers supply or approve adjustments with provenance. They accept that the “correct” adjustment is supplied by a human, not the system.

- Internal Audit or external auditors respond positively to the audit trail (append-only, hash-chained) and to the fact that certified export depends on chain verification and integrity checks, not only on workflow completion.

- The pilot decision is to continue or extend the pilot, or to plan a next phase (e.g. broader scope) with the understanding that the system will still enter via controlled rollout and parallel run, not as a replacement for the existing close or GL.

**Feedback that suggests misfit**

- Persistent request for the system to “fix” imbalanced uploads automatically or to post amounts without provenance. The system is not built for that; continued pressure indicates a mismatch with the control-and-attribution model.

- Inability or unwillingness to assign roles or to have humans perform approve/reject and resolve-ingest. If the organization cannot or will not support HITL, the staging and resolve-ingest flow will not work as designed.

- Requirement for real-time sync with an external GL or for the system to be the single system of record. The current system does not fulfill that; the requirement will not be met.

- Dismissal of gates and verification as “getting in the way” of a fast close, with no counterbalancing value placed on control and auditability. The system’s value is in blocking and enforcing; if that is not valued, fit is weak.

**When to stop pursuing a prospect**

- When the prospect needs the system to make accounting conclusions (recognition, measurement, disclosure) or to certify/opine in a regulatory or audit-opinion sense. The system does not do that.

- When the prospect cannot or will not run a parallel pilot (e.g. demands cutover or GL integration before validation). The documented adoption path is pilot-first; skipping it increases risk and is not supported by the current design.

- When the prospect expects multi-tenant shared deployment across many unrelated entities with cross-tenant features. The current design is single-tenant; no such capability exists.

- When the prospect’s success criteria cannot be met by current system behavior (e.g. automatic correction of imbalance, certified export without certification or without passing gate). Pursuing would require promising behavior the system does not have.

---

*End of Product–Market Fit Analysis. All claims are tied to current system behavior, BUSINESS_DOCUMENTS.md, and PILOT_READINESS_AND_PLAN.md. No new capabilities or roadmap commitments.*
