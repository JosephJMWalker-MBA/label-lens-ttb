# Experiment C3 — `ABV` as explicit alcohol-by-volume language

**Status:** implemented and measured; awaiting keep/kill review. Not committed.
**Branch:** `experiment/alcohol-abv-marker`, based on `origin/main` `5edec00`
(which already contains C1, PR #150). C3's measured delta is therefore purely ABV.

## Research question

Can Label Lens accept explicit alcohol-by-volume statements written with the
standard abbreviation `ABV` (e.g. `13.5% ABV`) without weakening evidentiary
requirements or admitting false candidates?

## Phase 1 — what must understand ABV

Tracing `13.5% ABV` through the pipeline, only **one** stage needs to change:

| Stage | Needs change? |
|---|---|
| Candidate window construction | **No** — the window already forms (`%` supplies the signal); the corpus shows 21 built windows containing `ABV`. |
| `canonicalizeAlcoholWindowText` | **Yes** — the only change. |
| `matchAlcoholWindow` volume gate | **No** — once `abv` canonicalizes to `by vol`, `hasByVolume` is satisfied by the existing predicate. |
| Acceptance regexes | **No** — `BY_VOLUME_RE` matches `13.5% by vol` and builds `13.5% BY VOL.`. |
| `parseWineAlcoholStatement` | **No** — `13.5% BY VOL.` is already an accepted `DIRECT_STATEMENTS` form. |
| `alcoholVolumeToken` / `alcoholMarkerToken` | **No** — these feed diagnostic flags and window signalling, not acceptance. Left alone to keep the change minimal. |

### How ABV should be treated

`ABV` is a **complete "alcohol by volume" phrase** in one token — it carries both
the alcohol marker and the volume marker. It is therefore expanded to `by vol`
rather than registered as a bare alcohol marker or a bare volume marker. That
choice matters: registering it as an alcohol marker alone would not satisfy the
volume gate, and registering it as a volume marker alone would misdescribe the
evidence.

### Does canonicalizing to `BY VOL` preserve the evidence?

Yes. `rawText` retains `"13.5% ABV"`, `sourceTokens` retains `["13.5%","ABV"]`,
per-token OCR confidences are unchanged, and a distinct normalization operation
`expand-abv` records exactly what was rewritten — the same pattern already used by
`split-byvol` and `split-percent-by`.

### Prefix form `ABV 13.5%`

**Not supported, and deliberately out of scope.** Every accepted form places the
volume marker *after* the number; `ABV 13.5%` would canonicalize to
`by vol 13.5%`, which no pattern matches. Supporting it needs a new syntax rule —
a second conceptual change, so a separate experiment.

### Corpus cases containing ABV

Exactly one, and `ABV` appears nowhere else in the corpus as a partial token:

| Field | Value |
|---|---|
| Case | `approved-wine-013` |
| Truth | 13.5 |
| OCR source | `"13.5% ABV"`, tokens `["13.5%","ABV"]`, confidences 95 / 96 |
| Before | `NOT_OBSERVED`, value `null` |
| Rejection | `missing-volume-marker` (subtype `alcohol-rejected-missing-volume-marker`) |
| Competing candidates | 24 windows, 12 distinct — the clean `13.5% ABV` plus warning-merged variants (`CAUSE HEALTH PROBLEMS. 13.5% ABV`) and pipe-delimited noise (`13.5% ABV \|`) |
| Layout | decorative-or-script-brand, front-label, multiple-brand-like-phrases, alcohol-at-bottom |

A corpus-wide scan found the fragment `ABV` 21 times, all inside this case's
windows, and **zero** occurrences of `ABVX` or any word merely containing those
letters.

## Phase 3 — the treatment

One canonicalization operation, in `src/pipeline/extractor/field-selection.ts`:

```ts
apply(text.replace(/\babv\b/g, "by vol"), "expand-abv");
```

plus `"expand-abv"` added to the local `ALCOHOL_NORMALIZATION_OPERATIONS`
vocabulary (a const array in the same file; not part of any zod schema or exported
contract). Word boundaries confine it to the exact token. It is ordered before the
percent/by split so a percentage abutting the expanded marker still gains its
space.

No parser change. No gate change. No ranking, threshold, state, recovery,
preprocessing, brand, UI, or schema change.

## Correction to the simulation

The read-only simulation transcribes canonicalization and acceptance only, so it
**bypasses candidate-window construction**. It therefore over-predicted the single
fused token `13.5%ABV` as recoverable. In the real pipeline no window is built for
that token, so no candidate exists and it is rejected. The corresponding positive
test was withdrawn and replaced with a negative test that documents the boundary.
Corpus measurement is authoritative; the simulation sizes and ranks only.

## Result

`approved-wine-013` recovers, nothing else changes. See `metrics-diff.md`.
