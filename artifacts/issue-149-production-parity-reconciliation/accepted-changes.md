# Accepted fixture changes

Seven response records are accepted. No other case changed.

## PR #150: dotted fused Alcohol prefixes

Merged commit: `5edec007cbef17fc86baac2d48ee902cb6c14df9`

Accepted cases: `patricia-green-cellars`, `approved-wine-055`,
`approved-wine-077`, `approved-wine-095`, `approved-wine-096`, and
`approved-wine-097`.

The merged implementation intentionally made already-observed
`ALC./VOL.`-style markers reachable by the production Alcohol selector. Its
committed baseline/treatment artifacts list exactly these six changed cases,
classify every change as a correct recovery, report no regressions, and retain
conservative `LOW_CONFIDENCE` for the two weak cases.

Safety impact: no new selector category, threshold relaxation, truth input, or
cross-field behavior is introduced by this reconciliation. Reviewer-facing
consequence: the exact fixture now expects the already-merged Alcohol
observations and their provenance instead of obsolete `NOT_OBSERVED` payloads.

## PR #151: explicit ABV marker

Merged commit: `8827ec2ce8b901a38f6b136cbb35f1ac7a76437c`

Accepted case: `approved-wine-013`.

The merged implementation intentionally recognized an explicit whole-token
ABV statement. Its committed artifacts identify this case as the sole changed
response and a correct recovery.

Safety impact: the accepted value comes from the production OCR evidence
already governed by PR #151; this task changes no OCR or selection behavior.
Reviewer-facing consequence: the fixture now expects the merged
`13.5% BY VOL.` observation and provenance.

## Fixture consequence

Old fixture SHA-256:
`31a30c138d7a0bc8263b5c911419d8429f98e1948c544b86a6f72f2b9235efa5`

New fixture SHA-256:
`4ec2851ebe4c65bc41fd17983236f3236fb436e2df9eb0a6814f5d4543c8fb73`

The comparison remains exact serialized response-byte equality for all 115
ordered cases.
