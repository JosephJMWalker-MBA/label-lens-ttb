# Slice 3 — Wine Pre-Check Acceptance & Offline Reproducibility

This document records exactly how to reproduce the first completed vertical
slice: a single wine label image processed end-to-end into an explainable,
checksum-protected pre-check result.

```text
real label image bytes
  → server-side integrity validation
  → local-only OCR
  → evidence-only analyzer response
  → independent evidence sufficiency
  → deterministic wine rules
  → immutable result assembly
  → checksum-protected JSON export
  → accessible UI rendering and download
```

The slice is **advisory**. It is not a TTB approval, a legal opinion, or an
official regulatory disposition, and it produces **no overall status,
percentage, or compliance score**.

## Runtime requirements

- **Node.js ≥ 18.18** (developed and verified on Node 22.x).
- **npm ≥ 10** (verified on npm 10.x).
- No GPU, no external service, and no network access are required for the core
  path.

Install exactly the locked dependencies:

```bash
npm ci
```

### Local-only OCR — no runtime download

- The Tesseract English language model is **vendored** in the repository at
  `src/pipeline/extractor/assets/eng.traineddata` and loaded from disk.
- The Tesseract WASM/core runtime is resolved from the locked `tesseract.js`
  dependency installed by `npm ci`.
- The pipeline performs **no runtime model download** and makes **no outbound
  OCR or API call**. `sharp` and `tesseract.js` run server-side only and are
  declared as external server packages so they are required from `node_modules`
  at runtime rather than bundled.
- OCR asset paths (vendored `eng.traineddata` and the Tesseract WASM core) are
  resolved at runtime against the deployment application root, not a build-time
  `import.meta.url`. The build emits a self-contained `standalone` server, and
  the locked build packages the local OCR assets; a relocated production smoke
  (`npm run smoke:relocation`) copies that output outside the checkout and
  verifies asset resolution and real OCR on the tested Node/platform
  environment. Cross-platform determinism and universal serverless
  compatibility are not claimed beyond that tested environment.

## Commands

| Purpose | Command |
|---|---|
| Development server | `npm run dev` |
| Unit / integration tests (Vitest) | `npm test` |
| Playwright acceptance test | `npm run test:e2e` |
| Production build | `npm run build` |
| Relocated production OCR smoke | `npm run smoke:relocation` (after `npm run build`) |

The Vitest suite includes the real-OCR acceptance and determinism proofs; the
Playwright acceptance test drives the real server pipeline through the browser.

## Resource limits (defensive, not regulatory)

The pre-check enforces one canonical resource policy
(`src/server/resource-policy.ts`). These are **defensive application/availability
limits for this prototype — not TTB rules** and not regulatory maximums:

- **Request bytes:** ≤ 20 MB total; a declared `Content-Length` above this is
  rejected **before** the body is parsed.
- **Image-file bytes:** ≤ 15 MB actual file bytes, enforced after buffering.
- **Media types:** PNG or JPEG; the route also requires a `multipart/form-data`
  content-type before parsing.
- **Decoded image:** ≤ 10000 × 10000 and ≤ 40,000,000 pixels, single frame; an
  oversized decoded workload is rejected before preprocessing/OCR so a small
  compressed file cannot expand into a disproportionate pixel budget.
- **Preprocessing/OCR:** a fixed, bounded set of OCR passes and bounded scale
  multipliers; the Tesseract worker is created per request and always terminated
  in a `finally` block on success and on failure.

Honest limitations:

- `Content-Length` rejection occurs **only when the header is present**. Next.js
  `request.formData()` may still buffer a request when the header is absent or
  false, so an upstream proxy/platform request-size limit remains recommended for
  production.
- Protection is **per-request only**: this prototype provides **no distributed
  rate limiting** and no cross-instance concurrency control. A bounded OCR
  timeout and an in-process concurrency semaphore are left as follow-ups.

## Bundled demonstration fixture

The bundled sample is **public approved-label artwork** (TTB Public COLA
Registry, TTB ID 24205001000905) retained solely as an OCR benchmark. It is a
demonstration fixture, not the fixture's truth labels injected as a result — the
sample runs through the same real extractor as any upload.

Expected identity of the OCR-benchmark image
(`tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg`):

- **Dimensions:** 2404 × 979
- **SHA-256:** `0b0ccec13bf6c533ec7928b017b140a0213fb4555812fea81d71872adb453713`

The asset-packaging tests fail clearly if this file, its identity, or the
vendored language data is absent.

## Privacy

In this slice the application processes uploads **ephemerally**: image bytes are
validated and analyzed in memory and are **not persisted**. No image bytes or
declared facts are logged, and error responses are user-safe (no stack traces,
absolute paths, environment values, or OCR internals).

## Deferred / out of scope for this slice

- `src/domain/rules/warning-text.ts` holds the verbatim statutory
  government-warning constant. It is currently **unreferenced** and retained as
  deferred groundwork; government-warning execution is **not** implemented in
  this slice and is intentionally not wired in.
- Also out of scope: PDF export, persistence/auth, batch processing, cloud/
  external OCR fallback, additional extracted fields, additional regulatory
  rules, actual-alcohol-content ingestion, and any overall compliance status or
  score.

## What this slice does not claim

This is a bounded proof-of-concept. It does **not** claim FedRAMP
authorization, production certification, official TTB integration, legal
approval capability, or general OCR accuracy beyond the bounded demonstrated
fixture.
