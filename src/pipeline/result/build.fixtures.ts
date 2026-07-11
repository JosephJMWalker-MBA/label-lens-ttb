import { createAnalysisRun } from "@/domain/run/analysis-run";
import type { AnalysisRun, AnalysisRunCreationInput } from "@/domain/run/analysis-run.types";
import type { DeclaredFact } from "@/domain/run/declared-facts.types";
import type {
  AnalyzerEvidenceResponse,
  AnalyzerFieldObservation,
} from "@/pipeline/analyzer/analyzer.types";
import { runWinePrecheck } from "@/pipeline/precheck/orchestrator";
import type { PrecheckRequest, PrecheckResult } from "@/pipeline/precheck/precheck.types";
import { winePrecheckRegistry } from "@/pipeline/precheck/wine-precheck.profile";

import type { AssembleInput } from "./assemble";

/**
 * Deterministic builders for result-assembly tests. They produce a genuine
 * orchestration output (via the committed orchestrator) from a synthetic
 * analyzer response, so assembly is exercised without invoking OCR.
 */

export const SHA = "6829add3d99c61851028b2422bdd9672bb975183d198de5e280bc961f4a489e7";

export function fact(value: string): DeclaredFact {
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

function obs(value: string): AnalyzerFieldObservation {
  return {
    state: "OBSERVED",
    value,
    normalizedValue: value,
    rawText: value,
    confidence: 0.95,
    geometry: {
      imageIndex: 0,
      x: 10,
      y: 20,
      width: 100,
      height: 30,
      imageWidth: 494,
      imageHeight: 214,
    },
    alternates: [],
  };
}

export function buildAnalyzer(): AnalyzerEvidenceResponse {
  return {
    schemaVersion: "analyzer-evidence.v2",
    provenance: {
      artifactRef: "m-cellars-24205001000905",
      derivativeSha256: SHA,
      extractionAdapterId: "local-two-field-extractor",
      extractionAdapterVersion: "1.0.0",
      ocrEngine: { kind: "ocr", engineId: "tesseract.js", engineVersion: "7.0.0", modelId: "eng" },
      parserId: "wine-alcohol-parse",
      parserVersion: "1.0.0",
      processedAt: "2026-07-10T00:00:00Z",
    },
    fields: { brandName: obs("M CELLARS"), alcoholStatement: obs("12.5% ALC./VOL.") },
    limitations: [],
  };
}

export function buildRunInput(): AnalysisRunCreationInput {
  return {
    runId: "run-result-1",
    createdAt: "2026-07-10T00:00:00Z",
    product: { productId: "prod-1", revisionId: "rev-1" },
    sourceArtifact: { artifactId: "m-cellars-24205001000905", sha256: null },
    sanitizedDerivative: { derivativeId: "deriv-1", path: "label.png", sha256: SHA },
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

export function buildRun(): AnalysisRun {
  const result = createAnalysisRun(buildRunInput());
  if (!result.ok) throw new Error(`run creation failed: ${JSON.stringify(result.error)}`);
  return result.value;
}

export function buildOrchestration(analyzer: AnalyzerEvidenceResponse): PrecheckResult {
  const request: PrecheckRequest = {
    run: buildRunInput(),
    sanitizedDerivativeSha256: SHA,
    declaredFacts: {
      applicationBrandName: fact("M CELLARS"),
      applicationAlcoholValue: fact("12.5"),
    },
    analyzer,
    coverage: { brandNameProcessed: true, alcoholStatementProcessed: true },
  };
  const result = runWinePrecheck(request);
  if (!result.ok) throw new Error(`orchestration failed: ${JSON.stringify(result.error)}`);
  return result.value;
}

export function buildAssembleInput(overrides: Partial<AssembleInput> = {}): AssembleInput {
  const analyzer = overrides.analyzer ?? buildAnalyzer();
  return {
    run: overrides.run ?? buildRun(),
    orchestration: overrides.orchestration ?? buildOrchestration(analyzer),
    analyzer,
    declaredFacts: overrides.declaredFacts ?? {
      applicationBrandName: fact("M CELLARS"),
      applicationAlcoholValue: fact("12.5"),
    },
    ...(overrides.advisoryQuality !== undefined
      ? { advisoryQuality: overrides.advisoryQuality }
      : {}),
    ...(overrides.machineResultId !== undefined
      ? { machineResultId: overrides.machineResultId }
      : {}),
  };
}
