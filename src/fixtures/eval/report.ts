import { aggregate, brandInTopK, type FieldCaseScore, type ObservedField } from "./metrics";
import type {
  EvalFailureClass,
  IncludedEvalRecord,
  LoadedEvalManifest,
} from "./eval-manifest.types";
import type {
  CaseReport,
  EvalAlcoholSliceMetrics,
  EvalFailureDistributionBucket,
  EvalReport,
} from "./eval-report.types";
import { EVAL_ADAPTER } from "./eval-harness";

/**
 * Build the aggregate report from per-case results and render a human-readable
 * markdown summary. Pure and deterministic given the manifest + case reports.
 */

function brandObservedOf(c: CaseReport): ObservedField {
  return {
    state: c.brand.state,
    value: c.brand.value,
    confidence: c.brand.confidence,
    alternates: c.brand.alternates,
  };
}

function scoreOf(c: CaseReport): FieldCaseScore {
  return {
    caseId: c.caseId,
    brandClass: c.brand.failureClass,
    alcoholClass: c.alcohol.failureClass,
    brandPresent: c.brand.present,
    brandKnownAmbiguous: c.brand.knownAmbiguous,
    alcoholPresent: c.alcohol.present,
    brandDetected: c.brand.state !== "NOT_OBSERVED" && c.brand.value !== null,
    brandExact: c.brand.exactMatch,
    brandNormalized: c.brand.normalizedMatch,
    brandTop3: c.brand.top3Recall,
    brandTop5: brandInTopK(brandObservedOf(c), c.brand.acceptable, 5),
    alcoholDetected: c.alcohol.detected,
    alcoholParsedAccurate: c.alcohol.parsedAccurate,
    latencyMs: c.latencyMs,
  };
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function includedRecords(manifest: LoadedEvalManifest): IncludedEvalRecord[] {
  return manifest.records.filter(
    (record): record is IncludedEvalRecord => record.status === "included",
  );
}

function buildAlcoholSlice(
  key: string,
  label: string,
  records: IncludedEvalRecord[],
  scoreByCaseId: Map<string, FieldCaseScore>,
  predicate: (record: IncludedEvalRecord) => boolean,
): EvalAlcoholSliceMetrics {
  const matchedRecords = records.filter(
    (record) => record.annotation.alcohol.presence === "present" && predicate(record),
  );
  const matchedScores = matchedRecords.map((record) => {
    const score = scoreByCaseId.get(record.caseId);
    if (!score) {
      throw new Error(`missing score for included record ${record.caseId}`);
    }
    return score;
  });
  const detectedCount = matchedScores.filter((score) => score.alcoholDetected).length;
  const parsedAccurateCount = matchedScores.filter((score) => score.alcoholParsedAccurate).length;
  return {
    key,
    label,
    presentCaseCount: matchedScores.length,
    detectedCount,
    parsedAccurateCount,
    detectionRecall: rate(detectedCount, matchedScores.length),
    parsedAccuracy: rate(parsedAccurateCount, matchedScores.length),
  };
}

function buildAlcoholSlices(
  records: IncludedEvalRecord[],
  scoreByCaseId: Map<string, FieldCaseScore>,
): EvalAlcoholSliceMetrics[] {
  return [
    buildAlcoholSlice("bottom", "Bottom-located alcohol statement", records, scoreByCaseId, (r) =>
      r.inspection.visualStrata.includes("alcohol-at-bottom"),
    ),
    buildAlcoholSlice(
      "side-or-rotated",
      "Side/rotated alcohol layout",
      records,
      scoreByCaseId,
      (r) => r.inspection.visualStrata.includes("alcohol-at-side-or-rotated"),
    ),
    buildAlcoholSlice(
      "rotated-or-vertical",
      "Truth marked rotated or vertical",
      records,
      scoreByCaseId,
      (r) =>
        r.annotation.alcohol.presence === "present" &&
        r.annotation.alcohol.characteristics.includes("rotated-or-vertical"),
    ),
    buildAlcoholSlice(
      "vertical-strip",
      "Vertical mandatory strip layout",
      records,
      scoreByCaseId,
      (r) => r.inspection.visualStrata.includes("vertical-mandatory-strip"),
    ),
    buildAlcoholSlice(
      "split-token",
      "Split-token alcohol wording",
      records,
      scoreByCaseId,
      (r) =>
        r.annotation.alcohol.presence === "present" &&
        r.annotation.alcohol.characteristics.includes("split-token"),
    ),
    buildAlcoholSlice(
      "no-percent-sign",
      "Percent-less wording",
      records,
      scoreByCaseId,
      (r) =>
        r.annotation.alcohol.presence === "present" &&
        r.annotation.alcohol.characteristics.includes("no-percent-sign"),
    ),
    buildAlcoholSlice(
      "decimal-value",
      "Decimal-value alcohol wording",
      records,
      scoreByCaseId,
      (r) =>
        r.annotation.alcohol.presence === "present" &&
        r.annotation.alcohol.characteristics.includes("decimal-value"),
    ),
  ];
}

function failureBuckets(): EvalFailureDistributionBucket[] {
  return [
    { key: "ocr-recognition", label: "OCR recognition", count: 0 },
    { key: "region-coverage", label: "Region coverage", count: 0 },
    { key: "orientation", label: "Orientation", count: 0 },
    { key: "line-reconstruction", label: "Line reconstruction", count: 0 },
    { key: "candidate-generation", label: "Candidate generation", count: 0 },
    { key: "candidate-filtering", label: "Candidate filtering", count: 0 },
    { key: "candidate-ranking", label: "Candidate ranking", count: 0 },
    { key: "parser", label: "Parser", count: 0 },
    { key: "unnecessary-ambiguity", label: "Unnecessary ambiguity", count: 0 },
    { key: "false-certainty", label: "False certainty", count: 0 },
    { key: "correct-uncertainty", label: "Correct uncertainty", count: 0 },
    { key: "correct-result", label: "Correct result", count: 0 },
  ];
}

function bucketKeyForBrand(score: FieldCaseScore): EvalFailureDistributionBucket["key"] {
  switch (score.brandClass) {
    case "correct":
      return "correct-result";
    case "correct-uncertainty":
      return score.brandKnownAmbiguous ? "correct-uncertainty" : "unnecessary-ambiguity";
    case "ocr-recognition-failure":
      return "ocr-recognition";
    case "region-coverage-failure":
      return "region-coverage";
    case "line-reconstruction-failure":
      return "line-reconstruction";
    case "candidate-generation-failure":
      return "candidate-generation";
    case "candidate-filtering-failure":
      return "candidate-filtering";
    case "candidate-ranking-failure":
      return "candidate-ranking";
    case "parser-failure":
      return "parser";
    case "false-certainty":
      return "false-certainty";
  }
}

function bucketKeyForAlcohol(score: FieldCaseScore): EvalFailureDistributionBucket["key"] {
  switch (score.alcoholClass) {
    case "correct":
      return "correct-result";
    case "ocr-recognition-failure":
      return "ocr-recognition";
    case "region-coverage-failure":
      return "region-coverage";
    case "line-reconstruction-failure":
      return "line-reconstruction";
    case "candidate-generation-failure":
      return "candidate-generation";
    case "candidate-filtering-failure":
      return "candidate-filtering";
    case "candidate-ranking-failure":
      return "candidate-ranking";
    case "parser-failure":
      return "parser";
    case "false-certainty":
      return "false-certainty";
    case "correct-uncertainty":
      return "correct-uncertainty";
  }
}

function buildFailureDistribution(scores: FieldCaseScore[]): EvalFailureDistributionBucket[] {
  const buckets = failureBuckets();
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const score of scores) {
    byKey.get(bucketKeyForBrand(score))!.count += 1;
    byKey.get(bucketKeyForAlcohol(score))!.count += 1;
  }
  return buckets;
}

export function buildReport(cases: CaseReport[], manifest: LoadedEvalManifest): EvalReport {
  const scores = cases.map(scoreOf);
  const scoreByCaseId = new Map(scores.map((score) => [score.caseId, score]));
  const records = includedRecords(manifest);
  return {
    schemaVersion: "extraction-baseline-report.v2",
    manifestSchemaVersion: manifest.schemaVersion,
    extractorAdapter: { id: EVAL_ADAPTER.id, version: EVAL_ADAPTER.version },
    aggregate: aggregate(scores),
    breakdowns: {
      alcoholSlices: buildAlcoholSlices(records, scoreByCaseId),
      failureDistribution: buildFailureDistribution(scores),
    },
    cases,
  };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

/** Non-zero failure-class counts, most frequent first, as a compact string. */
function classSummary(counts: Record<EvalFailureClass, number>): string {
  const entries = (Object.entries(counts) as [EvalFailureClass, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries.length === 0 ? "—" : entries.map(([k, n]) => `${k}: ${n}`).join(", ");
}

function removedCandidateSummary(c: CaseReport): string {
  const removed = c.diagnostics.brandLineDecisions
    .filter((line) => !line.kept && line.cleanedValue)
    .slice(0, 4)
    .map((line) => `"${line.cleanedValue}" [${line.reason}]`);
  return removed.length === 0 ? "—" : removed.join(", ");
}

export function renderMarkdown(report: EvalReport): string {
  const a = report.aggregate;
  const lines: string[] = [];
  lines.push("# Full-Corpus Extraction Evaluation (Issue #57)");
  lines.push("");
  lines.push(
    "Measured with the evaluation harness against the current production extractor " +
      `\`${report.extractorAdapter.id}@${report.extractorAdapter.version}\`. ` +
      "This report is generated (`npm run eval:baseline`) and committed as a point-in-time full-corpus evaluation. " +
      "Latencies are environment-dependent; all other figures are deterministic given fixed OCR output.",
  );
  lines.push("");
  lines.push(
    "This report is not evidence that the current extractor is production-ready. " +
      "In particular, the absent-brand false-positive rate and the determinate-brand miss/defer rates remain gating defects.",
  );
  lines.push("");
  lines.push("## Brand metrics");
  lines.push("");
  lines.push("| Metric | Value | Denominator |");
  lines.push("| --- | --- | --- |");
  lines.push(
    `| Brand exact match | ${pct(a.brandExactMatchRate)} | ${a.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Brand normalized-acceptable match | ${pct(a.brandNormalizedAcceptableRate)} | ${a.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Brand top-3 recall | ${pct(a.brandTop3Recall)} | ${a.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Brand top-5 recall | ${pct(a.brandTop5Recall)} | ${a.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Brand confident-correct rate | ${pct(a.brandConfidentCorrectRate)} | ${a.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Useful-but-deferred rate (acceptable brand surfaced within top-5 but not confidently selected) | ${pct(a.brandUsefulButDeferredRate)} | ${a.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Unnecessary ambiguity rate | ${pct(a.brandUnnecessaryAmbiguityRate)} | ${a.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Determinate false-certainty rate | ${pct(a.brandFalseCertaintyRate)} | ${a.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| False abstention rate | ${pct(a.brandFalseAbstentionRate)} | ${a.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Determinate NOT_OBSERVED rate | ${pct(a.brandNotObservedRate)} | ${a.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Correct abstention rate | ${pct(a.brandCorrectAbstentionRate)} | ${a.absentBrandCount} absent |`,
  );
  lines.push(
    `| Genuine ambiguity honesty | ${pct(a.ambiguityHonestyRate)} | ${a.ambiguousBrandCount} ambiguous |`,
  );
  lines.push(
    `| Absent-brand false-positive rate | ${pct(a.absentBrandFalsePositiveRate)} | ${a.absentBrandCount} absent |`,
  );
  lines.push("");
  lines.push(
    `Ambiguity honesty applies only to the ${a.ambiguousBrandCount} genuinely ambiguous labels; ` +
      "it should not be read as overall success for the determinate-brand task.",
  );
  lines.push("");
  lines.push("## Alcohol metrics");
  lines.push("");
  lines.push("| Metric | Value | Denominator |");
  lines.push("| --- | --- | --- |");
  lines.push(
    `| Alcohol detection recall | ${pct(a.alcoholDetectionRecall)} | ${a.presentAlcoholCount} present |`,
  );
  lines.push(
    `| Alcohol parsed-value accuracy | ${pct(a.alcoholParsedValueAccuracy)} | ${a.presentAlcoholCount} present |`,
  );
  lines.push(
    `| Alcohol parser-failure rate | ${pct(a.alcoholParserFailureRate)} | ${a.presentAlcoholCount} present |`,
  );
  lines.push(
    `| Alcohol overall false-certainty rate | ${pct(a.alcoholFalseCertaintyRate)} | ${a.caseCount} included |`,
  );
  lines.push(
    `| Absent-alcohol false-positive rate | ${pct(a.absentFieldFalsePositiveRate)} | ${a.absentAlcoholCount} absent |`,
  );
  lines.push("");
  lines.push("### Alcohol challenge slices");
  lines.push("");
  lines.push("| Slice | Detection recall | Parsed accuracy | Denominator |");
  lines.push("| --- | --- | --- | --- |");
  for (const slice of report.breakdowns.alcoholSlices) {
    lines.push(
      `| ${slice.label} | ${pct(slice.detectionRecall)} | ${pct(slice.parsedAccuracy)} | ${slice.presentCaseCount} present |`,
    );
  }
  lines.push("");
  lines.push("## Failure distribution");
  lines.push("");
  lines.push("| Bucket | Count |");
  lines.push("| --- | --- |");
  for (const bucket of report.breakdowns.failureDistribution) {
    lines.push(`| ${bucket.label} | ${bucket.count} |`);
  }
  lines.push("");
  lines.push(
    "The current classifier exposes no explicit orientation-only bucket yet; rotated/vertical pressure is surfaced in the challenge slices above rather than as a separate failure-class total.",
  );
  lines.push("");
  lines.push(`**Brand failure classes:** ${classSummary(a.brandFailureCounts)}`);
  lines.push("");
  lines.push(`**Alcohol failure classes:** ${classSummary(a.alcoholFailureCounts)}`);
  lines.push("");
  lines.push(`| Median latency | ${a.medianLatencyMs.toFixed(0)} ms | ${a.caseCount} cases |`);
  lines.push(`| p95 latency | ${a.p95LatencyMs.toFixed(0)} ms | ${a.caseCount} cases |`);
  lines.push("");
  lines.push("## Brand abstentions");
  lines.push("");
  lines.push("| Case | Truth | Abstention reason | Removed candidates |");
  lines.push("| --- | --- | --- | --- |");
  for (const c of report.cases.filter((c) => c.brand.state === "NOT_OBSERVED")) {
    lines.push(
      `| ${c.caseId} | ${c.brand.present ? "present" : "absent"} | ${c.diagnostics.brandAbstentionReason ?? "—"} | ${removedCandidateSummary(c)} |`,
    );
  }
  lines.push("");
  lines.push("## Per-case results");
  lines.push("");
  lines.push(
    "| Case | Strata | Brand state → selected | Brand class | Alcohol state → value | Alcohol class | ms |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const c of report.cases) {
    const brandSel = c.brand.value === null ? "∅" : `"${c.brand.value}"`;
    const alcSel = c.alcohol.value === null ? "∅" : `"${c.alcohol.value}"`;
    lines.push(
      `| ${c.caseId} | ${c.strata.join("; ")} | ${c.brand.state} → ${brandSel} | ${c.brand.failureClass} | ${c.alcohol.state} → ${alcSel} | ${c.alcohol.failureClass} | ${c.latencyMs.toFixed(0)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
