# Product Mode Decision

Status: proposed decision
Date: 2026-07-10

## Decision

Build Label Lens first as a **submitter/internal-reviewer pre-check product** over a shared deterministic evidence and rules core.

Do not begin with direct government-review integration or physical field inspection.

## Primary workflow

A producer, importer, compliance consultant, internal reviewer, or authorized submitter:

1. creates a case;
2. enters or imports expected application facts;
3. uploads proposed label images and supporting evidence;
4. runs explainable checks;
5. resolves discrepancies;
6. exports a traceable readiness report;
7. completes certification and submission outside Label Lens.

## Why this is the first mode

- It provides value without requiring TTB integration.
- It directly targets preventable Needs Correction cycles.
- It fits the evidence-only analyzer and deterministic core already implemented.
- It preserves human legal authority.
- It can be tested with public records, synthetic mismatches, and real submitter artifacts.
- It avoids prematurely designing around unavailable internal-government interfaces.

## Actors

### Primary

- producer;
- importer;
- compliance consultant;
- internal company reviewer;
- authorized submitter.

### Later modes

- government reviewer support;
- post-approval revision comparison;
- physical package or field inspection.

## Inputs

- expected application fields;
- proposed label images or printer proofs;
- printed dimensions and panel types;
- formulas, SOPs, lab analyses, translations, pre-import letters, and cover letters;
- optional prior approved COLA;
- reviewer notes.

## Outputs

- declared-versus-observed comparison;
- technical submission findings;
- missing-evidence findings;
- application-data mismatches;
- label-content defects;
- ambiguity requiring human review;
- accepted corrections and reviewer disposition;
- evidence provenance and transformation history;
- submission-readiness checklist;
- traceable export report.

## Evidence boundary

Label Lens may:

- preserve and classify evidence;
- extract observations;
- normalize comparable values;
- apply versioned deterministic checks;
- explain discrepancies;
- prepare corrections and reports.

Label Lens may not:

- certify the application under penalty of perjury;
- submit as the authorized applicant;
- issue or imply TTB approval;
- replace legal or regulatory judgment;
- treat a prior public COLA as binding precedent.

## Shared core capabilities

- immutable artifact identity;
- provenance and transformation manifests;
- evidence-only extraction;
- conservative normalization;
- declared-versus-observed comparison;
- versioned rule registry;
- explainable findings;
- explicit human disposition;
- auditable exports.

## Mode-specific capabilities

### Pre-check mode

- case assembly;
- readiness workflow;
- applicant correction preparation;
- submission-oriented export.

### Government reviewer support — later

- official package ingestion;
- status and correction history;
- specialist notes;
- agency disposition workflow;
- stronger authority and access controls.

### Physical inspection — later

- camera capture;
- perspective and curvature handling;
- applied-label placement checks;
- comparison against approved certificate evidence.

## Internal status model

```text
Draft
Evidence incomplete
Checks running
Needs applicant revision
Ready for internal reviewer
Ready for authorized submitter
Submitted externally
```

These statuses must remain distinct from official TTB lifecycle states.

## Smallest valid next vertical slice

For one wine label image and manually entered expected fields:

1. preserve the original artifact and hash it;
2. extract brand name, net contents, and alcohol content;
3. compare extracted observations with expected values;
4. run the strict government-warning check;
5. show observation, deterministic finding, and human disposition separately;
6. export a traceable report.

## Deferred decisions

- direct COLAs Online or myTTB integration;
- automated registry harvesting;
- multi-company permissions;
- correction submission;
- physical-package inspection;
- broad wine, spirits, and malt-beverage support in one release.

## Success criteria

- fewer preventable correction returns;
- lower transcription mismatch rate;
- less manual re-entry;
- faster package preparation;
- reproducible evidence trail;
- zero machine-generated claims of official approval.
