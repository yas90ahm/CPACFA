# UAT — Backend API acceptance (no frontend)

Run end-to-end UAT by driving the API from the project root.

## Requirements

- **DATABASE_URL** set and **not** production-like (no `prod` in URL).
- **ALLOW_DB_RESET** must **not** be `true` — the runner exits immediately if it is.
- **SEED_FOR_TESTS** should be unset or `false` for normal UAT.

## Env vars (exact)

| Variable | Required | Safe value for UAT |
|----------|----------|--------------------|
| DATABASE_URL | Yes | Non-production Postgres URL |
| JWT_SECRET | No | Omit or set (default dev secret used) |
| NODE_ENV | No | `staging` or `development`; use `staging` to align with guardrails |
| **ALLOW_DB_RESET** | — | **Must be unset or `false`** (runner fails fast if `true`) |
| **SEED_FOR_TESTS** | — | Unset or `false` |
| AI_MOCK / AI_SHADOW_SEVERITY | No | Set by runner for shadow-block test |

Use `uat/.env.uat.example` as a template: copy to `uat/.env` or source before running.

## Run

From **project root**:

```bash
npx tsx uat/run_uat.ts
```

The runner prints a banner with destructive/safety flags and exits if `ALLOW_DB_RESET=true`.

## Outputs

- **uat/artifacts/** — request/response and binder summaries.
- **uat/UAT_REPORT.md** — PASS/FAIL per scenario and evidence paths.

## Security sanity (report)

The report marks **Security sanity** as PASS when:

- ALLOW_DB_RESET is not enabled (runner would have exited earlier if it were).
- `db:reset` and `db:seed:test` refuse to run without explicit allow and refuse prod-like URLs (code: `src/db/destructive_guards.ts`, `reset_and_bootstrap.ts`, `seed_test.ts`).
