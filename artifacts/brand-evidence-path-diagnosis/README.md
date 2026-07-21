# Brand evidence-path diagnosis

Diagnosis only, at base `a9fe943`. **No production, schema, fixture, test, UI, or
package file was modified.** Nothing here recommends implementing anything yet.

## Reading order

1. **`hypothesis.md`** — the question, the prior expectation, and how it was wrong.
2. **`code-path.md`** — the current production path end to end: grouping,
   generation, filtering, scoring, ranking, authority, and where ranking and
   authority share data.
3. **`metrics.md`** — the baseline, split into **A. candidate usefulness** and
   **B. authority certainty**, plus the failure-class distribution.
4. **`authority-gates.md`** — what `OBSERVED` currently means for brand, and why
   the 25 correct-but-abstained cases are *not* an argument for weakening it.
5. **`candidate-score-analysis.md`** — why ranking is not the bottleneck and
   generation is.
6. **`possible-truth-audit.md`** — 5 cases referred for human visual review.
7. **`limitations.md`** — what this does not establish.
8. **`candidate-experiments.md`** — three bounded proposals, none implemented.
9. **`e1a-too-many-words-simulation/`** — E1a: sub-spans for `too-many-words`
   lines. **KILLED.** Read `e1a-too-many-words-simulation/recommendation.md`;
   `e1a-too-many-words-simulation/metrics.md` and
   `e1a-too-many-words-simulation/safety-analysis.md` carry the evidence.
10. **`e1b-prominence-gated-simulation/`** — E1b: the same, gated by production's
    own prominence-eligibility rule. **KILLED in Phase 1**; Phase 2 was never run.
    Read `e1b-prominence-gated-simulation/recommendation.md`, then
    `e1b-prominence-gated-simulation/safety-analysis.md` for the root cause.
11. **`truth-review/`** — the five brand-boundary referrals, with crops, the
    blank form, and the **completed reader response** (Joseph Walker,
    2026-07-21). **Outcome: all five recorded truths stand; no fixture-truth
    correction recommended; no fixture changed.**
12. **`next-research.md`** — what remains live (E3, measurement only) and what is
    closed.

## Headline

| | |
|---|---|
| Corpus | 115 (105 brand-present, 10 brand-absent) |
| Correct selected brand (normalized) | **29 / 105** |
| Correct **and** `OBSERVED` | **4 / 105** |
| Wrong value marked `OBSERVED` | **0** |
| Absent-brand false positives | **0 / 10** |
| Largest failure class | `CANDIDATE_GENERATION_MISS` — **43** |
| Largest authority gate | `no-positive-brand-signal` — **96 of 101** AMBIGUOUS cases |

## Status of the sub-span-generation experiment family

**E1a and E1b are both killed. Closure of the family is recommended** — see
`e1b-prominence-gated-simulation/recommendation.md`. The diagnosis result stands:
generation really is the largest blockage, and truth really does become a
candidate when sub-spans are generated (17 of 23 targeted cases, up from 0). What
has now been measured twice is that opening generation costs more than it returns,
and that the authority gate cannot arbitrate sub-span material — a 4-word window
of prose containing `vineyard` or `winery` clears it. **E3** (a measurement-only
split of `OCR_RECOGNITION_MISS`) is the only remaining live thread.

## Data files

- `cases.json` — one record per case: stage survival, candidates, scores, rank,
  authority-gate attribution, failure class, notes.
- `failure-taxonomy.json` — aggregate counts and the case list per class.
- `possible-truth-audit.json` — machine form of the referral list.
- `probe.ts` — the read-only probe. `commands.sh` — reproduction.

No large OCR dumps are kept: `cases.json` carries the top-6 ranked candidates per
case, and every aggregate was computed inside the probe from the full candidate
list before truncation.
