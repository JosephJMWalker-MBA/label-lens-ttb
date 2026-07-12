# Full-Corpus Extraction Evaluation (Issue #57)

Measured with the evaluation harness against the current production extractor `local-two-field-extractor@1.0.0`. This report is generated (`npm run eval:baseline`) and committed as a point-in-time full-corpus evaluation. Latencies are environment-dependent; all other figures are deterministic given fixed OCR output.

This report is not evidence that the current extractor is production-ready. In particular, the absent-brand false-positive rate and the determinate-brand miss/defer rates remain gating defects.

## Brand metrics

| Metric | Value | Denominator |
| --- | --- | --- |
| Brand exact match | 13% | 101 determinate |
| Brand normalized-acceptable match | 16% | 101 determinate |
| Brand top-3 recall | 27% | 101 determinate |
| Brand top-5 recall | 30% | 101 determinate |
| Brand confident-correct rate | 1% | 101 determinate |
| Useful-but-deferred rate (acceptable brand surfaced within top-5 but not confidently selected) | 29% | 101 determinate |
| Unnecessary ambiguity rate | 15% | 101 determinate |
| Determinate false-certainty rate | 0% | 101 determinate |
| Determinate NOT_OBSERVED rate | 0% | 101 determinate |
| Genuine ambiguity honesty | 100% | 4 ambiguous |
| Absent-brand false-positive rate | 100% | 10 absent |

Ambiguity honesty applies only to the 4 genuinely ambiguous labels; it should not be read as overall success for the determinate-brand task.

## Alcohol metrics

| Metric | Value | Denominator |
| --- | --- | --- |
| Alcohol detection recall | 37% | 101 present |
| Alcohol parsed-value accuracy | 35% | 101 present |
| Alcohol parser-failure rate | 2% | 101 present |
| Alcohol overall false-certainty rate | 1% | 115 included |
| Absent-alcohol false-positive rate | 7% | 14 absent |

### Alcohol challenge slices

| Slice | Detection recall | Parsed accuracy | Denominator |
| --- | --- | --- | --- |
| Bottom-located alcohol statement | 43% | 40% | 87 present |
| Side/rotated alcohol layout | 0% | 0% | 11 present |
| Truth marked rotated or vertical | 0% | 0% | 11 present |
| Vertical mandatory strip layout | 0% | 0% | 5 present |
| Split-token alcohol wording | 0% | 0% | 2 present |
| Percent-less wording | 0% | 0% | 1 present |
| Decimal-value alcohol wording | 34% | 32% | 62 present |

## Failure distribution

| Bucket | Count |
| --- | --- |
| OCR recognition | 49 |
| Region coverage | 0 |
| Orientation | 0 |
| Line reconstruction | 1 |
| Candidate generation | 38 |
| Candidate filtering | 50 |
| Candidate ranking | 11 |
| Parser | 2 |
| Unnecessary ambiguity | 15 |
| False certainty | 11 |
| Correct uncertainty | 4 |
| Correct result | 49 |

The current classifier exposes no explicit orientation-only bucket yet; rotated/vertical pressure is surfaced in the challenge slices above rather than as a separate failure-class total.

**Brand failure classes:** candidate-filtering-failure: 50, ocr-recognition-failure: 24, correct-uncertainty: 19, candidate-ranking-failure: 11, false-certainty: 10, correct: 1

**Alcohol failure classes:** correct: 48, candidate-generation-failure: 38, ocr-recognition-failure: 25, parser-failure: 2, false-certainty: 1, line-reconstruction-failure: 1

| Median latency | 1149 ms | 115 cases |
| p95 latency | 2472 ms | 115 cases |

## Per-case results

| Case | Strata | Brand state → selected | Brand class | Alcohol state → value | Alcohol class | ms |
| --- | --- | --- | --- | --- | --- | --- |
| luigi-giovanni-live | decorative-or-script-brand; brand-punctuation; multiple-brand-like-phrases; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "Pir" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1129 |
| alfredos-wine | multi-line-brand; brand-punctuation; alcohol-at-bottom; front-label | AMBIGUOUS → "HLTRE" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1102 |
| la-fattoria-rotated | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "x Om BARBERA" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1297 |
| approved-wine-004 | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "- SAUVIGNON Zaz 0" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1366 |
| approved-wine-005 | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "0 Ao BARBERA" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 864 |
| approved-wine-006 | simple-centered-brand; low-contrast; front-label; alcohol-at-bottom | AMBIGUOUS → "I Wa" | candidate-filtering-failure | OBSERVED → "13.5% BY VOL." | correct | 1732 |
| casanova-della-spinetta | multi-line-brand; low-contrast; split-alcohol-tokens; front-label | AMBIGUOUS → "Ji Jl" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1274 |
| approved-wine-008 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "ZO TS" | candidate-filtering-failure | OBSERVED → "13% by vol" | correct | 1055 |
| approved-wine-009 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "ZO TS" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1107 |
| domaine-follin-arbelet | brand-punctuation; multiple-brand-like-phrases; alcohol-at-bottom; front-label | AMBIGUOUS → "Aloxe-Corton" | candidate-ranking-failure | OBSERVED → "14% BY VOL." | correct | 925 |
| approved-wine-011 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "Societa Agricola Maria Antonie" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 985 |
| approved-wine-012 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "Cool&y" | candidate-filtering-failure | OBSERVED → "13.8% by Volume" | correct | 1507 |
| approved-wine-013 | decorative-or-script-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "ie" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 2261 |
| approved-wine-014 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "RV" | candidate-ranking-failure | NOT_OBSERVED → ∅ | line-reconstruction-failure | 2180 |
| patricia-green-cellars | low-contrast; multiple-brand-like-phrases; genuinely-ambiguous; alcohol-at-bottom; front-label | AMBIGUOUS → "NEWBERG OREGON - 503.554.0821" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1161 |
| approved-wine-016 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "MARQUES vo NAVARRO" | candidate-filtering-failure | OBSERVED → "13.5% BY VOL" | correct | 959 |
| approved-wine-017 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "oABORDE NOIRE" | ocr-recognition-failure | OBSERVED → "12% BY VOL." | correct | 760 |
| approved-wine-018 | multi-line-brand; front-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "HH" | candidate-filtering-failure | OBSERVED → "3.5% by Vol." | parser-failure | 1982 |
| approved-wine-019 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "KYRIOS" | correct-uncertainty | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1464 |
| approved-wine-020 | simple-centered-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Da Sof" | candidate-ranking-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1671 |
| saker | simple-centered-brand; low-contrast; front-label | AMBIGUOUS → "SAKER" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1213 |
| approved-wine-022 | back-label; alcohol-at-bottom | AMBIGUOUS → "American grape wine Concord" | false-certainty | OBSERVED → "12% ALC BY VOL" | correct | 843 |
| approved-wine-023 | decorative-or-script-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "CONTANS" | ocr-recognition-failure | LOW_CONFIDENCE → "14% BY VOL" | correct | 1483 |
| approved-wine-024 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "NNW & OO um" | candidate-filtering-failure | NOT_OBSERVED → ∅ | correct | 1885 |
| nebla-mencia | simple-centered-brand; alcohol-at-bottom; front-label | AMBIGUOUS → "NEBLA" | correct-uncertainty | OBSERVED → "13% BY VOL." | correct | 1507 |
| approved-wine-026 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "PRINCIPE. DIPHESA" | correct-uncertainty | OBSERVED → "13.5% BY VOL." | correct | 1058 |
| approved-wine-027 | decorative-or-script-brand; front-label; brand-punctuation; alcohol-at-bottom | AMBIGUOUS → "N Gy A001" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1385 |
| approved-wine-028 | simple-centered-brand; front-label; missing-alcohol-statement | AMBIGUOUS → "FIELD" | correct-uncertainty | NOT_OBSERVED → ∅ | correct | 909 |
| approved-wine-031 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "enrhekeso" | ocr-recognition-failure | OBSERVED → "13.5% by Vol" | correct | 1392 |
| approved-wine-032 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "TRAVERS RESERVE" | correct-uncertainty | OBSERVED → "14% BY VOL" | correct | 2181 |
| approved-wine-033 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "COVE" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1837 |
| approved-wine-034 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "NICO" | correct-uncertainty | NOT_OBSERVED → ∅ | ocr-recognition-failure | 2472 |
| approved-wine-035 | decorative-or-script-brand; front-label; alcohol-at-side-or-rotated | AMBIGUOUS → "Hectiont" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 357 |
| approved-wine-037 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "SHIRAL." | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1269 |
| approved-wine-038 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "2024 SOUTH COAST PRIMITIVO" | candidate-filtering-failure | OBSERVED → "13.5% BY VOL." | correct | 1219 |
| approved-wine-039 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "vinea" | candidate-ranking-failure | OBSERVED → "13.5% BY VOL." | correct | 1033 |
| chateau-bonneau | brand-punctuation; multi-line-brand; low-contrast; front-label | AMBIGUOUS → "I Il" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1282 |
| approved-wine-041 | back-label; alcohol-at-bottom | AMBIGUOUS → "Petite Nature" | correct-uncertainty | OBSERVED → "13.0% alc/vol" | correct | 994 |
| approved-wine-042 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "x Fp" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1193 |
| approved-wine-043 | simple-centered-brand; front-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "FULCRUM" | correct-uncertainty | OBSERVED → "13.8% BY VOL." | parser-failure | 925 |
| approved-wine-044 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "VEEL" | ocr-recognition-failure | OBSERVED → "13.5% BY VOL." | correct | 2098 |
| approved-wine-045 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Meeting of ihe Minds" | candidate-filtering-failure | OBSERVED → "13.7% ALC./VOL." | correct | 1419 |
| approved-wine-046 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "CA CRV" | candidate-filtering-failure | NOT_OBSERVED → ∅ | correct | 1736 |
| approved-wine-047 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "pl Il I I" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1020 |
| approved-wine-048 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Pacha RESERVA - CARMENERE" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1661 |
| approved-wine-049 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "i OO" | ocr-recognition-failure | OBSERVED → "13.2% by Vol" | correct | 3894 |
| le-temps-des-fleurs | simple-centered-brand; alcohol-at-bottom; front-label | AMBIGUOUS → "LE TEMPS DES FLEURS" | correct-uncertainty | OBSERVED → "11.5% BY VOL." | correct | 911 |
| approved-wine-051 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "SELO GROUP 1 afr" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1427 |
| approved-wine-052 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "wre 2g" | candidate-filtering-failure | NOT_OBSERVED → ∅ | correct | 2748 |
| approved-wine-053 | multiple-brand-like-phrases; front-label; alcohol-at-side-or-rotated | AMBIGUOUS → "rg" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 881 |
| approved-wine-054 | multi-line-brand; back-label; alcohol-at-side-or-rotated | AMBIGUOUS → "CA CRV" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 997 |
| approved-wine-055 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JZ" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1034 |
| approved-wine-056 | multi-line-brand; back-label; alcohol-at-bottom; low-contrast | AMBIGUOUS → "Az. Agr. PRINSI" | candidate-ranking-failure | OBSERVED → "13.5% by Volume" | correct | 958 |
| approved-wine-057 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Cl LLU" | candidate-filtering-failure | OBSERVED → "13% by Volume" | correct | 914 |
| approved-wine-058 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "em IK I" | false-certainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1356 |
| approved-wine-059 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JI mmm Ill" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 872 |
| three-steves-winery | missing-alcohol-statement; multiple-brand-like-phrases; front-label | AMBIGUOUS → "3 STEVES WINERY" | correct-uncertainty | NOT_OBSERVED → ∅ | correct | 2164 |
| approved-wine-061 | back-label; low-resolution; missing-alcohol-statement | AMBIGUOUS → "Jl" | candidate-ranking-failure | NOT_OBSERVED → ∅ | correct | 1360 |
| approved-wine-062 | back-label; low-resolution; missing-alcohol-statement | AMBIGUOUS → "ji Ii I" | false-certainty | NOT_OBSERVED → ∅ | correct | 3170 |
| approved-wine-063 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Prins" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 784 |
| approved-wine-064 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Prins" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 776 |
| approved-wine-065 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → ". mpd. Lo" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 849 |
| approved-wine-066 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Lo JN" | candidate-filtering-failure | OBSERVED → "13% BY VOL" | correct | 1208 |
| approved-wine-067 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Lh JI" | candidate-filtering-failure | OBSERVED → "13% BY VOL" | correct | 1178 |
| approved-wine-068 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Il Hill" | candidate-ranking-failure | OBSERVED → "13% BY VOL." | correct | 1148 |
| approved-wine-069 | multi-line-brand; back-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "ll Il" | candidate-ranking-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 2153 |
| altacima | brand-punctuation; low-contrast; alcohol-at-bottom; front-label | AMBIGUOUS → "ALTACIMA 4.090" | correct-uncertainty | NOT_OBSERVED → ∅ | ocr-recognition-failure | 2231 |
| approved-wine-071 | multi-line-brand; back-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "L- LH-15208 &" | candidate-ranking-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 2753 |
| approved-wine-072 | back-label; dense-text; missing-alcohol-statement; genuinely-ambiguous | AMBIGUOUS → "Jl ll" | correct-uncertainty | NOT_OBSERVED → ∅ | correct | 2536 |
| approved-wine-073 | multi-line-brand; back-label; missing-alcohol-statement | OBSERVED → "Mike's Farm Inc." | correct | NOT_OBSERVED → ∅ | correct | 1222 |
| approved-wine-074 | multi-line-brand; back-label; missing-alcohol-statement | AMBIGUOUS → "PINE LEVEL NC 27568" | ocr-recognition-failure | NOT_OBSERVED → ∅ | correct | 1160 |
| approved-wine-075 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "& WN" | false-certainty | NOT_OBSERVED → ∅ | correct | 1500 |
| approved-wine-076 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Flore" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1076 |
| approved-wine-077 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "VALDINERA" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 982 |
| approved-wine-078 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "GARDA" | candidate-filtering-failure | OBSERVED → "14% BY VOLUME" | correct | 859 |
| approved-wine-079 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "HEALTH PROBLEMS." | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1056 |
| le-caniette | multi-line-brand; split-alcohol-tokens; alcohol-at-bottom; front-label | AMBIGUOUS → "HEALTH PROBLEMS." | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1037 |
| approved-wine-081 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "CORTEADAGIO" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 802 |
| approved-wine-082 | back-label; dense-text; alcohol-at-bottom; low-contrast | AMBIGUOUS → "LIVERMORE VALLEY" | false-certainty | OBSERVED → "14.0% BY VOLUME" | correct | 1311 |
| approved-wine-083 | decorative-or-script-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "hrismas Haid" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 872 |
| approved-wine-084 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Boca Raton - FL" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1149 |
| approved-wine-085 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "SP i" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 757 |
| approved-wine-086 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "cases were produced." | candidate-ranking-failure | NOT_OBSERVED → ∅ | correct | 1715 |
| approved-wine-087 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "AL" | candidate-filtering-failure | OBSERVED → "13.5% BY VOL." | correct | 2331 |
| approved-wine-088 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "LA MESMA Yellow Label" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 861 |
| approved-wine-089 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "LA MESMA Black Label" | candidate-filtering-failure | OBSERVED → "13% BY VOL" | correct | 832 |
| approved-wine-090 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "hands-on farming" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 848 |
| approved-wine-091 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "R DI GALLURA" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 838 |
| approved-wine-092 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Ora 5535700028" | ocr-recognition-failure | OBSERVED → "13.6% by Vol" | correct | 1161 |
| approved-wine-093 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "fontanvecchia" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 988 |
| approved-wine-094 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "SANNIO" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 957 |
| approved-wine-095 | back-label; dense-text; alcohol-at-bottom; low-resolution | AMBIGUOUS → "DELRAY BEACH FL" | false-certainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 696 |
| approved-wine-096 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "l I" | false-certainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1336 |
| approved-wine-097 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "PROBLEMS" | false-certainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1190 |
| approved-wine-098 | back-label; low-resolution; alcohol-at-bottom | AMBIGUOUS → "HEALTH PROBLEMS." | false-certainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 538 |
| approved-wine-099 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "SANNIO" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 928 |
| amuninni-ferracane | decorative-or-script-brand; multiple-brand-like-phrases; genuinely-ambiguous; alcohol-at-bottom; front-label | AMBIGUOUS → "INV ENVY" | correct-uncertainty | OBSERVED → "12.5% By Vol." | correct | 812 |
| approved-wine-101 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "JI" | false-certainty | NOT_OBSERVED → ∅ | correct | 1675 |
| approved-wine-102 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Sos CALIFORNIA 2079" | ocr-recognition-failure | OBSERVED → "13.4% by VOL" | correct | 1028 |
| approved-wine-103 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "fi" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1040 |
| approved-wine-104 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "BLAZIC" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1333 |
| approved-wine-105 | decorative-or-script-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "VANNI" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1016 |
| approved-wine-106 | simple-centered-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "ey" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 958 |
| approved-wine-107 | decorative-or-script-brand; wraparound; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "Pa Z e LC" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1015 |
| approved-wine-108 | decorative-or-script-brand; wraparound; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "La" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 829 |
| approved-wine-109 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "CHABLIS" | candidate-ranking-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 863 |
| approved-wine-110 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Cool&y" | candidate-filtering-failure | OBSERVED → "12.8% by Volume" | correct | 1407 |
| m-cellars-baseline | multiple-brand-like-phrases; alcohol-at-bottom; genuinely-ambiguous; front-label | AMBIGUOUS → "om" | correct-uncertainty | OBSERVED → "12.5% ALC./VOL." | correct | 1331 |
| wine-multi-artifact-04 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "ALN Jo ak A" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1348 |
| wine-multi-artifact-05 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "BLAZIC COLLIO" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1310 |
| wine-multi-artifact-06 | multi-panel; alcohol-at-side-or-rotated | AMBIGUOUS → "MOLINO" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 924 |
| wine-multi-artifact-07 | multi-panel; missing-alcohol-statement | AMBIGUOUS → "cpperong i" | ocr-recognition-failure | OBSERVED → "12% ALC./VOL." | false-certainty | 1283 |
| wine-multi-artifact-08 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "Z-lor" | candidate-filtering-failure | OBSERVED → "12.6% by vol." | correct | 761 |
| wine-multi-artifact-09 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "7 V A Ne" | candidate-filtering-failure | OBSERVED → "12.5% BY VOL." | correct | 812 |
| wine-multi-artifact-10 | multi-panel; alcohol-at-side-or-rotated | AMBIGUOUS → "Wt 1COLT og" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 795 |
