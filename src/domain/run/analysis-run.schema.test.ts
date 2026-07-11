import { describe, expect, it } from "vitest";

import { createAnalysisRun } from "./analysis-run";
import type { AnalysisRunCreationInput } from "./analysis-run.types";

const DERIVATIVE_SHA = "6829add3d99c61851028b2422bdd9672bb975183d198de5e280bc961f4a489e7";

function validInput(): AnalysisRunCreationInput {
  return {
    runId: "run-0001",
    createdAt: "2026-07-10T00:00:00Z",
    product: { productId: "prod", revisionId: "rev-1" },
    sourceArtifact: { artifactId: "cola-24205001000905", sha256: null },
    sanitizedDerivative: { derivativeId: "d1", path: "label.png", sha256: DERIVATIVE_SHA },
    declaredFacts: {
      brandName: {
        value: "M CELLARS",
        provenance: {
          sourceType: "public-certificate-form-field",
          sourceReference: "24205001000905",
          recordedBy: "op",
          recordedAt: "2026-07-10T00:00:00Z",
        },
      },
      alcoholValue: {
        value: "13% ALC./VOL.",
        provenance: {
          sourceType: "operator-entered",
          sourceReference: "op-input",
          recordedBy: "op",
          recordedAt: "2026-07-10T00:00:00Z",
        },
      },
    },
    versionManifest: {
      sourceArtifactSha256: null,
      sanitizedDerivativeSha256: DERIVATIVE_SHA,
      extractionAdapterId: "pending",
      extractionAdapterVersion: "0.0.0",
      ocrEngine: { kind: "not_applicable" },
      parserId: "pending",
      parserVersion: "0.0.0",
      ruleProfileId: "wine-precheck",
      ruleProfileVersion: "0.0.0",
      rules: [{ ruleId: "wine-alcohol-syntax", version: "0.0.0" }],
      authorities: [{ citation: "27 CFR 4.36", snapshotDate: "2026-07-10" }],
      applicationBuild: { packageVersion: "0.1.0", gitCommitSha: "4974d03" },
    },
    checkIds: ["brand-name", "wine-alcohol-syntax"],
  };
}

function expectRejected(mutate: (input: AnalysisRunCreationInput) => void) {
  const input = validInput();
  mutate(input);
  const result = createAnalysisRun(input);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
  return result;
}

describe("analysis run input validation", () => {
  it("accepts a well-formed input", () => {
    expect(createAnalysisRun(validInput()).ok).toBe(true);
  });

  it("rejects an invalid derivative SHA-256", () => {
    expectRejected((i) => {
      i.sanitizedDerivative.sha256 = "not-a-hash";
    });
  });

  it("rejects a claimed source hash that is not a valid SHA-256", () => {
    expectRejected((i) => {
      i.versionManifest.sourceArtifactSha256 = "xyz";
    });
  });

  it("rejects a non-semantic version", () => {
    expectRejected((i) => {
      i.versionManifest.parserVersion = "1.0";
    });
  });

  it("rejects an authority snapshot date that is not ISO YYYY-MM-DD", () => {
    expectRejected((i) => {
      i.versionManifest.authorities[0].snapshotDate = "07/10/2026";
    });
  });

  it("rejects an out-of-range authority date", () => {
    expectRejected((i) => {
      i.versionManifest.authorities[0].snapshotDate = "2026-13-40";
    });
  });

  it("rejects an unknown declared-fact source type", () => {
    expectRejected((i) => {
      (i.declaredFacts.brandName.provenance as { sourceType: string }).sourceType = "made-up";
    });
  });

  it("rejects an unknown extra field (strict contract)", () => {
    expectRejected((i) => {
      (i as unknown as Record<string, unknown>).overallStatus = "PASS";
    });
  });

  it("requires at least one rule and one authority in the version manifest", () => {
    expectRejected((i) => {
      i.versionManifest.rules = [];
    });
    expectRejected((i) => {
      i.versionManifest.authorities = [];
    });
  });
});
