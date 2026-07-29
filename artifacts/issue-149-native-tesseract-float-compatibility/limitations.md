# Limitations — native Tesseract float-model compatibility probe

> **Attempt 2 update.** The sections below describe Attempt 1 on the authoring
> host and remain accurate for it. Attempt 2 ran all eight invocations on a
> GitHub-hosted native amd64 runner; its limitations are recorded at the end of
> this file under "Attempt 2".

Synthetic compatibility experiment only. No corpus access, no fixture or fixture
truth change, no production behaviour change, no native Tesseract installed into
the production application or production Dockerfile. PR #195 untouched.

## The probe did not run

Verdict `INCONCLUSIVE_ENVIRONMENT`. **Zero of the eight planned OCR invocations
executed.** No container runtime exists on the authoring host: no `docker`,
`podman`, `nerdctl`, `finch`, `colima`, or `limactl` binary is on PATH, and while
a stale `/var/run/docker.sock` symlink survives from a removed Docker Desktop
install, no daemon answers on it.

The research question — can native Tesseract load and execute the float model —
is therefore **unanswered**. Nothing here is evidence either way.

## An unavailable environment is not an incompatibility

This must not be recorded as `INCOMPATIBLE_FLOAT_MODEL`, and it must not be
folded into any capability-ceiling argument. The runtime was never able to try.
The only prior compatibility evidence remains PR #208's finding about the
integer-only WASM cores, which is a statement about *that* runtime, not about
native Tesseract.

## The runtime inventory is incomplete by construction

Resolved before the stop: the base image reference and both digests (manifest
list and linux/amd64), and the declared target architecture.

**Not resolved**, because they exist only inside a built image: native Tesseract
version, libtesseract version, Leptonica version, installed package versions, the
sha256 of the `tesseract` executable, `ldd` output, and the built image
ID/digest. The preregistration records these as unresolved rather than guessing
them.

Consequently the Dockerfile's three package-version build args have **no
defaults** and the build fails closed. That is deliberate: a Dockerfile that
silently `apt-get install`s whatever `tesseract-ocr` resolves to on the day would
void the "one pinned native runtime" property this probe exists to establish.

## Emulation would have made the resource figures diagnostic only

The authoring host is arm64 and the declared target is linux/amd64. Had the probe
run here, every latency and peak-memory figure would have come from emulation and
could not support any production-performance claim. `resource-report.json`
records this caveat even though no figure was collected.

## The synthetic inputs are deterministic here, not provably everywhere

Glyphs are rasterised from explicit integer-coordinate rectangles into a raw RGB
buffer, so no system font or SVG renderer participates and the pixel content
cannot drift with a font upgrade. Regeneration determinism is verified inside the
run — two independent generations produced byte-identical PNGs.

The residual risk is PNG *encoding*: sharp/libpng could in principle emit
different bytes under a different library version even for identical pixels. The
recorded sha256 would detect that rather than hide it, and the pixel content
would still be identical.

## The sentinel glyphs are hand-built, not a real typeface

"Ordinary sans-serif typography" is approximated by rectangle strokes. The `B`
was deliberately given a narrower top bowl than bottom bowl after visual review,
because a vertically symmetric rectangle `B` can rasterise into something a
recognizer reads as `8`.

That review happened before any OCR existed and before this preregistration was
frozen, so it is input QA rather than tuning against results. It remains true
that if a future run misreads the sentinel, the correct verdict is
`INCONCLUSIVE_OUTPUT` — a glyph the recognizer dislikes is not a model
incompatibility.

## The native control is a positive control, not a comparison

The repository control model is mounted into the *native* runtime purely to prove
the native stack can read something. Nothing in this design compares native
Tesseract against the production tesseract.js runtime, and no accuracy claim of
any kind is available from it.

## What a future `COMPATIBLE` would and would not buy

It would establish only that this pinned native runtime can execute this pinned
float model in this pinned container, making the stack eligible for a separately
preregistered corpus benchmark.

It would not establish better Brand accuracy, lower CER, better stylized-logotype
recognition, production suitability, acceptable Render performance or latency,
production determinism, a Tesseract capability ceiling, or any authorization to
touch the production engine.

## Deployment reality is untouched and unaddressed

Even a clean `COMPATIBLE` says nothing about whether a native Tesseract binary
can or should exist in the Render deployment. Production installation, production
Dockerfile changes, Render configuration, a production engine factory, replacing
Tesseract.js, and shadow deployment all remain unauthorized and unexamined.


## Attempt 2 — GitHub-hosted native amd64 runner

### The compatibility question is still open

All eight invocations ran, exited 0, produced no timeout or signal, and were
byte-identical across every primary/repeat pair. Both models loaded. But the
frozen `COMPATIBLE` criteria were not met, so the adjudicated verdict is
`INCONCLUSIVE_OUTPUT`. Two defects sit in the way, and **both are mine**, not
properties of the model or the runtime.

### Defect 1 — the canonical output format never engaged

Tesseract's `tsv` output is a config file read from
`$TESSDATA_PREFIX/configs/tsv`. The probe mounts a bare directory containing only
`eng.traineddata` as `TESSDATA_PREFIX`, so that file does not exist in the
container. Every invocation logged `read_params_file: Can't open tsv` and fell
back to plain text.

The preregistration named TSV as the canonical raw output precisely so text,
confidence, and geometry would all survive. This run produced none of the
confidence or geometry evidence the protocol asked for.

### Defect 2 — the sentinel glyph is ambiguous

Both models read the final digit `9` as `H`, giving `LABEL LENS 14H`. The
rectangle-built `9` is not distinct enough. This was foreseen in Attempt 1's
limitations — a glyph the recognizer dislikes yields `INCONCLUSIVE_OUTPUT`, not a
model incompatibility — and it is what happened.

### Neither defect was repaired in place

The frozen protocol allows no retries beyond the exact repeat and no altered
settings or inputs after a failure. Repairing either defect and re-running would
be exactly the result-shopping those rules exist to prevent, so no third run was
attempted and the synthetic PNG bytes were not touched. Both fixes require a
separately preregistered Attempt 3.

### The evidence points toward compatibility, which is not the same as compatible

The float model was resident (peak RSS ~61 MB against the control's ~38 MB),
executed to completion on every invocation, produced output identical to the
control's, and emitted no ABI, loader, or unsupported-model error anywhere in
stderr. That is inconsistent with `INCOMPATIBLE_FLOAT_MODEL` and consistent with
compatibility.

It is still not a `COMPATIBLE` verdict, and it must not be reported as one. The
frozen bar requires valid TSV and an exact sentinel transcript. Reading a
suggestive partial result as the verdict it resembles is the failure mode this
whole protocol is built to prevent.

### The machine classifier mislabelled its own result

The runner emitted `INCONCLUSIVE_ENVIRONMENT` because it keyed control success on
TSV validity. Under the frozen rule text the correct label is
`INCONCLUSIVE_OUTPUT`: the control did execute, Docker built reproducibly, the
architecture was native, integrity was established, and the inventory is
complete. The machine output was committed unaltered and the discrepancy is
recorded in `attempt-2/verdict-adjudication.json` rather than quietly corrected.

### Performance figures are diagnostic

Latency 257-300 ms and peak RSS ~38-61 MB are real measurements for a native
linux/amd64 GitHub-hosted runner (AMD EPYC 7763, 4 vCPU, 16.77 GB). They say
nothing about Render production performance.

### Transport moved; the treatment did not

Execution moved from `workflow_dispatch` to a push-triggered workflow scoped to
this branch, because GitHub only dispatches workflows present on the default
branch and this experiment must not modify `main`. Synthetic inputs, model
identities and hashes, base digest, architecture, OEM, PSM, DPI, locale, thread
limits, invocation matrix, timeout, and verdict rules are all unchanged.
