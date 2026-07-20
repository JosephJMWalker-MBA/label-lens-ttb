# Experiment — fused alcohol-prefix separator

**Status:** implemented, measured, awaiting keep/kill review. Not committed.
**Branch:** `experiment/alcohol-reselection-a` (worktree `label-lens-ttb-issue-149`)
**Base commit:** `08ac2a7d4d2a2ab8c40b1615f75aeddb983e5085`
**Corpus:** fixed 115-case eval manifest.

## Hypothesis

The extractor rejects otherwise complete alcohol statements because
`canonicalizeAlcoholWindowText` splits a fused alcohol prefix only when a digit
follows the marker immediately (`ALC13%`), not when the marker's own abbreviating
period intervenes (`ALC.13%`). The acceptance patterns all require whitespace
after the marker, so the window is refused as `unsupported-pattern` even though
the percentage, the alcohol marker, and the volume marker were all read.

## Single conceptual change

One canonicalization operation — consume an optional period between the
OCR-normalized alcohol marker and the numeric value:

```diff
- apply(text.replace(/\ba[1il]c(?=[0-9oOil])/g, "alc "), "split-fused-alcohol-prefix");
+ apply(text.replace(/\ba[1il]c\.?(?=[0-9oOil])/g, "alc "), "split-fused-alcohol-prefix");
```

`src/pipeline/extractor/field-selection.ts` only. No parser change, no policy
change.

## Why this weakens no evidentiary requirement

The change restores whitespace that OCR removed. It does not touch:

- the volume-marker gate (`field-selection.ts`, `!hasByVolume && !hasAlcVol && !hasBareVol`);
- the parser's `DIRECT_STATEMENTS`, every form of which still requires a volume marker;
- confidence thresholds or state assignment;
- candidate window construction, recovery triggers, preprocessing, or OCR passes;
- brand logic, schemas, or UI.

A statement that lacked a volume marker before still lacks one after. The
produced normalized text (`13% ALC./VOL.`) was already an accepted form.

## Pre-edit findings worth recording

1. **Consuming the period is correct.** The replacement `"alc "` yields
   `alc 13% by vol`, matched by `ALC_BY_VOLUME_RE` (`^(?:alcohol|alc\.?)\s+…`).
   Preserving the period would also match, but consuming keeps the behaviour
   identical to the existing no-period branch and keeps the recorded operation
   name (`split-fused-alcohol-prefix`) accurate.
2. **The neighbouring operation is a no-op here.** `\ba[1il]c(?=\b|\d)` already
   matches `alc` before a period (a period is a word boundary) but replaces it
   with itself, and the split-decimal merge at the end of the function requires a
   digit *before* the period. Nothing else in the pipeline was repairing this.
3. **Test-first caught an authoring error.** The accepted value for this form is
   `% ALC./VOL.`, not `% BY VOL.` — `ALC_BY_VOLUME_RE` builds the former. The
   expectations were corrected before the production edit, using the pre-existing
   no-period test as the oracle.
4. **Correction — two test failures were self-inflicted, not pre-existing.** An
   earlier revision of this document claimed `assembles a split percent marker on
   one line` and `merges a split decimal across OCR tokens` failed on unmodified
   `origin/main`. That was wrong. Pristine checkouts of both `08ac2a7` and
   `6efda3e` pass 48/48. The failures came from an over-broad string replacement
   while correcting this experiment's own new expectations, which also rewrote
   those two unrelated assertions. The original verification was invalid because
   it stashed only the production file and left the edited test file in place.
   The assertions are restored; the production change never affected them.

5. **The eval-harness region assertion was behaviour-coupled.** Its fixture is
   `patricia-green-cellars`, one of the six cases this experiment repairs. With
   alcohol now resolving on the primary pass, no recovery is planned, so the case
   emits 1 region instead of 3. The exact-count assertion was replaced with the
   bounded contract it was actually protecting (see the PR).

## Success criteria (from the experiment brief)

1. ≥ 5 of the 6 expected cases correctly detected or parsed.
2. No currently-correct case regresses.
3. Absent-alcohol false positives do not increase.
4. Alcohol false certainty does not increase materially.
5. No evidentiary requirement weakened.
6. Deterministic outputs stable across repeated runs, excluding timing.

## Result

All six met — see `metrics-diff.md`.
