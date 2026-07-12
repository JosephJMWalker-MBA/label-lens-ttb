# RDR-003 Source Brief

## Current evidence

The full wine-corpus evaluation established a reliable measurement baseline for the current production extractor.

- 132 total candidate images reconciled.
- 120 wine images.
- 115 included wine cases.
- 3 honest uncertain-truth exclusions.
- 2 duplicate exclusions.
- 12 non-wine exclusions.

The unchanged extractor produced the following aggregate results:

- Brand exact match: 13% of 101 determinate cases.
- Brand normalized-acceptable match: 16%.
- Brand top-3 recall: 27%.
- Absent-brand false-positive rate: 100% across 10 absent-brand labels.
- Alcohol detection recall: 37% of 101 present cases.
- Alcohol parsed-value accuracy: 35%.
- Absent-alcohol false-positive rate: 7%.

The dominant brand failure classes are candidate filtering, OCR recognition, candidate ranking, and false certainty. The dominant alcohol failure classes are candidate generation and OCR recognition.

## Core risk

The architecture is strong, but architecture success may hide product failure.

A system that preserves provenance, checksums, deterministic rules, and human authority is still not useful if it creates more correction work than it saves. False certainty is especially dangerous because it interrupts the reviewer, requires unlearning the machine's suggestion, and may create automation bias.

The clearest warning is the 100% false-positive rate on brand-absent labels. The current extractor behaves as though selecting some text is preferable to admitting that no defensible brand candidate exists.

## Workflow insight from the review

The current workflow asks OCR to infer both content and semantic role from unconstrained artwork:

```text
Look at the image
→ decide which text is the brand
→ decide which text is alcohol
→ rank candidates
→ compare against application facts
```

That is broader than the product needs.

The seller or applicant already knows what they intend to submit. The primary product workflow should instead be:

```text
Seller uploads label artwork
→ seller enters the facts expected on the label
→ system searches for evidence supporting each declared fact
→ system returns found / possible match / not found / unreadable / conflicting text
→ seller resolves correctable differences
→ unresolved ambiguity enters the reviewer queue
→ reviewer classifies the remaining evidence
```

This changes the primary technical problem from open-ended semantic discovery to bounded claim-to-artwork verification.

## Required evidence separation

The revised workflow must preserve three distinct layers:

1. Applicant assertion — what the seller says should appear.
2. Machine observation — what the artwork appears to contain.
3. Reviewer classification — what a human concludes about the evidence.

Applicant input is a search target, not observed truth. Machine output remains evidence, not a regulatory conclusion. Reviewer action remains final and append-only.

## Operator correction insight

Ambiguous machine output should not terminate in a technical dead end. The operator view should provide bounded classification controls.

For each field, the reviewer should be able to:

- select one of the OCR candidate regions;
- choose `None of these`;
- classify the result as confirmed match, acceptable normalized match, conflicting text, wrong field type, not present, unreadable, applicant correction required, or specialist escalation;
- optionally identify the wrong field type, such as producer, appellation, varietal, vintage, mandatory statement, or slogan;
- preserve the original machine candidate and append the human correction.

## Operational success standard

The primary success metric is saved work, not model accuracy alone.

The system should measure:

- declared value found exactly;
- declared value found after permitted normalization;
- declared value present among candidate regions;
- conflicting value found;
- declared value not found;
- reviewer selections required;
- seconds to classify;
- applicant correction rate;
- cases resolved before government review;
- reviewer handling time compared with manual review;
- false certainty and override burden.

## Governance debt

The documentation-integrity review surfaced multiple truncated governing documents. Detection is not remediation. Substantive governance documents must be completed before field expansion or institutional deployment.

## Review questions

1. Does the full-corpus evidence justify bounded extractor repair?
2. Should applicant-declared facts become the primary retrieval targets?
3. What reviewer classification controls are sufficient without creating a new ungoverned status system?
4. Which open-ended extraction metrics remain useful as diagnostics after the workflow pivot?
5. What measurable reviewer-work reduction is required before broader field or product expansion?
