#!/bin/sh
set -e

echo "=== Sovereign CPA Engine ==="
echo "Running database migrations..."
node dist/db/migrate.js || echo "Warning: migrations skipped (DB may not be ready yet — lazy migration will run on first request)"

echo "Starting application..."
exec node dist/server.js
