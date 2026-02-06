# Full Test Suite Failure Report

**Run:** Full `npm test`  
**Result (latest):** Test Suites: 5 failed, 40 passed, 45 total | Tests: 33 failed, 282 passed, 315 total  
*(Original run: 8 failed, 37 passed. full_close_flow, classifier_ingest, sovereign_validator have since been fixed.)*

---

## 1. integration/shadow_audit_gate.test.ts

**Classification:** B) response code mismatch

**First failing test:** `Shadow Auditor gate › when AI_SHADOW_SEVERITY=block, post JE returns 403 and findings include block`

**First ~15 lines of error:**
```
  ● Shadow Auditor gate › when AI_SHADOW_SEVERITY=block, post JE returns 403 and findings include block

    expect(received).toContain(expected) // indexOf

    Expected value: 400
    Received array: [200, 201]

      64 |           ],
      65 |         });
    > 66 |       expect([200, 201]).toContain(createJeRes.status);
         |                          ^
      67 |       const jeId = createJeRes.body?.id;
      68 |       if (!jeId) return;
      69 |

      at Object.<anonymous> (integration/shadow_audit_gate.test.ts:66:26)
```

---

## 2. integration/validation.test.ts

**Classification:** D) DB state/migration/seed mismatch

**First failing test:** `API Input Validation Tests › Auth Routes Validation › should reject login with missing email`

**First ~15 lines of error:**
```
  ● API Input Validation Tests › Auth Routes Validation › should reject login with missing email

    AggregateError:

      65 | async function runMigrations(pool: Pool, tenantId: string): Promise<void> {
      66 |   // Create tenant schema
    > 67 |   await pool.query(`CREATE SCHEMA IF NOT EXISTS ${tenantId}`);
         |   ^
      68 |   
      69 |   // Run migrations (simplified for testing)
      70 |   await pool.query(`

      at ../node_modules/pg-pool/index.js:45:11
      at runMigrations (helpers/testHelpers.ts:67:3)
      at createTestTenant (helpers/testHelpers.ts:34:3)
      at Object.<anonymous> (integration/validation.test.ts:16:20)
```

---

## 3. integration/je_post_error_codes.test.ts

**Classification:** B) response code mismatch

**First failing test:** `JE post error response codes › when bridge throws, post returns 500 with code=SERVICE`

**First ~15 lines of error:**
```
  ● JE post error response codes › when bridge throws, post returns 500 with code=SERVICE

    expect(received).toContain(expected) // indexOf

    Expected value: 400
    Received array: [200, 201]

      66 |           ],
      67 |         });
    > 68 |       expect([200, 201]).toContain(createJeRes.status);
         |                          ^
      69 |       const jeId = createJeRes.body?.id;
      70 |       if (!jeId) return;
      71 |

      at Object.<anonymous> (integration/je_post_error_codes.test.ts:68:26)
```

---

## 4. integration/precheck_board_ready.test.ts

**Classification:** C) response shape mismatch

**First failing test:** `POST /api/precheck/board-ready › balanced TB => status ready and proofSummary`

**First ~15 lines of error:**
```
  ● POST /api/precheck/board-ready › balanced TB => status ready and proofSummary

    expect(received).toHaveProperty(path, value)

    Expected path: "status"

    Expected value: "ready"
    Received value: "not_ready"

      54 |     if (res.status === 503) return;
      55 |     expect(res.status).toBe(200);
    > 56 |     expect(res.body).toHaveProperty('status', 'ready');
         |                      ^
      57 |     expect(res.body).toHaveProperty('blockers');
      58 |     expect(Array.isArray(res.body.blockers)).toBe(true);
      59 |     expect(res.body.blockers).toHaveLength(0);

      at Object.<anonymous> (integration/precheck_board_ready.test.ts:56:22)
```

---

## 5. integration/classifier_ingest.test.ts

**Classification:** A) timeout (and F) external AI dependency if classifier calls LLM)

**First failing test:** `Classifier on ingest (staged) › after staged ingest with AI_MOCK_CLASSIFIER=true, staging payload has classification_results`

**First ~15 lines of error:**
```
  ● Classifier on ingest (staged) › after staged ingest with AI_MOCK_CLASSIFIER=true, staging payload has classification_results

    thrown: "Exceeded timeout of 5000 ms for a test.
    Add a timeout value to this test to increase the timeout, if this is a long-running test. See https://jestjs.io/docs/api#testname-fn-timeout."

      32 |   });
      33 |
    > 34 |   it('after staged ingest with AI_MOCK_CLASSIFIER=true, staging payload has classification_results', async () => {
         |     ^
      35 |     if (!isDbConfigured()) return;
      36 |
      37 |     const prevMock = process.env.AI_MOCK_CLASSIFIER;

      at integration/classifier_ingest.test.ts:34:5
      at Object.<anonymous> (integration/classifier_ingest.test.ts:22:9)
```

---

## 6. integration/full_close_flow.test.ts — **RESOLVED**

**Classification:** Was A) timeout; then B) response code/balance-sheet equation.

**Resolution (applied):**
- Endpoint correctly enforces balance sheet equation (Assets = L+E). Test payload (Cash + Revenue only) violated it (Equity = 0).
- **Test:** Updated `SMALL_TB_CSV` to a valid TB: Cash 1000 / Equity 1000 so A = L+E. Test expects 200.
- **Code:** Ingest handler now recognizes `MathematicalIntegrityError` by `err.name` when `instanceof` fails (Jest/ESM), and returns 422 instead of 400 for integrity failures.

**First failing test (historical):** `Full close flow integration › ingests trial balance`

**First ~15 lines of error (historical):**
```
  ● Full close flow integration › ingests trial balance

    thrown: "Exceeded timeout of 5000 ms for a test. ..."
    (Later: expect([200, 401, 503]).toContain(res.status) with res.status 400 / balance sheet equation message.)
```

---

## 7. sovereign_validator.test.ts

**Classification:** A) timeout, F) external AI dependency

**First failing test:** `Sovereign Validator — High-Integrity Accounting Engine › 3. Where AI Helps (Operational Audit) › justification_service produces IRAC-grounded memo with standard citation (e.g. ASC 842)`

**First ~15 lines of error:**
```
  ● Sovereign Validator — High-Integrity Accounting Engine › 3. Where AI Helps (Operational Audit) › justification_service produces IRAC-grounded memo with standard citation (e.g. ASC 842)

    thrown: "Exceeded timeout of 5000 ms for a test.
    Add a timeout value to this test to increase the timeout, if this is a long-running test. See https://jestjs.io/docs/api#testname-fn-timeout."

      150 |   // ==========================================================================
      151 |   describe('3. Where AI Helps (Operational Audit)', () => {
    > 152 |     it('justification_service produces IRAC-grounded memo with standard citation (e.g. ASC 842)', async () => {
          |       ^
      153 |       const response = await justifyWithRAG(
      154 |         'How should we recognize a 3-year operating lease under US GAAP?',
      155 |         { framework: 'FASB' }

      at sovereign_validator.test.ts:152:7
      at sovereign_validator.test.ts:151:11
      at Object.<anonymous> (sovereign_validator.test.ts:32:9)
```

---

## 8. integration/certification_pipeline.test.ts

**Classification:** B) response code mismatch

**First failing test:** `Certification pipeline E2E › full pipeline: imbalanced TB → HITL staging → resolve → lock → certify → gates → binder; DB artifacts and chain verify`

**First ~15 lines of error:**
```
  ● Certification pipeline E2E › full pipeline: imbalanced TB → HITL staging → resolve → lock → certify → gates → binder; DB artifacts and chain verify

    expect(received).toBe(expected) // Object.is equality

    Expected: 200
    Received: 422

      308 |       .set('x-tenant-id', testTenantId);
      309 |
    > 310 |     expect(binderJsonRes.status).toBe(200);
          |                                  ^
      311 |     const binder = binderJsonRes.body;
      312 |     expect(binder?.chainVerification).toBeDefined();
      313 |     expect(binder.chainVerification.valid).toBe(true);

      at Object.<anonymous> (integration/certification_pipeline.test.ts:310:34)
```

---

## Summary by classification

| Classification | Suites (still failing) |
|----------------|------------------------|
| B) response code mismatch | shadow_audit_gate, je_post_error_codes, certification_pipeline |
| C) response shape mismatch | precheck_board_ready |
| D) DB state/migration/seed mismatch | validation |

**Resolved (no longer failing):** full_close_flow (test payload + ingest 422 handling), classifier_ingest (timeout/AI mock), sovereign_validator (timeout/AI mock).
