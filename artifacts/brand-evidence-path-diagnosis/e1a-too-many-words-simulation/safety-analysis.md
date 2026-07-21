# E1a safety analysis

Every check the brief required was run against the treatment output. Machine
data: `filter-results.json`, `changed-cases.json`, `cases.json`.

## What happened to the 9 602 generated sub-spans

| Outcome | Count |
|---|---|
| `sentence-fragment` (rejected) | 5 689 |
| **`KEPT` — `candidate-plausible`** | **2 017** |
| `low-information-fragment` (rejected) | 1 060 |
| `no-letters-or-too-short` (rejected) | 303 |
| `varietal-or-designation` (rejected) | 235 |
| `generic-product-language` (rejected) | 183 |
| **`KEPT` — `candidate-positive`** | **77** |
| `location-or-appellation` (rejected) | 61 |
| `domain-like` (rejected) | 38 |
| **Total kept** | **2 094 (21.8 %)** |
| Total rejected | 7 508 (78.2 %) |
| **Candidate diagnostics produced** | **9 663** — 61 more than the 9 602 spans |

The 61-diagnostic excess is not a counting error. Production applies
`shouldTrimWholeLineCandidate` to every line it analyses, so a *generated* span
that is itself classified `positive` and noisy spawns further sub-spans of its
own. That is unmodified production behaviour and it is an additional source of
candidate growth that a real implementation would also have.

The existing filters do most of their job — they reject 78 % of the generated
material. **The 22 % that survives is still ~18 extra plausible candidates per
case, and it is enough to bury every correct answer.**

## Check-by-check results

### 1. A rejected long sentence yielding a plausible but incorrect short brand — **CONFIRMED, at scale**

2 017 sub-spans of rejected long lines were kept as `candidate-plausible`, and
they win: `Those Who Love`, `Ruby red`, `Textur opulent, the`, `This Gewurztraminer
has`, `Actual Dimensions 2.36 inches`. This is the dominant failure mode.

### 2. Regulatory language yielding a candidate — **partially contained**

`non-brand-keyword` is applied per span, so regulatory wording is still caught
when a keyword lands inside the window. But windows that *straddle* a keyword
escape it: `BECAUSE OF THE RIS` and `OPENED THEIR WINERY AND` are fragments of
back-label prose that no longer contain a trigger word.

### 3. Varietal or appellation text becoming selected — **CONFIRMED**

`ORIGINE CONTROLLATA` displaces `VALDINERA`; `Collio` displaces `BLAZIC`;
`Russian River Valley` displaces `FIELD`. The per-span filters reject 235 varietal
and 61 appellation spans, but a sub-span that is *part* of an appellation phrase
is not itself in the phrase vocabulary and survives.

### 4. Producer/bottler language bypassing its existing exclusion — **CONFIRMED**

`BOUTEILLE PAR FAMILLE ARBEAU` displaces `LE TEMPS DES FLEURS`, and
`WEINCBAVER WEIN-BAUER, Inc. Franklin` displaces `KYRIOS`. The `producer-line`
rule requires a producer word **and** a standalone `by` on the same span; a
4-word window of a bottling statement frequently contains neither, so the
exclusion is bypassed **without the trigger being widened** — the sub-spans came
from `too-many-words` lines, exactly as specified. This is an emergent bypass,
not a specification breach.

### 5. Absent-brand cases emitting a value — **CONFIRMED: 8 of 10**

`NOT_OBSERVED` falls from 10 to 2. Eight labels with no brand now produce one.

### 6. A wrong candidate becoming `OBSERVED` — **CONFIRMED: 2**

`approved-wine-075` → `Baltana Vella vineyard` and `approved-wine-082` →
`OPENED THEIR WINERY AND`, both on **brand-absent** labels, both asserted as
authoritative.

**The mechanism deserves emphasis, and so does the attribution.** *The treatment
caused these false positives, not the authority gate.* Both values cleared the
gate because they contain `vineyard` / `WINERY` — members of `BRAND_DESIGNATOR` —
and they only existed as candidates because the treatment manufactured them. The designator
vocabulary is what makes the gate safe *when candidates are whole label lines*;
once arbitrary 4-word windows of prose are admitted, any window containing
"winery", "vineyard", "estate" or "cellars" becomes `positive` and can be asserted
as fact. **The gate was not weakened by this treatment — it was fed material it
was never designed to arbitrate.** That is the most important safety finding here,
and it applies to any future variant that widens candidate generation.

### 7. Candidate explosion from long OCR lines — **CONFIRMED**

Median candidates per case 22 → 58; p95 38 → **356**; max 72 → **448**; corpus
total 2 715 → 12 378. Growth is bounded in principle (O(words × 4) per triggered
line) but is not bounded in any way that keeps p95 stable, because back-label
lines are long and numerous.

## Flag-but-do-not-kill conditions

- **Latency:** not measured; candidate volume rose 4.6× overall and 9.4× at p95.
  Scoring is cheap relative to OCR, so the wall-clock effect is likely modest —
  but this is unmeasured and must not be reported as safe.
- **Top-3 improves but selected accuracy does not:** does not apply — top-3 also
  *fell*, 33 → 21.
- **Gains depending on the five unresolved boundary cases:** does not apply —
  there are no gains, and all five cases are unchanged in both arms.
