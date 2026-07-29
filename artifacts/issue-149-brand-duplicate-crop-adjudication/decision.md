# Decision — duplicate Brand crop adjudication

Refs Issue #149. **Evidence and adjudication only.** No OCR was run. No
production code, fixture, fixture truth, or prior frozen artifact was modified.
Neither case was substituted, removed, rescored, or deleted. PR #195 untouched.

## Classification: `DISTINCT_SOURCE_SAME_CROP`

Evidence confidence: **high**.

Two genuinely different label images legitimately produce identical approved
Brand crop pixels. Nothing is broken, and nothing needs repair.

## The evidence

| Question | Answer |
| --- | --- |
| Are source images identical? | **No** — different files, different sha256, different byte sizes |
| Are crop rectangles identical? | **Yes** — `left 330, top 351, width 690, height 308` for both |
| Are committed crops identical? | **Yes** — `fab1b411…` for both |
| Are recomputed crops identical? | **Yes** — independent recomputation lands on the same bytes |
| Does each committed crop match its own recomputation? | **Yes**, both, byte-for-byte and pixel-for-pixel |
| Is either case stale or mis-mapped? | **No** |
| May both cases remain in a later experiment? | **Yes**, with the caveat below |

`approved-wine-004` resolves to `tests/fixtures/precheck/approved-wine-004/label.png`
(sha `02c272bc…`). `la-fattoria-rotated` resolves to
`tests/fixtures/precheck/approved-wine-003/label.png` (sha `78a45dc3…`). Both are
1350×1650 and carry the same human-approved Brand region geometry.

## Why identical crop pixels arose

Direct pixel comparison of the two source images:

- **8.06%** of all pixels differ (179,430 of 2,227,500);
- the difference bounding box spans almost the whole label
  (`left 49, top 53, right 1312, bottom 1588`);
- **zero** differing pixels fall inside the approved Brand crop rectangle.

The visual comparison artifact shows why. These are two different bottlings from
the same producer — different varietal wordmarks, different back-panel copy,
different barcodes — printed on a shared label template. The Brand mark occupies
the same position in the same artwork at the same scale, so the approved region
crops to identical pixels while the rest of the label does not.

This is the textbook `DISTINCT_SOURCE_SAME_CROP` case: legitimate duplication
produced by a shared design template, not a copy or mapping fault.

## Why it is not the other explanations

- **Not `COPY_OR_MAPPING_ERROR`.** Each committed crop reproduces exactly from
  its own source image and its own geometry, independently. A mis-emitted crop
  would fail to reproduce from at least one source.
- **Not `STALE_ARTIFACT`.** All eleven governed Brand crops — not just this pair
  — reproduce byte-for-byte from current manifest geometry and current source
  images. There is no drift anywhere in the committed crop set.
- **Not `LEGITIMATE_DUPLICATE_SOURCE`.** The two case IDs do not point at the
  same image. They are separate labels with separate provenance.
- **Not `INDETERMINATE`.** The evidence is complete and mutually consistent.

## Case identity

`la-fattoria-rotated` is a **legacy evaluation case ID** that predates the
numbered corpus. It entered in `cadf483` (Issue #57 extraction-accuracy
baseline), bound to `approved-wine-003/label.png`. No case ID named after that
image directory exists in the legacy evaluation manifest, so the legacy name is
that image's only case identity — it is an alias for a distinct label, not a
duplicate registration of `approved-wine-004`.

`approved-wine-004` entered as a fixture in `e9ee283` and became a governed
research case in `4aac539` (PR #197). Both source images were added in the same
commit, `e9ee283`. All eleven committed crops were generated once, in `552d303`
(PR #200).

Brand truth was read only at this point, after all crop evidence was fixed, and
only to confirm case identity: both cases carry the same acceptable value, which
is consistent with — and expected under — a shared producer template. No truth
string influenced crop generation, hashing, pixel comparison, or the
classification above.

## Consequence for the later traineddata/config experiment

**The experiment is not blocked.** Both historical case records are preserved
exactly as they are.

**Eligible distinct-image denominator: 4.** The five stylization cases have five
distinct source images but only **four distinct Brand crop images**. Any later
analysis over that subset must state 4, not 5, as the number of independent crop
observations, and must not use `approved-wine-004` and `la-fattoria-rotated` as
two independent pieces of treatment evidence.

**A further caution, from visual inspection rather than hashing.**
`approved-wine-005` renders the same producer's Brand mark as the other two, at
a different image scale — a genuinely distinct crop image, but not an
independent Brand *design*. So the stylization subset spans **4 distinct crop
images across only 3 distinct Brand designs**. Whoever sizes the later
comparison should reason about design-level independence, not just crop-level
distinctness. This observation is recorded as a caution, not as a hash-backed
finding.

## Required corrective action

**None to fixtures or artifacts.** No regeneration, no substitution, no
deletion, no re-scoring. The only requirement is a reporting one: future
analysis over the stylization subset carries a distinct-crop denominator of 4
and the design-level caution above.

## Boundaries

- Does not revisit the blinded reader's labels.
- Does not change the historical 5/5 case-level audit result recorded in PR #205
  — that result stands as recorded, with the independence caveat it already
  carried.
- Determines only how many independent images are eligible for future OCR
  experiments.
- No prevalence, causal, or capability-ceiling claim.
- No production behavior change.
