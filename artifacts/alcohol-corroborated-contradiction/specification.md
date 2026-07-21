# Specification — corroborated OCR contradiction

Pre-implementation inspection. **No production file has been modified, and none
will be: the production treatment was KILLED at this boundary** (`decision.md`).
Base `9ecd7b2`. All line references are to that commit.

This document is preserved as the specification that *would* be implemented if
the revisit criteria in `revisit-criteria.md` are ever met. The schema extension
in §2 is a **design candidate, not an approved contract**, and the implementation
surface in §3 describes work that was **not** carried out.

---

## 1. Current definitions and schema

### States — `src/pipeline/analyzer/analyzer.types.ts:22`

```ts
ANALYZER_OBSERVATION_STATES = ["OBSERVED", "LOW_CONFIDENCE", "AMBIGUOUS", "NOT_OBSERVED"]
```

Documented doctrine (`analyzer.types.ts:17`): *"Confidence is numeric evidence,
never an execution gate: a low-confidence or ambiguous observation still carries
its value. Only NOT_OBSERVED means nothing was extracted."*

Where each is assigned for alcohol (`field-selection.ts:1121-1147`):

| State | Assigned when |
|---|---|
| `AMBIGUOUS` | ≥1 *competing* accepted candidate: does not corroborate the best value **and** is within `AMBIGUITY_MARGIN` of its `ocrEvidenceScore` |
| `LOW_CONFIDENCE` | `best.ocrEvidenceScore < LOW_CONFIDENCE_THRESHOLD` |
| `OBSERVED` | otherwise, with ≥1 accepted candidate |
| `NOT_OBSERVED` | zero accepted candidates |

### Ambiguity reasons — `analyzer.types.ts:40`

```ts
ANALYZER_AMBIGUITY_REASONS = ["competing_candidates", "single_unconfirmed_candidate"]
```

Closed enum, mirrored as `z.enum(...)` at `src/domain/evidence/evidence.schema.ts:243`.

### Alternates — `analyzer.types.ts:147`, schema `evidence.schema.ts:198`

```ts
interface AnalyzerAlternate {
  value: string;                                // required, non-empty, bounded
  confidence: number;                           // required, must equal ocrEvidenceScore
  ocrEvidenceScore: number;                      // required
  ocrConfidence: AnalyzerOcrConfidence;          // required (NOT optional, unlike on the observation)
  candidateProvenance: AnalyzerCandidateProvenance; // required
  ranking: AnalyzerCandidateRanking;             // required
  geometry?: EvidenceGeometry;                   // optional
}
```

Documented as *"Ordered alternate candidates; never promoted into a result."*

### Diagnostics and provenance

- `AnalyzerCandidateProvenance` (`src/pipeline/analyzer/analyzer.types.ts:69`) — `passId`, `passKind`,
  `triggerReasons[]`, `preprocessing[]`, `regionName`, `supportingPassIds[]`,
  `supportingPassKinds[]`, `recoveryPassUsed`. All **free-form strings**
  (`src/domain/evidence/evidence.schema.ts:158`), so an OCR configuration can be recorded here.
- `AlcoholSelectionDiagnostics` (`field-selection.ts:275`) is internal to the
  extractor, is **not** part of `AnalyzerEvidenceResponse`, and is not validated
  by `src/domain/evidence/evidence.schema.ts`. It is available to the eval harness, not to the
  reviewer-facing contract.
- `AnalyzerCandidateRanking` requires `strategy` from a **closed** two-member enum
  (`alcohol-ocr-evidence-comparator`, `brand-mixed-prominence-score`),
  `orderingMode` from a closed three-member enum, and ≥1 comparator entry whose
  `id` comes from a closed five-member enum.

### Relevant schema invariants (`evidence.schema.ts:290-337`)

- A present state must preserve `value`, `normalizedValue`, `rawText`,
  `geometry`, `ocrConfidence`, `candidateProvenance`, `ranking`.
- An alternate must not equal the selected value.
- `AMBIGUOUS` with zero alternates must set `single_unconfirmed_candidate`.
- `ambiguityReason` is valid **only** on `AMBIGUOUS`.

---

## 2. Can `AMBIGUOUS` preserve what this experiment needs?

| Item | Representable today? |
|---|---|
| Primary selected value | **yes** — `observation.value`, preserved by schema invariant |
| Primary raw text | **yes** — `observation.rawText` |
| Primary confidence, geometry, provenance, ranking | **yes** — all preserved and required |
| Alternate **canonicalized numeral** | **yes** — `alternate.value` (as a string) |
| Alternate **raw re-read OCR text** | **NO** — `AnalyzerAlternate` has no raw-text field, and the schema is `.strict()` |
| Alternate crop geometry | **yes** — `alternate.geometry` |
| Alternate OCR configuration (PSM, scale, preprocessing) | **partly** — expressible as free strings inside `candidateProvenance.preprocessing[]` / `passId`, which is a workable but loose home for it |
| Alternate confidence | **yes** — but `ocrConfidence` is **required** on an alternate and must satisfy a token-count invariant |
| An honest `ranking` for a re-read | **NO** — `ranking` is required, and every allowed `strategy` value asserts a candidate-ranking process that did not happen |
| A reason naming this situation | **NO** — `ANALYZER_AMBIGUITY_REASONS` is a closed enum with no member for it |

**Conclusion: `AMBIGUOUS` cannot represent this honestly today.** Three gaps:
the missing ambiguity reason, the missing raw text on an alternate, and a
required `ranking` that would have to assert a false provenance.

Per instruction, implementation stops here pending the schema decision below.

### Minimum schema extension proposed

1. **`analyzer.types.ts` + `evidence.schema.ts`** — add one member to
   `ANALYZER_AMBIGUITY_REASONS`:
   ```
   "corroborated_ocr_contradiction"
   ```
   with a doc comment stating exactly what it means. Both the enum and the
   `z.enum` derive from the same constant, so this is a one-line change plus
   documentation.

2. **`AnalyzerAlternate`** — add two optional fields:
   ```ts
   rawText?: string;                      // the re-read's own OCR text, verbatim
   ranking?: AnalyzerCandidateRanking;    // relax from required to optional
   ```
   Relaxing `ranking` is the honest move: an alternate that was never ranked
   should not claim a ranking strategy. Existing alternates keep theirs, so no
   current producer or consumer changes behaviour. The schema refinement gains one
   rule: an alternate produced by verification must carry `rawText`; an alternate
   produced by ranking must carry `ranking`.

   *Rejected alternative:* fabricating `ranking: { strategy:
   "alcohol-ocr-evidence-comparator", ... }` for a re-read. It validates, and it
   is a lie about how the evidence was obtained. Not doing that.

3. **Nothing else.** `AnalyzerObservationState` is unchanged (no `NEEDS_REVIEW`
   invented). `eval-manifest`'s `ambiguityReason` is a *brand-truth* field and is
   unrelated. `parseWineAlcoholStatement`, the candidate regexes, ranking, and
   recovery triggers are untouched.

---

## 3. Every code path and schema requiring modification

| File | Change | Why |
|---|---|---|
| `src/pipeline/analyzer/analyzer.types.ts` | add ambiguity-reason member; add `AnalyzerAlternate.rawText?`; make `ranking?` optional | schema extension (§2) |
| `src/domain/evidence/evidence.schema.ts` | mirror both; add the refinement that a verification alternate carries `rawText` | validation |
| `src/pipeline/extractor/field-selection.ts` | **export** a production-equivalent numeral helper delegating to the existing `canonicalizeAlcoholWindowText` + `canonicalizeAlcoholNumber`; add a pure function that applies the contradiction verdict to a `FieldSelection` | no new parser; the existing private functions stay the single source of truth |
| **new** `src/pipeline/extractor/alcohol-verification.ts` | crop derivation, the two bounded re-reads, numeral comparison, verdict | keeps the async OCR work out of the synchronous selector |
| `src/pipeline/extractor/extractor.ts` | after `alcohol` is selected and before `engine.terminate()`, run verification when the state is `OBSERVED` | the only place holding both the engine and the image bytes |
| tests | would need a new `alcohol-verification.test.ts` plus additions to `field-selection.test.ts` and `evidence.schema.test.ts` | **not written — no feature exists to test** |

**Not modified:** `parseWineAlcoholStatement`, candidate regexes,
`compareCandidateRanking`, `alcoholRanking`, `planPrimaryOcrPass`,
`planRecoveryOcrPasses`, `preprocess`, `src/pipeline/extractor/regions.ts` templates,
`src/fixtures/eval/metrics.ts`, any fixture truth, `approved-wine-018`.

### Note on the evaluator (no change requested, none made)

`classifyAlcohol` (`metrics.ts:233`) has **no `AMBIGUOUS` branch** for alcohol:
a present truth with a detected-but-wrong value is `parser-failure` regardless of
state. `alcoholDetected` counts any state except `NOT_OBSERVED`. So after this
change `approved-wine-037` stays `parser-failure`, and detection recall and
parsed accuracy are **unchanged**. The corpus metric will not reward this
experiment. (`classifyBrand` does have a `correct-uncertainty` path; alcohol does
not. That asymmetry is pre-existing and is out of scope here.)

---

## 4. The two re-read configurations, exactly as measured

Both re-reads operate on **one** rendered buffer:

| Step | Value |
|---|---|
| Crop derivation | union of the selected candidate's `sourceOriginalBoxes` (original-image frame) |
| Padding | `0.6 × unionHeight` on all four sides, clamped to image bounds |
| Scale | `3 ×` crop width, `kernel: "cubic"` |
| Preprocessing | `.grayscale().normalise()` — identical to production's primary chain, minus its 1.5× scale |
| Engine | the existing vendored tesseract.js, OEM 1 (LSTM), `eng` — via `createLocalOcrEngine`, no new worker |
| Read A | `tessedit_pageseg_mode = 8` (single word) |
| Read B | `tessedit_pageseg_mode = 11` (sparse text) |
| Numeral extraction | canonicalize the whole re-read text with the production `canonicalizeAlcoholWindowText`, then take the **first** token that `canonicalizeAlcoholNumber(token, true)` accepts (a single trailing `%` is split off first) |
| Canonicalization | the production `canonicalizeAlcoholNumber(_, true)` — the same call, same argument, every production call site already passes `true` |
| Comparison | re-read numeral vs the selected candidate's own `parsedPercent`; equal within `0.05` |

The `%` split is the only new textual rule and it is a token-boundary split, not
a parse. No number semantics are re-implemented.

---

## 5. Are the two reads meaningfully independent? — **Only weakly. This is the specification's weakest point.**

**What differs:** the page-segmentation mode, and nothing else.

**What they share:** the crop rectangle, the padding ratio, the 3× cubic
resample, the grayscale+normalise chain, the tesseract.js build, the LSTM engine
mode, and the `eng` model.

Consequences, stated plainly:

- Any error caused by the **crop** (clipping a digit, including a neighbouring
  line), by the **scale or preprocessing** (closing a 1-pixel gap, erasing a
  low-contrast decimal point), or by the **model** (a systematically
  misrecognised glyph in a given typeface) will be reproduced by *both* reads.
  They will then agree — and agreement is exactly what the trigger treats as
  corroboration. **The failure modes most likely to produce a confident wrong
  agreement are precisely the ones these two reads share.**
- The diagnosis tested the genuinely independent variant (trigger `T6`: a
  token-union crop versus an independently derived full-width line band). It fired
  **zero** times, because the line band is a *worse* reader — it re-segments
  `13.0` as `| 3.0`. So stronger independence was measured and rejected on
  evidence, not assumed away.
- What saves the current design empirically is that PSM 8 and PSM 11 disagree
  with each other often (7 of 36 cases where both produced a numeral), and that
  disagreement suppresses the trigger. That is a real but *incidental* property,
  not a designed guarantee.

Honest characterization for the record: **this is one re-read of one crop,
adjudicated by two segmentation strategies** — not two independent observations.

---

## 6. Expected OCR cost — measured, not estimated

Eligibility: an observation whose state would otherwise be `OBSERVED`.

| | |
|---|---|
| Corpus cases | 115 |
| Cases with an accepted alcohol candidate | 70 |
| **Eligible (`OBSERVED`)** | **64 (55.7 %)** |
| `LOW_CONFIDENCE` (not eligible) | 6 |
| Not eligible (`NOT_OBSERVED`) | 45 |
| Added OCR calls per eligible label | **2** |
| Added OCR calls, whole corpus | **128** |
| Baseline OCR calls | 1 primary + up to 4 recovery per case |

Measured added wall time per eligible case (crop render + two recognitions, real
run on this machine, `latency-probe.json`):

| | ms |
|---|---|
| min | 34 |
| median | **82** |
| p95 | **219** |
| max | **325** |
| corpus total | 5 970 |

Against the recorded baseline (median 1 389 ms, p95 4 869 ms — see
`../alcohol-digit-ocr-diagnosis/baseline-summary.json`) that is **≈ +5.9 %
median and ≈ +4.5 % p95**, and **0 ms** for the 51 cases that are not `OBSERVED`.
Crop area is bounded by the candidate's own token boxes (median 13 475 px, max
207 306 px), and the pass count is hard-capped at 2. These numbers will be
re-measured end-to-end after implementation rather than assumed.
