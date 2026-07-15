// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";

import sharp from "sharp";

import {
  buildDecisionClarityCanonicalFingerprints,
  type DecisionClarityCompletionState,
  type DecisionClarityPreparedTrialRequest,
  type DecisionClarityTrialEvidence,
} from "./decision-clarity-diagnostic";
import {
  buildDecisionClarityReplicationCanonicalFingerprints,
  buildDecisionClarityReplicationSchedule,
  classifyDecisionClarityReplicationTrials,
  DECISION_CLARITY_REPLICATION_TOTAL_TRIALS,
  runLocalVlmDecisionClarityReplicationDiagnostic,
  validateDecisionClarityReplicationSchedule,
  type DecisionClarityReplicationScheduledTrial,
  type DecisionClarityReplicationTrialReport,
} from "./decision-clarity-replication-diagnostic";
import { resolveLocalVlmConfig } from "./llama-server-config";
import type { LlamaServerLaunchSpec } from "./local-vlm.types";
import {
  cleanupDir,
  localVlmEnv,
  tempDir,
  writeFakeModel,
  writeFakeServerWrapper,
} from "./local-vlm-test-helpers";

const CLEANUP: string[] = [];

afterEach(() => {
  while (CLEANUP.length > 0) cleanupDir(CLEANUP.pop()!);
});

async function pngBytes() {
  return await sharp({
    create: {
      width: 100,
      height: 60,
      channels: 3,
      background: "#f4ead8",
    },
  })
    .png()
    .toBuffer();
}

async function diagnosticConfig(args: { requestTimeoutMs?: number }) {
  const dir = tempDir();
  CLEANUP.push(dir);
  const executable = writeFakeServerWrapper(dir, {
    mode: "decision-clarity-diagnostic",
  });
  const model = writeFakeModel(dir);
  const resolved = await resolveLocalVlmConfig(
    localVlmEnv({
      executablePath: executable.path,
      executableSha256: executable.sha256,
      modelPath: model.path,
      modelSha256: model.sha256,
      startupTimeoutMs: 1_200,
      requestTimeoutMs: args.requestTimeoutMs ?? 2_000,
      terminationTimeoutMs: 200,
      maxOutputTokens: 900,
      contextSize: 4_096,
    }),
  );
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) throw new Error("config failed");
  return resolved.value;
}

async function sourceFixture() {
  const dir = tempDir();
  CLEANUP.push(dir);
  const imagePath = `${dir}/source.png`;
  const bytes = await pngBytes();
  await writeFile(imagePath, bytes);
  return {
    sourceArtifactRef: imagePath,
    sourceBytes: new Uint8Array(bytes),
    sourceMediaType: "image/png",
    sourceWidth: 100,
    sourceHeight: 60,
  };
}

function withLaunchArgs(
  launchSpec: LlamaServerLaunchSpec,
  extraArgs: readonly string[],
): LlamaServerLaunchSpec {
  return {
    ...launchSpec,
    args: [...launchSpec.args, ...extraArgs],
    sanitizedRuntimeArguments: [...launchSpec.sanitizedRuntimeArguments, ...extraArgs],
  };
}

function decisionClarityBehaviorArgs(behavior: {
  responseVariant?: string;
  responseDelayMs?: number;
  reportedCompletionLatencyMs?: number;
}): readonly string[] {
  return ["--decision-clarity-behavior-json", JSON.stringify(behavior)];
}

function fingerprintSnapshotFor(
  fingerprints: Awaited<ReturnType<typeof buildDecisionClarityCanonicalFingerprints>>,
  contract: "A" | "A_PRIME" | "B",
) {
  const fingerprint = fingerprints.find((entry) => entry.contract === contract);
  if (!fingerprint) {
    throw new Error(`missing fingerprint for ${contract}`);
  }
  return {
    contract: fingerprint.contract,
    sourceBuilder: fingerprint.sourceBuilder,
    systemPromptDigest: fingerprint.systemPromptDigest,
    userInstructionDigest: fingerprint.userInstructionDigest,
    responseFormatDigest: fingerprint.responseFormatDigest,
    requestBodyDigest: fingerprint.requestBodyDigest,
    requestBodyShapeDigest: fingerprint.requestBodyShapeDigest,
    overlayImageDigest: fingerprint.overlayImageDigest,
    overlayImageMediaType: fingerprint.overlayImageMediaType,
    model: fingerprint.model,
    seed: fingerprint.seed,
    temperature: fingerprint.temperature,
    tokenLimit: fingerprint.tokenLimit,
  };
}

function verifiedFingerprint(
  fingerprints: Awaited<ReturnType<typeof buildDecisionClarityCanonicalFingerprints>>,
  contract: "A" | "A_PRIME" | "B",
) {
  const snapshot = fingerprintSnapshotFor(fingerprints, contract);
  return {
    expected: snapshot,
    measured: snapshot,
    matchedFields: [
      "systemPromptDigest",
      "userInstructionDigest",
      "responseFormatDigest",
      "requestBodyDigest",
      "requestBodyShapeDigest",
      "overlayImageDigest",
      "overlayImageMediaType",
      "model",
      "seed",
      "temperature",
      "tokenLimit",
    ] as const,
    mismatchedFields: [] as const,
    allFieldsMatched: true,
  };
}

function mismatchedFingerprint(
  fingerprints: Awaited<ReturnType<typeof buildDecisionClarityCanonicalFingerprints>>,
  contract: "A" | "A_PRIME" | "B",
) {
  const snapshot = fingerprintSnapshotFor(fingerprints, contract);
  return {
    expected: snapshot,
    measured: {
      ...snapshot,
      requestBodyDigest: `${snapshot.requestBodyDigest}-mismatch`,
    },
    matchedFields: [
      "systemPromptDigest",
      "userInstructionDigest",
      "responseFormatDigest",
      "requestBodyShapeDigest",
      "overlayImageDigest",
      "overlayImageMediaType",
      "model",
      "seed",
      "temperature",
      "tokenLimit",
    ] as const,
    mismatchedFields: ["requestBodyDigest"] as const,
    allFieldsMatched: false,
  };
}

function minimalEvidence(args: {
  completionState: DecisionClarityCompletionState;
  completionLatencyMs: number | null;
}): DecisionClarityTrialEvidence {
  const serviceDeadlineMet =
    args.completionState === "TIMELY_VALID_COMPLETION" ||
    args.completionState === "TIMELY_INVALID_COMPLETION"
      ? true
      : args.completionState === "LATE_VALID_COMPLETION" ||
          args.completionState === "LATE_INVALID_COMPLETION" ||
          args.completionState === "HARD_NON_COMPLETION"
        ? false
        : null;
  const timeoutStage: DecisionClarityTrialEvidence["timeoutStage"] =
    args.completionState === "HARD_NON_COMPLETION" ? "request" : null;

  return {
    requestStartedAt: null,
    serviceDeadlineAt: null,
    serviceDeadlineMet,
    firstResponseByteAt: null,
    firstResponseByteLatencyMs: null,
    transportCompletedAt: null,
    transportCompletionLatencyMs: null,
    completionAt:
      args.completionState === "HARD_NON_COMPLETION" || args.completionLatencyMs === null
        ? null
        : "2026-07-15T00:00:00.000Z",
    completionLatencyMs: args.completionLatencyMs,
    hardCeilingAt: null,
    responseBytes: 0,
    finishReason: null,
    timeoutStage,
    postDeadlineDurationMs:
      serviceDeadlineMet === false &&
      args.completionLatencyMs !== null &&
      args.completionState !== "HARD_NON_COMPLETION"
        ? Math.max(0, args.completionLatencyMs - 30)
        : null,
    boundedOutputPreview: null,
    cleanupCompleted: true,
    forcedTermination: false,
    portReleased: true,
    processTreeReleased: true,
    workspaceBytesAfterCleanup: 0,
    workspaceDir: "/tmp/test",
  };
}

function statusFromCompletionState(
  state: DecisionClarityCompletionState,
): "PASS" | "FAIL" | "BLOCKED" {
  return state === "TIMELY_VALID_COMPLETION" ? "PASS" : state === "BLOCKED" ? "BLOCKED" : "FAIL";
}

function syntheticReplicationTrials(args: {
  fingerprints: Awaited<ReturnType<typeof buildDecisionClarityCanonicalFingerprints>>;
  completionStateForTrial: (
    trial: DecisionClarityReplicationScheduledTrial,
  ) => DecisionClarityCompletionState;
  completionLatencyForTrial: (trial: DecisionClarityReplicationScheduledTrial) => number | null;
  mismatchForTrial?: (trial: DecisionClarityReplicationScheduledTrial) => boolean;
}) {
  return buildDecisionClarityReplicationSchedule().map((trial) => {
    const completionState = args.completionStateForTrial(trial);
    return {
      sequenceNumber: trial.sequenceNumber,
      cycleNumber: trial.cycleNumber,
      blockNumber: trial.blockNumber,
      permutationId: trial.permutationId,
      positionWithinBlock: trial.positionWithinBlock,
      contract: trial.contract,
      sourceBuilder: fingerprintSnapshotFor(args.fingerprints, trial.contract).sourceBuilder,
      requestFingerprint:
        args.mismatchForTrial?.(trial) === true
          ? mismatchedFingerprint(args.fingerprints, trial.contract)
          : verifiedFingerprint(args.fingerprints, trial.contract),
      status: statusFromCompletionState(completionState),
      completionState,
      summary: "synthetic",
      issues: [],
      blockedBySequenceNumber: completionState === "BLOCKED" ? 1 : null,
      evidence:
        completionState === "BLOCKED" ||
        completionState === "PROVENANCE_FAILURE" ||
        completionState === "REQUEST_NOT_SENT" ||
        completionState === "TRANSPORT_FAILURE" ||
        completionState === "PROCESS_FAILURE"
          ? null
          : minimalEvidence({
              completionState,
              completionLatencyMs: args.completionLatencyForTrial(trial),
            }),
    } satisfies DecisionClarityReplicationTrialReport;
  });
}

function stopAtSecondTrialMismatch(
  trial: DecisionClarityReplicationScheduledTrial,
  prepared: DecisionClarityPreparedTrialRequest,
) {
  if (trial.sequenceNumber !== 2) return prepared;
  return {
    ...prepared,
    requestBody: {
      ...prepared.requestBody,
      temperature: 1,
    },
  };
}

async function runSingleExecutedTrialScenario(args: {
  scenarioId: string;
  mutateLaunchSpec?: (
    trial: DecisionClarityReplicationScheduledTrial,
    launchSpec: LlamaServerLaunchSpec,
  ) => LlamaServerLaunchSpec;
}) {
  const config = await diagnosticConfig({});
  const source = await sourceFixture();
  return await runLocalVlmDecisionClarityReplicationDiagnostic({
    config,
    scenarioId: args.scenarioId,
    ...source,
    serviceDeadlineMs: 30,
    hardCeilingMs: 90,
    mutatePreparedTrialRequest: stopAtSecondTrialMismatch,
    mutateLaunchSpec: args.mutateLaunchSpec,
  });
}

describe("decision clarity replication diagnostic", () => {
  it("builds the exact 36-trial counterbalanced schedule with balanced positions", () => {
    const schedule = buildDecisionClarityReplicationSchedule();
    expect(schedule).toHaveLength(36);
    expect(schedule.slice(0, 18).map((trial) => trial.contract)).toEqual([
      "A",
      "A_PRIME",
      "B",
      "A",
      "B",
      "A_PRIME",
      "A_PRIME",
      "A",
      "B",
      "A_PRIME",
      "B",
      "A",
      "B",
      "A",
      "A_PRIME",
      "B",
      "A_PRIME",
      "A",
    ]);
    expect(schedule.slice(18).map((trial) => trial.contract)).toEqual(
      schedule.slice(0, 18).map((trial) => trial.contract),
    );
    expect(schedule[0]).toMatchObject({
      sequenceNumber: 1,
      cycleNumber: 1,
      blockNumber: 1,
      permutationId: "A_A_PRIME_B",
      positionWithinBlock: 1,
      contract: "A",
    });
    expect(schedule[35]).toMatchObject({
      sequenceNumber: 36,
      cycleNumber: 2,
      blockNumber: 12,
      permutationId: "B_A_PRIME_A",
      positionWithinBlock: 3,
      contract: "A",
    });
    const contractPositionCounts = new Map<string, number>();
    for (const trial of schedule) {
      const key = `${trial.contract}:${trial.positionWithinBlock}`;
      contractPositionCounts.set(key, (contractPositionCounts.get(key) ?? 0) + 1);
    }
    expect([...contractPositionCounts.values()].every((count) => count === 4)).toBe(true);
  });

  it("rejects invalid schedules before execution", () => {
    const schedule = buildDecisionClarityReplicationSchedule();
    const missingTrial = schedule.slice(0, -1);
    expect(() => validateDecisionClarityReplicationSchedule(missingTrial)).toThrow(
      /expected exactly 36 trials/,
    );

    const unknownContract = schedule.map((trial) => ({ ...trial }));
    unknownContract[0] = {
      ...unknownContract[0]!,
      contract: "UNKNOWN",
    } as unknown as DecisionClarityReplicationScheduledTrial;
    expect(() => validateDecisionClarityReplicationSchedule(unknownContract)).toThrow(
      /unknown contract/,
    );
  });

  it("preserves the Phase 10 canonical fingerprints for A, A_PRIME, and B", async () => {
    const config = await diagnosticConfig({});
    const overlayBytes = await pngBytes();

    const phase10 = buildDecisionClarityCanonicalFingerprints({
      config,
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: "image/png",
      observationRunId: "phase10-run-id",
    });
    const phase11 = buildDecisionClarityReplicationCanonicalFingerprints({
      config,
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: "image/png",
      observationRunId: "phase11-run-id",
    });

    expect(phase11.map((entry) => entry.contract)).toEqual(phase10.map((entry) => entry.contract));
    for (const contract of ["A", "A_PRIME", "B"] as const) {
      expect(fingerprintSnapshotFor(phase11, contract)).toEqual(
        fingerprintSnapshotFor(phase10, contract),
      );
    }
  });

  it("stops transmission on a Phase 11 fingerprint mismatch and blocks the remaining trials", async () => {
    const config = await diagnosticConfig({});
    const source = await sourceFixture();
    let transmittedCount = 0;

    const report = await runLocalVlmDecisionClarityReplicationDiagnostic({
      config,
      scenarioId: "decision-clarity-replication-provenance-mismatch",
      ...source,
      serviceDeadlineMs: 30,
      hardCeilingMs: 90,
      mutatePreparedTrialRequest: (trial, prepared) =>
        trial.sequenceNumber === 1
          ? {
              ...prepared,
              requestBody: {
                ...prepared.requestBody,
                temperature: 1,
              },
            }
          : prepared,
      inspectTransmittedRequestBody: () => {
        transmittedCount += 1;
      },
    });

    expect(report.fatalStopReason).toBe("request fingerprint mismatch at sequence 1");
    expect(report.trials[0]?.completionState).toBe("PROVENANCE_FAILURE");
    expect(report.trials[0]?.requestFingerprint.mismatchedFields).toContain("temperature");
    expect(transmittedCount).toBe(0);
    expect(report.trials.slice(1).every((trial) => trial.status === "BLOCKED")).toBe(true);
  }, 30_000);

  it("classifies request-not-sent before transmission and blocks downstream trials", async () => {
    const config = await diagnosticConfig({});
    const source = await sourceFixture();

    const report = await runLocalVlmDecisionClarityReplicationDiagnostic({
      config,
      scenarioId: "decision-clarity-replication-request-not-sent",
      ...source,
      serviceDeadlineMs: 30,
      hardCeilingMs: 90,
      mutateLaunchSpec: (trial, launchSpec) =>
        trial.sequenceNumber === 1
          ? withLaunchArgs(launchSpec, ["--mode", "exit-before-ready"])
          : launchSpec,
    });

    expect(report.trials[0]?.completionState).toBe("REQUEST_NOT_SENT");
    expect(report.trials[0]?.evidence?.requestStartedAt).toBeNull();
    expect(report.trials.slice(1).every((trial) => trial.status === "BLOCKED")).toBe(true);
  }, 30_000);

  it.each([
    {
      scenarioId: "decision-clarity-replication-timely-valid",
      expectedState: "TIMELY_VALID_COMPLETION" as const,
      mutateLaunchSpec: (
        trial: DecisionClarityReplicationScheduledTrial,
        launchSpec: LlamaServerLaunchSpec,
      ) =>
        trial.sequenceNumber === 1
          ? withLaunchArgs(
              launchSpec,
              decisionClarityBehaviorArgs({
                responseDelayMs: 0,
                reportedCompletionLatencyMs: 29,
              }),
            )
          : launchSpec,
    },
    {
      scenarioId: "decision-clarity-replication-timely-invalid",
      expectedState: "TIMELY_INVALID_COMPLETION" as const,
      mutateLaunchSpec: (
        trial: DecisionClarityReplicationScheduledTrial,
        launchSpec: LlamaServerLaunchSpec,
      ) =>
        trial.sequenceNumber === 1
          ? withLaunchArgs(
              launchSpec,
              decisionClarityBehaviorArgs({ responseVariant: "invalid-grid" }),
            )
          : launchSpec,
    },
    {
      scenarioId: "decision-clarity-replication-late-valid",
      expectedState: "LATE_VALID_COMPLETION" as const,
      mutateLaunchSpec: (
        trial: DecisionClarityReplicationScheduledTrial,
        launchSpec: LlamaServerLaunchSpec,
      ) =>
        trial.sequenceNumber === 1
          ? withLaunchArgs(
              launchSpec,
              decisionClarityBehaviorArgs({
                responseDelayMs: 31,
                reportedCompletionLatencyMs: 31,
              }),
            )
          : launchSpec,
    },
    {
      scenarioId: "decision-clarity-replication-late-invalid",
      expectedState: "LATE_INVALID_COMPLETION" as const,
      mutateLaunchSpec: (
        trial: DecisionClarityReplicationScheduledTrial,
        launchSpec: LlamaServerLaunchSpec,
      ) =>
        trial.sequenceNumber === 1
          ? withLaunchArgs(
              launchSpec,
              decisionClarityBehaviorArgs({
                responseDelayMs: 31,
                responseVariant: "invalid-grid",
              }),
            )
          : launchSpec,
    },
    {
      scenarioId: "decision-clarity-replication-hard-non-completion",
      expectedState: "HARD_NON_COMPLETION" as const,
      mutateLaunchSpec: (
        trial: DecisionClarityReplicationScheduledTrial,
        launchSpec: LlamaServerLaunchSpec,
      ) =>
        trial.sequenceNumber === 1
          ? withLaunchArgs(launchSpec, decisionClarityBehaviorArgs({ responseDelayMs: 120 }))
          : launchSpec,
    },
    {
      scenarioId: "decision-clarity-replication-socket-failure",
      expectedState: "TRANSPORT_FAILURE" as const,
      mutateLaunchSpec: (
        trial: DecisionClarityReplicationScheduledTrial,
        launchSpec: LlamaServerLaunchSpec,
      ) =>
        trial.sequenceNumber === 1
          ? withLaunchArgs(
              launchSpec,
              decisionClarityBehaviorArgs({ responseVariant: "socket-failure" }),
            )
          : launchSpec,
    },
    {
      scenarioId: "decision-clarity-replication-server-crash",
      expectedState: "PROCESS_FAILURE" as const,
      mutateLaunchSpec: (
        trial: DecisionClarityReplicationScheduledTrial,
        launchSpec: LlamaServerLaunchSpec,
      ) =>
        trial.sequenceNumber === 1
          ? withLaunchArgs(
              launchSpec,
              decisionClarityBehaviorArgs({ responseVariant: "server-crash" }),
            )
          : launchSpec,
    },
    {
      scenarioId: "decision-clarity-replication-aborted-stream",
      expectedState: "TRANSPORT_FAILURE" as const,
      mutateLaunchSpec: (
        trial: DecisionClarityReplicationScheduledTrial,
        launchSpec: LlamaServerLaunchSpec,
      ) =>
        trial.sequenceNumber === 1
          ? withLaunchArgs(
              launchSpec,
              decisionClarityBehaviorArgs({ responseVariant: "aborted-stream" }),
            )
          : launchSpec,
    },
  ])(
    "classifies $scenarioId independently",
    async ({ scenarioId, expectedState, mutateLaunchSpec }) => {
      const report = await runSingleExecutedTrialScenario({
        scenarioId,
        mutateLaunchSpec,
      });

      expect(report.trials[0]?.completionState).toBe(expectedState);
      expect(report.trials[1]?.completionState).toBe("PROVENANCE_FAILURE");
      expect(report.trials.slice(2).every((trial) => trial.status === "BLOCKED")).toBe(true);

      if (expectedState === "TIMELY_VALID_COMPLETION") {
        expect(report.trials[0]?.status).toBe("PASS");
      } else {
        expect(report.trials[0]?.status).toBe("FAIL");
      }
      if (expectedState === "LATE_VALID_COMPLETION") {
        expect(report.trials[0]?.evidence?.serviceDeadlineMet).toBe(false);
        expect(report.trials[0]?.evidence?.completionAt).not.toBeNull();
      }
      if (expectedState === "HARD_NON_COMPLETION") {
        expect(report.trials[0]?.evidence?.timeoutStage).toBe("request");
      }
      if (expectedState === "TRANSPORT_FAILURE" && scenarioId.endsWith("aborted-stream")) {
        expect(report.trials[0]?.evidence?.firstResponseByteAt).not.toBeNull();
      }
    },
    30_000,
  );

  it("classifies the preregistered replication outcomes and insufficiency boundaries", async () => {
    const config = await diagnosticConfig({});
    const overlayBytes = await pngBytes();
    const fingerprints = buildDecisionClarityCanonicalFingerprints({
      config,
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: "image/png",
      observationRunId: "classification-run-id",
    });

    const cases: Array<{
      label: string;
      expected:
        | "REPLICATION_SUPPORTED"
        | "NO_REPLICATION_EFFECT_OBSERVED"
        | "REPLICATION_CONTRADICTED"
        | "INSUFFICIENT_EVIDENCE";
      completionStateForTrial: (
        trial: DecisionClarityReplicationScheduledTrial,
      ) => DecisionClarityCompletionState;
      mismatchForTrial?: (trial: DecisionClarityReplicationScheduledTrial) => boolean;
    }> = [
      {
        label: "supported",
        expected: "REPLICATION_SUPPORTED",
        completionStateForTrial: (trial: DecisionClarityReplicationScheduledTrial) => {
          if (trial.contract === "B") return "TIMELY_VALID_COMPLETION";
          if (trial.contract === "A" && [1, 2, 3].includes(trial.blockNumber)) {
            return "TIMELY_INVALID_COMPLETION";
          }
          return "TIMELY_VALID_COMPLETION";
        },
      },
      {
        label: "contradicted",
        expected: "REPLICATION_CONTRADICTED",
        completionStateForTrial: (trial: DecisionClarityReplicationScheduledTrial) => {
          if (trial.contract === "B") return "TIMELY_VALID_COMPLETION";
          if (trial.contract === "A_PRIME" && [1, 2, 3].includes(trial.blockNumber)) {
            return "TIMELY_INVALID_COMPLETION";
          }
          return "TIMELY_VALID_COMPLETION";
        },
      },
      {
        label: "no-effect",
        expected: "NO_REPLICATION_EFFECT_OBSERVED",
        completionStateForTrial: () => "TIMELY_VALID_COMPLETION" as const,
      },
      {
        label: "difference-of-two",
        expected: "INSUFFICIENT_EVIDENCE",
        completionStateForTrial: (trial: DecisionClarityReplicationScheduledTrial) => {
          if (trial.contract === "B") return "TIMELY_VALID_COMPLETION";
          if (trial.contract === "A" && [1, 2].includes(trial.blockNumber)) {
            return "TIMELY_INVALID_COMPLETION";
          }
          return "TIMELY_VALID_COMPLETION";
        },
      },
      {
        label: "mixed-direction",
        expected: "INSUFFICIENT_EVIDENCE",
        completionStateForTrial: (trial: DecisionClarityReplicationScheduledTrial) => {
          if (trial.contract === "B") return "TIMELY_VALID_COMPLETION";
          if (trial.contract === "A" && [1, 2, 3].includes(trial.blockNumber)) {
            return "TIMELY_INVALID_COMPLETION";
          }
          if (trial.contract === "A_PRIME" && [4, 5].includes(trial.blockNumber)) {
            return "TIMELY_INVALID_COMPLETION";
          }
          return "TIMELY_VALID_COMPLETION";
        },
      },
      {
        label: "two-distinct-favorable-permutations",
        expected: "INSUFFICIENT_EVIDENCE",
        completionStateForTrial: (trial: DecisionClarityReplicationScheduledTrial) => {
          if (trial.contract === "B") return "TIMELY_VALID_COMPLETION";
          if (trial.contract === "A" && [1, 2, 7].includes(trial.blockNumber)) {
            return "TIMELY_INVALID_COMPLETION";
          }
          return "TIMELY_VALID_COMPLETION";
        },
      },
      {
        label: "b-instability",
        expected: "INSUFFICIENT_EVIDENCE",
        completionStateForTrial: (trial: DecisionClarityReplicationScheduledTrial) => {
          if (trial.contract === "A" && [1, 2, 3].includes(trial.blockNumber)) {
            return "TIMELY_INVALID_COMPLETION";
          }
          if (trial.contract === "B" && [4, 10].includes(trial.blockNumber)) {
            return "TIMELY_INVALID_COMPLETION";
          }
          return "TIMELY_VALID_COMPLETION";
        },
      },
      {
        label: "unusable-block",
        expected: "INSUFFICIENT_EVIDENCE",
        completionStateForTrial: (trial: DecisionClarityReplicationScheduledTrial) => {
          if (trial.contract === "A" && [1, 2, 3].includes(trial.blockNumber)) {
            return "TIMELY_INVALID_COMPLETION";
          }
          if (trial.contract === "A" && trial.blockNumber === 4) {
            return "TRANSPORT_FAILURE";
          }
          return "TIMELY_VALID_COMPLETION";
        },
      },
      {
        label: "fingerprint-mismatch",
        expected: "INSUFFICIENT_EVIDENCE",
        completionStateForTrial: () => "TIMELY_VALID_COMPLETION" as const,
        mismatchForTrial: (trial: DecisionClarityReplicationScheduledTrial) =>
          trial.sequenceNumber === 1,
      },
      {
        label: "infrastructure-failure",
        expected: "INSUFFICIENT_EVIDENCE",
        completionStateForTrial: (trial: DecisionClarityReplicationScheduledTrial) =>
          trial.sequenceNumber === 1 ? "TRANSPORT_FAILURE" : "TIMELY_VALID_COMPLETION",
      },
    ];

    for (const testCase of cases) {
      const trials = syntheticReplicationTrials({
        fingerprints,
        completionStateForTrial: testCase.completionStateForTrial,
        completionLatencyForTrial: (trial) => {
          if (trial.contract === "A") return 100;
          if (trial.contract === "A_PRIME") return 80;
          return 100;
        },
        mismatchForTrial: testCase.mismatchForTrial,
      });
      const result = classifyDecisionClarityReplicationTrials(trials);
      expect(result.classification.replicationEffect, testCase.label).toBe(testCase.expected);
      if (testCase.label === "no-effect") {
        expect(result.classification.notes).toContain(
          "No material replication effect was observed under the preregistered bounded criteria.",
        );
      }
    }
  });

  it("reconciles contract totals, position totals, and block comparisons exactly once", async () => {
    const config = await diagnosticConfig({});
    const overlayBytes = await pngBytes();
    const fingerprints = buildDecisionClarityCanonicalFingerprints({
      config,
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: "image/png",
      observationRunId: "reconciliation-run-id",
    });

    const trials = syntheticReplicationTrials({
      fingerprints,
      completionStateForTrial: (trial) => {
        if (trial.contract === "B") return "TIMELY_VALID_COMPLETION";
        if (trial.contract === "A" && [1, 2, 3].includes(trial.blockNumber)) {
          return "TIMELY_INVALID_COMPLETION";
        }
        return "TIMELY_VALID_COMPLETION";
      },
      completionLatencyForTrial: (trial) => {
        if (trial.contract === "A") return 100;
        if (trial.contract === "A_PRIME") return 80;
        return 100;
      },
    });

    const result = classifyDecisionClarityReplicationTrials(trials);
    expect(result.scheduleAudit.passed).toBe(true);
    expect(
      result.contractFindings.reduce((sum, finding) => sum + finding.expectedAppearances, 0),
    ).toBe(DECISION_CLARITY_REPLICATION_TOTAL_TRIALS);
    expect(result.positionFindings.reduce((sum, finding) => sum + finding.appearances, 0)).toBe(
      DECISION_CLARITY_REPLICATION_TOTAL_TRIALS,
    );
    expect(result.blockComparisons).toHaveLength(12);

    const aSequenceNumbers = result.blockComparisons
      .map((comparison) => comparison.aSequenceNumber)
      .filter((value): value is number => value !== null);
    const aPrimeSequenceNumbers = result.blockComparisons
      .map((comparison) => comparison.aPrimeSequenceNumber)
      .filter((value): value is number => value !== null);
    expect(new Set(aSequenceNumbers).size).toBe(12);
    expect(new Set(aPrimeSequenceNumbers).size).toBe(12);

    const bSequenceNumbers = new Set(
      trials.filter((trial) => trial.contract === "B").map((trial) => trial.sequenceNumber),
    );
    expect(aSequenceNumbers.every((sequenceNumber) => !bSequenceNumbers.has(sequenceNumber))).toBe(
      true,
    );
    expect(
      aPrimeSequenceNumbers.every((sequenceNumber) => !bSequenceNumbers.has(sequenceNumber)),
    ).toBe(true);
  });
});
