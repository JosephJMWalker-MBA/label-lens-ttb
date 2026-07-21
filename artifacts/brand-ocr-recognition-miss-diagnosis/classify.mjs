/**
 * Aggregation over cases.json. Derives classifications.json, including the
 * narrower "human review needed" set: a case is referred only when a reasonable
 * alternative reading of the PRE-REGISTERED rules would change its category —
 * not merely because the OCR is wrong or a value sits near a bound.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const C = JSON.parse(readFileSync(path.join(OUT, "cases.json"), "utf8"));

/** Would a defensible alternative reading flip the category? */
function humanReview(c) {
  const r = [];
  if (
    c.primaryCategory === "TRUE_NON_RECOGNITION" &&
    c.editDistance === 2 &&
    c.normalizedTruth.length <= 5
  )
    r.push(
      `truth is only ${c.normalizedTruth.length} characters, so a 1-edit bound is proportionally very tight; nearest span is distance 2 (${JSON.stringify(c.bestSpan)}). TRUE_NON_RECOGNITION vs BOUNDED_NEAR_MISS turns on the bound, not on the evidence.`,
    );
  if (c.primaryCategory === "TRUE_NON_RECOGNITION" && c.genericTruthTokensPresent.length > 0)
    r.push(
      `the only truth token found in OCR is generic (${c.genericTruthTokensPresent.join(", ")}), excluded by the pre-registered rule. A reader may judge whether it is distinctive on this label. TRUE_NON_RECOGNITION vs PARTIAL_RECOGNITION.`,
    );
  if (
    c.primaryCategory === "PARTIAL_RECOGNITION" &&
    c.categoryRule.startsWith("A") &&
    c.matchingSubstantiveTruthTokens.length === 1 &&
    c.sharedSubstringCoverage < 0.55 &&
    ["sweet", "dry", "old", "new", "grand", "royal", "fine"].includes(
      c.matchingSubstantiveTruthTokens[0],
    )
  )
    r.push(
      `qualifies on a single token (${JSON.stringify(c.matchingSubstantiveTruthTokens[0])}) that is arguably descriptive rather than distinctive, and is not on the pre-registered generic list. PARTIAL_RECOGNITION vs TRUE_NON_RECOGNITION.`,
    );
  return r;
}

for (const c of C) c.humanReviewReasons = humanReview(c);

const count = (pred) => C.filter(pred).length;
const tally = (fn) =>
  C.reduce((m, c) => {
    const k = fn(c);
    if (k === null || k === undefined) return m;
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {});
const pct = (n) => Number(((100 * n) / C.length).toFixed(1));

const cats = ["BOUNDED_NEAR_MISS", "PARTIAL_RECOGNITION", "TRUE_NON_RECOGNITION"];
const categoryCounts = Object.fromEntries(
  cats.map((k) => [k, count((c) => c.primaryCategory === k)]),
);

const out = {
  gitSha: readFileSync(path.join(OUT, "git-sha.txt"), "utf8").trim(),
  inputCaseCount: C.length,
  categoryCounts,
  categoryPercent: Object.fromEntries(cats.map((k) => [k, pct(categoryCounts[k])])),
  categoryCases: Object.fromEntries(
    cats.map((k) => [k, C.filter((c) => c.primaryCategory === k).map((c) => c.caseId)]),
  ),
  partialRecognitionShapes: tally((c) => c.partialShape),
  partialRecognitionRule: tally((c) =>
    c.primaryCategory === "PARTIAL_RECOGNITION" ? c.categoryRule.slice(0, 1) : null,
  ),
  nearestEditDistanceDistribution: tally((c) =>
    c.editDistance === null ? "none" : c.editDistance,
  ),
  byNormalizedTruthLength: tally((c) => {
    const n = c.normalizedTruth.length;
    return `${n < 8 ? "<8" : n < 12 ? "8-11" : n < 16 ? "12-15" : "16+"}|${c.primaryCategory}`;
  }),
  byTruthTokenCount: tally((c) => `${c.truthTokenCount}tok|${c.primaryCategory}`),
  byOcrConfidence: tally((c) => {
    const m = c.ocrConfidenceOfBestSpan;
    const b = !m ? "no-span" : m.mean >= 80 ? "mean>=80" : m.mean >= 60 ? "60-79" : "<60";
    return `${b}|${c.primaryCategory}`;
  }),
  byLayoutSlice: (() => {
    const s = {};
    for (const c of C)
      for (const st of c.strata) {
        s[st] ??= {};
        s[st][c.primaryCategory] = (s[st][c.primaryCategory] ?? 0) + 1;
      }
    return s;
  })(),
  bySourcePass: tally((c) => c.sourcePassKind),
  byFailureShape: tally((c) => c.failureShape),
  anyDistinctiveTruthTokenPresent: count((c) => c.matchingSubstantiveTruthTokens.length > 0),
  moreThanHalfTheBrandVisible: count((c) => c.sharedSubstringCoverage > 0.5),
  noDistinctiveFragmentAtAll: count(
    (c) => c.longestSharedSubstring.length < 4 && c.matchingSubstantiveTruthTokens.length === 0,
  ),
  truthOnSingleLine: count((c) => c.truthOnSingleLine),
  truthSplitAcrossLines: count((c) => c.truthVisuallySplitAcrossLines),
  noLineCarriesAFourCharFragment: count(
    (c) => !c.truthOnSingleLine && !c.truthVisuallySplitAcrossLines,
  ),
  nearBoundaryFlags: C.filter((c) => c.borderlineReasons.length > 0).map((c) => ({
    caseId: c.caseId,
    category: c.primaryCategory,
    reasons: c.borderlineReasons,
  })),
  humanReviewNeeded: C.filter((c) => c.humanReviewReasons.length > 0).map((c) => ({
    caseId: c.caseId,
    truth: c.truth,
    category: c.primaryCategory,
    reasons: c.humanReviewReasons,
  })),
  perCase: C.map((c) => ({
    caseId: c.caseId,
    truth: c.truth[0],
    category: c.primaryCategory,
    rule: c.categoryRule,
    editDistance: c.editDistance,
    coverage: c.sharedSubstringCoverage,
    confidence: c.humanReviewReasons.length ? "medium" : c.classificationConfidence,
  })),
};

writeFileSync(path.join(OUT, "classifications.json"), JSON.stringify(out, null, 2) + "\n");
writeFileSync(path.join(OUT, "cases.json"), JSON.stringify(C, null, 2) + "\n");

console.log(
  "categories:",
  JSON.stringify(out.categoryCounts),
  "sum =",
  cats.reduce((s, k) => s + categoryCounts[k], 0),
);
console.log(
  "human review needed:",
  out.humanReviewNeeded.length,
  out.humanReviewNeeded.map((h) => h.caseId),
);
