# Preregistration — native Tesseract float-model compatibility probe

Refs Issue #149. **Synthetic compatibility experiment only.** Frozen before any
OCR invocation.

It does not evaluate Brand recognition capability. It does not access the
governed corpus. It changes no production behaviour. It installs native
Tesseract into no production application and no production Dockerfile. PR #195
untouched.

Base: `origin/main` `887c4df34efc844a69edb87514e5c97432869166`, including merged
PR #208.

## Research question

Can one pinned native Tesseract runtime load and execute the official float
`tessdata_best` English model locally, deterministically, and without runtime or
model-format failure?

A `COMPATIBLE` result would mean only: **native Tesseract is an eligible
execution path for a later governed crop benchmark.** It would **not** mean the
float model is more accurate than the incumbent.

## Prior evidence carried forward from PR #208

- Production recognizer: tesseract.js 7.0.0, tesseract.js-core 7.0.0, OEM 1 /
  LSTM_ONLY, integer-oriented WASM runtime.
- Control traineddata `src/pipeline/extractor/assets/eng.traineddata`, sha256
  `5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747`,
  5,199,098 bytes, integer-quantized best-lineage LSTM.
- Candidate model: official `tessdata_best/eng.traineddata`, upstream commit
  `9ddc24e750eec0994223a9edc3fcb434a2244f3b`, sha256
  `8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba`,
  15,400,601 bytes, Apache-2.0.
- Retrieval: `scripts/eval/fetch-issue-149-tessdata-best.mjs` into the untracked
  cache `.local/ocr-research/traineddata/tessdata-best/eng.traineddata`. **That
  mechanism is reused; no competing download system is created.**
- The float model cannot execute on the current integer-only LSTM WASM core.
  That failure occurred **before** corpus OCR and is **not** a recognition null.

## Single runtime under test

Native Tesseract CLI inside a dedicated Linux Docker image built on the same
Debian Bookworm family as the repository's production deployment path
(`node:22-bookworm-slim`), pinned by immutable digest.

Not tested, by design: multiple native Tesseract versions, multiple Docker
distributions, a Tesseract.js downgrade, a float WASM fork, Homebrew Tesseract, a
host-installed CLI, an ONNX recognizer, a VLM, or any alternative model file. No
runtime sweep and no post-hoc runtime substitution.

## Container

Research-only Dockerfile:
`scripts/eval/docker/issue-149-native-tesseract-probe.Dockerfile`. The production
`Dockerfile` is not modified.

- Declared target architecture: `linux/amd64`.
- Base image `node:22-bookworm-slim`, pinned by digest:
  - manifest list `sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3`
  - linux/amd64 `sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27`
- Exactly one native Tesseract package version, supplied through required build
  args with **no defaults**, so the build fails closed rather than floating the
  recognizer version.
- `time` installed for native resource measurement.
- No corpus image, no fixture, no fixture truth, and no traineddata baked in.
- No network access during inference.

### Runtime identity — resolved before OCR

These facts must be recorded before Tesseract is invoked on any image:

base image reference and digest; target architecture; Tesseract version;
libtesseract version; Leptonica version; installed package versions; sha256 of
the `tesseract` executable; `ldd` dependency output; Docker image ID/digest.

**Status at the time of this freeze: the base image reference and digest and the
target architecture are resolved. The remaining facts are NOT resolved**, because
they are obtainable only from inside a built image and this host has no container
runtime. The probe therefore stops before OCR. See `decision.json`.

## Model conditions

The native runtime is held constant. Two model conditions diagnose compatibility:

- **Native control model** — `src/pipeline/extractor/assets/eng.traineddata`. A
  diagnostic **positive control** for the native runtime. This is explicitly not
  an accuracy comparison against the production tesseract.js runtime.
- **Native float treatment model** — the cached
  `.local/ocr-research/traineddata/tessdata-best/eng.traineddata`.

Both are mounted **read-only** into separate model directories. Neither is copied
into Git artifacts, neither enters the Docker image, and neither is renamed or
transformed. Full sha256 and byte size are verified immediately before every run.

## Synthetic inputs

Two PNGs, generated programmatically and hashed before this freeze.

1. **Positive sentinel** — white background, black horizontal text
   `LABEL LENS 149`, generous spacing and resolution, ordinary sans-serif forms,
   no stylization, no rotation.
2. **Blank negative** — identical dimensions and background, no text.

Glyphs are composed from explicit integer-coordinate rectangles and rasterised
directly into a raw RGB buffer; no system font and no SVG renderer participate,
so pixel content cannot drift with a font or renderer upgrade on another host.
Dimensions, generation parameters, vector-path source, PNG sha256, and byte size
are recorded in `synthetic-input-spec.json`. Regeneration determinism is verified
inside the run, not asserted.

The sentinel text is known because this is a synthetic runtime validation, not a
blinded capability benchmark. **No additional image variants may be created after
viewing results.**

## Fixed invocation

Identical for both model conditions; only the read-only `TESSDATA_PREFIX`
directory differs.

- language `eng`; OEM `1`; PSM `11`; DPI `300`
- `LC_ALL=C`, `LANG=C`, `OMP_THREAD_LIMIT=1`, `OMP_NUM_THREADS=1`
- timeout 120 s; container limits 1 CPU, 2 GB
- canonical output mode **TSV**, so text, confidence, and geometry all survive
- `--network=none`; model and input mounts read-only; no repository root
  mounted; no corpus or fixture path mounted; a writable directory mounted only
  for raw output and metrics

Captured per invocation: exact command, environment, stdout bytes, stderr bytes,
exit status, terminating signal, timeout status, wall-clock latency, maximum
resident memory, model hash, input hash, runtime identity, container image
identity.

## Execution matrix — exactly eight invocations

control x positive x {primary, repeat}; control x blank x {primary, repeat};
treatment x positive x {primary, repeat}; treatment x blank x {primary, repeat}.

No retries beyond the preregistered exact repeat. No altered settings after a
failure. No third run as a tie-breaker.

## Verdict rules

Exactly one primary verdict is emitted.

- **`COMPATIBLE`** — native control initializes and exits successfully; native
  float treatment initializes and exits successfully; both produce valid TSV for
  both input types; the treatment positive-image normalized transcript is exactly
  `LABEL LENS 149`; the treatment blank-image transcript contains no
  non-whitespace recognized text; treatment primary and repeat are deterministic
  (raw TSV byte-identical, or parsed rows, transcript, boxes and confidences
  exactly identical with any raw difference fully attributed); no timeout; no
  crash; no ABI, loader, traineddata, or unsupported-model error.
- **`INCOMPATIBLE_FLOAT_MODEL`** — control completes successfully; treatment
  reproducibly fails to initialize or execute; the failure is attributable to
  model/runtime compatibility; the same error reproduces in the exact repeat; and
  it is not caused by missing files, wrong paths, bad hashes, container
  construction, or input generation.
- **`INCONCLUSIVE_ENVIRONMENT`** — control cannot execute; or Docker cannot build
  reproducibly; or the package version cannot be pinned; or the environment
  cannot run the declared architecture; or model/input integrity cannot be
  established; or the runtime inventory is incomplete.
- **`INCONCLUSIVE_OUTPUT`** — treatment initializes and exits but produces no
  valid TSV; or produces incorrect or empty text on the trivial positive
  sentinel; or repeat output is nondeterministic; or treatment times out without
  a clear compatibility error; or compatibility cannot be separated from another
  failure.

A wrong synthetic transcript is **not** `INCOMPATIBLE_FLOAT_MODEL`. A successful
load with nondeterministic output is **not** `COMPATIBLE`. **Nondeterminism
overrides compatibility.**

## Preflight gates

Branch based on merged PR #208; PR #195 untouched; production and fixture files
unchanged; the existing retrieval script succeeds; both model hashes and sizes
verified; synthetic image hashes verified; Docker base and runtime identities
verified; the inference container has no network; no corpus or truth directory
mounted; all invocation parameters identical except the traineddata directory;
this preregistration frozen and hashed. **Any mismatch stops the run.**

## Interpretation boundaries

A `COMPATIBLE` result establishes only that native Tesseract can execute the
pinned float model in this pinned research container, and that the stack is
eligible for a **separately preregistered** corpus experiment.

It does not establish better Brand accuracy, lower CER, better stylized-logotype
recognition, production suitability, acceptable Render performance, acceptable
latency under real load, production determinism, a Tesseract capability ceiling,
or authorization to modify the production engine.

An incompatible or inconclusive result does not establish that native Tesseract
generally cannot run `tessdata_best`. It applies only to the pinned
runtime/environment tested.

If Docker runs amd64 through emulation on an ARM host, latency and memory figures
are **diagnostic only** and must not support a production-performance claim.

## What this authorizes

Nothing beyond producing this compatibility verdict. Not production
installation, not production Dockerfile changes, not Render configuration
changes, not corpus OCR, not a production engine factory, not replacing
Tesseract.js, not a modern alternative recognizer, and not shadow deployment.
