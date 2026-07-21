# approved-wine-037 — `3` read as `9`

| | |
|---|---|
| Image | `tests/fixtures/precheck/approved-wine-037/label.jpeg`, 608×1130 JPEG |
| Visible | **`Alcohol 13.0 % by volume`** |
| Truth | 13.0 |
| Machine | `19.0% BY VOL.` (OBSERVED, token confidences 79/90/96/95) |

## Phase 1 — where the digit is lost

Same primary-pass config (PSM 11 sparse, scale 1.5, grayscale + normalise). The
token emitted is `"19.0"` — the wrong digit is **in the OCR output**, so again the
failure is at **OCR recognition in the primary full-image pass**. Recovery never
runs. No alternate pass held the correct value.

## Phase 2 — visual mechanism

- **Light-on-dark (inverted polarity)**, mean luminance 24
- contrast range **134** (min 1, max 135) — materially lower than case 018's 204
- inter-glyph gaps `[5, 3, 5, 13, 8]` px — **well separated, no fusion**
- the `3` and the `0` have **identical** bounding boxes (w 14, h 32)

Segmentation is clean. This is pure **shape discrimination**: a blurred, low-range
`3` whose upper and lower bowls close into a `9`. JPEG compression on a dark
background plus `normalise` on an inverted image leaves little separation between
stroke and ground.

## Phase 3 — what recovers 13.0

451 of 896 runs read `13.0`, and it recovers **broadly** rather than narrowly —
across every crop (line 141, markerAndNumber 144, numberOnly 144), every PSM, and
every scale.

Most significant: the **existing production treatment and existing page
segmentation** recover it on a tight line crop:

```
line x1.5 psm=sparse -> "ono 13.0 % by volume"  conf=80  deterministic  44ms
```

Nothing new is needed except a smaller region. That is a resolution/context
effect, not a preprocessing deficiency.

## Phase 4 — corpus behaviour

Re-reading the candidate-derived crop recovers 13.0 under **both** re-read modes,
and the two re-reads **agree with each other while contradicting the selected
value (19)**. That combination fires on only **2 of 68** currently-correct cases,
making it a usable *abstention* signal.

It is **not** usable as a replacement: trusting the re-read outright breaks 14
correct cases (sparse) or 28 (singleWord).
