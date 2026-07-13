# Full-Corpus Extraction Evaluation (Issue #57)

Measured with the evaluation harness against the current production extractor `local-two-field-extractor@1.0.0`. This report is generated (`npm run eval:baseline`) and committed as a point-in-time full-corpus evaluation. Latencies are environment-dependent; all other figures are deterministic given fixed OCR output.

This report is not evidence that the current extractor is production-ready. Brand selection quality, alcohol recall/accuracy, and any remaining false-certainty cases remain gating defects.
Ambiguity honesty applies only to the genuinely ambiguous labels; it is not evidence of overall extractor usefulness.
Phase 5A adds evaluation-only attribution detail: candidate-filtering failures are subclassed from existing selector diagnostics, and recovery-pass contributions are measured from extractor debug traces without changing production OCR, ranking, confidence, or API output.

## Brand metrics

| Metric | Value | Denominator |
| --- | --- | --- |
| Brand exact match | 27% | 101 determinate |
| Brand normalized-acceptable match | 29% | 101 determinate |
| Brand top-3 recall | 33% | 101 determinate |
| Brand top-5 recall | 35% | 101 determinate |
| Brand confident-correct rate | 4% | 101 determinate |
| Useful-but-deferred rate | 31% | 101 determinate |
| Unnecessary ambiguity rate | 25% | 101 determinate |
| Determinate false-certainty rate | 0% | 101 determinate |
| False abstention rate | 0% | 101 determinate |
| Determinate NOT_OBSERVED rate | 0% | 101 determinate |
| Correct abstention rate | 100% | 10 absent |
| Genuine ambiguity honesty | 100% | 4 ambiguous |
| Absent-brand false-positive rate | 0% | 10 absent |

## Alcohol metrics

| Metric | Value | Denominator |
| --- | --- | --- |
| Alcohol detection recall | 61% | 102 present |
| Alcohol parsed-value accuracy | 57% | 102 present |
| Alcohol parser-failure rate | 4% | 102 present |
| Alcohol overall false-certainty rate | 1% | 115 included |
| Absent-alcohol false-positive rate | 8% | 13 absent |

### Alcohol challenge slices

| Slice | Detection recall | Parsed accuracy | Denominator |
| --- | --- | --- | --- |
| Bottom-located alcohol statement | 66% | 62% | 87 present |
| Side/rotated alcohol layout | 25% | 17% | 12 present |
| Truth marked rotated or vertical | 27% | 18% | 11 present |
| Vertical mandatory strip layout | 0% | 0% | 5 present |
| Split-token alcohol wording | 100% | 100% | 2 present |
| Percent-less wording | 100% | 100% | 1 present |
| Decimal-value alcohol wording | 67% | 63% | 63 present |

### Orientation and Region Slices

| Slice | Brand exact | Brand normalized | Brand top-3 | Brand top-5 | Brand denom | Alcohol recall | Alcohol accuracy | Alcohol denom |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Upright full-image | 29% | 31% | 36% | 38% | 84 determinate | 65% | 62% | 86 present |
| Upright edge/side region | 0% | 0% | 0% | 0% | 1 determinate | 0% | 0% | 1 present |
| 90° clockwise text | 0% | 0% | 0% | 0% | 5 determinate | 0% | 0% | 5 present |
| 90° counterclockwise text | 33% | 33% | 33% | 33% | 3 determinate | 67% | 67% | 3 present |
| 180° upside-down text | 0% | 0% | 0% | 0% | 0 determinate | 0% | 0% | 0 present |
| Mixed orientation | 33% | 33% | 33% | 33% | 3 determinate | 33% | 0% | 3 present |
| Vertical mandatory strip | 0% | 0% | 0% | 0% | 5 determinate | 0% | 0% | 5 present |
| Multi-artifact regional target | 29% | 29% | 29% | 29% | 7 determinate | 67% | 50% | 6 present |
| Unknown orientation | 0% | 0% | 0% | 0% | 0 determinate | 0% | 0% | 0 present |

## Failure distribution

| Bucket | Count |
| --- | --- |
| OCR recognition | 29 |
| Region coverage | 0 |
| Orientation | 0 |
| Line reconstruction | 1 |
| Candidate generation | 1 |
| Candidate filtering | 73 |
| Candidate ranking | 8 |
| Parser | 4 |
| Unnecessary ambiguity | 25 |
| False certainty | 1 |
| Correct uncertainty | 4 |
| Correct result | 84 |

**Brand failure classes:** candidate-filtering-failure: 39, correct-uncertainty: 29, ocr-recognition-failure: 24, correct: 14, candidate-ranking-failure: 8, line-reconstruction-failure: 1

**Alcohol failure classes:** correct: 70, candidate-filtering-failure: 34, ocr-recognition-failure: 5, parser-failure: 4, candidate-generation-failure: 1, false-certainty: 1

### Candidate-Filtering Subtypes

| Field | Subtype | Count |
| --- | --- | --- |
| alcohol | Alcohol rejected: missing volume marker | 26 |
| brand | Brand rejected: too many words | 17 |
| alcohol | Alcohol rejected: unsupported pattern | 7 |
| brand | Brand rejected: domain-like text | 6 |
| brand | Brand rejected: producer line | 6 |
| brand | Brand rejected: non-brand keyword | 5 |
| brand | Brand rejected: sentence fragment | 3 |
| brand | Brand kept: overextended candidate | 2 |
| alcohol | Alcohol rejected: missing explicit alcohol marker | 1 |

## Pass Cost

| Metric | Value |
| --- | --- |
| Median OCR passes per image | 1 |
| p95 OCR passes per image | 4 |
| Cases requiring extra passes | 57 (50%) |
| Median recovery duration | 0 ms |
| p95 recovery duration | 2907 ms |
| Median total OCR duration | 1441 ms |
| p95 total OCR duration | 3728 ms |
| Extra passes with no usable evidence | 127 |
| Recovery cost per recovered correct field | 24912 ms |

| Median latency | 1675 ms | 115 cases |
| p95 latency | 4614 ms | 115 cases |

## Recovery-Pass Contributions

| Pass kind | Passes | Cases | New OCR | Field-like evidence | Accepted candidate | Changed selection | Correct selection | No measured value | Total ms | Max cumulative ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Left edge strip 270° | 57 | 57 | 55 | 14 | 0 | 0 | 0 | 2 | 44484 | 4893 |
| Right edge strip 90° | 57 | 57 | 57 | 13 | 4 | 4 | 3 | 0 | 39964 | 6956 |
| Focus crop | 18 | 18 | 12 | 6 | 1 | 1 | 1 | 4 | 15200 | 5885 |

### Recovery passes that never improve outcomes

| Pass kind | Passes | Cases | Changed selection | Correct selection | Total ms |
| --- | --- | --- | --- | --- | --- |
| Left edge strip 270° | 57 | 57 | 0 | 0 | 44484 |

### Recovery pass instances

| Case | Order | Pass kind | Trigger reasons | New OCR | Field-like evidence | Accepted candidate | Changed selection | Correct selection | No measured value | ms | cumulative ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| luigi-giovanni-live | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 707 | 1498 |
| luigi-giovanni-live | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 601 | 2099 |
| alfredos-wine | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 686 | 1416 |
| alfredos-wine | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 634 | 2049 |
| la-fattoria-rotated | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 1111 | 2253 |
| la-fattoria-rotated | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 768 | 3021 |
| approved-wine-004 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 1078 | 2433 |
| approved-wine-004 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 829 | 3262 |
| approved-wine-005 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 886 | 1652 |
| approved-wine-005 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 632 | 2284 |
| approved-wine-011 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 953 | 1576 |
| approved-wine-011 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 730 | 2306 |
| approved-wine-011 | 3 | Focus crop | alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | yes | no | no | no | no | no | 487 | 2793 |
| approved-wine-013 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 1405 | 3192 |
| approved-wine-013 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 808 | 4000 |
| approved-wine-014 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 1678 | 3274 |
| approved-wine-014 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 1229 | 4503 |
| patricia-green-cellars | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 375 | 1210 |
| patricia-green-cellars | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 440 | 1650 |
| approved-wine-019 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 1050 | 2090 |
| approved-wine-019 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 619 | 2709 |
| saker | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 557 | 1441 |
| saker | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 639 | 2079 |
| saker | 3 | Focus crop | alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | yes | yes | yes | yes | yes | no | 711 | 2790 |
| approved-wine-024 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 1166 | 2783 |
| approved-wine-024 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 1058 | 3840 |
| approved-wine-027 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 534 | 1502 |
| approved-wine-027 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 1363 | 2865 |
| approved-wine-028 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 293 | 1139 |
| approved-wine-028 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | yes | yes | yes | yes | no | 273 | 1412 |
| approved-wine-035 | 1 | Left edge strip 270° | alcohol-not-observed, low-text-density, edge-text-heuristic | no | no | no | no | no | yes | 135 | 424 |
| approved-wine-035 | 2 | Right edge strip 90° | alcohol-not-observed, low-text-density, edge-text-heuristic | yes | no | no | no | no | no | 446 | 870 |
| chateau-bonneau | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 650 | 1414 |
| chateau-bonneau | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 749 | 2162 |
| chateau-bonneau | 3 | Focus crop | alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | yes | no | no | no | no | no | 631 | 2794 |
| approved-wine-046 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 1124 | 2369 |
| approved-wine-046 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 691 | 3060 |
| approved-wine-046 | 3 | Focus crop | alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | yes | no | no | no | no | no | 751 | 3811 |
| approved-wine-047 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | no | no | no | no | no | yes | 389 | 1466 |
| approved-wine-047 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 1649 | 3115 |
| approved-wine-047 | 3 | Focus crop | alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | yes | no | no | no | no | no | 2771 | 5885 |
| approved-wine-051 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 784 | 1958 |
| approved-wine-051 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 554 | 2512 |
| approved-wine-051 | 3 | Focus crop | alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | yes | yes | no | no | no | no | 1132 | 3644 |
| approved-wine-052 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 1406 | 3811 |
| approved-wine-052 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 1623 | 5435 |
| approved-wine-053 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 898 | 1665 |
| approved-wine-053 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | yes | yes | yes | yes | no | 813 | 2479 |
| approved-wine-053 | 3 | Focus crop | alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | yes | yes | no | no | no | no | 768 | 3247 |
| approved-wine-054 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 754 | 1634 |
| approved-wine-054 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 297 | 1931 |
| approved-wine-054 | 3 | Focus crop | alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | yes | no | no | no | no | no | 751 | 2682 |
| approved-wine-055 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 599 | 1261 |
| approved-wine-055 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 520 | 1781 |
| approved-wine-058 | 1 | Left edge strip 270° | brand-not-observed, alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 782 | 1800 |
| approved-wine-058 | 2 | Right edge strip 90° | brand-not-observed, alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 879 | 2679 |
| approved-wine-059 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 511 | 1163 |
| approved-wine-059 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 502 | 1665 |
| three-steves-winery | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 623 | 2589 |
| three-steves-winery | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 607 | 3196 |
| approved-wine-061 | 1 | Left edge strip 270° | alcohol-not-observed | yes | yes | no | no | no | no | 799 | 1745 |
| approved-wine-061 | 2 | Right edge strip 90° | alcohol-not-observed | yes | no | no | no | no | no | 769 | 2514 |
| approved-wine-062 | 1 | Left edge strip 270° | brand-not-observed, alcohol-not-observed | yes | no | no | no | no | no | 2336 | 4893 |
| approved-wine-062 | 2 | Right edge strip 90° | brand-not-observed, alcohol-not-observed | yes | no | no | no | no | no | 2063 | 6956 |
| approved-wine-063 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 551 | 1058 |
| approved-wine-063 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 504 | 1562 |
| approved-wine-064 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 546 | 1047 |
| approved-wine-064 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 540 | 1587 |
| approved-wine-065 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 482 | 1048 |
| approved-wine-065 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 483 | 1531 |
| approved-wine-069 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 1073 | 2771 |
| approved-wine-069 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 854 | 3625 |
| altacima | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 876 | 2773 |
| altacima | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 830 | 3603 |
| approved-wine-071 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 1571 | 3698 |
| approved-wine-071 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 1568 | 5266 |
| approved-wine-072 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 1342 | 3454 |
| approved-wine-072 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 1216 | 4670 |
| approved-wine-073 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 714 | 1433 |
| approved-wine-073 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 612 | 2045 |
| approved-wine-073 | 3 | Focus crop | alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | no | no | no | no | no | yes | 432 | 2477 |
| approved-wine-074 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 805 | 1529 |
| approved-wine-074 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 687 | 2216 |
| approved-wine-074 | 3 | Focus crop | alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | no | no | no | no | no | yes | 528 | 2744 |
| approved-wine-075 | 1 | Left edge strip 270° | brand-not-observed, alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 1012 | 2324 |
| approved-wine-075 | 2 | Right edge strip 90° | brand-not-observed, alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 564 | 2888 |
| approved-wine-075 | 3 | Focus crop | brand-not-observed, alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | yes | no | no | no | no | no | 988 | 3876 |
| approved-wine-077 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 539 | 1316 |
| approved-wine-077 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 484 | 1800 |
| approved-wine-083 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 372 | 976 |
| approved-wine-083 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 229 | 1206 |
| approved-wine-083 | 3 | Focus crop | alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | yes | yes | no | no | no | no | 677 | 1883 |
| approved-wine-085 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 309 | 886 |
| approved-wine-085 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 376 | 1262 |
| approved-wine-086 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 715 | 2545 |
| approved-wine-086 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 669 | 3214 |
| approved-wine-095 | 1 | Left edge strip 270° | brand-not-observed, alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 263 | 720 |
| approved-wine-095 | 2 | Right edge strip 90° | brand-not-observed, alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 247 | 967 |
| approved-wine-095 | 3 | Focus crop | brand-not-observed, alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | no | yes | no | no | no | no | 407 | 1375 |
| approved-wine-096 | 1 | Left edge strip 270° | brand-not-observed, alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 806 | 1805 |
| approved-wine-096 | 2 | Right edge strip 90° | brand-not-observed, alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 740 | 2545 |
| approved-wine-097 | 1 | Left edge strip 270° | brand-not-observed, alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 660 | 1527 |
| approved-wine-097 | 2 | Right edge strip 90° | brand-not-observed, alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 678 | 2205 |
| approved-wine-098 | 1 | Left edge strip 270° | brand-not-observed, alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 168 | 536 |
| approved-wine-098 | 2 | Right edge strip 90° | brand-not-observed, alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 115 | 652 |
| approved-wine-101 | 1 | Left edge strip 270° | brand-not-observed, alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 399 | 1830 |
| approved-wine-101 | 2 | Right edge strip 90° | brand-not-observed, alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 417 | 2247 |
| approved-wine-103 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 376 | 1130 |
| approved-wine-103 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 328 | 1458 |
| approved-wine-103 | 3 | Focus crop | alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | no | no | no | no | no | yes | 427 | 1885 |
| approved-wine-104 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 579 | 1557 |
| approved-wine-104 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 563 | 2120 |
| approved-wine-105 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 684 | 1379 |
| approved-wine-105 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 499 | 1879 |
| approved-wine-105 | 3 | Focus crop | alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | no | yes | no | no | no | no | 517 | 2396 |
| approved-wine-106 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 594 | 1329 |
| approved-wine-106 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 545 | 1874 |
| approved-wine-107 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 1071 | 1975 |
| approved-wine-107 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 747 | 2722 |
| approved-wine-108 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 1038 | 1829 |
| approved-wine-108 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 767 | 2596 |
| m-cellars-baseline | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 435 | 1447 |
| m-cellars-baseline | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | yes | yes | yes | yes | no | 938 | 2386 |
| m-cellars-baseline | 3 | Focus crop | alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | yes | no | no | no | no | no | 2078 | 4463 |
| wine-multi-artifact-04 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 907 | 2049 |
| wine-multi-artifact-04 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 352 | 2401 |
| wine-multi-artifact-04 | 3 | Focus crop | alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | yes | no | no | no | no | no | 556 | 2956 |
| wine-multi-artifact-06 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | no | no | no | no | no | 660 | 1509 |
| wine-multi-artifact-06 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | yes | yes | yes | no | no | 333 | 1841 |
| wine-multi-artifact-10 | 1 | Left edge strip 270° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 670 | 1419 |
| wine-multi-artifact-10 | 2 | Right edge strip 90° | alcohol-not-observed, edge-text-heuristic | yes | yes | no | no | no | no | 294 | 1713 |
| wine-multi-artifact-10 | 3 | Focus crop | alcohol-not-observed, edge-text-heuristic, focus-crop-distinct | no | no | no | no | no | yes | 588 | 2301 |

## Brand abstentions

| Case | Truth | Abstention reason | Removed candidates |
| --- | --- | --- | --- |
| approved-wine-022 | absent | unsupported-candidates-only | "PROUDLY PRODUCED AND BOTTLED" [non-brand-keyword], "BY MARBLE CREEK ACRES - LEE, MAINE" [too-many-words], "VETERANS OWNED AND OPERATED" [non-brand-keyword], "12 ALC BY VOL" [non-brand-keyword] |
| approved-wine-058 | absent | unsupported-candidates-only | "GRUNER VELTLINER" [generic-product-language], "Light with spicy overtones and fruity body," [too-many-words], "with a pleasantly refreshing length." [too-many-words], "An uncomplicated but expressively bold and" [too-many-words] |
| approved-wine-062 | absent | unsupported-candidates-only | "PINOT GRIGIO" [varietal-or-designation], "Pinot Gris" [varietal-or-designation], "This wine has rich" [sentence-fragment], "scents of tropical fruit and" [too-many-words] |
| approved-wine-075 | absent | unsupported-candidates-only | "VINO BLANCO" [generic-product-language], "Aromas de fruta tropical como lichis, fruta de la pasion y" [too-many-words], "frutas de hueso. Paladar sedoso y buena persistencia." [too-many-words], "Un vino para disfrutar. Uno de los grandes sauvignon blanc" [too-many-words] |
| approved-wine-082 | absent | unsupported-candidates-only | "CHARDONNAY" [varietal-or-designation], "LIVERMORE VALLEY" [location-or-appellation], "2017" [no-letters-or-too-short], "ITS DEFINITELY A PRIVILEGE TO GET" [too-many-words] |
| approved-wine-095 | absent | unsupported-candidates-only | "IMPORTED BY" [non-brand-keyword], "BUTA Distributors Inc." [sentence-fragment], "DELRAY BEACH FL" [location-or-appellation], "TENUTE ETNA BOSCO BIANCO SOCIETA DOC AGRICOLA" [too-many-words] |
| approved-wine-096 | absent | unsupported-candidates-only | "DELLE VENEZIE" [location-or-appellation], "Denominazione di origine controllata" [sentence-fragment], "PINOT GRIGIO" [varietal-or-designation], "WHITE WINE" [varietal-or-designation] |
| approved-wine-097 | absent | unsupported-candidates-only | "WHITE WINE" [varietal-or-designation], "BOTTLED BY CANA SONA - ITALIA" [producer-line], "ON BEALF OF BERNARD SRL" [too-many-words], "REGISTERED OFFICE VALLO DELLA LUCANIA - ITALIA" [too-many-words] |
| approved-wine-098 | absent | unsupported-candidates-only | "100 COLLIO RIBOLLA DOC. GIALLA" [too-many-words], "WHITE WINE - PRODUCT OF ITALY" [too-many-words], "ALC 12,5 CONTAIN BY VOL SULFITES - 750 ml CONTENT" [non-brand-keyword], "PRODUCED Localich Zegla, AND 16 BOTTLED 34071 Cormdas BY - BLAZIC GO S. Jealy Age. S" [producer-line] |
| approved-wine-101 | absent | unsupported-candidates-only | "SAUVIGNON BLANC" [varietal-or-designation], "Our stainless-steel fermented Sauvignon" [sentence-fragment], "Blanc produces a fresh, full Crisp wine" [too-many-words], "characterized by aromas of gooseberry, key" [too-many-words] |

## Per-case results

| Case | Strata | Brand state → selected | Brand attribution | Alcohol state → value | Alcohol attribution | passes | ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| luigi-giovanni-live | decorative-or-script-brand; brand-punctuation; multiple-brand-like-phrases; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "VANNI" | candidate-filtering-failure / brand-rejected-non-brand-keyword | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 2226 |
| alfredos-wine | multi-line-brand; brand-punctuation; alcohol-at-bottom; front-label | AMBIGUOUS → "HLTRE" | candidate-filtering-failure / brand-rejected-non-brand-keyword | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 2156 |
| la-fattoria-rotated | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "cCTIO" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 3132 |
| approved-wine-004 | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "NORTH COAST CA OF" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 3370 |
| approved-wine-005 | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "0 Ao BARBERA" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 2391 |
| approved-wine-006 | simple-centered-brand; low-contrast; front-label; alcohol-at-bottom | AMBIGUOUS → "2 LRS3 aoc" | candidate-filtering-failure / brand-rejected-too-many-words | OBSERVED → "13.5% BY VOL." | correct | 1 | 1863 |
| casanova-della-spinetta | multi-line-brand; low-contrast; split-alcohol-tokens; front-label | AMBIGUOUS → "CASANOVA DELLA SPINETTA" | correct-uncertainty | OBSERVED → "ALCOHOL 14 BY VOLUME" | correct | 1 | 1438 |
| approved-wine-008 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "Azienda Agricola Terre Sparse" | candidate-filtering-failure / brand-rejected-sentence-fragment | OBSERVED → "13% ALC./VOL." | correct | 1 | 1086 |
| approved-wine-009 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "Azienda Agricola Terre Sparse" | candidate-filtering-failure / brand-rejected-domain-like | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 1062 |
| domaine-follin-arbelet | brand-punctuation; multiple-brand-like-phrases; alcohol-at-bottom; front-label | AMBIGUOUS → "DOMAINE FOLLIN-ARBELET" | correct-uncertainty | OBSERVED → "14% BY VOL." | correct | 1 | 738 |
| approved-wine-011 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "Societa Agricola Maria Antonie" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 4 | 2899 |
| approved-wine-012 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "Cool&y" | candidate-filtering-failure / brand-rejected-too-many-words | OBSERVED → "13.8% BY VOL." | correct | 1 | 1104 |
| approved-wine-013 | decorative-or-script-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "Play ers Heart" | candidate-ranking-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 4111 |
| approved-wine-014 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "TRE CORI" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-unsupported-pattern | 3 | 4614 |
| patricia-green-cellars | low-contrast; multiple-brand-like-phrases; genuinely-ambiguous; alcohol-at-bottom; front-label | AMBIGUOUS → "ESTATE VINEYARD" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 1757 |
| approved-wine-016 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "MARQUES vo NAVARRO" | candidate-filtering-failure / brand-rejected-too-many-words | OBSERVED → "13.5% BY VOL." | correct | 1 | 971 |
| approved-wine-017 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "oABORDE NOIRE" | ocr-recognition-failure | OBSERVED → "12% ALC./VOL." | correct | 1 | 653 |
| approved-wine-018 | multi-line-brand; front-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Indigenous blend" | candidate-filtering-failure / brand-rejected-too-many-words | OBSERVED → "3.5% BY VOL." | parser-failure | 1 | 1669 |
| approved-wine-019 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "KYRIOS" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 2826 |
| approved-wine-020 | simple-centered-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "COURTIEU" | correct-uncertainty | LOW_CONFIDENCE → "12.5% ALC./VOL." | correct | 1 | 1345 |
| saker | simple-centered-brand; low-contrast; front-label | AMBIGUOUS → "SAKER" | correct-uncertainty | OBSERVED → "12.6% ALC./VOL." | correct | 4 | 2896 |
| approved-wine-022 | back-label; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | OBSERVED → "12% ALC./VOL." | correct | 1 | 751 |
| approved-wine-023 | decorative-or-script-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "PRIMITIVO" | ocr-recognition-failure | LOW_CONFIDENCE → "14% ALC./VOL." | correct | 1 | 1150 |
| approved-wine-024 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "CADILLAC COTES DE BORDEAUX" | candidate-filtering-failure / brand-rejected-too-many-words | NOT_OBSERVED → ∅ | correct | 3 | 3952 |
| nebla-mencia | simple-centered-brand; alcohol-at-bottom; front-label | AMBIGUOUS → "NEBLA" | correct-uncertainty | OBSERVED → "13% ALC./VOL." | correct | 1 | 1168 |
| approved-wine-026 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "PRINCIPE. DIPHESA" | correct-uncertainty | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 970 |
| approved-wine-027 | decorative-or-script-brand; front-label; brand-punctuation; alcohol-at-bottom | AMBIGUOUS → "N Gy A001" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-unsupported-pattern | 3 | 2987 |
| approved-wine-028 | simple-centered-brand; front-label; alcohol-at-side-or-rotated | AMBIGUOUS → "FIELD" | correct-uncertainty | OBSERVED → "13.3% ALC./VOL." | correct | 3 | 1520 |
| approved-wine-031 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Contiene Sulfitos Enthalt Sulfite" | ocr-recognition-failure | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 1277 |
| approved-wine-032 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "TRAVERS RESERVE" | correct-uncertainty | OBSERVED → "14% BY VOL." | correct | 1 | 1769 |
| approved-wine-033 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "COVE" | candidate-ranking-failure | OBSERVED → "13.7% ALC./VOL." | correct | 1 | 1884 |
| approved-wine-034 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "NICO" | correct-uncertainty | LOW_CONFIDENCE → "13.5% BY VOL." | correct | 1 | 2080 |
| approved-wine-035 | decorative-or-script-brand; front-label; alcohol-at-side-or-rotated | AMBIGUOUS → "CHASSAGNE-MONTRACHET" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 3 | 980 |
| approved-wine-037 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Strumica - Radovish Region" | candidate-filtering-failure / brand-rejected-sentence-fragment | OBSERVED → "19.0% BY VOL." | parser-failure | 1 | 1293 |
| approved-wine-038 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "2024 SOUTH COAST PRIMITIVO" | candidate-filtering-failure / brand-rejected-too-many-words | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 920 |
| approved-wine-039 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "DOMAINE JULIEN AUROUX" | correct-uncertainty | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 835 |
| chateau-bonneau | brand-punctuation; multi-line-brand; low-contrast; front-label | AMBIGUOUS → "BONNEAU" | line-reconstruction-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 4 | 2906 |
| approved-wine-041 | back-label; alcohol-at-bottom | AMBIGUOUS → "Petite Nature" | correct-uncertainty | OBSERVED → "13.0% ALC./VOL." | correct | 1 | 940 |
| approved-wine-042 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "PRODUCT OF FRANCE" | candidate-filtering-failure / brand-rejected-too-many-words | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 1100 |
| approved-wine-043 | simple-centered-brand; front-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "FULCRUM" | correct-uncertainty | OBSERVED → "13.8% BY VOL." | parser-failure | 1 | 892 |
| approved-wine-044 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "VEEL" | ocr-recognition-failure | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 1675 |
| approved-wine-045 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Meeting of ihe Minds" | candidate-filtering-failure / brand-rejected-too-many-words | OBSERVED → "13.7% ALC./VOL." | correct | 1 | 1076 |
| approved-wine-046 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "Red Wine Blend Curious" | candidate-filtering-failure / brand-rejected-sentence-fragment | NOT_OBSERVED → ∅ | correct | 4 | 3925 |
| approved-wine-047 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "DENOMINACIO D'ORIGEN" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 4 | 6000 |
| approved-wine-048 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Pacha RESERVA - CARMENERE" | candidate-filtering-failure / brand-rejected-too-many-words | OBSERVED → "14.0% BY VOL." | correct | 1 | 1375 |
| approved-wine-049 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "CAYWOQOD VINEYARD" | ocr-recognition-failure | OBSERVED → "13.2% ALC./VOL." | correct | 1 | 3345 |
| le-temps-des-fleurs | simple-centered-brand; alcohol-at-bottom; front-label | AMBIGUOUS → "LE TEMPS DES FLEURS" | correct-uncertainty | OBSERVED → "11.5% ALC./VOL." | correct | 1 | 900 |
| approved-wine-051 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "PACHECA DOURO D.O.C" | candidate-filtering-failure / brand-rejected-non-brand-keyword | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-unsupported-pattern | 4 | 3756 |
| approved-wine-052 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "OLp VINE ZINFANDEL" | candidate-filtering-failure / brand-rejected-too-many-words | NOT_OBSERVED → ∅ | correct | 3 | 5549 |
| approved-wine-053 | multiple-brand-like-phrases; front-label; alcohol-at-side-or-rotated | AMBIGUOUS → "Vineya" | ocr-recognition-failure | OBSERVED → "11.5% ALC./VOL." | correct | 4 | 3354 |
| approved-wine-054 | multi-line-brand; back-label; alcohol-at-side-or-rotated | AMBIGUOUS → "IA5 ME15" | candidate-filtering-failure / brand-kept-overextended-candidate | NOT_OBSERVED → ∅ | ocr-recognition-failure | 4 | 2788 |
| approved-wine-055 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "FRANCOIS VILLARD" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-unsupported-pattern | 3 | 1922 |
| approved-wine-056 | multi-line-brand; back-label; alcohol-at-bottom; low-contrast | AMBIGUOUS → "CAMP dPIETRU" | candidate-ranking-failure | OBSERVED → "13.5% BY VOL." | correct | 1 | 750 |
| approved-wine-057 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JI Lill" | candidate-ranking-failure | OBSERVED → "13% BY VOL." | correct | 1 | 743 |
| approved-wine-058 | back-label; dense-text; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 2788 |
| approved-wine-059 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JI mmm Ill" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 1773 |
| three-steves-winery | missing-alcohol-statement; multiple-brand-like-phrases; front-label | OBSERVED → "3 STEVES WINERY" | correct | NOT_OBSERVED → ∅ | correct | 3 | 3305 |
| approved-wine-061 | back-label; low-resolution; missing-alcohol-statement | AMBIGUOUS → "APHRODITE" | correct-uncertainty | NOT_OBSERVED → ∅ | correct | 3 | 2622 |
| approved-wine-062 | back-label; low-resolution; missing-alcohol-statement | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | correct | 3 | 7068 |
| approved-wine-063 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "TRE FICHI" | candidate-filtering-failure / brand-rejected-producer-line | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 1677 |
| approved-wine-064 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Prins" | candidate-filtering-failure / brand-rejected-producer-line | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 1699 |
| approved-wine-065 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Prins" | candidate-filtering-failure / brand-rejected-producer-line | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 1649 |
| approved-wine-066 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JULIETTE VRIL" | candidate-filtering-failure / brand-rejected-producer-line | OBSERVED → "13% ALC./VOL." | correct | 1 | 906 |
| approved-wine-067 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JULIETTE VRIL" | candidate-filtering-failure / brand-rejected-producer-line | OBSERVED → "13% BY VOL." | correct | 1 | 888 |
| approved-wine-068 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "SARA" | correct-uncertainty | OBSERVED → "13% ALC./VOL." | correct | 1 | 863 |
| approved-wine-069 | multi-line-brand; back-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "ALTACIMA 4.090" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 3739 |
| altacima | brand-punctuation; low-contrast; alcohol-at-bottom; front-label | AMBIGUOUS → "ALTACIMA 4.090" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 3712 |
| approved-wine-071 | multi-line-brand; back-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "LATE HARVEST 2013" | candidate-ranking-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 3 | 5379 |
| approved-wine-072 | back-label; dense-text; missing-alcohol-statement; genuinely-ambiguous | AMBIGUOUS → "HINNANT FAMILY VINEYARDS" | correct-uncertainty | NOT_OBSERVED → ∅ | correct | 3 | 4782 |
| approved-wine-073 | multi-line-brand; back-label; missing-alcohol-statement | OBSERVED → "Mike's Farm, Inc." | correct | NOT_OBSERVED → ∅ | correct | 4 | 2582 |
| approved-wine-074 | multi-line-brand; back-label; missing-alcohol-statement | AMBIGUOUS → "HINNANT VINEYARDS" | ocr-recognition-failure | NOT_OBSERVED → ∅ | correct | 4 | 2852 |
| approved-wine-075 | back-label; dense-text; missing-alcohol-statement | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | correct | 4 | 3986 |
| approved-wine-076 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Flore" | candidate-filtering-failure / brand-rejected-too-many-words | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 1028 |
| approved-wine-077 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "VALDINERA" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-unsupported-pattern | 3 | 1915 |
| approved-wine-078 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "MUSCOLINE-ITALIA" | candidate-filtering-failure / brand-rejected-too-many-words | OBSERVED → "14% BY VOL." | correct | 1 | 842 |
| approved-wine-079 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "OFFIDA" | candidate-ranking-failure | LOW_CONFIDENCE → "13.5% BY VOL." | correct | 1 | 737 |
| le-caniette | multi-line-brand; split-alcohol-tokens; alcohol-at-bottom; front-label | AMBIGUOUS → "INDICAZIONE GEOGRAFICA PROTETTA" | candidate-ranking-failure | OBSERVED → "12.5% BY VOL." | correct | 1 | 702 |
| approved-wine-081 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "CORTEADAGIO" | correct-uncertainty | OBSERVED → "12% BY VOL." | correct | 1 | 768 |
| approved-wine-082 | back-label; dense-text; alcohol-at-bottom; low-contrast | NOT_OBSERVED → ∅ | correct | OBSERVED → "14.0% BY VOL." | correct | 1 | 1190 |
| approved-wine-083 | decorative-or-script-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "Bam il" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 4 | 1992 |
| approved-wine-084 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "BUTA DISTRIBUTORS INC" | candidate-filtering-failure / brand-rejected-domain-like | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 1012 |
| approved-wine-085 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Denominazione Origine Controllata" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-explicit-alcohol-marker | 3 | 1365 |
| approved-wine-086 | back-label; dense-text; missing-alcohol-statement | OBSERVED → "3 STEVES WINERY" | correct | NOT_OBSERVED → ∅ | correct | 3 | 3402 |
| approved-wine-087 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "LANGHE SAUVIGNON Tuga" | candidate-ranking-failure | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 1972 |
| approved-wine-088 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "LA MESMA Yellow Label" | candidate-filtering-failure / brand-rejected-domain-like | OBSERVED → "12.5% BY VOL." | correct | 1 | 838 |
| approved-wine-089 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "LA MESMA Black Label" | candidate-filtering-failure / brand-rejected-domain-like | OBSERVED → "13% BY VOL." | correct | 1 | 741 |
| approved-wine-090 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "WHITE WINE 2018 Lo219" | candidate-filtering-failure / brand-rejected-domain-like | OBSERVED → "12.5% BY VOL." | correct | 1 | 774 |
| approved-wine-091 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "D CONTROLLATA E" | ocr-recognition-failure | OBSERVED → "13.5% BY VOL." | correct | 1 | 620 |
| approved-wine-092 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Hn SANTA BARBARA" | ocr-recognition-failure | OBSERVED → "13.6% ALC./VOL." | correct | 1 | 930 |
| approved-wine-093 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "DELRAY BEACH, FL, USA" | candidate-filtering-failure / brand-rejected-too-many-words | OBSERVED → "13.50% ALC./VOL." | correct | 1 | 873 |
| approved-wine-094 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "DELRAY BEACH. FL, USA" | candidate-filtering-failure / brand-rejected-too-many-words | OBSERVED → "13.50% ALC./VOL." | correct | 1 | 849 |
| approved-wine-095 | back-label; dense-text; alcohol-at-bottom; low-resolution | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-unsupported-pattern | 4 | 1479 |
| approved-wine-096 | back-label; dense-text; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 2650 |
| approved-wine-097 | back-label; dense-text; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 2314 |
| approved-wine-098 | back-label; low-resolution; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 759 |
| approved-wine-099 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "DELRAY BEACH, FL, USA" | candidate-filtering-failure / brand-rejected-too-many-words | OBSERVED → "13.50% ALC./VOL." | correct | 1 | 856 |
| amuninni-ferracane | decorative-or-script-brand; multiple-brand-like-phrases; genuinely-ambiguous; alcohol-at-bottom; front-label | AMBIGUOUS → "INV ENVY" | correct-uncertainty | OBSERVED → "12.5% BY VOL." | correct | 1 | 696 |
| approved-wine-101 | back-label; dense-text; missing-alcohol-statement | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | correct | 3 | 2350 |
| approved-wine-102 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Mevushal Kosher for Passover" | ocr-recognition-failure | OBSERVED → "13.4% ALC./VOL." | correct | 1 | 822 |
| approved-wine-103 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "SNA VALSO" | candidate-filtering-failure / brand-rejected-too-many-words | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-unsupported-pattern | 4 | 1997 |
| approved-wine-104 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "BLAZIC" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 2228 |
| approved-wine-105 | decorative-or-script-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "VANNI" | candidate-filtering-failure / brand-rejected-non-brand-keyword | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 4 | 2503 |
| approved-wine-106 | simple-centered-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "REDO" | candidate-filtering-failure / brand-rejected-non-brand-keyword | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 1975 |
| approved-wine-107 | decorative-or-script-brand; wraparound; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "FATTORIA" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 2852 |
| approved-wine-108 | decorative-or-script-brand; wraparound; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "8 Ao VINO BIANCO" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 3 | 2701 |
| approved-wine-109 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "SANGOUARD-CHENE" | correct-uncertainty | OBSERVED → "12.5% BY VOL." | correct | 1 | 781 |
| approved-wine-110 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Cool&y" | candidate-filtering-failure / brand-rejected-too-many-words | OBSERVED → "12.8% BY VOL." | correct | 1 | 1092 |
| m-cellars-baseline | multiple-brand-like-phrases; alcohol-at-bottom; genuinely-ambiguous; front-label | AMBIGUOUS → "CELLARS" | correct-uncertainty | OBSERVED → "12.5% ALC./VOL." | correct | 4 | 4579 |
| wine-multi-artifact-04 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "Donovan Visayas" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 4 | 3059 |
| wine-multi-artifact-05 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "BLAZIC COLLIO" | candidate-filtering-failure / brand-rejected-domain-like | OBSERVED → "ALCOHOL 13.5 BY VOLUME" | correct | 1 | 1344 |
| wine-multi-artifact-06 | multi-panel; alcohol-at-side-or-rotated | AMBIGUOUS → "MOLINO" | candidate-filtering-failure / brand-kept-overextended-candidate | OBSERVED → "13.5% BY VOL." | parser-failure | 3 | 1949 |
| wine-multi-artifact-07 | multi-panel; missing-alcohol-statement | AMBIGUOUS → "North Carolina Nuscadine Nig" | ocr-recognition-failure | OBSERVED → "12% ALC./VOL." | false-certainty | 1 | 1048 |
| wine-multi-artifact-08 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "Z-lor" | candidate-filtering-failure / brand-rejected-producer-line | OBSERVED → "12.6% BY VOL." | correct | 1 | 822 |
| wine-multi-artifact-09 | multi-panel; alcohol-at-bottom | OBSERVED → "DUCK WALK VINEYARDS" | correct | OBSERVED → "12.5% BY VOL." | correct | 1 | 827 |
| wine-multi-artifact-10 | multi-panel; alcohol-at-side-or-rotated | AMBIGUOUS → "MAURO MOLINO" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure / alcohol-rejected-missing-volume-marker | 4 | 2405 |
