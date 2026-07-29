# Contamination audit

What was eliminated mechanically, and what could not be. Written by the packet
builder, about the packet builder.

## Builder contamination status: CONTAMINATED

The session that built this packet has already seen:

- the Phase 2 first-failure classes and their counts (3 / 5 / 2);
- which specific cases carry which class;
- the four null preprocessing results from PRs #197-#200;
- the glyph-ceiling hypothesis and the arguments for and against it;
- the Brand truth strings for all 10 cases.

It is therefore **not an eligible sole annotator** for either audit. It may build
tooling and validate blinding, which is what it did. This follows the precedent
already established in this repository by the blind brand-truth review, where
prior exposure to disputed material disqualified a reader.

## Eliminated, and mechanically proven

`validate-issue-149-brand-mechanism-packet.mjs` asserts, and 11/11 checks pass:

| Leak vector | Status |
| --- | --- |
| Original case IDs in reader file contents | eliminated |
| Original case IDs in reader filenames | eliminated (salted-hash `item-<8hex>` ids) |
| Brand truth strings | eliminated |
| OCR transcripts / machine-selected candidates | eliminated |
| Prior failure-class label names | eliminated |
| Unblinding key inside the packet | eliminated (stored outside `reader-packet/`) |
| Item ordering correlating with case identity | eliminated (sorted by salted hash, not case id) |
| Packet drift between build and annotation | eliminated (per-file + manifest hashes, deterministic rebuild) |

## NOT eliminated — irreducible limitations

### 1. The audit split itself encodes the prior classification

This is the most important residual leak. Audit A contains exactly the 5 cases
previously classed `ORIENTATION_OR_SEGMENTATION_FAILURE`; Audit B contains
exactly the 5 previously classed no-text or severe-glyph. A reader is told which
audit each item belongs to, because the two rubrics differ. A sufficiently
motivated reader could infer that the sets were pre-sorted by some earlier
judgement, even though they are never told what that judgement was or which
answer it favours.

This cannot be removed while preserving the specified 5-geometry / 5-typography
design.

**Available mitigation, not applied here:** shuffle all 11 reader items into one
pool and ask **both** rubrics of **every** item. That removes the split entirely
and yields a strict superset of the required answers, at the cost of roughly
doubling annotator effort. If the operator prefers maximum blinding over reader
effort, rebuild with that variant before annotation. The builder did not make
this change unilaterally because it alters the design the operator specified.

### 2. Rubric wording is not outcome-neutral in the strictest sense

The geometry rubric names two competing mechanisms and a tie-breaker. A reader
who thinks about why they are being asked could guess that the two labels
correspond to two competing hypotheses. Nothing tells them which hypothesis any
answer supports, or which is currently favoured, and the instructions state that
no answer is expected and no answer counts are fixed.

### 3. Crop provenance is visible in principle

Reader images are byte-identical copies of committed crops from
`artifacts/issue-149-brand-otsu-threshold/control/crops`. A reader with
repository access could hash a reader image and match it back to its original
filename, unblinding themselves. The instructions forbid consulting the
repository during annotation, but this is a policy control, not a technical one.
An air-gapped annotator, or one given only the packet directory, is not exposed
to this.

### 4. Product recognizability

Some crops may show recognizable commercial marks. A reader may recognize a
product and thereby infer its brand text. The instructions ask readers not to
search and not to let recognition influence answers, but neither audit's rubric
depends on knowing the text, which limits the practical impact.

### 5. Single-reader risk is unresolved by this PR

Nothing here guarantees two independent readers. If only one annotator is
available, inter-rater agreement cannot be computed, and per the plan the
resulting labels must be recorded as provisional rather than adjudicated.

### 6. One case overlaps the Alcohol work

`approved-wine-023` appears in Audit A and is also one of the six governed
`LOW_CONFIDENCE` Alcohol cases from PR #203. The fields are independent — that
work concerned the Alcohol statement, this concerns the Brand mark — so no
answer transfers between them. Recorded here for completeness, not because a
leak is expected.

## Builder defect found and fixed during construction

The first version of the builder called `rmSync` on the entire output directory
before regenerating. That silently deleted hand-authored governance documents
(this file among them) on the second build. It was caught because the documents
were written, then a rebuild was run for formatting, and they vanished.

The builder now clears only `reader-packet/` and an explicit list of generated
files, leaving hand-authored material intact. Recorded here because a build step
that can destroy its own audit trail is exactly the kind of defect this program
is supposed to surface rather than quietly repair.
