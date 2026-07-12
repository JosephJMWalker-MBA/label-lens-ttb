# Full-Corpus Extraction Evaluation (Issue #57)

Measured with the evaluation harness against the current production extractor `local-two-field-extractor@1.0.0`. This report is generated (`npm run eval:baseline`) and committed as a point-in-time full-corpus evaluation. Latencies are environment-dependent; all other figures are deterministic given fixed OCR output.

This report is not evidence that the current extractor is production-ready. Brand selection quality, alcohol recall/accuracy, and any remaining false-certainty cases remain gating defects.
Per-candidate reconstruction, ranking, and alcohol-assembly diagnostics are preserved in the committed JSON artifact; the markdown stays compact and highlights only the aggregate and per-case outcomes.

## Brand metrics

| Metric | Value | Denominator |
| --- | --- | --- |
| Brand exact match | 27% | 101 determinate |
| Brand normalized-acceptable match | 29% | 101 determinate |
| Brand top-3 recall | 33% | 101 determinate |
| Brand top-5 recall | 35% | 101 determinate |
| Brand confident-correct rate | 4% | 101 determinate |
| Useful-but-deferred rate (acceptable brand surfaced within top-5 but not confidently selected) | 31% | 101 determinate |
| Unnecessary ambiguity rate | 25% | 101 determinate |
| Determinate false-certainty rate | 0% | 101 determinate |
| False abstention rate | 0% | 101 determinate |
| Determinate NOT_OBSERVED rate | 0% | 101 determinate |
| Correct abstention rate | 100% | 10 absent |
| Genuine ambiguity honesty | 100% | 4 ambiguous |
| Absent-brand false-positive rate | 0% | 10 absent |

Ambiguity honesty applies only to the 4 genuinely ambiguous labels; it should not be read as overall success for the determinate-brand task.

## Alcohol metrics

| Metric | Value | Denominator |
| --- | --- | --- |
| Alcohol detection recall | 57% | 101 present |
| Alcohol parsed-value accuracy | 54% | 101 present |
| Alcohol parser-failure rate | 3% | 101 present |
| Alcohol overall false-certainty rate | 1% | 115 included |
| Absent-alcohol false-positive rate | 7% | 14 absent |

### Alcohol challenge slices

| Slice | Detection recall | Parsed accuracy | Denominator |
| --- | --- | --- | --- |
| Bottom-located alcohol statement | 66% | 62% | 87 present |
| Side/rotated alcohol layout | 0% | 0% | 11 present |
| Truth marked rotated or vertical | 0% | 0% | 11 present |
| Vertical mandatory strip layout | 0% | 0% | 5 present |
| Split-token alcohol wording | 100% | 100% | 2 present |
| Percent-less wording | 100% | 100% | 1 present |
| Decimal-value alcohol wording | 61% | 60% | 62 present |

## Failure distribution

| Bucket | Count |
| --- | --- |
| OCR recognition | 33 |
| Region coverage | 0 |
| Orientation | 0 |
| Line reconstruction | 5 |
| Candidate generation | 1 |
| Candidate filtering | 68 |
| Candidate ranking | 8 |
| Parser | 3 |
| Unnecessary ambiguity | 25 |
| False certainty | 1 |
| Correct uncertainty | 4 |
| Correct result | 82 |

The current classifier exposes no explicit orientation-only bucket yet; rotated/vertical pressure is surfaced in the challenge slices above rather than as a separate failure-class total.

**Brand failure classes:** candidate-filtering-failure: 35, correct-uncertainty: 29, ocr-recognition-failure: 24, correct: 14, candidate-ranking-failure: 8, line-reconstruction-failure: 5

**Alcohol failure classes:** correct: 68, candidate-filtering-failure: 33, ocr-recognition-failure: 9, parser-failure: 3, candidate-generation-failure: 1, false-certainty: 1

| Median latency | 1258 ms | 115 cases |
| p95 latency | 2644 ms | 115 cases |

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

| Case | Strata | Brand state → selected | Brand class | Alcohol state → value | Alcohol class | ms |
| --- | --- | --- | --- | --- | --- | --- |
| luigi-giovanni-live | decorative-or-script-brand; brand-punctuation; multiple-brand-like-phrases; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "VANNI" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1201 |
| alfredos-wine | multi-line-brand; brand-punctuation; alcohol-at-bottom; front-label | AMBIGUOUS → "HLTRE" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1118 |
| la-fattoria-rotated | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "cCTIO" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1394 |
| approved-wine-004 | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "NORTH COAST CA OF" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1614 |
| approved-wine-005 | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "0 Ao BARBERA" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 962 |
| approved-wine-006 | simple-centered-brand; low-contrast; front-label; alcohol-at-bottom | AMBIGUOUS → "2 LRS3 aoc" | candidate-filtering-failure | OBSERVED → "13.5% BY VOL." | correct | 1906 |
| casanova-della-spinetta | multi-line-brand; low-contrast; split-alcohol-tokens; front-label | AMBIGUOUS → "CASANOVA DELLA SPINETTA" | correct-uncertainty | OBSERVED → "ALCOHOL 14 BY VOLUME" | correct | 1471 |
| approved-wine-008 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "Azienda Agricola Terre Sparse" | line-reconstruction-failure | OBSERVED → "13% ALC./VOL." | correct | 1200 |
| approved-wine-009 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "Azienda Agricola Terre Sparse" | line-reconstruction-failure | OBSERVED → "13.5% ALC./VOL." | correct | 1235 |
| domaine-follin-arbelet | brand-punctuation; multiple-brand-like-phrases; alcohol-at-bottom; front-label | AMBIGUOUS → "DOMAINE FOLLIN-ARBELET" | correct-uncertainty | OBSERVED → "14% BY VOL." | correct | 1071 |
| approved-wine-011 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "Societa Agricola Maria Antonie" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1097 |
| approved-wine-012 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "Cool&y" | candidate-filtering-failure | OBSERVED → "13.8% BY VOL." | correct | 1691 |
| approved-wine-013 | decorative-or-script-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "Play ers Heart" | candidate-ranking-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 2545 |
| approved-wine-014 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "TRE CORI" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 2437 |
| patricia-green-cellars | low-contrast; multiple-brand-like-phrases; genuinely-ambiguous; alcohol-at-bottom; front-label | AMBIGUOUS → "ESTATE VINEYARD" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1282 |
| approved-wine-016 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "MARQUES vo NAVARRO" | candidate-filtering-failure | OBSERVED → "13.5% BY VOL." | correct | 1074 |
| approved-wine-017 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "oABORDE NOIRE" | ocr-recognition-failure | OBSERVED → "12% ALC./VOL." | correct | 844 |
| approved-wine-018 | multi-line-brand; front-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Indigenous blend" | candidate-filtering-failure | OBSERVED → "3.5% BY VOL." | parser-failure | 2388 |
| approved-wine-019 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "KYRIOS" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1777 |
| approved-wine-020 | simple-centered-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "COURTIEU" | correct-uncertainty | LOW_CONFIDENCE → "12.5% ALC./VOL." | correct | 1912 |
| saker | simple-centered-brand; low-contrast; front-label | AMBIGUOUS → "SAKER" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1341 |
| approved-wine-022 | back-label; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | OBSERVED → "12% ALC./VOL." | correct | 1033 |
| approved-wine-023 | decorative-or-script-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "PRIMITIVO" | ocr-recognition-failure | LOW_CONFIDENCE → "14% ALC./VOL." | correct | 1792 |
| approved-wine-024 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "CADILLAC COTES DE BORDEAUX" | candidate-filtering-failure | NOT_OBSERVED → ∅ | correct | 2376 |
| nebla-mencia | simple-centered-brand; alcohol-at-bottom; front-label | AMBIGUOUS → "NEBLA" | correct-uncertainty | OBSERVED → "13% ALC./VOL." | correct | 1971 |
| approved-wine-026 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "PRINCIPE. DIPHESA" | correct-uncertainty | OBSERVED → "13.5% ALC./VOL." | correct | 1504 |
| approved-wine-027 | decorative-or-script-brand; front-label; brand-punctuation; alcohol-at-bottom | AMBIGUOUS → "N Gy A001" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1536 |
| approved-wine-028 | simple-centered-brand; front-label; missing-alcohol-statement | AMBIGUOUS → "FIELD" | correct-uncertainty | NOT_OBSERVED → ∅ | correct | 1004 |
| approved-wine-031 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Contiene Sulfitos Enthalt Sulfite" | ocr-recognition-failure | OBSERVED → "13.5% ALC./VOL." | correct | 1486 |
| approved-wine-032 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "TRAVERS RESERVE" | correct-uncertainty | OBSERVED → "14% BY VOL." | correct | 2359 |
| approved-wine-033 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "COVE" | candidate-ranking-failure | OBSERVED → "13.7% ALC./VOL." | correct | 1978 |
| approved-wine-034 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "NICO" | correct-uncertainty | LOW_CONFIDENCE → "13.5% BY VOL." | correct | 2644 |
| approved-wine-035 | decorative-or-script-brand; front-label; alcohol-at-side-or-rotated | AMBIGUOUS → "CHASSAGNE-MONTRACHET" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 393 |
| approved-wine-037 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Strumica - Radovish Region" | candidate-filtering-failure | OBSERVED → "19.0% BY VOL." | parser-failure | 1381 |
| approved-wine-038 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "2024 SOUTH COAST PRIMITIVO" | candidate-filtering-failure | OBSERVED → "13.5% ALC./VOL." | correct | 1336 |
| approved-wine-039 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "DOMAINE JULIEN AUROUX" | correct-uncertainty | OBSERVED → "13.5% ALC./VOL." | correct | 1133 |
| chateau-bonneau | brand-punctuation; multi-line-brand; low-contrast; front-label | AMBIGUOUS → "BONNEAU" | line-reconstruction-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1360 |
| approved-wine-041 | back-label; alcohol-at-bottom | AMBIGUOUS → "Petite Nature" | correct-uncertainty | OBSERVED → "13.0% ALC./VOL." | correct | 1142 |
| approved-wine-042 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "PRODUCT OF FRANCE" | candidate-filtering-failure | OBSERVED → "13.5% ALC./VOL." | correct | 1278 |
| approved-wine-043 | simple-centered-brand; front-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "FULCRUM" | correct-uncertainty | OBSERVED → "13.8% BY VOL." | parser-failure | 1067 |
| approved-wine-044 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "VEEL" | ocr-recognition-failure | OBSERVED → "13.5% ALC./VOL." | correct | 2285 |
| approved-wine-045 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Meeting of ihe Minds" | line-reconstruction-failure | OBSERVED → "13.7% ALC./VOL." | correct | 1738 |
| approved-wine-046 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "Red Wine Blend Curious" | candidate-filtering-failure | NOT_OBSERVED → ∅ | correct | 2108 |
| approved-wine-047 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "DENOMINACIO D'ORIGEN" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1166 |
| approved-wine-048 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Pacha RESERVA - CARMENERE" | candidate-filtering-failure | OBSERVED → "14.0% BY VOL." | correct | 1814 |
| approved-wine-049 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "CAYWOQOD VINEYARD" | ocr-recognition-failure | OBSERVED → "13.2% ALC./VOL." | correct | 4159 |
| le-temps-des-fleurs | simple-centered-brand; alcohol-at-bottom; front-label | AMBIGUOUS → "LE TEMPS DES FLEURS" | correct-uncertainty | OBSERVED → "11.5% ALC./VOL." | correct | 1012 |
| approved-wine-051 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "PACHECA DOURO D.O.C" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1592 |
| approved-wine-052 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "OLp VINE ZINFANDEL" | candidate-filtering-failure | NOT_OBSERVED → ∅ | correct | 3039 |
| approved-wine-053 | multiple-brand-like-phrases; front-label; alcohol-at-side-or-rotated | AMBIGUOUS → "Vineya" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 978 |
| approved-wine-054 | multi-line-brand; back-label; alcohol-at-side-or-rotated | AMBIGUOUS → "IA5 ME15" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1102 |
| approved-wine-055 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "FRANCOIS VILLARD" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1208 |
| approved-wine-056 | multi-line-brand; back-label; alcohol-at-bottom; low-contrast | AMBIGUOUS → "CAMP dPIETRU" | candidate-ranking-failure | OBSERVED → "13.5% BY VOL." | correct | 1176 |
| approved-wine-057 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JI Lill" | candidate-ranking-failure | OBSERVED → "13% BY VOL." | correct | 1000 |
| approved-wine-058 | back-label; dense-text; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1460 |
| approved-wine-059 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JI mmm Ill" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1008 |
| three-steves-winery | missing-alcohol-statement; multiple-brand-like-phrases; front-label | OBSERVED → "3 STEVES WINERY" | correct | NOT_OBSERVED → ∅ | correct | 2391 |
| approved-wine-061 | back-label; low-resolution; missing-alcohol-statement | AMBIGUOUS → "APHRODITE" | correct-uncertainty | NOT_OBSERVED → ∅ | correct | 1497 |
| approved-wine-062 | back-label; low-resolution; missing-alcohol-statement | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | correct | 3540 |
| approved-wine-063 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "TRE FICHI" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 876 |
| approved-wine-064 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Prins" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 855 |
| approved-wine-065 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Prins" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 940 |
| approved-wine-066 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JULIETTE VRIL" | candidate-filtering-failure | OBSERVED → "13% ALC./VOL." | correct | 1450 |
| approved-wine-067 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JULIETTE VRIL" | candidate-filtering-failure | OBSERVED → "13% BY VOL." | correct | 1495 |
| approved-wine-068 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "SARA" | correct-uncertainty | OBSERVED → "13% ALC./VOL." | correct | 1258 |
| approved-wine-069 | multi-line-brand; back-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "ALTACIMA 4.090" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 2361 |
| altacima | brand-punctuation; low-contrast; alcohol-at-bottom; front-label | AMBIGUOUS → "ALTACIMA 4.090" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 2474 |
| approved-wine-071 | multi-line-brand; back-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "LATE HARVEST 2013" | candidate-ranking-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 2982 |
| approved-wine-072 | back-label; dense-text; missing-alcohol-statement; genuinely-ambiguous | AMBIGUOUS → "HINNANT FAMILY VINEYARDS" | correct-uncertainty | NOT_OBSERVED → ∅ | correct | 2776 |
| approved-wine-073 | multi-line-brand; back-label; missing-alcohol-statement | OBSERVED → "Mike's Farm, Inc." | correct | NOT_OBSERVED → ∅ | correct | 1276 |
| approved-wine-074 | multi-line-brand; back-label; missing-alcohol-statement | AMBIGUOUS → "HINNANT VINEYARDS" | ocr-recognition-failure | NOT_OBSERVED → ∅ | correct | 1276 |
| approved-wine-075 | back-label; dense-text; missing-alcohol-statement | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | correct | 1599 |
| approved-wine-076 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Flore" | candidate-filtering-failure | OBSERVED → "13.5% ALC./VOL." | correct | 1092 |
| approved-wine-077 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "VALDINERA" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1088 |
| approved-wine-078 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "MUSCOLINE-ITALIA" | candidate-filtering-failure | OBSERVED → "14% BY VOL." | correct | 922 |
| approved-wine-079 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "OFFIDA" | candidate-ranking-failure | LOW_CONFIDENCE → "13.5% BY VOL." | correct | 1186 |
| le-caniette | multi-line-brand; split-alcohol-tokens; alcohol-at-bottom; front-label | AMBIGUOUS → "INDICAZIONE GEOGRAFICA PROTETTA" | candidate-ranking-failure | OBSERVED → "12.5% BY VOL." | correct | 1155 |
| approved-wine-081 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "CORTEADAGIO" | correct-uncertainty | OBSERVED → "12% BY VOL." | correct | 898 |
| approved-wine-082 | back-label; dense-text; alcohol-at-bottom; low-contrast | NOT_OBSERVED → ∅ | correct | OBSERVED → "14.0% BY VOL." | correct | 1420 |
| approved-wine-083 | decorative-or-script-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "Bam il" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1019 |
| approved-wine-084 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "BUTA DISTRIBUTORS INC" | candidate-filtering-failure | OBSERVED → "13.5% ALC./VOL." | correct | 1227 |
| approved-wine-085 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Denominazione Origine Controllata" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 819 |
| approved-wine-086 | back-label; dense-text; missing-alcohol-statement | OBSERVED → "3 STEVES WINERY" | correct | NOT_OBSERVED → ∅ | correct | 1825 |
| approved-wine-087 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "LANGHE SAUVIGNON Tuga" | candidate-ranking-failure | OBSERVED → "13.5% ALC./VOL." | correct | 2451 |
| approved-wine-088 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "LA MESMA Yellow Label" | candidate-filtering-failure | OBSERVED → "12.5% BY VOL." | correct | 942 |
| approved-wine-089 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "LA MESMA Black Label" | candidate-filtering-failure | OBSERVED → "13% BY VOL." | correct | 941 |
| approved-wine-090 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "WHITE WINE 2018 Lo219" | candidate-filtering-failure | OBSERVED → "12.5% BY VOL." | correct | 908 |
| approved-wine-091 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "D CONTROLLATA E" | ocr-recognition-failure | OBSERVED → "13.5% BY VOL." | correct | 950 |
| approved-wine-092 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Hn SANTA BARBARA" | ocr-recognition-failure | OBSERVED → "13.6% ALC./VOL." | correct | 1177 |
| approved-wine-093 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "DELRAY BEACH, FL, USA" | candidate-filtering-failure | OBSERVED → "13.50% ALC./VOL." | correct | 1151 |
| approved-wine-094 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "DELRAY BEACH. FL, USA" | candidate-filtering-failure | OBSERVED → "13.50% ALC./VOL." | correct | 1023 |
| approved-wine-095 | back-label; dense-text; alcohol-at-bottom; low-resolution | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-filtering-failure | 742 |
| approved-wine-096 | back-label; dense-text; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1448 |
| approved-wine-097 | back-label; dense-text; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1307 |
| approved-wine-098 | back-label; low-resolution; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-filtering-failure | 590 |
| approved-wine-099 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "DELRAY BEACH, FL, USA" | candidate-filtering-failure | OBSERVED → "13.50% ALC./VOL." | correct | 1037 |
| amuninni-ferracane | decorative-or-script-brand; multiple-brand-like-phrases; genuinely-ambiguous; alcohol-at-bottom; front-label | AMBIGUOUS → "INV ENVY" | correct-uncertainty | OBSERVED → "12.5% BY VOL." | correct | 891 |
| approved-wine-101 | back-label; dense-text; missing-alcohol-statement | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | correct | 1859 |
| approved-wine-102 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Mevushal Kosher for Passover" | ocr-recognition-failure | OBSERVED → "13.4% ALC./VOL." | correct | 1106 |
| approved-wine-103 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "SNA VALSO" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1124 |
| approved-wine-104 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "BLAZIC" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1418 |
| approved-wine-105 | decorative-or-script-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "VANNI" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1117 |
| approved-wine-106 | simple-centered-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "REDO" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1115 |
| approved-wine-107 | decorative-or-script-brand; wraparound; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "FATTORIA" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1121 |
| approved-wine-108 | decorative-or-script-brand; wraparound; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "8 Ao VINO BIANCO" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 969 |
| approved-wine-109 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "SANGOUARD-CHENE" | correct-uncertainty | OBSERVED → "12.5% BY VOL." | correct | 923 |
| approved-wine-110 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Cool&y" | candidate-filtering-failure | OBSERVED → "12.8% BY VOL." | correct | 1527 |
| m-cellars-baseline | multiple-brand-like-phrases; alcohol-at-bottom; genuinely-ambiguous; front-label | AMBIGUOUS → "CELLARS" | correct-uncertainty | OBSERVED → "12.5% ALC./VOL." | correct | 1422 |
| wine-multi-artifact-04 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "Donovan Visayas" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 1466 |
| wine-multi-artifact-05 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "BLAZIC COLLIO" | candidate-filtering-failure | OBSERVED → "ALCOHOL 13.5 BY VOLUME" | correct | 1418 |
| wine-multi-artifact-06 | multi-panel; alcohol-at-side-or-rotated | AMBIGUOUS → "MOLINO" | line-reconstruction-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 998 |
| wine-multi-artifact-07 | multi-panel; missing-alcohol-statement | AMBIGUOUS → "North Carolina Nuscadine Nig" | ocr-recognition-failure | OBSERVED → "12% ALC./VOL." | false-certainty | 1375 |
| wine-multi-artifact-08 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "Z-lor" | candidate-filtering-failure | OBSERVED → "12.6% BY VOL." | correct | 838 |
| wine-multi-artifact-09 | multi-panel; alcohol-at-bottom | OBSERVED → "DUCK WALK VINEYARDS" | correct | OBSERVED → "12.5% BY VOL." | correct | 906 |
| wine-multi-artifact-10 | multi-panel; alcohol-at-side-or-rotated | AMBIGUOUS → "MAURO MOLINO" | correct-uncertainty | NOT_OBSERVED → ∅ | ocr-recognition-failure | 878 |
