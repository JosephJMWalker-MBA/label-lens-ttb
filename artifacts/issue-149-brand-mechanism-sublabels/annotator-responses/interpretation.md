# Interpretation — blinded Brand mechanism audit results

Refs Issue #149. **Evaluation-only.** No OCR was run in this work. No production
code, fixture, threshold, parser, ranking, Brand logic, Alcohol logic, or
Government Warning logic changed. PR #195 untouched. No labels were altered
after recording; the three raw response files are preserved verbatim and hashed
in `raw-response-hashes.json` before `anonymization-map.json` was opened.

The preregistered rules in `../preregistration.md` were applied exactly as
written. Nothing in them was added, relaxed, or reinterpreted after the
responses were seen.

## Annotator

One isolated model session, given only `reader-packet/` and no project history.
It declared no prior exposure to Issue #149, to PRs #197–#204, to Brand truths
or OCR transcripts, no repository access during annotation, and no external
search. Those declarations are internally consistent with the delivered data
(see `validation-report.json`), and no case ID, crop filename, or prior
failure-class name appears anywhere in the responses.

This is a **single reader**. Inter-rater agreement does not exist for this set.

## Audit A — geometry

Five cases, one reader item each.

| Label | Count |
| --- | --- |
| `ORIENTATION_SUSPECTED` | 0 |
| `SEGMENTATION_SUSPECTED` | 5 |
| `AMBIGUOUS_SUBLABEL` | 0 |

Confidence: 2 high, 3 medium, 0 low. Every reader-estimated baseline fell within
2 degrees of horizontal; no item met the >15-degree or vertical-text condition,
and the reader used `AMBIGUOUS_SUBLABEL` on nothing.

**Case-set statement.** For this frozen set of five cases, the previously
bundled "orientation or segmentation" category resolves to **segmentation-
suspected**, on geometry-only blinded review. That is a statement about these
five cases and nothing else. It is not a prevalence estimate: n=5, the cases
were not sampled to represent anything, and no rate over the governed corpus or
over production follows from it.

The label is also **observational, not causal**. `SEGMENTATION_SUSPECTED`
records what upright-but-fragmented geometry looks like to a reader. It does not
demonstrate that segmentation is what defeated the recognizer on these cases,
and no intervention has tested it.

**What this authorizes.** A separately preregistered, segmentation-matched OCR
experiment on these five frozen cases, on its own branch. It does not predict
that PSM 7 will succeed, and a null result there would be a real result, not a
failure of this audit.

**What it does not authorize.** No orientation experiment is authorized for this
frozen set — nothing here supports one. PSM 13 is **not** eligible: it may be
included only for cases already preregistered as irregular/curved baseline, and
no such preregistration exists in this repository for any of these five cases.
Adding it now, after seeing that the geometry rationales mention curvature,
would be exactly the post-hoc move the protocol forbids.

## Audit B — typography

Six reader items over five cases. `wine-multi-artifact-04` contributed two items
because it has two committed approved Brand regions.

Applying the preregistered multi-region rule: **the two regions agreed** (both
stylized), so that case counts once as stylized and the denominator stays at 5.
No case was recorded `AMBIGUOUS_REGION_DISAGREEMENT`, and no case was removed
from the denominator.

**Case-level result: 5 of 5 stylized.**

Item-level checklist tallies over the 6 reader items: custom logotype 6/6;
decorative script 5/6; condensed or expanded 4/6; unusual ligature 3/6; arched or
curved baseline 1/6; outline or shadow 0/6; extreme texture or contrast 0/6.
Confidence: 5 high, 1 medium.

**Preregistered band: 4–5 of 5 → the stylization hypothesis remains supported
for these cases.**

That is the whole of the claim. Specifically:

- This does **not** establish a Tesseract capability ceiling, under this or any
  outcome. That claim additionally requires a stronger-traineddata comparison to
  fail first, plus a corpus far larger than five cases. That comparison has not
  been run.
- This does **not** show that stylization caused OCR failure. No OCR was run
  here, and a checklist of visible letterform attributes cannot establish
  causation.
- This does **not** generalize beyond these five cases.

**Next eligible step.** One fixed, stronger Tesseract traineddata/config
comparison on the frozen severe-glyph / no-text subset, preregistered
separately. Not a sweep over models or traineddata. A capability-ceiling claim
remains unavailable unless that stronger comparison also fails *and* the standing
larger-corpus prerequisites are met.

## Integrity concern found at unblinding

`approved-wine-004` and `la-fattoria-rotated` — two of the five typography cases
— have **byte-identical** Brand crops (`sha256 fab1b411…`). The duplication
originates upstream in `artifacts/issue-149-brand-otsu-threshold/control/crops`,
where the two source files are identical; the packet build copied both
faithfully, and `packet-manifest.json` records the same hash twice.

Effect: two of the five typography cases were scored from the same pixels, so
the 5/5 rests on **four distinct images, not five**. Both were marked stylized,
so the direction of the result does not change and the preregistered band is the
same either way — but these five cases are not five independent observations,
and the count should not be read as five independent confirmations.

The blinded reader flagged these two items as visually indistinguishable without
repository access, which is corroboration that the duplication is in the
material rather than in the reading.

Nothing was substituted, dropped, or re-scored: the case set is frozen and the
preregistration forbids post-hoc changes to it. This is recorded for resolution
upstream, and it should be resolved before any follow-up experiment treats those
two entries as two cases.

## Standing boundaries

- Single isolated model annotator; no inter-rater agreement; labels are
  **provisional** pending an independent second reader.
- The audit split itself remained a residual information leak: the reader saw
  audit-specific rubrics and therefore knew the items had been pre-sorted by some
  earlier judgement, though never what it was. See `../contamination-audit.md`.
- Some items appeared visually related, and one such pair is now confirmed
  byte-identical.
- Low resolution limited confidence on three items, all capped at medium by the
  reader.
- The reader disclosed a 4x enlargement used as a viewing aid: enlargement only,
  no crop, no rotation, no colour change, no OCR, no external lookup. Recorded as
  a disclosed viewing aid, not a contamination failure.
