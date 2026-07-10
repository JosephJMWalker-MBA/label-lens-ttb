# Government Review Workflow

Status: research reconstruction
Date: 2026-07-10
Scope: TTB COLAs Online workflow and public registry

## Purpose

This document reconstructs the end-to-end federal label application workflow from official TTB training materials and live system pages. It separates historical system behavior from current governing authority.

## Actors and authority

### External User

A registered industry member who may create, submit, withdraw, and surrender applications.

### External Preparer/Reviewer

May create and review applications but cannot submit, withdraw, or surrender them.

### TTB Label Specialist

Reviews submitted applications and label evidence, requests corrections, proposes limited field reconciliations, and issues final dispositions.

### Important boundary

Label Lens may assist with evidence extraction, deterministic comparison, correction preparation, and reporting. It must not replace the applicant's legal certification or TTB's regulatory authority.

## Reconstructed workflow

### 1. Preflight routing

The applicant determines whether the work is:

- a new application;
- an allowable revision to an approved label;
- a resubmission after rejection;
- or an exemption request.

The application also identifies product category, domestic/imported source, application type, and prior TTB identifiers where applicable.

### 2. Enter application facts

Relevant structured fields include:

- serial number;
- permit or registry number;
- DBA or trade name;
- brand name;
- fanciful name;
- product class/type;
- source of product;
- formula, SOP, lab, or pre-import references;
- net contents;
- alcohol content;
- wine vintage;
- grape varietal;
- appellation;
- specialist notes;
- and distinctive-bottle information.

These values become declared facts that may later be compared with visible label evidence.

### 3. Upload label images

Historical TTB guidance describes:

- up to 10 label-image files;
- one label or panel per image;
- an attachment type for each image;
- printed physical width and height;
- image readability checks at actual dimensions;
- and legacy JPG/TIFF, RGB, and file-size constraints.

Printed physical dimensions are distinct from pixel dimensions.

Label Lens should preserve the immutable original, generate submission derivatives when necessary, and record every crop, conversion, compression, and dimension change.

### 4. Upload supporting attachments

Examples include:

- formulas;
- SOPs;
- lab analyses;
- pre-import letters;
- cover letters;
- and other evidence.

Historical guidance allows DOC, TXT, PDF, JPG, and TIFF, with up to 10 files and a legacy 750 KB per-file limit.

Each attachment should be linked to the exact application fact, claim, or requirement it supports.

### 5. Verify application

The system presents the application, label images, and supporting attachments for consolidated review.

The applicant must verify image readability and certify under penalty of perjury that the application and label representations are true, correct, and compliant.

Label Lens may prepare the evidence and identify discrepancies, but the authorized human remains responsible for certification.

### 6. Submit

Only an authorized External User may submit. A preparer/reviewer may save the application for later submission by an authorized user.

Submission produces a confirmation containing identifiers such as TTB ID, permit/registry number, and serial number.

### 7. TTB review state machine

The official lifecycle includes:

```text
Saved not submitted
→ Received
→ Assigned
→ Approved
```

Correction loop:

```text
Assigned
→ Needs Correction
→ Corrected
→ Assigned
→ Approved
```

Other outcomes:

```text
Rejected
Withdrawn
Expired
Revoked
Surrendered
Conditionally Approved
```

`Approved` is a domain transition: the application becomes a certificate.

### 8. Needs Correction

TTB returns a reason, additional information, specialist comments, and a limited set of editable application areas.

Historical guidance describes a 30-day response window and warns that corrections may need to be completed in one session. These operational deadlines must be revalidated before being encoded as current rules.

Recommended Label Lens finding record:

```text
CorrectionFinding
- reason
- additional_information
- specialist_comments
- affected_step
- affected_field
- edit_permitted
- proposed_correction
- resolution
- deadline
```

### 9. Conditionally Approved

TTB may propose application-data changes when the submitted label is clear and the rest of the package is approvable.

Eligible fields:

- Brand Name;
- Fanciful Name;
- Appellation for wine;
- Grape Varietal for wine.

Transitions:

```text
Conditionally Approved
├── Accept → Approved
├── Decline → Needs Correction
└── No action within 7 days → Needs Correction
```

TTB does not alter the label. It only proposes reconciliation of application fields to the visible label.

This validates a core Label Lens function: extract visible facts, compare them with declared facts, and classify the result as application reconciliation, label revision, or human review required.

### 10. Durable output

The printable e-filed COLA contains:

- application identity;
- applicant and facility information;
- product classification;
- declared label facts;
- formula and supporting references;
- applicant certification;
- TTB disposition and qualifications;
- and approved label images with actual dimensions.

Block meanings changed across system versions, so parsing must use visible labels, form version, and record date rather than block number alone.

### 11. Post-submission case view

The Application Detail page consolidates status, application facts, labels, attachments, certification, and status-dependent actions.

Examples:

```text
Received → Withdraw Application
Rejected → Resubmit Application
Approved → Surrender COLA
Needs Correction → Make Corrections
Approved/e-filed → Printable Version
```

Actions should be generated from case state rather than displayed universally.

## Internal Label Lens workflow

The product should maintain a separate internal state model:

```text
Draft
Evidence incomplete
Checks running
Needs applicant revision
Ready for reviewer
Ready for authorized submitter
Submitted externally
```

This must remain distinct from official TTB status.

## Authority hierarchy

1. Current statute and regulation
2. Current official TTB guidance and forms
3. Current live system behavior
4. Historical TTB manuals and announcements
5. Public COLA examples
6. Label Lens inference

Historical manuals are operational evidence, not automatically current authority.

## Sources reviewed

- COLAs Online User Manual, version 3.11.3, dated June 11, 2015
- Create an Application
- Submit Application
- Verify Application
- Correct Application
- Prepare Images for Upload
- Upload Label Images
- Upload Other Attachments
- Printable E-Filed COLA
- eApplication Statuses in COLAs Online
- Conditionally Approved Status in COLAs Online, posted June 13, 2019
- Application Detail
- Public COLA Registry User Manual
- Live Public COLA Registry Basic and Advanced Search pages, reviewed 2026-07-10
