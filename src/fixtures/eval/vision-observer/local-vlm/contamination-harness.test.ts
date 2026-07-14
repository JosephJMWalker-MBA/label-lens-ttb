// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";

import { resolveLocalVlmConfig } from "./llama-server-config";
import {
  analyzeContaminationSignals,
  buildLocalVlmAggregateReport,
  decideLocalVlmContamination,
  decideLocalVlmStress,
  detectContaminationTokens,
} from "./contamination-harness";
import {
  cleanupDir,
  localVlmEnv,
  tempDir,
  writeFakeModel,
  writeFakeServerWrapper,
} from "./local-vlm-test-helpers";
import type { LocalVlmRunReport } from "./local-vlm.types";

const CLEANUP: string[] = [];

afterEach(() => {
  vi.resetModules();
  vi.unmock("./llama-server-adapter");
  while (CLEANUP.length > 0) cleanupDir(CLEANUP.pop()!);
});

function run(overrides: Partial<LocalVlmRunReport> = {}): LocalVlmRunReport {
  return {
    scenarioId: "contamination-a",
    observationRunId: "00000000-0000-4000-8000-000000000001",
    runtimeKind: "real-local-vlm",
    workspaceRef: "/tmp/vision-observer-a",
    sourceArtifactRef: "synthetic:a",
    sourceImageSha256: "1".repeat(64),
    overlaySha256: "2".repeat(64),
    process: {
      pid: 1,
      processGroupId: 1,
      port: 41000,
      spawnedAt: new Date().toISOString(),
      readyAt: new Date().toISOString(),
      requestStartedAt: new Date().toISOString(),
      requestCompletedAt: new Date().toISOString(),
      terminationRequestedAt: new Date().toISOString(),
      exitedAt: new Date().toISOString(),
      exitCode: 0,
      exitSignal: null,
      forcedTermination: false,
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutTruncated: false,
      stderrTruncated: false,
      readiness: {
        attempts: 1,
        firstSuccessfulReadyAt: new Date().toISOString(),
        totalStartupLatencyMs: 10,
        lastReadinessError: null,
        processExitedBeforeReady: false,
        startupTimedOut: false,
      },
      portReleased: true,
    },
    resources: {
      workspaceBytesBeforeStart: 10,
      workspacePeakBytes: 10,
      workspaceBytesBeforeCleanup: 10,
      workspaceBytesAfterCleanup: 0,
      fileCountPeak: 2,
      filesCreated: 2,
      quarantinedFiles: 0,
      processRssBytesBeforeTermination: 100,
      peakProcessRssBytes: 100,
      peakProcessTreeRssBytes: 100,
      processRssBytesAfterTermination: null,
      sampleCount: 1,
      sampleFailureCount: 0,
      gpu: {
        available: false,
        sampleCount: 0,
        peakBytes: null,
        lastBytes: null,
        failureCount: 0,
      },
    },
    timing: {
      startupMs: 10,
      readinessMs: 10,
      requestMs: 20,
      parseMs: 5,
      terminationMs: 5,
      totalWallMs: 40,
    },
    rawResponseDigest: "3".repeat(64),
    structuredResponseDigest: "4".repeat(64),
    schemaValid: true,
    prohibitedClaimDetected: false,
    observationIds: ["observation-a"],
    proposalDescriptions: ["generic center text band"],
    contaminationTokensDetected: [],
    priorRunIdsDetected: [],
    priorObservationIdsDetected: [],
    copiedDescriptionsDetected: [],
    comparisonLanguageDetected: [],
    cleanupCompleted: true,
    forcedTermination: false,
    transportSuccess: true,
    jsonExtractionSuccess: true,
    schemaSuccess: true,
    prohibitedLanguageSuccess: true,
    geometrySuccess: true,
    errorRecord: null,
    ...overrides,
  };
}

describe("contamination harness", () => {
  it("detects prior canary leakage in later raw output", () => {
    expect(
      detectContaminationTokens("generic response mentioning BETA COMET", [
        "ALPHA ORCHID",
        "BETA COMET",
      ]),
    ).toEqual(["BETA COMET"]);
  });

  it("ignores repeated A-B-A-C-B self-canaries while still detecting prior-case leakage", () => {
    const prior = [
      {
        observationRunId: "run-a-1",
        observationIds: ["obs-a-1"],
        proposalDescriptions: ["alpha region"],
        canaryTokens: ["ALPHA ORCHID"],
      },
      {
        observationRunId: "run-b-1",
        observationIds: ["obs-b-1"],
        proposalDescriptions: ["beta region"],
        canaryTokens: ["BETA COMET"],
      },
    ];

    const repeatedA = analyzeContaminationSignals({
      rawText: '{"description":"ALPHA ORCHID upper label"}',
      current: {
        observationRunId: "run-a-2",
        observationIds: ["obs-a-2"],
        proposalDescriptions: ["ALPHA ORCHID upper label"],
        canaryTokens: ["ALPHA ORCHID"],
      },
      prior,
    });
    expect(repeatedA.contaminationTokensDetected).toEqual([]);

    const repeatedB = analyzeContaminationSignals({
      rawText: '{"description":"BETA COMET lower banner"}',
      current: {
        observationRunId: "run-b-2",
        observationIds: ["obs-b-2"],
        proposalDescriptions: ["BETA COMET lower banner"],
        canaryTokens: ["BETA COMET"],
      },
      prior,
    });
    expect(repeatedB.contaminationTokensDetected).toEqual([]);

    const contaminated = analyzeContaminationSignals({
      rawText:
        '{"observationRunId":"run-c-1","description":"alpha region","note":"previous comparison against run-a-1 obs-b-1 BETA COMET"}',
      current: {
        observationRunId: "run-c-1",
        observationIds: ["obs-c-1"],
        proposalDescriptions: ["gamma region"],
        canaryTokens: ["GAMMA HARBOR"],
      },
      prior,
    });
    expect(contaminated.contaminationTokensDetected).toEqual(["BETA COMET"]);
    expect(contaminated.priorRunIdsDetected).toEqual(["run-a-1"]);
    expect(contaminated.priorObservationIdsDetected).toEqual(["obs-b-1"]);
    expect(contaminated.copiedDescriptionsDetected).toEqual(["alpha region"]);
    expect(contaminated.comparisonLanguageDetected).toEqual(["PREVIOUS", "COMPARISON"]);
  });

  it("requires real-runtime A-B-A-C-B evidence before supporting stateless isolation", () => {
    const runs = [
      run({
        scenarioId: "contamination-a",
        observationRunId: "00000000-0000-4000-8000-000000000001",
        workspaceRef: "/tmp/work-a1",
      }),
      run({
        scenarioId: "contamination-b",
        observationRunId: "00000000-0000-4000-8000-000000000002",
        workspaceRef: "/tmp/work-b1",
        process: {
          ...run().process,
          pid: 2,
          processGroupId: 2,
          port: 41001,
          spawnedAt: new Date(Date.now() + 1_000).toISOString(),
        },
        observationIds: ["observation-b"],
      }),
      run({
        scenarioId: "contamination-a",
        observationRunId: "00000000-0000-4000-8000-000000000003",
        workspaceRef: "/tmp/work-a2",
        process: {
          ...run().process,
          pid: 3,
          processGroupId: 3,
          port: 41002,
          spawnedAt: new Date(Date.now() + 2_000).toISOString(),
        },
        observationIds: ["observation-a-2"],
      }),
      run({
        scenarioId: "contamination-c",
        observationRunId: "00000000-0000-4000-8000-000000000004",
        workspaceRef: "/tmp/work-c1",
        process: {
          ...run().process,
          pid: 4,
          processGroupId: 4,
          port: 41003,
          spawnedAt: new Date(Date.now() + 3_000).toISOString(),
        },
        observationIds: ["observation-c"],
      }),
      run({
        scenarioId: "contamination-b",
        observationRunId: "00000000-0000-4000-8000-000000000005",
        workspaceRef: "/tmp/work-b2",
        process: {
          ...run().process,
          pid: 5,
          processGroupId: 5,
          port: 41004,
          spawnedAt: new Date(Date.now() + 4_000).toISOString(),
        },
        observationIds: ["observation-b-2"],
      }),
    ];
    const aggregate = buildLocalVlmAggregateReport(runs);
    expect(aggregate.contaminationCount).toBe(0);
    expect(decideLocalVlmContamination(runs)).toBe("STATELESS OBSERVER BOUNDARY SUPPORTED");
    expect(
      decideLocalVlmContamination(runs.map((entry) => ({ ...entry, runtimeKind: "fake-server" }))),
    ).toBe("INSUFFICIENT EVIDENCE");
    expect(
      decideLocalVlmContamination([
        ...runs.slice(0, 4),
        { ...runs[4]!, priorRunIdsDetected: ["00000000-0000-4000-8000-000000000001"] },
      ]),
    ).toBe("CONTEXT CONTAMINATION DETECTED");
  });

  it("requires a real-runtime stress sample set before declaring bounded lifecycle", () => {
    const realStressRuns = Array.from({ length: 10 }, (_, index) =>
      run({
        scenarioId: `stress-${index}`,
        observationRunId: `00000000-0000-4000-8000-00000000000${index}`,
        workspaceRef: `/tmp/stress-${index}`,
        process: {
          ...run().process,
          pid: 100 + index,
          processGroupId: 100 + index,
          port: 42000 + index,
          spawnedAt: new Date(Date.now() + index * 1_000).toISOString(),
        },
        resources: {
          ...run().resources,
          peakProcessRssBytes: 100 + (index % 2),
          peakProcessTreeRssBytes: 100 + (index % 2),
          workspacePeakBytes: 10 + (index % 2),
        },
      }),
    );
    expect(decideLocalVlmStress(realStressRuns)).toBe("RESOURCE LIFECYCLE BOUNDED");
    expect(
      decideLocalVlmStress(
        realStressRuns.map((entry) => ({ ...entry, runtimeKind: "fake-server" })),
      ),
    ).toBe("INSUFFICIENT EVIDENCE");
    expect(
      decideLocalVlmStress(
        realStressRuns.map((entry, index) => ({
          ...entry,
          resources: {
            ...entry.resources,
            peakProcessTreeRssBytes: 100 + index,
            workspacePeakBytes: 10 + index,
          },
        })),
      ),
    ).toBe("RESOURCE LIFECYCLE NOT BOUNDED");
  });

  it("evaluates a generated fake-server contamination report as insufficient evidence", async () => {
    const dir = tempDir();
    CLEANUP.push(dir);
    let nextPid = 5000;
    vi.doMock("./llama-server-adapter", () => ({
      LlamaServerVisionObserverAdapter: class {
        readonly adapterId = "llama-server-strict-isolation-observer";
        readonly adapterVersion = "1.0.0";
        readonly promptId = "slice2-strict-local-vlm-observer";
        readonly promptVersion = "1.0.0";
        #snapshot: {
          sourceArtifactRef: string;
          sourceImageSha256: string;
          overlaySha256: string;
          process: LocalVlmRunReport["process"];
          resources: LocalVlmRunReport["resources"];
          timing: LocalVlmRunReport["timing"];
          validation: {
            transportSuccess: boolean;
            jsonExtractionSuccess: boolean;
            schemaSuccess: boolean;
            prohibitedLanguageSuccess: boolean;
            geometrySuccess: boolean;
          };
          output: {
            rawResponseDigest: string | null;
            structuredResponseDigest: string | null;
            responseBytes: number;
            schemaValid: boolean;
            prohibitedClaimDetected: boolean;
            proposalCount: number;
            duplicateProposalIdsDetected: boolean;
          };
          llamaVersionOutput: string | null;
          observerResult: { observationRunId: string; proposals: Array<Record<string, unknown>> };
          rawResponseText: string | null;
          errorRecord: null;
        } | null = null;

        async observe(input: {
          observationRunId: string;
          sourceArtifactRef: string;
          sourceImageSha256: string;
          overlaySha256: string;
        }) {
          const observerResult = {
            observationRunId: input.observationRunId,
            proposals: [
              {
                observationId: "observation-1",
                proposalId: "proposal-1",
                observationType: "text-like-region",
                source: "machine-observer",
                authority: "non-authoritative",
                purpose: "ocr-region-proposal",
                gridRange: {
                  start: { column: "B", row: 2, columnIndex: 1, rowIndex: 1, id: "B2" },
                  end: { column: "D", row: 4, columnIndex: 3, rowIndex: 3, id: "D4" },
                  notation: "B2:D4",
                },
                localRefinement: null,
                observationRotation: 0,
                apparentOrientation: "horizontal",
                visibility: "full",
                reasonCodes: ["high_salience", "multi_line"],
                description: "generic text-like region near the center",
              },
            ],
          };
          const rawResponseText = JSON.stringify(observerResult);
          const pid = nextPid;
          nextPid += 1;
          this.#snapshot = {
            sourceArtifactRef: input.sourceArtifactRef,
            sourceImageSha256: input.sourceImageSha256,
            overlaySha256: input.overlaySha256,
            process: {
              pid,
              processGroupId: pid,
              port: 43000 + pid,
              spawnedAt: new Date().toISOString(),
              readyAt: new Date().toISOString(),
              requestStartedAt: new Date().toISOString(),
              requestCompletedAt: new Date().toISOString(),
              terminationRequestedAt: new Date().toISOString(),
              exitedAt: new Date().toISOString(),
              exitCode: 0,
              exitSignal: null,
              forcedTermination: false,
              stdoutBytes: 0,
              stderrBytes: 0,
              stdoutTruncated: false,
              stderrTruncated: false,
              readiness: {
                attempts: 1,
                firstSuccessfulReadyAt: new Date().toISOString(),
                totalStartupLatencyMs: 10,
                lastReadinessError: null,
                processExitedBeforeReady: false,
                startupTimedOut: false,
              },
              portReleased: true,
            },
            resources: {
              workspaceBytesBeforeStart: 1,
              workspacePeakBytes: 1,
              workspaceBytesBeforeCleanup: 1,
              workspaceBytesAfterCleanup: 0,
              fileCountPeak: 2,
              filesCreated: 2,
              quarantinedFiles: 0,
              processRssBytesBeforeTermination: 100,
              peakProcessRssBytes: 100,
              peakProcessTreeRssBytes: 100,
              processRssBytesAfterTermination: null,
              sampleCount: 1,
              sampleFailureCount: 0,
              gpu: {
                available: false,
                sampleCount: 0,
                peakBytes: null,
                lastBytes: null,
                failureCount: 0,
              },
            },
            timing: {
              startupMs: 10,
              readinessMs: 10,
              requestMs: 20,
              parseMs: 5,
              terminationMs: 5,
              totalWallMs: 40,
            },
            validation: {
              transportSuccess: true,
              jsonExtractionSuccess: true,
              schemaSuccess: true,
              prohibitedLanguageSuccess: true,
              geometrySuccess: true,
            },
            output: {
              rawResponseDigest: "3".repeat(64),
              structuredResponseDigest: "4".repeat(64),
              responseBytes: Buffer.byteLength(rawResponseText),
              schemaValid: true,
              prohibitedClaimDetected: false,
              proposalCount: 1,
              duplicateProposalIdsDetected: false,
            },
            llamaVersionOutput: "llama-server fake 0.0.0",
            observerResult,
            rawResponseText,
            errorRecord: null,
          };
          return observerResult;
        }

        getLastRunSnapshot() {
          return this.#snapshot;
        }

        async dispose() {}
      },
    }));

    const executable = writeFakeServerWrapper(dir, { mode: "ok" });
    const model = writeFakeModel(dir);
    const resolved = await resolveLocalVlmConfig(
      localVlmEnv({
        executablePath: executable.path,
        executableSha256: executable.sha256,
        modelPath: model.path,
        modelSha256: model.sha256,
        requestTimeoutMs: 1_000,
        startupTimeoutMs: 1_200,
        terminationTimeoutMs: 150,
      }),
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error("config failed");

    const { runLocalVlmContaminationSequence } = await import("./contamination-harness");
    const report = await runLocalVlmContaminationSequence({
      config: resolved.value,
      outputDir: join(dir, "report"),
    });

    expect(report.runs.map((entry) => entry.scenarioId)).toEqual([
      "contamination-a",
      "contamination-b",
      "contamination-a",
      "contamination-c",
      "contamination-b",
    ]);
    expect(report.runs.every((entry) => entry.runtimeKind === "fake-server")).toBe(true);
    expect(report.aggregate.contaminationCount).toBe(0);
    expect(report.decision).toBe("INSUFFICIENT EVIDENCE");
  });
});
