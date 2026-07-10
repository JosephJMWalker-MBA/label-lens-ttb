# Submitter Pre-Check Workflow

Status: product hypothesis grounded in TTB workflow research
Date: 2026-07-10

## Primary user

A producer, importer, compliance consultant, internal reviewer, or authorized submitter preparing a COLA package before government submission.

## Job to be done

Upload a proposed application package, compare declared facts with visible and supporting evidence, correct discrepancies, and export a traceable readiness report before an authorized user certifies and submits the application.

## Product boundary

Label Lens does not submit to TTB, certify legal compliance, or issue an approval. It prepares evidence and findings for a human decision.

## Inputs

- application facts entered manually or imported from a structured source;
- proposed label artwork or submission-ready label images;
- printed physical dimensions;
- label/panel type;
- formula, SOP, lab, pre-import, translation, or cover-letter evidence;
- prior approved COLA where relevant;
- optional notes from an internal reviewer.

## Workflow

### 1. Create case

Capture:

- product category;
- domestic/imported source;
- application type;
- permit/registry identity;
- serial number;
- prior TTB ID where relevant.

### 2. Add declared facts

For the first wine slice:

- brand name;
- fanciful name;
- class/type;
- net contents;
- alcohol content;
- vintage;
- grape varietal;
- appellation;
- formula reference;
- sulfite-related evidence where applicable.

### 3. Upload and classify evidence

The user uploads original artifacts. Label Lens proposes artifact and panel types, but the user confirms them.

The system preserves originals and records any generated derivatives.

### 4. Extract observations

The analyzer returns evidence-only observations:

- observed text;
- location or panel;
- confidence;
- source artifact;
- bounding region where available;
- unresolved ambiguity.

Extraction does not produce regulatory approval language.

### 5. Run deterministic checks

First useful checks include:

- expected field present on the relevant label/panel;
- declared and observed brand name agree after conservative normalization;
- declared and observed fanciful name agree;
- declared and observed net contents normalize to the same quantity;
- declared and observed alcohol content normalize to the same ABV;
- wine vintage requires an appellation;
- declared varietal and appellation match visible evidence;
- government health warning is present and exact where required;
- supporting formula/SOP identifiers match the application;
- file count, type, size, and panel metadata satisfy the selected submission profile;
- image is readable at declared physical dimensions;
- one label/panel per submission derivative.

### 6. Classify findings

```text
observation
application_data_mismatch
label_content_defect
missing_supporting_evidence
ambiguous_human_review
technical_submission_issue
```

For field mismatches, distinguish:

- reconcile application to label;
- revise label;
- human interpretation required.

### 7. Human disposition

A human reviewer accepts, rejects, edits, or defers each finding.

No machine-generated state is named Approved.

### 8. Readiness result

Recommended internal states:

```text
Draft
Evidence incomplete
Checks running
Needs applicant revision
Ready for internal reviewer
Ready for authorized submitter
Submitted externally
```

`Ready for authorized submitter` means the documented pre-check is complete. It is not a legal conclusion.

### 9. Export

The user receives:

- case summary;
- declared-versus-observed comparison table;
- unresolved findings;
- accepted corrections;
- evidence links;
- rule and source versions;
- artifact hashes and transformation history;
- reviewer disposition;
- submission preparation checklist.

## Success measures

- fewer TTB Needs Correction returns;
- fewer application/label transcription mismatches;
- reduced time to assemble a complete package;
- lower human re-entry burden;
- findings resolved before submission;
- reproducible evidence trail;
- zero machine claims of official approval.

## Smallest valid next slice

One wine label image plus manually entered expected fields:

1. preserve original image;
2. extract brand name, alcohol content, and net contents;
3. compare observations with expected values;
4. run the strict government-warning rule;
5. display explainable findings separately from human disposition;
6. export a traceable report.

This reuses the current deterministic core while keeping intake and broader workflow provisional.
