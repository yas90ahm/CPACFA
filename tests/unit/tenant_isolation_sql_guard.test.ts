/**
 * Regression guard: prevents unscoped tenant queries in repositories.
 *
 * Scans src/db/repositories/*.ts for SQL that touches tenant-owned tables.
 * Fails if a SELECT/UPDATE/DELETE lacks tenant scoping (tenant_id predicate or
 * JOIN to close_sessions/journal_entries with tenant_id).
 *
 * Allowlisted exceptions are documented with justification.
 * See TENANT_ISOLATION_SQL_AUDIT.md and TENANT_ISOLATION_FIXES_CHECKLIST.md.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const REPOS_DIR = join(process.cwd(), 'src', 'db', 'repositories');

/** Tables that store tenant data and MUST be scoped in SELECT/UPDATE/DELETE. */
const TENANT_OWNED_TABLES = new Set([
  'accounting_connections',
  'audit_ledger',
  'audit_log',
  'certification_artifacts',
  'close_adjustments',
  'close_checklist_items',
  'close_sessions',
  'coa_mapping_rules',
  'decision_records',
  'evidence_links',
  'evidence_records',
  'issue_items',
  'je_attachments',
  'journal_entries',
  'journal_entry_lines',
  'ledger_snapshots',
  'period_export_checks',
  'period_locks',
  'period_trial_balance',
  'recon_exceptions',
  'recon_items',
  'recon_match_group_items',
  'recon_match_groups',
  'recon_runs',
  'recon_signoffs',
  'statement_diffs',
  'statement_lines',
  'statement_packages',
  'tenant_justifications',
  'triage_assessments',
  'users',
  // Additional tenant tables from migrations
  'depreciation_run_details',
  'depreciation_runs',
  'equity_method_investments',
  'equity_method_income',
  'professional_audit_flags',
  'approval_requests',
  'period_close',
  'close_checklist_templates',
  'tenant_hitl_staging',
  'tenant_ai_proposals',
  'ai_call_log',
  'tenant_supervisor_sessions',
  'tenant_session_uploads',
  'sampling_results',
  'data_catalog',
  'risk_context_qualitative_evidence',
  'tenant_shadow_audit_findings',
  'tenant_financial_config',
  'tenant_policy_memory',
  'control_assertions',
  'onboarding_state',
]);

/**
 * Allowlist: (file pattern, table or regex, reason).
 * Queries matching these are NOT required to have tenant scoping.
 */
const ALLOWLIST: Array<{ file: string; tableOrPattern: string | RegExp; reason: string }> = [
  { file: 'job_repository.ts', tableOrPattern: 'jobs', reason: 'Control DB; system-wide job queue. No tenant_id column.' },
  { file: 'fs_taxonomy_repository.ts', tableOrPattern: 'fs_taxonomy_lines', reason: 'Shared reference data; no tenant_id in schema.' },
  { file: 'user_repository.ts', tableOrPattern: /users.*WHERE email = \$1/, reason: 'getUserByEmailOnly: intentional for wedge login when tenant unknown.' },
  { file: 'approval_request_repository.ts', tableOrPattern: 'approval_request_events', reason: 'Child of approval_requests; INSERT only; parent has tenant_id.' },
  { file: 'user_repository.ts', tableOrPattern: /users.*WHERE id = \$1(?!.*tenant_id)/, reason: 'getUserById without tenantId: fallback when tenant context unavailable (caller must validate).' },
];

/** Patterns that indicate proper tenant scoping. */
const SCOPING_PATTERNS = [
  /\btenant_id\s*=\s*\$/,                    // WHERE tenant_id = $1 or AND tenant_id = $2
  /\btenant_id\s*=\s*\$[0-9]+/,              // tenant_id = $N
  /\btenant_id\s*=\s*\$PLACEHOLDER/,         // Dynamic: tenant_id = $${idx} → $PLACEHOLDER
  /\bcs\.tenant_id\s*=\s*\$/,                // JOIN close_sessions cs ... WHERE cs.tenant_id = $1
  /\bje\.tenant_id\s*=\s*\$/,                // JOIN journal_entries je ... WHERE je.tenant_id = $1
  /\bdr\.tenant_id\s*=\s*\$/,                // JOIN depreciation_runs dr
  /\bsp\d?\.close_session_id/,               // JOIN statement_packages (validates via close_sessions)
  /JOIN\s+close_sessions\s+cs\b/,            // JOIN to close_sessions (tenant-scoped parent)
  /FROM\s+close_sessions\s+cs\b/,            // UPDATE ... FROM close_sessions cs (PostgreSQL)
  /JOIN\s+journal_entries\s+je\b/,           // JOIN to journal_entries (tenant-scoped parent)
  /JOIN\s+recon_runs\s+rr\b/,                // JOIN to recon_runs (chain to close_sessions)
  /JOIN\s+depreciation_runs\s+dr\b/,         // JOIN to depreciation_runs
  /JOIN\s+statement_packages\s+sp/,          // JOIN to statement_packages (chain to close_sessions)
  /INSERT\s+INTO\s+\w+\s*\([^)]*tenant_id/,  // INSERT includes tenant_id column
];

function extractSqlStrings(content: string): Array<{ sql: string; line: number }> {
  const results: Array<{ sql: string; line: number }> = [];
  const seen = new Set<string>();
  const fullContent = content;

  const add = (sql: string, lineNum: number) => {
    const key = `${lineNum}:${sql}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ sql: sql.replace(/\$\{[^}]*\}/g, 'PLACEHOLDER'), line: lineNum });
  };

  // Template literals: backtick-delimited only (avoids truncation at ' or " inside SQL)
  const backtickRegex = /\.(query|queryControl)\s*\(\s*`([\s\S]*?)`\s*(?:,|\))/g;
  let match;
  while ((match = backtickRegex.exec(fullContent)) !== null) {
    const lineNum = fullContent.substring(0, match.index).split('\n').length;
    add(match[2], lineNum);
  }

  // Single-quoted SQL (no nested unescaped ')
  const singleQuoteRegex = /\.(query|queryControl)\s*\(\s*'((?:[^'\\]|\\.)*)'\s*(?:,|\))/g;
  while ((match = singleQuoteRegex.exec(fullContent)) !== null) {
    const lineNum = fullContent.substring(0, match.index).split('\n').length;
    add(match[2], lineNum);
  }

  // Double-quoted SQL
  const doubleQuoteRegex = /\.(query|queryControl)\s*\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,|\))/g;
  while ((match = doubleQuoteRegex.exec(fullContent)) !== null) {
    const lineNum = fullContent.substring(0, match.index).split('\n').length;
    add(match[2], lineNum);
  }

  return results;
}

function tablesInQuery(sql: string): string[] {
  const tables: string[] = [];
  const fromMatch = sql.matchAll(/(?:FROM|JOIN|INTO|UPDATE)\s+(?:(\w+)\s+(?:as\s+)?\w+|\b(\w+)\b)/gi);
  for (const m of fromMatch) {
    const tbl = (m[1] ?? m[2])?.toLowerCase();
    if (tbl && !['select', 'where', 'set', 'values', 'on', 'and', 'or', 'order', 'limit', 'group', 'having'].includes(tbl)) {
      tables.push(tbl);
    }
  }
  return [...new Set(tables)];
}

function isSelectUpdateOrDelete(sql: string): boolean {
  const s = sql.trim().toLowerCase();
  return s.startsWith('select') || s.startsWith('update') || s.startsWith('delete');
}

function isScoped(sql: string): boolean {
  return SCOPING_PATTERNS.some((p) => p.test(sql));
}

function isAllowlisted(file: string, table: string, sql: string): boolean {
  return ALLOWLIST.some((a) => {
    if (!file.endsWith(a.file)) return false;
    if (typeof a.tableOrPattern === 'string') {
      return table === a.tableOrPattern || sql.toLowerCase().includes(a.tableOrPattern.toLowerCase());
    }
    return a.tableOrPattern.test(sql);
  });
}

describe('Tenant isolation SQL guard', () => {
  it('no repository has unscoped SELECT/UPDATE/DELETE on tenant-owned tables', () => {
    const violations: string[] = [];
    const files = readdirSync(REPOS_DIR).filter((f) => f.endsWith('.ts'));

    for (const file of files) {
      const path = join(REPOS_DIR, file);
      const content = readFileSync(path, 'utf8');
      const sqlBlocks = extractSqlStrings(content);

      for (const { sql, line } of sqlBlocks) {
        if (!isSelectUpdateOrDelete(sql)) continue;

        const tables = tablesInQuery(sql);
        for (const table of tables) {
          if (!TENANT_OWNED_TABLES.has(table)) continue;
          if (isAllowlisted(file, table, sql)) continue;
          if (isScoped(sql)) continue;

          violations.push(`${file}:${line} — ${table}: query lacks tenant scoping`);
        }
      }
    }

    const msg =
      violations.length > 0
        ? `Unscoped tenant queries found.\n${violations.join('\n')}\n\nAdd tenant_id predicate or JOIN to close_sessions/journal_entries. See TENANT_ISOLATION_SQL_AUDIT.md.`
        : '';
    expect(violations).toHaveLength(0);
    if (violations.length > 0) {
      throw new Error(msg);
    }
  });
});
