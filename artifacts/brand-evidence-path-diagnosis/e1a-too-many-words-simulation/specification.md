# E1a specification — what was simulated, and how faithfully

## Treatment boundary (as instructed)

1. Identify lines whose whole-line brand candidate was rejected **specifically**
   for `too-many-words`.
2. Generate every contiguous span of 1–4 OCR words from those lines (excluding
   the whole line itself).
3. Pass every generated span through the existing production normalization,
   filters, brand classification, scoring, ranking, prominence handling, and
   authority-state assignment — all unmodified.
4. No fixture id, truth text, expected brand, filename, or known failure is used
   to steer generation.
5. Truth is read only after both baseline and treatment selections exist.

Sub-spans are **not** generated for lines rejected as `producer-line`,
`domain-like`, `non-brand-keyword`, `sentence-fragment`, or any other reason.
`TRIGGER_REASON` in `simulate.ts` is a single constant and is the only trigger.

## How the treatment was simulated without editing production code

`selectBrandObservation(results)` analyses each reconstructed line of each
`RegionOcrResult` through the real filter ladder, classifier, scorer, ranker and
authority gate. A synthetic `RegionOcrResult` whose `words` are exactly one
sub-span therefore causes production to analyse that sub-span through the
identical code path. The treatment run is:

```ts
selectBrandObservation([...realPasses, ...oneResultPerSubSpan])
```

Both arms then apply the extractor's own selection rule — primary-only unless the
primary was `NOT_OBSERVED` — so the arms differ in exactly one thing: the
presence of the generated spans.

## Nothing in this list was changed

positive-brand-signal rules · designator vocabulary · possessive handling ·
producer/bottler policy · candidate scores · ranking thresholds · evidence
thresholds · authority-state semantics · OCR · reconstruction · schemas ·
fixtures · tests · UI.

The sub-span width cap reuses production's own `MAX_BRAND_WORDS = 4`; it is not a
new constant.

## Baseline fidelity check

The simulation recomputes its own baseline from the same OCR passes. It
reproduces the independently measured diagnosis baseline exactly:

| Metric | Diagnosis | Simulation baseline |
|---|---|---|
| exact selected match | 27 | **27** |
| normalized selected match | 29 | **29** |
| top-3 recall | 33 | **33** |
| `OBSERVED` / `AMBIGUOUS` / `NOT_OBSERVED` | 4 / 101 / 10 | **4 / 101 / 10** |
| absent-brand emitting a value | 0 | **0** |

## Known divergences from a real implementation

Recorded so the result is not over-claimed:

- Generated spans arrive as separate synthetic passes, so their
  `candidateProvenance.passId` differs and their `assembly` is recorded as
  `whole-line` rather than `line-window`. Neither field participates in
  filtering, scoring, ranking, or the authority gate.
- Multi-line merges seed only from whole-line candidates in production
  (`seedsByLine` receives `wholeLine.candidate` only), and the synthetic passes
  are single-line, so no merge behaviour is introduced that a real
  implementation would lack.
- `maxProminence` and `maxArea` are computed over the union of candidates in both
  arms, exactly as production does — the added spans are sub-ranges of existing
  words, so neither maximum moves.
- Latency was **not** measured. The candidate-count growth in
  `candidate-volume.json` is the proxy, and it is reported as such.
