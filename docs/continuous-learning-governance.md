# Governed Continuous Learning

## Purpose

Label Lens should improve from reviewed use without silently teaching itself from unverified outputs.

The system uses a governed active-learning loop:

```text
Production inference
  -> low-confidence or corrected cases
  -> human review
  -> candidate training examples
  -> data-quality checks
  -> versioned training dataset
  -> offline fine-tuning
  -> regression and safety evaluation
  -> human approval
  -> staged model promotion
```

## Core Rule

A user correction is evidence, not immediate truth.

No production interaction directly changes model weights, parser rules, confidence thresholds, or compliance policy.

## What Can Learn

### 1. OCR recognition model
Fine-tune on difficult label typography, curved bottle surfaces, glare, low contrast, unusual capitalization, and small warning text.

### 2. Text detection and layout model
Improve detection of text regions, warning blocks, brand-name regions, alcohol content, and net-contents areas.

### 3. Field extraction model
Train a small classifier or sequence-labeling model to map OCR tokens and spatial features to fields such as brand name, class/type, ABV, proof, net contents, producer, origin, and warning statement.

### 4. Confidence calibration
Use reviewed outcomes to calibrate whether reported confidence matches actual correctness.

### 5. Preprocessing policy
Evaluate deskew, thresholding, glare reduction, crop, and scaling parameters against the fixture corpus.

## What Must Not Learn Automatically

- Compliance rules
- Required government-warning text
- Legal thresholds
- Automatic pass/fail policy
- Human-review requirements
- Unreviewed user corrections

These remain versioned, deterministic policy artifacts.

## Feedback Record

Each reviewed field correction should create an immutable record:

```json
{
  "caseId": "uuid",
  "imageHash": "sha256",
  "pipelineVersion": "0.1.0",
  "modelVersion": "ocr-0.1.0",
  "field": "alcoholContent",
  "predicted": "43% Alc./Vol.",
  "corrected": "45% Alc./Vol.",
  "predictionConfidence": 0.71,
  "reviewerDecision": "corrected",
  "reviewReason": "OCR confused 5 with 3",
  "reviewedAt": "ISO-8601",
  "eligibleForTraining": false
}
```

Training eligibility becomes true only after review and data-quality checks.

## Dataset Tiers

- `raw-events`: immutable inference and correction events
- `reviewed-candidates`: human-reviewed examples awaiting quality checks
- `training-approved`: approved, deduplicated, privacy-checked examples
- `holdout-golden`: locked evaluation examples never used for training
- `challenge-set`: glare, skew, low-light, curved-label, tiny-font, and rare-layout cases

## Promotion Gates

A candidate model may be promoted only when it:

1. Improves target metrics on the locked holdout set.
2. Produces no increase in false passes.
3. Does not regress government-warning detection.
4. Meets the response-time budget.
5. Passes security and malformed-input tests.
6. Includes reproducible training metadata.
7. Receives human approval.

## Deployment Strategy

Use model stages:

```text
candidate -> shadow -> canary -> production -> retired
```

- **Shadow:** runs beside production without affecting user results.
- **Canary:** handles a small approved share of traffic.
- **Production:** becomes the default only after measured acceptance.
- **Rollback:** previous model remains immediately available.

## Drift and Learning Triggers

Retraining should be considered when one or more thresholds are crossed:

- Human override rate increases.
- Low-confidence rate increases.
- A specific field's accuracy declines.
- A new label style repeatedly fails.
- Challenge-set performance reveals a recurring weakness.
- Enough reviewed examples accumulate to justify a training cycle.

A trigger opens a training proposal; it does not start autonomous production training.

## Jetson Role

The Jetson can perform local inference and may execute small controlled fine-tuning experiments. Production training artifacts should still be versioned, evaluated, signed, and promoted through the same governance gates.

## Kaizen Record

Every accepted training cycle records:

- Dataset version and provenance
- Model starting checkpoint
- Training configuration and seed
- Metrics before and after
- Per-field confusion and error categories
- Runtime and memory impact
- Known regressions
- Approval decision
- Rollback model

## Guiding Principle

The system may continuously collect evidence and propose improvements. It may not silently redefine truth.