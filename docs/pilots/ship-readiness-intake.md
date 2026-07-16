# Ship-readiness pilot intake (Issues #120 / #121)

Reusable tooling to prepare a local, immutable pilot corpus for the practical
reviewer-usefulness / ship-readiness pilot. It makes a pilot **runnable and
auditable** without generating expected answers, running Label Lens/OCR/a VLM,
or committing private image bytes.

## What is committed vs local

**Committed (reusable, no private data):**

- `src/pilots/ship-readiness/pilot-intake.ts` — schema, runtime validation, and
  deterministic seeded counterbalancing.
- `src/pilots/ship-readiness/pilot-intake.test.ts` — tests.
- `scripts/pilots/pilot-intake.ts` — generic CLI (`build`/`validate`/
  `counterbalance`/`worksheets`).
- `docs/pilots/*` — this document and the reviewer-worksheet template.

**Local only (gitignored under `.local/`, never committed):** the raw photos,
display derivatives, the pilot-ID → original-filename source map, the populated
manifest, the generated review order, worksheet instances, and every human or
machine result.

## Local workspace layout

```text
.local/pilots/ship-readiness-001/
  raw/                      # byte-identical copies: pilot-wine-001.<ext> ...
  display-derivatives/      # only when orientation/format/scale requires it
  manifests/                # pilot-manifest.json, review-order.json, _objective-metadata.tsv
  worksheets/               # per-case order-aware First-pass/Second-pass instances
  reports/                  # PREPARATION-REPORT.md
  _inspection/              # source-map.private.tsv, thumbnails (local review aids)
```

## Governing boundaries

- Original bytes are preserved unchanged; `validate` re-hashes every raw file and
  fails if any digest drifts from intake.
- No brand names, alcohol statements, OCR text, expected values, scores, or
  compliance verdicts enter the manifest. The schema forbids those keys and the
  validator rejects them at the JSON boundary.
- Difficult, duplicate, out-of-scope, or unusable files are preserved as
  `EXCLUDED_WITH_REASON` or `PENDING_HUMAN_DECISION` with an explicit reason —
  never silently dropped. The denominator and exclusion count stay visible.
- Challenge tags describe **presentation only** and are open to maintainer
  revision; provenance/permission is `PENDING_HUMAN_CONFIRMATION` until a human
  confirms it.

## Commands

```bash
WS=.local/pilots/ship-readiness-001
# 1. build the manifest from objective metadata + a local dispositions file
node --experimental-strip-types --no-warnings scripts/pilots/pilot-intake.ts \
  build "$WS/manifests/_objective-metadata.tsv" "$WS/manifests/_dispositions.json" \
  "$WS/manifests/pilot-manifest.json"

# 2. validate (schema + raw-bytes-unmodified + no expected values)
node --experimental-strip-types --no-warnings scripts/pilots/pilot-intake.ts \
  validate "$WS/manifests/pilot-manifest.json" "$WS/raw" "$WS/display-derivatives"

# 3. preregister the counterbalanced order over INCLUDED cases (record the seed!)
node --experimental-strip-types --no-warnings scripts/pilots/pilot-intake.ts \
  counterbalance "$WS/manifests/pilot-manifest.json" 20260716 "$WS/manifests/review-order.json"

# 4. emit per-case order-aware worksheet instances (first pass = each case's
#    preregistered mode; second pass hidden until the first pass is saved)
node --experimental-strip-types --no-warnings scripts/pilots/pilot-intake.ts \
  worksheets "$WS/manifests/review-order.json" "$WS/worksheets"
```

## Counterbalancing

`generateCounterbalancedOrder(includedCaseIds, seed)` assigns half the cases a
manual-first pass and half an assisted-first pass, then emits a two-block
sequence (all first passes, then all second passes). The block boundary is the
washout; a case's two modes are therefore never adjacent. The order is fully
reproducible from the recorded seed — do not re-roll the seed after seeing
results.

Worksheet generation is **order-aware**: each generated worksheet renders that
case's assigned first-pass mode as the First pass and the opposite mode as the
hidden Second pass, so a manual-first case is executed manual-first and an
assisted-first case is executed assisted-first. There is no universal
"manual always precedes assisted" rule.

## Boundary with #114 / #116

This tooling is self-contained. It does not import the observation-quality
corpus schema (#114) or touch the RDR-004 governance docs (#116), and lives
entirely under new paths (`src/pilots/**`, `scripts/pilots/**`, `docs/pilots/**`).
