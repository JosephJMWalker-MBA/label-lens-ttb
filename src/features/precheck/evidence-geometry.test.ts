import { describe, expect, it } from "vitest";

import type { EvidenceGeometry } from "@/pipeline/analyzer/analyzer.types";

import { hasUsableGeometry, overlayStyle } from "./evidence-geometry";

const frame = (over: Partial<EvidenceGeometry> = {}): EvidenceGeometry => ({
  imageIndex: 0,
  x: 100,
  y: 50,
  width: 200,
  height: 100,
  imageWidth: 1000,
  imageHeight: 500,
  ...over,
});

describe("overlayStyle — percentage positioning against the geometry frame", () => {
  it("converts server coordinates to percentages of the reference frame", () => {
    expect(overlayStyle(frame())).toEqual({
      left: "10%",
      top: "10%",
      width: "20%",
      height: "20%",
    });
  });

  it("is resolution-independent: the same box in a scaled frame yields the same percentages", () => {
    const doubled = frame({
      x: 200,
      y: 100,
      width: 400,
      height: 200,
      imageWidth: 2000,
      imageHeight: 1000,
    });
    expect(overlayStyle(doubled)).toEqual(overlayStyle(frame()));
  });

  it("clamps boxes that slightly overflow the frame so overlays never drift outside", () => {
    const s = overlayStyle(frame({ x: 900, width: 300 })); // right edge = 120%
    expect(s.left).toBe("90%");
    expect(s.width).toBe("10%");
    const t = overlayStyle(frame({ x: -50, width: 100 })); // left edge = -5%
    expect(t.left).toBe("0%");
    expect(t.width).toBe("5%");
  });
});

describe("hasUsableGeometry — honest absence", () => {
  it("rejects missing geometry and degenerate frames", () => {
    expect(hasUsableGeometry(undefined)).toBe(false);
    expect(hasUsableGeometry(null)).toBe(false);
    expect(hasUsableGeometry(frame({ imageWidth: 0 }))).toBe(false);
    expect(hasUsableGeometry(frame({ height: 0 }))).toBe(false);
  });

  it("accepts a normal region", () => {
    expect(hasUsableGeometry(frame())).toBe(true);
  });
});
