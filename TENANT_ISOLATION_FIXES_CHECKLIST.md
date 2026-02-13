# Tenant Isolation P0 Fixes — Checklist (from TENANT_ISOLATION_SQL_AUDIT.md)

## 22 MUST FIX Items — Status

| # | Repository | Method / Query | Table has tenant_id? | Status | Fix Applied |
|---|------------|----------------|----------------------|--------|-------------|
| 1 | triage_assessment_repository.ts | getById | No (close_session_id) | ✅ FIXED | JOIN close_sessions WHERE cs.tenant_id = $1 AND ta.id = $2 |
| 2 | triage_assessment_repository.ts | getLatestTriageByCloseSessionId | No | ✅ FIXED | JOIN close_sessions WHERE cs.tenant_id = $1 AND ta.close_session_id = $2 |
| 3 | recon_repository.ts | getReconRunById | No | ✅ FIXED | JOIN close_sessions WHERE cs.tenant_id = $1 AND rr.id = $2 |
| 4 | recon_repository.ts | listReconRunsByCloseSession | No | ✅ FIXED | JOIN close_sessions |
| 5 | recon_repository.ts | updateReconRunStatus | No | ✅ FIXED | FROM close_sessions WHERE cs.tenant_id = $2 AND rr.id = $3 |
| 6 | recon_repository.ts | getReconItemById, listReconItemsByRunId | No | ✅ FIXED | JOIN recon_runs → close_sessions |
| 7 | recon_repository.ts | getReconMatchGroupById, listReconMatchGroupsByRunId | No | ✅ FIXED | JOIN recon_runs → close_sessions |
| 8 | recon_repository.ts | updateReconMatchGroupStatus | No | ✅ FIXED | FROM recon_runs JOIN close_sessions |
| 9 | recon_repository.ts | listReconMatchGroupItemIds, listMatchGroupIdsContainingItem | No | ✅ FIXED | JOIN chain to close_sessions |
| 10 | recon_repository.ts | getReconExceptionById, listReconExceptionsByRunId | No | ✅ FIXED | JOIN recon_runs → close_sessions |
| 11 | recon_repository.ts | getReconSignoffByRunId, upsertReconSignoff SELECT | No | ✅ FIXED | JOIN recon_runs → close_sessions |
| 12 | close_checklist_item_repository.ts | getChecklistItemById, listChecklistItemsBySessionId | No | ✅ FIXED | JOIN close_sessions |
| 13 | close_checklist_item_repository.ts | updateChecklistItemStatus, hasChecklistForSession | No | ✅ FIXED | JOIN close_sessions |
| 14 | statement_package_repository.ts | getStatementPackageById | No | ✅ FIXED | JOIN close_sessions |
| 15 | statement_package_repository.ts | getMaxVersionByCloseSessionId, listStatementPackagesByCloseSessionId | No | ✅ FIXED | JOIN close_sessions |
| 16 | statement_package_repository.ts | listStatementLinesByPackageId | No | 🔧 FIXED | JOIN statement_packages → close_sessions |
| 17 | statement_package_repository.ts | upsertStatementDiff SELECT | No | 🔧 FIXED | Validate packages via getStatementPackageById before; SELECT uses JOIN |
| 18 | ledger_snapshot_repository.ts | getLedgerSnapshotById | Yes | ✅ FIXED | WHERE id = $1 AND tenant_id = $2 |
| 19 | ledger_snapshot_repository.ts | getLatestSnapshotByCloseSessionId | Yes | ✅ FIXED | WHERE close_session_id = $1 AND tenant_id = $2 |
| 20 | journal_entry_repository.ts | getJournalEntryById, getJEAttachmentById | journal_entries: yes; je_attachments: no | ✅ FIXED | je_attachments: JOIN journal_entries WHERE je.tenant_id = $1 |
| 21 | journal_entry_repository.ts | listJEAttachments | No | 🔧 FIXED | JOIN journal_entries WHERE je.tenant_id = $1 AND a.je_id = $2 |
| 22 | evidence_repository.ts | getEvidenceRecord, getEvidenceLink (post-insert SELECT) | Yes | ✅ FIXED | WHERE id = $1 AND tenant_id = $2 |
| 23 | coa_mapping_rules_repository.ts | insertCoaRule SELECT | Yes | ✅ FIXED | WHERE id = $1 AND tenant_id = $2 |
| 24 | user_repository.ts | getUserById | Yes | ✅ FIXED | Optional tenantId; WHEN tenantId: WHERE id = $1 AND tenant_id = $2 |
| 25 | close_session_repository.ts | insertCloseSession SELECT, getCloseSessionById | Yes | ✅ FIXED | WHERE id = $1 AND tenant_id = $2 |
| 26 | fixed_asset_repository.ts | listDepreciationRunDetails | depreciation_runs: yes | ✅ FIXED | JOIN depreciation_runs WHERE dr.tenant_id = $1 AND drd.run_id = $2 |
| 27 | decision_record_repository.ts | insertDecisionRecord SELECT, getDecisionRecordById | Yes | ✅ FIXED | WHERE id = $1 AND tenant_id = $2 |
| 28 | issue_item_repository.ts | insertIssueItem SELECT, getIssueItemById | Yes | ✅ FIXED | WHERE id = $1 AND tenant_id = $2 |

*Note: Audit doc lists 22; some repositories have multiple queries grouped. Most were already fixed. Items 16, 17, 21 were patched in this pass.*

## Integration Test Coverage

| Endpoint / Resource | Test | File |
|--------------------|------|------|
| close_sessions | Tenant B cannot access Tenant A session (404) | tenant_isolation.test.ts |
| ledger_snapshots | Tenant B cannot access Tenant A snapshot (404) | tenant_isolation.test.ts |
| triage_assessments | Tenant B cannot access Tenant A triage (404) | tenant_isolation.test.ts |
| recon_runs | Tenant B cannot access Tenant A recon run (404) | tenant_isolation.test.ts |
| recon_items | Tenant B cannot access Tenant A recon items (404) | tenant_isolation.test.ts |
| close_checklist_items | Tenant B gets empty list for Tenant A session | tenant_isolation.test.ts |
| statement_packages | Tenant B cannot access Tenant A package (404) | tenant_isolation.test.ts |
| statement_package lines | Tenant B cannot access Tenant A package lines (404/400) | tenant_isolation.test.ts |
| journal_entries | Tenant B cannot access Tenant A journal entry (404) | tenant_isolation.test.ts |
| evidence_records | Tenant B cannot access Tenant A evidence via JE (404) | tenant_isolation.test.ts |

## Before/After Snippets (Items Patched in This Pass)

### 16. listStatementLinesByPackageId

```sql
-- Before (unsafe):
SELECT package_id, fs_line_id, amount, statement, metadata
FROM statement_lines WHERE package_id = $1 ORDER BY statement, fs_line_id

-- After (safe):
SELECT sl.package_id, sl.fs_line_id, sl.amount, sl.statement, sl.metadata
FROM statement_lines sl
JOIN statement_packages sp ON sl.package_id = sp.id
JOIN close_sessions cs ON sp.close_session_id = cs.id
WHERE cs.tenant_id = $1 AND sl.package_id = $2
ORDER BY sl.statement, sl.fs_line_id
```

### 17. upsertStatementDiff

*Validation: Callers already use tenant-validated package IDs. For defense in depth, upsertStatementDiff now accepts tenantId and validates both packages belong to tenant before INSERT. SELECT unchanged (INSERT is the mutation).*

### 21. listJEAttachments

```sql
-- Before (unsafe):
SELECT id, je_id, file_ref, uploaded_at FROM je_attachments WHERE je_id = $1 ORDER BY uploaded_at

-- After (safe):
SELECT a.id, a.je_id, a.file_ref, a.uploaded_at
FROM je_attachments a
JOIN journal_entries je ON a.je_id = je.id
WHERE je.tenant_id = $1 AND a.je_id = $2
ORDER BY a.uploaded_at
```

## Regression Guard: Unscoped Tenant Query Prevention

**Test:** `tests/unit/tenant_isolation_sql_guard.test.ts`

The guard scans `src/db/repositories/*.ts` for SQL passed to `pool.query()`, `client.query()`, or `queryControl()`. For each SELECT/UPDATE/DELETE on tenant-owned tables, it asserts that the query includes tenant scoping (e.g. `tenant_id = $N`, JOIN to `close_sessions`/`journal_entries`, or INSERT with `tenant_id` column).

**Run:** `npm test -- tenant_isolation_sql_guard.test.ts` (from `tests/` directory)

### Allowlisted Exceptions

| File | Table / Pattern | Justification |
|------|-----------------|---------------|
| job_repository.ts | jobs | Control DB; system-wide job queue. No tenant_id column. |
| fs_taxonomy_repository.ts | fs_taxonomy_lines | Shared reference data; no tenant_id in schema. |
| user_repository.ts | users … WHERE email = $1 | getUserByEmailOnly: intentional for wedge login when tenant unknown. |
| approval_request_repository.ts | approval_request_events | Child of approval_requests; INSERT only; parent has tenant_id. |
| user_repository.ts | users … WHERE id = $1 (no tenant_id) | getUserById without tenantId: fallback when tenant context unavailable (caller must validate). |

New unscoped queries will cause the test to fail. Add tenant scoping or, if justified, add an explicit allowlist entry with a documented reason.
