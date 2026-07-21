# Limitations

- **One corpus, one engine.** All figures come from the single governed 115-case
  corpus with tesseract.js OEM 1 and the vendored `eng` model. Nothing here
  generalises to other label populations or another OCR engine.
- **Stage attribution uses the harness's own diagnostic booleans.**
  `brandOcrContainsAcceptable` / `brandLineContainsAcceptable` /
  `brandCandidateContainsAcceptable` use *normalized substring* containment. A
  brand whose OCR is garbled beyond normalization (e.g. `Prins` for `Prinsi`)
  counts as **not** in OCR, so `OCR_RECOGNITION_MISS` (24) includes both true
  non-recognition and near-miss recognition. The split between those two was not
  measured.
- **"First stage of loss" is an ordering I imposed**, not something the pipeline
  reports. Where several mechanisms contribute, `truthFilterReasons` in
  `cases.json` preserves all of them, but the headline class names only the
  earliest.
- **Filter-reason attribution is per-span, not per-decision.** A case is credited
  with a reason if *any* rejected span containing the truth carries it. Several
  cases list two or three; the counts in `metrics.md` therefore sum to more than
  43.
- **Ranked-candidate detail is truncated** to the top 6 per case in `cases.json`
  to keep the artifact small. Gate attribution and all aggregate counts were
  computed inside the probe from the *full* candidate list, not the truncation.
- **`truthRank` is computed over `[value, ...alternates]`**, which is the
  production reported ordering. A candidate that was kept and ranked but excluded
  from alternates by the `corroborates` filter is invisible to it — this is the
  single `RANKING_MISS` case.
- **I am not a second reader.** `possible-truth-audit.md` was written with full
  knowledge of both truth and machine output, so it is anchored. It refers cases;
  it does not adjudicate them.
- **No latency measurement.** This round measured evidence survival only. Any
  experiment that adds passes or spans must measure latency before it is judged.
- **Absent-brand denominator is small** (10 cases). "0 false positives" is a real
  result on this corpus but a weak bound on the true rate.
