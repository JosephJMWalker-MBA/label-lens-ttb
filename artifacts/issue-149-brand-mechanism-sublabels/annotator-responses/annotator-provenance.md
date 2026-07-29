# Annotator provenance

- annotatorId: blinded-annotator-A
- role: independent blinded annotator
- completedOn: 2026-07-28
- audits completed: Audit 1 (geometry, 5 items), Audit 2 (typography, 6 items)
- order: Audit 1 completed and recorded before Audit 2 was begun; Audit 1 answers were not revised afterwards.

## Prior-exposure declaration

- prior exposure to Issue #149: no
- prior exposure to PRs #197–#204: no
- prior exposure to Brand truths or OCR transcripts: no
- repository access during annotation: no
- external search performed: no

## Materials used

Only the supplied reader packet:

- `reader-packet/reader-instructions.md`
- `reader-packet/geometric-response-template.json`
- `reader-packet/stylization-response-template.json`
- `reader-packet/images/` (11 PNGs)
- `reader-packet/reference-lines/` (5 PNGs)

No other file in the repository was opened. Specifically not consulted:
`anonymization-map.json`, `case-freeze.json`, `contamination-audit.md`,
`preregistration.md`, any prior artifact or OCR output, and any Git history,
commit message, branch name, or pull request.

## Processing applied to the images

Six of the supplied PNGs are small (102–386 px wide). Those were upscaled 4x with
`sips` (Lanczos-style resampling, no cropping, rotation, colour change, or other
edit) purely to make stroke edges and the dashed reference lines legible at
viewing size. Upscaled copies were written to a session scratchpad outside the
repository and were derived only from the packet images. All judgements are of
the packet images as supplied.

## Method

- Audit 1: for each item the plain image was viewed first, then the
  reference-lines copy. Baseline angle was estimated by comparing the run of
  x-height glyph bottoms against the dashed horizontals, and reported as degrees
  from horizontal. Letter-stem slant was treated as typographic style, not as
  baseline rotation. Labels were assigned by the stated decision rule only.
- Audit 2: each item was scored on the seven listed visual attributes
  independently, then an overall stylization judgement was recorded.
- No text was transcribed, no product or company was identified or looked up, and
  no rationale references anything beyond visible geometry or letterform
  appearance.

## Self-reported limitations

- `item-178774e8`, `item-d490b7c1`, and `item-b648b866` are low-resolution crops;
  confidence on those is capped at medium accordingly.
- Several items appear to show closely related renderings of the same design at
  different framings. Each item was scored on its own visible content; no
  cross-item consistency was enforced and no grouping was inferred.
- `item-2b2a2bcd` and `item-f7d08e38` presented as visually indistinguishable
  crops. They were scored separately, in the order listed in the template.
