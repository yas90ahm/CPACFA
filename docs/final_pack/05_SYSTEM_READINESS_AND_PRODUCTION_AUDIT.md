# System Readiness & Production Audit Summary

**Purpose:** Evidence of what is built, what is tested, and what remains for production. Honest and conservative.

---

## What is built today (major modules)

- **Trial balance ingestion.** Routes and services to upload trial balance (e.g. CSV/XLSX), parse and validate, stage imbalanced uploads, and resolve-ingest with human-supplied adjustment and provenance. Period trial balance is updated only after a balancing resolution.

- **Close workflow.** Close sessions (per entity/period), checklist items, session status progression (e.g. in progress, ready for review, finalized, locked), period lock, and certification. Period lock and certification are gated by approver role and recorded in the audit log.

- **Journal entry lifecycle.** Draft → proposed → approved → posted. Approval and post require approver role. Pre-post checks (Shadow Auditor) run before post; when severity is block, post is refused and the entry remains approved but not posted. Findings are stored.

- **HITL (human-in-the-loop).** Staging for proposals (e.g. trial balance fix, journal entry); approve/reject with optional signer and rejection reason. Only after approval can the system proceed with the corresponding action.

- **Export and audit binder.** Draft and certified PDF/CSV export. Certified export is gated by: close session certified, export gate (audit chain verification, server-side materiality from DB), and final integrity check (trial balance balance, balance sheet equation, optional plug detection). Audit binder routes use the same gates.

- **Audit ledger.** Append-only, hash-chained ledger for material events. Append and verify (chain walk) are implemented. Export gate calls chain verification before allowing certified export.

- **Export gate service.** Server-side check using period_export_checks (DB), audit ledger chain verification, and (when enabled) unresolved-conflict check. Returns allowed/not allowed; on failure certified export is blocked.

- **Integrity check service.** Final integrity check: trial balance balance, balance sheet equation within tolerance, optional suspicious-plug detection. Used by export and audit binder routes before certified output.

- **Segregation service.** Role checks (preparer, reviewer, approver) for controlled actions (e.g. period_lock, certify_close, je_approve, je_post). Used by close and journal entry routes; outcomes recorded in audit log.

- **Destructive-operation guards.** Module that refuses schema reset and similar destructive ops unless explicitly allowed and environment is not staging/production. Used at startup and by reset/bootstrap scripts.

---

## What is tested (key integration flows)

- **Full close flow.** Trial balance ingest, close session creation, journal entry (adjustment), readiness computation, statement package generation, chain verification (valid when ledger consistent), export when session and data exist.

- **Export certified gate.** Certified export returns 403 when session is not certified; draft export succeeds with draft labeling when session is not certified; certified export succeeds when session is certified and gate/integrity pass (tests use DB and test tenant).

- **Certification pipeline.** End-to-end certification path (session creation, checklist, lock, certify) and behavior of certified vs non-certified export.

- **Shadow Auditor gate.** When configured to block (e.g. AI_SHADOW_SEVERITY=block), JE post returns 403 and findings include block; when ok, post succeeds and shadow audit findings are persisted.

- **JE post error codes.** Service/bridge failure results in appropriate error code (e.g. 500 with code=SERVICE) so callers receive stable, non-misleading responses.

- **Classifier and advisor (staged).** Staged ingest with AI mock produces classification results or advisor proposals; no JE is posted without human approval.

- **Validation and auth.** Input validation (Zod) and auth routes reject invalid or missing payloads where schemas are applied.

---

## Gates and controls that exist

- **Export gate.** Runs before certified PDF/CSV: audit ledger chain verification, period-level materiality read from DB only (no client-supplied materiality), and (when enabled) unresolved-conflict check. On failure, certified export is blocked (403/422 with explicit codes).

- **Final integrity check.** Trial balance must balance; balance sheet equation must hold; optional plug-account detection can block export. Used by export and audit binder routes.

- **Period lock.** Service and repository; routes assert period not locked before allowing ingest or certain close updates. Lock requires approver role.

- **Segregation.** Preparer cannot perform period_lock, certify_close, je_approve, je_post; the system checks role and records the action.

- **Provenance.** Resolve-ingest and adjustment flows validate that non-zero amounts have valid provenance; requests without it are rejected.

- **Production in-memory disallow.** When NODE_ENV is production, several services (e.g. audit export, trial balance store, HITL orchestrator) throw if they would use in-memory storage instead of DB. Not every code path has this check; normal API flow supplies pool and tenant via auth/context.

- **Destructive scripts.** Schema reset and bootstrap refuse to run in staging/production; they also refuse when ALLOW_DB_RESET is not set (except in test). Runtime guard exits process if staging/production and ALLOW_DB_RESET is true.

---

## What is still missing for full production

The following are typical production requirements. Their absence or partial presence is noted; no claim that the system is “production-ready” in a regulated, high-availability sense without addressing them.

- **Observability.** Structured logging with secret redaction and request correlation exists. There is no OpenTelemetry or distributed tracing, and no metrics/alerting stack. Observability today is logs-only. **Planned (post-pilot)** or organization-supplied.

- **Runbooks and incident response.** No formal runbooks or incident response process is delivered in the codebase. **Planned (post-pilot)** or organization-defined.

- **Backups and recovery.** Database backup, point-in-time recovery, and restore procedures are the responsibility of the deployment (e.g. managed Postgres). The application does not implement backup logic. **Organization or platform responsibility.**

- **Auth bypass removal.** Auth bypass exists for development/diagnostics when a specific env flag is set; it is disabled when not set and should not be used in production. For hardened production, bypass paths should be removed or strictly locked down. **Not implemented** in code today; deployment must ensure flag is not set.

- **In-memory fallback consistency.** Some services (e.g. period lock, accounting integration) can still use in-memory fallbacks when pool/tenantId is missing. In production the normal API path supplies pool via tenant context; internal or cron callers could theoretically hit in-memory. **Partial;** full consistency would require disallowMemoryStoreInProduction (or equivalent) on all such paths.

- **Large-dataset strategy.** No streaming ingest; file size limits (e.g. 10–20 MB) may apply; some list endpoints do not paginate. **Not implemented** for very large datasets.

---

## Pilot-ready vs production-ready

- **Pilot-ready:** The system can be deployed with a persistent database and tenant, run in parallel to the existing close, with GL post-back disabled. Staging, resolve-ingest, close workflow, export gate, integrity check, role enforcement, and audit ledger behave as documented and are covered by integration tests. Exit is reversible with no operational dependency. Suitable for a bounded, single-tenant, parallel-run pilot with clear success criteria and decision point.

- **Production-ready (full):** Would require addressing the items above (observability, runbooks, incident response, backup/recovery posture, auth bypass removal, in-memory fallback consistency, and any scale/large-dataset needs). The codebase provides the control and audit behavior needed for a pilot; operational hardening for 24/7, regulated, or high-availability production is not fully delivered in the repo and would be planned post-pilot or supplied by the organization.

---

*All statements above are tied to current code, tests, and existing production-readiness assessments. No future capabilities are promised.*
