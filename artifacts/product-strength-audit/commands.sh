#!/usr/bin/env bash
set -euo pipefail

# Reproduce the local, read-only source inventory and artifact validation from the
# repository root. GitHub issue reads and deployed browser observations were
# performed through connected tools and are documented in limitations.md.

git rev-parse HEAD
git status --short --branch
git worktree list

rg --files src/app src/lib src/server src/features src/components src/db docs tests .github
rg -n "request changes|changes_requested|internally_accepted|resubmit|revision" src
rg -n "export async function (GET|POST|PUT|PATCH|DELETE)" src/app/api/agent src/app/api/package
rg -n "isDemo|revisionNumber|idempotency|integrity" \
  src/app/api/package src/server/submissions src/db src/lib
rg -n "brand|alcohol|candidate filtering|vertical|latency|false" \
  docs/extraction-full-corpus/extractor-report.md \
  docs/ocr-region-isolation-benchmark/report.md \
  artifacts/brand-evidence-path-diagnosis/metrics.md \
  artifacts/alcohol-digit-ocr-diagnosis/summary.md \
  artifacts/alcohol-truth-correction/metric-diff.md
rg -n "61%|57%|68\.0%|66\.0%|70/103|68/103" artifacts/product-strength-audit
rg -n "Proposed|Cloudflare|R2|reset|resubmission|auth|persistence" \
  docs/architecture.md docs/product-plan.md docs/remaining-work-plan.md docs/adr

find artifacts/product-strength-audit -type f -print | sort
test -z "$(git status --short | awk '$2 !~ /^artifacts\/product-strength-audit\// {print}')"
bash -n artifacts/product-strength-audit/commands.sh

for audit_file in artifacts/product-strength-audit/*; do
  audit_rc=0
  git diff --no-index --check /dev/null "$audit_file" || audit_rc=$?
  test "$audit_rc" -le 1
done

npx prettier --check .
npm run docs:check

git diff --check
git status --short --branch
