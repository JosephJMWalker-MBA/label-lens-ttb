# Product Plan

## Mission

Build a standalone AI-powered prototype that helps alcohol-label compliance agents verify label artwork against expected application data quickly, clearly, and safely.

## Product Thesis

The strongest prototype is not the one with the most features. It is the one that proves the builder understood the workflow, the constraints, the human users, and the regulatory nuance.

Label Lens TTB should behave like a compliance assistant, not an autonomous regulator.

## Stakeholder-Derived Requirements

### Sarah Chen — Deputy Director of Label Compliance

Signals:

- High annual volume
- Routine matching work consumes agent time
- Prior pilot failed because processing took 30–40 seconds
- Agents have varied technical comfort
- Batch review pressure exists during peak importer submissions

Product implications:

- Target response time should be under 5 seconds where possible.
- UX must be obvious and low-friction.
- Single-label workflow comes first.
- Batch workflow can be represented as a future-facing shell or documented roadmap.

### Marcus Williams — IT Systems Administrator

Signals:

- Government Azure environment
- COLA integration is out of scope
- Cloud APIs may be constrained in production by network/firewall rules
- Prototype should avoid unnecessary sensitive-data storage

Product implications:

- Keep the prototype standalone.
- Do not build authentication, COLA integration, or persistence unless absolutely required.
- Document production deployment considerations honestly.
- Keep the app easy to reason about technically.

### Dave Morrison — Senior Compliance Agent

Signals:

- Past modernization projects made work harder
- Human judgment matters
- Some apparent mismatches are acceptable equivalents

Product implications:

- Include normalization and fuzzy matching.
- Explain why a finding passed, warned, or failed.
- Avoid black-box conclusions.
- Keep the agent in control of final review.

### Jenny Park — Junior Compliance Agent

Signals:

- Current review process is manual and checklist-driven
- Government warning text is strict
- Images may be poor quality, angled, or affected by glare

Product implications:

- Implement checklist-style field verification.
- Treat the government warning as a special strict rule.
- Include uncertainty handling for image quality.
- Flag formatting limitations honestly.

## MVP Scope

### P1 — Required Prototype

- Upload one label image
- Preview uploaded image
- Enter expected fields
- Extract observed fields using an AI vision route
- Compare expected vs observed values
- Show field-level findings
- Show OCR evidence scores
- Show overall status
- Handle missing/uncertain results gracefully

### P2 — Exceptional but Still Practical

- Normalization for capitalization, punctuation, whitespace, and common ABV/proof forms
- Government warning validation as a dedicated rule
- Human correction/edit mode
- Exportable JSON review report
- Batch upload shell or documented design

### P3 — Document Only

- COLA integration
- FedRAMP deployment
- Azure production architecture
- Long-term audit storage
- Role-based access control
- Full beverage-type-specific regulatory coverage

## Non-Goals

- Replacing compliance agents
- Making final legal determinations
- Building a production federal system
- Storing sensitive application data
- Integrating with COLA
- Handling every TTB rule in the prototype

## Success Criteria

The prototype should make reviewers believe:

1. The builder extracted hidden requirements from stakeholder interviews.
2. The implementation is intentionally scoped.
3. The AI output is bounded by schemas and rules.
4. The UX respects older and newer agents alike.
5. The documentation explains trade-offs without pretending the prototype is production-ready.
