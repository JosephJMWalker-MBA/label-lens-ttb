# Stateless Vision Grid Contract

## Scope

This document describes the evaluation-only Slice 1 contract for a stateless vision observer that sees a gridded derivative while OCR would continue to inspect the untouched original image.

The slice does not invoke a real VLM, run OCR, classify fields, make compliance judgments, or alter any production extraction, ranking, parsing, confidence, API, UI, persistence, or geometry behavior.

## Grid notation

- Schema version: `observer-grid.v1`
- Coarse grid: `10 x 10`
- Coarse columns: `A` through `J`
- Coarse rows: `1` through `10`
- Range notation: inclusive cell ranges such as `A1`, `H3:J7`, or `B2:C3`
- Origin: original-image top-left
- Source crop: none
- Aspect ratio policy: preserve the full original image

Local refinement is nested inside one coarse proposal:

- Refinement grid: `5 x 5`
- Refinement columns: `A` through `E`
- Refinement rows: `1` through `5`
- Parent frame: the coarse proposal rectangle

## Source and overlay artifacts

Each run writes two distinct workspace artifacts:

- Original source artifact: a byte-for-byte copy of the input image
- Observer overlay artifact: a deterministic PNG rendered with `sharp`

The contract preserves separate SHA-256 digests for:

- `sourceSha256`
- `overlaySha256`

OCR handoff may reference only a caller-owned original source artifact reference and the original source digest. The overlay artifact path and overlay digest are preserved only as explicit rejections inside the handoff record.

The workspace-local source copy exists only to support deterministic derivative generation and local integrity checks. It is not a durable OCR source reference and is deleted with the temporary workspace.

## Coordinate conversion

The observer proposes coarse or refined grid ranges in the observation frame. The adapter converts those ranges into canonical original-image geometry:

- `proposedRegion.normalizedBox`
- `proposedRegion.pixelBox`

The adapter then derives a padded OCR inspection region from that proposal:

- `ocrInspectionRegion.normalizedBox`
- `ocrInspectionRegion.pixelBox`

The overlay itself is not handed to OCR.

## Halo policy

Halo expansion is versioned as `observer-grid-halo.v1` with `paddingRatio: 0.04`.

The contract records both:

- requested per-edge padding
- actual per-edge padding after clamping to image boundaries

Clamping is authorized only for this explicit halo expansion. Malformed normalized geometry is rejected rather than silently clamped.

## Rotation and refinement

The geometry adapter supports:

- coarse proposals on the full `10 x 10` grid
- local refinement on a nested `5 x 5` grid
- temporary observation rotations of `0`, `90`, `180`, and `270` degrees
- inverse mapping back into the original unrotated image frame

Tests cover corners, edges, square and non-square images, refinement round trips, and rotation round trips.

## Lifecycle cleanup

Each observation run creates an isolated temporary workspace and preserves:

- `observationRunId`
- adapter and prompt identifiers plus versions
- source and overlay digests
- `startedAt`
- `completedAt`
- `cleanupCompleted`

Timeout uses an `AbortSignal` passed into the adapter. Cleanup occurs only after the observer has actually terminated or rejected, then the temporary workspace is removed in `finally`.

## Authority separation

Observer proposals are intentionally field-agnostic and machine-bounded. The allowed metadata is limited to:

- `observationType: text-like-region`
- apparent orientation
- visibility
- bounded reason codes
- bounded free-text description
- `source: machine-observer`
- `authority: non-authoritative`
- `purpose: ocr-region-proposal`

The contract rejects descriptions or metadata that imply:

- pass or fail status
- regulatory or legal conclusions
- brand or alcohol classification
- transcribed or expected text
- correctness probabilities
- human-created or human-confirmed evidence
- application facts or regulatory findings

## Limitations

- The fake observer is deterministic and fixture-driven.
- No real VLM is installed or invoked.
- No OCR is executed in this slice.
- No proposal pruning, selection logic, or production behavior changes are authorized here.
