# RDR-003 Next Actions

## Immediate sequence

### 1. Merge the full-corpus evaluation system

- validate the 132-image reconciliation;
- preserve the 115-case measured baseline;
- confirm evaluation truth is inaccessible to production;
- merge the evaluation harness before tuning;
- keep open-ended extraction metrics as diagnostic evidence.

### 2. Define the applicant-declared verification contract

Add a bounded contract for each supported field:

- applicant-declared value;
- normalized search target;
- candidate OCR regions;
- exact or permitted-normalization comparison;
- conflicting observed value;
- not-found state;
- unreadable state;
- provenance and geometry.

Do not treat declared values as observed evidence.

### 3. Implement claim-targeted brand retrieval

For a declared brand, search OCR tokens and reconstructed lines for:

- exact text;
- permitted case, spacing, punctuation, apostrophe, and diacritic normalization;
- multi-line reconstruction;
- split-token reconstruction;
- bounded OCR-confusion variants;
- candidate geometry.

Return a bounded evidence state rather than selecting an unrelated phrase to fill the field.

### 4. Implement claim-targeted alcohol retrieval

For a declared alcohol value, search for candidate statements supporting or conflicting with that value, including:

- direct percent forms;
- `ALC./VOL.` and `BY VOL.` forms;
- split tokens;
- percent-less constructions;
- decimals;
- bottom, side, and rotated regions where justified by the corpus.

A different readable alcohol value should be reported as conflicting evidence, not merely not found.

### 5. Add the reviewer ambiguity controls

For each supported field, display:

1. the applicant declaration;
2. highlighted machine candidate regions;
3. a candidate-selection dropdown;
4. a bounded classification dropdown;
5. optional wrong-field subtype;
6. an append action that preserves the original machine result.

Initial classification vocabulary:

- confirmed match;
- acceptable normalized match;
- present but conflicts with declared value;
- wrong field type;
- not present on artwork;
- artwork unreadable;
- applicant correction required;
- escalate for specialist review.

Wrong-field subtype vocabulary:

- producer or bottler;
- appellation;
- varietal or designation;
- vintage;
- mandatory statement;
- slogan or decorative text;
- other.

Do not encode a final regulatory approval outcome in these controls.

### 6. Add applicant correction workflow

When the machine cannot verify a declaration or finds conflicting text, let the applicant:

- correct the declared fact;
- replace the artwork;
- acknowledge that the field is absent;
- resubmit for another prescreen;
- preserve the original submission and correction history.

### 7. Measure saved work

Before declaring the revised workflow successful, measure:

- exact and normalized declaration retrieval;
- candidate-region recall;
- conflict detection;
- false certainty;
- reviewer selections per field;
- median and p95 classification time;
- manual overrides;
- applicant-side resolution rate;
- reviewer handling time against a manual baseline.

## Bounded tuning order

1. No-brand rejection and honest absence.
2. Declared-brand candidate retrieval and line reconstruction.
3. Declared-alcohol candidate construction.
4. Region and orientation coverage supported by measured failures.
5. Candidate ordering for fast reviewer selection.

## Governance gates

Before expanding to designation, appellation, net contents, storage, or institutional workflows:

- complete the truncated operator-trust and throughput policy;
- complete other governing documents identified by the documentation validator;
- define the applicant-assertion, machine-evidence, and reviewer-classification trust boundaries;
- define retention and use rules for human corrections;
- establish that corrections may become evaluation candidates only through governed review.

## Deferred roadmap

The following remain deferred until the claim-verification workflow demonstrates reduced human effort:

- additional wine fields;
- applicant and reviewer retrieval assistants;
- seller submission portal and internal queue expansion;
- secure retained evidence storage;
- cloud fallback;
- batch processing;
- broader beverage categories.

## Exit condition

Proceed to field expansion only when the evidence shows that the revised workflow:

- materially reduces reviewer handling time;
- substantially reduces false-certainty overrides;
- lets applicants resolve routine discrepancies before review;
- preserves original machine evidence and human authority;
- does not increase false passes or unsupported certainty.
