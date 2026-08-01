# Preregistration — Amendment 14

**Authenticate the sealed package, bind it to input provenance, and reconcile the
operative contracts.**

Base: `546c3f279ce431a1fd8c0203df7a83553ea866ef` (merge commit of PR #220).
Amends: `preregistration.md`, as amended through Amendment 13.
Prior head: `3e08d41edbd7f4d8c36769ffa77226b2842ede9d`.

Stage 2 Job A, discovery, execute mode and governed 115-case acquisition OCR
remain **not started**. No acquisition runner, acquisition workflow,
workflow-mode file, runtime bundle or truth-free preparation artifact exists.
Production runtime behaviour is unchanged.

Amendments 1–13 and `branch-pointer-incident.md` are preserved unchanged and are
explicitly historical.

---

## 1. A package-shaped object is not a package

The internal sealer verified its own ordered file set. The **reachable** boundary
did not. `writeSealedEvidencePackage` accepted any structurally compatible object
and checked only `fileCount === sealed.files.length`, so this was written:

```ts
const { files: original } = sealed;
const subset = [original[0]];
writeSealedEvidencePackage(
  { ...sealed, files: subset, fileCount: 1, totalBytes: subset[0].byteLength },
  { directory },
);
```

Every arithmetic check passes, because the caller rewrote every number to agree.
The writer then persisted the subset and returned the caller's own aggregate as
if it were the sealer's. A forged descriptor could also carry a traversal path,
because the writer joined the supplied path to the destination without checking
containment.

This is the ownership problem again, one step further out: the caller could not
mutate the authentic package, but could **construct a new one**.

### Identity is recorded, not inferred

A module-private `WeakSet<SealedItemEvidence>` holds the packages this module
produced, and a second holds the descriptors `sealFile` produced. A package is
added only after every internal invariant has succeeded. No token, symbol,
constructor, registration function or reference to either set is exported, so
membership cannot be obtained from outside. A package the writer did not find
there is rejected with `SEALED_PACKAGE_UNAUTHENTIC`.

Structural typing cannot distinguish a forgery, `Object.freeze` does not confer
origin, and no source analysis can prove the provenance of a runtime value. None
of them is relied on for authenticity.

### And every invariant is revalidated, before anything is written

`itemId` shape; `outcome` is exactly `extracted` or `extraction-failed`; the
exact outcome-specific ordered suffix set; every path exactly
`` `${itemId}${suffix}` ``; every path a bare governed filename with no slash,
backslash, NUL, absolute path, dot component or traversal; `fileCount` equal to
both `files.length` and the required count; every descriptor sealer-produced and
frozen; every `bytes` read matching its recorded length and digest; `totalBytes`
recomputed; `aggregateSha256` recomputed from the ordered
`(path, byteLength, sha256)` entries; and each resolved target inside the
resolved output directory.

Failure of any of these raises `SEALED_PACKAGE_INVALID` **before the first
write**. A partially written directory is not a lesser failure; it is a directory
that looks like evidence.

## 2. The sealed evidence is bound to the exact bytes and configuration

**Proxy rejection now precedes structural inspection.** `isPlainObject` calls
`Object.getPrototypeOf`, which a Proxy's `getPrototypeOf` trap answers, so the
Proxy test ran *after* a trap could already have fired. `assertNotProxy` is
called on `input` before `isPlainObject(input)`, and on `ocrEngine` before any
prototype or property inspection of it.

**The image bytes are hashed inside the boundary, before OCR.** Validating the
*format* of `derivativeSha256` proved the string looked like a digest, not that
it was the digest of the bytes that would be recognized. The private copy is now
hashed and compared, and a disagreement halts with
`EXTRACTION_INPUT_IMAGE_DIGEST_MISMATCH` **before the extractor is invoked**.

**A provenance record is sealed on both outcomes.** `<itemId>.provenance.json`
carries `opaqueItemId`, `imageByteLength`, the recomputed `imageSha256`,
`derivativeSha256`, `processedAt`, `extractionAdapterId`,
`extractionAdapterVersion`, the complete `ocrEngine` identity, `parserId`,
`parserVersion`, `extractionAttemptCount: 1` and `retried: false`. It is built
from the private snapshot, never from the caller's object.

Success therefore seals **seven** files; failure seals `.provenance.json` plus
`.failure.json`. The failure record remains free of fabricated passes,
candidates, selections or debug — but the failure is now bound to the exact bytes
and frozen configuration that produced it, which the contract had already
promised and the record did not deliver. The aggregate covers the provenance file
like every other sealed file, so identical recognition under a different frozen
configuration is a different package.

## 3. The writer is part of the symbol-resolved closure contract

`writeSealedEvidencePackage` is resolved through the same TypeChecker declaration
identity as the acquisition call. Across the complete Stage 2 closure: exactly
one acquisition call in the runner; exactly one writer call, in the runner; no
alias, namespace member or re-export changes either symbol's identity; and no
`writeFile`, `writeFileSync`, `appendFile`, `createWriteStream` or equivalent
route persists evidence outside the authenticated writer
(`UNAUTHENTICATED_EVIDENCE_WRITE`). An acquired package that is never written is
`RUNNER_DOES_NOT_WRITE_THE_SEALED_PACKAGE`.

A **destructured alias** — `const { files: parts } = sealed;` — renames the
property, so `parts.slice(0, 1)` carried no `files` in its access chain. The
renamed local is now tracked as a sealed-file binding.

The always-true `if (!isAdapter || true)` is removed and the traversal expressed
directly: every file is analysed, and the adapter is exempt from specific rules
rather than from analysis.

**What this does not claim.** Source analysis does not prove arbitrary data
lineage — a renamed value passed through a function boundary is beyond source
text, and a test asserts that such a case is *not* flagged rather than pretending
it is. The primary completeness control is **runtime package authenticity**: a
forged package fails at the writer regardless of whether any source pattern
recognises it. Source analysis is defense in depth.

## 4. Every operative contract now describes the actual API

Three artifacts still carried an Amendment 12 `candidateEmissionApi` block —
`Promise<Result<ProductionBrandEvidenceSuccess, ExtractionError>>` returning
`DetailedExtractionResult`, `FieldSelection` and candidate records, with the
runner persisting from `evidence.value.detailed.debug.passes`. Appending a
corrected section beside a stale operative one is what allowed that: the
consistency sweep passed while the contradiction stood.

The stale blocks are **deleted**, not supplemented.
`acquisition-invocation-contract.json` holds the single canonical
`acquisitionApi` and `sealedPackageWriter` definitions;
`candidate-decision-contract.json` and `candidate-fingerprint-contract.json`
point at it rather than restating it, because a restated copy is exactly what
drifted. `evidence-schema.json`, `raw-ocr-contract.json`,
`region-ocr-result-replay-contract.json`,
`acquisition-runtime-isolation-contract.json`, `workflow-plan.md`,
`purpose-and-boundaries.md`, `limitations.md` and `preregistration.md` are
reconciled.

The consistency sweep now fails on the **phrases** —
`ProductionBrandEvidenceSuccess`, `returnsOnSuccess`,
`evidence.value.candidateRecords`, `typed ExtractionError, unchanged` and the
rest — not on an amendment number.

## 5. The runtime export surface claim is true and executable

The module exported the two suffix arrays in addition to the class, the
acquisition function and the writer, while the contracts claimed two names. The
arrays are **module-private** now: the writer revalidates against them itself,
and exporting them handed a caller the exact path list needed to build a
package-shaped object.

The runtime surface is exactly `CandidateAdapterError`,
`acquireProductionBrandEvidence` and `writeSealedEvidencePackage`. It is asserted
by dynamically importing the real module and comparing the sorted
`Object.keys` of its namespace — not by a source grep. `assert-adapter-surface.sh`
now says explicitly that it checks the adapter's **source** surface and does not
prove the runtime namespace.

## 6. The sealed-package tests distinguish incoherent from unauthentic

The dropped-file test rewrote `files` while leaving `fileCount` alone, so it
proved only that an *incoherent* object fails. There are now two tests: an
incoherent subset, and a **coherent** forged subset where `files`, `fileCount`,
`totalBytes` and `aggregateSha256` are all rewritten together. The second halts
with `SEALED_PACKAGE_UNAUTHENTIC` — on origin, not on a forgotten count. A clone,
a rebuild from all seven genuine descriptors, a duplicated descriptor, a forged
descriptor, a traversal path, an absolute path and a mismatched `itemId` all
fail, and the genuine package still writes and verifies.

The aggregate test recomputes the aggregate and changes exactly one of `path`,
`byteLength` and `sha256` in turn — a different `itemId` changes all three at
once and proves much less.

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
