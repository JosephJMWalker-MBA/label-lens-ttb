# E1a — baseline versus simulated treatment

115 cases (105 brand-present, 10 brand-absent). Machine form: `metrics.json`,
`baseline.json`, `treatment.json`.

## Headline comparison

| Metric | Baseline | Treatment | Δ |
|---|---|---|---|
| Exact selected match | 27 | **15** | **−12** |
| Normalized selected match | **29** | **17** | **−12** |
| Top-3 recall | 33 | **21** | **−12** |
| Truth reaching any kept candidate | 37 | **54** | **+17** |
| Truth ranked first | 29 | 17 | −12 |
| Truth ranked first but non-`OBSERVED` | 25 | 13 | −12 |
| State `OBSERVED` | 4 | 6 | +2 |
| State `AMBIGUOUS` | 101 | 107 | +6 |
| State `NOT_OBSERVED` | 10 | **2** | **−8** |
| Wrong selected candidates | 76 | **88** | **+12** |
| Wrong `OBSERVED` candidates (brand-present) | 0 | 0 | 0 |
| **Brand-absent cases emitting a value** | **0** | **8** | **+8** |
| Currently-correct cases changed | — | **12** | — |
| `knownAmbiguous` cases changed | — | 1 | — |

**Read the +17 and the −12 together.** The treatment does exactly what it was
designed to do at the generation stage and is still a net loss everywhere the
result is visible.

## The 23 targeted `too-many-words` cases

| Stage | Count |
|---|---|
| Reached (a trigger line fired) | **20 / 23** |
| Truth survives as a kept candidate | **17** (baseline **0**) |
| Truth enters top 3 | **0** |
| Truth becomes the selected value | **0** |
| Becomes `OBSERVED` and correct | **0** |

Three of the 23 were not reached: their `too-many-words` line did not reproduce
as a contiguous word run in the pass this simulation replayed.

**This is the finding.** Generation was genuinely the blocker — the truth now
survives in 17 cases where it previously did not. It then loses the ranking to
the noise admitted alongside it, every single time.

## Changed cases: 43 total — 0 gains, 23 neutral, 20 regressions

Full list in `changed-cases.json`. Not one case improved.

### The 12 currently-correct cases broken

| Case | Truth | Baseline | Treatment |
|---|---|---|---|
| `approved-wine-014` | Tre Cori | `TRE CORI` | `Those Who Love` |
| `approved-wine-019` | Kyrios | `KYRIOS` | `WEINCBAVER WEIN-BAUER, Inc. Franklin` |
| `nebla-mencia` | Nebla | `NEBLA` | `Ruby red` |
| `approved-wine-028` | Field | `FIELD` | `Russian River Valley` |
| `approved-wine-034` | Nico | `NICO` | `ME 156 1A5` |
| `le-temps-des-fleurs` | Le Temps des Fleurs | `LE TEMPS DES FLEURS` | `BOUTEILLE PAR FAMILLE ARBEAU` |
| `approved-wine-061` | Aphrodite | `APHRODITE` | `Textur opulent, the` |
| `approved-wine-069` | AltaCima | `ALTACIMA 4.090` | `1.5, Sagrada Familia, Region` |
| `altacima` | AltaCima | `ALTACIMA 4.090` | `This Gewurztraminer has` |
| `approved-wine-077` | Valdinera | `VALDINERA` | `ORIGINE CONTROLLATA` |
| `approved-wine-104` | Blazic | `BLAZIC` | `Collio` |
| `wine-multi-artifact-10` | Mauro Molino | `MAURO MOLINO` | `Actual Dimensions 2.36 inches` |

Every replacement is back-label prose, an appellation, or packaging metadata that
outscored a correct front-label brand mark.

### The 8 brand-absent cases that began emitting a value

| Case | Treatment value | State |
|---|---|---|
| `approved-wine-075` | `Baltana Vella vineyard` | **`OBSERVED`** |
| `approved-wine-082` | `OPENED THEIR WINERY AND` | **`OBSERVED`** |
| `approved-wine-022` | `MARBLE CREEK ACRES` | AMBIGUOUS |
| `approved-wine-058` | `STILL WHITE WINE` | AMBIGUOUS |
| `approved-wine-062` | `BECAUSE OF THE RIS` | AMBIGUOUS |
| `approved-wine-096` | `OFFICE PALAZZOLO DISONA -` | AMBIGUOUS |
| `approved-wine-097` | `OFFICE PALAZZOLO DISONA -` | AMBIGUOUS |
| `approved-wine-101` | `PEPPEE This very` | AMBIGUOUS |

## Dependence on the five unresolved truth-boundary cases

**None.** All five (`088`, `089`, `051`, `048`, `046`) select the identical value
in both arms and are unchanged by the treatment. No gain — there are none —
depends on their outcome, so the Part 1 review packet cannot rescue this result.

## Candidate volume

| | Baseline | Treatment |
|---|---|---|
| Minimum per case | 8 | 8 |
| **Median** | **22** | **58** |
| **p95** | **38** | **356** |
| **Maximum** | **72** | **448** |
| Corpus total | 2 715 | **12 378** |

377 trigger lines fired across 86 cases, producing **9 602** generated sub-spans —
a 4.6× increase in candidates evaluated corpus-wide, and a **9.4× increase at
p95**.
