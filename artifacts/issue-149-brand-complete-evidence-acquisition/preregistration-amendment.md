# Preregistration amendment 1 — pre-acquisition

Refs Issue #149, PR #219. **Amended before any governed acquisition OCR.**

## The original plan is preserved, not overwritten

| Field | Value |
| --- | --- |
| Original Stage 1 head | `7600b0a9ba5ce6995274a517121f1eda18a30424` |
| Original base | `8f0c6a7ca7c271eed14d9084ed6da7fe11f897a9` |
| Original preregistration SHA-256 | `7b691c78a9de008039ccc1a7f94824015373b1caec58f8235c78a03587c641fb` |
| PR #220 merge commit / new base | `546c3f279ce431a1fd8c0203df7a83553ea866ef` |

The original text is not deleted. It remains reachable at commit
`7600b0a9…` and its hash is recorded here and in `amendment-linkage.json` so the
two plans can never be confused.

## No governed acquisition OCR occurred under the original preregistration

**Zero.** No `raw/` directory, no raw-evidence manifest and no execution workflow
ever existed on this branch. The original Stage 1 commit added planning artifacts
only. Nothing in this amendment is informed by an acquisition result, because
there is no acquisition result.

## Why the plan changed

**1. PR #220 merged and resolved the largest limitation.** The original plan
recorded, as an unavoidable blocker, that only the *first* firing filter rule was
observable because the ladder short-circuits. PR #220 added an evaluation-only,
default-off entry point that evaluates all ten rules and enforces eight runtime
invariants. **That limitation is now resolved and is recorded as resolved rather
than left standing as current.**

**2. The acquisition input exposed historical identity.** The original
`truth-free-input-manifest.json` carried `caseId` and `imagePath` — for example
`luigi-giovanni-live` and `tests/fixtures/precheck/approved-wine-001/label.png`.
Those are historical identifiers and Brand-adjacent paths. They are replaced by
opaque `item-NNNN` identifiers and generic `item-NNNN.png` staged filenames.

**3. The pre-freeze scan was wrong in a way that mattered.** The original plan
scanned emitted evidence for governed acceptable-value strings. That is
incorrect: a legitimate OCR transcript may naturally contain the Brand text, and
flagging it would misread correct recognition as leakage — while also requiring a
truth file to be opened before the truth boundary. Truth-string inventory and
comparison move to post-freeze evaluation.

**4. Candidate identity was too weak.** A truncated digest cannot carry a
uniqueness guarantee. Identity becomes an ordinal into the exact unprojected
production array plus a full 64-character digest, with collision and count
assertions.

**5. There was no repository-footprint rule.** A 100 MB Git gate is added — a
storage gate, never an evidence-completeness exception.

## What changed, precisely

| Area | Original | Amended |
| --- | --- | --- |
| Base | `8f0c6a7c…` | `546c3f27…` (PR #220 merge) |
| Acquisition identity | historical `caseId` + fixture path | opaque `item-0001` … `item-0115` |
| Staged filenames | original fixture paths | `item-NNNN.<ext>` |
| Historical mapping | none | `post-freeze/id-map.json`, post-freeze only |
| Pre-freeze scan | included governed Brand strings | keys, files and historical identifiers only |
| Filter reasons | first firing rule only | complete `filterChecks` + `activeRejectionReasons` |
| Candidate identity | truncated digest | ordinal + full 64-hex digest |
| Volume rule | none | 100 MB Git gate |

## What did not change

The 115-case population and its 105/10 split; the requirement for two exact runs
with no retries and no configuration change between them; the truth boundary
before any mapping or truth is loaded; the immutability of `raw/` after freezing;
the acquisition verdict vocabulary; and the prohibition on simulating a filter
relaxation or recommending a treatment.

## Limitations that remain genuinely unavailable

Verified against the real types at this base, not assumed:

- **word baseline geometry** — `OcrWord` carries `text`, `rawConfidence`, `bbox`
  and an optional `originalGeometry`, and nothing else;
- **block, paragraph and line identifiers** — likewise absent from `OcrWord`;
- **constituent word IDs per reconstructed line** — `BrandLineDiagnostic` records
  assembled text and pass provenance, not word membership.

No field is invented to fill these.
