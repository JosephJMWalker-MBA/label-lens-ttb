# Visual-support review protocol

Refs Issue #149. Frozen before inference. This protocol governs a review that may
begin **only after** all twelve Arm B raw outputs are written and hashed and truth
has been revealed.

## Purpose

To answer a question that exact-match scoring cannot: when PP-OCRv6 emits text
that does not match the Brand truth, **is that text visibly present in the crop at
all?** A wrong transcript that reads glyphs actually on the label is a different
failure from one that invents them.

This is diagnostic. It feeds the `REGRESSION` condition
`severeRepeatedUnsupportedOutput` and nothing else. It produces no metric that
enters the primary comparison.

## Sequencing

1. All twelve Arm B outputs are written and hashed into `raw-output-manifest.json`.
2. Truth and cluster identities are loaded.
3. Only then does this review begin.

The review is therefore **unblinded by construction**. That is recorded honestly
rather than described as blind: the reviewer has already seen the truth string and
the exact-match result when judging visual support.

## Classification

Each of the six Arm B primary outputs is classified exactly once:

| Class | Meaning |
| --- | --- |
| `FULLY_VISUALLY_SUPPORTED` | Every character of the output corresponds to glyphs legibly present in the crop. |
| `PARTIALLY_VISUALLY_SUPPORTED` | Some of the output corresponds to visible glyphs and some does not. |
| `NOT_VISUALLY_SUPPORTED` | No meaningful part of the output corresponds to glyphs visible in the crop. |
| `UNADJUDICATED` | The reviewer cannot decide with the available evidence, or the crop is too degraded to judge. |

**`UNADJUDICATED` is a first-class outcome.** It must be used rather than guessing,
and a package in which several items are `UNADJUDICATED` is a more honest package
than one in which they were forced into a class.

## Evidence requirement

`NOT_VISUALLY_SUPPORTED` may be assigned **only after direct inspection of the
frozen crop pixels** for that item. Where meaningful inspection is unavailable —
the crop is illegible at the available resolution, the reviewer cannot locate the
region the output would have come from, or the evidence simply does not settle the
question — the item is `UNADJUDICATED`.

Visual support is **never** inferred from the transcript, from the truth string,
from the confidence score, or from the fact that another item in the same cluster
was judged unsupported. Each of the six primary outputs is judged on the pixels.

## Feeding `severeRepeatedUnsupportedOutput`

Only the **primary** output of each item is classified. Repeats contribute nothing
additional, because a deterministic repeat carries no independent visual evidence.

The `REGRESSION` condition `severeRepeatedUnsupportedOutput` is true **only when**
primary outputs are `NOT_VISUALLY_SUPPORTED` in **at least two distinct crop
clusters** spanning **at least two distinct Brand designs**.

Counting, in full:

- primary and repeat of one item count **once**;
- the byte-identical C1 crop counts **once**, so `approved-wine-004` and
  `la-fattoria-rotated` can never contribute two clusters between them;
- multiple OCR items in one crop cluster count **once**, so
  `wine-multi-artifact-04`'s two regions cannot contribute two clusters;
- multiple items in one Brand design count **once**;
- `PARTIALLY_VISUALLY_SUPPORTED` does **not** satisfy the condition;
- `UNADJUDICATED` does **not** satisfy the condition;
- truth mismatch alone **never** establishes non-support.

Both thresholds must be met at once. One unsupported item cannot trigger the
condition, and neither can several unsupported items confined to a single Brand
design.

## Governing rule

**Truth mismatch alone does not establish unsupported text.** An output may be
completely wrong against the Brand truth while being a faithful reading of other
text in the crop, of a stylised ligature, or of a partially occluded word. The
question is what is on the label, not what the truth string says.

Equally, an output that *matches* truth is not automatically
`FULLY_VISUALLY_SUPPORTED` — it is classified on the same evidence as every other
item.

## Recorded per item

- `opaqueItemId` and the resolved OCR item;
- the raw transcript being judged;
- the classification;
- **reviewer identity**;
- `unblinded: true`, with the point at which truth was revealed;
- free-text notes describing which glyphs were and were not located;
- an explicit **uncertainty** statement — what the reviewer could not determine,
  and what would have resolved it.

## Limits stated in advance

- One reviewer, six items, no second independent adjudication, no inter-rater
  agreement. The result is a single person's judgement and is reported as such.
- The reviewer is not independent of this experiment.
- No claim of reproducibility is attached to these classifications.
- The classifications are **not** used to adjust any transcript, any metric, any
  CER, or any per-item classification.
