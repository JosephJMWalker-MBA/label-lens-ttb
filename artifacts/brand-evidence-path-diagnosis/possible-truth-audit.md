# Possible truth problems — flagged for human visual review

> **RESOLVED — no fixture-truth correction recommended.** A human reader
> (Joseph Walker, 2026-07-21) reviewed all five Group 1 referrals from the
> artwork. All five readings **support the existing shorter fixture boundaries**;
> the machine selected a superset in every case. Verbatim responses:
> `truth-review/reader-response-joseph-2026-07-21.md`.
> `approved-wine-051` carries an explicit **medium-confidence** qualification.
> **No fixture file was modified.**

Machine data: `possible-truth-audit.json`. **No fixture truth was changed, and
none should be changed on the strength of this list.** I am not a second reader
and I have already seen both the truth and the machine output for every case
here, so my reading is anchored. These are referrals, not findings.

Selection rule (mechanical, applied after extraction): a brand-present case whose
selected value does not match truth, where the normalized selected value contains
the truth or is contained by it, or where the fixture is marked `knownAmbiguous`.
20 of 105 present cases qualify.

## Group 1 — brand-boundary questions (5) — **reviewed and resolved as machine boundary errors**

The machine read a **superset** of the truth. Whether the extra words are part of
the brand as presented is a judgement call.

| Case | Truth | Machine read |
|---|---|---|
| `approved-wine-088` | La Mesma | `LA MESMA Yellow Label` |
| `approved-wine-089` | La Mesma | `LA MESMA Black Label` |
| `approved-wine-051` | Pacheca | `PACHECA DOURO D.O.C` |
| `approved-wine-048` | Pacha | `Pacha RESERVA - CARMENERE` |
| `approved-wine-046` | Curious | `Red Wine Blend Curious` |

`088`/`089` are the strongest referrals: "Yellow Label" / "Black Label" may be
part of the presented brand mark rather than trailing copy, and the two fixtures
differ only in that phrase.

## Group 2 — `knownAmbiguous` fixtures (4) — behaving as designed, listed for completeness

| Case | Truth | Machine read | State |
|---|---|---|---|
| `patricia-green-cellars` | Patricia Green Cellars | `ESTATE VINEYARD` | AMBIGUOUS |
| `approved-wine-072` | Ava Gardner | `HINNANT FAMILY VINEYARDS` | AMBIGUOUS |
| `amuninni-ferracane` | Amuninni / Fabio Ferracane | `INV ENVY` | AMBIGUOUS |
| `le-caniette` (also Group 3) | Le Caniette | `INDICAZIONE GEOGRAFICA PROTETTA` | AMBIGUOUS |

These are already recorded as having no single objectively-correct answer, and
the evaluator scores `AMBIGUOUS` on them as `correct-uncertainty`. **No truth
review is implied.**

## Group 3 — partial reads: mechanical failures, *not* truth problems (11)

The machine read a fragment of the truth. Listing them only to state clearly that
they are **not** referred for truth review — each has a concrete earlier loss.

| Case | Truth | Machine read | Actual mechanism |
|---|---|---|---|
| `luigi-giovanni-live`, `approved-wine-105` | Luigi & Giovanni | `VANNI` | `non-brand-keyword` on the full line |
| `chateau-bonneau` | Château Bonneau | `BONNEAU` | reconstruction split |
| `approved-wine-033` | Haywater Cove | `COVE` | ranking |
| `m-cellars-baseline` | M Cellars | `CELLARS` | `low-information-fragment` on `M` |
| `wine-multi-artifact-06` | Mauro Molino | `MOLINO` | reconstruction/generation |
| `approved-wine-107` | La Fattoria | `FATTORIA` | generation |
| `approved-wine-064`, `approved-wine-065` | Prinsi | `Prins` | OCR recognition (dropped final letter) |
| `approved-wine-106` | Alfredo's Wine | `REDO` | `non-brand-keyword` |
| `approved-wine-053` | Golden Road Vineyards | `Vineya` | OCR/reconstruction |
| `wine-multi-artifact-05` | Blazic | `BLAZIC COLLIO` | boundary — arguably Group 1 |

## Recommendation — carried out, and its outcome

Group 1 was referred to a human reader working from the source artwork. **The
review is complete and recommends no correction.** All five recorded truths stand;
the machine's longer readings are boundary errors. No action was taken on Groups 2
and 3, and none is needed.

Outstanding item, recorded rather than resolved: for `approved-wine-051` the
reader could not classify the adjacent non-English wording (`DOURO / D.O.C.`) and
recorded medium confidence. That qualification attaches to the *role of the
neighbouring text*, not to the brand boundary — `PACHECA` as the brand is not in
question. It requires no fixture action now.
