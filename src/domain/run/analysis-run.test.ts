import { describe, expect, it } from "vitest";

import {
  appendDisposition,
  createAnalysisRun,
  serializeAnalysisRun,
  updateCheck,
  withProcessingStatus,
} from "./analysis-run";
import type { AnalysisRunCreationInput } from "./analysis-run.types";

const DERIVATIVE_SHA = "6829add3d99c61851028b2422bdd9672bb975183d198de5e280bc961f4a489e7";

function validInput(): AnalysisRunCreationInput {
  return {
    runId: "run-0001",
    createdAt: "2026-07-10T00:00:00Z",
    product: { productId: "prod-mcellars-teroldego", revisionId: "rev-1" },
    sourceArtifact: { artifactId: "cola-24205001000905", sha256: null },
    sanitizedDerivative: {
      derivativeId: "m-cellars-24205001000905",
      path: "tests/fixtures/precheck/m-cellars-24205001000905/label.png",
      sha256: DERIVATIVE_SHA,
    },
    declaredFacts: {
      brandName: {
        value: "M CELLARS",
        provenance: {
          sourceType: "public-certificate-form-field",
          sourceReference: "24205001000905",
          recordedBy: "test-operator",
          recordedAt: "2026-07-10T00:00:00Z",
        },
      },
      alcoholValue: {
        // Synthetic operator-entered value, deliberately NOT the artifact-observed 12.5%.
        value: "13% ALC./VOL.",
        provenance: {
          sourceType: "operator-entered",
          sourceReference: "operator-test-input",
          recordedBy: "test-operator",
          recordedAt: "2026-07-10T00:00:00Z",
          note: "synthetic operator value; independent of observed artwork truth",
        },
      },
    },
    versionManifest: {
      sourceArtifactSha256: null,
      sanitizedDerivativeSha256: DERIVATIVE_SHA,
      extractionAdapterId: "pending-extraction-adapter",
      extractionAdapterVersion: "0.0.0",
      ocrEngine: { kind: "not_applicable" },
      parserId: "pending-parser",
      parserVersion: "0.0.0",
      ruleProfileId: "wine-precheck",
      ruleProfileVersion: "0.0.0",
      rules: [{ ruleId: "wine-alcohol-syntax", version: "0.0.0" }],
      authorities: [{ citation: "27 CFR 4.36", snapshotDate: "2026-07-10" }],
      applicationBuild: { packageVersion: "0.1.0" },
    },
    checkIds: ["brand-name", "wine-alcohol-syntax"],
  };
}

function createOrThrow() {
  const result = createAnalysisRun(validInput());
  if (!result.ok) throw new Error(`expected valid run: ${result.error.issues.join("; ")}`);
  return result.value;
}

describe("createAnalysisRun", () => {
  it("creates a run in 'created' status with checks initialized insufficient / not_run", () => {
    const run = createOrThrow();
    expect(run.processingStatus).toBe("created");
    expect(run.dispositionHistory).toEqual([]);
    for (const check of run.checks) {
      expect(check.evidenceStatus).toBe("insufficient");
      expect(check.ruleExecutionStatus).toBe("not_run_insufficient_evidence");
      expect(check.findingStatus).toBe("not_run");
      expect(check.findingRef).toBeNull();
    }
  });

  it("cannot mutate the version manifest after creation", () => {
    const run = createOrThrow();
    expect(() => {
      run.versionManifest.parserVersion = "9.9.9";
    }).toThrow();
    expect(run.versionManifest.parserVersion).toBe("0.0.0");
  });

  it("cannot mutate declared facts after creation", () => {
    const run = createOrThrow();
    expect(() => {
      run.declaredFacts.alcoholValue.value = "99% ALC./VOL.";
    }).toThrow();
    expect(run.declaredFacts.alcoholValue.value).toBe("13% ALC./VOL.");
  });

  it("keeps declared application facts separate from observed artwork truth", () => {
    const run = createOrThrow();
    // The contract never imports the artifact-observed 12.5%; declared value is operator-supplied.
    expect(run.declaredFacts.alcoholValue.value).not.toBe("12.5% ALC./VOL.");
    expect(run.declaredFacts.alcoholValue.provenance.sourceType).toBe("operator-entered");
  });
});

describe("per-check status independence", () => {
  it("evidence status is per check, not global", () => {
    const run = updateCheck(createOrThrow(), "brand-name", { evidenceStatus: "sufficient" });
    const brand = run.checks.find((c) => c.checkId === "brand-name");
    const alcohol = run.checks.find((c) => c.checkId === "wine-alcohol-syntax");
    expect(brand?.evidenceStatus).toBe("sufficient");
    expect(alcohol?.evidenceStatus).toBe("insufficient");
  });

  it("rule execution state is independent per check", () => {
    let run = createOrThrow();
    run = updateCheck(run, "brand-name", {
      evidenceStatus: "sufficient",
      ruleExecutionStatus: "executed",
      findingStatus: "PASS",
    });
    const brand = run.checks.find((c) => c.checkId === "brand-name");
    const alcohol = run.checks.find((c) => c.checkId === "wine-alcohol-syntax");
    expect(brand?.ruleExecutionStatus).toBe("executed");
    expect(alcohol?.ruleExecutionStatus).toBe("not_run_insufficient_evidence");
  });

  it("a check carries no image-quality or extraction-confidence data", () => {
    const run = createOrThrow();
    expect(Object.keys(run.checks[0]).sort()).toEqual([
      "checkId",
      "evidenceStatus",
      "findingRef",
      "findingStatus",
      "ruleExecutionStatus",
    ]);
  });
});

describe("processing status and disposition history", () => {
  it("advances processing status into a new frozen run", () => {
    const run = withProcessingStatus(createOrThrow(), "extracting");
    expect(run.processingStatus).toBe("extracting");
  });

  it("appends human disposition history without mutating prior entries", () => {
    const run0 = createOrThrow();
    const run1 = appendDisposition(run0, {
      outcome: "ESCALATED_FOR_REVIEW",
      decidedBy: "reviewer-a",
      decidedAt: "2026-07-10T01:00:00Z",
    });
    const run2 = appendDisposition(run1, {
      outcome: "CONFIRMED_FINDINGS",
      decidedBy: "reviewer-b",
      decidedAt: "2026-07-10T02:00:00Z",
    });
    expect(run0.dispositionHistory).toHaveLength(0);
    expect(run2.dispositionHistory).toHaveLength(2);
    expect(run2.dispositionHistory[0].outcome).toBe("ESCALATED_FOR_REVIEW");
    expect(() => {
      run2.dispositionHistory.push({
        outcome: "CONFIRMED_FINDINGS",
        decidedBy: "x",
        decidedAt: "2026-07-10T03:00:00Z",
      });
    }).toThrow();
  });
});

describe("determinism boundary", () => {
  it("has no overall status or compliance percentage", () => {
    const run = createOrThrow();
    const keys = Object.keys(run).join(" ");
    expect(keys).not.toMatch(/overall|percent|score|compliance/i);
  });

  it("serializes identical input to an identical contract, free of timing/log/perf data", () => {
    const a = serializeAnalysisRun(createOrThrow());
    const b = serializeAnalysisRun(createOrThrow());
    expect(a).toBe(b);
    expect(a).not.toMatch(/timing|stageTimings|elapsed|durationMs|log|perf/i);
  });
});
