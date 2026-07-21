# Omitted derived intermediate — provenance record

One working file is deliberately **not** committed with this research record. It
is a large, fully reproducible OCR intermediate; preserving it would add
megabytes to the repository without adding evidence.

## The omitted file

| | |
|---|---|
| File name | `all-cases-slim.json` (this directory) |
| Original size | **3 511 154 bytes** (3.35 MiB), 1 line — the generator emits unindented JSON |
| Original SHA-256 | `dbe499eb690802fc874b7f4a994c9f089ffb5abc74c0f2d5165146de02346252` |
| Contents | for all 115 corpus cases: `caseId`, `strata`, the alcohol truth/observation summary, and the complete `alcoholCandidateDecisions` diagnostic array |
| Base commit | `9ecd7b2` (`git-sha.txt`) |

*(A prettier-formatted copy was briefly staged during PR assembly at 5 848 248
bytes / 189 012 lines, SHA-256
`c922d656af21df3d6facaf4cee879744bf58e7274a2f5abad73f22fe49b034d5`. That variant
is an artefact of the formatter, not of the generator; the generator SHA above is
the one a fresh run reproduces.)*

## Generation command

From the repository root, at base commit `9ecd7b2`:

```bash
npx tsx artifacts/alcohol-digit-ocr-diagnosis/run-eval.ts <output-dir>
```

This runs the real extractor over the fixed 115-case manifest and writes
`baseline-summary.json`, `all-cases-slim.json`, and `forensic-cases.json` into
`<output-dir>`. It takes a few minutes: every case is a full OCR pass.

## Reproduction was verified, not assumed

Regenerated at base `9ecd7b2` after this record was assembled:

| File | Result |
|---|---|
| `all-cases-slim.json` | **byte-identical** — SHA-256 `dbe499eb…` reproduced exactly |
| `forensic-cases.json` | **byte-identical** — SHA-256 `c9ca6bdd…` |
| `baseline-summary.json` | identical in every correctness metric; **only** `latencyMs.median` and `latencyMs.p95` differ, because they are wall-clock measurements |

That byte-identity is the justification for omitting the file: it is derived, not
observed.

## Why it was excluded

A research record should preserve the **minimum sufficient evidence plus a
working reproduction path**, not a large derived working dataset. Every claim in
this record is supported by the aggregate result files that *are* committed
(`baseline-summary.json`, `control-results.json`, `narrower-trigger-results.json`,
`reread-evidence.json`, `ocr-matrix-summary.json`, `ocr-matrix.csv`,
`contradiction-cases.csv`, `failure-classification.json`, `target-cases.csv`) and
by the case notes and crops.

## What still needs it

`forensic-cases.json` holds only the **two** target cases (`approved-wine-018`,
`approved-wine-037`), so it is *not* a substitute for the corpus-wide controls,
which must iterate all 70 cases that produced an accepted candidate — including
the correct ones, which are the entire point of a control.

Two scripts therefore require the intermediate to be regenerated first:

| Script | Needs regeneration? | Committed output it produced |
|---|---|---|
| `control-simulation.mjs` | **yes** | `control-results.json` |
| `reread-evidence.ts` | **yes** | `reread-evidence.json` |
| `narrower-triggers.mjs` | no — reads `reread-evidence.json` | `narrower-trigger-results.json` |
| `fix-crop-stats.mjs` | no — reads `reread-evidence.json` | (patches it in place) |
| `ocr-matrix.mjs` | no — reads fixture images directly | `ocr-matrix.csv`, `ocr-matrix-summary.json` |

So the entire trigger analysis — the part of this record that carries the
conclusions — reproduces from committed files alone. Only the two generating
steps upstream of it need the intermediate rebuilt.
