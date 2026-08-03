# Issue #149 Stage 2 OCR Runtime Closure Amendment

This amendment is limited to closing the isolated OCR runtime packaging failure
observed in governed execute attempt 2.

Governed execute attempt 2 ran from transition commit
`92574bcf7e105b63dfc7036a5b625c3f4b87da97` in workflow `30753920592`,
`run_attempt` 1. The preservation system succeeded: forensic output, raw
runtime-failure evidence, Actor 2 verification, Job C truth-isolation scanning,
receipt verification and archive adjudication all completed. The acquisition
itself did not produce a scientific result.

The correct classification is `RUNTIME_FAILURE`. The primary and repeat runs
each produced 115 `extraction-failed` items and zero extracted items. The first
observed failure was `OCR_UNAVAILABLE / "__dirname is not defined"`; the
remaining 229 item attempts reported `OCR_UNAVAILABLE / missing
eng.traineddata`. Differences between runtime-failure detail strings are not
Brand nondeterminism and must not be classified as
`COMPLETE_WITH_NONDETERMINISM`.

The repair may only preserve installed Tesseract runtime module semantics inside
the isolated acquisition bundle and add a no-recognition runtime initialization
probe. It must not alter the frozen 115-image population, truth-free input
manifest, Brand candidate/grouping/filtering/ranking/authority rules, production
OCR defaults, execute authorization, or any governed OCR result.

Workflow `30753920592` is not eligible for rerun. Any future governed execute
requires a separately reviewed implementation SHA and a fresh exact-SHA
authorization transition.
