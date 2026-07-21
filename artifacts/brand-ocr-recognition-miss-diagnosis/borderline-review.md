# Borderline review packet

Three of the 24 classifications turn on a judgment the pre-registered rules
cannot settle. **These are referred because a defensible alternative reading of
the rules would change the category — not because the OCR is wrong.** The other
21 are unambiguous under the rules as written.

Images: `borderline-crops/`. **Note the filenames honestly:
`<case>-best-span-area.jpg` shows the region of the *closest-matching OCR span*,
which on a true non-recognition may sit nowhere near the brand.
`<case>-full.jpg` is the label reference that actually shows the brand.**

**No fixture truth may be modified on the basis of this packet.** The question is
which diagnostic category a case belongs in, not what the brand is.

---

## 1. `approved-wine-091` — `TRUE_NON_RECOGNITION` vs `BOUNDED_NEAR_MISS`

| | |
|---|---|
| Expected truth | `Rias` (4 normalized characters) |
| Machine-selected brand | `D CONTROLLATA E` (AMBIGUOUS) |
| Best qualifying span | `RISK` — **distance 2** |
| Longest shared substring | `ri` (2 chars), 50 % coverage |
| Lines carrying a ≥ 4-char fragment | none |
| Images | `borderline-crops/approved-wine-091-full.jpg`, `borderline-crops/approved-wine-091-best-span-area.jpg` |

**Why it is borderline:** the truth is only four characters, so a 1-edit bound is
proportionally very tight — two edits on a four-character string is a 50 % change,
whereas two edits on `Caywood Vineyard` is barely 13 %. The category turns on the
bound rather than on the evidence.

**Against reclassifying:** the matched span `RISK` comes from the government
warning text, not from a brand region — the crop shows warning copy. A four-letter
common English word landing two edits from a four-letter brand is a coincidence of
short strings, not evidence the brand was read.

**Question for the reader:** looking at the full label, is `Rias` legible in the
artwork at all, and does anything in the OCR output plausibly correspond to it?

---

## 2. `approved-wine-083` — `TRUE_NON_RECOGNITION` vs `PARTIAL_RECOGNITION`

| | |
|---|---|
| Expected truth | `Barn Sill Wine Co.` |
| Machine-selected brand | `Bam il` (AMBIGUOUS) |
| Best qualifying span | `(1) ACCORDING TO` — distance 10 |
| Longest shared substring | `wine` (4 chars), 29 % coverage |
| Substantive tokens matched | none |
| Generic tokens present | **`wine`** |
| Relevant line | `North Carolina Muscadine Wine` |
| Images | `borderline-crops/approved-wine-083-full.jpg`, `borderline-crops/approved-wine-083-best-span-area.jpg` |

**Why it is borderline:** `wine` is the only truth token present in the OCR, and
the pre-registered generic list excludes it. That exclusion alone decides the
category.

**Additional wrinkle worth the reader's attention:** the machine selected
`Bam il`, which is plainly a degraded read of `Barn Sill` — but it is a two-token
span, outside the pre-registered window of 3–5 tokens for a four-token expected
brand, so the rules never considered it. Against the *full* expected string it is
far outside any bound regardless; the point is that the case has more partial
evidence than its category conveys.

**Against reclassifying:** the `wine` that was read comes from
`North Carolina Muscadine Wine` — a varietal/origin line, not the brand mark. It
is the same word by coincidence of vocabulary, not the brand's own token.

**Question for the reader:** on this label, is `Wine` in `Barn Sill Wine Co.`
distinctive brand content, or generic product wording that happens to appear in
the name?

---

## 3. `approved-wine-044` — `PARTIAL_RECOGNITION` vs `TRUE_NON_RECOGNITION`

| | |
|---|---|
| Expected truth | `Sweet Seduction` |
| Machine-selected brand | `VEEL` (AMBIGUOUS) |
| Best qualifying span | `Get seduced` — distance 7 |
| Longest shared substring | `etseduc` (7 chars), 50 % coverage |
| Substantive token matched | **`sweet`** |
| Relevant lines | `Get seduced by this luscious`; `A delightfully sweet and exilarating` |
| Images | `borderline-crops/approved-wine-044-full.jpg`, `borderline-crops/approved-wine-044-best-span-area.jpg` |

**Why it is borderline:** the case qualifies under rule A on the token `sweet`,
which is not on the pre-registered generic list but is arguably descriptive rather
than distinctive for a wine. The `sweet` that was read comes from back-label copy
(`A delightfully sweet and exilarating`), and the shared substring `etseduc` comes
from `Get seduced` — marketing prose, not the brand mark.

**Against the current classification:** if `sweet` is treated as generic in the
way `wine` and `red` are, this case has no distinctive evidence and becomes a true
non-recognition. Both qualifying signals trace to prose that merely shares
vocabulary with the brand.

**Question for the reader:** is the brand `Sweet Seduction` legible anywhere in
the artwork, and should the word `sweet` appearing in back-label copy count as
having partially recognised it?

---

## These are rule-sensitivity cases, not fixture problems

Each case sits where a **pre-registered boundary** was drawn — the 1-edit bound,
the generic-token list, the distinctiveness of a single word. **None of them
questions any fixture truth, and no fixture may be modified on the basis of this
packet.** They are preserved as a record of how sensitive the classification is to
those boundaries, and **they do not require human resolution before preservation**:
this record is complete without it.

## Effect on the headline result

If all three were reclassified in the direction argued above, the counts would
move to `BOUNDED_NEAR_MISS` 3 · `PARTIAL_RECOGNITION` 8 · `TRUE_NON_RECOGNITION`
13, or to 2 · 8 · 14. **No plausible resolution changes the conclusion**: bounded
near misses remain the smallest family by a wide margin, and true non-recognition
remains the largest. The recommendation in `next-experiments.md` does not depend
on how these three are settled.
