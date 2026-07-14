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
  }, 20_000);

  it("classifies deterministic, intermittent, order-state, and insufficient outcomes without collapsing mixed results", async () => {
    const config = await diagnosticConfig({});
    const overlayBytes = await pngBytes();
    const fingerprints = buildRequestParityCanonicalFingerprints({
      config,
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: "image/png",
      observationRunId: "classification-run-id",
    });
    const fingerprintFor = (contract: "A" | "B" | "C") =>
      fingerprints.find((entry) => entry.contract === contract)?.requestBodyDigest ?? "";

    const deterministic = classifyRequestParityTrials({
      fingerprints,
      trials: [
        {
          contract: "A",
          sequencePosition: 1,
          status: "FAIL",
          requestFingerprintDigest: fingerprintFor("A"),
        },
        {
          contract: "A",
          sequencePosition: 3,
          status: "FAIL",
          requestFingerprintDigest: fingerprintFor("A"),
        },
        {
          contract: "B",
          sequencePosition: 2,
          status: "PASS",
          requestFingerprintDigest: fingerprintFor("B"),
        },
        {
          contract: "B",
          sequencePosition: 5,
          status: "PASS",
          requestFingerprintDigest: fingerprintFor("B"),
        },
        {
          contract: "C",
          sequencePosition: 4,
          status: "PASS",
          requestFingerprintDigest: fingerprintFor("C"),
        },
      ],
    });
    expect(
      deterministic.contractFindings.find((finding) => finding.contract === "A")?.outcome,
    ).toBe("DETERMINISTIC_FAILURE");

    const intermittent = classifyRequestParityTrials({
      fingerprints,
      trials: [
        {
          contract: "A",
          sequencePosition: 1,
          status: "FAIL",
          requestFingerprintDigest: fingerprintFor("A"),
        },
        {
          contract: "A",
          sequencePosition: 1,
          status: "PASS",
          requestFingerprintDigest: fingerprintFor("A"),
        },
      ],
    });
    expect(intermittent.contractFindings.find((finding) => finding.contract === "A")?.outcome).toBe(
      "INTERMITTENT_FAILURE",
    );

    const insufficient = classifyRequestParityTrials({
      fingerprints,
      trials: [
        {
          contract: "A",
          sequencePosition: 1,
          status: "PASS",
          requestFingerprintDigest: fingerprintFor("A"),
        },
        {
          contract: "A",
          sequencePosition: 3,
          status: "PASS",
          requestFingerprintDigest: fingerprintFor("A"),
        },
        {
          contract: "B",
          sequencePosition: 2,
          status: "PASS",
          requestFingerprintDigest: fingerprintFor("B"),
        },
        {
          contract: "B",
          sequencePosition: 5,
          status: "PASS",
          requestFingerprintDigest: fingerprintFor("B"),
        },
        {
          contract: "C",
          sequencePosition: 4,
          status: "PASS",
          requestFingerprintDigest: fingerprintFor("C"),
        },
      ],
    });
    expect(insufficient.overall).toBe("INSUFFICIENT_EVIDENCE");

    const mixed = classifyRequestParityTrials({
      fingerprints,
      trials: [
        {
          contract: "A",
          sequencePosition: 1,
          status: "FAIL",
          requestFingerprintDigest: fingerprintFor("A"),
        },
        {
          contract: "A",
          sequencePosition: 3,
          status: "PASS",
          requestFingerprintDigest: fingerprintFor("A"),
        },
        {
          contract: "A",
          sequencePosition: 1,
          status: "FAIL",
          requestFingerprintDigest: fingerprintFor("A"),
        },
        {
          contract: "A",
          sequencePosition: 3,
          status: "PASS",
          requestFingerprintDigest: fingerprintFor("A"),
        },
      ],
    });
    expect(mixed.overall).toBe("ORDER_OR_STATE_EFFECT");
  });
});
