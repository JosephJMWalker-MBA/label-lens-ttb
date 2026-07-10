# Kaizen Evaluation Loop

## Purpose

Label Lens TTB should be testable, measurable, and improvable at every stage of the analysis pipeline.

The goal is not to claim perfect AI performance. The goal is to give implementers a repeatable way to measure results, identify failure modes, tune the pipeline, and prove that each change improves the system without causing regressions.

This document defines the continuous-improvement loop for the project.

## Principle

> No improvement without a baseline. No baseline without repeatable tests. No tuning without evidence.

The pipeline should always produce an explainable verification report, and every report should be comparable against expected ground truth.

## Pipeline Under Test

```text
Image Upload
  -> Image Validation
  -> Image Preprocessing
  -> OCR / Text Extraction
  -> Field Parsing
  -> Normalization
  -> Rule Engine
  -> Confidence Scoring
  -> Verification Report
```

Each stage should have its own inputs, outputs, metrics, and failure modes.

## Evaluation Corpus

Create a versioned corpus of labels and expected outcomes.

```text
tests/fixtures/labels/
  bourbon-clean-001/
    label.png
    expected-fields.json
    expected-report.json
    notes.md

  bourbon-glare-002/
    label.png
    expected-fields.json
    expected-report.json
    notes.md

  bourbon-angle-003/
    label.png
    expected-fields.json
    expected-report.json
    notes.md
```

Each fixture should include:

- Source image
- Expected application fields
- Human-reviewed ground truth observed fields
- Expected verification findings
- Known image conditions
- Known failure risks
- Reviewer notes

## Minimum Fixture Set

The first evaluation corpus should include at least these cases:

1. Clean distilled spirits label
2. Label with glare
3. Label photographed at an angle
4. Label with lowercase or title-case government warning heading
5. Label with missing warning text
6. Label with correct warning text but uncertain formatting
7. Brand capitalization mismatch only
8. Brand punctuation mismatch only
9. ABV/proof equivalent values
10. Net contents spacing/capitalization variations

## Result Report Shape

Every analysis run should produce a structured report:

```json
{
  "fixtureId": "bourbon-clean-001",
  "pipelineVersion": "0.1.0",
  "analyzerProvider": "local-ocr",
  "processingTimeMs": 418,
  "observedFields": {},
  "findings": [],
  "metrics": {
    "fieldExtractionAccuracy": 0.92,
    "requiredFieldRecall": 1.0,
    "falsePassCount": 0,
    "falseFailCount": 1,
    "needsReviewCount": 2
  },
  "failureModes": [],
  "notes": []
}
```

## Metrics

### Field Extraction Metrics

- Brand name extracted correctly
- Class/type extracted correctly
- Alcohol content extracted correctly
- Net contents extracted correctly
- Producer/address extracted when visible
- Country of origin extracted when visible
- Government warning detected correctly

Recommended scoring:

```text
1.0 = exact or accepted normalized match
0.5 = partially correct but needs review
0.0 = wrong or missing
```

### Verification Metrics

- True pass: system passed a field that should pass
- True fail: system failed a field that should fail
- False pass: system passed a field that should fail
- False fail: system failed a field that should pass
- Needs review: system correctly refused to overclaim

False passes are the most serious error class because they could allow a compliance issue through.

### Performance Metrics

Track stage-level timing:

```text
validationMs
preprocessingMs
ocrMs
fieldParsingMs
normalizationMs
ruleEngineMs
reportGenerationMs
totalMs
```

Sarah's stakeholder requirement creates a target: total analysis should aim for under 5 seconds for ordinary single-label review.

## Kaizen Scorecard

Each tuning change should update a scorecard.

```text
Date:
Pipeline version:
Change tested:
Fixture count:
Overall extraction accuracy:
False pass count:
False fail count:
Needs review count:
Median processing time:
P95 processing time:
Known regressions:
Decision: adopt / revise / reject
```

A change should not be adopted merely because one label improves. It should improve the corpus or improve a critical failure mode without introducing unacceptable regressions.

## Tuning Workflow

1. Add or select fixture labels.
2. Run the current baseline.
3. Record metrics.
4. Make exactly one pipeline change.
5. Re-run the same fixture set.
6. Compare before/after results.
7. Document the decision.
8. Commit the change only if the evidence supports it.

## Suggested Commands

```bash
npm run test
npm run eval
npm run eval:fixture bourbon-clean-001
npm run eval:compare baseline current
```

These commands should be implemented as the project matures.

## Implementation Targets

### P1

- Add fixture directory structure
- Add evaluation report type
- Add fixture runner script
- Add deterministic parser and rule tests
- Add baseline scorecard markdown file

### P2

- Add stage timing metrics
- Add report comparison utility
- Add regression threshold checks
- Add CI check for false-pass regressions

### P3

- Add visual OCR confidence overlays
- Add implementer tuning dashboard
- Add per-field confusion matrix
- Add model/provider comparison reports

## Quality Gates

The pipeline should fail CI if:

- A known false pass appears in a protected fixture
- Required fields disappear from a clean fixture
- The report schema becomes invalid
- The rule engine begins depending on an LLM or network call
- Total runtime exceeds agreed thresholds for deterministic fixtures

## Kaizen Standard

The standard is not perfection on day one.

The standard is that every improvement is measurable, reversible, and explainable.

Build so an implementer can answer:

1. What changed?
2. Which labels improved?
3. Which labels regressed?
4. Did false passes increase?
5. Did processing time stay acceptable?
6. Should this change be adopted?

That is the improvement loop.