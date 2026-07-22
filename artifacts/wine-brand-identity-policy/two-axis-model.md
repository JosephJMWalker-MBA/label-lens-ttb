# Two-axis evidence model

Every visible naming element is classified on **two independent axes**. The point
of separating them is that "what kind of text this is" and "whether it is the
brand" are different questions, and §4.33(a) makes an element that is one thing on
Axis 1 (a responsible-person name) a different thing on Axis 2 (the deemed brand)
*at the same time*.

## Axis 1 — visible text role (what the text is)

| Role | Meaning | Basis |
|---|---|---|
| `MARKETED_BRAND_MARK` | displayed as the product's brand identity | §4.32/4.33 |
| `RESPONSIBLE_PERSON_NAME` | the bottler/producer/importer named in a §4.35 statement | §4.35, §24.257 |
| `FANCIFUL_OR_PRODUCT_NAME` | a cuvée/bottling/product name; may or may not be the brand | §4.33 (inferred) |
| `CLASS_OR_TYPE` | "Red Wine", "White Wine", etc. | §4.34 |
| `VARIETAL` | grape type (Chardonnay, Zinfandel, Traminette) | §4.34 |
| `APPELLATION` | origin (Long Island, Finger Lakes, Willamette Valley) | §4.34 |
| `SERIES_OR_VERSION` | line/series/label variant ("Yellow Label", "Reserve") | product |
| `DESCRIPTIVE_TEXT` | marketing prose, tasting notes, awards | product |
| `UNRESOLVED_ROLE` | role cannot be determined from artwork | §4.33(a) trigger not observable |

## Axis 2 — brand status (whether it is the brand)

| Status | Meaning | Basis |
|---|---|---|
| `EXPLICIT_MARKETED_BRAND` | marketed as the brand; present as brand identity | §4.32/4.33 |
| `FALLBACK_DEEMED_BRAND` | the §4.33(a) deemed brand: responsible-person name, used **because no separate brand appears** | §4.33(a) |
| `NOT_BRAND` | a designation or a responsible-person name that is **not** the brand (an explicit brand exists elsewhere) | §4.34, §4.35 + B |
| `UNRESOLVED_FROM_ARTWORK` | brand status cannot be established from artwork | §4.33(a) trigger not observable |

## The permitted dual classification

**One element may be BOTH `RESPONSIBLE_PERSON_NAME` (Axis 1) AND
`FALLBACK_DEEMED_BRAND` (Axis 2).** These meanings must not be collapsed. This is
the direct encoding of §4.33(a): the name required on the brand label (a
responsible person) *is deemed* the brand when the wine is not sold under a
separate brand name.

Examples of the intended pairings:

| Situation | Axis 1 | Axis 2 |
|---|---|---|
| Prominent fanciful house mark | `MARKETED_BRAND_MARK` | `EXPLICIT_MARKETED_BRAND` |
| "Bottled by Acme Winery" *and* a separate front brand | `RESPONSIBLE_PERSON_NAME` | `NOT_BRAND` |
| "Bottled by Acme Winery", **no** separate brand | `RESPONSIBLE_PERSON_NAME` | `FALLBACK_DEEMED_BRAND` |
| "Chardonnay" | `VARIETAL` | `NOT_BRAND` |
| "Napa Valley" | `APPELLATION` | `NOT_BRAND` |
| Prominent phrase, role unclear from artwork | `UNRESOLVED_ROLE` | `UNRESOLVED_FROM_ARTWORK` |

## Why the current pipeline cannot express this

Production emits a single `brandName` observation with one `brandClass`
(`positive`/`plausible`/`excluded`) and one authority state. It has:

- **no way to record that a name is the brand *by fallback* rather than as an
  explicit mark** — the two collapse into the same `OBSERVED`/value;
- **no representation of "responsible person who is also the deemed brand"**;
- **no `UNRESOLVED_FROM_ARTWORK` distinct from `AMBIGUOUS`-competing-candidates.**

That gap is the subject of `authority-impact.md` and `recommendation.md`. **No
schema change is made in this round.**
