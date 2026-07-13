import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { AnalysisRunCreationInput } from "@/domain/run/analysis-run.types";
import type { DeclaredFact } from "@/domain/run/declared-facts.types";
import { validateVerificationFinding } from "@/domain/verification/finding.schema";
import type {
  AnalyzerEvidenceResponse,
  AnalyzerFieldObservation,
} from "@/pipeline/analyzer/analyzer.types";

import { runWinePrecheck, serializePrecheckResult } from "./orchestrator";
import type { PrecheckRequest } from "./precheck.types";
import { winePrecheckRegistry } from "./wine-precheck.profile";

const SHA = "6829add3d99c61851028b2422bdd9672bb975183d198de5e280bc961f4a489e7";
const OTHER_SHA = "1111111111111111111111111111111111111111111111111111111111111111";

const EXPECTED_MANIFEST = [
  { ruleId: "wine-alcohol-syntax", version: "1.0.0" },
  { ruleId: "brand-name-canonical-comparison", version: "1.0.0" },
  { ruleId: "wine-alcohol-declared-comparison", version: "1.0.0" },
  { ruleId: "wine-alcohol-actual-content-tolerance", version: "1.0.0" },
  { ruleId: "wine-alcohol-class-type-boundary", version: "1.0.0" },
  { ruleId: "wine-alcohol-omission-eligibility", version: "1.0.0" },
];

function geometry() {
  return {
    imageIndex: 0,
    x: 10,
    y: 20,
    width: 100,
    height: 30,
    imageWidth: 494,
    imageHeight: 214,
  };
}

/**
 * Build a valid observation for the shared canonical schema: present states
 * retain value/normalizedValue/rawText/geometry; NOT_OBSERVED carries nothing
 * but a null value and zero confidence.
 */
function obs(
  value: string | null,
  overrides: Partial<AnalyzerFieldObservation> = {},
): AnalyzerFieldObservation {
  const state = overrides.state ?? (value === null ? "NOT_OBSERVED" : "OBSERVED");
  if (state === "NOT_OBSERVED") {
    return {
      state: "NOT_OBSERVED",
      value: null,
      confidence: 0,
      ocrEvidenceScore: 0,
      alternates: [],
    };
  }
  const ocrEvidenceScore = overrides.ocrEvidenceScore ?? overrides.confidence ?? 0.95;
  return {
    state,
    value,
    normalizedValue: value,
    rawText: value ?? undefined,
    confidence: ocrEvidenceScore,
    ocrEvidenceScore,
    ocrConfidence: {
      aggregation: "mean",
      rawScale: "0-100",
      rawTokenConfidences: [Math.round(ocrEvidenceScore * 100)],
      rawMean: Math.round(ocrEvidenceScore * 100),
      rawMin: Math.round(ocrEvidenceScore * 100),
      rawMax: Math.round(ocrEvidenceScore * 100),
      missingTokenCount: 0,
    },
    candidateProvenance: {
      passId: "pass-0-full-image",
      passKind: "full-image-primary",
      triggerReasons: ["primary-pass"],
      preprocessing: ["grayscale"],
      regionName: "full-image",
      supportingPassIds: ["pass-0-full-image"],
      supportingPassKinds: ["full-image-primary"],
      recoveryPassUsed: false,
    },
    ranking: {
      strategy:
        value && value.includes("ALC")
          ? "alcohol-ocr-evidence-comparator"
          : "brand-mixed-prominence-score",
      orderingMode: value && value.includes("ALC") ? "ocr-evidence-first" : "score-first",
      comparator:
        value && value.includes("ALC")
          ? [
              { id: "ocr-evidence-score", direction: "desc", value: ocrEvidenceScore },
              { id: "normalized-value-key", direction: "asc", value: "alcohol" },
            ]
          : [
              { id: "score-eligibility", direction: "desc", value: true },
              { id: "ranking-score", direction: "desc", value: 5.1 },
              { id: "prominence", direction: "desc", value: 30 },
              { id: "ocr-evidence-score", direction: "desc", value: ocrEvidenceScore },
              { id: "normalized-value-key", direction: "asc", value: "brand" },
            ],
      ...(value && value.includes("ALC")
        ? {}
        : {
            rankingScore: 5.1,
            scoreFactors: [
              { id: "positive-signal", value: 1, contribution: 2, direction: "benefit" },
              {
                id: "ocr-evidence-score",
                value: ocrEvidenceScore,
                contribution: ocrEvidenceScore,
                direction: "benefit",
              },
            ],
          }),
    },
    geometry: geometry(),
    alternates: [],
    ...overrides,
  };
}

function alt(value: string, score: number): AnalyzerFieldObservation["alternates"][number] {
  return {
    value,
    confidence: score,
    ocrEvidenceScore: score,
    ocrConfidence: {
      aggregation: "mean",
      rawScale: "0-100",
      rawTokenConfidences: [Math.round(score * 100)],
      rawMean: Math.round(score * 100),
      rawMin: Math.round(score * 100),
      rawMax: Math.round(score * 100),
      missingTokenCount: 0,
    },
    candidateProvenance: {
      passId: `pass-${value}`,
      passKind: "full-image-primary",
      triggerReasons: ["primary-pass"],
      preprocessing: ["grayscale"],
      regionName: "full-image",
      supportingPassIds: [`pass-${value}`],
      supportingPassKinds: ["full-image-primary"],
      recoveryPassUsed: false,
    },
    ranking: {
      strategy: "brand-mixed-prominence-score",
      orderingMode: "score-first",
      comparator: [
        { id: "score-eligibility", direction: "desc", value: true },
        { id: "ranking-score", direction: "desc", value: 4.2 },
        { id: "prominence", direction: "desc", value: 24 },
        { id: "ocr-evidence-score", direction: "desc", value: score },
        { id: "normalized-value-key", direction: "asc", value: value.toLowerCase() },
      ],
      rankingScore: 4.2,
      scoreFactors: [
        { id: "positive-signal", value: 1, contribution: 2, direction: "benefit" },
        { id: "ocr-evidence-score", value: score, contribution: score, direction: "benefit" },
      ],
    },
  };
}

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

function analyzer(
  brandName: AnalyzerFieldObservation,
  alcoholStatement: AnalyzerFieldObservation,
  provenanceSha = SHA,
): AnalyzerEvidenceResponse {
  return {
    schemaVersion: "analyzer-evidence.v2",
    provenance: {
      artifactRef: "artifact-1",
      derivativeSha256: provenanceSha,
      extractionAdapterId: "adapter-1",
      extractionAdapterVersion: "1.0.0",
      ocrEngine: { kind: "not_applicable" },
      parserId: "parser-1",
      parserVersion: "1.0.0",
      processedAt: "2026-07-10T00:00:00Z",
    },
    fields: { brandName, alcoholStatement },
    limitations: [],
  };
}

function runInput(overrides: { rules?: typeof EXPECTED_MANIFEST } = {}): AnalysisRunCreationInput {
  return {
    runId: "run-1",
    createdAt: "2026-07-10T00:00:00Z",
    product: { productId: "prod-1", revisionId: "rev-1" },
    sourceArtifact: { artifactId: "artifact-1", sha256: null },
    sanitizedDerivative: { derivativeId: "deriv-1", path: "/d/1.png", sha256: SHA },
    declaredFacts: { brandName: fact("M CELLARS"), alcoholValue: fact("12.5") },
    versionManifest: {
      sourceArtifactSha256: null,
      sanitizedDerivativeSha256: SHA,
      extractionAdapterId: "adapter-1",
      extractionAdapterVersion: "1.0.0",
      ocrEngine: { kind: "not_applicable" },
      parserId: "parser-1",
      parserVersion: "1.0.0",
      ruleProfileId: "wine-precheck",
      ruleProfileVersion: "1.0.0",
      rules: overrides.rules ?? EXPECTED_MANIFEST,
      authorities: [
        { citation: "27 CFR 4.32; 27 CFR 4.33", snapshotDate: "2026-07-10" },
        { citation: "27 CFR 4.36", snapshotDate: "2026-07-10" },
      ],
      applicationBuild: { packageVersion: "0.1.0" },
    },
    checkIds: ["brand-name-check", "wine-alcohol-check"],
  };
}

function request(opts: {
  brand?: AnalyzerFieldObservation;
  alcohol?: AnalyzerFieldObservation;
  declaredBrand?: string;
  declaredAlcohol?: string;
  provenanceSha?: string;
  brandProcessed?: boolean;
  alcoholProcessed?: boolean;
  rules?: typeof EXPECTED_MANIFEST;
  quality?: PrecheckRequest["quality"];
}): PrecheckRequest {
  return {
    run: runInput({ rules: opts.rules }),
    sanitizedDerivativeSha256: SHA,
    declaredFacts: {
      applicationBrandName: fact(opts.declaredBrand ?? "M CELLARS"),
      applicationAlcoholValue: fact(opts.declaredAlcohol ?? "12.5"),
    },
    analyzer: analyzer(
      opts.brand ?? obs("M CELLARS"),
      opts.alcohol ?? obs("12.5% ALC./VOL."),
      opts.provenanceSha ?? SHA,
    ),
    coverage: {
      brandNameProcessed: opts.brandProcessed ?? true,
      alcoholStatementProcessed: opts.alcoholProcessed ?? true,
    },
    quality: opts.quality,
  };
}

function ok(req: PrecheckRequest) {
  const result = runWinePrecheck(req);
  if (!result.ok) throw new Error(`expected ok, got: ${JSON.stringify(result.error)}`);
  return result.value;
}

function findingFor(req: PrecheckRequest, ruleId: string) {
  return ok(req).findings.find((f) => f.ruleId === ruleId)!;
}

function evidence(req: PrecheckRequest, checkId: string) {
  return ok(req).evidenceAssessments.find((a) => a.checkId === checkId)!;
}

describe("wine pre-check profile", () => {
  it("exposes the exact profile id and version", () => {
    expect(winePrecheckRegistry.profileId).toBe("wine-precheck");
    expect(winePrecheckRegistry.profileVersion).toBe("1.0.0");
  });

  it("registers the exact six-rule ordered manifest", () => {
    expect(winePrecheckRegistry.ruleManifest()).toEqual(EXPECTED_MANIFEST);
  });

  it("registers no warning, designation, appellation, or net-contents rules", () => {
    const ids = winePrecheckRegistry.all().map((r) => r.id);
    for (const forbidden of ["warning", "designation", "appellation", "net-contents", "proof"]) {
      expect(ids.some((id) => id.includes(forbidden))).toBe(false);
    }
    expect(ids).toHaveLength(6);
  });

  it("rejects a run whose manifest does not match the profile", () => {
    const reordered = [...EXPECTED_MANIFEST].reverse();
    const result = runWinePrecheck(request({ rules: reordered }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PROFILE_MISMATCH");
  });
});

describe("per-check evidence sufficiency", () => {
  it("assesses brand and alcohol independently: brand insufficient, alcohol sufficient", () => {
    const req = request({ brand: obs(null, { state: "NOT_OBSERVED" }) });
    expect(evidence(req, "brand-name-check").evidenceStatus).toBe("insufficient");
    expect(evidence(req, "wine-alcohol-check").evidenceStatus).toBe("sufficient");
  });

  it("assesses independently the other way: alcohol insufficient, brand sufficient", () => {
    const req = request({ alcohol: obs(null, { state: "NOT_OBSERVED" }), alcoholProcessed: false });
    expect(evidence(req, "brand-name-check").evidenceStatus).toBe("sufficient");
    expect(evidence(req, "wine-alcohol-check").evidenceStatus).toBe("insufficient");
  });

  it("treats low-confidence and ambiguous evidence as sufficient", () => {
    const low = request({ brand: obs("M CELLARS", { state: "LOW_CONFIDENCE", confidence: 0.05 }) });
    expect(evidence(low, "brand-name-check").evidenceStatus).toBe("sufficient");
    const amb = request({
      brand: obs("M CELLARS", {
        state: "AMBIGUOUS",
        alternates: [alt("N CELLARS", 0.4)],
      }),
    });
    expect(evidence(amb, "brand-name-check").evidenceStatus).toBe("sufficient");
  });

  it("does not let an image-quality warning force insufficiency", () => {
    const req = request({ quality: { imageQualityWarnings: ["blurry crop"] } });
    expect(evidence(req, "brand-name-check").evidenceStatus).toBe("sufficient");
    expect(evidence(req, "wine-alcohol-check").evidenceStatus).toBe("sufficient");
  });

  it("does not let extraction confidence overwrite evidence status", () => {
    // Very low confidence but valid provenance and a value: still sufficient.
    const req = request({ alcohol: obs("12.5% ALC./VOL.", { confidence: 0.01 }) });
    expect(evidence(req, "wine-alcohol-check").evidenceStatus).toBe("sufficient");
  });

  it("marks a derivative hash mismatch insufficient without rewriting the hash", () => {
    const req = request({ provenanceSha: OTHER_SHA });
    expect(evidence(req, "brand-name-check").reasonCode).toBe("DERIVATIVE_HASH_MISMATCH");
    expect(evidence(req, "wine-alcohol-check").reasonCode).toBe("DERIVATIVE_HASH_MISMATCH");
    expect(evidence(req, "brand-name-check").evidenceStatus).toBe("insufficient");
  });

  it("treats NOT_OBSERVED alcohol as sufficient when the region was processed", () => {
    const req = request({ alcohol: obs(null, { state: "NOT_OBSERVED" }), alcoholProcessed: true });
    const a = evidence(req, "wine-alcohol-check");
    expect(a.evidenceStatus).toBe("sufficient");
    expect(a.reasonCode).toBe("ALCOHOL_NOT_OBSERVED_BUT_PROCESSED");
  });

  it("treats NOT_OBSERVED alcohol as insufficient when the region was not processed", () => {
    const req = request({ alcohol: obs(null, { state: "NOT_OBSERVED" }), alcoholProcessed: false });
    expect(evidence(req, "wine-alcohol-check").evidenceStatus).toBe("insufficient");
  });
});

describe("orchestrated execution", () => {
  it("passes the M Cellars brand exact match", () => {
    expect(findingFor(request({}), "brand-name-canonical-comparison").findingStatus).toBe("PASS");
  });

  it("passes alcohol syntax and declared 12.5 comparison", () => {
    const req = request({});
    expect(findingFor(req, "wine-alcohol-syntax").findingStatus).toBe("PASS");
    expect(findingFor(req, "wine-alcohol-declared-comparison").findingStatus).toBe("PASS");
  });

  it("fails declared 13 comparison with no tolerance", () => {
    const req = request({ declaredAlcohol: "13" });
    expect(findingFor(req, "wine-alcohol-declared-comparison").findingStatus).toBe("FAIL");
  });

  it("keeps the actual-content rules not_run_external_dependency", () => {
    const req = request({});
    for (const id of [
      "wine-alcohol-actual-content-tolerance",
      "wine-alcohol-class-type-boundary",
      "wine-alcohol-omission-eligibility",
    ]) {
      const f = findingFor(req, id);
      expect(f.ruleExecutionStatus).toBe("not_run_external_dependency");
      expect(f.findingStatus).toBe("not_run");
      expect(f.externalEvidenceDependency).toBeTruthy();
    }
  });

  it("makes the brand rule not_run when brand evidence is insufficient", () => {
    const f = findingFor(
      request({ brand: obs(null, { state: "NOT_OBSERVED" }) }),
      "brand-name-canonical-comparison",
    );
    expect(f.ruleExecutionStatus).toBe("not_run_insufficient_evidence");
    expect(f.findingStatus).toBe("not_run");
  });

  it("makes syntax and declared comparison not_run when alcohol evidence is insufficient", () => {
    const req = request({ alcohol: obs(null, { state: "NOT_OBSERVED" }), alcoholProcessed: false });
    expect(findingFor(req, "wine-alcohol-syntax").ruleExecutionStatus).toBe(
      "not_run_insufficient_evidence",
    );
    expect(findingFor(req, "wine-alcohol-declared-comparison").ruleExecutionStatus).toBe(
      "not_run_insufficient_evidence",
    );
  });

  it("does not suppress low-confidence observations", () => {
    const req = request({
      brand: obs("M CELLARS", { state: "LOW_CONFIDENCE", confidence: 0.03 }),
    });
    const f = findingFor(req, "brand-name-canonical-comparison");
    expect(f.findingStatus).toBe("PASS");
    expect(f.evidenceReferences[0].observationState).toBe("LOW_CONFIDENCE");
    expect(f.evidenceReferences[0].confidence).toBe(0.03);
  });

  it("lets ambiguous observations reach rules and produce NEEDS_REVIEW", () => {
    const req = request({
      brand: obs("M CELLARS", {
        state: "AMBIGUOUS",
        alternates: [alt("N CELLARS", 0.4)],
      }),
    });
    expect(findingFor(req, "brand-name-canonical-comparison").findingStatus).toBe("NEEDS_REVIEW");
  });

  it("validates every finding through finding.schema", () => {
    for (const f of ok(request({})).findings) {
      expect(validateVerificationFinding(f).ok).toBe(true);
    }
  });

  it("returns findings in deterministic registry order", () => {
    const ids = ok(request({})).findings.map((f) => f.ruleId);
    expect(ids).toEqual(EXPECTED_MANIFEST.map((r) => r.ruleId));
  });

  it("serializes identical inputs identically", () => {
    expect(serializePrecheckResult(ok(request({})))).toBe(serializePrecheckResult(ok(request({}))));
  });
});

describe("boundary", () => {
  it("imports no report, UI, export, disposition, or OCR-extraction modules", () => {
    const dir = join(process.cwd(), "src/pipeline/precheck");
    for (const file of [
      "orchestrator.ts",
      "evidence-sufficiency.ts",
      "precheck.schema.ts",
      "precheck.types.ts",
      "wine-precheck.profile.ts",
    ]) {
      const source = readFileSync(join(dir, file), "utf8");
      const importPaths = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const path of importPaths) {
        expect(path).not.toMatch(
          /report|features|app\/|disposition|export|extractor|ocr-adapter|warning/,
        );
      }
    }
  });

  it("produces no overall status, percentage, timing, or disposition fields", () => {
    const serialized = serializePrecheckResult(ok(request({})));
    for (const banned of [
      "overallStatus",
      "compliancePercentage",
      "durationMs",
      "elapsed",
      "timing",
      "log",
      "disposition",
    ]) {
      expect(serialized).not.toContain(banned);
    }
  });

  it("rejects intake carrying an overall status or compliance percentage", () => {
    const bad = { ...request({}), overallStatus: "PASS" } as unknown;
    const result = runWinePrecheck(bad as PrecheckRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INTAKE");
  });

  it("rejects undeclared extra declared facts", () => {
    const req = request({});
    const bad = {
      ...req,
      declaredFacts: { ...req.declaredFacts, applicationVintage: fact("2021") },
    } as unknown;
    const result = runWinePrecheck(bad as PrecheckRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INTAKE");
  });

  it("does not mutate the immutable run (run creation input stays unchanged)", () => {
    const req = request({});
    const before = JSON.stringify(req.run);
    ok(req);
    expect(JSON.stringify(req.run)).toBe(before);
  });
});
