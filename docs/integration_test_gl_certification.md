# GL → TB → Certification Integration Test

This document describes the integration test script that validates the end-to-end flow: COA upload → GL upload → Trial Balance derivation → Close session → Certification → Export with GL.

## Overview

The integration test (`scripts/test_gl_certification.ts`) simulates a real user flow to verify that all components work together as a complete system.

**Test Flow:**
1. Login (demo credentials or API_TOKEN)
2. COA upload
3. GL upload
4. GL → Trial Balance derivation
5. Create/ensure close session
6. Initialize checklist and complete items
7. Advance session to locked
8. Certify session
9. Audit binder (with GL)
10. Snapshot verification

## Test Data

### Sample COA (`test_data/sample_coa.csv`)

| account_code | account_name          | account_type | account_subtype  |
|-------------|------------------------|--------------|------------------|
| 1000        | Cash                   | Asset        | Current Asset    |
| 1100        | Accounts Receivable    | Asset        | Current Asset    |
| 1500        | Equipment              | Asset        | Fixed Asset      |
| 2000        | Accounts Payable       | Liability    | Current Liability|
| 2100        | Notes Payable          | Liability    | Long-term Liability |
| 3000        | Common Stock           | Equity       | Contributed Capital |
| 3100        | Retained Earnings      | Equity       | Retained Earnings |
| 4000        | Revenue                | Revenue      | Operating Revenue |
| 5000        | Cost of Goods Sold     | Expense      | Operating Expense |
| 5100        | Rent Expense           | Expense      | Operating Expense |
| 5200        | Salary Expense         | Expense      | Operating Expense |

### Sample GL (`test_data/sample_gl.csv`)

7 balanced journal entries for March 2024:

- JE-001: Initial capital (Cash 50,000 / Common Stock 50,000)
- JE-002: Sale to Customer A (AR 10,000 / Revenue 10,000)
- JE-003: Cost of goods sold (COGS 6,000 / Cash 6,000)
- JE-004: March rent (Rent 2,000 / Cash 2,000)
- JE-005: Salary expense (Salary 3,000 / Cash 3,000)
- JE-006: Vendor invoice / Equipment (AP 5,000 / Equipment 5,000)
- JE-007: Customer payment (Cash 8,000 / AR 8,000)

**Expected TB totals:** Debits = Credits = 87,000; Assets = 44,000; Liabilities = 5,000; Equity = 39,000

## Prerequisites

1. **PostgreSQL** running and accessible (local, Docker, or **Supabase**)
2. **Server** configured with:
   - `DATABASE_URL` – Postgres connection string (Supabase: Dashboard → Settings → Database → Connection string)
   - `JWT_SECRET` – Required when auth is enforced (any secret string; app JWT, not Supabase JWT)
   - `MODE=demo` – Enables demo user and seeds demo data

### Using Supabase

1. In Supabase Dashboard → **Settings** → **Database**, copy the **Connection string** (URI).
2. Put it in `.env`:
   ```
   DATABASE_URL=postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
   JWT_SECRET=your-secret-at-least-32-chars
   MODE=demo
   ```
3. Run control migrations: `npm run migrate`
4. Run tenant migrations: `npm run migrate:tenant`

## Quick Fix: Run with Supabase

1. **Ensure `.env` has:**
   ```
   DATABASE_URL=postgresql://postgres.[project-ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
   JWT_SECRET=your-secret-at-least-32-chars
   MODE=demo
   ```
   (Supabase connection string from Dashboard → Settings → Database)

2. **Run migrations** (once):
   ```bash
   npm run migrate
   npm run migrate:tenant
   ```

3. **Start the server:**
   ```bash
   npm run dev
   ```

4. **In another terminal, run the test:**
   ```bash
   npm run test:integration
   ```

---

## Running the Test

### 1. Start the server

```bash
MODE=demo JWT_SECRET=your-secret npm run dev
```

Or with a `.env` file containing `DATABASE_URL`, `JWT_SECRET`, and `MODE=demo`:

```bash
npm run dev
```

### 2. Run the integration test

In a separate terminal:

```bash
npm run test:integration
```

With explicit base URL:

```bash
BASE_URL=http://localhost:3000 npm run test:integration
```

Or use the convenience script:

```bash
npm run test:integration:dev
```

### 3. Authentication options

**Option A – Demo login (default)**  
The script logs in with `demo@cloudmetrics.io` / `DemoPass2026!` when the server runs in `MODE=demo`.

**Option B – API token**  
Provide a JWT from a prior login:

```bash
API_TOKEN=eyJhbGc... npm run test:integration
```

## Success Criteria

All steps should pass (PASS) with output similar to:

```
✅ Login: PASS
✅ COA Upload: PASS
✅ GL Upload: PASS
✅ TB Derivation: PASS
✅ Ensure Session: PASS
✅ Initialize Checklist: PASS
✅ Advance to Locked: PASS
✅ Certification: PASS
✅ Audit Binder: PASS (includesGL: true)
✅ Verification: PASS (includesGL: true)

🎉 ALL TESTS PASSED! GL → TB → Certification flow is working!
```

## Troubleshooting

| Issue | Possible cause | Fix |
|-------|----------------|-----|
| `fetch failed` / `ECONNREFUSED` | Server not running | Start server with `npm run dev` |
| `JWT_SECRET is required` | Missing env var | Add `JWT_SECRET=...` to `.env` |
| `Cannot connect to database` | Wrong `DATABASE_URL` or network | **Supabase:** Use pooler URL (port 6543), ensure password is correct, allow connections from your IP |
| `DATABASE_URL` not set | Env not loaded | Ensure `.env` exists in project root; `dotenv` loads it on start |
| Login fails | Demo user not seeded | Use `MODE=demo`; seed runs on startup |
| Advance to locked fails | Readiness blockers (checklist, JEs, etc.) | Script completes/skips checklist items; other blockers may need manual resolution |
| `sample_coa.csv not found` | Wrong working directory | Run `npm run test:integration` from project root |

## Files

| File | Description |
|------|-------------|
| `scripts/test_gl_certification.ts` | Integration test script |
| `test_data/sample_coa.csv` | Sample Chart of Accounts |
| `test_data/sample_gl.csv` | Sample General Ledger entries |
| `INTEGRATION_FIXES.md` | Checklist for tracking integration issues |
