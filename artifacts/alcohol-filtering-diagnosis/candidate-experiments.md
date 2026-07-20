# Candidate experiments — alcohol candidate filtering

Three candidates. Each changes exactly one conceptual rule. Recovery and control counts are from
the read-only simulation described in `summary.md`; they must be re-measured on the corpus after
implementation.

---

## C1 — split a fused alcohol prefix when a separator precedes the number **(recommended first)**

**One conceptual rule:** one bounded canonicalization operation.

**Current rejected examples**

| Case | Truth | Read text | Rejection |
|---|---|---|---|
| `approved-wine-055` | 13 | `ALC.13% BY VOL` | `unsupported-pattern` |
| `approved-wine-095` | 12 | `ALC.12% BY VOL.` | `unsupported-pattern` |
| `approved-wine-096` | 12 | `ALC.12% BY VOL` | `unsupported-pattern` |
| `approved-wine-097` | 12 | `ALC.12% BY VOL` | `unsupported-pattern` |
| `approved-wine-077` | 13.5 | `ALC.13.5% BYVOL` | `unsupported-pattern` |
| `patricia-green-cellars` | 13.8 | `ALC.13.8%BY VOL` | `unsupported-pattern` |

**Cause.** `canonicalizeAlcoholWindowText` splits a fused prefix with
`/\ba[1il]c(?=[0-9oOil])/ → "alc "`. The lookahead requires a digit **immediately** after the
marker, so `alc13` splits but `alc.13` does not. Every anchored acceptance regex then fails on the
missing whitespace.

**Proposed treatment.** Allow an optional separator between the marker and the number:

```
/\ba[1il]c(?=[0-9oOil])/      →   /\ba[1il]c\.?(?=[0-9oOil])/
```

**Files / functions.** `src/pipeline/extractor/field-selection.ts` →
`canonicalizeAlcoholWindowText` (one regex, line ~577). No parser change: the produced
normalized text (`13% BY VOL.`) is already an accepted `DIRECT_STATEMENTS` form.

**Expected gain.** 6 of 34 (~18 %). Alcohol parsed-value accuracy +6 cases; detection recall +6.
**False-positive risk.** Very low. The volume-marker requirement is untouched; the rule only
restores whitespace that OCR removed. Evidence is complete before and after.
**Measured controls.** 0 new false positives across all 13 absent-alcohol cases; 0 of the 70
currently-correct cases gain any new candidate value.
**Tests required.** Unit: `alc.13% by vol`, `alc.13.5% byvol`, `alc.12% by vol.` canonicalize and
accept; `alc13% by vol` (already working) unchanged; proof-only, volume-only, `750ml`, government
warning, dates/addresses/phone fragments still rejected. Snapshot the normalization ops list.
**Corpus metric.** `alcoholParsedValueAccuracy`, `alcoholDetectionRecall`, `alcoholFalseCertainty`,
absent-alcohol false-positive rate, brand metrics unchanged, median/p95 latency unchanged.
**Kill criterion.** Fewer than 4 of the 6 recovered on the real corpus, OR any new absent-alcohol
false positive, OR any regression in a currently-correct case, OR any brand metric change.

---

## C2 — accept an explicit alcohol marker adjacent to a percentage without a volume word

**One conceptual rule:** one defensive filter predicate (the volume gate).

**Current rejected examples:** `14% ALC` (`luigi-giovanni-live`, `alfredos-wine`,
`la-fattoria-rotated`, `approved-wine-004/005`), `ALC. 13.5%` (`approved-wine-064`),
`Alc. 13%` (`approved-wine-103`), `12.5% ALC` (`approved-wine-105/108`), `ALC 12,5%`
(`approved-wine-098`).

**Proposed treatment.** Relax `field-selection.ts:718` so a percentage with an adjacent explicit
alcohol marker satisfies the gate, and add the matching accepted form. **Note this requires a
second layer:** every `DIRECT_STATEMENTS` form in `src/domain/rules/wine-alcohol-parse.ts` also
requires a volume marker, so the deterministic rule surface changes too.

**Expected gain.** 12 of 34 (~35 %) — the largest.
**False-positive risk. Material.** Measured: 0 new absent-alcohol false positives, but **2 of the
70 currently-correct cases gain a new wrong candidate value** (`approved-wine-033` truth 13.7 gains
`5`; `wine-multi-artifact-08` truth 12.6 gains `8.9`). Whether those displace the correct answer
depends on ranking, which the simulation does not model.
**Doctrine risk.** On rotated/vertical-strip labels `14% ALC` may be a truncated read of
`ALC 14% BY VOL`; accepting it promotes a statement on incomplete evidence.
**Tests required.** All C1 controls, plus: ranking tests proving the new candidates cannot displace
a stronger complete-evidence candidate; explicit tests for the two contaminated cases;
`ALCOHOLIC BEVERAGES` warning text must not match.
**Kill criterion.** Any absent-alcohol false positive, any currently-correct case whose selected
value changes, or any rise in alcohol false certainty.

---

## C3 — recognize `ABV` as an alcohol-by-volume marker

**One conceptual rule:** one marker-recognition rule.

**Current rejected example:** `approved-wine-013`, truth 13.5, read text `13.5% ABV`, rejected
`missing-volume-marker`.

**Proposed treatment.** Add `abv` to the volume-marker vocabulary (`alcoholVolumeToken` and the
gate at `field-selection.ts:718`), canonicalizing `abv → by vol`. Parser change also required.

**Expected gain.** 1 of 34.
**False-positive risk.** Very low — `ABV` is unambiguous and appears in no other context.
**Measured controls.** 0 new absent-alcohol false positives; 0 currently-correct cases disturbed.
**Tests required.** `13.5% ABV`, `13.5%ABV`, `ABV 13.5%`; must not match `ABVX` or a bare `ABV`
with no number.
**Kill criterion.** Any false positive, or the single case fails to recover.

---

## Priority

C1 first. It recovers the largest subset achievable **without relaxing any evidentiary
requirement**, is a single regex in a single function, requires no parser change, and measured
zero false positives and zero disturbance. C3 is a trivially safe follow-on. C2 is the largest
prize but must come last and needs ranking analysis, because it is the only one that changes what
counts as sufficient evidence.

A fourth, narrower variant (splitting a percentage fused to a bare volume word, `13.5%vol`,
recovering `approved-wine-051`) belongs to C1's family and can be folded in only as a separate
follow-up, never in the same measurement.
