# Frozen-boundary rebaseline — owner-authorized, once

The protected `field-selection.ts` boundary was moved **by explicit owner
decision**, for PR #220's default-off diagnostics capability. This is a recorded
boundary transition, not a silent hash fix.

## Hashes

| | SHA-256 |
| --- | --- |
| **Prior boundary** (preserved everywhere for provenance) | `3e84fa8a043570713991643830c7b95e0f7189a4ed037b737c783353d519106d` |
| **New approved boundary** | `8e05462a86449c5e7cd91993e213ed0447a2389aae6bd3216cefd1b4e895e79c` |

An intermediate hash `b0ef337943afa4c7a84c6046d8617dc5931fc921bf6641de0a839377768b8f9a`
appeared in the first CI failure. It was **deliberately not used**: the file had
not yet received the runtime invariant enforcement or the conditional spread. The
boundary was computed only after the file was content-complete and formatted.

## Order of operations

1. Runtime invariant enforcement added.
2. Conditional spread added so the default object has no new own property.
3. `npx prettier --write src/pipeline/extractor/field-selection.ts`.
4. Final SHA-256 computed.
5. Recorded here.
6. Only then were the four governance tests updated.

## How history was preserved

Historical constants keep their historical values and are **not edited**. Each
guard file gains a separately named current boundary derived from the historical
one, and the live assertion compares against that:

| File | Historical constant (unchanged) | Live comparison |
| --- | --- | --- |
| `brand-otsu-threshold.test.ts` | `GUARDED_HASHES` | `APPROVED_CURRENT_HASHES_AFTER_PR_220` |
| `brand-local-contrast.test.ts` | `HASHES_AT_MERGED_PR_198` | `APPROVED_CURRENT_HASHES_AFTER_PR_220` |
| `brand-mild-sharpening.test.ts` | `HASHES_AT_MERGED_PR_197` | `APPROVED_CURRENT_HASHES_AFTER_PR_220` |
| `issue-149-alcohol-reselection.test.ts` | `FIELD_SELECTION_HASH_BEFORE_PR_220` | `FIELD_SELECTION_HASH_APPROVED_AFTER_PR_220` |

No new hash was placed inside a constant named as though it were the value at
merged PR #197 or PR #198. `HASHES_AT_MERGED_PR_197` and
`HASHES_AT_MERGED_PR_198` still hold exactly what they held at those commits.

## Test descriptions were rewritten, not just re-pointed

The old descriptions claimed the file was byte-identical to the PR #195 baseline.
That is no longer true, so the wording changed to:

> "keeps extractor.ts and regions.ts frozen, and field-selection.ts at the PR 220
> approved boundary"

and, for the alcohol guard:

> "keeps OCR, preprocessing, PSM, parsing, thresholds, Warning and route hashes
> frozen, with field-selection.ts at the PR 220 approved boundary"

## What still protects the selector

The file hash no longer proves the selector is unchanged, so the protection moved
to behavioural tests in
`src/pipeline/extractor/brand-filter-diagnostics.test.ts`:

- ranked order, kept status, authoritative `filterReason`, score, ranking,
  selected value, confidence, alternates, authority state, abstention reason and
  line-level diagnostics are asserted **identical** with diagnostics off and on;
- the default path is asserted to have neither new key as an own property, and
  unchanged `Object.keys` and JSON serialization;
- eight runtime invariants are enforced whenever diagnostics are enabled.

`extractor.ts` and `regions.ts` remain frozen at their historical hashes and
were not touched.
