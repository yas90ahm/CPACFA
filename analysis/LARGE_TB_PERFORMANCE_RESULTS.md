# Large Trial Balance Performance Results

**Test file:** `tests/integration/large_trial_balance.test.ts`  
**Run date:** February 2025  
**Environment:** DATABASE_URL set, AI_MOCK=true, local Postgres

---

## Performance Results (Timing)

| Row count | Result | Time | Notes |
|-----------|--------|------|-------|
| **1,000** | ✅ Pass | ~2.9s | Baseline; completes quickly |
| **10,000** | ✅ Pass | ~5.6s ingest | Full flow (certify + export) OK; within 30s target |
| **50,000** | ✅ Pass | ~104s | Works but **slow**; bottleneck |
| **100,001** | ✅ Reject 413 | ~1s | Correct rejection; clear error message |

---

## Test Assertions

### 1,000 rows
- Status 200
- balanceSheet.balances === true
- Completes within 15s

### 10,000 rows
- Ingest completes within 30s ✅
- Saved to period_trial_balance ✅
- Can create close session, advance, lock, certify ✅
- Can export certified PDF ✅

### 50,000 rows
- Either: 200 + saved to period_trial_balance
- Or: 413 with clear error (rowCount, maxAllowed)

### 100,001 rows
- 413 Trial balance too large
- rowCount: 100001
- maxAllowed: 100000 (MAX_TB_ROWS default)
- Message references MAX_TB_ROWS

---

## Bottlenecks Identified

1. **50k ingest ~104 seconds**
   - Ingest scales poorly above ~10k rows
   - Likely causes:
     - **Statement build** (`generateStatements` / `buildValidatedStatements`) over full TB
     - **Account classification** (`classifyTrialBalance`) per-entry
     - **DB upsert** (`period_trial_balance` JSONB) for large payload
     - **runPlanExecuteVerifyAgentic** (mocked in tests; would add LLM latency in prod)

2. **10k ingest ~5.6s**
   - Acceptable for 10k rows
   - ~0.56ms per row

3. **100k rejection ~1s**
   - Limit check is fast; rejection before heavy processing

---

## Recommendations

1. **Batching:** Process TB in chunks; stream classification/statement build
2. **Lazy classification:** Classify on-demand for export, not at ingest
3. **DB optimization:** Consider chunked upsert for period_trial_balance
4. **Async ingest:** Return 202 Accepted; process in background; poll for completion
5. **Warn at threshold:** Return a warning when row count > 10k (e.g. "Large upload may take longer")
