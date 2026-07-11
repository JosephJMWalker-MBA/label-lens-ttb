import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateAnalyzerEvidenceResponse } from "./analyzer.schema";

const DERIVATIVE_SHA = "6829add3d99c61851028b2422bdd9672bb975183d198de5e280bc961f4a489e7";

function geometry() {
  return { imageIndex: 0, x: 10, y: 20, width: 100, height: 30, imageWidth: 494, imageHeight: 214 };
}

function validResponse(): Record<string, unknown> {
  return {
    schemaVersion: "analyzer-evidence.v2",
    provenance: {
      artifactRef: "m-cellars-24205001000905",
      derivativeSha256: DERIVATIVE_SHA,
      extractionAdapterId: "pending-extraction-adapter",
      extractionAdapterVersion: "0.0.0",
      ocrEngine: { kind: "not_applicable" },
      parserId: "pending-parser",
      parserVersion: "0.0.0",
      processedAt: "2026-07-10T00:00:00Z",
    },
    fields: {
      brandName: {
        state: "OBSERVED",
        value: "M CELLARS",
        normalizedValue: "M CELLARS",
        rawText: "M CELLARS",
        confidence: 0.98,
        geometry: geometry(),
        alternates: [],
      },
      alcoholStatement: {
        state: "OBSERVED",
        value: "12.5% ALC./VOL.",
        normalizedValue: "12.5% ALC./VOL.",
        rawText: "12.5% ALC./VOL.",
        confidence: 0.9,
        geometry: geometry(),
        alternates: [],
      },
    },
    limitations: [],
  };
}

describe("analyzer evidence — valid observations", () => {
  it("parses the wine fixture examples successfully", () => {
    const result = validateAnalyzerEvidenceResponse(validResponse());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fields.brandName.value).toBe("M CELLARS");
      expect(result.value.fields.alcoholStatement.value).toBe("12.5% ALC./VOL.");
    }
  });

  it("retains the value of a low-confidence brand observation", () => {
    const response = validResponse();
    response.fields = {
      ...(response.fields as object),
      brandName: {
        state: "LOW_CONFIDENCE",
        value: "M CELLARS",
        normalizedValue: "M CELLARS",
        rawText: "M CELLARS",
        confidence: 0.12,
        geometry: geometry(),
        alternates: [],
      },
    } as never;
    const result = validateAnalyzerEvidenceResponse(response);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.fields.brandName.value).toBe("M CELLARS");
  });

  it("retains the primary value and alternates of an ambiguous alcohol observation", () => {
    const response = validResponse();
    (response.fields as Record<string, unknown>).alcoholStatement = {
      state: "AMBIGUOUS",
      value: "12.5% ALC./VOL.",
      normalizedValue: "12.5% ALC./VOL.",
      rawText: "12.5% ALC./VOL.",
      confidence: 0.5,
      geometry: geometry(),
      alternates: [
        { value: "12.5% ALC./VOL", confidence: 0.5 },
        { value: "13% ALC./VOL.", confidence: 0.4 },
      ],
    };
    const result = validateAnalyzerEvidenceResponse(response);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fields.alcoholStatement.value).toBe("12.5% ALC./VOL.");
      expect(result.value.fields.alcoholStatement.alternates).toHaveLength(2);
    }
  });

  it("preserves geometry and provenance unchanged through validation", () => {
    const result = validateAnalyzerEvidenceResponse(validResponse());
    if (!result.ok) throw new Error("expected valid");
    expect(result.value.fields.brandName.geometry).toEqual(geometry());
    expect(result.value.provenance.derivativeSha256).toBe(DERIVATIVE_SHA);
  });

  it("serializes identical responses deterministically", () => {
    const a = validateAnalyzerEvidenceResponse(validResponse());
    const b = validateAnalyzerEvidenceResponse(validResponse());
    if (!a.ok || !b.ok) throw new Error("expected valid");
    expect(JSON.stringify(a.value)).toBe(JSON.stringify(b.value));
  });
});

describe("analyzer evidence — NOT_OBSERVED semantics", () => {
  it("allows NOT_OBSERVED with a null value", () => {
    const response = validResponse();
    (response.fields as Record<string, unknown>).brandName = {
      state: "NOT_OBSERVED",
      value: null,
      confidence: 0,
      alternates: [],
    };
    expect(validateAnalyzerEvidenceResponse(response).ok).toBe(true);
  });

  it("rejects a present state that drops its value", () => {
    const response = validResponse();
    (response.fields as Record<string, unknown>).brandName = {
      state: "LOW_CONFIDENCE",
      value: null,
      confidence: 0.1,
      alternates: [],
    };
    const result = validateAnalyzerEvidenceResponse(response);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_SHAPE");
  });

  it("rejects AMBIGUOUS without alternates", () => {
    const response = validResponse();
    (response.fields as Record<string, unknown>).alcoholStatement = {
      state: "AMBIGUOUS",
      value: "12.5% ALC./VOL.",
      confidence: 0.5,
      geometry: geometry(),
      alternates: [],
    };
    expect(validateAnalyzerEvidenceResponse(response).ok).toBe(false);
  });
});

describe("analyzer evidence — structural rejections", () => {
  it("rejects malformed geometry", () => {
    const response = validResponse();
    (
      response.fields as Record<string, { geometry: Record<string, number> }>
    ).brandName.geometry.width = -5;
    const result = validateAnalyzerEvidenceResponse(response);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_SHAPE");
  });

  it("rejects confidence outside [0, 1]", () => {
    const response = validResponse();
    (response.fields as Record<string, { confidence: number }>).brandName.confidence = 1.5;
    expect(validateAnalyzerEvidenceResponse(response).ok).toBe(false);
  });

  it("rejects unknown keys", () => {
    const response = validResponse();
    (response.fields as Record<string, Record<string, unknown>>).brandName.unexpected = true;
    const result = validateAnalyzerEvidenceResponse(response);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_SHAPE");
  });
});

describe("analyzer evidence — forbidden decision keys", () => {
  function expectForbidden(mutate: (r: Record<string, unknown>) => void) {
    const response = validResponse();
    mutate(response);
    const result = validateAnalyzerEvidenceResponse(response);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("REGULATORY_DECISION");
  }

  it("rejects a decision key at the root", () => {
    expectForbidden((r) => {
      r.status = "PASS";
    });
  });

  it("rejects a decision key nested inside a field", () => {
    expectForbidden((r) => {
      (r.fields as Record<string, Record<string, unknown>>).brandName.finding = { status: "FAIL" };
    });
  });

  it("rejects proof, government-warning conclusions, findings, and dispositions", () => {
    expectForbidden((r) => {
      (r.fields as Record<string, Record<string, unknown>>).alcoholStatement.proof = "80";
    });
    expectForbidden((r) => {
      r.governmentWarning = "present";
    });
    expectForbidden((r) => {
      r.findings = [];
    });
    expectForbidden((r) => {
      r.disposition = { outcome: "CONFIRMED_FINDINGS" };
    });
  });
});

describe("analyzer evidence — module independence", () => {
  it("analyzer modules do not import rule, disposition, finding, or report types", () => {
    const files = ["analyzer.types.ts", "analyzer.schema.ts", "evidence-access.ts"];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), "src/pipeline/analyzer", file), "utf8");
      // Inspect import/export-from paths only, so prose in comments is not matched.
      const importPaths = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const path of importPaths) {
        expect(path).not.toMatch(/rules|disposition|finding|report/);
      }
    }
  });
});
