# Product–Market Fit & Deployment Boundaries

**Purpose:** Show where the system fits and where it does not. No TAM/SAM/SOM or pricing. Discipline and fit, not hype.

---

## Ideal-fit environments

Environments where the current system is a strong fit share these characteristics (inferred from what the system does and requires today):

1. **Formal close process already in place.** Close sessions, checklists, period lock, and certification are concepts the organization already uses. Controllership or finance operations owns the close. The system fits where this governance exists, not where it must be created from scratch.

2. **External reporting or audit scrutiny.** The organization issues financial statements or packages that are audited or filed. There is a defined need for a defensible audit trail and for certification to be gated on verification (e.g. chain, integrity checks), not only on workflow completion.

3. **Single entity or tenant-per-entity.** The data model is tenant-scoped with no cross-tenant access. Best fit is one legal entity (or one tenant per entity) with a dedicated environment.

4. **Willingness to correct in the system.** Staged imbalances are resolved by human-supplied adjustments with provenance. The organization is willing to have a person supply the fix and declare its source rather than expect the system to auto-correct.

5. **Roles are defined and used.** Preparer, reviewer, and approver are assigned and respected. The system enforces these roles at the action level; the organization must be willing to assign and use them.

6. **Risk-aware mindset.** Control and auditability are valued. The system adds gates and attribution; organizations that prioritize “fast close at any cost” and resist extra steps will find it friction-heavy.

---

## Non-fit environments (not a fit during pilot / initial deployment)

Environments where this system should not be deployed, or should be deferred:

1. **Need the system to decide accounting treatment.** The system validates balance, sequence, and provenance; it does not decide recognition, measurement, or disclosure. If the primary need is “the system should tell us how to account for X,” another category of tool is more appropriate.

2. **Cannot support human-in-the-loop.** Staging requires approve/reject by a human. Resolve-ingest requires a human-supplied adjustment and provenance. If no one will perform these steps or the culture expects fully unattended automation, the staging and resolve-ingest flow will not work as designed.

3. **Need real-time sync with an external GL as system of record.** GL post-back is disabled by default. The system is not built as the primary GL or a real-time GL replica. If the requirement is “one source of truth, always in sync with the ERP,” the current system does not meet it.

4. **Multi-tenant SaaS (many unrelated entities on one instance).** The design is single-tenant: tenant-scoped data, no cross-tenant access. Deploying as a shared service across many unrelated entities would require architectural changes not present today.

5. **Early-stage or minimal-close environments.** Where there is no formal close, no certification, and no audit scrutiny, the strictness of the system (staging, gates, roles, chain) has little to anchor to. Better to defer until the organization has a defined close and a need for defensible certification and audit trail.

---

## Buyer, user, and blocker dynamics

**Economic buyer (who would fund a pilot)**  
Controllership or Finance Operations leadership, or an internal innovation/transformation sponsor. They own or influence the close process and can authorize a parallel pilot and allocate preparer/reviewer/approver time.

**Day-to-day users**  
Preparers (upload trial balance, create/propose JEs, checklist, draft export), Reviewers (review checklist and outputs), Approvers (adjustments with provenance, approve/post JEs, period lock, certification, certified export for validation).

**Approvers and blockers**  
- **Internal Audit.** Cares about audit trail, export gate, and segregation. Likely to require a parallel run before any reliance on output. Aligned with the documented pilot model.  
- **IT / Security.** Deploys and operates the environment; may raise questions about another system to maintain, database and auth, and data ownership. Pilot docs address: dedicated tenant and DB, no touch to GL or production close tools, reversibility.  
- **Operations / Close owner.** May resist extra steps (staging, resolve-ingest, role discipline). Strong fit requires that control and auditability are valued enough to accept those steps.

---

## Adoption trigger conditions

Conditions that often need to exist before the system is welcomed (none guarantee adoption):

- Recurring audit findings or regulator focus on close controls, certification, or audit trail.  
- Painful or high-friction close cycles where imbalance or rework is common and the organization wants to prevent bad data from reaching the ledger and to gate certification.  
- Distrust of upstream data or manual adjustments; willingness to have humans supply corrections with provenance.  
- Need for defensible certification: “certified” must mean session certified and verification passed, not only checklist done.  
- Desire to run a parallel control layer without replacing the existing close or GL, with a clear exit.

---

## Roadmap boundary note

- **GL sync / post-back.** Pushing close adjustments or journal entries to an external GL is **not enabled by default**. The code supports an optional path when `ENABLE_GL_POSTBACK` is set; the implementation does not assume an external GL is present. **Planned (post-pilot)** as a controlled capability if the organization decides to adopt and requires it; not part of the initial pilot and not enabled by default.

---

*All statements are consistent with current system behavior and documented pilot constraints. No TAM/SAM/SOM or pricing.*
