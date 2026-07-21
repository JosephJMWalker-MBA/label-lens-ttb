# Annotation approval log

Running record of the reader's per-case verdicts. `../approved-regions.json` is
written only when all 13 cases are approved.

| # | Case | Verdict | Date | Notes |
|---|---|---|---|---|
| 1 | `la-fattoria-rotated` | **APPROVE** as proposed | 2026-07-21 | producer-strip occurrence excluded |
| 2 | `approved-wine-004` | **APPROVE** as proposed | 2026-07-21 | producer-strip occurrence excluded |
| 3 | `approved-wine-005` | **APPROVE** as proposed | 2026-07-21 | region widened before review so `FATTORIA` is not clipped |
| 4 | `approved-wine-023` | **APPROVE** as proposed | 2026-07-21 | bottom edge left tight against the `Cataldo` descender |
| 5 | `approved-wine-027` | **APPROVE** as proposed | 2026-07-21 | lower roundel excluded as a separate device |
| 6 | `approved-wine-031` | **APPROVE** as proposed | 2026-07-21 | — |
| 7 | `approved-wine-035` | **APPROVE** as proposed | 2026-07-21 | producer-strip occurrence excluded |
| 8 | `approved-wine-074` | **BLOCKED — truth conflict** | 2026-07-21 | reader reads `Mike's Farm, Inc.` as a company name; the label carries no other brand-like text, so the implication is `presence: absent`. See `truth-conflict-referrals.md` |
| 9 | `approved-wine-083` | **BLOCKED — truth conflict** | 2026-07-21 | reader reads the brand as `Christmas Hayride`, which the fixture records as a **forbidden** presentation; see `truth-conflict-referrals.md` |
| 10 | `approved-wine-085` | **APPROVE** as proposed | 2026-07-21 | — |
| 11 | `approved-wine-091` | **CHANGE applied** | 2026-07-21 | reader: box cut through `a` and `S`. Measured extent x 26-105, y 11-147; region now 20, 6, 92, 150. Awaiting confirmation |
| 12 | `wine-multi-artifact-04` | **APPROVE** as proposed | 2026-07-21 | both occurrences (A front, B back) approved |
| 13 | `wine-multi-artifact-07` | **BLOCKED — truth conflict** | 2026-07-21 | reader reads the brand as `Scuppernong White`; see `truth-conflict-referrals.md` |

## Standing decisions carried by the cases 1–7 approval

- **Producer-statement occurrences are excluded.** Where the brand name also
  appears inside a rotated mandatory strip (`LA FATTORIA / PRODUCED AND BOTTLED
  BY …`, `MIS EN BOUTEILLE AU DOMAINE HUBERT LAMY`), that text is producer
  wording and is not annotated as a brand occurrence. **Consequence for Phase 2:
  edge-strip passes that read those strips will not count as covering the brand
  region.**
- **Repeated brand devices are excluded** when they are a separate graphic device
  rather than the wordmark (the `The Golden Girls / FABULOUS 40` roundel).
- **Multi-panel artifacts are the exception**: each distinct *panel* occurrence of
  the wordmark is annotated separately (cases 12 and 13).
