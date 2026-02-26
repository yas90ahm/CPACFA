# Integration Fix Checklist

Use this to track issues found during integration testing.

## Prerequisites to Run the Integration Test

### With Supabase (recommended)

1. **`.env`** with:
   - `DATABASE_URL` — Supabase Postgres connection string (Dashboard → Settings → Database)
   - `JWT_SECRET` — any secret string (32+ chars)
   - `MODE=demo`
2. **Migrations** (once):
   ```bash
   npm run migrate
   npm run migrate:tenant
   ```
3. **Start server:** `npm run dev`
4. **Run test** (another terminal): `npm run test:integration`

### Without Supabase

1. **Server running** with DATABASE_URL, JWT_SECRET, and MODE=demo:
   ```bash
   MODE=demo JWT_SECRET=your-secret npm run dev
   ```
2. **Demo seed** (runs automatically when MODE=demo): creates demo@cloudmetrics.io / DemoPass2026!
3. **Run the test** (in another terminal):
   ```bash
   npm run test:integration
   ```
4. **Alternative**: Set API_TOKEN (from login response) instead of using demo credentials.

## Common Issues to Check:

### Database
- [ ] All migrations ran successfully
- [ ] Tables exist: tenant_chart_of_accounts, general_ledger
- [ ] Foreign keys work correctly
- [ ] Indexes created

### API Routes
- [ ] COA router registered in main app
- [ ] GL router registered in main app
- [ ] Auth middleware applied to all routes
- [ ] Error handling returns proper HTTP codes

### Services
- [ ] gl_to_tb_aggregation_service imports work
- [ ] Existing services can import new GL services
- [ ] No circular dependencies

### Data Flow
- [ ] COA upload → COA table
- [ ] GL upload → GL table
- [ ] GL aggregation → TB derivation
- [ ] TB derivation → Certification
- [ ] Certification → Snapshot with GL
- [ ] Export → Include GL

### Hash Computation
- [ ] v4 hash function exists
- [ ] Hash includes GL data
- [ ] Hash is deterministic
- [ ] Verification works

### Type Compatibility
- [ ] GL-derived TB matches existing TB format
- [ ] Snapshot payload type is compatible
- [ ] Export package type is compatible

## Issues Found:

### Issue 1:
**Description:**
**Fix:**
**Status:**

### Issue 2:
**Description:**
**Fix:**
**Status:**
