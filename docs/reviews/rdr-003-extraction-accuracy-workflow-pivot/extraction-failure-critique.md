# Supplemental Critique — Fixing the Label Lens Extraction Failure

- Status: Supplemental, non-authoritative synthesis artifact
- Source supplied by Joseph Walker on 2026-07-12

> The authoritative review record is `source-brief.md`, `verdict.md`, and `next-actions.md`.

## Summary

This critique argues that the status report initially underweighted the extraction crisis by foregrounding architectural achievements and closed issues before presenting the full-corpus failure rates. It warns that a stakeholder could read several pages of foundational success and mistakenly conclude that the product is nearly ready, despite a 13% exact brand match rate and a 100% false-positive rate on brand-absent labels.

The first recommendation is structural: move the extraction crisis and principal risks to the beginning of future status reports. Foundational successes should be compressed into a concise summary or appendix. The report should function as a strategic decision document rather than a chronological ledger of completed engineering work.

The second recommendation is to connect technical repair directly to operator workload. The current idea of a “meaningful improvement” in extraction is too vague. A model metric can improve without changing the human workflow. For example, a modest recall increase may leave the reviewer doing the same manual entry, while a reduction in false certainty can immediately eliminate unnecessary overrides and cognitive interruption.

The critique therefore recommends concrete workflow metrics alongside extraction metrics:

- reduction in false-positive brand selections;
- number of reviewer overrides;
- seconds required to classify an empty or ambiguous field;
- manual-entry time avoided;
- total case-handling time;
- percentage of cases resolved without reviewer rework;
- no increase in false passes or unsupported certainty.

It explicitly rejects the idea that speed requires more aggressive guessing. A safer and faster system can improve by failing honestly and getting out of the reviewer's way. Correctly returning “no defensible candidate” may save more time than returning an attractive but wrong suggestion.

The third recommendation concerns governance debt. The review notes that documentation-integrity tooling can detect truncated policies, but detection does not author the missing policy. In a regulatory product, governance is not ancillary documentation; it defines what the system and its operators are allowed to do. A technically correct implementation can still violate an incomplete or unstated operational policy.

The critique recommends placing substantive governance repair directly in the roadmap. In particular:

- complete the truncated governing documents before broad evidence-field expansion;
- make the operator-trust and throughput policy a hard gate before institutional workflow deployment;
- ensure extractor tuning is reviewed against the completed policy boundaries;
- prevent documentation debt from becoming an indefinite parallel backlog.

## Strategic recommendations

1. Lead future reports with the extraction failure and false-certainty risk.
2. Tie Phase 2 exit criteria to measured reductions in reviewer work.
3. Treat honest absence and ambiguity as workflow improvements, not merely lower model confidence.
4. Complete human-authored governance before adding fields or scaling the system.
5. Preserve the strong architecture, but do not let it obscure the product's current operational weakness.

## Review significance

The critique does not reject the architecture. It argues that the roadmap must force the team to solve the right problems in the right order. The extraction engine, reviewer workload, and governance rules must be repaired together before the project expands.
