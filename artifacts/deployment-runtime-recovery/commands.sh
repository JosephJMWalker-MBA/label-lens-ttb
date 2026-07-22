#!/usr/bin/env bash
set -euo pipefail

# Safe endpoint probes. Do not include cookies, secrets, or submitted payloads.
ORIGIN="${LABEL_LENS_ORIGIN:-https://ttb-test.com}"

curl -i --max-time 30 "${ORIGIN}/api/health"
curl -i --max-time 30 "${ORIGIN}/api/auth/get-session"
curl -i --max-time 30 "${ORIGIN}/login"

cat <<'SQL'
-- Safe phpMyAdmin metadata checks.
-- Run against the production database only after selecting the intended database.
-- Do not SELECT canonical_json, integrity_signature, session rows, user rows, or panel storage keys.

-- 1. Confirm required tables exist.
SELECT TABLE_NAME, TABLE_TYPE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('__drizzle_migrations', 'submission_revisions', 'submissions', 'users')
ORDER BY TABLE_NAME;

-- 2. Inspect migration table shape without exposing hashes.
SELECT COLUMN_NAME, DATA_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = '__drizzle_migrations'
ORDER BY ORDINAL_POSITION;

-- 3. Count applied migration rows. Two or more rows are expected after 0001.
SELECT COUNT(*) AS applied_migration_count
FROM __drizzle_migrations;

-- 4. Show migration row ids/timestamps only. Do not display hashes.
SELECT id, created_at
FROM __drizzle_migrations
ORDER BY id;

-- 5. Confirm canonical_json type without reading contents.
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'submission_revisions'
  AND COLUMN_NAME = 'canonical_json';

-- 6. After creating one approved synthetic package only, verify stored bytes/digest
-- for that synthetic submission id. Replace the placeholder with the synthetic id.
-- This returns length and a non-reversible digest, not the canonical JSON or signature.
SELECT
  OCTET_LENGTH(canonical_json) AS stored_canonical_bytes,
  SHA2(canonical_json, 256) AS stored_canonical_sha256
FROM submission_revisions
WHERE submission_id = '<synthetic-package-id>'
  AND revision_number = 1;
SQL
