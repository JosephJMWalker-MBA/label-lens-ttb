# Submission Scope and Definition of Done

## Purpose

Label Lens is intentionally designed as a governed, extensible verification system. The take-home submission, however, must remain a finished and testable proof-of-concept.

The brief explicitly prefers a working core application with clean code over ambitious but incomplete features. This document protects the submission from scope drift while preserving the broader architecture as a documented roadmap.

## What the Brief Requires

The submitted repository must include:

- all source code;
- a README with setup and run instructions;
- a brief explanation of the approach, tools, and assumptions;
- a deployed application URL;
- a working prototype the reviewers can test;
- clear error handling;
- evidence of attention to stakeholder requirements.

## Primary User Story

> As a compliance agent, I can upload label artwork, provide or select the expected application data, run a real analysis, and receive an explainable field-by-field comparison in less than five seconds for routine cases.

## Submission-Critical Workflow

The release candidate is not complete until the following path works end to end:

1. Open the deployed application.
2. Select one or more label images.
3. Provide expected application fields.
4. Validate the upload and assess image quality.
5. Run real OCR/extraction.
6. Parse the observed label fields.
7. Normalize values according to field-specific rules.
8. Apply deterministic verification rules.
9. Display PASS, WARN, FAIL, or NEEDS_REVIEW findings with evidence and reasons.
10. Permit the reviewer to correct uncertain extracted values.
11. Export a structured verification report.

## Supported Fields for the Submission

The prototype must support the common fields named in the brief:

- brand name;
- class/type designation;
- alcohol content;
- net contents;
- bottler/producer name and address;
- country of origin for imports;
- Government Health Warning Statement.

## Beverage-Type Awareness

Label requirements vary by beverage type. The prototype must therefore include an explicit beverage category:

- distilled spirits;
- wine;
- malt beverage.

The submission does not need exhaustive regulatory coverage for every subtype. It must:

- avoid applying one universal rule set to all beverages;
- show conditional field requirements;
- identify unsupported or unimplemented rules honestly;
- version the rule set;
- keep beverage-specific rules extensible.

The initial high-confidence demonstration path should use distilled spirits because the brief supplies a complete example.

## Required Test Labels

The deployed application must be testable without requiring reviewers to source their own data.

Include at minimum:

1. **Compliant distilled spirits label**
   - OLD TOM DISTILLERY
   - Kentucky Straight Bourbon Whiskey
   - 45% Alc./Vol. (90 Proof)
   - 750 mL
   - correct Government Warning

2. **Semantic-equivalence label**
   - capitalization and punctuation differences that should normalize to a match;

3. **Strict warning failure**
   - title-case or materially altered warning heading/text;

4. **Image-quality challenge**
   - angle, glare, low contrast, or blur that should trigger review rather than a false pass;

5. **Import example**
   - country-of-origin requirement present or missing.

Each sample must have ground-truth expected fields and expected findings.

## Definition of Done

### Correctness

- [ ] Every required common field is represented in the data model.
- [ ] Distilled spirits sample works end to end.
- [ ] Semantic brand equivalence is handled deterministically.
- [ ] The Government Warning uses strict verification rules.
- [ ] Missing or unreadable evidence cannot silently pass.
- [ ] Uncertainty is surfaced as NEEDS_REVIEW.
- [ ] Original and normalized evidence remain visible.

### Performance

- [ ] Routine single-label processing has a p95 target below five seconds in the deployed environment.
- [ ] Stage timings are recorded.
- [ ] Slow stages are visible in the diagnostic report.
- [ ] Batch processing is asynchronous and one failure does not halt the batch.

### User Experience

- [ ] The next action is visually obvious on every screen.
- [ ] The workflow is keyboard accessible.
- [ ] Status is not communicated by color alone.
- [ ] Error messages explain the recovery action.
- [ ] The agent can review exceptions without reopening successful fields.
- [ ] Onboarding guidance can be dismissed and does not obstruct the task.

### Security and Privacy

- [ ] No secrets are exposed to the browser.
- [ ] Upload size and MIME type are validated.
- [ ] The public prototype has an explicit retention mode.
- [ ] Uploads are not silently used for training.
- [ ] Logs avoid raw images, full OCR content, and sensitive identifiers.
- [ ] Any retained evidence is linked to an evidence ID, integrity hash, and retention class.

### Testing

- [ ] Unit tests cover parsers, normalization, rule decisions, and schemas.
- [ ] Integration tests cover the complete analysis pipeline.
- [ ] Component tests cover upload, form, results, and error states.
- [ ] End-to-end test covers upload through report export.
- [ ] Fixture evaluation detects false passes and regressions.
- [ ] Performance and accessibility checks run in CI.

### Submission Artifacts

- [ ] README explains the problem, approach, setup, deployment, assumptions, and limitations.
- [ ] Deployed URL is prominent.
- [ ] Test/sample data is easy to find.
- [ ] Architecture diagram is included.
- [ ] Trade-offs distinguish prototype decisions from production requirements.
- [ ] Repository contains a clean, reviewable commit history.
- [ ] The deployed application can be tested without private hardware access.

## Submission Scope

### Must Ship

- single-label real analysis;
- multi-image batch intake and queue;
- expected-field entry;
- OCR-first extraction;
- deterministic field comparison;
- strict warning validation;
- image-quality review gates;
- explainable results;
- human correction;
- exportable report;
- supplied test fixtures;
- deployed reviewer-accessible application;
- complete documentation and automated tests.

### May Ship if Core Is Stable

- capture-session camera workflow;
- progress counts;
- workflow coach;
- management guidance configuration;
- retained evidence audit mode;
- engineering/evaluation dashboard.

### Document, Do Not Block Submission On

- COLA integration;
- agency identity integration;
- full FedRAMP authorization package;
- exhaustive beer, wine, and spirits regulation coverage;
- autonomous model retraining;
- production case-record retention;
- large-scale distributed queue infrastructure;
- full management analytics platform.

## Architectural Interpretation of “Creative Problem-Solving”

Creative problem-solving is demonstrated by:

- converting stakeholder interviews into measurable requirements;
- separating probabilistic extraction from deterministic compliance decisions;
- providing real batch and exception-first review;
- measuring performance against the five-second adoption threshold;
- retaining evidence and versions for reproducibility;
- building a governed Kaizen loop;
- preserving a path to local, firewall-compatible inference.

Creativity must not make the primary workflow harder to understand.

## Release Gate

No roadmap feature is allowed to delay the deployed end-to-end core.

The application is ready to submit when a first-time reviewer can open the URL, analyze the supplied sample labels, understand every finding, recover from an error, and reproduce the project locally from the README.
