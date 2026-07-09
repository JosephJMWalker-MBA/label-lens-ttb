# Build Ethic

## Why This Document Exists

This take-home project is not only evaluated by the final prototype. It can also be evaluated through the repository history.

The commit sequence should show ordered thinking, not a last-minute code dump.

## Commit Principles

Each commit should answer one question:

> What decision or capability did this commit add?

Preferred commit types:

```text
docs: explain stakeholder-derived requirements
docs: document architecture and constraints
chore: initialize Next.js project scaffold
feat: add label upload workflow
feat: add expected application field form
feat: add mock verification report
feat: implement extraction API route
feat: add normalization and fuzzy matching
feat: add government warning validation
feat: build results dashboard
feat: add exportable JSON report
test: add validation rule test cases
docs: add setup, tradeoffs, and submission notes
```

## What the Commit History Should Demonstrate

1. Requirements were interpreted before implementation.
2. Scope was intentionally constrained.
3. The UI was built around real users.
4. AI output was bounded by schemas and validation.
5. Compliance logic was separated from AI extraction.
6. Uncertainty was surfaced, not hidden.
7. Final documentation was written as an engineering artifact.

## What to Avoid

- One giant commit containing the whole app
- Feature sprawl before the core workflow works
- Overbuilding COLA integration
- Adding login/auth/database without need
- Hiding limitations
- Treating AI output as automatically correct

## Review Narrative

A reviewer should be able to skim the commits and see this progression:

```text
1. Understand the problem.
2. Define the system boundary.
3. Build the smallest complete workflow.
4. Add AI extraction.
5. Add deterministic validation.
6. Improve UX and explainability.
7. Document trade-offs and deployment.
```

## Guiding Principle

Build narrow. Build honestly. Build so the next engineer can trust the path.
