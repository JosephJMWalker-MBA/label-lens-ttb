import {
  aggregate,
  brandInTopK,
  percentile,
  type FieldCaseScore,
  type ObservedField,
} from "./metrics";
import type {
  EvalCandidateFilteringSubtype,
  EvalFailureClass,
  EvalTextOrientation,
  IncludedEvalRecord,
  LoadedEvalManifest,
} from "./eval-manifest.types";
import type {
  CaseReport,
  EvalAlcoholSliceMetrics,
  EvalCandidateFilteringSubtypeBucket,
  EvalFailureDistributionBucket,
  EvalOrientationSliceMetrics,
  EvalPerformanceBreakdown,
  EvalRecoveryPassContributionBucket,
  EvalReport,
} from "./eval-report.types";
import { EVAL_ADAPTER } from "./eval-harness";

function brandObservedOf(caseReport: CaseReport): ObservedField {
  return {
    state: caseReport.brand.state,
    value: caseReport.brand.value,
    confidence: caseReport.brand.confidence,
    alternates: caseReport.brand.alternates,
  };
}

function scoreOf(caseReport: CaseReport): FieldCaseScore {
  return {
    caseId: caseReport.caseId,
    brandClass: caseReport.brand.failureClass,
    alcoholClass: caseReport.alcohol.failureClass,
    brandPresent: caseReport.brand.present,
    brandKnownAmbiguous: caseReport.brand.knownAmbiguous,
    alcoholPresent: caseReport.alcohol.present,
    brandDetected: caseReport.brand.state !== "NOT_OBSERVED" && caseReport.brand.value !== null,
    brandExact: caseReport.brand.exactMatch,
    brandNormalized: caseReport.brand.normalizedMatch,
    brandTop3: caseReport.brand.top3Recall,
    brandTop5: brandInTopK(brandObservedOf(caseReport), caseReport.brand.acceptable, 5),
    alcoholDetected: caseReport.alcohol.detected,
    alcoholParsedAccurate: caseReport.alcohol.parsedAccurate,
    latencyMs: caseReport.latencyMs,
  };
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function candidateFilteringSubtypeLabel(subtype: EvalCandidateFilteringSubtype): string {
  switch (subtype) {
    case "brand-rejected-no-letters-or-too-short":
      return "Brand rejected: no letters or too short";
    case "brand-rejected-producer-line":
      return "Brand rejected: producer line";
    case "brand-rejected-non-brand-keyword":
      return "Brand rejected: non-brand keyword";
    case "brand-rejected-too-many-words":
      return "Brand rejected: too many words";
    case "brand-rejected-domain-like":
      return "Brand rejected: domain-like text";
    case "brand-rejected-varietal-or-designation":
      return "Brand rejected: varietal or designation";
    case "brand-rejected-generic-product-language":
      return "Brand rejected: generic product language";
    case "brand-rejected-location-or-appellation":
      return "Brand rejected: location or appellation";
    case "brand-rejected-low-information-fragment":
      return "Brand rejected: low-information fragment";
    case "brand-rejected-sentence-fragment":
      return "Brand rejected: sentence fragment";
    case "brand-kept-overextended-candidate":
      return "Brand kept: overextended candidate";
    case "brand-kept-partial-candidate":
      return "Brand kept: partial candidate";
    case "alcohol-rejected-proof-only":
      return "Alcohol rejected: proof-only";
    case "alcohol-rejected-no-supported-number":
      return "Alcohol rejected: no supported number";
    case "alcohol-rejected-missing-volume-marker":
      return "Alcohol rejected: missing volume marker";
    case "alcohol-rejected-missing-explicit-alcohol-marker":
      return "Alcohol rejected: missing explicit alcohol marker";
    case "alcohol-rejected-bare-volume-marker-too-weak":
      return "Alcohol rejected: bare volume marker too weak";
    case "alcohol-rejected-unsupported-pattern":
      return "Alcohol rejected: unsupported pattern";
  }
}

function recoveryPassKindLabel(kind: EvalRecoveryPassContributionBucket["key"]): string {
  switch (kind) {
    case "full-image-primary":
      return "Primary full image";
    case "full-image-rot180":
      return "Full image 180°";
    case "left-edge-strip-rot270":
      return "Left edge strip 270°";
    case "right-edge-strip-rot90":
      return "Right edge strip 90°";
    case "focus-crop":
      return "Focus crop";
    case "focus-edge-strip-rot270":
      return "Focus left edge strip 270°";
    case "focus-edge-strip-rot90":
      return "Focus right edge strip 90°";
  }
}

function includedRecords(manifest: LoadedEvalManifest): IncludedEvalRecord[] {
  return manifest.records.filter(
    (record): record is IncludedEvalRecord => record.status === "included",
  );
}

function scoreFor(
  record: IncludedEvalRecord,
  scoreByCaseId: Map<string, FieldCaseScore>,
): FieldCaseScore {
  const score = scoreByCaseId.get(record.caseId);
  if (!score) throw new Error(`missing score for included record ${record.caseId}`);
  return score;
}

function buildAlcoholSlice(
  key: string,
  label: string,
  records: IncludedEvalRecord[],
  scoreByCaseId: Map<string, FieldCaseScore>,
  predicate: (record: IncludedEvalRecord) => boolean,
): EvalAlcoholSliceMetrics {
  const matchedScores = records
    .filter((record) => record.annotation.alcohol.presence === "present" && predicate(record))
    .map((record) => scoreFor(record, scoreByCaseId));
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
    buildAlcoholSlice(
      "bottom",
      "Bottom-located alcohol statement",
      records,
      scoreByCaseId,
      (record) => record.inspection.visualStrata.includes("alcohol-at-bottom"),
    ),
    buildAlcoholSlice(
      "side-or-rotated",
      "Side/rotated alcohol layout",
      records,
      scoreByCaseId,
      (record) => record.inspection.visualStrata.includes("alcohol-at-side-or-rotated"),
    ),
    buildAlcoholSlice(
      "rotated-or-vertical",
      "Truth marked rotated or vertical",
      records,
      scoreByCaseId,
      (record) =>
        record.annotation.alcohol.presence === "present" &&
        record.annotation.alcohol.characteristics.includes("rotated-or-vertical"),
    ),
    buildAlcoholSlice(
      "vertical-strip",
      "Vertical mandatory strip layout",
      records,
      scoreByCaseId,
      (record) => record.inspection.visualStrata.includes("vertical-mandatory-strip"),
    ),
    buildAlcoholSlice(
      "split-token",
      "Split-token alcohol wording",
      records,
      scoreByCaseId,
      (record) =>
        record.annotation.alcohol.presence === "present" &&
        record.annotation.alcohol.characteristics.includes("split-token"),
    ),
    buildAlcoholSlice(
      "no-percent-sign",
      "Percent-less wording",
      records,
      scoreByCaseId,
      (record) =>
        record.annotation.alcohol.presence === "present" &&
        record.annotation.alcohol.characteristics.includes("no-percent-sign"),
    ),
    buildAlcoholSlice(
      "decimal-value",
      "Decimal-value alcohol wording",
      records,
      scoreByCaseId,
      (record) =>
        record.annotation.alcohol.presence === "present" &&
        record.annotation.alcohol.characteristics.includes("decimal-value"),
    ),
  ];
}

function hasOrientation(record: IncludedEvalRecord, orientation: EvalTextOrientation): boolean {
  return (
    record.annotation.brand.orientation === orientation ||
    record.annotation.alcohol.orientation === orientation
  );
}

function buildOrientationSlice(
  key: string,
  label: string,
  records: IncludedEvalRecord[],
  scoreByCaseId: Map<string, FieldCaseScore>,
  predicate: (record: IncludedEvalRecord) => boolean,
): EvalOrientationSliceMetrics {
  const matched = records.filter(predicate);
  const scores = matched.map((record) => scoreFor(record, scoreByCaseId));
  const determinate = matched.filter(
    (record) =>
      record.annotation.brand.presence === "present" && !record.annotation.brand.genuinelyAmbiguous,
  );
  const determinateScores = determinate.map((record) => scoreFor(record, scoreByCaseId));
  const presentAlcohol = matched.filter(
    (record) => record.annotation.alcohol.presence === "present",
  );
  const presentAlcoholScores = presentAlcohol.map((record) => scoreFor(record, scoreByCaseId));

  void scores;
  const brandExactCount = determinateScores.filter((score) => score.brandExact).length;
  const brandNormalizedCount = determinateScores.filter((score) => score.brandNormalized).length;
  const brandTop3Count = determinateScores.filter((score) => score.brandTop3).length;
  const brandTop5Count = determinateScores.filter((score) => score.brandTop5).length;
  const alcoholDetectedCount = presentAlcoholScores.filter((score) => score.alcoholDetected).length;
  const alcoholParsedAccurateCount = presentAlcoholScores.filter(
    (score) => score.alcoholParsedAccurate,
  ).length;

  return {
    key,
    label,
    determinateBrandCount: determinateScores.length,
    brandExactCount,
    brandNormalizedCount,
    brandTop3Count,
    brandTop5Count,
    brandExactMatchRate: rate(brandExactCount, determinateScores.length),
    brandNormalizedAcceptableRate: rate(brandNormalizedCount, determinateScores.length),
    brandTop3Recall: rate(brandTop3Count, determinateScores.length),
    brandTop5Recall: rate(brandTop5Count, determinateScores.length),
    presentAlcoholCount: presentAlcoholScores.length,
    alcoholDetectedCount,
    alcoholParsedAccurateCount,
    alcoholDetectionRecall: rate(alcoholDetectedCount, presentAlcoholScores.length),
    alcoholParsedAccuracy: rate(alcoholParsedAccurateCount, presentAlcoholScores.length),
  };
}

function buildOrientationSlices(
  records: IncludedEvalRecord[],
  scoreByCaseId: Map<string, FieldCaseScore>,
): EvalOrientationSliceMetrics[] {
  return [
    buildOrientationSlice(
      "upright-full-image",
      "Upright full-image",
      records,
      scoreByCaseId,
      (record) =>
        !record.inspection.visualStrata.includes("alcohol-at-side-or-rotated") &&
        !record.inspection.visualStrata.includes("vertical-mandatory-strip") &&
        !record.inspection.visualStrata.includes("multi-panel") &&
        (record.annotation.brand.orientation === "horizontal" ||
          record.annotation.brand.orientation === "not-applicable") &&
        (record.annotation.alcohol.orientation === "horizontal" ||
          record.annotation.alcohol.orientation === "not-applicable"),
    ),
    buildOrientationSlice(
      "upright-edge-or-side-region",
      "Upright edge/side region",
      records,
      scoreByCaseId,
      (record) =>
        record.inspection.visualStrata.includes("alcohol-at-side-or-rotated") &&
        (record.annotation.brand.orientation === "horizontal" ||
          record.annotation.brand.orientation === "not-applicable") &&
        (record.annotation.alcohol.orientation === "horizontal" ||
          record.annotation.alcohol.orientation === "not-applicable"),
    ),
    buildOrientationSlice(
      "vertical-clockwise",
      "90° clockwise text",
      records,
      scoreByCaseId,
      (record) => hasOrientation(record, "vertical-clockwise"),
    ),
    buildOrientationSlice(
      "vertical-counterclockwise",
      "90° counterclockwise text",
      records,
      scoreByCaseId,
      (record) => hasOrientation(record, "vertical-counterclockwise"),
    ),
    buildOrientationSlice(
      "rotated-180",
      "180° upside-down text",
      records,
      scoreByCaseId,
      (record) => hasOrientation(record, "rotated-180"),
    ),
    buildOrientationSlice("mixed", "Mixed orientation", records, scoreByCaseId, (record) =>
      hasOrientation(record, "mixed"),
    ),
    buildOrientationSlice(
      "vertical-strip",
      "Vertical mandatory strip",
      records,
      scoreByCaseId,
      (record) => record.inspection.visualStrata.includes("vertical-mandatory-strip"),
    ),
    buildOrientationSlice(
      "multi-artifact",
      "Multi-artifact regional target",
      records,
      scoreByCaseId,
      (record) => record.inspection.visualStrata.includes("multi-panel"),
    ),
    buildOrientationSlice("unknown", "Unknown orientation", records, scoreByCaseId, (record) =>
      hasOrientation(record, "unknown"),
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

function orientationDriven(record: IncludedEvalRecord): boolean {
  return (
    record.inspection.visualStrata.includes("vertical-mandatory-strip") ||
    hasOrientation(record, "vertical-clockwise") ||
    hasOrientation(record, "vertical-counterclockwise") ||
    hasOrientation(record, "rotated-180") ||
    hasOrientation(record, "mixed")
  );
}

function bucketForFailureClass(
  failureClass: EvalFailureClass,
  knownAmbiguous: boolean,
  record: IncludedEvalRecord,
): EvalFailureDistributionBucket["key"] {
  switch (failureClass) {
    case "correct":
      return "correct-result";
    case "correct-uncertainty":
      return knownAmbiguous ? "correct-uncertainty" : "unnecessary-ambiguity";
    case "ocr-recognition-failure":
      return "ocr-recognition";
    case "region-coverage-failure":
      return orientationDriven(record) ? "orientation" : "region-coverage";
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

function buildFailureDistribution(
  records: IncludedEvalRecord[],
  casesById: Map<string, CaseReport>,
): EvalFailureDistributionBucket[] {
  const buckets = failureBuckets();
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const record of records) {
    const caseReport = casesById.get(record.caseId);
    if (!caseReport) throw new Error(`missing case report for included record ${record.caseId}`);
    byKey.get(
      bucketForFailureClass(caseReport.brand.failureClass, caseReport.brand.knownAmbiguous, record),
    )!.count += 1;
    byKey.get(bucketForFailureClass(caseReport.alcohol.failureClass, false, record))!.count += 1;
  }
  return buckets;
}

function buildCandidateFilteringSubtypeDistribution(
  cases: CaseReport[],
): EvalCandidateFilteringSubtypeBucket[] {
  const counts = new Map<string, EvalCandidateFilteringSubtypeBucket>();
  const add = (
    field: EvalCandidateFilteringSubtypeBucket["field"],
    subtype: EvalCandidateFilteringSubtype | null,
  ) => {
    if (!subtype) return;
    const key = `${field}:${subtype}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    counts.set(key, {
      key: subtype,
      label: candidateFilteringSubtypeLabel(subtype),
      field,
      count: 1,
    });
  };

  for (const caseReport of cases) {
    add("brand", caseReport.brand.candidateFilteringSubtype);
    add("alcohol", caseReport.alcohol.candidateFilteringSubtype);
  }

  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.field.localeCompare(b.field) || a.key.localeCompare(b.key),
  );
}

function buildRecoveryPassContributionBreakdown(
  cases: CaseReport[],
): EvalRecoveryPassContributionBucket[] {
  const buckets = new Map<string, EvalRecoveryPassContributionBucket & { caseIds: Set<string> }>();
  for (const caseReport of cases) {
    for (const pass of caseReport.diagnostics.recoveryPasses) {
      const existing = buckets.get(pass.passKind) ?? {
        key: pass.passKind,
        label: recoveryPassKindLabel(pass.passKind),
        passCount: 0,
        caseCount: 0,
        newOcrTokensCount: 0,
        newFieldLikeEvidenceCount: 0,
        acceptedCandidateCount: 0,
        changedSelectedFieldCount: 0,
        correctSelectedFieldCount: 0,
        noMeasuredValueCount: 0,
        totalExecutionTimeMs: 0,
        maxCumulativeCostMs: 0,
        caseIds: new Set<string>(),
      };
      existing.passCount += 1;
      existing.caseIds.add(caseReport.caseId);
      if (pass.newOcrTokens) existing.newOcrTokensCount += 1;
      if (pass.newFieldLikeEvidence) existing.newFieldLikeEvidenceCount += 1;
      if (pass.acceptedCandidate) existing.acceptedCandidateCount += 1;
      if (pass.changedSelectedField) existing.changedSelectedFieldCount += 1;
      if (pass.correctSelectedField) existing.correctSelectedFieldCount += 1;
      if (pass.noMeasuredValue) existing.noMeasuredValueCount += 1;
      existing.totalExecutionTimeMs += pass.executionTimeMs;
      existing.maxCumulativeCostMs = Math.max(existing.maxCumulativeCostMs, pass.cumulativeCostMs);
      buckets.set(pass.passKind, existing);
    }
  }

  return [...buckets.values()]
    .map(({ caseIds, ...bucket }) => ({ ...bucket, caseCount: caseIds.size }))
    .sort((a, b) => b.passCount - a.passCount || a.key.localeCompare(b.key));
}

function buildPerformanceBreakdown(cases: CaseReport[]): EvalPerformanceBreakdown {
  const passCounts = cases.map((caseReport) => caseReport.diagnostics.performance.passCount);
  const recoveryDurations = cases.map(
    (caseReport) => caseReport.diagnostics.performance.totalRecoveryDurationMs,
  );
  const totalOcrDurations = cases.map(
    (caseReport) => caseReport.diagnostics.performance.totalOcrDurationMs,
  );
  const casesRequiringExtraPasses = cases.filter(
    (caseReport) => caseReport.diagnostics.performance.extraPassCount > 0,
  ).length;
  const extraPassesWithNoUsableEvidence = cases.reduce(
    (sum, caseReport) => sum + caseReport.diagnostics.performance.extraPassesWithNoUsableEvidence,
    0,
  );
  const recoveredCorrectFields = cases.reduce((sum, caseReport) => {
    let recovered = 0;
    if (
      caseReport.diagnostics.finalSelectionPasses.brandSourcePassId &&
      caseReport.diagnostics.finalSelectionPasses.brandSourcePassId !== "pass-0-full-image" &&
      (caseReport.brand.failureClass === "correct" ||
        caseReport.brand.failureClass === "correct-uncertainty")
    ) {
      recovered += 1;
    }
    if (
      caseReport.diagnostics.finalSelectionPasses.alcoholSourcePassId &&
      caseReport.diagnostics.finalSelectionPasses.alcoholSourcePassId !== "pass-0-full-image" &&
      caseReport.alcohol.failureClass === "correct"
    ) {
      recovered += 1;
    }
    return sum + recovered;
  }, 0);

  return {
    medianPassCount: percentile(passCounts, 50),
    p95PassCount: percentile(passCounts, 95),
    casesRequiringExtraPasses,
    extraPassCaseRate: rate(casesRequiringExtraPasses, cases.length),
    medianRecoveryDurationMs: percentile(recoveryDurations, 50),
    p95RecoveryDurationMs: percentile(recoveryDurations, 95),
    medianTotalOcrDurationMs: percentile(totalOcrDurations, 50),
    p95TotalOcrDurationMs: percentile(totalOcrDurations, 95),
    extraPassesWithNoUsableEvidence,
    costPerRecoveredCorrectCaseMs:
      recoveredCorrectFields === 0
        ? 0
        : recoveryDurations.reduce((sum, value) => sum + value, 0) / recoveredCorrectFields,
  };
}

export function buildReport(cases: CaseReport[], manifest: LoadedEvalManifest): EvalReport {
  const scores = cases.map(scoreOf);
  const scoreByCaseId = new Map(scores.map((score) => [score.caseId, score]));
  const casesById = new Map(cases.map((caseReport) => [caseReport.caseId, caseReport]));
  const records = includedRecords(manifest);
  return {
    schemaVersion: "extraction-baseline-report.v3",
    manifestSchemaVersion: manifest.schemaVersion,
    extractorAdapter: { id: EVAL_ADAPTER.id, version: EVAL_ADAPTER.version },
    aggregate: aggregate(scores),
    breakdowns: {
      alcoholSlices: buildAlcoholSlices(records, scoreByCaseId),
      orientationSlices: buildOrientationSlices(records, scoreByCaseId),
      failureDistribution: buildFailureDistribution(records, casesById),
      candidateFilteringSubtypes: buildCandidateFilteringSubtypeDistribution(cases),
      recoveryPassContributions: buildRecoveryPassContributionBreakdown(cases),
      performance: buildPerformanceBreakdown(cases),
    },
    cases,
  };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function classSummary(counts: Record<EvalFailureClass, number>): string {
  const entries = (Object.entries(counts) as [EvalFailureClass, number][])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries.length === 0 ? "—" : entries.map(([key, count]) => `${key}: ${count}`).join(", ");
}

function removedCandidateSummary(caseReport: CaseReport): string {
  const removed = caseReport.diagnostics.brandLineDecisions
    .filter((line) => !line.kept && line.cleanedValue)
    .slice(0, 4)
    .map((line) => `"${line.cleanedValue}" [${line.reason}]`);
  return removed.length === 0 ? "—" : removed.join(", ");
}

function failureWithSubtype(
  failureClass: EvalFailureClass,
  subtype: EvalCandidateFilteringSubtype | null,
): string {
  if (!subtype) return failureClass;
  return `${failureClass} / ${subtype}`;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

export function renderMarkdown(report: EvalReport): string {
  const aggregateMetrics = report.aggregate;
  const performance = report.breakdowns.performance;
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
      "Brand selection quality, alcohol recall/accuracy, and any remaining false-certainty cases remain gating defects.",
  );
  lines.push(
    "Ambiguity honesty applies only to the genuinely ambiguous labels; it is not evidence of overall extractor usefulness.",
  );
  lines.push(
    "Phase 5A adds evaluation-only attribution detail: candidate-filtering failures are subclassed from existing selector diagnostics, and recovery-pass contributions are measured from extractor debug traces without changing production OCR, ranking, confidence, or API output.",
  );
  lines.push("");
  lines.push("## Brand metrics");
  lines.push("");
  lines.push("| Metric | Value | Denominator |");
  lines.push("| --- | --- | --- |");
  lines.push(
    `| Brand exact match | ${pct(aggregateMetrics.brandExactMatchRate)} | ${aggregateMetrics.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Brand normalized-acceptable match | ${pct(aggregateMetrics.brandNormalizedAcceptableRate)} | ${aggregateMetrics.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Brand top-3 recall | ${pct(aggregateMetrics.brandTop3Recall)} | ${aggregateMetrics.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Brand top-5 recall | ${pct(aggregateMetrics.brandTop5Recall)} | ${aggregateMetrics.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Brand confident-correct rate | ${pct(aggregateMetrics.brandConfidentCorrectRate)} | ${aggregateMetrics.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Useful-but-deferred rate | ${pct(aggregateMetrics.brandUsefulButDeferredRate)} | ${aggregateMetrics.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Unnecessary ambiguity rate | ${pct(aggregateMetrics.brandUnnecessaryAmbiguityRate)} | ${aggregateMetrics.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Determinate false-certainty rate | ${pct(aggregateMetrics.brandFalseCertaintyRate)} | ${aggregateMetrics.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| False abstention rate | ${pct(aggregateMetrics.brandFalseAbstentionRate)} | ${aggregateMetrics.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Determinate NOT_OBSERVED rate | ${pct(aggregateMetrics.brandNotObservedRate)} | ${aggregateMetrics.determinateBrandCount} determinate |`,
  );
  lines.push(
    `| Correct abstention rate | ${pct(aggregateMetrics.brandCorrectAbstentionRate)} | ${aggregateMetrics.absentBrandCount} absent |`,
  );
  lines.push(
    `| Genuine ambiguity honesty | ${pct(aggregateMetrics.ambiguityHonestyRate)} | ${aggregateMetrics.ambiguousBrandCount} ambiguous |`,
  );
  lines.push(
    `| Absent-brand false-positive rate | ${pct(aggregateMetrics.absentBrandFalsePositiveRate)} | ${aggregateMetrics.absentBrandCount} absent |`,
  );
  lines.push("");
  lines.push("## Alcohol metrics");
  lines.push("");
  lines.push("| Metric | Value | Denominator |");
  lines.push("| --- | --- | --- |");
  lines.push(
    `| Alcohol detection recall | ${pct(aggregateMetrics.alcoholDetectionRecall)} | ${aggregateMetrics.presentAlcoholCount} present |`,
  );
  lines.push(
    `| Alcohol parsed-value accuracy | ${pct(aggregateMetrics.alcoholParsedValueAccuracy)} | ${aggregateMetrics.presentAlcoholCount} present |`,
  );
  lines.push(
    `| Alcohol parser-failure rate | ${pct(aggregateMetrics.alcoholParserFailureRate)} | ${aggregateMetrics.presentAlcoholCount} present |`,
  );
  lines.push(
    `| Alcohol overall false-certainty rate | ${pct(aggregateMetrics.alcoholFalseCertaintyRate)} | ${aggregateMetrics.caseCount} included |`,
  );
  lines.push(
    `| Absent-alcohol false-positive rate | ${pct(aggregateMetrics.absentFieldFalsePositiveRate)} | ${aggregateMetrics.absentAlcoholCount} absent |`,
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
  lines.push("### Orientation and Region Slices");
  lines.push("");
  lines.push(
    "| Slice | Brand exact | Brand normalized | Brand top-3 | Brand top-5 | Brand denom | Alcohol recall | Alcohol accuracy | Alcohol denom |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const slice of report.breakdowns.orientationSlices) {
    lines.push(
      `| ${slice.label} | ${pct(slice.brandExactMatchRate)} | ${pct(slice.brandNormalizedAcceptableRate)} | ${pct(slice.brandTop3Recall)} | ${pct(slice.brandTop5Recall)} | ${slice.determinateBrandCount} determinate | ${pct(slice.alcoholDetectionRecall)} | ${pct(slice.alcoholParsedAccuracy)} | ${slice.presentAlcoholCount} present |`,
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
  lines.push(`**Brand failure classes:** ${classSummary(aggregateMetrics.brandFailureCounts)}`);
  lines.push("");
  lines.push(`**Alcohol failure classes:** ${classSummary(aggregateMetrics.alcoholFailureCounts)}`);
  lines.push("");
  lines.push("### Candidate-Filtering Subtypes");
  lines.push("");
  lines.push("| Field | Subtype | Count |");
  lines.push("| --- | --- | --- |");
  for (const bucket of report.breakdowns.candidateFilteringSubtypes) {
    lines.push(`| ${bucket.field} | ${bucket.label} | ${bucket.count} |`);
  }
  if (report.breakdowns.candidateFilteringSubtypes.length === 0) {
    lines.push("| — | — | 0 |");
  }
  lines.push("");
  lines.push("## Pass Cost");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Median OCR passes per image | ${performance.medianPassCount.toFixed(0)} |`);
  lines.push(`| p95 OCR passes per image | ${performance.p95PassCount.toFixed(0)} |`);
  lines.push(
    `| Cases requiring extra passes | ${performance.casesRequiringExtraPasses} (${pct(performance.extraPassCaseRate)}) |`,
  );
  lines.push(
    `| Median recovery duration | ${performance.medianRecoveryDurationMs.toFixed(0)} ms |`,
  );
  lines.push(`| p95 recovery duration | ${performance.p95RecoveryDurationMs.toFixed(0)} ms |`);
  lines.push(
    `| Median total OCR duration | ${performance.medianTotalOcrDurationMs.toFixed(0)} ms |`,
  );
  lines.push(`| p95 total OCR duration | ${performance.p95TotalOcrDurationMs.toFixed(0)} ms |`);
  lines.push(
    `| Extra passes with no usable evidence | ${performance.extraPassesWithNoUsableEvidence} |`,
  );
  lines.push(
    `| Recovery cost per recovered correct field | ${performance.costPerRecoveredCorrectCaseMs.toFixed(0)} ms |`,
  );
  lines.push("");
  lines.push(
    `| Median latency | ${aggregateMetrics.medianLatencyMs.toFixed(0)} ms | ${aggregateMetrics.caseCount} cases |`,
  );
  lines.push(
    `| p95 latency | ${aggregateMetrics.p95LatencyMs.toFixed(0)} ms | ${aggregateMetrics.caseCount} cases |`,
  );
  lines.push("");
  lines.push("## Recovery-Pass Contributions");
  lines.push("");
  lines.push(
    "| Pass kind | Passes | Cases | New OCR | Field-like evidence | Accepted candidate | Changed selection | Correct selection | No measured value | Total ms | Max cumulative ms |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const bucket of report.breakdowns.recoveryPassContributions) {
    lines.push(
      `| ${bucket.label} | ${bucket.passCount} | ${bucket.caseCount} | ${bucket.newOcrTokensCount} | ${bucket.newFieldLikeEvidenceCount} | ${bucket.acceptedCandidateCount} | ${bucket.changedSelectedFieldCount} | ${bucket.correctSelectedFieldCount} | ${bucket.noMeasuredValueCount} | ${bucket.totalExecutionTimeMs.toFixed(0)} | ${bucket.maxCumulativeCostMs.toFixed(0)} |`,
    );
  }
  if (report.breakdowns.recoveryPassContributions.length === 0) {
    lines.push("| — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |");
  }
  lines.push("");
  lines.push("### Recovery passes that never improve outcomes");
  lines.push("");
  lines.push("| Pass kind | Passes | Cases | Changed selection | Correct selection | Total ms |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  const neverImproving = report.breakdowns.recoveryPassContributions.filter(
    (bucket) => bucket.changedSelectedFieldCount === 0 && bucket.correctSelectedFieldCount === 0,
  );
  for (const bucket of neverImproving) {
    lines.push(
      `| ${bucket.label} | ${bucket.passCount} | ${bucket.caseCount} | ${bucket.changedSelectedFieldCount} | ${bucket.correctSelectedFieldCount} | ${bucket.totalExecutionTimeMs.toFixed(0)} |`,
    );
  }
  if (neverImproving.length === 0) {
    lines.push("| none | 0 | 0 | 0 | 0 | 0 |");
  }
  lines.push("");
  lines.push("### Recovery pass instances");
  lines.push("");
  lines.push(
    "| Case | Order | Pass kind | Trigger reasons | New OCR | Field-like evidence | Accepted candidate | Changed selection | Correct selection | No measured value | ms | cumulative ms |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const caseReport of report.cases) {
    for (const pass of caseReport.diagnostics.recoveryPasses) {
      lines.push(
        `| ${caseReport.caseId} | ${pass.passOrder} | ${recoveryPassKindLabel(pass.passKind)} | ${pass.triggerReasons.join(", ")} | ${yesNo(pass.newOcrTokens)} | ${yesNo(pass.newFieldLikeEvidence)} | ${yesNo(pass.acceptedCandidate)} | ${yesNo(pass.changedSelectedField)} | ${yesNo(pass.correctSelectedField)} | ${yesNo(pass.noMeasuredValue)} | ${pass.executionTimeMs.toFixed(0)} | ${pass.cumulativeCostMs.toFixed(0)} |`,
      );
    }
  }
  if (report.cases.every((caseReport) => caseReport.diagnostics.recoveryPasses.length === 0)) {
    lines.push("| — | 0 | — | — | no | no | no | no | no | no | 0 | 0 |");
  }
  lines.push("");
  lines.push("## Brand abstentions");
  lines.push("");
  lines.push("| Case | Truth | Abstention reason | Removed candidates |");
  lines.push("| --- | --- | --- | --- |");
  for (const caseReport of report.cases.filter(
    (caseReport) => caseReport.brand.state === "NOT_OBSERVED",
  )) {
    lines.push(
      `| ${caseReport.caseId} | ${caseReport.brand.present ? "present" : "absent"} | ${caseReport.diagnostics.brandAbstentionReason ?? "—"} | ${removedCandidateSummary(caseReport)} |`,
    );
  }
  lines.push("");
  lines.push("## Per-case results");
  lines.push("");
  lines.push(
    "| Case | Strata | Brand state → selected | Brand attribution | Alcohol state → value | Alcohol attribution | passes | ms |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const caseReport of report.cases) {
    const brandSelection = caseReport.brand.value === null ? "∅" : `"${caseReport.brand.value}"`;
    const alcoholSelection =
      caseReport.alcohol.value === null ? "∅" : `"${caseReport.alcohol.value}"`;
    lines.push(
      `| ${caseReport.caseId} | ${caseReport.strata.join("; ")} | ${caseReport.brand.state} → ${brandSelection} | ${failureWithSubtype(caseReport.brand.failureClass, caseReport.brand.candidateFilteringSubtype)} | ${caseReport.alcohol.state} → ${alcoholSelection} | ${failureWithSubtype(caseReport.alcohol.failureClass, caseReport.alcohol.candidateFilteringSubtype)} | ${caseReport.diagnostics.performance.passCount} | ${caseReport.latencyMs.toFixed(0)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
