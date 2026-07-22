# Approved decisions (2026-07-21)

Operator: Joseph Walker. **This round records decisions; it implements none of
them.** No fixture, production, issue #6, schema, authority logic, or test is
modified.

## Final record — required statements

- **All 13 current fixture truths remain unchanged in this round.**
- **`approved-wine-049` and `approved-wine-083` are referrals, not confirmed
  errors.**
- **The two-axis model is recommended for a later schema-design round**, not
  applied here.
- **The issue #6 rewrite is recommended but not applied.**
- **No extraction or authority implementation is authorized by this round.**

## Six case dispositions (exact)

| Case | Disposition |
|---|---|
| `approved-wine-083` | **Unresolved; retain temporarily; blind second review.** Barn Sill Wine Co. vs Christmas Hayride is not resolvable from artwork. |
| `approved-wine-049` | **Current truth (`Caywood Vineyard`) provisionally defensible; blind second review.** May be a single-vineyard designation rather than the marketed brand. |
| `patricia-green-cellars` | **Retain.** Role recorded as `RESPONSIBLE_PERSON_NAME` + `FALLBACK_DEEMED_BRAND` (§4.33(a)). |
| `approved-wine-074` | **Retain `Mike's Farm, Inc.` as an explicit marketed brand.** `Hinnant Vineyards` is the separate bottler (name-and-address) statement. |
| `wine-multi-artifact-07` | **Retain `Mike's Farm`.** `Scuppernong White` is varietal/type or product-identifying text, not the brand. |
| `m-cellars-baseline` | **Retain `M Cellars` as an explicit marketed brand.** |

None of these dispositions changes a fixture in this round. `049` and `083` are
**referrals** to a later, independently-reviewed truth PR with a blind second
reader; they are not asserted to be errors.

## Recommendation decisions

| ID | Decision | Note |
|---|---|---|
| **R1** — retain all 13 truths for now | **YES, provisionally** | provisional pending the R2 blind reviews of `049`/`083` |
| **R2** — refer `049` and `083` to a later blind-second-reader truth PR | **YES** | referrals, not confirmed errors |
| **R3** — adopt the two-axis model as the corpus brand vocabulary | **YES** | for a later schema-design round; not applied now |
| **R4** — rewrite the issue #6 brand bullet (no-override / not-automatic / regulated-fallback / uncertainty-visible) | **YES** | recommended; **issue #6 is not edited in this round** |
| **R5** — base future authority evidence on explicit-brand evidence, without weakening `OBSERVED` | **YES, WITH AMENDMENT** | see below |

### R5 amendment (verbatim)

> **Future authority evidence must distinguish explicit marketed brand from
> fallback deemed brand. A company/designator token alone establishes neither.**

This strengthens the audit in `authority-impact.md`: the current positive signal
(possessive or `winery`/`vineyard`/`cellars`/`estate` token) cannot separate an
explicit marketed brand from a §4.33(a) fallback, and a designator token by
itself is not evidence of either. Any future authority work must carry both
distinctions. **No authority logic is changed in this round.**
