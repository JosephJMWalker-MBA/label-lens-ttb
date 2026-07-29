# Eligibility rationale — why the governed crop benchmark is now authorized

Refs Issue #149. Evaluation-only.

## The prior verdicts stand, unchanged

The three synthetic-probe attempts keep their formal verdicts exactly as
recorded. Nothing here relabels any of them, and in particular **no prior
attempt is relabelled `COMPATIBLE`**.

| Attempt | Verdict | Preserved |
| --- | --- | --- |
| 1 (authoring host) | `INCONCLUSIVE_ENVIRONMENT` | yes |
| 2 (GH native amd64) | `INCONCLUSIVE_OUTPUT` | yes |
| 3 (GH native amd64) | `INCONCLUSIVE_OUTPUT` | yes |

## What Attempt 3 did establish

- The pinned native Tesseract 5.3.0 runtime **loads and executes** both the
  integer-quantized control model and the pinned float `tessdata_best` model.
- Both models produced **valid, deterministic, schema-conformant TSV** with text,
  confidence, and bounding boxes.
- **No** ABI, loader, traineddata, unsupported-model, timeout, or process failure
  occurred in any of the eight invocations, and every primary/repeat pair was
  raw-byte identical.

## Why that is sufficient for this benchmark

Attempt 3's blocking condition was that the recognizer did not reproduce a
custom synthetic typeface exactly — `LABEL LENS 123` came back as
`LHEEL LENS 124`. That is a **synthetic-accuracy** requirement, not an
**execution-compatibility** requirement.

Execution compatibility is what a crop benchmark actually depends on: the runtime
must load the model, run to completion, and emit parseable structured output with
geometry and confidence. Attempt 3 demonstrated exactly that, twice per arm,
deterministically.

Recognition accuracy on real governed Brand pixels is the question this new
benchmark exists to measure. It would be circular to require a synthetic accuracy
demonstration as the gate for measuring accuracy.

## Owner-authorized determination

Native runtime and model execution are **sufficiently established** to authorize
this separately preregistered crop benchmark.

This determination:

- does **not** alter the frozen Attempt 3 verdict;
- does **not** convert Attempt 3 into a `COMPATIBLE` result;
- does **not** authorize production replacement, shadow mode, or any production
  change;
- is recorded as an eligibility decision, distinct from any experimental verdict.

## No further synthetic-sentinel attempt

No Attempt 4 of the synthetic probe is conducted. The hand-built rectangle
typeface that blocked Attempts 2 and 3 is retired from this line of work rather
than iterated on; the remaining open question about it is documented in Attempt
3's limitations and is not pursued here.
