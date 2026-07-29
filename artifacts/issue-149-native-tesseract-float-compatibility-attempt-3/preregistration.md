# Preregistration — Attempt 3, native Tesseract + tessdata_best compatibility

Refs Issue #149. **Synthetic compatibility experiment only.** Frozen before any
OCR runs.

This is a **new, separately preregistered attempt**, not a rerun of the same
protocol. It repairs exactly two harness defects identified in Attempt 2 and
changes nothing else.

Base: `origin/main` `6201fde18009c48b1cf6342f9cdb224103fd3e22`, including merged
PR #209.

## Attempts 1 and 2 remain unchanged

Nothing in this attempt alters, reinterprets, or re-adjudicates either earlier
attempt. Their artifacts are frozen and are not edited.

- **Attempt 1** — `INCONCLUSIVE_ENVIRONMENT` on the authoring host, which had no
  container runtime. Zero OCR invocations. Still true of that host.
- **Attempt 2** — `INCONCLUSIVE_OUTPUT` on a GitHub-hosted native amd64 runner.
  All eight invocations exited 0, none timed out, none was signalled, no ABI,
  loader, or unsupported-model error occurred, and all primary/repeat pairs were
  byte-identical. Native Tesseract 5.3.0 loaded and executed **both** the
  integer-quantized control model and the pinned float `tessdata_best` treatment
  model.

Attempt 2 was adjudicated inconclusive for two reasons, **both harness defects,
neither a model defect**:

1. the ephemeral model directories omitted Tesseract's `configs/tsv`, so the
   requested TSV renderer never engaged and output fell back to plain text;
2. the synthetic final `9` glyph was read as `H` by both models.

**Attempt 3 fixes exactly those two defects.** A failure here would not erase the
fact that Attempt 2 loaded and ran both models.

## Research question

Can the pinned native Tesseract 5.3.0 runtime execute the pinned float
`tessdata_best` model and produce **valid, deterministic TSV** output on one
unambiguous positive sentinel and one blank negative sentinel?

Compatibility only. **This is not a Brand capability benchmark** and no
recognition-capability claim follows from any outcome.

## Runtime — frozen, reused, reverified

Exactly the Attempt 2 runtime. No discovery phase: the pins are already known and
are **reverified**, not rediscovered.

| Field | Value |
| --- | --- |
| Execution host | GitHub-hosted runner, native `linux/amd64` |
| Base image | `node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3` |
| Base amd64 image id | `sha256:bd16adabad7619222d4d0ab2d61f48391dacde03ad93f54d344683e326cbd0e2` |
| Tesseract | 5.3.0 |
| Packages | `tesseract-ocr=5.3.0-2`, `libtesseract5=5.3.0-2`, `liblept5=1.82.0-3+b3`, `time=1.9-0.2` |
| Expected `tesseract` binary sha256 | `1e8c7ce7f27d2d1c902fb648efed443483f2a8fc7b60c48a5d3b61d647a2649e` |
| OEM / PSM / DPI | 1 / 11 / 300 |
| Locale | `LC_ALL=C`, `LANG=C` |
| Threads | `OMP_THREAD_LIMIT=1`, `OMP_NUM_THREADS=1` |
| Limits | 1 CPU, 2 GB, 120 s timeout |

If **any** frozen runtime component is unavailable or differs — base digest,
package version, or binary hash — the run stops before OCR with
`INCONCLUSIVE_ENVIRONMENT`. Nothing is silently upgraded or substituted.

## Models — unchanged

| Role | Path | sha256 | Bytes |
| --- | --- | --- | --- |
| Control | `src/pipeline/extractor/assets/eng.traineddata` | `5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747` | 5,199,098 |
| Treatment | `.local/ocr-research/traineddata/tessdata-best/eng.traineddata` | `8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba` | 15,400,601 |

The treatment model is retrieved through the existing PR #208 script. Neither
model is committed, modified, or substituted. No other traineddata file is used.

## Harness correction 1 — valid TSV configuration is mandatory

The pinned runtime's own `configs/tsv` must be available to **both** arms.

Before OCR the probe locates the installed `configs/tsv` inside the built image
and records its absolute source path, package ownership, byte size, full sha256,
and complete contents. It then creates two **ephemeral, non-Git** tessdata
directories — one per arm — each containing that arm's `eng.traineddata` plus an
identical copy of the pinned runtime's `configs/tsv`. The two copies are verified
byte-identical, and each directory is mounted read-only for its arm.

The run **fails closed** if `configs/tsv` is missing, its hash differs between the
staged copies, model or config files cannot be read, Tesseract logs
`Can't open tsv`, or a plain-text fallback occurs.

**A plain-text fallback is a failed output condition, not a degraded success.**

The only difference between arms remains the `eng.traineddata` bytes. No
treatment-specific config is used, the installed config contents are not altered,
and no confidence threshold or parser behaviour is introduced.

## Harness correction 2 — unambiguous positive sentinel

The positive sentinel is now **`LABEL LENS 123`**.

Same deterministic generation approach as Attempt 2: explicit integer-coordinate
rectangles rasterised into a raw RGB buffer — no system font, no SVG renderer, no
corpus-derived pixels. Ordinary horizontal black glyphs on white, generous size
and spacing, no rotation, no stylization. The letters are unchanged from Attempt
2, where every letter was read correctly; only the digits changed, and `1` is
carried over unchanged because it was read correctly.

Input QA, performed before this freeze: both images were generated twice
independently and were byte-identical, and the positive image was visually
inspected for glyph ambiguity. The `2` and `3` are standard seven-segment forms;
the `3` has three bars against a full right stem and no left stem, so it cannot
collapse into an `E`.

| Image | sha256 | Bytes |
| --- | --- | --- |
| `synthetic/positive.png` | `9f079b48bcc7ba5a71a0e1b84f946c621e6709739ecd260549075a0c38e3b49d` | 3,015 |
| `synthetic/blank.png` | `8b5531768177d1a62c9e7780a1edfd5231f46681a474ad359313a979aa4d3e9d` | 1,201 |

Canvas 1240x220, glyph cell 60x100, stroke 12, advance 80, margins 60/60. The
blank image has identical dimensions and background with no glyphs painted.

**No OCR may run before these images and this preregistration are frozen, and the
images may not be altered after any OCR output exists.**

## Execution transport

A push-triggered research workflow scoped to exactly this Attempt 3 branch, with
the phase selected by a committed mode file (`execute`, `complete`) and a path
filter admitting only the workflow file and that mode file. The experiment runs
only when the mode is exactly `execute`. After results are committed the mode is
set to `complete` and a sealing run must skip execution.

`pull_request_target`, `schedule`, `repository_dispatch`, and unscoped push
triggers are not used. `main` is not modified outside the eventual reviewed PR.

## Fixed invocation matrix — exactly eight

`control x {positive, blank} x {primary, repeat}` and
`treatment x {positive, blank} x {primary, repeat}`.

No third run, no retry with altered settings, no additional synthetic image, no
alternative config.

Inference uses `--network=none`, read-only model/config mounts, read-only input
mounts, no repository root mounted, no corpus mounted, no fixture truth mounted,
and identical resource limits for both arms.

## Canonical output validity

A TSV output is valid only when the `.tsv` file exists and is non-empty; its
header exactly matches the Tesseract TSV schema
(`level page_num block_num par_num line_num word_num left top width height conf text`,
tab-separated); every non-empty row has exactly 12 columns; the numeric columns
parse; text rows reconstruct deterministically; stderr contains no TSV-config
loading failure; and the output was not recovered from a plain stdout fallback.

Raw TSV bytes are persisted before parsing. **TSV is never synthesised from plain
text.**

## Expected transcripts and normalization

Positive sentinel: `LABEL LENS 123`. Blank sentinel: empty.

Normalization, fixed before OCR: concatenate TSV **word-level** text in reading
order; trim outer whitespace; collapse internal whitespace to one ASCII space;
preserve letters and digits. **No fuzzy matching, no character substitution, no
edit-distance allowance.** Normalization is not relaxed after results.

## Verdict rules

- **`COMPATIBLE`** — control and treatment both initialize; all eight invocations
  exit 0; all eight produce valid TSV; both positive control outputs and both
  positive treatment outputs normalize exactly to `LABEL LENS 123`; all four
  blank outputs normalize to empty; all primary/repeat pairs are deterministic in
  normalized transcript, parsed TSV rows, bounding boxes, and confidences; no
  timeout; no signal; no ABI, loader, traineddata, config, or unsupported-model
  error. Raw TSV bytes may differ only where the difference is fully attributable
  to nondeterministic metadata that alters no row, box, confidence, or
  transcript, and any such distinction is recorded explicitly.
- **`INCOMPATIBLE_FLOAT_MODEL`** — only when control passes every compatibility
  gate, the treatment reproducibly fails to initialize or execute, the failure is
  attributable to float model/runtime compatibility, and it reproduces in the
  exact repeat.
- **`INCONCLUSIVE_OUTPUT`** — either arm executes but TSV is invalid; or the
  positive sentinel is not exact; or a blank emits text; or outputs are
  nondeterministic; or an output failure cannot be attributed to model
  compatibility.
- **`INCONCLUSIVE_ENVIRONMENT`** — the pinned runtime cannot be rebuilt; package
  pins or base digest cannot be reproduced; model, config, or input integrity
  cannot be established; the runner is not native amd64; or the required
  environment inventory is incomplete.

**Nondeterminism overrides compatibility.** No fifth verdict exists.

## Interpretation boundaries

A `COMPATIBLE` result establishes only that the pinned native Tesseract runtime
can execute both pinned models, that the float model can produce valid
deterministic TSV on these fixed synthetic inputs, and that a **separately
preregistered** frozen-crop mechanism benchmark becomes eligible.

It does not establish better Brand recognition, better stylized-text recognition,
lower CER, fewer false reliable reads, production suitability, acceptable Render
latency, authorization to alter production, or authorization to replace
Tesseract.js.

Latency and memory are measurements for the GitHub-hosted runner and are
**diagnostic only**.

## Production isolation

No change to `src/`, the production Dockerfile, Render configuration, Next.js
configuration, dependencies, production OCR assets, parser, selection,
thresholds, fixtures, truth, or Alcohol/Government Warning behaviour. PR #195
untouched. No corpus access.
