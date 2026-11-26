#!/usr/bin/env bash
# Applies all migrations to a throwaway PostgreSQL database and runs the RLS /
# authorization test suite. Requires a local PostgreSQL server (psql on PATH).
#   PGHOST/PGUSER/PGPASSWORD may be set; defaults to the local postgres superuser.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-whrmis_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f tests/00_supabase_stubs.sql
for f in migrations/*.sql; do
  echo "→ applying $(basename "$f")"
  "${PSQL[@]}" -d "$DB" -f "$f"
done
echo "→ running tests"
"${PSQL[@]}" -d "$DB" -f tests/rls_tests.sql
echo "✔ all database tests passed"
