# Experiment A (Alcohol reselection) — recheck at a later base

**This is not a fresh execution.** Experiment A was executed, decided, and landed
in `main` as PR #202 (`4fe681a`, "Evaluate Alcohol recovery-pass reselection")
with decision **`KILL`**. Its complete package is
`artifacts/issue-149-alcohol-reselection/`, executed at base
`5d22a6be0407e8df4870983aab9107bc89f7c5d0`.

This record answers one question only: **does that KILL still hold at
`4bb3140b56dd1b9aee2c7b015e90a09d0902fe34`?** No OCR corpus run was performed
here, and no metric in this file is a new measurement.

## Causal-surface comparison, 5d22a6b → 4bb3140

The treatment changes exactly one call site — the final Alcohol selection in
`src/pipeline/extractor/extractor.ts`. Its inputs are the recovery planner, the
Alcohol selector, and the primary Alcohol state.

| Path | Change since 5d22a6b |
| --- | --- |
| `src/pipeline/extractor/extractor.ts` | none (byte-identical) |
| `src/pipeline/extractor/regions.ts` (recovery planner) | none |
| `src/pipeline/analyzer/` (observation states) | none |
| `src/pipeline/extractor/field-selection.ts` | +196/−3, **brand diagnostics only** — PR #220, "Expose complete Brand filter diagnostics without changing selection"; 0 added lines mention alcohol |
| `docs/extraction-full-corpus/extractor-report.json` (frozen corpus) | none — sha256 `7d695528354f2939…` at both revisions |

The Alcohol path and the corpus are unchanged. Re-running the landed harness at
`4bb3140` would reproduce the recorded result rather than produce new evidence.

## Why the treatment is inert — mechanism

Control and treatment can only diverge when both hold:

1. `recoveryPasses.length > 0`, and
2. primary Alcohol is **not** `NOT_OBSERVED` — otherwise control already
   reselects and the two forms agree.

Condition 2 is exactly `needsAlcoholRecovery === false`. In
`planRecoveryOcrPasses`, every pass that re-reads a panel where an alcohol
statement lives is gated on `needsAlcoholRecovery`:

- left edge strip — `if (needsAlcoholRecovery)`
- right edge strip — `if (needsAlcoholRecovery)`
- focus crop and its edge strips — `needsAlcoholRecovery ? distinctFocusCrop(primary) : null`

The only pass not so gated is the rot180 orientation fallback, scheduled only
when `primary.words.length <= 6`.

So the treatment's entire reachable surface is: **brand `NOT_OBSERVED`, alcohol
observed at some state, and a primary pass of at most six words** — and it
further requires that rot180 full-image pass to yield better alcohol evidence
than the primary. Recognizing an alcohol statement generally needs a number, an
alcohol marker and a volume marker among those same six words, while brand
recognition simultaneously fails.

This is measured, not only argued. The landed `eligibility.md` records that all
**50/50** recovery-bearing corpus cases had primary Alcohol `NOT_OBSERVED`, so
no case reached the treatment-only branch, and control and treatment were
behaviorally identical in every evaluable case.

## Fresh evidence added by this recheck

`src/pipeline/extractor/alcohol-reselection-reachability.test.ts` characterizes
the brand-only recovery state directly, sweeping word counts 0–12 and asserting
that no edge-strip or focus pass is ever scheduled and that at most one pass
(rot180, at ≤6 words) is planned.

The assertions are load-bearing, confirmed by observing the planner's real
region names in the adjacent states:

- alcohol recovery → `left-edge-strip-rot270`, `right-edge-strip-rot90` (both match the forbidden pattern)
- brand-only recovery → `full-image-rot180` only

`regions.test.ts` already covered the >6-word brand-only case (no passes at
all); the ≤6-word threshold was uncovered until now.

## Verdict

**KILL upheld.** The hypothesized selector asymmetry is genuinely present in
code — brand reselects unless `OBSERVED`, alcohol reselects only when
`NOT_OBSERVED` — but it is inert: the recovery evidence the treatment would
newly consider is never collected in the state where the treatment applies.

Experiment A cannot be made to produce an observable effect without changing
recovery triggers, which the protocol places out of scope. Per that protocol,
this is a stop-and-explain, not a broadened treatment.

No production behavior was changed by this recheck.

## Next unresolved failure class

Unchanged from the landed decision: the dominant failure class is OCR/candidate
miss, not selector miss — `recovery truth discarded` was 0. Making the selector
question observable requires governed corpus cases that naturally produce
brand-only recovery while primary Alcohol is `OBSERVED`, `LOW_CONFIDENCE`, or
`AMBIGUOUS`.
