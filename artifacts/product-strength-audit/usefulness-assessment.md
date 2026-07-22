# Usefulness assessment

## Credible manual alternative

For the currently supported scope, a credible manual process is:

1. seller puts front/back artwork in a shared folder;
2. seller records the declared brand and alcohol value in a two-row worksheet;
3. seller or reviewer marks where each appears, or adds a screenshot;
4. reviewer visually compares the two values and records a disposition by email or in the worksheet.

This is not elegant, but it is fast, familiar, and complete enough to return a change request. Label Lens must beat it on combined seller-plus-reviewer time, error containment, provenance, or repeatability—not on number of technical components. [Issue #38](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/38) already specifies the right paired measurements: time to trustworthy disposition, corrections, wrong populated fields, abstentions repaired, reinspection, interactions, fallback, abandonment, and trust.

## Where Label Lens is better

- It preserves seller evidence, machine observations, and rule outcomes separately. [`package-model.ts`](../../src/features/package-preparation/package-model.ts)
- It makes absent panels explicit rather than inventing artifacts. [`package-workflow.ts`](../../src/features/package-preparation/package-workflow.ts)
- It creates checksummed, immutable, authenticated revision data with append-only status history. [`finalize/route.ts`](../../src/app/api/package/submit/finalize/route.ts), [`src/db/schema.ts`](../../src/db/schema.ts)
- It exposes why three rules did not run instead of guessing. [`src/app/learn/page.tsx`](../../src/app/learn/page.tsx), [LIVE-04](limitations.md#live-observation-log)
- It can give a reviewer one structured record instead of loose evidence—when the record opens successfully. [`detail.ts`](../../src/server/submissions/detail.ts), [LIVE-09](limitations.md#live-observation-log)

## Where Label Lens may be worse

- The seller must already locate and transcribe brand and alcohol, then draw regions, before machine analysis. [`package-profile.ts`](../../src/features/package-preparation/package-profile.ts), [`package-workflow.ts`](../../src/features/package-preparation/package-workflow.ts)
- OCR can add correction work. The bundled live fixture selected `CELLARS` rather than the declared `M CELLARS` and required human review. [LIVE-06](limitations.md#live-observation-log)
- The workflow requires navigation, browser-draft management, saving, analysis, discrepancy handling, authentication, and submission for only two supported fields. [`src/app/review/page.tsx`](../../src/app/review/page.tsx), [`AgentReviewSubmissionDock.tsx`](../../src/features/package-preparation/AgentReviewSubmissionDock.tsx)
- The manual process can return an email change request; Label Lens cannot currently return one at all. [journey-agent.md](journey-agent.md)
- One deployed waiting submission observed during the audit could not be opened because stored integrity verification failed; the cause is unknown. A shared folder would still have exposed its files, but this single dated observation does not establish a general integrity failure. [LIVE-09](limitations.md#live-observation-log)

## OCR: advantage, helper, or burden?

OCR is a candidate helper, not the product. Current full-corpus evidence reports:

- current brand exact selection 27/105 (25.7%), normalized selection 29/105 (27.6%), top-3 33/105 (31.4%), and truth selected as `OBSERVED` 4/105 (3.8%);
- current alcohol detection 70/103 (68.0%) and parsed-value accuracy 68/103 (66.0%);
- current alcohol false certainty 0, absent-alcohol false positives 0/13, and states `OBSERVED` 64 / `LOW_CONFIDENCE` 6 / `NOT_OBSERVED` 45;
- 33 present-alcohol cases still undetected and 35 not parsed correctly;
- in a distinct earlier challenge slice, side/rotated alcohol detection was 3/12 and parsing 2/12, while vertical mandatory-strip detection and parsing were 0/5;
- in that same earlier recovery-pass study, 127 extra OCR passes produced no usable evidence, with about 24.9 seconds of recovery cost per recovered correct field.

Evidence: current [`brand metrics`](../brand-evidence-path-diagnosis/metrics.md), current [`alcohol baseline`](../alcohol-digit-ocr-diagnosis/summary.md), the governed [`truth correction`](../alcohol-truth-correction/metric-diff.md), and the separately labeled earlier challenge/recovery slices in [`docs/extraction-full-corpus/extractor-report.md`](../../docs/extraction-full-corpus/extractor-report.md). [Issue #57](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/57) still describes the older 61%/57% aggregate and should not be cited as the current aggregate baseline.

Targeted human crops do not automatically rescue the system: in a separate 13-case adjudicated hard-case benchmark, additive cropping recovered two brand cases at roughly 3.1–3.4 seconds extra latency, recovered no acceptable alcohol case, and crop-only variants caused 15 unique case-field regressions. This is a challenge benchmark, not the current aggregate baseline. Evidence: [`docs/ocr-region-isolation-benchmark/report.md`](../../docs/ocr-region-isolation-benchmark/report.md).

Therefore:

- **Potential advantage:** a bounded second look that catches a mismatch the human missed, or pre-organizes evidence the reviewer would otherwise reconstruct.
- **Current helper:** only when it returns a correct, well-located observation with less verify/correct time than manual review.
- **Current burden:** when seller annotation already supplies the answer and machine output is wrong, ambiguous, slow, or merely repeats it.

The repository has accuracy measurements but no current operator-time distribution showing which of those outcomes dominates. The correct conclusion is `UNKNOWN_NOT_MEASURED`, not “OCR is useful” or “OCR is useless.”

## Manual annotation: complement or defeat?

Manual annotation complements machine assistance when it supplies trustworthy seller intent and OCR independently reduces downstream verification. It defeats the value proposition when the human has already completed the only supported extraction task and must then supervise a weaker duplicate. Current package sequencing makes both possible; [#38](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/38) must separate selected evidence, ambiguity escalation, blank abstention, wrong populated values, and reinspection cost to decide which case is real.

## Usefulness conclusion

Structured packaging and provenance are credible assets. Faster or better human work is not yet demonstrated. Do not add fields to manufacture breadth. First complete the review loop and run a paired manual-baseline study; then keep OCR only where it produces measurable net benefit without weakening abstention or provenance.
