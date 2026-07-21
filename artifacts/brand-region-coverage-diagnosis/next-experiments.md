# What the evidence supports

## The question is answered

**Yes — every executed pass geometrically covered the brand region, at ratio
1.00, in all 10 cases. Coverage is not the problem, and `REGION_NOT_COVERED` is
empty.**

So the interpretation boundary resolves as follows:

| Category | Count | Family it points to | Live? |
|---|---|---|---|
| `REGION_NOT_COVERED` | **0** | region proposal / recovery planning (issue #77) | **not supported** |
| `REGION_COVERED_NO_TEXT_RECOGNIZED` | **3** | typeface, preprocessing, resolution, alternate OCR | supported |
| `ORIENTATION_OR_SEGMENTATION_FAILURE` | **5** | orientation, line segmentation, geometry composition | **best supported** |
| `REGION_COVERED_SEVERE_GLYPH_MISRECOGNITION` | **2** | OCR-engine or local-vision comparison | weakly supported |

**Region proposal is not the next family.** That is the clearest negative result
of this round, and it is worth stating plainly because it was a plausible prior.

## What the two largest groups actually look like

**Segmentation (5).** The engine puts *something* over the brand but cannot
assemble it: `Mosaikon` split into `=` + `SP` + `“i`; `Rias` producing four
fragments of which three are grouped into no line at all; `The Golden Girls`
scattered across five lines plus three ungrouped tokens; `Podere don Cataldo`
reduced to `7` and `ary` on two lines. These are grouping and glyph-boundary
failures, not region failures.

**Nothing recognised (3).** All three `La Fattoria` fixtures return **zero** word
boxes over a fully covered region. The engine looked and emitted nothing.

## A second, unplanned finding

**No recovery pass runs on this population any more.** All 16 cases executed a
single primary pass. Recovery here was only ever triggered by *alcohol* being
`NOT_OBSERVED`, and #150/#151 fixed enough alcohol reading that the trigger no
longer fires. **Brand failure never triggers recovery on these cases, because
brand is `AMBIGUOUS` rather than `NOT_OBSERVED`.** That is a planning observation,
not a defect claim, and it belongs in whatever round examines recovery triggers.

## Recommended next round — diagnostic only

**Segmentation and line grouping over covered regions**, on the 5 + 3 cases where
the region is covered and reading fails. Concretely: does the failure originate in
glyph boundary detection, in `lines()` grouping, or in the preprocessing that
feeds them? That is answerable read-only, on the passes already planned.

Constraints carried forward: **do not weaken `OBSERVED`**; do not treat coverage
or proximity as authority evidence; do not reopen the closed sub-span-generation
family; measure brand-absent behaviour before brand-present gains.

## Explicitly not recommended

- **Region-proposal / YOLO research.** Zero cases are `REGION_NOT_COVERED`.
- **Preprocessing or local-vision treatments** — premature until the 3
  zero-recognition cases are separated from the 5 segmentation cases by
  mechanism.
- **Any production change from this round.** It is measurement only.

## Blocked, and needing its own round first

The **company-name-versus-brand-name policy question** raised during annotation
review. It reaches 13 of 105 brand-present fixtures and all four cases the
pipeline currently marks `OBSERVED` correctly. See
`annotation-review/truth-conflict-referrals.md`.
