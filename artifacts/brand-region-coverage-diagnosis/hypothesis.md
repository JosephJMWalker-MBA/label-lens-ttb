# Hypothesis — did any executed pass effectively examine the brand region?

**Measurement only. Nothing modified: no production code, OCR configuration,
recovery planning, fixture, schema, test, UI, package, ranking, matching,
candidate generation, or authority rule.** Branch
`research/brand-region-coverage-diagnosis`, base `c2412b4` (`git-sha.txt`).

## Question

For the cases classified `TRUE_NON_RECOGNITION` in the preserved E3 record, did
any OCR pass already executed by the production-equivalent pipeline **effectively
examine** the visible brand region?

**Scope as answered: 10 of the 13.** Three cases were excluded during annotation
review on an unresolved policy question and received **no** Phase-2 category —
see `population.md` and `excluded-policy-cases.json`.

Three things are kept separate and must not be conflated:

1. **pass-image coverage** — did a pass's crop geometrically contain the region;
2. **OCR-word geometry over the region** — did any recognised word actually land
   inside it;
3. **recognition or segmentation behaviour inside the region** — if words landed
   there, what happened to them.

**Full-image inclusion alone is not proof that the brand was effectively
examined.** The primary pass covers the whole image by construction, so on its
own it would trivially "cover" every region and answer nothing. That is precisely
why the three layers are measured separately.

## Prior expectation, recorded before any Phase-2 measurement

E3 established that presentation dominates this class: 7 of the 13 primary cases
carry `decorative-or-script-brand`, `La Fattoria` lands in two different
categories across five fixtures on presentation alone, and 8 of the 13 have a
*high-confidence* best diagnostic span that is not the brand.

The expectation is therefore that **`REGION_NOT_COVERED` will be rare** — the
primary full-image pass covers everything — and that the population will
concentrate in `REGION_COVERED_NO_TEXT_RECOGNIZED` and
`ORIENTATION_OR_SEGMENTATION_FAILURE`. **This is an expectation, not a result**,
and the classification has not been run.

## Status

- **Phase 0 complete** — see `code-path.md`. Committed evidence was sufficient for
  pass-image coverage and **insufficient** for word overlap, so a bounded
  read-only re-execution of the passes production already plans was used instead.
- **Phase 1 complete** — 13 regions proposed, **10 approved**, 3 blocked
  (`annotation-review/approval-log.md`).
- **Phase 2 complete for the 10 approved cases**, with 6 controls reported
  separately.

## Outcome against the prior expectation

The expectation was that `REGION_NOT_COVERED` would be rare and the population
would concentrate in `REGION_COVERED_NO_TEXT_RECOGNIZED` and
`ORIENTATION_OR_SEGMENTATION_FAILURE`. **That is what was measured** — 0 / 3 / 5,
plus 2 severe-glyph cases. The prior was recorded before measurement and is
reported here as confirmed rather than quietly dropped.
