# Limitations

## This PR produces no findings

It contains a packet and validation tooling. There are no labels, no OCR, no
treatment, and no conclusion. Nothing here supports any claim about Brand
failure mechanisms.

## Sample size

Audit A covers 5 cases. Audit B covers 5 cases (6 reader items). Neither can
support a rate, a prevalence estimate, or a population-level claim about the
governed corpus, let alone about production. The outputs are a mechanism map for
ten specific cases.

## The stylization audit cannot establish a capability ceiling

Even a 5-of-5 stylized result would only keep the stylization hypothesis alive
for these cases. A Tesseract capability-ceiling claim additionally requires a
stronger-traineddata comparison to fail first, plus a corpus far larger than
this one. That comparison has not been run.

## The geometry rubric is a suspicion, not a mechanism

`ORIENTATION_SUSPECTED` and `SEGMENTATION_SUSPECTED` record what a human
believes the geometry shows. Neither is validated by intervention. Only a
subsequent mechanism-matched OCR experiment could show whether a case so
labelled is actually fixable by the matched treatment.

## Inherited Phase 2 assumptions

The frozen case set and its 5/5 split come from the Phase 2 classification. If
that classification mis-assigned a case, this packet faithfully inherits the
error. These audits can revise the *sub*-label within a class; they cannot
detect that a case was placed in the wrong class to begin with.

## Multi-region case

`wine-multi-artifact-04` contributes two reader items. The preregistered
aggregation rule may reduce Audit B's denominator from 5 to 4 if the two regions
receive conflicting verdicts.

## Blinding is strong but not absolute

See `contamination-audit.md`. The audit split itself encodes the prior
classification, and that could not be removed within the specified design. Crop
provenance is technically traceable by a reader with repository access; the
control there is policy, not mechanism.

## Annotator availability is unresolved

Whether two independent readers, one reader, or an isolated model session will
annotate is not settled by this PR. With a single reader, inter-rater agreement
is unavailable and labels are provisional.
