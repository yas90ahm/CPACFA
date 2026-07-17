# Plan: Make Xero/NetSuite Adapter Claims Testable

## Goal
Prove that `XeroAdapter` and `NetSuiteAdapter` correctly call external APIs, parse responses, handle errors, and integrate end-to-end — all without real API credentials.

## Approach: HTTP-level mocking with contract fixtures

Intercept outbound `fetch()` calls at the network layer using `msw` (Mock Service Worker) or a lightweight `globalThis.fetch` stub. Each test validates:
- **Request shape** — correct URL, headers, body sent to the provider
- **Response parsing** — adapter correctly transforms provider JSON into `IAccountingAdapter` types
- **Error handling** — token expiry, rate limits, malformed responses
- **OAuth flow** — token exchange, refresh, encryption round-trip

No sandbox accounts needed. Tests run offline in CI.

---

## Step 1: Add test infrastructure

**File:** `tests/adapters/helpers/mock_fetch.ts`

Create a minimal fetch interceptor (or install `msw`). The interceptor:
- Matches requests by URL pattern + method
- Returns canned JSON responses from fixture files
- Records requests for assertion (URL, headers, body)
- Can simulate errors (500, 429, timeout, malformed JSON)

**File:** `jest.config.ts` (new)

Add Jest config for the project since none exists:
```ts
{
  preset: 'ts-jest/presets/default-esm',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: { '^.+\\.tsx?$': ['ts-jest', { useESM: true }] }
}
```

Also add `jest`, `ts-jest`, `@jest/globals` as devDependencies, and a `"test"` script to `package.json`.

---

## Step 2: Create response fixtures from real API docs

**Directory:** `tests/adapters/fixtures/`

| File | Source | Content |
|------|--------|---------|
| `xero_trial_balance.json` | [Xero Reports API docs](https://developer.xero.com/documentation/api/accounting/reports) | Real-shaped TB response with Rows/Cells structure |
| `xero_manual_journal_created.json` | Xero ManualJournals POST response | Journal with `ManualJournalID`, status |
| `xero_manual_journals_list.json` | Xero ManualJournals GET response | Array of journals with lines |
| `netsuite_suiteql_tb.json` | NetSuite SuiteQL docs | `items[]` with account/debit/credit columns |
| `netsuite_je_created.json` | NetSuite REST record API | Journal entry with `id`, `links` |
| `netsuite_suiteql_txns.json` | NetSuite SuiteQL query result | Transaction line items |
| `oauth_token_response.json` | Standard OAuth2 | `{access_token, refresh_token, expires_in}` |
| `xero_error_rate_limit.json` | Xero 429 response | Rate limit with Retry-After |
| `netsuite_error_invalid_query.json` | NetSuite 400 | SuiteQL syntax error |

Each fixture is a verbatim JSON object matching the real provider's documented schema.

---

## Step 3: Xero adapter unit tests

**File:** `tests/adapters/xero_adapter.test.ts`

### Test cases:

1. **`syncTrialBalance` — happy path**
   - Mock `GET /Reports/TrialBalance?date=2024-03-31` → fixture
   - Assert: returns `SyncTrialBalanceResult` with correct account codes, debits, credits
   - Assert: request has `Authorization: Bearer <token>`, `Xero-Tenant-Id` header

2. **`syncTrialBalance` — empty report**
   - Mock returns report with zero rows
   - Assert: returns `{ success: true, entries: [] }`

3. **`pushJournalEntry` — creates journal**
   - Mock `POST /ManualJournals` → fixture with `ManualJournalID`
   - Assert: request body has `Date`, `Narration`, `JournalLines` with correct debit/credit
   - Assert: returns `{ success: true, externalId: '<ManualJournalID>' }`

4. **`pushJournalEntry` — rejects imbalanced entry**
   - Pass lines where debits ≠ credits
   - Assert: throws or returns error without making HTTP call

5. **`pullTransactions` — with date range filter**
   - Mock `GET /ManualJournals?where=...` → fixture
   - Assert: URL contains correct date filter encoding
   - Assert: returns `PulledTransaction[]` with mapped fields

6. **`syncTrialBalance` — 401 expired token**
   - Mock returns 401
   - Assert: adapter surfaces error (doesn't crash)

7. **`syncTrialBalance` — 429 rate limit**
   - Mock returns 429 with `Retry-After`
   - Assert: error message includes rate limit info

---

## Step 4: NetSuite adapter unit tests

**File:** `tests/adapters/netsuite_adapter.test.ts`

### Test cases:

1. **`syncTrialBalance` — SuiteQL query**
   - Mock `POST /query/v1/suiteql` → fixture
   - Assert: request body SQL references `transactionaccountingline`
   - Assert: returns entries with account code, name, debit, credit

2. **`syncTrialBalance` — pagination (hasMore)**
   - Mock first call returns `hasMore: true`, second returns `hasMore: false`
   - Assert: adapter makes 2 requests, concatenates results

3. **`pushJournalEntry` — REST record create**
   - Mock `POST /record/v1/journalentry` → fixture
   - Assert: request body has `trandate`, `memo`, `line.items[]`
   - Assert: returns external ID from Location header

4. **`pullTransactions` — SuiteQL with account filter**
   - Mock SuiteQL endpoint → fixture
   - Assert: SQL WHERE clause includes account codes
   - Assert: date range correctly formatted

5. **`syncTrialBalance` — dynamic account ID in URL**
   - Assert: URL contains correct `{accountId}.suitetalk.api.netsuite.com`

6. **`pushJournalEntry` — 400 validation error**
   - Mock returns 400 with NetSuite error format
   - Assert: error message surfaced cleanly

---

## Step 5: OAuth service unit tests

**File:** `tests/adapters/oauth_service.test.ts`

### Test cases:

1. **`encrypt` → `decrypt` round-trip**
   - Encrypt a token string, decrypt it, assert equality
   - No network needed — pure crypto

2. **`exchangeCodeForTokens` — stores encrypted tokens**
   - Mock token endpoint → fixture
   - Use in-memory PG pool (or mock `pool.query`)
   - Assert: `INSERT INTO tenant_oauth_tokens` called with encrypted values

3. **`getValidAccessToken` — returns cached token**
   - Seed DB row with future `expires_at`
   - Assert: returns decrypted token, no HTTP call

4. **`getValidAccessToken` — auto-refreshes expired token**
   - Seed DB row with past `expires_at`, valid refresh token
   - Mock token endpoint → new tokens
   - Assert: HTTP refresh call made, DB updated

5. **`getAuthorizationUrl` — correct URL per provider**
   - Assert Xero URL starts with `https://login.xero.com/...`
   - Assert NetSuite URL starts with `https://system.netsuite.com/...`
   - Assert state parameter decodes to `{tenantId, connectionId, provider}`

---

## Step 6: Route-level integration tests

**File:** `tests/adapters/accounting_integration_routes.test.ts`

Wire through the Express route → service → adapter with mocked fetch:

1. **POST `/api/accounting-integration/sync-trial-balance`**
   - Auth token → tenant resolution → adapter factory → Xero mock → response
   - Assert: 200, body matches `SyncTrialBalanceResult` schema

2. **POST `/api/accounting-integration/push-journal-entry`**
   - Same full-stack path with NetSuite adapter
   - Assert: 200, returns external ID

3. **POST `/api/accounting-integration/pull-transactions`**
   - Assert: returns `PulledTransaction[]`

4. **Error propagation**
   - Adapter returns error → route returns 502 with provider error detail

---

## Step 7: Add to CI / package.json

- Add `"test:unit": "jest --testPathPattern=tests/adapters"` to scripts
- Add `"test": "jest"` as the default test command
- Run in CI without any env vars (no `XERO_CLIENT_ID`, etc. needed)

---

## What this proves

| Claim | How it's proven |
|-------|----------------|
| Xero adapter sends correct HTTP requests | Request assertions on URL, headers, body |
| Xero adapter parses real API response shapes | Fixtures from Xero API docs |
| NetSuite adapter uses SuiteQL correctly | SQL string assertions + response parsing |
| NetSuite adapter handles pagination | Multi-call mock with hasMore flag |
| OAuth tokens are encrypted at rest | encrypt/decrypt round-trip test |
| OAuth auto-refresh works | Mock expired token → refresh call → new token |
| Adapters handle errors gracefully | 401, 429, 400, malformed JSON tests |
| Full route → adapter path works | Route-level integration tests |

**Estimated files:** 8 new files (config, helpers, fixtures, 4 test files)
**Estimated test count:** ~25 test cases
**Runtime:** <10 seconds (all mocked, no network)
