// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { sendObservationRequest, waitForReadiness } from "./llama-server-client";
import { resolveLocalVlmConfig } from "./llama-server-config";
import { spawnOwnedLlamaServerProcess } from "./llama-server-process";
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

function fakeOverlay(dir: string) {
  const path = join(dir, "overlay.png");
  writeFileSync(path, Buffer.from("fake-image", "utf8"));
  return path;
}

async function readyOwner(args: {
  mode?: string;
  readyDelayMs?: number;
  requestDelayMs?: number;
  logBytes?: number;
  spawnChild?: boolean;
  ignoreTermOnce?: boolean;
  startupTimeoutMs?: number;
}) {
  const dir = tempDir();
  CLEANUP.push(dir);
  const executable = writeFakeServerWrapper(dir, args);
  const model = writeFakeModel(dir);
  const config = await resolveLocalVlmConfig(
    localVlmEnv({
      executablePath: executable.path,
      executableSha256: executable.sha256,
      modelPath: model.path,
      modelSha256: model.sha256,
      startupTimeoutMs: args.startupTimeoutMs ?? 1_200,
      requestTimeoutMs: 400,
      terminationTimeoutMs: 150,
    }),
  );
  expect(config.ok).toBe(true);
  if (!config.ok) throw new Error("config failed");
  const owner = await spawnOwnedLlamaServerProcess({
    launchSpec: {
      command: executable.path,
      args: ["--host", "127.0.0.1", "--port", "0", "--model", model.path],
      host: "127.0.0.1",
      sanitizedRuntimeArguments: ["--host", "127.0.0.1", "--port", "0", "--model", model.path],
    },
    workspaceDir: dir,
    host: "127.0.0.1",
    stdoutBytesMax: 64,
    stderrBytesMax: 64,
    resourceSampleIntervalMs: 25,
    terminationTimeoutMs: 150,
  });
  return { dir, executable, model, config: config.value, owner };
}

describe("llama-server process owner", () => {
  it("allocates a dynamic port and establishes readiness", async () => {
    const { owner, config } = await readyOwner({});
    expect(owner.telemetry.port).toBeGreaterThan(0);
    await waitForReadiness({
      config,
      port: owner.telemetry.port,
      signal: new AbortController().signal,
      onAttempt: ({ ok, error }) => owner.noteReadinessAttempt(ok, error, performance.now()),
    });
    expect(owner.telemetry.readyAt).not.toBeNull();
    await owner.terminate();
  });

  it("treats launch-spec port 0 as dynamic allocation and rewrites runtime arguments", async () => {
    const { owner } = await readyOwner({});
    expect(owner.telemetry.port).toBeGreaterThan(0);
    expect(owner.launchSpec.sanitizedRuntimeArguments).toContain(String(owner.telemetry.port));
    expect(owner.launchSpec.sanitizedRuntimeArguments).not.toContain("0");
    await owner.terminate();
  });

  it("times out readiness when the server never becomes ready", async () => {
    const { owner, config } = await readyOwner({ readyDelayMs: 2_000 });
    await expect(
      waitForReadiness({
        config,
        port: owner.telemetry.port,
        signal: new AbortController().signal,
        onAttempt: ({ ok, error }) => owner.noteReadinessAttempt(ok, error, performance.now()),
      }),
    ).rejects.toMatchObject({ code: "READINESS_TIMEOUT" });
    owner.markReadinessTimeout();
    await owner.terminate();
    expect(owner.telemetry.readiness.startupTimedOut).toBe(true);
  });

  it("detects a process that exits before readiness", async () => {
    const { owner, config } = await readyOwner({ mode: "exit-before-ready" });
    await expect(
      waitForReadiness({
        config,
        port: owner.telemetry.port,
        signal: new AbortController().signal,
        onAttempt: ({ ok, error }) => owner.noteReadinessAttempt(ok, error, performance.now()),
      }),
    ).rejects.toBeTruthy();
    await owner.waitForExit();
    expect(owner.telemetry.readiness.processExitedBeforeReady).toBe(true);
  });

  it("times out a hanging request and still releases the port on termination", async () => {
    const { owner, config, dir } = await readyOwner({ mode: "hang-request" });
    await waitForReadiness({
      config,
      port: owner.telemetry.port,
      signal: new AbortController().signal,
      onAttempt: ({ ok, error }) => owner.noteReadinessAttempt(ok, error, performance.now()),
    });
    await expect(
      sendObservationRequest({
        config,
        port: owner.telemetry.port,
        input: {
          observationRunId: "00000000-0000-4000-8000-000000000001",
          scenarioId: "hang",
          sourceArtifactRef: join(dir, "source.png"),
          workspaceDir: dir,
          overlayArtifactPath: fakeOverlay(dir),
          overlayMediaType: "image/png",
          overlaySha256: "3".repeat(64),
          overlayWidth: 10,
          overlayHeight: 10,
          sourceImageSha256: "4".repeat(64),
        },
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    await owner.terminate();
    expect(owner.telemetry.portReleased).toBe(true);
  });

  it("captures bounded stderr without keeping raw output unbounded", async () => {
    const { owner, config } = await readyOwner({ logBytes: 2_048 });
    await waitForReadiness({
      config,
      port: owner.telemetry.port,
      signal: new AbortController().signal,
      onAttempt: ({ ok, error }) => owner.noteReadinessAttempt(ok, error, performance.now()),
    });
    await owner.terminate();
    expect(owner.telemetry.stderrBytes).toBeGreaterThan(64);
    expect(owner.telemetry.stderrTruncated).toBe(true);
  });

  it("escalates to forced termination when the first graceful signal is ignored", async () => {
    const { owner, config } = await readyOwner({
      ignoreTermOnce: true,
      startupTimeoutMs: 4_000,
    });
    await waitForReadiness({
      config,
      port: owner.telemetry.port,
      signal: new AbortController().signal,
      onAttempt: ({ ok, error }) => owner.noteReadinessAttempt(ok, error, performance.now()),
    });
    await owner.terminate();
    expect(owner.telemetry.forcedTermination).toBe(true);
    expect(owner.telemetry.exitedAt).not.toBeNull();
  }, 10_000);

  it("kills the child process tree where supported", async () => {
    if (process.platform === "win32") return;
    const { owner, config, dir } = await readyOwner({
      spawnChild: true,
      ignoreTermOnce: true,
      startupTimeoutMs: 4_000,
    });
    await waitForReadiness({
      config,
      port: owner.telemetry.port,
      signal: new AbortController().signal,
      onAttempt: ({ ok, error }) => owner.noteReadinessAttempt(ok, error, performance.now()),
    });
    const childPid = Number(readFileSync(join(dir, "spawned-child.pid"), "utf8").trim());
    await owner.terminate();
    expect(() => process.kill(childPid, 0)).toThrow();
  }, 10_000);

  it("stops the resource sampler when finalized", async () => {
    const { owner, config } = await readyOwner({ startupTimeoutMs: 4_000 });
    await waitForReadiness({
      config,
      port: owner.telemetry.port,
      signal: new AbortController().signal,
      onAttempt: ({ ok, error }) => owner.noteReadinessAttempt(ok, error, performance.now()),
    });
    await owner.terminate();
    const first = await owner.finalizeResources(0);
    const count = first.sampleCount;
    expect(first.processTreeReleasedAfterTermination).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(first.sampleCount).toBe(count);
  }, 10_000);
});
