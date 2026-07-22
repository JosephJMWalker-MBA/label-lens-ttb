# Recommendation (approved; nothing implemented)

> **Approved by the operator on 2026-07-21.** Decisions and the six case
> dispositions are recorded verbatim in `decisions.md`. R1–R4 **YES**; R5 **YES
> with amendment**. This round still implements nothing.

This round **recommends**; per the decision boundary it implements nothing, edits
no fixture, and edits no issue.

## What the evidence establishes

1. **Neither absolute holds.** "A company name is always the brand" and "never the
   brand" are both falsified by the corpus (`three-steves-winery` vs
   `approved-wine-082`). §4.33(a) makes a responsible-person name the brand *only*
   as a fallback when no separate brand is used.
2. **Most current truths are defensible** (11/13), including the two special cases
   the region round had doubted — `approved-wine-074` and `wine-multi-artifact-07`
   both have the company name as the *explicit* brand.
3. **Two truths are genuinely questionable** — `approved-wine-049` (brand vs
   vineyard designation) and `approved-wine-083` (competing marks).
4. **The authority gate approximates a company-designator detector** and cannot
   distinguish an explicit brand from a §4.33(a) fallback, nor recognise a clean
   non-company brand (every fanciful-brand control is denied `OBSERVED`).
5. **Issue #6's "producer/bottler text is not brand evidence" collides with the
   §4.33(a) fallback** only if read as an absolute; read as "no override" it is
   compatible.

## Recommended actions, in order

### R1 — Retain all 13 fixture truths for now
No truth is clearly wrong. `approved-wine-074` and `wine-multi-artifact-07` are
**correct as-is** (reversing the region-round doubt). Do not mark any as absent,
and do not redirect `074` to Hinnant.

### R2 — Refer exactly two cases to a later truth-correction round
`approved-wine-049` and `approved-wine-083`, with a blind second reader, in a
separate truth PR (the alcohol-correction pattern). Preserve the prior
forbidden-presentation decisions and record any disagreement explicitly.

### R3 — Adopt the two-axis model as the corpus's brand vocabulary (future schema)
Introduce, in a later schema round, a representation that distinguishes
`EXPLICIT_MARKETED_BRAND`, `FALLBACK_DEEMED_BRAND`, `RESPONSIBLE_PERSON_NAME`, and
`UNRESOLVED_FROM_ARTWORK`, and that permits one element to be both a responsible
person and a fallback brand. This is what `patricia-green-cellars` needs and what
the current single-value `brandName` cannot express.

### R4 — Rewrite the issue #6 brand bullet (later, separate decision)
Replace *"treating producer or bottler text as brand evidence"* with the four-part
no-override / not-automatic / regulated-fallback / uncertainty-visible rule in
`issue-6-conflict.md`. **Do not edit issue #6 in this round.**

### R5 — Clarify authority semantics without weakening OBSERVED **(YES, with amendment)**
Longer term, base the positive brand signal on *explicit-brand evidence*
(prominent identity, trademark mark, brand-label position) rather than a
company-designator token, and represent fallback brands at a distinct, lower
authority than explicit ones.

**Operator amendment (verbatim):** *Future authority evidence must distinguish
explicit marketed brand from fallback deemed brand. A company/designator token
alone establishes neither.* **Not implemented here; the gate is unchanged.**

## Explicitly not recommended

- Silently converting any company name into an explicit marketed brand.
- Marking any case brand-absent because the visible name is a company.
- Treating `Inc.`, `Co.`, `Winery`, `Vineyards`, or `Cellars` as dispositive.
- Any production, schema, fixture, or issue change inside this round.

## Decision needed from Joseph before anything proceeds

1. R1 retain — agree?
2. R2 — refer `049` and `083` to a truth round?
3. The six reader-packet judgments (`reader-review-packet.md`).
4. Whether R3/R4/R5 become their own future rounds.
