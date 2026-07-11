# Domestic-Wine Fixture Corpus

This document describes the fixture corpus that measures the current **two-field
(brand name + alcohol statement) Slice 3** pre-check system. It is an
evidence-foundation asset: it exists to expose where extraction succeeds, fails,
or stays ambiguous **before** more heuristics or rules are added.

It is deliberately **not** an accuracy benchmark. It is small, hand-curated, and
**not statistically representative** of all domestic-wine labels. General model
accuracy measurement belongs to the evaluation harness (issue #15), not here.

## Purpose

- Give every supported field a positive and an adversarial example.
- Cover clean, ambiguous, insufficient, degraded, and failure states.
- Guard against false-`OBSERVED` brand evidence (producer, varietal, slogan,
  website, vintage, appellation confusion).
- Keep provenance and privacy honest and auditable.

## What is committed

```
tests/fixtures/precheck/
  corpus-index.json                     # the versioned corpus index
  m-cellars-24205001000905/             # canonical baseline (real OCR)
    label-ocr-source.jpeg  label.png  manifest.json
  m-cellars-lowres-24205001000905/      # deterministic low-res derivative
    label-lowres.png  manifest.json
```

Synthetic, domain-only cases carry **no image**: their OCR evidence is a small
set of constructed token lines inside the corpus index, consumed only by tests.

## Corpus architecture

- **Corpus index** (`src/fixtures/corpus-index.{types,schema}.ts`, schema id
  `label-fixture-corpus.v1`): a strict, versioned catalogue. It *references*
  individual fixture manifests; it never replaces their source-chain metadata.
- **Fixture manifest** (`label-fixture-manifest.v2`): the authoritative
  source-chain, on-disk identity, transformation, and privacy record for each
  committed asset. The corpus index links to it, it does not duplicate it.
- **Loader** (`src/fixtures/corpus-index.load.ts`): test/evaluation-only.

Each index entry records at minimum: fixture id, display-safe name, beverage
category, source authority, public record id (where applicable), role, image and
manifest filenames, privacy-review status, intended test dimensions, expected
evidence states, expected supported observations, known ambiguity, bounded
challenge tags, whether it is enabled for real OCR, whether it is
domain-only/synthetic, an unsupported-fields note, and an explicit prohibition
against using truth labels as extractor inputs.

## Inclusion criteria

- Domestic wine only; the two supported fields must be the thing under test.
- Prefer quality and provenance over count. Add a fixture only when it
  corresponds to a **named measurement need**.
- Artwork-only derivatives; no certificate pages, contact blocks, phone numbers,
  applicant emails, handwritten signatures, qualification/footer regions, raw OCR
  dumps, downloaded HTML, or screenshots with unrelated personal information.
- Label-printed business names, producer statements, and addresses may remain
  only when they are part of the approved artwork and are needed to test
  producer-versus-brand confusion.

## Privacy screening

Every committed asset is screened before commit; the manifest records each
excluded category as a privacy-exclusion record that carries **only** a category,
check, result, and tool/rule version — never the excluded content itself. Tests
assert that the corpus tree contains only `.jpg/.jpeg/.png/.json` files and that
no email or formatted phone pattern appears in the index.

## Provenance requirements

For every public fixture the manifest records the public authority and record
id, the public URL, retrieval method, and retrieval date **only when actually
known**. Unknown or unretained facts use explicit sentinels (`unknown`,
`not_retained`, `relationship_not_proven`) — they are never invented. Source
bytes are retained only when privacy-safe and justified; otherwise the manifest
states they were not retained and does **not** claim a source digest or that a
crop is independently reproducible.

Image dimensions, byte size, media type, and SHA-256 are computed from disk and
verified by tests against the manifest and the corpus index.

## Source assets vs. derivatives vs. synthetic cases

- **Source asset**: a screened artwork derivative of a public record (e.g. the M
  Cellars OCR benchmark). The original external design-source bytes are not
  retained.
- **Derivative**: a deterministic transform of a committed asset (e.g. the
  low-resolution downscale). See below.
- **Synthetic/domain-only case**: constructed OCR token lines with no image,
  used for a specific false-positive or alcohol-parsing regression. Marked
  `domainOnlySynthetic`, never enabled for real OCR, and never claimed to be a
  public record.
- **Candidate (acquisition inventory)**: an ingested independent real-label
  **screenshot** with verified identity and provenance but **no expected
  answers** yet. Marked `role: "candidate"`, `expectations: null`,
  `annotationStatus: "unannotated"`, `splitStatus: "unassigned"`, and disabled
  from real OCR. This is corpus inventory awaiting annotation and an
  evaluation-split assignment — see
  [`docs/corpus/approved-wine-110.md`](corpus/approved-wine-110.md). The
  approved-wine acquisition slice added 110 such candidates (55 red / 55 white),
  each catalogued in `tests/fixtures/precheck/approved-wine-110-inventory.json`.
  A candidate carries no invented brand/alcohol answer, no TTB id, and no
  public-record claim; its `sourceAuthority` is
  `author-provided-local-acquisition`.

### Deterministic derivatives

The low-resolution derivative is generated by
`scripts/fixtures/generate-lowres-derivative.mjs` from the committed M Cellars
OCR benchmark: a single fixed-width downscale (targetWidth 601, cubic kernel,
PNG compressionLevel 9), re-encoded as PNG, with no cropping, added noise, or
manual pixel/text correction. Regenerate and verify with:

```
node scripts/fixtures/generate-lowres-derivative.mjs --check
```

Byte-for-byte regeneration is verified on the development environment only;
libvips/PNG-encoder versions may differ across machines. The **committed asset's
recorded identity is authoritative for tests**, not a promise that every machine
reproduces identical bytes. This derivative is therefore **disabled for real
OCR** pending the determinism-safe evaluation harness (issue #15).

## Truth-label boundary

Fixture truth (expected brand, expected alcohol, fixture id, public record id,
filename, hash, tags, expected evidence state) is used **only** for evaluation
and regression assertions. Architectural tests
(`src/fixtures/truth-boundary.test.ts`) prove that:

- no production module imports the corpus index or fixture manifests;
- the extractor and pre-check service never import fixture truth;
- `ExtractionInput` declares no expected-answer, id, hash-as-truth, or tag field;
- corpus truth is imported only by tests / the fixtures tooling package.

Expected declared values may reach downstream deterministic comparison rules only
through the existing declared-facts contract — never the extractor.

## Challenge tags

Bounded and asserted only when the fixture actually demonstrates them:
`clean-front-label`, `low-resolution`, `curved-text`, `integrated-panels`,
`producer-brand-confusion`, `slogan-confusion`, `website-confusion`,
`varietal-confusion`, `appellation-confusion`, `vintage-confusion`,
`alcohol-direct`, `alcohol-range`, `alcohol-malformed`, `glare`, `blur`,
`perspective`, `insufficient-evidence`.

## How to add a fixture

1. Screen the artwork and exclude every prohibited region.
2. Compute on-disk SHA-256, dimensions, byte size, and media type.
3. Write a `label-fixture-manifest.v2` manifest with honest source-chain and
   privacy records; use explicit sentinels for unknown/unretained facts.
4. Add a corpus-index entry (unique id, bounded expectations, challenge tags that
   the asset truly demonstrates, and the unaltered truth-label prohibition).
5. Enable real OCR only when the fixture is available, deterministic enough for
   CI, and its expectations are bounded (state sets and required tokens, not
   full-transcript equality).
6. Run the gates.

## How to verify hashes

```
node scripts/fixtures/generate-lowres-derivative.mjs --check   # derivative determinism
npx vitest run src/fixtures                                    # index + manifest integrity
```

The integrity tests recompute each committed image's hash, size, media type, and
dimensions from disk and compare them to the manifest.

## Which fixtures run real OCR in CI

Only `m-cellars-24205001000905` (the canonical baseline) is enabled for real
OCR. All synthetic and degraded fixtures are disabled to keep CI runtime bounded
and deterministic.

## Known corpus gaps

- **Rainbow Hills Winery / VENOM (TTB ID 19206001000867)** is catalogued as
  `unavailable`. No privacy-safe artwork derivative with documented provenance
  could be obtained without network access or exposure of prohibited certificate
  content, so **no asset, manifest, or truth transcript is committed**. Enabling
  it requires a screened artwork-only crop with a full source-chain manifest.
- **No additional public domestic-wine label** beyond M Cellars is committed for
  the same reason; the positive clean-front-label case is currently synthetic.
- Curved-text, integrated-panels, glare, blur, and perspective image fixtures are
  not yet committed; they are named future measurement needs, not present claims.

## Why this corpus is not representative

It is a small, deliberately varied, hand-curated set chosen to expose specific
behaviors. It does not sample the domestic-wine label population and must not be
read as a measure of general extraction accuracy. That measurement is issue #15.
