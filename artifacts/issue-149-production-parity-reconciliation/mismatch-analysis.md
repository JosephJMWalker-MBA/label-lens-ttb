# Complete mismatch analysis

Two controlled captures from production base
`552d30352e76dd412bd75ceb319878ab2d2747bb` produced the same 115 ordered
responses and the same seven mismatches against the Issue #131 fixture.

| Case | First path | Old -> new | Cause |
| --- | --- | --- | --- |
| `approved-wine-013` | `$.fields.alcoholStatement.state` at byte 4645 | `NOT_OBSERVED` -> `OBSERVED`, `13.5% BY VOL.`, 0.955 | PR #151 / `8827ec2ce8b901a38f6b136cbb35f1ac7a76437c` intentionally recognized the explicit ABV marker |
| `patricia-green-cellars` | `$.fields.alcoholStatement.state` at byte 8680 | `NOT_OBSERVED` -> `LOW_CONFIDENCE`, `13.8% ALC./VOL.`, 0.43 | PR #150 / `5edec007cbef17fc86baac2d48ee902cb6c14df9` intentionally split a dotted fused Alcohol prefix |
| `approved-wine-055` | `$.fields.alcoholStatement.state` at byte 15155 | `NOT_OBSERVED` -> `OBSERVED`, `13% ALC./VOL.`, 0.9433333333333334 | PR #150 |
| `approved-wine-077` | `$.fields.alcoholStatement.state` at byte 2590 | `NOT_OBSERVED` -> `OBSERVED`, `13.5% ALC./VOL.`, 0.89 | PR #150 |
| `approved-wine-095` | `$.fields.alcoholStatement.state` at byte 587 | `NOT_OBSERVED` -> `OBSERVED`, `12% ALC./VOL.`, 0.8266666666666665 | PR #150 |
| `approved-wine-096` | `$.fields.alcoholStatement.state` at byte 587 | `NOT_OBSERVED` -> `OBSERVED`, `12% ALC./VOL.`, 0.8733333333333334 | PR #150 |
| `approved-wine-097` | `$.fields.alcoholStatement.state` at byte 587 | `NOT_OBSERVED` -> `LOW_CONFIDENCE`, `12% ALC./VOL.`, 0.4566666666666667 | PR #150 |

`mismatch-inventory.json` contains every expected/actual response hash.
`determinism-run-1.json` and `determinism-run-2.json` additionally preserve the
exact expected and actual byte ranges around each first difference.

## Classification

- Intentional production behavior change: 7
- Serialization or order change: 0
- Nondeterminism: 0
- Stale truth or fixture data: 0
- Environment or configuration drift: 0
- Unknown: 0

All seven first differences are in `alcoholStatement`. Their Brand payloads are
byte-identical before and after. The remaining response growth is the expected
Alcohol field payload and selected Alcohol provenance.

PR #150's committed corpus comparison names exactly six changed cases and
classifies all six recoveries as correct, with no regressions. PR #151's
committed corpus comparison names exactly `approved-wine-013` as its sole,
correct change. PR #194 is an evaluation treatment with no mismatch in this
115-case production fixture. Later extractor-adjacent merges were inspected;
none accounts for an additional response difference.
