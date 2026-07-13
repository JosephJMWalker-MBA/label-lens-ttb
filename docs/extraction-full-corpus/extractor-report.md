# Full-Corpus Extraction Evaluation (Issue #57)

Measured with the evaluation harness against the current production extractor `local-two-field-extractor@1.0.0`. This report is generated (`npm run eval:baseline`) and committed as a point-in-time full-corpus evaluation. Latencies are environment-dependent; all other figures are deterministic given fixed OCR output.

This report is not evidence that the current extractor is production-ready. Brand selection quality, alcohol recall/accuracy, and any remaining false-certainty cases remain gating defects.
Ambiguity honesty applies only to the genuinely ambiguous labels; it is not evidence of overall extractor usefulness.

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

## Pass Cost

| Metric | Value |
| --- | --- |
| Median OCR passes per image | 1 |
| p95 OCR passes per image | 4 |
| Cases requiring extra passes | 57 (50%) |
| Median recovery duration | 0 ms |
| p95 recovery duration | 2906 ms |
| Median total OCR duration | 1408 ms |
| p95 total OCR duration | 3673 ms |
| Extra passes with no usable evidence | 127 |
| Recovery cost per recovered correct field | 24884 ms |

| Median latency | 1646 ms | 115 cases |
| p95 latency | 4628 ms | 115 cases |

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

| Case | Strata | Brand state → selected | Brand class | Alcohol state → value | Alcohol class | passes | ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| luigi-giovanni-live | decorative-or-script-brand; brand-punctuation; multiple-brand-like-phrases; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "VANNI" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 2268 |
| alfredos-wine | multi-line-brand; brand-punctuation; alcohol-at-bottom; front-label | AMBIGUOUS → "HLTRE" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 2375 |
| la-fattoria-rotated | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "cCTIO" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 3681 |
| approved-wine-004 | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "NORTH COAST CA OF" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 3258 |
| approved-wine-005 | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "0 Ao BARBERA" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 2366 |
| approved-wine-006 | simple-centered-brand; low-contrast; front-label; alcohol-at-bottom | AMBIGUOUS → "2 LRS3 aoc" | candidate-filtering-failure | OBSERVED → "13.5% BY VOL." | correct | 1 | 1861 |
| casanova-della-spinetta | multi-line-brand; low-contrast; split-alcohol-tokens; front-label | AMBIGUOUS → "CASANOVA DELLA SPINETTA" | correct-uncertainty | OBSERVED → "ALCOHOL 14 BY VOLUME" | correct | 1 | 1150 |
| approved-wine-008 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "Azienda Agricola Terre Sparse" | candidate-filtering-failure | OBSERVED → "13% ALC./VOL." | correct | 1 | 1098 |
| approved-wine-009 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "Azienda Agricola Terre Sparse" | candidate-filtering-failure | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 1077 |
| domaine-follin-arbelet | brand-punctuation; multiple-brand-like-phrases; alcohol-at-bottom; front-label | AMBIGUOUS → "DOMAINE FOLLIN-ARBELET" | correct-uncertainty | OBSERVED → "14% BY VOL." | correct | 1 | 746 |
| approved-wine-011 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "Societa Agricola Maria Antonie" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 4 | 2856 |
| approved-wine-012 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "Cool&y" | candidate-filtering-failure | OBSERVED → "13.8% BY VOL." | correct | 1 | 1123 |
| approved-wine-013 | decorative-or-script-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "Play ers Heart" | candidate-ranking-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 3975 |
| approved-wine-014 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "TRE CORI" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 4628 |
| patricia-green-cellars | low-contrast; multiple-brand-like-phrases; genuinely-ambiguous; alcohol-at-bottom; front-label | AMBIGUOUS → "ESTATE VINEYARD" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 1944 |
| approved-wine-016 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "MARQUES vo NAVARRO" | candidate-filtering-failure | OBSERVED → "13.5% BY VOL." | correct | 1 | 982 |
| approved-wine-017 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "oABORDE NOIRE" | ocr-recognition-failure | OBSERVED → "12% ALC./VOL." | correct | 1 | 656 |
| approved-wine-018 | multi-line-brand; front-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Indigenous blend" | candidate-filtering-failure | OBSERVED → "3.5% BY VOL." | parser-failure | 1 | 1646 |
| approved-wine-019 | simple-centered-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "KYRIOS" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 2860 |
| approved-wine-020 | simple-centered-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "COURTIEU" | correct-uncertainty | LOW_CONFIDENCE → "12.5% ALC./VOL." | correct | 1 | 1357 |
| saker | simple-centered-brand; low-contrast; front-label | AMBIGUOUS → "SAKER" | correct-uncertainty | OBSERVED → "12.6% ALC./VOL." | correct | 4 | 2921 |
| approved-wine-022 | back-label; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | OBSERVED → "12% ALC./VOL." | correct | 1 | 736 |
| approved-wine-023 | decorative-or-script-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "PRIMITIVO" | ocr-recognition-failure | LOW_CONFIDENCE → "14% ALC./VOL." | correct | 1 | 1192 |
| approved-wine-024 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "CADILLAC COTES DE BORDEAUX" | candidate-filtering-failure | NOT_OBSERVED → ∅ | correct | 3 | 3903 |
| nebla-mencia | simple-centered-brand; alcohol-at-bottom; front-label | AMBIGUOUS → "NEBLA" | correct-uncertainty | OBSERVED → "13% ALC./VOL." | correct | 1 | 1057 |
| approved-wine-026 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "PRINCIPE. DIPHESA" | correct-uncertainty | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 935 |
| approved-wine-027 | decorative-or-script-brand; front-label; brand-punctuation; alcohol-at-bottom | AMBIGUOUS → "N Gy A001" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 2897 |
| approved-wine-028 | simple-centered-brand; front-label; alcohol-at-side-or-rotated | AMBIGUOUS → "FIELD" | correct-uncertainty | OBSERVED → "13.3% ALC./VOL." | correct | 3 | 1506 |
| approved-wine-031 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Contiene Sulfitos Enthalt Sulfite" | ocr-recognition-failure | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 1237 |
| approved-wine-032 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "TRAVERS RESERVE" | correct-uncertainty | OBSERVED → "14% BY VOL." | correct | 1 | 1797 |
| approved-wine-033 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "COVE" | candidate-ranking-failure | OBSERVED → "13.7% ALC./VOL." | correct | 1 | 1858 |
| approved-wine-034 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "NICO" | correct-uncertainty | LOW_CONFIDENCE → "13.5% BY VOL." | correct | 1 | 2176 |
| approved-wine-035 | decorative-or-script-brand; front-label; alcohol-at-side-or-rotated | AMBIGUOUS → "CHASSAGNE-MONTRACHET" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 3 | 968 |
| approved-wine-037 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Strumica - Radovish Region" | candidate-filtering-failure | OBSERVED → "19.0% BY VOL." | parser-failure | 1 | 1274 |
| approved-wine-038 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "2024 SOUTH COAST PRIMITIVO" | candidate-filtering-failure | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 877 |
| approved-wine-039 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "DOMAINE JULIEN AUROUX" | correct-uncertainty | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 841 |
| chateau-bonneau | brand-punctuation; multi-line-brand; low-contrast; front-label | AMBIGUOUS → "BONNEAU" | line-reconstruction-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 4 | 2923 |
| approved-wine-041 | back-label; alcohol-at-bottom | AMBIGUOUS → "Petite Nature" | correct-uncertainty | OBSERVED → "13.0% ALC./VOL." | correct | 1 | 894 |
| approved-wine-042 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "PRODUCT OF FRANCE" | candidate-filtering-failure | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 900 |
| approved-wine-043 | simple-centered-brand; front-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "FULCRUM" | correct-uncertainty | OBSERVED → "13.8% BY VOL." | parser-failure | 1 | 764 |
| approved-wine-044 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "VEEL" | ocr-recognition-failure | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 1671 |
| approved-wine-045 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Meeting of ihe Minds" | candidate-filtering-failure | OBSERVED → "13.7% ALC./VOL." | correct | 1 | 1063 |
| approved-wine-046 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "Red Wine Blend Curious" | candidate-filtering-failure | NOT_OBSERVED → ∅ | correct | 4 | 3995 |
| approved-wine-047 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "DENOMINACIO D'ORIGEN" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 4 | 5758 |
| approved-wine-048 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Pacha RESERVA - CARMENERE" | candidate-filtering-failure | OBSERVED → "14.0% BY VOL." | correct | 1 | 1401 |
| approved-wine-049 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "CAYWOQOD VINEYARD" | ocr-recognition-failure | OBSERVED → "13.2% ALC./VOL." | correct | 1 | 3296 |
| le-temps-des-fleurs | simple-centered-brand; alcohol-at-bottom; front-label | AMBIGUOUS → "LE TEMPS DES FLEURS" | correct-uncertainty | OBSERVED → "11.5% ALC./VOL." | correct | 1 | 865 |
| approved-wine-051 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "PACHECA DOURO D.O.C" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 4 | 3772 |
| approved-wine-052 | back-label; dense-text; missing-alcohol-statement | AMBIGUOUS → "OLp VINE ZINFANDEL" | candidate-filtering-failure | NOT_OBSERVED → ∅ | correct | 3 | 5508 |
| approved-wine-053 | multiple-brand-like-phrases; front-label; alcohol-at-side-or-rotated | AMBIGUOUS → "Vineya" | ocr-recognition-failure | OBSERVED → "11.5% ALC./VOL." | correct | 4 | 3441 |
| approved-wine-054 | multi-line-brand; back-label; alcohol-at-side-or-rotated | AMBIGUOUS → "IA5 ME15" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 4 | 2745 |
| approved-wine-055 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "FRANCOIS VILLARD" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 1874 |
| approved-wine-056 | multi-line-brand; back-label; alcohol-at-bottom; low-contrast | AMBIGUOUS → "CAMP dPIETRU" | candidate-ranking-failure | OBSERVED → "13.5% BY VOL." | correct | 1 | 755 |
| approved-wine-057 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JI Lill" | candidate-ranking-failure | OBSERVED → "13% BY VOL." | correct | 1 | 752 |
| approved-wine-058 | back-label; dense-text; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 2721 |
| approved-wine-059 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JI mmm Ill" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 1742 |
| three-steves-winery | missing-alcohol-statement; multiple-brand-like-phrases; front-label | OBSERVED → "3 STEVES WINERY" | correct | NOT_OBSERVED → ∅ | correct | 3 | 3439 |
| approved-wine-061 | back-label; low-resolution; missing-alcohol-statement | AMBIGUOUS → "APHRODITE" | correct-uncertainty | NOT_OBSERVED → ∅ | correct | 3 | 2640 |
| approved-wine-062 | back-label; low-resolution; missing-alcohol-statement | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | correct | 3 | 6963 |
| approved-wine-063 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "TRE FICHI" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 1670 |
| approved-wine-064 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Prins" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 1643 |
| approved-wine-065 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Prins" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 1552 |
| approved-wine-066 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JULIETTE VRIL" | candidate-filtering-failure | OBSERVED → "13% ALC./VOL." | correct | 1 | 913 |
| approved-wine-067 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "JULIETTE VRIL" | candidate-filtering-failure | OBSERVED → "13% BY VOL." | correct | 1 | 885 |
| approved-wine-068 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "SARA" | correct-uncertainty | OBSERVED → "13% ALC./VOL." | correct | 1 | 929 |
| approved-wine-069 | multi-line-brand; back-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "ALTACIMA 4.090" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 3794 |
| altacima | brand-punctuation; low-contrast; alcohol-at-bottom; front-label | AMBIGUOUS → "ALTACIMA 4.090" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 3654 |
| approved-wine-071 | multi-line-brand; back-label; low-contrast; alcohol-at-bottom | AMBIGUOUS → "LATE HARVEST 2013" | candidate-ranking-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 3 | 5267 |
| approved-wine-072 | back-label; dense-text; missing-alcohol-statement; genuinely-ambiguous | AMBIGUOUS → "HINNANT FAMILY VINEYARDS" | correct-uncertainty | NOT_OBSERVED → ∅ | correct | 3 | 4749 |
| approved-wine-073 | multi-line-brand; back-label; missing-alcohol-statement | OBSERVED → "Mike's Farm, Inc." | correct | NOT_OBSERVED → ∅ | correct | 4 | 2611 |
| approved-wine-074 | multi-line-brand; back-label; missing-alcohol-statement | AMBIGUOUS → "HINNANT VINEYARDS" | ocr-recognition-failure | NOT_OBSERVED → ∅ | correct | 4 | 2809 |
| approved-wine-075 | back-label; dense-text; missing-alcohol-statement | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | correct | 4 | 3987 |
| approved-wine-076 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Flore" | candidate-filtering-failure | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 1025 |
| approved-wine-077 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "VALDINERA" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 1777 |
| approved-wine-078 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "MUSCOLINE-ITALIA" | candidate-filtering-failure | OBSERVED → "14% BY VOL." | correct | 1 | 687 |
| approved-wine-079 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "OFFIDA" | candidate-ranking-failure | LOW_CONFIDENCE → "13.5% BY VOL." | correct | 1 | 696 |
| le-caniette | multi-line-brand; split-alcohol-tokens; alcohol-at-bottom; front-label | AMBIGUOUS → "INDICAZIONE GEOGRAFICA PROTETTA" | candidate-ranking-failure | OBSERVED → "12.5% BY VOL." | correct | 1 | 675 |
| approved-wine-081 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "CORTEADAGIO" | correct-uncertainty | OBSERVED → "12% BY VOL." | correct | 1 | 760 |
| approved-wine-082 | back-label; dense-text; alcohol-at-bottom; low-contrast | NOT_OBSERVED → ∅ | correct | OBSERVED → "14.0% BY VOL." | correct | 1 | 1194 |
| approved-wine-083 | decorative-or-script-brand; front-label; alcohol-at-bottom | AMBIGUOUS → "Bam il" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 4 | 2007 |
| approved-wine-084 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "BUTA DISTRIBUTORS INC" | candidate-filtering-failure | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 984 |
| approved-wine-085 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Denominazione Origine Controllata" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 1196 |
| approved-wine-086 | back-label; dense-text; missing-alcohol-statement | OBSERVED → "3 STEVES WINERY" | correct | NOT_OBSERVED → ∅ | correct | 3 | 3115 |
| approved-wine-087 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "LANGHE SAUVIGNON Tuga" | candidate-ranking-failure | OBSERVED → "13.5% ALC./VOL." | correct | 1 | 2108 |
| approved-wine-088 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "LA MESMA Yellow Label" | candidate-filtering-failure | OBSERVED → "12.5% BY VOL." | correct | 1 | 893 |
| approved-wine-089 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "LA MESMA Black Label" | candidate-filtering-failure | OBSERVED → "13% BY VOL." | correct | 1 | 742 |
| approved-wine-090 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "WHITE WINE 2018 Lo219" | candidate-filtering-failure | OBSERVED → "12.5% BY VOL." | correct | 1 | 815 |
| approved-wine-091 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "D CONTROLLATA E" | ocr-recognition-failure | OBSERVED → "13.5% BY VOL." | correct | 1 | 647 |
| approved-wine-092 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Hn SANTA BARBARA" | ocr-recognition-failure | OBSERVED → "13.6% ALC./VOL." | correct | 1 | 936 |
| approved-wine-093 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "DELRAY BEACH, FL, USA" | candidate-filtering-failure | OBSERVED → "13.50% ALC./VOL." | correct | 1 | 919 |
| approved-wine-094 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "DELRAY BEACH. FL, USA" | candidate-filtering-failure | OBSERVED → "13.50% ALC./VOL." | correct | 1 | 870 |
| approved-wine-095 | back-label; dense-text; alcohol-at-bottom; low-resolution | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-filtering-failure | 4 | 1550 |
| approved-wine-096 | back-label; dense-text; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 2812 |
| approved-wine-097 | back-label; dense-text; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 2578 |
| approved-wine-098 | back-label; low-resolution; alcohol-at-bottom | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 794 |
| approved-wine-099 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "DELRAY BEACH, FL, USA" | candidate-filtering-failure | OBSERVED → "13.50% ALC./VOL." | correct | 1 | 898 |
| amuninni-ferracane | decorative-or-script-brand; multiple-brand-like-phrases; genuinely-ambiguous; alcohol-at-bottom; front-label | AMBIGUOUS → "INV ENVY" | correct-uncertainty | OBSERVED → "12.5% BY VOL." | correct | 1 | 688 |
| approved-wine-101 | back-label; dense-text; missing-alcohol-statement | NOT_OBSERVED → ∅ | correct | NOT_OBSERVED → ∅ | correct | 3 | 2349 |
| approved-wine-102 | back-label; dense-text; alcohol-at-bottom | AMBIGUOUS → "Mevushal Kosher for Passover" | ocr-recognition-failure | OBSERVED → "13.4% ALC./VOL." | correct | 1 | 837 |
| approved-wine-103 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "SNA VALSO" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 4 | 2120 |
| approved-wine-104 | multiple-brand-like-phrases; front-label; alcohol-at-bottom | AMBIGUOUS → "BLAZIC" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 2312 |
| approved-wine-105 | decorative-or-script-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "VANNI" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 4 | 2514 |
| approved-wine-106 | simple-centered-brand; front-label; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "REDO" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 1917 |
| approved-wine-107 | decorative-or-script-brand; wraparound; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "FATTORIA" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 2856 |
| approved-wine-108 | decorative-or-script-brand; wraparound; vertical-mandatory-strip; alcohol-at-side-or-rotated; front-label | AMBIGUOUS → "8 Ao VINO BIANCO" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 3 | 2590 |
| approved-wine-109 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "SANGOUARD-CHENE" | correct-uncertainty | OBSERVED → "12.5% BY VOL." | correct | 1 | 792 |
| approved-wine-110 | multi-line-brand; back-label; alcohol-at-bottom | AMBIGUOUS → "Cool&y" | candidate-filtering-failure | OBSERVED → "12.8% BY VOL." | correct | 1 | 1178 |
| m-cellars-baseline | multiple-brand-like-phrases; alcohol-at-bottom; genuinely-ambiguous; front-label | AMBIGUOUS → "CELLARS" | correct-uncertainty | OBSERVED → "12.5% ALC./VOL." | correct | 4 | 4518 |
| wine-multi-artifact-04 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "Donovan Visayas" | ocr-recognition-failure | NOT_OBSERVED → ∅ | candidate-filtering-failure | 4 | 3050 |
| wine-multi-artifact-05 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "BLAZIC COLLIO" | candidate-filtering-failure | OBSERVED → "ALCOHOL 13.5 BY VOLUME" | correct | 1 | 1329 |
| wine-multi-artifact-06 | multi-panel; alcohol-at-side-or-rotated | AMBIGUOUS → "MOLINO" | candidate-filtering-failure | OBSERVED → "13.5% BY VOL." | parser-failure | 3 | 2043 |
| wine-multi-artifact-07 | multi-panel; missing-alcohol-statement | AMBIGUOUS → "North Carolina Nuscadine Nig" | ocr-recognition-failure | OBSERVED → "12% ALC./VOL." | false-certainty | 1 | 1067 |
| wine-multi-artifact-08 | multi-panel; alcohol-at-bottom | AMBIGUOUS → "Z-lor" | candidate-filtering-failure | OBSERVED → "12.6% BY VOL." | correct | 1 | 805 |
| wine-multi-artifact-09 | multi-panel; alcohol-at-bottom | OBSERVED → "DUCK WALK VINEYARDS" | correct | OBSERVED → "12.5% BY VOL." | correct | 1 | 829 |
| wine-multi-artifact-10 | multi-panel; alcohol-at-side-or-rotated | AMBIGUOUS → "MAURO MOLINO" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-filtering-failure | 4 | 2373 |
