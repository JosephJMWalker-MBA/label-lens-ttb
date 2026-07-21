# Partial-recognition analysis

9 of 24 cases (37.5 %). In each, a distinctive part of the brand *was* read — the
pipeline had usable evidence and did not assemble it into the answer.

| Case | Expected | Rule | Qualifying evidence | Coverage | Shape |
|---|---|---|---|---|---|
| `approved-wine-107` | `La Fattoria` | A | token `fattoria` | 90 % | complete distinctive token |
| `approved-wine-047` | `Etiris GX` | B | shared `tirisgx` | 88 % | suffix fragment (truncation) |
| `approved-wine-011` | `MariaAntonietta` | B | shared `mariaantonie` | 80 % | prefix fragment (truncation) |
| `approved-wine-108` | `La Fattoria` | A | token `fattoria` | 80 % | complete distinctive token |
| `approved-wine-092` | `Twin Suns` | A | tokens `twin`, `suns` | 75 % | multiple partial tokens |
| `approved-wine-102` | `Twin Suns` | A | tokens `twin`, `suns` | 75 % | multiple partial tokens |
| `approved-wine-053` | `Golden Road Vineyards` | A | tokens `golden`, `road` | 53 % | multiple partial tokens |
| `approved-wine-044` | `Sweet Seduction` | A | token `sweet` | 50 % | complete distinctive token |
| `approved-wine-059` | `Domenico Negro` | A | token `negro` | 38 % | complete distinctive token |

Rule A qualified 7, rule B qualified 2.

## What the shapes mean

- **Complete distinctive token found (4).** The engine read a whole distinctive
  word of the brand. `approved-wine-107`/`108` read `fattoria` but not `La`;
  `059` read `negro` but not `Domenico`. The missing part is a short leading
  token — the same shape as the `M Cellars` → `CELLARS` and `Haywater Cove` →
  `COVE` losses recorded in the evidence-path diagnosis.
- **Multiple partial tokens (3).** Both halves of the brand were read
  (`twin` + `suns`, `golden` + `road`) but never composed into one candidate.
  `approved-wine-053` is notable: `Golden Road Vineyards` had **two** of three
  tokens read, and `vineyards` — the token that would have made the candidate
  `positive` — is on the generic list and was not counted here.
- **Apparent truncation (2).** `MariaAntonietta` → `mariaantonie` (a 15-character
  brand cut after 12) and `Etiris GX` → `tirisgx` (leading `e` lost). These are
  edge effects: the brand runs to or past the readable region.

## The composition observation

In 3 of the 9 cases the pieces of the brand were **all** present in the OCR output
and were simply never assembled. That is not a matching problem and not an OCR
problem — it is evidence composition. It is also, deliberately, **not** an
argument for reopening the closed sub-span-generation family: that family failed
because generating *more* spans admits far more noise than signal, and nothing
here changes that measurement.

## Generic-token exclusion, applied and audited

The pre-registered generic list (`wine`, `red`, `white`, `estate`, `winery`,
`vineyard`, `vineyards`, `cellars`) excluded evidence in two places:

- `approved-wine-053` — `vineyards` present but not counted; the case qualifies
  anyway on `golden` + `road`.
- `approved-wine-083` — `wine` is the **only** truth token present in OCR, so the
  case falls to `TRUE_NON_RECOGNITION`. This is the one place the exclusion
  changed an outcome, and it is referred for human review rather than settled
  here (`borderline-review.md`).
