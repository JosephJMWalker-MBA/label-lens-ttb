# Label Lens TTB

> A standalone, compliance-ready reference implementation for fast, explainable alcohol label verification.

Label Lens TTB is a proof-of-concept designed to reduce routine manual verification performed by TTB compliance agents while preserving human judgment for regulatory decisions.

The system is being built around a simple operating principle:

> **AI and OCR may extract evidence. Deterministic rules evaluate that evidence. Human reviewers remain authoritative.**

## Why This Project Exists

TTB reviews approximately 150,000 alcohol label applications each year with a team of 47 agents. Much of that work consists of repetitive comparisons between application data and label artwork:

- Does the brand name match?
- Is the alcohol content correct?
- Are net contents present?
- Is the government warning included and properly formatted?

A prior scanning pilot reportedly took 30–40 seconds per label and was abandoned because agents could review labels faster by eye. For this prototype, performance is therefore part of correctness: a trustworthy result should normally return in under five seconds, with a preferred median below two seconds.

## Product Goal

Reduce routine manual comparison work so compliance agents can spend more time on nuanced review, exceptions, and substantive regulatory judgment.

The system should answer:

1. What does the label image appear to say?
2. What evidence supports that extraction?
3. How does the observed label compare with the expected application data?
4. Which fields pass, warn, fail, or require human review?
5. Why did the system reach each conclusion?
6. Can the result be reproduced and audited later?

## Stakeholder-Derived Requirements

The design is grounded in the discovery notes supplied with the take-home exercise.

### Sarah — Operational Adoption

- Results must return in about five seconds or less.
- The interface must be obvious to agents with widely varying technical comfort.
- Batch uploads should support importer submissions containing hundreds of labels.
- The system should eliminate repetitive verification rather than create another workflow burden.

### Dave — Judgment and Friction

- Human-obvious equivalents such as `STONE'S THROW` and `Stone's Throw` should not be treated as meaningful mismatches.
- Nuance must be preserved rather than reduced to naïve string equality.
- The tool must make the agent's work easier, not force agents to fight another modernization project.

### Jenny — Strict Compliance and Difficult Images

- Government warning language requires strict verification.
- `GOVERNMENT WARNING:` must not be accepted merely because a fuzzy match is close.
- Image quality may include glare, perspective distortion, poor lighting, blur, and curved bottle surfaces.
- Unverifiable formatting should be surfaced honestly for human review.

### Marcus — System Boundaries and Federal Reality

- This is a standalone proof-of-concept, not a COLA integration project.
- The architecture should tolerate restricted outbound network access.
- Cloud APIs must not be mandatory for core operation.
- The prototype should be compliance-ready without pretending to be FedRAMP-authorized or production-certified.

## Core Review Flow

```text
Upload one or many label images
        ↓
Validate image type, size, and integrity
        ↓
Assess image quality
        ↓
Preprocess difficult images
        ↓
Run OCR / local extraction
        ↓
Parse label fields
        ↓
Normalize comparable values
        ↓
Apply versioned compliance rules
        ↓
Apply governance and confidence gates
        ↓
Present an explainable review report
        ↓
Human confirms, corrects, or escalates
```

## Planned Label Fields

The prototype targets the common fields identified in the brief:

- Brand name
- Class/type designation
- Alcohol content
- Net contents
- Name and address of bottler/producer
- Country of origin for imports
- Government Health Warning Statement

Requirements vary by beverage type, so beverage-specific rules are represented as versioned policy rather than hard-coded assumptions scattered throughout the interface.

## Verification Strategy

Not every field should use the same comparison strategy.

### Semantic-Equivalence Rules

Used where human judgment recognizes equivalent presentation:

```text
STONE'S THROW
Stone's Throw
```

The system may normalize case, spacing, apostrophes, and limited punctuation while preserving the original evidence and explaining the normalized pass.

### Exact Statutory Rules

Used where required language or capitalization must be exact:

```text
GOVERNMENT WARNING:
```

Fuzzy matching cannot silently approve mandatory warning language.

### Layout and Formatting Rules

Used for requirements such as heading placement, warning grouping, and visible emphasis. Where image evidence cannot reliably establish bold type, font size, or layout, the result should be `NEEDS_REVIEW`, not a fabricated pass.

### Image-Quality Gates

Blur, glare, perspective, resolution, contrast, and occlusion are measured before OCR output is trusted. Poor-quality evidence should produce an actionable explanation and retake guidance.

## OCR Reliability

OCR is treated as evidence, not truth.

The planned local-first pipeline uses:

- Image-quality assessment
- Multiple preprocessing variants
- OCR output with bounding boxes and confidence
- Primary and secondary recognition where useful
- Consensus and disagreement detection
- Field-specific parsers
- Alternate hypotheses for ambiguous text
- Human review when evidence is insufficient

The deployed application should perform real analysis. Mocks are limited to isolated automated tests and controlled fixtures; they are not presented to users as real results.

## Batch and Camera Workflows

The same verification pipeline should support multiple intake adapters:

- Single image upload
- Multiple image upload
- Folder or archive intake
- Camera capture sessions
- Future scanner/watch-folder ingestion

Batch processing should be queue-based and resilient: one failed label must not stop the remaining batch. Results should appear progressively, and the review experience should prioritize exceptions.

```text
300 submitted
289 verified
8 need review
3 failed
```

The agent should review the 11 exceptions—not reopen all 300 routine labels.

## Workflow Coach and Progress

A step-aware coach will:

- Introduce the tool during first use
- Explain the next required action
- Reduce guidance as the user gains experience
- Surface approved SOP guidance at the moment it is relevant
- Communicate management-approved notices without inventing policy

Users should also be able to see meaningful progress, including completed labels, exceptions resolved, review time, and learning milestones. Throughput metrics must never encourage careless approval or obscure quality.

## Architecture Principles

- **Evidence over inference**
- **Deterministic validation over probabilistic approval**
- **Human authority over automated confidence**
- **Local-first operation where practical**
- **Replaceable analyzers behind stable interfaces**
- **Explicit uncertainty rather than hidden failure**
- **Small modules with one responsibility**
- **No direct browser-to-model-provider calls**
- **No COLA coupling in the prototype**
- **Documentation and tests are part of the system**

A simplified architecture:

```text
Browser
  ↓ HTTPS
Application Server
  ├── Intake and validation
  ├── Workflow orchestration
  ├── Verification report API
  └── Coach / progress interface
          ↓
Analyzer Interface
  ├── Local OCR / Jetson service
  └── Optional bounded enhancement provider
          ↓
Field Parsers
          ↓
Versioned Rule Registry
          ↓
Governance Engine
          ↓
Explainable Findings
```

## Security and Compliance Readiness

This repository distinguishes **compliance-ready** from **compliance-certified**.

Prototype boundaries:

- No direct COLA integration
- No production identity federation
- No claim of FedRAMP authorization
- No silent training on user uploads
- No secrets exposed to the browser
- No mandatory outbound model API dependency

Security design includes:

- Server-side secrets
- HTTPS/TLS in transit
- Least-privilege access
- Configurable retention classes
- Private encrypted evidence storage where retention is enabled
- Non-semantic evidence identifiers
- Immutable original-image hashes
- Append-only audit events
- Model, parser, rule-set, and pipeline version provenance

The public prototype should default to ephemeral processing unless a retained test fixture is explicitly selected.

## Evidence and Auditability

When retention is authorized, every analysis can be traced to:

```text
Immutable original image
        ↓
SHA-256 integrity hash
        ↓
Preprocessing manifest
        ↓
OCR results and geometry
        ↓
Extracted fields
        ↓
Verification findings
        ↓
Reviewer correction or decision
        ↓
Append-only audit history
```

This allows an implementer to replay a retained fixture against a newer pipeline and measure whether performance actually improved.

## Continuous Improvement and Model Governance

The system does not silently retrain itself.

Reviewed corrections become candidate evidence. Candidate evidence must pass quality review, policy review, dataset versioning, holdout evaluation, regression testing, and human approval before any updated model or rule set is promoted.

```text
Production use
  ↓
Human-reviewed corrections
  ↓
Candidate fixture or training item
  ↓
Versioned evaluation corpus
  ↓
Offline tuning or training
  ↓
Regression and safety gates
  ↓
Human-approved promotion
```

False passes—especially on critical statutory requirements—are weighted more heavily than ordinary extraction misses.

## Kaizen Evaluation

Every change should answer:

- What changed?
- Why was it changed?
- Did field accuracy improve?
- Did false passes increase?
- Did latency regress?
- Did difficult-image performance improve?
- Should the change be accepted or rejected?

The evaluation harness will track field-level accuracy, character/word accuracy, warning-statement detection, false-pass rate, review rate, runtime by stage, and category-specific performance across clean, blurry, angled, reflective, curved, dark, and low-resolution labels.

## Performance Budgets

Initial targets:

| Stage | Target |
|---|---:|
| Upload validation | < 100 ms |
| Image preprocessing | < 500 ms |
| OCR / extraction | < 2,500 ms |
| Field parsing | < 250 ms |
| Normalization | < 100 ms |
| Compliance rules | < 100 ms |
| Governance and report generation | < 500 ms |
| Preferred median end-to-end | < 2 seconds |
| Required p95 end-to-end | < 5 seconds |

A fast but unreliable pass is not success. The metric is **time to a trustworthy, actionable result**.

## Accessibility and Usability

The interface is designed for zero-hunt operation:

1. Add images
2. Confirm expected application data
3. Analyze
4. Review exceptions
5. Export or complete

Requirements include:

- Keyboard navigation
- Visible focus states
- Screen-reader labels
- High contrast
- Large interaction targets
- Plain-language status messages
- No information conveyed by color alone
- Predictable focus order
- Progressive results for long batches
- Clear recovery guidance for errors

## Testing Strategy

Tests are organized around the actual flow rather than file count.

- Upload and file validation
- Image-quality assessment
- Preprocessing transforms
- OCR adapters and schema contracts
- Field parsers
- Normalization and unit conversion
- Exact warning validation
- Rule registry behavior
- Governance thresholds
- Verification report generation
- Accessibility and component behavior
- Batch isolation and failure recovery
- Evidence integrity and retention
- End-to-end upload-to-report flow
- Golden fixtures and regression benchmarks
- Performance budgets
- Architectural dependency boundaries

## Technology Direction

The implementation is intentionally modular and local-first.

- Next.js and TypeScript for the web application
- Zod for runtime data contracts
- Tailwind CSS with a small reusable component layer
- Vitest and Testing Library for unit/component testing
- Playwright for end-to-end testing
- OpenCV-compatible preprocessing service
- PaddleOCR and/or Tesseract-compatible local OCR adapters
- Jetson-hosted analyzer option
- Optional bounded cloud enhancement behind the same analyzer interface
- Vercel or equivalent for the public web prototype, with a separately deployable analyzer

The exact implementation may evolve as benchmarks identify the smallest reliable solution.

## Current Status

The project is moving from architecture and governance into implementation. The repository intentionally records requirements, decisions, test expectations, and scope boundaries before large code generation begins.

The commit history is part of the submission: each commit should introduce one understandable decision or capability and leave the repository in a reviewable state.

## Running Locally

The scaffold currently exposes the following scripts:

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run test:coverage
npm run build
```

Environment-variable and analyzer-service instructions will be finalized with the working pipeline and deployment URL.

The first completed vertical slice — a single wine label image processed
end-to-end into an explainable, checksum-protected pre-check result — is
documented, with exact offline-reproducibility requirements and the bundled
demonstration-fixture identity, in
[`docs/slice-3-acceptance.md`](docs/slice-3-acceptance.md).

## Submission Definition of Done

The take-home is ready to submit when a reviewer can:

- Open a deployed application
- Upload at least one real label image
- Enter or load expected application values
- Receive real extracted fields and explainable findings
- See strict warning validation and semantic-equivalence handling
- Understand uncertainty and image-quality limitations
- Complete the flow without training or hidden configuration
- Review source code, setup instructions, tests, assumptions, and tradeoffs

The broader coach, batch, retained-evidence, continuous-learning, and production-hardening work may be implemented selectively, but the core must remain finished, simple, fast, and credible.

## Documentation Map

Key design documents include:

- [`docs/product-plan.md`](docs/product-plan.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/validation-rules.md`](docs/validation-rules.md)
- [`docs/build-ethic.md`](docs/build-ethic.md)
- [`docs/testing-strategy.md`](docs/testing-strategy.md)
- [`docs/security-and-deployment-strategy.md`](docs/security-and-deployment-strategy.md)
- [`docs/kaizen-evaluation.md`](docs/kaizen-evaluation.md)
- [`docs/system-governance.md`](docs/system-governance.md)
- [`docs/continuous-learning-governance.md`](docs/continuous-learning-governance.md)
- [`docs/ocr-reliability-strategy.md`](docs/ocr-reliability-strategy.md)
- [`docs/performance-and-adoption.md`](docs/performance-and-adoption.md)
- [`docs/accessibility-and-batch-workflow.md`](docs/accessibility-and-batch-workflow.md)
- [`docs/coaching-progress-and-management-guidance.md`](docs/coaching-progress-and-management-guidance.md)
- [`docs/federal-compliance-readiness.md`](docs/federal-compliance-readiness.md)
- [`docs/compliance-rule-taxonomy.md`](docs/compliance-rule-taxonomy.md)
- [`docs/evidence-retention-and-auditability.md`](docs/evidence-retention-and-auditability.md)
- [`docs/engineering-constitution.md`](docs/engineering-constitution.md)
- [`docs/engineering-principles.md`](docs/engineering-principles.md)
- [`docs/design-review-checklist.md`](docs/design-review-checklist.md)
- [`docs/submission-definition-of-done.md`](docs/submission-definition-of-done.md)
- [`docs/lean-implementation-map.md`](docs/lean-implementation-map.md)
- [`docs/adr/`](docs/adr/)

## Build Ethic

This project favors a narrow, complete, measurable, and explainable implementation over ambitious but unfinished feature sprawl.

The repository should preserve enough reasoning that another engineer can understand not only what was built, but why it was built that way—and how to improve it without repeating the same mistakes.

> **“Let all things be done decently and in order.” — 1 Corinthians 14:40**
