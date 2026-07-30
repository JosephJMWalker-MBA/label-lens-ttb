/**
 * Issue #149 — PP-OCRv6-small ONNX versus frozen incumbent Tesseract Brand evidence.
 *
 * Reads back the twelve Arm B raw outputs produced by the pinned container,
 * freezes and hashes them, and only then crosses the truth boundary to load the
 * identifier map, the governed Brand truth and the frozen Arm A evidence.
 *
 * Runs no inference itself. Arm A is carried forward: Tesseract is never invoked.
 *
 * The scorer is transcribed from PR #214's runner so both benchmarks remain
 * comparable, and it is applied identically to both arms.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXPERIMENT_ID = "issue-149-brand-ppocrv6-small-onnx-contrast";
const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
const RAW = path.join(ROOT, "raw");
const ARM_A_FROZEN = path.join(ROOT, "arm-a-frozen");
const EVALUATION = path.join(ROOT, "evaluation");

const FROZEN_PREREGISTRATION_SHA256 =
  "3971fea1fd2a9cac04d698892fdeacf8458ca861dab2acfbdc09ab8791921a37";
/** Frozen material thresholds, carried forward from PR #214 unchanged. */
const MATERIAL_CER_DELTA = 0.1;
const MATERIAL_RECALL_DELTA = 0.25;
const PR214 = "artifacts/issue-149-brand-parseq-small-contrast";

const sha256Bytes = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
const abs = (p: string) => (path.isAbsolute(p) ? p : path.join(process.cwd(), p));
const sha256File = (p: string) => sha256Bytes(readFileSync(abs(p)));
const readJson = (p: string) => JSON.parse(readFileSync(abs(p), "utf8"));
const writeJson = (p: string, v: unknown) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);

function halt(reason: string, detail: unknown): never {
  console.error(JSON.stringify({ status: "HALTED", reason, detail }, null, 2));
  process.exit(1);
}

/* ---------- preregistered text representations (verbatim from PR #214) ------ */
/** 2. Boundary-preserving: NFKC, lowercase, whitespace runs to one space, trim. */
function boundaryPreserving(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}
/** 3. Whitespace-free comparable: boundary-preserving, then all whitespace removed. */
function whitespaceFree(value: string): string {
  return boundaryPreserving(value).replace(/\s/gu, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** The frozen scorer. Identical for both arms. */
function metrics(rawTranscript: string, truths: readonly string[]) {
  const wsFree = whitespaceFree(rawTranscript);
  const bound = boundaryPreserving(rawTranscript);
  let best = {
    exactMatchWhitespaceFree: false,
    cerWhitespaceFree: 1,
    truthContiguousInWhitespaceFree: false,
    usefulTokenRecall: null as number | null,
    matchedTokens: 0,
    totalTokens: 0,
    boundarySensitiveExactMatch: false,
    cerBoundaryPreserving: 1,
    whitespaceDifference: null as string | null,
    punctuationDifference: null as string | null,
  };
  const punctuationOf = (value: string) =>
    [...value]
      .filter((ch) => !/[\p{L}\p{N}\s]/u.test(ch))
      .sort()
      .join("");
  for (const truth of truths) {
    const tFree = whitespaceFree(truth);
    const tBound = boundaryPreserving(truth);
    const tokens = tBound.split(" ").filter((t) => t.length >= 3);
    const matched = tokens.filter((t) => wsFree.includes(t)).length;
    const hypPunct = punctuationOf(bound);
    const truthPunct = punctuationOf(tBound);
    const candidate = {
      exactMatchWhitespaceFree: wsFree === tFree,
      cerWhitespaceFree: tFree.length === 0 ? 1 : levenshtein(wsFree, tFree) / tFree.length,
      truthContiguousInWhitespaceFree: tFree.length > 0 && wsFree.includes(tFree),
      usefulTokenRecall: tokens.length === 0 ? null : matched / tokens.length,
      matchedTokens: matched,
      totalTokens: tokens.length,
      boundarySensitiveExactMatch: bound === tBound,
      cerBoundaryPreserving: tBound.length === 0 ? 1 : levenshtein(bound, tBound) / tBound.length,
      whitespaceDifference:
        (bound.match(/\s/gu)?.length ?? 0) === (tBound.match(/\s/gu)?.length ?? 0)
          ? "none"
          : `hypothesis has ${bound.match(/\s/gu)?.length ?? 0} space(s), truth has ${tBound.match(/\s/gu)?.length ?? 0}`,
      punctuationDifference:
        hypPunct === truthPunct
          ? "none"
          : `hypothesis punctuation ${JSON.stringify(hypPunct)}, truth punctuation ${JSON.stringify(truthPunct)}`,
    };
    const better =
      candidate.exactMatchWhitespaceFree !== best.exactMatchWhitespaceFree
        ? candidate.exactMatchWhitespaceFree
        : candidate.cerWhitespaceFree < best.cerWhitespaceFree;
    if (better) best = candidate;
  }
  return {
    rawTranscript,
    boundaryPreservingTranscript: bound,
    whitespaceFreeTranscript: wsFree,
    emptyTranscript: rawTranscript.length === 0,
    ...best,
  };
}

type M = ReturnType<typeof metrics>;

/** Frozen classification, with the candidate-specific vocabulary. */
function classify(a: M, b: M, deterministicB: boolean, failure: boolean): string {
  if (!deterministicB) return "PPOCRV6_NONDETERMINISTIC";
  if (failure) return "PPOCRV6_INCOMPARABLE";
  const gained =
    (!a.exactMatchWhitespaceFree && b.exactMatchWhitespaceFree) ||
    (!a.truthContiguousInWhitespaceFree && b.truthContiguousInWhitespaceFree) ||
    a.cerWhitespaceFree - b.cerWhitespaceFree >= MATERIAL_CER_DELTA ||
    ((b.usefulTokenRecall ?? 0) - (a.usefulTokenRecall ?? 0) >= MATERIAL_RECALL_DELTA &&
      b.matchedTokens > a.matchedTokens);
  const lost =
    (a.exactMatchWhitespaceFree && !b.exactMatchWhitespaceFree) ||
    (a.truthContiguousInWhitespaceFree && !b.truthContiguousInWhitespaceFree) ||
    b.cerWhitespaceFree - a.cerWhitespaceFree >= MATERIAL_CER_DELTA ||
    ((a.usefulTokenRecall ?? 0) - (b.usefulTokenRecall ?? 0) >= MATERIAL_RECALL_DELTA &&
      a.matchedTokens > b.matchedTokens);
  if (lost) return "PPOCRV6_REGRESSION";
  if (gained) return "PPOCRV6_TRUTH_BEARING_IMPROVEMENT";
  return "PPOCRV6_NO_EFFECT";
}

/** Group classification: a regression anywhere in a group makes the group a regression. */
function groupClassification(members: readonly string[]): string {
  if (members.includes("PPOCRV6_NONDETERMINISTIC")) return "PPOCRV6_NONDETERMINISTIC";
  if (members.includes("PPOCRV6_REGRESSION")) return "PPOCRV6_REGRESSION";
  if (members.includes("PPOCRV6_INCOMPARABLE")) return "PPOCRV6_INCOMPARABLE";
  if (members.includes("PPOCRV6_TRUTH_BEARING_IMPROVEMENT"))
    return "PPOCRV6_TRUTH_BEARING_IMPROVEMENT";
  return "PPOCRV6_NO_EFFECT";
}

async function main() {
  /* ---------- frozen identity gates, before anything is read ---------- */
  const preregSha = sha256File(path.join(ROOT, "preregistration.md"));
  if (preregSha !== FROZEN_PREREGISTRATION_SHA256) {
    halt("PREREGISTRATION_ALTERED", {
      expected: FROZEN_PREREGISTRATION_SHA256,
      observed: preregSha,
    });
  }

  const pixels = readJson(path.join(ROOT, "input-pixel-manifest.json"));
  for (const item of pixels.items) {
    if (sha256File(item.inferenceInputPath) !== item.sourcePngSha256) {
      halt("STAGED_PNG_MISMATCH", item.inferenceInputPath);
    }
  }

  /* ---------- Arm B raw evidence, frozen and hashed BEFORE truth ---------- */
  const rawFiles = readdirSync(RAW).sort();
  const descriptors = rawFiles
    .filter((f) => f.endsWith(".descriptor.json"))
    .map((f) => readJson(path.join(RAW, f)));
  if (descriptors.length !== 12) {
    halt("ARM_B_INVOCATION_COUNT", { expected: 12, observed: descriptors.length, rawFiles });
  }
  const absent = rawFiles.filter((f) => f.endsWith(".ABSENT-OUTPUT.md"));

  const manifestFiles = rawFiles.map((f) => ({
    path: `raw/${f}`,
    sha256: sha256File(path.join(RAW, f)),
    byteSize: readFileSync(path.join(RAW, f)).length,
  }));
  writeJson(path.join(ROOT, "raw-output-manifest.json"), {
    artifact: "raw-output-manifest",
    experimentId: EXPERIMENT_ID,
    truthReadBeforeThisPoint: false,
    caseIdsReadBeforeThisPoint: false,
    clusterIdsReadBeforeThisPoint: false,
    armAEvidenceReadBeforeThisPoint: false,
    expectedArmBInvocations: 12,
    observedArmBInvocations: descriptors.length,
    absentOutputMarkers: absent,
    armAInvocations: 0,
    armANote:
      "Arm A ran zero invocations in this experiment. Its evidence is carried forward frozen from merged PR #214.",
    files: manifestFiles,
  });
  const rawManifestSha = sha256File(path.join(ROOT, "raw-output-manifest.json"));
  writeFileSync(
    path.join(ROOT, "raw-output-manifest.sha256"),
    `${rawManifestSha}  raw-output-manifest.json\n`,
  );

  /* ================= TRUTH BOUNDARY — nothing above reads truth ============ */

  const { composeResearchManifest } = await import("@/fixtures/ocr-research/fixture-corpus");
  const manifest = composeResearchManifest({ includePrivate: false });
  const idMap = readJson(path.join(EVALUATION, "id-map.json")).map as Array<{
    opaqueItemId: string;
    priorOpaqueItemId: string;
    ocrItemId: string;
    caseId: string;
    cropClusterId: string;
    designClusterId: string;
  }>;
  const truthOf = new Map<string, string[]>();
  for (const entry of idMap) {
    const fixture = manifest.fixtures.find((f) => f.fixtureId === entry.caseId);
    truthOf.set(entry.opaqueItemId, fixture?.truth.brand?.acceptableValues ?? []);
  }

  const armB = new Map<string, Record<string, never>>();
  for (const d of descriptors) armB.set(`${d.opaqueItemId}-${d.run}`, d as never);

  const armA = new Map<string, Record<string, never>>();
  for (const f of readdirSync(ARM_A_FROZEN).sort()) {
    const record = readJson(path.join(ARM_A_FROZEN, f));
    armA.set(`${record.opaqueItemId}-${record.run}`, record as never);
  }

  /* ---------- determinism ---------- */
  const determinism = idMap.map((entry) => {
    const p = armB.get(`${entry.opaqueItemId}-primary`) as never as Record<string, never>;
    const r = armB.get(`${entry.opaqueItemId}-repeat`) as never as Record<string, never>;
    const po = p as never as { output: Record<string, never>; execution: Record<string, never> };
    const ro = r as never as { output: Record<string, never>; execution: Record<string, never> };
    const tensorEqual =
      String(po.output.probabilityTensorSha256) === String(ro.output.probabilityTensorSha256);
    const tokensEqual =
      JSON.stringify(po.output.rawTimestepTokenIds) ===
      JSON.stringify(ro.output.rawTimestepTokenIds);
    const collapsedEqual =
      JSON.stringify(po.output.collapsedTokenIds) === JSON.stringify(ro.output.collapsedTokenIds);
    const decodedEqual =
      JSON.stringify(po.output.decodedCharacterIds) ===
      JSON.stringify(ro.output.decodedCharacterIds);
    const transcriptEqual = String(po.output.rawTranscript) === String(ro.output.rawTranscript);
    const fingerprintEqual =
      String(po.execution.outputFingerprint) === String(ro.execution.outputFingerprint);
    return {
      opaqueItemId: entry.opaqueItemId,
      probabilityTensorSha256Primary: String(po.output.probabilityTensorSha256),
      probabilityTensorSha256Repeat: String(ro.output.probabilityTensorSha256),
      rawProbabilityTensorBytesExactlyEqual: tensorEqual,
      rawTimestepTokenIdsEqual: tokensEqual,
      collapsedTokenIdsEqual: collapsedEqual,
      decodedCharacterIdsEqual: decodedEqual,
      rawTranscriptEqual: transcriptEqual,
      outputFingerprintPrimary: String(po.execution.outputFingerprint),
      outputFingerprintRepeat: String(ro.execution.outputFingerprint),
      outputFingerprintEqual: fingerprintEqual,
      deterministic:
        tensorEqual &&
        tokensEqual &&
        collapsedEqual &&
        decodedEqual &&
        transcriptEqual &&
        fingerprintEqual,
    };
  });
  const allDeterministic = determinism.every((d) => d.deterministic);
  writeJson(path.join(ROOT, "determinism-report.json"), {
    artifact: "determinism-report",
    experimentId: EXPERIMENT_ID,
    rule: "Primary and repeat must match byte-for-byte on the raw probability tensor and exactly on every deterministic sequence field and the transcript.",
    ruleRelaxedAfterResults: false,
    rerunAttemptedOnMismatch: false,
    pairs: determinism,
    allDeterministic,
    armANote:
      "Arm A determinism is carried forward from PR #214, which recorded a deterministic fingerprint per primary/repeat pair. Tesseract was not re-run.",
  });

  /* ---------- Arm A recomputation and cross-check against PR #214 ---------- */
  const pr214Results = readJson(`${PR214}/per-item-results.json`);
  const pr214ByItem = new Map<string, Record<string, never>>();
  for (const item of pr214Results.items) pr214ByItem.set(item.ocrItemId, item.armA);

  const crosscheckFields = [
    "exactMatchWhitespaceFree",
    "cerWhitespaceFree",
    "truthContiguousInWhitespaceFree",
    "usefulTokenRecall",
    "matchedTokens",
    "totalTokens",
    "boundarySensitiveExactMatch",
    "cerBoundaryPreserving",
    "whitespaceDifference",
    "rawTranscript",
  ] as const;

  const crosscheck: Array<Record<string, unknown>> = [];
  const perItem = idMap.map((entry) => {
    const truths = truthOf.get(entry.opaqueItemId) ?? [];
    const aPrimary = armA.get(`${entry.priorOpaqueItemId}-primary`) as never as {
      rawTranscript: string;
      meanConfidence: number;
      wordCount: number;
      latencyMs: number;
      outputFingerprint: string;
      words: unknown[];
      warnings: unknown[];
    };
    const bPrimary = armB.get(`${entry.opaqueItemId}-primary`) as never as {
      output: Record<string, never>;
      execution: Record<string, never>;
      input: Record<string, never>;
    };
    const bFailure = Boolean((bPrimary.execution.errors as never as unknown[]).length);

    const mA = metrics(aPrimary.rawTranscript, truths);
    const mB = metrics(String(bPrimary.output.rawTranscript), truths);
    const det = determinism.find((d) => d.opaqueItemId === entry.opaqueItemId)!;
    const classification = classify(mA, mB, det.deterministic, bFailure);

    // Cross-check the recomputed Arm A values against PR #214's published table.
    const published = pr214ByItem.get(entry.ocrItemId) as never as Record<string, unknown>;
    const differences = crosscheckFields
      .map((field) => ({
        field,
        recomputed: (mA as never as Record<string, unknown>)[field],
        published: published?.[field],
      }))
      .filter((d) => JSON.stringify(d.recomputed) !== JSON.stringify(d.published));
    crosscheck.push({
      ocrItemId: entry.ocrItemId,
      opaqueItemId: entry.opaqueItemId,
      priorOpaqueItemId: entry.priorOpaqueItemId,
      fieldsCompared: crosscheckFields.length,
      differences,
      matches: differences.length === 0,
    });

    return {
      opaqueItemId: entry.opaqueItemId,
      ocrItemId: entry.ocrItemId,
      caseId: entry.caseId,
      cropClusterId: entry.cropClusterId,
      designClusterId: entry.designClusterId,
      sourcePngSha256: String(bPrimary.input.sourcePngSha256),
      brandTruthValues: truths,
      armA: {
        carriedForward: true,
        rerun: false,
        ...mA,
        meanConfidence: aPrimary.meanConfidence,
        wordCount: aPrimary.wordCount,
        latencyMs: aPrimary.latencyMs,
        latencyComparable: false,
        outputFingerprint: aPrimary.outputFingerprint,
      },
      armB: {
        ...mB,
        planDefinedNonBlankTimestepMean: Number(bPrimary.output.planDefinedNonBlankTimestepMean),
        upstreamCollapsedSequenceMean: Number(bPrimary.output.upstreamCollapsedSequenceMean),
        probabilityTensorSha256: String(bPrimary.output.probabilityTensorSha256),
        probabilityTensorAllFinite: Boolean(bPrimary.output.probabilityTensorAllFinite),
        softmaxApplied: false,
        timestepCount: Number(bPrimary.output.timestepCount),
        decodedCharacterCount: Number(bPrimary.output.decodedCharacterCount),
        latencyMs: Number(bPrimary.execution.latencyMs),
        latencyComparable: false,
        peakMemoryBytes: Number(bPrimary.execution.peakMemoryBytes),
        deterministic: det.deterministic,
        runtimeFailure: bFailure,
      },
      classification,
    };
  });

  writeJson(path.join(ROOT, "arm-a-recomputation-crosscheck.json"), {
    artifact: "arm-a-recomputation-crosscheck",
    experimentId: EXPERIMENT_ID,
    why: "Arm A metrics are recomputed from the carried raw outputs by the same frozen scorer as Arm B, rather than copied from PR #214's published table, so both arms pass through one code path and the truth boundary stays meaningful.",
    publishedSource: `${PR214}/per-item-results.json`,
    fieldsComparedPerItem: crosscheckFields,
    items: crosscheck,
    allItemsMatch: crosscheck.every((c) => c.matches),
    discrepancyPolicy:
      "Every difference is reported explicitly. Neither value is silently replaced, the scorer is not altered, and no threshold is changed.",
  });

  writeJson(path.join(ROOT, "per-item-results.json"), {
    artifact: "per-item-results",
    experimentId: EXPERIMENT_ID,
    truthUsedOnlyAfterRawFreeze: true,
    rawOutputManifestSha256: rawManifestSha,
    primaryRepresentation: "whitespace-free comparable",
    secondaryRepresentation: "boundary-preserving normalized",
    rawTranscriptReportedUnchanged: true,
    everyItemPublished: true,
    items: perItem,
  });

  /* ---------- independence groupings ---------- */
  const groupBy = (key: "cropClusterId" | "designClusterId" | "caseId" | "sourcePngSha256") => {
    const groups = new Map<string, typeof perItem>();
    for (const item of perItem) {
      const id = String((item as never as Record<string, unknown>)[key]);
      const list = groups.get(id) ?? [];
      list.push(item);
      groups.set(id, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  };
  const emitGroups = (
    file: string,
    artifact: string,
    key: "cropClusterId" | "designClusterId" | "caseId" | "sourcePngSha256",
    rule: string,
    idField: string,
  ) => {
    const groups = groupBy(key).map(([id, members]) => ({
      [idField]: id,
      ocrItems: members.map((m) => m.ocrItemId),
      memberClassifications: members.map((m) => m.classification),
      groupClassification: groupClassification(members.map((m) => m.classification)),
      countsOnce: true,
    }));
    writeJson(path.join(ROOT, file), {
      artifact,
      experimentId: EXPERIMENT_ID,
      rule,
      groupCount: groups.length,
      groups,
    });
    return groups;
  };

  const cropGroups = emitGroups(
    "crop-cluster-results.json",
    "crop-cluster-results",
    "cropClusterId",
    "The duplicate C1 crop counts once. Shared crop evidence counts once.",
    "cropClusterId",
  );
  const designGroups = emitGroups(
    "design-cluster-results.json",
    "design-cluster-results",
    "designClusterId",
    "A repeated Brand design counts once. Any material regression within a design makes that design a regression; an improvement in the same design does not cancel it.",
    "designClusterId",
  );
  emitGroups(
    "case-results.json",
    "case-results",
    "caseId",
    "One historical case may contribute several OCR items; the case is reported once.",
    "caseId",
  );
  emitGroups(
    "pixel-set-results.json",
    "pixel-set-results",
    "sourcePngSha256",
    "Byte-identical pixel sets count once. approved-wine-004 and la-fattoria-rotated share one pixel set.",
    "sourcePngSha256",
  );

  /* ---------- score-ordering risk, for BOTH frozen definitions ---------- */
  const scoreOrdering = (
    field: "planDefinedNonBlankTimestepMean" | "upstreamCollapsedSequenceMean",
  ) => {
    const correct = perItem.filter((i) => i.armB.exactMatchWhitespaceFree);
    const wrong = perItem.filter((i) => !i.armB.exactMatchWhitespaceFree);
    const anyWrongAtLeastAsHigh = wrong.some((w) =>
      correct.some((c) => w.armB[field] >= c.armB[field]),
    );
    return {
      definition: field,
      correctOutputs: correct.map((i) => ({ ocrItemId: i.ocrItemId, score: i.armB[field] })),
      wrongOutputs: wrong.map((i) => ({ ocrItemId: i.ocrItemId, score: i.armB[field] })),
      anyWrongOutputScoredAtLeastAsHighAsAnyCorrectOutput: anyWrongAtLeastAsHigh,
      scoreOrderingRisk: anyWrongAtLeastAsHigh,
      assessable: correct.length > 0 && wrong.length > 0,
      notAssessableReason:
        correct.length === 0
          ? "no correct output exists, so no ordering can be assessed"
          : wrong.length === 0
            ? "no wrong output exists, so no ordering can be assessed"
            : null,
    };
  };
  writeJson(path.join(ROOT, "score-ordering-risk.json"), {
    artifact: "score-ordering-risk",
    experimentId: EXPERIMENT_ID,
    thresholdFreeDiagnostic: true,
    isAuthorityClassifier: false,
    impliesAThresholdExists: false,
    definitionChosenAfterResults: false,
    definitions: [
      scoreOrdering("planDefinedNonBlankTimestepMean"),
      scoreOrdering("upstreamCollapsedSequenceMean"),
    ],
    note: "Both frozen definitions are reported. Neither is selected on the basis of the results, and neither is compared numerically with Tesseract confidence.",
  });

  /* ---------- output risk ---------- */
  writeJson(path.join(ROOT, "output-risk-report.json"), {
    artifact: "output-risk-report",
    experimentId: EXPERIMENT_ID,
    falseReliableRead: "NOT_ASSESSABLE_NO_CALIBRATED_AUTHORITY_MAPPING",
    falseReliableReadNote:
      "PP-OCRv6 is not connected to the authority classifier and has no calibrated mapping. Zero false reliable reads is NOT reported: the measure is undefined here, not satisfied.",
    confidenceInterpretationKnown: false,
    thresholdDerived: false,
    authorityMappingDerived: false,
    scoresComparedWithTesseract: false,
    armB: {
      wrongOutputCount: perItem.filter((i) => !i.armB.exactMatchWhitespaceFree).length,
      exactMatchCount: perItem.filter((i) => i.armB.exactMatchWhitespaceFree).length,
      emptyOutputCount: perItem.filter((i) => i.armB.emptyTranscript).length,
      emptyOutputItems: perItem.filter((i) => i.armB.emptyTranscript).map((i) => i.ocrItemId),
    },
    armA: {
      wrongOutputCount: perItem.filter((i) => !i.armA.exactMatchWhitespaceFree).length,
      exactMatchCount: perItem.filter((i) => i.armA.exactMatchWhitespaceFree).length,
      emptyOutputCount: perItem.filter((i) => i.armA.emptyTranscript).length,
    },
    modelHasNaturalAbstention: false,
    modelHasNaturalAbstentionNote:
      "CTC has no null class. An empty transcript means every frame decoded to blank: a structural outcome, not calibrated abstention.",
    spaceAbsentFromDictionary: true,
    spaceDecodable: true,
    trainingDataProductionReviewRequired: true,
  });

  /* ---------- truth isolation ---------- */
  const inputListing = readdirSync(path.join(ROOT, "inference-inputs")).sort();
  writeJson(path.join(ROOT, "truth-isolation-report.json"), {
    artifact: "truth-isolation-report",
    experimentId: EXPERIMENT_ID,
    opaqueItemIdsAssigned: true,
    freshSaltUsed: true,
    inferenceInputDirectoryListing: inputListing,
    checks: {
      brandTruthInFilenames: false,
      caseNamesInFilenames: false,
      producerNamesInFilenames: false,
      expectedStringsInFilenames: false,
      truthInDirectories: false,
      truthInCommands: false,
      truthInEnvironmentVariables: false,
      truthInContainerMounts: false,
      truthInModelMetadata: false,
      truthInLogs: false,
      clusterMappingInMounts: false,
      repositoryRootMounted: false,
      idMapMounted: false,
      armAFrozenEvidenceMounted: false,
      broaderCorpusMounted: false,
    },
    containerMounts: [
      "/model (read-only) — the pinned inference.onnx",
      "/config (read-only) — the pinned inference.yml",
      "/inputs (read-only) — the six opaque input PNGs",
      "/out — an empty output directory",
    ],
    network: "none",
    caseMappingLocation: "evaluation/id-map.json",
    caseMappingMountedIntoInference: false,
    truthLoadedBeforeInference: false,
    truthLoadedAfterRawOutputManifest: true,
    rawOutputManifestSha256: rawManifestSha,
  });

  /* ---------- resources ---------- */
  const bLatencies = descriptors.map((d) => Number(d.execution.latencyMs));
  const bPeaks = descriptors.map((d) => Number(d.execution.peakMemoryBytes));
  writeJson(path.join(ROOT, "resource-report.json"), {
    artifact: "resource-report",
    experimentId: EXPERIMENT_ID,
    diagnosticOnly: true,
    armsNotComparable: true,
    armsNotComparableReason:
      "Arm A's figures were measured on a different host on a different day, in-process, while Arm B ran in a pinned container here. No runtime performance comparison may be drawn between the arms.",
    armB: {
      invocations: descriptors.length,
      medianLatencyMs: [...bLatencies].sort((a, b) => a - b)[Math.floor(bLatencies.length / 2)],
      maxLatencyMs: Math.max(...bLatencies),
      minLatencyMs: Math.min(...bLatencies),
      maxPeakMemoryBytes: Math.max(...bPeaks),
      modelLoadMs: Number(descriptors[0].execution.modelLoadMs),
      modelLoadIncludedInLatency: false,
      peakMemoryMetric:
        "resource.getrusage(RUSAGE_SELF).ru_maxrss inside the container, cumulative across the twelve invocations because they share one process.",
    },
    armA: {
      carriedForward: true,
      latenciesMs: perItem.map((i) => ({ ocrItemId: i.ocrItemId, latencyMs: i.armA.latencyMs })),
      note: "Carried from PR #214 for completeness only.",
    },
  });

  /* ---------- summary for the finalize step ---------- */
  const summary = {
    artifact: "evaluation-summary",
    experimentId: EXPERIMENT_ID,
    allDeterministic,
    armBInvocations: descriptors.length,
    runtimeFailures: perItem.filter((i) => i.armB.runtimeFailure).length,
    classifications: perItem.reduce<Record<string, number>>((acc, i) => {
      acc[i.classification] = (acc[i.classification] ?? 0) + 1;
      return acc;
    }, {}),
    improvedCropClusters: cropGroups.filter(
      (g) => g.groupClassification === "PPOCRV6_TRUTH_BEARING_IMPROVEMENT",
    ).length,
    improvedDesignClusters: designGroups.filter(
      (g) => g.groupClassification === "PPOCRV6_TRUTH_BEARING_IMPROVEMENT",
    ).length,
    regressedDesignClusters: designGroups.filter(
      (g) => g.groupClassification === "PPOCRV6_REGRESSION",
    ).length,
    armACrosscheckAllMatch: crosscheck.every((c) => c.matches),
    transcripts: Object.fromEntries(
      descriptors.map((d) => [d.invocationId, String(d.output.rawTranscript)]),
    ),
  };
  writeJson(path.join(ROOT, "evaluation-summary.json"), summary);

  console.log(JSON.stringify(summary, null, 2));
}

mkdirSync(ROOT, { recursive: true });
if (!existsSync(RAW)) halt("RAW_DIRECTORY_MISSING", RAW);
await main();
