# Preregistration — Amendment 12

**Immutable acquisition input, symbol-resolved source closure, and executable
Stage 1 command verification.**

Base: `546c3f279ce431a1fd8c0203df7a83553ea866ef` (merge commit of PR #220).
Amends: `preregistration.md`, as amended through Amendment 11.
Prior head: `198cb370bfd5c436b62bda64dd1e5ffdd40810dd`.

Stage 2 Job A, discovery, execute mode and governed 115-case acquisition OCR
remain **not started**. No acquisition runner, acquisition workflow,
workflow-mode file, runtime bundle or truth-free preparation artifact exists.
Production runtime behaviour is unchanged.

Amendments 1–11 and `branch-pointer-incident.md` are preserved unchanged and are
explicitly historical. This record supersedes their operative language only.

---

## 1. The caller no longer owns the input the extractor reads

### The defect

`acquireProductionBrandEvidence` accepted the caller's `ExtractionInput` and
passed that same object to `extractLabelEvidenceDetailed`. The caller kept a live
reference across the await. Between the call and the extractor's first read of
any field, the caller could still change `imageBytes`, `artifactRef`,
`derivativeSha256` or any frozen identity — so the recorded provenance need not
describe what was actually recognized.

Freezing the caller's object in place would not have fixed it. `Object.freeze`
on an alias still leaves the caller holding the object the extractor reads, and
it does not neutralize accessors the caller may already have installed, whose
getters can return a different value on each read.

### The correction

`acquireProductionBrandEvidence` now **validates and copies, synchronously,
before its first await**, into a closed, deeply frozen snapshot:

- `ACQUISITION_INPUT_KEYS` is a **closed** nine-key set. An unknown key, a
  missing required key, or a key whose type is wrong halts with
  `MALFORMED_EXTRACTION_INPUT`. The snapshot is built key by key from that set,
  so an unknown property cannot survive the copy even if validation were relaxed.
- Accessors are rejected before reading: `assertNoAccessors` walks the own
  property descriptors and halts if any is a getter or setter, at the top level
  and inside `ocrEngine`. A value that changes when it is read is not an input.
- `imageBytes` is copied into a fresh buffer. `ocrEngine` is rebuilt from
  `OCR_ENGINE_KEYS`. Every object in the snapshot is `Object.freeze`d.
- The frozen identities in `FROZEN_IDENTITIES` — adapter id and version, parser
  id and version, engine id, engine version, model id, `processedAt` — are
  compared against `incumbent-configuration-freeze.json`'s values; a mismatch
  halts with `EXTRACTION_INPUT_IDENTITY_MISMATCH`. `derivativeSha256` must match
  `LOWER_HEX_64`.
- The copy happens **before the first `await`**, so there is no window in which
  the caller's object is still the one in flight.

The extractor therefore receives an object that is **not** the caller's. A test
asserting `toBe(input)` would be asserting the defect; the orchestration tests
assert `not.toBe(input)` and `Object.isFrozen`, and a mid-flight mutation test
releases a deferred extractor after mutating the caller's object and shows the
recognized snapshot is unchanged.

## 2. The source-closure analyzer resolves symbols; a name is not a binding

### The defect

The analyzer matched callee **names**. That is satisfiable by a local function
coincidentally named `acquireProductionBrandEvidence`; satisfiable by importing
that name from an unreviewed module; and evadable by calling a prohibited
function through an alias (`import { extractLabelEvidenceDetailed as run }`) or a
namespace (`import * as extractor`). It could not tell whether the required call
was awaited, or what it was passed. The `adapterModulePath` override also let the
caller nominate the authorized module — a gate that authorizes whatever it is
pointed at.

### The correction

`analyzeStage2SourceClosure` builds a `ts.Program` over the supplied closure and
resolves every callee through the file's import bindings and the checker.
`RUNNER_ENTRY_PATH` and `AUTHORIZED_ADAPTER_MODULE` are frozen constants; the
`adapterModulePath` and `runnerEntryPath` parameters are **removed**. New rules:

`RUNNER_ENTRY_MISSING`, `ADAPTER_MODULE_MISSING`, `DUPLICATE_FILE_PATH`,
`PARSE_ERROR`, `RUNNER_DOES_NOT_IMPORT_ACQUISITION`,
`ACQUISITION_IMPORT_IS_TYPE_ONLY`, `ACQUISITION_BINDING_SHADOWED`,
`ACQUISITION_BINDING_NOT_FROM_ADAPTER`, `RUNNER_DOES_NOT_INVOKE_ACQUISITION`,
`RUNNER_INVOKES_ACQUISITION_MORE_THAN_ONCE`,
`ACQUISITION_INVOKED_OUTSIDE_RUNNER`, `ACQUISITION_CALL_NOT_AWAITED`,
`ACQUISITION_CALL_ARGUMENT_INVALID`, `PROHIBITED_CALL`,
`PROTECTED_EVIDENCE_MUTATED`.

Helper modules are still **not** required to call the API; they must only be free
of prohibited routes.

## 3. Mutation detection is accurate in both directions

### The defect

Detection covered plain dotted assignment only, and its protected set was a list
of single property names. It therefore missed bracket assignment, compound
assignment, destructuring assignment, `delete`, `Object.assign`, `Reflect.set`
and every mutating array method — and it *falsely rejected* any unrelated object
with a property called `passes` or `candidates`, such as
`const stats = { passes: 0, candidates: [] }; stats.passes = n;`.

### The correction

Detected forms: assignment, bracket/element assignment, compound assignment,
destructuring assignment, `delete`, `Object.assign`, `Reflect.set`, and `push`,
`pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `copyWithin`, `fill`.

Protection is anchored on **adjacent property pairs**, not single names:
`value.detailed`, `value.diagnosticSelection`, `value.candidateRecords`,
`detailed.debug`, `debug.passes`, `debug.primarySelections`,
`debug.finalSelections`, `diagnosticSelection.brandDiagnostics`,
`brandDiagnostics.candidates`. This keeps chains reached through a destructured
`debug` or `diagnosticSelection` while ceasing to claim every same-named property
in the closure. Reading, mapping and hashing the evidence remain permitted.

## 4. The clean-checkout check is real, explicit and post-suite

### The defect

The check inferred its own regime: a nonempty `git status --porcelain` was read
as "an amendment must be in progress", which switched it into a lenient branch.
Anything that made the tree dirty also disarmed the assertion meant to catch it,
so the strict form could never fail. It also ran inside the suite, where it could
not observe what the suite left behind.

### The correction

`scripts/eval/issue-149-stage-1-working-tree.mjs` takes an **explicit** mode and
never inspects Git status to choose one:

- `--clean` — the governed package must be byte-identical to `HEAD`. Any
  difference halts with `STAGE_1_GOVERNED_PACKAGE_DIRTY`.
- `--local` — differing paths must all be inside the governed directory
  (`STAGE_1_MODIFICATION_OUTSIDE_GOVERNED_PACKAGE`) and untracked files must be
  accounted for by the committed manifest (`STAGE_1_UNACCOUNTED_UNTRACKED_ARTIFACT`).
- `--mode-from-env` — resolves from the **environment** (`CI=true` → `--clean`),
  never from the tree.
- No mode is a halt (`STAGE_1_WORKING_TREE_MODE_NOT_SPECIFIED`); both is a halt
  (`STAGE_1_WORKING_TREE_MODE_AMBIGUOUS`).

The Stage 1 contract-manifest verification runs **first**: a clean Git status
over a package whose recorded digests no longer match is not an intact package.

Clean mode runs **after** the suite, from npm's `posttest` lifecycle
(`"posttest": "node scripts/eval/issue-149-stage-1-working-tree.mjs --mode-from-env"`).
`posttest` runs only when `test` succeeded, which is correct: a failing suite is
already reported and its tree is not evidence.

**This is ordinary repository CI hygiene, not an acquisition workflow.** No
acquisition action is added or enabled.

## 5. The operative command script executes end to end

`commands.sh` previously ended with a block describing a
`finalizeProductionBrandEvidence(debug, opaqueItemId)` API that no longer exists,
and a `grep -c` for that removed symbol. `grep -c` exits 1 on no match, so under
`set -euo pipefail` the canonical Stage 1 command script terminated on its
second-to-last command, after printing a false description of the API.

The block is replaced with counts that describe the real API
(`acquireProductionBrandEvidence(extractionInput)` and the pre-await snapshot),
each captured in a command substitution guarded with `|| true` so a zero count
prints as `0` rather than killing the script. The working-tree verification is
added after the manifest verification. The whole script now runs to completion.

`acquisition-invocation-contract.json`'s `requiredInvocationSteps` no longer ends
with "call extractLabelEvidenceDetailed directly" — which contradicted the
closure gate that prohibits exactly that call outside the adapter — and instead
ends with awaiting `acquireProductionBrandEvidence(extractionInput)` once, in the
runner entrypoint.

---

## Standing constraints, unchanged

No new branch or PR. No acquisition runner, acquisition workflow or
workflow-mode file. No runtime bundle or truth-free preparation artifact. No
Stage 2 Job A, discovery or execute mode. No governed 115-case acquisition OCR.
No merge. PR #195 untouched. Production runtime behaviour unchanged. Acquisition
never receives historical case IDs, Brand-bearing filenames, historical fixture
paths, governed Brand truth, acceptable Brand values, prior per-case
classifications, PR #217/#218 records, or the post-freeze ID map.

Stop for review.
