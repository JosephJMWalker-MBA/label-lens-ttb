# What the evidence supports

The three categories point at three different research families. The measured
sizes are what should decide which, if any, is opened.

| Category | Cases | Family it points toward |
|---|---|---|
| `BOUNDED_NEAR_MISS` | **2** | bounded matching-tolerance |
| `PARTIAL_RECOGNITION` | **9** | reconstruction / segmentation / evidence composition |
| `TRUE_NON_RECOGNITION` | **13** | OCR, region proposal, preprocessing, local vision |

## 1. Bounded matching tolerance — **CLOSED FOR NOW**

Reaches **2 cases (1.7 % of the corpus)**. Even widening the pre-registered bound
to distance 2 would newly reclassify at most 3 more, because 4 of the 5 cases at
distance 2 already qualify as partial recognitions on token evidence.

**Decision: this family is closed for now** (`decision.md`). Two cautions that are
not about size, and that survive the closure:

- **Edit-distance proximity is not authority evidence.** A span one edit from the
  expected brand is a statement about string shape. It does not establish that the
  pipeline observed the brand and must never promote an observation to `OBSERVED`.
- Any such study would be a *measurement* of how a tolerance would behave on the
  evaluator's matching, not a licence to implement fuzzy matching. **Nothing here
  recommends implementing fuzzy matching.**

## 2. Reconstruction / segmentation / evidence composition — mid-sized, and the most tractable

Reaches **9 cases**. The population is specific and well characterised:

- 3 cases had **every** part of the brand present in the OCR output and never
  composed (`Twin Suns` ×2, `Golden Road Vineyards`);
- 4 read a complete distinctive token but dropped a short leading token
  (`fattoria` without `La`, `negro` without `Domenico`);
- 2 are apparent truncations at the edge of the readable region.

7 of 24 cases have the truth split across two or more reconstructed lines.

**Constraint carried forward:** this is *not* an invitation to reopen the closed
sub-span-generation family. That family failed twice, on measurement, because
generating more spans admits far more noise than signal and because the authority
gate cannot arbitrate sub-span material. Any composition research must start from
a different mechanism — line grouping and word-boundary reconstruction — and must
be evaluated against brand-absent cases first, as E1b's Phase 1 screen was.

## 3. OCR / region proposal / preprocessing / local vision — **largest family**

Reaches **13 cases (54 %)**, and the corpus signal is unusually clean:

- **12 of 24 cases have no 4-character fragment of the brand anywhere in the OCR
  output.** There is nothing to match, compose, or tolerate.
- **7 of the 9 `decorative-or-script-brand` cases are true non-recognitions.**
- **8 of 13 true non-recognitions have a high-confidence best span** — the engine
  read something clearly; it was not the brand. This is a *region* and
  *typeface* problem, not a confidence problem.
- The `La Fattoria` family is the demonstration: the same brand string lands in
  two different categories across five fixtures purely on presentation.
- All 24 best spans came from the primary upright pass; recovery never engaged.

## Recommendation

**The evidence points at family 3, and secondarily at family 2. It does not
support opening a matching-tolerance family.**

**Next priority, to begin later from a fresh branch based on then-current
`origin/main`:** a diagnostic-only study of the 13 true-non-recognition cases
asking whether any OCR pass the pipeline already runs **geometrically covered the
brand region**, classifying each case into:

- region not covered;
- region covered but no text recognized;
- region covered with severe glyph misrecognition;
- orientation or segmentation failure;
- unattributed.

**Do not rerun matching-tolerance experiments first.** Partial-recognition
composition (family 2) remains secondary to this. The discipline is the same one
used here: measure first, propose nothing.

**Standing constraints for whatever comes next:** do not weaken `OBSERVED`; do not
treat proximity or rank as authority evidence; do not combine with the closed
sub-span-generation family; measure brand-absent behaviour before brand-present
gains.

## Not recommended

- Implementing fuzzy matching. Not proposed, not authorized, and reaching 2 cases.
- Widening the pre-registered distance bound to make family 1 look larger.
- Any production change on the strength of this round. It is measurement only.
