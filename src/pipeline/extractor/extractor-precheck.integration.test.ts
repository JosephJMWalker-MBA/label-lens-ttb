// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import type { AnalysisRunCreationInput } from "@/domain/run/analysis-run.types";
import type { DeclaredFact } from "@/domain/run/declared-facts.types";
import type { AnalyzerEvidenceResponse } from "@/pipeline/analyzer/analyzer.types";
import { runWinePrecheck } from "@/pipeline/precheck/orchestrator";
import type { PrecheckRequest } from "@/pipeline/precheck/precheck.types";
import { winePrecheckRegistry } from "@/pipeline/precheck/wine-precheck.profile";

import { extractLabelEvidence } from "./extractor";
import type { ExtractionInput } from "./extractor.types";

const FIXTURE = join(
  process.cwd(),
  "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg",
);
const SHA = "0b0ccec13bf6c533ec7928b017b140a0213fb4555812fea81d71872adb453713";
const OCR_TIMEOUT = 120_000;

function fact(value: string): DeclaredFact {
  return {
    value,
    provenance: {
      sourceType: "public-certificate-form-field",
      sourceReference: "24205001000905",
      recordedBy: "op",
      recordedAt: "2026-07-10T00:00:00Z",
    },
  };
}

function runInput(): AnalysisRunCreationInput {
  return {
    runId: "run-ocr-1",
    createdAt: "2026-07-10T00:00:00Z",
    product: { productId: "prod-1", revisionId: "rev-1" },
    sourceArtifact: { artifactId: "m-cellars-24205001000905", sha256: null },
    sanitizedDerivative: { derivativeId: "deriv-ocr", path: "label-ocr-source.jpeg", sha256: SHA },
    declaredFacts: { brandName: fact("M CELLARS"), alcoholValue: fact("12.5") },
    versionManifest: {
      sourceArtifactSha256: null,
      sanitizedDerivativeSha256: SHA,
      extractionAdapterId: "local-two-field-extractor",
      extractionAdapterVersion: "1.0.0",
      ocrEngine: { kind: "ocr", engineId: "tesseract.js", engineVersion: "7.0.0" },
      parserId: "wine-alcohol-parse",
      parserVersion: "1.0.0",
      ruleProfileId: "wine-precheck",
      ruleProfileVersion: "1.0.0",
      rules: winePrecheckRegistry.ruleManifest(),
      authorities: [
        { citation: "27 CFR 4.32; 27 CFR 4.33", snapshotDate: "2026-07-10" },
        { citation: "27 CFR 4.36", snapshotDate: "2026-07-10" },
      ],
      applicationBuild: { packageVersion: "0.1.0" },
    },
    checkIds: ["brand-name-check", "wine-alcohol-check"],
  };
}

function request(analyzer: AnalyzerEvidenceResponse, declaredAlcohol: string): PrecheckRequest {
  return {
    run: runInput(),
    sanitizedDerivativeSha256: SHA,
    declaredFacts: {
      applicationBrandName: fact("M CELLARS"),
      applicationAlcoholValue: fact(declaredAlcohol),
    },
    analyzer,
    coverage: { brandNameProcessed: true, alcoholStatementProcessed: true },
  };
}

function extractionInput(bytes: Uint8Array): ExtractionInput {
  return {
    imageBytes: bytes,
    artifactRef: "m-cellars-24205001000905",
    derivativeSha256: SHA,
    processedAt: "2026-07-10T00:00:00Z",
    extractionAdapterId: "local-two-field-extractor",
    extractionAdapterVersion: "1.0.0",
    ocrEngine: { kind: "ocr", engineId: "tesseract.js", engineVersion: "7.0.0", modelId: "eng" },
    parserId: "wine-alcohol-parse",
    parserVersion: "1.0.0",
  };
}

describe("extractor → wine pre-check orchestrator (real OCR)", () => {
  let analyzer: AnalyzerEvidenceResponse;

  beforeAll(async () => {
    const result = await extractLabelEvidence(extractionInput(readFileSync(FIXTURE)));
    if (!result.ok) throw new Error(`extraction failed: ${JSON.stringify(result.error)}`);
    analyzer = result.value;
  }, OCR_TIMEOUT);

  function findings(declaredAlcohol: string) {
    const result = runWinePrecheck(request(analyzer, declaredAlcohol));
    if (!result.ok) throw new Error(`precheck failed: ${JSON.stringify(result.error)}`);
    return result.value.findings;
  }

  function statusOf(declaredAlcohol: string, ruleId: string) {
    return findings(declaredAlcohol).find((f) => f.ruleId === ruleId)!;
  }

  it("passes the brand rule for declared M CELLARS on extractor output", () => {
    expect(statusOf("12.5", "brand-name-canonical-comparison").findingStatus).toBe("PASS");
  });

  it("passes alcohol syntax on the observed 12.5% ALC./VOL.", () => {
    expect(statusOf("12.5", "wine-alcohol-syntax").findingStatus).toBe("PASS");
  });

  it("passes declared comparison for 12.5 and fails for 13 with no tolerance", () => {
    expect(statusOf("12.5", "wine-alcohol-declared-comparison").findingStatus).toBe("PASS");
    expect(statusOf("13", "wine-alcohol-declared-comparison").findingStatus).toBe("FAIL");
  });

  it("keeps the actual-content rules not_run_external_dependency", () => {
    for (const id of [
      "wine-alcohol-actual-content-tolerance",
      "wine-alcohol-class-type-boundary",
      "wine-alcohol-omission-eligibility",
    ]) {
      expect(statusOf("12.5", id).ruleExecutionStatus).toBe("not_run_external_dependency");
    }
  });
});
