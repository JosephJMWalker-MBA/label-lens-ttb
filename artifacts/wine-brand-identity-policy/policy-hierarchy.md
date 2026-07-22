# Proposed policy hierarchy — evaluated, not assumed

Each rule is tagged with its basis: **[REG]** regulation, **[REG-INFERRED]** a
reasonable reading of regulation, **[GUIDANCE]** TTB interpretive framing,
**[PRODUCT]** a Label Lens product choice not compelled by regulation.

## A. An explicit marketed brand, if present, is the brand candidate — **SUPPORTED**

If the artwork shows a distinct name marketed *as* the brand — typically the
prominent brand-label identity, often a fanciful name or a stylized house mark —
that is the brand candidate. **[REG]** §4.32 requires a brand name on the brand
label; §4.33(a) presumes the wine "shall bear a brand name."

*Evidence from the corpus:* `wine-multi-artifact-09` (`DUCK WALK VINEYARDS` as the
large front header), `m-cellars-baseline` (the stylized `M CELLARS®` house mark) —
the brand is displayed as the label's identity, not buried in a bottler line.

## B. A responsible-person / company statement does not displace an explicit brand merely because it contains "winery," "vineyards," "cellars," a possessive, "Inc.," or "Co." — **SUPPORTED**

**[REG]** §4.35 defines *bottled/produced/imported by* + name as the
responsible-person statement, a **distinct** required element from the brand name
(§4.32). A designator token or corporate suffix marks the *entity type*, not the
*brand role*. **A name is not the brand because it says "Winery," and not
disqualified from being the brand because it says "Winery."**

*Evidence:* `approved-wine-049` — brand truth is `Caywood Vineyard` (a vineyard
designation on the front) while `Damiani Wine Cellars` (the "PRODUCED & BOTTLED
BY" statement) is **forbidden**. The corpus already applies rule B: a "Wine
Cellars" responsible-person name was held *not* to be the brand there.

## C. If no separate marketed brand appears, the responsible-person name may be the fallback deemed brand — **SUPPORTED, and currently under-represented**

**[REG]** §4.33(a): "if not sold under a brand name, then the name of the person
required to appear on the brand label shall be deemed a brand name." **[REG]**
§24.257: "the brand name, if different from" the bottling-premises name — i.e.
they may be the same.

This is a **fallback**, conditioned on *no separate brand being used*. It is not a
license to treat every company name as the brand.

*Evidence:* `patricia-green-cellars` — the only occurrences of the brand
`Patricia Green Cellars` on the shown artwork are the URL and the "PRODUCED &
BOTTLED BY" line; the prominent text is `PATTY'S BLOCK` (a block designation).
This is the fallback situation, and the corpus marks it `genuinelyAmbiguous`.

## D. A fanciful/product name, varietal, class/type, appellation, series, or descriptive phrase is not automatically the brand — **SUPPORTED**

**[REG]** §4.34 makes varietal, class/type, and appellation *designations*. A
fanciful/product name (a cuvée or bottling name) is a naming element that **may**
be the marketed brand or **may** be a product name distinct from the brand —
artwork often cannot tell which. **[REG-INFERRED]**

*Evidence:* `wine-multi-artifact-04` — `Dry Cellar` is the brand; `Sauvignon
Blanc` is forbidden (varietal). `approved-wine-083` — `Christmas Hayride` is a
prominent fanciful name but is **forbidden** by the corpus, with `Barn Sill Wine
Co.` held as the brand. Whether that is correct is Special Case 2.

## E. Artwork alone may be insufficient — preserve uncertainty — **SUPPORTED and central**

**[REG-INFERRED]** §4.33(a)'s trigger ("if not sold under a brand name") turns on
how the product is *marketed* and which name is *permit-authorized* — facts not
always visible on the label. When the artwork cannot establish (i) which name is
the marketed brand, (ii) whether a name is a fanciful product name vs the brand,
or (iii) whether a displayed name is the §4.35 responsible person, **the role
should be recorded as unresolved rather than guessed.** **[PRODUCT]** preserving
uncertainty over inventing a role is a Label Lens design value, consistent with
the existing `AMBIGUOUS` authority state.

## Ordering, when elements compete

1. If a distinct marketed brand is present (A), it is the brand candidate; a
   responsible-person statement does not displace it (B).
2. If **no** separate marketed brand is present, the responsible-person name is a
   **fallback deemed-brand** candidate (C) — recorded as fallback, not as an
   explicit marketed brand.
3. Designations (D) are never the brand.
4. Where (1)–(3) cannot be resolved from artwork, record unresolved (E).

**This hierarchy is a proposal for review. It is not implemented, and nothing
here changes production behavior or fixture truth.**
