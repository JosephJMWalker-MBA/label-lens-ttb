import { describe, expect, it } from "vitest";

import { CANONICAL_GOVERNMENT_WARNING } from "@/domain/rules/government-warning.rule";

import { selectGovernmentWarningObservation } from "./government-warning";
import type { RegionOcrResult } from "./extractor.types";

function pass(
  text: string,
  rotate: RegionOcrResult["transform"]["rotate"],
  regionName = rotate === 270 ? "left-edge-strip-rot270" : "full-image",
): RegionOcrResult {
  const tokens = text.split(/\s+/).filter(Boolean);
  return {
    passId: `pass-${rotate}-${regionName}`,
    regionName,
    passKind:
      rotate === 270
        ? "left-edge-strip-rot270"
        : rotate === 90
          ? "right-edge-strip-rot90"
          : "full-image-primary",
    triggerReasons:
      rotate === 0 ? ["primary-pass"] : ["alcohol-not-observed", "edge-text-heuristic"],
    preprocessing: rotate === 0 ? ["grayscale"] : ["crop:edge-strip", `rotate:${rotate}`],
    fieldEligibility: { brand: rotate === 0, alcohol: true },
    transform: {
      crop: { left: 0, top: 0, width: 1000, height: 1600 },
      rotate,
      scale: 1,
      originalWidth: 1000,
      originalHeight: 1600,
    },
    transformedSize: { width: 1000, height: 1600 },
    pageSegMode: 11,
    rawWordCount: tokens.length,
    discardedWordCount: 0,
    timings: { preprocessMs: 1, ocrMs: 1, inverseMappingMs: 1, totalMs: 3 },
    words: tokens.map((token, index) => ({
      text: token,
      rawConfidence: 92,
      bbox: { x0: index * 10, y0: 10, x1: index * 10 + 8, y1: 20 },
      originalGeometry: {
        imageIndex: 0,
        x: Math.min(980, index * 10),
        y: 10,
        width: 8,
        height: 10,
        imageWidth: 1000,
        imageHeight: 1600,
      },
    })),
  };
}

describe("government warning OCR selection", () => {
  it("selects an exact horizontal warning from the primary pass", () => {
    const observation = selectGovernmentWarningObservation("front", [
      pass(CANONICAL_GOVERNMENT_WARNING, 0),
    ]);
    expect(observation.evidenceState).toBe("observed");
    expect(observation.detectedOrientation).toBe(0);
    expect(observation.match.exactTextMatch).toBe(true);
    expect(observation.geometry).toBeDefined();
  });

  it("selects vertical edge warning evidence and preserves the source orientation", () => {
    const observation = selectGovernmentWarningObservation("back", [
      pass("M CELLARS 12.5% ALC", 0),
      pass(CANONICAL_GOVERNMENT_WARNING, 270),
    ]);
    expect(observation.evidenceState).toBe("observed");
    expect(observation.panelId).toBe("back");
    expect(observation.detectedOrientation).toBe(270);
    expect(observation.extractionProvenance?.passKind).toBe("left-edge-strip-rot270");
  });

  it("retains vertical raw provenance while anchoring comparison after unrelated crop text", () => {
    const observation = selectGovernmentWarningObservation("back", [
      pass(`BA ARTWORK TEXT ${CANONICAL_GOVERNMENT_WARNING}`, 270),
    ]);
    expect(observation.evidenceState).toBe("observed");
    expect(observation.detectedOrientation).toBe(270);
    expect(observation.rawTranscript).toMatch(/^BA ARTWORK TEXT GOVERNMENT WARNING/);
    expect(observation.anchoredTranscript).toBe(CANONICAL_GOVERNMENT_WARNING);
    expect(observation.match.exactTextMatch).toBe(true);
  });

  it("routes cropped warning evidence as partial, not as a pass or absence", () => {
    const observation = selectGovernmentWarningObservation("side", [
      pass("GOVERNMENT WARNING According to the Surgeon General pregnancy risk", 90),
    ]);
    expect(observation.evidenceState).toBe("partial");
    expect(observation.match.anchorFound).toBe(true);
  });

  it("returns not_observed when no anchors or distinctive phrases are present", () => {
    const observation = selectGovernmentWarningObservation("front", [pass("M CELLARS NAPA", 0)]);
    expect(observation.evidenceState).toBe("not_observed");
    expect(observation.rawTranscript).toBeNull();
  });
});
