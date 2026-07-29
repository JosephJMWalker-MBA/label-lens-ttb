# Preregistration — one stronger Tesseract configuration on stylized Brand crops

Refs Issue #149. **Evaluation-only.** Frozen **before any OCR is run**. No
production code, fixture, fixture truth, parser, ranking, threshold, crop, PSM,
scale, or preprocessing change. No Alcohol or Government Warning change. PR #195
untouched.

Base: `origin/main` `94c28bb`, including merged PR #207.

## Question

Does one preregistered stronger Tesseract recognition configuration improve
Brand evidence on the frozen stylized/no-text subset, holding everything else
fixed?

This is a **small mechanism-existence test**, not a rate claim.

## Why this treatment, and what was ruled out first

The current recognizer was identified from the repository before any treatment
was chosen:

- `createWorker("eng", 1, …)` in `src/pipeline/extractor/ocr-engine.ts` — **OEM 1
  (LSTM_ONLY)**, tesseract.js 7.0.0, tesseract.js-core 7.0.0, LSTM-only WASM
  core, `gzip: false`, `cacheMethod: "none"`, all asset paths local.
- Vendored model `src/pipeline/extractor/assets/eng.traineddata`, sha256
  `5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747`,
  5,199,098 bytes.

Parsing that file's table of contents shows it carries **no legacy components**
(no `inttemp`, `pffmtable`, `normproto`, or `shapetable`) and an
integer-quantized LSTM of 1,487,596 bytes — it is the `tessdata_fast` English
model.

Consequently:

- **OEM 0 (legacy) and OEM 2 (LSTM + legacy combined) are impossible**, not
  merely undesirable: the legacy recognizer cannot initialize from a model with
  no legacy components, and tesseract.js loads the `lstmOnly` core for OEM 1.
  OEM 2 would also be an ensemble, which is excluded by design.
- **OEM 3 (DEFAULT) is a no-op** against an LSTM-only model — it resolves to the
  same recognizer and is not a governed dimension change.
- **No second traineddata exists** in the repository or in `node_modules`.
- **No config parameter qualifies as "stronger."** `user_words` / `user_patterns`
  would require supplying a word list, which for Brand text leaks truth into OCR
  and is forbidden. `tessedit_char_whitelist` encodes an assumption rather than
  adding capability. `lstm_choice_mode` changes output verbosity, not accuracy.

The blocker was reported before anything was fetched, and retrieval of the
upstream `tessdata_best` English model under a research-only path was explicitly
authorized. See `license-notes.md`.

## The single variable

| | Control | Treatment |
| --- | --- | --- |
| traineddata variant | `tessdata_fast` eng (integer-quantized LSTM) | `tessdata_best` eng (float LSTM) |
| path | `src/pipeline/extractor/assets/eng.traineddata` | `artifacts/issue-149-brand-stronger-tesseract-comparison/vendor/tessdata-best/eng.traineddata` |
| sha256 | `5dc5d8d6…` | `8280aed0…` |
| bytes | 5,199,098 | 15,400,601 |
| `lstm` component | 1,487,596 B | 11,689,099 B |

Everything else is byte-identical between the two models, which is what makes
this a clean one-variable comparison: **identical** network architecture string
`[1,36,0,1Ct3,3,16Mp3,3Lfys64Lfx96Lrx96Lfx512O1c1]`, identical version string
`4.00.00alpha:eng:synth20170629`, identical `lstm_unicharset` (6,360 B),
identical `lstm_recoder` (1,012 B), and identical dictionaries
(`lstm_punc_dawg` 4,322 B, `lstm_word_dawg` 3,694,794 B, `lstm_number_dawg`
4,738 B). Only the recognizer weights differ, in precision and magnitude.

**Held fixed:** crop bytes, crop geometry, preprocessing, scale (3), PSM (11),
rotation (0), language (`eng`), OEM (1), engine and core versions, parser,
normalization, candidate selection, ranking, and thresholds.

The treatment model is reached through the **existing supported operator
override** `LABEL_LENS_OCR_ASSET_DIR`, already honoured by `resolveLangPath()`.
No production source file is modified.

**Excluded:** no model sweep, no language sweep, no ensemble, no best-of-N, no
cloud OCR, no VLM, no second treatment arm, no post-hoc treatment substitution.

## Frozen case set and independence structure

Five historical cases, all preserved in raw reporting:

`approved-wine-004`, `approved-wine-005`, `approved-wine-031`,
`la-fattoria-rotated`, `wine-multi-artifact-04`.

`wine-multi-artifact-04` has two committed approved Brand regions and therefore
contributes two OCR items, giving **six OCR items over five historical cases**.

Per PR #207, the historical case count is not the inferential unit:

**Crop-image clusters (4)** — the primary inferential unit:

- `C1` = { `approved-wine-004`, `la-fattoria-rotated` } — byte-identical crops
  (`fab1b411…`) from different source images
- `C2` = { `approved-wine-005` }
- `C3` = { `approved-wine-031` }
- `C4` = { `wine-multi-artifact-04` } — both regions

**Design clusters (3)**:

- `D1` = { `approved-wine-004`, `la-fattoria-rotated`, `approved-wine-005` } —
  one producer's Brand design, the third at a different image scale
- `D2` = { `wine-multi-artifact-04` }
- `D3` = { `approved-wine-031` }

A duplicated crop may **not** count twice toward PROCEED. A repeated design at a
different scale may **not** count as two independent design-level successes.

## Freeze, before OCR

Case IDs, cluster IDs, design-group IDs, source image hashes, crop hashes,
control and treatment traineddata identity and hashes, Tesseract and tesseract.js
versions, PSM, scale, preprocessing, parser and selection provenance, and the git
SHA are all frozen before OCR. All five historical case crops are verified
against PR #207 provenance, the duplicate-crop and shared-design groupings are
verified, and the runner asserts the treatment is the **only** configuration
difference. The runner fails closed on any mismatch.

Before the arms run, a **compatibility gate** confirms the LSTM-only WASM core
loads the float model and produces output. If it cannot, the run fails closed and
no result is reported.

## Truth handling

Brand truth is not used in OCR invocation, filenames, prompts, metadata, pass
planning, ranking, or selection. Raw transcripts from both arms, primary and
repeat, are persisted **before** any normalization against truth or any truth
comparison. Truth is read only afterwards, for evaluation.

## Metrics, defined before running

Normalization: NFKD, strip diacritics, lowercase, remove every character outside
`[a-z0-9]`.

- `truth_in_raw` — some acceptable Brand truth value, normalized, is a substring
  of the normalized raw transcript.
- `exact_match` — the selected Brand candidate, normalized, equals some
  acceptable truth value, normalized.
- `useful_token_recall` — per acceptable value, split on whitespace, normalize,
  keep tokens of length >= 3; recall is the fraction appearing as substrings of
  the normalized raw transcript; the item value is the maximum over acceptable
  values, or `null` when no value has a qualifying token.
- `false_reliable_read` — the arm reported a reliable Brand read (state
  `OBSERVED`, ocr evidence score >= 0.8) that is not an exact truth match.
- `determinism_pass` — the exact repeat reproduces, for both arms, the same raw
  transcript, word projection, selected value and state, and classification.

Confidence alone is never improvement. Latency is not an outcome.

## Per-item classification, in precedence order

1. `NONDETERMINISTIC` — the exact repeat differs in raw output, parsed result, or
   classification.
2. `REGRESSION` — control exact match lost, or control `truth_in_raw` lost, or a
   treatment false reliable read where control had none, or `useful_token_recall`
   falls by >= 0.25 absolute.
3. `RECOGNIZER_CAPABILITY_IMPROVEMENT` — treatment yields an exact Brand match
   that control does not, deterministically, with no treatment false reliable
   read.
4. `LEGIBILITY_IMPROVED_NOT_RECOVERED` — `truth_in_raw` goes false -> true, or
   `useful_token_recall` rises by >= 0.25 absolute **and** by at least one whole
   truth token, without a valid or exact candidate.
5. `NO_EFFECT` — no material truth-bearing improvement.

A cluster takes the strongest classification among its members, with
`NONDETERMINISTIC` and `REGRESSION` taking precedence over improvement. Because
`C1`'s two members share identical crop bytes, they cannot contribute two
successes.

## Primary decision rule

- **PROCEED** only if **all** hold: at least one distinct **crop cluster** is
  `RECOGNIZER_CAPABILITY_IMPROVEMENT`; at least one distinct **design cluster**
  is `RECOGNIZER_CAPABILITY_IMPROVEMENT`; zero treatment false reliable reads;
  deterministic repeats pass.
- **MIXED** if improvement appears only within one repeated-design cluster, or
  legibility improves without valid recovery, or gains and regressions coexist.
- **STOP** if all distinct crop clusters are `NO_EFFECT`, or any false reliable
  read is introduced, or improvement exists only by double-counting the duplicate
  crop.
- **NONDETERMINISM overrides all other decisions.**

## Safety vetoes

Any new treatment false reliable read stops production-facing follow-up.
Duplicate crop evidence counts once. Shared-design evidence counts once at design
level. Confidence alone cannot count as improvement. Truth may be used only after
raw outputs are frozen. The treatment may not change after results are seen. No
second traineddata/config arm may be added. A null may not be reinterpreted as a
capability ceiling.

## Interpretation boundaries

- Historical case count 5; independent crop-image denominator 4; independent
  design denominator 3.
- Success would show only that the current configuration was **not** the ceiling
  on at least one governed design.
- Failure would satisfy **one** prerequisite for a later capability-ceiling
  discussion, and nothing more. Failure does **not** establish a Tesseract
  capability ceiling.
- A capability-ceiling claim still additionally requires: orientation and
  segmentation ruled out per case; preprocessing null on the final subset;
  deterministic failure under the stronger configuration; a positive stylization
  audit; and a substantially larger independently sourced corpus, target at least
  20 cases across multiple design families.
- Nothing here authorizes replacing Tesseract, changing the production model, or
  production enablement.
