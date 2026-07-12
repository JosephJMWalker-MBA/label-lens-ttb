# Supplemental Debate — Secure Architecture for Hallucinating Label Lens TTB

- Status: Supplemental, non-authoritative synthesis artifact
- Source supplied by Joseph Walker on 2026-07-12

> The authoritative review record is `source-brief.md`, `verdict.md`, and `next-actions.md`.

## Summary

This debate examines whether Label Lens should be considered an engineering success because it safely contains machine error, or a product failure because its core extraction is not yet useful enough to reduce reviewer work.

The architecture-success position compares the system to a high-containment laboratory. The central achievement is not that the OCR behaves perfectly, but that its errors cannot escape their proper boundary. The evidence-only analyzer cannot issue regulatory conclusions. Deterministic rules remain separate. Human disposition remains authoritative. Source identity, parser and rule versions, checksums, and append-only corrections make every failure traceable.

From this view, the poor extraction results demonstrate why the architecture matters. A hallucinated brand does not silently become a government approval. The machine's guess can remain ambiguous, the human correction can be appended, and the original record remains available for audit and later evaluation.

The product-failure position argues that containment is necessary but insufficient. A 13% exact brand rate, 35% alcohol parsed accuracy, and 100% absent-brand false-positive rate mean the reviewer may spend more time correcting the assistant than performing the work manually. A secure pipeline that packages wrong data beautifully does not fulfill the product's operational mandate.

The debate strongly converges on several points:

- false certainty is more dangerous than honest failure;
- the system needs a valid `NOT_OBSERVED` or no-defensible-candidate path;
- evaluation truth must remain isolated from production;
- new fields should not be added merely to stress-test an architecture while the core workflow remains burdensome;
- cloud fallback should be judged only by measured improvement in accuracy, false-certainty risk, latency, cost, and reviewer outcomes;
- corrections must preserve the original machine output rather than overwrite it;
- reviewer workload and time saved are essential acceptance metrics.

The main disagreement concerns timing. One side argues that the architecture is mature enough to support controlled scope expansion because failures are safely contained. The other argues that every additional field multiplies the correction burden and should remain frozen until the original brand-and-alcohol workflow proves useful.

## Resolution adopted by RDR-003

The review preserves the architecture but sides with the bounded-product position:

- proceed with focused repair of the existing evidence path;
- pivot the primary workflow toward applicant-declared claim verification;
- expose bounded reviewer classification controls for ambiguity;
- retain open-ended extraction as a diagnostic and fallback capability;
- freeze new fields and product surfaces until measured reviewer work declines.

## Review significance

The debate demonstrates that structural safety and practical usefulness are separate dimensions. Label Lens has earned the right to continue because its architecture contains error responsibly, but it has not earned the right to expand. The next proof must be operational: the system must reduce human effort while preserving the same safety boundaries.
