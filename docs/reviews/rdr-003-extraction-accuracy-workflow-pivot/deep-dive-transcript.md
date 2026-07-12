# Supplemental Transcript — Fixing Label Lens Wine-Label OCR

- Status: Supplemental, non-authoritative synthesis artifact
- Source supplied by Joseph Walker on 2026-07-12

> The authoritative review record is `source-brief.md`, `verdict.md`, and `next-actions.md`.

## Summary

This deep-dive frames Label Lens as a case study in the tension between excellent system architecture and poor product usefulness. The central metaphor is a world-class restaurant with a flawless kitchen but a head chef who cannot taste: the system's containment, auditability, and workflow design are strong, while the OCR component cannot reliably identify the core facts it is supposed to surface.

The discussion emphasizes the project's governing doctrine:

> OCR and AI extract evidence. Deterministic rules evaluate evidence. Humans retain authority.

It praises the local-first design, evidence-only analyzer contract, checksum-protected JSON, readable HTML reports, source and derivative hashes, version provenance, append-only human disposition, and the removal of approval-like machine framing. These choices make failures inspectable, reproducible, and bounded rather than allowing probabilistic output to become a regulatory conclusion.

The transcript then confronts the full-corpus results:

- 13% exact brand match;
- 16% normalized brand match;
- 27% top-three brand recall;
- 37% alcohol detection recall;
- 35% alcohol parsed accuracy;
- 100% absent-brand false-positive rate across ten cases.

The most serious issue is false certainty. A blank or honestly unresolved field is safer and operationally cheaper than a confident but wrong brand candidate. A reviewer can immediately handle an honest `NOT_OBSERVED`; a false candidate forces the reviewer to interpret, reject, undo, and replace the machine's suggestion, creating more cognitive work than a manual process.

The transcript supports a disciplined repair sequence rather than feature expansion. It argues for:

1. securing a complete, reproducible corpus baseline;
2. teaching the extractor that no defensible brand candidate is a valid outcome;
3. repairing alcohol candidate generation for split tokens, percent-less wording, decimals, and rotated or side text;
4. reconstructing multi-line brand evidence before exclusion filters discard it;
5. evaluating orientation or region expansion only when corpus evidence justifies it;
6. refusing cloud fallback until measured evidence proves that it improves accuracy, false-certainty risk, latency, cost, and reviewer outcomes.

The discussion also stresses guided human correction. The reviewer should see highlighted OCR regions, correct evidence without erasing the original machine output, and append a human classification to the immutable record. Corrections can later become governed evaluation candidates, but they must never silently rewrite the regulatory record or self-train the production system.

A later part of the discussion shifts work upstream. Instead of asking an internal reviewer to begin with raw artwork and a fresh OCR run, sellers should submit the label, receive immediate guidance, resolve correctable ambiguity, and produce a traceable package before the reviewer opens the case. This reduces reviewer latency and preserves a clean distinction among machine output, applicant assertions, and human authority.

The transcript closes with the success standard that model accuracy alone is not enough. The actual metric is saved work: reviewers should complete cases faster, with less correction burden and no increase in false passes. The recommended checkpoint is to proceed with bounded extractor repair while freezing new product surfaces and regulatory fields.

## Review significance

The deep-dive's most important conclusion is that architectural success and component failure can coexist. The architecture deserves preservation because it safely contains error, but it cannot be used to excuse poor user value. The next development work must improve the core evidence path and demonstrate reduced human workload before the product expands.
