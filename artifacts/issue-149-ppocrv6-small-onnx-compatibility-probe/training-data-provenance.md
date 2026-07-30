# Training-data provenance — PP-OCRv6_small_rec_onnx

**Status: UNRESOLVED.** `trainingDataProductionReviewRequired = true`.

## What is known

The ONNX artifact is an export of the PP-OCRv6 small recognition checkpoint. The
PP-OCRv6 technical report (arXiv:2606.13108) describes the training corpus for
the model family in general terms — synthetic text corpora and public scene-text
datasets, plus web-sourced multilingual data. The model card at the pinned
revision does not enumerate a dataset list, does not name dataset versions, and
does not state per-dataset licence terms.

## What is not known

- Which exact datasets, at which versions, produced **this** checkpoint.
- The licence terms of each constituent dataset, and whether any of them
  restricts commercial use.
- Whether any training image was scraped without a licence permitting
  redistribution of derived weights.
- Whether any regulated label imagery — the domain this product operates in —
  appears in the training data.

None of this is inferable from the artifact, and none of it is inferable from the
Apache-2.0 licence on the weights: a permissive licence on a checkpoint says
nothing about the provenance of the data that produced it.

## Why the probe proceeds anyway

The owner has confirmed that unresolved training-data provenance is acceptable
for a **non-production** probe. This probe:

- loads the model in an isolated research container,
- runs it on two synthetic images generated in that container,
- never touches the governed corpus or any fixture truth,
- produces no production artifact and changes no production code.

## What must happen before any production use

A production review that establishes the dataset inventory and its licence terms.
Until that review exists and concludes, `trainingDataProductionReviewRequired`
remains `true`, and a `COMPATIBLE` verdict from this probe does not and cannot
authorise production integration, shadow deployment, or engine replacement.
