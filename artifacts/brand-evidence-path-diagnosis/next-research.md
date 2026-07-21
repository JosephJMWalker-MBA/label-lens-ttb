# Remaining live research after this round

The arbitrary contiguous sub-span-generation family (**E1a**, **E1b**, and the
never-simulated **E2**) is **closed**. One thread remains.

## E3 — measurement only, not part of this record

**Split the 24 `OCR_RECOGNITION_MISS` cases into three categories:**

1. **true non-recognition** — the brand text does not appear in the OCR output in
   any form;
2. **partial recognition** — a proper fragment of the brand was read
   (e.g. `Vineya` for `Golden Road Vineyards`);
3. **bounded near-miss** — the brand was read within a small, explicitly bounded
   edit distance (e.g. `Prins` for `Prinsi`).

### Why it matters

`OCR_RECOGNITION_MISS` is the second-largest brand failure class (24 of 115,
20.9 %). Today the harness's containment test is exact-after-normalization, so a
one-character miss and an unread label score identically. The split determines
whether any future work there is an **OCR** problem or a **matching-tolerance**
problem — and therefore whether it is worth attempting at all. A first pass during
the diagnosis found 3 of the 24 where a single-character deletion of the truth
already appears in the captured lines; a proper measure would likely find more.

### Constraints

- **Measurement only.** No production behaviour changes. No latency cost. No
  false-certainty risk.
- **Not part of this PR.** E3 has not been run and no E3 artifact exists here.
- **Begin from a fresh branch based on then-current `origin/main`**, as a new
  round, with its own kill criteria — in particular a stated bound on "near-miss"
  fixed *before* the corpus is measured, so the bound cannot be tuned to the
  answer.

### Explicitly not next

- Any further sub-span generation variant — the family is closed.
- Any change to the authority gate to make sub-span material admissible. That
  would weaken the only mechanism currently holding false certainty and
  absent-brand false positives at 0, to rescue a treatment that never showed a
  gain.
