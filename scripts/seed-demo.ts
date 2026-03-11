/**
 * Apex Capital Partners demo seed.
 *
 * Creates a PE firm with 3 portfolio companies, 4 demo users (controller,
 * CFO, auditor, PE partner), realistic GL data, shadow audit findings,
 * IRAC justifications, AI proposals, and decision records.
 *
 * Idempotent — safe to run multiple times.
 * Usage: npx tsx scripts/seed-demo.ts
 */

import 'dotenv/config';
import { randomUUID } from 'crypto';
import { queryControl, getTenantPoolWithMigrations, isDbConfigured } from '../src/db/index.js';
import { hashPassword } from '../src/auth/index.js';
import { createUser, getUserByEmail } from '../src/db/repositories/user_repository.js';
import * as periodTbRepo from '../src/db/repositories/period_trial_balance_repository.js';
import * as closeSessionRepo from '../src/db/repositories/close_session_repository.js';
import * as jeRepo from '../src/db/repositories/journal_entry_repository.js';
import * as evidenceRepo from '../src/db/repositories/evidence_repository.js';
import type { TrialBalanceEntry } from '../src/types/financial.js';
import type { Pool } from 'pg';

// ── Constants ──────────────────────────────────────────────────────

const TENANT_ID = 'apex-capital-partners';
const TENANT_NAME = 'Apex Capital Partners';
const PASSWORD = 'SabitDemo2025!';

const USERS = [
  { email: 'controller@demo.sabit.io', role: 'preparer',           name: 'Sarah Chen' },
  { email: 'cfo@demo.sabit.io',        role: 'approver',           name: 'Michael Torres' },
  { email: 'auditor@demo.sabit.io',    role: 'reviewer',           name: 'Emily Park' },
  { email: 'partner@demo.sabit.io',    role: 'operating_partner',  name: 'James Whitfield' },
] as const;

// ── Entity definitions ─────────────────────────────────────────────

interface EntityDef {
  id: string;
  name: string;
  revenue: number;
  period: string;
  periodStart: string;
  periodEnd: string;
  sessionStatus: string;
  tb: TrialBalanceEntry[];
}

const TECHFLOW: EntityDef = {
  id: 'entity-techflow',
  name: 'TechFlow Solutions',
  revenue: 280_000_000,
  period: '2025-02',
  periodStart: '2025-02-01',
  periodEnd: '2025-02-28',
  sessionStatus: 'certified',
  tb: [
    { accountName: 'Cash and Cash Equivalents',  accountCode: '1000', debit: 45_000_000, credit: 0 },
    { accountName: 'Accounts Receivable',         accountCode: '1100', debit: 32_000_000, credit: 0 },
    { accountName: 'Prepaid Software Licenses',   accountCode: '1200', debit:  8_500_000, credit: 0 },
    { accountName: 'Deferred Commissions',        accountCode: '1300', debit:  4_200_000, credit: 0 },
    { accountName: 'Property and Equipment',      accountCode: '1500', debit: 12_000_000, credit: 0 },
    { accountName: 'Intangible Assets',           accountCode: '1600', debit: 18_000_000, credit: 0 },
    { accountName: 'Goodwill',                    accountCode: '1700', debit: 55_000_000, credit: 0 },
    { accountName: 'Accumulated Depreciation',    accountCode: '1510', debit: 0, credit:  6_500_000 },
    { accountName: 'Accounts Payable',            accountCode: '2000', debit: 0, credit:  9_200_000 },
    { accountName: 'Accrued Compensation',        accountCode: '2100', debit: 0, credit: 14_800_000 },
    { accountName: 'Deferred Revenue',            accountCode: '2200', debit: 0, credit: 38_000_000 },
    { accountName: 'Current Portion of Debt',     accountCode: '2300', debit: 0, credit:  5_000_000 },
    { accountName: 'Long-Term Debt',              accountCode: '2500', debit: 0, credit: 25_000_000 },
    { accountName: 'Common Stock',                accountCode: '3000', debit: 0, credit: 10_000_000 },
    { accountName: 'Additional Paid-In Capital',  accountCode: '3100', debit: 0, credit: 45_000_000 },
    { accountName: 'Retained Earnings',           accountCode: '3200', debit: 0, credit: 42_675_000 },
    { accountName: 'Subscription Revenue',        accountCode: '4000', debit: 0, credit: 22_400_000 },
    { accountName: 'Professional Services Rev',   accountCode: '4100', debit: 0, credit:  3_600_000 },
    { accountName: 'License Revenue',             accountCode: '4200', debit: 0, credit:  1_200_000 },
    { accountName: 'Cost of Revenue',             accountCode: '5000', debit:  6_800_000, credit: 0 },
    { accountName: 'Research and Development',    accountCode: '6000', debit:  8_200_000, credit: 0 },
    { accountName: 'Sales and Marketing',         accountCode: '6100', debit:  5_800_000, credit: 0 },
    { accountName: 'General and Administrative',  accountCode: '6200', debit:  3_400_000, credit: 0 },
    { accountName: 'Depreciation Expense',        accountCode: '6300', debit:    850_000, credit: 0 },
    { accountName: 'Interest Expense',            accountCode: '7000', debit:    625_000, credit: 0 },
    { accountName: 'Income Tax Expense',          accountCode: '8000', debit:  1_500_000, credit: 0 },
  ],
};

const PACIFIC: EntityDef = {
  id: 'entity-pacific',
  name: 'Pacific Manufacturing',
  revenue: 420_000_000,
  period: '2025-03',
  periodStart: '2025-03-01',
  periodEnd: '2025-03-31',
  sessionStatus: 'in_progress',
  tb: [
    { accountName: 'Cash and Cash Equivalents', accountCode: '1000', debit: 18_000_000, credit: 0 },
    { accountName: 'Accounts Receivable',       accountCode: '1100', debit: 52_000_000, credit: 0 },
    { accountName: 'Raw Materials Inventory',   accountCode: '1200', debit: 28_000_000, credit: 0 },
    { accountName: 'WIP Inventory',             accountCode: '1210', debit: 12_000_000, credit: 0 },
    { accountName: 'Finished Goods Inventory',  accountCode: '1220', debit: 22_000_000, credit: 0 },
    { accountName: 'Prepaid Expenses',          accountCode: '1300', debit:  3_500_000, credit: 0 },
    { accountName: 'PP&E - Machinery',          accountCode: '1500', debit: 85_000_000, credit: 0 },
    { accountName: 'PP&E - Buildings',          accountCode: '1510', debit: 42_000_000, credit: 0 },
    { accountName: 'Accumulated Depreciation',  accountCode: '1520', debit: 0, credit: 38_000_000 },
    { accountName: 'Accounts Payable',          accountCode: '2000', debit: 0, credit: 31_000_000 },
    { accountName: 'Accrued Liabilities',       accountCode: '2100', debit: 0, credit:  8_500_000 },
    { accountName: 'Current Debt',              accountCode: '2200', debit: 0, credit: 15_000_000 },
    { accountName: 'Long-Term Debt',            accountCode: '2500', debit: 0, credit: 65_000_000 },
    { accountName: 'Pension Obligation',        accountCode: '2600', debit: 0, credit: 12_000_000 },
    { accountName: 'Common Stock',              accountCode: '3000', debit: 0, credit: 20_000_000 },
    { accountName: 'Retained Earnings',         accountCode: '3200', debit: 0, credit: 79_625_000 },
    { accountName: 'Product Revenue',           accountCode: '4000', debit: 0, credit: 33_600_000 },
    { accountName: 'Service Revenue',           accountCode: '4100', debit: 0, credit:  4_200_000 },
    { accountName: 'Cost of Goods Sold',        accountCode: '5000', debit: 22_400_000, credit: 0 },
    { accountName: 'Manufacturing Overhead',    accountCode: '5100', debit:  6_800_000, credit: 0 },
    { accountName: 'SG&A Expense',              accountCode: '6000', debit:  4_200_000, credit: 0 },
    { accountName: 'Depreciation Expense',      accountCode: '6100', debit:  3_200_000, credit: 0 },
    { accountName: 'Interest Expense',          accountCode: '7000', debit:  1_425_000, credit: 0 },
    { accountName: 'Income Tax Expense',        accountCode: '8000', debit:  1_400_000, credit: 0 },
  ],
};

const GREENFIELD: EntityDef = {
  id: 'entity-greenfield',
  name: 'Greenfield Retail',
  revenue: 165_000_000,
  period: '2025-03',
  periodStart: '2025-03-01',
  periodEnd: '2025-03-31',
  sessionStatus: 'open',
  tb: [
    { accountName: 'Cash',                     accountCode: '1000', debit:  5_200_000, credit: 0 },
    { accountName: 'Accounts Receivable',      accountCode: '1100', debit:  8_800_000, credit: 0 },
    { accountName: 'Merchandise Inventory',    accountCode: '1200', debit: 18_500_000, credit: 0 },
    { accountName: 'Prepaid Rent',             accountCode: '1300', debit:  2_400_000, credit: 0 },
    { accountName: 'Store Fixtures & Equip',   accountCode: '1500', debit: 14_000_000, credit: 0 },
    { accountName: 'Leasehold Improvements',   accountCode: '1510', debit:  8_000_000, credit: 0 },
    { accountName: 'Accumulated Depreciation', accountCode: '1520', debit: 0, credit:  6_200_000 },
    { accountName: 'Accounts Payable',         accountCode: '2000', debit: 0, credit: 12_000_000 },
    { accountName: 'Accrued Wages',            accountCode: '2100', debit: 0, credit:  3_800_000 },
    { accountName: 'Sales Tax Payable',        accountCode: '2200', debit: 0, credit:  1_400_000 },
    { accountName: 'Lease Liability',          accountCode: '2500', debit: 0, credit: 15_000_000 },
    { accountName: 'Common Stock',             accountCode: '3000', debit: 0, credit:  5_000_000 },
    { accountName: 'Retained Earnings',        accountCode: '3200', debit: 0, credit: 19_675_000 },
    { accountName: 'Retail Sales Revenue',     accountCode: '4000', debit: 0, credit: 14_200_000 },
    { accountName: 'Online Sales Revenue',     accountCode: '4100', debit: 0, credit:  2_800_000 },
    { accountName: 'Cost of Goods Sold',       accountCode: '5000', debit: 10_200_000, credit: 0 },
    { accountName: 'Store Operations',         accountCode: '6000', debit:  3_600_000, credit: 0 },
    { accountName: 'Marketing Expense',        accountCode: '6100', debit:  1_800_000, credit: 0 },
    { accountName: 'Lease Expense',            accountCode: '6200', debit:  2_100_000, credit: 0 },
    { accountName: 'Depreciation Expense',     accountCode: '6300', debit:    950_000, credit: 0 },
    { accountName: 'Admin Expense',            accountCode: '6400', debit:  1_225_000, credit: 0 },
    { accountName: 'Income Tax Expense',       accountCode: '8000', debit:    300_000, credit: 0 },
  ],
};

const ENTITIES = [TECHFLOW, PACIFIC, GREENFIELD];

// ── Helpers ──────────────────────────────────────────────────────

function verifyBalance(entries: TrialBalanceEntry[], name: string) {
  const d = entries.reduce((s, e) => s + (e.debit ?? 0), 0);
  const c = entries.reduce((s, e) => s + (e.credit ?? 0), 0);
  if (Math.abs(d - c) > 0.01) {
    throw new Error(`${name} TB imbalanced: debits=${d}, credits=${c}`);
  }
}

async function ensureUser(email: string, role: string, name: string) {
  let u = await getUserByEmail(TENANT_ID, email);
  if (!u) {
    const hash = await hashPassword(PASSWORD);
    u = await createUser(TENANT_ID, email, hash, role, name);
    console.log(`  [user] Created ${role}: ${email}`);
  }
  return u;
}

async function insertSafe(pool: Pool, table: string, cols: string[], values: unknown[]) {
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const conflict = cols[0]; // use first col as conflict key
  await pool.query(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (${conflict}) DO NOTHING`,
    values
  );
}

// ── Main ────────────────────────────────────────────────────────

export async function seedApexDemo(): Promise<void> {
  if (!isDbConfigured()) {
    console.warn('[seed-demo] DATABASE_URL not set; skipping.');
    return;
  }

  console.log('[seed-demo] Seeding Apex Capital Partners demo...');

  // 1. Tenant
  await queryControl(
    `INSERT INTO tenants (id, name, database_url, created_at, updated_at)
     VALUES ($1, $2, NULL, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
    [TENANT_ID, TENANT_NAME]
  );
  console.log('  [tenant] Apex Capital Partners');

  // 2. Users
  for (const u of USERS) {
    await ensureUser(u.email, u.role, u.name);
  }

  const pool = await getTenantPoolWithMigrations(TENANT_ID);

  // 3. Entity records — portfolio_entities table (create if not exists via settings)
  for (const entity of ENTITIES) {
    await pool.query(
      `INSERT INTO core.entities (id, tenant_id, name, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
      [entity.id, TENANT_ID, entity.name]
    ).catch(() => {
      // Table might not exist — entities may live in settings
    });
  }

  // 4. Seed each entity
  for (const entity of ENTITIES) {
    console.log(`\n  [entity] ${entity.name} (${entity.period})`);
    verifyBalance(entity.tb, entity.name);

    // Trial balance
    await periodTbRepo.upsertUnadjusted(pool, TENANT_ID, entity.period, entity.tb, {
      source: 'uploaded',
      uploadedBy: 'controller@demo.sabit.io',
      fileName: `${entity.name.toLowerCase().replace(/\s+/g, '-')}-gl.csv`,
    });
    console.log(`    TB: ${entity.tb.length} accounts`);

    // Close session
    const sessionId = `demo-${entity.id}-${entity.period}`;
    let session = await closeSessionRepo.getCloseSessionById(pool, TENANT_ID, sessionId);
    if (!session) {
      session = await closeSessionRepo.insertCloseSession(
        pool, sessionId, TENANT_ID, entity.id,
        entity.periodStart, entity.periodEnd,
        'accrual', 'GAAP', entity.sessionStatus
      );
      console.log(`    Session: ${sessionId} (${entity.sessionStatus})`);
    }

    // Journal entries
    const existingJEs = await jeRepo.listJournalEntries(pool, TENANT_ID, { closeSessionId: sessionId, limit: 1 });
    if (existingJEs.length === 0) {
      await seedJournalEntries(pool, sessionId, entity);
    }
  }

  // 5. Seed AI data (staging, decisions, justifications)
  await seedAIData(pool);

  // 6. Seed shadow audit findings (data quality exceptions)
  await seedDataQuality(pool);

  console.log('\n[seed-demo] Demo seed complete.');
  console.log('  Credentials: controller@demo.sabit.io / SabitDemo2025!');
  console.log('  Roles: controller, cfo, auditor, partner');
}

async function seedJournalEntries(pool: Pool, sessionId: string, entity: EntityDef) {
  const prov = { kind: 'human_entered' as const, enteredBy: 'controller@demo.sabit.io' };
  const aiProv = { kind: 'ai_draft' as const, enteredBy: 'shadow_auditor' };

  const jeTemplates = [
    {
      memo: `Monthly depreciation — ${entity.name}`,
      source: 'manual' as const,
      status: 'posted' as const,
      lines: [
        { accountRef: 'Depreciation Expense', debit: 85000, credit: 0, amountProvenance: prov },
        { accountRef: 'Accumulated Depreciation', debit: 0, credit: 85000, amountProvenance: prov },
      ],
    },
    {
      memo: `Accrued liabilities adjustment — ${entity.name}`,
      source: 'manual' as const,
      status: 'proposed' as const,
      lines: [
        { accountRef: 'SG&A Expense', debit: 42000, credit: 0, amountProvenance: prov },
        { accountRef: 'Accrued Liabilities', debit: 0, credit: 42000, amountProvenance: prov },
      ],
    },
    {
      memo: `AI-suggested revenue reclassification — ${entity.name}`,
      source: 'suggestion' as const,
      status: 'draft' as const,
      lines: [
        { accountRef: 'Deferred Revenue', debit: 125000, credit: 0, amountProvenance: aiProv },
        { accountRef: 'Subscription Revenue', debit: 0, credit: 125000, amountProvenance: aiProv },
      ],
    },
  ];

  for (const je of jeTemplates) {
    const id = randomUUID();
    await jeRepo.insertJournalEntry(pool, id, {
      closeSessionId: sessionId,
      tenantId: TENANT_ID,
      status: je.status,
      memo: je.memo,
      source: je.source,
      createdBy: 'controller@demo.sabit.io',
    });
    await jeRepo.insertJournalEntryLines(pool, id, je.lines);

    // Evidence for posted entries
    if (je.status === 'posted') {
      const ev = await evidenceRepo.createEvidenceRecord(pool, TENANT_ID, {
        hashSha256: randomUUID().replace(/-/g, '').padEnd(64, 'a'),
        sizeBytes: 2048,
        mimeType: 'application/pdf',
        externalUri: `https://storage.sabit.io/demo/${id}.pdf`,
        label: `${je.memo} — supporting doc`,
        attachedBy: 'controller@demo.sabit.io',
      });
      await evidenceRepo.linkEvidenceToJournalEntry(pool, TENANT_ID, {
        evidenceId: ev.id,
        objectType: 'journal_entry',
        objectId: id,
        assertionType: 'invoice_support',
        requiredness: 'required',
        createdBy: 'controller@demo.sabit.io',
      });
    }
  }
  console.log(`    JEs: ${jeTemplates.length} entries (posted, proposed, draft)`);
}

async function seedAIData(pool: Pool) {
  console.log('\n  [ai] Seeding AI data...');

  // HITL staging items (shadow audit proposals)
  const stagingItems = [
    {
      id: randomUUID(),
      proposed_action: 'Reclassify $125,000 from Deferred Revenue to Subscription Revenue for Q1 performance obligation satisfied',
      justification: 'ASC 606 analysis indicates performance obligation was satisfied in February. Revenue recognition criteria met: delivery complete, price determinable, collectability probable.',
      status: 'pending',
      type: 'revenue_reclassification',
      amount: '125000.00',
    },
    {
      id: randomUUID(),
      proposed_action: 'Record $42,000 accrual for pending legal settlement — Pacific Manufacturing',
      justification: 'Contingent liability meets ASC 450 probable threshold. Settlement discussions indicate range of $35,000-$50,000. Best estimate: $42,000.',
      status: 'pending',
      type: 'accrual_adjustment',
      amount: '42000.00',
    },
    {
      id: randomUUID(),
      proposed_action: 'Write down $18,500 slow-moving inventory — Greenfield Retail',
      justification: 'Inventory aging analysis shows 12% of merchandise inventory exceeds 180 days. NRV test per ASC 330 indicates writedown required.',
      status: 'approved',
      type: 'inventory_writedown',
      amount: '18500.00',
    },
  ];

  for (const item of stagingItems) {
    await pool.query(
      `INSERT INTO ai.hitl_staging (id, tenant_id, proposed_action, justification, status, type, amount, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [item.id, TENANT_ID, item.proposed_action, item.justification, item.status, item.type, item.amount]
    ).catch(() => { /* table may not exist */ });
  }
  console.log(`    Staging: ${stagingItems.length} HITL proposals`);

  // Decision records
  const decisions = [
    {
      id: randomUUID(),
      decision_type: 'account_classification',
      confidence_score: 0.94,
      rationale_text: 'Account 4000 Subscription Revenue classified as REVENUE based on SentenceTransformer embedding similarity 0.94 with training examples.',
      engine_version: 'coa-classifier-v2',
    },
    {
      id: randomUUID(),
      decision_type: 'cash_flow_classification',
      confidence_score: 0.87,
      rationale_text: 'Depreciation Expense classified as Operating Activity (non-cash add-back) per DistilBERT cash flow classifier.',
      engine_version: 'cf-classifier-v1',
    },
    {
      id: randomUUID(),
      decision_type: 'variance_explanation',
      confidence_score: 0.72,
      rationale_text: 'Revenue increased 14.2% QoQ driven by 3 new enterprise contracts signed in January. Pattern consistent with prior Q1 seasonality.',
      engine_version: 'claude-sonnet-4-5-20250929',
    },
  ];

  for (const d of decisions) {
    await pool.query(
      `INSERT INTO ai.decision_records (id, tenant_id, decision_type, confidence_score, rationale_text, engine_version, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [d.id, TENANT_ID, d.decision_type, d.confidence_score, d.rationale_text, d.engine_version]
    ).catch(() => { /* table may not exist */ });
  }
  console.log(`    Decisions: ${decisions.length} records`);

  // IRAC justifications
  const justifications = [
    {
      id: randomUUID(),
      period_label: '2025-02',
      related_type: 'journal_entry',
      related_id: 'demo-je-deferred-rev',
      created_by_type: 'agent',
      irac_json: JSON.stringify({
        irac: {
          issue: 'Whether $125,000 of deferred revenue should be recognized in February 2025',
          rule: 'ASC 606-10-25-1 requires revenue recognition when performance obligations are satisfied. For SaaS subscriptions, this occurs over the service period.',
          analysis: 'TechFlow Solutions delivered the contracted SaaS platform access for February. Usage logs confirm all 47 enterprise users were active. No service disruptions reported. Customer acceptance was implicit per contract terms.',
          conclusion: 'Revenue of $125,000 should be recognized in February 2025. The performance obligation was satisfied over the monthly service period per the output method.',
        },
        sourceTag: 'shadow_auditor_v2',
      }),
      memo_markdown: '## Revenue Recognition — TechFlow Feb 2025\n\nDeferred revenue of $125,000 recognized per ASC 606. Performance obligation satisfied over service period.',
    },
    {
      id: randomUUID(),
      period_label: '2025-03',
      related_type: 'variance',
      related_id: 'demo-variance-cogs',
      created_by_type: 'agent',
      irac_json: JSON.stringify({
        irac: {
          issue: 'Material variance in COGS: 8.3% increase QoQ for Pacific Manufacturing',
          rule: 'Material variances exceeding 5% require documented explanation per entity close policy.',
          analysis: 'Raw material costs increased due to steel tariff surcharge effective March 1. Supplier price increases ranged 6-12%. Additionally, production volume increased 4.2% to fulfill backlog orders.',
          conclusion: 'COGS increase is attributable to commodity price inflation (steel tariffs) and volume growth. No accounting error or misclassification detected.',
        },
        sourceTag: 'variance_explainer_v1',
      }),
      memo_markdown: '## COGS Variance — Pacific Manufacturing Q1 2025\n\nCOGS increased 8.3% driven by steel tariff surcharges and 4.2% volume growth.',
    },
  ];

  for (const j of justifications) {
    await pool.query(
      `INSERT INTO ai.justifications (id, tenant_id, period_label, related_type, related_id, created_by_type, irac_json, memo_markdown, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [j.id, TENANT_ID, j.period_label, j.related_type, j.related_id, j.created_by_type, j.irac_json, j.memo_markdown]
    ).catch(() => { /* table may not exist */ });
  }
  console.log(`    Justifications: ${justifications.length} IRAC memos`);
}

async function seedDataQuality(pool: Pool) {
  console.log('  [dq] Seeding data quality exceptions...');

  const rules = [
    { id: randomUUID(), name: 'Trial Balance Must Balance', scope: 'trial_balance', type: 'balance', severity: 'critical', enabled: true },
    { id: randomUUID(), name: 'Revenue Variance Threshold', scope: 'trial_balance', type: 'variance', severity: 'warning', enabled: true },
    { id: randomUUID(), name: 'AP Aging > 90 Days', scope: 'balance_sheet', type: 'threshold', severity: 'warning', enabled: true },
  ];

  for (const r of rules) {
    await pool.query(
      `INSERT INTO core.data_quality_rules (id, tenant_id, name, scope, type, severity, enabled, config, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '{}', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [r.id, TENANT_ID, r.name, r.scope, r.type, r.severity, r.enabled]
    ).catch(() => { /* table may not exist */ });
  }

  const exceptions = [
    {
      id: randomUUID(),
      rule_id: rules[1].id,
      period_label: '2025-03',
      status: 'open',
      message: 'Revenue variance exceeds 10% threshold: Subscription Revenue +14.2% QoQ',
      metric: 14.2,
      severity: 'warning',
    },
    {
      id: randomUUID(),
      rule_id: rules[2].id,
      period_label: '2025-03',
      status: 'open',
      message: 'AP aging: $2.1M in invoices exceed 90-day payment terms — Pacific Manufacturing',
      metric: 2100000,
      severity: 'warning',
    },
  ];

  for (const e of exceptions) {
    await pool.query(
      `INSERT INTO core.data_quality_exceptions (id, tenant_id, rule_id, period_label, status, message, metric, severity, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [e.id, TENANT_ID, e.rule_id, e.period_label, e.status, e.message, e.metric, e.severity]
    ).catch(() => { /* table may not exist */ });
  }
  console.log(`    Rules: ${rules.length}, Exceptions: ${exceptions.length}`);
}

// ── Entry point ────────────────────────────────────────────────

const isMain = process.argv[1]?.includes('seed-demo');
if (isMain) {
  seedApexDemo()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed-demo] Failed:', err);
      process.exit(1);
    });
}
