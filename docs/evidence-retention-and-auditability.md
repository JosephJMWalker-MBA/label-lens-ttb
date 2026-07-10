# Evidence Retention and Auditability

## Decision

Uploaded label images are source evidence for OCR and verification. When retention is enabled, the original image and its derived artifacts must be preserved in a controlled evidence record so system performance, reviewer decisions, and future model changes can be audited.

Retention is not unlimited by default. The deployment owner must define purpose, duration, access, and deletion policy.

## Why Preserve the Original Image

Without the original image, an implementer cannot reliably answer:

- Was the OCR output faithful to the submitted evidence?
- Did preprocessing improve or distort the image?
- Was a false pass caused by OCR, parsing, normalization, or a rule?
- Did a later pipeline version perform better on the same evidence?
- Was a human correction justified?
- Can a production decision be reproduced?

The original image is the immutable reference point for the complete evidence chain.

## Evidence Record

Each processed label should receive a generated, non-semantic `evidenceId` and a structured manifest.

```json
{
  "evidenceId": "ev_01J...",
  "batchId": "batch_01J...",
  "sourceFilename": "IMG_4821.jpg",
  "storedObjectKey": "evidence/2026/07/ev_01J.../original.jpg",
  "sha256": "...",
  "mimeType": "image/jpeg",
  "sizeBytes": 2841120,
  "capturedAt": null,
  "uploadedAt": "2026-07-10T00:00:00Z",
  "retentionClass": "evaluation-90d",
  "pipelineVersion": "0.1.0",
  "ruleSetVersion": "2026.07.1",
  "ocrEngineVersions": ["paddleocr-x", "tesseract-y"],
  "status": "NEEDS_REVIEW"
}
```

## Storage Layout

Use stable identifiers rather than human-entered label text in object names.

```text
evidence/
  YYYY/
    MM/
      <evidenceId>/
        original.<ext>
        normalized.png
        preprocess-manifest.json
        ocr-primary.json
        ocr-secondary.json
        extraction.json
        verification-report.json
        reviewer-decision.json
        audit-events.jsonl
```

The original file must never be overwritten. Derived artifacts are versioned or replaced only with an accompanying audit event.

## Integrity and Chain of Custody

At ingestion:

1. Generate `evidenceId`.
2. Compute SHA-256 of the exact uploaded bytes.
3. Validate MIME type and image decoding.
4. Record upload timestamp and source context.
5. Store the immutable original.
6. Record every derived artifact with pipeline and model versions.

At later audit:

- Recompute the original hash.
- Verify it matches the ingestion manifest.
- Identify the exact pipeline, rule set, and OCR versions used.
- Reproduce the report where dependencies remain available.

## Retention Classes

Suggested configurable classes:

| Class | Purpose | Example duration |
|---|---|---:|
| `ephemeral` | Public prototype/default privacy mode | Delete after processing or within 24 hours |
| `evaluation-90d` | Controlled pilot and error analysis | 90 days |
| `approved-fixture` | Human-approved regression/training evidence | Until explicitly retired |
| `case-record` | Future production record governed by agency policy | Policy-defined |

Durations are deployment policy, not hard-coded application behavior.

## Privacy and Security Controls

When persistent retention is enabled:

- Encrypt objects in transit and at rest.
- Keep storage private; never expose public object URLs.
- Use short-lived, scoped access tokens when images must be viewed.
- Separate metadata access from image access where practical.
- Apply least-privilege roles for reviewer, evaluator, administrator, and trainer.
- Log image access, export, retention changes, and deletion.
- Do not include applicant names, brand names, OCR text, or other sensitive content in object keys.
- Strip unnecessary EXIF metadata unless capture metadata is explicitly required and approved.
- Prevent cross-tenant or cross-batch object access.
- Make backup retention and deletion behavior explicit.

## Audit Events

Append-only events should include:

```json
{
  "eventId": "evt_01J...",
  "evidenceId": "ev_01J...",
  "eventType": "REVIEWER_CORRECTION",
  "occurredAt": "2026-07-10T00:04:21Z",
  "actorType": "human",
  "actorId": "pseudonymous-user-id",
  "pipelineVersion": "0.1.0",
  "details": {
    "field": "alcoholContent",
    "previousValue": "43%",
    "confirmedValue": "45%",
    "reasonCode": "OCR_MISREAD"
  }
}
```

Audit logs should be append-only and should avoid duplicating full image or OCR content unnecessarily.

## Human Review and Training Use

A retained image does not automatically become training data.

Promotion path:

```text
Retained evidence
  -> human correction
  -> quality review
  -> consent/policy eligibility check
  -> approved fixture or training candidate
  -> versioned dataset
```

Training and evaluation datasets must maintain provenance back to the evidence record while using appropriately restricted access.

## Public Prototype Behavior

For the publicly deployed take-home prototype:

- Default to ephemeral processing.
- Clearly disclose whether an image is retained.
- Do not silently retain public uploads for training.
- Provide controlled sample fixtures for repeatable evaluation.
- If an opt-in audit mode is demonstrated, label it clearly and apply a short retention period.

## Backup Policy

Backups must follow the same governance as primary storage:

- Encrypted
- Access-controlled
- Included in retention and deletion policy
- Tested for restoration
- Documented recovery point and recovery time targets

Deleting a primary object while retaining it indefinitely in backup is not compliant deletion.

## Required Tests

- Original upload hash remains stable after processing.
- Original object is immutable.
- Derived artifacts reference correct pipeline versions.
- Unauthorized roles cannot retrieve images.
- Signed access expires.
- One batch cannot access another batch's objects.
- Retention expiration deletes primary and governed backup copies.
- Deletion emits an audit event.
- Audit logs cannot be silently overwritten.
- Public prototype does not retain uploads when ephemeral mode is active.

## Governing Principle

Preserve enough evidence to reproduce and improve the system, but retain no data without a defined purpose, owner, protection level, and deletion rule.
