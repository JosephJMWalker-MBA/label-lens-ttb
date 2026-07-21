# Population and scope

**Phase 2 classified 10 cases, not 13.** Nothing in this record should be read as
a classification of the full `TRUE_NON_RECOGNITION` population.

## How the population narrowed

| Stage | Count |
|---|---|
| Initial primary population — `TRUE_NON_RECOGNITION` from the preserved E3 record | **13** |
| Excluded during annotation review, on the company-name-vs-brand-name policy question | **3** |
| **Annotation-approved primary cases carried into Phase 2** | **10** |
| Pre-registered controls, reported separately | **6** |
| **Total cases measured** | **16** |

## The 10 classified primary cases

`la-fattoria-rotated` · `approved-wine-004` · `approved-wine-005` ·
`approved-wine-023` · `approved-wine-027` · `approved-wine-031` ·
`approved-wine-035` · `approved-wine-085` · `approved-wine-091` ·
`wine-multi-artifact-04`

Each received exactly one first-failure category; the categories sum to 10.

## The 3 excluded cases

`approved-wine-074` · `approved-wine-083` · `wine-multi-artifact-07`

For each: annotation status is **PROPOSED, not approved**; **no Phase-2 category
was assigned**; and **the exclusion was decided during annotation review, before
their pass coverage or word overlap was examined** — so the exclusion cannot have
been influenced by what their OCR evidence turned out to look like. Full detail,
including each recorded truth and the reader's competing reading, is in
`excluded-policy-cases.json` and `annotation-review/truth-conflict-referrals.md`.

**No fixture was modified.** These are referrals, not corrections.

## The 6 controls

`luigi-giovanni-live` · `approved-wine-013` · `amuninni-ferracane` ·
`approved-wine-105` · `approved-wine-107` · `approved-wine-108`

Fixed before any Phase-2 measurement: all remaining `decorative-or-script-brand`
cases plus all `La Fattoria` fixtures, deduplicated, excluding the primary set.

**Control regions are machine-derived, not human-approved.** They are reported
separately, they carry **no** first-failure category, and the comparison is
partly circular by construction (`control-analysis.md`).

## Scope of every claim in this record

Every finding describes **these 10 annotation-approved cases**. It does not
describe the 3 excluded cases, the 24-case `OCR_RECOGNITION_MISS` class, the
105 brand-present fixtures, or Label Lens generally.
