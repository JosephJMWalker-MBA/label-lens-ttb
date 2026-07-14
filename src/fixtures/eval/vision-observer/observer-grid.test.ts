// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

import {
  DEFAULT_GRID_SPEC,
  DEFAULT_REFINEMENT_GRID_SPEC,
  expandGridCellRange,
  parseGridCellRange,
  parseRefinementCellRange,
} from "./observer-grid";
import { adaptObserverProposal } from "./observer-adapter";
import { createObserverDerivative } from "./observer-grid-renderer";
import {
  applyHaloToRegion,
  buildHaloPolicy,
  gridCellRangeToNormalizedBox,
  mapObservationPixelBoxToOriginalFrame,
  mapOriginalPixelBoxToObservationFrame,
  mapProposalToOriginalRegion,
  normalizedBoxContains,
  normalizedBoxToGridCellRange,
  normalizedBoxToRefinementRange,
  refinementRangeToNormalizedBox,
} from "./observer-grid-transform";
import {
  validateGridSpec,
  validateNormalizedBox,
  validateObserverDerivative,
  validateObserverRegionProposal,
} from "./observer-grid.schema";
import { guardOcrInspectionHandoff, guardObserverDerivativeContract } from "./observer-guards";
import type { ObserverRegionProposal, PixelBox } from "./observer-grid.types";

const CLEANUP: string[] = [];

afterAll(() => {
  while (CLEANUP.length > 0) {
    rmSync(CLEANUP.pop()!, { recursive: true, force: true });
  }
});

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), "vision-observer-test-"));
  CLEANUP.push(dir);
  return dir;
}

function writeSourceArtifact(sourceBytes: Uint8Array, filename = "source.png") {
  const path = join(workspace(), filename);
  writeFileSync(path, Buffer.from(sourceBytes));
  return path;
}

async function solidPng(width: number, height: number, color = "#dde4f7") {
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

function makeProposal(overrides: Partial<ObserverRegionProposal> = {}): ObserverRegionProposal {
  return {
    observationId: "observation-1",
    proposalId: "proposal-1",
    observationType: "text-like-region",
    source: "machine-observer",
    authority: "non-authoritative",
    purpose: "ocr-region-proposal",
    gridRange: parseGridCellRange("H3:J7"),
    localRefinement: null,
    observationRotation: 0,
    apparentOrientation: "horizontal",
    visibility: "partial",
    reasonCodes: ["dense_text", "high_salience"],
    description: "Compact text-like cluster near the upper-right quadrant",
    ...overrides,
  };
}

function expectPixelBox(actual: PixelBox, expected: PixelBox) {
  expect(actual).toEqual(expected);
}

describe("observer grid schema and range helpers", () => {
  it("accepts the default v1 coarse and refinement specifications", () => {
    expect(validateGridSpec(DEFAULT_GRID_SPEC).ok).toBe(true);
    expect(DEFAULT_REFINEMENT_GRID_SPEC.columns).toBe(5);
    expect(DEFAULT_REFINEMENT_GRID_SPEC.rows).toBe(5);
  });

  it("normalizes and expands inclusive coarse cell ranges deterministically", () => {
    const range = parseGridCellRange("C4:A2");
    expect(range.notation).toBe("A2:C4");
    expect(expandGridCellRange(range).map((cell) => cell.id)).toEqual([
      "A2",
      "B2",
      "C2",
      "A3",
      "B3",
      "C3",
      "A4",
      "B4",
      "C4",
    ]);
  });

  it("maps A1, J10, and H3:J7 into the expected normalized coordinates", () => {
    expect(gridCellRangeToNormalizedBox(parseGridCellRange("A1"))).toEqual({
      x: 0,
      y: 0,
      width: 0.1,
      height: 0.1,
    });
    expect(gridCellRangeToNormalizedBox(parseGridCellRange("J10"))).toEqual({
      x: 0.9,
      y: 0.9,
      width: 0.1,
      height: 0.1,
    });
    expect(gridCellRangeToNormalizedBox(parseGridCellRange("H3:J7"))).toEqual({
      x: 0.7,
      y: 0.2,
      width: 0.3,
      height: 0.5,
    });
  });

  it("rejects malformed coarse cells and malformed normalized geometry", () => {
    expect(() => parseGridCellRange("K1")).toThrow(/invalid coarse grid cell/i);
    expect(validateNormalizedBox({ x: -0.1, y: 0, width: 0.2, height: 0.2 }).ok).toBe(false);
    expect(validateNormalizedBox({ x: 0.9, y: 0, width: 0.2, height: 0.2 }).ok).toBe(false);
    expect(validateNormalizedBox({ x: 0, y: 0, width: 0, height: 0.2 }).ok).toBe(false);
    expect(validateNormalizedBox({ x: Number.NaN, y: 0, width: 0.2, height: 0.2 }).ok).toBe(false);
  });
});

describe("observer geometry transforms", () => {
  it("projects normalized boxes to coarse ranges and preserves containment", () => {
    const box = { x: 0.18, y: 0.31, width: 0.27, height: 0.11 };
    const range = normalizedBoxToGridCellRange(box, DEFAULT_GRID_SPEC);
    expect(range.ok).toBe(true);
    if (!range.ok) return;
    expect(range.value.notation).toBe("B4:E5");
    expect(normalizedBoxContains(gridCellRangeToNormalizedBox(range.value), box)).toBe(true);
  });

  it("maps coarse and refined regions into square and non-square pixel boxes", () => {
    const square = mapProposalToOriginalRegion({
      gridRange: parseGridCellRange("A1"),
      localRefinement: null,
      observationRotation: 0,
      sourceImageWidth: 1000,
      sourceImageHeight: 1000,
    });
    expect(square.ok).toBe(true);
    if (!square.ok) return;
    expectPixelBox(square.value.pixelBox, {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      imageWidth: 1000,
      imageHeight: 1000,
    });

    const nonSquare = mapProposalToOriginalRegion({
      gridRange: parseGridCellRange("H3:J7"),
      localRefinement: null,
      observationRotation: 0,
      sourceImageWidth: 1000,
      sourceImageHeight: 500,
    });
    expect(nonSquare.ok).toBe(true);
    if (!nonSquare.ok) return;
    expectPixelBox(nonSquare.value.pixelBox, {
      x: 700,
      y: 100,
      width: 300,
      height: 250,
      imageWidth: 1000,
      imageHeight: 500,
    });

    const refined = mapProposalToOriginalRegion({
      gridRange: parseGridCellRange("B2:C3"),
      localRefinement: {
        gridSpec: DEFAULT_REFINEMENT_GRID_SPEC,
        range: parseRefinementCellRange("B2:D4"),
      },
      observationRotation: 0,
      sourceImageWidth: 1000,
      sourceImageHeight: 500,
    });
    expect(refined.ok).toBe(true);
    if (!refined.ok) return;
    expect(refined.value.normalizedBox).toEqual({
      x: 0.14,
      y: 0.14,
      width: 0.12,
      height: 0.12,
    });
    expectPixelBox(refined.value.pixelBox, {
      x: 140,
      y: 70,
      width: 120,
      height: 60,
      imageWidth: 1000,
      imageHeight: 500,
    });
  });

  it("round-trips refinement ranges within their coarse proposal", () => {
    const refinedBox = refinementRangeToNormalizedBox(
      parseGridCellRange("B2:C3"),
      parseRefinementCellRange("B2:D4"),
    );
    const roundTrip = normalizedBoxToRefinementRange({
      box: refinedBox,
      coarseRange: parseGridCellRange("B2:C3"),
    });
    expect(roundTrip.ok).toBe(true);
    expect(roundTrip.ok && roundTrip.value.notation).toBe("B2:D4");
  });

  it("round-trips pixel boxes through all supported observation rotations", () => {
    const original: PixelBox = {
      x: 120,
      y: 80,
      width: 220,
      height: 90,
      imageWidth: 1000,
      imageHeight: 500,
    };

    for (const rotation of [0, 90, 180, 270] as const) {
      const observed = mapOriginalPixelBoxToObservationFrame(original, rotation);
      const roundTrip = mapObservationPixelBoxToOriginalFrame(
        observed,
        rotation,
        original.imageWidth,
        original.imageHeight,
      );
      expect(roundTrip).toEqual(original);
    }
  });

  it("maps rotated observation-frame proposals back into the original frame", () => {
    const expectedByRotation = {
      0: { x: 700, y: 100, width: 300, height: 250 },
      90: { x: 200, y: 0, width: 500, height: 150 },
      180: { x: 0, y: 150, width: 300, height: 250 },
      270: { x: 300, y: 350, width: 500, height: 150 },
    } as const;

    for (const rotation of [0, 90, 180, 270] as const) {
      const result = mapProposalToOriginalRegion({
        gridRange: parseGridCellRange("H3:J7"),
        localRefinement: null,
        observationRotation: rotation,
        sourceImageWidth: 1000,
        sourceImageHeight: 500,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.pixelBox).toMatchObject({
        ...expectedByRotation[rotation],
        imageWidth: 1000,
        imageHeight: 500,
      });
    }
  });

  it("clamps halo padding only at image edges and preserves requested versus actual padding", () => {
    const proposedRegion = {
      normalizedBox: { x: 0, y: 0, width: 1, height: 1 },
      pixelBox: { x: 0, y: 0, width: 1000, height: 500, imageWidth: 1000, imageHeight: 500 },
    };
    const haloPolicy = buildHaloPolicy(proposedRegion.normalizedBox);
    expect(haloPolicy.paddingPolicyId).toBe("observer-grid-halo.v1");
    expect(haloPolicy.requestedPadding.top).toBeGreaterThan(0);
    expect(haloPolicy.actualPadding).toEqual({
      unit: "normalized",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      clampToImage: true,
    });

    const applied = applyHaloToRegion(proposedRegion);
    expect(applied.inspectionRegion.normalizedBox).toEqual(proposedRegion.normalizedBox);
  });
});

describe("observer derivative rendering and source-overlay guards", () => {
  it("renders deterministic raster overlays with distinct source and overlay digests", async () => {
    const input = await solidPng(320, 160);
    const originalInput = Uint8Array.from(input);
    const first = await createObserverDerivative({
      sourceBytes: input,
      sourceMediaType: "image/png",
      expectedSourceWidth: 320,
      expectedSourceHeight: 160,
      workspaceDir: workspace(),
    });
    const second = await createObserverDerivative({
      sourceBytes: input,
      sourceMediaType: "image/png",
      expectedSourceWidth: 320,
      expectedSourceHeight: 160,
      workspaceDir: workspace(),
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.value.overlaySha256).toBe(second.value.overlaySha256);
    expect(Buffer.from(first.value.bytes)).toEqual(Buffer.from(second.value.bytes));
    expect(first.value.sourceSha256).not.toBe(first.value.overlaySha256);
    expect(first.value.sourceArtifactPath).not.toBe(first.value.overlayArtifactPath);
    expect(readFileSync(first.value.sourceArtifactPath)).toEqual(Buffer.from(originalInput));
    expect(input).toEqual(originalInput);

    const metadata = await sharp(Buffer.from(first.value.bytes)).metadata();
    expect(metadata.width).toBe(320);
    expect(metadata.height).toBe(160);
    expect(validateObserverDerivative(first.value).ok).toBe(true);
    expect(guardObserverDerivativeContract(first.value).ok).toBe(true);
  });

  it("rejects invalid source bytes and supplied source dimension mismatches", async () => {
    const badBytes = await createObserverDerivative({
      sourceBytes: Uint8Array.from([0, 1, 2, 3]),
      sourceMediaType: "image/png",
      expectedSourceWidth: 100,
      expectedSourceHeight: 100,
      workspaceDir: workspace(),
    });
    expect(badBytes.ok).toBe(false);

    const validBytes = await solidPng(120, 90);
    const mismatched = await createObserverDerivative({
      sourceBytes: validBytes,
      sourceMediaType: "image/png",
      expectedSourceWidth: 121,
      expectedSourceHeight: 90,
      workspaceDir: workspace(),
    });
    expect(mismatched.ok).toBe(false);
  });
});

describe("adapter and authority guards", () => {
  it("adapts proposals into distinct proposed and OCR inspection regions", async () => {
    const sourceBytes = await solidPng(1000, 500);
    const derivative = await createObserverDerivative({
      sourceBytes,
      sourceMediaType: "image/png",
      expectedSourceWidth: 1000,
      expectedSourceHeight: 500,
      workspaceDir: workspace(),
    });
    expect(derivative.ok).toBe(true);
    if (!derivative.ok) return;

    const adapted = adaptObserverProposal({
      derivative: derivative.value,
      proposal: makeProposal(),
      sourceArtifactRef: writeSourceArtifact(sourceBytes),
    });
    expect(adapted.ok).toBe(true);
    if (!adapted.ok) return;

    expect(adapted.value.proposedRegion.normalizedBox).toEqual({
      x: 0.7,
      y: 0.2,
      width: 0.3,
      height: 0.5,
    });
    expect(adapted.value.ocrInspectionRegion.normalizedBox.width).toBeGreaterThan(
      adapted.value.proposedRegion.normalizedBox.width,
    );
    expect(adapted.value.ocrHandoff.sourceArtifactRef).not.toBe(
      derivative.value.sourceArtifactPath,
    );
    expect(adapted.value.ocrHandoff.sourceImageSha256).toBe(derivative.value.sourceSha256);
    expect(adapted.value.ocrHandoff.overlayArtifactPathRejected).toBe(
      derivative.value.overlayArtifactPath,
    );
    expect(
      guardOcrInspectionHandoff({
        handoff: adapted.value.ocrHandoff,
        derivative: derivative.value,
        inspectionPixelBox: adapted.value.ocrInspectionRegion.pixelBox,
        expectedSourceArtifactRef: adapted.value.ocrHandoff.sourceArtifactRef,
      }).ok,
    ).toBe(true);
  });

  it("rejects OCR handoffs that try to reuse the overlay artifact, digest, or workspace source copy", async () => {
    const sourceBytes = await solidPng(400, 200);
    const derivative = await createObserverDerivative({
      sourceBytes,
      sourceMediaType: "image/png",
      expectedSourceWidth: 400,
      expectedSourceHeight: 200,
      workspaceDir: workspace(),
    });
    expect(derivative.ok).toBe(true);
    if (!derivative.ok) return;

    const adapted = adaptObserverProposal({
      derivative: derivative.value,
      proposal: makeProposal({ gridRange: parseGridCellRange("A1") }),
      sourceArtifactRef: writeSourceArtifact(sourceBytes),
    });
    expect(adapted.ok).toBe(true);
    if (!adapted.ok) return;

    const rejected = guardOcrInspectionHandoff({
      handoff: {
        ...adapted.value.ocrHandoff,
        sourceArtifactRef: derivative.value.overlayArtifactPath,
        sourceImageSha256: derivative.value.overlaySha256,
      },
      derivative: derivative.value,
      inspectionPixelBox: adapted.value.ocrInspectionRegion.pixelBox,
      expectedSourceArtifactRef: adapted.value.ocrHandoff.sourceArtifactRef,
    });
    expect(rejected.ok).toBe(false);

    const workspaceSourceRejected = guardOcrInspectionHandoff({
      handoff: {
        ...adapted.value.ocrHandoff,
        sourceArtifactRef: derivative.value.sourceArtifactPath,
      },
      derivative: derivative.value,
      inspectionPixelBox: adapted.value.ocrInspectionRegion.pixelBox,
      expectedSourceArtifactRef: derivative.value.sourceArtifactPath,
    });
    expect(workspaceSourceRejected.ok).toBe(false);
  });

  it("rejects prohibited descriptions and human/regulatory authority claims at runtime", () => {
    expect(
      validateObserverRegionProposal(
        makeProposal({ description: "Approved brand text: Chateau Example" }),
      ).ok,
    ).toBe(false);
    expect(
      validateObserverRegionProposal({
        ...makeProposal(),
        authority: "human-confirmed",
      }).ok,
    ).toBe(false);
    expect(
      validateObserverRegionProposal({
        ...makeProposal(),
        purpose: "submitted-evidence",
      }).ok,
    ).toBe(false);
  });
});

const compileTimeProposal = makeProposal();

const invalidAuthorityProposal: ObserverRegionProposal = {
  ...compileTimeProposal,
  // @ts-expect-error machine proposals cannot claim human-created authority
  authority: "human-created",
};

const invalidPurposeProposal: ObserverRegionProposal = {
  ...compileTimeProposal,
  // @ts-expect-error machine proposals cannot serialize as submitted evidence
  purpose: "submitted-evidence",
};

void invalidAuthorityProposal;
void invalidPurposeProposal;
