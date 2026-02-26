#!/bin/bash
# Generate Ed25519 keypair for certification artifact signing.
# Uses the built-in Node.js keygen utility (no OpenSSL dependency).
#
# Usage:
#   ./scripts/generate-keys.sh          # Generate and print keys for .env
#   npm run keygen                      # Same thing via package.json script
#
# Output format: base64-encoded DER (PKCS#8 private, SPKI public)
# — matches what CERT_SIGNING_PRIVATE_KEY and CERT_SIGNING_PUBLIC_KEY expect.

set -e

echo "Generating Ed25519 keypair for certification signing..."
echo ""

# Use the built-in keygen (compiles and runs src/crypto/keygen.ts)
if command -v npx &> /dev/null; then
  npx tsx src/crypto/keygen.ts
else
  echo "ERROR: npx not found. Install Node.js 18+ and run: npm run keygen"
  exit 1
fi

echo ""
echo "Copy the CERT_SIGNING_PRIVATE_KEY and CERT_SIGNING_PUBLIC_KEY values into your .env file."
echo "WARNING: Keep the private key secret. Never commit it to version control."
