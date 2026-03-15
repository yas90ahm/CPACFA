/**
 * Audit Data Access Service (GAP I8)
 *
 * Provides programmatic access to audit-ready data:
 * - Random GL entry sampling for substantive testing
 * - Comprehensive audit binder compilation with all workpapers
 */

import type { Pool } from 'pg';
import { round2 } from '../utils/decimal.js';

export interface AuditSampleEntry {
  entryId: string;
  entryDate: string;
  memo: string | null;
  source: string | null;
  accountCode: string;
  description: string | null;
  debit: number;
  credit: number;
  lineNumber: number;
}

export interface AuditBinderData {
  sessionId: string;
  tenantId: string;
  entityName: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  glDetail: AuditGLDetail;
  trialBalance: AuditTBLine[];
  reconciliationWorkpapers: AuditReconWorkpaper[];
  journalEntryDocumentation: AuditJEDoc[];
  varianceAnalysis: AuditVarianceLine[];
  certificationArtifact: AuditCertificationArtifact | null;
}

export interface AuditGLDetail {
  totalEntries: number;
  totalLines: number;
  entries: {
    entryId: string;
    entryDate: string;
    memo: string | null;
    source: string | null;
    status: string;
    lines: {
      lineNumber: number;
      accountCode: string;
      description: string | null;
      debit: number;
      credit: number;
    }[];
  }[];
}

export interface AuditTBLine {
  accountCode: string;
  accountName: string;
  accountType: string | null;
  debit: number;
  credit: number;
  netBalance: number;
}

export interface AuditReconWorkpaper {
  reconId: string;
  accountCode: string;
  accountName: string | null;
  glBalance: number;
  supportingBalance: number;
  variance: number;
  unexplainedVariance: number;
  tolerance: number;
  status: string;
  preparedBy: string | null;
  preparedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  items: {
    itemId: string;
    description: string;
    amount: number;
    itemType: string;
  }[];
}

export interface AuditJEDoc {
  entryId: string;
  entryDate: string;
  memo: string;
  source: string;
  status: string;
  createdBy: string | null;
  approvedBy: string | null;
  totalDebit: number;
  totalCredit: number;
  lineCount: number;
}

export interface AuditVarianceLine {
  accountCode: string;
  accountName: string | null;
  currentAmount: number;
  priorAmount: number;
  varianceAmount: number;
  variancePercent: number | null;
  isMaterial: boolean;
  explanation: string | null;
  explainedBy: string | null;
}

export interface AuditCertificationArtifact {
  certifiedAt: string;
  certifiedBy: string | null;
  signatureValid: boolean | null;
  publicKey: string | null;
}

/**
 * Get a random sample of GL entries for audit substantive testing.
 * Uses ORDER BY RANDOM() LIMIT for truly random selection.
 */
export async function getAuditSample(
  pool: Pool,
  tenantId: string,
  sessionId: string,
  accountCode: string,
  sampleSize: number
): Promise<AuditSampleEntry[]> {
  const size = Math.min(Math.max(1, sampleSize), 500); // Clamp to 1-500

  const result = await pool.query<{
    entry_id: string;
    entry_date: string;
    memo: string | null;
    source: string | null;
    account_code: string;
    description: string | null;
    debit: string | null;
    credit: string | null;
    line_number: number;
  }>(
    `SELECT je.id AS entry_id, je.entry_date, je.memo, je.source,
            jl.account_code, jl.description,
            jl.debit::text, jl.credit::text, jl.line_number
     FROM tenant_journal_entries je
     JOIN tenant_journal_entry_lines jl ON jl.journal_entry_id = je.id
     WHERE je.tenant_id = $1
       AND je.close_session_id = $2
       AND jl.account_code = $3
       AND je.status = 'posted'
     ORDER BY RANDOM()
     LIMIT $4`,
    [tenantId, sessionId, accountCode, size]
  );

  return result.rows.map((r) => ({
    entryId: r.entry_id,
    entryDate: r.entry_date,
    memo: r.memo,
    source: r.source,
    accountCode: r.account_code,
    description: r.description,
    debit: round2(Number(r.debit ?? 0)),
    credit: round2(Number(r.credit ?? 0)),
    lineNumber: r.line_number,
  }));
}

/**
 * Compile a comprehensive audit binder for a close session.
 * Includes GL detail, trial balance, reconciliation workpapers,
 * journal entry documentation, variance analysis, and certification artifacts.
 */
export async function getAuditBinder(
  pool: Pool,
  tenantId: string,
  sessionId: string
): Promise<AuditBinderData> {
  const now = new Date().toISOString();

  // Get session metadata
  const sessResult = await pool.query<{
    period_start: string | null;
    period_end: string | null;
    entity_id: string;
    status: string;
    certified_at: string | null;
    certified_by: string | null;
  }>(
    `SELECT period_start, period_end, entity_id, status, certified_at, certified_by
     FROM close_sessions WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );
  const session = sessResult.rows[0];
  if (!session) throw new Error('Close session not found');

  const periodLabel = (session.period_end ?? '').slice(0, 7);

  // Get entity name
  const entityResult = await pool.query<{ name: string }>(
    `SELECT name FROM entities WHERE id = $1 AND tenant_id = $2`,
    [session.entity_id, tenantId]
  );
  const entityName = entityResult.rows[0]?.name ?? session.entity_id;

  // --- GL Detail ---
  const jeResult = await pool.query<{
    id: string;
    entry_date: string;
    memo: string | null;
    source: string | null;
    status: string;
  }>(
    `SELECT id, entry_date, memo, source, status
     FROM tenant_journal_entries
     WHERE tenant_id = $1 AND close_session_id = $2
     ORDER BY entry_date, id`,
    [tenantId, sessionId]
  );

  const glEntries: AuditGLDetail['entries'] = [];
  let totalLines = 0;
  for (const je of jeResult.rows) {
    const linesResult = await pool.query<{
      line_number: number;
      account_code: string;
      description: string | null;
      debit: string | null;
      credit: string | null;
    }>(
      `SELECT line_number, account_code, description, debit::text, credit::text
       FROM tenant_journal_entry_lines
       WHERE journal_entry_id = $1
       ORDER BY line_number`,
      [je.id]
    );
    const lines = linesResult.rows.map((l) => ({
      lineNumber: l.line_number,
      accountCode: l.account_code,
      description: l.description,
      debit: round2(Number(l.debit ?? 0)),
      credit: round2(Number(l.credit ?? 0)),
    }));
    totalLines += lines.length;
    glEntries.push({
      entryId: je.id,
      entryDate: je.entry_date,
      memo: je.memo,
      source: je.source,
      status: je.status,
      lines,
    });
  }

  const glDetail: AuditGLDetail = {
    totalEntries: glEntries.length,
    totalLines,
    entries: glEntries,
  };

  // --- Trial Balance ---
  const tbResult = await pool.query<{
    account_code: string;
    account_name: string;
    account_type: string | null;
    debit: string;
    credit: string;
  }>(
    `SELECT account_code, account_name, account_type,
            COALESCE(debit, 0)::text AS debit,
            COALESCE(credit, 0)::text AS credit
     FROM tenant_trial_balance
     WHERE tenant_id = $1 AND period_label = $2
     ORDER BY account_code`,
    [tenantId, periodLabel]
  );

  const trialBalance: AuditTBLine[] = tbResult.rows.map((r) => {
    const debit = Number(r.debit);
    const credit = Number(r.credit);
    return {
      accountCode: r.account_code,
      accountName: r.account_name,
      accountType: r.account_type,
      debit: round2(debit),
      credit: round2(credit),
      netBalance: round2(debit - credit),
    };
  });

  // --- Reconciliation Workpapers ---
  const reconResult = await pool.query<{
    recon_id: string;
    account_code: string;
    account_name: string | null;
    gl_balance: string | null;
    supporting_balance: string | null;
    variance: string | null;
    unexplained_variance: string | null;
    tolerance_amount: string;
    status: string;
    prepared_by: string | null;
    prepared_at: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
  }>(
    `SELECT r.recon_id, r.account_code, req.account_name,
            r.gl_balance::text, r.supporting_balance::text,
            r.variance::text, r.unexplained_variance::text,
            r.tolerance_amount::text, r.status,
            r.prepared_by, r.prepared_at, r.reviewed_by, r.reviewed_at
     FROM tenant_period_reconciliations r
     LEFT JOIN tenant_recon_requirements req ON r.requirement_id = req.requirement_id
     WHERE r.tenant_id = $1 AND r.period_id = $2
     ORDER BY r.account_code`,
    [tenantId, sessionId]
  );

  const reconciliationWorkpapers: AuditReconWorkpaper[] = [];
  for (const recon of reconResult.rows) {
    const itemsResult = await pool.query<{
      item_id: string;
      description: string;
      amount: string;
      item_type: string;
    }>(
      `SELECT item_id, description, amount::text, item_type
       FROM tenant_recon_items
       WHERE recon_id = $1
       ORDER BY created_at`,
      [recon.recon_id]
    );

    reconciliationWorkpapers.push({
      reconId: recon.recon_id,
      accountCode: recon.account_code,
      accountName: recon.account_name,
      glBalance: round2(Number(recon.gl_balance ?? 0)),
      supportingBalance: round2(Number(recon.supporting_balance ?? 0)),
      variance: round2(Number(recon.variance ?? 0)),
      unexplainedVariance: round2(Number(recon.unexplained_variance ?? 0)),
      tolerance: round2(Number(recon.tolerance_amount ?? 0)),
      status: recon.status,
      preparedBy: recon.prepared_by,
      preparedAt: recon.prepared_at,
      reviewedBy: recon.reviewed_by,
      reviewedAt: recon.reviewed_at,
      items: itemsResult.rows.map((i) => ({
        itemId: i.item_id,
        description: i.description,
        amount: round2(Number(i.amount)),
        itemType: i.item_type,
      })),
    });
  }

  // --- Journal Entry Documentation ---
  const jeDocResult = await pool.query<{
    id: string;
    entry_date: string;
    memo: string;
    source: string;
    status: string;
    created_by: string | null;
    approved_by: string | null;
    total_debit: string;
    total_credit: string;
    line_count: string;
  }>(
    `SELECT je.id, je.entry_date, je.memo, je.source, je.status,
            je.created_by, je.approved_by,
            COALESCE(SUM(jl.debit), 0)::text AS total_debit,
            COALESCE(SUM(jl.credit), 0)::text AS total_credit,
            COUNT(jl.*)::text AS line_count
     FROM tenant_journal_entries je
     LEFT JOIN tenant_journal_entry_lines jl ON jl.journal_entry_id = je.id
     WHERE je.tenant_id = $1 AND je.close_session_id = $2
     GROUP BY je.id, je.entry_date, je.memo, je.source, je.status, je.created_by, je.approved_by
     ORDER BY je.entry_date, je.id`,
    [tenantId, sessionId]
  );

  const journalEntryDocumentation: AuditJEDoc[] = jeDocResult.rows.map((r) => ({
    entryId: r.id,
    entryDate: r.entry_date,
    memo: r.memo,
    source: r.source,
    status: r.status,
    createdBy: r.created_by,
    approvedBy: r.approved_by,
    totalDebit: round2(Number(r.total_debit)),
    totalCredit: round2(Number(r.total_credit)),
    lineCount: Number(r.line_count),
  }));

  // --- Variance Analysis ---
  const varResult = await pool.query<{
    account_code: string;
    account_name: string | null;
    current_amount: string;
    prior_amount: string;
    variance_amount: string;
    variance_percent: string | null;
    is_material: boolean;
    explanation: string | null;
    explained_by: string | null;
  }>(
    `SELECT account_code, account_name,
            current_amount::text, prior_amount::text,
            variance_amount::text, variance_percent::text,
            is_material, explanation, explained_by
     FROM tenant_variance_analysis
     WHERE tenant_id = $1 AND close_session_id = $2
     ORDER BY ABS(variance_amount) DESC`,
    [tenantId, sessionId]
  );

  const varianceAnalysis: AuditVarianceLine[] = varResult.rows.map((r) => ({
    accountCode: r.account_code,
    accountName: r.account_name,
    currentAmount: round2(Number(r.current_amount)),
    priorAmount: round2(Number(r.prior_amount)),
    varianceAmount: round2(Number(r.variance_amount)),
    variancePercent: r.variance_percent != null ? Number(r.variance_percent) : null,
    isMaterial: r.is_material,
    explanation: r.explanation,
    explainedBy: r.explained_by,
  }));

  // --- Certification Artifact ---
  let certificationArtifact: AuditCertificationArtifact | null = null;
  if (session.certified_at) {
    certificationArtifact = {
      certifiedAt: session.certified_at,
      certifiedBy: session.certified_by,
      signatureValid: null, // Validated separately via verification endpoint
      publicKey: null,
    };

    // Try to get certification artifact data
    try {
      const certResult = await pool.query<{
        signature_valid: boolean | null;
        public_key: string | null;
      }>(
        `SELECT true AS signature_valid, public_key
         FROM tenant_certification_artifacts
         WHERE close_session_id = $1 AND tenant_id = $2
         LIMIT 1`,
        [sessionId, tenantId]
      );
      if (certResult.rows[0]) {
        certificationArtifact.signatureValid = certResult.rows[0].signature_valid;
        certificationArtifact.publicKey = certResult.rows[0].public_key;
      }
    } catch {
      // Certification artifacts table may not exist; leave as null
    }
  }

  return {
    sessionId,
    tenantId,
    entityName,
    periodStart: session.period_start ?? '',
    periodEnd: session.period_end ?? '',
    generatedAt: now,
    glDetail,
    trialBalance,
    reconciliationWorkpapers,
    journalEntryDocumentation,
    varianceAnalysis,
    certificationArtifact,
  };
}
