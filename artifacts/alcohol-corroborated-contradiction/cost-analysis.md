# Cost analysis — bounded re-read verification

Measured on this machine against the fixed 115-case corpus at base `9ecd7b2`.
Raw per-case data: `latency-probe.json`. Probe: `latency-probe.ts`.

The signal must perform extra OCR work **before** it can know whether a
contradiction exists. That cost is unconditional for every eligible label; only
the benefit is conditional.

## Eligibility

An observation is eligible only if it would otherwise be `OBSERVED`.

| | Count |
|---|---|
| Corpus cases | 115 |
| Cases with an accepted alcohol candidate | 70 |
| **Eligible (`OBSERVED`)** | **64** (55.7 % of the corpus) |
| `LOW_CONFIDENCE` — not eligible | 6 |
| `NOT_OBSERVED` — not eligible | 45 |

## Added OCR executions

| | |
|---|---|
| Added OCR calls per eligible case | **2** (PSM 8 and PSM 11 on one rendered crop) |
| **Added OCR executions, whole corpus** | **128** |
| Added calls for the 51 ineligible cases | 0 |
| Hard cap on verification passes per case | 2 |
| Crop bounds | the selected candidate's own token-box union, padded 0.6 × height; median 13 475 px, max 207 306 px |

## Measured added latency (crop render + both recognitions)

| Statistic | Per eligible case |
|---|---|
| minimum | 34 ms |
| **median** | **82 ms** |
| **p95** | **219 ms** |
| **maximum** | **325 ms** |
| **corpus total** | **5 970 ms** |

## Approximate corpus impact

Recorded baseline: median 1 389 ms, p95 4 869 ms per case
(`../alcohol-digit-ocr-diagnosis/baseline-summary.json`; wall-clock figures, so
these are the only numbers in this record that do not reproduce exactly).

| | Baseline | Added | Approx. impact |
|---|---|---|---|
| Median (eligible cases) | 1 389 ms | 82 ms | **≈ +5.9 %** |
| p95 (eligible cases) | 4 869 ms | 219 ms | **≈ +4.5 %** |
| Ineligible cases (51 of 115) | — | 0 ms | none |
| Worst observed single case | — | 325 ms | ≈ +6.7 % of p95 |

These are honest approximations: the added time was measured with a dedicated
probe rather than end-to-end through the extractor, so integration overhead is
not included. They would need re-measuring end-to-end before any implementation.

## Why this cost is not justified

The absolute cost is modest and bounded — that is not the objection.

The objection is the **ratio**: 128 additional OCR executions across the fixed
corpus buy exactly **one** detected contradiction, on `approved-wine-037`, and
that detection does not change any metric the evaluator reports (see
`limitations.md`). Every eligible label pays; one label benefits; and the benefit
is a state change the corpus cannot currently measure.

Spending real per-request latency on a verification pass is defensible when the
verification generalises. On the present evidence it has been demonstrated on a
single case, using two reads that share crop, preprocessing, engine, model and
language. **Cost is proportionate to demonstrated generality, and the generality
has not been demonstrated.**
