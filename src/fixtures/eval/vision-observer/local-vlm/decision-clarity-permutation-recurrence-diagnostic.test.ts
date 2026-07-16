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
import { buildDecisionClarityReplicationCanonicalFingerprints } from "./decision-clarity-replication-diagnostic";
import {
  buildDecisionClarityPermutationRecurrenceCanonicalFingerprints,
  buildDecisionClarityPermutationRecurrenceSchedule,
  classifyDecisionClarityPermutationRecurrenceTrials,
  DECISION_CLARITY_PERMUTATION_RECURRENCE_TARGET_PERMUTATION,
  DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_BLOCKS,
  runLocalVlmDecisionClarityPermutationRecurrenceDiagnostic,
  validateDecisionClarityPermutationRecurrenceSchedule,
  type DecisionClarityPermutationRecurrenceScheduledTrial,
  type DecisionClarityPermutationRecurrenceTrialReport,
} from "./decision-clarity-permutation-recurrence-diagnostic";
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

function syntheticPermutationRecurrenceTrials(args: {
  fingerprints: Awaited<ReturnType<typeof buildDecisionClarityCanonicalFingerprints>>;
  completionStateForTrial: (
    trial: DecisionClarityPermutationRecurrenceScheduledTrial,
  ) => DecisionClarityCompletionState;
  completionLatencyForTrial: (
    trial: DecisionClarityPermutationRecurrenceScheduledTrial,
  ) => number | null;
  mismatchForTrial?: (trial: DecisionClarityPermutationRecurrenceScheduledTrial) => boolean;
}) {
  return buildDecisionClarityPermutationRecurrenceSchedule().map((trial) => {
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
    } satisfies DecisionClarityPermutationRecurrenceTrialReport;
  });
}

function stopAtSecondTrialMismatch(
  trial: DecisionClarityPermutationRecurrenceScheduledTrial,
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

function stopAtThirdTrialMismatch(
  trial: DecisionClarityPermutationRecurrenceScheduledTrial,
  prepared: DecisionClarityPreparedTrialRequest,
) {
  if (trial.sequenceNumber !== 3) return prepared;
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
  mutatePreparedTrialRequest?: (
    trial: DecisionClarityPermutationRecurrenceScheduledTrial,
    prepared: DecisionClarityPreparedTrialRequest,
  ) => DecisionClarityPreparedTrialRequest;
  mutateLaunchSpec?: (
    trial: DecisionClarityPermutationRecurrenceScheduledTrial,
    launchSpec: LlamaServerLaunchSpec,
  ) => LlamaServerLaunchSpec;
}) {
  const config = await diagnosticConfig({});
  const source = await sourceFixture();
  return await runLocalVlmDecisionClarityPermutationRecurrenceDiagnostic({
    config,
    scenarioId: args.scenarioId,
    ...source,
    serviceDeadlineMs: 30,
    hardCeilingMs: 90,
    mutatePreparedTrialRequest: args.mutatePreparedTrialRequest ?? stopAtSecondTrialMismatch,
    mutateLaunchSpec: args.mutateLaunchSpec,
  });
}

function completionStateSelector(
  rules: readonly {
    contract: "A" | "A_PRIME" | "B";
    permutationId: "P1" | "P2" | "P3" | "P4" | "P5" | "P6";
    cycles: readonly number[];
    state: DecisionClarityCompletionState;
  }[],
) {
  return (trial: DecisionClarityPermutationRecurrenceScheduledTrial) => {
    const rule = rules.find(
      (entry) =>
        entry.contract === trial.contract &&
        entry.permutationId === trial.permutationId &&
        entry.cycles.includes(trial.cycleNumber),
    );
    return rule?.state ?? "TIMELY_VALID_COMPLETION";
  };
}

describe("decision clarity permutation recurrence diagnostic", () => {
  it("builds the exact 108-trial, 36-block, six-cycle target-permutation schedule", () => {
    const schedule = buildDecisionClarityPermutationRecurrenceSchedule();
    const audit = validateDecisionClarityPermutationRecurrenceSchedule(schedule);

    expect(schedule).toHaveLength(108);
    expect(audit.totalTrials).toBe(108);
    expect(audit.totalBlocks).toBe(36);
    expect(audit.totalCycles).toBe(6);
    expect(audit.totalPermutations).toBe(6);
    expect(audit.targetPermutationId).toBe("P4");
    expect(schedule[0]).toMatchObject({
      sequenceNumber: 1,
      cycleNumber: 1,
      blockNumber: 1,
      permutationId: "P1",
      positionWithinBlock: 1,
      contract: "A",
    });
    expect(schedule[53]).toMatchObject({
      sequenceNumber: 54,
      cycleNumber: 3,
      blockNumber: 18,
      permutationId: "P6",
      positionWithinBlock: 3,
      contract: "A",
    });
    expect(schedule[107]).toMatchObject({
      sequenceNumber: 108,
      cycleNumber: 6,
      blockNumber: 36,
      permutationId: "P6",
      positionWithinBlock: 3,
      contract: "A",
    });
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
    const contractPositionCounts = new Map<string, number>();
    for (const trial of schedule) {
      const key = `${trial.contract}:${trial.positionWithinBlock}`;
      contractPositionCounts.set(key, (contractPositionCounts.get(key) ?? 0) + 1);
    }
    expect([...contractPositionCounts.values()].every((count) => count === 12)).toBe(true);
    expect(Object.values(audit.appearancesByPermutation)).toEqual([6, 6, 6, 6, 6, 6]);
  });

  it("rejects malformed recurrence schedules before execution", () => {
    const schedule = buildDecisionClarityPermutationRecurrenceSchedule();
    expect(() =>
      validateDecisionClarityPermutationRecurrenceSchedule(schedule.slice(0, -1)),
    ).toThrow(/expected exactly 108 trials/);

    const unknownPermutation = schedule.map((trial) => ({ ...trial }));
    unknownPermutation[0] = {
      ...unknownPermutation[0]!,
      permutationId: "P7",
    } as unknown as DecisionClarityPermutationRecurrenceScheduledTrial;
    expect(() => validateDecisionClarityPermutationRecurrenceSchedule(unknownPermutation)).toThrow(
      /unknown permutationId/,
    );
  });

  it("preserves the Phase 10 and Phase 12 canonical fingerprints for A, A_PRIME, and B", async () => {
    const config = await diagnosticConfig({});
    const overlayBytes = await pngBytes();

    const phase10 = buildDecisionClarityCanonicalFingerprints({
      config,
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: "image/png",
      observationRunId: "phase10-run-id",
    });
    const phase12 = buildDecisionClarityReplicationCanonicalFingerprints({
      config,
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: "image/png",
      observationRunId: "phase12-run-id",
    });
    const phase13 = buildDecisionClarityPermutationRecurrenceCanonicalFingerprints({
      config,
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: "image/png",
      observationRunId: "phase13-run-id",
    });

    expect(phase13.map((entry) => entry.contract)).toEqual(phase10.map((entry) => entry.contract));
    expect(phase13.map((entry) => entry.contract)).toEqual(phase12.map((entry) => entry.contract));
    for (const contract of ["A", "A_PRIME", "B"] as const) {
      expect(fingerprintSnapshotFor(phase13, contract)).toEqual(
        fingerprintSnapshotFor(phase10, contract),
      );
      expect(fingerprintSnapshotFor(phase13, contract)).toEqual(
        fingerprintSnapshotFor(phase12, contract),
      );
    }
  });

  it("classifies provenance failure before transmission and blocks all remaining trials", async () => {
    const config = await diagnosticConfig({});
    const source = await sourceFixture();
    let transmittedCount = 0;

    const report = await runLocalVlmDecisionClarityPermutationRecurrenceDiagnostic({
      config,
      scenarioId: "decision-clarity-permutation-recurrence-provenance-mismatch",
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

    const report = await runLocalVlmDecisionClarityPermutationRecurrenceDiagnostic({
      config,
      scenarioId: "decision-clarity-permutation-recurrence-request-not-sent",
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
      scenarioId: "decision-clarity-permutation-recurrence-timely-valid",
      expectedState: "TIMELY_VALID_COMPLETION" as const,
      mutateLaunchSpec: (
        trial: DecisionClarityPermutationRecurrenceScheduledTrial,
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
      scenarioId: "decision-clarity-permutation-recurrence-timely-invalid",
      expectedState: "TIMELY_INVALID_COMPLETION" as const,
      mutateLaunchSpec: (
        trial: DecisionClarityPermutationRecurrenceScheduledTrial,
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
      scenarioId: "decision-clarity-permutation-recurrence-late-valid",
      expectedState: "LATE_VALID_COMPLETION" as const,
      mutateLaunchSpec: (
        trial: DecisionClarityPermutationRecurrenceScheduledTrial,
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
      scenarioId: "decision-clarity-permutation-recurrence-late-invalid",
      expectedState: "LATE_INVALID_COMPLETION" as const,
      mutateLaunchSpec: (
        trial: DecisionClarityPermutationRecurrenceScheduledTrial,
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
      scenarioId: "decision-clarity-permutation-recurrence-hard-non-completion",
      expectedState: "HARD_NON_COMPLETION" as const,
      mutateLaunchSpec: (
        trial: DecisionClarityPermutationRecurrenceScheduledTrial,
        launchSpec: LlamaServerLaunchSpec,
      ) =>
        trial.sequenceNumber === 1
          ? withLaunchArgs(launchSpec, decisionClarityBehaviorArgs({ responseDelayMs: 120 }))
          : launchSpec,
    },
    {
      scenarioId: "decision-clarity-permutation-recurrence-socket-failure",
      expectedState: "TRANSPORT_FAILURE" as const,
      mutateLaunchSpec: (
        trial: DecisionClarityPermutationRecurrenceScheduledTrial,
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
      scenarioId: "decision-clarity-permutation-recurrence-server-crash",
      expectedState: "PROCESS_FAILURE" as const,
      mutateLaunchSpec: (
        trial: DecisionClarityPermutationRecurrenceScheduledTrial,
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
      scenarioId: "decision-clarity-permutation-recurrence-aborted-stream",
      expectedState: "TRANSPORT_FAILURE" as const,
      mutateLaunchSpec: (
        trial: DecisionClarityPermutationRecurrenceScheduledTrial,
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

  it("continues after an attributable Contract A failure until an independent stop condition occurs", async () => {
    const report = await runSingleExecutedTrialScenario({
      scenarioId: "decision-clarity-permutation-recurrence-downstream-blocked-accounting",
      mutatePreparedTrialRequest: stopAtThirdTrialMismatch,
      mutateLaunchSpec: (trial, launchSpec) =>
        trial.sequenceNumber === 1
          ? withLaunchArgs(
              launchSpec,
              decisionClarityBehaviorArgs({ responseVariant: "invalid-grid" }),
            )
          : launchSpec,
    });

    expect(report.trials[0]?.completionState).toBe("TIMELY_INVALID_COMPLETION");
    expect(report.trials[1]?.completionState).toBe("TIMELY_VALID_COMPLETION");
    expect(report.trials[2]?.completionState).toBe("PROVENANCE_FAILURE");
    expect(report.trials.slice(3).every((trial) => trial.status === "BLOCKED")).toBe(true);
    expect(report.trials.slice(3).every((trial) => trial.blockedBySequenceNumber === 3)).toBe(true);
  }, 30_000);

  it.each([
    {
      label: "supported",
      expected: "TARGET_PERMUTATION_RECURRENCE_SUPPORTED" as const,
      completionStateForTrial: completionStateSelector([
        {
          contract: "A",
          permutationId: "P4",
          cycles: [1, 3, 5],
          state: "TIMELY_INVALID_COMPLETION",
        },
      ]),
    },
    {
      label: "no recurrence observed",
      expected: "NO_TARGET_PERMUTATION_RECURRENCE_OBSERVED" as const,
      completionStateForTrial: completionStateSelector([
        {
          contract: "A",
          permutationId: "P4",
          cycles: [2],
          state: "TIMELY_INVALID_COMPLETION",
        },
      ]),
    },
    {
      label: "contradicted",
      expected: "TARGET_PERMUTATION_RECURRENCE_CONTRADICTED" as const,
      completionStateForTrial: completionStateSelector([
        {
          contract: "A",
          permutationId: "P1",
          cycles: [1, 3, 5],
          state: "TIMELY_INVALID_COMPLETION",
        },
      ]),
    },
    {
      label: "insufficient because target has only 2 failures",
      expected: "INSUFFICIENT_EVIDENCE" as const,
      completionStateForTrial: completionStateSelector([
        {
          contract: "A",
          permutationId: "P4",
          cycles: [1, 2],
          state: "TIMELY_INVALID_COMPLETION",
        },
      ]),
    },
    {
      label: "insufficient because failures span multiple permutations",
      expected: "INSUFFICIENT_EVIDENCE" as const,
      completionStateForTrial: completionStateSelector([
        {
          contract: "A",
          permutationId: "P4",
          cycles: [1, 2],
          state: "TIMELY_INVALID_COMPLETION",
        },
        {
          contract: "A",
          permutationId: "P1",
          cycles: [4],
          state: "TIMELY_INVALID_COMPLETION",
        },
      ]),
    },
    {
      label: "insufficient because target failures occur in only 2 cycles",
      expected: "INSUFFICIENT_EVIDENCE" as const,
      completionStateForTrial: completionStateSelector([
        {
          contract: "A",
          permutationId: "P4",
          cycles: [5, 6],
          state: "LATE_VALID_COMPLETION",
        },
      ]),
    },
    {
      label: "insufficient because target lead is only 1",
      expected: "INSUFFICIENT_EVIDENCE" as const,
      completionStateForTrial: completionStateSelector([
        {
          contract: "A",
          permutationId: "P4",
          cycles: [1, 3, 5],
          state: "TIMELY_INVALID_COMPLETION",
        },
        {
          contract: "A",
          permutationId: "P2",
          cycles: [2, 4],
          state: "TIMELY_INVALID_COMPLETION",
        },
      ]),
    },
    {
      label: "insufficient because A_PRIME is unstable",
      expected: "INSUFFICIENT_EVIDENCE" as const,
      completionStateForTrial: completionStateSelector([
        {
          contract: "A",
          permutationId: "P4",
          cycles: [1, 3, 5],
          state: "TIMELY_INVALID_COMPLETION",
        },
        {
          contract: "A_PRIME",
          permutationId: "P1",
          cycles: [1, 2, 3],
          state: "TIMELY_INVALID_COMPLETION",
        },
      ]),
    },
    {
      label: "insufficient because B is unstable",
      expected: "INSUFFICIENT_EVIDENCE" as const,
      completionStateForTrial: completionStateSelector([
        {
          contract: "A",
          permutationId: "P4",
          cycles: [1, 3, 5],
          state: "TIMELY_INVALID_COMPLETION",
        },
        {
          contract: "B",
          permutationId: "P5",
          cycles: [1, 2, 3],
          state: "TIMELY_INVALID_COMPLETION",
        },
      ]),
    },
    {
      label: "insufficient because one block is unusable",
      expected: "INSUFFICIENT_EVIDENCE" as const,
      completionStateForTrial: completionStateSelector([
        {
          contract: "A",
          permutationId: "P4",
          cycles: [1, 3, 5],
          state: "TIMELY_INVALID_COMPLETION",
        },
        {
          contract: "A",
          permutationId: "P1",
          cycles: [2],
          state: "TRANSPORT_FAILURE",
        },
      ]),
    },
    {
      label: "insufficient because of fingerprint mismatch",
      expected: "INSUFFICIENT_EVIDENCE" as const,
      completionStateForTrial: () => "TIMELY_VALID_COMPLETION" as const,
      mismatchForTrial: (trial: DecisionClarityPermutationRecurrenceScheduledTrial) =>
        trial.sequenceNumber === 1,
    },
    {
      label: "insufficient because of infrastructure failure",
      expected: "INSUFFICIENT_EVIDENCE" as const,
      completionStateForTrial: (trial: DecisionClarityPermutationRecurrenceScheduledTrial) =>
        trial.sequenceNumber === 1 ? "TRANSPORT_FAILURE" : "TIMELY_VALID_COMPLETION",
    },
  ])(
    "classifies $label",
    async ({ expected, completionStateForTrial, mismatchForTrial, label }) => {
      const config = await diagnosticConfig({});
      const overlayBytes = await pngBytes();
      const fingerprints = buildDecisionClarityCanonicalFingerprints({
        config,
        overlayBytes: new Uint8Array(overlayBytes),
        overlayMediaType: "image/png",
        observationRunId: "classification-run-id",
      });

      const trials = syntheticPermutationRecurrenceTrials({
        fingerprints,
        completionStateForTrial,
        completionLatencyForTrial: (trial) => {
          if (trial.contract === "A") return 100;
          if (trial.contract === "A_PRIME") return 80;
          return 90;
        },
        mismatchForTrial,
      });
      const result = classifyDecisionClarityPermutationRecurrenceTrials(trials);

      expect(result.classification.recurrenceStatus, label).toBe(expected);
      if (expected === "NO_TARGET_PERMUTATION_RECURRENCE_OBSERVED") {
        expect(result.classification.notes).toContain(
          "No target-permutation recurrence was observed under the preregistered bounded criteria.",
        );
      }
      if (expected === "TARGET_PERMUTATION_RECURRENCE_SUPPORTED") {
        expect(
          result.classification.attributableAFailureCountsByPermutation[
            DECISION_CLARITY_PERMUTATION_RECURRENCE_TARGET_PERMUTATION
          ],
        ).toBe(3);
      }
    },
  );

  it("reconciles trial, contract, position, block, and recurrence accounting exactly once", async () => {
    const config = await diagnosticConfig({});
    const overlayBytes = await pngBytes();
    const fingerprints = buildDecisionClarityCanonicalFingerprints({
      config,
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: "image/png",
      observationRunId: "reconciliation-run-id",
    });

    const trials = syntheticPermutationRecurrenceTrials({
      fingerprints,
      completionStateForTrial: completionStateSelector([
        {
          contract: "A",
          permutationId: "P4",
          cycles: [1, 3, 5],
          state: "TIMELY_INVALID_COMPLETION",
        },
        {
          contract: "A_PRIME",
          permutationId: "P1",
          cycles: [1, 2],
          state: "TIMELY_INVALID_COMPLETION",
        },
        {
          contract: "B",
          permutationId: "P2",
          cycles: [1, 2],
          state: "TIMELY_INVALID_COMPLETION",
        },
      ]),
      completionLatencyForTrial: () => 100,
    });

    const result = classifyDecisionClarityPermutationRecurrenceTrials(trials);
    const trialCountFromPermutationFindings = result.permutationFindings.reduce(
      (sum, finding) =>
        sum +
        finding.timelyValidCount +
        finding.timelyInvalidCount +
        finding.lateValidCount +
        finding.lateInvalidCount +
        finding.hardNonCompletionCount +
        finding.requestNotSentCount +
        finding.transportFailureCount +
        finding.processFailureCount +
        finding.provenanceFailureCount +
        finding.blockedCount,
      0,
    );
    const positionAppearanceCount = Object.values(
      result.scheduleAudit.appearancesByPosition,
    ).reduce(
      (sum, positionCounts) => sum + Object.values(positionCounts).reduce((a, b) => a + b, 0),
      0,
    );
    const aSequenceNumbers = result.blockRecords
      .map((record) => record.aSequenceNumber)
      .filter((value): value is number => value !== null);

    expect(trialCountFromPermutationFindings).toBe(108);
    expect(positionAppearanceCount).toBe(108);
    expect(result.blockRecords).toHaveLength(DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_BLOCKS);
    expect(
      result.permutationFindings.reduce((sum, finding) => sum + finding.expectedAppearances, 0),
    ).toBe(108);
    expect(new Set(aSequenceNumbers).size).toBe(36);
    expect(aSequenceNumbers).toHaveLength(36);
    expect(result.classification.totalAttributableAFailures).toBe(3);
    expect(
      Object.entries(result.classification.attributableAFailureCountsByPermutation).every(
        ([permutationId, count]) =>
          permutationId === DECISION_CLARITY_PERMUTATION_RECURRENCE_TARGET_PERMUTATION
            ? count === 3
            : count === 0,
      ),
    ).toBe(true);
  });
});
