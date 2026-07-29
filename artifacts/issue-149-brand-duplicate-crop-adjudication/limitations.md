# Limitations — duplicate Brand crop adjudication

Evidence and adjudication only. No OCR, no fixture change, no fixture truth
change, no production change, no prior frozen artifact altered. PR #195
untouched.

## The crop-recompute logic is a mirror, not the function itself

`cropFor` in `src/fixtures/ocr-research/experiment.ts` is not exported, so the
governed crop rectangle was reimplemented in the adjudication script. A mirror
can drift from its original.

That risk was addressed rather than assumed away: **all eleven** governed Brand
crops were recomputed and compared against their committed bytes, and all eleven
reproduce byte-for-byte. A mirror that disagreed with the real function would
have to disagree identically on eleven different images and geometries to pass
that check. It remains a mirror, and a future change to `cropFor` would not
propagate to it.

## Only crop geometry was recomputed, not the full preprocessing chain

The comparison stops at the extracted crop. Scale, grayscale, normalisation, and
every later preprocessing stage were not re-run, because the duplication being
adjudicated is a crop-level fact. Nothing here speaks to whether downstream
preprocessing behaves identically on the two cases.

## Design-level independence is a visual judgment

The finding that `approved-wine-005` shares the same Brand design as the
adjudicated pair comes from looking at the recomputed crops, not from a hash or
any automated measure. It is recorded as a caution for sizing the later
experiment, and should not be cited as mechanical evidence. Only the pixel-level
facts — identical crops, identical rectangles, differing sources — are
hash-backed.

## Sample of one pair

This adjudicates one duplicate pair in one governed corpus. The corpus-wide
recompute found no other duplicate crop and no stale artifact among the eleven,
which is reassuring but is not a general guarantee about fixture hygiene
elsewhere in the repository.

## The shared-template explanation is inferred from pixels, not from records

No acquisition record states that these two labels were printed from a shared
template. That explanation is inferred from the pixel evidence: identical Brand
region, 8% of the label differing elsewhere, different varietal text and
barcodes. It is the explanation the evidence best supports, not a documented
provenance fact. If the underlying artwork history matters for a later claim, it
needs a source outside this repository.

## Legacy case identity rests on the legacy manifest

The conclusion that `la-fattoria-rotated` is an alias for the
`approved-wine-003` image — rather than a stray duplicate registration — rests on
that image having no other case ID in `src/fixtures/eval/eval-manifest.json`.
That is a strong signal but it is an argument from absence within one file.

## Truth was consulted, narrowly

Brand truth was read once, after all crop evidence was fixed, and only to
confirm case identity. It did not influence crop generation, hashing, pixel
comparison, or the classification. The classification would be identical with
truth withheld entirely — every input to it is a pixel or a hash.

## What this does not settle

- It does not revisit the blinded reader's labels or their provisional status.
- It does not change the historical 5/5 case-level stylization result.
- It does not determine whether four distinct crop images across three distinct
  designs is *enough* for the later traineddata comparison. It determines only
  what those numbers are. Whether that corpus can support any conclusion remains
  a separate, unanswered question — and on this evidence the honest expectation
  is that it is small.
