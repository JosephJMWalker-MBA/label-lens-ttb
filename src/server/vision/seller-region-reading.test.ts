// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type {
  SellerRegionMachineReading,
  SellerRegionOcrTarget,
} from "@/pipeline/extractor/extractor.types";

import type { VisionConfig } from "./config";
import type { VisionTranscription, VisionTranscriptionResult } from "./region-transcription";
import {
  readSellerRegionsWithVision,
  sellerRegionReadingFromTranscription,
} from "./seller-region-reading";

const CONFIG = { model: "m" } as VisionConfig;

function target(
  categoryId: SellerRegionOcrTarget["categoryId"],
  regionId = `r-${categoryId}`,
): SellerRegionOcrTarget {
  return {
    categoryId,
    regionId,
    panelId: "front",
    region: {
      unit: "normalized-panel-relative",
      provenance: "seller-selected-region",
      x: 0.1,
      y: 0.1,
      width: 0.5,
      height: 0.2,
    },
  };
}

function transcription(
  lines: string[],
  legibility: VisionTranscription["legibility"] = "clear",
): VisionTranscription {
  return {
    lines,
    legibility,
    provenance: {
      reader: "vision-llm",
      hostLabel: "orin-01",
      configuredModel: "m",
      servedModel: null,
      promptId: "p",
      promptVersion: "1.0.0",
      promptSha256: "a".repeat(64),
      structuredOutput: "json_schema",
      sentImageSha256: "b".repeat(64),
      sentImageSize: { width: 500, height: 160 },
      responseSha256: "c".repeat(64),
      latencyMs: 900,
      promptTokens: 300,
      completionTokens: 10,
    },
  };
}

function map(categoryId: SellerRegionOcrTarget["categoryId"], value: VisionTranscription) {
  const reading = sellerRegionReadingFromTranscription({
    target: target(categoryId),
    imageWidth: 1000,
    imageHeight: 800,
    transcription: value,
    processedAt: "2026-11-03T00:00:00.000Z",
  });
  if (!reading) throw new Error("expected a reading");
  return reading;
}

describe("sellerRegionReadingFromTranscription", () => {
  it("uses the full region transcript as the brand observation", () => {
    const reading = map("brandName", transcription(["CEDAR", "RIDGE"]));
    expect(reading).toMatchObject({
      observedValue: "CEDAR RIDGE",
      evidenceState: "OBSERVED",
      reliabilityState: "RELIABLE",
      reader: "vision-llm",
      passProvenance: null,
    });
    expect(reading.ocrEvidenceScore).toBeGreaterThanOrEqual(0.8);
    expect(reading.visionRead?.lines).toEqual(["CEDAR", "RIDGE"]);
    expect(reading.extractionProvenance.extractionAdapterId).toBe("private-vision-region-reader");
  });

  it("marks a partial reading low-confidence and below the comparison floor", () => {
    const reading = map("brandName", transcription(["CEDAR RI"], "partial"));
    expect(reading.evidenceState).toBe("LOW_CONFIDENCE");
    expect(reading.ocrEvidenceScore).toBeLessThan(0.8);
    expect(reading.reliabilityState).toBe("UNRELIABLE");
  });

  it("extracts an alcohol statement only when the deterministic parser accepts it", () => {
    expect(
      map("alcoholStatement", transcription(["750 ML", "13.5% ALC./VOL."])).observedValue,
    ).toBe("13.5% ALC./VOL.");
    expect(map("alcoholStatement", transcription(["ALC. 13.5%", "BY VOL."])).observedValue).toBe(
      "ALC. 13.5% BY VOL.",
    );
    const prose = map("alcoholStatement", transcription(["Aged in French oak"]));
    expect(prose).toMatchObject({ observedValue: null, evidenceState: "UNREADABLE" });
    expect(prose.rawTranscript).toBe("Aged in French oak");
  });

  it("reports an empty region as not observed", () => {
    expect(map("brandName", transcription([], "illegible"))).toMatchObject({
      observedValue: null,
      evidenceState: "NOT_OBSERVED",
      ocrEvidenceScore: 0,
    });
  });
});

describe("readSellerRegionsWithVision", () => {
  const localReading = (regionId: string): SellerRegionMachineReading =>
    ({
      categoryId: "brandName",
      regionId,
      panelId: "front",
      observedValue: "CEDAR RIOGE",
      evidenceState: "LOW_CONFIDENCE",
    }) as SellerRegionMachineReading;

  it("prefers vision readings and keeps local OCR when a region fails", async () => {
    const transcribe = vi
      .fn<(...args: unknown[]) => Promise<VisionTranscriptionResult>>()
      .mockResolvedValueOnce({ ok: true, value: transcription(["CEDAR RIDGE"]) })
      .mockResolvedValueOnce({ ok: false, code: "UNPARSEABLE_RESPONSE", message: "no" });

    const { readings, summary } = await readSellerRegionsWithVision({
      config: CONFIG,
      imageBytes: new Uint8Array(),
      imageWidth: 1000,
      imageHeight: 800,
      targets: [target("brandName", "a"), target("brandName", "b")],
      localReadings: [localReading("a"), localReading("b")],
      processedAt: "2026-11-03T00:00:00.000Z",
      transcribe: transcribe as never,
    });

    expect(readings.map((reading) => reading.reader)).toEqual(["vision-llm", "local-ocr"]);
    expect(readings[1].visionFallback).toEqual({ code: "UNPARSEABLE_RESPONSE", message: "no" });
    expect(summary).toEqual({ attempted: 2, read: 1, fellBack: 1, hostUnavailable: false });
  });

  it("stops calling an unreachable host after the first failure", async () => {
    const transcribe = vi
      .fn<(...args: unknown[]) => Promise<VisionTranscriptionResult>>()
      .mockResolvedValue({ ok: false, code: "TIMEOUT", message: "slow" });

    const { readings, summary } = await readSellerRegionsWithVision({
      config: CONFIG,
      imageBytes: new Uint8Array(),
      imageWidth: 1000,
      imageHeight: 800,
      targets: [target("brandName", "a"), target("alcoholStatement", "b")],
      localReadings: [localReading("a"), { ...localReading("b"), categoryId: "alcoholStatement" }],
      processedAt: "2026-11-03T00:00:00.000Z",
      transcribe: transcribe as never,
    });

    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(readings.every((reading) => reading.reader === "local-ocr")).toBe(true);
    expect(readings[1].visionFallback?.code).toBe("HOST_UNAVAILABLE");
    expect(summary.hostUnavailable).toBe(true);
  });
});
