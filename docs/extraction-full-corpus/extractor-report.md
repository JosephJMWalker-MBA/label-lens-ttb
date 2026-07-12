# Full-Corpus Extraction Evaluation (Issue #57)

Measured with the evaluation harness against the current production extractor `local-two-field-extractor@1.0.0`. This report is generated (`npm run eval:baseline`) and committed as a point-in-time full-corpus evaluation. Latencies are environment-dependent; all other figures are deterministic given fixed OCR output.

## Aggregate metrics

| Metric | Value | Denominator |
| --- | --- | --- |
| Brand exact match | 13% | 101 determinate |
| Brand normalized-acceptable match | 16% | 101 determinate |
| Brand top-3 recall | 27% | 101 determinate |
| Absent-brand false-positive rate | 100% | 10 absent |
| Alcohol detection recall | 37% | 101 present |
| Alcohol parsed-value accuracy | 35% | 101 present |
| Absent-alcohol false-positive rate | 7% | 14 absent |
| Ambiguity honesty (deferred when ambiguous) | 100% | 4 ambiguous |
| Median latency | 1143 ms | 115 cases |
| p95 latency | 2467 ms | 115 cases |

**Brand failure classes:** candidate-filtering-failure: 50, ocr-recognition-failure: 24, correct-uncertainty: 19, candidate-ranking-failure: 11, false-certainty: 10, correct: 1

**Alcohol failure classes:** correct: 48, candidate-generation-failure: 38, ocr-recognition-failure: 25, parser-failure: 2, false-certainty: 1, line-reconstruction-failure: 1

## Per-case results

| Case | Strata | Brand state → selected | Brand class | Alcohol state → value | Alcohol class | ms |
| --- | --- | --- | --- | --- | --- | --- |
| luigi-giovanni-live | decorative-or-script-brand; brand-punctuation; multiple-brand-like-phrases; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "Pir" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1100 |
| alfredos-wine | multi-line-brand; brand-punctuation; alcohol-at-bottom; front-label | AMBIGUOUS → "HLTRE" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1001 |
| la-fattoria-rotated | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "x Om BARBERA" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1245 |
| approved-wine-004 | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "- SAUVIGNON Zaz 0" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1388 |
| approved-wine-005 | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "0 Ao BARBERA" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 873 |
| approved-wine-006 | simple-centered-brand; low-contrast; front-label; alcohol-at-bottom | AMBIGUOUS → "I Wa" | candidate-filtering-failure | OBSERVED → "13.5% BY VOL." | correct | 1736 |
| casanova-della-spinetta | multi-line-brand; low-contrast; split-alcohol-tokens; front-label | AMBIGUOUS → "Ji Jl" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1313 |
| approved-wine-008 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "ZO TS" | candidate-filtering-failure | OBSERVED → "13% by vol" | correct | 1062 |
| approved-wine-009 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "ZO TS" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1120 |
| domaine-follin-arbelet | brand-punctuation; multiple-brand-like-phrases; alcohol-at-bottom; front-label | AMBIGUOUS → "Aloxe-Corton" | candidate-ranking-failure | OBSERVED → "14% BY VOL." | correct | 928 |
| approved-wine-011 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "Societa Agricola Maria Antonie" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 993 |
| approved-wine-012 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "Cool&y" | candidate-filtering-failure | OBSERVED → "13.8% by Volume" | correct | 1517 |
| approved-wine-013 | decorative-or-script-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "ie" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 2278 |
| approved-wine-014 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "RV" | candidate-ranking-failure | NOT_OBSERVED → ∅ | line-reconstruction-failure | 2182 |
| patricia-green-cellars | low-contrast; multiple-brand-like-phrases; genuinely-ambiguous; alcohol-at-bottom; front-label | AMBIGUOUS → "NEWBERG OREGON - 503.554.0821" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1169 |
| approved-wine-016 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "MARQUES vo NAVARRO" | candidate-filtering-failure | OBSERVED → "13.5% BY VOL" | correct | 965 |
| approved-wine-017 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "oABORDE NOIRE" | ocr-recognition-failure | OBSERVED → "12% BY VOL." | correct | 767 |
| approved-wine-018 | multi-line-brand; front-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "HH" | candidate-filtering-failure | OBSERVED → "3.5% by Vol." | parser-failure | 1960 |
| approved-wine-019 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "KYRIOS" | correct-uncertainty | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1463 |
| approved-wine-020 | simple-centered-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Da Sof" | candidate-ranking-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1675 |
| saker | simple-centered-brand; low-contrast; front-label | AMBIGUOUS → "SAKER" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1232 |
| approved-wine-022 | back-label; alcohol-at-bottom | AMBIGUOUS → "American grape wine Concord" | false-certainty | OBSERVED → "12% ALC BY VOL" | correct | 851 |
| approved-wine-023 | decorative-or-script-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "CONTANS" | ocr-recognition-failure | LOW_CONFIDENCE → "14% BY VOL" | correct | 1545 |
| approved-wine-024 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "NNW & OO um" | candidate-filtering-failure | NOT_OBSERVED → ∅ | correct | 1928 |
| nebla-mencia | simple-centered-brand; alcohol-at-bottom; front-label | AMBIGUOUS → "NEBLA" | correct-uncertainty | OBSERVED → "13% BY VOL." | correct | 1520 |
| approved-wine-026 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "PRINCIPE. DIPHESA" | correct-uncertainty | OBSERVED → "13.5% BY VOL." | correct | 1082 |
| approved-wine-027 | decorative-or-script-brand; front-label; brand-punctuation; alcohol-at-bottom | AMBIGUOUS → "N Gy A001" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1387 |
| approved-wine-028 | simple-centered-brand; front-label; missing-alcohol-statement | AMBIGUOUS → "FIELD" | correct-uncertainty | NOT_OBSERVED → ∅ | correct | 913 |
| approved-wine-031 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "enrhekeso" | ocr-recognition-failure | OBSERVED → "13.5% by Vol" | correct | 1380 |
| approved-wine-032 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "TRAVERS RESERVE" | correct-uncertainty | OBSERVED → "14% BY VOL" | correct | 2191 |
| approved-wine-033 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "COVE" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1844 |
| approved-wine-034 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "NICO" | correct-uncertainty | NOT_OBSERVED → ∅ | ocr-recognition-failure | 2467 |
| approved-wine-035 | decorative-or-script-brand; front-label; alcohol-at-side-or-rotated | AMBIGUOUS → "Hectiont" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 359 |
| approved-wine-037 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "SHIRAL." | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1278 |
| approved-wine-038 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "2024 SOUTH COAST PRIMITIVO" | candidate-filtering-failure | OBSERVED → "13.5% BY VOL." | correct | 1230 |
| approved-wine-039 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "vinea" | candidate-ranking-failure | OBSERVED → "13.5% BY VOL." | correct | 1035 |
| chateau-bonneau | brand-punctuation; multi-line-brand; low-contrast; front-label | AMBIGUOUS → "I Il" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1271 |
| approved-wine-041 | back-label; alcohol-at-bottom | AMBIGUOUS → "Petite Nature" | correct-uncertainty | OBSERVED → "13.0% alc/vol" | correct | 996 |
| approved-wine-042 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "x Fp" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1199 |
| approved-wine-043 | simple-centered-brand; front-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "FULCRUM" | correct-uncertainty | OBSERVED → "13.8% BY VOL." | parser-failure | 928 |
| approved-wine-044 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "VEEL" | ocr-recognition-failure | OBSERVED → "13.5% BY VOL." | correct | 2104 |
| approved-wine-045 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Meeting of ihe Minds" | candidate-filtering-failure | OBSERVED → "13.7% ALC./VOL." | correct | 1429 |
| approved-wine-046 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "CA CRV" | candidate-filtering-failure | NOT_OBSERVED → ∅ | correct | 1751 |
| approved-wine-047 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "pl Il I I" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1024 |
| approved-wine-048 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Pacha RESERVA - CARMENERE" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1674 |
| approved-wine-049 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "i OO" | ocr-recognition-failure | OBSERVED → "13.2% by Vol" | correct | 3921 |
| le-temps-des-fleurs | simple-centered-brand; alcohol-at-bottom; front-label | AMBIGUOUS → "LE TEMPS DES FLEURS" | correct-uncertainty | OBSERVED → "11.5% BY VOL." | correct | 915 |
| approved-wine-051 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "SELO GROUP 1 afr" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1457 |
| approved-wine-052 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "wre 2g" | candidate-filtering-failure | NOT_OBSERVED → ∅ | correct | 2766 |
| approved-wine-053 | multiple-brand-like-phrases; front-label; alcohol-at-side-or-rotated | AMBIGUOUS → "rg" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 887 |
| approved-wine-054 | multi-line-brand; back-label; alcohol-at-side-or-rotated | AMBIGUOUS → "CA CRV" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1001 |
| approved-wine-055 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JZ" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1040 |
| approved-wine-056 | multi-line-brand; back-label; alcohol-at-bottom; low-contrast | AMBIGUOUS → "Az. Agr. PRINSI" | candidate-ranking-failure | OBSERVED → "13.5% by Volume" | correct | 995 |
| approved-wine-057 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Cl LLU" | candidate-filtering-failure | OBSERVED → "13% by Volume" | correct | 917 |
| approved-wine-058 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "em IK I" | false-certainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1336 |
| approved-wine-059 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JI mmm Ill" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 877 |
| three-steves-winery | missing-alcohol-statement; multiple-brand-like-phrases; front-label | AMBIGUOUS → "3 STEVES WINERY" | correct-uncertainty | NOT_OBSERVED → ∅ | correct | 2177 |
| approved-wine-061 | back-label; low-resolution; missing-alcohol-statement | AMBIGUOUS → "Jl" | candidate-ranking-failure | NOT_OBSERVED → ∅ | correct | 1370 |
| approved-wine-062 | back-label; low-resolution; missing-alcohol-statement | AMBIGUOUS → "ji Ii I" | false-certainty | NOT_OBSERVED → ∅ | correct | 3153 |
| approved-wine-063 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Prins" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 779 |
| approved-wine-064 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Prins" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 777 |
| approved-wine-065 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → ". mpd. Lo" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 850 |
| approved-wine-066 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Lo JN" | candidate-filtering-failure | OBSERVED → "13% BY VOL" | correct | 1212 |
| approved-wine-067 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Lh JI" | candidate-filtering-failure | OBSERVED → "13% BY VOL" | correct | 1205 |
| approved-wine-068 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Il Hill" | candidate-ranking-failure | OBSERVED → "13% BY VOL." | correct | 1143 |
| approved-wine-069 | multi-line-brand; back-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "ll Il" | candidate-ranking-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 2140 |
| altacima | brand-punctuation; low-contrast; alcohol-at-bottom; front-label | AMBIGUOUS → "ALTACIMA 4.090" | correct-uncertainty | NOT_OBSERVED → ∅ | ocr-recognition-failure | 2231 |
| approved-wine-071 | multi-line-brand; back-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "L- LH-15208 &" | candidate-ranking-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 2704 |
| approved-wine-072 | back-label; dense-text; missing-alcohol-statement; genuinely-ambiguous | AMBIGUOUS → "Jl ll" | correct-uncertainty | NOT_OBSERVED → ∅ | correct | 2540 |
| approved-wine-073 | multi-line-brand; back-label; missing-alcohol-statement | OBSERVED → "Mike's Farm Inc." | correct | NOT_OBSERVED → ∅ | correct | 1195 |
| approved-wine-074 | multi-line-brand; back-label; missing-alcohol-statement | AMBIGUOUS → "PINE LEVEL NC 27568" | ocr-recognition-failure | NOT_OBSERVED → ∅ | correct | 1162 |
| approved-wine-075 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "& WN" | false-certainty | NOT_OBSERVED → ∅ | correct | 1484 |
| approved-wine-076 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Flore" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1021 |
| approved-wine-077 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "VALDINERA" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 983 |
| approved-wine-078 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "GARDA" | candidate-filtering-failure | OBSERVED → "14% BY VOLUME" | correct | 863 |
| approved-wine-079 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "HEALTH PROBLEMS." | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1091 |
| le-caniette | multi-line-brand; split-alcohol-tokens; alcohol-at-bottom; front-label | AMBIGUOUS → "HEALTH PROBLEMS." | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1041 |
| approved-wine-081 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "CORTEADAGIO" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 777 |
| approved-wine-082 | back-label; dense-text; alcohol-at-bottom; low-contrast | AMBIGUOUS → "LIVERMORE VALLEY" | false-certainty | OBSERVED → "14.0% BY VOLUME" | correct | 1318 |
| approved-wine-083 | decorative-or-script-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "hrismas Haid" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 875 |
| approved-wine-084 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Boca Raton - FL" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1148 |
| approved-wine-085 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "SP i" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 759 |
| approved-wine-086 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "cases were produced." | candidate-ranking-failure | NOT_OBSERVED → ∅ | correct | 1726 |
| approved-wine-087 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "AL" | candidate-filtering-failure | OBSERVED → "13.5% BY VOL." | correct | 2319 |
| approved-wine-088 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "LA MESMA Yellow Label" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 874 |
| approved-wine-089 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "LA MESMA Black Label" | candidate-filtering-failure | OBSERVED → "13% BY VOL" | correct | 786 |
| approved-wine-090 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "hands-on farming" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 848 |
| approved-wine-091 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "R DI GALLURA" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 842 |
| approved-wine-092 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Ora 5535700028" | ocr-recognition-failure | OBSERVED → "13.6% by Vol" | correct | 1113 |
| approved-wine-093 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "fontanvecchia" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1087 |
| approved-wine-094 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "SANNIO" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 958 |
| approved-wine-095 | back-label; dense-text; alcohol-at-bottom; low-resolution | AMBIGUOUS → "DELRAY BEACH FL" | false-certainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 699 |
| approved-wine-096 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "l I" | false-certainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1409 |
| approved-wine-097 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "PROBLEMS" | false-certainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1197 |
| approved-wine-098 | back-label; low-resolution; alcohol-at-bottom | AMBIGUOUS → "HEALTH PROBLEMS." | false-certainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 539 |
| approved-wine-099 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "SANNIO" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 930 |
| amuninni-ferracane | decorative-or-script-brand; multiple-brand-like-phrases; genuinely-ambiguous; alcohol-at-bottom; front-label | AMBIGUOUS → "INV ENVY" | correct-uncertainty | OBSERVED → "12.5% By Vol." | correct | 815 |
| approved-wine-101 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "JI" | false-certainty | NOT_OBSERVED → ∅ | correct | 1591 |
| approved-wine-102 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Sos CALIFORNIA 2079" | ocr-recognition-failure | OBSERVED → "13.4% by VOL" | correct | 1062 |
| approved-wine-103 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "fi" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1045 |
| approved-wine-104 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "BLAZIC" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1344 |
| approved-wine-105 | decorative-or-script-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "VANNI" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1021 |
| approved-wine-106 | simple-centered-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "ey" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 959 |
| approved-wine-107 | decorative-or-script-brand; wraparound; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "Pa Z e LC" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1021 |
| approved-wine-108 | decorative-or-script-brand; wraparound; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "La" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 834 |
| approved-wine-109 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "CHABLIS" | candidate-ranking-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 870 |
| approved-wine-110 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Cool&y" | candidate-filtering-failure | OBSERVED → "12.8% by Volume" | correct | 1417 |
| m-cellars-baseline | multiple-brand-like-phrases; alcohol-at-bottom; genuinely-ambiguous; front-label | AMBIGUOUS → "om" | correct-uncertainty | OBSERVED → "12.5% ALC./VOL." | correct | 1326 |
| wine-multi-artifact-04 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "ALN Jo ak A" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1350 |
| wine-multi-artifact-05 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "BLAZIC COLLIO" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1317 |
| wine-multi-artifact-06 | multi-panel; alcohol-at-side-or-rotated | AMBIGUOUS → "MOLINO" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 926 |
| wine-multi-artifact-07 | multi-panel; missing-alcohol-statement | AMBIGUOUS → "cpperong i" | ocr-recognition-failure | OBSERVED → "12% ALC./VOL." | false-certainty | 1290 |
| wine-multi-artifact-08 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "Z-lor" | candidate-filtering-failure | OBSERVED → "12.6% by vol." | correct | 765 |
| wine-multi-artifact-09 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "7 V A Ne" | candidate-filtering-failure | OBSERVED → "12.5% BY VOL." | correct | 819 |
| wine-multi-artifact-10 | multi-panel; alcohol-at-side-or-rotated | AMBIGUOUS → "Wt 1COLT og" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 796 |
