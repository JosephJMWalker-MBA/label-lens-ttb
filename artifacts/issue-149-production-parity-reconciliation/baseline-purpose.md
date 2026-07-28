# Baseline purpose and authority

## Evidence read

- Issue #131 required the existing full corpus to remain byte-for-byte
  identical while the semantic survival diagnostic was added.
- PR #132 created the first 115-case production response fixture at
  `d54e3b2506de9220d2f0cd602d44b3a82c42fd58` and reported 115/115 exact
  serialized responses.
- `src/fixtures/eval/production-parity.ts` hashes and compares the exact stored
  response string for every ordered case.
- `production-parity.gen.test.ts`, `baseline-report.gen.test.ts`, and
  `npm run eval:baseline` use the fixture as the standing production-parity
  gate.
- The previous ontology text called the Issue #131 baseline immutable.

## Ambiguity and resolution

The history supported two readings: a permanently frozen Issue #131 snapshot,
or the last explicitly approved current-production snapshot. A permanently
frozen snapshot cannot serve as a standing baseline after intentionally merged
production changes; silently regenerating a current snapshot would discard the
historical contract.

This reconciliation adopts the strictest operational interpretation that
preserves both:

> The fixture is an approval-gated exact-byte snapshot of current approved
> production behavior, seeded at Issue #131. It may advance only through an
> explicit reconciliation that proves deterministic current output, maps every
> changed response to an intentional merged production change, preserves old
> and new fixture hashes, and leaves the exact comparator unchanged.

`PRODUCTION_PARITY_ORIGIN_COMMIT` retains the Issue #131 origin. The fixture and
`PRODUCTION_PARITY_BASE_COMMIT` identify the approved current-production base.
This task documents the interpretation rather than silently redefining it.

The fixture is not a loose semantic oracle, seller truth, or a mechanism for
forcing production to reproduce obsolete bytes.
