import { describe, expect, it } from "vitest";

import type { AnalysisRun } from "@/domain/run/analysis-run.types";

import { assemblePrecheckResult, type AssembleInput } from "./assemble";
import { buildAnalyzer, buildAssembleInput, buildRun } from "./build.fixtures";

/**
 * Cross-layer executable-provenance reconciliation. Each case mutates exactly
 * one layer away from the single canonical expected provenance and asserts a
 * specific typed rejection — never derived from the mutated object itself.
 */

function withManifest(
  input: AssembleInput,
  mutate: (m: AnalysisRun["versionManifest"]) => AnalysisRun["versionManifest"],
): AssembleInput {
  const run = input.run;
  return { ...input, run: { ...run, versionManifest: mutate(run.versionManifest) } };
}

function expectReject(input: AssembleInput, code: string) {
  const result = assemblePrecheckResult(input);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

describe("assembler cross-layer provenance reconciliation — rejects each mismatch", () => {
  it("rejects an extraction adapter version mismatch", () => {
    expectReject(
      withManifest(buildAssembleInput(), (m) => ({ ...m, extractionAdapterVersion: "2.0.0" })),
      "EXTRACTION_ADAPTER_VERSION_MISMATCH",
    );
  });

  it("rejects an OCR engine version mismatch", () => {
    expectReject(
      withManifest(buildAssembleInput(), (m) => ({
        ...m,
        ocrEngine: { ...m.ocrEngine, engineVersion: "9.9.9" } as typeof m.ocrEngine,
      })),
      "OCR_ENGINE_VERSION_MISMATCH",
    );
  });

  it("rejects an OCR model digest mismatch", () => {
    expectReject(
      withManifest(buildAssembleInput(), (m) => ({
        ...m,
        ocrEngine: { ...m.ocrEngine, modelSha256: "b".repeat(64) } as typeof m.ocrEngine,
      })),
      "OCR_MODEL_IDENTITY_MISMATCH",
    );
  });

  it("rejects a parser version mismatch", () => {
    expectReject(
      withManifest(buildAssembleInput(), (m) => ({ ...m, parserVersion: "2.0.0" })),
      "PARSER_VERSION_MISMATCH",
    );
  });

  it("rejects a profile version mismatch", () => {
    expectReject(
      withManifest(buildAssembleInput(), (m) => ({ ...m, ruleProfileVersion: "2.0.0" })),
      "PROFILE_VERSION_MISMATCH",
    );
  });

  it("rejects a single rule version mismatch", () => {
    expectReject(
      withManifest(buildAssembleInput(), (m) => ({
        ...m,
        rules: m.rules.map((r, i) => (i === 0 ? { ...r, version: "9.9.9" } : r)),
      })),
      "RULE_VERSION_MISMATCH",
    );
  });

  it("rejects a single authority date mismatch", () => {
    expectReject(
      withManifest(buildAssembleInput(), (m) => ({
        ...m,
        authorities: m.authorities.map((a, i) =>
          i === 0 ? { ...a, snapshotDate: "2020-01-01" } : a,
        ),
      })),
      "AUTHORITY_VERSION_MISMATCH",
    );
  });

  it("rejects an application build identity mismatch", () => {
    expectReject(
      withManifest(buildAssembleInput(), (m) => ({
        ...m,
        applicationBuild: { ...m.applicationBuild, packageVersion: "9.9.9" },
      })),
      "APPLICATION_BUILD_IDENTITY_MISMATCH",
    );
  });

  it("rejects a source artifact hash mismatch", () => {
    const input = buildAssembleInput();
    const run = {
      ...input.run,
      sourceArtifact: { ...input.run.sourceArtifact, sha256: "2".repeat(64) },
    };
    expectReject({ ...input, run }, "SOURCE_ARTIFACT_IDENTITY_MISMATCH");
  });

  it("rejects a derivative artifact hash mismatch (analyzer disagrees)", () => {
    const analyzer = buildAnalyzer();
    const mismatched = {
      ...analyzer,
      provenance: { ...analyzer.provenance, derivativeSha256: "3".repeat(64) },
    };
    expectReject(
      buildAssembleInput({ analyzer: mismatched }),
      "DERIVATIVE_ARTIFACT_IDENTITY_MISMATCH",
    );
  });

  it("accepts the fully consistent canonical input", () => {
    const result = assemblePrecheckResult(buildAssembleInput());
    expect(result.ok).toBe(true);
  });

  it("preserves the same OCR engine/model identity across run, analyzer, and result", () => {
    const result = assemblePrecheckResult(buildAssembleInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const run = buildRun();
    const manifestOcr = result.value.versionManifest.ocrEngine;
    const analyzerOcr = result.value.observations.provenance.ocrEngine;
    expect(manifestOcr).toEqual(run.versionManifest.ocrEngine);
    if (manifestOcr.kind === "ocr" && analyzerOcr.kind === "ocr") {
      expect(analyzerOcr.modelId).toBe(manifestOcr.modelId);
      expect(analyzerOcr.modelSha256).toBe(manifestOcr.modelSha256);
    }
  });
});
