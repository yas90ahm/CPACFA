# Production and SOC 2 Checklist (tech-focused)

Short checklist for deployment and SOC 2 alignment. One or two sentences per item.

- **TLS:** Use TLS for all traffic (e.g. reverse proxy or load balancer). No plain HTTP in production.

- **Secrets:** Store production secrets in a vault (e.g. AWS Secrets Manager, Azure Key Vault). Do not rely on `.env` in production.

- **Database backups:** Use automated backups and test restores. Define RTO/RPO.

- **Audit log:** Run retention purge (e.g. cron calling `POST /api/close/audit-log/retention-purge` with approver token, or run `scripts/purge_audit_log.ts`). Retain per policy (e.g. 7 years).

- **Logging:** Use structured logs; retain logs per policy. Ensure no secrets or PII in logs (logger redacts by key; still verify env and error messages).

- **CI/CD:** Use code review, a single pipeline to production, and dependency scanning (e.g. `npm audit`).

- **LLM:** When using LLM, use a private endpoint or sanitized data. Do not send sensitive data to a vendor without a contract or SOC 2.

- **Auth:** Enforce REQUIRE_AUTH and tenant context in production (`NODE_ENV=production`). Set JWT_SECRET to a non-default value.
