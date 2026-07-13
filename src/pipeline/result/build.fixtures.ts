import { createAnalysisRun } from "@/domain/run/analysis-run";
import type { AnalysisRun, AnalysisRunCreationInput } from "@/domain/run/analysis-run.types";
import type { DeclaredFact } from "@/domain/run/declared-facts.types";
import type { ExecutableProvenance } from "@/domain/run/version-manifest.types";
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
 * analyzer response, so assembly is exercised without invoking OCR. Every layer
 * derives its executable identity from one canonical fixture provenance, mirror-
 * ing the real single-source runtime provenance.
 */

export const SHA = "6829add3d99c61851028b2422bdd9672bb975183d198de5e280bc961f4a489e7";
/** A fixed, syntactically valid model digest for fixtures (not a real file hash). */
export const FIXTURE_MODEL_SHA = "a".repeat(64);

/** The one canonical executable provenance the fixtures reconcile against. */
export const EXPECTED_PROVENANCE: ExecutableProvenance = {
  extractionAdapterId: "local-two-field-extractor",
  extractionAdapterVersion: "1.0.0",
  ocrEngine: {
    kind: "ocr",
    engineId: "tesseract.js",
    engineVersion: "7.0.0",
    modelId: "eng",
    modelSha256: FIXTURE_MODEL_SHA,
  },
  parserId: "wine-alcohol-parse",
  parserVersion: "1.0.0",
  ruleProfileId: "wine-precheck",
  ruleProfileVersion: "1.0.0",
  rules: winePrecheckRegistry.ruleManifest(),
  authorities: [
    { citation: "27 CFR 4.32; 27 CFR 4.33", snapshotDate: "2026-07-10" },
    { citation: "27 CFR 4.36", snapshotDate: "2026-07-10" },
  ],
  applicationBuild: {
    packageVersion: "0.1.0",
    commitProvenance: "unavailable-development-fallback",
  },
};

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
  const ocrEvidenceScore = 0.95;
  return {
    state: "OBSERVED",
    value,
    normalizedValue: value,
    rawText: value,
    confidence: ocrEvidenceScore,
    ocrEvidenceScore,
    ocrConfidence: {
      aggregation: "mean",
      rawScale: "0-100",
      rawTokenConfidences: [95],
      rawMean: 95,
      rawMin: 95,
      rawMax: 95,
      missingTokenCount: 0,
    },
    candidateProvenance: {
      passId: "pass-0-full-image",
      passKind: "full-image-primary",
      triggerReasons: ["primary-pass"],
      preprocessing: ["grayscale", "normalise", "scale:1.5"],
      regionName: value === "12.5% ALC./VOL." ? "full-image-alcohol" : "full-image-brand",
      supportingPassIds: ["pass-0-full-image"],
      supportingPassKinds: ["full-image-primary"],
      recoveryPassUsed: false,
    },
    ranking:
      value === "12.5% ALC./VOL."
        ? {
            strategy: "alcohol-ocr-evidence-comparator",
            orderingMode: "ocr-evidence-first",
            comparator: [
              { id: "ocr-evidence-score", direction: "desc", value: ocrEvidenceScore },
              { id: "normalized-value-key", direction: "asc", value: "125alcvol" },
            ],
          }
        : {
            strategy: "brand-mixed-prominence-score",
            orderingMode: "score-first",
            comparator: [
              { id: "score-eligibility", direction: "desc", value: true },
              { id: "ranking-score", direction: "desc", value: 5.6 },
              { id: "prominence", direction: "desc", value: 30 },
              { id: "ocr-evidence-score", direction: "desc", value: ocrEvidenceScore },
              { id: "normalized-value-key", direction: "asc", value: "mcellars" },
            ],
            rankingScore: 5.6,
            scoreFactors: [
              { id: "positive-signal", value: 1, contribution: 2, direction: "benefit" },
              {
                id: "meaningful-chars",
                value: 0.64,
                contribution: 1.024,
                direction: "benefit",
              },
              { id: "structure", value: 1, contribution: 1.2, direction: "benefit" },
              {
                id: "ocr-evidence-score",
                value: ocrEvidenceScore,
                contribution: ocrEvidenceScore,
                direction: "benefit",
              },
              { id: "prominence", value: 1, contribution: 0.8, direction: "benefit" },
              { id: "area", value: 0.5, contribution: 0.3, direction: "benefit" },
              { id: "centrality", value: 0.5, contribution: 0.15, direction: "benefit" },
              { id: "alignment", value: 1, contribution: 0.25, direction: "benefit" },
              {
                id: "line-proximity",
                value: 1,
                contribution: 0.2,
                direction: "benefit",
              },
              {
                id: "low-information-penalty",
                value: 0,
                contribution: 0,
                direction: "penalty",
              },
              { id: "residual-penalty", value: 0, contribution: 0, direction: "penalty" },
            ],
          },
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
      ocrEngine: EXPECTED_PROVENANCE.ocrEngine,
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
    sourceArtifact: { artifactId: "m-cellars-24205001000905", sha256: SHA },
    sanitizedDerivative: { derivativeId: "deriv-1", path: "label.png", sha256: SHA },
    declaredFacts: { brandName: fact("M CELLARS"), alcoholValue: fact("12.5") },
    versionManifest: {
      ...EXPECTED_PROVENANCE,
      sourceArtifactSha256: SHA,
      sanitizedDerivativeSha256: SHA,
      derivativeRelationship: "same_bytes",
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
    expectedProvenance: overrides.expectedProvenance ?? EXPECTED_PROVENANCE,
    ...(overrides.advisoryQuality !== undefined
      ? { advisoryQuality: overrides.advisoryQuality }
      : {}),
    ...(overrides.machineResultId !== undefined
      ? { machineResultId: overrides.machineResultId }
      : {}),
  };
}
