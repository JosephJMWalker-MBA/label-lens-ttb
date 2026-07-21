# Deliberately omitted outputs — E1b

Four files named in the experiment brief are **absent by design**, not by
oversight:

| File | Why absent |
|---|---|
| `baseline.json` (full corpus) | Phase 2 was never run |
| `treatment.json` (full corpus) | Phase 2 was never run |
| `changed-cases.json` (full corpus) | Phase 2 was never run |
| `candidate-volume.json` (full corpus) | Phase 2 was never run |

Phase 1 fired the immediate kill condition — 8 of 10 brand-absent cases emitted a
selected value — and the brief requires that, when it fires, brand-present gain
metrics are **not** inspected. Producing those four files would have required
computing exactly those metrics. **No brand-present treatment arm for E1b exists
anywhere, and none may be derived from this record.**

## What is preserved instead

| File | Contents |
|---|---|
| `phase-1-absent-safety.json` | the Phase 1 result, per case |
| `cases-absent.json` | full per-case treatment detail for the 10 brand-absent cases, including every generated candidate |
| `filter-results-absent.json` | filter outcome tally for spans generated on those cases |
| `prominence-analysis.json` | eligibility decision for all 478 `too-many-words` lines corpus-wide — **diagnostic only, no treatment arm** |
| `prominence-analysis-absent.json` | the same for the Phase 1 run, including realised span counts |

## Reproduction

Nothing needed for reproduction has been excluded. `commands.sh` regenerates
every preserved file from the committed fixtures and unmodified production code:

```bash
npx tsx artifacts/brand-evidence-path-diagnosis/e1b-prominence-gated-simulation/simulate.ts \
        artifacts/brand-evidence-path-diagnosis/e1b-prominence-gated-simulation --absent-only
npx tsx artifacts/brand-evidence-path-diagnosis/e1b-prominence-gated-simulation/prominence-probe.ts \
        artifacts/brand-evidence-path-diagnosis/e1b-prominence-gated-simulation
```

Both were verified byte-identical across two consecutive runs. The prominence
constants are read out of `src/pipeline/extractor/field-selection.ts` at runtime,
so a future reader gets whatever production then defines — and the run will fail
loudly rather than silently drift if those constants are renamed.

**Do not "complete" this record by running Phase 2.** The missing files are the
evidence that the safety screen was honoured.
