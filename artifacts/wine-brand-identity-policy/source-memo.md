# Source memo — wine brand-identity regulation and guidance

**This is research, not legal advice and not a TTB determination.** Regulatory
text was retrieved from Cornell Legal Information Institute's CFR mirror on
**2026-07-21**; each section's TTB amendment citation is recorded as shown there.
Distinguish **regulation** (binding) from **TTB explanatory guidance**
(interpretive) throughout.

## Retrieval status

| Source | Retrieved | Note |
|---|---|---|
| 27 CFR 4.33 | ✓ law.cornell.edu/cfr/text/27/4.33 | current text quoted below |
| 27 CFR 4.32 | ✓ law.cornell.edu/cfr/text/27/4.32 | |
| 27 CFR 4.35 | ✓ law.cornell.edu/cfr/text/27/4.35 | |
| 27 CFR 4.34 | ✓ law.cornell.edu/cfr/text/27/4.34 | |
| 27 CFR 24.257 | ✓ law.cornell.edu/cfr/text/27/24.257 | |
| TTB "Wine Labeling: Brand Name" | **operator-verified 2026-07-21** | supplied from a separate live retrieval; not fetched by the worktree (see §6) |
| TTB "Anatomy of a Wine Label" | **operator-verified 2026-07-21** | same |
| TTB "Wine Labeling: Brand Label" | **operator-verified 2026-07-21** | same |
| TTB "Wine Labeling: Name and Address" | **operator-verified 2026-07-21** | same |

eCFR (ecfr.gov) redirected to a bot-detection host and could not be used; the
Cornell LII mirror was used instead. Anyone relying on this memo should confirm
against the official eCFR before acting.

## 1. 27 CFR 4.33 — Brand names (T.D. TTB-196, 89 FR 87935, Nov. 6, 2024)

**This is the load-bearing section for the whole round.**

> **(a) General.** "The product shall bear a brand name, except that if not sold
> under a brand name, then the name of the person required to appear on the brand
> label shall be deemed a brand name for the purpose of this part."

> **(b) Misleading brand names.** "No label shall contain any brand name, which,
> standing alone, or in association with other printed or graphic matter creates
> any impression or inference as to the age, origin, identity, or other
> characteristics of the product unless the appropriate TTB officer finds that
> such brand name … conveys no erroneous impressions …."

> **(c) Trade name of foreign origin.** [preserved trade-name exception; not
> central here.]

**What 4.33(a) establishes for this round:** the "deemed brand" fallback is
**regulation, not an interpretation**. When a wine is *not* sold under a brand
name, the name of the person required on the brand label (the responsible person
under §4.35) **is** the brand name for labeling purposes. So a
responsible-person/company name is neither "always a brand" nor "never a brand" —
it becomes the brand **precisely when no separate brand name is used**.

## 2. 27 CFR 4.32 — Mandatory label information (T.D. 6521, 25 FR 13835, Dec. 29, 1960)

Required **on the brand label**: (1) brand name per §4.33; (2) class/type or other
designation per §4.34. Required **on any label**: name and address per §4.35;
net contents; alcohol content.

**For this round:** the brand name and the class/type are the two things that must
be on the *brand label*; the name/address (bottler/producer/importer) may be
elsewhere. So the brand name and the responsible-person statement are **distinct
required elements** that can occupy different label locations — one does not
absorb the other by default.

## 3. 27 CFR 4.35 — Name and address (T.D. ATF-328 57 FR 33114 (1992); redesig. 68 FR 39455 (2003); T.D. TTB-158 85 FR 18722 (Apr. 2, 2020))

- Domestic wine: **"bottled by" / "packed by"** + the bottler/packer name and
  address is the mandatory responsible-person statement.
- Optional producer verbs, allowed only if the same person did the operation at
  the stated address: **"Produced"/"Made"** (fermented ≥75% or created the class),
  **"Blended"**, **"Cellared"/"Vinted"/"Prepared"** (cellar treatment).
- Imported wine: **"imported by"** + importer name and U.S. address; if bottled
  domestically, an additional bottler statement.

**For this round:** these lead-ins — *produced/bottled/made/vinted/cellared/
imported by* — identify the **responsible person**, i.e. exactly the entity that
§4.33(a) makes the *fallback* brand when no separate brand is used. Their presence
marks a name as a responsible-person statement; it does **not**, by itself, tell
you whether that name is *also* the marketed brand.

## 4. 27 CFR 4.34 — Class and type (T.D. ATF-53 43 FR 37677 (1978); amd. T.D. TTB-105 77 FR 56541 (2012))

Class/type must appear on the brand label, all parts "in direct conjunction and
in lettering substantially of the same size and kind." A **varietal** (grape type
— e.g. Chardonnay), a **semi-generic** geographic type, or a **geographic
distinctive** designation may substitute for the class designation, and when a
varietal/semi-generic name is used an **appellation of origin** must appear "in
direct conjunction with and … substantially as conspicuous as the class and type."

**For this round:** varietal names (Chardonnay, Cabernet Sauvignon, Traminette,
Zinfandel), class/type ("Red Wine", "White Wine"), and appellations (Long Island,
Finger Lakes, Willamette Valley, Napa) are **designations, not brands**, even when
visually prominent. This is the regulatory basis for the `VARIETAL`,
`CLASS_OR_TYPE`, and `APPELLATION` roles.

## 5. 27 CFR 24.257 — Labeling wine containers (auth. 26 U.S.C. 5368/5388/5662; amd. T.D. TTB-147 82 FR 57353 (Dec. 5, 2017))

The wine label must show the **name and address of the premises where bottled or
packed**, the **brand name if different from that name**, the alcohol content, an
appropriate kind-of-wine designation, and net contents.

**For this round, the decisive phrase is "the brand name, if different from
above."** §24.257 expressly contemplates that the brand name **may be the same as
the bottling-premises name** (then it need not be repeated) **or different**. This
is the operational twin of §4.33(a): the brand and the responsible person are
allowed to be the same entity, and frequently are for small producers.

## 6. TTB explanatory guidance — live-verified (operator-provided)

**Provenance.** TTB explanatory guidance was live-verified through operator/web
research on 2026-07-21. The Claude worktree environment could not directly
retrieve TTB.gov because its requests timed out. The claims below were therefore
supplied from a separate live retrieval and were not independently fetched by the
worktree. **These are TTB explanatory guidance, not binding regulation, and
nothing here is legal advice or an official TTB determination about any fixture.**

### 6.1 TTB — Wine Labeling: Brand Name
TTB defines the **brand name** as the name under which a wine or line of wines is
marketed. If the wine is **not sold under a separate brand name**, the bottler,
packer, or importer name is treated as the brand name when shown on the
designated brand label. *(Guidance mirror of §4.33(a).)*

### 6.2 TTB — Anatomy of a Wine Label
- the **brand name is mandatory** on the brand label;
- **class/type text** such as "Chardonnay" or "White Wine" **cannot, standing
  alone, serve as the brand**;
- when **no other brand appears**, the bottler/packer/importer name **is treated
  as the brand**;
- a **fanciful name is optional** and is used **in addition to** the brand name.

### 6.3 TTB — Wine Labeling: Brand Label
The **brand label** is the label carrying the **brand name in its usual
distinctive design**. It must contain the brand name, the class/type designation,
and an appellation when required. Other mandatory information — including
name-and-address — **may appear elsewhere**.

### 6.4 TTB — Wine Labeling: Name and Address
The name-and-address statement identifies the **bottler, packer, or importer**.
For American wine it is generally introduced by **"Bottled by"** or **"Packed
by"**; imported wine uses **"Imported by"** or another appropriate phrase.
**Authorized operating or trade names must correspond to the basic permit or
other qualifying document.**

### Why 6.4 matters to this round
The last sentence is the regulatory reason several cases are
`UNRESOLVED_FROM_ARTWORK`: whether a displayed name is the *authorized* operating
or trade name — i.e. the responsible person §4.33(a) can deem the brand — depends
on **permit/qualifying-document facts the label image does not carry.**

## Source hierarchy (governing this whole round)

- **CFR provisions (§4.32, 4.33, 4.34, 4.35, 24.257) are binding regulation.**
- **The four TTB pages above are explanatory guidance**, interpretive and
  non-binding; they do not override the CFR.
- **Neither is legal advice, and nothing here is an official TTB determination
  about any fixture.**
- The Cornell LII / eCFR regulatory citations captured in §§1–5 are retained.

## Synthesis for the corpus question

1. A company/winery/cellars/vineyard name is **not** disqualified from being a
   brand — §4.33(a) and §24.257 both allow the responsible person's name to be the
   brand.
2. It is **not** automatically the brand either — it is the brand only when it is
   *marketed as* the brand, or, by fallback, when **no separate brand is used**.
3. Varietal, class/type, and appellation are designations, never brands (§4.34).
4. The responsible-person lead-ins of §4.35 mark a name's *role* (responsible
   person), which is orthogonal to whether it is *also* the marketed brand.
5. Artwork frequently cannot establish whether a wine is "sold under a brand
   name" (§4.33(a)'s trigger) — that can depend on marketing and permit facts not
   visible on the label. Those cases are genuinely unresolved from artwork alone.
