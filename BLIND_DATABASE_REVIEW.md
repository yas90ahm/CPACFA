# Blind Database Review -- Sovereign CPA Engine

**Reviewer**: Database Specialist (cold review, no prior exposure)
**Date**: 2026-03-13
**Scope**: 166 migration files (.sql), 80 repository files (.ts), connection management (src/db/index.ts)

---

## Executive Summary

This is an impressively well-engineered financial database for a close automation engine. The schema demonstrates deep domain expertise in accounting, audit, and financial controls. The system correctly uses NUMERIC for money, enforces immutability through database triggers, implements a cryptographic hash-chained audit ledger, and separates AI from core data via schema-level RBAC. The architecture shows deliberate, layered defense-in-depth thinking.

However, the schema has accumulated technical debt from rapid iteration: bare NUMERIC columns without precision survive in early migrations, several child-table queries lack tenant_id filters (relying on parent JOINs or caller-level guards), and there is a 7-migration gap (157-163) suggesting deleted or abandoned work. These are fixable issues in an otherwise strong foundation.

**Overall Grade: B+**

---

## 1. MIGRATIONS -- Grade: B+

### Numbering and Idempotency

- **166 total files**, numbered 001 through 173.
- **Gap found**: migrations 157-163 are missing (7 consecutive numbers skipped). This suggests deleted migrations, which is a red flag for production environments where version tracking tables may reference these numbers.
- **No duplicate numbers** detected.
- **Migration 119 is a control migration** (user_management_and_portfolio) registered separately in `migrate.ts` CONTROL_MIGRATION_FILES array -- good separation.

### Idempotency

The codebase handles idempotency well overall:

- All CREATE TABLE statements use `IF NOT EXISTS` (verified across 001-095+).
- All CREATE INDEX statements use `IF NOT EXISTS`.
- All trigger creations are preceded by `DROP TRIGGER IF EXISTS`.
- All function definitions use `CREATE OR REPLACE FUNCTION`.
- ALTER TABLE ADD COLUMN uses `IF NOT EXISTS` (e.g., 002, 023).

**Risk**: Some ALTER TABLE statements (e.g., 121_money_column_precision.sql `ALTER COLUMN ... TYPE NUMERIC(20,2)`) will succeed idempotently but perform a full table rewrite each time. This is not dangerous but is wasteful if re-run.

**Risk**: Migration 123 drops and re-adds a GENERATED ALWAYS column. If run on a table with data, this is destructive to the generated values (they regenerate, which is correct, but the DROP could fail if dependent views existed).

### Migration System Design

The migration system (`src/db/index.ts`, `src/db/migrate.ts`) is well-structured:

- Tracks applied versions in `schema_migrations` table.
- Separates control DB migrations (001, 002, 010, 075, 119) from tenant migrations (003-147).
- Supports lazy migration on tenant pool access via `getTenantPoolWithMigrations()`.
- Supports BYOD (Bring Your Own Database) per tenant.

**Concern**: The TENANT_MIGRATION_FILES array in index.ts stops at version 147, but migrations exist up to 173. This means migrations 148-173 are NOT being applied automatically. If these are meant to be applied, they are silently skipped.

---

## 2. MONEY COLUMNS -- Grade: B

### Standard Used

The canonical money type is `NUMERIC(20,2)` -- correct for financial applications. This gives 18 digits before the decimal and 2 after, supporting values up to $999,999,999,999,999,999.99.

### Compliance

**Properly typed tables** (NUMERIC(20,2) for money):
- `core.general_ledger` (095): debit, credit -- NUMERIC(20,2) with CHECK >= 0
- `tenant_period_reconciliations` (102): gl_balance, supporting_balance, tolerance_amount, reconciling_items_total, variance, unexplained_variance -- all NUMERIC(20,2)
- `tenant_recon_items` (102): amount -- NUMERIC(20,2)
- Stock compensation tables (029): NUMERIC(15,2)
- Deferred tax tables (030): NUMERIC(15,2) for money, NUMERIC(5,4) for rates
- Segment reporting (032): NUMERIC(15,2)
- Valuation tables (033-035): NUMERIC(15,2)

**PROBLEM -- Bare NUMERIC (no precision) in money columns**:

These columns were originally created as bare `NUMERIC` and only some were later fixed by migration 121:

| Migration | Table | Column | Status |
|-----------|-------|--------|--------|
| 004 | intercompany_reconciliation_results | matched_amount, balance_a, balance_b, variance | Fixed by 121 |
| 012 | budget_version_lines | amount | Fixed by 121 |
| 066 | issue_items | impact_pl, impact_bs, impact_cash, materiality_estimate | Fixed by 121 |
| 072 | journal_entry_lines | debit, credit | Fixed by 121 |
| 074 | statement_lines | amount | Fixed by 121 |
| 071 | recon_items | amount | Fixed by 121 |

**Still bare NUMERIC (NOT fixed)**:
- `055_risk_context_liquidity.sql`: current_ratio, runway_months (bare NUMERIC)
- `056_risk_context_last_dcf.sql`: terminal_growth_rate (bare NUMERIC)
- `067_tenant_triage_assessments.sql`: materiality_threshold (bare NUMERIC)
- `069_coa_mapping_rules.sql`: confidence_default (bare NUMERIC -- though this is a 0-1 score, not money)
- `070_tenant_decision_records.sql`: confidence_score (bare NUMERIC)
- `081_shadow_audit_ai_metadata.sql`: confidence (bare NUMERIC)

**No FLOAT, REAL, or DOUBLE PRECISION found for money columns.** This is excellent.

### Precision Inconsistency

The variance analysis table (112) uses `DECIMAL(20,4)` with 4 decimal places, while reconciliation uses `NUMERIC(20,2)`. This is intentional (percentage calculations need more precision) but creates an inconsistency if these values are ever compared or joined.

---

## 3. GENERATED COLUMNS -- Grade: A

### Formulas Found

**Migration 102** (`tenant_period_reconciliations`):
```sql
variance NUMERIC(20,2) GENERATED ALWAYS AS (gl_balance - supporting_balance) STORED
is_within_tolerance BOOLEAN GENERATED ALWAYS AS (
  (gl_balance IS NOT NULL AND supporting_balance IS NOT NULL)
  AND (ABS(gl_balance - supporting_balance) <= tolerance_amount)
) STORED
unexplained_variance NUMERIC(20,2) GENERATED ALWAYS AS (
  (gl_balance - supporting_balance) - COALESCE(reconciling_items_total, 0)
) STORED
```

**Migration 123** (fix): The unexplained_variance formula was corrected:
```sql
-- Old (WRONG): (gl_balance - supporting_balance) - reconciling_items_total
--   variance=2500, items=-2500: 2500-(-2500)=5000 (doubled, wrong)
-- New (CORRECT): (gl_balance - supporting_balance) + reconciling_items_total
--   variance=2500, items=-2500: 2500+(-2500)=0 (correct)
```

This fix is mathematically correct. Reconciling items are signed (negative items reduce the unexplained amount), so addition is correct.

**Migration 112** (`tenant_variance_analysis`):
```sql
change_amount DECIMAL(20,4) GENERATED ALWAYS AS (current_amount - prior_amount) STORED
change_percentage DECIMAL(12,4) GENERATED ALWAYS AS (
  CASE WHEN prior_amount <> 0 THEN ((current_amount - prior_amount) / prior_amount) * 100 ELSE NULL END
) STORED
```

Both formulas are mathematically correct. The division-by-zero guard (CASE WHEN prior_amount <> 0) is proper.

### Trigger-Maintained Computed Value

**Migration 132**: `reconciling_items_total` on `tenant_period_reconciliations` is auto-updated by a trigger on `tenant_recon_items` (INSERT/UPDATE/DELETE). This feeds into the GENERATED ALWAYS `unexplained_variance` column. The trigger correctly handles all three DML operations and uses COALESCE(SUM(amount), 0).

This is a well-designed pattern: the trigger maintains the denormalized sum, and the GENERATED column computes the derived value.

---

## 4. IMMUTABILITY TRIGGERS -- Grade: A

This is the strongest area of the database design. The trigger coverage is comprehensive and well-reasoned.

### Protected Tables

| Table | Protection | Migration | Notes |
|-------|-----------|-----------|-------|
| audit_ledger | Block ALL UPDATE and DELETE | 091 | Absolute append-only |
| ledger_snapshots | Block ALL UPDATE and DELETE | 091 | Absolute immutability |
| period_trial_balance | Block UPDATE/DELETE when linked session is certified | 091 | Conditional immutability |
| journal_entries | Block UPDATE/DELETE when status IN ('posted','exported') | 105, 155 | Status-gated |
| journal_entry_lines | Block UPDATE/DELETE when parent JE is posted/exported | 106, 155 | Cross-table status check |
| certification_artifacts | Block ALL UPDATE and DELETE | 120 | Absolute immutability |
| tenant_close_issue_history | Block ALL UPDATE and DELETE | 099 | Append-only audit trail |
| coa_mapping_history | Block ALL UPDATE and DELETE | 109 | Append-only |

### Audit Chain Enforcement

Migration 128 + 156: The audit_ledger has a BEFORE INSERT trigger that enforces hash chain integrity:
- First entry for a tenant must have NULL previous_entry_hash.
- Subsequent entries must have previous_entry_hash matching the latest entry_hash.
- Migration 156 adds `FOR UPDATE` to prevent race conditions during concurrent inserts.

This is excellent. Even if application code is bypassed, the database itself enforces chain integrity.

### Balance Validation

Migration 131: A BEFORE UPDATE trigger on journal_entries validates that total debits = total credits before allowing status transition to 'posted'. Defense-in-depth: the service layer already checks this.

### Zero-Zero Line Rejection

Migration 130: CHECK constraint (`chk_no_zero_zero_line`) prevents JE lines where both debit and credit are zero. Applied as NOT VALID to grandfather existing rows.

### What is NOT Protected (Potential Gaps)

- **close_sessions**: No trigger prevents deletion of a certified session. The application code must enforce this. A certified session should arguably be immutable at the DB level.
- **statement_packages/statement_lines**: No immutability triggers when status = 'final'. A finalized statement package could theoretically be modified by direct SQL.
- **general_ledger**: No immutability protection. GL data for a certified period could be modified. The period_trial_balance is protected, but the underlying GL is not.

---

## 5. MULTI-TENANT ISOLATION -- Grade: B+

### Architecture

The system supports two modes:
1. **Shared database**: All tenants on the control DB (search_path: core, ai, audit, public).
2. **BYOD**: Each tenant gets their own database URL (stored in tenants.database_url).

For BYOD, tenant isolation is physical (separate databases). For shared mode, isolation depends on WHERE tenant_id = $1 in every query.

### Repository Analysis

**Excellent tenant isolation** in:
- `general_ledger_repository.ts`: Every query includes `WHERE tenant_id = $1`.
- `close_session_repository.ts`: Every query includes `WHERE tenant_id = $1`.
- `audit_ledger_repository.ts`: Every query includes `WHERE tenant_id = $1`.
- `certification_artifact_repository.ts`: Every query includes `WHERE tenant_id = $1`.
- `recon_repository.ts`: All queries JOIN through close_sessions with `cs.tenant_id = $1`.

**Potential concerns**:

1. **journal_entry_lines**: `listJournalEntryLines(pool, jeId)` queries by `je_id` only, no tenant_id filter. Similarly, `listJournalEntryLinesBatch(pool, jeIds)` uses `WHERE je_id IN (...)` without tenant scoping. However, the callers always first fetch the parent JE with tenant_id, so the je_id is already tenant-scoped. This is safe in practice but violates defense-in-depth -- a rogue je_id could leak lines across tenants.

2. **je_attachments**: `listJEAttachments(pool, jeId)` has no tenant_id filter. Same pattern: relies on caller having validated the jeId belongs to the tenant. `insertJEAttachment` and `getJEAttachmentById` correctly JOIN through journal_entries with tenant_id.

3. **journal_entry_lines table itself has no tenant_id column**. This is a structural limitation -- tenant isolation for lines is only possible through the parent JE foreign key.

### AI Boundary Isolation

Migration 093 establishes schema-level RBAC:
- `core_writer`: Full DML on core.*, INSERT on audit.*, DML on ai.*
- `ai_writer`: INSERT/SELECT/UPDATE on ai.* ONLY -- cannot write core tables
- `auditor_reader`: SELECT on core.* and audit.*

This is a strong design that prevents AI from modifying financial data even if application code has a bug.

---

## 6. INDEXES -- Grade: A-

### Coverage

The indexing strategy is thorough. Key observations:

**General Ledger** (095, 097):
- `idx_gl_tenant_period` ON (tenant_id, period_label) -- primary access pattern
- `idx_gl_entry_id` ON (tenant_id, period_label, entry_id)
- `idx_gl_account` ON (tenant_id, period_label, account_code)
- `idx_gl_date` ON (tenant_id, period_label, entry_date)
- `idx_gl_tb_covering` ON (tenant_id, period_label, account_code) INCLUDE (debit, credit) -- covering index for TB derivation

**Journal Entries** (072, 141):
- `idx_journal_entries_tenant` ON (tenant_id)
- `idx_journal_entries_status` ON (tenant_id, status)
- `idx_journal_entries_tenant_session` ON (tenant_id, close_session_id)
- `idx_journal_entries_created_at` ON (tenant_id, created_at DESC)

**Audit Ledger** (051):
- `idx_audit_ledger_tenant_id` ON (tenant_id)
- `idx_audit_ledger_tenant_created` ON (tenant_id, created_at)
- `idx_audit_ledger_tenant_event` ON (tenant_id, event_type)

**Performance Indexes** (141):
- `idx_period_recons_tenant_period` ON (tenant_id, period_id)
- `idx_close_issues_tenant_period_status` ON (tenant_id, period_id, status)
- `idx_recon_requirements_tenant_entity` ON (tenant_id, entity_id)

**Partial Index** (112):
- `idx_variance_unexplained` ON (tenant_id, close_session_id) WHERE explanation IS NULL -- smart partial index for "find unexplained variances" queries.

### Missing Indexes

- `audit_ledger` has no index on `(tenant_id, created_at DESC)` for the chain enforcement trigger's `ORDER BY created_at DESC LIMIT 1`. The existing `idx_audit_ledger_tenant_created` is ASC. The trigger in 156 adds FOR UPDATE on this query, making index direction significant.
- `journal_entry_lines` has no tenant_id column and thus cannot be indexed on tenant. Queries that scan by je_id are fine (indexed), but any analytics query across all JE lines for a tenant would require a JOIN.

---

## 7. CONSTRAINTS -- Grade: B+

### Foreign Keys

Foreign key coverage is strong across the schema:
- `journal_entry_lines.je_id -> journal_entries.id` ON DELETE CASCADE
- `je_attachments.je_id -> journal_entries.id` ON DELETE CASCADE
- `tenant_recon_items.recon_id -> tenant_period_reconciliations.recon_id` ON DELETE CASCADE
- `tenant_period_reconciliations.period_id -> close_sessions.id`
- `tenant_period_reconciliations.requirement_id -> tenant_recon_requirements.requirement_id`
- `tenant_variance_analysis.close_session_id -> close_sessions.id` ON DELETE CASCADE
- `statement_lines.package_id -> statement_packages.id` ON DELETE CASCADE

### CHECK Constraints

Comprehensive CHECK constraints exist for:
- JE status lifecycle: `('draft','proposed','approved','posted','exported','rejected')`
- JE line non-negativity: `debit >= 0 AND credit >= 0`
- GL line mutual exclusivity: `debit = 0 OR credit = 0`
- Zero-zero rejection: `debit > 0 OR credit > 0` (NOT VALID)
- Confidence scores: `>= 0 AND <= 1`
- Risk scores: `>= 0 AND <= 100`
- Reconciliation statuses: `('not_started','in_progress','completed','approved')`
- Period ordering: `period_start <= period_end`
- Accounting basis: `('cash','accrual')`

### UNIQUE Constraints

- `(tenant_id, email)` on users
- `(tenant_id, period_label)` on period_locks
- `(tenant_id, period_label, entry_id, line_number)` on general_ledger
- `(period_id, account_code)` on tenant_period_reconciliations
- `(tenant_id, close_session_id, fs_line_id, statement)` on tenant_variance_analysis
- `(tenant_id, resource_type)` on approval_workflow_defs

### Missing Constraints

- **journal_entry_lines**: No constraint ensures `debit = 0 OR credit = 0` (mutual exclusivity). The GL has this but JE lines only check `>= 0`.
- **close_sessions**: No UNIQUE constraint on `(tenant_id, entity_id, period_start, period_end)` to prevent duplicate sessions. The application code checks for overlaps, but the DB does not enforce it.
- **statement_packages**: No constraint preventing modification of 'final' status packages.

---

## 8. CONNECTION MANAGEMENT -- Grade: B+

### Pool Configuration

From `src/db/index.ts`:

| Pool | Max Connections | Use Case |
|------|----------------|----------|
| Control pool | 20 | Auth, tenant lookup, control DB queries |
| Tenant core pool | 10 per tenant | Financial data, core operations |
| Tenant AI pool | 5 per tenant | AI writes (ai_call_log, proposals, HITL) |

### Pool Lifecycle

- **LRU eviction**: MAX_TENANT_POOLS = 50 pools cached. When exceeded, oldest pool is evicted via `pool.end()`. This prevents unbounded pool growth.
- **Separate LRU for AI pools**: Same MAX_TENANT_POOLS limit.
- **Graceful shutdown**: `closePool()` ends all pools (control + tenant + AI).
- **On-connect hook**: Sets search_path to `core, ai, audit, public` (or `ai, public` for AI pools).

### Concerns

1. **No idle timeout configured**: pg.Pool defaults to `idleTimeoutMillis = 10000` (10 seconds). For a multi-tenant system with 50+ pools, idle connections could accumulate. Each pool could hold up to its `max` connections, meaning worst case: 50 * 10 + 50 * 5 + 20 = 770 connections. Many managed Postgres services limit to 100-500.

2. **No connection timeout**: `connectionTimeoutMillis` is not set (defaults to 0 = no timeout). If the database is unreachable, pool.query() will hang indefinitely.

3. **No statement timeout**: `statement_timeout` is not set on the pool. Long-running queries could block the pool.

4. **Error handling on search_path**: The on-connect hook catches and silently swallows search_path failures. If schema migration has not run yet, queries may silently hit the wrong schema.

5. **LRU indexOf is O(n)**: The tenantPoolLru array uses `indexOf()` for LRU promotion, which is O(n) for n=50. Not a bottleneck at this scale, but a Map-based LRU would be cleaner.

6. **No pool health monitoring**: There is no periodic check for pool health, dead connections, or connection leak detection.

---

## Top 10 Database Risks

### 1. CRITICAL -- Migrations 148-173 Not Auto-Applied
The TENANT_MIGRATION_FILES array in `src/db/index.ts` stops at version 147. Migrations 148-173 (including pgvector, XBRL taxonomy, EBITDA addbacks, period budgets) are never applied by `runTenantMigrations()`. These migrations only run if manually applied.

### 2. HIGH -- No Tenant Scoping on journal_entry_lines Queries
`listJournalEntryLines()` and `listJournalEntryLinesBatch()` query by je_id without tenant_id filter. If an attacker discovers a valid je_id from another tenant, they could read its line items. In BYOD mode this is mitigated by physical separation; in shared-DB mode it is a data leakage risk.

### 3. HIGH -- Connection Pool Exhaustion Under Load
With 50 tenant pools * 10 connections = 500 core connections + 250 AI connections + 20 control = 770 potential connections. Most managed Postgres instances cap at 100-500 connections. No connection timeout means hangs under DB pressure.

### 4. MEDIUM -- Missing Gap in Migration Sequence (157-163)
Seven consecutive migrations are missing. If these were applied in any environment and then deleted from the codebase, those environments have schema_migrations entries for versions that no longer exist, preventing rollback or audit.

### 5. MEDIUM -- Bare NUMERIC Columns Remain
Several columns still use bare NUMERIC without precision: materiality_threshold (067), current_ratio (055), terminal_growth_rate (056). While not all are money columns, materiality_threshold is financial and could produce unexpected precision behavior.

### 6. MEDIUM -- No Immutability on Certified Close Sessions
A certified close_session can theoretically be updated or deleted via direct SQL. The application enforces the state machine, but there is no database trigger preventing `UPDATE close_sessions SET status = 'draft' WHERE status = 'certified'`.

### 7. MEDIUM -- No Immutability on General Ledger for Certified Periods
GL data for a certified period has no trigger protection. While the derived period_trial_balance is protected, the source general_ledger rows can be modified. This could create a discrepancy between the certified TB and the underlying GL.

### 8. MEDIUM -- Audit Ledger Chain Trigger Performance
The chain enforcement trigger (156) does `SELECT ... ORDER BY created_at DESC LIMIT 1 FOR UPDATE` on every INSERT. For tenants with millions of audit entries, this relies on the `idx_audit_ledger_tenant_created` index. The index is ASC but the query needs DESC, which Postgres can handle via backward scan, but a dedicated DESC index would be more efficient.

### 9. LOW -- No Statement Timeout on DB Pools
A runaway query (e.g., a full table scan on general_ledger for a large tenant) could hold a connection indefinitely, starving the pool. Setting `statement_timeout` at the pool level would provide a safety net.

### 10. LOW -- ON DELETE CASCADE on Financial Tables
Several financial tables use ON DELETE CASCADE (je_attachments, journal_entry_lines, tenant_recon_items). While the immutability triggers prevent deletion of posted JEs, draft JEs can be cascade-deleted without audit trail. Consider soft deletes for financial audit compliance.

---

## What the Schema Does Well

1. **Immutability triggers are best-in-class.** The layered protection (audit_ledger append-only, JE immutability after posting, certification artifact immutability, period TB protection when certified) demonstrates serious audit thinking. The defense-in-depth approach (triggers + application checks) is exactly right.

2. **Hash-chained audit ledger with FOR UPDATE concurrency control.** This is production-grade tamper-evident logging. The v1/v2 hash versioning for backward compatibility, canonical key sorting for deterministic hashing, and checkpoint-based incremental verification are all well-engineered.

3. **GENERATED ALWAYS columns for financial calculations.** Using database-computed variance, tolerance check, and unexplained variance eliminates an entire class of application-level calculation bugs. The formula fix in migration 123 (with clear comments explaining the bug) shows mature engineering.

4. **AI boundary via schema-level RBAC.** Physically preventing AI from writing to core financial tables (core_writer vs ai_writer roles, separate schemas) is a much stronger guarantee than application-level checks.

5. **Comprehensive CHECK constraints.** Status enums, non-negativity checks, mutual exclusivity (debit OR credit, not both), and confidence score bounds are all properly constrained at the database level.

6. **Advisory locks for concurrent GL uploads.** The `pg_advisory_xact_lock(hashtext(tenantId || '::' || periodLabel))` pattern in the GL repository prevents race conditions during concurrent uploads for the same tenant+period.

7. **JE balance validation trigger.** Requiring debits = credits at the database level before posting is the correct place for this invariant. The service layer also checks, providing defense-in-depth.

8. **Covering index for trial balance derivation.** The `idx_gl_tb_covering` index with INCLUDE (debit, credit) avoids heap lookups during the most frequent aggregation query.

9. **Partial index for unexplained variances.** Indexing only rows WHERE explanation IS NULL is an efficient design for the "show me what still needs attention" query pattern.

10. **Destructive operation guards.** The `destructive_guards.ts` module refuses to run destructive operations in staging/production environments, with explicit URL pattern matching for production databases.

---

## Prioritized Recommendations

### P0 -- Fix Immediately

1. **Register migrations 148-173 in TENANT_MIGRATION_FILES** (src/db/index.ts). These migrations are not being auto-applied. Verify which environments have them applied and reconcile.

2. **Add connection timeout to all pools**: `connectionTimeoutMillis: 5000`. Prevents indefinite hangs when the database is unreachable.

3. **Add statement timeout**: Set `statement_timeout = '30s'` in pool configuration or via on-connect hook.

### P1 -- Fix This Sprint

4. **Add tenant_id to journal_entry_lines queries** or add a tenant_id column to the table. In shared-DB mode, `listJournalEntryLinesBatch` with a list of je_ids has no tenant boundary.

5. **Add immutability trigger for certified close_sessions.** Block UPDATE/DELETE when status IN ('certified', 'locked').

6. **Add immutability trigger for general_ledger in certified periods.** Similar pattern to the period_trial_balance trigger: check if linked close_session is certified.

### P2 -- Fix This Quarter

7. **Standardize remaining bare NUMERIC columns** to explicit precision. Create a migration similar to 121 for the remaining columns.

8. **Add max pool connections awareness.** Log a warning when total connections across all pools approaches a configured threshold (e.g., 80% of max_connections on the Postgres server).

9. **Investigate and document the 157-163 migration gap.** If these were intentionally skipped, add placeholder files documenting why.

10. **Add mutual exclusivity constraint to journal_entry_lines**: `CHECK (debit = 0 OR credit = 0)` to match the GL table's constraint.
