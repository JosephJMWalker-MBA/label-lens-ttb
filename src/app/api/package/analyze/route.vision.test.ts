// @vitest-environment node

import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SellerPackageDraft } from "@/features/package-preparation/package-model";
import type { SellerRegionMachineReading } from "@/pipeline/extractor/extractor.types";

const mocks = vi.hoisted(() => ({
  extract: vi.fn(),
  provenance: vi.fn(),
  transcribe: vi.fn(),
}));

vi.mock("@/pipeline/extractor/extractor", () => ({
  extractLabelEvidenceDetailed: mocks.extract,
}));
vi.mock("@/server/runtime-provenance", () => ({
  getExecutableProvenance: mocks.provenance,
}));
vi.mock("@/server/vision/region-transcription", () => ({
  transcribeRegion: mocks.transcribe,
}));

import { POST } from "./route";

const PANEL_BYTES = new TextEncoder().encode("bounded-test-panel");
const PANEL_SHA = createHash("sha256").update(PANEL_BYTES).digest("hex");

const REGION = {
  unit: "normalized-panel-relative" as const,
  provenance: "seller-selected-region" as const,
  x: 0.1,
  y: 0.1,
  width: 0.8,
  height: 0.3,
};

function localReading(
  categoryId: SellerRegionMachineReading["categoryId"],
  regionId: string,
  panelId: string,
): SellerRegionMachineReading {
  return {
    categoryId,
    regionId,
    panelId,
    sellerRegion: REGION,
    cropGeometry: { left: 8, top: 18, width: 84, height: 64, imageWidth: 100, imageHeight: 200 },
    rawTranscript: "CELLARS",
    observedValue: "CELLARS",
    ocrEvidenceScore: 0.6,
    evidenceState: "LOW_CONFIDENCE",
    passProvenance: null,
    extractionProvenance: {
      extractionAdapterId: "test-adapter",
      extractionAdapterVersion: "1",
      ocrEngine: { kind: "not_applicable" },
      parserId: "test-parser",
      parserVersion: "1",
      processedAt: "2026-07-18T00:00:00.000Z",
    },
  };
}

function panel(panelId: string, order: number, role: "front" | "back") {
  return {
    panelId,
    order,
    role,
    displayName: `${panelId}.png`,
    mediaType: "image/png",
    byteSize: PANEL_BYTES.byteLength,
    checksumSha256: PANEL_SHA,
    width: 100,
    height: 200,
    rotation: 0 as const,
  };
}

function draft(): SellerPackageDraft {
  return {
    schemaVersion: "seller-package-draft.v1",
    packageId: "package-vision-test",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    profile: { id: "wine-label-requirements", version: "1.0.0" },
    panels: [panel("front", 0, "front"), panel("back", 1, "back")],
    categories: [
      {
        categoryId: "brandName",
        decision: "provided",
        expectedValue: "M CELLARS",
        regions: [
          { ...REGION, regionId: "brand-region", categoryId: "brandName", panelId: "front" },
        ],
      },
      {
        categoryId: "alcoholStatement",
        decision: "provided",
        expectedValue: "12.5",
        regions: [
          {
            ...REGION,
            y: 0.5,
            regionId: "alcohol-region",
            categoryId: "alcoholStatement",
            panelId: "back",
          },
        ],
      },
    ],
    sellerChangeHistory: [],
    analysisRuns: [],
  } as SellerPackageDraft;
}

function requestFor(value: SellerPackageDraft): Request {
  const form = new FormData();
  form.set("packageDraft", JSON.stringify(value));
  for (const entry of value.panels) {
    form.append("file", new File([PANEL_BYTES], entry.displayName, { type: "image/png" }));
  }
  return new Request("http://localhost/api/package/analyze", { method: "POST", body: form });
}

function extractionFor(reading: SellerRegionMachineReading) {
  const notObserved = {
    state: "NOT_OBSERVED",
    value: null,
    confidence: 0,
    ocrEvidenceScore: 0,
    alternates: [],
  };
  return {
    ok: true,
    value: {
      response: {
        provenance: {
          artifactRef: "test",
          derivativeSha256: PANEL_SHA,
          extractionAdapterId: "test-adapter",
          extractionAdapterVersion: "1",
          ocrEngine: { kind: "not_applicable" },
          parserId: "test-parser",
          parserVersion: "1",
          processedAt: "2026-07-18T00:00:00.000Z",
        },
        fields: { brandName: notObserved, alcoholStatement: notObserved },
      },
      debug: {
        decoded: { width: 100, height: 200 },
        passes: [],
        primarySelections: {},
        finalSelections: {},
      },
      sellerRegionReadings: [reading],
    },
  };
}

function transcriptionOf(lines: string[]) {
  return {
    ok: true,
    value: {
      lines,
      legibility: "clear",
      provenance: {
        reader: "vision-llm",
        hostLabel: "orin-01",
        configuredModel: "test-vl",
        servedModel: null,
        promptId: "label-lens.region-transcription",
        promptVersion: "1.0.0",
        promptSha256: "a".repeat(64),
        structuredOutput: "json_schema",
        sentImageSha256: "b".repeat(64),
        sentImageSize: { width: 320, height: 240 },
        responseSha256: "c".repeat(64),
        latencyMs: 800,
        promptTokens: 400,
        completionTokens: 9,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("LABEL_LENS_VISION_ENDPOINT", "http://192.168.1.50:8080");
  vi.stubEnv("LABEL_LENS_VISION_API_KEY", "shared-key-for-tests-only");
  vi.stubEnv("LABEL_LENS_VISION_MODEL", "test-vl");
  mocks.provenance.mockResolvedValue({
    extractionAdapterId: "test-adapter",
    extractionAdapterVersion: "1",
    ocrEngine: { kind: "not_applicable" },
    parserId: "test-parser",
    parserVersion: "1",
    ruleProfileId: "wine-precheck",
    ruleProfileVersion: "1",
    rules: [],
    authorities: [],
    applicationBuild: {
      packageVersion: "0.1.0",
      commitProvenance: "unavailable-development-fallback",
    },
  });
  mocks.extract
    .mockResolvedValueOnce(extractionFor(localReading("brandName", "brand-region", "front")))
    .mockResolvedValueOnce(
      extractionFor(localReading("alcoholStatement", "alcohol-region", "back")),
    );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("package analysis with the private vision reader", () => {
  it("replaces bounded local OCR with vision transcripts and signs them into the record", async () => {
    mocks.transcribe
      .mockResolvedValueOnce(transcriptionOf(["M CELLARS"]))
      .mockResolvedValueOnce(transcriptionOf(["12.5% ALC./VOL."]));

    const response = await POST(requestFor(draft()));
    expect(response.status).toBe(200);
    const body = await response.json();
    const [front, back] = body.data.analysisRun.panelRuns;

    expect(front.sellerRegionReadings[0]).toMatchObject({
      reader: "vision-llm",
      observedValue: "M CELLARS",
      evidenceState: "OBSERVED",
    });
    expect(back.sellerRegionReadings[0]).toMatchObject({
      reader: "vision-llm",
      observedValue: "12.5% ALC./VOL.",
    });
    expect(
      JSON.parse(front.exportJson).sellerRegionReadings[0].visionRead.provenance,
    ).toMatchObject({ hostLabel: "orin-01", configuredModel: "test-vl" });

    const brand = body.data.analysisRun.categories.find(
      (category: { categoryId: string }) => category.categoryId === "brandName",
    );
    expect(brand.comparison.sellerRegionReliability[0].reliabilityState).toBe("RELIABLE");

    // Only crop geometry crosses to the reader — never the seller's declared value.
    expect(JSON.stringify(mocks.transcribe.mock.calls)).not.toContain("M CELLARS");
  });

  it("keeps local OCR for every panel once the vision host is unreachable", async () => {
    mocks.transcribe.mockResolvedValue({ ok: false, code: "CONNECT_FAILED", message: "down" });

    const response = await POST(requestFor(draft()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mocks.transcribe).toHaveBeenCalledTimes(1);
    const readings = body.data.analysisRun.panelRuns.flatMap(
      (run: { sellerRegionReadings: SellerRegionMachineReading[] }) => run.sellerRegionReadings,
    );
    expect(readings.map((reading: SellerRegionMachineReading) => reading.reader)).toEqual([
      "local-ocr",
      "local-ocr",
    ]);
    expect(readings[0].visionFallback.code).toBe("CONNECT_FAILED");
    expect(readings[1].visionFallback.code).toBe("HOST_UNAVAILABLE");
  });

  it("refuses to analyze with a partial vision configuration", async () => {
    vi.stubEnv("LABEL_LENS_VISION_API_KEY", "");
    const response = await POST(requestFor(draft()));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("VISION_READER_MISCONFIGURED");
    expect(mocks.extract).not.toHaveBeenCalled();
  });
});
