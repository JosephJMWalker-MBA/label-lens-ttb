# Test Strategy

## Purpose

The test suite exists to prove that Label Lens TTB is not a thin AI wrapper. Each planned layer has a verification path, and deterministic compliance logic can be tested independently of model behavior.

## Testing Principles

1. Test the compliance system without AI first.
2. Treat AI extraction as an input provider, not the final authority.
3. Keep rules deterministic and explainable.
4. Preserve stakeholder-derived edge cases as named tests.
5. Make every planned workflow stage either executable now or covered by an explicit pending test.

## Planned Flow Coverage

| Flow Stage | Test Type | Current Expectation |
| --- | --- | --- |
| Project scaffold | Script checks | `npm run test`, `npm run typecheck`, `npm run lint` should be available |
| Upload + expected-fields form | Component tests | Pending until UI components are implemented |
| Data contracts | Unit tests | Verification report and field status shapes are stable |
| Mock verification report | Unit tests | Sample report contains PASS/WARN/FAIL/NEEDS_REVIEW examples |
| AI extraction route | Contract tests | API returns schema-valid extracted fields or readable errors |
| Normalization | Unit tests | Case, punctuation, whitespace, apostrophes, and units normalize safely |
| Fuzzy matching | Unit tests | Human-obvious equivalents pass while real mismatches remain visible |
| Government warning validation | Unit tests | Missing, altered, and formatting-limited warning outcomes are distinct |
| Rule engine | Unit tests | Expected fields + extracted fields produce explainable findings |
| End-to-end analysis workflow | Integration tests | Expected data + extracted data produce a complete verification report |
| Exportable report | Unit tests | Export preserves findings, assumptions, limitations, and timestamp |
| Sample labels | Regression tests | Stakeholder examples remain covered as named fixtures |

## Initial Test Pyramid

```text
Unit tests
  normalize
  fuzzyMatch
  warningStatement
  rule engine
  report schema

Integration tests
  expected fields + extracted fields -> verification report
  mock analysis result -> exportable report

Component tests
  upload form
  expected fields form
  results dashboard

Route tests
  /api/analyze-label success
  /api/analyze-label missing API key
  /api/analyze-label invalid model output
```

## Stakeholder Regression Cases

### Sarah

- A reviewer can understand the result quickly.
- Tests should assert clear status labels and reasons.
- The app should have a demo path even without an API key.

### Marcus

- The app should not require COLA integration.
- Tests should not depend on external government systems.
- AI credentials should never be required for deterministic rule tests.

### Dave

- `STONE'S THROW` and `Stone's Throw` should be treated as equivalent with explanation.
- Naive string equality is not enough.

### Jenny

- Government warning text is stricter than ordinary field matching.
- Formatting limitations should be surfaced honestly rather than ignored.

## Definition of Done for Core Logic

A core logic feature is not complete unless it has:

1. At least one positive test.
2. At least one negative or edge-case test.
3. A human-readable reason in the returned finding.
4. No dependency on AI model output for the deterministic assertion.

## Guiding Standard

If a reviewer asks, "How do I know this rule works?" the repository should answer with a test, not a paragraph.
