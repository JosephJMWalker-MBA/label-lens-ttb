import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { AnalyzerFieldObservation } from "@/pipeline/analyzer/analyzer.types";

import { evidenceReferenceFromObservation } from "./evidence-reference";
import { isValidExecutionFinding, validateVerificationFinding } from "./finding.schema";

const SHA = "6829add3d99c61851028b2422bdd9672bb975183d198de5e280bc961f4a489e7";
const AUTHORITY = { citation: "27 CFR 4.36", snapshotDate: "2026-07-10" };

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
      regionName: "alcohol",
      supportingPassIds: [`pass-${value}`],
      supportingPassKinds: ["full-image-primary"],
      recoveryPassUsed: false,
    },
    ranking: {
      strategy: "alcohol-ocr-evidence-comparator",
      orderingMode: "ocr-evidence-first",
      comparator: [
        { id: "ocr-evidence-score", direction: "desc", value: score },
        { id: "normalized-value-key", direction: "asc", value: value.toLowerCase() },
      ],
    },
  };
}

function validFinding(): Record<string, unknown> {
  return {
    ruleId: "wine-alcohol-syntax",
    ruleVersion: "1.0.0",
    profileId: "wine-precheck",
    profileVersion: "1.0.0",
    authority: { ...AUTHORITY },
    findingStatus: "PASS",
    ruleExecutionStatus: "executed",
    evidenceReferences: [
      {
        derivativeSha256: SHA,
        fieldId: "alcoholStatement",
        observationState: "OBSERVED",
        ocrEvidenceScore: 0.9,
        confidence: 0.9,
        geometry: geometry(),
      },
    ],
    message: "Alcohol statement is well formed.",
  };
}

describe("verification finding — required copied versions and authority", () => {
  it("copies rule, profile, and authority versions", () => {
    const result = validateVerificationFinding(validFinding());
    if (!result.ok) throw new Error(result.error.issues.join("; "));
    expect(result.value.ruleId).toBe("wine-alcohol-syntax");
    expect(result.value.ruleVersion).toBe("1.0.0");
    expect(result.value.profileId).toBe("wine-precheck");
    expect(result.value.profileVersion).toBe("1.0.0");
    expect(result.value.authority).toEqual(AUTHORITY);
  });

  it("uses the run-manifest authority shape (citation + snapshot/effective date)", () => {
    const finding = validFinding();
    (finding.authority as Record<string, string>).effectiveDate = "2026-01-01";
    expect(validateVerificationFinding(finding).ok).toBe(true);
  });

  it("rejects malformed semver and invalid authority dates", () => {
    const badVersion = validFinding();
    badVersion.ruleVersion = "1.0";
    expect(validateVerificationFinding(badVersion).ok).toBe(false);

    const badDate = validFinding();
    (badDate.authority as Record<string, string>).snapshotDate = "07/10/2026";
    expect(validateVerificationFinding(badDate).ok).toBe(false);
  });

  it("rejects a missing copied version", () => {
    const finding = validFinding();
    delete finding.profileVersion;
    expect(validateVerificationFinding(finding).ok).toBe(false);
  });
});

describe("verification finding — evidence references", () => {
  it("preserves hash, field, state, confidence, and geometry", () => {
    const result = validateVerificationFinding(validFinding());
    if (!result.ok) throw new Error("expected valid");
    const ref = result.value.evidenceReferences[0];
    expect(ref.derivativeSha256).toBe(SHA);
    expect(ref.fieldId).toBe("alcoholStatement");
    expect(ref.observationState).toBe("OBSERVED");
    expect(ref.ocrEvidenceScore).toBe(0.9);
    expect(ref.confidence).toBe(0.9);
    expect(ref.geometry).toEqual(geometry());
  });

  it("allows a low-confidence evidence reference to support an executed rule", () => {
    const finding = validFinding();
    (finding.evidenceReferences as Array<Record<string, unknown>>)[0].observationState =
      "LOW_CONFIDENCE";
    (finding.evidenceReferences as Array<Record<string, unknown>>)[0].ocrEvidenceScore = 0.08;
    (finding.evidenceReferences as Array<Record<string, unknown>>)[0].confidence = 0.08;
    const result = validateVerificationFinding(finding);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ruleExecutionStatus).toBe("executed");
  });

  it("rejects an invalid SHA-256 evidence reference", () => {
    const finding = validFinding();
    (finding.evidenceReferences as Array<Record<string, unknown>>)[0].derivativeSha256 = "nope";
    expect(validateVerificationFinding(finding).ok).toBe(false);
  });

  it("builds an evidence reference from an observation, preserving state and confidence", () => {
    const observation: AnalyzerFieldObservation = {
      state: "AMBIGUOUS",
      value: "12.5% ALC./VOL.",
      confidence: 0.5,
      ocrEvidenceScore: 0.5,
      geometry: geometry(),
      alternates: [alt("13% ALC./VOL.", 0.4)],
    };
    const ref = evidenceReferenceFromObservation(SHA, "alcoholStatement", observation);
    expect(ref).toEqual({
      derivativeSha256: SHA,
      fieldId: "alcoholStatement",
      observationState: "AMBIGUOUS",
      ocrEvidenceScore: 0.5,
      confidence: 0.5,
      geometry: geometry(),
    });
  });
});

describe("verification finding — status combinations", () => {
  it("accepts insufficient evidence as not_run_insufficient_evidence + not_run", () => {
    const finding = validFinding();
    finding.ruleExecutionStatus = "not_run_insufficient_evidence";
    finding.findingStatus = "not_run";
    finding.evidenceReferences = [];
    expect(validateVerificationFinding(finding).ok).toBe(true);
  });

  it("accepts an external dependency as not_run_external_dependency + not_run", () => {
    const finding = validFinding();
    finding.ruleExecutionStatus = "not_run_external_dependency";
    finding.findingStatus = "not_run";
    finding.externalEvidenceDependency = "actual alcohol content with provenance";
    finding.evidenceReferences = [];
    expect(validateVerificationFinding(finding).ok).toBe(true);
  });

  it("requires an external dependency reason for not_run_external_dependency", () => {
    const finding = validFinding();
    finding.ruleExecutionStatus = "not_run_external_dependency";
    finding.findingStatus = "not_run";
    finding.evidenceReferences = [];
    expect(validateVerificationFinding(finding).ok).toBe(false);
  });

  it("rejects invalid execution/finding combinations", () => {
    const executedNotRun = validFinding();
    executedNotRun.findingStatus = "not_run";
    expect(validateVerificationFinding(executedNotRun).ok).toBe(false);

    const externalPass = validFinding();
    externalPass.ruleExecutionStatus = "not_run_external_dependency";
    externalPass.externalEvidenceDependency = "x";
    expect(validateVerificationFinding(externalPass).ok).toBe(false);

    const insufficientFail = validFinding();
    insufficientFail.ruleExecutionStatus = "not_run_insufficient_evidence";
    insufficientFail.findingStatus = "FAIL";
    expect(validateVerificationFinding(insufficientFail).ok).toBe(false);
  });

  it("matches the isValidExecutionFinding table", () => {
    expect(isValidExecutionFinding("executed", "PASS")).toBe(true);
    expect(isValidExecutionFinding("error", "NEEDS_REVIEW")).toBe(true);
    expect(isValidExecutionFinding("executed", "not_run")).toBe(false);
    expect(isValidExecutionFinding("not_run_external_dependency", "PASS")).toBe(false);
  });
});

describe("verification finding — forbidden content and determinism", () => {
  it("rejects disposition, overall status, percentage, logs, and timings", () => {
    for (const key of [
      "humanDisposition",
      "overallStatus",
      "compliancePercentage",
      "logs",
      "stageTimings",
      "processedAt",
    ]) {
      const finding = validFinding();
      finding[key] = "x";
      expect(validateVerificationFinding(finding).ok).toBe(false);
    }
  });

  it("serializes identical findings deterministically", () => {
    const a = validateVerificationFinding(validFinding());
    const b = validateVerificationFinding(validFinding());
    if (!a.ok || !b.ok) throw new Error("expected valid");
    expect(JSON.stringify(a.value)).toBe(JSON.stringify(b.value));
  });
});

describe("rule/finding modules — no report or UI dependency", () => {
  it("import no report-builder or UI modules", () => {
    const files = [
      ["src/domain/verification", "finding.types.ts"],
      ["src/domain/verification", "finding.schema.ts"],
      ["src/domain/verification", "evidence-reference.ts"],
      ["src/domain/rules", "rule.types.ts"],
      ["src/domain/rules", "registry.ts"],
    ] as const;
    for (const [dir, file] of files) {
      const source = readFileSync(join(process.cwd(), dir, file), "utf8");
      const importPaths = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const path of importPaths) {
        expect(path).not.toMatch(/report|features|app\/|\/ui\b|build-report/);
      }
    }
  });
});
