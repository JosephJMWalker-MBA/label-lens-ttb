// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

import { runVisionObserverLifecycle } from "../observer-lifecycle";

import { resolveLocalVlmConfig } from "./llama-server-config";
import { LlamaServerVisionObserverAdapter } from "./llama-server-adapter";
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
  return new Uint8Array(
    await sharp({
      create: {
        width: 100,
        height: 60,
        channels: 3,
        background: "#f4ead8",
      },
    })
      .png()
      .toBuffer(),
  );
}

async function readyAdapter(mode = "ok") {
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
      terminationTimeoutMs: 150,
    }),
  );
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) throw new Error("config failed");
  return new LlamaServerVisionObserverAdapter(resolved.value);
}

describe("llama-server adapter integration", () => {
  it("runs one strict-isolation observation and records cleanup", async () => {
    const adapter = await readyAdapter();
    const bytes = await pngBytes();
    const sourceArtifactRef = join(tempDir(), "source.png");
    CLEANUP.push(join(sourceArtifactRef, ".."));
    writeFileSync(sourceArtifactRef, Buffer.from(bytes));
    const result = await runVisionObserverLifecycle({
      scenarioId: "slice2-smoke",
      sourceArtifactRef,
      sourceBytes: bytes,
      sourceMediaType: "image/png",
      sourceWidth: 100,
      sourceHeight: 60,
      adapter,
      timeoutMs: 3_500,
    });
    const snapshot = adapter.getLastRunSnapshot();
    expect(snapshot).not.toBeNull();
    expect(result.run.cleanupCompleted).toBe(true);
    expect(result.canonicalProposals.length).toBe(1);
    expect(result.errorRecord).toBeNull();
    expect(snapshot?.process.exitedAt).not.toBeNull();
    expect(snapshot?.process.portReleased).toBe(true);
  });

  it("rejects malformed output without invoking OCR", async () => {
    const adapter = await readyAdapter("malformed");
    const bytes = await pngBytes();
    const sourceArtifactRef = join(tempDir(), "source.png");
    CLEANUP.push(join(sourceArtifactRef, ".."));
    writeFileSync(sourceArtifactRef, Buffer.from(bytes));
    const result = await runVisionObserverLifecycle({
      scenarioId: "slice2-malformed",
      sourceArtifactRef,
      sourceBytes: bytes,
      sourceMediaType: "image/png",
      sourceWidth: 100,
      sourceHeight: 60,
      adapter,
      timeoutMs: 3_500,
    });
    expect(result.canonicalProposals).toHaveLength(0);
    expect(result.errorRecord).not.toBeNull();
    const snapshot = adapter.getLastRunSnapshot();
    expect(snapshot?.validation.transportSuccess).toBe(true);
    expect(snapshot?.validation.schemaSuccess).toBe(false);
  });

  it("propagates abort and waits for process termination before cleanup", async () => {
    const dir = tempDir();
    CLEANUP.push(dir);
    const executable = writeFakeServerWrapper(dir, { mode: "hang-request", ignoreTermOnce: true });
    const model = writeFakeModel(dir);
    const resolved = await resolveLocalVlmConfig(
      localVlmEnv({
        executablePath: executable.path,
        executableSha256: executable.sha256,
        modelPath: model.path,
        modelSha256: model.sha256,
        requestTimeoutMs: 200,
        startupTimeoutMs: 1_200,
        terminationTimeoutMs: 100,
      }),
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error("config failed");
    const adapter = new LlamaServerVisionObserverAdapter(resolved.value);
    const bytes = await pngBytes();
    const sourceArtifactRef = join(dir, "source.png");
    writeFileSync(sourceArtifactRef, Buffer.from(bytes));
    const result = await runVisionObserverLifecycle({
      scenarioId: "slice2-timeout",
      sourceArtifactRef,
      sourceBytes: bytes,
      sourceMediaType: "image/png",
      sourceWidth: 100,
      sourceHeight: 60,
      adapter,
      timeoutMs: 3_500,
    });
    const snapshot = adapter.getLastRunSnapshot();
    expect(snapshot?.process.exitedAt).not.toBeNull();
    expect(snapshot?.process.portReleased).toBe(true);
    expect(result.run.cleanupCompleted).toBe(true);
    expect(existsSync(result.workspaceDir)).toBe(false);
  });

  it("produces unique observation ids across separate strict-isolation runs", async () => {
    const adapterA = await readyAdapter();
    const adapterB = await readyAdapter();
    const bytes = await pngBytes();
    const sourceArtifactRef = join(tempDir(), "source.png");
    CLEANUP.push(join(sourceArtifactRef, ".."));
    writeFileSync(sourceArtifactRef, Buffer.from(bytes));
    const first = await runVisionObserverLifecycle({
      scenarioId: "slice2-a",
      sourceArtifactRef,
      sourceBytes: bytes,
      sourceMediaType: "image/png",
      sourceWidth: 100,
      sourceHeight: 60,
      adapter: adapterA,
      timeoutMs: 3_500,
    });
    const second = await runVisionObserverLifecycle({
      scenarioId: "slice2-b",
      sourceArtifactRef,
      sourceBytes: bytes,
      sourceMediaType: "image/png",
      sourceWidth: 100,
      sourceHeight: 60,
      adapter: adapterB,
      timeoutMs: 3_500,
    });
    expect(first.run.observationRunId).not.toBe(second.run.observationRunId);
    expect(adapterA.getLastRunSnapshot()?.process.pid).not.toBe(
      adapterB.getLastRunSnapshot()?.process.pid,
    );
  });
});
