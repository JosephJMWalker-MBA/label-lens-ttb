#!/usr/bin/env bash
# Issue #149 — load-bearing assertions over the acquisition adapter's surface.
#
# Non-OCR. It reads one source file and exits nonzero when the surface is wrong.
#
# It is a separate executable so the same assertions that run inside commands.sh
# can be run by a test against a TEMPORARY MODIFIED COPY of the adapter. A check
# that has never been observed to fail is not known to be a check.
set -euo pipefail

ADAPTER="${1:?usage: assert-adapter-surface.sh <adapter-path>}"

# grep -c exits 1 on no match, so each count is captured and then asserted.
api_count=$(grep -c 'export async function acquireProductionBrandEvidence' "${ADAPTER}" || true)
snapshot_count=$(grep -c 'const snapshot = snapshotAcquisitionInput(input);' "${ADAPTER}" || true)
sealed_count=$(grep -c 'return sealSuccessfulItem(' "${ADAPTER}" || true)
writer_count=$(grep -c 'export function writeSealedEvidencePackage' "${ADAPTER}" || true)
obsolete_count=$(grep -c 'export function finalizeProductionBrandEvidence' "${ADAPTER}" || true)
raw_result_count=$(grep -c 'export interface ProductionBrandEvidenceSuccess' "${ADAPTER}" || true)

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

echo "ADAPTER_SURFACE_VERIFIED api=${api_count} snapshot=${snapshot_count} sealed=${sealed_count} writer=${writer_count} obsolete=${obsolete_count}"
