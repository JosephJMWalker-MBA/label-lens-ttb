# Decision — brand region-coverage diagnosis

**Measurement only. No production code, OCR configuration, recovery planning,
fixture, schema, test, UI or package was changed, and no treatment was
implemented or deployed.** Base recorded in `git-sha.txt`.

## 1. Study complete for its approved scope

Phase 2 is **complete for the 10 annotation-approved primary cases**, with 6
controls reported separately. It is **not** a classification of all 13
`TRUE_NON_RECOGNITION` cases (`population.md`).

## 2. Three cases excluded for policy reasons

`approved-wine-074`, `approved-wine-083`, `wine-multi-artifact-07` were excluded
during annotation review because their evaluation depends on the unresolved
**company-name-vs-brand-name** policy question. **No Phase-2 category was assigned
to any of them**, their annotations remain proposed-and-unapproved, and the
exclusion preceded any look at their OCR mechanism. **No fixture was modified.**

That policy question reaches 13 of 105 brand-present fixtures and all four cases
the pipeline currently marks `OBSERVED` correctly. **It must be resolved
separately, before those three cases can be classified.**

## 3. The region-coverage hypothesis is falsified for the measured population

**All 10 primary cases had 1.00 coverage of the annotated brand region, and all 10
still failed.** `REGION_NOT_COVERED` = **0**.

Geometric inclusion did not distinguish success from failure. **Full-image
inclusion is not proof that the brand was effectively examined** — which is why
pass coverage, word geometry, and recognition behaviour were measured as three
separate layers.

## 4. Region proposal is not supported as the next treatment

For **these 10 cases**, region coverage is ruled out as the first failure. This
round therefore recommends **no region-proposal, YOLO, or image-first
implementation**.

**This does not close issue #77 and does not claim region proposal can never help
any Label Lens case.** It is a bounded negative result over one population of ten.

## 5. Segmentation, text detection and typeface diagnosis remain live

The failures sit downstream of coverage:

| Category | Count |
|---|---|
| `REGION_COVERED_NO_TEXT_RECOGNIZED` | **3** |
| `ORIENTATION_OR_SEGMENTATION_FAILURE` | **5** |
| `REGION_COVERED_SEVERE_GLYPH_MISRECOGNITION` | **2** |
| `REGION_NOT_COVERED` | **0** |
| `UNATTRIBUTED` | **0** |
| **Sum** | **10** |

The next diagnostic examines **already-covered regions** and separates
glyph-boundary/text-detection failure, OCR line-grouping and segmentation
failure, and preprocessing/typeface recognition failure. **Do not implement
preprocessing, local vision, or an alternate OCR engine before that separation
exists.**

## 6. No production implementation is recommended

Nothing in this record authorizes a production change. The standing constraints
carry forward: do not weaken `OBSERVED`; do not treat coverage, proximity, or rank
as authority evidence; do not reopen the closed sub-span-generation family;
measure brand-absent behaviour before brand-present gains.
