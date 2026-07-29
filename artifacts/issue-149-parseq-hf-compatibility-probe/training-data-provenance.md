# Training-data provenance — recorded separately and unresolved

Refs Issue #149. This is a due-diligence record, not a clearance.

## What the model card states

The official model card for `baudm/parseq-small` at the pinned revision states
that the model was pre-trained on various **real** scene-text-recognition
datasets, linking to the upstream `Datasets.md`. The corresponding GitHub release
enumerates the training corpora as COCO, RCTW17, Uber, ArT, LSVT, MLT19, ReCTS,
TextOCR and OpenVINO.

## The concern

Some datasets in that family are distributed under research-only or otherwise
restricted terms. Where that is the case, the terms attach to the **data**, and
their effect on downstream commercial use of a model trained on that data is a
separate legal question from the licence on the model artifact itself.

## What this probe does and does not settle

**Settles:** the selected model artifact carries an explicit Apache-2.0 grant, in
the author's namespace, in the same commit that introduced the weights, with hash
and size attested. See `license-audit.md`.

**Does not settle:** whether weights trained on those corpora may be used in a
**regulatory compliance product** sold or operated commercially. This probe made no
attempt to enumerate each dataset's terms, and reaching a conclusion would require
legal review rather than engineering verification.

## Standing rule

`trainingDataProductionReviewRequired = true`.

**No production promotion may rely solely on this compatibility PR.** A
`COMPATIBLE` verdict here would establish that the stack runs and that its output
is auditable. It would establish nothing about commercial licensing clearance.

## What must not be inferred in either direction

- Unresolved training-data provenance is **not** grounds to treat the explicit
  model-artifact licence as absent or invalid.
- The explicit model-artifact licence is **not** grounds to treat training-data
  terms as resolved.

Both records stand side by side, and the production question stays open until
someone qualified closes it.
