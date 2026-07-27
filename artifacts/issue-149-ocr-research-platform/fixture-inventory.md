# Repository image and fixture inventory

This inventory is generated from every Git-tracked raster image. Generated OCR crops and review screenshots remain listed, but only independent governed source-label images can be experiment inputs.

## Summary

- Images: 361
- Unique checksums: 289
- Duplicate image paths: 72
- Governed source-label images: 132
- Bounded Brand evaluable: 10
- Full-image Brand evaluable: 105
- Warning-presence evaluable: 2
- Warning exact-text evaluable: 0
- Alcohol evaluable: 103

## Bounded Brand experiment corpus

| Path | SHA-256 | Dimensions | Fixed truth |
| --- | --- | --- | --- |
| tests/fixtures/precheck/approved-wine-003/label.png | 78a45dc3df09a29615ebb19687803d4c0b9e50c0ffdcea833d6cc332bd3ee4e8 | 1350×1650 | Brand + governed region |
| tests/fixtures/precheck/approved-wine-004/label.png | 02c272bc23e836befc6024a0c7fa1e3b448dc7d31b2e691cdff1f37457377aa5 | 1350×1650 | Brand + governed region |
| tests/fixtures/precheck/approved-wine-005/label.png | 4098ba3ddd706354a51ac55015aac04cd1a67a12aaa1947cfef59a523fd13ef9 | 1500×1140 | Brand + governed region |
| tests/fixtures/precheck/approved-wine-023/label.png | ab9f888e0673afed9e08d6db30f6d5623c0c30a9bb69fc55e028ac82381fd010 | 988×1253 | Brand + governed region |
| tests/fixtures/precheck/approved-wine-027/label.jpeg | 76910b129a3b4e0d50892da3f9643ab699510ded8c0f61656afd2a0505a156fe | 976×1126 | Brand + governed region |
| tests/fixtures/precheck/approved-wine-031/label.jpeg | 512afcf475b691396481d289dbcb461f6880cb81c03ec02e8db4a54faea6a4b2 | 646×1171 | Brand + governed region |
| tests/fixtures/precheck/approved-wine-035/label.png | bf0d8e4ea936e1ddc67ce265345fde413cc29080f2a0b3ba42538912e30dd035 | 557×471 | Brand + governed region |
| tests/fixtures/precheck/approved-wine-085/label.jpeg | e9c6de2e35a6f75bf1de128f8c1d2c2f0a824d52628e32fa6e003efb1bb758b6 | 414×464 | Brand + governed region |
| tests/fixtures/precheck/approved-wine-091/label.jpeg | d3518e47880e39d38cf47d4692ad3a10d194a5b56e67690ab53c0b1d2306ab73 | 303×598 | Brand + governed region |
| tests/fixtures/precheck/wine-multi-artifact-04/label.png | 445d39b8f73d04cd05bb35e03f9678f6ba9e81f6a6f01d5469306ec43c9c5887 | 674×1522 | Brand + governed region |

The machine-readable `fixture-inventory.json` contains every path, checksum, dimension, MIME type, truth/region availability, provenance references, redistribution status, duplicates, and field-specific suitability.
