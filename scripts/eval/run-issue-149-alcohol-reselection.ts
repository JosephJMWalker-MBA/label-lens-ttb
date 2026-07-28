import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { runCaseArtifacts } from "@/fixtures/eval/eval-harness";
import { loadEvalManifest } from "@/fixtures/eval/eval-loader";
import type { EvalAlcoholTruthV2, IncludedEvalRecord } from "@/fixtures/eval/eval-manifest.types";
import {
  alcoholParsedAccurate,
  normalizedIncludes,
  parseObservedPercent,
} from "@/fixtures/eval/metrics";
import {
  ALCOHOL_RESELECTION_BASE_SHA,
  ALCOHOL_RESELECTION_EXPERIMENT_ID,
  ALCOHOL_RESELECTION_PREREGISTRATION_SHA256,
  canonicalJson,
  classifyAlcoholReselectionMechanism,
  observationBehavior,
  passTraceBehavior,
  selectionBehavior,
  selectionsBehaviorallyEqual,
  selectAlcoholForReselectionArm,
  sha256Canonical,
  type AlcoholReselectionArm,
} from "@/fixtures/eval/issue-149-alcohol-reselection";
import type { AnalyzerFieldObservation } from "@/pipeline/analyzer/analyzer.types";
import {
  selectAlcoholObservation,
  type FieldSelection,
} from "@/pipeline/extractor/field-selection";
import { selectGovernmentWarningObservation } from "@/pipeline/extractor/government-warning";
import type { RegionOcrResult } from "@/pipeline/extractor/extractor.types";
import {
  buildProductionAnalyzerParityFixture,
  buildProductionAnalyzerParityProof,
  PRODUCTION_PARITY_BASE_COMMIT,
  PRODUCTION_PARITY_FIXTURE_PATH,
  type ProductionAnalyzerParityFixture,
  type ProductionAnalyzerParityInput,
} from "@/fixtures/eval/production-parity";

const OUTPUT_ROOT = path.join(process.cwd(), "artifacts/issue-149-alcohol-reselection");
const PREREGISTRATION_PATH = path.join(OUTPUT_ROOT, "preregistration.md");
const PRODUCTION_HASHES = {
  "src/pipeline/extractor/extractor.ts":
    "9b2712e6bb15552e9524bc5e60be4da2b163bdb325206f452ecbaf44ebf5084c",
  "src/pipeline/extractor/field-selection.ts":
    "3e84fa8a043570713991643830c7b95e0f7189a4ed037b737c783353d519106d",
  "src/pipeline/extractor/regions.ts":
    "910d763e20f47d811348b62c77f17d46ddf3a07b5849a337669a07f6b8efc9ab",
  "src/domain/rules/wine-alcohol-parse.ts":
    "2ec1368cf3f4fcfab264d1507f98267aa6f6112091332d4dda5a76152ea816e7",
  "src/pipeline/extractor/government-warning.ts":
    "bd8b59420a29865f5cfb843b9e52a127c7737737d0128c63cba3c1e4b73794d1",
  "src/app/api/package/analyze/route.ts":
    "2b49932096917c40c88dadc8cdef4017126b72968fb47e0f32104818bd4ff41b",
  "src/fixtures/eval/eval-manifest.json":
    "97aae943a57def5a57be38468556da8c5db1d0c5c0fde6136590b56107689668",
  "src/fixtures/eval/production-analyzer-parity.baseline.json":
    "4ec2851ebe4c65bc41fd17983236f3236fb436e2df9eb0a6814f5d4543c8fb73",
} as const;

type RunKind = "primary" | "repeat";

function parseArguments(): { arm: AlcoholReselectionArm; runKind: RunKind } {
  const armIndex = process.argv.indexOf("--arm");
  const runIndex = process.argv.indexOf("--run");
  const arm = process.argv[armIndex + 1];
  const runKind = process.argv[runIndex + 1];
  if (arm !== "control" && arm !== "treatment") {
    throw new Error("expected --arm control|treatment");
  }
  if (runKind !== "primary" && runKind !== "repeat") {
    throw new Error("expected --run primary|repeat");
  }
  return { arm, runKind };
}

function sha256Bytes(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath: string): string {
  return sha256Bytes(readFileSync(filePath));
}

function assertFrozenInputs() {
  if (sha256File(PREREGISTRATION_PATH) !== ALCOHOL_RESELECTION_PREREGISTRATION_SHA256) {
    throw new Error("PREREGISTRATION_HASH_MISMATCH");
  }
  for (const [relativePath, expected] of Object.entries(PRODUCTION_HASHES)) {
    if (sha256File(path.join(process.cwd(), relativePath)) !== expected) {
      throw new Error(`FROZEN_INPUT_HASH_MISMATCH: ${relativePath}`);
    }
  }
}

function outputPaths(arm: AlcoholReselectionArm, runKind: RunKind) {
  if (runKind === "primary") {
    return {
      report: path.join(OUTPUT_ROOT, arm, "report.json"),
      raw: path.join(OUTPUT_ROOT, arm, "raw-pass-evidence.jsonl"),
    };
  }
  return {
    report: path.join(OUTPUT_ROOT, "repeat", `${arm}-report.json`),
    raw: path.join(OUTPUT_ROOT, "repeat", `${arm}-raw-pass-evidence.jsonl`),
  };
}

function transcript(pass: RegionOcrResult): string {
  return pass.words
    .map((word) => word.text)
    .join(" ")
    .trim();
}

function truthCorrect(observation: AnalyzerFieldObservation, truth: EvalAlcoholTruthV2): boolean {
  if (truth.presence === "absent") return observation.state === "NOT_OBSERVED";
  return alcoholParsedAccurate(observation.value, truth.acceptablePercents);
}

function normalizedTextCorrect(
  observation: AnalyzerFieldObservation,
  truth: EvalAlcoholTruthV2,
): boolean {
  if (truth.presence === "absent") return observation.state === "NOT_OBSERVED";
  return (
    observation.value !== null && normalizedIncludes(observation.value, truth.acceptableStatements)
  );
}

function detected(observation: AnalyzerFieldObservation): boolean {
  return observation.state !== "NOT_OBSERVED";
}

function reliableRead(observation: AnalyzerFieldObservation): boolean {
  return observation.state === "OBSERVED";
}

function wilson(successes: number, total: number) {
  if (total === 0) return { successes, total, rate: null, lower95: null, upper95: null };
  const z = 1.959963984540054;
  const rate = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (rate + (z * z) / (2 * total)) / denominator;
  const margin =
    (z * Math.sqrt((rate * (1 - rate)) / total + (z * z) / (4 * total * total))) / denominator;
  return {
    successes,
    total,
    rate,
    lower95: Math.max(0, center - margin),
    upper95: Math.min(1, center + margin),
  };
}

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(ordered.length - 1, Math.ceil(quantile * ordered.length) - 1);
  return ordered[Math.max(0, index)];
}

function slicesFor(record: IncludedEvalRecord): string[] {
  const slices: string[] = [];
  const strata = record.inspection.visualStrata;
  const truth = record.annotation.alcohol;
  if (strata.includes("alcohol-at-bottom")) slices.push("bottom-positioned");
  if (strata.includes("alcohol-at-side-or-rotated")) slices.push("side");
  if (truth.presence === "present") {
    if (truth.orientation === "rotated-180") slices.push("rotated");
    if (truth.orientation.startsWith("vertical-")) slices.push("vertical");
    if (
      truth.orientation === "horizontal" &&
      !strata.includes("alcohol-at-bottom") &&
      !strata.includes("alcohol-at-side-or-rotated")
    ) {
      slices.push("ordinary-horizontal");
    }
  } else {
    slices.push("governed-alcohol-absence");
  }
  return slices;
}

function individualPassEvidence(pass: RegionOcrResult) {
  const selection = selectAlcoholObservation([pass]);
  return {
    passId: pass.passId,
    passKind: pass.passKind,
    triggerReasons: pass.triggerReasons,
    fieldEligibility: pass.fieldEligibility,
    transform: pass.transform,
    transformedSize: pass.transformedSize,
    preprocessing: pass.preprocessing,
    pageSegMode: pass.pageSegMode,
    rawWordCount: pass.rawWordCount,
    discardedWordCount: pass.discardedWordCount,
    timings: pass.timings,
    transcript: transcript(pass),
    parsedValue: parseObservedPercent(selection.observation.value),
    confidence: selection.observation.confidence,
    reliability: null,
    reliabilityReason: "not-applicable-no-whole-image-reliability-field",
    authority: null,
    authorityReason: "not-applicable-evidence-only-selector",
    selection: selectionBehavior(selection),
  };
}

function classifyFailure(input: {
  eligible: boolean;
  truth: EvalAlcoholTruthV2;
  primary: FieldSelection;
  selected: FieldSelection;
  recoverySelections: FieldSelection[];
}): string {
  if (!input.eligible) return "recovery did not run";
  if (input.truth.presence === "absent") return "recovery ran but truth was absent";
  const truthInRecovery = input.recoverySelections.some((item) =>
    truthCorrect(item.observation, input.truth),
  );
  if (truthInRecovery && !truthCorrect(input.selected.observation, input.truth))
    return "recovery truth discarded";
  if (truthInRecovery) return "recovery ran and truth was present";
  if (
    truthCorrect(input.primary.observation, input.truth) &&
    !truthCorrect(input.selected.observation, input.truth)
  ) {
    return "selector chose weaker primary";
  }
  if (
    truthCorrect(input.selected.observation, input.truth) &&
    input.selected.observation.state !== "OBSERVED"
  ) {
    return "correct candidate but conservative state";
  }
  if (
    reliableRead(input.selected.observation) &&
    !truthCorrect(input.selected.observation, input.truth)
  ) {
    return "wrong reliable candidate";
  }
  if (input.selected.alcoholDiagnostics?.parserRejectedCandidate) return "parser miss";
  return "OCR miss";
}

interface RunCaseRecord {
  caseId: string;
  checksumFamily: string;
  truth: EvalAlcoholTruthV2;
  truthSource: IncludedEvalRecord["annotation"]["provenance"];
  qualityControl: IncludedEvalRecord["qualityControl"];
  slices: string[];
  eligible: boolean;
  extractionError: string | null;
  productionResponseSha256: string | null;
  productionParityMatched: boolean;
  latencyMs: number;
  primary: ReturnType<typeof individualPassEvidence> | null;
  recoveryPasses: Array<ReturnType<typeof individualPassEvidence>>;
  currentSelection: ReturnType<typeof selectionBehavior> | null;
  armSelection: ReturnType<typeof selectionBehavior> | null;
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

async function main() {
  const { arm, runKind } = parseArguments();
  assertFrozenInputs();
  const manifest = loadEvalManifest();
  const recordsByCase = new Map(
    manifest.records
      .filter((record): record is IncludedEvalRecord => record.status === "included")
      .map((record) => [record.caseId, record]),
  );
  const expectedParity = JSON.parse(
    readFileSync(PRODUCTION_PARITY_FIXTURE_PATH, "utf8"),
  ) as ProductionAnalyzerParityFixture;
  const expectedParityByCase = new Map(
    expectedParity.records.map((record) => [record.caseId, record]),
  );
  const parityInputs: ProductionAnalyzerParityInput[] = [];
  const cases: RunCaseRecord[] = [];
  const rawLines: string[] = [];
  const startedAt = new Date().toISOString();

  for (const [caseIndex, evalCase] of manifest.cases.entries()) {
    process.stdout.write(
      `[${runKind}/${arm}] ${caseIndex + 1}/${manifest.cases.length} ${evalCase.caseId}\n`,
    );
    const artifacts = await runCaseArtifacts(evalCase);
    parityInputs.push({
      caseId: evalCase.caseId,
      responseBytes: artifacts.productionResponseBytes,
      extractionError: artifacts.extractionError,
    });
    const record = recordsByCase.get(evalCase.caseId);
    if (!record) throw new Error(`MISSING_INCLUDED_RECORD: ${evalCase.caseId}`);
    const expectedParityRecord = expectedParityByCase.get(evalCase.caseId);
    const responseHash =
      artifacts.productionResponseBytes === null
        ? null
        : sha256Bytes(artifacts.productionResponseBytes);
    const productionParityMatched =
      artifacts.extractionError === (expectedParityRecord?.extractionError ?? null) &&
      responseHash === (expectedParityRecord?.sha256 ?? null);

    const debug = artifacts.extractionDebug;
    if (!debug) {
      cases.push({
        caseId: evalCase.caseId,
        checksumFamily: record.expectedSha256,
        truth: record.annotation.alcohol,
        truthSource: record.annotation.provenance,
        qualityControl: record.qualityControl,
        slices: slicesFor(record),
        eligible: false,
        extractionError: artifacts.extractionError,
        productionResponseSha256: responseHash,
        productionParityMatched,
        latencyMs: artifacts.report.latencyMs,
        primary: null,
        recoveryPasses: [],
        currentSelection: null,
        armSelection: null,
        selectedPassId: null,
        correctBefore: null,
        correctAfter: null,
        improved: false,
        regressed: false,
        falseReliableRead: false,
        wrongReliableRead: false,
        absenceFalsePositive: false,
        normalizedTextCorrect: null,
        recoveryContainedTruth: false,
        recoveryDiscardedTruth: false,
        failureClassification: "not evaluable",
        mechanism: "UNDETERMINED",
        brandBehaviorHash: null,
        warningBehaviorHash: null,
        ocrTraceHash: null,
        behaviorHash: null,
      });
      continue;
    }

    const primary = debug.primarySelections.alcohol;
    const current = debug.finalSelections.alcohol;
    const selected = selectAlcoholForReselectionArm({
      arm,
      primary,
      passes: debug.passes,
    });
    const exactControl = selectAlcoholForReselectionArm({
      arm: "control",
      primary,
      passes: debug.passes,
    });
    if (!selectionsBehaviorallyEqual(exactControl, current)) {
      throw new Error(`CONTROL_PARITY_MISMATCH: ${evalCase.caseId}`);
    }
    const eligible = debug.passes.length > 1;
    const recoverySelections = debug.passes
      .slice(1)
      .map((item) => selectAlcoholObservation([item]));
    const truth = record.annotation.alcohol;
    const correctBefore = truthCorrect(current.observation, truth);
    const correctAfter = truthCorrect(selected.observation, truth);
    const changed = !selectionsBehaviorallyEqual(current, selected);
    const recoveryContainedTruth =
      truth.presence === "present" &&
      recoverySelections.some((item) => truthCorrect(item.observation, truth));
    const warning = selectGovernmentWarningObservation(evalCase.caseId, debug.passes);
    const brandHash = sha256Canonical(selectionBehavior(debug.finalSelections.brand));
    const warningHash = sha256Canonical(warning);
    const traceHash = sha256Canonical(passTraceBehavior(debug.passes));
    const behavior = {
      caseId: evalCase.caseId,
      checksumFamily: record.expectedSha256,
      passTrace: passTraceBehavior(debug.passes),
      primarySelection: selectionBehavior(primary),
      selectedAlcohol: selectionBehavior(selected),
      brandSelection: selectionBehavior(debug.finalSelections.brand),
      warningSelection: warning,
      correctBefore,
      correctAfter,
    };
    const behaviorHash = sha256Canonical(behavior);
    const mechanism = classifyAlcoholReselectionMechanism({
      changed,
      primaryCorrect: truthCorrect(primary.observation, truth),
      controlCorrect: correctBefore,
      treatmentCorrect: correctAfter,
      truthPresentInRecovery: recoveryContainedTruth,
      controlState: current.observation.state,
      treatmentState: selected.observation.state,
      controlValue: current.observation.value,
      treatmentValue: selected.observation.value,
      treatmentConfidence: selected.observation.confidence,
      controlConfidence: current.observation.confidence,
      truthAbsent: truth.presence === "absent",
    });
    const passEvidence = debug.passes.map(individualPassEvidence);

    cases.push({
      caseId: evalCase.caseId,
      checksumFamily: record.expectedSha256,
      truth,
      truthSource: record.annotation.provenance,
      qualityControl: record.qualityControl,
      slices: slicesFor(record),
      eligible,
      extractionError: null,
      productionResponseSha256: responseHash,
      productionParityMatched,
      latencyMs: artifacts.report.latencyMs,
      primary: passEvidence[0],
      recoveryPasses: passEvidence.slice(1),
      currentSelection: selectionBehavior(current),
      armSelection: selectionBehavior(selected),
      selectedPassId: selected.source?.passId ?? null,
      correctBefore,
      correctAfter,
      improved: !correctBefore && correctAfter,
      regressed: correctBefore && !correctAfter,
      falseReliableRead: truth.presence === "absent" && reliableRead(selected.observation),
      wrongReliableRead:
        truth.presence === "present" && reliableRead(selected.observation) && !correctAfter,
      absenceFalsePositive: truth.presence === "absent" && detected(selected.observation),
      normalizedTextCorrect: normalizedTextCorrect(selected.observation, truth),
      recoveryContainedTruth,
      recoveryDiscardedTruth: recoveryContainedTruth && !correctAfter,
      failureClassification: classifyFailure({
        eligible,
        truth,
        primary,
        selected,
        recoverySelections,
      }),
      mechanism,
      brandBehaviorHash: brandHash,
      warningBehaviorHash: warningHash,
      ocrTraceHash: traceHash,
      behaviorHash,
    });

    rawLines.push(
      canonicalJson({
        runKind,
        arm,
        caseId: evalCase.caseId,
        checksumFamily: record.expectedSha256,
        truthSource: record.annotation.provenance,
        passes: debug.passes,
      }),
    );
  }

  const actualParity = buildProductionAnalyzerParityFixture(
    PRODUCTION_PARITY_BASE_COMMIT,
    parityInputs,
  );
  const productionParity = buildProductionAnalyzerParityProof(expectedParity, actualParity);
  if (productionParity.status !== "PASS") {
    throw new Error(`PRODUCTION_PARITY_FAIL: ${canonicalJson(productionParity.mismatches)}`);
  }

  const evaluable = cases.filter((item) => item.eligible && item.extractionError === null);
  if (evaluable.length !== 50) {
    throw new Error(`ELIGIBILITY_DRIFT: expected 50, received ${evaluable.length}`);
  }
  const present = evaluable.filter((item) => item.truth.presence === "present");
  const absent = evaluable.filter((item) => item.truth.presence === "absent");
  const detectionSuccesses = present.filter(
    (item) => item.armSelection?.observation.state !== "NOT_OBSERVED",
  ).length;
  const parsedSuccesses = present.filter((item) => item.correctAfter).length;
  const normalizedSuccesses = present.filter((item) => item.normalizedTextCorrect).length;
  const falseReliableReads = absent.filter((item) => item.falseReliableRead).length;
  const wrongReliableReads = present.filter((item) => item.wrongReliableRead).length;
  const sliceMetrics = Object.fromEntries(
    ["bottom-positioned", "side", "rotated", "vertical", "ordinary-horizontal"].map((slice) => {
      const slicePresent = present.filter((item) => item.slices.includes(slice));
      const successes = slicePresent.filter(
        (item) => item.armSelection?.observation.state !== "NOT_OBSERVED",
      ).length;
      return [slice, wilson(successes, slicePresent.length)];
    }),
  );
  const latencies = evaluable.map((item) => item.latencyMs);
  const caseBehaviorHashes = cases.map((item) => item.behaviorHash ?? `ERROR:${item.caseId}`);
  const completedAt = new Date().toISOString();
  const report = {
    schemaVersion: "issue-149-alcohol-reselection.report.v1",
    experimentId: ALCOHOL_RESELECTION_EXPERIMENT_ID,
    arm,
    runKind,
    enabledInProduction: false,
    baseSha: ALCOHOL_RESELECTION_BASE_SHA,
    preregistrationSha256: ALCOHOL_RESELECTION_PREREGISTRATION_SHA256,
    startedAt,
    completedAt,
    productionParity,
    corpus: {
      governedCaseCount: cases.length,
      evaluableCaseCount: evaluable.length,
      presentAlcoholCaseCount: present.length,
      absenceControlCount: absent.length,
      checksumFamilyCount: new Set(evaluable.map((item) => item.checksumFamily)).size,
    },
    metrics: {
      detectionRecall: wilson(detectionSuccesses, present.length),
      parsedValueAccuracy: wilson(parsedSuccesses, present.length),
      normalizedTextAccuracy: wilson(normalizedSuccesses, present.length),
      falseReliableReads: wilson(falseReliableReads, absent.length),
      wrongReliableReads: wilson(wrongReliableReads, present.length),
      absenceFalsePositiveCount: absent.filter((item) => item.absenceFalsePositive).length,
      correctButConservativeCount: evaluable.filter(
        (item) =>
          item.truth.presence === "present" &&
          item.correctAfter &&
          item.armSelection?.observation.state !== "OBSERVED",
      ).length,
      recoveryContainedTruthCount: evaluable.filter((item) => item.recoveryContainedTruth).length,
      recoveryDiscardedTruthCount: evaluable.filter((item) => item.recoveryDiscardedTruth).length,
      selectorImprovementCount: evaluable.filter((item) => item.improved).length,
      selectorRegressionCount: evaluable.filter((item) => item.regressed).length,
      improvementChecksumFamilies: evaluable
        .filter((item) => item.improved)
        .map((item) => item.checksumFamily),
      regressionChecksumFamilies: evaluable
        .filter((item) => item.regressed)
        .map((item) => item.checksumFamily),
      sliceDetectionRecall: sliceMetrics,
      medianLatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
    },
    hashes: {
      armBehaviorSha256: sha256Bytes(caseBehaviorHashes.join("\n")),
      ocrTraceSetSha256: sha256Bytes(
        cases.map((item) => item.ocrTraceHash ?? `ERROR:${item.caseId}`).join("\n"),
      ),
      brandBehaviorSetSha256: sha256Bytes(
        cases.map((item) => item.brandBehaviorHash ?? `ERROR:${item.caseId}`).join("\n"),
      ),
      warningBehaviorSetSha256: sha256Bytes(
        cases.map((item) => item.warningBehaviorHash ?? `ERROR:${item.caseId}`).join("\n"),
      ),
      productionResponseSetSha256: sha256Bytes(
        cases.map((item) => item.productionResponseSha256 ?? `ERROR:${item.caseId}`).join("\n"),
      ),
    },
    invariants: {
      controlMatchesProductionEveryCase: cases.every(
        (item) => item.extractionError !== null || item.currentSelection !== null,
      ),
      productionParity115Of115:
        productionParity.status === "PASS" &&
        productionParity.matchedCaseCount === 115 &&
        productionParity.mismatches.length === 0,
      productionInputsFrozen: true,
      sellerTruthAvailableToSelection: false,
    },
    cases,
  };

  const paths = outputPaths(arm, runKind);
  mkdirSync(path.dirname(paths.report), { recursive: true });
  writeFileSync(paths.report, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(paths.raw, `${rawLines.join("\n")}\n`);
  process.stdout.write(
    `${JSON.stringify({
      report: path.relative(process.cwd(), paths.report),
      raw: path.relative(process.cwd(), paths.raw),
      evaluable: evaluable.length,
      parity: productionParity.status,
      armBehaviorSha256: report.hashes.armBehaviorSha256,
    })}\n`,
  );
}

await main();
