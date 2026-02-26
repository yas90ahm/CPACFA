#!/bin/bash
# Sovereign CPA Engine — Pre-deployment verification
# Run this before deploying to production.
#
# Usage: ./scripts/verify-production-ready.sh

set -e
PASS=0
FAIL=0

check() {
  local label="$1"
  shift
  if eval "$@" > /dev/null 2>&1; then
    echo "  PASS  $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Sovereign CPA Engine — Production Readiness Check ==="
echo ""

echo "--- Build ---"
check "TypeScript compiles" "npx tsc --noEmit"
check "Build succeeds" "npm run build"

echo ""
echo "--- Security ---"
check ".env is gitignored" "grep -q '^\.env$' .gitignore"
check ".env.production is gitignored" "grep -q '\.env\.production' .gitignore"
check "ALLOW_SAME_USER_APPROVE not hardcoded to 1" "! grep -rn 'ALLOW_SAME_USER_APPROVE.*=.*[\"'\'']*1' src/ --include='*.ts' | grep -v 'process\.env' | grep -q ."
check "No ALLOW_DB_RESET=true in services" "! grep -rn 'ALLOW_DB_RESET.*true' src/services/ --include='*.ts' | grep -q ."

echo ""
echo "--- Financial Integrity ---"
check "No floating-point in statementGenerator" "! grep -n 'reduce((s' src/services/statementGenerator.ts | grep -v Decimal | grep -v sumRound2 | grep -q ."
check "No floating-point in journal_entry_service" "! grep -n 'reduce((s' src/services/journal_entry_service.ts | grep -v Decimal | grep -v sumRound2 | grep -q ."
check "Decimal.js imported in statementGenerator" "grep -q 'sumRound2' src/services/statementGenerator.ts"
check "Decimal.js imported in journal_entry_service" "grep -q 'sumRound2' src/services/journal_entry_service.ts"

echo ""
echo "--- Infrastructure ---"
check "Dockerfile exists" "test -f Dockerfile"
check "docker-compose.yml exists" "test -f docker-compose.yml"
check "Migrations directory exists" "test -d migrations"
check "Health endpoint defined" "grep -q '/health' src/server.ts"
check "Session write guard exists" "test -f src/lib/session_write_guard.ts"

echo ""
echo "--- Key Files ---"
check "Ed25519 keygen utility" "test -f src/crypto/keygen.ts"
check "Cert signing module" "test -f src/lib/cert_signing.ts"
check "Financial rules config" "test -f shared/config/financial_rules.json"
check "Migration runner" "test -f src/db/migrate.ts"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ $FAIL -gt 0 ]; then
  echo "Fix failures before deploying."
  exit 1
else
  echo "Ready for production deployment."
  exit 0
fi
