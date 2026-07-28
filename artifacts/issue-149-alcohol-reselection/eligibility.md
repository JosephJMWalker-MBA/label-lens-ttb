# Eligibility

Frozen source report: `docs/extraction-full-corpus/extractor-report.json` at base `5d22a6be0407e8df4870983aab9107bc89f7c5d0`.

## Gate result

**PASS for deterministic no-op evaluation.**

- Governed included cases: 115
- Recovery-bearing/evaluable cases: 50
- Present-Alcohol evaluable cases: 38
- Governed Alcohol-absence controls: 12
- Current failures or weak selections: 33
- Independent exact-source checksum families: 50
- Minimums: 6 evaluable, 3 failure/weak, 2 checksum families
- Recorded/reproducible passes: 50/50
- Fixed Alcohol truth: 50/50
- Current/treatment comparable: 50/50
- Known checksum identity: 50/50

An independent checksum family is the full committed `expectedSha256` of an included manifest record. Included records have `duplicateOfCaseId: null`; excluded duplicates do not enter the governed corpus.

## Layout coverage

Slices may overlap. Definitions are frozen in `slice-definitions.md`.

- Bottom-positioned: 24
- Side: 12
- Rotated 180 degrees: 0
- Vertical: 8
- Ordinary horizontal away from bottom/side: 2
- Governed Alcohol absence: 12

The zero-case standalone 180-degree layout is reported, not backfilled. It does not make the no-op result inconclusive because the frozen kill rule independently rejects behaviorally identical control and treatment across every evaluable case.

## Failure/weak definition

Present truth is failure/weak when the current selected value is not parsed-accurate or its state is not `OBSERVED`. Absent truth is failure/weak when the current selection is positive. This yields 33 cases.

## Required per-case classification

The governed runner assigns exactly one primary classification using this frozen order:

1. `recovery did not run` when only the primary pass exists (not evaluable);
2. `recovery ran but truth was absent` for an absence control;
3. `recovery truth discarded` when a recovery-pass individual selection is truth-correct but the current final selection is not;
4. `recovery ran and truth was present` when truth is present in any recovery-pass individual selection;
5. `selector chose weaker primary` when primary is correct, treatment differs, and treatment is weaker;
6. `correct candidate but conservative state` when the selected value is correct but state is not `OBSERVED`;
7. `wrong reliable candidate` when an `OBSERVED` selection is wrong;
8. `parser miss` when Alcohol-like OCR reaches candidate diagnostics and the parser rejects it;
9. `OCR miss` when no truth-correct parsed candidate exists;
10. `not evaluable` for extraction failure or missing fixed truth/checksum/pass evidence.

Because production already reselects all passes whenever recovery runs in this corpus, `recovery truth discarded` can only expose a selector outcome, not evidence excluded by the current call site.

## No-op eligibility check

All 50 recovery-bearing cases have primary Alcohol `NOT_OBSERVED`; the recovery trigger is present on every recovery pass. The current production branch therefore sends all collected passes to the unchanged selector for all 50. No case exposes the treatment-only input-set branch.

The experiment remains eligible to prove and preserve this no-op. It is not eligible to claim a behavioral improvement or to alter eligibility until an effect appears.
