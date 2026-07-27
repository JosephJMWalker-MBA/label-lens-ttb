# PR #195 read-only assessment

Assessment date: 2026-07-27

Reviewed head: `79f628c` (`codex/issue-149-enable-brand-grouping`)

Constraint: PR #195 was inspected only. This branch does not modify, close, comment on, or merge it.

## Recommendation

**Hold until corpus expansion.**

The proposed selector changes are credible within their stated, downstream scope, but the available governed evidence does not establish that the adjacent-line grouping rule generalizes to production labels. PR #195 should not be merged on the strength of its synthetic evaluation alone. If there is an urgent reason to advance part of it, split the designator-only family guard from the plausible-adjacent-line merge and validate each independently.

## What the change can and cannot fix

PR #195 operates after OCR recognition. It can:

- join adjacent OCR lines when the text is already sufficiently correct and structurally plausible;
- prevent a designator-only candidate such as a bare family term from being treated as a reliable Brand;
- improve grouping/ranking outcomes without changing field authority.

It cannot recover letters that Tesseract did not recognize. The governed Issue #149 control has 11 fixed-truth Brand regions and all 11 fail before or at recognition: 11 `OCR_RECOGNITION_MISS`, zero correct reads, and zero grouping/ranking failures. The independent staging evidence added by merged PR #196 similarly reported zero grouping/ranking failures and six recognition failures among eight Brand targets. Grouping is therefore a valid downstream concern, but it is not the demonstrated current bottleneck.

## Evidence quality

PR #195's nine experimental cases are useful regression examples, particularly for the designator-only guard, but they are mostly synthetic selector inputs rather than end-to-end OCR results from governed real label regions. They show that the rule behaves as designed on the examples; they do not estimate field accuracy or false-certainty risk on production-like images.

The current committed corpus has enough governed real Brand regions to run a bounded experiment, but not enough cases in the failure class PR #195 targets:

- governed Brand regions: 11 regions across 10 fixtures;
- control recognition misses: 11;
- control grouping/ranking failures: 0;
- exact warning-statement fixtures: 0;
- warning-presence images: 2, representing one duplicated label source rather than two independent labels.

## Risk of masking OCR errors

The adjacent-line merge can make malformed OCR look more coherent. Two individually plausible fragments may be joined into a phrase that reads like a Brand even when one or both fragments are wrong. Keeping the existing authority boundaries limits the blast radius, but it does not eliminate false certainty when a positive designator or other support signal upgrades that coherent wrong phrase to `OBSERVED`.

The designator-only family guard has the opposite risk profile: it removes an overconfident interpretation and is independently safety-improving. This is why splitting the guard from the merge would produce a clearer claim and a narrower validation burden.

## Evidence required to reconsider

Before enabling the adjacent-line merge:

1. Add at least six redistributable, governed, real Brand regions where control OCR recognizes the needed words but grouping or ranking fails.
2. Add negative controls with nearby unrelated lines, malformed fragments, producer/location phrases, and designator-like text.
3. Freeze exact Brand truth before running the selector comparison.
4. Report whole-field exact accuracy, abstention, false certainty, failure-class transitions, and slices for orientation, text size, contrast, and source.
5. Require no false-certainty increase and a repeatable improvement on held-out real cases.

Until those conditions are met, retain PR #195 as a useful hypothesis and regression source, not as production evidence.
