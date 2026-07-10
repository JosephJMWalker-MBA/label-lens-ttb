# Performance and Adoption Criteria

## Why This Exists

The stakeholder interviews establish a hard usability constraint: prior scanning software took 30–40 seconds per label and was abandoned because agents could review labels faster by eye.

For this prototype, performance is part of correctness.

## Primary Service-Level Objective

- Target end-to-end processing time: under 5 seconds per label
- Preferred median processing time: under 2 seconds
- Preferred p95 processing time: under 5 seconds
- Any result exceeding 5 seconds must report the slow stage

## Stage Performance Budgets

| Stage | Target |
|---|---:|
| Upload validation | < 100 ms |
| Image preprocessing | < 500 ms |
| OCR | < 2,500 ms |
| Field parsing | < 250 ms |
| Normalization and comparison | < 100 ms |
| Compliance rules | < 100 ms |
| Governance and report assembly | < 250 ms |
| UI rendering overhead | < 500 ms |

The total budget leaves headroom for hardware variance and network overhead.

## Adoption Gate

A release is not considered usable if it:

- exceeds 5 seconds on representative labels without a clear explanation,
- blocks the user without progress feedback,
- returns a result faster by lowering accuracy or hiding uncertainty,
- produces a false pass to meet latency targets,
- requires the reviewer to repeat manual checks because explanations are insufficient.

## Performance Telemetry

Every analysis report should include:

```json
{
  "totalRuntimeMs": 1842,
  "stages": {
    "validation": 21,
    "preprocessing": 183,
    "ocr": 1214,
    "parsing": 97,
    "normalization": 12,
    "rules": 18,
    "governance": 41,
    "reportAssembly": 36
  }
}
```

## Test Requirements

- Unit tests for stage timers and budget evaluation
- Integration tests that fail when deterministic stages exceed their budgets
- End-to-end benchmark on clean, angled, glare, blurred, and low-contrast fixtures
- p50, p95, and maximum runtime reported across the fixture corpus
- Accuracy metrics reported alongside runtime so speed cannot conceal degraded quality

## Design Implications

1. Keep the rule engine local and deterministic.
2. Avoid unnecessary network calls.
3. Run OCR and preprocessing in the same trusted environment when possible.
4. Cache reusable models in memory rather than loading per request.
5. Use bounded preprocessing variants instead of unbounded retries.
6. Return `NEEDS_REVIEW` quickly when evidence is insufficient rather than spending excessive time chasing certainty.
7. Support batch processing with bounded concurrency, not unlimited parallelism.

## Guiding Principle

The system must reduce routine verification time without shifting hidden work back onto the agent.
