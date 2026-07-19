// @vitest-environment node

import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SellerPackageDraft } from "@/features/package-preparation/package-model";

const mocks = vi.hoisted(() => ({
  extract: vi.fn(),
  provenance: vi.fn(),
}));

vi.mock("@/pipeline/extractor/extractor", () => ({
  extractLabelEvidenceDetailed: mocks.extract,
}));
vi.mock("@/server/runtime-provenance", () => ({
  getExecutableProvenance: mocks.provenance,
}));

import { POST } from "./route";

const PANEL_BYTES = new TextEncoder().encode("bounded-test-panel");
const PANEL_SHA = createHash("sha256").update(PANEL_BYTES).digest("hex");

function draft(): SellerPackageDraft {
  return {
    schemaVersion: "seller-package-draft.v1",
    packageId: "package-route-test",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    profile: { id: "wine-label-requirements", version: "1.0.0" },
    panels: [
      {
        panelId: "front",
        order: 0,
        role: "front",
        displayName: "front.png",
        mediaType: "image/png",
        byteSize: PANEL_BYTES.byteLength,
        checksumSha256: PANEL_SHA,
        width: 100,
        height: 200,
        rotation: 0,
      },
      {
        panelId: "back",
        order: 1,
        role: "back",
        displayName: "back.png",
        mediaType: "image/png",
        byteSize: PANEL_BYTES.byteLength,
        checksumSha256: PANEL_SHA,
        width: 100,
        height: 200,
        rotation: 0,
      },
    ],
    categories: [
      {
        categoryId: "brandName",
        decision: "provided",
        expectedValue: "M CELLARS",
        regions: [
          {
            regionId: "brand-region",
            categoryId: "brandName",
            panelId: "front",
            unit: "normalized-panel-relative",
            provenance: "seller-selected-region",
            x: 0.1,
            y: 0.1,
            width: 0.8,
            height: 0.3,
          },
        ],
      },
      {
        categoryId: "alcoholStatement",
        decision: "provided",
        expectedValue: "12.5",
        regions: [
          {
            regionId: "alcohol-region",
            categoryId: "alcoholStatement",
            panelId: "back",
            unit: "normalized-panel-relative",
            provenance: "seller-selected-region",
            x: 0.1,
            y: 0.5,
            width: 0.8,
            height: 0.3,
          },
        ],
      },
    ],
    sellerChangeHistory: [],
    analysisRuns: [],
  };
}

function requestFor(value: SellerPackageDraft): Request {
  const form = new FormData();
  form.set("packageDraft", JSON.stringify(value));
  for (const panel of value.panels) {
    form.append("file", new File([PANEL_BYTES], panel.displayName, { type: "image/png" }));
  }
  return new Request("http://localhost/api/package/analyze", { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
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
      gitCommitSha: "e575ca664b6ea897b0d7a25235dc87da428b69dd",
      commitProvenance: "build-environment",
    },
  });
  mocks.extract.mockResolvedValue({
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
        fields: {
          brandName: {
            state: "NOT_OBSERVED",
            value: null,
            confidence: 0,
            ocrEvidenceScore: 0,
            alternates: [],
          },
          alcoholStatement: {
            state: "NOT_OBSERVED",
            value: null,
            confidence: 0,
            ocrEvidenceScore: 0,
            alternates: [],
          },
        },
      },
      debug: { decoded: { width: 100, height: 200 } },
    },
  });
});

describe("package analysis route", () => {
  it("analyzes every independently checksummed panel and preserves NOT_OBSERVED", async () => {
    const response = await POST(requestFor(draft()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.analysisRun.panelRuns).toHaveLength(2);
    expect(body.data.analysisRun.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ categoryId: "brandName", state: "not_found" }),
        expect.objectContaining({ categoryId: "alcoholStatement", state: "not_found" }),
      ]),
    );
    expect(body.data.analysisRun.readiness).toBe("needs_seller_review");
    expect(mocks.extract).toHaveBeenCalledTimes(2);
  });

  it("analyzes one real front panel after explicit back and additional-panel absence", async () => {
    const frontOnly = draft();
    frontOnly.panelDecisions = { back: "absent", additional: "none" };
    frontOnly.panels = frontOnly.panels.filter((panel) => panel.role === "front");
    frontOnly.categories[1].regions = [{ ...frontOnly.categories[1].regions[0], panelId: "front" }];

    const response = await POST(requestFor(frontOnly));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.analysisRun.panelRuns).toHaveLength(1);
    expect(body.data.analysisRun.panelRuns[0].panelId).toBe("front");
    expect(mocks.extract).toHaveBeenCalledTimes(1);
  });

  it("rejects client attempts to alter the reviewed profile or omit prepared evidence", async () => {
    const altered = draft();
    altered.profile.id = "unreviewed-profile";
    expect((await POST(requestFor(altered))).status).toBe(422);

    const incomplete = draft();
    incomplete.categories[0].regions = [];
    expect((await POST(requestFor(incomplete))).status).toBe(422);
    expect(mocks.extract).not.toHaveBeenCalled();
  });

  it("rejects panel bytes that no longer match the saved checksum", async () => {
    const changed = draft();
    changed.panels[0].checksumSha256 = "0".repeat(64);
    const response = await POST(requestFor(changed));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "PACKAGE_PANEL_CHECKSUM_MISMATCH" },
    });
  });
});
