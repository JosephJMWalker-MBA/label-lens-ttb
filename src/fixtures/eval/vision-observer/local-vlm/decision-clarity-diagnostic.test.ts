// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";

import sharp from "sharp";

import { buildDecisionClarityInstructionAuditRequest } from "./decision-clarity-instruction-audit";
import {
  buildDecisionClarityCanonicalFingerprints,
  buildDecisionClaritySchedule,
  buildDecisionClaritySpec,
  classifyDecisionClarityTrials,
  DECISION_CLARITY_SEQUENCE,
  runLocalVlmDecisionClarityDiagnostic,
} from "./decision-clarity-diagnostic";
import { resolveLocalVlmConfig } from "./llama-server-config";
import type { LlamaServerLaunchSpec } from "./local-vlm.types";
import {
  cleanupDir,
  localVlmEnv,
  tempDir,
  writeFakeModel,
  writeFakeServerWrapper,
} from "./local-vlm-test-helpers";
import { buildResponseCompletionRequestSpec } from "./response-completion-diagnostic";
import { buildSingleProposalDecompositionRequestSpec } from "./single-proposal-decomposition-diagnostic";

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
  completionLatencyMs: number | null;
  serviceDeadlineMet: boolean | null;
}) {
  return {
    requestStartedAt: null,
    serviceDeadlineAt: null,
    serviceDeadlineMet: args.serviceDeadlineMet,
    firstResponseByteAt: null,
    firstResponseByteLatencyMs: null,
    transportCompletedAt: null,
    transportCompletionLatencyMs: null,
    completionAt: args.completionLatencyMs === null ? null : "2026-07-15T00:00:00.000Z",
    completionLatencyMs: args.completionLatencyMs,
    hardCeilingAt: null,
    responseBytes: 0,
    finishReason: null,
    timeoutStage: null,
    postDeadlineDurationMs:
      args.serviceDeadlineMet === false && args.completionLatencyMs !== null
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
  state:
    | "TIMELY_VALID_COMPLETION"
    | "TIMELY_INVALID_COMPLETION"
    | "LATE_VALID_COMPLETION"
    | "LATE_INVALID_COMPLETION"
    | "HARD_NON_COMPLETION"
    | "PROVENANCE_FAILURE"
    | "BLOCKED",
): "PASS" | "FAIL" | "BLOCKED" {
  return state === "TIMELY_VALID_COMPLETION" ? "PASS" : state === "BLOCKED" ? "BLOCKED" : "FAIL";
}

function classificationTrials(args: {
  fingerprints: Awaited<ReturnType<typeof buildDecisionClarityCanonicalFingerprints>>;
  completionStateForTrial: (
    trial: ReturnType<typeof buildDecisionClaritySchedule>[number],
  ) =>
    | "TIMELY_VALID_COMPLETION"
    | "TIMELY_INVALID_COMPLETION"
    | "LATE_VALID_COMPLETION"
    | "LATE_INVALID_COMPLETION"
    | "HARD_NON_COMPLETION"
    | "PROVENANCE_FAILURE"
    | "BLOCKED";
  completionLatencyForTrial: (
    trial: ReturnType<typeof buildDecisionClaritySchedule>[number],
  ) => number | null;
  mismatchForTrial?: (trial: ReturnType<typeof buildDecisionClaritySchedule>[number]) => boolean;
}) {
  return buildDecisionClaritySchedule().map((trial) => {
    const completionState = args.completionStateForTrial(trial);
    const latency = args.completionLatencyForTrial(trial);
    const serviceDeadlineMet =
      completionState === "TIMELY_VALID_COMPLETION" ||
      completionState === "TIMELY_INVALID_COMPLETION"
        ? true
        : completionState === "LATE_VALID_COMPLETION" ||
            completionState === "LATE_INVALID_COMPLETION" ||
            completionState === "HARD_NON_COMPLETION"
          ? false
          : null;
    return {
      sequenceNumber: trial.sequenceNumber,
      repetitionNumber: trial.repetitionNumber,
      sequencePosition: trial.sequencePosition,
      contract: trial.contract,
      status: statusFromCompletionState(completionState),
      completionState,
      requestFingerprint:
        args.mismatchForTrial?.(trial) === true
          ? mismatchedFingerprint(args.fingerprints, trial.contract)
          : verifiedFingerprint(args.fingerprints, trial.contract),
      evidence:
        completionState === "BLOCKED" || completionState === "PROVENANCE_FAILURE"
          ? null
          : minimalEvidence({
              completionLatencyMs: latency,
              serviceDeadlineMet,
            }),
    };
  });
}

describe("decision clarity diagnostic", () => {
  it("builds the exact A-A_PRIME-B-A-A_PRIME-B schedule across three repetitions", () => {
    const schedule = buildDecisionClaritySchedule();
    expect(schedule).toHaveLength(18);
    expect(schedule.map((trial) => trial.contract)).toEqual([
      ...DECISION_CLARITY_SEQUENCE,
      ...DECISION_CLARITY_SEQUENCE,
      ...DECISION_CLARITY_SEQUENCE,
    ]);
    expect(schedule[0]).toMatchObject({
      sequenceNumber: 1,
      repetitionNumber: 1,
      sequencePosition: 1,
      contract: "A",
    });
    expect(schedule[17]).toMatchObject({
      sequenceNumber: 18,
      repetitionNumber: 3,
      sequencePosition: 6,
      contract: "B",
    });
  });

  it("reuses the exact existing builders for A and B, and limits A_PRIME to added semantic-policy lines", () => {
    const observationRunId = "00000000-0000-4000-8000-000000000001";
    const aBase = buildResponseCompletionRequestSpec(
      "one-observation-without-coordinates",
      observationRunId,
    );
    const aSpec = buildDecisionClaritySpec("A", observationRunId);
    expect(aSpec.promptText).toBe(aBase.promptText);
    expect(aSpec.instructionText).toBe(aBase.instructionText);
    expect(aSpec.responseFormat).toEqual(aBase.responseFormat);

    const aPrimeSpec = buildDecisionClaritySpec("A_PRIME", observationRunId);
    expect(aPrimeSpec.instructionText).toBe(aBase.instructionText);
    expect(aPrimeSpec.responseFormat).toEqual(aBase.responseFormat);
    expect(aPrimeSpec.promptText).not.toBe(aBase.promptText);
    const strippedAPrimePrompt = aPrimeSpec.promptText
      .split("\n")
      .filter(
        (line) =>
          ![
            "Inspect the image and return exactly one proposal for the single most visually prominent text-like region.",
            "Choose the region using this priority order:",
            "1. Largest apparent text area.",
            "2. If tied, highest visual contrast against its immediate background.",
            "3. If still tied, closest to the center of the image.",
            "A text-like region qualifies only when visible marks form an apparent line or cluster of characters.",
            "Do not transcribe any text.",
            "Do not identify a regulatory field.",
            "Do not infer what the text means.",
            "Do not infer expected values.",
            "Do not include coordinates.",
            "If no text-like region is visibly distinguishable, return an empty proposals array.",
          ].includes(line),
      )
      .join("\n");
    expect(strippedAPrimePrompt).toBe(aBase.promptText);

    const bBase = buildSingleProposalDecompositionRequestSpec("description", observationRunId);
    const bSpec = buildDecisionClaritySpec("B", observationRunId);
    expect(bSpec.promptText).toBe(bBase.promptText);
    expect(bSpec.instructionText).toBe(bBase.instructionText);
    expect(bSpec.responseFormat).toEqual(bBase.responseFormat);
  });

  it("normalizes observationRunId before hashing request fingerprints", async () => {
    const config = await diagnosticConfig({});
    const overlayBytes = await pngBytes();

    const first = buildDecisionClarityCanonicalFingerprints({
      config,
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: "image/png",
      observationRunId: "run-id-one",
    });
    const second = buildDecisionClarityCanonicalFingerprints({
      config,
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: "image/png",
      observationRunId: "run-id-two",
    });

    expect(first).toHaveLength(3);
    expect(second).toHaveLength(3);
    expect(first.map((entry) => entry.systemPromptDigest)).toEqual(
      second.map((entry) => entry.systemPromptDigest),
    );
    expect(first.map((entry) => entry.userInstructionDigest)).toEqual(
      second.map((entry) => entry.userInstructionDigest),
    );
    expect(first.map((entry) => entry.requestBodyDigest)).toEqual(
      second.map((entry) => entry.requestBodyDigest),
    );
  });

  it("builds each actual request body once, measures it, reuses it for transmission, and does not run the audit lane", async () => {
    const config = await diagnosticConfig({});
    const source = await sourceFixture();
    const prepared = new Map<number, object>();
    const transmitted = new Map<number, object>();

    const report = await runLocalVlmDecisionClarityDiagnostic({
      config,
      scenarioId: "decision-clarity-reuse",
      ...source,
      serviceDeadlineMs: 30,
      hardCeilingMs: 90,
      inspectPreparedTrialRequest: (trial, request) => {
        prepared.set(trial.sequenceNumber, request.requestBody);
      },
      inspectTransmittedRequestBody: (trial, requestBody) => {
        transmitted.set(trial.sequenceNumber, requestBody);
      },
    });

    expect(report.trials).toHaveLength(18);
    expect(prepared.size).toBe(18);
    expect(transmitted.size).toBe(18);
    for (const [sequenceNumber, requestBody] of prepared.entries()) {
      expect(transmitted.get(sequenceNumber)).toBe(requestBody);
    }
  }, 30_000);

  it("stops the schedule when a measured trial request diverges from preregistration and prevents transmission", async () => {
    const config = await diagnosticConfig({});
    const source = await sourceFixture();
    let transmittedCount = 0;

    const report = await runLocalVlmDecisionClarityDiagnostic({
      config,
      scenarioId: "decision-clarity-provenance-mismatch",
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
    expect(report.trials.slice(1).every((trial) => trial.status === "BLOCKED")).toBe(true);
    expect(transmittedCount).toBe(0);
  }, 30_000);

  it("continues the full schedule after an ordinary primary invalid completion and retains cleanup evidence", async () => {
    const config = await diagnosticConfig({});
    const source = await sourceFixture();

    const report = await runLocalVlmDecisionClarityDiagnostic({
      config,
      scenarioId: "decision-clarity-ordinary-failure-continues",
      ...source,
      serviceDeadlineMs: 30,
      hardCeilingMs: 90,
      mutateLaunchSpec: (trial, launchSpec) =>
        trial.sequenceNumber === 1
          ? withLaunchArgs(
              launchSpec,
              decisionClarityBehaviorArgs({
                responseVariant: "invalid-grid",
              }),
            )
          : launchSpec,
    });

    expect(report.trials).toHaveLength(18);
    expect(report.fatalStopReason).toBeNull();
    expect(report.trials[0]?.completionState).toBe("TIMELY_INVALID_COMPLETION");
    expect(report.trials.slice(1).every((trial) => trial.status !== "BLOCKED")).toBe(true);
    expect(report.trials.every((trial) => trial.evidence?.cleanupCompleted === true)).toBe(true);
    expect(report.trials.every((trial) => trial.evidence?.processTreeReleased === true)).toBe(true);
  }, 30_000);

  it("treats a 29 ms completion as timely and a 31 ms completion as late while the process continues past the service deadline", async () => {
    const config = await diagnosticConfig({});
    const source = await sourceFixture();

    const timely = await runLocalVlmDecisionClarityDiagnostic({
      config,
      scenarioId: "decision-clarity-timely",
      ...source,
      serviceDeadlineMs: 30,
      hardCeilingMs: 90,
      mutateLaunchSpec: (trial, launchSpec) =>
        trial.sequenceNumber === 1
          ? withLaunchArgs(
              launchSpec,
              decisionClarityBehaviorArgs({
                responseDelayMs: 0,
                reportedCompletionLatencyMs: 29,
              }),
            )
          : launchSpec,
    });
    expect(timely.trials[0]?.completionState).toBe("TIMELY_VALID_COMPLETION");
    expect(timely.trials[0]?.evidence?.serviceDeadlineMet).toBe(true);

    const late = await runLocalVlmDecisionClarityDiagnostic({
      config,
      scenarioId: "decision-clarity-late",
      ...source,
      serviceDeadlineMs: 30,
      hardCeilingMs: 90,
      mutateLaunchSpec: (trial, launchSpec) =>
        trial.sequenceNumber === 1
          ? withLaunchArgs(
              launchSpec,
              decisionClarityBehaviorArgs({
                responseDelayMs: 31,
                reportedCompletionLatencyMs: 31,
              }),
            )
          : launchSpec,
    });
    expect(late.trials[0]?.completionState).toBe("LATE_VALID_COMPLETION");
    expect(late.trials[0]?.evidence?.serviceDeadlineMet).toBe(false);
    expect(late.trials[0]?.evidence?.completionAt).not.toBeNull();
    expect(late.trials[0]?.evidence?.cleanupCompleted).toBe(true);
  }, 30_000);

  it("classifies an invalid 31 ms completion as late invalid", async () => {
    const config = await diagnosticConfig({});
    const source = await sourceFixture();

    const report = await runLocalVlmDecisionClarityDiagnostic({
      config,
      scenarioId: "decision-clarity-late-invalid",
      ...source,
      serviceDeadlineMs: 30,
      hardCeilingMs: 90,
      mutateLaunchSpec: (trial, launchSpec) =>
        trial.sequenceNumber === 1
          ? withLaunchArgs(
              launchSpec,
              decisionClarityBehaviorArgs({
                responseDelayMs: 31,
                responseVariant: "invalid-grid",
              }),
            )
          : launchSpec,
    });

    expect(report.trials[0]?.completionState).toBe("LATE_INVALID_COMPLETION");
    expect(report.trials[0]?.evidence?.serviceDeadlineMet).toBe(false);
    expect(report.trials[0]?.evidence?.completionAt).not.toBeNull();
    expect(report.trials[0]?.evidence?.cleanupCompleted).toBe(true);
  }, 30_000);

  it("classifies lack of completion by the hard ceiling as hard non-completion and retains cleanup evidence", async () => {
    const config = await diagnosticConfig({});
    const source = await sourceFixture();

    const report = await runLocalVlmDecisionClarityDiagnostic({
      config,
      scenarioId: "decision-clarity-hard-non-completion",
      ...source,
      serviceDeadlineMs: 30,
      hardCeilingMs: 90,
      mutateLaunchSpec: (trial, launchSpec) =>
        trial.sequenceNumber === 1
          ? withLaunchArgs(launchSpec, decisionClarityBehaviorArgs({ responseDelayMs: 120 }))
          : launchSpec,
    });

    expect(report.trials[0]?.completionState).toBe("HARD_NON_COMPLETION");
    expect(report.trials[0]?.evidence?.serviceDeadlineMet).toBe(false);
    expect(report.trials[0]?.evidence?.completionAt).toBeNull();
    expect(report.trials[0]?.evidence?.timeoutStage).toBe("request");
    expect(report.trials[0]?.evidence?.cleanupCompleted).toBe(true);
  }, 30_000);

  it("classifies complete evidence according to repeated improvement, equivalence, and degradation rules", async () => {
    const config = await diagnosticConfig({});
    const overlayBytes = await pngBytes();
    const fingerprints = buildDecisionClarityCanonicalFingerprints({
      config,
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: "image/png",
      observationRunId: "classification-run-id",
    });

    const incomplete = classifyDecisionClarityTrials(
      classificationTrials({
        fingerprints,
        completionStateForTrial: (trial) =>
          trial.sequenceNumber === 1 ? "TIMELY_VALID_COMPLETION" : "BLOCKED",
        completionLatencyForTrial: () => 100,
      }).slice(0, 1),
    );
    expect(incomplete.classification.clarityEffect).toBe("INSUFFICIENT_EVIDENCE");

    const isolatedImprovement = classifyDecisionClarityTrials(
      classificationTrials({
        fingerprints,
        completionStateForTrial: () => "TIMELY_VALID_COMPLETION",
        completionLatencyForTrial: (trial) =>
          trial.contract === "A"
            ? 100
            : trial.contract === "A_PRIME" &&
                trial.repetitionNumber === 1 &&
                trial.sequencePosition === 2
              ? 70
              : 100,
      }),
    );
    expect(isolatedImprovement.classification.clarityEffect).toBe("INSUFFICIENT_EVIDENCE");

    const supported = classifyDecisionClarityTrials(
      classificationTrials({
        fingerprints,
        completionStateForTrial: () => "TIMELY_VALID_COMPLETION",
        completionLatencyForTrial: (trial) =>
          trial.contract === "A" ? 100 : trial.contract === "A_PRIME" ? 70 : 100,
      }),
    );
    expect(supported.classification.clarityEffect).toBe("CLARITY_EFFECT_SUPPORTED");

    const noEffect = classifyDecisionClarityTrials(
      classificationTrials({
        fingerprints,
        completionStateForTrial: () => "TIMELY_VALID_COMPLETION",
        completionLatencyForTrial: (trial) =>
          trial.contract === "A" ? 100 : trial.contract === "A_PRIME" ? 105 : 100,
      }),
    );
    expect(noEffect.classification.clarityEffect).toBe("NO_CLARITY_EFFECT_OBSERVED");

    const contradicted = classifyDecisionClarityTrials(
      classificationTrials({
        fingerprints,
        completionStateForTrial: () => "TIMELY_VALID_COMPLETION",
        completionLatencyForTrial: (trial) =>
          trial.contract === "A" ? 100 : trial.contract === "A_PRIME" ? 130 : 100,
      }),
    );
    expect(contradicted.classification.clarityEffect).toBe("CLARITY_EFFECT_CONTRADICTED");

    const fingerprintMismatch = classifyDecisionClarityTrials(
      classificationTrials({
        fingerprints,
        completionStateForTrial: () => "TIMELY_VALID_COMPLETION",
        completionLatencyForTrial: () => 100,
        mismatchForTrial: (trial) => trial.sequenceNumber === 4,
      }),
    );
    expect(fingerprintMismatch.classification.clarityEffect).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("builds an instruction-audit prompt that forbids hidden-reasoning claims", () => {
    const request = buildDecisionClarityInstructionAuditRequest({
      sourceContractIdentity: "phase9-explicit-semantic-selection-policy",
      originalSystemPrompt: "system prompt",
      originalUserInstruction: "user instruction",
      responseContract: { proposals: [] },
      serviceDeadlineMet: false,
      eventualCompletionState: "LATE_VALID_COMPLETION",
      boundedEventualOutput: '{"proposals":[]}',
    });

    expect(request.systemPrompt).toContain("Do not describe hidden reasoning.");
    expect(request.systemPrompt).toContain("Do not justify the observer's answer.");
    expect(request.systemPrompt).toContain(
      "Do not claim access to the observer's internal process.",
    );
    expect(request.systemPrompt).toContain("1. Which terms permit multiple interpretations?");
    expect(request.userInstruction).toContain(
      "sourceContractIdentity: phase9-explicit-semantic-selection-policy",
    );
  });
});
