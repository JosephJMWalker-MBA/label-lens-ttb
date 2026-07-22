import { createHash } from "node:crypto";

import { issueAppendToken } from "@/server/append-token";
import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";

export const PANEL_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
export const PANEL_SHA = createHash("sha256").update(PANEL_BYTES).digest("hex");
export const PANEL_WIDTH = 1;
export const PANEL_HEIGHT = 1;
export const DEFAULT_PANEL_ID = "panel-front-123";

export function panelBlob(bytes: Buffer = PANEL_BYTES): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "image/png" });
}

function integrityValue(payloadWithoutIntegrity: Record<string, unknown>): string {
  const clone = { ...payloadWithoutIntegrity };
  delete clone.integrity;
  return createHash("sha256").update(canonicalStringify(clone)).digest("hex");
}

export function resign<T extends { integrity: { value: string } }>(payload: T): T {
  payload.integrity.value = integrityValue(payload as unknown as Record<string, unknown>);
  return payload;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createValidAgentReviewPayload(args: {
  packageId: string;
  email?: string;
  panelId?: string;
  analysisRunId?: string;
  sellerChangeSequence?: number;
  expectedValue?: string;
  regionId?: string;
}) {
  const panelId = args.panelId ?? DEFAULT_PANEL_ID;
  const expectedValue = args.expectedValue ?? "Test Brand";
  const observations = {
    provenance: {
      artifactRef: `package-panel-${panelId}`,
      derivativeSha256: PANEL_SHA,
      extractionAdapterId: "test-adapter",
      extractionAdapterVersion: "1",
      ocrEngine: { kind: "not_applicable" as const },
      parserId: "test-parser",
      parserVersion: "1",
      processedAt: new Date().toISOString(),
    },
    brandName: {
      state: "OBSERVED" as const,
      value: expectedValue,
      normalizedValue: expectedValue,
      confidence: 0.99,
      ocrEvidenceScore: 0.99,
      alternates: [],
      geometry: {
        imageIndex: 0,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        imageWidth: 1,
        imageHeight: 1,
      },
    },
    alcoholStatement: {
      state: "NOT_OBSERVED" as const,
      value: null,
      confidence: 0,
      ocrEvidenceScore: 0,
      alternates: [],
    },
  };

  const panel = {
    panelId,
    order: 0,
    role: "front" as const,
    displayName: "front.png",
    mediaType: "image/png",
    byteSize: PANEL_BYTES.length,
    checksumSha256: PANEL_SHA,
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    rotation: 0 as const,
  };

  const machinePayload = {
    schemaVersion: "package-panel-machine-record.v1",
    packageId: args.packageId,
    panel,
    sourceSha256: PANEL_SHA,
    observations,
    versionManifest: {
      extractionAdapterId: "test-adapter",
      extractionAdapterVersion: "1",
      ocrEngine: { kind: "not_applicable" as const },
      parserId: "test-parser",
      parserVersion: "1",
    },
  };

  const machineResultId = createHash("sha256")
    .update(canonicalStringify(machinePayload))
    .digest("hex");
  const tokenRes = issueAppendToken(machineResultId);
  const appendToken = tokenRes.ok ? tokenRes.token : "unavailable-token";
  const exportJson = canonicalStringify({
    ...machinePayload,
    appendToken,
    integrity: {
      algorithm: "sha256" as const,
      scope: "canonical-package-panel-machine-payload" as const,
      value: machineResultId,
    },
  });

  const analysisRun = {
    analysisRunId: args.analysisRunId ?? `run-${panelId}`,
    sequence: 1,
    sellerChangeSequence: args.sellerChangeSequence ?? 0,
    recordedAt: new Date().toISOString(),
    panelRuns: [{ panelId, machineResultId, exportJson, observations }],
    categories: [
      {
        categoryId: "brandName",
        state: "clearly_readable" as const,
        observedValue: expectedValue,
        supportingPanelIds: [panelId],
        supportingRegionIds: [args.regionId ?? "reg-brand-1"],
        reason: "Matched brand name.",
      },
      {
        categoryId: "alcoholStatement",
        state: "not_applicable" as const,
        observedValue: null,
        supportingPanelIds: [],
        supportingRegionIds: [],
        reason: "Not applicable in this test fixture.",
      },
    ],
    readiness: "ready_for_agent_submission" as const,
  };

  const draft = {
    schemaVersion: "seller-package-draft.v1" as const,
    packageId: args.packageId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: { id: "wine-label-requirements", version: "1.0.0" },
    panelDecisions: { back: "absent" as const, additional: "none" as const },
    panels: [panel],
    categories: [
      {
        categoryId: "brandName",
        decision: "provided" as const,
        expectedValue,
        regions: [
          {
            regionId: args.regionId ?? "reg-brand-1",
            categoryId: "brandName",
            panelId,
            unit: "normalized-panel-relative" as const,
            provenance: "seller-selected-region" as const,
            x: 0,
            y: 0,
            width: 1,
            height: 1,
          },
        ],
      },
      {
        categoryId: "alcoholStatement",
        decision: "not_present" as const,
        expectedValue: "",
        regions: [],
      },
    ],
    sellerChangeHistory: [] as Array<Record<string, unknown>>,
    analysisRuns: [analysisRun],
  };

  const payload = {
    exportSchemaVersion: "seller-agent-package.v1" as const,
    exportType: "seller-prepared-agent-package" as const,
    boundary: {
      transmission: "agent-review-portal" as const,
      governmentApproval: false as const,
      statement: "Seller-submitted package for internal agent review. Not a government approval.",
    },
    submittedBy: args.email ?? "seller@test.com",
    submittedAt: new Date().toISOString(),
    receivingAgent: "label-lens-internal-agent-queue",
    package: draft,
    readiness: "ready_for_agent_submission" as const,
    applicationBuild: {},
    integrity: {
      algorithm: "sha256" as const,
      scope: "canonical-package-payload" as const,
      value: "",
    },
  };

  return resign(payload);
}

export function buildMultipartRequest(args: {
  url: string;
  payload: unknown;
  cookie: string;
  idempotencyKey: string;
  revisionContext?: unknown;
  files?: Record<string, Blob>;
}) {
  const formData = new FormData();
  formData.append("packageExport", JSON.stringify(args.payload));
  if (args.revisionContext !== undefined) {
    formData.append("revisionContext", JSON.stringify(args.revisionContext));
  }
  for (const [key, value] of Object.entries(args.files ?? { [DEFAULT_PANEL_ID]: panelBlob() })) {
    formData.append(key, value, "panel.png");
  }
  return new Request(args.url, {
    method: "POST",
    headers: { Cookie: args.cookie, "X-Idempotency-Key": args.idempotencyKey },
    body: formData,
  });
}
