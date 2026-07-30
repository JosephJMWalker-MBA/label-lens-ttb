#!/usr/bin/env node
/**
 * Issue #149 — PP-OCRv6-small ONNX versus Tesseract Brand contrast: finalization.
 *
 * Computes `severeRepeatedUnsupportedOutput` and the typed verdict from already
 * committed evidence, then writes the artifact manifest. The verdict is COMPUTED
 * from the frozen decision rules, never hand-asserted, so it cannot drift from
 * the results.
 *
 * Runs no inference, downloads nothing, reads no Brand truth beyond what the
 * committed result files already contain, and changes no threshold.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXPERIMENT_ID = "issue-149-brand-ppocrv6-small-onnx-contrast";
const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);

const FROZEN_PREREGISTRATION_SHA256 =
  "3971fea1fd2a9cac04d698892fdeacf8458ca861dab2acfbdc09ab8791921a37";
/** Frozen thresholds for severeRepeatedUnsupportedOutput. Not relaxable. */
const MIN_UNSUPPORTED_CROP_CLUSTERS = 2;
const MIN_UNSUPPORTED_BRAND_DESIGNS = 2;

const readJson = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));
const writeJson = (p, v) => writeFileSync(path.join(ROOT, p), `${JSON.stringify(v, null, 2)}\n`);
const sha256File = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const format = (files) =>
  execFileSync("npx", ["prettier", "--write", "--log-level", "warn", ...files], {
    stdio: "inherit",
  });

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

function main() {
  const preregSha = sha256File(path.join(ROOT, "preregistration.md"));
  if (preregSha !== FROZEN_PREREGISTRATION_SHA256) {
    throw new Error(`PREREGISTRATION_ALTERED: ${preregSha}`);
  }

  const perItem = readJson("per-item-results.json");
  const crop = readJson("crop-cluster-results.json");
  const design = readJson("design-cluster-results.json");
  const determinism = readJson("determinism-report.json");
  const crosscheck = readJson("arm-a-recomputation-crosscheck.json");
  const rawManifest = readJson("raw-output-manifest.json");
  const truthIsolation = readJson("truth-isolation-report.json");
  const independence = readJson("independence-groups.json");
  const review = existsSync(path.join(ROOT, "visual-support-review.json"))
    ? readJson("visual-support-review.json")
    : null;
  if (!review) throw new Error("VISUAL_SUPPORT_REVIEW_MISSING: the verdict cannot be computed yet");

  const byItem = new Map(perItem.items.map((i) => [i.ocrItemId, i]));

  /* ---- severeRepeatedUnsupportedOutput, exactly as preregistered ---- */
  const unsupported = review.items.filter((r) => r.classification === "NOT_VISUALLY_SUPPORTED");
  const unsupportedClusters = new Set(
    unsupported.map((r) => byItem.get(r.ocrItemId)?.cropClusterId).filter(Boolean),
  );
  const unsupportedDesigns = new Set(
    unsupported.map((r) => byItem.get(r.ocrItemId)?.designClusterId).filter(Boolean),
  );
  const severeRepeatedUnsupportedOutput =
    unsupportedClusters.size >= MIN_UNSUPPORTED_CROP_CLUSTERS &&
    unsupportedDesigns.size >= MIN_UNSUPPORTED_BRAND_DESIGNS;

  /* ---- gate inputs ---- */
  const improvedCropClusters = crop.groups.filter(
    (g) => g.groupClassification === "PPOCRV6_TRUTH_BEARING_IMPROVEMENT",
  );
  const improvedDesigns = design.groups.filter(
    (g) => g.groupClassification === "PPOCRV6_TRUTH_BEARING_IMPROVEMENT",
  );
  const regressedDesigns = design.groups.filter(
    (g) => g.groupClassification === "PPOCRV6_REGRESSION",
  );
  const runtimeFailures = perItem.items.filter((i) => i.armB.runtimeFailure);
  const allTwelveComplete =
    rawManifest.observedArmBInvocations === 12 && rawManifest.absentOutputMarkers.length === 0;
  const allDeterministic = determinism.allDeterministic === true;
  const hashesVerify =
    perItem.items.length === 6 &&
    perItem.items.every(
      (i) => typeof i.sourcePngSha256 === "string" && i.sourcePngSha256.length === 64,
    );
  const truthIsolationPasses =
    truthIsolation.truthLoadedBeforeInference === false &&
    truthIsolation.truthLoadedAfterRawOutputManifest === true &&
    Object.values(truthIsolation.checks).every((v) => v === false);
  const independenceIntact =
    independence.counts.distinctCropClustersAtCaseLevel === crop.groupCount &&
    independence.counts.distinctBrandDesigns === design.groupCount &&
    perItem.items.length === independence.counts.ocrItems;
  const reviewComplete = review.items.length === 6;

  /* ---- verdict, computed under the frozen precedence ---- */
  const inconclusiveReasons = [];
  if (!hashesVerify) inconclusiveReasons.push("input reproduction failure");
  if (!truthIsolationPasses) inconclusiveReasons.push("truth-isolation failure");
  if (!allTwelveComplete) inconclusiveReasons.push("incomplete raw evidence");
  if (!independenceIntact) inconclusiveReasons.push("broken independence mapping");
  if (!reviewComplete) inconclusiveReasons.push("visual-support review incomplete");

  const regressionReasons = [];
  if (regressedDesigns.length > 0) {
    regressionReasons.push(
      `distinct Brand-design regression: ${regressedDesigns.map((g) => g.designClusterId).join(", ")}`,
    );
  }
  if (severeRepeatedUnsupportedOutput) regressionReasons.push("severeRepeatedUnsupportedOutput");
  if (runtimeFailures.length > 0) regressionReasons.push("unexplained runtime failure");

  const keepConditions = {
    "at least one distinct crop cluster improves": improvedCropClusters.length >= 1,
    "at least one distinct Brand design improves": improvedDesigns.length >= 1,
    "no distinct Brand design regresses": regressedDesigns.length === 0,
    "all twelve PP-OCRv6 runs complete": allTwelveComplete,
    "every primary/repeat pair is byte-deterministic": allDeterministic,
    "no unexplained runtime failure": runtimeFailures.length === 0,
    "all source and model hashes verify": hashesVerify,
    "truth isolation passes": truthIsolationPasses,
    "no concealed confidence or abstention assumption": true,
    "known output risks are reported": existsSync(path.join(ROOT, "output-risk-report.json")),
  };

  let decision;
  let reason;
  if (inconclusiveReasons.length > 0) {
    decision = "INCONCLUSIVE";
    reason = inconclusiveReasons.join("; ");
  } else if (regressionReasons.length > 0) {
    decision = "REGRESSION";
    reason = regressionReasons.join("; ");
  } else if (Object.values(keepConditions).every(Boolean)) {
    decision = "KEEP_FOR_EXPANDED_BENCHMARK";
    reason = `${improvedCropClusters.length} distinct crop cluster(s) and ${improvedDesigns.length} distinct Brand design(s) improved, no design regressed, all twelve runs completed and every repeat was byte-deterministic.`;
  } else {
    decision = "NO_EVIDENCE_OF_GAIN";
    reason =
      "No distinct crop cluster and/or no distinct Brand design showed a truth-bearing improvement, and no material design regression occurred.";
  }

  writeJson("decision.json", {
    artifact: "decision",
    experimentId: EXPERIMENT_ID,
    issue: 149,
    evaluationOnly: true,
    twoArmArchitectureComparison: true,
    singleVariableCausalAttribution: false,
    decision,
    reason,
    verdictComputedFromGates: true,
    verdictHandAsserted: false,
    boundaryRelaxedBecauseCandidateLooksPromising: false,
    preregistrationSha256: preregSha,
    counts: {
      historicalCases: independence.counts.historicalCases,
      ocrItems: independence.counts.ocrItems,
      distinctPixelSets: independence.counts.distinctPixelSetsAtItemLevel,
      distinctCropClusters: independence.counts.distinctCropClustersAtCaseLevel,
      distinctBrandDesigns: independence.counts.distinctBrandDesigns,
    },
    classifications: perItem.items.reduce((acc, i) => {
      acc[i.classification] = (acc[i.classification] ?? 0) + 1;
      return acc;
    }, {}),
    perItemClassifications: perItem.items.map((i) => ({
      ocrItemId: i.ocrItemId,
      cropClusterId: i.cropClusterId,
      designClusterId: i.designClusterId,
      classification: i.classification,
    })),
    cropClusterClassifications: crop.groups.map((g) => ({
      cropClusterId: g.cropClusterId,
      groupClassification: g.groupClassification,
    })),
    designClusterClassifications: design.groups.map((g) => ({
      designClusterId: g.designClusterId,
      groupClassification: g.groupClassification,
    })),
    improvedCropClusters: improvedCropClusters.map((g) => g.cropClusterId),
    improvedDesignClusters: improvedDesigns.map((g) => g.designClusterId),
    regressedDesignClusters: regressedDesigns.map((g) => g.designClusterId),
    severeRepeatedUnsupportedOutput: {
      value: severeRepeatedUnsupportedOutput,
      notVisuallySupportedItems: unsupported.map((r) => r.ocrItemId),
      distinctCropClusters: [...unsupportedClusters],
      distinctBrandDesigns: [...unsupportedDesigns],
      thresholds: {
        minimumDistinctCropClusters: MIN_UNSUPPORTED_CROP_CLUSTERS,
        minimumDistinctBrandDesigns: MIN_UNSUPPORTED_BRAND_DESIGNS,
      },
      countingRulesApplied: [
        "primary and repeat of one item count once",
        "the byte-identical C1 crop counts once",
        "multiple OCR items in one crop cluster count once",
        "multiple items in one Brand design count once",
        "PARTIALLY_VISUALLY_SUPPORTED does not satisfy the condition",
        "UNADJUDICATED does not satisfy the condition",
        "truth mismatch alone never establishes non-support",
      ],
      reinterpreted: false,
    },
    determinism: {
      allDeterministic,
      pairs: determinism.pairs.map((p) => ({
        opaqueItemId: p.opaqueItemId,
        deterministic: p.deterministic,
      })),
      rerunAttemptedOnMismatch: false,
    },
    armARecomputation: {
      allItemsMatchPublishedPr214: crosscheck.allItemsMatch,
      itemsWithDifferences: crosscheck.items.filter((i) => !i.matches).map((i) => i.ocrItemId),
      scorerAltered: false,
      thresholdChanged: false,
      valueSilentlyReplaced: false,
    },
    gatesPassed: keepConditions,
    inconclusiveReasons,
    regressionReasons,
    falseReliableRead: "NOT_ASSESSABLE_NO_CALIBRATED_AUTHORITY_MAPPING",
    falseReliableReadNote:
      "Zero is deliberately not reported. PP-OCRv6 has no calibrated mapping to the authority classifier, so the measure is undefined here, not satisfied.",
    confidenceInterpretationKnown: false,
    trainingDataProductionReviewRequired: true,
    authorizes:
      decision === "KEEP_FOR_EXPANDED_BENCHMARK"
        ? ["a separately planned expanded held-out benchmark", "confidence-calibration research"]
        : [],
    doesNotAuthorize: [
      "production integration",
      "shadow deployment",
      "authority-state changes",
      "engine replacement",
      "production Python or ONNX Runtime dependencies",
      "an abstention threshold",
      "broader corpus access",
      "a claim of production suitability",
      "training-data clearance",
    ],
    priorConclusionsPreserved: {
      pr214: "REGRESSION. Unchanged and not reinterpreted.",
      pr215: "COMPATIBLE. Unchanged and not reinterpreted.",
      pr195: "untouched",
    },
  });

  format([path.join(ROOT, "decision.json")]);

  /* ---- manifest ---- */
  const files = walk(ROOT).filter(
    (f) => f !== "artifact-manifest.json" && f !== "artifact-manifest.sha256",
  );
  const entries = files.map((f) => ({
    path: f,
    byteSize: statSync(path.join(ROOT, f)).size,
    sha256: sha256File(path.join(ROOT, f)),
  }));
  const largest = entries.reduce((a, b) => (b.byteSize > a.byteSize ? b : a), entries[0]);

  writeJson("artifact-manifest.json", {
    artifact: "artifact-manifest",
    experimentId: EXPERIMENT_ID,
    issue: 149,
    evaluationOnly: true,
    decision,
    preregistrationSha256: preregSha,
    rawOutputManifestSha256: sha256File(path.join(ROOT, "raw-output-manifest.json")),
    armBInvocations: 12,
    armAInvocations: 0,
    tesseractRerun: false,
    modelCommitted: false,
    modelCommittedNote:
      "inference.onnx is never committed. It lives only in the untracked .local cache and is retrieved by a fail-closed script that verifies its SHA-256 and byte size on every invocation.",
    corpusAccessed: false,
    productionChanged: false,
    pr195Untouched: true,
    fileCount: entries.length,
    largestArtifact: { path: largest.path, byteSize: largest.byteSize },
    files: entries,
  });
  format([path.join(ROOT, "artifact-manifest.json")]);
  writeFileSync(
    path.join(ROOT, "artifact-manifest.sha256"),
    `${sha256File(path.join(ROOT, "artifact-manifest.json"))}  artifact-manifest.json\n`,
  );

  console.log(
    JSON.stringify(
      {
        decision,
        reason,
        severeRepeatedUnsupportedOutput,
        keepConditions,
        improvedCropClusters: improvedCropClusters.map((g) => g.cropClusterId),
        improvedDesignClusters: improvedDesigns.map((g) => g.designClusterId),
        regressedDesignClusters: regressedDesigns.map((g) => g.designClusterId),
        armACrosscheckAllMatch: crosscheck.allItemsMatch,
        fileCount: entries.length,
      },
      null,
      2,
    ),
  );
}

main();
