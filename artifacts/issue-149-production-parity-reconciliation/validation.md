# Validation

## Reconciliation result

- `npm run eval:baseline`: PASS, 115/115 exact serialized analyzer responses,
  zero mismatches.
- Current production parity base:
  `552d30352e76dd412bd75ceb319878ab2d2747bb`.
- Committed fixture SHA-256:
  `4ec2851ebe4c65bc41fd17983236f3236fb436e2df9eb0a6814f5d4543c8fb73`.
- Generated JSON report SHA-256:
  `7d695528354f2939094ccacf40999aa4ad31eb7dadb5be3ca7f291875f20566c`.
- Generated Markdown report SHA-256:
  `1492d60a6cb25b11a4e96706ad4702607ec5204476ce496907b340463735e649`.

## Tests and static checks

- Reconciliation, parity, and report tests: PASS, 22/22.
- Evaluation and seller-truth boundary tests: PASS.
- Existing Issue #149 suites: PASS, 43/43.
- Full repository suite with localhost process permission: PASS, 162 files
  passed, 3 opt-in generator files skipped by default; 1,801 tests passed and 3
  skipped.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS, no warnings or errors.
- `npm run format:check`: PASS.
- `npm run docs:check`: PASS with zero new errors; the three reported errors
  are the repository's existing baselined documentation issues.
- `DATABASE_URL=file:.local/issue-149-parity.db npm run build`: PASS. The first
  build without repository-required database configuration stopped during page
  collection; the configured build passed.
- `git diff --check`: PASS.

The first sandboxed full-suite attempt correctly exposed localhost
`listen EPERM` failures in local-VLM process tests. The same complete suite
passed with localhost permission; these were infrastructure failures, not
product failures.

## Production and authority boundary

`git diff --exit-code 552d30352e76dd412bd75ceb319878ab2d2747bb --
src/pipeline src/app src/server src/lib` returned success. Therefore this task
changes no production OCR, recovery trigger, Alcohol selector, parser,
threshold, Brand, Government Warning, API, authority, seller-truth, VLM, cloud
OCR, or unrelated runtime behavior.

The parity fixture and all new capture/report code remain under
evaluation-only paths and default off. Boundary tests prove production imports
neither evaluation modules nor seller truth.

PR #195's read-only pre-task head was
`79f628c2dd3d915325986a1e6c012fe12fe6ac15`; its post-task identity will be
checked again before publication.

## Clean-worktree gate

Pending the committed-head isolated-worktree `npm run eval:baseline` proof.
