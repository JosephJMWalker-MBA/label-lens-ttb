// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type {
  LocalVlmDecision,
  LocalVlmExperimentReport,
} from "./vision-observer/local-vlm/local-vlm.types";
import {
  buildSyntheticVisionRegionCaseRun,
  buildSyntheticVisionRegionCoarseProposal,
  buildSyntheticVisionRegionRefinementProposal,
  buildSyntheticVisionRegionStageRun,
  buildVisionRegionBenchmarkReport,
  loadVisionRegionBenchmarkCases,
  renderVisionRegionBenchmarkMarkdown,
  shouldWritePublicVisionRegionReport,
  validateVisionRegionBenchmarkReport,
  VISION_REGION_GATE_CONSTANTS,
  type VisionRegionBenchmarkRuntimeSummary,
} from "./vision-region-benchmark";

function runtimeSummary(
  overrides: Partial<VisionRegionBenchmarkRuntimeSummary> = {},
): VisionRegionBenchmarkRuntimeSummary {
  return {
    runtimeKind: "real-local-vlm",
    realRuntimeConfigured: true,
    configurationError: null,
    executableDigest: "a".repeat(64),
    modelDigest: "b".repeat(64),
    projectorDigest: null,
    modelDisplayId: "fake-model.gguf",
    quantization: "Q4_K_M",
    host: "127.0.0.1",
    contextSize: 4096,
    maxOutputTokens: 900,
    threadCount: 4,
    gpuLayers: null,
    seed: 17,
    temperature: 0,
    sanitizedRuntimeArguments: ["--host", "127.0.0.1", "--model", "fake-model.gguf"],
    adapter: {
      adapterId: "llama-server-strict-isolation-observer",
      adapterVersion: "1.0.0",
      adapterDigest: "c".repeat(64),
      adapterProvenance: "src/fixtures/eval/vision-observer/local-vlm/llama-server-adapter.ts",
    },
    prompts: {
      coarse: {
        promptId: "slice2-strict-local-vlm-observer",
        promptVersion: "1.2.0",
        promptDigest: "d".repeat(64),
      },
      refinement: {
        promptId: "slice3-vision-region-refinement",
        promptVersion: "1.0.0",
        promptDigest: "e".repeat(64),
      },
    },
    ...overrides,
  };
}

function experiment(
  decision: LocalVlmDecision,
  overrides: Partial<LocalVlmExperimentReport> = {},
): LocalVlmExperimentReport {
  return {
    schemaVersion: "strict-local-vlm-report.v1",
    generatedAt: new Date("2026-07-14T00:00:00Z").toISOString(),
    gitCommit: "test-head",
    runtime: {
      runtimeKind: "real-local-vlm",
      executableDigest: "a".repeat(64),
      runtimeVersion: "llama-server test",
    },
    model: {
      modelDigest: "b".repeat(64),
      projectorDigest: null,
      quantization: "Q4_K_M",
    },
    prompt: {
      promptId: "slice2-strict-local-vlm-observer",
      promptVersion: "1.2.0",
      promptDigest: "d".repeat(64),
    },
    configuration: {
      sanitizedRuntimeArguments: ["--host", "127.0.0.1", "--model", "fake-model.gguf"],
      isolationMode: "one-process-per-observation",
    },
    runs: [],
    aggregate: {
      runCount: 10,
      validResponseCount: 10,
      invalidResponseCount: 0,
      contaminationCount: 0,
      cleanupFailureCount: 0,
      forcedTerminationCount: 0,
      prohibitedClaimCount: 0,
      schemaFailureCount: 0,
      peakRssSummary: {
        peakProcessRssBytes: 100,
        peakProcessTreeRssBytes: 100,
      },
      workspaceSummary: {
        maxWorkspaceBytes: 10,
        maxWorkspaceFiles: 2,
      },
      latencySummary: {
        maxStartupMs: 100,
        maxRequestMs: 200,
        maxTerminationMs: 20,
      },
    },
    decision,
    ...overrides,
  };
}

function supportCaseRuns() {
  const cases = loadVisionRegionBenchmarkCases();
  const repetitions = 3;
  const caseRuns = cases.flatMap((benchmarkCase) =>
    Array.from({ length: repetitions }, (_, index) => {
      const coarseProposals = Object.entries(benchmarkCase.annotation.fields).flatMap(
        ([field, annotation]) =>
          annotation
            ? [
                buildSyntheticVisionRegionCoarseProposal({
                  proposalId: `${benchmarkCase.evalCase.caseId}-${field}-r${index + 1}`,
                  observationId: `obs-${benchmarkCase.evalCase.caseId}-${field}-r${index + 1}`,
                  geometry: annotation.geometry,
                  apparentOrientation:
                    benchmarkCase.record.annotation[field as "brand" | "alcohol"].orientation ===
                    "vertical-clockwise"
                      ? "vertical-clockwise"
                      : benchmarkCase.record.annotation[field as "brand" | "alcohol"]
                            .orientation === "vertical-counterclockwise"
                        ? "vertical-counterclockwise"
                        : "horizontal",
                  reasonCodes:
                    field === "alcohol" ? ["rotation", "edge_proximity"] : ["high_salience"],
                }),
              ]
            : [],
      );
      const refinementStages = coarseProposals.map((proposal) => ({
        coarseProposalId: proposal.proposalId,
        cropNormalizedBox: proposal.coarseGeometry,
        stageRun: buildSyntheticVisionRegionStageRun({
          stage: "refinement",
          promptId: "slice3-vision-region-refinement",
          promptVersion: "1.0.0",
          promptDigest: "e".repeat(64),
          workspaceRef: `/tmp/${benchmarkCase.evalCase.caseId}/r${index + 1}/refine-${proposal.proposalId}`,
          observationRunId: `00000000-0000-4000-8000-${String(index + 101).padStart(12, "0")}`,
        }),
        proposal: buildSyntheticVisionRegionRefinementProposal({
          proposalId: `${proposal.proposalId}-refined`,
          observationId: `${proposal.observationId}-refined`,
          geometry: proposal.coarseGeometry,
          apparentOrientation: proposal.apparentOrientation,
          reasonCodes: proposal.reasonCodes,
        }),
      }));
      return buildSyntheticVisionRegionCaseRun({
        caseId: benchmarkCase.evalCase.caseId,
        repetition: index + 1,
        coarseProposals,
        refinementStages,
      });
    }),
  );
  return { cases, repetitions, caseRuns };
}

describe("vision region benchmark governance", () => {
  it("loads the governed 13-case corpus with the expected denominators", () => {
    const cases = loadVisionRegionBenchmarkCases();
    expect(cases).toHaveLength(13);
    const report = buildVisionRegionBenchmarkReport({
      benchmarkCases: cases,
      caseRepetitions: 3,
      caseRuns: [],
      runtime: runtimeSummary({ realRuntimeConfigured: false, runtimeKind: null }),
      statelessObserverBoundary: null,
      resourceLifecycle: null,
      generatedAt: new Date("2026-07-14T00:00:00Z").toISOString(),
      gitCommit: "test-head",
    });
    expect(report.corpus.targetCount).toBe(23);
    expect(report.corpus.fieldDenominators).toEqual({ brand: 11, alcohol: 12 });
    expect(report.corpus.orientationDenominators).toEqual({
      horizontal: 20,
      verticalClockwise: 1,
      verticalCounterclockwise: 1,
      mixed: 1,
    });
  });

  it("rejects fake-server provenance as insufficient evidence", () => {
    const { cases, repetitions, caseRuns } = supportCaseRuns();
    const report = buildVisionRegionBenchmarkReport({
      benchmarkCases: cases,
      caseRepetitions: repetitions,
      caseRuns,
      runtime: runtimeSummary({ runtimeKind: "fake-server" }),
      statelessObserverBoundary: experiment("STATELESS OBSERVER BOUNDARY SUPPORTED", {
        runtime: {
          runtimeKind: "fake-server",
          executableDigest: "a".repeat(64),
          runtimeVersion: "fake server",
        },
      }),
      resourceLifecycle: experiment("RESOURCE LIFECYCLE BOUNDED", {
        runtime: {
          runtimeKind: "fake-server",
          executableDigest: "a".repeat(64),
          runtimeVersion: "fake server",
        },
      }),
      generatedAt: new Date("2026-07-14T00:00:00Z").toISOString(),
      gitCommit: "test-head",
    });

    expect(report.decision).toBe("INSUFFICIENT EVIDENCE");
    expect(shouldWritePublicVisionRegionReport(report)).toBe(false);
  });

  it("serializes unsupported region metrics as null with rationales", () => {
    const report = buildVisionRegionBenchmarkReport({
      benchmarkCases: loadVisionRegionBenchmarkCases(),
      caseRepetitions: 3,
      caseRuns: [],
      runtime: runtimeSummary({ realRuntimeConfigured: false, runtimeKind: null }),
      statelessObserverBoundary: null,
      resourceLifecycle: null,
    });
    expect(report.claimSemantics.textRegionPrecision.value).toBeNull();
    expect(report.claimSemantics.falseRegionRate.value).toBeNull();
    expect(report.claimSemantics.absentFieldObserverFalsePositiveRate.value).toBeNull();
    expect(report.claimSemantics.textRegionPrecision.rationale).toContain("unannotated text");
  });

  it("treats whole-image and near-whole-image proposals as non-localizing", () => {
    const { cases, repetitions } = supportCaseRuns();
    const caseRuns = cases.flatMap((benchmarkCase) =>
      Array.from({ length: repetitions }, (_, index) =>
        buildSyntheticVisionRegionCaseRun({
          caseId: benchmarkCase.evalCase.caseId,
          repetition: index + 1,
          coarseProposals: [
            buildSyntheticVisionRegionCoarseProposal({
              proposalId: `${benchmarkCase.evalCase.caseId}-whole-r${index + 1}`,
              observationId: `obs-${benchmarkCase.evalCase.caseId}-whole-r${index + 1}`,
              geometry: { x: 0, y: 0, width: 1, height: 1 },
            }),
            buildSyntheticVisionRegionCoarseProposal({
              proposalId: `${benchmarkCase.evalCase.caseId}-near-whole-r${index + 1}`,
              observationId: `obs-${benchmarkCase.evalCase.caseId}-near-whole-r${index + 1}`,
              geometry: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
            }),
          ],
        }),
      ),
    );
    const report = buildVisionRegionBenchmarkReport({
      benchmarkCases: cases,
      caseRepetitions: repetitions,
      caseRuns,
      runtime: runtimeSummary(),
      statelessObserverBoundary: experiment("STATELESS OBSERVER BOUNDARY SUPPORTED"),
      resourceLifecycle: experiment("RESOURCE LIFECYCLE BOUNDED"),
    });
    expect(report.arms.coarseOnly.consistentHitRecall).toBe(0);
    expect(report.decision).toBe("VISION REGION SIGNAL NOT SUPPORTED");
  });

  it("blocks tiled coverage above the pre-registered union cap and counts overlap geometrically", () => {
    const cases = loadVisionRegionBenchmarkCases().slice(0, 1);
    const tiled = [
      { x: 0, y: 0, width: 0.3, height: 0.3 },
      { x: 0.3, y: 0, width: 0.3, height: 0.3 },
      { x: 0.6, y: 0, width: 0.3, height: 0.3 },
      { x: 0, y: 0.3, width: 0.3, height: 0.3 },
      { x: 0.3, y: 0.3, width: 0.3, height: 0.3 },
      { x: 0.6, y: 0.3, width: 0.3, height: 0.3 },
      { x: 0, y: 0.6, width: 0.3, height: 0.3 },
      { x: 0.3, y: 0.6, width: 0.3, height: 0.3 },
      { x: 0.6, y: 0.6, width: 0.3, height: 0.3 },
    ];
    const duplicate = { x: 0.2, y: 0.2, width: 0.15, height: 0.1 };
    const report = buildVisionRegionBenchmarkReport({
      benchmarkCases: cases,
      caseRepetitions: 3,
      caseRuns: [1, 2, 3].map((repetition) =>
        buildSyntheticVisionRegionCaseRun({
          caseId: cases[0]!.evalCase.caseId,
          repetition,
          coarseProposals: [
            ...tiled.map((geometry, index) =>
              buildSyntheticVisionRegionCoarseProposal({
                proposalId: `tile-${repetition}-${index + 1}`,
                observationId: `obs-tile-${repetition}-${index + 1}`,
                geometry,
              }),
            ),
            buildSyntheticVisionRegionCoarseProposal({
              proposalId: `dup-a-${repetition}`,
              observationId: `obs-dup-a-${repetition}`,
              geometry: duplicate,
            }),
            buildSyntheticVisionRegionCoarseProposal({
              proposalId: `dup-b-${repetition}`,
              observationId: `obs-dup-b-${repetition}`,
              geometry: duplicate,
            }),
          ],
        }),
      ),
      runtime: runtimeSummary(),
      statelessObserverBoundary: experiment("STATELESS OBSERVER BOUNDARY SUPPORTED"),
      resourceLifecycle: experiment("RESOURCE LIFECYCLE BOUNDED"),
    });

    const runSummary = report.runs[0]!.armSummaries.coarseOnly;
    expect(runSummary.unionCoverage).toBeGreaterThan(VISION_REGION_GATE_CONSTANTS.UNION_CAP);
    expect(runSummary.countCapPassed).toBe(false);
    expect(report.targets[0]!.arms.coarseOnly.anyRunHit).toBe(false);
  });

  it("keeps duplicate overlaps from being double-counted when coverage stays below the cap", () => {
    const cases = loadVisionRegionBenchmarkCases().slice(0, 1);
    const duplicate = { x: 0.2, y: 0.2, width: 0.15, height: 0.1 };
    const report = buildVisionRegionBenchmarkReport({
      benchmarkCases: cases,
      caseRepetitions: 3,
      caseRuns: [1, 2, 3].map((repetition) =>
        buildSyntheticVisionRegionCaseRun({
          caseId: cases[0]!.evalCase.caseId,
          repetition,
          coarseProposals: [
            buildSyntheticVisionRegionCoarseProposal({
              proposalId: `dup-a-${repetition}`,
              observationId: `obs-dup-a-${repetition}`,
              geometry: duplicate,
            }),
            buildSyntheticVisionRegionCoarseProposal({
              proposalId: `dup-b-${repetition}`,
              observationId: `obs-dup-b-${repetition}`,
              geometry: duplicate,
            }),
          ],
        }),
      ),
      runtime: runtimeSummary(),
      statelessObserverBoundary: experiment("STATELESS OBSERVER BOUNDARY SUPPORTED"),
      resourceLifecycle: experiment("RESOURCE LIFECYCLE BOUNDED"),
    });
    expect(report.runs[0]!.armSummaries.coarseOnly.unionCoverage).toBeCloseTo(
      duplicate.width * duplicate.height,
      6,
    );
  });

  it("distinguishes any-run hits from consistent-hit recall", () => {
    const cases = loadVisionRegionBenchmarkCases().slice(0, 1);
    const annotation = cases[0]!.annotation.fields.brand ?? cases[0]!.annotation.fields.alcohol!;
    const hitGeometry = annotation.geometry;
    const missGeometry = { x: 0.8, y: 0.8, width: 0.05, height: 0.05 };
    const report = buildVisionRegionBenchmarkReport({
      benchmarkCases: cases,
      caseRepetitions: 3,
      caseRuns: [
        buildSyntheticVisionRegionCaseRun({
          caseId: cases[0]!.evalCase.caseId,
          repetition: 1,
          coarseProposals: [
            buildSyntheticVisionRegionCoarseProposal({
              proposalId: "hit-1",
              observationId: "obs-hit-1",
              geometry: hitGeometry,
            }),
          ],
        }),
        buildSyntheticVisionRegionCaseRun({
          caseId: cases[0]!.evalCase.caseId,
          repetition: 2,
          coarseProposals: [
            buildSyntheticVisionRegionCoarseProposal({
              proposalId: "miss-2",
              observationId: "obs-miss-2",
              geometry: missGeometry,
            }),
          ],
        }),
        buildSyntheticVisionRegionCaseRun({
          caseId: cases[0]!.evalCase.caseId,
          repetition: 3,
          coarseProposals: [
            buildSyntheticVisionRegionCoarseProposal({
              proposalId: "miss-3",
              observationId: "obs-miss-3",
              geometry: missGeometry,
            }),
          ],
        }),
      ],
      runtime: runtimeSummary(),
      statelessObserverBoundary: experiment("STATELESS OBSERVER BOUNDARY SUPPORTED"),
      resourceLifecycle: experiment("RESOURCE LIFECYCLE BOUNDED"),
    });
    const target = report.targets[0]!;
    expect(target.arms.coarseOnly.anyRunHit).toBe(true);
    expect(target.arms.coarseOnly.consistentHit).toBe(false);
  });

  it("reports horizontal and non-horizontal orientation separately and leaves mixed exact agreement unsupported", () => {
    const report = buildVisionRegionBenchmarkReport({
      benchmarkCases: supportCaseRuns().cases,
      caseRepetitions: 3,
      caseRuns: supportCaseRuns().caseRuns,
      runtime: runtimeSummary(),
      statelessObserverBoundary: experiment("STATELESS OBSERVER BOUNDARY SUPPORTED"),
      resourceLifecycle: experiment("RESOURCE LIFECYCLE BOUNDED"),
    });
    expect(report.orientation.coarseOnly.horizontal.denominator).toBe(20);
    expect(report.orientation.coarseOnly.nonHorizontal.denominator).toBe(2);
    expect(report.orientation.coarseOnly.mixed.denominator).toBe(1);
    expect(report.orientation.coarseOnly.mixed.exactAgreementRate).toBeNull();
  });

  it("reports reason-code correctness as unsupported while preserving counts and cross references", () => {
    const report = buildVisionRegionBenchmarkReport({
      benchmarkCases: supportCaseRuns().cases,
      caseRepetitions: 3,
      caseRuns: supportCaseRuns().caseRuns,
      runtime: runtimeSummary(),
      statelessObserverBoundary: experiment("STATELESS OBSERVER BOUNDARY SUPPORTED"),
      resourceLifecycle: experiment("RESOURCE LIFECYCLE BOUNDED"),
    });
    expect(report.reasonCodes.precision.value).toBeNull();
    expect(report.reasonCodes.recall.value).toBeNull();
    expect(report.reasonCodes.emittedCounts.high_salience).toBeGreaterThan(0);
    expect(report.reasonCodes.perTarget.length).toBeGreaterThan(0);
  });

  it("fails closed on unresolved process-tree release telemetry", () => {
    const { cases, repetitions, caseRuns } = supportCaseRuns();
    const report = buildVisionRegionBenchmarkReport({
      benchmarkCases: cases,
      caseRepetitions: repetitions,
      caseRuns: caseRuns.map((run, index) =>
        index === 0
          ? buildSyntheticVisionRegionCaseRun({
              caseId: run.caseId,
              repetition: run.repetition,
              coarseStage: {
                process: {
                  ...run.coarseStage.process,
                  processTreeReleasedAfterTermination: null,
                },
              },
              coarseProposals: [...run.coarseProposals],
              refinementStages: [],
            })
          : run,
      ),
      runtime: runtimeSummary(),
      statelessObserverBoundary: experiment("STATELESS OBSERVER BOUNDARY SUPPORTED"),
      resourceLifecycle: experiment("RESOURCE LIFECYCLE BOUNDED"),
    });
    expect(report.decision).toBe("RESOURCE LIFECYCLE NOT BOUNDED");
  });
});

describe("vision region benchmark reporting", () => {
  it("validates JSON and renders markdown from the validated report", () => {
    const { cases, repetitions, caseRuns } = supportCaseRuns();
    const report = buildVisionRegionBenchmarkReport({
      benchmarkCases: cases,
      caseRepetitions: repetitions,
      caseRuns,
      runtime: runtimeSummary(),
      statelessObserverBoundary: experiment("STATELESS OBSERVER BOUNDARY SUPPORTED"),
      resourceLifecycle: experiment("RESOURCE LIFECYCLE BOUNDED"),
      generatedAt: new Date("2026-07-14T00:00:00Z").toISOString(),
      gitCommit: "test-head",
    });
    const validated = validateVisionRegionBenchmarkReport(report);
    const markdown = renderVisionRegionBenchmarkMarkdown(report);

    expect(validated.ok).toBe(true);
    expect(report.decision).toBe("VISION REGION SIGNAL SUPPORTED");
    expect(markdown).toContain("VISION REGION SIGNAL SUPPORTED");
    expect(markdown).toContain("Coarse-only: VISION REGION SIGNAL SUPPORTED");
    expect(markdown).toContain("Refinement benefit:");
  });

  it("keeps Slice 3 benchmark code confined to evaluation-only surfaces", () => {
    const benchmarkSources = [
      join(process.cwd(), "src/fixtures/eval/vision-region-benchmark.ts"),
      join(process.cwd(), "src/fixtures/eval/vision-region-benchmark.generation.ts"),
      join(process.cwd(), "src/fixtures/eval/vision-region-refinement-derivative.ts"),
    ].map((file) => readFileSync(file, "utf8"));
    for (const source of benchmarkSources) {
      expect(source).not.toMatch(
        /extractLabelEvidenceDetailed|runOcrPass|selectBrandObservation|selectAlcoholObservation|pages\/api/i,
      );
      expect(source).not.toMatch(
        /docs\/ocr-region-isolation-benchmark\/report|OCR_REGION_BENCHMARK_REPORT_SCHEMA_VERSION/,
      );
    }
  });
});
