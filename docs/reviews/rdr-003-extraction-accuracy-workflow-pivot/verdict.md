# RDR-003 Verdict

## Verdict

**Proceed with bounded extractor repair and pivot the primary workflow to applicant-declared claim verification.**

Do not authorize broader product surfaces, new regulatory fields, persistence, cloud fallback, or institutional workflow expansion until the revised core proves that it saves human work without increasing false certainty.

## Findings

### 1. The architecture is a valid foundation, not proof of product usefulness

The evidence-only analyzer boundary, deterministic rules, provenance, checksum-protected exports, append-only human disposition, and local-first deployment are all sound. They successfully contain machine error and preserve human authority.

However, the full-corpus metrics demonstrate that the current open-ended extractor is not yet useful enough to justify expansion. The 13% exact brand rate and 100% absent-brand false-positive rate are product-level blockers.

### 2. The primary workflow is solving the wrong semantic problem

The system currently asks OCR to infer which text is the brand and which text is alcohol before it uses the application facts.

In the intended submission workflow, the seller already knows the facts that should appear. Those declared facts should become bounded retrieval targets. The machine should locate, reconstruct, and compare candidate evidence rather than invent the semantic target.

### 3. Applicant assertions must remain distinct from observed evidence

The workflow pivot does not make seller input authoritative. Applicant assertions may be wrong, incomplete, or inconsistent with the uploaded artwork.

The system must preserve separately:

- declared fact;
- machine-observed candidate evidence;
- deterministic comparison;
- applicant correction;
- reviewer classification;
- final human disposition.

### 4. Ambiguity must become a fast human classification task

Ambiguous results should expose candidate regions and bounded dropdown classifications. The reviewer should be able to choose the correct candidate, reject all candidates, identify the wrong semantic type, or escalate.

The original machine result must remain immutable. Human action appends a correction or classification rather than overwriting the evidence record.

### 5. Open-ended extraction remains useful, but only as a secondary diagnostic capability

Unconstrained brand and alcohol extraction should remain in the evaluation harness and may support legacy, incomplete, or adversarial submissions. It should no longer define the primary seller-to-reviewer workflow.

### 6. Success must be measured in reduced work

Extractor metrics remain necessary, but the acceptance gate must include reviewer handling time, correction burden, number of selections, false-certainty overrides, and cases resolved before internal review.

### 7. Governance repair must be part of the critical path

Documentation-integrity checks should prevent new mechanical damage, but the existing truncated policies require human-authored completion. Governance completion is a hard gate before evidence-scope expansion and institutional deployment.

## Frozen operating principle

> The applicant declares what should appear. The machine locates and compares evidence. The applicant resolves correctable differences. The reviewer classifies genuine ambiguity. Human authority remains final.

## Explicitly not authorized by this review

- new wine evidence fields;
- beer, malt-beverage, or spirits support;
- cloud vision fallback;
- seller or reviewer RAG;
- production evidence retention;
- reviewer-demo authentication shell;
- batch processing;
- autonomous approval, rejection, or legal conclusions.
