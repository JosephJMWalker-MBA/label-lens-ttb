# Ship-readiness run-002 declaration intake (Issues #124 / #127)

Reusable tooling for the **declared-value verification** workflow. It defines the
deterministic declaration-manifest layer, governed normalization, canonical
digests, and fail-closed validation that make an independent, preregistered set
of declared brand/alcohol inputs auditable — **before** any randomization,
reviewer exposure, or Label Lens pass.

## Product boundary (governed, enforced)

> A submitter or internal reviewer supplies a label image plus pre-existing
> declared brand and declared alcohol values. Label Lens locates and presents
> evidence on the artwork so the reviewer can confirm, correct, abstain, or
> escalate. Label Lens is not being evaluated as autonomous brand or alcohol
> identification.

Declarations are **inputs** to verification — never machine truth and never
adjudicated label truth. The validator rejects any manifest whose
`productBoundaryStatement` does not match this exact statement.

## Declaration-source policy (priority order)

1. **Genuine application/submission package** tied to the exact product and label.
2. **Official public record** tied to the exact product and label.
3. **Producer-controlled product record** tied to the exact product and label.
4. **Controlled intake transcription** completed before randomization and
   isolated from reviewer timing.

The four are distinguished by `declarationSourceType` and must never be conflated.
Controlled intake transcription **simulates** submitter-entered declarations; it
does not represent a complete application-package workflow, and its intake burden
is recorded separately. **Declared values are never read from the artwork by an
OCR/VLM/Label-Lens pass** — that is the exact contamination Issue #124 forbids.

## Independence rules (enforced)

A declaration is eligible only when it was established **before** review-order
generation, reviewer exposure, any run-002 Label Lens execution, and any timed
pass. It must not come from Label Lens output, pilot OCR, the run-001 manual
answers, adjudicator notes, live machine results, post-review correction, or a
filename/guessed identity. The validator enforces timestamp ordering, a
forbidden-source-reference guard, and a forbidden-key scan for run-001 outcome /
machine-result fields.

## Exposure accounting

`pilot-wine-005`, `pilot-wine-019`, and `pilot-wine-021` are already exposed and
can never enter the primary blinded stratum; they belong in a `NON_BLIND_OPERATIONAL`
stratum. The validator rejects any exposed prior identity marked
`PRIMARY_BLIND_CANDIDATE`. Exposed cases are not silently replaced.

## Manifest schema summary

Per entry: `runId`, `run002CaseId` (`r2-case-NNN`), `sourceImageRef`,
`sourceImageSha256`, `sourceMediaType`, `sourceByteSize`, `priorPilotIdentity`
(accounting only), `declaredBrand`/`declaredAlcohol` (`exactSourceText` preserved +
governed `normalizedComparisonForm` + `valueState` + `uncertaintyState`),
`declarationSourceType`, `declarationSourceRef`, `sourceAccessDate`, `recordedBy`
(identity/role), `recordedTimestamp`, `transcriptionMethod`, `independenceStatement`,
`timing` (source-search / transcription / verification / total intake burden ms,
plus start/completion), `primaryBlindEligibilityState`, `exclusionOrNonBlindReason`,
`schemaVersion`, `manifestEntryDigest`. The manifest holds the run-level
`randomizationTimestamp`/`reviewerExposureTimestamp`/`machineExecutionTimestamp`
(all null before freeze), `expectedCandidateCount`, and a whole-manifest digest.

## Validation rules (fail-closed)

Required fields; schema version; source-type enum; 64-hex source digest;
non-empty-or-explicit-missing values; supported alcohol syntax **without changing
exact text**; governed normalization (no uncontrolled normalization); valid
timestamps; non-negative intake durations; declaration timestamp before
randomization/reviewer/machine timestamps; independence statement present for
candidates; no forbidden provenance sources; unique run-002 case IDs; unique
primary source-image membership; exposed/excluded cases barred from the primary
pool; no run-001 outcome/machine-result keys; deterministic canonical
serialization; stable per-entry and whole-manifest digests; case-count/accounting
checks; and fail-closed rejection of incomplete or contradictory provenance.

## Timing rules

Declaration intake is **not** reviewer handling time. `source-search`,
`transcription`, and `verification` time are recorded separately from the total
intake burden. The reviewer clock begins only after the frozen image and
declaration inputs are available.

## Commands

```bash
# Uses vite-node so the shared @/ hashing utility resolves (repo convention for
# alias-using TS scripts).
R="npx vite-node --config vitest.config.ts scripts/pilots/declaration-intake.ts"
$R skeleton   candidates.json declarations/declaration-manifest.json   # no declared values; provenance pending
$R validate   declarations/declaration-manifest.json
$R accounting declarations/declaration-manifest.json manifests/candidate-accounting.json
$R no-leakage declarations/declaration-manifest.json validation/no-leakage-report.json
```

## Boundary

Preparation only. This tooling does not freeze eligible membership, generate a
review order or seed, assign reviewers, run Label Lens, or begin any pass. It is
self-contained and independent of the observation-quality (#114) and RDR-004
(#116) schemas.
