/**
 * Issue #149 — PARSeq-small versus incumbent Tesseract on frozen Brand crops.
 *
 * Two-arm architecture comparison, evaluation-only. Arm A is the governed
 * incumbent tesseract.js path from PR #211; Arm B's raw evidence is produced by
 * the pinned PARSeq container and read back here.
 *
 * Not a single-variable causal attribution experiment: the recognizers have
 * different architectures and different intrinsic transforms.
 *
 * Truth is loaded only after every raw output is written and hashed.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createLocalOcrEngine } from "@/pipeline/extractor/ocr-engine";
import type { OcrWord } from "@/pipeline/extractor/extractor.types";

const EXPERIMENT_ID = "issue-149-brand-parseq-small-contrast";
const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
const INPUTS = path.join(ROOT, "inference-inputs");
const RAW = path.join(ROOT, "raw");
const EVALUATION = path.join(ROOT, "evaluation");

const INTEGER_MODEL = "src/pipeline/extractor/assets/eng.traineddata";
const INTEGER_MODEL_SHA256 = "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747";
const PSM = 11;
const OEM = 1;

const CHECKPOINT_SHA256 = "bb5792a68e367476abca029cbf8699abc805f3d3dc7e57aae45c8ec4f7b7cd00";
const CHECKPOINT_BYTES = 95392675;
const PARSEQ_CODE_COMMIT = "1902db043c029a7e03a3818c616c06600af574be";
const PARSEQ_MODEL_COMMIT = "a1526c3d63740e460153987f9aaf6b86aa199dc1";

const MATERIAL_CER_DELTA = 0.1;
const MATERIAL_RECALL_DELTA = 0.25;

const sha256Bytes = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
const abs = (p: string) => (path.isAbsolute(p) ? p : path.join(process.cwd(), p));
const sha256File = (p: string) => sha256Bytes(readFileSync(abs(p)));
const writeJson = (p: string, v: unknown) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
function tryRun(command: string, args: readonly string[]): string {
  try {
    return execFileSync(command, [...args], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    }).trim();
  } catch (error) {
    return `ERROR: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/* ---------- preregistered text representations ---------- */
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

interface ArmARecord {
  opaqueItemId: string;
  arm: "A";
  run: string;
  sourcePngSha256: string;
  rawTranscript: string;
  words: Array<{ text: string; confidence: number; bbox: OcrWord["bbox"] }>;
  wordCount: number;
  meanConfidence: number | null;
  warnings: string[];
  latencyMs: number;
  outputFingerprint: string;
  executed: boolean;
}

function readingOrder(words: ArmARecord["words"]): string {
  return [...words]
    .sort((l, r) => {
      const ly = (l.bbox.y0 + l.bbox.y1) / 2;
      const ry = (r.bbox.y0 + r.bbox.y1) / 2;
      if (Math.abs(ly - ry) > 20) return ly - ry;
      return l.bbox.x0 - r.bbox.x0;
    })
    .map((w) => w.text)
    .join(" ")
    .trim();
}

async function runArmA(runId: string, items: string[]): Promise<ArmARecord[]> {
  const engine = await createLocalOcrEngine();
  const out: ArmARecord[] = [];
  try {
    for (const opaque of items) {
      const png = readFileSync(path.join(INPUTS, `${opaque}.png`));
      const started = Date.now();
      let words: ArmARecord["words"] = [];
      const warnings: string[] = [];
      let executed = true;
      try {
        const recognized = await engine.recognizeWords(png, PSM);
        words = recognized
          .filter((w: OcrWord) => w.text && w.text.trim().length > 0)
          .map((w: OcrWord) => ({
            text: w.text,
            confidence: w.rawConfidence,
            bbox: { ...w.bbox },
          }));
      } catch (error) {
        executed = false;
        warnings.push(error instanceof Error ? error.message : String(error));
      }
      const latencyMs = Date.now() - started;
      const rawTranscript = readingOrder(words);
      const record: ArmARecord = {
        opaqueItemId: opaque,
        arm: "A",
        run: runId,
        sourcePngSha256: sha256Bytes(png),
        rawTranscript,
        words,
        wordCount: words.length,
        meanConfidence:
          words.length === 0 ? null : words.reduce((s, w) => s + w.confidence, 0) / words.length,
        warnings,
        latencyMs,
        outputFingerprint: sha256Bytes(Buffer.from(JSON.stringify({ t: rawTranscript, w: words }))),
        executed,
      };
      writeJson(path.join(RAW, `A-${opaque}-${runId}.json`), record);
      out.push(record);
    }
  } finally {
    await engine.terminate();
  }
  return out;
}

async function main() {
  mkdirSync(RAW, { recursive: true });
  const gates: Array<{ gate: string; status: "PASS" | "FAIL"; detail: string }> = [];
  const gate = (n: string, ok: boolean, d: string) =>
    gates.push({ gate: n, status: ok ? "PASS" : "FAIL", detail: d });

  const preregSha = existsSync(path.join(ROOT, "preregistration.sha256"))
    ? readFileSync(path.join(ROOT, "preregistration.sha256"), "utf8").trim().split(/\s+/)[0]
    : null;
  gate(
    "preregistration-frozen",
    preregSha !== null && sha256File(path.join(ROOT, "preregistration.md")) === preregSha,
    `${preregSha}`,
  );

  const arch = tryRun("uname", ["-m"]);
  gate("runner-native-amd64", arch === "x86_64", arch);
  gate(
    "incumbent-traineddata",
    sha256File(INTEGER_MODEL) === INTEGER_MODEL_SHA256,
    INTEGER_MODEL_SHA256,
  );

  const checkpoint = ".local/ocr-research/models/parseq-small/pytorch_model.bin";
  const checkpointOk =
    existsSync(abs(checkpoint)) &&
    sha256File(checkpoint) === CHECKPOINT_SHA256 &&
    readFileSync(abs(checkpoint)).length === CHECKPOINT_BYTES;
  gate("parseq-checkpoint", checkpointOk, CHECKPOINT_SHA256);

  const pixels = JSON.parse(readFileSync(path.join(ROOT, "input-pixel-manifest.json"), "utf8"));
  const items: string[] = pixels.items.map((i: { opaqueItemId: string }) => i.opaqueItemId);
  const inputsOk = pixels.items.every(
    (i: { opaqueItemId: string; sourcePngSha256: string }) =>
      sha256File(path.join(INPUTS, `${i.opaqueItemId}.png`)) === i.sourcePngSha256,
  );
  gate("input-pixel-hashes", inputsOk, `${items.length} inputs`);

  const changed = tryRun("git", ["diff", "--name-only", "origin/main...HEAD"]);
  const forbidden = changed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter(
      (f) =>
        f.startsWith("src/") ||
        f.startsWith("tests/") ||
        f === "Dockerfile" ||
        f === "render.yaml" ||
        f === "package.json" ||
        f.startsWith("next.config"),
    );
  gate("no-production-or-fixture-changes", forbidden.length === 0, forbidden.join(", ") || "clean");

  if (gates.some((g) => g.status === "FAIL")) {
    writeJson(path.join(ROOT, "decision.json"), {
      artifact: "decision",
      experimentId: EXPERIMENT_ID,
      decision: "INCONCLUSIVE",
      reason: "A preflight gate failed before inference.",
      gates,
    });
    throw new Error("INCONCLUSIVE: preflight gate failed");
  }

  /* ---- Arm A: incumbent, primary and exact repeat ---- */
  const armA = [...(await runArmA("primary", items)), ...(await runArmA("repeat", items))];

  /* ---- Arm B raw evidence, produced by the container ---- */
  const armB: Array<Record<string, unknown>> = [];
  for (const runId of ["primary", "repeat"]) {
    const summary = path.join(RAW, `arm-b-${runId}.json`);
    if (!existsSync(summary)) throw new Error(`ARM_B_OUTPUT_MISSING: ${runId}`);
    const parsed = JSON.parse(readFileSync(summary, "utf8"));
    for (const record of parsed.records) armB.push(record);
  }

  /* ---- TRUTH BOUNDARY: hash every raw output first ---- */
  const rawFiles = readdirSync(RAW).sort();
  writeJson(path.join(ROOT, "raw-output-manifest.json"), {
    artifact: "raw-output-manifest",
    experimentId: EXPERIMENT_ID,
    truthReadBeforeThisPoint: false,
    expectedInvocations: 24,
    armAInvocations: armA.length,
    armBInvocations: armB.length,
    files: rawFiles.map((f) => ({ path: `raw/${f}`, sha256: sha256File(path.join(RAW, f)) })),
  });

  /* ---- truth revealed here, and not before ---- */
  const { composeResearchManifest } = await import("@/fixtures/ocr-research/fixture-corpus");
  const manifest = composeResearchManifest({ includePrivate: false });
  const idMap = JSON.parse(readFileSync(path.join(EVALUATION, "id-map.json"), "utf8"))
    .map as Array<{
    opaqueItemId: string;
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

  const byKey = new Map<string, { rawTranscript: string; [k: string]: unknown }>();
  for (const r of armA) byKey.set(`A-${r.opaqueItemId}-${r.run}`, r as never);
  for (const r of armB) byKey.set(`B-${r.opaqueItemId}-${r.run}`, r as never);

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
    };
    for (const truth of truths) {
      const tFree = whitespaceFree(truth);
      const tBound = boundaryPreserving(truth);
      const tokens = tBound.split(" ").filter((t) => t.length >= 3);
      const matched = tokens.filter((t) => wsFree.includes(t)).length;
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
  function classify(a: M, b: M, deterministicB: boolean, failure: boolean): string {
    if (!deterministicB) return "PARSEQ_NONDETERMINISTIC";
    if (failure) return "PARSEQ_INCOMPARABLE";
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
    if (lost) return "PARSEQ_REGRESSION";
    if (gained) return "PARSEQ_TRUTH_BEARING_IMPROVEMENT";
    return "PARSEQ_NO_EFFECT";
  }

  const perItem = idMap.map((entry) => {
    const truths = truthOf.get(entry.opaqueItemId) ?? [];
    const aP = byKey.get(`A-${entry.opaqueItemId}-primary`)!;
    const aR = byKey.get(`A-${entry.opaqueItemId}-repeat`)!;
    const bP = byKey.get(`B-${entry.opaqueItemId}-primary`)! as never as Record<string, never>;
    const bR = byKey.get(`B-${entry.opaqueItemId}-repeat`)! as never as Record<string, never>;
    const detA = aP.outputFingerprint === aR.outputFingerprint;
    const detB =
      bP.rawTranscript === bR.rawTranscript &&
      JSON.stringify(bP.rawTokenIds) === JSON.stringify(bR.rawTokenIds) &&
      bP.eosIndex === bR.eosIndex &&
      JSON.stringify(bP.characterProbabilities) === JSON.stringify(bR.characterProbabilities) &&
      bP.logitsSha256 === bR.logitsSha256 &&
      bP.outputFingerprint === bR.outputFingerprint;
    const failure = aP.executed === false || bP.executed === false;
    const mA = metrics(aP.rawTranscript, truths);
    const mB = metrics(String(bP.rawTranscript), truths);
    return {
      ...entry,
      armA: {
        ...mA,
        meanConfidence: aP.meanConfidence,
        wordCount: aP.wordCount,
        latencyMs: aP.latencyMs,
        deterministic: detA,
      },
      armB: {
        ...mB,
        nativeSequenceScore: bP.nativeSequenceScore,
        characterProbabilities: bP.characterProbabilities,
        logitsAllFinite: bP.logitsAllFinite,
        latencyMs: bP.latencyMs,
        peakMemoryBytes: bP.peakMemoryBytes,
        deterministic: detB,
      },
      classification: classify(mA, mB, detB, failure),
    };
  });

  writeJson(path.join(ROOT, "per-item-results.json"), {
    artifact: "per-item-results",
    experimentId: EXPERIMENT_ID,
    truthUsedOnlyAfterRawFreeze: true,
    primaryRepresentation: "whitespace-free comparable",
    secondaryRepresentation: "boundary-preserving normalized",
    rawTranscriptReportedUnchanged: true,
    items: perItem,
  });

  /* ---- independence reporting at every level ---- */
  const roll = (key: "caseId" | "cropClusterId" | "designClusterId" | "pixelSet") =>
    Object.entries(
      perItem.reduce<Record<string, string[]>>((accumulator, row) => {
        const k =
          key === "pixelSet"
            ? (pixels.items.find(
                (i: { opaqueItemId: string }) => i.opaqueItemId === row.opaqueItemId,
              ).sourcePngSha256 as string)
            : (row[key] as string);
        (accumulator[k] ||= []).push(row.classification);
        return accumulator;
      }, {}),
    ).map(([id, classes]) => {
      const rank = [
        "PARSEQ_NONDETERMINISTIC",
        "PARSEQ_REGRESSION",
        "PARSEQ_TRUTH_BEARING_IMPROVEMENT",
        "PARSEQ_INCOMPARABLE",
        "PARSEQ_NO_EFFECT",
      ];
      return {
        id,
        memberClassifications: classes,
        groupClassification: rank.find((r) => classes.includes(r)) ?? "PARSEQ_NO_EFFECT",
        countsOnce: true,
      };
    });

  const byCase = roll("caseId");
  const byPixel = roll("pixelSet");
  const byCrop = roll("cropClusterId");
  const byDesign = roll("designClusterId");
  writeJson(path.join(ROOT, "pixel-set-results.json"), {
    artifact: "pixel-set-results",
    experimentId: EXPERIMENT_ID,
    distinctPixelSets: byPixel.length,
    groups: byPixel,
  });
  writeJson(path.join(ROOT, "crop-cluster-results.json"), {
    artifact: "crop-cluster-results",
    experimentId: EXPERIMENT_ID,
    rule: "Shared crop evidence counts once.",
    distinctCropClusters: byCrop.length,
    groups: byCrop,
  });
  writeJson(path.join(ROOT, "design-cluster-results.json"), {
    artifact: "design-cluster-results",
    experimentId: EXPERIMENT_ID,
    rule: "A repeated Brand design can contribute only one design-level improvement.",
    distinctDesigns: byDesign.length,
    groups: byDesign,
  });

  /* ---- determinism ---- */
  const detRows = perItem.map((r) => ({
    opaqueItemId: r.opaqueItemId,
    armADeterministic: r.armA.deterministic,
    armBDeterministic: r.armB.deterministic,
  }));
  const allBDet = detRows.every((r) => r.armBDeterministic);
  writeJson(path.join(ROOT, "determinism-report.json"), {
    artifact: "determinism-report",
    experimentId: EXPERIMENT_ID,
    armBRequiredFields: [
      "logitsBytes",
      "tokenIds",
      "eosIndex",
      "characterProbabilities",
      "rawTranscript",
      "outputFingerprint",
    ],
    rows: detRows,
    allArmADeterministic: detRows.every((r) => r.armADeterministic),
    allArmBDeterministic: allBDet,
    ruleRelaxed: false,
  });

  /* ---- score-ordering risk (threshold-free) ---- */
  const scored = perItem.map((r) => ({
    opaqueItemId: r.opaqueItemId,
    nativeSequenceScore: r.armB.nativeSequenceScore as number | null,
    correct: r.armB.exactMatchWhitespaceFree,
  }));
  const correctScores = scored.filter((s) => s.correct).map((s) => s.nativeSequenceScore ?? 0);
  const wrongScores = scored.filter((s) => !s.correct).map((s) => s.nativeSequenceScore ?? 0);
  const scoreOrderingRisk =
    correctScores.length === 0 || wrongScores.length === 0
      ? null
      : Math.max(...wrongScores) >= Math.min(...correctScores);
  writeJson(path.join(ROOT, "score-ordering-risk.json"), {
    artifact: "score-ordering-risk",
    experimentId: EXPERIMENT_ID,
    thresholdFreeDiagnostic: true,
    isAuthorityClassifier: false,
    perItem: scored,
    correctCount: correctScores.length,
    wrongCount: wrongScores.length,
    scoreOrderingRisk,
    scoreOrderingRiskNote:
      scoreOrderingRisk === null
        ? "Not computable: one of the two outcome classes is empty on this six-item benchmark."
        : "True means some wrong output scored at least as high as some correct output.",
    thresholdDerived: false,
  });

  writeJson(path.join(ROOT, "resource-report.json"), {
    artifact: "resource-report",
    experimentId: EXPERIMENT_ID,
    comparabilityWarning:
      "Arm A latency is in-process tesseract.js on the runner; Arm B latency is in-container PARSeq with model load excluded. The two are not directly comparable, and neither establishes production latency.",
    armA: perItem.map((r) => ({ opaqueItemId: r.opaqueItemId, latencyMs: r.armA.latencyMs })),
    armB: perItem.map((r) => ({
      opaqueItemId: r.opaqueItemId,
      latencyMs: r.armB.latencyMs,
      peakMemoryBytes: r.armB.peakMemoryBytes,
    })),
  });

  /* ---- decision ---- */
  const improvedCrop = byCrop.filter(
    (g) => g.groupClassification === "PARSEQ_TRUTH_BEARING_IMPROVEMENT",
  ).length;
  const improvedDesign = byDesign.filter(
    (g) => g.groupClassification === "PARSEQ_TRUTH_BEARING_IMPROVEMENT",
  ).length;
  const designRegression = byDesign.some((g) => g.groupClassification === "PARSEQ_REGRESSION");
  const runtimeFailure = perItem.some((r) => r.classification === "PARSEQ_INCOMPARABLE");
  let decision: string;
  let reason: string;
  if (!allBDet) {
    decision = "INCONCLUSIVE";
    reason = "PARSeq repeats were not deterministic, which blocks a KEEP decision.";
  } else if (designRegression || runtimeFailure) {
    decision = "REGRESSION";
    reason = designRegression
      ? "A distinct Brand design showed a primary-metric regression."
      : "An unexplained runtime failure occurred.";
  } else if (improvedCrop > 0 && improvedDesign > 0) {
    decision = "KEEP_FOR_EXPANDED_BENCHMARK";
    reason = `${improvedCrop} distinct crop cluster(s) and ${improvedDesign} distinct Brand design(s) showed a truth-bearing improvement, repeats were deterministic, and no design regressed.`;
  } else {
    decision = "NO_EVIDENCE_OF_GAIN";
    reason =
      "No distinct crop cluster and/or no distinct Brand design showed a truth-bearing improvement.";
  }

  writeJson(path.join(ROOT, "decision.json"), {
    artifact: "decision",
    experimentId: EXPERIMENT_ID,
    evaluationOnly: true,
    twoArmArchitectureComparison: true,
    singleVariableCausalAttribution: false,
    decision,
    reason,
    gates,
    counts: {
      historicalCases: byCase.length,
      ocrItems: perItem.length,
      distinctPixelSets: byPixel.length,
      distinctCropClusters: byCrop.length,
      distinctBrandDesigns: byDesign.length,
    },
    classifications: Object.fromEntries(
      [...new Set(perItem.map((r) => r.classification))].map((c) => [
        c,
        perItem.filter((r) => r.classification === c).length,
      ]),
    ),
    improvedCropClusters: improvedCrop,
    improvedDesignClusters: improvedDesign,
    designRegression,
    allArmBDeterministic: allBDet,
    falseReliableRead: "NOT_ASSESSABLE_NO_CALIBRATED_AUTHORITY_MAPPING",
    falseReliableReadNote:
      "PARSeq is not connected to the authority classifier and has no calibrated mapping. Zero false reliable reads is NOT reported: the measure is not assessable here. PARSeq output remains evaluation evidence only and cannot produce a reliable finding in this experiment.",
    wrongOutputCount: perItem.filter((r) => !r.armB.exactMatchWhitespaceFree).length,
    scoreOrderingRisk,
    blankHallucinationRiskInherited:
      "PR #213: PARSeq emitted `10` on a blank image and has no natural abstention.",
    authorizes:
      decision === "KEEP_FOR_EXPANDED_BENCHMARK"
        ? "corpus expansion and calibration research only"
        : "nothing",
    doesNotAuthorize: [
      "production use or integration",
      "a Python production runtime",
      "authority-state changes",
      "shadow deployment",
      "engine replacement",
    ],
    codeCommit: PARSEQ_CODE_COMMIT,
    modelCommit: PARSEQ_MODEL_COMMIT,
  });

  console.log(
    JSON.stringify(
      {
        decision,
        reason,
        classifications: Object.fromEntries(
          [...new Set(perItem.map((r) => r.classification))].map((c) => [
            c,
            perItem.filter((r) => r.classification === c).length,
          ]),
        ),
        allArmBDeterministic: allBDet,
        scoreOrderingRisk,
        items: perItem.map((r) => ({
          item: r.ocrItemId,
          A: r.armA.rawTranscript,
          B: r.armB.rawTranscript,
          A_wsFree: r.armA.whitespaceFreeTranscript,
          B_wsFree: r.armB.whitespaceFreeTranscript,
          A_cer: Number(r.armA.cerWhitespaceFree.toFixed(3)),
          B_cer: Number(r.armB.cerWhitespaceFree.toFixed(3)),
          B_score: r.armB.nativeSequenceScore,
          class: r.classification,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
