// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

import {
  FAKE_OBSERVER_ID,
  FAKE_OBSERVER_PROMPT_ID,
  FakeVisionObserverAdapter,
} from "./fake-observer-adapter";
import { runVisionObserverLifecycle } from "./observer-lifecycle";
import { paddedBoxContains } from "./observer-grid-transform";
import type {
  FakeObserverScenario,
  VisionObserverAdapter,
  VisionObserverInput,
  VisionObserverResult,
} from "./observer-grid.types";

const CLEANUP: string[] = [];

afterAll(() => {
  while (CLEANUP.length > 0) {
    rmSync(CLEANUP.pop()!, { recursive: true, force: true });
  }
});

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), "vision-observer-int-"));
  CLEANUP.push(dir);
  return dir;
}

function writeSourceArtifact(sourceBytes: Uint8Array, filename = "source.png") {
  const path = join(workspace(), filename);
  writeFileSync(path, Buffer.from(sourceBytes));
  return path;
}

async function solidPng(width: number, height: number, color = "#f7e2cc") {
  return new Uint8Array(
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: color,
      },
    })
      .png()
      .toBuffer(),
  );
}

class RecordingAdapter implements VisionObserverAdapter {
  readonly adapterId = FAKE_OBSERVER_ID;
  readonly adapterVersion = "2.0.0";
  readonly promptId = FAKE_OBSERVER_PROMPT_ID;
  readonly promptVersion = "2.0.0";

  readonly seenScenarioIds: string[] = [];
  resetCalls = 0;

  #inner: FakeVisionObserverAdapter;

  constructor(scenarios?: readonly FakeObserverScenario[], delayMs?: number) {
    this.#inner = new FakeVisionObserverAdapter(scenarios, { delayMs });
  }

  async observe(input: VisionObserverInput, signal: AbortSignal): Promise<VisionObserverResult> {
    this.seenScenarioIds.push(input.scenarioId);
    return this.#inner.observe(input, signal);
  }

  async reset(): Promise<void> {
    this.resetCalls += 1;
    await this.#inner.reset?.();
  }

  async dispose(): Promise<void> {
    await this.#inner.dispose();
  }
}

class InvalidOutputAdapter implements VisionObserverAdapter {
  readonly adapterId = "invalid-output-adapter";
  readonly adapterVersion = "1.0.0";
  readonly promptId = "invalid-output";
  readonly promptVersion = "1.0.0";

  async observe(input: VisionObserverInput): Promise<VisionObserverResult> {
    return {
      observationRunId: input.observationRunId,
      proposals: [
        {
          observationId: "bad-output",
          proposalId: "bad-output-1",
          observationType: "text-like-region",
          source: "machine-observer",
          authority: "human-confirmed",
          purpose: "ocr-region-proposal",
          gridRange: {
            start: { column: "A", row: 1, columnIndex: 0, rowIndex: 0, id: "A1" },
            end: { column: "B", row: 2, columnIndex: 1, rowIndex: 1, id: "B2" },
            notation: "A1:B2",
          },
          localRefinement: null,
          observationRotation: 0,
          apparentOrientation: "horizontal",
          visibility: "full",
          reasonCodes: ["high_salience"],
          description: "Approved brand text near the top edge",
        },
      ],
    };
  }

  async dispose(): Promise<void> {}
}

class ThrowingAdapter implements VisionObserverAdapter {
  readonly adapterId = "throwing-adapter";
  readonly adapterVersion = "1.0.0";
  readonly promptId = "throwing";
  readonly promptVersion = "1.0.0";

  async observe(): Promise<VisionObserverResult> {
    throw new Error("observer exploded");
  }

  async dispose(): Promise<void> {}
}

class TimeoutAwareAdapter implements VisionObserverAdapter {
  readonly adapterId = "timeout-aware-adapter";
  readonly adapterVersion = "1.0.0";
  readonly promptId = "timeout-aware";
  readonly promptVersion = "1.0.0";

  terminated = false;
  terminationWriteCompleted = false;
  terminationWriteError: Error | null = null;
  terminationMarkerPath: string | null = null;

  async observe(input: VisionObserverInput, signal: AbortSignal): Promise<VisionObserverResult> {
    return new Promise<VisionObserverResult>((_, reject) => {
      const finishTermination = async () => {
        try {
          await new Promise((resolve) => setTimeout(resolve, 25));
          this.terminationMarkerPath = join(input.workspaceDir, "termination-marker.txt");
          await writeFile(this.terminationMarkerPath, "terminated\n", "utf8");
          this.terminationWriteCompleted = true;
        } catch (error) {
          this.terminationWriteError = error instanceof Error ? error : new Error(String(error));
        } finally {
          this.terminated = true;
          reject(signal.reason instanceof Error ? signal.reason : new Error("observer aborted"));
        }
      };

      if (signal.aborted) {
        void finishTermination();
        return;
      }

      const onAbort = () => {
        signal.removeEventListener("abort", onAbort);
        void finishTermination();
      };

      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  async dispose(): Promise<void> {}
}

describe("observer lifecycle integration", () => {
  it("runs the async lifecycle with a padded OCR inspection region and cleanup", async () => {
    const sourceBytes = await solidPng(1000, 600);
    const sourceArtifactRef = writeSourceArtifact(sourceBytes);
    const adapter = new FakeVisionObserverAdapter();
    const result = await runVisionObserverLifecycle({
      scenarioId: "upper-title-band",
      sourceArtifactRef,
      sourceBytes,
      sourceMediaType: "image/png",
      sourceWidth: 1000,
      sourceHeight: 600,
      adapter,
    });

    expect(result.errorRecord).toBeNull();
    expect(result.run.cleanupCompleted).toBe(true);
    expect(result.run.adapterId).toBe(FAKE_OBSERVER_ID);
    expect(result.derivative?.overlaySha256).toBe(result.run.overlaySha256);
    expect(result.canonicalProposals).toHaveLength(1);
    expect(result.observerResult?.proposals).toHaveLength(1);
    expect(existsSync(result.workspaceDir)).toBe(false);

    const canonical = result.canonicalProposals[0]!;
    expect(canonical.ocrHandoff.sourceArtifactRef).toBe(sourceArtifactRef);
    expect(canonical.ocrHandoff.sourceArtifactRef).not.toBe(result.derivative?.sourceArtifactPath);
    expect(canonical.ocrHandoff.sourceArtifactRef).not.toBe(result.derivative?.overlayArtifactPath);
    expect(existsSync(canonical.ocrHandoff.sourceArtifactRef)).toBe(true);
    expect(readFileSync(canonical.ocrHandoff.sourceArtifactRef)).toEqual(Buffer.from(sourceBytes));
    expect(paddedBoxContains(canonical.ocrInspectionRegion, canonical.proposedRegion)).toBe(true);
    expect(canonical.ocrInspectionRegion.pixelBox.width).toBeGreaterThan(
      canonical.proposedRegion.pixelBox.width,
    );
  });

  it("proves A-B-A statelessness across proposals, canary values, run ids, and cleanup", async () => {
    const adapter = new RecordingAdapter();
    const sourceBytes = await solidPng(900, 600);
    const sourceArtifactRef = writeSourceArtifact(sourceBytes);

    const first = await runVisionObserverLifecycle({
      scenarioId: "aba-alpha",
      sourceArtifactRef,
      sourceBytes,
      sourceMediaType: "image/png",
      sourceWidth: 900,
      sourceHeight: 600,
      adapter,
    });
    const second = await runVisionObserverLifecycle({
      scenarioId: "aba-beta",
      sourceArtifactRef,
      sourceBytes,
      sourceMediaType: "image/png",
      sourceWidth: 900,
      sourceHeight: 600,
      adapter,
    });

    expect(first.observerResult?.proposals).toHaveLength(1);
    if (
      first.observerResult?.proposals[0] &&
      typeof first.observerResult.proposals[0] === "object"
    ) {
      (first.observerResult.proposals[0] as { description?: string }).description = "mutated";
    }

    const third = await runVisionObserverLifecycle({
      scenarioId: "aba-alpha",
      sourceArtifactRef,
      sourceBytes,
      sourceMediaType: "image/png",
      sourceWidth: 900,
      sourceHeight: 600,
      adapter,
    });

    expect(adapter.seenScenarioIds).toEqual(["aba-alpha", "aba-beta", "aba-alpha"]);
    expect(adapter.resetCalls).toBe(3);
    expect(
      new Set([first.run.observationRunId, second.run.observationRunId, third.run.observationRunId])
        .size,
    ).toBe(3);
    expect(new Set([first.workspaceDir, second.workspaceDir, third.workspaceDir]).size).toBe(3);
    expect(
      first.run.cleanupCompleted && second.run.cleanupCompleted && third.run.cleanupCompleted,
    ).toBe(true);
    expect(existsSync(first.workspaceDir)).toBe(false);
    expect(existsSync(second.workspaceDir)).toBe(false);
    expect(existsSync(third.workspaceDir)).toBe(false);
    expect(third.observerResult?.proposals[0]).toMatchObject({
      description: "Compact text-like cluster in the upper-right quadrant",
    });
  });

  it("cleans up after invalid observer output without yielding canonical proposals", async () => {
    const sourceBytes = await solidPng(500, 300);
    const result = await runVisionObserverLifecycle({
      scenarioId: "ignored",
      sourceArtifactRef: writeSourceArtifact(sourceBytes),
      sourceBytes,
      sourceMediaType: "image/png",
      sourceWidth: 500,
      sourceHeight: 300,
      adapter: new InvalidOutputAdapter(),
    });

    expect(result.errorRecord?.code).toBe("INVALID_OBSERVER_OUTPUT");
    expect(result.canonicalProposals).toEqual([]);
    expect(result.run.cleanupCompleted).toBe(true);
    expect(existsSync(result.workspaceDir)).toBe(false);
  });

  it("cleans up after derivative decode failure", async () => {
    const sourceBytes = Uint8Array.from([0, 1, 2, 3]);
    const result = await runVisionObserverLifecycle({
      scenarioId: "upper-title-band",
      sourceArtifactRef: writeSourceArtifact(sourceBytes, "invalid-source.bin"),
      sourceBytes,
      sourceMediaType: "image/png",
      sourceWidth: 100,
      sourceHeight: 100,
      adapter: new FakeVisionObserverAdapter(),
    });

    expect(result.errorRecord?.code).toBe("DERIVATIVE_DECODE_FAILED");
    expect(result.canonicalProposals).toEqual([]);
    expect(result.run.cleanupCompleted).toBe(true);
    expect(existsSync(result.workspaceDir)).toBe(false);
  });

  it("waits for adapter termination before cleanup on observer timeout", async () => {
    const adapter = new TimeoutAwareAdapter();
    const sourceBytes = await solidPng(500, 300);
    const result = await runVisionObserverLifecycle({
      scenarioId: "upper-title-band",
      sourceArtifactRef: writeSourceArtifact(sourceBytes),
      sourceBytes,
      sourceMediaType: "image/png",
      sourceWidth: 500,
      sourceHeight: 300,
      adapter,
      timeoutMs: 5,
    });

    expect(result.errorRecord?.code).toBe("OBSERVER_TIMEOUT");
    expect(result.canonicalProposals).toEqual([]);
    expect(adapter.terminated).toBe(true);
    expect(adapter.terminationWriteCompleted).toBe(true);
    expect(adapter.terminationWriteError).toBeNull();
    expect(adapter.terminationMarkerPath).not.toBeNull();
    expect(result.run.cleanupCompleted).toBe(true);
    expect(existsSync(result.workspaceDir)).toBe(false);
    expect(adapter.terminationMarkerPath && existsSync(adapter.terminationMarkerPath)).toBe(false);
  });

  it("cleans up after observer exceptions", async () => {
    const sourceBytes = await solidPng(500, 300);
    const result = await runVisionObserverLifecycle({
      scenarioId: "ignored",
      sourceArtifactRef: writeSourceArtifact(sourceBytes),
      sourceBytes,
      sourceMediaType: "image/png",
      sourceWidth: 500,
      sourceHeight: 300,
      adapter: new ThrowingAdapter(),
    });

    expect(result.errorRecord?.code).toBe("OBSERVER_EXCEPTION");
    expect(result.canonicalProposals).toEqual([]);
    expect(result.run.cleanupCompleted).toBe(true);
    expect(existsSync(result.workspaceDir)).toBe(false);
  });

  it("supports explicit adapter disposal after reuse", async () => {
    const adapter = new FakeVisionObserverAdapter();
    await adapter.dispose();
    await expect(
      adapter.observe(
        {
          observationRunId: "run-1",
          scenarioId: "upper-title-band",
          sourceArtifactRef: join(workspace(), "dispose-source.png"),
          workspaceDir: workspace(),
          overlayArtifactPath: join(workspace(), "overlay.png"),
          overlayMediaType: "image/png",
          overlaySha256: "a".repeat(64),
          overlayWidth: 10,
          overlayHeight: 10,
          sourceImageSha256: "b".repeat(64),
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/disposed/i);
  });
});
