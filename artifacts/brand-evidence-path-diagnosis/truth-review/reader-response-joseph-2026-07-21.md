# Brand truth review — completed reader response

**Reader:** Joseph Walker
**Date:** 2026-07-21

These are the reader's own observations, recorded verbatim. **They are reader
observations, not fixture truth.** No fixture file was modified by this review or
by the PR that preserves it. The blank form is retained alongside this file as
`reader-response-template.md`.

Machine-output classification legend: **exact** = equals the brand as presented ·
**superset** = includes the brand plus extra wording · **partial** = a fragment of
the brand · **wrong** = not the brand at all.

---

## approved-wine-088

**Brand I visually read:** LA MESMA

**Machine output classification:** superset

**Nearby text role:**

- Yellow Label: series name
- GAVI: appears separate from the brand and appears regional based on the
  full-label context

**Rationale:** LA MESMA is the brand. Yellow Label appears to identify a series or
version of the product rather than extend the brand name. GAVI appears separately
below and does not appear to be part of the brand.

**Confidence:** high

---

## approved-wine-089

**Brand I visually read:** LA MESMA

**Machine output classification:** superset

**Nearby text role:**

- Black Label: series name

**Rationale:** LA MESMA is the brand. Black Label appears to identify a series or
version rather than extend the brand name. This uses the same brand-boundary
principle applied to approved-wine-088.

**Confidence:** high

---

## approved-wine-051

**Brand I visually read:** PACHECA

**Machine output classification:** superset

**Nearby text role:**

- DOURO / D.O.C.: unclear, but not read as part of the brand

**Rationale:** PACHECA appears to be the brand name. DOURO / D.O.C. appears
nearby, but the label is non-English and I am unsure of its exact role. I do not
visually read it as part of the brand.

**Confidence: medium** — see the qualification recorded below.

---

## approved-wine-048

**Brand I visually read:** Pacha

**Machine output classification:** superset

**Nearby text role:**

- Reserva Carmenere: series or product text

**Rationale:** Pacha appears to be the brand name. Reserva Carmenere appears
beside it but looks like series or product-identifying text rather than part of
the brand.

**Confidence:** high

---

## approved-wine-046

**Brand I visually read:** Curious

**Machine output classification:** superset

**Nearby text role:**

- Red Wine Blend: descriptive copy

**Rationale:** Curious appears to be the brand name. Red Wine Blend describes the
product rather than extending the brand.

**Confidence:** high

---

## Review conclusion

All five readings support the existing shorter fixture brand boundaries rather
than the machine-selected supersets.

**No fixture-truth correction is recommended from this review.**

`approved-wine-051` **must retain an explicit medium-confidence qualification**
because the nearby non-English text (`DOURO / D.O.C.`) was not fully classified by
the reader. The reading that `PACHECA` is the brand stands; what remains
unclassified is the role of the adjacent wording, not the brand boundary itself.

## Consequence for the machine record

The five referrals in `../possible-truth-audit.md` are **resolved as machine
boundary errors, not truth problems.** In all five the machine selected a superset
of the presented brand. The recorded fixture truths stand unchanged.

This also confirms that nothing in the E1a or E1b results depended on an
unresolved truth question: both simulations selected the identical value in
baseline and treatment for all five cases, and both were killed for reasons
unrelated to them.
