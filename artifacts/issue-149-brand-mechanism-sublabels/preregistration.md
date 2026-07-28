# Preregistration — Brand mechanism sub-labeling and stylization audit

Refs Issue #149. Evaluation-only. **No labels are produced by this PR.** No OCR
was run. No production code, fixture, threshold, parser, ranking, Brand logic,
Alcohol logic, or Government Warning logic changed. PR #195 untouched.

This document is frozen **before** any annotation. Annotation happens in a
separate, later session by an annotator who has not seen the prior failure
classes or hypotheses.

## Purpose

Two independent, read-only audits over the 10 governed cases from the Phase 2
region-coverage diagnosis:

- **Audit A (geometry)** — sub-label the 5 cases currently classified
  `ORIENTATION_OR_SEGMENTATION_FAILURE`, to separate orientation failure from
  segmentation failure. These are currently bundled under one label and have
  never been separated.
- **Audit B (typography)** — stylization checklist over the 5 cases classified
  `REGION_COVERED_NO_TEXT_RECOGNIZED` (3) and
  `REGION_COVERED_SEVERE_GLYPH_MISRECOGNITION` (2).

## Frozen case set

Source: `artifacts/brand-region-coverage-diagnosis/classifications.json`,
sha256 recorded in `case-freeze.json`. 10 primary-population cases, split 5/5.
Exact IDs are in `case-freeze.json`; they are deliberately not repeated here in
a form that could travel with reader material.

No case may be added, substituted, or moved between audits after this document.

## Rubrics

### Audit A — geometry (exactly one label per item)

- `ORIENTATION_SUSPECTED` — visible Brand baseline deviates more than 15 degrees
  from horizontal, or text is vertical / top-to-bottom.
- `SEGMENTATION_SUSPECTED` — text is upright within 15 degrees but visually
  fragmented, split, curved, or grouped in a way likely to confuse line/word
  segmentation.
- `AMBIGUOUS_SUBLABEL` — geometry alone cannot distinguish them.

No OCR transcript may be used. The annotator sees only the crop and neutral
horizontal reference lines.

### Audit B — typography (Y/N each)

decorative script; condensed or expanded lettering; custom logotype; outline or
shadow; arched or curved baseline; unusual ligature; extreme texture or contrast
effect. Plus overall `stylized` Y/N, confidence, and a brief appearance-only
rationale.

## Preregistered interpretation — Audit B

Evaluated over the **5 frozen cases**, not over reader items:

- **4–5 of 5 stylized** — the stylization hypothesis remains supported for these
  cases.
- **0–1 of 5 stylized** — the glyph-ceiling framing loses support, and these
  cases should be reconsidered under segmentation/orientation.
- **2–3 of 5 stylized** — both hypotheses remain open.

**This does not establish a Tesseract capability ceiling** under any outcome. A
capability-ceiling claim additionally requires, at minimum, a stronger-traineddata
comparison that fails first, and a corpus far larger than 5 cases.

## Multi-region aggregation rule (preregistered)

One frozen case (`wine-multi-artifact-04`) has two committed approved Brand
regions. Rather than the packet builder choosing which region the Phase 2
classification referred to — a judgement that could bias the result — **both
regions are shown as separate reader items**. This is why Audit B has 6 reader
items for 5 cases.

Case-level verdict for that case:

- both regions marked stylized -> case counts as stylized;
- both regions marked not stylized -> case counts as not stylized;
- regions disagree -> case recorded `AMBIGUOUS_REGION_DISAGREEMENT` and
  **excluded from the denominator**, making the interpretation thresholds above
  operate over 4 cases rather than 5.

This rule is deliberately conservative and does not favour either hypothesis.

## Annotator eligibility

The packet builder has already seen the Phase 2 failure classes, the four
preprocessing null results, and the glyph-ceiling hypothesis, and is therefore
**not an eligible sole annotator**. See `contamination-audit.md`. This mirrors
the precedent already set by the blind brand-truth review, where prior exposure
disqualified a reader.

Annotation requires either an independent human reader or a genuinely isolated
model session given only `reader-packet/` and no project history.

## Determinism and integrity requirements

- `case-freeze.json` hashed in `case-freeze.sha256`.
- Every reader-facing file hashed in `packet-manifest.json`, itself hashed in
  `packet-manifest.sha256`.
- The packet build is deterministic: rebuilding from the same inputs reproduces
  the same manifest hash (verified).
- `validate-issue-149-brand-mechanism-packet.mjs` must pass before the packet is
  handed to any annotator, and again before responses are unblinded.

## Unblinding protocol

`anonymization-map.json` is the unblinding key and is stored **outside**
`reader-packet/`. It must not be given to the annotator until responses are
recorded and saved verbatim. Responses are preserved unchanged; unblinding and
interpretation happen only afterwards, in a separate commit.

## What this authorizes

Nothing beyond producing labels. After labels exist and are frozen, a single
mechanism-matched OCR experiment per sub-label may be preregistered separately,
on a separate branch. No mode sweeping, no retry-on-failure, no production
change is authorized by this packet or by the labels it will produce.
