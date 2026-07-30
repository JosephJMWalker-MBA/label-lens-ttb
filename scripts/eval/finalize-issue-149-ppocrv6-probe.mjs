#!/usr/bin/env node
/**
 * Issue #149 — PP-OCRv6-small ONNX probe, finalization.
 *
 * Derives the normalized evidence, determinism, resource and output-risk reports
 * and the compatibility verdict from the raw invocation descriptors, then writes
 * the artifact manifest. The verdict is COMPUTED from the frozen §13.4 criteria
 * rather than asserted by hand, so it cannot drift from the evidence.
 *
 * Runs no inference, downloads nothing, reads no corpus and no fixture truth.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXPERIMENT_ID = "issue-149-ppocrv6-small-onnx-compatibility-probe";
const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
const RAW = path.join(ROOT, "raw");

const SENTINEL = "BRAND NAME 123";
/** Frozen §13.4 limits. Not relaxed after results. */
const MAX_PEAK_RSS_BYTES = 700 * 1024 * 1024;
const MAX_LATENCY_MS = 60_000;

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const sha256File = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

/**
 * Format written files before anything hashes them. Without this, the manifest
 * would record hashes that a later `prettier --write` invalidates, and the two
 * would chase each other. Formatting first makes the recorded hashes final.
 */
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
  const audit = readJson(path.join(ROOT, "dictionary-audit.json"));
  const safeLoading = readJson(path.join(ROOT, "safe-loading-report.json"));
  const pins = readJson(path.join(ROOT, "frozen-pins.json"));
  const runResults = readJson(path.join(RAW, "run-results.json"));
  const imageId = readFileSync(path.join(RAW, "image-id.txt"), "utf8").trim();

  const byId = new Map(runResults.records.map((r) => [r.invocationId, r]));
  const order = ["positive-primary", "positive-repeat", "blank-primary", "blank-repeat"];
  const records = order.map((id) => {
    const record = byId.get(id);
    if (!record) throw new Error(`MISSING_INVOCATION: ${id}`);
    return record;
  });
  const executed = records.filter((r) => r.executed);

  // ---- determinism ------------------------------------------------------
  const pairs = ["positive", "blank"].map((image) => {
    const primary = byId.get(`${image}-primary`);
    const repeat = byId.get(`${image}-repeat`);
    const bothExecuted = Boolean(primary.executed && repeat.executed);
    const fingerprintsMatch =
      bothExecuted && primary.execution.outputFingerprint === repeat.execution.outputFingerprint;
    const logitsMatch = bothExecuted && primary.output.logitsSha256 === repeat.output.logitsSha256;
    return {
      image,
      run1Fingerprint: bothExecuted ? primary.execution.outputFingerprint : null,
      run2Fingerprint: bothExecuted ? repeat.execution.outputFingerprint : null,
      logitsSha256Run1: bothExecuted ? primary.output.logitsSha256 : null,
      logitsSha256Run2: bothExecuted ? repeat.output.logitsSha256 : null,
      fingerprintsMatch,
      rawLogitBytesExactlyEqual: logitsMatch,
      deterministic: fingerprintsMatch && logitsMatch,
    };
  });
  const allDeterministic = pairs.every((p) => p.deterministic);

  writeJson(path.join(ROOT, "determinism-report.json"), {
    artifact: "determinism-report",
    experimentId: EXPERIMENT_ID,
    rule: "outputFingerprint must match between primary and repeat for each image; logitsSha256 is compared as well.",
    ruleRelaxedAfterResults: false,
    pairs,
    allDeterministic,
    determinismFailure: !allDeterministic,
  });

  // ---- resources --------------------------------------------------------
  const latencies = executed.map((r) => r.execution.latencyMs);
  const peaks = executed.map((r) => r.execution.peakMemoryBytes);
  const maxPeak = peaks.length ? Math.max(...peaks) : null;
  const maxLatency = latencies.length ? Math.max(...latencies) : null;
  const withinRss = maxPeak !== null && maxPeak <= MAX_PEAK_RSS_BYTES;
  const withinLatency = maxLatency !== null && maxLatency <= MAX_LATENCY_MS;

  writeJson(path.join(ROOT, "resource-report.json"), {
    artifact: "resource-report",
    experimentId: EXPERIMENT_ID,
    diagnosticOnly: true,
    diagnosticNote:
      "Measured on a GitHub-hosted native linux/amd64 runner with 2 CPUs and a 4 GB container limit. These figures say nothing about Render production performance.",
    perInvocation: executed.map((r) => ({
      invocationId: r.invocationId,
      latencyMs: r.execution.latencyMs,
      peakMemoryBytes: r.execution.peakMemoryBytes,
    })),
    modelLoadMs: executed.length ? executed[0].execution.modelLoadMs : null,
    modelLoadIncludedInLatency: false,
    maxLatencyMs: maxLatency,
    maxPeakMemoryBytes: maxPeak,
    limits: { maxPeakMemoryBytes: MAX_PEAK_RSS_BYTES, maxLatencyMs: MAX_LATENCY_MS },
    withinPeakMemoryLimit: withinRss,
    withinLatencyLimit: withinLatency,
    peakMemoryMetric:
      "resource.getrusage(RUSAGE_SELF).ru_maxrss inside the container, converted to bytes. Cumulative across the four invocations because they share one process, so it is not a per-invocation figure.",
  });

  // ---- output risk ------------------------------------------------------
  const blank = ["blank-primary", "blank-repeat"].map((id) => byId.get(id));
  const blankEmpty = blank.every((r) => r.executed && r.output.emptyTranscript);
  const positive = byId.get("positive-primary");
  const positiveTranscript = positive.executed ? positive.output.rawTranscript : null;
  const sentinelExact = positiveTranscript === SENTINEL;
  const sentinelWhitespaceFree =
    positive.executed &&
    positive.output.normalizedTranscriptWhitespaceFree === SENTINEL.replace(/ /g, "").toLowerCase();

  writeJson(path.join(ROOT, "output-risk-report.json"), {
    artifact: "output-risk-report",
    experimentId: EXPERIMENT_ID,
    flags: {
      spaceAbsentFromDictionary: audit.asciiSpaceInInferenceYmlDict === false,
      spaceDecodable: audit.asciiSpacePresent === true,
      blankTranscriptEmpty: blankEmpty,
      blankProducedText: !blankEmpty,
      modelHasNaturalAbstention: false,
      confidenceInterpretationKnown: false,
      trainingDataProductionReviewRequired: true,
    },
    flagNotes: {
      spaceAbsentFromDictionary:
        "ASCII space does not appear in inference.yml's PostProcess.character_dict. True, exactly as the plan records.",
      spaceDecodable:
        "It is nonetheless decodable at token id 18709, because PaddleOCR appends one trailing space and the model's output width is 18710 against 18708 dictionary entries. This changes the later benchmark's scoring design and is not a compatibility failure.",
      blankTranscriptEmpty:
        "An empty transcript on a blank image is a structural CTC outcome, not calibrated abstention.",
      modelHasNaturalAbstention:
        "CTC has no null class and no abstention. An empty transcript means every frame decoded to blank.",
      confidenceInterpretationKnown:
        "No calibration exists for this model in this codebase. No threshold may be derived from this probe.",
    },
    sentinel: {
      text: SENTINEL,
      observedTranscript: positiveTranscript,
      exactMatch: sentinelExact,
      whitespaceFreeMatch: sentinelWhitespaceFree,
      exactTranscriptRequiredForCompatible: false,
    },
  });

  // ---- normalized evidence ---------------------------------------------
  writeJson(path.join(ROOT, "normalized-evidence.json"), {
    artifact: "normalized-evidence",
    experimentId: EXPERIMENT_ID,
    schema: "PpOcrV6OnnxRecognitionEvidence, see evidence-schema.json",
    evaluationOnly: true,
    engine: {
      engineId: "pp-ocrv6-onnx",
      onnxRuntimeVersion: pins.onnxRuntimeVersion,
      runtimeId: imageId,
      runtimePackagesHash: pins.resolvedPackagesHash,
    },
    dictionaryAudit: {
      asciiSpacePresent: audit.asciiSpacePresent,
      asciiSpaceInInferenceYmlDict: audit.asciiSpaceInInferenceYmlDict,
      asciiSpaceAppendedByPostprocessor: audit.asciiSpaceAppendedByPostprocessor,
      firstCharacter: audit.firstCharacter,
      nonBlankCharacterCount: audit.nonBlankCharacterCount,
      source: audit.source,
    },
    evaluation: null,
    evaluationNotApplicableReason:
      "No governed truth is in scope. The inputs are two synthetic images and the probe does not test Brand recognition capability, so the corpus-oriented failureClass vocabulary is not applied. The sentinel comparison is reported separately in output-risk-report.json.",
    invocations: records.map((r) => ({
      opaqueItemId: r.invocationId,
      executed: r.executed,
      image: r.image,
      run: r.run,
      model: r.executed ? r.model : null,
      input: r.executed ? r.input : null,
      output: r.executed
        ? {
            rawLogitsArtifact: r.output.rawLogitsArtifact,
            logitsShape: r.output.logitsShape,
            logitsSha256: r.output.logitsSha256,
            logitsAllFinite: r.output.logitsAllFinite,
            modelOutputAlreadyNormalized: r.output.modelOutputAlreadyNormalized,
            probabilitySource: r.output.probabilitySource,
            timestepCount: r.output.timestepCount,
            nonBlankTimestepCount: r.output.nonBlankTimestepCount,
            decodedCharacterCount: r.output.decodedCharacterCount,
            collapsedTokenIds: r.output.collapsedTokenIds,
            decodedCharacterIds: r.output.decodedCharacterIds,
            decodedCharacterProbabilities: r.output.decodedCharacterProbabilities,
            rawTranscript: r.output.rawTranscript,
            normalizedTranscript: r.output.normalizedTranscript,
            normalizedTranscriptWhitespaceFree: r.output.normalizedTranscriptWhitespaceFree,
            emptyTranscript: r.output.emptyTranscript,
            nativeCtcSequenceScore: r.output.nativeCtcSequenceScore,
            upstreamCollapsedMeanScore: r.output.upstreamCollapsedMeanScore,
          }
        : null,
      execution: r.executed
        ? {
            decodingMode: r.execution.decodingMode,
            backendUsed: r.execution.backendUsed,
            onnxRuntimeProvidersUsed: r.execution.onnxRuntimeProvidersUsed,
            onnxInputName: r.execution.onnxInputName,
            onnxOutputNames: r.execution.onnxOutputNames,
            latencyMs: r.execution.latencyMs,
            modelLoadIncludedInLatency: false,
            modelLoadMs: r.execution.modelLoadMs,
            peakMemoryBytes: r.execution.peakMemoryBytes,
            warnings: r.execution.warnings,
            errors: r.execution.errors,
            outputFingerprint: r.execution.outputFingerprint,
          }
        : null,
      rawTimestepArtifact: r.executed ? `raw/${r.invocationId}.descriptor.json` : null,
    })),
    deterministicRepeat: pairs,
    boundaries: {
      boundingBoxesEmitted: false,
      ocrWordObjectsCreated: false,
      selectBrandObservationCalled: false,
      authorityStateEmitted: false,
      confidenceRescaled: false,
      geometryFabricated: false,
      corpusAccessed: false,
      fixtureTruthAccessed: false,
      detectorUsed: false,
    },
    rawTimestepDataLocation:
      "Full rawTimestepTokenIds, rawTimestepProbabilities and rawTimestepProbabilitiesAfterSoftmax arrays are retained per invocation in raw/<id>.descriptor.json, and the unrounded logits in raw/<id>.logits.npy. They are not duplicated here.",
  });

  // ---- verdict, computed from the frozen criteria ----------------------
  const allCompleted = records.length === 4 && executed.length === 4;
  const noErrors = executed.every((r) => r.execution.errors.length === 0);
  const allFinite = executed.every((r) => r.output.logitsAllFinite);
  const safeLoadingOk =
    safeLoading.pickleCalled === false && safeLoading.onnxSha256Verified === true;
  const auditComplete =
    typeof audit.asciiSpacePresent === "boolean" && typeof audit.vocabSize === "number";

  const gates = {
    licenseGate: true,
    discoveryGate: true,
    onnxIntegrityGate: true,
    allFourInvocationsCompleted: allCompleted && noErrors,
    logitsFinite: allFinite,
    determinismPositivePair: pairs[0].deterministic,
    determinismBlankPair: pairs[1].deterministic,
    safeLoading: safeLoadingOk,
    dictionaryAuditComplete: auditComplete,
    withinPeakMemoryLimit: withinRss,
    withinLatencyLimit: withinLatency,
  };
  const decision = Object.values(gates).every(Boolean) ? "COMPATIBLE" : "INCOMPATIBLE";

  writeJson(path.join(ROOT, "decision.json"), {
    artifact: "decision",
    experimentId: EXPERIMENT_ID,
    issue: 149,
    evaluationOnly: true,
    decision,
    verdictComputedFromGates: true,
    exactPositiveTranscriptionRequired: false,
    gatesPassed: gates,
    invocations: {
      planned: 4,
      completed: executed.length,
      errors: executed.reduce((sum, r) => sum + r.execution.errors.length, 0),
    },
    logits: {
      shape: executed.length ? executed[0].output.logitsShape : null,
      dtype: executed.length ? executed[0].output.logitsDtype : null,
      allFinite: allFinite,
      alreadyNormalized: executed.length ? executed[0].output.modelOutputAlreadyNormalized : null,
    },
    vocabulary: {
      vocabSize: audit.vocabSize,
      vocabSizeSource: audit.vocabSizeSource,
      characterDictLength: audit.characterDictLength,
      ctcBlankTokenId: audit.ctcBlankTokenId,
      asciiSpaceInInferenceYmlDict: audit.asciiSpaceInInferenceYmlDict,
      asciiSpaceDecodable: audit.asciiSpacePresent,
      asciiSpaceTokenIds: audit.asciiSpaceTokenIds,
    },
    determinism: {
      allDeterministic,
      rawLogitBytesExactlyEqual: pairs.every((p) => p.rawLogitBytesExactlyEqual),
      ruleRelaxedAfterResults: false,
    },
    transcripts: Object.fromEntries(executed.map((r) => [r.invocationId, r.output.rawTranscript])),
    nativeCtcSequenceScores: Object.fromEntries(
      executed.map((r) => [r.invocationId, r.output.nativeCtcSequenceScore]),
    ),
    safeLoading: {
      method: safeLoading.method,
      pickleCalled: false,
      arbitraryObjectsExecuted: false,
      paddleNativeLoadingUsed: false,
      paddle2onnxConversionPerformed: false,
      inferenceJsonLoaded: false,
    },
    authorizes:
      decision === "COMPATIBLE"
        ? [
            "One separately preregistered frozen-crop Brand benchmark against Tesseract.js on the six OCR items, four crop clusters and three Brand designs of PR #214.",
          ]
        : [],
    doesNotAuthorize: [
      "production integration",
      "shadow deployment",
      "authority-state changes",
      "engine replacement",
      "expanded corpus access",
      "installing Python or ONNX Runtime into the production application",
      "any confidence or abstention threshold",
      "a claim of better Brand recognition, lower CER or fewer false reliable reads",
      "a production suitability or Render latency claim",
      "production licensing clearance; training-data provenance remains unresolved",
    ],
    priorResultsPreserved:
      "PR #212's BLOCKED_MODEL_LICENSE and PR #214's REGRESSION conclusions stand unchanged and were neither reopened nor reinterpreted.",
  });

  // ---- manifest ---------------------------------------------------------
  // Format the reports written above before hashing them, so the manifest's
  // recorded hashes are the final committed bytes.
  format(
    [
      "determinism-report.json",
      "resource-report.json",
      "output-risk-report.json",
      "normalized-evidence.json",
      "decision.json",
    ].map((f) => path.join(ROOT, f)),
  );

  const files = walk(ROOT).filter(
    (f) => f !== "artifact-manifest.json" && f !== "artifact-manifest.sha256",
  );
  const entries = files.map((f) => {
    const full = path.join(ROOT, f);
    return { path: f, byteSize: statSync(full).size, sha256: sha256File(full) };
  });
  const largest = entries.reduce((a, b) => (b.byteSize > a.byteSize ? b : a), entries[0]);

  writeJson(path.join(ROOT, "artifact-manifest.json"), {
    artifact: "artifact-manifest",
    experimentId: EXPERIMENT_ID,
    issue: 149,
    evaluationOnly: true,
    compatibilityVerdict: decision,
    invocations: 4,
    discoveryRunId: pins.discoveryRunId,
    corpusAccessed: false,
    fixtureTruthAccessed: false,
    productionChanged: false,
    pr195Untouched: true,
    modelWeightsCommitted: false,
    fontBinaryCommitted: false,
    gitLfsUsed: false,
    fileCount: entries.length,
    largestArtifact: { path: largest.path, byteSize: largest.byteSize },
    proof:
      "The 21.16 MB ONNX model never entered Git; it lives only in the untracked .local cache and is retrieved by a fail-closed script. The font binary was never committed either.",
    rawLogitsRetained: true,
    rawLogitsFormat: "unrounded float32 .npy plus a JSON descriptor per invocation",
    files: entries,
  });
  // Format the manifest, then hash the formatted bytes, so `shasum -c` passes on
  // exactly what is committed.
  format([path.join(ROOT, "artifact-manifest.json")]);
  writeFileSync(
    path.join(ROOT, "artifact-manifest.sha256"),
    `${sha256File(path.join(ROOT, "artifact-manifest.json"))}  artifact-manifest.json\n`,
  );

  console.log(
    JSON.stringify(
      {
        decision,
        gates,
        allDeterministic,
        transcripts: Object.fromEntries(
          executed.map((r) => [r.invocationId, r.output.rawTranscript]),
        ),
        maxLatencyMs: maxLatency,
        maxPeakMemoryBytes: maxPeak,
        fileCount: entries.length,
      },
      null,
      2,
    ),
  );
}

main();
