# Governed corpus plan and operator guide

## What exists

The generated `fixture-inventory.json` inventories all 361 Git-tracked raster images:

- 132 governed source-label images;
- 105 full-image Brand-evaluable real labels;
- 103 Alcohol-evaluable real labels;
- 10 Brand-evaluable source images with reader-approved regions;
- 11 bounded Brand region cases because one image has two approved occurrences;
- 2 images with warning-presence metadata;
- 0 fixtures with governed exact Government Warning text/region truth;
- 72 duplicate paths, primarily deliberate control/treatment derivatives and copied evidence artifacts.

Derived crops and screenshots remain visible in the inventory but are never counted as independent source-label cases.

## Storage modes

### `local-private`

- Root: `.local/ocr-research/fixtures/`
- Gitignored by the repository-wide `.local/` rule.
- Redistribution status must be `private-not-approved`.
- Available only when a local operator explicitly composes the manifest with `includePrivate: true`.
- CI and the default evaluator load committed fixtures only.

### `committable`

- Root: `tests/fixtures/ocr-research/`
- Import requires explicit repository redistribution approval, license/status notes, and provenance.
- The command copies the exact original bytes into a checksum-derived fixture directory and records checksum, dimensions, MIME, byte size, truth sources, and regions.
- Import does not stage, commit, push, or otherwise publish the image.

Existing governed approved-wine images remain in their original directories. The research manifest references them rather than creating duplicate image files or making a new license claim.

## Stable identity and validation

New imported IDs are `label-<first 16 hex characters of SHA-256>`. The same bytes produce the same ID.

Validation rejects:

- empty or missing provenance fields;
- unsupported or undecodable images;
- non-positive/impossible decoded dimensions;
- coordinates outside the normalized panel;
- duplicate checksums across committed/private manifests;
- truth records without a declared evidence source;
- warning absence without explicit whole-label review;
- a committable fixture marked private;
- a private fixture marked redistributable.

Expected truth is stored beside evaluation metadata and is removed before the OCR executor is called.

## Import command

Minimal private import:

```bash
npm run fixture:import-ocr-research -- \
  --source /absolute/path/to/label.png \
  --mode local-private \
  --display-name "Garden City Beach staging recovery" \
  --provenance "Recovered original browser-local upload" \
  --provenance-reference "local operator recovery note 2026-07-27" \
  --acquisition-method "browser download or IndexedDB export" \
  --acquired-by "operator name" \
  --acquired-at "2026-07-27" \
  --license "not-cleared" \
  --redistribution-notes "Private local evaluation only"
```

Optional normalized Brand region and truth:

```bash
  --brand-region "0.12,0.08,0.62,0.24" \
  --brand-region-label "seller-selected Brand region" \
  --brand-truth "GARDEN CITY BEACH" \
  --brand-truth-source "Seller declaration transcribed from the saved package draft" \
  --brand-truth-reference "local draft export reference"
```

Use `|` to record multiple acceptable presentations. Warning and Alcohol truth require their own `--*-truth-source` and `--*-truth-reference` flags. A warning absence additionally requires `--whole-label-reviewed true`.

For `committable`, use only after redistribution is explicitly approved:

```bash
--mode committable \
--license "documented license or approval identifier" \
--redistribution-notes "Explicitly approved for repository inclusion by ..."
```

The importer never commits automatically.

## Recovering browser-local images

1. Open the saved package in the same browser profile used for staging.
2. Use the package UI/export surface to download the original panel when available.
3. If the UI cannot export it, use browser developer tooling in that same profile to inspect the package draft’s IndexedDB/blob record and save the blob without re-encoding. Do not copy screenshots when original bytes are recoverable.
4. Record where the bytes came from, who recovered them, and the date. Do not record credentials, storage tokens, or unrelated browser data.
5. Compute the browser-reported panel checksum if available; the importer computes its own SHA-256.
6. Import as `local-private` first.
7. Compare importer dimensions/checksum with the saved panel metadata.
8. Only move to `committable` through a new import after licensing/redistribution approval; do not edit `mode` by hand.

If browser state is gone, the case remains metadata-only. Do not manufacture an image from a screenshot of the UI.

## Marking a region

1. Display the original image at its native aspect ratio.
2. Draw a rectangle around the visible Brand mark with modest padding.
3. Exclude varietal, appellation, producer/bottler copy, mandatory text, and separate repeated devices unless they are visually part of the Brand mark.
4. Convert pixel coordinates using:
   - `x = left / imageWidth`
   - `y = top / imageHeight`
   - `width = boxWidth / imageWidth`
   - `height = boxHeight / imageHeight`
5. Record whether the region is seller-selected or independently human-approved. Do not relabel one as the other.
6. Run the import validator and inspect the preserved original plus metadata.

## Verifying and evaluating

```bash
npm run eval:issue-149-ocr-research-platform
```

This:

1. rebuilds the committed approved-region manifest;
2. inventories every tracked raster image;
3. runs the production-equivalent 3× bounded Brand control twice;
4. verifies a zero-behavior-delta no-op;
5. records reports, raw words, candidate traces, crop/preprocessing artifacts, latency, memory deltas, hashes, environment, and Wilson intervals.

To reproduce the rejected 4× treatment:

```bash
npm run eval:issue-149-ocr-research-scale
```

## Migrating the seven metadata-only staging cases

Process in this order:

1. Garden City Beach
2. Minneapolis
3. Luigi & Giovanni
4. The Golden Girls
5. Hubert Lamy
6. Aphrodite
7. Christmas Hayride

For each:

1. recover original bytes from the staging browser/profile;
2. import `local-private`;
3. attach the saved seller-selected region, not a newly optimized crop;
4. attach Brand truth with its seller-declaration evidence source;
5. attach warning presence/exact text only after whole-label human review;
6. attach Alcohol truth only after the complete statement is visible;
7. rerun the no-op control;
8. request redistribution approval separately;
9. re-import `committable` only if approved;
10. update the PR #196 staging record to point to the governed fixture without deleting the original metadata-only history.

Christmas Hayride is the highest warning priority because it is the only recorded exact pass. Garden City Beach, Minneapolis, Luigi & Giovanni, The Golden Girls, Hubert Lamy, and Aphrodite are the Brand-recognition priority set.

## CI boundary

CI should run:

- schema/validation tests;
- deterministic fake-executor tests;
- committed-fixture no-op when OCR runtime cost is acceptable.

CI must not set `includePrivate: true`, must not read `.local/`, and must not run a private path supplied through environment configuration.
