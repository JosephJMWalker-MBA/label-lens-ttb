# Label Lens TTB

Label Lens TTB is a standalone AI-powered prototype for alcohol label verification. It helps compliance agents compare uploaded label artwork against expected application data, identify potential mismatches, and surface required human-review items.

The prototype is designed around stakeholder needs from the take-home prompt:

- Fast review support for high-volume label queues
- Simple interface for agents with varied technical comfort
- Fuzzy matching for human-obvious equivalents such as capitalization differences
- Strict validation for required government warning language
- Standalone architecture without direct COLA integration

## Current Status

Planning and scaffold phase.

This repository is intentionally built in visible, reviewable increments. The commit history is part of the submission: each commit should show a clear engineering decision, not a random dump of finished code.

## Product Goal

Reduce routine manual label-verification effort while keeping human compliance agents in control of final judgment.

The system should answer:

1. What did the label image appear to say?
2. How does that compare with the expected application data?
3. Which fields pass, warn, fail, or require human review?
4. Why did the system reach that conclusion?

## Planned MVP Flow

1. Upload a label image.
2. Enter expected application fields.
3. Run AI-assisted extraction.
4. Normalize and compare extracted values against expected values.
5. Apply compliance-oriented validation rules.
6. Present an explainable verification report.
7. Allow export of the report for review.

## Planned Stack

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- OpenAI vision extraction
- Zod schema validation
- Fuzzy matching / normalization layer
- Rule-based validation engine
- Vercel deployment

## Documentation

- [`docs/product-plan.md`](docs/product-plan.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/validation-rules.md`](docs/validation-rules.md)
- [`docs/build-ethic.md`](docs/build-ethic.md)

## Build Ethic

This project favors a narrow, complete, explainable prototype over an overbuilt system.

The goal is not to replace compliance agents. The goal is to help them move faster through routine checks while making uncertainty visible.

> "Let all things be done decently and in order." — 1 Corinthians 14:40
