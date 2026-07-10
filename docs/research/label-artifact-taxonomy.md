# Label Artifact Taxonomy

Status: research draft
Date: 2026-07-10

## Purpose

Define the artifact classes Label Lens must distinguish so that intake, extraction, comparison, provenance, and reporting do not collapse unlike evidence into one generic upload.

## Primary artifact classes

### 1. Proposed label artwork

Examples:

- flat JPG or TIFF;
- exported PNG used internally;
- PDF printer proof;
- design-system export;
- multi-panel artwork sheet.

Characteristics:

- may contain crop marks, bleed, dielines, printer notes, or unused variants;
- may not reflect final physical dimensions;
- may contain multiple panels in one file;
- may differ from what is eventually submitted.

Required handling:

- preserve original;
- identify panel boundaries;
- separate submission derivatives from source artwork;
- record physical-dimension assumptions;
- do not treat printer marks as label content.

### 2. Submitted label image

A file uploaded with a COLA application and assigned an attachment type such as brand, back, neck, or other label.

Characteristics:

- one label/panel per image under historical guidance;
- associated with printed width and height;
- may be compressed or converted for system limits;
- is part of the certified application package.

Required handling:

- immutable source copy;
- attachment type;
- printed dimensions;
- pixel dimensions;
- file format and size;
- transformation log;
- cryptographic hash.

### 3. Supporting attachment

Examples:

- formula;
- SOP;
- lab analysis;
- pre-import letter;
- cover letter;
- translation;
- bottle or closure photograph;
- other explanatory evidence.

Required handling:

- declared attachment type;
- related application field or claim;
- extracted text;
- source and date;
- evidence sufficiency status;
- provenance and integrity metadata.

### 4. Application record

Structured facts entered into COLAs Online or represented on TTB Form 5100.31.

Examples:

- brand name;
- fanciful name;
- class/type;
- source;
- alcohol content;
- net contents;
- vintage;
- varietal;
- appellation;
- formula reference;
- permit and serial identifiers.

This is declared evidence, not visible label evidence.

### 5. Printable COLA certificate

The durable approved record containing application data, applicant certification, TTB disposition, qualifications, and approved label images.

Required handling:

- form/system version;
- TTB ID;
- status;
- issue and expiration dates;
- qualifications;
- approved images;
- visible field labels;
- legacy block mapping.

Do not parse by block number alone because field meanings changed across versions.

### 6. Public Registry record

Publicly available record for approved, expired, surrendered, or revoked COLAs.

Characteristics:

- limited public data under FOIA;
- document images generally available from 1999 forward;
- pre-1999 records may be data-only;
- searches before 1996 may be incomplete;
- image rendering may not preserve actual type size, characters per inch, or contrast.

Use as reference evidence, never as governing precedent.

### 7. Physical-package evidence

Examples:

- bottle photograph;
- can photograph;
- carton or box photograph;
- case or pallet photograph;
- closure or cork photograph;
- in-market shelf photograph.

Characteristics:

- perspective distortion;
- glare, curvature, occlusion, and low resolution;
- may reveal placement and application defects not visible in flat artwork;
- may represent post-approval revision or unauthorized change.

This is a later product mode and should not be assumed by the initial slice.

## Panel taxonomy

At minimum:

- brand/front label;
- back label;
- neck label;
- shoulder label;
- strip label;
- closure/cork/cap text;
- bottle embossing or distinctive bottle detail;
- carton/panel;
- other.

Panel type must be explicit and user-confirmable. Automated detection should remain a suggestion.

## Evidence states

Each artifact should carry one of:

```text
proposed
submitted
corrected
approved
rejected
withdrawn
expired
revoked
surrendered
in_market
unknown
```

## Source states

```text
applicant_upload
ttb_application
ttb_certificate
ttb_public_registry
internal_design_system
physical_capture
third_party_reference
```

## Provenance minimum

```text
Artifact
- artifact_id
- source_type
- evidence_state
- original_filename
- media_type
- byte_size
- sha256
- captured_or_retrieved_at
- source_url_or_case_id
- original_or_derived
- parent_artifact_id
- transformation_manifest
- physical_dimensions
- pixel_dimensions
- declared_panel_type
- confirmed_panel_type
```

## Important distinctions

- Physical dimensions are not pixel dimensions.
- A label image is not the application field value.
- A supporting PDF is not evidence of the claim until linked to that claim.
- A public approved example is not precedent.
- A derived crop is not the immutable original.
- OCR text is an observation, not authoritative truth.

## Initial corpus buckets

For the first wine-focused corpus, collect:

- table red wine;
- table white wine;
- rosé;
- sparkling wine;
- dessert wine;
- fruit wine/cider;
- flavored wine;
- domestic and imported examples;
- front, back, and neck labels;
- flat artwork and approved public-registry images;
- clear and degraded examples;
- matching and intentionally mismatched application facts.
