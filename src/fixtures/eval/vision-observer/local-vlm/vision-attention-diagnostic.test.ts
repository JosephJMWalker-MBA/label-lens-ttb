// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import { resolveLocalVlmConfig } from "./llama-server-config";
import {
  cleanupDir,
  localVlmEnv,
  tempDir,
  writeFakeModel,
  writeFakeServerWrapper,
} from "./local-vlm-test-helpers";
import {
  runVisionAttentionDiagnostic,
  writeVisionAttentionSentinelPair,
} from "./vision-attention-diagnostic";

const CLEANUP: string[] = [];

afterEach(() => {
  while (CLEANUP.length > 0) cleanupDir(CLEANUP.pop()!);
});

async function diagnosticConfig(mode: string) {
  const dir = tempDir();
  CLEANUP.push(dir);
  const executable = writeFakeServerWrapper(dir, { mode });
  const model = writeFakeModel(dir);
  const resolved = await resolveLocalVlmConfig(
    localVlmEnv({
      executablePath: executable.path,
      executableSha256: executable.sha256,
      modelPath: model.path,
      modelSha256: model.sha256,
      requestTimeoutMs: 1_000,
      startupTimeoutMs: 1_200,
      terminationTimeoutMs: 200,
    }),
  );
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) throw new Error("config failed");
  return resolved.value;
}

describe("vision attention diagnostic", () => {
  it("passes when black and white sentinel images produce different outputs", async () => {
    const config = await diagnosticConfig("attention-by-brightness");
    const dir = tempDir();
    CLEANUP.push(dir);
    const { blackImagePath, whiteImagePath } = await writeVisionAttentionSentinelPair({ dir });

    const report = await runVisionAttentionDiagnostic({
      config,
      blackImagePath,
      whiteImagePath,
    });

    expect(report.status).toBe("PASS");
    expect(report.evidence.probes[0].normalizedToken).toBe("BLACK");
    expect(report.evidence.probes[1].normalizedToken).toBe("WHITE");
  });

  it("fails when different sentinel images produce the same output", async () => {
    const config = await diagnosticConfig("attention-constant");
    const dir = tempDir();
    CLEANUP.push(dir);
    const { blackImagePath, whiteImagePath } = await writeVisionAttentionSentinelPair({ dir });

    const report = await runVisionAttentionDiagnostic({
      config,
      blackImagePath,
      whiteImagePath,
    });

    expect(report.status).toBe("FAIL");
    expect(report.issues).toContain("different sentinel images produced the same token: BLACK");
  });
});
