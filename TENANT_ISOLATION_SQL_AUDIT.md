# Tenant Isolation SQL Audit — src/db/repositories/

**Audit Date:** 2025-02-07  
**Scope:** All SELECT, UPDATE, DELETE queries in `src/db/repositories/`  
**Exception list:** migrations, tenants table, jobs (control DB), fs_taxonomy_lines (shared reference), approval_request_events (child of approval_requests; parent has tenant_id)

---

## Summary

| Category | Count |
|----------|-------|
| **MUST FIX** (tenant data leakage risk) | 22 |
| **Post-insert SELECT** (defense in depth; lower risk) | 11 |
| **Exception** (expected; no tenant_id) | 8 |

---

## MUST FIX — Add tenant_id Filtering or JOIN to close_sessions

These queries can return or mutate data from another tenant when `id`, `close_session_id`, or other IDs are user-supplied or derived from untrusted context.

### 1. triage_assessment_repository.ts

| Line | Query | Issue |
|------|-------|-------|
| 54 | `SELECT ... FROM triage_assessments WHERE id = $1` | No tenant_id. Table has close_session_id only. **Fix:** JOIN close_sessions WHERE tenant_id = $X AND id = $1. |
| 66 | `SELECT ... FROM triage_assessments WHERE close_session_id = $1 ORDER BY created_at DESC LIMIT 1` | close_session_id must be validated against tenant. **Fix:** JOIN close_sessions WHERE tenant_id = $X AND close_session_id = $1. |

### 2. recon_repository.ts

| Line | Query | Issue |
|------|-------|-------|
| 133, 141 | `SELECT ... FROM recon_runs WHERE id = $1` | No tenant_id. **Fix:** JOIN close_sessions cs ON r.close_session_id = cs.id WHERE cs.tenant_id = $1 AND r.id = $2. |
| 154 | `SELECT ... FROM recon_runs WHERE close_session_id = $1` | close_session_id must be tenant-validated. **Fix:** Add tenantId param, JOIN close_sessions. |
| 166 | `UPDATE recon_runs SET status = $1 WHERE id = $2` | No tenant_id. **Fix:** Subquery or JOIN to close_sessions. |
| 197, 202 | `SELECT ... FROM recon_items WHERE id = $1` | recon_items → recon_run → close_session. **Fix:** JOIN chain to close_sessions. |
| 210 | `SELECT ... FROM recon_items WHERE recon_run_id = $1` | Same. **Fix:** Validate recon_run belongs to tenant. |
| 239, 244 | `SELECT ... FROM recon_match_groups WHERE id = $1` | Same. **Fix:** JOIN to close_sessions via recon_run. |
| 252 | `SELECT ... FROM recon_match_groups WHERE recon_run_id = $1` | Same. |
| 263 | `UPDATE recon_match_groups SET status = $1 WHERE id = $2` | No tenant_id. |
| 281 | `SELECT recon_item_id FROM recon_match_group_items WHERE match_group_id = $1` | Junction table; validate match_group. |
| 289 | `SELECT match_group_id FROM recon_match_group_items WHERE recon_item_id = $1` | Same. |
| 311 | `SELECT ... FROM recon_exceptions WHERE id = $1` | **Fix:** JOIN to close_sessions via recon_run. |
| 319 | `SELECT ... FROM recon_exceptions WHERE recon_run_id = $1` | Same. |
| 338, 346 | `SELECT ... FROM recon_signoffs WHERE recon_run_id = $1` | Same. |

### 3. close_checklist_item_repository.ts

| Line | Query | Issue |
|------|-------|-------|
| 57, 62 | `SELECT ... FROM close_checklist_items WHERE id = $1` | No tenant_id. **Fix:** JOIN close_sessions WHERE tenant_id = $X AND cci.id = $1. |
| 70 | `SELECT ... FROM close_checklist_items WHERE close_session_id = $1` | close_session_id must be tenant-validated. **Fix:** Add tenantId, JOIN close_sessions. |
| 89 | `UPDATE close_checklist_items SET ... WHERE id = $1` | No tenant_id. **Fix:** JOIN close_sessions. |
| 97 | `SELECT id FROM close_checklist_items WHERE close_session_id = $1 LIMIT 1` | Same. |

### 4. statement_package_repository.ts

| Line | Query | Issue |
|------|-------|-------|
| 90, 95 | `SELECT ... FROM statement_packages WHERE id = $1` | No tenant_id. **Fix:** JOIN close_sessions cs ON sp.close_session_id = cs.id WHERE cs.tenant_id = $1 AND sp.id = $2. |
| 103 | `SELECT MAX(version) FROM statement_packages WHERE close_session_id = $1` | close_session_id must be tenant-validated. |
| 117 | `SELECT ... FROM statement_packages WHERE close_session_id = $1` | Same. |

### 5. ledger_snapshot_repository.ts

| Line | Query | Issue |
|------|-------|-------|
| 77 | `SELECT ... FROM ledger_snapshots WHERE id = $1` | ledger_snapshots has tenant_id. **Fix:** Add `AND tenant_id = $2`. |
| 92 | `SELECT ... FROM ledger_snapshots WHERE close_session_id = $1` | close_session_id must be tenant-validated. **Fix:** Add tenantId, JOIN or subquery. |

### 6. journal_entry_repository.ts

| Line | Query | Issue |
|------|-------|-------|
| 103 | `SELECT ... FROM journal_entries WHERE id = $1` | insertJournalEntry post-insert; low risk. **Preferred:** Add tenant_id for consistency. |
| 225, 234 | `SELECT ... FROM je_attachments WHERE id = $1` | je_attachments links to journal_entries. No tenant_id. **Fix:** JOIN journal_entries je ON a.je_id = je.id WHERE je.tenant_id = $1 AND a.id = $2. |

### 7. evidence_repository.ts

| Line | Query | Issue |
|------|-------|-------|
| 110 | `SELECT ... FROM evidence_records WHERE id = $1` | evidence_records has tenant_id. **Fix:** Add `AND tenant_id = $2`. |
| 164 | `SELECT ... FROM evidence_links WHERE id = $1` | evidence_links has tenant_id. **Fix:** Add `AND tenant_id = $2`. |

### 8. coa_mapping_rules_repository.ts

| Line | Query | Issue |
|------|-------|-------|
| 104 | `SELECT ... FROM coa_mapping_rules WHERE id = $1` | Table has tenant_id. **Fix:** Add `AND tenant_id = $2`. |

### 9. user_repository.ts

| Line | Query | Issue |
|------|-------|-------|
| 37 | `SELECT ... FROM users WHERE id = $1` | users has tenant_id. **Fix:** Add `AND tenant_id = $2` for getUserById when tenant context exists. **Note:** getUserByEmailOnly (line 28) intentionally has no tenant_id for "wedge login"; document as exception. |

### 10. close_session_repository.ts

| Line | Query | Issue |
|------|-------|-------|
| 128 | `SELECT ... FROM close_sessions WHERE id = $1` | insertCloseSession post-insert. **Fix:** Add `AND tenant_id = $2` for defense in depth. |

### 11. fixed_asset_repository.ts

| Line | Query | Issue |
|------|-------|-------|
| 212 | `SELECT ... FROM depreciation_run_details WHERE run_id = $1` | depreciation_runs has tenant_id; depreciation_run_details links to run. **Fix:** JOIN depreciation_runs dr ON drd.run_id = dr.id WHERE dr.tenant_id = $1 AND drd.run_id = $2. |

### 12. decision_record_repository.ts

| Line | Query | Issue |
|------|-------|-------|
| 83 | `SELECT ... FROM decision_records WHERE id = $1` | insertDecisionRecord post-insert. **Fix:** Add `AND tenant_id = $2` for consistency. |

### 13. issue_item_repository.ts

| Line | Query | Issue |
|------|-------|-------|
| 122 | `SELECT ... FROM issue_items WHERE id = $1` | insertIssueItem post-insert. **Fix:** Add `AND tenant_id = $2` for consistency. |

---

## Post-Insert SELECT (Defense in Depth)

These occur immediately after INSERT by the same transaction. Risk is low (we know the tenant from the insert) but adding tenant_id improves consistency:

| File | Line | Query |
|------|------|-------|
| close_session_repository.ts | 128 | INSERT then SELECT WHERE id = $1 |
| decision_record_repository.ts | 83 | INSERT then SELECT WHERE id = $1 |
| issue_item_repository.ts | 122 | INSERT then SELECT WHERE id = $1 |
| journal_entry_repository.ts | 103 | INSERT then SELECT WHERE id = $1 |
| evidence_repository.ts | 110 | createEvidenceRecord — SELECT WHERE id = $1 |
| evidence_repository.ts | 164 | linkEvidenceToJournalEntry — SELECT WHERE id = $1 |
| statement_package_repository.ts | 90 | INSERT then SELECT WHERE id = $1 |
| coa_mapping_rules_repository.ts | 104 | insertCoaRule — SELECT WHERE id = $1 (no tenant_id in WHERE) |

---

## Exception — No tenant_id Required

| Table / Query | Reason |
|---------------|--------|
| **jobs** (job_repository.ts) | Control DB; system-wide job queue. No tenant_id column. |
| **fs_taxonomy_lines** (fs_taxonomy_repository.ts) | Shared reference data; no tenant_id in schema. |
| **approval_request_events** | Child of approval_requests; INSERT only; parent has tenant_id. |
| **tenants** | Control table; querying for tenant config. |
| **migrations** | Control table. |
| **audit_ledger** | All queries use `WHERE tenant_id = $1`. |
| **user_repository.getUserByEmailOnly** | Intentional for wedge login when tenant unknown. |

---

## Queries That MUST Be Fixed (Prioritized)

### High priority (direct ID-based access; user/route can supply ID)

1. **triage_assessment_repository.ts**: getById, getLatestTriageByCloseSessionId  
2. **recon_repository.ts**: getReconRunById, getReconItemById, getReconMatchGroupById, getReconExceptionById, updateReconRunStatus, updateReconMatchGroupStatus, all list functions  
3. **close_checklist_item_repository.ts**: getChecklistItemById, listChecklistItemsBySessionId, updateChecklistItemStatus, hasChecklistForSession  
4. **statement_package_repository.ts**: getStatementPackageById, getMaxVersionByCloseSessionId, listStatementPackagesByCloseSessionId  
5. **ledger_snapshot_repository.ts**: getLedgerSnapshotById, getLatestSnapshotByCloseSessionId  
6. **journal_entry_repository.ts**: getJEAttachmentById, getJEAttachmentById (listJEAttachments by jeId — caller must validate je belongs to tenant)  
7. **evidence_repository.ts**: getEvidenceRecord (createEvidenceRecord return), getEvidenceLink (linkEvidenceToJournalEntry return)  
8. **coa_mapping_rules_repository.ts**: getCoaRuleById (or equivalent)  
9. **user_repository.ts**: getUserById — add tenant_id when tenant context available  

### Medium priority (close_session_id—caller must validate; add JOIN for defense)

10. All recon/triage/checklist/statement_package queries that filter by close_session_id — require tenantId and JOIN to close_sessions.

### Lower priority (post-insert only; defense in depth)

11. close_session_repository insertCloseSession SELECT  
12. decision_record_repository insertDecisionRecord SELECT  
13. issue_item_repository insertIssueItem SELECT  
14. fixed_asset_repository depreciation_run_details  

---

## Recommended Fix Pattern

For tables **without** tenant_id (recon_*, triage_assessments, close_checklist_items, statement_packages):

```sql
-- Before (unsafe):
SELECT * FROM recon_runs WHERE id = $1

-- After (safe):
SELECT r.* FROM recon_runs r
JOIN close_sessions cs ON r.close_session_id = cs.id
WHERE cs.tenant_id = $1 AND r.id = $2
```

For tables **with** tenant_id:

```sql
-- Before (unsafe):
SELECT * FROM ledger_snapshots WHERE id = $1

-- After (safe):
SELECT * FROM ledger_snapshots WHERE id = $1 AND tenant_id = $2
```

Update repository function signatures to accept `tenantId` where it is not already present.
