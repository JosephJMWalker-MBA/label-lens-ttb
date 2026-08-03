# Preregistration — Amendment 13

**Sealed output ownership, real symbol resolution, and load-bearing Stage 1
checks.**

Base: `546c3f279ce431a1fd8c0203df7a83553ea866ef` (merge commit of PR #220).
Amends: `preregistration.md`, as amended through Amendment 12.
Prior head: `c8154b016a80ab9a9463e71914db9bce68cb382a`.

Stage 2 Job A, discovery, execute mode and governed 115-case acquisition OCR
remain **not started**. No acquisition runner, acquisition workflow,
workflow-mode file, runtime bundle or truth-free preparation artifact exists.
Production runtime behaviour is unchanged.

Amendments 1–12 and `branch-pointer-incident.md` are preserved unchanged and are
explicitly historical. This record supersedes their operative language only.

---

## 1. The input snapshot's guarantees are now exact

Amendment 12 removed the caller's ordinary mutable references. That correction
is retained. Three of its stated guarantees were stronger than its code.

**`Object.keys` is not an exact own-key proof.** It returns only ENUMERABLE
STRING keys, so a non-enumerable own property and a symbol-keyed own property
both passed the "closed key set" check while sitting on the object. Validation
now uses `Reflect.ownKeys`: every own key must be a string, every symbol is
rejected, and every unexpected key — enumerable or not — is rejected. The exact
nine-key input set and four-key `ocrEngine` set are actually checked.

**A `Proxy` passed `isPlainObject`.** A Proxy over a plain target has
`Object.prototype`, presents ordinary data descriptors, and can still return a
different value from a `get` trap on each read. Descriptor inspection cannot see
that. Node's authoritative `util.types.isProxy` now rejects a Proxy input and a
Proxy `ocrEngine`.

**Values are captured once.** All allowed own-property descriptors are read in
one pass; each must be a data descriptor; `descriptor.value` is read exactly
once; the snapshot is built entirely from those captured values, and the caller's
object is never read again.

`imageBytes` is still copied into a new `Uint8Array`.

### The immutability claim is corrected, not restated

- the top-level snapshot **is** frozen;
- `ocrEngine` **is** frozen;
- `imageBytes` is a **private copied `Uint8Array` with no caller-held alias**.

It is **not** frozen. A nonempty typed array cannot be frozen in current
JavaScript runtimes — its indexed elements are non-configurable and cannot be
made non-writable, so `Object.freeze` throws. Isolation, not immutability, is
what protects those bytes, and isolation is sufficient because nothing outside
the module holds a reference to the copy. Amendment 12's "closed and deeply
frozen" wording is withdrawn: the closure was real, the deep freezing was not.

## 2. The output-side evidence boundary is sealed

Owning the extractor call closed the INPUT side. The output side stayed open. The
boundary returned the extractor's own `DetailedExtractionResult`, the live
`FieldSelection` and a mutable candidate array, and left serialization to the
runner. Two things followed that no source rule could catch:

```ts
const passes = evidence.value.detailed.debug.passes;  // a bare identifier now
passes.splice(0, 1);                                   // provenance lost

const head = evidence.value.detailed.debug.passes.slice(0, 1);  // NO mutation
persistPasses(head);                                            // truncated
```

The second requires no mutation at all. A projection — `slice`, `filter`, `map`,
`concat`, a spread into a new array — produces incomplete evidence while leaving
every original object untouched, and source text cannot establish data lineage
through it.

That is the same ownership defect, one step further out:

```
candidate array → FieldSelection → ExtractionDebug → ExtractionInput → returned evidence
```

So the alternative is deleted. `acquireProductionBrandEvidence` now serializes
and seals internally, and returns a frozen `SealedItemEvidence`:

```ts
{ itemId, outcome, files: readonly SealedEvidenceFile[], fileCount, totalBytes, aggregateSha256, failure? }
```

Each `SealedEvidenceFile` carries the governed run-relative `path`, the exact
`byteLength`, the `sha256` over exactly those bytes, and a `bytes` reader that
returns a **fresh copy on every read** — the sealed buffer is module-private and
is never handed out.

Success seals six files: `.passes.json`, `.words.jsonl`, `.lines.jsonl`,
`.candidates.jsonl`, `.selection.json`, `.counts.json`. A typed extractor failure
seals exactly one `.failure.json`, with no synthesised debug and no retry.

Every array's order is fixed before serialization; every record passes the frozen
schema validators; the descriptor list and every descriptor are frozen;
`fileCount` equals `files.length`; `aggregateSha256` covers the ordered
`(path, byteLength, sha256)` entries. A dropped or duplicated file fails the
ordered-set check before return.

The public runtime namespace is `CandidateAdapterError`,
`acquireProductionBrandEvidence`, `writeSealedEvidencePackage` and the two frozen
file-suffix lists. The writer takes the **complete** package and a destination,
writes every file, verifies each by reading it back, and has no file-subset
parameter. No mutable `DetailedExtractionResult`, `ExtractionDebug`,
`FieldSelection`, candidate array or pass array is public.

## 3. The closure analyzer actually uses the TypeChecker

Amendment 12's analyzer built a `ts.Program` and then never asked it anything: it
compared callee TEXT against a manually constructed import-name map. Two concrete
bypasses followed.

```ts
import { acquireProductionBrandEvidence as run } from "./lib/issue-149-candidate-adapter";
export const hidden = (input) => run(input);      // neither counted nor rejected

import { acquireProductionBrandEvidence, acquireProductionBrandEvidence as again } from "…";
await acquireProductionBrandEvidence(extractionInput);
await again(extractionInput);                      // reported as ONE call
```

Resolution now runs through `program.getTypeChecker()`,
`checker.getSymbolAtLocation()` and `checker.getAliasedSymbol()`, and the
resolved DECLARATION is compared against the adapter module's exported
declaration. Authorization is never established by a callee name, an import-name
map alone, path suffix matching, `endsWith`, or a caller-selectable adapter path.

Resolved and rejected: aliased acquisition calls outside the runner; a second
acquisition call under another local name; namespace calls; re-exported calls;
prohibited extractor and selector calls through aliases, namespaces or
re-exports; local same-name functions; and shadowing by a **function parameter**,
a **catch binding**, a **block-local declaration** or a **destructured
declaration** — all four of which the previous top-level-only scan missed.

The required call must be in the frozen runner entrypoint, resolve to the exact
adapter export, occur exactly once across the closure, be awaited, and receive
one identifier argument.

**Two separate controls, stated separately.** The source gate proves which
function is called, from where, how often, and that the argument is an
identifier. It does **not** prove that the identifier holds a valid
`ExtractionInput` — that is a runtime property, validated by the public API
itself.

## 4. Mutation and projection claims reconciled with the sealed boundary

Amendment 12 described the adjacent-pair mutation detector as making evidence
objects unchangeable. It did not, and that claim is withdrawn: provenance is lost
on aliasing, and a projection needs no mutation.

- The **runtime sealed package is the primary completeness control**. There is no
  evidence object left to project.
- Source analysis is retained as **defense in depth**, and is described as such.
- The runner may not parse or transform sealed evidence bytes, and may not select
  a subset of sealed descriptors. It performs one complete package write with
  exact readback verification.

The analyzer rejects `files.filter`, `files.slice`, `files.map`, `[...files]`
with `reverse`, a single-file `files[0]` write, and `JSON.parse` of sealed bytes,
with `SEALED_PACKAGE_PROJECTED` and `SEALED_EVIDENCE_PARSED`. Reading `itemId`,
`outcome`, `fileCount`, `totalBytes` and `aggregateSha256`, passing the complete
package to the authorized writer, and logging non-evidence status metadata all
remain permitted — and so do unrelated helpers that project their own arrays.

## 5. `commands.sh` assertions carry the verdict

Amendment 12 replaced a fatal stale `grep` with `echo "…: $(grep -c … || true)"`.
That made the script finish, but it converted three checks into display: the
script exited zero when the required public API count was `0`, when the snapshot
count was `0`, and when the obsolete entrypoint count was nonzero. It printed the
failures rather than enforcing them.

`assert-adapter-surface.sh` now captures each count and **asserts** it, exiting
nonzero with `PUBLIC_API_COUNT_MISMATCH`, `INPUT_SNAPSHOT_COUNT_MISMATCH`,
`SEALED_RETURN_COUNT_MISMATCH`, `SEALED_WRITER_COUNT_MISMATCH`,
`OBSOLETE_PUBLIC_API_PRESENT` or `RAW_EVIDENCE_RESULT_TYPE_PRESENT`.

It is a separate executable so the same assertions can be run against
**temporary modified copies** of the adapter. `issue-149-command-assertions.test.ts`
proves each failure is real: a missing API, a duplicated API, a missing snapshot
call, a removed seal, a resurrected obsolete entrypoint and a resurrected raw
evidence result type all exit 1; the real current adapter exits 0.

## 6. Working-tree local mode asks Git about the repository

`--local` claimed every difference was confined to the governed package while
running `git status --porcelain -- <governed directory>`. An outside modification
could never enter `entries`, so `STAGE_1_MODIFICATION_OUTSIDE_GOVERNED_PACKAGE`
was unreachable from the CLI.

`--local` now takes an **unscoped** repository status and rejects every changed
or untracked path outside the governed package; inside it, untracked files must
be covered by the verified Stage 1 manifest.

`--clean` deliberately keeps the governed-package scope: it is the post-suite
"the tests changed nothing" assertion, not a repository-wide cleanliness claim,
and is no longer described as one. A scratch-repository test demonstrates the
difference directly: the scoped query returns nothing for an outside change while
the unscoped query returns it, and local mode halts on the unscoped result.

---

## Standing constraints, unchanged

No new branch or PR. No Stage 2 runner, acquisition workflow or workflow-mode
file. No runtime bundle or truth-free preparation artifact. No Stage 2 Job A,
discovery or execute mode. No governed 115-case acquisition OCR. No merge. PR
#195 untouched. Production runtime behaviour unchanged. Acquisition never
receives historical case IDs, Brand-bearing filenames, historical fixture paths,
governed Brand truth, acceptable Brand values, prior per-case classifications, PR
#217/#218 records, or the post-freeze ID map.

Stop for review.
