// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildLocalVlmAggregateReport,
  decideLocalVlmContamination,
  detectContaminationTokens,
} from "./contamination-harness";
import type { LocalVlmRunReport } from "./local-vlm.types";

function run(overrides: Partial<LocalVlmRunReport> = {}): LocalVlmRunReport {
  return {
    observationRunId: "00000000-0000-4000-8000-000000000001",
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
    contaminationTokensDetected: [],
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

  it("reports a clean A-B-A sequence as stateless-boundary supported", () => {
    const runs = [run(), run({ observationRunId: "00000000-0000-4000-8000-000000000002" })];
    const aggregate = buildLocalVlmAggregateReport(runs);
    expect(aggregate.contaminationCount).toBe(0);
    expect(decideLocalVlmContamination(runs)).toBe("STATELESS OBSERVER BOUNDARY SUPPORTED");
  });

  it("reports contamination as a blocking result", () => {
    const runs = [run({ contaminationTokensDetected: ["ALPHA ORCHID"] })];
    expect(decideLocalVlmContamination(runs)).toBe("CONTEXT CONTAMINATION DETECTED");
  });
});
