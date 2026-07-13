import { describe, expect, it } from "vitest";

import type { RegionTransform } from "./extractor.types";
import { mapBoxToOriginalGeometry, unionGeometry } from "./geometry";

describe("mapBoxToOriginalGeometry", () => {
  it("maps an unrotated scaled crop back to original coordinates", () => {
    const t: RegionTransform = {
      crop: { left: 10, top: 20, width: 400, height: 300 },
      rotate: 0,
      scale: 2,
      originalWidth: 500,
      originalHeight: 400,
    };
    const g = mapBoxToOriginalGeometry({ x0: 20, y0: 40, x1: 120, y1: 100 }, t);
    if (!g) throw new Error("expected mapped geometry");
    expect(g).toMatchObject({
      x: 20,
      y: 40,
      width: 50,
      height: 30,
      imageWidth: 500,
      imageHeight: 400,
    });
  });

  it("maps a 90° clockwise-rotated crop back to original coordinates", () => {
    const t: RegionTransform = {
      crop: { left: 100, top: 0, width: 60, height: 1000 },
      rotate: 90,
      scale: 2,
      originalWidth: 500,
      originalHeight: 1000,
    };
    const g = mapBoxToOriginalGeometry({ x0: 400, y0: 20, x1: 600, y1: 60 }, t);
    if (!g) throw new Error("expected mapped geometry");
    expect(g).toMatchObject({ x: 110, y: 700, width: 20, height: 100 });
  });

  it("maps a 270° rotated crop back to original coordinates", () => {
    const t: RegionTransform = {
      crop: { left: 0, top: 0, width: 60, height: 1000 },
      rotate: 270,
      scale: 1,
      originalWidth: 500,
      originalHeight: 1000,
    };
    const g = mapBoxToOriginalGeometry({ x0: 100, y0: 5, x1: 300, y1: 25 }, t);
    if (!g) throw new Error("expected mapped geometry");
    expect(g).toMatchObject({ x: 35, y: 100, width: 20, height: 200 });
  });

  it("maps a 180° rotated crop back to original coordinates", () => {
    const t: RegionTransform = {
      crop: { left: 50, top: 40, width: 100, height: 80 },
      rotate: 180,
      scale: 2,
      originalWidth: 300,
      originalHeight: 200,
    };
    const g = mapBoxToOriginalGeometry({ x0: 20, y0: 40, x1: 120, y1: 100 }, t);
    if (!g) throw new Error("expected mapped geometry");
    expect(g).toMatchObject({ x: 90, y: 70, width: 50, height: 30 });
  });

  it("keeps geometry within the original frame with positive area", () => {
    const t: RegionTransform = {
      crop: { left: 0, top: 0, width: 100, height: 100 },
      rotate: 0,
      scale: 1,
      originalWidth: 100,
      originalHeight: 100,
    };
    const g = mapBoxToOriginalGeometry({ x0: 98, y0: 98, x1: 99, y1: 99 }, t);
    if (!g) throw new Error("expected mapped geometry");
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.width).toBeGreaterThanOrEqual(1);
    expect(g.x + g.width).toBeLessThanOrEqual(100);
  });

  it("rejects degenerate mapped boxes instead of forcing a fake area", () => {
    const t: RegionTransform = {
      crop: { left: 0, top: 0, width: 100, height: 100 },
      rotate: 0,
      scale: 1,
      originalWidth: 100,
      originalHeight: 100,
    };
    expect(mapBoxToOriginalGeometry({ x0: 10, y0: 10, x1: 10, y1: 20 }, t)).toBeNull();
  });
});

describe("unionGeometry", () => {
  it("bounds several boxes in the same frame", () => {
    const frame = { imageIndex: 0, imageWidth: 500, imageHeight: 500 };
    const g = unionGeometry([
      { ...frame, x: 10, y: 10, width: 20, height: 20 },
      { ...frame, x: 40, y: 5, width: 10, height: 30 },
    ]);
    expect(g).toMatchObject({ x: 10, y: 5, width: 40, height: 30 });
  });
});
