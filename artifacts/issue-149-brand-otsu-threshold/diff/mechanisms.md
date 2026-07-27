# Otsu mechanism review

All 11 primary control/treatment preprocessed pairs were retained for
full-resolution inspection. Every behaviorally changed case has exactly one
primary classification. Visible binarization evidence is separated from OCR
movement; transcript movement alone is not treated as causal evidence.

| Changed case | Paired artifact | Classification | Visual and metric evidence | Thin stroke | Contrast | Outline/shadow | Background |
| --- | --- | --- | --- | --- | --- | --- | --- |
| approved-wine-004 | [pair](paired-preprocessed/approved-wine-004.png) | `OTSU_REMOVED_BACKGROUND_NOISE` | The pair shows the gray normalized field becoming uniform white while the principal black glyphs remain continuous; OCR removes the space inside FATTORIA but does not recover the full fixed Brand truth. | yes | high | absent | clean |
| approved-wine-005 | [pair](paired-preprocessed/approved-wine-005.png) | `OTSU_CHANGED_CONFIDENCE_ONLY` | The pair shows binary foreground/background separation, but transcript, candidates, selection, and authority remain unchanged; only confidence telemetry changes. | yes | high | absent | clean |
| approved-wine-023 | [pair](paired-preprocessed/approved-wine-023.png) | `OTSU_FRAGMENTED_CHARACTERS` | The binary pair contains visible gaps and dotted breaks along multiple fine script loops and connecting strokes; OCR changes without recovering truth. | yes | high | absent | clean |
| approved-wine-027 | [pair](paired-preprocessed/approved-wine-027.png) | `OTSU_LOST_THIN_STROKES` | The pale script word Girls and several fine decorative strokes visible in control are nearly removed by binarization, while the heavy GOLDEN letters remain. | yes | mixed | present | textured |
| approved-wine-031 | [pair](paired-preprocessed/approved-wine-031.png) | `OTSU_CHANGED_CONFIDENCE_ONLY` | The binary letterforms remain visually intact and transcript, candidates, selection, and authority are unchanged; only confidence telemetry changes. | yes | high | absent | clean |
| approved-wine-035 | [pair](paired-preprocessed/approved-wine-035.png) | `OTSU_REMOVED_BACKGROUND_NOISE` | The mottled gray field and faint texture disappear into a uniform white background while the script remains visibly continuous; OCR changes without a truth gain. | yes | high | absent | textured |
| approved-wine-085 | [pair](paired-preprocessed/approved-wine-085.png) | `OTSU_FRAGMENTED_CHARACTERS` | The low-contrast script gains hard binary edges but develops visible breaks in the leading flourish and several letter strokes; the control candidate is lost. | yes | low | absent | textured |
| approved-wine-091 | [pair](paired-preprocessed/approved-wine-091.png) | `OTSU_CHANGED_CONFIDENCE_ONLY` | The stacked letterforms remain visually intact and transcript, candidates, selection, and authority are unchanged; only confidence telemetry changes. | yes | high | absent | clean |
| la-fattoria-rotated | [pair](paired-preprocessed/la-fattoria-rotated.png) | `OTSU_REMOVED_BACKGROUND_NOISE` | As in the matching La Fattoria source, the gray normalized field becomes uniform white while principal glyphs remain continuous; OCR spacing changes without recovering full truth. | yes | high | absent | clean |
| wine-multi-artifact-04-region-1 | [pair](paired-preprocessed/wine-multi-artifact-04-region-1.png) | `OTSU_CAUSED_EMPTY_OCR` | The binary pair removes anti-aliasing and thickens hard script edges; the non-empty control transcript becomes empty in treatment. | yes | high | absent | clean |
| wine-multi-artifact-04-region-2 | [pair](paired-preprocessed/wine-multi-artifact-04-region-2.png) | `OTSU_FRAGMENTED_CHARACTERS` | The smaller script develops conspicuous white breaks inside several curved and connecting strokes after binarization; OCR spelling changes without a truth gain. | yes | high | absent | clean |
