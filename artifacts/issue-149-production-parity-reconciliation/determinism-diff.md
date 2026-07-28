# Determinism proof

The two governed captures are byte-for-byte identical files.

- Production base:
  `552d30352e76dd412bd75ceb319878ab2d2747bb`
- Instrumentation commit:
  `21c5a6db365549078946b84f500e5e14738dbde4`
- Environment: Node `v22.17.0`, macOS arm64
- Case count: 115 in both
- Case-order SHA-256:
  `1548ca1313e28fd946bb3dc13f9500d8f579be0484a2d541d8abeb60c9035ba3`
- Ordered response-set SHA-256:
  `c956dcae53f67113028b528cce5e6cec891160a0bbd0c72ca7d079ef1c108d2d`
- Mismatch set: the same seven cases, hashes, paths, values, byte offsets, and
  byte ranges
- File comparison: `cmp -s determinism-run-1.json determinism-run-2.json`
  returned success
- Full captured fixture comparison: `cmp -s actual-run-1.json
  actual-run-2.json` returned success

Every response has the repository's fixed `processedAt` value
`2026-07-12T00:00:00Z`. The parity provenance schema admits no generated,
request, worker, or random identifier. Input images and Tesseract model data
are local and committed/bundled; neither capture used network or cloud OCR.
Existing boundary tests prove seller truth is not imported or accepted by the
production extractor.

No nondeterministic or environment-only difference was observed.
