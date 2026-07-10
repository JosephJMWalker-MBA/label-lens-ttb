# Lean Code Architecture

## Objective

Build a complete, testable verification system without creating a bulky framework or premature platform.

The codebase should optimize for:

- small modules with one responsibility
- explicit typed contracts
- pure functions for deterministic logic
- dependency injection only at external boundaries
- minimal third-party dependencies
- vertical slices that remain runnable after each commit
- deletion and replacement of components without cascading rewrites

## Architectural Rule

The application has one primary use case:

> Turn uploaded label evidence and expected application fields into an explainable verification report.

Everything in the submission must directly support that use case, its testing, or its safe operation.

## Minimal Runtime Flow

```text
UploadInput
  -> validateUpload
  -> preprocessImage
  -> recognizeText
  -> extractFields
  -> compareFields
  -> applyRules
  -> governReport
  -> VerificationReport
```

Batch processing calls the same single-label use case repeatedly through a bounded queue. It does not introduce a second verification pipeline.

## Source Layout

```text
src/
  app/
    page.tsx
    api/analyze/route.ts

  features/
    review/
      ReviewWorkspace.tsx
      review-machine.ts
    batch/
      BatchQueue.tsx
      batch-runner.ts
    coach/
      CoachPanel.tsx
      next-guidance.ts

  domain/
    label/
      label.types.ts
      label.schema.ts
    verification/
      finding.types.ts
      report.types.ts
      verify-label.ts
    rules/
      rule.types.ts
      registry.ts
      brand.rule.ts
      alcohol.rule.ts
      net-contents.rule.ts
      warning.rule.ts

  pipeline/
    upload/
      validate-upload.ts
    image/
      preprocess-image.ts
      image-quality.ts
    ocr/
      ocr-provider.ts
      recognize-text.ts
      consensus.ts
    extraction/
      extract-fields.ts
      parsers/
        alcohol.parser.ts
        net-contents.parser.ts
        warning.parser.ts
    governance/
      govern-report.ts
      thresholds.ts

  infrastructure/
    ocr/
      local-ocr-provider.ts
    evidence/
      evidence-store.ts
      ephemeral-evidence-store.ts
    telemetry/
      pipeline-timing.ts

  shared/
    result.ts
    errors.ts
    ids.ts
```

## Dependency Direction

```text
UI -> use case -> domain
             -> pipeline ports
infrastructure -> pipeline ports
```

The domain must not import:

- React or Next.js
- storage SDKs
- OCR libraries
- HTTP clients
- environment variables

The OCR provider may return text evidence and geometry. It must not return compliance findings.

## Core Interfaces

Keep interfaces narrow.

```ts
interface OcrProvider {
  recognize(image: PreparedImage): Promise<OcrEvidence>;
}

interface EvidenceStore {
  saveOriginal(input: EvidenceInput): Promise<EvidenceRef>;
  saveArtifact(ref: EvidenceRef, artifact: EvidenceArtifact): Promise<void>;
}

interface VerificationRule {
  id: string;
  version: string;
  evaluate(context: RuleContext): VerificationFinding;
}
```

Do not create repositories, services, managers, factories, controllers, or adapters unless two implementations genuinely exist or a boundary must be tested independently.

## Simplicity Rules

1. Prefer a pure function over a class.
2. Prefer a discriminated union over inheritance.
3. Prefer one orchestration function over an event bus.
4. Prefer local state over a global state library.
5. Prefer native platform APIs over a dependency.
6. Prefer server-side processing over exposing secrets or model endpoints to the browser.
7. Do not add a database until persistence is required by the selected deployment mode.
8. Do not build authentication, COLA integration, or production administration for the take-home.
9. Do not combine OCR, parsing, matching, and compliance decisions in one function.
10. Keep files small enough that their purpose is evident from the name and exported API.

## Error Model

Expected failures return typed results; unexpected failures throw and are converted at the HTTP boundary.

```ts
type PipelineResult<T> =
  | { ok: true; value: T; warnings: PipelineWarning[] }
  | { ok: false; error: PipelineError; recoverable: boolean };
```

Avoid `try/catch` in every module. Catch errors at external boundaries and where recovery is possible.

## Test Placement

Tests live beside deterministic modules where practical:

```text
warning.rule.ts
warning.rule.test.ts
```

End-to-end fixtures live under:

```text
tests/fixtures/
tests/e2e/
tests/evaluation/
```

Each vertical slice must include tests before the issue is closed.

## Vertical Implementation Slices

### Slice 0 — Healthy Scaffold

- valid Next.js application
- lint, typecheck, test, and build commands
- one accessible page
- CI workflow

### Slice 1 — Typed Review Shell

- expected-field schema
- upload validation
- image preview
- accessible workflow shell
- no OCR yet

### Slice 2 — Deterministic Verification Core

- normalization
- field comparison
- rule registry
- warning rule
- fixture-driven unit tests

### Slice 3 — Real OCR Pipeline

- image preprocessing
- local OCR provider
- field parsers
- evidence and confidence output
- no LLM requirement

### Slice 4 — End-to-End Single Label

- API orchestration
- live results dashboard
- explainable findings
- graceful quality and OCR failures
- performance timings

### Slice 5 — Batch and Camera Intake

- multiple image selection
- mobile camera capture input
- bounded processing queue
- progressive results
- exception-first review

### Slice 6 — Audit and Kaizen

- configurable evidence retention
- immutable original hash
- pipeline provenance
- evaluation command and scorecard

### Slice 7 — Coach and Progress

- deterministic next-step guidance
- completed-label count
- approved management messages
- no generative-policy behavior

### Slice 8 — Submission Hardening

- accessibility audit
- security checks
- performance benchmark
- deployed URL
- screenshots and final README

## Commit Discipline

Each commit should complete one coherent capability and leave the repository runnable.

Good:

```text
feat: define verification domain contracts
feat: add government warning rule with fixtures
feat: connect local OCR evidence to field parsers
```

Avoid:

```text
feat: build backend
fix stuff
final changes
```

## Definition of Elegant

Elegant code is not the shortest possible code. It is code where:

- responsibilities are obvious
- changes remain local
- behavior is testable without the network
- external tools are replaceable
- uncertainty is represented explicitly
- the complete workflow is easy to trace

The submission should feel smaller than the problem it solves because the boundaries are well chosen.