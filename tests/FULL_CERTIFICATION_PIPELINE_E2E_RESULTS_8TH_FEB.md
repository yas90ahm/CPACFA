# Full Certification Pipeline E2E Test Results

**Date:** 8th February 2025  
**Test file:** `tests/integration/full_certification_pipeline_e2e.test.ts`

---

## Summary

All 14 tests passed.

```
PASS integration/full_certification_pipeline_e2e.test.ts (28.463 s)
  Full certification pipeline E2E
    √ 1a. Upload balanced trial balance via ingest API (2637 ms)
    √ 1b. Verify stored in period_trial_balance (87 ms)
    √ 1c. Create close session for that period (183 ms)
    √ 1d. Advance session: draft → in_progress → ready_for_review → finalized → locked (1936 ms)
    √ 1e. Lock period then certify the session (921 ms)
    √ 1f. Verify snapshot, audit ledger certify_close, session status certified (112 ms)
    √ 1g. Export certified PDF (629 ms)
    √ 1h. Verify: no watermark, PDF contains certification hash, export gate allowed (575 ms)
    √ 2a. Upload imbalanced trial balance (330 ms)
    √ 2b. Verify it goes to tenant_hitl_staging (NOT period_trial_balance) (85 ms)
    √ 2c. Create session and advance to locked (without resolving imbalanced TB) (2097 ms)
    √ 2d. Attempt to certify without resolution — verify certification fails with 422 (314 ms)
    √ 3a. Create session in draft; try to certify from draft — verify fails with appropriate error (315 ms)
    √ 3b. Create session, ingest balanced TB, advance to locked; certify from locked — verify succeeds (6742 ms)

Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total
Snapshots:   0 total
Time:        28.814 s
```

---

## Test Flow Coverage

### 1. HAPPY PATH (1a–1h)

| Step | Description | Result |
|------|-------------|--------|
| 1a | Upload balanced trial balance via ingest API | PASS |
| 1b | Verify stored in period_trial_balance | PASS |
| 1c | Create close session for that period | PASS |
| 1d | Advance session: draft → in_progress → ready_for_review → finalized → locked | PASS |
| 1e | Lock period then certify the session | PASS |
| 1f | Verify snapshot, audit ledger certify_close, session status certified | PASS |
| 1g | Export certified PDF | PASS |
| 1h | Verify: no watermark, PDF contains certification hash, export gate allowed | PASS |

### 2. FAILURE PATH (2a–2d)

| Step | Description | Result |
|------|-------------|--------|
| 2a | Upload imbalanced trial balance | PASS |
| 2b | Verify it goes to tenant_hitl_staging (NOT period_trial_balance) | PASS |
| 2c | Create session and advance to locked (without resolving imbalanced TB) | PASS |
| 2d | Attempt to certify without resolution — verify certification fails with 422 | PASS |

### 3. STATE MACHINE ENFORCEMENT (3a–3b)

| Step | Description | Result |
|------|-------------|--------|
| 3a | Try to certify from draft state — verify fails with appropriate error (409) | PASS |
| 3b | Try to certify from locked state — verify succeeds | PASS |

---

## Run Command

```bash
cd tests
npm test -- --testPathPattern="full_certification_pipeline_e2e" --runInBand --forceExit
```

---

*Label: 8th Feb*
