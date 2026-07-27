# Issue #149 real-label staging metrics

| Field | Metric | Value |
| --- | --- | --- |
| Brand | Total cases | 8 |
| Brand | Evaluable cases | 8 |
| Brand | Source unavailable | 7/8 (87.5%) |
| Brand | Region missing/wrong | 1/8 (12.5%) |
| Brand | OCR recognition miss | 6/8 (75.0%) |
| Brand | Grouping miss | 0/8 (0.0%) |
| Brand | Generation/filtering/ranking miss | 0/8 (0.0%) |
| Brand | Correct read conservative gate | 1/8 (12.5%) |
| Brand | Wrong reliable read | 0/8 (0.0%) |
| Brand | Correct reliable read | 0/8 (0.0%) |
| Warning | Total cases | 8 |
| Warning | Evaluable cases | 8 |
| Warning | Region not found | 2/8 (25.0%) |
| Warning | Region contaminated | 2/8 (25.0%) |
| Warning | Anchor miss | 2/8 (25.0%) |
| Warning | OCR recognition miss | 1/8 (12.5%) |
| Warning | Correct pass | 1/8 (12.5%) |
| Warning | Fail | 7/8 (87.5%) |
| Alcohol | Total cases | 8 |
| Alcohol | Evaluable cases | 0 |
| Alcohol | Not evaluated | 8/8 (100.0%) |

## Dominant Failures

- Brand: `BRAND_OCR_RECOGNITION_MISS`
- Government Warning: `WARNING_ANCHOR_NOT_FOUND`
- Alcohol: `ALCOHOL_NOT_EVALUATED`

## Safety Outcomes

- False reliable Brand reads: 0
- False Government Warning passes: 0
- False reliable Alcohol reads: 0

## Analysis

1. Is Brand grouping/ranking still dominant? Brand grouping/ranking is not the dominant real-label failure in this staging corpus.
2. Is raw OCR recognition dominant for Brand? Raw OCR recognition is the dominant Brand failure class.
3. Why is Government Warning failing? Government Warning failures split across missing anchors, contaminated regions, missing regions, and OCR transcription; exact comparison is proven only by the Christmas Hayride pass.
4. Can Alcohol performance be evaluated? Alcohol performance cannot be evaluated from the current staging evidence because every Alcohol result is metadata-only or not evaluated.
5. Recommended next experiment: `CORPUS_EXPANSION_REQUIRED` - Most real-label staging cases are metadata-only, so the next governed step is importing redistributable source images before tuning OCR behavior.
6. Deferred experiments: `BRAND_BOUNDED_PREPROCESSING`, `BRAND_SCALE_EXPERIMENT`, `WARNING_REGION_LOCALIZATION`, `WARNING_REGION_DECONTAMINATION`, `ALCOHOL_RECOVERY_TRIGGER`, `ALCOHOL_RESELECTION`
