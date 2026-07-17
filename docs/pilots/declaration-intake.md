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
(all null before freeze), `expectedCandidateCount`, and **two seals** (below).

## Two seals (do not conflate)

- **`declarationInputDigest`** binds the stable declaration-input projection —
  schema/run/boundary/count and every entry's content. It is intentionally
  independent of `preparedAt`/`preparedBy` and the lifecycle timestamps, so an
  administrative re-record does not change the declaration-input identity.
- **`fullManifestDigest`** binds the entire governed manifest state — everything
  except the two digest fields themselves, including `preparedAt`, `preparedBy`,
  and the randomization/reviewer/machine lifecycle timestamps.

A change to a declared value moves **both** seals; a change to the preparer or a
lifecycle timestamp moves **only** the full-manifest seal. Neither is called a
"whole-manifest digest" unless it binds the whole manifest.

## Provenance-complete declarations

`isDeclarationProvenanceComplete` is the single governed predicate used by
validation, primary-blind eligibility, **and** accounting. A declaration is
counted `declarationsComplete` only when it has PRESENT brand+alcohol, a valid
non-forbidden source type/reference, source access date, recorded-by
identity/role, recorded timestamp, transcription method, independence statement,
intake start+completion timestamps, and all four non-negative component timings.
It enforces one **governed timestamp chain** — `intakeStartTimestamp <=
intakeCompletionTimestamp <= recordedTimestamp < every non-null lifecycle
timestamp (randomization / reviewer exposure / machine execution)` — and
`totalIntakeBurdenMs >=` the sum of source-search + transcription + verification
(overhead above the sum is permitted; a total below is rejected). The identical
chain (`governedTimestampChainIssues`) is used by validation and accounting, so a
declaration cannot be counted complete after any lifecycle boundary. PRESENT
values without that provenance are never counted complete.

## Validation rules (fail-closed over untrusted JSON)

Never throws on null/missing/malformed/wrong-typed input; **type-checks every
governed primitive/null field at every level — manifest metadata and each entry —
independent of eligibility state**; rejects unknown keys at every governed object
level; rejects arrays-for-objects and objects-for-primitives; **recursively**
rejects run-001 / reviewer-answer / OCR / machine-result / adjudicator /
expected-value keys at any depth. `candidates.json` is parsed the same way
(`parseCandidateInputs`) before any skeleton is built, and **every JSON input path
is read through one bounded reader (`readJsonFile`)** so a missing/unreadable file
or malformed JSON syntax returns a concise governed error rather than an uncaught
exception or stack trace. Plus: schema version; source-type enum; 64-hex source
digest; non-empty-or-explicit-missing values; **supported alcohol syntax without
changing exact text (bare numeric accepted, see below)**; governed normalization
(no uncontrolled normalization); `preparedAt` and each non-null lifecycle
timestamp must be valid timestamps; non-negative intake durations; the governed
timestamp chain; provenance-complete primary candidates; no forbidden provenance
sources; unique run-002 case IDs; unique primary source-image membership;
exposed/excluded cases barred from the primary pool; deterministic canonical
serialization; stable per-entry and dual manifest seals; and case-count/accounting
checks.

## Source verification — two exact, separate claims (never conflated)

- **`verify-source-bytes <manifest> <authorized-root-dir> <out>`** — reads the
  **actual source bytes** under an authorized root, recomputes SHA-256, checks
  byte size, and sniffs media type from magic bytes. `..` traversal and **symlink
  escape** are rejected via canonical-real-path containment (an in-root symlink to
  an outside file is refused and the outside file is never read). Report `mode`:
  `AUTHORIZED_ROOT_BYTES`.
- **`verify-inventory-membership <manifest> <trusted-inventory.json> <out>`** —
  proves **digest + byte-size membership only** against a trusted preservation
  inventory. It does **not** read or sniff source bytes and is never described as
  source-byte integrity. Report `mode`: `TRUSTED_INVENTORY_MEMBERSHIP`.

Each report carries an explicit `mode` and `verifies` description and contains
only relative refs — never absolute private paths.

## Alcohol input compatibility

The deployed declared-value workflow accepts a **bare numeric** alcohol input
(`12`, `12.5`). The manifest accepts both bare bounded numerics (0..100, ≤2
decimals) and marker forms (`12.5% ALC./VOL.`, `13% by volume`); `Napa Valley`
and out-of-range `120` are rejected. Exact source text is always preserved;
governed normalization derives the numeric comparison form.

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
# verify source bytes against a trusted preservation inventory (or an authorized root dir)
# actual-byte verification under an authorized root (recomputes sha256/size/media)
$R verify-source-bytes declarations/declaration-manifest.json <authorized-root-dir> validation/source-byte-verification-report.json
# separate digest+size membership against a trusted inventory (no byte reading)
$R verify-inventory-membership declarations/declaration-manifest.json <trusted-inventory.json> validation/inventory-membership-report.json
```

## Boundary

Preparation only. This tooling does not freeze eligible membership, generate a
review order or seed, assign reviewers, run Label Lens, or begin any pass. It is
self-contained and independent of the observation-quality (#114) and RDR-004
(#116) schemas.
