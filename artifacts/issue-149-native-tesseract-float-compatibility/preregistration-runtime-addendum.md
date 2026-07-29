# Preregistration runtime addendum — Attempt 2 execution host and package pins

`preregistration.md` is **unchanged and still hash-pinned** at
`ad905275e2727aaeb0c266e3f4ca5ca2b6f5aa6490b2b8222a48bbae3f45c43b`. Nothing in it
was rewritten. This addendum is written **before any OCR runs** and freezes only
the facts that the frozen document listed as unresolved, plus the execution host.

Attempt 1 stands unchanged: `INCONCLUSIVE_ENVIRONMENT` on the authoring host,
because no container runtime was available there. That result is not retracted
and is not made false by anything here.

## Transport change, not a treatment change

The design specified `workflow_dispatch`. GitHub only dispatches
`workflow_dispatch` workflows that exist on the **default branch**, and this
experiment must not modify `main`:

```
HTTP 404: workflow issue-149-native-tesseract-probe.yml not found on the default branch
```

Execution therefore moved to a push-triggered workflow scoped to this single
research branch, with the phase selected by a committed mode file and a path
filter admitting only the workflow file and that mode file. Discovery and
execution still cannot run in one invocation, an ordinary code or artifact commit
cannot retrigger OCR, and `pull_request_target` is not used.

**This is a transport change only.** Moving execution hosts does not alter the
experimental treatment: the synthetic PNG bytes, model identities and hashes, base
image digest, target architecture, OEM, PSM, DPI, locale, thread limits,
invocation matrix, timeout, container hardening, and verdict rules are all
byte-for-byte the ones already frozen. The treatment is a property of the model
and runtime under test, not of the machine that starts the container.

## Execution platform — frozen

| Field | Value |
| --- | --- |
| Platform | GitHub-hosted runner, `ubuntu-latest` |
| Runner OS / arch | Linux / X64 |
| Runner image | `ubuntu24`, version `20260720.247.2` |
| Kernel | `6.17.0-1020-azure` |
| `uname -m` | `x86_64` — **native amd64, no emulation** |
| CPU | AMD EPYC 7763 64-Core Processor, 4 vCPU |
| Memory | 16,766,423,040 bytes |
| Docker client / server | 28.0.4 / 28.0.4 |
| Discovery run | `30474266684` |

Because the runner is native `linux/amd64`, latency and memory may be reported as
measurements **for that runner**. They remain diagnostic and do not establish
Render production performance.

## Base image — unchanged

| Field | Value |
| --- | --- |
| Image | `node:22-bookworm-slim` |
| Manifest-list digest (pinned in the Dockerfile) | `sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3` |
| linux/amd64 manifest digest | `sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27` |
| Resolved amd64 image ID on the runner | `sha256:bd16adabad7619222d4d0ab2d61f48391dacde03ad93f54d344683e326cbd0e2` |
| Repo digest confirmed on pull | `node@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3` |
| Debian version inside base | 12.15 |
| Target platform | `linux/amd64` |

## Package pins — frozen, discovered not guessed

Package **names** were resolved from `apt-cache depends` inside this exact pinned
base, and versions from `apt-cache policy` in the same container. The runtime
Leptonica package in bookworm is `liblept5` — the earlier Dockerfile draft had
guessed `libleptonica-dev`, and discovery corrected it. `/usr/bin/time` is **not**
present in the base, so the `time` package is installed and pinned too.

| Purpose | Package | Version |
| --- | --- | --- |
| Tesseract CLI | `tesseract-ocr` | `5.3.0-2` |
| Tesseract library | `libtesseract5` | `5.3.0-2` |
| Leptonica | `liblept5` | `1.82.0-3+b3` |
| Resource measurement | `time` | `1.9-0.2` |

All four are supplied as build args with **no defaults**, so the image fails
closed rather than floating any version.

## Unchanged model, input, and configuration hashes

| Item | sha256 | Bytes |
| --- | --- | --- |
| Control model `src/pipeline/extractor/assets/eng.traineddata` | `5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747` | 5,199,098 |
| Treatment model (untracked cache) | `8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba` | 15,400,601 |
| `synthetic/positive.png` | `bfba28eec8422a5e1dc69a6e3e6aefdfaa4f68a71cae85d385d9877d88a0e2ab` | 3,251 |
| `synthetic/blank.png` | `8b5531768177d1a62c9e7780a1edfd5231f46681a474ad359313a979aa4d3e9d` | 1,391 |

Invocation parameters, unchanged: language `eng`, OEM `1`, PSM `11`, DPI `300`,
canonical output TSV, `LC_ALL=C`, `LANG=C`, `OMP_THREAD_LIMIT=1`,
`OMP_NUM_THREADS=1`, timeout 120 s, 1 CPU, 2 GB, `--network=none`, read-only model
and input mounts, no repository root mounted, no corpus or fixture path mounted.

## Unchanged eight-invocation matrix

`control x {positive, blank} x {primary, repeat}` and
`treatment x {positive, blank} x {primary, repeat}`.

No retries beyond the preregistered exact repeat. No altered settings after a
failure. No third tie-breaker run.

## Verdict rules

Unchanged and unmodifiable: `COMPATIBLE`, `INCOMPATIBLE_FLOAT_MODEL`,
`INCONCLUSIVE_ENVIRONMENT`, `INCONCLUSIVE_OUTPUT`, with the same conditions and
the same precedence. Nondeterminism overrides compatibility. A wrong synthetic
transcript is not `INCOMPATIBLE_FLOAT_MODEL`. Thresholds and interpretations are
not revisited after results exist.
