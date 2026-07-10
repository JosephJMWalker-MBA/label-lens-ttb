# Sample Corpus Plan

Status: research plan
Date: 2026-07-10

## Objective

Build a versioned evidence corpus grounded in real TTB artifacts so OCR, normalization, deterministic rules, and human-review behavior can be tested against actual workflows rather than imagined uploads.

## Initial scope

Begin with wine because the reviewed workflow exposes a manageable but meaningful set of structured fields:

- brand name;
- fanciful name;
- class/type;
- net contents;
- alcohol content;
- vintage;
- grape varietal;
- appellation;
- formula reference;
- government warning;
- label panel type;
- printed dimensions.

## Corpus buckets

### Product classes

Collect representative examples for:

- table red wine;
- table white wine;
- rosé;
- sparkling wine;
- dessert wine;
- fruit wine and cider;
- flavored wine;
- mead where relevant;
- domestic products;
- imported products.

### Artifact forms

For each useful class, seek:

- flat front-label artwork;
- flat back-label artwork;
- neck or strip labels;
- multi-panel printer proofs;
- submission-ready JPG or TIFF derivatives;
- printable approved COLAs;
- public-registry label images;
- formulas, SOPs, lab records, translations, and cover letters where publicly or voluntarily available;
- bottle or package photographs for later-mode research only.

### Quality conditions

Include:

- clean high-resolution images;
- low-resolution images;
- compression artifacts;
- small type;
- low contrast;
- glare or curvature examples for later testing;
- rotated or skewed scans;
- multi-panel sheets;
- cropped or incomplete evidence.

## Truth labels

Each sample should have a human-reviewed record containing:

```text
CorpusSample
- sample_id
- source_type
- source_url_or_case_reference
- retrieved_at
- product_category
- product_class_type
- origin
- evidence_state
- artifact_type
- panel_type
- original_sha256
- media_type
- byte_size
- pixel_dimensions
- printed_dimensions
- transformation_manifest
- expected_fields
- observed_fields
- ambiguity_notes
- authority_level
- permitted_use
```

Expected fields should preserve both the exact transcription and a normalized comparison value.

## Matching and mismatch sets

Build paired fixtures covering:

- exact matches;
- case, spacing, and apostrophe equivalence;
- one-character brand-name differences;
- wrong or missing fanciful name;
- equivalent net contents in different metric units;
- genuinely different net contents;
- proof versus ABV equivalence;
- genuinely different alcohol content;
- vintage without appellation;
- varietal or appellation omitted from the application;
- formula identifier mismatch;
- exact government warning;
- altered, incomplete, or missing government warning;
- one panel versus multi-panel submission derivative;
- missing printed dimensions;
- ambiguous OCR requiring human review.

## Public Registry use

Public COLAs may be used to:

- discover real field and panel patterns;
- obtain approved certificate and label examples;
- test parsing and extraction;
- construct synthetic declared-versus-observed mismatches.

They must not be represented as binding precedent or proof that a new label is compliant. Registry images may not preserve actual type size, characters per inch, or contrast.

## Authority labeling

Every corpus item must carry one of:

```text
current_regulation
current_official_guidance
current_live_system
historical_ttb_guidance
public_approved_example
voluntary_industry_sample
synthetic_fixture
```

This prevents historical manuals or prior approvals from silently becoming governing rules.

## Privacy and licensing

- Prefer official public records and voluntarily supplied industry samples.
- Record source and permitted use.
- Avoid collecting personal information that is unnecessary for testing.
- Do not publish confidential formulas or business records without permission.
- Keep private stakeholder samples segregated from public fixtures.
- Preserve immutable originals while using de-identified derivatives where appropriate.

## Versioning

The corpus should be versioned independently from the application code.

A corpus release must record:

- fixture manifest version;
- artifact hashes;
- truth-label reviewer and date;
- rule-set version used for expected findings;
- known limitations;
- additions, removals, and corrected annotations.

## Benchmark splits

Maintain non-overlapping:

- development fixtures;
- regression fixtures;
- evaluation fixtures;
- adversarial or degraded fixtures.

Do not tune extraction behavior against the final evaluation set.

## Initial target

The first useful corpus should contain at least:

- 10 approved wine records across several product classes;
- 20 individual label-panel images;
- 10 synthetic mismatch variants;
- 5 warning-statement fixtures;
- 5 low-quality or ambiguous images;
- 3 multi-panel printer proofs;
- 3 supporting-attachment examples or realistic synthetic equivalents.

## Acceptance criteria

- Every fixture has provenance, authority level, and a stable hash.
- Original and derived artifacts are separately identifiable.
- At least one reconstructed end-to-end COLA package is represented.
- Both matching and intentionally mismatched declared facts are included.
- Public examples are labeled reference-only.
- The corpus supports repeatable field-level accuracy, false-pass, human-correction, and latency benchmarks.
- The next OCR implementation is justified against observed artifacts in the corpus.