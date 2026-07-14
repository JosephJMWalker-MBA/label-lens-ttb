// @vitest-environment node
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LocalVlmResolvedConfig, LocalVlmRunReport } from "./local-vlm.types";

function validObserverPayload(observationRunId: string) {
  return {
    observationRunId,
    proposals: [
      {
        observationId: "observation-1",
        proposalId: "proposal-1",
        observationType: "text-like-region",
        source: "machine-observer",
        authority: "non-authoritative",
        purpose: "ocr-region-proposal",
        gridRange: {
          start: { column: "B", row: 2, columnIndex: 1, rowIndex: 1, id: "B2" },
          end: { column: "D", row: 4, columnIndex: 3, rowIndex: 3, id: "D4" },
          notation: "B2:D4",
        },
        localRefinement: null,
        observationRotation: 0,
        apparentOrientation: "horizontal",
        visibility: "full",
        reasonCodes: ["high_salience", "multi_line"],
        description: "generic text-like region near the center",
      },
    ],
  };
}

function installAdapterMocks(failure: {
  code: string;
  message: string;
  issues: readonly string[];
}) {
  vi.doMock("./llama-server-config", () => ({
    buildLlamaServerLaunchSpec: vi.fn(() => ({
      command: "/fake/llama-server",
      args: ["--port", "43000"],
      host: "127.0.0.1",
      port: 43000,
      sanitizedRuntimeArguments: ["--port", "43000"],
    })),
    readLlamaVersionOutput: vi.fn(async () => "llama-server fake 0.0.0"),
  }));

  vi.doMock("./llama-server-client", () => ({
    waitForReadiness: vi.fn(
      async ({
        onAttempt,
      }: {
        onAttempt: (event: { ok: boolean; error: string | null }) => void;
      }) => {
        onAttempt({ ok: true, error: null });
      },
    ),
    sendObservationRequest: vi.fn(async ({ input }: { input: { observationRunId: string } }) => {
      const text = JSON.stringify(validObserverPayload(input.observationRunId));
      return { text, bytes: Buffer.byteLength(text) };
    }),
  }));

  vi.doMock("./llama-server-process", () => ({
    spawnOwnedLlamaServerProcess: vi.fn(async () => {
      const telemetry: LocalVlmRunReport["process"] = {
        pid: 4321,
        processGroupId: 4321,
        port: 43000,
        spawnedAt: new Date().toISOString(),
        readyAt: null,
        requestStartedAt: null,
        requestCompletedAt: null,
        terminationRequestedAt: null,
        exitedAt: null,
        exitCode: null,
        exitSignal: null,
        forcedTermination: false,
        stdoutBytes: 0,
        stderrBytes: 0,
        stdoutTruncated: false,
        stderrTruncated: false,
        readiness: {
          attempts: 0,
          firstSuccessfulReadyAt: null,
          totalStartupLatencyMs: null,
          lastReadinessError: null,
          processExitedBeforeReady: false,
          startupTimedOut: false,
        },
        portReleased: null,
      };

      return {
        launchSpec: {
          command: "/fake/llama-server",
          args: ["--port", "43000"],
          host: "127.0.0.1",
          port: 43000,
          sanitizedRuntimeArguments: ["--port", "43000"],
        },
        telemetry,
        noteReadinessAttempt(ok: boolean, error: string | null, startedAt: number) {
          telemetry.readiness.attempts += 1;
          if (ok) {
            const now = new Date().toISOString();
            telemetry.readyAt = now;
            telemetry.readiness.firstSuccessfulReadyAt = now;
            telemetry.readiness.totalStartupLatencyMs = Math.max(0, performance.now() - startedAt);
          } else if (error) {
            telemetry.readiness.lastReadinessError = error;
          }
        },
        markReadinessTimeout() {
          telemetry.readiness.startupTimedOut = true;
        },
        markRequestStarted() {
          telemetry.requestStartedAt = new Date().toISOString();
        },
        markRequestCompleted() {
          telemetry.requestCompletedAt = new Date().toISOString();
        },
        async terminate() {
          telemetry.terminationRequestedAt = new Date().toISOString();
          if (failure.code === "PORT_RELEASE_FAILED") {
            telemetry.exitedAt = new Date().toISOString();
            telemetry.exitCode = 0;
            telemetry.portReleased = false;
          } else {
            telemetry.forcedTermination = true;
          }
          throw failure;
        },
        async finalizeResources(workspaceBytesAfterCleanup: number | null) {
          return {
            workspaceBytesBeforeStart: 0,
            workspacePeakBytes: 1,
            workspaceBytesBeforeCleanup: 1,
            workspaceBytesAfterCleanup,
            fileCountPeak: 1,
            filesCreated: 1,
            quarantinedFiles: 0,
            processRssBytesBeforeTermination: 100,
            peakProcessRssBytes: 100,
            peakProcessTreeRssBytes: 100,
            processRssBytesAfterTermination: null,
            sampleCount: 1,
            sampleFailureCount: 0,
            gpu: {
              available: false,
              sampleCount: 0,
              peakBytes: null,
              lastBytes: null,
              failureCount: 0,
            },
          };
        },
      };
    }),
    localVlmFailureFromUnknown: vi.fn(
      (error: unknown) =>
        (error as { code: string; message: string; issues: readonly string[] }) ?? {
          code: "INVALID_OBSERVER_OUTPUT",
          message: String(error),
          issues: [],
        },
    ),
  }));
}

const CLEANUP: string[] = [];

afterEach(() => {
  vi.resetModules();
  vi.unmock("./llama-server-config");
  vi.unmock("./llama-server-client");
  vi.unmock("./llama-server-process");
  while (CLEANUP.length > 0) rmSync(CLEANUP.pop()!, { recursive: true, force: true });
});

const TEST_CONFIG: LocalVlmResolvedConfig = {
  schemaVersion: "local-vlm-config.v1",
  llamaServerBin: "/fake/llama-server",
  llamaExecutableSha256: "a".repeat(64),
  llamaVersionArgs: ["--version"],
  modelPath: "/fake/model.gguf",
  modelSha256: "b".repeat(64),
  modelFileSize: 1,
  modelDisplayId: "fake-model",
  modelQuantization: "Q4_K_M",
  mmprojPath: null,
  mmprojSha256: null,
  mmprojFileSize: null,
  host: "127.0.0.1",
  startupTimeoutMs: 1_000,
  requestTimeoutMs: 1_000,
  terminationTimeoutMs: 150,
  maxImageBytes: 6_000_000,
  maxOutputTokens: 500,
  contextSize: 4_096,
  gpuLayers: null,
  threadCount: null,
  responseBytesMax: 250_000,
  stdoutBytesMax: 8_192,
  stderrBytesMax: 8_192,
  resourceSampleIntervalMs: 25,
  maxProposalsPerImage: 12,
  maxReasonCodesPerProposal: 8,
  maxDescriptionLength: 240,
  temperature: 0,
  seed: 0,
  readinessPath: "/health",
  chatCompletionsPath: "/v1/chat/completions",
};

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

function writeSource(bytes: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), "llama-adapter-unit-"));
  CLEANUP.push(dir);
  const path = join(dir, "source.png");
  writeFileSync(path, Buffer.from(bytes));
  return path;
}

describe("llama-server adapter termination handling", () => {
  it.each([
    {
      code: "PROCESS_TERMINATION_FAILED",
      message: "The local VLM child process did not exit after forced termination.",
      issues: ["pid=4321"],
    },
    {
      code: "PORT_RELEASE_FAILED",
      message: "The local VLM server port remained open after termination.",
      issues: ["port=43000"],
    },
  ] as const)(
    "returns a lifecycle error and no canonical proposals after $code",
    async (failure) => {
      installAdapterMocks({ ...failure });
      const [{ runVisionObserverLifecycle }, { LlamaServerVisionObserverAdapter }] =
        await Promise.all([import("../observer-lifecycle"), import("./llama-server-adapter")]);
      const adapter = new LlamaServerVisionObserverAdapter(TEST_CONFIG);
      const bytes = await pngBytes();
      const sourceArtifactRef = writeSource(bytes);

      const result = await runVisionObserverLifecycle({
        scenarioId: "slice2-termination-failure",
        sourceArtifactRef,
        sourceBytes: bytes,
        sourceMediaType: "image/png",
        sourceWidth: 100,
        sourceHeight: 60,
        adapter,
        timeoutMs: 3_500,
      });

      const snapshot = adapter.getLastRunSnapshot();
      expect(result.errorRecord?.code).toBe("OBSERVER_EXCEPTION");
      expect(result.errorRecord?.message).toBe(failure.message);
      expect(result.observerResult).toBeNull();
      expect(result.canonicalProposals).toEqual([]);
      expect(result.run.cleanupCompleted).toBe(true);
      expect(existsSync(result.workspaceDir)).toBe(false);
      expect(existsSync(sourceArtifactRef)).toBe(true);
      expect(snapshot?.sourceArtifactRef).toBe(sourceArtifactRef);
      expect(snapshot?.errorRecord?.code).toBe("OBSERVER_EXCEPTION");
      expect(snapshot?.errorRecord?.message).toBe(failure.message);
      expect(snapshot?.output.proposalCount).toBe(1);
    },
  );
});
