// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

import { resolveLocalVlmConfig } from "./llama-server-config";
import { LOCAL_VLM_PROMPT_TEXT } from "./observer-prompt";
import {
  buildResponseCompletionRequestSpec,
  RESPONSE_COMPLETION_DIAGNOSTIC_RUNGS,
  runLocalVlmResponseCompletionDiagnostic,
  runResponseCompletionDiagnosticSequence,
} from "./response-completion-diagnostic";
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
    mode: "completion-ladder",
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

describe("response completion diagnostic", () => {
  it("blocks downstream rungs after the first failed completion rung", async () => {
    const reports = await runResponseCompletionDiagnosticSequence({
      runRung: async (rung) => ({
        rung,
        status: rung === "minimal-json" ? "FAIL" : "PASS",
        summary: rung === "minimal-json" ? "failed" : "passed",
        issues: [],
        blockedBy: null,
        evidence: null,
      }),
    });

    expect(reports.map((report) => report.status)).toEqual([
      "PASS",
      "PASS",
      "FAIL",
      "BLOCKED",
      "BLOCKED",
      "BLOCKED",
      "BLOCKED",
    ]);
    expect(reports[3]?.blockedBy).toBe("minimal-json");
  });

  it("uses the exact production observer prompt on the terminal rung", () => {
    const spec = buildResponseCompletionRequestSpec(
      "full-observer-schema",
      "00000000-0000-4000-8000-000000000001",
    );
    expect(spec.promptText).toBe(LOCAL_VLM_PROMPT_TEXT);
    expect(spec.responseFormat).toEqual({ type: "json_object" });
  });

  it("passes every rung when the fake runtime completes each request", async () => {
    const config = await diagnosticConfig({});
    const source = await sourceFixture();

    const report = await runLocalVlmResponseCompletionDiagnostic({
      config,
      scenarioId: "response-completion-pass",
      ...source,
    });

    expect(report.rungs).toHaveLength(RESPONSE_COMPLETION_DIAGNOSTIC_RUNGS.length);
    expect(report.firstFailingRung).toBeNull();
    expect(report.rungs.every((rung) => rung.status === "PASS")).toBe(true);
    expect(report.rungs[0]?.evidence?.finishReason).toBe("stop");
    expect(report.rungs[0]?.evidence?.outputPreviewEscaped).toContain("OK");
    expect(report.rungs.at(-1)?.evidence?.outputPreviewEscaped).toContain("proposal-1");
    expect(report.rungs.every((rung) => rung.evidence?.cleanupCompleted === true)).toBe(true);
  });

  it("fails at the first timed-out rung and blocks all downstream rungs", async () => {
    const config = await diagnosticConfig({
      completionFailAtRung: "minimal-json",
      requestTimeoutMs: 200,
    });
    const source = await sourceFixture();

    const report = await runLocalVlmResponseCompletionDiagnostic({
      config,
      scenarioId: "response-completion-timeout",
      ...source,
    });

    expect(report.firstFailingRung).toBe("minimal-json");
    expect(report.rungs.map((rung) => rung.status)).toEqual([
      "PASS",
      "PASS",
      "FAIL",
      "BLOCKED",
      "BLOCKED",
      "BLOCKED",
      "BLOCKED",
    ]);

    const failed = report.rungs[2];
    expect(failed?.evidence?.firstTokenAt).not.toBeNull();
    expect(failed?.evidence?.completionAt).toBeNull();
    expect(failed?.evidence?.timeoutStage).toBe("response-body");
    expect(failed?.evidence?.responseBytes).toBeGreaterThan(0);
    expect(failed?.evidence?.outputPreviewEscaped).toContain('\\"choices\\"');
    expect(failed?.evidence?.cleanupCompleted).toBe(true);
    expect(failed?.evidence?.process?.forcedTermination).toBe(false);
    expect(failed?.evidence?.resources?.processTreeReleasedAfterTermination).toBe(true);
    expect(report.rungs[3]?.blockedBy).toBe("minimal-json");
  });
});
