// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

import { resolveLocalVlmConfig } from "./llama-server-config";
import {
  buildRequestParityCanonicalFingerprints,
  buildRequestParitySchedule,
  classifyRequestParityTrials,
  REQUEST_PARITY_REPRODUCIBILITY_SEQUENCE,
  runLocalVlmRequestParityReproducibilityDiagnostic,
} from "./request-parity-reproducibility-diagnostic";
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

async function diagnosticConfig(args: {
  completionFailAtRung?: string;
  requestTimeoutMs?: number;
}) {
  const dir = tempDir();
  CLEANUP.push(dir);
  const executable = writeFakeServerWrapper(dir, {
    mode: "request-parity-reproducibility",
    completionFailAtRung: args.completionFailAtRung,
  });
  const model = writeFakeModel(dir);
  const resolved = await resolveLocalVlmConfig(
    localVlmEnv({
      executablePath: executable.path,
      executableSha256: executable.sha256,
      modelPath: model.path,
      modelSha256: model.sha256,
      startupTimeoutMs: 1_200,
      requestTimeoutMs: args.requestTimeoutMs ?? 250,
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

function fingerprintSnapshotFor(
  fingerprints: Awaited<ReturnType<typeof buildRequestParityCanonicalFingerprints>>,
  contract: "A" | "B" | "C",
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
  fingerprints: Awaited<ReturnType<typeof buildRequestParityCanonicalFingerprints>>,
  contract: "A" | "B" | "C",
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
  fingerprints: Awaited<ReturnType<typeof buildRequestParityCanonicalFingerprints>>,
  contract: "A" | "B" | "C",
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

function classificationTrials(args: {
  fingerprints: Awaited<ReturnType<typeof buildRequestParityCanonicalFingerprints>>;
  statusForTrial: (
    trial: ReturnType<typeof buildRequestParitySchedule>[number],
  ) => "PASS" | "FAIL" | "BLOCKED";
  mismatchForTrial?: (trial: ReturnType<typeof buildRequestParitySchedule>[number]) => boolean;
}) {
  return buildRequestParitySchedule().map((trial) => ({
    contract: trial.contract,
    sequencePosition: trial.sequencePosition,
    status: args.statusForTrial(trial),
    requestFingerprint:
      args.mismatchForTrial?.(trial) === true
        ? mismatchedFingerprint(args.fingerprints, trial.contract)
        : verifiedFingerprint(args.fingerprints, trial.contract),
  }));
}

describe("request parity reproducibility diagnostic", () => {
  it("builds the exact A-B-A-C-B schedule across three repetitions", () => {
    const schedule = buildRequestParitySchedule();
    expect(schedule).toHaveLength(15);
    expect(schedule.map((trial) => trial.contract)).toEqual([
      ...REQUEST_PARITY_REPRODUCIBILITY_SEQUENCE,
      ...REQUEST_PARITY_REPRODUCIBILITY_SEQUENCE,
      ...REQUEST_PARITY_REPRODUCIBILITY_SEQUENCE,
    ]);
    expect(schedule[0]).toMatchObject({
      sequenceNumber: 1,
      repetitionNumber: 1,
      sequencePosition: 1,
      contract: "A",
    });
    expect(schedule[14]).toMatchObject({
      sequenceNumber: 15,
      repetitionNumber: 3,
      sequencePosition: 5,
      contract: "B",
    });
  });

  it("normalizes observationRunId before hashing request fingerprints", async () => {
    const config = await diagnosticConfig({});
    const overlayBytes = await pngBytes();

    const first = buildRequestParityCanonicalFingerprints({
      config,
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: "image/png",
      observationRunId: "run-id-one",
    });
    const second = buildRequestParityCanonicalFingerprints({
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

  it("executes all 15 scheduled trials even when one contract fails and retains cleanup evidence", async () => {
    const config = await diagnosticConfig({
      completionFailAtRung: "A",
      requestTimeoutMs: 200,
    });
    const source = await sourceFixture();

    const report = await runLocalVlmRequestParityReproducibilityDiagnostic({
      config,
      scenarioId: "request-parity-sequence",
      ...source,
    });

    expect(report.trials).toHaveLength(15);
    expect(report.fatalStopReason).toBeNull();
    expect(report.trials.map((trial) => trial.contract)).toEqual([
      ...REQUEST_PARITY_REPRODUCIBILITY_SEQUENCE,
      ...REQUEST_PARITY_REPRODUCIBILITY_SEQUENCE,
      ...REQUEST_PARITY_REPRODUCIBILITY_SEQUENCE,
    ]);
    expect(report.trials.every((trial) => trial.status !== "BLOCKED")).toBe(true);
    expect(
      report.trials
        .filter((trial) => trial.contract === "A")
        .every((trial) => trial.status === "FAIL"),
    ).toBe(true);
    expect(
      report.trials
        .filter((trial) => trial.contract !== "A")
        .every((trial) => trial.status === "PASS"),
    ).toBe(true);
    expect(report.trials.every((trial) => trial.evidence?.cleanupCompleted === true)).toBe(true);
    expect(
      report.trials.every(
        (trial) => trial.evidence?.resources?.processTreeReleasedAfterTermination === true,
      ),
    ).toBe(true);
    expect(report.trials.every((trial) => trial.requestFingerprint.allFieldsMatched)).toBe(true);
  }, 20_000);

  it("stops the schedule when a measured trial request diverges from preregistration", async () => {
    const config = await diagnosticConfig({});
    const source = await sourceFixture();

    const report = await runLocalVlmRequestParityReproducibilityDiagnostic({
      config,
      scenarioId: "request-parity-provenance-mismatch",
      ...source,
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
    });

    expect(report.fatalStopReason).toBe("request fingerprint mismatch at sequence 1");
    expect(report.trials[0]?.status).toBe("BLOCKED");
    expect(report.trials[0]?.requestFingerprint.allFieldsMatched).toBe(false);
    expect(report.trials[0]?.requestFingerprint.mismatchedFields).toContain("temperature");
    expect(report.trials[0]?.requestFingerprint.expected.temperature).toBe("0");
    expect(report.trials[0]?.requestFingerprint.measured?.temperature).toBe("1");
    expect(report.trials.slice(1).every((trial) => trial.status === "BLOCKED")).toBe(true);
    expect(report.classification.overall).toBe("INSUFFICIENT_EVIDENCE");
  }, 20_000);

  it("does not label a partial all-fail contract as deterministic", async () => {
    const config = await diagnosticConfig({});
    const overlayBytes = await pngBytes();
    const fingerprints = buildRequestParityCanonicalFingerprints({
      config,
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: "image/png",
      observationRunId: "classification-run-id",
    });

    const partialDeterministic = classifyRequestParityTrials({
      fingerprints,
      trials: [
        {
          contract: "A",
          sequencePosition: 1,
          status: "FAIL",
          requestFingerprint: verifiedFingerprint(fingerprints, "A"),
        },
        {
          contract: "A",
          sequencePosition: 3,
          status: "FAIL",
          requestFingerprint: verifiedFingerprint(fingerprints, "A"),
        },
      ],
    });
    expect(
      partialDeterministic.contractFindings.find((finding) => finding.contract === "A")?.outcome,
    ).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("does not label an all-fail contract with blocked appearances as deterministic", async () => {
    const config = await diagnosticConfig({});
    const overlayBytes = await pngBytes();
    const fingerprints = buildRequestParityCanonicalFingerprints({
      config,
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: "image/png",
      observationRunId: "classification-run-id",
    });

    const blockedDeterministic = classifyRequestParityTrials({
      fingerprints,
      trials: buildRequestParitySchedule()
        .filter((trial) => trial.contract === "A")
        .map((trial, index) => ({
          contract: trial.contract,
          sequencePosition: trial.sequencePosition,
          status: index < 4 ? "FAIL" : "BLOCKED",
          requestFingerprint: verifiedFingerprint(fingerprints, "A"),
        })),
    });
    expect(
      blockedDeterministic.contractFindings.find((finding) => finding.contract === "A")?.outcome,
    ).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("does not attribute request-difference effects from incomplete evidence", async () => {
    const config = await diagnosticConfig({});
    const overlayBytes = await pngBytes();
    const fingerprints = buildRequestParityCanonicalFingerprints({
      config,
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: "image/png",
      observationRunId: "classification-run-id",
    });

    const incompleteDifference = classifyRequestParityTrials({
      fingerprints,
      trials: [
        {
          contract: "A",
          sequencePosition: 1,
          status: "FAIL",
          requestFingerprint: verifiedFingerprint(fingerprints, "A"),
        },
        {
          contract: "A",
          sequencePosition: 3,
          status: "FAIL",
          requestFingerprint: verifiedFingerprint(fingerprints, "A"),
        },
        {
          contract: "B",
          sequencePosition: 2,
          status: "PASS",
          requestFingerprint: verifiedFingerprint(fingerprints, "B"),
        },
        {
          contract: "B",
          sequencePosition: 5,
          status: "PASS",
          requestFingerprint: verifiedFingerprint(fingerprints, "B"),
        },
      ],
    });
    expect(
      incompleteDifference.requestDifferenceFindings.find(
        (finding) => finding.left === "A" && finding.right === "B",
      )?.outcome,
    ).toBe("INSUFFICIENT_EVIDENCE");
    expect(incompleteDifference.overall).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("classifies complete fingerprint-verified schedules correctly", async () => {
    const config = await diagnosticConfig({});
    const overlayBytes = await pngBytes();
    const fingerprints = buildRequestParityCanonicalFingerprints({
      config,
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: "image/png",
      observationRunId: "classification-run-id",
    });

    const deterministicDifference = classifyRequestParityTrials({
      fingerprints,
      trials: classificationTrials({
        fingerprints,
        statusForTrial: (trial) => (trial.contract === "A" ? "FAIL" : "PASS"),
      }),
    });
    expect(
      deterministicDifference.contractFindings.find((finding) => finding.contract === "A")?.outcome,
    ).toBe("DETERMINISTIC_FAILURE");
    expect(
      deterministicDifference.requestDifferenceFindings.find(
        (finding) => finding.left === "A" && finding.right === "B",
      )?.outcome,
    ).toBe("REQUEST_DIFFERENCE_EFFECT");
    expect(deterministicDifference.overall).toBe("REQUEST_DIFFERENCE_EFFECT");

    const intermittent = classifyRequestParityTrials({
      fingerprints,
      trials: classificationTrials({
        fingerprints,
        statusForTrial: (trial) => {
          if (trial.contract !== "A") return "PASS";
          return trial.sequenceNumber === 1 ||
            trial.sequenceNumber === 8 ||
            trial.sequenceNumber === 11
            ? "FAIL"
            : "PASS";
        },
      }),
    });
    expect(intermittent.contractFindings.find((finding) => finding.contract === "A")?.outcome).toBe(
      "INTERMITTENT_FAILURE",
    );
    expect(intermittent.overall).toBe("INTERMITTENT_FAILURE");

    const orderState = classifyRequestParityTrials({
      fingerprints,
      trials: classificationTrials({
        fingerprints,
        statusForTrial: (trial) => {
          if (trial.contract !== "A") return "PASS";
          return trial.sequencePosition === 1 ? "FAIL" : "PASS";
        },
      }),
    });
    expect(orderState.contractFindings.find((finding) => finding.contract === "A")?.outcome).toBe(
      "ORDER_OR_STATE_EFFECT",
    );
    expect(orderState.overall).toBe("ORDER_OR_STATE_EFFECT");

    const fingerprintMismatch = classifyRequestParityTrials({
      fingerprints,
      trials: classificationTrials({
        fingerprints,
        statusForTrial: () => "PASS",
        mismatchForTrial: (trial) => trial.sequenceNumber === 4,
      }),
    });
    expect(fingerprintMismatch.overall).toBe("INSUFFICIENT_EVIDENCE");
  });
});
