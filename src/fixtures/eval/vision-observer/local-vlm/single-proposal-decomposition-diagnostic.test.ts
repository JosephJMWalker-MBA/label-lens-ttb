// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

import { resolveLocalVlmConfig } from "./llama-server-config";
import { LOCAL_VLM_PROMPT_JSON_AND_ENUM_GUIDANCE_LINES } from "./observer-prompt";
import {
  buildSingleProposalDecompositionRequestSpec,
  buildSingleProposalDecompositionResponseExample,
  runLocalVlmSingleProposalDecompositionDiagnostic,
  runSingleProposalDecompositionDiagnosticSequence,
  SINGLE_PROPOSAL_DECOMPOSITION_DIAGNOSTIC_RUNGS,
} from "./single-proposal-decomposition-diagnostic";
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
    mode: "single-proposal-decomposition",
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

describe("single proposal decomposition diagnostic", () => {
  it("blocks downstream rungs after the first failed completion rung", async () => {
    const reports = await runSingleProposalDecompositionDiagnosticSequence({
      runRung: async (rung) => ({
        rung,
        status: rung === "boundary-fields" ? "FAIL" : "PASS",
        summary: rung === "boundary-fields" ? "failed" : "passed",
        issues: [],
        blockedBy: null,
        evidence: null,
      }),
    });

    expect(reports.map((report) => report.status)).toEqual([
      "PASS",
      "PASS",
      "PASS",
      "PASS",
      "FAIL",
      "BLOCKED",
      "BLOCKED",
      "BLOCKED",
      "BLOCKED",
    ]);
    expect(reports[5]?.blockedBy).toBe("boundary-fields");
  });

  it("executes the empty-envelope control first and stops scheduling after the first fail", async () => {
    const order: string[] = [];
    await runSingleProposalDecompositionDiagnosticSequence({
      runRung: async (rung) => {
        order.push(rung);
        return {
          rung,
          status: rung === "identity-fields" ? "FAIL" : "PASS",
          summary: "scheduled",
          issues: [],
          blockedBy: null,
          evidence: null,
        };
      },
    });

    expect(order).toEqual([
      "empty-envelope-control",
      "empty-proposal-object",
      "one-fixed-discriminator",
      "identity-fields",
    ]);
  });

  it("adds only the intended proposal fields at each rung", () => {
    const runId = "00000000-0000-4000-8000-000000000001";
    expect(
      buildSingleProposalDecompositionResponseExample("empty-envelope-control", runId),
    ).toEqual({
      observationRunId: runId,
      proposals: [],
    });

    const populatedRungs = [
      "empty-proposal-object",
      "one-fixed-discriminator",
      "identity-fields",
      "boundary-fields",
      "visual-classification-fields",
      "reason-codes",
      "description",
    ] as const;
    const expectedAddedFields: Record<(typeof populatedRungs)[number], readonly string[]> = {
      "empty-proposal-object": [],
      "one-fixed-discriminator": ["observationType"],
      "identity-fields": ["observationId", "proposalId"],
      "boundary-fields": ["source", "authority", "purpose"],
      "visual-classification-fields": ["apparentOrientation", "visibility"],
      "reason-codes": ["reasonCodes"],
      description: ["description"],
    };

    let previousKeys: string[] | null = null;
    for (const rung of populatedRungs) {
      const payload = buildSingleProposalDecompositionResponseExample(rung, runId);
      expect(payload.observationRunId).toBe(runId);
      expect(payload.proposals).toHaveLength(1);
      const proposal = payload.proposals[0] ?? {};
      const currentKeys = Object.keys(proposal);
      if (previousKeys !== null) {
        const priorKeys = previousKeys;
        const addedKeys = currentKeys.filter((key) => !priorKeys.includes(key));
        expect(addedKeys).toEqual(expectedAddedFields[rung]);
        expect(priorKeys.every((key) => currentKeys.includes(key))).toBe(true);
      } else {
        expect(currentKeys).toEqual([]);
      }
      previousKeys = currentKeys;
    }
  });

  it("holds the output shape constant for the guidance-load control", () => {
    const runId = "00000000-0000-4000-8000-000000000001";
    const descriptionSpec = buildSingleProposalDecompositionRequestSpec("description", runId);
    const guidanceSpec = buildSingleProposalDecompositionRequestSpec(
      "guidance-load-control",
      runId,
    );

    expect(guidanceSpec.responseExample).toEqual(descriptionSpec.responseExample);
    expect(descriptionSpec.promptText).not.toContain("Use only these enum values:");
    for (const line of LOCAL_VLM_PROMPT_JSON_AND_ENUM_GUIDANCE_LINES) {
      expect(guidanceSpec.promptText).toContain(line);
    }
    expect(guidanceSpec.promptText).not.toBe(descriptionSpec.promptText);
  });

  it("passes every rung when the fake runtime completes each request", async () => {
    const config = await diagnosticConfig({});
    const source = await sourceFixture();

    const report = await runLocalVlmSingleProposalDecompositionDiagnostic({
      config,
      scenarioId: "single-proposal-pass",
      ...source,
    });

    expect(report.rungs).toHaveLength(SINGLE_PROPOSAL_DECOMPOSITION_DIAGNOSTIC_RUNGS.length);
    expect(report.firstFailingRung).toBeNull();
    expect(report.rungs.every((rung) => rung.status === "PASS")).toBe(true);
    expect(report.rungs.every((rung) => rung.evidence?.responseCompletedSuccessfully)).toBe(true);
    expect(JSON.parse(report.rungs[0]?.evidence?.outputPreviewEscaped ?? '""')).toContain(
      '"proposals":[]',
    );
    expect(JSON.parse(report.rungs.at(-1)?.evidence?.outputPreviewEscaped ?? '""')).toContain(
      '"proposalId":"proposal-1"',
    );
    expect(report.rungs.every((rung) => rung.evidence?.cleanupCompleted === true)).toBe(true);
  });

  it("fails at the selected rung and blocks all downstream rungs", async () => {
    const config = await diagnosticConfig({
      completionFailAtRung: "boundary-fields",
      requestTimeoutMs: 200,
    });
    const source = await sourceFixture();

    const report = await runLocalVlmSingleProposalDecompositionDiagnostic({
      config,
      scenarioId: "single-proposal-timeout",
      ...source,
    });

    expect(report.firstFailingRung).toBe("boundary-fields");
    expect(report.rungs.map((rung) => rung.status)).toEqual([
      "PASS",
      "PASS",
      "PASS",
      "PASS",
      "FAIL",
      "BLOCKED",
      "BLOCKED",
      "BLOCKED",
      "BLOCKED",
    ]);

    const failed = report.rungs[4];
    expect(failed?.evidence?.firstResponseByteAt).not.toBeNull();
    expect(failed?.evidence?.transportCompletedAt).toBeNull();
    expect(failed?.evidence?.responseCompletedSuccessfully).toBe(false);
    expect(failed?.evidence?.completionAt).toBeNull();
    expect(failed?.evidence?.timeoutStage).toBe("response-body");
    expect(failed?.evidence?.responseBytes).toBeGreaterThan(0);
    expect(failed?.evidence?.outputPreviewEscaped).toContain('\\"choices\\"');
    expect(failed?.evidence?.cleanupCompleted).toBe(true);
    expect(failed?.evidence?.process?.forcedTermination).toBe(false);
    expect(failed?.evidence?.resources?.processTreeReleasedAfterTermination).toBe(true);
    expect(report.rungs[5]?.blockedBy).toBe("boundary-fields");
  });
});
