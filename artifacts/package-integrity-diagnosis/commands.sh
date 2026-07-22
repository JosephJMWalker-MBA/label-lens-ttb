#!/usr/bin/env bash
set -euo pipefail

# Commands are representative and intentionally use placeholders.
# Do not paste real secrets, private paths, raw package JSON, or full signatures into artifacts.

git worktree add -b codex/issue-160-package-integrity-diagnosis <worktree> origin/main

npm install

# Baseline strict-mode reproduction on the original TEXT schema:
mysql --protocol=TCP --host=127.0.0.1 --port=<port> --user=<user> \
  -e "SET GLOBAL sql_mode = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'"

env \
  RUN_MYSQL_TESTS=1 \
  DATABASE_URL=<mysql-url> \
  LABEL_LENS_DB_DIALECT=mysql \
  LABEL_LENS_INTEGRITY_SECRET=<stable-test-secret> \
  LABEL_LENS_APPEND_SIGNING_KEY=<stable-test-append-key> \
  LABEL_LENS_STORAGE_DIR=<synthetic-panel-storage-dir> \
  BETTER_AUTH_SECRET=<stable-test-auth-secret> \
  BETTER_AUTH_URL=http://localhost:3000 \
  node_modules/.bin/vitest run --no-file-parallelism \
  src/app/api/package/submit/finalize/route.test.ts \
  -t "round-trips a valid canonical snapshot larger than the MySQL TEXT ceiling"

# Baseline permissive-mode reproduction on the original TEXT schema:
mysql --protocol=TCP --host=127.0.0.1 --port=<port> --user=<user> \
  -e "SET GLOBAL sql_mode = ''"

# Bounded verification query/script reported only canonical byte count, signature length,
# signature version, and verification boolean for the synthetic record.

# Generate and apply the correction:
node_modules/.bin/drizzle-kit generate

env DATABASE_URL=<mysql-url> node_modules/.bin/drizzle-kit migrate

# Post-fix verification:
env \
  DATABASE_URL=<mysql-url> \
  LABEL_LENS_DB_DIALECT=mysql \
  LABEL_LENS_INTEGRITY_SECRET=<stable-test-secret> \
  LABEL_LENS_APPEND_SIGNING_KEY=<stable-test-append-key> \
  LABEL_LENS_STORAGE_DIR=<synthetic-panel-storage-dir> \
  BETTER_AUTH_SECRET=<stable-test-auth-secret> \
  BETTER_AUTH_URL=http://localhost:3000 \
  npm run test:mysql

node_modules/.bin/vitest run src/lib/integrity.test.ts src/app/api/package/submit/finalize/route.test.ts

env \
  RUN_MYSQL_TESTS=1 \
  DATABASE_URL=<mysql-url> \
  LABEL_LENS_DB_DIALECT=mysql \
  LABEL_LENS_INTEGRITY_SECRET=<stable-test-secret> \
  node_modules/.bin/vitest run --no-file-parallelism \
  src/server/migrate.test.ts \
  -t "preserves an existing valid signed revision"

npm run typecheck
