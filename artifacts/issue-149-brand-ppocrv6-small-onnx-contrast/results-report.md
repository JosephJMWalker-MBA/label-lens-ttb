# Results — PP-OCRv6-small ONNX versus frozen incumbent Tesseract Brand evidence

Evaluation-only. Verdict computed from the frozen gates, not asserted.

## Verdict: `REGRESSION`

**Reason: a distinct Brand design regressed — D1.** That single condition is
sufficient on its own under the frozen decision rules, and it is not weighed
against the improvements elsewhere.

| KEEP condition | Met |
| --- | --- |
| at least one distinct crop cluster improves | ✅ C2, C3, C4 |
| at least one distinct Brand design improves | ✅ D2, D3 |
| **no distinct Brand design regresses** | ❌ **D1 regressed** |
| all twelve PP-OCRv6 runs complete | ✅ |
| every primary/repeat pair is byte-deterministic | ✅ |
| no unexplained runtime failure | ✅ |
| all source and model hashes verify | ✅ |
| truth isolation passes | ✅ |
| no concealed confidence or abstention assumption | ✅ |
| known output risks are reported | ✅ |

`severeRepeatedUnsupportedOutput` is **false** — zero outputs were classified
`NOT_VISUALLY_SUPPORTED`, against a threshold of two crop clusters spanning two
designs. The regression comes entirely from the design-level primary metric.

## The twelve transcripts

| Item | Primary | Repeat | Identical |
| --- | --- | --- | --- |
| `approved-wine-004` | `FALLORA` | `FALLORA` | ✅ |
| `approved-wine-005` | `TATTORIA` | `TATTORIA` | ✅ |
| `approved-wine-031` | `embeleso` | `embeleso` | ✅ |
| `la-fattoria-rotated` | `FALLORA` | `FALLORA` | ✅ |
| `wine-multi-artifact-04-region-1` | `Celthr` | `Celthr` | ✅ |
| `wine-multi-artifact-04-region-2` | `Dry Cellar` | `Dry Cellar` | ✅ |

All six pairs are identical byte-for-byte on the raw probability tensor and exact
on every sequence field, the transcript and the fingerprint.

## Item level, primary metric (whitespace-free)

| Item | Truth | Arm A | CER | Arm B | CER | Class |
| --- | --- | --- | --- | --- | --- | --- |
| `approved-wine-004` | La Fattoria | `Lo FAT TORIA` | 0.10 | `FALLORA` | 0.50 | **REGRESSION** |
| `approved-wine-005` | La Fattoria | `0 —_ GATT ORIA` | 0.40 | `TATTORIA` | 0.30 | IMPROVEMENT |
| `approved-wine-031` | embeleso | `enheesO` | 0.375 | `embeleso` | **0.00** | IMPROVEMENT |
| `la-fattoria-rotated` | La Fattoria | `Lo FAT TORIA` | 0.10 | `FALLORA` | 0.50 | **REGRESSION** |
| `wine-multi-artifact-04-region-1` | Dry Cellar | `EA,` | 0.78 | `Celthr` | 0.56 | IMPROVEMENT |
| `wine-multi-artifact-04-region-2` | Dry Cellar | `Colles Dig` | 0.89 | `Dry Cellar` | **0.00** | IMPROVEMENT |

Four improvements, two regressions. The two regressions are the same crop: C1's
pixels are byte-identical across `approved-wine-004` and `la-fattoria-rotated`,
so under the frozen counting rules they are **one** crop cluster, counted once.

## Why D1 regressed, stated plainly

On the C1 crop, Tesseract returned `Lo FAT TORIA`. Fragmented, wrong as a
transcript — but once whitespace is stripped it becomes `lofattoria`, which is one
character from the truth and **contains the whole useful token `fattoria`**.
Useful-token recall 1.0, CER 0.10.

PP-OCRv6 returned `FALLORA`: a single clean word, no fragmentation, and no truth
token at all. Recall 0, CER 0.50.

**The incumbent's messiness preserved the answer; the candidate's tidiness lost
it.** That is a real result and it is what the primary metric is designed to
catch. It also survives on the secondary boundary-preserving metric (0.18 vs
0.55), so it is not an artifact of the whitespace-free choice.

## The space capability is demonstrated, not merely claimed

`wine-multi-artifact-04-region-2` returned **`Dry Cellar`** — a
**boundary-sensitive exact match**, the first one anywhere in this Issue #149
sequence. The emitted ASCII space is token 18,709, exactly the class the
discovery arithmetic predicted before any inference ran, and the visual review
confirms a real word gap at that position in the crop.

PR #214's PARSeq arm could not have produced this: its charset has no space. That
capability difference is now evidenced on a real Brand crop rather than on a
synthetic sentinel.

## Cluster level

| Unit | Result |
| --- | --- |
| Crop clusters | C1 REGRESSION · C2, C3, C4 IMPROVEMENT |
| Brand designs | **D1 REGRESSION** · D2, D3 IMPROVEMENT |
| Historical cases | 2 regression · 3 improvement |
| Distinct pixel sets | 1 regression · 4 improvement |

Every item-level classification is published in `per-item-results.json`. No
average is reported that could conceal the C1 regression.

## Arm A recomputation cross-check

All six items match PR #214's published values on all ten compared fields.
Recomputing Arm A through this experiment's scorer reproduces the earlier
benchmark exactly, so the two are directly comparable and no discrepancy had to
be adjudicated.

## Confidence: reported, uninterpreted

| Item | plan-defined | upstream-collapsed | Correct? |
| --- | --- | --- | --- |
| `wine-multi-artifact-04-region-2` | 0.9609 | 0.9636 | ✅ |
| `approved-wine-031` | 0.9095 | 0.9095 | ✅ |
| `approved-wine-005` | 0.8628 | 0.8540 | ❌ |
| `wine-multi-artifact-04-region-1` | 0.7277 | 0.7238 | ❌ |
| `approved-wine-004` | 0.6426 | 0.6426 | ❌ |
| `la-fattoria-rotated` | 0.6426 | 0.6426 | ❌ |

`scoreOrderingRisk` is **false** under both frozen definitions: every correct
output scored above every wrong one.

**This does not license a threshold, and none is derived.** Six items, two of
them correct, two of them byte-identical duplicates — the effective sample behind
that clean separation is *two* correct readings against *three* distinct wrong
ones. A gap that survives n=6 says nothing about where a boundary would sit, or
whether one exists. `confidenceInterpretationKnown` remains **false**, no score is
compared numerically with Tesseract confidence, and the false-reliable-read result
remains `NOT_ASSESSABLE_NO_CALIBRATED_AUTHORITY_MAPPING` — **not zero**.

## Visual support

Two `FULLY_VISUALLY_SUPPORTED`, four `PARTIALLY_VISUALLY_SUPPORTED`, zero
`NOT_VISUALLY_SUPPORTED`, zero `UNADJUDICATED`.

Four outputs are wrong against truth and **none** is unsupported: every emitted
character traces to lettering visibly present in the crop, with errors that are
substitutions and omissions rather than fabrications. PP-OCRv6 misread this
subset; it did not invent text on it.

The review was single-reviewer, unblinded by construction, and conducted by the
same agent that ran the benchmark. It is the weakest evidence in the package.

## Comparison with PR #214

Both benchmarks return `REGRESSION`, and both for **D1**. The candidates differ in
where they land:

| | PARSeq-small (PR #214) | PP-OCRv6-small (here) |
| --- | --- | --- |
| Exact matches | 1 of 6 | **2 of 6** |
| Boundary-sensitive exact matches | 0 | **1** |
| Improvements | 4 | 4 |
| Regressions | 2 (C1) | 2 (C1) |
| Regressed design | D1 | D1 |
| Verdict | REGRESSION | REGRESSION |

**Two different modern recognizers, from different architecture families, both
fail on the same Brand design and the same crop.** That is the most useful thing
this experiment produced. It points at C1 — the thin-stroke `FATTORIA` inside an
ellipse, at heavy horizontal downscale — as a property of the image rather than
of any one model. Nothing here proves that; it is a hypothesis for a larger
corpus, and this subset cannot test it.

PR #214's conclusion is unchanged and was not reinterpreted.

## What this authorizes

Nothing. A `REGRESSION` verdict authorizes no follow-on work. It does not
authorize production integration, shadow deployment, authority-state changes,
engine replacement, production Python or ONNX Runtime dependencies, an abstention
threshold, broader corpus access, a production-suitability claim, or training-data
clearance. `trainingDataProductionReviewRequired` remains `true`.
