# HITL / Issues — Current State (Step 4 Part A)

## 1. tenant_hitl_staging

**Schema:** `migrations/062_tenant_hitl_staging_and_supervisor_sessions.sql`

| Field | Type | Purpose |
|-------|------|---------|
| id | TEXT PK | Staging item id (e.g. hitl-{ts}-{rand}) |
| tenant_id | TEXT | Tenant |
| proposed_action | TEXT | Human-readable description of what’s proposed |
| justification | TEXT | Reason/justification |
| status | TEXT | `pending` \| `approved` \| `rejected` |
| type | TEXT | `journal_entry` \| `policy_change` \| `adjustment` \| `flag_override` \| `other` |
| amount | NUMERIC(18,4) | Optional amount |
| payload | JSONB | Type-specific payload (e.g. periodLabel, adjustment lines) |
| created_at, updated_at | TIMESTAMPTZ | |
| approved_at, approved_by | TIMESTAMPTZ, TEXT | Set when status = approved |
| rejected_at, rejected_reason | TIMESTAMPTZ, TEXT | Set when status = rejected |

**Used for:** Short-lived “proposed action” items that need human approve/reject:
- **TB ingest imbalance:** TB upload doesn’t balance → staged for HITL; human calls `POST /api/hitl/resolve-ingest` with adjustment → applied to period TB.
- **GL ingest imbalance:** Same idea for GL entry.
- **Agentic proposals:** hitl_orchestrator submits to staging; human approves/rejects via webhook or `/resolve`.

**Where created:** `persistence_service.createStagingItem`, called from:
- `trial-balance/ingest.ts` (imbalanced TB upload)
- `gl_upload_service.ts` (imbalanced GL)
- `hitl_orchestrator.submitToStaging` (agent proposals)

**Where resolved:** `hitl.ts`:
- `POST /api/hitl/resolve` (approve/reject with reason)
- `POST /api/hitl/resolve-ingest` (apply human-supplied adjustment to staged TB)
- `POST /api/hitl/resolve-gl-ingest` (same for GL)
- `receiveHumanApproval` / `receiveHumanRejection` in hitl_orchestrator (persistence_service.updateStagingStatus)

**Relationship to issues:** Staging is **not** the same as “issues”. Staging = one-off proposals. Issue items = ongoing exceptions tied to a close session.

---

## 2. issue_items (tenant)

**Schema:** `migrations/066_tenant_issue_items.sql` (table name: `issue_items`)

| Field | Type | Purpose |
|-------|------|---------|
| id | TEXT PK | |
| close_session_id | TEXT | Close session (period) |
| tenant_id | TEXT | |
| category | TEXT | intake, classification, reconciliation, posting, policy, presentation, export_blocker |
| severity | TEXT | low, med, high, critical |
| status | TEXT | open, in_progress, needs_info, needs_approval, resolved, wont_fix |
| title | TEXT | |
| description | TEXT | |
| impact_pl, impact_bs, impact_cash | NUMERIC | |
| currency, materiality_*, confidence_score | | |
| source_ref | JSONB | Context (e.g. accountName, itemCodes) |
| assigned_to, due_date | TEXT, DATE | |
| created_by, updated_by | TEXT | |
| created_at, updated_at | TIMESTAMPTZ | |

**Used for:** Tracked exceptions for a close session: something is wrong or needs attention (unmapped account, recon mismatch, checklist incomplete, period reopened, etc.).

**Where created:** `issue_item_service.createIssue` (and helpers), called from:
- `close_session_service.reopenCloseSession` (policy/low “Period reopened”)
- `export.ts` (createIssueFromIntegrityFailure when export blocked)
- `close_issues.ts` POST /issues (API create)
- `trial-balance/ingest.ts` (createIssueFromIntegrityFailure)
- `recon_service.ts` (createIssue)
- `close_checklist_readiness_service.emitIssuesForStuckChecklist` (createIssue)

**Where resolved/updated:** `issue_item_service`: resolveIssue, assignIssue, updateIssueStatus. Routes: PATCH status, PATCH assign.

**Read for gates:** `close_checklist_readiness_service.computeReadiness` uses `listIssues(..., severity: 'critical')` and treats non–resolved/wont_fix as open; open critical issues → hard blocker.

---

## 3. How the two relate

- **tenant_hitl_staging:** No link to close_session. Short-lived; approve/reject or resolve-ingest then done.
- **issue_items:** Tied to close_session_id; lifecycle (open → resolved/wont_fix); used for certification gate (critical open = blocker).
- **Overlap:** Both can originate from “something’s wrong” (e.g. imbalance). Staging = “here’s a proposed fix”; issue = “we’re tracking this problem.” No shared ID or unified lifecycle.

---

## 4. Create / detect sites (summary)

| Site | What | Table / concept |
|------|------|------------------|
| trial-balance/ingest | Imbalanced TB → staging; integrity failure → issue | staging + issue_items |
| gl_upload_service | Imbalanced GL → staging | staging |
| hitl_orchestrator | Agent proposal → staging | staging |
| close_session_service | Reopen → “Period reopened” issue | issue_items |
| export.ts | Export integrity failure → issue | issue_items |
| recon_service | Recon-related issue | issue_items |
| close_checklist_readiness_service | Stuck checklist → issue | issue_items |
| close_issues.ts | API create issue | issue_items |

---

## 5. Resolve / approve sites

| Site | What | Table / concept |
|------|------|------------------|
| hitl.ts /resolve | Approve/reject staging | tenant_hitl_staging |
| hitl.ts /resolve-ingest | Apply adjustment to staged TB | staging + period_trial_balance |
| hitl.ts /resolve-gl-ingest | Apply adjustment to GL | staging + GL |
| close_issues.ts PATCH status/assign | Resolve or assign issue | issue_items |

---

## 6. Auto-resolution today

- **Staging:** “Resolve” = human applies correction (resolve-ingest) or approve/reject. No automatic re-check that the problem is gone.
- **Issues:** No automatic “re-run check and close issue if fixed.” Only manual status update or resolve. Readiness just counts open critical issues.

---

## 7. Target (for Step 4)

- Single **Issue** model with lifecycle: DETECTED → ASSIGNED → IN_PROGRESS → RESOLVED → VERIFIED (and WAIVED).
- One table `tenant_close_issues` + append-only history.
- Detection functions create issues when checks fail; idempotent (no duplicates for same problem).
- Cascade after mutations: re-run checks, auto-verify when fix confirmed, create new issues when new failures appear.
- Certification gate: block on open **blocking** (or critical) issues; optionally require VERIFIED for blocking.
