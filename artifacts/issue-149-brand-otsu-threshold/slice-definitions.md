# Preregistered visual-style slices

These assignments are inherited unchanged from merged PRs #198 and #199. They
were frozen before Otsu treatment using only the preserved source crop, crop
dimensions, fixture identity/provenance, existing metadata, and visible layout.
OCR transcript, correctness, candidate state, and confidence are not inputs.

## Definitions

- `thin-stroke:yes`: a material portion of the Brand uses hairline, fine
  script, or fine serif strokes.
- `bold-heavy:yes`: a material portion uses broad, heavy, or filled strokes. A
  mixed design may be both thin and bold.
- Contrast is `low`, `high`, or `mixed` by visible foreground/background
  separation.
- `outline-shadow:present`: glyph outline, drop shadow, or layered text edge is
  visibly material.
- Background is `textured` when pattern, illustration, mottling, compression,
  or tonal texture crosses or closely surrounds the Brand; otherwise `clean`.
- Crop size uses original padded-crop minimum dimension: `small < 64 px`,
  `medium 64–191 px`, `large >= 192 px`.
- Layout is `single-line` or `multi-line`, including visibly stacked words.
- Orientation is `horizontal` or `rotated-or-unknown`.
- `independence-family` groups repeated artwork and multiple regions from one
  source.
- `source-checksum` is the SHA-256 of the governed source image.

## Frozen assignments

| Case | Thin | Bold | Contrast | Outline/shadow | Background | Crop | Layout | Orientation | Independence family |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approved-wine-004` | yes | no | high | absent | clean | large | multi-line | horizontal | `la-fattoria` |
| `approved-wine-005` | yes | no | high | absent | clean | large | multi-line | horizontal | `la-fattoria` |
| `approved-wine-023` | yes | no | high | absent | clean | medium | multi-line | horizontal | `approved-wine-023` |
| `approved-wine-027` | yes | yes | mixed | present | textured | large | multi-line | horizontal | `approved-wine-027` |
| `approved-wine-031` | yes | yes | high | absent | clean | medium | single-line | horizontal | `approved-wine-031` |
| `approved-wine-035` | yes | no | high | absent | textured | medium | single-line | horizontal | `approved-wine-035` |
| `approved-wine-085` | yes | no | low | absent | textured | small | single-line | horizontal | `approved-wine-085` |
| `approved-wine-091` | yes | no | high | absent | clean | medium | multi-line | rotated-or-unknown | `approved-wine-091` |
| `la-fattoria-rotated` | yes | no | high | absent | clean | large | multi-line | rotated-or-unknown | `la-fattoria` |
| `wine-multi-artifact-04-region-1` | yes | yes | high | absent | clean | medium | multi-line | horizontal | `dry-cellar` |
| `wine-multi-artifact-04-region-2` | yes | yes | high | absent | clean | medium | single-line | horizontal | `dry-cellar` |

No case may be reassigned after treatment. If an assignment cannot be defended
during review, it becomes `unknown`; it is never tuned to OCR results.

