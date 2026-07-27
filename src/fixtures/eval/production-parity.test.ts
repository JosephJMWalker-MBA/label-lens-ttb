// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { loadEvalManifest } from "./eval-loader";
import {
  buildProductionAnalyzerParityFixture,
  buildProductionAnalyzerParityProof,
  compareProductionAnalyzerParity,
  firstProductionParityDifference,
  formatProductionParityMismatchInventory,
  PRODUCTION_ANALYZER_PARITY_SCHEMA_VERSION,
  PRODUCTION_PARITY_FIXTURE_PATH,
  productionParityBytes,
  productionParityDigest,
  type ProductionAnalyzerParityFixture,
} from "./production-parity";

function loadFixture(): ProductionAnalyzerParityFixture {
  return JSON.parse(readFileSync(PRODUCTION_PARITY_FIXTURE_PATH, "utf8"));
}

describe("production analyzer parity fixture", () => {
  it("covers every included case exactly once with verified bytes", () => {
    const fixture = loadFixture();
    const manifest = loadEvalManifest();
    expect(fixture.schemaVersion).toBe(PRODUCTION_ANALYZER_PARITY_SCHEMA_VERSION);
    expect(fixture.baseCommit).toBe("d54e3b2506de9220d2f0cd602d44b3a82c42fd58");
    expect(fixture.caseCount).toBe(manifest.cases.length);
    expect(new Set(fixture.records.map((record) => record.caseId)).size).toBe(fixture.caseCount);
    expect(fixture.records.map((record) => record.caseId)).toEqual(
      manifest.cases.map((evalCase) => evalCase.caseId),
    );
    for (const record of fixture.records) {
      const bytes = productionParityBytes(record);
      expect(record.sha256, record.caseId).toBe(productionParityDigest(bytes));
      expect(record.byteLength, record.caseId).toBe(Buffer.byteLength(bytes));
    }
  });

  it("contains analyzer output only, without fixture truth or absolute paths", () => {
    const serialized = JSON.stringify(loadFixture());
    expect(serialized).not.toContain("acceptablePresentations");
    expect(serialized).not.toContain("acceptablePercents");
    expect(serialized).not.toContain(process.cwd());
  });

  it("fixes response time and identifier inputs instead of admitting runtime metadata", () => {
    const fixture = loadFixture();
    for (const record of fixture.records) {
      expect(record.extractionError, record.caseId).toBeNull();
      expect(record.responseBytes, record.caseId).not.toBeNull();
      const response = JSON.parse(record.responseBytes!) as {
        provenance: Record<string, unknown>;
      };
      expect(response.provenance.processedAt, record.caseId).toBe("2026-07-12T00:00:00Z");
      expect(Object.keys(response.provenance), record.caseId).toEqual([
        "artifactRef",
        "derivativeSha256",
        "extractionAdapterId",
        "extractionAdapterVersion",
        "ocrEngine",
        "parserId",
        "parserVersion",
        "processedAt",
      ]);
      expect(JSON.stringify(response), record.caseId).not.toMatch(
        /"randomId"|"requestId"|"workerId"|"generatedAt"/,
      );
    }
  });

  it("serializes identical ordered inputs byte-for-byte deterministically", () => {
    const inputs = [
      { caseId: "case-a", responseBytes: '{"schemaVersion":"v1"}', extractionError: null },
      { caseId: "case-b", responseBytes: null, extractionError: "OCR_FAILED" },
    ];
    const first = buildProductionAnalyzerParityFixture("base", inputs);
    const second = buildProductionAnalyzerParityFixture("base", structuredClone(inputs));

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.records.map((record) => record.caseId)).toEqual(["case-a", "case-b"]);
  });

  it("keeps exact-byte mismatch details observable before a caller asserts", () => {
    const expected = buildProductionAnalyzerParityFixture("base", [
      {
        caseId: "case-a",
        responseBytes: JSON.stringify({
          fields: { alcoholStatement: { state: "NOT_OBSERVED", value: null } },
        }),
        extractionError: null,
      },
    ]);
    const actual = buildProductionAnalyzerParityFixture("base", [
      {
        caseId: "case-a",
        responseBytes: JSON.stringify({
          fields: { alcoholStatement: { state: "OBSERVED", value: "13% ALC./VOL." } },
        }),
        extractionError: null,
      },
    ]);

    const proof = buildProductionAnalyzerParityProof(expected, actual);
    const inventory = formatProductionParityMismatchInventory(proof);

    expect(proof.status).toBe("FAIL");
    expect(compareProductionAnalyzerParity(expected, actual)).toEqual(proof.mismatches);
    expect(proof.mismatches[0]?.firstDifference).toMatchObject({
      kind: "json-value-change",
      jsonPath: "$.fields.alcoholStatement.state",
      expectedValue: "NOT_OBSERVED",
      actualValue: "OBSERVED",
      fieldCategory: "alcoholStatement",
    });
    expect(proof.mismatches[0]?.firstDifference?.byteOffset).toBeGreaterThan(0);
    expect(inventory).toContain("$.fields.alcoholStatement.state");
    expect(inventory).toContain("13% ALC./VOL.");
  });

  it("continues past equal arrays to the first real JSON difference", () => {
    const difference = firstProductionParityDifference(
      JSON.stringify({
        fields: {
          brandName: { ocrConfidence: { rawTokenConfidences: [90, 91] } },
          alcoholStatement: { state: "NOT_OBSERVED" },
        },
      }),
      JSON.stringify({
        fields: {
          brandName: { ocrConfidence: { rawTokenConfidences: [90, 91] } },
          alcoholStatement: { state: "OBSERVED" },
        },
      }),
    );

    expect(difference).toMatchObject({
      kind: "json-value-change",
      jsonPath: "$.fields.alcoholStatement.state",
      expectedValue: "NOT_OBSERVED",
      actualValue: "OBSERVED",
      fieldCategory: "alcoholStatement",
    });
  });

  it("distinguishes serialization ordering from a semantic value change", () => {
    const difference = firstProductionParityDifference(
      JSON.stringify({ schemaVersion: "v1", fields: { brandName: null } }),
      JSON.stringify({ fields: { brandName: null }, schemaVersion: "v1" }),
    );

    expect(difference).toMatchObject({
      kind: "serialization-order-change",
      jsonPath: null,
      fieldCategory: "serialization",
    });
    expect(difference.byteOffset).toBeGreaterThan(0);
  });
});
