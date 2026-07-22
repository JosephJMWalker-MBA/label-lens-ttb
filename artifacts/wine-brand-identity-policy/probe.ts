/**
 * READ-ONLY corpus reader for the wine brand-identity policy round.
 *
 * This round is analysis, not extraction: the substantive work is the regulatory
 * reading (source-memo.md) and the per-element two-axis assessment
 * (assessments.json). This probe only joins the committed manifest and the
 * committed extractor report to the assessments to emit cases.json. It runs no
 * OCR and changes nothing. The executable form is build-cases.mjs; this file
 * documents the method and the data provenance.
 *
 *   manifest  src/fixtures/eval/eval-manifest.json          (fixture truth)
 *   report    docs/extraction-full-corpus/extractor-report.json (current select/state)
 *   assess    artifacts/wine-brand-identity-policy/assessments.json (curated roles)
 *
 * See build-cases.mjs for the join, and limitations.md for the report-currency caveat.
 */
export {};
