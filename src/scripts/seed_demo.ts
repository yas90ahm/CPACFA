/**
 * Demo seed: CloudMetrics Inc. tenant, demo user, sample TB, JEs, evidence, close session.
 * Idempotent — safe to run multiple times.
 * Run automatically when APP_MODE=demo, or manually: npx tsx src/scripts/seed_demo.ts
 */

import 'dotenv/config';
import { randomUUID } from 'crypto';
import { queryControl, getTenantPoolWithMigrations, isDbConfigured } from '../db/index.js';
import { hashPassword } from '../auth/index.js';
import { createUser, getUserByEmail } from '../db/repositories/user_repository.js';
import * as periodTbRepo from '../db/repositories/period_trial_balance_repository.js';
import * as closeSessionRepo from '../db/repositories/close_session_repository.js';
import * as jeRepo from '../db/repositories/journal_entry_repository.js';
import * as evidenceRepo from '../db/repositories/evidence_repository.js';
import type { TrialBalanceEntry } from '../types/financial.js';

const DEMO_TENANT_ID = 'demo-cloudmetrics';
const DEMO_TENANT_NAME = 'CloudMetrics Inc.';
const DEMO_USER_EMAIL = 'demo@cpacfa.com';
const DEMO_USER_PASSWORD = 'demo-password-change-me';
const DEMO_PERIOD = '2025-01';
const DEMO_ENTITY_ID = 'entity-1';

export async function seedDemo(): Promise<void> {
  if (!isDbConfigured()) {
    console.warn('[seed_demo] DATABASE_URL not set; skipping demo seed.');
    return;
  }

  // 1. Tenant
  await queryControl(
    `INSERT INTO tenants (id, name, database_url, created_at, updated_at)
     VALUES ($1, $2, NULL, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
    [DEMO_TENANT_ID, DEMO_TENANT_NAME]
  );

  // 2. Demo user (idempotent: create only if not exists)
  let user = await getUserByEmail(DEMO_TENANT_ID, DEMO_USER_EMAIL);
  if (!user) {
    const pwHash = await hashPassword(DEMO_USER_PASSWORD);
    user = await createUser(DEMO_TENANT_ID, DEMO_USER_EMAIL, pwHash, 'approver');
    console.log('[seed_demo] Created demo user:', DEMO_USER_EMAIL);
  }

  const pool = await getTenantPoolWithMigrations(DEMO_TENANT_ID);

  // 3. Trial balance
  const tbEntries: TrialBalanceEntry[] = [
    { accountName: 'Cash', debit: 150000, credit: 0 },
    { accountName: 'Accounts Receivable', debit: 85000, credit: 0 },
    { accountName: 'Inventory', debit: 120000, credit: 0 },
    { accountName: 'Accounts Payable', debit: 0, credit: 65000 },
    { accountName: 'Revenue', debit: 0, credit: 250000 },
    { accountName: 'Cost of Goods Sold', debit: 80000, credit: 0 },
    { accountName: 'Operating Expenses', debit: 45000, credit: 0 },
    { accountName: 'Retained Earnings', debit: 0, credit: 165000 },
  ];
  const totalDebits = tbEntries.reduce((s, e) => s + e.debit, 0);
  const totalCredits = tbEntries.reduce((s, e) => s + e.credit, 0);
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error('Trial balance must balance');
  }
  await periodTbRepo.upsertUnadjusted(pool, DEMO_TENANT_ID, DEMO_PERIOD, tbEntries, {
    source: 'uploaded',
    uploadedBy: DEMO_USER_EMAIL,
    fileName: 'demo-tb.csv',
  });

  // 4. Close session (draft) — idempotent
  const sessionId = `demo-session-${DEMO_PERIOD}`;
  let session = await closeSessionRepo.getCloseSessionById(pool, DEMO_TENANT_ID, sessionId);
  const createdSession = !session;
  if (!session) {
    session = await closeSessionRepo.insertCloseSession(
      pool,
      sessionId,
      DEMO_TENANT_ID,
      DEMO_ENTITY_ID,
      '2025-01-01',
      '2025-01-31',
      'accrual',
      'GAAP',
      'draft'
    );
  }

  // 5. Journal entries (3) — only when session was just created
  const jeIds: string[] = [];
  const jeData = [
    { memo: 'Accrued rent', lines: [{ accountRef: 'Rent Expense', debit: 5000, credit: 0 }, { accountRef: 'Accrued Liabilities', debit: 0, credit: 5000 }] },
    { memo: 'Depreciation', lines: [{ accountRef: 'Depreciation Expense', debit: 2000, credit: 0 }, { accountRef: 'Accumulated Depreciation', debit: 0, credit: 2000 }] },
    { memo: 'Revenue recognition', lines: [{ accountRef: 'Unearned Revenue', debit: 3000, credit: 0 }, { accountRef: 'Revenue', debit: 0, credit: 3000 }] },
  ];
  const prov = { kind: 'human_entered' as const, enteredBy: DEMO_USER_EMAIL };
  if (!createdSession) {
    const existing = await jeRepo.listJournalEntries(pool, DEMO_TENANT_ID, { closeSessionId: sessionId, limit: 1 });
    if (existing.length > 0) {
      console.log('[seed_demo] Demo data already present; skipping JEs and evidence.');
      return;
    }
  }
  for (const je of jeData) {
    const id = randomUUID();
    await jeRepo.insertJournalEntry(pool, id, {
      closeSessionId: sessionId,
      tenantId: DEMO_TENANT_ID,
      status: 'draft',
      memo: je.memo,
      source: 'manual',
      createdBy: DEMO_USER_EMAIL,
    });
    await jeRepo.insertJournalEntryLines(
      pool,
      id,
      je.lines.map((l) => ({
        accountRef: l.accountRef,
        debit: l.debit ?? 0,
        credit: l.credit ?? 0,
        amountProvenance: prov,
      }))
    );
    jeIds.push(id);
  }

  // 6. Evidence (3 metadata-only records, one per JE)
  for (let i = 0; i < 3; i++) {
    const ev = await evidenceRepo.createEvidenceRecord(pool, DEMO_TENANT_ID, {
      hashSha256: `demo-evidence-hash-${i}-${Date.now()}`.slice(0, 64).padEnd(64, '0'),
      sizeBytes: 1024,
      mimeType: 'application/pdf',
      externalUri: `https://example.com/demo-doc-${i + 1}.pdf`,
      label: `Supporting document ${i + 1}`,
      attachedBy: DEMO_USER_EMAIL,
    });
    await evidenceRepo.linkEvidenceToJournalEntry(pool, DEMO_TENANT_ID, {
      evidenceId: ev.id,
      objectType: 'journal_entry',
      objectId: jeIds[i],
      assertionType: 'invoice_support',
      requiredness: 'optional',
      createdBy: DEMO_USER_EMAIL,
    });
  }

  console.log('[seed_demo] Demo data seeded: tenant, user, TB, 3 JEs, 3 evidence, close session (draft).');
}

const isMain = process.argv[1]?.includes('seed_demo');
if (isMain) {
  seedDemo().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
