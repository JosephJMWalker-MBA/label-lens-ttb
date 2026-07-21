# Limitations

- **10 of 13, not 13.** Three cases (`approved-wine-074`, `approved-wine-083`,
  `wine-multi-artifact-07`) are blocked by an unresolved fixture-truth question
  and were excluded. The category counts describe 10 cases.
- **Controls have no human annotation.** Their regions come from the machine's own
  selected geometry, so control *recognition* comparisons are partly circular.
  Control categories are therefore not reported at all, and the confidence gap is
  reported but not relied upon (`control-analysis.md`).
- **Regions were proposed by me and approved by a reader who had already seen the
  machine's failures** on these cases. The reader did not see OCR boxes on the
  annotation views, but the population itself was known to be failures. A fully
  blind annotation would be stronger.
- **The segmentation-vs-glyph boundary is a heuristic I defined**, not a
  pre-registered measurement. `ORIENTATION_OR_SEGMENTATION_FAILURE` is assigned
  when the overlapping geometry spans multiple lines, contains words grouped into
  no line, comes from a rotated pass, or splits/fuses relative to the truth token
  count. `approved-wine-035` (one token for a two-word brand) sits closest to the
  boundary and could defensibly be called severe misrecognition instead.
- **Multi-occurrence classification uses the most favourable occurrence.**
  `wine-multi-artifact-04` is classified on its back panel; the front panel's
  fusion is recorded as secondary. A different rule would move that case.
- **`n = 10`, one corpus, one engine.** No distribution here supports a threshold,
  and none should be used to set one.
- **Recovery-pass finding is a snapshot.** Zero recovery passes ran *today*, on
  this code. It follows from alcohol-driven recovery triggers changing in
  #150/#151, and would change again if those triggers change.
- **`fixtureBrand[0]` only.** Token counts and brand-evidence checks use the first
  acceptable presentation.
- **No latency measurement**, and no production behaviour was exercised beyond
  running the passes production already plans.
