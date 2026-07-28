# Control/treatment metrics

## Outcome

- Decision: `KILL`
- Evaluable cases: 50
- Behaviorally changed cases: 0
- Improvements: 0
- Regressions: 0
- Improvement checksum families: 0
- Production behavior enabled: no

## Accuracy and safety

| Metric | Control | Treatment |
| --- | --- | --- |
| Detection recall | 5/38 (13.16%; Wilson 95% 5.75%–27.33%) | 5/38 (13.16%; Wilson 95% 5.75%–27.33%) |
| Parsed-value accuracy | 5/38 (13.16%; Wilson 95% 5.75%–27.33%) | 5/38 (13.16%; Wilson 95% 5.75%–27.33%) |
| Normalized-text accuracy | 5/38 (13.16%; Wilson 95% 5.75%–27.33%) | 5/38 (13.16%; Wilson 95% 5.75%–27.33%) |
| False reliable reads | 0/12 (0.00%; Wilson 95% 0.00%–24.25%) | 0/12 (0.00%; Wilson 95% 0.00%–24.25%) |
| Wrong reliable reads | 0/38 (0.00%; Wilson 95% 0.00%–9.18%) | 0/38 (0.00%; Wilson 95% 0.00%–9.18%) |
| Absence false positives | 0 | 0 |
| Correct but conservative | 0 | 0 |
| Recovery contained truth | 5 | 5 |
| Recovery truth discarded | 0 | 0 |

## Slice detection recall

| Slice | Control | Treatment |
| --- | --- | --- |
| bottom-positioned | 1/24 (4.17%; Wilson 95% 0.74%–20.24%) | 1/24 (4.17%; Wilson 95% 0.74%–20.24%) |
| side | 3/12 (25.00%; Wilson 95% 8.89%–53.23%) | 3/12 (25.00%; Wilson 95% 8.89%–53.23%) |
| rotated | n=0 | n=0 |
| vertical | 2/8 (25.00%; Wilson 95% 7.15%–59.07%) | 2/8 (25.00%; Wilson 95% 7.15%–59.07%) |
| ordinary-horizontal | 1/2 (50.00%; Wilson 95% 9.45%–90.55%) | 1/2 (50.00%; Wilson 95% 9.45%–90.55%) |

## Latency

- Control median: 2472.483 ms
- Treatment median: 2561.527 ms
- Median delta: 3.601% (ceiling 10%)
- Control p95: 5080.438 ms
- Treatment p95: 5102.474 ms
- P95 delta: 0.434% (ceiling 15%)

Latency is end-to-end real-extractor timing over the 50 evaluable cases. It is excluded from behavior hashes.

## Isolation and reproducibility

- Primary/repeat behavior reproduced: yes
- OCR trace changed cases: 0
- Brand changed cases: 0
- Government Warning changed cases: 0
- Production-response changed cases: 0
- Production parity: PASS, 115/115
- Seller truth available to OCR/selection: no

## Kill reasons

- Zero or one governed case improved.
- Improvements covered at most one checksum family.
- Neither detection recall nor parsed-value accuracy improved.
- No improvement promoted truth already present in recovery evidence.
- Control and treatment were behaviorally identical in every evaluable case.

Next recommendation: Corpus expansion: add governed cases that naturally produce Brand-only recovery while primary Alcohol is OBSERVED, LOW_CONFIDENCE, or AMBIGUOUS, so the selector-input condition becomes observable without changing production recovery triggers.
