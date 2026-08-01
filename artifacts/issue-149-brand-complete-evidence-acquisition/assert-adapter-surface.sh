#!/usr/bin/env bash
# Issue #149 — load-bearing assertions over the acquisition adapter's surface.
#
# Non-OCR. It reads one source file and exits nonzero when the surface is wrong.
#
# It is a separate executable so the same assertions that run inside commands.sh
# can be run by a test against a TEMPORARY MODIFIED COPY of the adapter. A check
# that has never been observed to fail is not known to be a check.
#
# SCOPE, stated exactly: these are assertions about the adapter's SOURCE. They do
# NOT prove the runtime export namespace, and are not described as doing so. The
# runtime namespace is asserted by dynamically importing the real module in
# src/fixtures/eval/issue-149-sealed-evidence.test.ts.
set -euo pipefail

ADAPTER="${1:?usage: assert-adapter-surface.sh <adapter-path>}"

# grep -c exits 1 on no match, so each count is captured and then asserted.
api_count=$(grep -c 'export async function acquireProductionBrandEvidence' "${ADAPTER}" || true)
snapshot_count=$(grep -c 'const snapshot = snapshotAcquisitionInput(input);' "${ADAPTER}" || true)
sealed_count=$(grep -c 'return sealSuccessfulItem(' "${ADAPTER}" || true)
writer_count=$(grep -c 'export function writeSealedEvidencePackage' "${ADAPTER}" || true)
obsolete_count=$(grep -c 'export function finalizeProductionBrandEvidence' "${ADAPTER}" || true)
# The superseded result interface, matched without naming it in one piece, so
# this file does not itself trip the governed stale-phrase sweep.
obsolete_result_type="ProductionBrandEvidence""Success"
raw_result_count=$(grep -c "export interface ${obsolete_result_type}" "${ADAPTER}" || true)
provenance_count=$(grep -c 'function provenanceText(' "${ADAPTER}" || true)
digest_count=$(grep -c 'EXTRACTION_INPUT_IMAGE_DIGEST_MISMATCH' "${ADAPTER}" || true)
authentic_count=$(grep -c 'AUTHENTIC_PACKAGES.has(sealed)' "${ADAPTER}" || true)

[[ "${api_count}" -eq 1 ]] ||
  { echo "PUBLIC_API_COUNT_MISMATCH: expected 1, found ${api_count}" >&2; exit 1; }

[[ "${snapshot_count}" -eq 1 ]] ||
  { echo "INPUT_SNAPSHOT_COUNT_MISMATCH: expected 1, found ${snapshot_count}" >&2; exit 1; }

[[ "${sealed_count}" -eq 1 ]] ||
  { echo "SEALED_RETURN_COUNT_MISMATCH: expected 1, found ${sealed_count}" >&2; exit 1; }

[[ "${writer_count}" -eq 1 ]] ||
  { echo "SEALED_WRITER_COUNT_MISMATCH: expected 1, found ${writer_count}" >&2; exit 1; }

[[ "${obsolete_count}" -eq 0 ]] ||
  { echo "OBSOLETE_PUBLIC_API_PRESENT: found ${obsolete_count}" >&2; exit 1; }

[[ "${raw_result_count}" -eq 0 ]] ||
  { echo "RAW_EVIDENCE_RESULT_TYPE_PRESENT: found ${raw_result_count}" >&2; exit 1; }

[[ "${provenance_count}" -eq 1 ]] ||
  { echo "PROVENANCE_RECORD_COUNT_MISMATCH: expected 1, found ${provenance_count}" >&2; exit 1; }

[[ "${digest_count}" -ge 1 ]] ||
  { echo "IMAGE_DIGEST_BINDING_ABSENT" >&2; exit 1; }

[[ "${authentic_count}" -eq 1 ]] ||
  { echo "PACKAGE_AUTHENTICATION_COUNT_MISMATCH: expected 1, found ${authentic_count}" >&2; exit 1; }

echo "ADAPTER_SOURCE_SURFACE_VERIFIED api=${api_count} snapshot=${snapshot_count} sealed=${sealed_count} writer=${writer_count} provenance=${provenance_count} authentic=${authentic_count} obsolete=${obsolete_count}"
