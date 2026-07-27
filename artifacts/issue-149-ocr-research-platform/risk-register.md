# Risk register

| Risk | Evidence | Impact | Mitigation / gate | Status |
| --- | --- | --- | --- | --- |
| False certainty from malformed OCR | OCR can return confident wrong fragments; PR #195 staging had recognition misses | Incorrect support/conflict or warning PASS | Keep authority thresholds fixed; measure false reliable reads and false warning passes; kill on any increase | Controlled; 4× added none |
| Truth leakage | Expected text could bias crop/preprocessing/ranking | Invalid experiment and unsafe production behavior | Executor receives only bytes identity, dimensions, and region; tests inspect the input contract | Controlled |
| Seller/machine evidence conflation | Seller region and full-image discovery answer different questions | Manufactured certainty | Separate manifests, readings, comparison states, and provenance | Controlled |
| Private image publication | Seven staging images are browser-local/private | Privacy/license breach | Default `local-private`, `.local/` gitignore, explicit committable approval, no auto-stage/commit | Controlled |
| Duplicate images inflate sample size | 72 tracked duplicate paths exist | Overstated certainty | Inventory checksum groups; experiment manifest deduplicates image checksums | Controlled |
| Related label variants reduce independence | Three La Fattoria fixtures share artwork; Dry Cellar has two occurrences | Confidence intervals look stronger than independence warrants | Report fixture and region counts separately; interpret Wilson intervals descriptively | Open limitation |
| Approved-region hindsight | Regions were approved after failures were known | Optimistic localization | Keep provenance visible; recover seller-selected staging regions for confirmatory corpus | Open |
| Scale changes line grouping | Fixed 20 processed-pixel tolerance | Causal mechanism is not pure resolution | Record raw words/boxes; describe coupling; do not adopt without a gain | Confirmed |
| Treatment latency | Tesseract pixels increase quadratically with scale | Slow package review and memory pressure | Record median/p95/RSS; kill no-gain treatments | 4× killed |
| Worker lifecycle overhead | Worker starts/terminates per panel, panels are sequential | Multi-panel latency | Measure separately before proposing pooling; retain bounded cleanup | Deferred |
| Warning search inadequacy | Warning has no planner/recovery trigger | False FAIL / missed evidence | Add governed warning regions and search-adequacy state before behavior change | High, open |
| Warning absence truth missing | Zero exact warning fixtures and no governed whole-label negatives | Cannot measure specificity or false PASS | Import at least one absence negative and five present exact cases | Blocking warning work |
| EXIF orientation mismatch | No canonical auto-orient step before crop mapping | Wrong crops/geometry | Add EXIF fixtures 1–8 before normalization change | Open |
| Artifact nondeterminism | Latency/RSS vary between runs | Noisy diffs | Behavioral hash excludes runtime telemetry; no-op requires zero behavior delta | Controlled |
| Factorial drift | Multiple preprocessing changes can be accidentally bundled | Unattributable result | Schema compares every top-level config field and rejects undeclared differences | Controlled |
| Synthetic-only gains | Earlier PSM/grouping work used synthetic cases | Weak real-label justification | Non-no-op gate requires governed real-label fixtures and fixed truth | Controlled |
| PR #195 promotes malformed grouping | Coherent line merge can assemble wrong OCR fragments | Wrong but coherent Brand candidate | Authority unchanged, but hold until governed malformed/recognized real-label coverage exists | Open |
| Production import creep | Evaluation code could become a runtime dependency | Bundle/runtime and behavior change | Test production files for no research import edge | Controlled |
| Inventory license overclaim | Existing committed corpus has author-attested usage, not a uniform explicit license | Misleading redistribution statement | Record status and `unknown-existing-repository-fixture`; make no new license claim | Controlled |
