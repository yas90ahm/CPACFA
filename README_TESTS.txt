SOVEREIGN VALIDATOR — HEADLESS TEST SUITE
=========================================

This document explains the results and flow of the high-integrity accounting engine tests in tests/sovereign_validator.test.ts.

WHAT THE SUITE PROVES
---------------------

1. GARBAGE-IN PREVENTION (Accounting Logic Test)
   - POST /api/trial-balance/ingest with a "Messy CSV" (imbalanced debits/credits) is rejected or staged.
   - Expected: HTTP 422 (Unprocessable Entity) OR HTTP 200 with status "staged" and imbalanceAmount > 0.
   - When tenant context and DB are available: a record is created in tenant_hitl_staging (HITL staging table).
   - Result: The engine never saves an imbalanced trial balance to the main ledger. Business problem (Garbage-In) is solved.

2. THE BRIDGE (UX Workflow)
   - The agentic_gap_analyzer suggests journal entry proposals to fix the imbalance (LLM-driven).
   - POST /api/hitl/resolve-ingest with a CPA Protocol Bridge–style JSON payload (adjustment lines) applies the fix.
   - The deterministic math (Sum(Debits) = Sum(Credits)) is re-verified; the ledger is saved to period_trial_balance.
   - cpa_decision_handler.executeAgentRecommendation runs deterministic services (e.g. Lease, Revenue, Tax) and logs AGENTIC_ADJUSTMENT_EXECUTED in audit_log_service.
   - Result: The Bridge successfully calls the deterministic math service and the ledger becomes balanced.

3. WHERE AI HELPS (Operational Audit)
   - justification_service.justifyWithRAG produces an IRAC-grounded memo (Issue, Rule, Analysis, Conclusion).
   - Validation: The memo includes a [Source] citation and references a specific standard (e.g. ASC 842, FASB).
   - Result: AI value-add is justification and citation, not just calculation.

4. TRUTH GATE (Adversarial Export)
   - Scenario A: POST /api/export/pdf with an imbalanced clean_ledger must fail (422, FINAL_INTEGRITY_CHECK_FAILED).
   - Scenario B: POST /api/export/pdf with a balanced clean_ledger (after Bridge fix or synthetic balanced data) must succeed (200, PDF buffer).
   - audit_log_service is queried for hitl_ingest_fix and AGENTIC_ADJUSTMENT_EXECUTED; export gate uses audit_ledger hash chain when DB is configured.
   - Result: Export is blocked when the staging area is imbalanced; after the Bridge fix, a PDF buffer is generated and the "Perfect Statement" flow is hash-chain auditable.

HOW TO RUN
----------

From project root (with tests/ package.json and deps):

  npm test -- tests/sovereign_validator.test.ts

Or from tests/ directory:

  npm test -- sovereign_validator.test.ts

Optional: Set DATABASE_URL (and optionally a pre-seeded tenant) to run the full flow including HITL staging, resolve-ingest, and audit log assertions. Without DB, the suite still validates the kill switch, export gate, IRAC justification, and CPA bridge logic.

RESULTS SUMMARY
---------------

- Pass: Ingest rejects or stages imbalanced uploads; no save to ledger until balanced.
- Pass: Bridge (resolve-ingest + CPA decision handler) balances the ledger and logs to audit.
- Pass: Justification service returns IRAC memo with standard citation.
- Pass: Export fails for imbalanced ledger; export succeeds for balanced ledger and returns PDF.
- Pass: Unit-level MathematicalIntegrityError and finalIntegrityCheck enforce deterministic integrity.

CERTIFICATION PIPELINE E2E (tests/integration/certification_pipeline.test.ts)
============================================================================

Single integration test that proves the full certification pipeline end-to-end. Fails if any step breaks.

Scenario: Upload imbalanced CSV TB → tenant_hitl_staging created (no period_trial_balance) → resolve via POST /api/hitl/resolve-ingest → lock period → certify close session → run export gates (POST /api/export/pdf) → export PDF binder (GET /api/audit/binder/export/pdf) → assert DB artifacts and audit chain verifies (binder.chainVerification.latestEntryHash, verifyChain(pool, tenantId).valid).

Run: From tests/ directory, npm test -- integration/certification_pipeline.test.ts. Set DATABASE_URL for full run; without DB the test skips (no failure). CI: one test file, reliable skip when DB not configured.
