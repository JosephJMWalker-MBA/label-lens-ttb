# Production parity architecture

## Dependency direction

```text
committed corpus image bytes
  -> production extractor
  -> exact serialized analyzer response bytes
  -> evaluation-only parity adapter
  -> exact fixture comparator
  -> report and reconciliation diagnostics
```

Production code does not import the parity fixture, reconciliation artifacts,
corpus truth, or evaluation diagnostics. The existing
`src/fixtures/eval/eval-boundary.test.ts` and
`src/fixtures/truth-boundary.test.ts` enforce that direction.

## What changed in this task

- The evaluation-only comparator now describes the first mismatch with an exact
  byte offset/range and, when both responses are JSON, the first semantic JSON
  path and values.
- The assertion still receives the complete exact-byte mismatch set. No
  normalization, ignored field, skip, tolerance, or semantic-only comparison
  was added.
- A standalone evaluation-only capture command records all current responses
  before the report assertion can terminate a run.
- The approved parity fixture was advanced from the Issue #131 origin commit to
  current `main` only after two byte-identical captures and a seven-for-seven
  mapping to merged production changes.

## Production boundary

This branch does not modify `src/pipeline`, the analyzer route, OCR adapters,
selectors, parsers, thresholds, Brand logic, Government Warning logic, VLM
logic, cloud services, or seller-truth boundaries. All executable changes are
under `src/fixtures/eval` or `scripts/eval`, and are default-off evaluation
tooling.
