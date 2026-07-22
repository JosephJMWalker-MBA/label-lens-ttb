# Research question

For domestic wine artwork, how should Label Lens distinguish:

1. an explicit marketed brand;
2. a responsible-person / company name;
3. a responsible-person name that becomes the §4.33(a) fallback deemed brand
   because no separate brand appears;
4. a fanciful or product name;
5. class/type, varietal, appellation, series, or descriptive text;
6. cases whose role cannot be resolved from artwork alone.

**Framing constraint honored throughout:** this round does **not** assume company
names are always brands, or never brands. The corpus itself already shows both —
`three-steves-winery` (winery name = brand) and `approved-wine-082` (the same
"3 Steves Winery" name = *not* this product's brand) — so any absolute rule is
falsified by the data before analysis begins.

This is a policy-and-audit round. It recommends; it does not implement. It does
not change production code, fixtures, schemas, tests, OCR, ranking, authority
states, UI, packages, or issue #6.
