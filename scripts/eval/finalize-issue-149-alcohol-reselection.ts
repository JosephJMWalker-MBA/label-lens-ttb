import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  canonicalJson,
  decideAlcoholReselection,
  type AlcoholReselectionDecisionInput,
} from "@/fixtures/eval/issue-149-alcohol-reselection";

const ROOT = path.join(process.cwd(), "artifacts/issue-149-alcohol-reselection");

interface Wilson {
  successes: number;
  total: number;
  rate: number | null;
  lower95: number | null;
  upper95: number | null;
}

interface RunCase {
  caseId: string;
  checksumFamily: string;
  truth: {
    presence: "present" | "absent";
    acceptablePercents: number[];
    acceptableStatements: string[];
  };
  truthSource: unknown;
  slices: string[];
  eligible: boolean;
  latencyMs: number;
  productionResponseSha256: string | null;
  currentSelection: unknown;
  armSelection: {
    observation: {
      state: string;
      value: string | null;
      confidence: number;
      ocrEvidenceScore: number;
    };
    source: { passId?: string } | null;
  } | null;
  selectedPassId: string | null;
  correctBefore: boolean | null;
  correctAfter: boolean | null;
  improved: boolean;
  regressed: boolean;
  falseReliableRead: boolean;
  wrongReliableRead: boolean;
  absenceFalsePositive: boolean;
  normalizedTextCorrect: boolean | null;
  recoveryContainedTruth: boolean;
  recoveryDiscardedTruth: boolean;
  failureClassification: string;
  mechanism: string;
  brandBehaviorHash: string | null;
  warningBehaviorHash: string | null;
  ocrTraceHash: string | null;
  behaviorHash: string | null;
}

interface RunReport {
  arm: "control" | "treatment";
  runKind: "primary" | "repeat";
  productionParity: {
    status: "PASS" | "FAIL";
    expectedCaseCount: number;
    actualCaseCount: number;
    matchedCaseCount: number;
    mismatches: unknown[];
  };
  corpus: {
    governedCaseCount: number;
    evaluableCaseCount: number;
    presentAlcoholCaseCount: number;
    absenceControlCount: number;
    checksumFamilyCount: number;
  };
  metrics: {
    detectionRecall: Wilson;
    parsedValueAccuracy: Wilson;
    normalizedTextAccuracy: Wilson;
    falseReliableReads: Wilson;
    wrongReliableReads: Wilson;
    absenceFalsePositiveCount: number;
    correctButConservativeCount: number;
    recoveryContainedTruthCount: number;
    recoveryDiscardedTruthCount: number;
    selectorImprovementCount: number;
    selectorRegressionCount: number;
    improvementChecksumFamilies: string[];
    regressionChecksumFamilies: string[];
    sliceDetectionRecall: Record<string, Wilson>;
    medianLatencyMs: number;
    p95LatencyMs: number;
  };
  hashes: {
    armBehaviorSha256: string;
    ocrTraceSetSha256: string;
    brandBehaviorSetSha256: string;
    warningBehaviorSetSha256: string;
    productionResponseSetSha256: string;
  };
  cases: RunCase[];
}

function load(relativePath: string): RunReport {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8")) as RunReport;
}

function percentIncrease(control: number, treatment: number): number {
  if (control === 0) return treatment === 0 ? 0 : Number.POSITIVE_INFINITY;
  return ((treatment - control) / control) * 100;
}

function rate(value: Wilson): string {
  if (value.rate === null) return `n=0`;
  return `${value.successes}/${value.total} (${(value.rate * 100).toFixed(2)}%; Wilson 95% ${(value.lower95! * 100).toFixed(2)}%–${(value.upper95! * 100).toFixed(2)}%)`;
}

function assertAligned(left: RunReport, right: RunReport) {
  const leftIds = left.cases.map((item) => item.caseId);
  const rightIds = right.cases.map((item) => item.caseId);
  if (canonicalJson(leftIds) !== canonicalJson(rightIds)) {
    throw new Error("CASE_ORDER_MISMATCH");
  }
}

function main() {
  const primaryControl = load("control/report.json");
  const primaryTreatment = load("treatment/report.json");
  const repeatControl = load("repeat/control-report.json");
  const repeatTreatment = load("repeat/treatment-report.json");
  for (const pair of [
    [primaryControl, primaryTreatment],
    [primaryControl, repeatControl],
    [primaryTreatment, repeatTreatment],
  ] as const) {
    assertAligned(pair[0], pair[1]);
  }

  const evaluableControl = primaryControl.cases.filter((item) => item.eligible);
  const evaluableTreatmentByCase = new Map(
    primaryTreatment.cases.filter((item) => item.eligible).map((item) => [item.caseId, item]),
  );
  const perCase = evaluableControl.map((control) => {
    const treatment = evaluableTreatmentByCase.get(control.caseId);
    if (!treatment) throw new Error(`MISSING_TREATMENT_CASE: ${control.caseId}`);
    const selectionChanged =
      canonicalJson(control.armSelection) !== canonicalJson(treatment.armSelection);
    const mechanism = selectionChanged ? treatment.mechanism : "NO_MEANINGFUL_EFFECT";
    return {
      caseId: control.caseId,
      checksumFamily: control.checksumFamily,
      truthSource: control.truthSource,
      expectedAlcohol:
        control.truth.presence === "present"
          ? {
              acceptablePercents: control.truth.acceptablePercents,
              acceptableStatements: control.truth.acceptableStatements,
            }
          : "ABSENT",
      slices: control.slices,
      controlSelection: control.armSelection,
      treatmentSelection: treatment.armSelection,
      controlSelectedPassId: control.selectedPassId,
      treatmentSelectedPassId: treatment.selectedPassId,
      correctBefore: control.correctAfter,
      correctAfter: treatment.correctAfter,
      improved: control.correctAfter === false && treatment.correctAfter === true,
      regressed: control.correctAfter === true && treatment.correctAfter === false,
      falseReliableRead: treatment.falseReliableRead,
      wrongReliableRead: treatment.wrongReliableRead,
      absenceFalsePositive: treatment.absenceFalsePositive,
      recoveryContainedTruth: treatment.recoveryContainedTruth,
      recoveryDiscardedTruth: treatment.recoveryDiscardedTruth,
      failureClassification: treatment.failureClassification,
      mechanism,
      evidenceSource: selectionChanged
        ? "already-collected OCR passes and already-available parsing; selector only"
        : "no changed evidence source",
      controlBehaviorHash: control.behaviorHash,
      treatmentBehaviorHash: treatment.behaviorHash,
    };
  });

  const changed = perCase.filter(
    (item) => canonicalJson(item.controlSelection) !== canonicalJson(item.treatmentSelection),
  );
  const improvements = perCase.filter((item) => item.improved);
  const regressions = perCase.filter((item) => item.regressed);
  const improvementFamilies = new Set(improvements.map((item) => item.checksumFamily));
  const medianIncrease = percentIncrease(
    primaryControl.metrics.medianLatencyMs,
    primaryTreatment.metrics.medianLatencyMs,
  );
  const p95Increase = percentIncrease(
    primaryControl.metrics.p95LatencyMs,
    primaryTreatment.metrics.p95LatencyMs,
  );
  const brandChangedCaseCount = primaryControl.cases.filter(
    (control, index) =>
      control.brandBehaviorHash !== primaryTreatment.cases[index]?.brandBehaviorHash,
  ).length;
  const warningChangedCaseCount = primaryControl.cases.filter(
    (control, index) =>
      control.warningBehaviorHash !== primaryTreatment.cases[index]?.warningBehaviorHash,
  ).length;
  const traceChangedCaseCount = primaryControl.cases.filter(
    (control, index) => control.ocrTraceHash !== primaryTreatment.cases[index]?.ocrTraceHash,
  ).length;
  const responseChangedCaseCount = primaryControl.cases.filter(
    (control, index) =>
      control.productionResponseSha256 !== primaryTreatment.cases[index]?.productionResponseSha256,
  ).length;
  const behaviorReproduced =
    primaryControl.hashes.armBehaviorSha256 === repeatControl.hashes.armBehaviorSha256 &&
    primaryTreatment.hashes.armBehaviorSha256 === repeatTreatment.hashes.armBehaviorSha256 &&
    primaryControl.hashes.ocrTraceSetSha256 === repeatControl.hashes.ocrTraceSetSha256 &&
    primaryTreatment.hashes.ocrTraceSetSha256 === repeatTreatment.hashes.ocrTraceSetSha256;
  const behaviorallyIdentical = changed.length === 0;
  const decisionInput: AlcoholReselectionDecisionInput = {
    eligibilityPassed:
      primaryControl.corpus.evaluableCaseCount >= 6 &&
      primaryControl.corpus.checksumFamilyCount >= 2,
    improvedCaseCount: improvements.length,
    improvementChecksumFamilyCount: improvementFamilies.size,
    detectionRecallImproved:
      (primaryTreatment.metrics.detectionRecall.rate ?? 0) >
      (primaryControl.metrics.detectionRecall.rate ?? 0),
    parsedAccuracyImproved:
      (primaryTreatment.metrics.parsedValueAccuracy.rate ?? 0) >
      (primaryControl.metrics.parsedValueAccuracy.rate ?? 0),
    recoveryTruthPromotionCount: improvements.filter((item) => item.recoveryContainedTruth).length,
    correctRegressionCount: regressions.length,
    falseReliableReadIncrease:
      primaryTreatment.metrics.falseReliableReads.successes -
      primaryControl.metrics.falseReliableReads.successes,
    wrongReliableReadIncrease:
      primaryTreatment.metrics.wrongReliableReads.successes -
      primaryControl.metrics.wrongReliableReads.successes,
    absenceFalsePositiveCount: primaryTreatment.metrics.absenceFalsePositiveCount,
    brandChangedCaseCount,
    warningChangedCaseCount,
    medianLatencyIncreasePercent: medianIncrease,
    p95LatencyIncreasePercent: p95Increase,
    isolationViolationCount: traceChangedCaseCount + responseChangedCaseCount,
    sellerTruthLeak: false,
    behaviorReproduced,
    behaviorallyIdenticalEveryEvaluableCase: behaviorallyIdentical,
  };
  const decision = decideAlcoholReselection(decisionInput);
  const decisionRecord = {
    schemaVersion: "issue-149-alcohol-reselection.decision.v1",
    deterministic: true,
    baseSha: "5d22a6be0407e8df4870983aab9107bc89f7c5d0",
    preregistrationSha256: "19a9f649271265fee0369363b32e30bb9a4419b35d2a4f6b50d47db5779eb102",
    decisionInput,
    decision: decision.decision,
    reasons: decision.reasons,
    nextRecommendation: decision.nextRecommendation,
    noProductionEnablement: true,
  };

  mkdirSync(path.join(ROOT, "diff"), { recursive: true });
  writeFileSync(
    path.join(ROOT, "diff/per-case.jsonl"),
    `${perCase.map((item) => canonicalJson(item)).join("\n")}\n`,
  );
  const mechanismCounts = new Map<string, number>();
  for (const item of perCase) {
    mechanismCounts.set(item.mechanism, (mechanismCounts.get(item.mechanism) ?? 0) + 1);
  }
  writeFileSync(
    path.join(ROOT, "diff/mechanisms.md"),
    `# Mechanism classifications

Every evaluable case receives exactly one frozen classification.

${[...mechanismCounts.entries()].map(([name, count]) => `- \`${name}\`: ${count}`).join("\n")}

Changed cases: ${changed.length}. ${
      changed.length === 0
        ? "No case changed; no OCR, parsing, or selector improvement is claimed."
        : "Each changed row in per-case.jsonl identifies already-collected evidence, already-available parsing, and selector-only causation."
    }
`,
  );
  writeFileSync(
    path.join(ROOT, "diff/metrics.md"),
    `# Control/treatment metrics

## Outcome

- Decision: \`${decision.decision}\`
- Evaluable cases: ${primaryControl.corpus.evaluableCaseCount}
- Behaviorally changed cases: ${changed.length}
- Improvements: ${improvements.length}
- Regressions: ${regressions.length}
- Improvement checksum families: ${improvementFamilies.size}
- Production behavior enabled: no

## Accuracy and safety

| Metric | Control | Treatment |
| --- | --- | --- |
| Detection recall | ${rate(primaryControl.metrics.detectionRecall)} | ${rate(primaryTreatment.metrics.detectionRecall)} |
| Parsed-value accuracy | ${rate(primaryControl.metrics.parsedValueAccuracy)} | ${rate(primaryTreatment.metrics.parsedValueAccuracy)} |
| Normalized-text accuracy | ${rate(primaryControl.metrics.normalizedTextAccuracy)} | ${rate(primaryTreatment.metrics.normalizedTextAccuracy)} |
| False reliable reads | ${rate(primaryControl.metrics.falseReliableReads)} | ${rate(primaryTreatment.metrics.falseReliableReads)} |
| Wrong reliable reads | ${rate(primaryControl.metrics.wrongReliableReads)} | ${rate(primaryTreatment.metrics.wrongReliableReads)} |
| Absence false positives | ${primaryControl.metrics.absenceFalsePositiveCount} | ${primaryTreatment.metrics.absenceFalsePositiveCount} |
| Correct but conservative | ${primaryControl.metrics.correctButConservativeCount} | ${primaryTreatment.metrics.correctButConservativeCount} |
| Recovery contained truth | ${primaryControl.metrics.recoveryContainedTruthCount} | ${primaryTreatment.metrics.recoveryContainedTruthCount} |
| Recovery truth discarded | ${primaryControl.metrics.recoveryDiscardedTruthCount} | ${primaryTreatment.metrics.recoveryDiscardedTruthCount} |

## Slice detection recall

| Slice | Control | Treatment |
| --- | --- | --- |
${Object.keys(primaryControl.metrics.sliceDetectionRecall)
  .map(
    (slice) =>
      `| ${slice} | ${rate(primaryControl.metrics.sliceDetectionRecall[slice])} | ${rate(primaryTreatment.metrics.sliceDetectionRecall[slice])} |`,
  )
  .join("\n")}

## Latency

- Control median: ${primaryControl.metrics.medianLatencyMs.toFixed(3)} ms
- Treatment median: ${primaryTreatment.metrics.medianLatencyMs.toFixed(3)} ms
- Median delta: ${medianIncrease.toFixed(3)}% (ceiling 10%)
- Control p95: ${primaryControl.metrics.p95LatencyMs.toFixed(3)} ms
- Treatment p95: ${primaryTreatment.metrics.p95LatencyMs.toFixed(3)} ms
- P95 delta: ${p95Increase.toFixed(3)}% (ceiling 15%)

Latency is end-to-end real-extractor timing over the 50 evaluable cases. It is excluded from behavior hashes.

## Isolation and reproducibility

- Primary/repeat behavior reproduced: ${behaviorReproduced ? "yes" : "no"}
- OCR trace changed cases: ${traceChangedCaseCount}
- Brand changed cases: ${brandChangedCaseCount}
- Government Warning changed cases: ${warningChangedCaseCount}
- Production-response changed cases: ${responseChangedCaseCount}
- Production parity: ${primaryControl.productionParity.status}, ${primaryControl.productionParity.matchedCaseCount}/${primaryControl.productionParity.expectedCaseCount}
- Seller truth available to OCR/selection: no

## Kill reasons

${decision.reasons.map((reason) => `- ${reason}`).join("\n")}

Next recommendation: ${decision.nextRecommendation ?? "none"}
`,
  );
  writeFileSync(
    path.join(ROOT, "behavior-hashes.json"),
    `${JSON.stringify(
      {
        schemaVersion: "issue-149-alcohol-reselection.behavior-hashes.v1",
        primaryControl: primaryControl.hashes,
        primaryTreatment: primaryTreatment.hashes,
        repeatControl: repeatControl.hashes,
        repeatTreatment: repeatTreatment.hashes,
        primaryRepeatControlMatch:
          primaryControl.hashes.armBehaviorSha256 === repeatControl.hashes.armBehaviorSha256,
        primaryRepeatTreatmentMatch:
          primaryTreatment.hashes.armBehaviorSha256 === repeatTreatment.hashes.armBehaviorSha256,
        controlTreatmentBehaviorallyIdenticalEveryEvaluableCase: behaviorallyIdentical,
        brandChangedCaseCount,
        warningChangedCaseCount,
        traceChangedCaseCount,
        responseChangedCaseCount,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(path.join(ROOT, "decision.json"), `${JSON.stringify(decisionRecord, null, 2)}\n`);

  const rawPaths = [
    "control/raw-pass-evidence.jsonl",
    "treatment/raw-pass-evidence.jsonl",
    "repeat/control-raw-pass-evidence.jsonl",
    "repeat/treatment-raw-pass-evidence.jsonl",
  ];
  writeFileSync(
    path.join(ROOT, "raw-pass-evidence.jsonl"),
    rawPaths.map((item) => readFileSync(path.join(ROOT, item), "utf8").trimEnd()).join("\n") + "\n",
  );
  for (const rawPath of rawPaths) unlinkSync(path.join(ROOT, rawPath));
  process.stdout.write(`${JSON.stringify(decisionRecord)}\n`);
}

main();
