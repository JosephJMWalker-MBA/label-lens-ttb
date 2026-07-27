# Preregistered visual-style slices

These assignments were made from the preserved source crop, crop dimensions, fixture identity/provenance, and visible layout before treatment. OCR transcript, correctness, candidate state, and confidence were not inputs.

## Definitions

- `thin-stroke:yes`: a material portion of the Brand uses hairline, fine script, or fine serif strokes.
- `bold-heavy:yes`: a material portion uses broad, heavy, or filled strokes. A mixed design may be both thin and bold.
- `contrast:low`: the Brand foreground is visibly close in luminance/color to its background.
- `contrast:high`: the foreground is clearly separated. `mixed` means material portions differ.
- `outline-shadow:present`: glyph outline, drop shadow, or layered text edge is visibly material.
- `background:textured`: visible pattern, illustration, mottling, or compression/tonal texture crosses or closely surrounds the Brand.
- `background:clean`: mostly uniform background around the Brand.
- Crop size uses the merged platform's original padded-crop minimum dimension: `small < 64 px`, `medium 64–191 px`, `large >= 192 px`.
- `layout:single-line` and `layout:multi-line` describe visible reading layout, including stacked words.
- `orientation:horizontal`: visible Brand baselines are conventionally horizontal.
- `orientation:rotated-or-unknown`: existing metadata identifies a rotated case or the reading orientation is not reliably horizontal.
- `independence-family` groups repeated artwork and multiple regions from the same source.

## Frozen assignments

| Case | Thin | Bold | Contrast | Outline/shadow | Background | Crop | Layout | Orientation | Independence family | Visual basis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `approved-wine-004` | yes | no | high | absent | clean | large | multi-line | horizontal | `la-fattoria` | Fine script and thin sans lettering on flat tan/white |
| `approved-wine-005` | yes | no | high | absent | clean | large | multi-line | horizontal | `la-fattoria` | Same Brand system on a separate governed source |
| `approved-wine-023` | yes | no | high | absent | clean | medium | multi-line | horizontal | `approved-wine-023` | Fine black script on white |
| `approved-wine-027` | yes | yes | mixed | present | textured | large | multi-line | horizontal | `approved-wine-027` | Heavy serif plus fine script over layered decorative lines |
| `approved-wine-031` | yes | yes | high | absent | clean | medium | single-line | horizontal | `approved-wine-031` | High-contrast modern serif with hairlines and heavy stems |
| `approved-wine-035` | yes | no | high | absent | textured | medium | single-line | horizontal | `approved-wine-035` | Fine script on subtly mottled pale background |
| `approved-wine-085` | yes | no | low | absent | textured | small | single-line | horizontal | `approved-wine-085` | Pale gold script on pale, visibly soft/tonal background |
| `approved-wine-091` | yes | no | high | absent | clean | medium | multi-line | rotated-or-unknown | `approved-wine-091` | Vertically stacked serif letters; reading orientation is not reliably horizontal |
| `la-fattoria-rotated` | yes | no | high | absent | clean | large | multi-line | rotated-or-unknown | `la-fattoria` | Existing fixture metadata declares the rotated variant |
| `wine-multi-artifact-04-region-1` | yes | yes | high | absent | clean | medium | multi-line | horizontal | `dry-cellar` | Large red script with heavy bodies and fine flourishes |
| `wine-multi-artifact-04-region-2` | yes | yes | high | absent | clean | medium | single-line | horizontal | `dry-cellar` | Smaller repeated red script from the same source image |

No case is reassigned after treatment. If a reviewer disputes a visual label, the experiment must report that uncertainty rather than tune the slice to the result.
