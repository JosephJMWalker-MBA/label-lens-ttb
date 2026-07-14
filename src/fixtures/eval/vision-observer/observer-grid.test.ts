// @vitest-environment node
import { describe, expect, it } from "vitest";

import { DEFAULT_GRID_SPEC, expandGridCellRange, parseGridCellRange } from "./observer-grid";
import { adaptObserverProposal } from "./observer-adapter";
import { fakeObserveField } from "./fake-observer-adapter";
import { createObserverDerivative } from "./observer-grid-renderer";
import {
  gridCellRangeToNormalizedBox,
  gridCellRangeToPixelBox,
  normalizedBoxContains,
  normalizedBoxToGridCellRange,
  normalizedIntersectionArea,
  unionNormalizedBoxes,
  ZERO_PADDING,
} from "./observer-grid-transform";
import {
  validateGridCellRange,
  validateGridSpec,
  validateObserverDerivative,
  validateObserverRegionProposal,
} from "./observer-grid.schema";
import { guardObserverDerivativeContract } from "./observer-guards";

describe("observer grid schema and range helpers", () => {
  it("accepts the default v1 grid specification", () => {
    const validated = validateGridSpec(DEFAULT_GRID_SPEC);
    expect(validated.ok).toBe(true);
  });

  it("normalizes and expands inclusive cell ranges deterministically", () => {
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
    expect(validateGridCellRange(range).ok).toBe(true);
  });
});

describe("observer grid transforms", () => {
  it("maps normalized boxes to inclusive cell ranges and back without losing containment", () => {
    const truth = { x: 0.18, y: 0.31, width: 0.27, height: 0.11 };
    const range = normalizedBoxToGridCellRange(truth, DEFAULT_GRID_SPEC);
    expect(range.notation).toBe("B4:E5");
    const canonical = gridCellRangeToNormalizedBox(range, DEFAULT_GRID_SPEC);
    expect(normalizedBoxContains(canonical, truth)).toBe(true);
  });

  it("maps inclusive grid ranges into bounded pixel boxes", () => {
    const pixelBox = gridCellRangeToPixelBox(
      parseGridCellRange("B2:D4"),
      1000,
      500,
      DEFAULT_GRID_SPEC,
      ZERO_PADDING,
    );
    expect(pixelBox).toEqual({
      x: 100,
      y: 50,
      width: 300,
      height: 150,
      imageWidth: 1000,
      imageHeight: 500,
    });
  });

  it("unions multiple truth boxes before projecting them to the grid", () => {
    const union = unionNormalizedBoxes([
      { x: 0.2, y: 0.2, width: 0.1, height: 0.1 },
      { x: 0.35, y: 0.28, width: 0.08, height: 0.12 },
    ]);
    expect(union.x).toBeCloseTo(0.2);
    expect(union.y).toBeCloseTo(0.2);
    expect(union.width).toBeCloseTo(0.23);
    expect(union.height).toBeCloseTo(0.2);
  });
});

describe("observer derivative rendering and guards", () => {
  it("renders the same gridded SVG derivative for the same source bytes", () => {
    const sourceBytes = Uint8Array.from([0, 1, 2, 3, 4, 5]);
    const first = createObserverDerivative({
      sourceBytes,
      sourceMediaType: "image/png",
      sourceWidth: 200,
      sourceHeight: 100,
    });
    const second = createObserverDerivative({
      sourceBytes,
      sourceMediaType: "image/png",
      sourceWidth: 200,
      sourceHeight: 100,
    });

    expect(first.svg).toBe(second.svg);
    expect(first.width).toBe(200);
    expect(first.height).toBe(100);
    expect(first.transform.sourceImageWidth).toBe(200);
    expect(first.transform.derivativeImageWidth).toBe(200);
    expect(validateObserverDerivative(first).ok).toBe(true);
    expect(guardObserverDerivativeContract(first).ok).toBe(true);
  });

  it("rejects a derivative that changes the source aspect ratio", () => {
    const derivative = createObserverDerivative({
      sourceBytes: Uint8Array.from([9, 9, 9]),
      sourceMediaType: "image/png",
      sourceWidth: 300,
      sourceHeight: 150,
    });
    const broken = {
      ...derivative,
      transform: { ...derivative.transform, derivativeAspectRatio: 3 },
    };
    const guarded = guardObserverDerivativeContract(broken);
    expect(guarded.ok).toBe(false);
  });
});

describe("fake observer and adapter", () => {
  it("emits deterministic, text-free region proposals", () => {
    const proposal = fakeObserveField({
      caseId: "case-1",
      field: "brand",
      truthGeometry: [{ x: 0.21, y: 0.18, width: 0.14, height: 0.09 }],
    });

    expect(proposal).not.toBeNull();
    expect(proposal!.gridRange.notation).toBe("C2:D3");
    expect(validateObserverRegionProposal(proposal).ok).toBe(true);
    expect("text" in proposal!).toBe(false);
  });

  it("adapts a proposal back into canonical normalized and pixel coordinates", () => {
    const derivative = createObserverDerivative({
      sourceBytes: Uint8Array.from([1, 2, 3]),
      sourceMediaType: "image/jpeg",
      sourceWidth: 1000,
      sourceHeight: 600,
    });
    const proposal = fakeObserveField({
      caseId: "case-2",
      field: "alcohol",
      truthGeometry: [{ x: 0.66, y: 0.72, width: 0.11, height: 0.08 }],
    });
    const adapted = adaptObserverProposal({ derivative, proposal: proposal! });

    expect(adapted.ok).toBe(true);
    expect(adapted.ok && adapted.value.gridRange.notation).toBe("G8:H8");
    expect(adapted.ok && adapted.value.pixelBox).toEqual({
      x: 600,
      y: 420,
      width: 200,
      height: 60,
      imageWidth: 1000,
      imageHeight: 600,
    });
    expect(
      adapted.ok &&
        normalizedIntersectionArea(adapted.value.normalizedBox, {
          x: 0.66,
          y: 0.72,
          width: 0.11,
          height: 0.08,
        }) > 0,
    ).toBe(true);
  });
});
