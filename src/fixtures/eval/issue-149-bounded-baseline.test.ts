// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  BASELINE_CASES,
  deterministicArtifactPayload,
  cropPlanForCase,
  stableCaseProjection,
  type BaselineCaseRecord,
} from "./issue-149-bounded-baseline";

const image = { width: 900, height: 600 };

function record(overrides: Partial<BaselineCaseRecord> = {}): BaselineCaseRecord {
  return {
    caseId: "case-a",
    fieldType: "brandName",
    expectedSellerValue: "Minneapolis",
    panelId: "front",
    fixtureName: "synthetic",
    originalImage: { width: 900, height: 600, sha256: "abc" },
    normalizedSellerGeometry: {
      unit: "normalized-panel-relative",
      provenance: "seller-selected-region",
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
    },
    unpaddedPixelCrop: { left: 90, top: 120, width: 270, height: 240 },
    paddedPixelCrop: { left: 82, top: 113, width: 286, height: 254 },
    clippingApplied: false,
    cropWidth: 286,
    cropHeight: 254,
    paddingInPixels: { left: 8, top: 7, right: 8, bottom: 7 },
    scaleFactor: 3,
    finalOcrImageDimensions: { width: 858, height: 762 },
    preprocessingSteps: ["crop:seller-region", "grayscale", "normalise", "scale:3"],
    ocrEngine: {
      kind: "ocr",
      engineId: "tesseract.js",
      engineVersion: "7.0.0",
      modelId: "eng",
    },
    psmOrSegmentationMode: 11,
    orientationOrPass: "seller-region:rotate-0",
    rawBoundedOcrTranscript: "MINNEAPOLIS",
    normalizedBoundedTranscript: "minneapolis",
    boundedObservedValue: "MINNEAPOLIS",
    boundedNormalizedValue: "MINNEAPOLIS",
    ocrConfidence: 0.93,
    boundedReliabilityState: "RELIABLE",
    boundedReliabilityReason: "Bounded OCR is reliable enough for deterministic comparison.",
    independentFullPanelReading: "MINNEAPOLIS",
    fullPanelConfidence: 0.94,
    fullPanelState: "OBSERVED",
    finalComparisonOutcome: "AGREEMENT",
    latencyMs: { boundedOcr: 123.4, totalAnalysis: 456.7 },
    visualEvidence: {
      overlay: "crops/case-a-overlay.png",
      unpaddedCrop: "crops/case-a-unpadded.png",
      paddedCrop: "crops/case-a-padded.png",
      finalOcrInput: "crops/case-a-final-ocr-input.png",
      transcript: "transcripts/case-a.txt",
    },
    exactBoundedRead: true,
    normalizedBoundedRead: true,
    readableRegionHit: true,
    correctInsufficientEvidenceRouting: false,
    falseReliableRead: false,
    geometryMappingAccurate: true,
    primaryFailureTaxonomy: "CORRECT_READ",
    secondaryContributingFactors: [],
    recommendedFirstVariable: "padding",
    brandTypography: "clean typography",
    ...overrides,
  };
}

describe("Issue #149 bounded OCR baseline tooling", () => {
  it("maps normalized seller regions to deterministic pixel crops", () => {
    const plan = cropPlanForCase(
      {
        caseId: "deterministic",
        fieldType: "brandName",
        panelId: "front",
        selectedPixelRegion: { left: 90, top: 120, width: 270, height: 240 },
      },
      image,
    );

    expect(plan?.selectedRegionPixelGeometry).toEqual({
      left: 90,
      top: 120,
      width: 270,
      height: 240,
    });
    expect(plan?.crop).toEqual({ left: 82, top: 113, width: 286, height: 254 });
  });

  it("keeps saved crop coordinates aligned with extractor crop planning", () => {
    for (const definition of BASELINE_CASES) {
      const source =
        definition.source.kind === "synthetic"
          ? { width: definition.source.width, height: definition.source.height }
          : { width: 976, height: 1126 };
      const plan = cropPlanForCase(definition, source);
      const saved = {
        unpaddedPixelCrop: plan?.selectedRegionPixelGeometry,
        paddedPixelCrop: plan?.crop,
      };
      expect(saved.unpaddedPixelCrop).toEqual(plan?.selectedRegionPixelGeometry);
      expect(saved.paddedPixelCrop).toEqual(plan?.crop);
    }
  });

  it("records unpadded, padded, and final OCR dimensions", () => {
    const sample = record();
    expect(sample.unpaddedPixelCrop).toEqual({ left: 90, top: 120, width: 270, height: 240 });
    expect(sample.paddedPixelCrop).toEqual({ left: 82, top: 113, width: 286, height: 254 });
    expect(sample.finalOcrImageDimensions).toEqual({ width: 858, height: 762 });
  });

  it("preserves transcripts and confidence without alteration", () => {
    const sample = record({
      rawBoundedOcrTranscript: "MINNEAPOLIS",
      normalizedBoundedTranscript: "minneapolis",
      ocrConfidence: 0.934567,
    });
    const payload = deterministicArtifactPayload([sample]);
    expect(payload.cases[0]?.rawBoundedOcrTranscript).toBe("MINNEAPOLIS");
    expect(payload.cases[0]?.ocrConfidence).toBe(0.934567);
  });

  it("keeps failure classification deterministic", () => {
    const payload = deterministicArtifactPayload([
      record({ primaryFailureTaxonomy: "CORRECT_READ" }),
      record({
        caseId: "case-b",
        exactBoundedRead: false,
        normalizedBoundedRead: false,
        primaryFailureTaxonomy: "OCR_RECOGNITION_MISS",
      }),
    ]);
    expect(payload.metrics.brand.failureTaxonomyCounts).toEqual({
      CORRECT_READ: 1,
      OCR_RECOGNITION_MISS: 1,
    });
  });

  it("builds reproducible artifact payloads for stable records", () => {
    const first = JSON.stringify(stableCaseProjection(record()));
    const second = JSON.stringify(stableCaseProjection(record()));
    expect(first).toBe(second);
    expect(deterministicArtifactPayload([record()]).config.productionBehaviorChanged).toBe(false);
  });
});
