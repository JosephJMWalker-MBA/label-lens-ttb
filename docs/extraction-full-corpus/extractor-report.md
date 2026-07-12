# Full-Corpus Extraction Evaluation (Issue #57)

Measured with the evaluation harness against the current production extractor `local-two-field-extractor@1.0.0`. This report is generated (`npm run eval:baseline`) and committed as a point-in-time full-corpus evaluation. Latencies are environment-dependent; all other figures are deterministic given fixed OCR output.

This report is not evidence that the current extractor is production-ready. In particular, the absent-brand false-positive rate and the determinate-brand miss/defer rates remain gating defects.
Per-candidate reconstruction and ranking diagnostics are preserved in the committed JSON artifact; the markdown stays compact and highlights only the aggregate and per-case outcomes.

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
| Line reconstruction | 6 |
| Candidate generation | 38 |
| Candidate filtering | 35 |
| Candidate ranking | 8 |
| Parser | 2 |
| Unnecessary ambiguity | 25 |
| False certainty | 1 |
| Correct uncertainty | 4 |
| Correct result | 62 |

The current classifier exposes no explicit orientation-only bucket yet; rotated/vertical pressure is surfaced in the challenge slices above rather than as a separate failure-class total.

**Brand failure classes:** candidate-filtering-failure: 35, correct-uncertainty: 29, ocr-recognition-failure: 24, correct: 14, candidate-ranking-failure: 8, line-reconstruction-failure: 5

**Alcohol failure classes:** correct: 48, candidate-generation-failure: 38, ocr-recognition-failure: 25, parser-failure: 2, false-certainty: 1, line-reconstruction-failure: 1

| Median latency | 1157 ms | 115 cases |
| p95 latency | 2522 ms | 115 cases |

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
| luigi-giovanni-live | decorative-or-script-brand; brand-punctuation; multiple-brand-like-phrases; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "VANNI" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1090 |
| alfredos-wine | multi-line-brand; brand-punctuation; alcohol-at-bottom; front-label | AMBIGUOUS → "HLTRE" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 995 |
| la-fattoria-rotated | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "cCTIO" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1249 |
| approved-wine-004 | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "NORTH COAST CA OF" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1378 |
| approved-wine-005 | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "0 Ao BARBERA" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 870 |
| approved-wine-006 | simple-centered-brand; low-contrast; front-label; alcohol-at-bottom | AMBIGUOUS → "2 LRS3 aoc" | candidate-filtering-failure | OBSERVED → "13.5% BY VOL." | correct | 1762 |
| casanova-della-spinetta | multi-line-brand; low-contrast; split-alcohol-tokens; front-label | AMBIGUOUS → "CASANOVA DELLA SPINETTA" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1295 |
| approved-wine-008 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "Azienda Agricola Terre Sparse" | line-reconstruction-failure | OBSERVED → "13% by vol" | correct | 1086 |
| approved-wine-009 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "Azienda Agricola Terre Sparse" | line-reconstruction-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1134 |
| domaine-follin-arbelet | brand-punctuation; multiple-brand-like-phrases; alcohol-at-bottom; front-label | AMBIGUOUS → "DOMAINE FOLLIN-ARBELET" | correct-uncertainty | OBSERVED → "14% BY VOL." | correct | 938 |
| approved-wine-011 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "Societa Agricola Maria Antonie" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1005 |
| approved-wine-012 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "Cool&y" | candidate-filtering-failure | OBSERVED → "13.8% by Volume" | correct | 1540 |
| approved-wine-013 | decorative-or-script-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "Play ers Heart" | candidate-ranking-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 2302 |
| approved-wine-014 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "TRE CORI" | correct-uncertainty | NOT_OBSERVED → ∅ | line-reconstruction-failure | 2220 |
| patricia-green-cellars | low-contrast; multiple-brand-like-phrases; genuinely-ambiguous; alcohol-at-bottom; front-label | AMBIGUOUS → "ESTATE VINEYARD" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1181 |
| approved-wine-016 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "MARQUES vo NAVARRO" | candidate-filtering-failure | OBSERVED → "13.5% BY VOL" | correct | 984 |
| approved-wine-017 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "oABORDE NOIRE" | ocr-recognition-failure | OBSERVED → "12% BY VOL." | correct | 777 |
| approved-wine-018 | multi-line-brand; front-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Indigenous blend" | candidate-filtering-failure | OBSERVED → "3.5% by Vol." | parser-failure | 1989 |
| approved-wine-019 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "KYRIOS" | correct-uncertainty | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1491 |
| approved-wine-020 | simple-centered-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "COURTIEU" | correct-uncertainty | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1703 |
| saker | simple-centered-brand; low-contrast; front-label | AMBIGUOUS → "SAKER" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1235 |
| approved-wine-022 | back-label; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | OBSERVED → "12% ALC BY VOL" | correct | 862 |
| approved-wine-023 | decorative-or-script-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "PRIMITIVO" | ocr-recognition-failure | LOW_CONFIDENCE → "14% BY VOL" | correct | 1508 |
| approved-wine-024 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "CADILLAC COTES DE BORDEAUX" | candidate-filtering-failure | NOT_OBSERVED → ∅ | correct | 1928 |
| nebla-mencia | simple-centered-brand; alcohol-at-bottom; front-label | AMBIGUOUS → "NEBLA" | correct-uncertainty | OBSERVED → "13% BY VOL." | correct | 1545 |
| approved-wine-026 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "PRINCIPE. DIPHESA" | correct-uncertainty | OBSERVED → "13.5% BY VOL." | correct | 1082 |
| approved-wine-027 | decorative-or-script-brand; front-label; brand-punctuation; alcohol-at-bottom | AMBIGUOUS → "N Gy A001" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1411 |
| approved-wine-028 | simple-centered-brand; front-label; missing-alcohol-statement | AMBIGUOUS → "FIELD" | correct-uncertainty | NOT_OBSERVED → ∅ | correct | 956 |
| approved-wine-031 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Contiene Sulfitos Enthalt Sulfite" | ocr-recognition-failure | OBSERVED → "13.5% by Vol" | correct | 1401 |
| approved-wine-032 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "TRAVERS RESERVE" | correct-uncertainty | OBSERVED → "14% BY VOL" | correct | 2225 |
| approved-wine-033 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "COVE" | candidate-ranking-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1872 |
| approved-wine-034 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "NICO" | correct-uncertainty | NOT_OBSERVED → ∅ | ocr-recognition-failure | 2522 |
| approved-wine-035 | decorative-or-script-brand; front-label; alcohol-at-side-or-rotated | AMBIGUOUS → "CHASSAGNE-MONTRACHET" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 363 |
| approved-wine-037 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Strumica - Radovish Region" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1311 |
| approved-wine-038 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "2024 SOUTH COAST PRIMITIVO" | candidate-filtering-failure | OBSERVED → "13.5% BY VOL." | correct | 1252 |
| approved-wine-039 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "DOMAINE JULIEN AUROUX" | correct-uncertainty | OBSERVED → "13.5% BY VOL." | correct | 1049 |
| chateau-bonneau | brand-punctuation; multi-line-brand; low-contrast; front-label | AMBIGUOUS → "BONNEAU" | line-reconstruction-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1290 |
| approved-wine-041 | back-label; alcohol-at-bottom | AMBIGUOUS → "Petite Nature" | correct-uncertainty | OBSERVED → "13.0% alc/vol" | correct | 1018 |
| approved-wine-042 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "PRODUCT OF FRANCE" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1214 |
| approved-wine-043 | simple-centered-brand; front-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "FULCRUM" | correct-uncertainty | OBSERVED → "13.8% BY VOL." | parser-failure | 942 |
| approved-wine-044 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "VEEL" | ocr-recognition-failure | OBSERVED → "13.5% BY VOL." | correct | 2153 |
| approved-wine-045 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Meeting of ihe Minds" | line-reconstruction-failure | OBSERVED → "13.7% ALC./VOL." | correct | 1447 |
| approved-wine-046 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "Red Wine Blend Curious" | candidate-filtering-failure | NOT_OBSERVED → ∅ | correct | 1774 |
| approved-wine-047 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "DENOMINACIO D'ORIGEN" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1053 |
| approved-wine-048 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Pacha RESERVA - CARMENERE" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1708 |
| approved-wine-049 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "CAYWOQOD VINEYARD" | ocr-recognition-failure | OBSERVED → "13.2% by Vol" | correct | 4008 |
| le-temps-des-fleurs | simple-centered-brand; alcohol-at-bottom; front-label | AMBIGUOUS → "LE TEMPS DES FLEURS" | correct-uncertainty | OBSERVED → "11.5% BY VOL." | correct | 931 |
| approved-wine-051 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "PACHECA DOURO D.O.C" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1455 |
| approved-wine-052 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "OLp VINE ZINFANDEL" | candidate-filtering-failure | NOT_OBSERVED → ∅ | correct | 2813 |
| approved-wine-053 | multiple-brand-like-phrases; front-label; alcohol-at-side-or-rotated | AMBIGUOUS → "Vineya" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 899 |
| approved-wine-054 | multi-line-brand; back-label; alcohol-at-side-or-rotated | AMBIGUOUS → "IA5 ME15" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1019 |
| approved-wine-055 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "FRANCOIS VILLARD" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1056 |
| approved-wine-056 | multi-line-brand; back-label; alcohol-at-bottom; low-contrast | AMBIGUOUS → "CAMP dPIETRU" | candidate-ranking-failure | OBSERVED → "13.5% by Volume" | correct | 983 |
| approved-wine-057 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JI Lill" | candidate-ranking-failure | OBSERVED → "13% by Volume" | correct | 937 |
| approved-wine-058 | back-label; dense-text; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-generation-failure | 1332 |
| approved-wine-059 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JI mmm Ill" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 894 |
| three-steves-winery | missing-alcohol-statement; multiple-brand-like-phrases; front-label | OBSERVED → "3 STEVES WINERY" | correct | NOT_OBSERVED → ∅ | correct | 2208 |
| approved-wine-061 | back-label; low-resolution; missing-alcohol-statement | AMBIGUOUS → "APHRODITE" | correct-uncertainty | NOT_OBSERVED → ∅ | correct | 1400 |
| approved-wine-062 | back-label; low-resolution; missing-alcohol-statement | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | correct | 3202 |
| approved-wine-063 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "TRE FICHI" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 797 |
| approved-wine-064 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Prins" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 794 |
| approved-wine-065 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Prins" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 868 |
| approved-wine-066 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JULIETTE VRIL" | candidate-filtering-failure | OBSERVED → "13% BY VOL" | correct | 1233 |
| approved-wine-067 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JULIETTE VRIL" | candidate-filtering-failure | OBSERVED → "13% BY VOL" | correct | 1191 |
| approved-wine-068 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "SARA" | correct-uncertainty | OBSERVED → "13% BY VOL." | correct | 1166 |
| approved-wine-069 | multi-line-brand; back-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "ALTACIMA 4.090" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 2176 |
| altacima | brand-punctuation; low-contrast; alcohol-at-bottom; front-label | AMBIGUOUS → "ALTACIMA 4.090" | correct-uncertainty | NOT_OBSERVED → ∅ | ocr-recognition-failure | 2270 |
| approved-wine-071 | multi-line-brand; back-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "LATE HARVEST 2013" | candidate-ranking-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 2778 |
| approved-wine-072 | back-label; dense-text; missing-alcohol-statement; genuinely-ambiguous | AMBIGUOUS → "HINNANT FAMILY VINEYARDS" | correct-uncertainty | NOT_OBSERVED → ∅ | correct | 2626 |
| approved-wine-073 | multi-line-brand; back-label; missing-alcohol-statement | OBSERVED → "Mike's Farm, Inc." | correct | NOT_OBSERVED → ∅ | correct | 1220 |
| approved-wine-074 | multi-line-brand; back-label; missing-alcohol-statement | AMBIGUOUS → "HINNANT VINEYARDS" | ocr-recognition-failure | NOT_OBSERVED → ∅ | correct | 1186 |
| approved-wine-075 | back-label; dense-text; missing-alcohol-statement | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | correct | 1511 |
| approved-wine-076 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Flore" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1032 |
| approved-wine-077 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "VALDINERA" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1002 |
| approved-wine-078 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "MUSCOLINE-ITALIA" | candidate-filtering-failure | OBSERVED → "14% BY VOLUME" | correct | 877 |
| approved-wine-079 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "OFFIDA" | candidate-ranking-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1063 |
| le-caniette | multi-line-brand; split-alcohol-tokens; alcohol-at-bottom; front-label | AMBIGUOUS → "INDICAZIONE GEOGRAFICA PROTETTA" | candidate-ranking-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1056 |
| approved-wine-081 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "CORTEADAGIO" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 790 |
| approved-wine-082 | back-label; dense-text; alcohol-at-bottom; low-contrast | NOT_OBSERVED → ∅ | correct | OBSERVED → "14.0% BY VOLUME" | correct | 1332 |
| approved-wine-083 | decorative-or-script-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "Bam il" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 888 |
| approved-wine-084 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "BUTA DISTRIBUTORS INC" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1157 |
| approved-wine-085 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Denominazione Origine Controllata" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 771 |
| approved-wine-086 | back-label; dense-text; missing-alcohol-statement | OBSERVED → "3 STEVES WINERY" | correct | NOT_OBSERVED → ∅ | correct | 1774 |
| approved-wine-087 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "LANGHE SAUVIGNON Tuga" | candidate-ranking-failure | OBSERVED → "13.5% BY VOL." | correct | 2310 |
| approved-wine-088 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "LA MESMA Yellow Label" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 867 |
| approved-wine-089 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "LA MESMA Black Label" | candidate-filtering-failure | OBSERVED → "13% BY VOL" | correct | 795 |
| approved-wine-090 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "WHITE WINE 2018 Lo219" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 855 |
| approved-wine-091 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "D CONTROLLATA E" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 856 |
| approved-wine-092 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Hn SANTA BARBARA" | ocr-recognition-failure | OBSERVED → "13.6% by Vol" | correct | 1117 |
| approved-wine-093 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "DELRAY BEACH, FL, USA" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1007 |
| approved-wine-094 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "DELRAY BEACH. FL, USA" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 973 |
| approved-wine-095 | back-label; dense-text; alcohol-at-bottom; low-resolution | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-generation-failure | 708 |
| approved-wine-096 | back-label; dense-text; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-generation-failure | 1367 |
| approved-wine-097 | back-label; dense-text; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-generation-failure | 1217 |
| approved-wine-098 | back-label; low-resolution; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-generation-failure | 543 |
| approved-wine-099 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "DELRAY BEACH, FL, USA" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 941 |
| amuninni-ferracane | decorative-or-script-brand; multiple-brand-like-phrases; genuinely-ambiguous; alcohol-at-bottom; front-label | AMBIGUOUS → "INV ENVY" | correct-uncertainty | OBSERVED → "12.5% By Vol." | correct | 827 |
| approved-wine-101 | back-label; dense-text; missing-alcohol-statement | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | correct | 1618 |
| approved-wine-102 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Mevushal Kosher for Passover" | ocr-recognition-failure | OBSERVED → "13.4% by VOL" | correct | 1042 |
| approved-wine-103 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "SNA VALSO" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1060 |
| approved-wine-104 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "BLAZIC" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1354 |
| approved-wine-105 | decorative-or-script-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "VANNI" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1041 |
| approved-wine-106 | simple-centered-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "REDO" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 976 |
| approved-wine-107 | decorative-or-script-brand; wraparound; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "FATTORIA" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1047 |
| approved-wine-108 | decorative-or-script-brand; wraparound; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "8 Ao VINO BIANCO" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 856 |
| approved-wine-109 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "SANGOUARD-CHENE" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 874 |
| approved-wine-110 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Cool&y" | candidate-filtering-failure | OBSERVED → "12.8% by Volume" | correct | 1435 |
| m-cellars-baseline | multiple-brand-like-phrases; alcohol-at-bottom; genuinely-ambiguous; front-label | AMBIGUOUS → "CELLARS" | correct-uncertainty | OBSERVED → "12.5% ALC./VOL." | correct | 1347 |
| wine-multi-artifact-04 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "Donovan Visayas" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1383 |
| wine-multi-artifact-05 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "BLAZIC COLLIO" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1345 |
| wine-multi-artifact-06 | multi-panel; alcohol-at-side-or-rotated | AMBIGUOUS → "MOLINO" | line-reconstruction-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 957 |
| wine-multi-artifact-07 | multi-panel; missing-alcohol-statement | AMBIGUOUS → "North Carolina Nuscadine Nig" | ocr-recognition-failure | OBSERVED → "12% ALC./VOL." | false-certainty | 1301 |
| wine-multi-artifact-08 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "Z-lor" | candidate-filtering-failure | OBSERVED → "12.6% by vol." | correct | 771 |
| wine-multi-artifact-09 | multi-panel; alcohol-at-bottom | OBSERVED → "DUCK WALK VINEYARDS" | correct | OBSERVED → "12.5% BY VOL." | correct | 833 |
| wine-multi-artifact-10 | multi-panel; alcohol-at-side-or-rotated | AMBIGUOUS → "MAURO MOLINO" | correct-uncertainty | NOT_OBSERVED → ∅ | ocr-recognition-failure | 809 |
