# Limitations — native Tesseract float-model compatibility probe

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
