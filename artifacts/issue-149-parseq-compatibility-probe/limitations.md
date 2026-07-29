# Limitations — PARSeq compatibility and evidence-contract probe

Evaluation-only. No governed Brand crop, fixture, or fixture truth accessed. No
production source, Dockerfile, or application dependency modified. PARSeq not
integrated anywhere. No model weights committed. PR #195 untouched.

## The probe did not run

It stopped at the licensing gate, which by design precedes checkpoint retrieval.
No checkpoint was downloaded, no container was built, no synthetic image was
generated, and none of the four planned inferences ran.

There is therefore **no compatibility verdict**. `BLOCKED_MODEL_LICENSE` is a gate
outcome, not one of the four verdicts, and it says nothing whatsoever about whether
PARSeq would have loaded and run.

## A licensing blocker is not a technical finding

It would be wrong to record this as evidence against PARSeq. The code is
Apache-2.0, the architecture is published, and the author has released Apache-2.0
model cards for adjacent artifacts. Everything observed is consistent with a stack
that would probably have run fine. Nothing here tests that.

Equally, it would be wrong to record the weights as *unlicensed*. The finding is
narrower and more boring: an explicit grant could not be tied to the exact
selected artifact without an inference the gate forbids.

## The gap is a naming and format gap, not an absence of goodwill

The author publishes Apache-2.0 model cards in their own namespace for
`parseq-small` and `parseq-tiny`, whose repository contents are model weights.
That is a real, explicit grant on model artifacts — materially stronger than a
bare code LICENSE.

It just does not name `parseq-bb5792a6.pt`. Accepting it would require bridging
`hubconf.parseq` (documented as the *base* model, `d_model=384`) to the paper's
PARSeq-S to Hugging Face `parseq-small`, and across a container-format change from
`.pt` to `pytorch_model.bin`. Each hop is likely correct. The chain is still an
inference, and the gate exists precisely to stop implementers from making it
quietly.

The most probable reality is that the author intends Apache-2.0 for everything
they publish. "Most probably intends" is not a grant, and for a compliance product
that distinction is the whole point.

## The training-corpus question is separate and also unresolved

The release names COCO, RCTW17, Uber, ArT, LSVT, MLT19, ReCTS, TextOCR and
OpenVINO as training data. Several datasets in that family carry research-only or
non-commercial terms.

Even a clean Apache-2.0 grant on the weights would not settle whether weights
trained on research-only corpora may be used in a regulatory compliance product.
This probe did not attempt to answer that, and resolving the artifact-grant
question would not resolve it either. It is flagged because this repository's
purpose makes it material rather than academic.

## What was genuinely established

Provenance work that survives regardless of the blocker:

- the pinned code revision exists and is the maintained revision, dated 2024-04-24;
- the `v1.0.0` tag targets `315d19be…`, **refuting** the previously reported
  `315d19b8893…`;
- the release asset is published at 95,392,675 bytes;
- the pinned tree contains exactly four licence-bearing files and no model card;
- the intrinsic transform is confirmed **from source** — RGB, resize 32x128
  bicubic, ToTensor, Normalize(0.5, 0.5) — rather than copied from the task
  description.

The design, the evidence contract, and the sequence-score formula are frozen and
reusable, so a follow-up needs no redesign.

## No checkpoint hash exists, and the filename is not one

`checkpoint-provenance.json` records `sha256: null`. The short hash embedded in
the filename (`bb5792a6`) is **not** recorded as an integrity value and is not a
substitute for a full SHA-256. Any follow-up must compute the real hash during an
authorized discovery phase and freeze it before use.

## The evidence contract is unexercised

`evidence-schema.json` and the sequence-score formula are design-only. They were
never populated by a real inference, so the claim that PARSeq's output fits an
honest sequence-only contract without fabricated geometry remains **untested**.
The contract has no geometry fields by construction, which is a design property,
not a validated one.

## Open questions this probe never reached

Two flags stay null and matter for any future integration: whether PARSeq has any
natural abstention behaviour (it produces a transcript for whatever it is given,
including a blank image), and whether its confidence semantics are interpretable
well enough to carry compliance weight. Both are unanswered.

## Nothing is authorized

Not extractor changes, not adding Python to production, not fabricated geometry,
not replacing Tesseract, and not the frozen Brand mechanism benchmark, which
requires a `COMPATIBLE` verdict that does not exist.
