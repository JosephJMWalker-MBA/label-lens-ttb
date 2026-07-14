import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

import { loadCaseImage, loadEvalManifest } from "../../eval-loader";

import { runVisionObserverLifecycle } from "../observer-lifecycle";
import type { VisionObservationErrorRecord } from "../observer-grid.types";

import { LlamaServerVisionObserverAdapter } from "./llama-server-adapter";
import { validateLocalVlmExperimentReport, validateLocalVlmRunReport } from "./local-vlm.schema";
import type {
  LocalVlmAggregateReport,
  LocalVlmDecision,
  LocalVlmExperimentReport,
  LocalVlmResolvedConfig,
  LocalVlmRunReport,
} from "./local-vlm.types";
import {
  LOCAL_VLM_PROMPT_ID,
  LOCAL_VLM_PROMPT_SHA256,
  LOCAL_VLM_PROMPT_VERSION,
} from "./observer-prompt";

interface ObservationCaseInput {
  scenarioId: string;
  sourceArtifactRef: string;
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  sourceWidth: number;
  sourceHeight: number;
  canaryTokens: readonly string[];
}

interface ObservationTraceContext {
  observationRunId: string;
  observationIds: readonly string[];
  proposalDescriptions: readonly string[];
  canaryTokens: readonly string[];
}

interface ContaminationSignalAnalysis {
  contaminationTokensDetected: string[];
  priorRunIdsDetected: string[];
  priorObservationIdsDetected: string[];
  copiedDescriptionsDetected: string[];
  comparisonLanguageDetected: string[];
}

const REQUIRED_CONTAMINATION_SEQUENCE = [
  "contamination-a",
  "contamination-b",
  "contamination-a",
  "contamination-c",
  "contamination-b",
] as const;
const MIN_REAL_RUNTIME_STRESS_SAMPLES = 10;
const COMPARISON_LANGUAGE_PATTERNS = [
  /\bPREVIOUS\b/g,
  /\bBEFORE\b/g,
  /\bCOMPARE\b/g,
  /\bCOMPARISON\b/g,
] as const;

function normalizeText(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
}

function detectNormalizedMatches(args: {
  normalizedText: string;
  candidates: readonly string[];
  excluded: ReadonlySet<string>;
}): string[] {
  const seen = new Set<string>();
  const matches: string[] = [];
  for (const candidate of args.candidates) {
    const normalizedCandidate = normalizeText(candidate);
    if (!normalizedCandidate || args.excluded.has(normalizedCandidate)) continue;
    if (!args.normalizedText.includes(normalizedCandidate) || seen.has(normalizedCandidate))
      continue;
    seen.add(normalizedCandidate);
    matches.push(candidate);
  }
  return matches;
}

function comparisonLanguageMatches(normalizedText: string): string[] {
  return COMPARISON_LANGUAGE_PATTERNS.flatMap((pattern) => {
    const matches = normalizedText.match(pattern);
    return matches ? [matches[0]!] : [];
  });
}

function hasSchemaValidOutput(run: LocalVlmRunReport): boolean {
  return run.schemaValid && run.schemaSuccess && run.geometrySuccess;
}

function hasLeakageSignals(run: LocalVlmRunReport): boolean {
  return (
    run.contaminationTokensDetected.length > 0 ||
    run.priorRunIdsDetected.length > 0 ||
    run.priorObservationIdsDetected.length > 0 ||
    run.copiedDescriptionsDetected.length > 0 ||
    run.comparisonLanguageDetected.length > 0
  );
}

function hasConfirmedCleanupAndExit(run: LocalVlmRunReport): boolean {
  return (
    run.cleanupCompleted &&
    run.process.portReleased === true &&
    run.process.exitedAt !== null &&
    run.process.pid !== null
  );
}

function hasConfirmedProcessTreeRelease(run: LocalVlmRunReport): boolean {
  return run.resources.processTreeReleasedAfterTermination === true;
}

function hasUniqueWorkspaceRefs(runs: readonly LocalVlmRunReport[]): boolean {
  return new Set(runs.map((run) => run.workspaceRef)).size === runs.length;
}

function hasUniqueProcessLifetimes(runs: readonly LocalVlmRunReport[]): boolean {
  const lifetimes = runs.map(
    (run) => `${run.process.pid ?? "null"}:${run.process.spawnedAt ?? "null"}`,
  );
  return (
    !lifetimes.some((value) => value.includes("null")) && new Set(lifetimes).size === runs.length
  );
}

function usesRealRuntime(runs: readonly LocalVlmRunReport[]): boolean {
  return runs.every((run) => run.runtimeKind === "real-local-vlm");
}

function isExpectedContaminationSequence(runs: readonly LocalVlmRunReport[]): boolean {
  return (
    runs.length === REQUIRED_CONTAMINATION_SEQUENCE.length &&
    runs.every((run, index) => run.scenarioId === REQUIRED_CONTAMINATION_SEQUENCE[index])
  );
}

function numericSeries(values: readonly (number | null | undefined)[]): number[] {
  return values.filter((value): value is number => typeof value === "number");
}

function showsMonotonicGrowth(values: readonly number[]): boolean {
  if (values.length < 3) return false;
  let sawIncrease = false;
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1]!;
    const current = values[index]!;
    if (current < previous) return false;
    if (current > previous) sawIncrease = true;
  }
  return sawIncrease;
}

function observationIdsOf(report: LocalVlmRunReport): readonly string[] {
  return report.observationIds;
}

function descriptionsOf(report: LocalVlmRunReport): readonly string[] {
  return report.proposalDescriptions;
}

export function analyzeContaminationSignals(args: {
  rawText: string | null;
  current: ObservationTraceContext;
  prior: readonly ObservationTraceContext[];
}): ContaminationSignalAnalysis {
  const normalized = normalizeText(args.rawText);
  const excludedCanaries = new Set(args.current.canaryTokens.map((token) => normalizeText(token)));
  const excludedRunIds = new Set([normalizeText(args.current.observationRunId)]);
  const excludedObservationIds = new Set(
    args.current.observationIds.map((observationId) => normalizeText(observationId)),
  );
  const excludedDescriptions = new Set(
    args.current.proposalDescriptions.map((description) => normalizeText(description)),
  );

  const priorCanaries = args.prior.flatMap((entry) => entry.canaryTokens);
  const priorRunIds = args.prior.map((entry) => entry.observationRunId);
  const priorObservationIds = args.prior.flatMap((entry) => entry.observationIds);
  const priorDescriptions = args.prior.flatMap((entry) => entry.proposalDescriptions);

  return {
    contaminationTokensDetected: detectNormalizedMatches({
      normalizedText: normalized,
      candidates: priorCanaries,
      excluded: excludedCanaries,
    }),
    priorRunIdsDetected: detectNormalizedMatches({
      normalizedText: normalized,
      candidates: priorRunIds,
      excluded: excludedRunIds,
    }),
    priorObservationIdsDetected: detectNormalizedMatches({
      normalizedText: normalized,
      candidates: priorObservationIds,
      excluded: excludedObservationIds,
    }),
    copiedDescriptionsDetected: detectNormalizedMatches({
      normalizedText: normalized,
      candidates: priorDescriptions,
      excluded: excludedDescriptions,
    }),
    comparisonLanguageDetected: comparisonLanguageMatches(normalized),
  };
}

export function detectContaminationTokens(
  rawText: string | null,
  priorCanaries: readonly string[],
): string[] {
  return analyzeContaminationSignals({
    rawText,
    current: {
      observationRunId: "",
      observationIds: [],
      proposalDescriptions: [],
      canaryTokens: [],
    },
    prior: [
      {
        observationRunId: "",
        observationIds: [],
        proposalDescriptions: [],
        canaryTokens: priorCanaries,
      },
    ],
  }).contaminationTokensDetected;
}

export function buildLocalVlmAggregateReport(
  runs: readonly LocalVlmRunReport[],
): LocalVlmAggregateReport {
  return {
    runCount: runs.length,
    validResponseCount: runs.filter((run) => run.schemaValid).length,
    invalidResponseCount: runs.filter((run) => !run.schemaValid).length,
    contaminationCount: runs.filter(hasLeakageSignals).length,
    cleanupFailureCount: runs.filter((run) => !run.cleanupCompleted).length,
    forcedTerminationCount: runs.filter((run) => run.forcedTermination).length,
    prohibitedClaimCount: runs.filter((run) => run.prohibitedClaimDetected).length,
    schemaFailureCount: runs.filter((run) => !run.schemaSuccess).length,
    peakRssSummary: {
      peakProcessRssBytes: runs.reduce<number | null>(
        (peak, run) => Math.max(peak ?? 0, run.resources.peakProcessRssBytes ?? 0) || null,
        null,
      ),
      peakProcessTreeRssBytes: runs.reduce<number | null>(
        (peak, run) => Math.max(peak ?? 0, run.resources.peakProcessTreeRssBytes ?? 0) || null,
        null,
      ),
    },
    workspaceSummary: {
      maxWorkspaceBytes: Math.max(0, ...runs.map((run) => run.resources.workspacePeakBytes)),
      maxWorkspaceFiles: Math.max(0, ...runs.map((run) => run.resources.fileCountPeak)),
    },
    latencySummary: {
      maxStartupMs: runs.reduce<number | null>(
        (peak, run) => Math.max(peak ?? 0, run.timing.startupMs ?? 0) || null,
        null,
      ),
      maxRequestMs: runs.reduce<number | null>(
        (peak, run) => Math.max(peak ?? 0, run.timing.requestMs ?? 0) || null,
        null,
      ),
      maxTerminationMs: runs.reduce<number | null>(
        (peak, run) => Math.max(peak ?? 0, run.timing.terminationMs ?? 0) || null,
        null,
      ),
    },
  };
}

export function decideLocalVlmContamination(runs: readonly LocalVlmRunReport[]): LocalVlmDecision {
  if (runs.length === 0) return "INSUFFICIENT EVIDENCE";
  if (!usesRealRuntime(runs)) return "INSUFFICIENT EVIDENCE";
  if (!isExpectedContaminationSequence(runs)) return "MIXED RESULT";
  if (
    !runs.every(
      (run) =>
        hasSchemaValidOutput(run) && !run.prohibitedClaimDetected && run.prohibitedLanguageSuccess,
    )
  ) {
    return "MIXED RESULT";
  }
  if (runs.some(hasLeakageSignals)) {
    return "CONTEXT CONTAMINATION DETECTED";
  }
  return runs.every(hasConfirmedCleanupAndExit) &&
    runs.every(hasConfirmedProcessTreeRelease) &&
    hasUniqueWorkspaceRefs(runs) &&
    hasUniqueProcessLifetimes(runs)
    ? "STATELESS OBSERVER BOUNDARY SUPPORTED"
    : "MIXED RESULT";
}

export function decideLocalVlmStress(runs: readonly LocalVlmRunReport[]): LocalVlmDecision {
  if (runs.length === 0) return "INSUFFICIENT EVIDENCE";
  if (!usesRealRuntime(runs)) return "INSUFFICIENT EVIDENCE";
  if (runs.length < MIN_REAL_RUNTIME_STRESS_SAMPLES) return "INSUFFICIENT EVIDENCE";

  const lifecycleFailure = runs.some(
    (run) =>
      !hasConfirmedCleanupAndExit(run) ||
      !hasConfirmedProcessTreeRelease(run) ||
      run.forcedTermination ||
      run.resources.sampleFailureCount > 0 ||
      run.process.stdoutTruncated ||
      run.process.stderrTruncated,
  );
  if (lifecycleFailure) return "RESOURCE LIFECYCLE NOT BOUNDED";

  const rssGrowth = showsMonotonicGrowth(
    numericSeries(
      runs.map((run) => run.resources.peakProcessTreeRssBytes ?? run.resources.peakProcessRssBytes),
    ),
  );
  const workspaceGrowth = showsMonotonicGrowth(
    numericSeries(runs.map((run) => run.resources.workspacePeakBytes)),
  );
  return rssGrowth || workspaceGrowth
    ? "RESOURCE LIFECYCLE NOT BOUNDED"
    : "RESOURCE LIFECYCLE BOUNDED";
}

async function writePngTextImage(args: {
  outputPath: string;
  label: string;
  width?: number;
  height?: number;
}): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const width = args.width ?? 1200;
  const height = args.height ?? 800;
  const svg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f4ead8" />
      <rect x="140" y="180" width="920" height="420" rx="32" fill="#fffdf7" stroke="#4b3621" stroke-width="8" />
      <text x="600" y="390" text-anchor="middle" font-size="88" font-family="Helvetica" fill="#2e2015">${args.label}</text>
      <text x="600" y="500" text-anchor="middle" font-size="34" font-family="Helvetica" fill="#5b4635">Synthetic contamination fixture</text>
    </svg>
  `);
  const bytes = new Uint8Array(await sharp(svg).png().toBuffer());
  await writeFile(args.outputPath, Buffer.from(bytes));
  return { bytes, width, height };
}

export async function buildSyntheticContaminationCases(
  outputDir: string,
): Promise<ObservationCaseInput[]> {
  await mkdir(outputDir, { recursive: true });
  const specs = [
    { scenarioId: "contamination-a", label: "ALPHA ORCHID" },
    { scenarioId: "contamination-b", label: "BETA COMET" },
    { scenarioId: "contamination-c", label: "GAMMA HARBOR" },
  ] as const;
  const out: ObservationCaseInput[] = [];
  for (const spec of specs) {
    const path = join(outputDir, `${spec.scenarioId}.png`);
    const image = await writePngTextImage({ outputPath: path, label: spec.label });
    out.push({
      scenarioId: spec.scenarioId,
      sourceArtifactRef: path,
      sourceBytes: image.bytes,
      sourceMediaType: "image/png",
      sourceWidth: image.width,
      sourceHeight: image.height,
      canaryTokens: [spec.label],
    });
  }
  return out;
}

async function runOneObservation(args: {
  config: LocalVlmResolvedConfig;
  input: ObservationCaseInput;
}): Promise<{
  report: LocalVlmRunReport;
  rawResponseText: string | null;
  runtimeVersion: string | null;
}> {
  const adapter = new LlamaServerVisionObserverAdapter(args.config);
  const result = await runVisionObserverLifecycle({
    scenarioId: args.input.scenarioId,
    sourceArtifactRef: args.input.sourceArtifactRef,
    sourceBytes: args.input.sourceBytes,
    sourceMediaType: args.input.sourceMediaType,
    sourceWidth: args.input.sourceWidth,
    sourceHeight: args.input.sourceHeight,
    adapter,
    timeoutMs:
      args.config.startupTimeoutMs +
      args.config.requestTimeoutMs +
      args.config.terminationTimeoutMs +
      1_000,
  });
  const snapshot = adapter.getLastRunSnapshot();
  if (!snapshot) throw new Error("local VLM adapter did not capture a run snapshot");
  const observationIds = (snapshot.observerResult?.proposals ?? []).flatMap((proposal) => {
    if (!proposal || typeof proposal !== "object" || !("observationId" in proposal)) return [];
    return typeof proposal.observationId === "string" ? [proposal.observationId] : [];
  });
  const proposalDescriptions = (snapshot.observerResult?.proposals ?? []).flatMap((proposal) => {
    if (!proposal || typeof proposal !== "object" || !("description" in proposal)) return [];
    return typeof proposal.description === "string" ? [proposal.description] : [];
  });
  const report: LocalVlmRunReport = {
    scenarioId: args.input.scenarioId,
    observationRunId: result.run.observationRunId,
    runtimeKind: args.config.runtimeKind,
    workspaceRef: result.workspaceDir,
    sourceArtifactRef: args.input.sourceArtifactRef,
    sourceImageSha256: snapshot.sourceImageSha256,
    overlaySha256: snapshot.overlaySha256,
    process: snapshot.process,
    resources: {
      ...snapshot.resources,
      workspaceBytesAfterCleanup: result.run.cleanupCompleted
        ? 0
        : snapshot.resources.workspaceBytesAfterCleanup,
    },
    timing: snapshot.timing,
    rawResponseDigest: snapshot.output.rawResponseDigest,
    structuredResponseDigest: snapshot.output.structuredResponseDigest,
    schemaValid: snapshot.output.schemaValid,
    prohibitedClaimDetected: snapshot.output.prohibitedClaimDetected,
    observationIds,
    proposalDescriptions,
    contaminationTokensDetected: [],
    priorRunIdsDetected: [],
    priorObservationIdsDetected: [],
    copiedDescriptionsDetected: [],
    comparisonLanguageDetected: [],
    cleanupCompleted: result.run.cleanupCompleted,
    forcedTermination: snapshot.process.forcedTermination,
    transportSuccess: snapshot.validation.transportSuccess,
    jsonExtractionSuccess: snapshot.validation.jsonExtractionSuccess,
    schemaSuccess: snapshot.validation.schemaSuccess,
    prohibitedLanguageSuccess: snapshot.validation.prohibitedLanguageSuccess,
    geometrySuccess: snapshot.validation.geometrySuccess,
    errorRecord: (snapshot.errorRecord ??
      result.errorRecord) as VisionObservationErrorRecord | null,
  };
  const validated = validateLocalVlmRunReport(report);
  if (!validated.ok) throw new Error(validated.error.issues.join("; "));
  return {
    report,
    rawResponseText: snapshot.rawResponseText,
    runtimeVersion: snapshot.llamaVersionOutput,
  };
}

function currentGitCommit(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

export async function runLocalVlmContaminationSequence(args: {
  config: LocalVlmResolvedConfig;
  outputDir: string;
}): Promise<LocalVlmExperimentReport> {
  const cases = await buildSyntheticContaminationCases(join(args.outputDir, "synthetic-images"));
  const byId = new Map(cases.map((entry) => [entry.scenarioId, entry]));
  const sequence = [
    byId.get("contamination-a")!,
    byId.get("contamination-b")!,
    byId.get("contamination-a")!,
    byId.get("contamination-c")!,
    byId.get("contamination-b")!,
  ];

  const runs: LocalVlmRunReport[] = [];
  const prior: ObservationTraceContext[] = [];
  let runtimeVersion: string | null = null;
  for (const input of sequence) {
    const one = await runOneObservation({ config: args.config, input });
    runtimeVersion ??= one.runtimeVersion;
    const analysis = analyzeContaminationSignals({
      rawText: one.rawResponseText,
      current: {
        observationRunId: one.report.observationRunId,
        observationIds: observationIdsOf(one.report),
        proposalDescriptions: descriptionsOf(one.report),
        canaryTokens: input.canaryTokens,
      },
      prior,
    });
    const report: LocalVlmRunReport = {
      ...one.report,
      contaminationTokensDetected: analysis.contaminationTokensDetected,
      priorRunIdsDetected: analysis.priorRunIdsDetected,
      priorObservationIdsDetected: analysis.priorObservationIdsDetected,
      copiedDescriptionsDetected: analysis.copiedDescriptionsDetected,
      comparisonLanguageDetected: analysis.comparisonLanguageDetected,
    };
    runs.push(report);
    prior.push({
      observationRunId: report.observationRunId,
      observationIds: report.observationIds,
      proposalDescriptions: report.proposalDescriptions,
      canaryTokens: input.canaryTokens,
    });
  }

  const report: LocalVlmExperimentReport = {
    schemaVersion: "strict-local-vlm-report.v1",
    generatedAt: new Date().toISOString(),
    gitCommit: currentGitCommit(),
    runtime: {
      runtimeKind: args.config.runtimeKind,
      executableDigest: args.config.llamaExecutableSha256,
      runtimeVersion,
    },
    model: {
      modelDigest: args.config.modelSha256,
      projectorDigest: args.config.mmprojSha256,
      quantization: args.config.modelQuantization,
    },
    prompt: {
      promptId: LOCAL_VLM_PROMPT_ID,
      promptVersion: LOCAL_VLM_PROMPT_VERSION,
      promptDigest: LOCAL_VLM_PROMPT_SHA256,
    },
    configuration: {
      sanitizedRuntimeArguments: buildLaunchArgsForReport(args.config),
      isolationMode: "one-process-per-observation",
    },
    runs,
    aggregate: buildLocalVlmAggregateReport(runs),
    decision: decideLocalVlmContamination(runs),
  };
  const validated = validateLocalVlmExperimentReport(report);
  if (!validated.ok) throw new Error(validated.error.issues.join("; "));
  return report;
}

function buildLaunchArgsForReport(config: LocalVlmResolvedConfig): string[] {
  return [
    "--host",
    config.host,
    "--model",
    config.modelPath,
    ...(config.mmprojPath === null ? [] : ["--mmproj", config.mmprojPath]),
    "--ctx-size",
    String(config.contextSize),
    "--temp",
    String(config.temperature),
    "--seed",
    String(config.seed),
    "--n-predict",
    String(config.maxOutputTokens),
    ...(config.gpuLayers === null ? [] : ["--n-gpu-layers", String(config.gpuLayers)]),
    ...(config.threadCount === null ? [] : ["--threads", String(config.threadCount)]),
  ];
}

export async function runLocalVlmSmoke(args: {
  config: LocalVlmResolvedConfig;
  outputDir: string;
}): Promise<LocalVlmExperimentReport> {
  const [synthetic] = await buildSyntheticContaminationCases(
    join(args.outputDir, "synthetic-images"),
  );
  const one = await runOneObservation({ config: args.config, input: synthetic });
  const runs = [one.report];
  return {
    schemaVersion: "strict-local-vlm-report.v1",
    generatedAt: new Date().toISOString(),
    gitCommit: currentGitCommit(),
    runtime: {
      runtimeKind: args.config.runtimeKind,
      executableDigest: args.config.llamaExecutableSha256,
      runtimeVersion: one.runtimeVersion,
    },
    model: {
      modelDigest: args.config.modelSha256,
      projectorDigest: args.config.mmprojSha256,
      quantization: args.config.modelQuantization,
    },
    prompt: {
      promptId: LOCAL_VLM_PROMPT_ID,
      promptVersion: LOCAL_VLM_PROMPT_VERSION,
      promptDigest: LOCAL_VLM_PROMPT_SHA256,
    },
    configuration: {
      sanitizedRuntimeArguments: buildLaunchArgsForReport(args.config),
      isolationMode: "one-process-per-observation",
    },
    runs,
    aggregate: buildLocalVlmAggregateReport(runs),
    decision: decideLocalVlmContamination(runs),
  };
}

export async function runLocalVlmStress(args: {
  config: LocalVlmResolvedConfig;
  outputDir: string;
  runCount: number;
}): Promise<LocalVlmExperimentReport> {
  const synthetic = await buildSyntheticContaminationCases(
    join(args.outputDir, "synthetic-images"),
  );
  const manifest = loadEvalManifest();
  const realCase = manifest.cases[0]!;
  const realImage = loadCaseImage(realCase);
  const realMetadata = await sharp(Buffer.from(realImage.bytes)).metadata();
  const realInput: ObservationCaseInput = {
    scenarioId: realCase.caseId,
    sourceArtifactRef: `eval-case:${realCase.caseId}`,
    sourceBytes: realImage.bytes,
    sourceMediaType: "image/jpeg",
    sourceWidth: realMetadata.width ?? 1,
    sourceHeight: realMetadata.height ?? 1,
    canaryTokens: [],
  };
  const pool = [...synthetic, realInput];

  const runs: LocalVlmRunReport[] = [];
  let runtimeVersion: string | null = null;
  for (let index = 0; index < args.runCount; index += 1) {
    const input = pool[index % pool.length]!;
    const one = await runOneObservation({ config: args.config, input });
    runtimeVersion ??= one.runtimeVersion;
    runs.push(one.report);
  }

  return {
    schemaVersion: "strict-local-vlm-report.v1",
    generatedAt: new Date().toISOString(),
    gitCommit: currentGitCommit(),
    runtime: {
      runtimeKind: args.config.runtimeKind,
      executableDigest: args.config.llamaExecutableSha256,
      runtimeVersion,
    },
    model: {
      modelDigest: args.config.modelSha256,
      projectorDigest: args.config.mmprojSha256,
      quantization: args.config.modelQuantization,
    },
    prompt: {
      promptId: LOCAL_VLM_PROMPT_ID,
      promptVersion: LOCAL_VLM_PROMPT_VERSION,
      promptDigest: LOCAL_VLM_PROMPT_SHA256,
    },
    configuration: {
      sanitizedRuntimeArguments: buildLaunchArgsForReport(args.config),
      isolationMode: "one-process-per-observation",
    },
    runs,
    aggregate: buildLocalVlmAggregateReport(runs),
    decision: decideLocalVlmStress(runs),
  };
}

export async function writeLocalVlmReportFiles(args: {
  report: LocalVlmExperimentReport;
  outputDir: string;
  stem: string;
}): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(args.outputDir, { recursive: true });
  const jsonPath = join(args.outputDir, `${args.stem}.json`);
  const markdownPath = join(args.outputDir, `${args.stem}.md`);
  const markdown = [
    `# ${args.stem}`,
    "",
    `- Schema version: \`${args.report.schemaVersion}\``,
    `- Git commit: \`${args.report.gitCommit}\``,
    `- Decision: ${args.report.decision}`,
    `- Runtime kind: \`${args.report.runtime.runtimeKind}\``,
    `- Runs: ${args.report.aggregate.runCount}`,
    `- Valid responses: ${args.report.aggregate.validResponseCount}`,
    `- Invalid responses: ${args.report.aggregate.invalidResponseCount}`,
    `- Contamination count: ${args.report.aggregate.contaminationCount}`,
    `- Cleanup failure count: ${args.report.aggregate.cleanupFailureCount}`,
    `- Forced termination count: ${args.report.aggregate.forcedTerminationCount}`,
    `- Schema failure count: ${args.report.aggregate.schemaFailureCount}`,
    `- Prohibited claim count: ${args.report.aggregate.prohibitedClaimCount}`,
  ].join("\n");
  await writeFile(jsonPath, `${JSON.stringify(args.report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${markdown}\n`, "utf8");
  return { jsonPath, markdownPath };
}
