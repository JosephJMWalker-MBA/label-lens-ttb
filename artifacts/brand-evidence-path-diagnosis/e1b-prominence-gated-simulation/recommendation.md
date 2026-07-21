# E1b recommendation

## Verdict: **KILL E1b, and close the brand sub-span-generation family.**

## Kill-criteria results

| Criterion | Result | Triggered |
|---|---|---|
| Any absent-brand case emits a selected value | **8 of 10** | **YES** — immediate kill |
| Any wrong value becomes `OBSERVED` | **2** (`approved-wine-075`, `approved-wine-082`) | **YES** |
| Normalized selected match falls below 29 | **not evaluated** — Phase 2 forbidden | n/a |
| Top-3 recall falls below 33 | **not evaluated** — Phase 2 forbidden | n/a |
| Any currently correct `OBSERVED` case regresses | **not evaluated** | n/a |
| More correct selections lost than recovered | **not evaluated** | n/a |
| Producer/bottler exclusion bypassed | 5 of 7 producer lines pass eligibility; the span-level rule is bypassed as in E1a | **YES** |
| Candidate volume operationally excessive | gate still admits 347 of 478 lines and **9 150** spans | **YES** |
| Apparent safety requires changing the prominence threshold | there is no safe value: regression lines sit *above* truth lines, and the rule is undefined when `maxProminence = 0` | **YES** |

Four criteria triggered on the evidence that exists. The four marked *not
evaluated* are unevaluated **by design** — the brief forbids inspecting
present-case gains once the immediate condition fires, and I have not inspected
them. They are recorded as unevaluated rather than assumed.

## Why this closes the family, not just this variant

E1a and E1b failed for **different reasons at different stages**, and between
them they exhaust the plausible generation-side controls:

- **E1a** (no gate) failed because the filter ladder passes ~22 % of arbitrary
  sub-spans, and the ranker prefers that noise to real brand marks.
- **E1b** (prominence gate) failed because the only pre-existing "is this
  visually a brand line" signal is *relative to a brand mark the label may not
  have*, and where it is defined it does not separate truth-bearing lines from
  regression-producing ones.

Both runs also reproduced the same authority-stage defect: a 4-word window of
prose containing `vineyard` / `winery` clears the `OBSERVED` gate. **No
generation-side change can fix that**, because the defect is downstream of
generation. Any further variant in this family would have to either (a) invent a
new threshold — excluded by the brief and unsupported by the distributions — or
(b) change the authority gate, which is a different experiment with a much higher
evidentiary bar and one I would not open on this evidence.

## What to preserve instead

The diagnosis result stands and is worth keeping: **`CANDIDATE_GENERATION_MISS`
is the largest brand failure class (43 of 115), `too-many-words` is its largest
cause (23 cases), and truth genuinely does become a candidate when sub-spans are
generated** (17 of 23 under E1a, up from 0). The blockage is real and correctly
located. What has now been measured twice is that **opening generation without
also strengthening ranking and authority costs more than it returns**, and that
the current authority gate cannot arbitrate sub-span material at all.

Recommend recording this as a measured limitation of the current brand path,
alongside the standing facts that the corpus has **0 false certainty** and **0
absent-brand false positives** — both of which these experiments showed are cheap
to lose.

## Not recommended

- **Trying another prominence value.** Explicitly excluded, and the distributions
  say no value works.
- **Touching the authority gate to make sub-spans safe.** That inverts the
  safety argument: it would weaken the only mechanism currently preventing false
  certainty, in order to rescue a generation change that has never shown a gain.
- **E2 (multi-line merge, reach 2 cases).** Same family, smaller return, same
  unaddressed authority defect.

**E3 remains open and harmless**: a measurement-only split of
`OCR_RECOGNITION_MISS` (24 cases) into true non-recognition versus near-miss. It
changes no production behaviour and would tell us whether the second-largest
failure class is an OCR problem or a matching-tolerance one.

## Status

Nothing here authorizes implementation. E1b is killed; the generation family is
recommended for closure; E3 is the only remaining live thread.
