// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { runVisionRegionBenchmarkGeneration } from "./vision-region-benchmark.generation";
import {
  buildRefinementCropNormalizedBox,
  createVisionRegionRefinementDerivative,
} from "./vision-region-refinement-derivative";
import { resolveLocalVlmConfig } from "./vision-observer/local-vlm/llama-server-config";
import {
  cleanupDir,
  localVlmEnv,
  tempDir,
  writeFakeModel,
  writeFakeServerWrapper,
} from "./vision-observer/local-vlm/local-vlm-test-helpers";

const CLEANUP: string[] = [];

afterEach(() => {
  while (CLEANUP.length > 0) cleanupDir(CLEANUP.pop()!);
});

async function pngBytes() {
  return new Uint8Array(
    await sharp({
      create: {
        width: 200,
        height: 120,
        channels: 3,
        background: "#f4ead8",
      },
    })
      .png()
      .toBuffer(),
  );
}

describe("vision region refinement boundary", () => {
  it("derives the refinement crop from the coarse proposal rather than any governed truth box", async () => {
    const bytes = await pngBytes();
    const workspace = mkdtempSync(join(tmpdir(), "vision-region-refinement-unit-"));
    CLEANUP.push(workspace);

    const coarseGeometry = { x: 0.1, y: 0.2, width: 0.2, height: 0.1 };
    const unrelatedTruthBox = { x: 0.62, y: 0.64, width: 0.18, height: 0.1 };
    const crop = buildRefinementCropNormalizedBox({ coarseGeometry });
    expect(crop.ok).toBe(true);
    if (!crop.ok) return;

    const derivative = await createVisionRegionRefinementDerivative({
      sourceBytes: bytes,
      sourceMediaType: "image/png",
      expectedSourceWidth: 200,
      expectedSourceHeight: 120,
      coarseGeometry,
      workspaceDir: workspace,
    });
    expect(derivative.ok).toBe(true);
    if (!derivative.ok) return;

    expect(derivative.value.cropNormalizedBox).toEqual(crop.value);
    expect(derivative.value.cropNormalizedBox.x).not.toBe(unrelatedTruthBox.x);
    expect(derivative.value.cropNormalizedBox.y).not.toBe(unrelatedTruthBox.y);
  });

  it("runs refinement in a fresh workspace, process, and prompt context", async () => {
    const dir = tempDir();
    CLEANUP.push(dir);
    const executable = writeFakeServerWrapper(dir, { mode: "ok" });
    const model = writeFakeModel(dir);
    const resolved = await resolveLocalVlmConfig(
      localVlmEnv({
        executablePath: executable.path,
        executableSha256: executable.sha256,
        modelPath: model.path,
        modelSha256: model.sha256,
        runtimeKind: "fake-server",
        requestTimeoutMs: 1_000,
        startupTimeoutMs: 1_200,
        terminationTimeoutMs: 150,
      }),
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error("config failed");

    const bytes = await pngBytes();
    const runs = await runVisionRegionBenchmarkGeneration({
      config: resolved.value,
      caseRepetitions: 1,
      inputs: [
        {
          caseId: "synthetic-case",
          sourceArtifactRef: "eval-case:synthetic-case",
          sourceBytes: bytes,
          sourceMediaType: "image/png",
          sourceWidth: 200,
          sourceHeight: 120,
        },
      ],
    });

    expect(runs).toHaveLength(1);
    const run = runs[0]!;
    expect(run.coarseProposals).toHaveLength(1);
    expect(run.refinementStages).toHaveLength(1);

    const refinement = run.refinementStages[0]!;
    expect(run.coarseStage.observationRunId).not.toBe(refinement.stageRun.observationRunId);
    expect(run.coarseStage.workspaceRef).not.toBe(refinement.stageRun.workspaceRef);
    expect(run.coarseStage.process.pid).not.toBe(refinement.stageRun.process.pid);
    expect(run.coarseStage.promptId).toBe("slice2-strict-local-vlm-observer");
    expect(refinement.stageRun.promptId).toBe("slice3-vision-region-refinement");
    expect(refinement.stageRun.sourceArtifactRef).toContain("coarse-proposal:");
    expect(refinement.proposal).not.toBeNull();
  });
});
