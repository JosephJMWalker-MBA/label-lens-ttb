import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { format } from "prettier";
import sharp from "sharp";

import {
  BRAND_LOCAL_CONTRAST_CONTROL,
  BRAND_LOCAL_CONTRAST_TREATMENT,
  LOCAL_CONTRAST_CLAHE_PARAMETERS,
  compareLocalContrastArms,
  decideLocalContrastExperiment,
  enrichLocalContrastArm,
  type LocalContrastAggregateMetrics,
  type LocalContrastArmReport,
  type LocalContrastCaseDelta,
  type LocalContrastDecisionReport,
  type ClaheMechanism,
} from "@/fixtures/ocr-research/brand-local-contrast";
import {
  OCR_EXPERIMENT_SCHEMA_VERSION,
  runOcrExperiment,
  type ExperimentDefinition,
} from "@/fixtures/ocr-research/experiment";
import { composeResearchManifest } from "@/fixtures/ocr-research/fixture-corpus";

const OUTPUT_ROOT = path.join(process.cwd(), "artifacts/issue-149-brand-local-contrast");
const EXPECTED_BASE_SHA = "2dcc26f633199ad6ff5ab71857505edfced84981";
const BASELINE_CONTROL_BEHAVIOR_HASH =
  "b3db6f91ea925a60aee0adc043994a5fef1e57df3cb6df03860f038cc16ffb41";
const GUARDED_PRODUCTION_HASHES = {
  "src/pipeline/extractor/field-selection.ts":
    "3e84fa8a043570713991643830c7b95e0f7189a4ed037b737c783353d519106d",
  "src/pipeline/extractor/regions.ts":
    "910d763e20f47d811348b62c77f17d46ddf3a07b5849a337669a07f6b8efc9ab",
  "src/pipeline/extractor/extractor.ts":
    "9b2712e6bb15552e9524bc5e60be4da2b163bdb325206f452ecbaf44ebf5084c",
} as const;
const VISUAL_REVIEW: Readonly<Record<string, { mechanism: ClaheMechanism; evidence: string }>> = {
  "approved-wine-004": {
    mechanism: "CLAHE_CREATED_ARTIFACT",
    evidence:
      "The treatment pair shows repeated light/dark contours around the script, sans letters, and enclosing arc; OCR loses the control candidate and truth distance worsens.",
  },
  "approved-wine-005": {
    mechanism: "CLAHE_CREATED_ARTIFACT",
    evidence:
      "The treatment pair shows repeated light/dark contours around the script, sans letters, and enclosing arc; OCR replaces two partial control candidates with unrelated text.",
  },
  "approved-wine-023": {
    mechanism: "CLAHE_CREATED_ARTIFACT",
    evidence:
      "The treatment pair shows dense contour speckle around and inside the script on an otherwise clean background; truth distance worsens and no candidate is recovered.",
  },
  "approved-wine-027": {
    mechanism: "CLAHE_CREATED_ARTIFACT",
    evidence:
      "The treatment pair shows horizontal banding and repeated contours across the decorative lines and letter edges; truth distance worsens and no candidate is recovered.",
  },
  "approved-wine-031": {
    mechanism: "CLAHE_CREATED_ARTIFACT",
    evidence:
      "The treatment pair shows halos and speckled contours in clean letter interiors and surrounding whitespace; the near control transcript is replaced by unrelated OCR.",
  },
  "approved-wine-035": {
    mechanism: "CLAHE_AMPLIFIED_BACKGROUND_TEXTURE",
    evidence:
      "The treatment pair turns subtle pale mottling into a dense rectangular contour field around the script; truth distance worsens and the control candidate is lost.",
  },
  "approved-wine-085": {
    mechanism: "CLAHE_AMPLIFIED_BACKGROUND_TEXTURE",
    evidence:
      "The low-contrast treatment pair turns faint tonal background variation into dense contours around the word and underline; truth distance worsens and the control candidate is lost.",
  },
  "approved-wine-091": {
    mechanism: "CLAHE_CREATED_ARTIFACT",
    evidence:
      "The treatment pair shows repeated edge contours and speckle inside and around the stacked letters; truth distance worsens and no candidate is recovered.",
  },
  "la-fattoria-rotated": {
    mechanism: "CLAHE_CREATED_ARTIFACT",
    evidence:
      "The treatment pair shows repeated light/dark contours around the script, sans letters, and enclosing arc; OCR loses the control candidate and truth distance worsens.",
  },
  "wine-multi-artifact-04-region-1": {
    mechanism: "CLAHE_CREATED_ARTIFACT",
    evidence:
      "The treatment pair shows dense edge ringing and contour blocks across the script and adjacent pale areas; truth distance worsens and no candidate is recovered.",
  },
  "wine-multi-artifact-04-region-2": {
    mechanism: "CLAHE_CREATED_ARTIFACT",
    evidence:
      "The treatment pair shows dense edge ringing and contour blocks around the smaller script and underline; truth distance worsens and the control candidate is lost.",
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

function guardedProductionPathsChanged(): boolean {
  return Object.entries(GUARDED_PRODUCTION_HASHES).some(
    ([filePath, expectedHash]) => sha256File(path.join(process.cwd(), filePath)) !== expectedHash,
  );
}

function pr195BaselineChanged(): boolean {
  const filePath = "src/pipeline/extractor/field-selection.ts";
  return sha256File(path.join(process.cwd(), filePath)) !== GUARDED_PRODUCTION_HASHES[filePath];
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

function renderMetricTable(
  control: LocalContrastAggregateMetrics,
  treatment: LocalContrastAggregateMetrics,
): string {
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

function exactNextRecommendation(decision: LocalContrastDecisionReport): string {
  if (decision.decision === "ADOPT_FOR_LARGER_EVALUATION") {
    return "Corpus expansion: add at least 30 governed Brand regions from at least 25 new source checksums, including at least 6 low-contrast, 6 textured, 6 outline/shadow, 6 small-crop, and 6 rotated/unknown cases; keep the original 11 as a locked comparison slice.";
  }
  if (decision.decision === "INCONCLUSIVE_CORPUS_EXPANSION_REQUIRED") {
    return `Corpus expansion: resolve exactly these missing evidence requirements — ${decision.incompleteEvidence.join("; ")}.`;
  }
  return "Otsu thresholding: run one separately preregistered treatment using the runner's deterministic Otsu threshold after the same 3x grayscale/normalise control, with no CLAHE or sharpening.";
}

function renderMetrics(args: {
  control: LocalContrastArmReport;
  treatment: LocalContrastArmReport;
  repeatControl: LocalContrastArmReport;
  repeatTreatment: LocalContrastArmReport;
  deltas: readonly LocalContrastCaseDelta[];
  decision: LocalContrastDecisionReport;
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
  return `# Bounded Brand fixed local-contrast experiment

- Base SHA: \`${EXPECTED_BASE_SHA}\`
- Experiment design: one-variable-at-a-time
- Changed variables: ${args.changedVariables.map((value) => `\`${value}\``).join(", ")}
- Treatment: Sharp \`clahe({ width: 3, height: 3, maxSlope: 3 })\`
- Governed regions: ${args.control.localContrastMetrics.caseCount}
- Behavior reproducible: ${String(args.decision.reproducible)}

## Platform preflight

Before preregistration and treatment, merged main's no-op, fixed 3× control, and PR #198 sharpening experiment were rerun. The no-op produced zero behavioral deltas. The control behavior hash remained \`${BASELINE_CONTROL_BEHAVIOR_HASH}\`, sharpening behavior hashes reproduced, production had no research-runner import edge, guarded extractor hashes matched, and PR #195 remained a separate untouched draft.

## Primary aggregate metrics

| Metric | Control | Treatment |
| --- | ---: | ---: |
${renderMetricTable(args.control.localContrastMetrics, args.treatment.localContrastMetrics)}

## Deterministic repeat aggregate metrics

| Metric | Control | Treatment |
| --- | ---: | ---: |
${renderMetricTable(
  args.repeatControl.localContrastMetrics,
  args.repeatTreatment.localContrastMetrics,
)}

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

function renderMechanisms(deltas: readonly LocalContrastCaseDelta[]): string {
  const changed = deltas.filter((item) => item.outputChanged);
  const rows = changed
    .map(
      (item) =>
        `| ${item.caseId} | [pair](paired-preprocessed/${item.caseId}.png) | \`${item.mechanism}\` | ${item.mechanismEvidence} | ${item.visualSlices.thinStroke} | ${item.visualSlices.contrast} | ${item.visualSlices.outlineShadow} | ${item.visualSlices.background} |`,
    )
    .join("\n");
  return `# CLAHE mechanism review

Every changed case receives exactly one primary classification. All 11 primary control/treatment preprocessed pairs were inspected at full resolution. The review names only directly visible treatment-pair effects and reports OCR movement separately; it does not claim an unmeasured downstream causal pathway.

| Changed case | Paired artifact | Classification | Visual and metric evidence | Thin stroke | Contrast | Outline/shadow | Background |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows || "| None | n/a | `CLAHE_NO_MEANINGFUL_EFFECT` | No OCR behavior changed. | n/a | n/a | n/a | n/a |"}

## Paired-artifact review

The fixed treatment adds strong contour/outline structure in all 11 pairs. The primary classification is \`CLAHE_AMPLIFIED_BACKGROUND_TEXTURE\` only where the governed source already has a textured or tonal background and that texture visibly expands into a dense contour field; the other pairs use the broader \`CLAHE_CREATED_ARTIFACT\`. No pair supports recovered characters, recovered words, improved candidate generation, improved ranking, merged characters, isolated thin-stroke erosion, or empty OCR.
`;
}

function applyVisualReview(deltas: readonly LocalContrastCaseDelta[]): LocalContrastCaseDelta[] {
  return deltas.map((item) => {
    if (!item.outputChanged) return item;
    const review = VISUAL_REVIEW[item.caseId];
    if (!review) {
      throw new Error(`MISSING_PAIRED_VISUAL_REVIEW: ${item.caseId}`);
    }
    return {
      ...item,
      mechanism: review.mechanism,
      mechanismEvidence: review.evidence,
    };
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

async function writePairedPreprocessedArtifacts(
  deltas: readonly LocalContrastCaseDelta[],
): Promise<void> {
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
        <text x="924" y="70" font-size="22" font-family="Menlo, monospace" fill="#fca5a5">CLAHE 3x3 / slope 3</text>
      </svg>
    `);
    await sharp({
      create: {
        width: 1800,
        height: 640,
        channels: 3,
        background: "#ffffff",
      },
    })
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
  report: LocalContrastArmReport,
): LocalContrastArmReport & { artifactRetention: string } {
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

async function main() {
  const definition: ExperimentDefinition = {
    schemaVersion: OCR_EXPERIMENT_SCHEMA_VERSION,
    experimentId: "issue-149-brand-local-contrast",
    design: "one-variable-at-a-time",
    declaredVariable: "localContrast",
    control: BRAND_LOCAL_CONTRAST_CONTROL,
    treatment: BRAND_LOCAL_CONTRAST_TREATMENT,
  };
  const manifest = composeResearchManifest({ includePrivate: false });
  const imageShaByFixture = Object.fromEntries(
    manifest.fixtures.map((fixture) => [fixture.fixtureId, fixture.image.sha256]),
  );
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "label-lens-brand-local-contrast-"));
  try {
    const primaryRoot = path.join(temporaryRoot, "primary");
    const repeatRoot = path.join(temporaryRoot, "repeat");
    const primary = await runOcrExperiment({
      definition,
      manifest,
      outputRoot: primaryRoot,
    });
    const repeat = await runOcrExperiment({
      definition,
      manifest,
      outputRoot: repeatRoot,
    });
    const control = enrichLocalContrastArm(primary.control, imageShaByFixture);
    const treatment = enrichLocalContrastArm(primary.treatment, imageShaByFixture);
    const repeatControl = enrichLocalContrastArm(repeat.control, imageShaByFixture);
    const repeatTreatment = enrichLocalContrastArm(repeat.treatment, imageShaByFixture);
    const deltas = applyVisualReview(compareLocalContrastArms(control, treatment));
    const decision = decideLocalContrastExperiment({
      primaryControl: control,
      primaryTreatment: treatment,
      repeatControl,
      repeatTreatment,
      changedVariables: primary.isolation.changedVariables,
      productionPathChanged: guardedProductionPathsChanged(),
      pr195BaselineChanged: pr195BaselineChanged(),
      sellerTruthPassedToOcr: false,
    });
    const nextRecommendation = exactNextRecommendation(decision);

    mkdirSync(OUTPUT_ROOT, { recursive: true });
    for (const directory of ["control", "treatment", "repeat", "diff"] as const) {
      rmSync(path.join(OUTPUT_ROOT, directory), {
        recursive: true,
        force: true,
      });
      mkdirSync(path.join(OUTPUT_ROOT, directory), { recursive: true });
    }
    copyArmArtifacts(primaryRoot, "control");
    copyArmArtifacts(primaryRoot, "treatment");
    await writePairedPreprocessedArtifacts(deltas);
    await writeJson(path.join(OUTPUT_ROOT, "control/config.json"), BRAND_LOCAL_CONTRAST_CONTROL);
    await writeJson(path.join(OUTPUT_ROOT, "control/report.json"), control);
    writeJsonl(
      path.join(OUTPUT_ROOT, "control/raw-words.jsonl"),
      control.cases.map((item) => ({
        caseId: item.caseId,
        rawWords: item.rawWords,
      })),
    );
    await writeJson(path.join(OUTPUT_ROOT, "treatment/config.json"), {
      ...BRAND_LOCAL_CONTRAST_TREATMENT,
      localContrastParameters: LOCAL_CONTRAST_CLAHE_PARAMETERS,
    });
    await writeJson(path.join(OUTPUT_ROOT, "treatment/report.json"), treatment);
    writeJsonl(
      path.join(OUTPUT_ROOT, "treatment/raw-words.jsonl"),
      treatment.cases.map((item) => ({
        caseId: item.caseId,
        rawWords: item.rawWords,
      })),
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
      primary: {
        control: control.behaviorHash,
        treatment: treatment.behaviorHash,
      },
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
    await writeJson(path.join(OUTPUT_ROOT, "decision.json"), {
      ...decision,
      nextRecommendation,
      isolation: primary.isolation,
      treatmentParameters: LOCAL_CONTRAST_CLAHE_PARAMETERS,
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
          control: control.localContrastMetrics,
          treatment: treatment.localContrastMetrics,
          changedCases: deltas.filter((item) => item.outputChanged).length,
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
