# Frozen definitions — Brand candidate-window diagnosis

Frozen **before** the 42-case breakdown was computed.

## Population

The 42 cases are those where, on the frozen 115-case corpus:

- fresh raw-OCR truth presence is `EXACT_RAW_MATCH` or `NORMALIZED_RAW_MATCH`
  under the rule validated in PR #223, **and**
- no kept candidate equals the governed Brand.

PR #223 is the upstream authority for raw-OCR presence. It is not recomputed
here under a different rule.

## Truth-bearing raw span

A contiguous run of OCR word tokens, within one pass, whose per-token
normalization concatenates exactly to the normalized governed Brand. This is the
PR #223 rule (`classifyRawOcrMatch`), reused unchanged.

## Truth-bearing candidate

A generated Brand candidate whose **value** — `cleanedValue` when present, else
`rawText` — equals the governed Brand under the governed matchers
`brandExactMatch` or `brandNormalizedMatch`.

**Containment is not truth-bearing.** A candidate that carries the Brand inside
a longer value is not a correct Brand candidate, because selecting it yields the
longer value. This distinction is the load-bearing one for this diagnosis, and it
is why the `too-many-words` counterfactual recovered nothing.

## Classification — earliest demonstrated loss, evaluated in pipeline order

Pipeline order: raw OCR → line/region structure → span enumeration → value
construction → filtering → kept set. Each case receives exactly one class, the
earliest stage at which loss is demonstrated.

1. **D — TRUTH_SPANS_MULTIPLE_GENERATION_UNITS.** No single generation unit
   (one line of one pass, as the selector groups lines) contains the truth
   token run. The loss precedes span enumeration.
2. Otherwise the truth run sits inside one generation unit, and:
   - **A — EXACT_CANDIDATE_GENERATED_AND_FILTERED.** A pre-filter candidate
     whose value equals the Brand exists and was rejected. Every active
     rejection reason is recorded. This is a genuine **filter loss**.
   - **F — NORMALIZATION_TOKENIZATION_MISMATCH.** A span covering exactly the
     truth token run was emitted, but its constructed value does not equal the
     Brand. The loss is in value construction, not enumeration.
   - **B — OVERWIDE_WINDOW.** No exact candidate; at least one generated
     candidate *contains* the Brand within a longer value.
   - **C — PARTIAL_WINDOW.** No exact and no overwide candidate; at least one
     generated candidate is a proper part of the Brand.
   - **E — WINDOW_NOT_ENUMERATED.** No exact, overwide, or partial candidate:
     the correct run exists inside a generation unit and the generator emitted
     nothing corresponding to it.
3. **G — OTHER**, only with a case-level explanation.
4. **H — UNDETERMINABLE**, when the evidence cannot establish the loss point.

## Roll-up

- **FILTER LOSS** = A
- **WINDOW / SPAN FORMATION LOSS** = B + C + E
- **STRUCTURAL / SEGMENTATION LOSS** = D
- **VALUE CONSTRUCTION LOSS** = F

## Rule for interpreting rejected candidates

A rejected candidate that merely *contains* the Brand is never counted as a
filter loss. Only class A is a filter loss.
