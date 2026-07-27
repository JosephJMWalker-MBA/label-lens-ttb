import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { format } from "prettier";
import sharp from "sharp";

import {
  BRAND_OTSU_CONTROL,
  BRAND_OTSU_TREATMENT,
  OTSU_IMPLEMENTATION_ID,
  OTSU_OUTPUT_ADAPTER_ID,
  compareOtsuArms,
  decideOtsuExperiment,
  enrichOtsuArm,
  type OtsuAggregateMetrics,
  type OtsuArmReport,
  type OtsuCaseDelta,
  type OtsuDecisionReport,
  type OtsuMechanism,
} from "@/fixtures/ocr-research/brand-otsu-threshold";
import {
  OCR_EXPERIMENT_SCHEMA_VERSION,
  runOcrExperiment,
  type ExperimentDefinition,
} from "@/fixtures/ocr-research/experiment";
import { composeResearchManifest } from "@/fixtures/ocr-research/fixture-corpus";

const OUTPUT_ROOT = path.join(
  process.cwd(),
  "artifacts/issue-149-brand-otsu-threshold/clean-retry",
);
const EXPECTED_BASE_SHA = "f269a3c78b1053638e2bdae36c3f9f6b29423590";
const BASELINE_CONTROL_BEHAVIOR_HASH =
  "b3db6f91ea925a60aee0adc043994a5fef1e57df3cb6df03860f038cc16ffb41";
const CLEAN_PREREGISTRATION_SHA256 =
  "c0eea099186691c082605b82f30435104ae0d737707b32ced52421a20d232d7d";
const FROZEN_EVALUATION_HASHES = {
  "src/fixtures/ocr-research/experiment.ts":
    "f6f0b167cb0a15e443b92b50c4f151aacd0b1dd04acf33e2b31018cb626aa806",
  "src/fixtures/ocr-research/brand-otsu-threshold.ts":
    "07c98d66fc9e6a62796fe97eea0d8755865b1bcac45724d10cb7df879ce18cc4",
  "src/fixtures/ocr-research/experiment.test.ts":
    "a7922cca0df87e9057b38c6f9c5196eacea6e3bb60e03bb6cbea2ababdc0dc7d",
  "src/fixtures/ocr-research/brand-otsu-threshold.test.ts":
    "b42f848194d8bd604535a1fe0829c22bdd54a3eac8eaba468637d11260e431dc",
  "tests/fixtures/ocr-research/manifest.json":
    "b6b5be1b4b97bf4bdd2c753675326e061fb38e3e523741f3a03f5eb015d2aac9",
} as const;
const GUARDED_PRODUCTION_HASHES = {
  "src/pipeline/extractor/field-selection.ts":
    "3e84fa8a043570713991643830c7b95e0f7189a4ed037b737c783353d519106d",
  "src/pipeline/extractor/regions.ts":
    "910d763e20f47d811348b62c77f17d46ddf3a07b5849a337669a07f6b8efc9ab",
  "src/pipeline/extractor/extractor.ts":
    "9b2712e6bb15552e9524bc5e60be4da2b163bdb325206f452ecbaf44ebf5084c",
} as const;

/*
 * Visual classifications are added only after full-resolution paired review.
 * A changed case not present here remains explicitly UNDETERMINED.
 */
const VISUAL_REVIEW: Readonly<Record<string, { mechanism: OtsuMechanism; evidence: string }>> = {
  "approved-wine-004": {
    mechanism: "OTSU_REMOVED_BACKGROUND_NOISE",
    evidence:
      "Fresh clean-pair review shows the normalized gray field becoming uniform white while the principal La Fattoria strokes remain continuous; OCR closes the internal FATTORIA space but still does not recover the full fixed Brand truth.",
  },
  "approved-wine-005": {
    mechanism: "OTSU_CHANGED_CONFIDENCE_ONLY",
    evidence:
      "Fresh clean-pair review shows stable principal letterforms; transcript, candidates, selection, and authority are identical, with mean confidence changing only from 26.5 to 26.0.",
  },
  "approved-wine-023": {
    mechanism: "OTSU_FRAGMENTED_CHARACTERS",
    evidence:
      "Fresh clean-pair review shows white gaps and dotted breaks across multiple fine script loops and connectors; OCR changes to a different wrong candidate without truth recovery.",
  },
  "approved-wine-027": {
    mechanism: "OTSU_LOST_THIN_STROKES",
    evidence:
      "Fresh clean-pair review shows the fine gray Girls word and multiple decorative rose strokes disappearing while the heavy GOLDEN letters survive; the new candidate remains wrong.",
  },
  "approved-wine-031": {
    mechanism: "OTSU_CHANGED_CONFIDENCE_ONLY",
    evidence:
      "Fresh clean-pair review shows intact main letterforms; transcript and candidate stay enheesO while mean confidence falls from 35 to 26.",
  },
  "approved-wine-035": {
    mechanism: "OTSU_REMOVED_BACKGROUND_NOISE",
    evidence:
      "Fresh clean-pair review shows the mottled gray field becoming uniform white while the Hubert Lamy script remains visibly continuous; the wrong transcript changes without truth gain.",
  },
  "approved-wine-085": {
    mechanism: "OTSU_FRAGMENTED_CHARACTERS",
    evidence:
      "Fresh clean-pair review shows gaps and hard discontinuities in the low-contrast script and leading flourish; the control candidate is replaced by another wrong candidate.",
  },
  "approved-wine-091": {
    mechanism: "OTSU_CHANGED_CONFIDENCE_ONLY",
    evidence:
      "Fresh clean-pair review shows stable stacked letterforms; transcript, empty candidate state, and authority are unchanged while mean confidence rises from 74.5 to 76.5.",
  },
  "la-fattoria-rotated": {
    mechanism: "OTSU_REMOVED_BACKGROUND_NOISE",
    evidence:
      "Fresh clean-pair review shows the same gray-field removal as the matching La Fattoria artwork while principal strokes remain continuous; OCR spacing changes without recovering the full Brand truth.",
  },
  "wine-multi-artifact-04-region-1": {
    mechanism: "OTSU_REMOVED_BACKGROUND_NOISE",
    evidence:
      "Fresh clean-pair review shows gray background and anti-aliasing removed while the large Dry Cellar strokes remain continuous; OCR changes from EA, to Ex, without producing a candidate or truth gain.",
  },
  "wine-multi-artifact-04-region-2": {
    mechanism: "OTSU_FRAGMENTED_CHARACTERS",
    evidence:
      "Fresh clean-pair review shows conspicuous white breaks in the small capital loops and connecting script strokes; OCR changes from Colles Dig to Colla Diy without truth gain.",
  },
};

function gitSha(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function preregistrationFrozen(): boolean {
  return (
    sha256File(path.join(OUTPUT_ROOT, "preregistration.md")) === CLEAN_PREREGISTRATION_SHA256 &&
    Object.entries(FROZEN_EVALUATION_HASHES).every(
      ([filePath, expectedHash]) => sha256File(path.join(process.cwd(), filePath)) === expectedHash,
    )
  );
}

function guardedProductionPathsChanged(): boolean {
  return Object.entries(GUARDED_PRODUCTION_HASHES).some(
    ([filePath, expectedHash]) => sha256File(path.join(process.cwd(), filePath)) !== expectedHash,
  );
}

function pr195BaselineChanged(): boolean {
  const filePath = "src/pipeline/extractor/field-selection.ts";
  return sha256File(path.join(process.cwd(), filePath)) !== GUARDED_PRODUCTION_HASHES[filePath];
}

function otsuImplementationVerified(): boolean {
  const implementation = readFileSync(
    path.join(process.cwd(), "src/fixtures/ocr-research/experiment.ts"),
    "utf8",
  );
  const selector = implementation
    .split("export function selectOtsuThreshold")
    .at(-1)
    ?.split("export function binarizeGrayscaleWithOtsu")[0];
  const otsuBranch = implementation
    .split('if (configuration.thresholdMethod === "otsu") {')
    .at(-1)
    ?.split("\n  return {")[0];
  return (
    OTSU_IMPLEMENTATION_ID === "histogram-between-class-variance-lower-tie-single-channel-v1" &&
    OTSU_OUTPUT_ADAPTER_ID === "rgb-rgba-alpha-preserving-png-v1" &&
    Boolean(selector?.includes("new Uint32Array(256)")) &&
    Boolean(
      selector?.includes(
        "backgroundWeight *\n      foregroundWeight *\n      (backgroundMean - foregroundMean) *\n      (backgroundMean - foregroundMean)",
      ),
    ) &&
    Boolean(selector?.includes("betweenClassVariance > bestBetweenClassVariance")) &&
    Boolean(otsuBranch) &&
    !otsuBranch?.includes(".threshold(") &&
    !otsuBranch?.match(/\.(?:grayscale|removeAlpha|ensureAlpha|flatten|toColourspace)\(/) &&
    Boolean(otsuBranch?.includes("encodeChannelPreservingOtsuPng(controlEquivalentPng)"))
  );
}

function productionImportBoundaryVerified(): boolean {
  try {
    const matches = execFileSync(
      "rg",
      [
        "-n",
        "fixtures/ocr-research|brand-otsu-threshold|encodeChannelPreservingOtsuPng",
        "src/pipeline",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    ).trim();
    return matches.length === 0;
  } catch (error) {
    return (error as { status?: number }).status === 1;
  }
}

interface EncodedPairIsolationAudit {
  run: "primary" | "repeat";
  caseId: string;
  passed: boolean;
  control: {
    width: number;
    height: number;
    channels: number;
    hasAlpha: boolean;
    depth: string;
    bitsPerSample: number | undefined;
    space: string;
    density: number | undefined;
  };
  treatment: {
    width: number;
    height: number;
    channels: number;
    hasAlpha: boolean;
    depth: string;
    bitsPerSample: number | undefined;
    space: string;
    density: number | undefined;
  };
  metadataIdentical: boolean;
  nonImagePngChunksIdentical: boolean;
  alphaBytesIdentical: boolean;
  treatmentRgbBinary: boolean;
  treatmentRgbNeutral: boolean;
}

function nonImagePngChunks(png: Buffer): Buffer[] {
  const signatureLength = 8;
  const chunks: Buffer[] = [];
  let offset = signatureLength;
  while (offset < png.length) {
    const dataLength = png.readUInt32BE(offset);
    const end = offset + 12 + dataLength;
    if (end > png.length) throw new Error("OTSU_ISOLATION_INVALID_PNG");
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type !== "IDAT") chunks.push(Buffer.from(png.subarray(offset, end)));
    offset = end;
  }
  return chunks;
}

function metadataProjection(metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>) {
  return {
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    space: metadata.space,
    channels: metadata.channels,
    depth: metadata.depth,
    density: metadata.density,
    isProgressive: metadata.isProgressive,
    isPalette: metadata.isPalette,
    bitsPerSample: metadata.bitsPerSample,
    hasProfile: metadata.hasProfile,
    hasAlpha: metadata.hasAlpha,
    orientation: metadata.orientation,
    resolutionUnit: metadata.resolutionUnit,
  };
}

async function auditEncodedPair(args: {
  root: string;
  run: "primary" | "repeat";
  caseId: string;
}): Promise<EncodedPairIsolationAudit> {
  const controlPng = readFileSync(
    path.join(args.root, "control/preprocessed", `${args.caseId}.png`),
  );
  const treatmentPng = readFileSync(
    path.join(args.root, "treatment/preprocessed", `${args.caseId}.png`),
  );
  const controlMetadata = await sharp(controlPng).metadata();
  const treatmentMetadata = await sharp(treatmentPng).metadata();
  const controlDecoded = await sharp(controlPng).raw().toBuffer({ resolveWithObject: true });
  const treatmentDecoded = await sharp(treatmentPng).raw().toBuffer({ resolveWithObject: true });
  const controlChunks = nonImagePngChunks(controlPng);
  const treatmentChunks = nonImagePngChunks(treatmentPng);
  const nonImagePngChunksIdentical =
    controlChunks.length === treatmentChunks.length &&
    controlChunks.every((chunk, index) => chunk.equals(treatmentChunks[index]));
  const layoutIdentical =
    controlDecoded.info.width === treatmentDecoded.info.width &&
    controlDecoded.info.height === treatmentDecoded.info.height &&
    controlDecoded.info.channels === treatmentDecoded.info.channels;
  let alphaBytesIdentical = controlDecoded.info.channels !== 4;
  let treatmentRgbBinary = true;
  let treatmentRgbNeutral = true;
  if (layoutIdentical) {
    alphaBytesIdentical = true;
    for (
      let pixel = 0;
      pixel < controlDecoded.info.width * controlDecoded.info.height;
      pixel += 1
    ) {
      const offset = pixel * controlDecoded.info.channels;
      const red = treatmentDecoded.data[offset];
      const green = treatmentDecoded.data[offset + 1];
      const blue = treatmentDecoded.data[offset + 2];
      treatmentRgbBinary &&= [red, green, blue].every((value) => value === 0 || value === 255);
      treatmentRgbNeutral &&= red === green && green === blue;
      if (
        controlDecoded.info.channels === 4 &&
        controlDecoded.data[offset + 3] !== treatmentDecoded.data[offset + 3]
      ) {
        alphaBytesIdentical = false;
      }
    }
  } else {
    alphaBytesIdentical = false;
    treatmentRgbBinary = false;
    treatmentRgbNeutral = false;
  }
  const metadataIdentical =
    JSON.stringify(metadataProjection(controlMetadata)) ===
    JSON.stringify(metadataProjection(treatmentMetadata));
  const passed =
    layoutIdentical &&
    (controlDecoded.info.channels === 3 || controlDecoded.info.channels === 4) &&
    metadataIdentical &&
    nonImagePngChunksIdentical &&
    alphaBytesIdentical &&
    treatmentRgbBinary &&
    treatmentRgbNeutral;
  const project = (
    metadata: typeof controlMetadata,
    info: typeof controlDecoded.info,
  ): EncodedPairIsolationAudit["control"] => ({
    width: info.width,
    height: info.height,
    channels: info.channels,
    hasAlpha: metadata.hasAlpha,
    depth: metadata.depth,
    bitsPerSample: metadata.bitsPerSample,
    space: metadata.space,
    density: metadata.density,
  });
  return {
    run: args.run,
    caseId: args.caseId,
    passed,
    control: project(controlMetadata, controlDecoded.info),
    treatment: project(treatmentMetadata, treatmentDecoded.info),
    metadataIdentical,
    nonImagePngChunksIdentical,
    alphaBytesIdentical,
    treatmentRgbBinary,
    treatmentRgbNeutral,
  };
}

async function auditEncodedRun(
  root: string,
  run: "primary" | "repeat",
  caseIds: readonly string[],
): Promise<EncodedPairIsolationAudit[]> {
  return Promise.all(caseIds.map((caseId) => auditEncodedPair({ root, run, caseId })));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  writeFileSync(
    filePath,
    await format(JSON.stringify(value), {
      parser: "json",
      printWidth: 100,
    }),
  );
}

function writeJsonl(filePath: string, values: readonly unknown[]): void {
  writeFileSync(filePath, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
}

function percent(value: number | null): string {
  return value === null ? "not available" : `${(value * 100).toFixed(1)}%`;
}

function milliseconds(value: number | null): string {
  return value === null ? "not available" : value.toFixed(2);
}

function ratio(value: number | null): string {
  return value === null ? "not available" : `${value.toFixed(3)}×`;
}

function renderMetricTable(control: OtsuAggregateMetrics, treatment: OtsuAggregateMetrics): string {
  const rows: Array<[string, string, string]> = [
    [
      "Exact top-1 accuracy",
      percent(control.exactAccuracy.rate),
      percent(treatment.exactAccuracy.rate),
    ],
    [
      "Normalized top-1 accuracy",
      percent(control.normalizedAccuracy.rate),
      percent(treatment.normalizedAccuracy.rate),
    ],
    [
      "Raw OCR truth recall",
      percent(control.rawOcrTruthRecall.rate),
      percent(treatment.rawOcrTruthRecall.rate),
    ],
    [
      "Candidate-list truth recall",
      percent(control.candidateListTruthRecall.rate),
      percent(treatment.candidateListTruthRecall.rate),
    ],
    [
      "Top-3 truth recall",
      percent(control.top3TruthRecall.rate),
      percent(treatment.top3TruthRecall.rate),
    ],
    [
      "False reliable reads",
      String(control.falseReliableReads.count),
      String(treatment.falseReliableReads.count),
    ],
    [
      "Wrong reliable reads",
      String(control.wrongReliableReads.count),
      String(treatment.wrongReliableReads.count),
    ],
    [
      "Empty OCR",
      `${control.emptyOcr.count} (${percent(control.emptyOcr.rate)})`,
      `${treatment.emptyOcr.count} (${percent(treatment.emptyOcr.rate)})`,
    ],
    [
      "Correct but conservative",
      String(control.correctButConservative.count),
      String(treatment.correctButConservative.count),
    ],
    [
      "OCR recognition misses",
      String(control.ocrRecognitionMisses.count),
      String(treatment.ocrRecognitionMisses.count),
    ],
    [
      "Grouping/ranking misses",
      String(control.groupingRankingMisses.count),
      String(treatment.groupingRankingMisses.count),
    ],
    [
      "Median latency (ms)",
      milliseconds(control.medianLatencyMs),
      milliseconds(treatment.medianLatencyMs),
    ],
    ["P95 latency (ms)", milliseconds(control.p95LatencyMs), milliseconds(treatment.p95LatencyMs)],
  ];
  return rows
    .map(
      ([name, controlValue, treatmentValue]) => `| ${name} | ${controlValue} | ${treatmentValue} |`,
    )
    .join("\n");
}

function exactNextRecommendation(decision: OtsuDecisionReport): string {
  if (decision.decision === "ADOPT_FOR_LARGER_EVALUATION") {
    return "Corpus expansion: add at least 30 governed Brand regions from at least 25 new source checksums, including at least 6 low-contrast, 6 textured, 6 outline/shadow, 6 small-crop, and 6 rotated/unknown cases; retain the original 11 as a locked comparison slice.";
  }
  if (decision.decision === "INCONCLUSIVE_CORPUS_EXPANSION_REQUIRED") {
    return `Corpus expansion: resolve exactly these missing evidence requirements — ${decision.incompleteEvidence.join("; ")}.`;
  }
  return "Adaptive thresholding: preregister one evaluation-only, default-off treatment on the same locked corpus and control, with an exact local-window algorithm and parameters frozen before any OCR output.";
}

function renderMetrics(args: {
  control: OtsuArmReport;
  treatment: OtsuArmReport;
  repeatControl: OtsuArmReport;
  repeatTreatment: OtsuArmReport;
  deltas: readonly OtsuCaseDelta[];
  decision: OtsuDecisionReport;
  changedVariables: readonly string[];
  nextRecommendation: string;
}): string {
  const caseRows = args.deltas
    .map(
      (item) =>
        `| ${item.caseId} | ${item.control.selectedCandidate ?? ""} | ${item.treatment.selectedCandidate ?? ""} | ${String(item.improved)} | ${String(item.regressed)} | ${String(item.becameEmpty)} | \`${item.mechanism}\` |`,
    )
    .join("\n");
  const criteriaRows = Object.entries(args.decision.successCriteria)
    .map(([criterion, passed]) => `| ${criterion} | ${passed ? "PASS" : "FAIL"} |`)
    .join("\n");
  const reasons =
    args.decision.killReasons.length === 0
      ? "- None."
      : args.decision.killReasons.map((reason) => `- ${reason}`).join("\n");
  return `# Bounded Brand automatic Otsu-threshold experiment

- Base SHA: \`${EXPECTED_BASE_SHA}\`
- Experiment design: one-variable-at-a-time
- Changed variables: ${args.changedVariables.map((value) => `\`${value}\``).join(", ")}
- Treatment: custom \`${OTSU_IMPLEMENTATION_ID}\`
- Channel-preserving output adapter: \`${OTSU_OUTPUT_ADAPTER_ID}\`
- Governed regions: ${args.control.otsuMetrics.caseCount}
- Behavior reproducible: ${String(args.decision.reproducible)}

## Implementation gate

The treatment uses the evaluation-only repository functions
\`selectOtsuThreshold\`, \`binarizeRgbOrRgbaWithOtsu\`, and
\`encodeChannelPreservingOtsuPng\`. The selector builds a 256-bin grayscale
histogram from deterministic RGB luminance and maximizes
\`wB * wF * (meanB - meanF)^2\`, using strict-greater comparison so the lowest
threshold wins ties. The binarizer emits RGB \`0,0,0\` for luminance at or below
the threshold and \`255,255,255\` above it, preserving RGB/RGBA layout and
copying every RGBA alpha byte unchanged. Empty or uniform input fails closed.
The Otsu branch contains no Sharp threshold or channel-conversion call, no
fixed/adaptive threshold, no CLAHE, no sharpening, and no inversion. The
primary and repeat encoded-artifact audit passed all 22 pairs, including exact
non-image PNG chunks and exposed metadata.

## Platform preflight

Before preregistration and treatment, current main's no-op, fixed 3× control,
and merged PR #199 CLAHE experiment were rerun. The no-op produced zero
behavioral deltas; the known control behavior hash reproduced; CLAHE behavior
hashes reproduced; guarded extractor hashes matched; production had no
research-runner import edge; and PR #195 remained a separate untouched draft.

## Primary aggregate metrics

| Metric | Control | Treatment |
| --- | ---: | ---: |
${renderMetricTable(args.control.otsuMetrics, args.treatment.otsuMetrics)}

## Deterministic repeat aggregate metrics

| Metric | Control | Treatment |
| --- | ---: | ---: |
${renderMetricTable(args.repeatControl.otsuMetrics, args.repeatTreatment.otsuMetrics)}

## Latency ratios

- Primary median: ${ratio(args.decision.primaryLatencyRatios.median)}
- Primary p95: ${ratio(args.decision.primaryLatencyRatios.p95)}
- Repeat median: ${ratio(args.decision.repeatLatencyRatios.median)}
- Repeat p95: ${ratio(args.decision.repeatLatencyRatios.p95)}

## Family analysis

- Improvement checksum families: ${args.decision.improvementChecksumFamilies.length === 0 ? "none" : args.decision.improvementChecksumFamilies.join(", ")}
- Improvement independence families: ${args.decision.improvementIndependenceFamilies.length === 0 ? "none" : args.decision.improvementIndependenceFamilies.join(", ")}
- Regression checksum families: ${args.decision.regressionChecksumFamilies.length === 0 ? "none" : args.decision.regressionChecksumFamilies.join(", ")}
- Regression independence families: ${args.decision.regressionIndependenceFamilies.length === 0 ? "none" : args.decision.regressionIndependenceFamilies.join(", ")}

## Per-case comparison

| Case | Control selected | Treatment selected | Improved | Regressed | Became empty | Mechanism |
| --- | --- | --- | --- | --- | --- | --- |
${caseRows}

## Preregistered criteria

| Criterion | Result |
| --- | --- |
${criteriaRows}

## Kill reasons

${reasons}

## Decision

\`${args.decision.decision}\`

## One next recommendation

${args.nextRecommendation}

No second treatment was run in this task.
`;
}

function renderMechanisms(deltas: readonly OtsuCaseDelta[]): string {
  const rows = deltas
    .filter((item) => item.outputChanged)
    .map(
      (item) =>
        `| ${item.caseId} | [pair](paired-preprocessed/${item.caseId}.png) | \`${item.mechanism}\` | ${item.mechanismEvidence} | ${item.visualSlices.thinStroke} | ${item.visualSlices.contrast} | ${item.visualSlices.outlineShadow} | ${item.visualSlices.background} |`,
    )
    .join("\n");
  return `# Otsu mechanism review

All 11 primary control/treatment preprocessed pairs were retained for
full-resolution inspection. Every behaviorally changed case has exactly one
primary classification. Visible binarization evidence is separated from OCR
movement; transcript movement alone is not treated as causal evidence.

| Changed case | Paired artifact | Classification | Visual and metric evidence | Thin stroke | Contrast | Outline/shadow | Background |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows || "| None | n/a | `OTSU_NO_MEANINGFUL_EFFECT` | No OCR behavior changed. | n/a | n/a | n/a | n/a |"}
`;
}

function applyVisualReview(deltas: readonly OtsuCaseDelta[]): OtsuCaseDelta[] {
  return deltas.map((item) => {
    if (!item.outputChanged) return item;
    const review = VISUAL_REVIEW[item.caseId];
    return review
      ? { ...item, mechanism: review.mechanism, mechanismEvidence: review.evidence }
      : item;
  });
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => {
    return (
      {
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      }[character] ?? character
    );
  });
}

async function writePairedPreprocessedArtifacts(deltas: readonly OtsuCaseDelta[]): Promise<void> {
  const outputRoot = path.join(OUTPUT_ROOT, "diff/paired-preprocessed");
  mkdirSync(outputRoot, { recursive: true });
  for (const item of deltas) {
    const control = await sharp(
      path.join(OUTPUT_ROOT, "control/preprocessed", `${item.caseId}.png`),
    )
      .flatten({ background: "#ffffff" })
      .resize({ width: 900, height: 550, fit: "contain", background: "#ffffff" })
      .png()
      .toBuffer();
    const treatment = await sharp(
      path.join(OUTPUT_ROOT, "treatment/preprocessed", `${item.caseId}.png`),
    )
      .flatten({ background: "#ffffff" })
      .resize({ width: 900, height: 550, fit: "contain", background: "#ffffff" })
      .png()
      .toBuffer();
    const label = Buffer.from(`
      <svg width="1800" height="90">
        <rect width="1800" height="90" fill="#111827"/>
        <text x="24" y="36" font-size="28" font-family="Menlo, monospace" fill="#f9fafb">${escapeXml(item.caseId)}</text>
        <text x="24" y="70" font-size="22" font-family="Menlo, monospace" fill="#93c5fd">CONTROL</text>
        <text x="924" y="70" font-size="22" font-family="Menlo, monospace" fill="#fca5a5">CUSTOM GLOBAL OTSU</text>
      </svg>
    `);
    await sharp({ create: { width: 1800, height: 640, channels: 3, background: "#ffffff" } })
      .composite([
        { input: label, left: 0, top: 0 },
        { input: control, left: 0, top: 90 },
        { input: treatment, left: 900, top: 90 },
      ])
      .png()
      .toFile(path.join(outputRoot, `${item.caseId}.png`));
  }
}

function copyArmArtifacts(sourceRoot: string, arm: "control" | "treatment"): void {
  const targetRoot = path.join(OUTPUT_ROOT, arm);
  mkdirSync(targetRoot, { recursive: true });
  for (const directory of ["crops", "preprocessed", "transcripts"] as const) {
    cpSync(path.join(sourceRoot, arm, directory), path.join(targetRoot, directory), {
      recursive: true,
    });
  }
}

function withoutUnretainedArtifactPaths(
  report: OtsuArmReport,
): OtsuArmReport & { artifactRetention: string } {
  return {
    ...report,
    artifactRetention:
      "Repeat behavior and metrics are retained; primary paired images are the representative visual artifacts.",
    cases: report.cases.map((item) => ({
      ...item,
      artifactPaths: {
        crop: "repeat-artifact-not-retained",
        preprocessed: "repeat-artifact-not-retained",
        transcript: "repeat-artifact-not-retained",
      },
    })),
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

async function applyFreshVisualReview(): Promise<void> {
  const control = readJson<OtsuArmReport>(path.join(OUTPUT_ROOT, "control/report.json"));
  const treatment = readJson<OtsuArmReport>(path.join(OUTPUT_ROOT, "treatment/report.json"));
  const repeatControl = readJson<OtsuArmReport>(
    path.join(OUTPUT_ROOT, "repeat/control-report.json"),
  );
  const repeatTreatment = readJson<OtsuArmReport>(
    path.join(OUTPUT_ROOT, "repeat/treatment-report.json"),
  );
  const decisionArtifact = readJson<
    OtsuDecisionReport & {
      nextRecommendation: string;
      isolation: { changedVariables: string[] };
    }
  >(path.join(OUTPUT_ROOT, "decision.json"));
  const deltas = applyVisualReview(compareOtsuArms(control, treatment));
  const unreviewed = deltas.filter((item) => item.outputChanged && !VISUAL_REVIEW[item.caseId]);
  if (unreviewed.length > 0) {
    throw new Error(
      `OTSU_CLEAN_VISUAL_REVIEW_INCOMPLETE: ${unreviewed.map((item) => item.caseId).join(",")}`,
    );
  }
  writeJsonl(path.join(OUTPUT_ROOT, "diff/per-case.jsonl"), deltas);
  writeFileSync(path.join(OUTPUT_ROOT, "diff/mechanisms.md"), renderMechanisms(deltas));
  writeFileSync(
    path.join(OUTPUT_ROOT, "diff/metrics.md"),
    renderMetrics({
      control,
      treatment,
      repeatControl,
      repeatTreatment,
      deltas,
      decision: decisionArtifact,
      changedVariables: decisionArtifact.isolation.changedVariables,
      nextRecommendation: decisionArtifact.nextRecommendation,
    }),
  );
  await writeJson(path.join(OUTPUT_ROOT, "visual-review.json"), {
    status: "PASS",
    evidenceSource: "fresh full-resolution inspection of clean-retry paired artifacts",
    invalidRunReviewReused: false,
    reviewedCaseCount: deltas.length,
    changedCaseCount: deltas.filter((item) => item.outputChanged).length,
    unreviewedChangedCaseCount: unreviewed.length,
    classifications: deltas.map((item) => ({
      caseId: item.caseId,
      outputChanged: item.outputChanged,
      mechanism: item.mechanism,
      evidence: item.mechanismEvidence,
    })),
  });
  console.log(
    JSON.stringify(
      {
        reportOnly: true,
        ocrInvoked: false,
        reviewedCaseCount: deltas.length,
        unreviewedChangedCaseCount: unreviewed.length,
      },
      null,
      2,
    ),
  );
}

async function main() {
  if (!preregistrationFrozen()) {
    throw new Error("OTSU_CLEAN_PREREGISTRATION_OR_FROZEN_INPUT_CHANGED");
  }
  const implementationVerified = otsuImplementationVerified() && productionImportBoundaryVerified();
  if (!implementationVerified) {
    throw new Error("OTSU_IMPLEMENTATION_GATE_FAILED");
  }
  if (process.argv.includes("--apply-visual-review")) {
    await applyFreshVisualReview();
    return;
  }
  if (process.argv.includes("--verify-only")) {
    console.log(
      JSON.stringify(
        {
          preregistrationFrozen: true,
          implementationVerified,
          productionImportBoundaryVerified: true,
          productionHashesUnchanged: !guardedProductionPathsChanged(),
          pr195BaselineHashUnchanged: !pr195BaselineChanged(),
        },
        null,
        2,
      ),
    );
    return;
  }
  const definition: ExperimentDefinition = {
    schemaVersion: OCR_EXPERIMENT_SCHEMA_VERSION,
    experimentId: "issue-149-brand-otsu-threshold-clean-retry",
    design: "one-variable-at-a-time",
    declaredVariable: "thresholdMethod",
    control: BRAND_OTSU_CONTROL,
    treatment: BRAND_OTSU_TREATMENT,
  };
  const manifest = composeResearchManifest({ includePrivate: false });
  const imageShaByFixture = Object.fromEntries(
    manifest.fixtures.map((fixture) => [fixture.fixtureId, fixture.image.sha256]),
  );
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "label-lens-brand-otsu-"));
  try {
    const primaryRoot = path.join(temporaryRoot, "primary");
    const repeatRoot = path.join(temporaryRoot, "repeat");
    const primary = await runOcrExperiment({ definition, manifest, outputRoot: primaryRoot });
    const primaryIsolationAudit = await auditEncodedRun(
      primaryRoot,
      "primary",
      primary.control.cases.map((item) => item.caseId),
    );
    if (primaryIsolationAudit.some((item) => !item.passed)) {
      throw new Error("OTSU_PRIMARY_OUTPUT_ISOLATION_GATE_FAILED");
    }
    const repeat = await runOcrExperiment({ definition, manifest, outputRoot: repeatRoot });
    const repeatIsolationAudit = await auditEncodedRun(
      repeatRoot,
      "repeat",
      repeat.control.cases.map((item) => item.caseId),
    );
    if (repeatIsolationAudit.some((item) => !item.passed)) {
      throw new Error("OTSU_REPEAT_OUTPUT_ISOLATION_GATE_FAILED");
    }
    const encodedIsolationAudit = [...primaryIsolationAudit, ...repeatIsolationAudit];
    const outputIsolationVerified =
      encodedIsolationAudit.length === 22 && encodedIsolationAudit.every((item) => item.passed);
    const control = enrichOtsuArm(primary.control, imageShaByFixture);
    const treatment = enrichOtsuArm(primary.treatment, imageShaByFixture);
    const repeatControl = enrichOtsuArm(repeat.control, imageShaByFixture);
    const repeatTreatment = enrichOtsuArm(repeat.treatment, imageShaByFixture);
    const deltas = applyVisualReview(compareOtsuArms(control, treatment));
    const decision = decideOtsuExperiment({
      primaryControl: control,
      primaryTreatment: treatment,
      repeatControl,
      repeatTreatment,
      changedVariables: primary.isolation.changedVariables,
      productionPathChanged: guardedProductionPathsChanged(),
      pr195BaselineChanged: pr195BaselineChanged(),
      sellerTruthPassedToOcr: false,
      implementationVerified,
      outputIsolationVerified,
      expectedControlBehaviorHash: BASELINE_CONTROL_BEHAVIOR_HASH,
    });
    const nextRecommendation = exactNextRecommendation(decision);

    mkdirSync(OUTPUT_ROOT, { recursive: true });
    for (const directory of ["control", "treatment", "repeat", "diff"] as const) {
      rmSync(path.join(OUTPUT_ROOT, directory), { recursive: true, force: true });
      mkdirSync(path.join(OUTPUT_ROOT, directory), { recursive: true });
    }
    copyArmArtifacts(primaryRoot, "control");
    copyArmArtifacts(primaryRoot, "treatment");
    await writePairedPreprocessedArtifacts(deltas);
    await writeJson(path.join(OUTPUT_ROOT, "control/config.json"), BRAND_OTSU_CONTROL);
    await writeJson(path.join(OUTPUT_ROOT, "control/report.json"), control);
    writeJsonl(
      path.join(OUTPUT_ROOT, "control/raw-words.jsonl"),
      control.cases.map((item) => ({ caseId: item.caseId, rawWords: item.rawWords })),
    );
    await writeJson(path.join(OUTPUT_ROOT, "treatment/config.json"), {
      ...BRAND_OTSU_TREATMENT,
      implementation: {
        id: OTSU_IMPLEMENTATION_ID,
        selector: "selectOtsuThreshold",
        channelPreservingBinarizer: "binarizeRgbOrRgbaWithOtsu",
        outputAdapter: {
          id: OTSU_OUTPUT_ADAPTER_ID,
          function: "encodeChannelPreservingOtsuPng",
        },
        histogramBins: 256,
        objective: "wB * wF * (meanB - meanF)^2",
        tieBreak: "lowest threshold",
        luminance: "floor((2126*R + 7152*G + 722*B + 5000) / 10000)",
        background: "luminance <= threshold -> RGB 0,0,0",
        foreground: "luminance > threshold -> RGB 255,255,255",
        alpha: "copied byte-for-byte for RGBA; absent for RGB",
        pngNonImageChunks: "copied byte-for-byte from control-equivalent PNG",
        degenerateInput: "fail closed",
        sharpThresholding: false,
        sharpChannelConversion: false,
      },
    });
    await writeJson(path.join(OUTPUT_ROOT, "treatment/report.json"), treatment);
    writeJsonl(
      path.join(OUTPUT_ROOT, "treatment/raw-words.jsonl"),
      treatment.cases.map((item) => ({ caseId: item.caseId, rawWords: item.rawWords })),
    );
    await writeJson(
      path.join(OUTPUT_ROOT, "repeat/control-report.json"),
      withoutUnretainedArtifactPaths(repeatControl),
    );
    await writeJson(
      path.join(OUTPUT_ROOT, "repeat/treatment-report.json"),
      withoutUnretainedArtifactPaths(repeatTreatment),
    );
    writeJsonl(path.join(OUTPUT_ROOT, "diff/per-case.jsonl"), deltas);
    await writeJson(path.join(OUTPUT_ROOT, "behavior-hashes.json"), {
      primary: { control: control.behaviorHash, treatment: treatment.behaviorHash },
      repeat: {
        control: repeatControl.behaviorHash,
        treatment: repeatTreatment.behaviorHash,
      },
      reproducible: decision.reproducible,
      baselineControlExpected: BASELINE_CONTROL_BEHAVIOR_HASH,
      baselineControlReproduced:
        control.behaviorHash === BASELINE_CONTROL_BEHAVIOR_HASH &&
        repeatControl.behaviorHash === BASELINE_CONTROL_BEHAVIOR_HASH,
    });
    await writeJson(path.join(OUTPUT_ROOT, "isolation-audit.json"), {
      status: "PASS",
      expectedPairCount: 22,
      auditedPairCount: encodedIsolationAudit.length,
      outputIsolationVerified,
      changedConfigurationVariables: primary.isolation.changedVariables,
      repeatChangedConfigurationVariables: repeat.isolation.changedVariables,
      selectorImplementationId: OTSU_IMPLEMENTATION_ID,
      outputAdapterId: OTSU_OUTPUT_ADAPTER_ID,
      pairs: encodedIsolationAudit,
    });
    await writeJson(path.join(OUTPUT_ROOT, "decision.json"), {
      ...decision,
      nextRecommendation,
      isolation: primary.isolation,
      implementationId: OTSU_IMPLEMENTATION_ID,
      outputAdapterId: OTSU_OUTPUT_ADAPTER_ID,
      implementationVerified,
      outputIsolationVerified,
      treatmentDefaultOff: true,
      productionEnabled: false,
    });
    writeFileSync(
      path.join(OUTPUT_ROOT, "diff/metrics.md"),
      renderMetrics({
        control,
        treatment,
        repeatControl,
        repeatTreatment,
        deltas,
        decision,
        changedVariables: primary.isolation.changedVariables,
        nextRecommendation,
      }),
    );
    writeFileSync(path.join(OUTPUT_ROOT, "diff/mechanisms.md"), renderMechanisms(deltas));
    writeFileSync(
      path.join(OUTPUT_ROOT, "git-sha.txt"),
      `${gitSha()}\nbase ${EXPECTED_BASE_SHA}\n`,
    );
    console.log(
      JSON.stringify(
        {
          outputRoot: OUTPUT_ROOT,
          decision,
          nextRecommendation,
          control: control.otsuMetrics,
          treatment: treatment.otsuMetrics,
          changedCases: deltas.filter((item) => item.outputChanged).length,
          unreviewedChangedCases: deltas.filter(
            (item) => item.outputChanged && !VISUAL_REVIEW[item.caseId],
          ).length,
        },
        null,
        2,
      ),
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
