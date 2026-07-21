# E3 hypothesis — what kind of failure is `OCR_RECOGNITION_MISS`?

**Measurement only. No production code, OCR configuration, candidate generation,
matching behaviour, ranking, authority state, fixture, test, schema, UI or
package was modified.** Branch `research/brand-ocr-recognition-miss-diagnosis`,
base `a4a0fd9` (`git-sha.txt`).

## Question

Among the 24 cases classified `OCR_RECOGNITION_MISS` in the preserved brand
evidence-path diagnosis, how many are bounded one-edit near misses, how many are
partial recognitions, and how many are true non-recognitions?

The purpose is to identify which future research family, **if any**, is
justified. **This experiment does not authorize a production tolerance rule.**

## Prior expectation, recorded before the probe ran

The evidence-path diagnosis noted that the harness's containment test is
exact-after-normalization, so a one-character miss scores identically to a label
the engine never read. A first pass found 3 of 24 where a single-character
deletion of the truth already appeared in the captured lines, which suggested
near misses might be a meaningful share — plausibly enough to justify studying a
bounded matching tolerance later.

## Result

**That expectation was wrong, in the direction that matters.**

| Category | Count | Share |
|---|---|---|
| `BOUNDED_NEAR_MISS` | **2** | 8.3 % |
| `PARTIAL_RECOGNITION` | **9** | 37.5 % |
| `TRUE_NON_RECOGNITION` | **13** | 54.2 % |

A bounded matching tolerance is the **smallest** of the three families, reaching
2 cases out of 115 corpus-wide (1.7 %). More than half the class is text the
engine did not meaningfully read at all: 12 of 24 have no distinctive fragment of
the brand anywhere in the OCR output.

The strongest structural signal is not about matching at all — it is layout.
**7 of the 9 cases in the `decorative-or-script-brand` slice are true
non-recognitions**, and one brand (`La Fattoria`) appears five times in this set
with its outcome tracking presentation rather than anything about matching.
