# Preregistration amendment 1 — define `severeRepeatedUnsupportedOutput`

Refs Issue #149, PR #216. **Pre-inference clarification.**

## Provenance

| Field | Value |
| --- | --- |
| Prior preregistration SHA-256 | `ac2c1793c3c7c2463028f27e5507147a76e4a5196cd117fab451d207f40aaa22` |
| Prior preregistration commit | `2ccfe22771a9f5f071099f0ec4e8641b3089ea5c` |
| Base | `origin/main` `9372ebbb4f0cd3f4d58023e944c2500f28c8fe7b` |
| Amendment number | 1 |

## State at the time of this amendment

- **The model had not been retrieved.** No download of `inference.onnx` had
  occurred; the cache is empty and the fail-closed retrieval script had not run.
- **No inference had been performed.** Arm B had run zero of its twelve
  invocations.
- **Tesseract had not been executed.** Arm A is carried forward, and no
  current-code Tesseract run is authorized in this experiment at all.
- **No Brand truth had been read.**
- **No experimental result of any kind existed** — no raw output, no descriptor,
  no probability tensor, no transcript, no metric, no classification, no verdict.
- No execution workflow existed on the branch, so no inference could have been
  started.

This clarification therefore cannot have been informed by any outcome. It could
not have been chosen to favour or disfavour either arm, because nothing had been
observed.

## What changed

The `REGRESSION` verdict already listed a condition described in prose as "severe
repeated unsupported output". That phrase was not operationally defined: it did
not say how many items, at what independence level, or under which
classifications. This amendment gives it an exact definition and a name,
`severeRepeatedUnsupportedOutput`.

### The definition, as now frozen

**True only when** primary PP-OCRv6 outputs are classified `NOT_VISUALLY_SUPPORTED`
in **at least two distinct crop clusters** spanning **at least two distinct Brand
designs**. Otherwise false.

Counting rules:

- the primary and the repeat of one item count **once**;
- the byte-identical C1 crop counts **once**;
- multiple OCR items in one crop cluster count **once**;
- multiple items in one Brand design count **once**;
- `PARTIALLY_VISUALLY_SUPPORTED` does **not** satisfy the condition;
- `UNADJUDICATED` does **not** satisfy the condition;
- **truth mismatch alone never establishes non-support.**

`NOT_VISUALLY_SUPPORTED` requires **direct inspection of the frozen crop pixels**.
Where meaningful inspection is unavailable, the item is `UNADJUDICATED`, and
visual support is never inferred from the transcript or from the truth string.

## Files updated

| File | Change |
| --- | --- |
| `preregistration.md` | Added the exact definition and counting rules under the `REGRESSION` rule |
| `decision-rules.json` | Renamed the condition to `severeRepeatedUnsupportedOutput` and added a structured definition block |
| `visual-support-protocol.md` | Added the evidence requirement and the full counting rules |
| `limitations.md` | Recorded that the condition is deliberately hard to trigger, and that this is a limitation as well as a safeguard |

## What did not change

Nothing else. Specifically unchanged:

- the frozen population — 5 cases, 6 OCR items, 5 pixel sets, 4 crop clusters,
  3 Brand designs, and the staged input hashes;
- both arms, including the Arm A carry-forward and every Arm B pin, hash, byte
  size, runtime, preprocessing and decoding rule;
- the three text representations, and which is primary;
- every metric, including PR #214's exact useful-token definition;
- **the CER thresholds — 0.10 material CER delta and 0.25 material recall delta
  are untouched**;
- the confidence boundary, both score definitions, and
  `NOT_ASSESSABLE_NO_CALIBRATED_AUTHORITY_MAPPING`;
- **every `KEEP_FOR_EXPANDED_BENCHMARK` requirement**;
- the `NO_EVIDENCE_OF_GAIN` and `INCONCLUSIVE` rules;
- the per-item classification vocabulary and the material-improvement definition;
- the design-regression rule, the crop-cluster rule and the aggregation rule;
- the truth-isolation plan and the invocation matrix.

The other two `REGRESSION` triggers — any distinct Brand-design regression, and
unexplained runtime failure — are unchanged and are unaffected by this amendment.

## Direction of the change

Stated plainly, because an amendment that tightens or loosens a gate should say
which it does: **this definition makes the condition harder to satisfy than a
loose reading of the original prose.** "Severe repeated unsupported output" could
have been read to cover, say, three unsupported items within one Brand design.
Under this definition it does not: two distinct crop clusters **and** two distinct
Brand designs are both required, and `PARTIALLY_VISUALLY_SUPPORTED` and
`UNADJUDICATED` do not count.

That is the intended reading — the condition is meant to catch a broad pattern of
fabricated output rather than to act as a per-item hallucination detector — but it
is recorded here rather than left for a reader to infer after results exist. The
countervailing constraint is unchanged and remains the stricter gate: **any single
distinct Brand-design regression on the primary metric is already a `REGRESSION`
on its own**, with no threshold and no second-design requirement.

## New preregistration hash

`preregistration.sha256` is recomputed over the amended `preregistration.md`. The
prior hash above remains the identity of the pre-amendment text and is not
overwritten anywhere; this file is the sole record linking the two.
