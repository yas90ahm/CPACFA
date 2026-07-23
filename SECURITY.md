# Security

Sabit is a prototype. It has security controls, but it has not been represented
as production-ready or independently certified. Do not use it with real
financial records, credentials, or personal data without your own review and
hardening.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting or a private security advisory for
this repository when available. If neither option is available, open an issue
that contains no exploit details, secrets, or customer data and ask for a private
contact channel.

Include the affected component, the impact, a minimal reproduction, and any
suggested mitigation. Please do not test against systems or data you do not own.

## Secrets and demo data

- Never commit `.env`, signing keys, provider tokens, database credentials, or
  exported financial data.
- Treat any credential that has ever appeared in Git history as compromised.
  Revoke or rotate it; deleting the current file is not enough.
- Replace all demo credentials before exposing an environment to a network.
- Generate persistent Ed25519 certification keys for production with
  `npm run keygen`, then store them in a secrets manager.
- Generated evidence belongs outside Git. `data/evidence/` and
  `data/evidence-test/` are ignored.

## Deployment baseline

For any non-local deployment:

- set `MODE=prod` and `NODE_ENV=production`
- set a strong `JWT_SECRET`, PostgreSQL credentials, and certification keys
- keep authentication and tenant context enforcement enabled
- terminate TLS at a trusted proxy and configure allowed CORS origins
- use least-privilege database and object-storage credentials
- review dependency and container scans before release
- back up and monitor the audit trail and evidence store

Security-sensitive behavior is concentrated in `src/security`, `src/auth`,
`src/middleware`, `src/crypto`, and the database migrations. Review those areas
along with [the architecture guide](docs/ARCHITECTURE.md) before deployment.
