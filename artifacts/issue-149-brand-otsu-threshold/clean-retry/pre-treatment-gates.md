# Clean-retry pre-treatment proof gates

Status: `PASS` before the governed clean-retry command.

## Frozen records

- Preregistration SHA-256:
  `c0eea099186691c082605b82f30435104ae0d737707b32ced52421a20d232d7d`
- Manifest SHA-256:
  `b6b5be1b4b97bf4bdd2c753675326e061fb38e3e523741f3a03f5eb015d2aac9`
- Base/HEAD before treatment:
  `f269a3c78b1053638e2bdae36c3f9f6b29423590`
- Control behavior hash:
  `b3db6f91ea925a60aee0adc043994a5fef1e57df3cb6df03860f038cc16ffb41`

## Deterministic tests

Commands:

```text
npm run typecheck
npx vitest run src/fixtures/ocr-research/experiment.test.ts src/fixtures/ocr-research/brand-otsu-threshold.test.ts
```

Results:

- TypeScript: pass
- Test files: 2 passed
- Tests: 26 passed

The tests prove RGB remains RGB, RGBA remains RGBA, varied alpha bytes are
identical, dimensions and exposed metadata remain fixed, treatment RGB is
strict neutral binary, selector output and encoded PNG output are
deterministic, empty/uniform inputs fail closed, configuration isolation is
exactly `thresholdMethod`, Sharp threshold/channel conversion is absent from
the Otsu branch, disallowed preprocessing is off, seller truth stays outside
OCR execution, production hashes stay fixed, and a synthetic RGBA fixture
fails if alpha is stripped.

## Production and PR #195 boundaries

Guarded SHA-256 values:

| Path | SHA-256 |
| --- | --- |
| `src/pipeline/extractor/field-selection.ts` | `3e84fa8a043570713991643830c7b95e0f7189a4ed037b737c783353d519106d` |
| `src/pipeline/extractor/regions.ts` | `910d763e20f47d811348b62c77f17d46ddf3a07b5849a337669a07f6b8efc9ab` |
| `src/pipeline/extractor/extractor.ts` | `9b2712e6bb15552e9524bc5e60be4da2b163bdb325206f452ecbaf44ebf5084c` |

`src/pipeline` has no import/reference edge to the Otsu evaluation module,
Brand Otsu runner, or channel-preserving adapter.

Read-only GitHub check before treatment:

- PR: #195, `Enable Issue #149 Brand grouping`
- URL:
  `https://github.com/JosephJMWalker-MBA/label-lens-ttb/pull/195`
- State: open draft targeting `main`
- Head branch: `codex/issue-149-enable-brand-grouping`
- Head OID:
  `79f628c2dd3d915325986a1e6c012fe12fe6ac15`
- Reported `updatedAt`: `2026-07-27T19:28:39Z`

No PR #195 mutation was performed.

