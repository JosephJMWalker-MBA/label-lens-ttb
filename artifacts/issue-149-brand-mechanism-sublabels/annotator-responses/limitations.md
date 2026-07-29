# Limitations — blinded Brand mechanism audit results

Scoped to the results recorded in this directory. The packet-level limitations
in `../limitations.md` and the leak analysis in `../contamination-audit.md`
still apply and are not repeated in full.

## One reader

A single isolated model annotator produced every label here. Inter-rater
agreement cannot be computed from one reader, so none is reported. **All labels
in this directory are provisional pending an independent second reader.** A
5/5 result from one reader is one reader's 5/5.

## The audit split remained a residual leak

The reader was shown audit-specific rubrics: geometry items got the geometry
rubric, typography items the typography checklist. That means the reader knew
the items had been pre-sorted by some earlier judgement, even though nothing told
them what that judgement was, which answer it favoured, or that any answer was
expected. This was known and documented before annotation and could not be
removed within the specified 5-geometry / 5-typography design. The available
mitigation — pool all 11 items and ask both rubrics of each — was not applied.

## Two typography cases share identical pixels

`approved-wine-004` and `la-fattoria-rotated` have byte-identical crops
(`sha256 fab1b411…`), duplicated upstream in
`artifacts/issue-149-brand-otsu-threshold/control/crops`. The case-level 5/5
therefore rests on four distinct images. Both were scored stylized, so the
preregistered band is unaffected, but the five typography cases are **not five
independent observations**. Resolve upstream before any experiment treats them as
two cases.

## Other items appeared visually related

Beyond the confirmed duplicate, the reader noted that several items looked like
the same design at different framings. Each item was scored on its own visible
content and no grouping was inferred, but visual relatedness further reduces the
effective independence of the typography set.

## Low resolution on three items

`item-178774e8`, `item-d490b7c1`, and `item-b648b866` are small crops
(102–267 px wide). The reader capped confidence at medium on all three and said
so. Fine letterform judgements on those items are correspondingly weaker.

## Upscaling was a disclosed viewing aid

Six small crops were enlarged 4x for viewing: enlargement only — no crop, no
rotation, no colour change, no OCR, no external lookup, applied to copies outside
the repository, packet images unmodified. A pure resample adds no information and
changes no geometry; baseline angle, fragmentation, and letterform attributes are
scale-invariant. Disclosed unprompted by the reader. Recorded as a viewing aid,
not a contamination failure.

## Geometry labels are observational

`SEGMENTATION_SUSPECTED` records what the geometry looks like, not what defeated
the recognizer. Nothing here is causal proof. Only a subsequent
mechanism-matched OCR experiment could show whether a case so labelled is
actually fixable by the matched treatment, and 5/5 does not predict that it will
be.

## Stylization labels do not bound recognizer capability

A checklist of visible letterform attributes supports a hypothesis about why
these cases may be hard. It does not establish a Tesseract capability ceiling,
does not show that stylization caused any OCR failure, and does not generalize
past these five cases. No OCR was run in this work at all.

## n=5, twice

Neither audit can support a rate, a prevalence estimate, or any population-level
claim about the governed corpus, let alone about production. Both outputs are
mechanism statements about ten specific frozen cases.

## Inherited Phase 2 assumptions

The frozen case set and its 5/5 split come from the Phase 2 classification. If
that classification mis-assigned a case, these results inherit the error. These
audits revise the *sub*-label within a class; they cannot detect that a case was
placed in the wrong class to begin with.

## Order effects within one session

The reader declared that Audit 1 was completed and recorded before Audit 2
began, and was not revised afterwards. File modification times are consistent
with that order. It is a declaration, not a mechanically enforced separation —
one session answered both audits.
