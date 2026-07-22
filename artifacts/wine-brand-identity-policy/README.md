# Wine brand-identity policy round

**Policy and corpus-audit round. Analysis only — nothing implemented.** No
production code, fixture, schema, test, OCR, ranking, authority state, UI,
package, or issue was changed. Base recorded in `git-sha.txt`. **Not legal advice
and not a TTB determination.**

## The question

How should Label Lens tell an explicit marketed brand from a responsible-person /
company name, a §4.33(a) fallback deemed brand, a fanciful/product name, a
designation, or an artwork-only-unresolved role — without assuming company names
are always, or never, brands. See `question.md`.

## Final record (operator-approved 2026-07-21)

- **All 13 current fixture truths remain unchanged in this round.**
- **`approved-wine-049` and `approved-wine-083` are referrals, not confirmed errors.**
- **The two-axis model is recommended for a later schema-design round** (not applied).
- **The issue #6 rewrite is recommended but not applied.**
- **No extraction or authority implementation is authorized by this round.**

Decisions and the six case dispositions: `decisions.md`.

## Headline findings

- **Neither absolute holds.** The corpus contains the same winery name as brand
  (`three-steves-winery`) and as not-this-product's-brand (`approved-wine-082`).
- **11 of 13 current fixture truths are defensible**, including the two the region
  round doubted (`approved-wine-074`, `wine-multi-artifact-07` — both explicit
  company brands). **2 are questionable** and referred: `approved-wine-049`,
  `approved-wine-083`.
- **The authority gate approximates a company-designator detector**; it cannot
  distinguish an explicit brand from a §4.33(a) fallback, and denies `OBSERVED` to
  every clean non-company (fanciful) brand.
- **Issue #6's producer/bottler rule conflicts with §4.33(a)** only if read as an
  absolute; a four-part rewrite reconciles them.

## Reading order

0. `decisions.md` (approved decisions + six dispositions) ·
1. `question.md` · 2. `source-memo.md` (regulations + operator-verified TTB guidance) ·
3. `policy-hierarchy.md` · 4. `two-axis-model.md` · 5. `corpus-population.md` ·
6. `case-matrix.md` + `cases.json` · 7. `authority-impact.md` ·
8. `issue-6-conflict.md` · 9. `fixture-impact.md` · 10. `unresolved-evidence.md` ·
11. `reader-review-packet.md` · 12. `limitations.md` · 13. `recommendation.md`.

## Data files

`cases.json` (23 cases, per-element two-axis roles), `assessments.json` (the
curated roles), `controls.json`, `crops/` (rendered labels), `commands.sh`,
`git-sha.txt`, `build-cases.mjs`.

## Status

Paused before fixture recommendations, implementation, commit, or PR — awaiting
Joseph's decisions in `recommendation.md` and the six judgments in
`reader-review-packet.md`.
