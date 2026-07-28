# Preregistration: Alcohol recovery-evidence reselection

Status: **FROZEN BEFORE TREATMENT**  
Frozen at: `2026-07-28T00:25:59Z`  
Base: `5d22a6be0407e8df4870983aab9107bc89f7c5d0`  
Branch: `codex/issue-149-alcohol-reselection`

## Question

When Alcohol recovery evidence already exists, does reconsidering all collected passes improve final Alcohol selection?

This is Experiment A only. It is a selector-input experiment, not an OCR improvement experiment.

## Frozen arms

Control is the current production final Alcohol branch:

```ts
primaryAlcohol.observation.state === "NOT_OBSERVED"
  ? selectAlcoholObservation(allPasses)
  : primaryAlcohol
```

Treatment is:

```ts
recoveryPasses.length > 0
  ? selectAlcoholObservation(allPasses)
  : primaryAlcohol
```

The implementation uses `allPasses.length > 1` as the exact equivalent of `recoveryPasses.length > 0`. When there is no recovery, treatment returns the primary `FieldSelection` by object identity. The exact unchanged selector is `selectAlcoholObservation` from `src/pipeline/extractor/field-selection.ts`.

Single changed variable: the final Alcohol selector input condition. No other variable may change.

## Frozen call site and pass order

The seam is evaluation-only and runs after `extractLabelEvidenceDetailed` returns its production response and debug pass trace. It does not modify `extractor.ts`.

The selector receives the existing `debug.passes` array in execution order:

1. `full-image-primary`
2. `left-edge-strip-rot270`, if planned
3. `right-edge-strip-rot90`, if planned
4. `focus-crop`, if planned
5. one focus-edge or `full-image-rot180` fallback if capacity permits

No sort, filtering, deduplication, cloning, or truth-dependent transformation is permitted before selection.

## Frozen corpus and truth

- Corpus: all 115 `included` records in `src/fixtures/eval/eval-manifest.json`.
- Evaluable decision subset: the 50 cases for which at least one existing recovery pass executes.
- Checksum family: each included record's complete `expectedSha256`.
- Truth: committed `annotation.alcohol`, including acceptable percents/statements and presence/absence.
- Truth source: the committed annotation provenance and quality-control records.
- Truth is read only after OCR execution and selection. It is never passed to OCR, pass planning, parsing, or either selector arm.
- Frozen slices and counts are in `slice-definitions.md` and `eligibility.md`.

The governed unit of improvement/regression is a fixture/checksum family. Synthetic unit fixtures prove mechanics but are excluded from decision metrics.

## Frozen selector behavior

- Parser: existing `parseWineAlcoholStatement`.
- Candidate generation: existing same-line and adjacent-line windows.
- Confidence: existing token-confidence mean.
- Low-confidence threshold: `0.6`.
- Ambiguity margin: `0.2`.
- Ranking/tie-break: OCR evidence score descending, normalized value key ascending, deterministic existing input order for an exact tie.
- Comparison: exact normalized parsed percent for parsed-value accuracy; existing normalized text matcher for normalized-text accuracy.
- No selector parameter may be tuned.

## Frozen run order

After all isolation/unit tests pass:

1. primary control
2. primary treatment
3. repeat control
4. repeat treatment

Each run executes the governed 115-case corpus sequentially through the real extractor. Decision metrics use the frozen 50 recovery-bearing cases. The 65 no-recovery cases prove exact primary preservation and parity but are not counted as selector-input evaluable cases.

## Frozen metrics

Per case:

- fixture ID and exact checksum family;
- truth source and expected text/value;
- layout slices;
- primary and every recovery transcript;
- individual pass parsed selection, confidence, observation state, provenance, PSM, preprocessing, and timing;
- explicit null whole-image reliability and authority fields;
- current and treatment selections and sources;
- correctness before/after, improvement/regression;
- false/wrong reliable read;
- absence false positive;
- latency;
- behavior hash;
- required failure and mechanism classifications.

Aggregate:

- detection recall;
- parsed-value accuracy;
- normalized-text accuracy;
- false reliable-read count/rate;
- wrong reliable-read count/rate;
- absence false positives;
- correct-but-conservative count;
- recovery-contained-truth and recovery-discarded-truth counts;
- selector improvements/regressions;
- bottom, side, rotated, vertical, ordinary-horizontal recall;
- median and p95 extraction latency;
- Wilson 95% intervals for binomial accuracy/recall/rate metrics;
- improvement and regression checksum families.

`OBSERVED` is the experiment's reliable-read proxy because the whole-image production observation has no distinct reliability field. A false reliable read is `OBSERVED` on fixed absent truth. A wrong reliable read is `OBSERVED` with a parsed value outside all acceptable percents on present truth.

## Behavior hashes

Canonical JSON means recursively sorted object keys, array order retained, UTF-8 JSON with no insignificant whitespace.

- Per-case behavior hash: SHA-256 of canonical JSON containing case/checksum, pass plan and non-timing OCR words, primary selection, arm selection, Brand selection, Warning selection, and classifications. Truth is included only in the evaluation/result portion, never selector input.
- Arm behavior hash: SHA-256 of newline-joined per-case behavior hashes in manifest order.
- OCR trace hash: SHA-256 of canonical pass IDs, kinds, triggers, eligibility, transforms, preprocessing, PSM, and words with timings excluded.
- Production response hash: SHA-256 of exact serialized analyzer response bytes.

Primary and repeat hashes for the same arm must match exactly. Control and treatment may have different arm hashes only when their selected Alcohol behavior differs. Timing values are excluded from behavior hashes.

## Success criteria

Treatment may receive `ADOPT_FOR_PRODUCTION_REVIEW` only if every condition is true:

1. at least two governed cases improve;
2. at least two independent checksum families improve;
3. detection recall or parsed-value accuracy improves;
4. at least one improvement promotes truth already present in recovery evidence;
5. no previously correct case regresses;
6. false reliable reads do not increase;
7. wrong reliable reads do not increase;
8. no absence control becomes positive;
9. Brand behavior is unchanged;
10. Government Warning behavior is unchanged;
11. treatment median latency increase is at most 10%;
12. treatment p95 latency increase is at most 15%;
13. primary/repeat behavior hashes reproduce exactly;
14. no production behavior is enabled.

## Kill criteria

Decision is `KILL` if any condition is true:

- zero or one case improves;
- improvements span only one checksum family;
- neither detection recall nor parsed accuracy improves;
- any previously correct case regresses;
- false reliable reads increase;
- wrong reliable reads increase;
- any absence false positive appears;
- Brand changes;
- Government Warning changes;
- either latency ceiling is exceeded;
- recovery triggers, OCR, preprocessing, PSM, parsing, thresholds, reliability, or authority change;
- seller truth enters OCR or selection;
- behavior does not reproduce;
- control and treatment are behaviorally identical across every evaluable case.

No criterion may be relaxed after outputs are observed.

## Inconclusive rule

`INCONCLUSIVE_CORPUS_EXPANSION_REQUIRED` is permitted only when the preregistered eligibility minimum fails before treatment or required governed truth/pass/checksum evidence becomes unavailable without triggering a safety stop. Passing eligibility followed by an identical treatment is `KILL`, not inconclusive.

## Mechanism classification

Every changed case receives exactly one:

- `RECOVERY_TRUTH_PROMOTED`
- `STRONGER_RECOVERY_REPLACED_WEAK_PRIMARY`
- `CORRECT_PARSED_VALUE_PROMOTED`
- `PRIMARY_CORRECTLY_RETAINED`
- `RECOVERY_FALSE_POSITIVE_PROMOTED`
- `WEAKER_RECOVERY_REPLACED_PRIMARY`
- `TIE_BREAK_CHANGED_SELECTION`
- `CONFIDENCE_ONLY_CHANGE`
- `NO_MEANINGFUL_EFFECT`
- `UNDETERMINED`

Unchanged evaluable cases receive `NO_MEANINGFUL_EFFECT`. Any claimed effect must state that it came only from already-collected evidence, already-available parsing, and selector behavior.

## Safety and isolation gates

- The evaluation module is default-off, under `src/fixtures/eval`, and reachable only from tests/scripts.
- Production extractor and package route must not import it.
- Production-file hashes listed in `architecture-audit.md` must remain unchanged.
- Recovery plan, pass count/order, transforms, preprocessing, PSM, OCR engine/language/worker, parser, thresholds, confidence, evidence status, reliability, authority, Brand, Warning, schemas, persistence, UI, and seller truth handling are frozen.
- Brand and Warning hashes must be zero-delta between arms.
- Production parity must remain 115/115 exact serialized responses.
- PR #195 must remain at head `79f628c2dd3d915325986a1e6c012fe12fe6ac15` and must not be modified, rebased, merged, closed, or depended upon.
- No VLM, cloud OCR, seller-text hinting, authority weakening, Experiment B, LOW_CONFIDENCE recovery, PSM 7, EXIF normalization, or unrelated refactor is allowed.

Any safety-gate failure stops the governed run. The result is preserved; production remains unchanged.

## Frozen next recommendation rule

If the decision is `KILL`, recommend exactly one next experiment:

**Corpus expansion** — add governed cases that naturally produce Brand-only recovery while primary Alcohol is `OBSERVED`, `LOW_CONFIDENCE`, or `AMBIGUOUS`, so the proposed selector-input condition has an observable difference without changing production recovery triggers.

No second experiment will be run here.
