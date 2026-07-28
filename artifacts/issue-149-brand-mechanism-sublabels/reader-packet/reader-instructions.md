# Reader instructions

You are reviewing cropped images of text taken from beverage-container labels.
Please answer only from what you can see. Two independent audits are included.
Complete them in order and do not revise Audit 1 after starting Audit 2.

Do not search for these images, look up any product, or try to identify a
company or product name. If you happen to recognize one, that must not influence
your answers. There is no expected or preferred answer for any item, and the
counts of each answer are not fixed.

## Audit 1 — geometry (5 items)

Use `images/<itemId>.png`. A copy with neutral dashed horizontal reference
lines is in `reference-lines/<itemId>.png` to help judge angles; the lines carry
no meaning beyond marking true horizontal.

Assign exactly one label per item:

- `ORIENTATION_SUSPECTED` — the visible text baseline deviates more than 15
  degrees from horizontal, or the text runs vertically / top-to-bottom.
- `SEGMENTATION_SUSPECTED` — the text is upright within 15 degrees, but is
  visually fragmented, split, curved, or grouped in a way that could plausibly
  confuse an automatic reader trying to group it into lines and words.
- `AMBIGUOUS_SUBLABEL` — appearance alone cannot distinguish the two.

Also record your estimated baseline angle from horizontal, your confidence, and
a one-line rationale based only on what you see.

Record answers in `geometric-response-template.json`.

## Audit 2 — typography (6 items)

Use `images/<itemId>.png`. For each item record Y or N for:

- decorative script
- condensed or expanded lettering
- custom logotype
- outline or shadow
- arched or curved baseline
- unusual ligature
- extreme texture or contrast effect

Then record an overall `stylized` Y/N, your confidence, and a one-line
rationale. Judge only visual appearance.

Record answers in `stylization-response-template.json`.

## Please do not

- Guess what the text says and answer based on the guess rather than appearance.
- Consult any other file in this repository, any prior analysis, or any tool
  output while annotating.
- Discuss the items with anyone who has worked on this project before your
  responses are saved.
