// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { buildJsonExport, verifyExportIntegrity } from "@/pipeline/export/json/build-json-export";
import { serializeExportCanonical } from "@/pipeline/export/json/canonical-json";
import { parseJsonExport } from "@/pipeline/export/json/parse-json-export";
import { assemblePrecheckResult } from "@/pipeline/result/assemble";
import { buildAssembleInput } from "@/pipeline/result/build.fixtures";
import { deriveMachineResultId } from "@/pipeline/result/serialize";
import type { PrecheckResult } from "@/pipeline/result/result.types";
import { issueAppendToken } from "@/server/append-token";
import { appendFieldConfirmationToResult } from "@/server/precheck-service";
import type { PrecheckFieldConfirmationRequest } from "@/server/precheck-service.types";

import { POST } from "./route";

const FIXED_SECRET = "test-fixed-append-signing-key-0123456789";
beforeAll(() => {
  process.env.LABEL_LENS_APPEND_SIGNING_KEY = FIXED_SECRET;
});

const FILE = {
  displayName: "label.jpeg",
  mediaType: "image/jpeg",
  byteSize: 1,
  source: "upload" as const,
};

function baseResult(): PrecheckResult {
  const assembled = assemblePrecheckResult(buildAssembleInput());
  if (!assembled.ok) throw new Error("assembly failed");
  return assembled.value;
}

function canonicalExportOf(result: PrecheckResult): string {
  const built = buildJsonExport(result);
  if (!built.ok) throw new Error("export failed");
  const verified = verifyExportIntegrity(built.value);
  if (!verified.ok) throw new Error("verify failed");
  return serializeExportCanonical(verified.value);
}

function baseExportJson(): string {
  return canonicalExportOf(baseResult());
}

function machineIdOf(exportJson: string): string {
  const parsed = parseJsonExport(exportJson);
  if (!parsed.ok) throw new Error("parse failed");
  return parsed.value.generatedFrom.machineResultId;
}

function tokenFor(exportJson: string): string {
  const issued = issueAppendToken(machineIdOf(exportJson));
  if (!issued.ok) throw new Error("token issuance failed");
  return issued.token;
}

function resultWithBrandAlternates(): PrecheckResult {
  const clone = JSON.parse(JSON.stringify(baseResult())) as PrecheckResult;
  clone.observations.brandName.alternates = [
    {
      value: "M CELLARS ALT",
      confidence: 0.88,
      ocrEvidenceScore: 0.88,
      ocrConfidence: {
        aggregation: "mean",
        rawScale: "0-100",
        rawTokenConfidences: [88],
        rawMean: 88,
        rawMin: 88,
        rawMax: 88,
        missingTokenCount: 0,
      },
      candidateProvenance: {
        passId: "pass-1-edge",
        passKind: "left-edge-strip-rot270",
        triggerReasons: ["edge-text-heuristic"],
        preprocessing: ["crop:edge-strip", "rotate:270", "grayscale"],
        regionName: "brand-alt",
        supportingPassIds: ["pass-1-edge"],
        supportingPassKinds: ["left-edge-strip-rot270"],
        recoveryPassUsed: true,
      },
      ranking: {
        strategy: "brand-mixed-prominence-score",
        orderingMode: "score-first",
        comparator: [
          { id: "score-eligibility", direction: "desc", value: true },
          { id: "ranking-score", direction: "desc", value: 4.8 },
        ],
        rankingScore: 4.8,
      },
      geometry: {
        imageIndex: 0,
        x: 15,
        y: 24,
        width: 95,
        height: 28,
        imageWidth: 494,
        imageHeight: 214,
      },
    },
  ];
  const { machineResultId: _ignore, ...content } = clone;
  void _ignore;
  clone.machineResultId = deriveMachineResultId(content);
  return clone;
}

function req(
  overrides: Partial<PrecheckFieldConfirmationRequest> = {},
): PrecheckFieldConfirmationRequest {
  const exportJson = overrides.exportJson ?? baseExportJson();
  return {
    exportJson,
    appendToken: tokenFor(exportJson),
    fieldId: "brandName",
    decisionType: "accepted-machine-reading",
    recordedAt: "2026-07-13T10:00:00Z",
    file: FILE,
    ...overrides,
  };
}

describe("appendFieldConfirmationToResult (service)", () => {
  it("appends one confirmation without changing machine observations", () => {
    const before = parseJsonExport(baseExportJson());
    const out = appendFieldConfirmationToResult(req());
    expect(before.ok && out.ok).toBe(true);
    if (!before.ok || !out.ok) return;
    expect(out.value.humanFieldConfirmationHistory).toHaveLength(1);
    expect(out.value.humanFieldConfirmationHistory[0].decisionType).toBe(
      "accepted-machine-reading",
    );
    expect(JSON.stringify(out.value.observations)).toBe(JSON.stringify(before.value.observations));
  });

  it("rejects a stale alternate identifier", () => {
    const exportJson = canonicalExportOf(resultWithBrandAlternates());
    const out = appendFieldConfirmationToResult(
      req({
        exportJson,
        appendToken: tokenFor(exportJson),
        fieldId: "brandName",
        decisionType: "selected-alternate",
        alternateId: "brandName-alternate-9",
      }),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INVALID_FIELD_CONFIRMATION");
  });

  it("rebuilds export and report after a human correction", () => {
    const out = appendFieldConfirmationToResult(
      req({
        fieldId: "alcoholStatement",
        decisionType: "corrected-value",
        correctedValue: "12.5% alc./vol.",
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const parsed = parseJsonExport(out.value.exportJson);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.humanFieldConfirmationHistory[0].decisionType).toBe("corrected-value");
    expect(out.value.report.html).toMatch(/Human-corrected value/);
  });
});

describe("POST /api/precheck/confirmation", () => {
  function requestFor(body: Record<string, unknown>) {
    return new Request("http://localhost/api/precheck/confirmation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("records a confirmation with a server-generated timestamp", async () => {
    const exportJson = baseExportJson();
    const res = await POST(
      requestFor({
        exportJson,
        appendToken: tokenFor(exportJson),
        fieldId: "brandName",
        decisionType: "accepted-machine-reading",
        file: FILE,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.humanFieldConfirmationHistory).toHaveLength(1);
    expect(body.data.humanFieldConfirmationHistory[0].recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("rejects an unsupported field id", async () => {
    const res = await POST(
      requestFor({
        exportJson: baseExportJson(),
        appendToken: tokenFor(baseExportJson()),
        fieldId: "producerStatement",
        decisionType: "accepted-machine-reading",
        file: FILE,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_FIELD_CONFIRMATION");
  });
});
