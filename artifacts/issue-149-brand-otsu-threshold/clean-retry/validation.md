# Clean-retry validation

Date: 2026-07-27

## Clean decision evidence

- Encoded isolation: `PASS`, 22/22 primary and repeat pairs
- RGB/RGBA layout: preserved for every pair
- RGBA alpha: byte-identical for every RGBA pair
- Dimensions, depth, color space, density, exposed metadata, and non-image PNG
  chunks: identical for every pair
- Treatment RGB: neutral binary `0` or `255` for every pixel
- Configuration isolation: only `thresholdMethod`
- Control behavior hash, primary and repeat:
  `b3db6f91ea925a60aee0adc043994a5fef1e57df3cb6df03860f038cc16ffb41`
- Clean treatment behavior hash, primary and repeat:
  `f792a17c359dd8dfedc1b2c5754e816807d88e4036ee8f0de9b1b270107a3b47`
- Fresh visual review: 11/11 pairs, 0 unreviewed changed cases, no invalid-run
  review reused
- Decision: `KILL`

The clean treatment produced no improved governed region, checksum family,
normalized top-one result, candidate-list recall, or top-three recall. It
introduced no previously correct regression, reliable-read error, empty-OCR
increase, clean/high-contrast material regression, or latency-ceiling breach.
The result is therefore a valid negative result for this exact treatment.

## Repository checks

| Check | Result |
| --- | --- |
| `npm run format:check` | pass |
| `npm run lint` | pass, no warnings or errors |
| `npm run typecheck` | pass |
| Focused OCR research tests | 50 passed in 4 files |
| `npm test` with local loopback available | 1,793 passed, 3 skipped |
| MySQL production build | pass |
| Package-preparation Playwright E2E | 5 passed |

The first sandboxed `npm test` attempt had 55 local-VLM failures rooted in
`listen EPERM` on `127.0.0.1`; 1,738 tests passed and 3 skipped in that attempt.
The unchanged suite was rerun with local loopback permission and passed
completely. The first sandboxed Playwright attempt likewise could not bind
`0.0.0.0:3000`; the unchanged command passed 5/5 with loopback permission.

## Post-run boundaries

Guarded production hashes still match:

| Path | SHA-256 |
| --- | --- |
| `src/pipeline/extractor/field-selection.ts` | `3e84fa8a043570713991643830c7b95e0f7189a4ed037b737c783353d519106d` |
| `src/pipeline/extractor/regions.ts` | `910d763e20f47d811348b62c77f17d46ddf3a07b5849a337669a07f6b8efc9ab` |
| `src/pipeline/extractor/extractor.ts` | `9b2712e6bb15552e9524bc5e60be4da2b163bdb325206f452ecbaf44ebf5084c` |

`src/pipeline` still has no import/reference edge to the evaluation-only Otsu
module, runner, or channel-preserving adapter.

The post-run read-only GitHub check found PR #195 still open and draft on
`codex/issue-149-enable-brand-grouping`, with unchanged head OID
`79f628c2dd3d915325986a1e6c012fe12fe6ac15` and unchanged reported
`updatedAt` value `2026-07-27T19:28:39Z`. No PR #195 mutation occurred.

No production enablement or merge was performed.
