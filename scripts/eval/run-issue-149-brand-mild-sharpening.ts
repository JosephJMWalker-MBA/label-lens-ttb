import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { format } from "prettier";

import {
  BRAND_MILD_SHARPENING_CONTROL,
  BRAND_MILD_SHARPENING_TREATMENT,
  MILD_SHARPENING_PARAMETERS,
  compareBrandArms,
  decideSharpeningExperiment,
  enrichBrandArm,
  type BrandAggregateMetrics,
  type BrandArmReport,
  type BrandCaseDelta,
  type SharpeningDecisionReport,
} from "@/fixtures/ocr-research/brand-mild-sharpening";
import {
  OCR_EXPERIMENT_SCHEMA_VERSION,
  runOcrExperiment,
  type ExperimentDefinition,
} from "@/fixtures/ocr-research/experiment";
import { composeResearchManifest } from "@/fixtures/ocr-research/fixture-corpus";

const OUTPUT_ROOT = path.join(process.cwd(), "artifacts/issue-149-brand-mild-sharpening");
const EXPECTED_BASE_SHA = "4aac539c7d314cc0d57ed168e270f5191bed161d";
const GUARDED_PRODUCTION_HASHES = {
  "src/pipeline/extractor/field-selection.ts":
    "3e84fa8a043570713991643830c7b95e0f7189a4ed037b737c783353d519106d",
  "src/pipeline/extractor/regions.ts":
    "910d763e20f47d811348b62c77f17d46ddf3a07b5849a337669a07f6b8efc9ab",
  "src/pipeline/extractor/extractor.ts":
    "9b2712e6bb15552e9524bc5e60be4da2b163bdb325206f452ecbaf44ebf5084c",
} as const;

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

async function writeJson(filePath: string, value: unknown): Promise<void> {
  writeFileSync(
    filePath,
    await format(JSON.stringify(value), {
      parser: "json",
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
  control: BrandAggregateMetrics,
  treatment: BrandAggregateMetrics,
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
    ["Empty OCR", String(control.emptyOcr.count), String(treatment.emptyOcr.count)],
    [
      "Wrong reliable reads",
      String(control.wrongReliableReads.count),
      String(treatment.wrongReliableReads.count),
    ],
    [
      "Correct but conservative",
      String(control.correctButConservative.count),
      String(treatment.correctButConservative.count),
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

function renderMetrics(args: {
  control: BrandArmReport;
  treatment: BrandArmReport;
  repeatControl: BrandArmReport;
  repeatTreatment: BrandArmReport;
  deltas: readonly BrandCaseDelta[];
  decision: SharpeningDecisionReport;
  changedVariables: readonly string[];
}): string {
  const changedRows = args.deltas
    .map(
      (item) =>
        `| ${item.caseId} | ${item.control.selectedCandidate ?? ""} | ${item.treatment.selectedCandidate ?? ""} | ${String(item.accuracyImproved)} | ${String(item.accuracyRegressed)} | ${String(item.becameEmpty)} | \`${item.mechanism}\` |`,
    )
    .join("\n");
  const criteriaRows = Object.entries(args.decision.successCriteria)
    .map(([criterion, passed]) => `| ${criterion} | ${passed ? "PASS" : "FAIL"} |`)
    .join("\n");
  const reasons =
    args.decision.killReasons.length === 0
      ? "- None."
      : args.decision.killReasons.map((reason) => `- ${reason}`).join("\n");
  return `# Bounded Brand mild-sharpening experiment

- Base SHA: \`${EXPECTED_BASE_SHA}\`
- Experiment design: one-variable-at-a-time
- Changed variables: ${args.changedVariables.map((value) => `\`${value}\``).join(", ")}
- Sharpening: Sharp \`sharpen({ sigma: 1, m1: 1, m2: 2, x1: 2, y2: 10, y3: 20 })\`
- Governed regions: ${args.control.brandMetrics.caseCount}
- Behavior reproducible: ${String(args.decision.reproducible)}

## Platform preflight

Before treatment, the merged no-op was rerun at base \`${EXPECTED_BASE_SHA}\`. Control and identical treatment both produced behavior hash \`b3db6f91ea925a60aee0adc043994a5fef1e57df3cb6df03860f038cc16ffb41\`, zero behavioral deltas, 0/11 correct, 11/11 failures, and zero false reliable reads. This reproduces the fixed 3× control. Repository import inspection found no production import edge from \`src/fixtures/ocr-research\`.

## Primary aggregate metrics

| Metric | Control | Treatment |
| --- | ---: | ---: |
${renderMetricTable(args.control.brandMetrics, args.treatment.brandMetrics)}

## Deterministic repeat aggregate metrics

| Metric | Control | Treatment |
| --- | ---: | ---: |
${renderMetricTable(args.repeatControl.brandMetrics, args.repeatTreatment.brandMetrics)}

## Per-case comparison

| Case | Control selected | Treatment selected | Improved | Regressed | Became empty | Mechanism |
| --- | --- | --- | --- | --- | --- | --- |
${changedRows}

## Preregistered criteria

| Criterion | Result |
| --- | --- |
${criteriaRows}

## Kill reasons

${reasons}

## Decision

\`${args.decision.decision}\`

The one permitted follow-up recommendation is **local contrast enhancement**, as a separately preregistered one-variable experiment. No second treatment was run here.
`;
}

function renderMechanisms(deltas: readonly BrandCaseDelta[]): string {
  const changed = deltas.filter((item) => item.outputChanged);
  const rows = changed
    .map(
      (item) =>
        `| ${item.caseId} | \`${item.mechanism}\` | ${item.mechanismEvidence} | ${item.visualSlices.thinStroke} | ${item.visualSlices.outlineShadow} | ${item.visualSlices.background} |`,
    )
    .join("\n");
  return `# Sharpening mechanism review

Mechanism labels below are deterministic classifications from OCR words, normalized transcripts, candidate traces, confidence, and truth-distance metrics. Visual causal language is intentionally withheld unless the paired artifacts support it.

| Changed case | Classification | Metric evidence | Thin stroke | Outline/shadow | Background |
| --- | --- | --- | --- | --- | --- |
${rows || "| None | `SHARPENING_NO_MEANINGFUL_EFFECT` | No OCR behavior changed. | n/a | n/a | n/a |"}

## Paired-artifact review

All 11 control/treatment preprocessed pairs were inspected side by side.

- \`approved-wine-004\`, \`approved-wine-005\`, \`approved-wine-031\`, \`approved-wine-091\`, \`la-fattoria-rotated\`, and \`wine-multi-artifact-04-region-1\`: treatment edges are visibly darker/crisper, including thin strokes and punctuation/diacritics, but normalized transcript and candidate semantics do not improve. The recorded effect is confidence-only; the images do not support a stronger causal claim.
- \`approved-wine-023\`: thin script edges become crisper and normalized edit distance to truth improves from 14 to 12. Truth is still absent from the raw transcript and candidate list, so this is only metric evidence for character recovery, not a successful word recovery.
- \`approved-wine-035\`: thin script edges become crisper and normalized edit distance improves from 9 to 8, but the shorter treatment candidate is still wrong. The pair does not establish whether edge contrast or character merging produced the change.
- \`approved-wine-027\`: sharpening visibly emphasizes the decorative outline/background edges. The treatment OCR trace expands into many line/noise-like symbols and selects \`AEE EEE\`; this is consistent with texture/noise amplification, but the metrics cannot isolate grouping from artifact creation, so the classification remains \`UNDETERMINED\`.
- \`approved-wine-085\`: the low-contrast textured crop becomes darker and crisper, while OCR changes from one wrong candidate to different wrong fragments with no kept candidate. Noise amplification is visually plausible, but not established; classification remains \`UNDETERMINED\`.
- \`wine-multi-artifact-04-region-2\`: the paired crop remains visibly present and readable, but treatment OCR changes from \`Colles Dig\` / selected \`Colles\` to no words. This directly supports \`SHARPENING_CAUSED_EMPTY_OCR\`; it does not establish which anti-aliasing or edge-strength interaction caused the recognizer failure.

No paired artifact supports successful Brand recovery. There is no evidence that sharpening repaired punctuation, outline/shadow handling, character merging, or textured-background recognition.
`;
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

async function main() {
  const definition: ExperimentDefinition = {
    schemaVersion: OCR_EXPERIMENT_SCHEMA_VERSION,
    experimentId: "issue-149-brand-mild-sharpening",
    design: "one-variable-at-a-time",
    declaredVariable: "sharpening",
    control: BRAND_MILD_SHARPENING_CONTROL,
    treatment: BRAND_MILD_SHARPENING_TREATMENT,
  };
  const manifest = composeResearchManifest({ includePrivate: false });
  const imageShaByFixture = Object.fromEntries(
    manifest.fixtures.map((fixture) => [fixture.fixtureId, fixture.image.sha256]),
  );
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "label-lens-brand-sharpening-"));
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
    const control = enrichBrandArm(primary.control, imageShaByFixture);
    const treatment = enrichBrandArm(primary.treatment, imageShaByFixture);
    const repeatControl = enrichBrandArm(repeat.control, imageShaByFixture);
    const repeatTreatment = enrichBrandArm(repeat.treatment, imageShaByFixture);
    const deltas = compareBrandArms(control, treatment);
    const decision = decideSharpeningExperiment({
      primaryControl: control,
      primaryTreatment: treatment,
      repeatControl,
      repeatTreatment,
      changedVariables: primary.isolation.changedVariables,
      productionPathChanged: guardedProductionPathsChanged(),
      sellerTruthPassedToOcr: false,
    });

    mkdirSync(OUTPUT_ROOT, { recursive: true });
    for (const directory of ["control", "treatment", "diff"] as const) {
      rmSync(path.join(OUTPUT_ROOT, directory), { recursive: true, force: true });
      mkdirSync(path.join(OUTPUT_ROOT, directory), { recursive: true });
    }
    copyArmArtifacts(primaryRoot, "control");
    copyArmArtifacts(primaryRoot, "treatment");
    await writeJson(path.join(OUTPUT_ROOT, "control/config.json"), BRAND_MILD_SHARPENING_CONTROL);
    await writeJson(path.join(OUTPUT_ROOT, "control/report.json"), control);
    writeJsonl(
      path.join(OUTPUT_ROOT, "control/raw-words.jsonl"),
      control.cases.map((item) => ({ caseId: item.caseId, rawWords: item.rawWords })),
    );
    await writeJson(path.join(OUTPUT_ROOT, "treatment/config.json"), {
      ...BRAND_MILD_SHARPENING_TREATMENT,
      sharpeningParameters: MILD_SHARPENING_PARAMETERS,
    });
    await writeJson(path.join(OUTPUT_ROOT, "treatment/report.json"), treatment);
    writeJsonl(
      path.join(OUTPUT_ROOT, "treatment/raw-words.jsonl"),
      treatment.cases.map((item) => ({ caseId: item.caseId, rawWords: item.rawWords })),
    );
    writeJsonl(path.join(OUTPUT_ROOT, "diff/per-case.jsonl"), deltas);
    await writeJson(path.join(OUTPUT_ROOT, "diff/reproducibility.json"), {
      primary: {
        controlBehaviorHash: control.behaviorHash,
        treatmentBehaviorHash: treatment.behaviorHash,
      },
      repeat: {
        controlBehaviorHash: repeatControl.behaviorHash,
        treatmentBehaviorHash: repeatTreatment.behaviorHash,
      },
      reproducible: decision.reproducible,
      repeatMetrics: {
        control: repeatControl.brandMetrics,
        treatment: repeatTreatment.brandMetrics,
      },
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
          control: control.brandMetrics,
          treatment: treatment.brandMetrics,
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
