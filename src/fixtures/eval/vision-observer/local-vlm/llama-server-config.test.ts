// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import { resolveLocalVlmConfig } from "./llama-server-config";
import {
  cleanupDir,
  localVlmEnv,
  tempDir,
  writeFakeModel,
  writeFakeProjector,
  writeFakeServerWrapper,
} from "./local-vlm-test-helpers";

const CLEANUP: string[] = [];

afterEach(() => {
  while (CLEANUP.length > 0) cleanupDir(CLEANUP.pop()!);
});

describe("llama-server config", () => {
  it("rejects missing executable configuration", async () => {
    const result = await resolveLocalVlmConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_CONFIG");
  });

  it("rejects missing model configuration", async () => {
    const dir = tempDir();
    CLEANUP.push(dir);
    const executable = writeFakeServerWrapper(dir);
    const result = await resolveLocalVlmConfig({
      LLAMA_SERVER_BIN: executable.path,
      LLAMA_SERVER_SHA256: executable.sha256,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_CONFIG");
  });

  it("rejects a wrong executable digest", async () => {
    const dir = tempDir();
    CLEANUP.push(dir);
    const executable = writeFakeServerWrapper(dir);
    const model = writeFakeModel(dir);
    const result = await resolveLocalVlmConfig(
      localVlmEnv({
        executablePath: executable.path,
        executableSha256: "1".repeat(64),
        modelPath: model.path,
        modelSha256: model.sha256,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_DIGEST");
  });

  it("rejects an invalid explicit runtime provenance value", async () => {
    const dir = tempDir();
    CLEANUP.push(dir);
    const executable = writeFakeServerWrapper(dir);
    const model = writeFakeModel(dir);
    const result = await resolveLocalVlmConfig({
      ...localVlmEnv({
        executablePath: executable.path,
        executableSha256: executable.sha256,
        modelPath: model.path,
        modelSha256: model.sha256,
      }),
      VLM_RUNTIME_KIND: "shim-runtime",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_RUNTIME_KIND");
  });

  it("rejects a wrong model digest", async () => {
    const dir = tempDir();
    CLEANUP.push(dir);
    const executable = writeFakeServerWrapper(dir);
    const model = writeFakeModel(dir);
    const result = await resolveLocalVlmConfig(
      localVlmEnv({
        executablePath: executable.path,
        executableSha256: executable.sha256,
        modelPath: model.path,
        modelSha256: "2".repeat(64),
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_DIGEST");
  });

  it("rejects non-loopback hosts", async () => {
    const dir = tempDir();
    CLEANUP.push(dir);
    const executable = writeFakeServerWrapper(dir);
    const model = writeFakeModel(dir);
    const result = await resolveLocalVlmConfig(
      localVlmEnv({
        executablePath: executable.path,
        executableSha256: executable.sha256,
        modelPath: model.path,
        modelSha256: model.sha256,
        host: "0.0.0.0",
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_HOST");
  });

  it("rejects shell-injection-like argument values", async () => {
    const dir = tempDir();
    CLEANUP.push(dir);
    const executable = writeFakeServerWrapper(dir);
    const model = writeFakeModel(dir);
    const result = await resolveLocalVlmConfig(
      localVlmEnv({
        executablePath: executable.path,
        executableSha256: executable.sha256,
        modelPath: "-malicious",
        modelSha256: model.sha256,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNSAFE_ARGUMENT");
  });

  it("resolves a digest-pinned executable, model, and optional projector", async () => {
    const dir = tempDir();
    CLEANUP.push(dir);
    const executable = writeFakeServerWrapper(dir);
    const model = writeFakeModel(dir);
    const projector = writeFakeProjector(dir);
    const result = await resolveLocalVlmConfig(
      localVlmEnv({
        executablePath: executable.path,
        executableSha256: executable.sha256,
        modelPath: model.path,
        modelSha256: model.sha256,
        mmprojPath: projector.path,
        mmprojSha256: projector.sha256,
        gpuLayers: 0,
        threadCount: 2,
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.runtimeKind).toBe("fake-server");
      expect(result.value.modelDisplayId).toContain("Q4_K_M");
      expect(result.value.mmprojSha256).toBe(projector.sha256);
      expect(result.value.host).toBe("127.0.0.1");
    }
  });
});
