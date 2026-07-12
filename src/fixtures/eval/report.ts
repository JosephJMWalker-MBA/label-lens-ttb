import { aggregate, type FieldCaseScore } from "./metrics";
import type { EvalFailureClass } from "./eval-manifest.types";
import type { CaseReport, EvalReport } from "./eval-report.types";
import { EVAL_ADAPTER } from "./eval-harness";

/**
 * Build the aggregate report from per-case results and render a human-readable
 * markdown summary. Pure and deterministic given the case reports.
 */

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
    alcoholDetected: c.alcohol.detected,
    alcoholParsedAccurate: c.alcohol.parsedAccurate,
    latencyMs: c.latencyMs,
  };
}

export function buildReport(cases: CaseReport[], manifestSchemaVersion: string): EvalReport {
  return {
    schemaVersion: "extraction-baseline-report.v1",
    manifestSchemaVersion,
    extractorAdapter: { id: EVAL_ADAPTER.id, version: EVAL_ADAPTER.version },
    aggregate: aggregate(cases.map(scoreOf)),
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
  lines.push("## Aggregate metrics");
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
    `| Absent-brand false-positive rate | ${pct(a.absentBrandFalsePositiveRate)} | ${a.absentBrandCount} absent |`,
  );
  lines.push(
    `| Alcohol detection recall | ${pct(a.alcoholDetectionRecall)} | ${a.presentAlcoholCount} present |`,
  );
  lines.push(
    `| Alcohol parsed-value accuracy | ${pct(a.alcoholParsedValueAccuracy)} | ${a.presentAlcoholCount} present |`,
  );
  lines.push(
    `| Absent-alcohol false-positive rate | ${pct(a.absentFieldFalsePositiveRate)} | ${a.absentAlcoholCount} absent |`,
  );
  lines.push(
    `| Ambiguity honesty (deferred when ambiguous) | ${pct(a.ambiguityHonestyRate)} | ${a.ambiguousBrandCount} ambiguous |`,
  );
  lines.push(`| Median latency | ${a.medianLatencyMs.toFixed(0)} ms | ${a.caseCount} cases |`);
  lines.push(`| p95 latency | ${a.p95LatencyMs.toFixed(0)} ms | ${a.caseCount} cases |`);
  lines.push("");
  lines.push(`**Brand failure classes:** ${classSummary(a.brandFailureCounts)}`);
  lines.push("");
  lines.push(`**Alcohol failure classes:** ${classSummary(a.alcoholFailureCounts)}`);
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
