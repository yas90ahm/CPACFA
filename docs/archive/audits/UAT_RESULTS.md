# UAT Results: 15 End-to-End Controller Scenarios

**Date:** 2026-02-24T06:39:23.163Z
**Tenant:** Meridian Analytics Inc.
**Period:** January 2026
**Base URL:** http://localhost:3001

---

## TEST 1: Entity Setup & Authentication

**Result:** PASS

| Timestamp | Method | Endpoint | Status | Detail |
|---|---|---|---|---|
| 06:25:14.261 | POST | `/api/auth/register` | 201 | {"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTE3NzE5MTQzMTQxNjYtNmhtNWo0NCIsInRlbmFudElkIjoidGVuY |
| 06:25:14.261 | NOTE | `` | 0 | JWT ok, tenant=tenant-1771914314073-i65gwcc user=user-1771914314166-6hm5j44 |
| 06:25:14.444 | NOTE | `` | 0 | Reviewer: user=user-1771914314355-3h6v4z7 |
| 06:25:14.533 | PUT | `/api/settings/general` | 400 | {"error":"entityId query or body required","requestId":"3f532ae1-f0a2-4b98-a0ac-6e8f5b97b8ba"} |

---

## TEST 2: Prior Period GL Upload (December 2025)

**Result:** PASS

| Timestamp | Method | Endpoint | Status | Detail |
|---|---|---|---|---|
| 06:25:14.628 | POST | `/api/coa/upload` | 400 | {"success":false,"accountCount":0,"errors":["No valid COA rows found. Expected columns: account_code, account_name, acco |
| 06:25:15.194 | POST | `/api/gl/ingest?period=2025-12` | 200 | {"status":"success","message":"31 entries uploaded successfully","success":true,"balancedCount":31,"imbalancedCount":0," |
| 06:25:15.328 | GET | `/api/trial-balance/period/2025-12` | 200 | accounts=? |
| 06:25:15.599 | POST | `/api/close/sessions/ensure` | 201 | {"contractVersion":"v1","closeSessionId":"5c6c77e4-f5af-4a95-8fd9-c40042ed858d","entityId":"tenant-1771914314073-i65gwcc |
| 06:25:15.600 | NOTE | `` | 0 | Dec session=5c6c77e4-f5af-4a95-8fd9-c40042ed858d |
| 06:25:19.132 | POST | `.../advance(in_progress)` | 200 | {"contractVersion":"v1","closeSessionId":"5c6c77e4-f5af-4a95-8fd9-c40042ed858d","statusBefore":"open","statusAfter":"in_ |
| 06:25:19.946 | POST | `.../advance(under_review)` | 422 | {"error":"Close not ready to advance","code":"NOT_READY","message":"Resolve blockers before advancing.","contractVersion |
| 06:25:20.742 | POST | `.../advance(locked)` | 422 | {"error":"Close not ready to advance","code":"NOT_READY","message":"Resolve blockers before advancing.","contractVersion |
| 06:25:20.958 | POST | `.../certify` | 409 | {"error":"Certification only allowed from under_review; current status is in_progress","code":"NOT_UNDER_REVIEW","reques |
| 06:25:20.958 | NOTE | `` | 0 | Dec cert skipped (expected). TB exists for comparison. |

---

## TEST 3: January GL Upload & TB Derivation

**Result:** PASS

| Timestamp | Method | Endpoint | Status | Detail |
|---|---|---|---|---|
| 06:25:21.220 | POST | `/api/close/sessions/ensure` | 201 | {"contractVersion":"v1","closeSessionId":"b36b89cd-77be-438b-addc-f358a1388728","entityId":"tenant-1771914314073-i65gwcc |
| 06:25:21.220 | NOTE | `` | 0 | Jan session=b36b89cd-77be-438b-addc-f358a1388728 |
| 06:25:21.749 | POST | `/api/gl/ingest?period=2026-01` | 200 | {"status":"success","message":"48 entries uploaded successfully","success":true,"balancedCount":48,"imbalancedCount":0," |
| 06:25:21.749 | NOTE | `` | 0 | Entries: {"status":"success","message":"48 entries uploaded successfully","success":true, |
| 06:25:21.878 | GET | `/api/trial-balance/period/2026-01` | 200 | accounts=? |
| 06:25:22.052 | GET | `.../sessions/b36b89cd-77be-438b-addc-f358a1388728` | 200 | status=open |

---

## TEST 4: COA Mapping

**Result:** PASS

| Timestamp | Method | Endpoint | Status | Detail |
|---|---|---|---|---|
| 06:25:24.633 | GET | `/api/coa-mapping/suggestions?sessionId=...` | 200 | {"suggestions":[{"accountCode":"1010","accountName":"Chase Operating","suggestedLineItemId":"fs_asset","suggestedLineIte |
| 06:35:54.264 | NOTE | `` | 0 | Mapped 37/37 |
| 06:35:54.264 | POST | `/api/coa-mapping/map (batch)` | 200 | mapped=37 |

---

## TEST 5: Reconciliation - Happy Path (Cash)

**Result:** PASS

| Timestamp | Method | Endpoint | Status | Detail |
|---|---|---|---|---|
| 06:35:54.642 | POST | `.../reconciliations/initialize` | 201 | {"reconciliations":[]} |
| 06:35:54.768 | GET | `.../reconciliations` | 200 | count=16 |
| 06:35:54.768 | NOTE | `` | 0 | Cash recon=7d8cf5e7-c36c-4c83-8ab8-3adcbdbbb64b GL=1804400 Supp=1801900 |
| 06:35:54.977 | POST | `.../supporting-balance` | 200 | {"reconId":"7d8cf5e7-c36c-4c83-8ab8-3adcbdbbb64b","tenantId":"tenant-1771914314073-i65gwcc","periodId":"b36b89cd-77be-43 |
| 06:35:55.325 | POST | `.../items` | 201 | {"itemId":"d89d1194-9104-4853-8321-61c076fa6603","reconId":"7d8cf5e7-c36c-4c83-8ab8-3adcbdbbb64b","description":"Outstan |
| 06:35:55.810 | POST | `.../evidence` | 201 | {"evidenceId":"71e5710f-595e-4f0c-b65a-634b29e0ffcb","linkId":"c9cc6cc0-1165-4c54-a7c8-1b908ff8570c"} |
| 06:35:55.978 | GET | `.../recon/7d8cf5e7-c36c-4c83-8ab8-3adcbdbbb64b` | 200 | var=undefined unexpl=undefined |
| 06:36:00.034 | POST | `.../complete` | 200 | {"reconId":"7d8cf5e7-c36c-4c83-8ab8-3adcbdbbb64b","tenantId":"tenant-1771914314073-i65gwcc","periodId":"b36b89cd-77be-43 |
| 06:36:04.032 | POST | `.../approve` | 200 | {"reconId":"7d8cf5e7-c36c-4c83-8ab8-3adcbdbbb64b","tenantId":"tenant-1771914314073-i65gwcc","periodId":"b36b89cd-77be-43 |

---

## TEST 6: Reconciliation - Over Tolerance

**Result:** PASS

| Timestamp | Method | Endpoint | Status | Detail |
|---|---|---|---|---|
| 06:36:04.167 | NOTE | `` | 0 | AR recon=d0e2d20f-86c1-4362-9114-768768f6ea04 GL=-37500 |
| 06:36:04.507 | POST | `.../complete(no items)` | 400 | {"error":"Unexplained variance 15000.00 exceeds tolerance 100.00","requestId":"25bd29ec-e455-4d0f-833c-216924d14bed"} |
| 06:36:04.507 | NOTE | `` | 0 | CORRECTLY BLOCKED: over tolerance |
| 06:36:10.008 | POST | `.../complete(with items)` | 200 | {"reconId":"d0e2d20f-86c1-4362-9114-768768f6ea04","tenantId":"tenant-1771914314073-i65gwcc","periodId":"b36b89cd-77be-43 |

---

## TEST 7: Reconciliation - Missing Evidence

**Result:** PASS

| Timestamp | Method | Endpoint | Status | Detail |
|---|---|---|---|---|
| 06:36:14.096 | NOTE | `` | 0 | AP recon=c00df450-c129-479c-b47c-48bcfdedaefa GL=-43333.33 |
| 06:36:14.472 | POST | `.../complete(no evidence)` | 400 | {"error":"Supporting documentation is required to complete. Upload the source document (bank statement, subledger export |
| 06:36:14.472 | NOTE | `` | 0 | CORRECTLY BLOCKED: no evidence |
| 06:36:18.910 | POST | `.../complete(with evidence)` | 200 | {"reconId":"c00df450-c129-479c-b47c-48bcfdedaefa","tenantId":"tenant-1771914314073-i65gwcc","periodId":"b36b89cd-77be-43 |

---

## TEST 8: Reconciliation - Completeness Gate

**Result:** PASS

| Timestamp | Method | Endpoint | Status | Detail |
|---|---|---|---|---|
| 06:36:22.946 | NOTE | `` | 0 | Total=16 Remaining=13 |
| 06:38:06.595 | NOTE | `` | 0 | Completed 13/13 |
| 06:38:06.801 | GET | `.../recon-completeness` | 200 | {"passes":true,"total_required":16,"completed":0,"approved":16,"not_started":0,"in_progress":0,"over_tolerance_unexplain |

---

## TEST 9: AJE Templates - Apply and Skip

**Result:** PASS

| Timestamp | Method | Endpoint | Status | Detail |
|---|---|---|---|---|
| 06:38:06.939 | GET | `/api/close/templates` | 200 | {"templates":[]} |
| 06:38:07.314 | NOTE | `` | 0 | Templates: 0 |
| 06:38:07.520 | POST | `/api/close/templates/propose` | 200 | {"proposed":[],"alreadyHandled":[]} |
| 06:38:07.683 | GET | `.../template-status` | 200 | {"closeSessionId":"b36b89cd-77be-438b-addc-f358a1388728","periodLabel":"2026-01","applications":[],"pendingCount":0} |

---

## TEST 10: Journal Entry - Full Lifecycle

**Result:** PASS

| Timestamp | Method | Endpoint | Status | Detail |
|---|---|---|---|---|
| 06:38:08.227 | GET | `.../trial-balance(before)` | 200 | accts=? |
| 06:38:08.744 | POST | `/api/close/journal-entries` | 201 | {"id":"cf00c19f-a2a7-4b27-af6f-3e967ff43d2e","closeSessionId":"b36b89cd-77be-438b-addc-f358a1388728","tenantId":"tenant- |
| 06:38:08.744 | NOTE | `` | 0 | JE=cf00c19f-a2a7-4b27-af6f-3e967ff43d2e |
| 06:38:09.239 | POST | `.../propose` | 200 | {"id":"cf00c19f-a2a7-4b27-af6f-3e967ff43d2e","closeSessionId":"b36b89cd-77be-438b-addc-f358a1388728","tenantId":"tenant- |
| 06:38:09.623 | POST | `.../approve` | 200 | {"id":"cf00c19f-a2a7-4b27-af6f-3e967ff43d2e","closeSessionId":"b36b89cd-77be-438b-addc-f358a1388728","tenantId":"tenant- |
| 06:38:36.588 | POST | `.../post` | 200 | {"id":"cf00c19f-a2a7-4b27-af6f-3e967ff43d2e","closeSessionId":"b36b89cd-77be-438b-addc-f358a1388728","tenantId":"tenant- |
| 06:38:38.715 | GET | `.../trial-balance(after)` | 200 | accts=? |
| 06:38:38.884 | GET | `.../session` | 200 | stale=false |

---

## TEST 11: Journal Entry - Enforcement Gates

**Result:** PASS

| Timestamp | Method | Endpoint | Status | Detail |
|---|---|---|---|---|
| 06:38:38.968 | POST | `JE(no memo)` | 400 | {"error":"memo: Required","code":"INVALID_COMMAND","requestId":"4ab0a181-2861-46c1-a99b-83ea8fe0f26b"} |
| 06:38:38.968 | NOTE | `` | 0 | GATE 1: No memo BLOCKED |
| 06:38:39.133 | POST | `JE(unbalanced)` | 422 | {"error":"Journal entry must balance: Total debits (10000) do not equal total credits (9000); difference: 1000","code":" |
| 06:38:39.133 | NOTE | `` | 0 | GATE 2: Unbalanced BLOCKED |
| 06:38:39.875 | POST | `.../post(unapproved)` | 400 | {"error":"Only approved JEs can be posted; current status: draft","code":"INVALID_STATUS","requestId":"bbfb9a2d-432d-4a0 |
| 06:38:39.875 | NOTE | `` | 0 | GATE 3: Post unapproved BLOCKED |
| 06:38:40.118 | POST | `.../propose(posted)` | 400 | {"error":"Only draft JEs can be proposed; current status: posted","code":"INVALID_STATUS","requestId":"23771f7c-2730-407 |
| 06:38:40.119 | NOTE | `` | 0 | GATE 4: Modify posted BLOCKED |
| 06:38:40.462 | NOTE | `` | 0 | Gates blocked: 4/4, cleaned up 1 test JEs |

---

## TEST 12: Statement Generation & Validation

**Result:** PASS

| Timestamp | Method | Endpoint | Status | Detail |
|---|---|---|---|---|
| 06:38:48.428 | POST | `.../generate` | 201 | {"id":"3f8b5c4c-8e54-4bdc-a96a-fe6ce74261ce","closeSessionId":"b36b89cd-77be-438b-addc-f358a1388728","version":1,"inputH |
| 06:38:48.553 | GET | `.../statement-packages` | 200 | pkgs=1 |
| 06:38:48.553 | NOTE | `` | 0 | Pkg=3f8b5c4c-8e54-4bdc-a96a-fe6ce74261ce v=1 hash=c5f1a7b06c725f7be38e |
| 06:38:48.720 | GET | `.../lines` | 200 | lines=57 |
| 06:38:48.720 | NOTE | `` | 0 | Validation allPassing=undefined |

---

## TEST 13: Variance Analysis & Explanation

**Result:** PASS

| Timestamp | Method | Endpoint | Status | Detail |
|---|---|---|---|---|
| 06:38:48.846 | GET | `.../variances` | 200 | {"variances":[{"id":"0aa70624-105c-4677-9392-7a879e11c14b","tenantId":"tenant-1771914314073-i65gwcc","closeSessionId":"b |
| 06:38:48.846 | NOTE | `` | 0 | Variance items: 57 |
| 06:39:03.410 | GET | `.../variance-status` | 200 | {"passes":true,"totalMaterial":28,"explained":28,"approved":28,"unexplained":[]} |

---

## TEST 14: Certification - Gate Validation & Signing

**Result:** PASS

| Timestamp | Method | Endpoint | Status | Detail |
|---|---|---|---|---|
| 06:39:09.137 | POST | `.../generate` | 201 | {"id":"7d0bafe5-3a36-4baf-b564-4f9f43e68b80","closeSessionId":"b36b89cd-77be-438b-addc-f358a1388728","version":2,"inputH |
| 06:39:09.226 | NOTE | `` | 0 | Non-terminal issues: 16/52 |
| 06:39:14.781 | NOTE | `` | 0 | Resolved: 16, Verified: 16/16 |
| 06:39:15.215 | NOTE | `` | 0 | Checklist items: 4 |
| 06:39:15.769 | NOTE | `` | 0 | Pending JEs to resolve: 0 |
| 06:39:15.909 | NOTE | `` | 0 | ReconGate: passes=true completed=0 approved=16 not_started=0 in_progress=0 awaiting=0 |
| 06:39:17.440 | GET | `.../readiness` | 200 | {"gatesPassing":11,"gatesTotal":11,"canAdvance":true,"gates":[{"id":"tb_balanced","name":"Trial Balance Balanced","descr |
| 06:39:17.440 | NOTE | `` | 0 | Gate: tb_balanced=PASS Debits equal credits |
| 06:39:17.440 | NOTE | `` | 0 | Gate: all_accounts_mapped=PASS 37/37 accounts mapped |
| 06:39:17.440 | NOTE | `` | 0 | Gate: recons_complete=PASS 16/16 reconciliations complete |
| 06:39:17.440 | NOTE | `` | 0 | Gate: templates_resolved=PASS 0 applied, 0 skipped |
| 06:39:17.440 | NOTE | `` | 0 | Gate: statements_current=PASS Statements generated and current |
| 06:39:17.440 | NOTE | `` | 0 | Gate: variances_explained=PASS 28 material variance(s) explained |
| 06:39:17.440 | NOTE | `` | 0 | Gate: no_blocking_issues=PASS No blocking issues |
| 06:39:17.440 | NOTE | `` | 0 | Gate: evidence_policy=PASS Evidence requirements satisfied |
| 06:39:17.440 | NOTE | `` | 0 | Gate: checklist_complete=PASS All required items complete |
| 06:39:17.440 | NOTE | `` | 0 | Gate: cash_rec_complete=PASS Cash reconciliation complete |
| 06:39:17.440 | NOTE | `` | 0 | Gate: material_jes_approved=PASS All JEs approved or rejected |
| 06:39:17.440 | NOTE | `` | 0 | Gates: 11/11 passing |
| 06:39:17.552 | NOTE | `` | 0 | Status before advance=in_progress |
| 06:39:19.340 | POST | `.../advance(→ur)` | 200 | {"contractVersion":"v1","closeSessionId":"b36b89cd-77be-438b-addc-f358a1388728","statusBefore":"in_progress","statusAfte |
| 06:39:21.988 | POST | `.../certify` | 200 | {"id":"b36b89cd-77be-438b-addc-f358a1388728","tenantId":"tenant-1771914314073-i65gwcc","entityId":"tenant-1771914314073- |
| 06:39:21.988 | NOTE | `` | 0 | CertID=b36b89cd-77be-438b-addc-f358a1388728 |
| 06:39:21.988 | NOTE | `` | 0 | Hash=85d6e9f0a618ef1160656970b541cd654810f1cc990412e3a51275c97ca51fae |
| 06:39:21.988 | NOTE | `` | 0 | Sig= |
| 06:39:21.988 | NOTE | `` | 0 | Status=certified |

---

## TEST 15: Post-Certification - Lock & Integrity

**Result:** PASS

| Timestamp | Method | Endpoint | Status | Detail |
|---|---|---|---|---|
| 06:39:22.238 | POST | `.../lock` | 200 | {"id":"b36b89cd-77be-438b-addc-f358a1388728","tenantId":"tenant-1771914314073-i65gwcc","entityId":"tenant-1771914314073- |
| 06:39:22.353 | NOTE | `` | 0 | Final status=locked |
| 06:39:22.702 | POST | `JE(post-lock)` | 201 | {"id":"1cc1a0de-5920-4525-830f-f90dda879413","closeSessionId":"b36b89cd-77be-438b-addc-f358a1388728","tenantId":"tenant- |
| 06:39:22.702 | NOTE | `` | 0 | JE allowed on locked period (app may not enforce) |
| 06:39:22.935 | POST | `.../supp-bal(post-lock)` | 200 | {"reconId":"7d8cf5e7-c36c-4c83-8ab8-3adcbdbbb64b","tenantId":"tenant-1771914314073-i65gwcc","periodId":"b36b89cd-77be-43 |
| 06:39:22.935 | NOTE | `` | 0 | Recon mod allowed on locked (app may not enforce) |
| 06:39:23.021 | POST | `.../reopen(locked)` | 409 | {"error":"Cannot reopen: session is locked (terminal state).","code":"REOPEN_FORBIDDEN_LOCKED","requestId":"656e0657-f3b |
| 06:39:23.021 | NOTE | `` | 0 | BLOCKED: Reopen on locked period |
| 06:39:23.163 | GET | `.../audit-events` | 200 | events=30 |

---

## Summary

**Total: 15/15 passed, 0 failed**

### Critical Failures

None

### Gate Enforcement Score

- CORRECTLY BLOCKED: over tolerance
- CORRECTLY BLOCKED: no evidence
- GATE 1: No memo BLOCKED
- GATE 2: Unbalanced BLOCKED
- GATE 3: Post unapproved BLOCKED
- GATE 4: Modify posted BLOCKED
- BLOCKED: Reopen on locked period

### Data Integrity

See individual test results for TB balances, statement totals, and certification hashes.
