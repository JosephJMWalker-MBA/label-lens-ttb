# Human truth-review packet — brand boundary

Five referrals from the brand evidence-path diagnosis. In each, the machine read a
**superset** of the recorded brand truth. The question is not whether the machine
"failed": it is where the brand mark actually ends on the artwork.

**This packet contains no recommendation and changes no fixture.** Please read the
artwork first and record your answer before consulting the machine column — the
diagnosis author had already seen both, so that reading is anchored and is not
recorded here.

Blank response form: **`reader-response-template.md`** — fill that in rather than
annotating this file. It is intentionally unpopulated.

## How to use

For each case: open `crops/<case>-brand-area.jpg` (the apparent brand area,
enlarged) and `crops/<case>-full.png` (the whole label for context). Machine
output and surrounding label text are in `review-cases.json`.

## The neutral question, asked identically for all five

> Reading only the artwork: what text constitutes the brand as presented on this
> label, and where does the brand mark end and designation, varietal, appellation,
> label-series, or descriptive wording begin?

## Cases

| Case | Recorded truth | Machine read | Surrounding wording to weigh |
|---|---|---|---|
| `approved-wine-088` | `La Mesma` | `LA MESMA Yellow Label` | `GAVI` below; "Yellow Label" set on the same line in a lighter weight |
| `approved-wine-089` | `La Mesma` | `LA MESMA Black Label` | same producer, same layout, different series word |
| `approved-wine-051` | `Pacheca` | `PACHECA DOURO D.O.C` | `DOURO D.O.C` is an appellation |
| `approved-wine-048` | `Pacha` | `Pacha RESERVA - CARMENERE` | `RESERVA` is a designation, `CARMENERE` a varietal |
| `approved-wine-046` | `Curious` | `Red Wine Blend Curious` | `Red Wine Blend` is generic product wording |

`088` and `089` are the pair most worth a careful look: they are the same label
design differing only in the series word, so whichever way the boundary falls, it
should fall the same way for both.

## What a decision here would and would not settle

- It settles whether these five fixtures record the visually defensible boundary.
- It does **not** decide any production change. The E1a simulation in
  `../e1a-too-many-words-simulation/` is scored both with and without these five
  cases precisely so that the treatment's value does not rest on their outcome.

If the truths stand, these remain machine boundary errors. If a truth is
corrected, that is its own reviewed round with a genuine second reader — as was
done for the alcohol truth corrections in `artifacts/alcohol-truth-correction/`.
