# Phase 1 — brand-region annotation packet

**Awaiting Joseph's review. These regions are PROPOSED and must not be used as
evaluation truth until approved.** Nothing in this round modifies production
code, OCR configuration, recovery planning, fixtures, schemas, tests, UI,
packages, ranking, matching, candidate generation, or authority rules.

## What you are looking at

13 cases — exactly the `TRUE_NON_RECOGNITION` set from the preserved E3 record
(`artifacts/brand-ocr-recognition-miss-diagnosis/classifications.json`).

Per case, in `images/`:

- `<case>-label.jpg` — the full canonical label, nothing drawn on it;
- `<case>-proposed-region.jpg` — the same label with the proposed brand-region
  rectangle outlined in red.

**Deliberately absent from this view: OCR word boxes and machine-selected
regions.** The first annotation must be made from the artwork alone, so the
region is not anchored to what the machine happened to read.

Coordinates are in `proposed-regions.json`, in **canonical original-image pixels,
origin top-left**. The packet build fails loudly if any rectangle leaves the
image frame (`bounds-check.json`).

## The rule I applied

Enclose **only the visible brand mark**, with modest padding. Varietal,
appellation, series, vintage and descriptive text are excluded unless they are
visually part of the fixture brand.

## Where I need your judgment most

| Case | Question |
|---|---|
| `wine-multi-artifact-04` | Multi-panel. I outlined the **front-panel** `Dry Cellar` script. A second, smaller `Dry Cellar` sits on the back panel near (235,985)–(330,1015). Should the annotation cover one mark or both? |
| `wine-multi-artifact-07` | Same question: I outlined the front-panel `MIKE'S FARM`; `Mike's Farm, Inc.` also appears on the back panel near (60,890)–(350,930). |
| `approved-wine-083` | `Wine Co.` is set in the *same* script as `Barn Sill`, so I included it. This bears directly on the E3 borderline question for this case — but please answer it as a region question, not a truth question. |
| `approved-wine-027` | I included all three lines (`THE` / `GOLDEN` / `Girls`). The lower roundel repeats the name but is a separate device and is excluded. |
| `approved-wine-091` | The mark is stacked two-line, `RÍ` over `aS`. I enclosed both lines as one region. |

## How to respond

Fill in `reader-response-template.md`. If a region is wrong, give corrected
coordinates in the same canonical frame, or describe the correction in words and
I will re-render for confirmation.

## What happens after approval

Approved regions are saved separately as `../approved-regions.json` and only then
used for Phase 2 — pass-footprint coverage, OCR word overlap, and the
first-failure classification.

**Expected fixture text was used only to identify which mark is the brand. It has
not steered, and will not steer, OCR, recovery passes, crops, or extraction.**

## One thing to know before you start

Phase 0 found that the committed evidence is **sufficient for pass-footprint
coverage but not for word overlap** — see `../code-path.md`. That does not affect
this annotation, but it does mean Phase 2 needs a bounded, read-only evidence
collection that has **not** been run. I have not run it.

## Image index

Every file in `images/` is listed here, so each is explicitly referenced. The
blocked cases keep their images because they are needed to understand *why* those
annotations were not approved.

| Case | Annotation status | Proposed region(s) `x,y,w,h` | Plain label | Outlined proposal |
|---|---|---|---|---|
| `la-fattoria-rotated` | **APPROVED** | `350,360,650,290` | `images/la-fattoria-rotated-label.jpg` | `images/la-fattoria-rotated-proposed-region.jpg` |
| `approved-wine-004` | **APPROVED** | `350,360,650,290` | `images/approved-wine-004-label.jpg` | `images/approved-wine-004-proposed-region.jpg` |
| `approved-wine-005` | **APPROVED** | `495,240,520,270` | `images/approved-wine-005-label.jpg` | `images/approved-wine-005-proposed-region.jpg` |
| `approved-wine-023` | **APPROVED** | `293,59,403,162` | `images/approved-wine-023-label.jpg` | `images/approved-wine-023-proposed-region.jpg` |
| `approved-wine-027` | **APPROVED** | `77,71,822,340` | `images/approved-wine-027-label.jpg` | `images/approved-wine-027-proposed-region.jpg` |
| `approved-wine-031` | **APPROVED** | `163,38,330,76` | `images/approved-wine-031-label.jpg` | `images/approved-wine-031-proposed-region.jpg` |
| `approved-wine-035` | **APPROVED** | `58,42,364,92` | `images/approved-wine-035-label.jpg` | `images/approved-wine-035-proposed-region.jpg` |
| `approved-wine-074` | **BLOCKED (policy)** | `130,68,547,107` | `images/approved-wine-074-label.jpg` | `images/approved-wine-074-proposed-region.jpg` |
| `approved-wine-083` | **BLOCKED (policy)** | `28,48,394,76` | `images/approved-wine-083-label.jpg` | `images/approved-wine-083-proposed-region.jpg` |
| `approved-wine-085` | **APPROVED** | `88,18,250,50` | `images/approved-wine-085-label.jpg` | `images/approved-wine-085-proposed-region.jpg` |
| `approved-wine-091` | **APPROVED** | `20,6,92,150` | `images/approved-wine-091-label.jpg` | `images/approved-wine-091-proposed-region.jpg` |
| `wine-multi-artifact-04` | **APPROVED** | `53,123,230,140` · `173,982,156,55` | `images/wine-multi-artifact-04-label.jpg` | `images/wine-multi-artifact-04-proposed-region.jpg` |
| `wine-multi-artifact-07` | **BLOCKED (policy)** | `25,52,290,98` · `58,913,227,51` | `images/wine-multi-artifact-07-label.jpg` | `images/wine-multi-artifact-07-proposed-region.jpg` |
