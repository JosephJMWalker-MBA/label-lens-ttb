# Brand region-coverage diagnosis

> **Scope: Phase 2 classified 10 cases, not 13.** Three primary cases were
> excluded on an unresolved company-name-vs-brand-name policy question and
> received **no** category. Read `population.md` and `decision.md` first.

**Measurement only. Complete for its approved scope.** Base recorded in
`git-sha.txt`. Nothing modified: no production code, OCR configuration, recovery
planning, fixture, schema, test, UI, package, ranking, matching, candidate
generation, or authority rule.

## Where this stands

| Phase | Status |
|---|---|
| 0 — evidence-path and available-data assessment | **complete** — `code-path.md` |
| 1 — brand-region annotation packet | **prepared, awaiting review** — `annotation-review/` |
| 2 — coverage, word overlap, classification | **complete for the 10 approved cases** |

**Result: coverage is not the problem.** All 10 approved cases had the brand
region covered at ratio 1.00 by the primary pass, and all 10 still failed:
3 `REGION_COVERED_NO_TEXT_RECOGNIZED`, 5 `ORIENTATION_OR_SEGMENTATION_FAILURE`,
2 `REGION_COVERED_SEVERE_GLYPH_MISRECOGNITION`, **0 `REGION_NOT_COVERED`**,
0 `UNATTRIBUTED`.

Three of the original 13 are **blocked** by a fixture-truth question raised during
annotation review (`annotation-review/truth-conflict-referrals.md`). No fixture was
modified.

## The headline from Phase 0

Committed evidence is **sufficient for pass-image coverage** and **insufficient
for word overlap**:

- `docs/extraction-full-corpus/extractor-report.json` carries, for all 115 cases
  and 247 executed passes, the pass footprint (`crop`, already in canonical
  original-image coordinates), `rotate`, `transformedSize`, pass kind, trigger
  reasons, and pass-contribution flags. Its brand figures match current behaviour
  exactly (27 / 29 / 33 and 24 OCR-recognition failures).
- But **word geometry is capped at 25 `sampleWords` per region — 229 of 247
  regions are truncated**, word→line membership is not preserved, and the
  committed pass set may be stale for the 9 multi-pass primary cases because
  recovery there was triggered by *alcohol*, which PRs #150/#151 changed after the
  report was generated.

The minimum missing evidence is specified in `code-path.md`. **It has not been
collected**, per the instruction to stop rather than silently start a run.

## Reading order

0. **`decision.md`** — the decision record; read first.
0b. **`population.md`** + **`excluded-policy-cases.json`** — how the population
   narrowed from 13 to 10, and the 3 policy exclusions.
1. **`hypothesis.md`** — the question and the three layers kept separate.
2. **`code-path.md`** — Phase 0: the geometry path, what is committed, what is
   missing, and the minimum needed.
3. **`specification.md`** — the population, the fixed 90 % threshold, the
   first-failure categories, and the control comparison — all pre-registered.
4. **`controls.json`** — the 6 control cases, selected before any measurement.
5. **`annotation-review/`** — the Phase-1 packet: 13 proposed regions, one plain
   label and one outlined proposal per case, and a blank reader-response form.

6. **`metrics.md`** — the categories, the three layers, and what OCR emitted.
7. **`control-analysis.md`** — distributions, with the circularity caveat stated up front.
8. **`limitations.md`** · **`next-experiments.md`** — what this does and does not support.

## Files

`decision.md` · `population.md` · `excluded-policy-cases.json` ·
`hypothesis.md` · `specification.md` · `code-path.md` · `metrics.md` ·
`control-analysis.md` · `limitations.md` · `next-experiments.md` ·
`approved-regions.json` · `controls.json` · `cases.json` · `pass-coverage.json` ·
`word-overlap.json` · `classifications.json` · `control-analysis.json` ·
`probe.ts` · `classify.mjs` · `commands.sh` · `git-sha.txt` · `annotation-review/`.

## Blocked, needing its own round

The **company-name-versus-brand-name** policy question raised during annotation
review. It reaches 13 of 105 brand-present fixtures and all four cases the
pipeline currently marks `OBSERVED` correctly.
