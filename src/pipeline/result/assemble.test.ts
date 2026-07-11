import { describe, expect, it } from "vitest";

import { assemblePrecheckResult } from "./assemble";
import { buildAnalyzer, buildAssembleInput, buildOrchestration, fact } from "./build.fixtures";
import { validatePrecheckResult } from "./result.schema";

function assembled() {
  const result = assemblePrecheckResult(buildAssembleInput());
  if (!result.ok) throw new Error(`assembly failed: ${JSON.stringify(result.error)}`);
  return result.value;
}

describe("assemblePrecheckResult — success", () => {
  it("assembles the M Cellars pre-check output", () => {
    const r = assembled();
    expect(r.mode).toBe("wine-precheck");
    expect(r.resultSchemaVersion).toBe("precheck-result.v1");
    expect(r.machineResultId).toMatch(/^precheck-result\.v1-[0-9a-f]{64}$/);
  });

  it("preserves the profile identity and exact six-rule manifest", () => {
    const r = assembled();
    expect(r.profile.id).toBe("wine-precheck");
    expect(r.profile.version).toBe("1.0.0");
    expect(r.profile.ruleManifest.map((x) => x.ruleId)).toEqual([
      "wine-alcohol-syntax",
      "brand-name-canonical-comparison",
      "wine-alcohol-declared-comparison",
      "wine-alcohol-actual-content-tolerance",
      "wine-alcohol-class-type-boundary",
      "wine-alcohol-omission-eligibility",
    ]);
  });

  it("preserves two independent evidence assessments", () => {
    const r = assembled();
    expect(r.evidenceAssessments.map((a) => a.checkId).sort()).toEqual([
      "brand-name-check",
      "wine-alcohol-check",
    ]);
  });

  it("preserves observation evidence semantics and provenance", () => {
    const r = assembled();
    expect(r.observations.brandName).toMatchObject({
      state: "OBSERVED",
      value: "M CELLARS",
      rawText: "M CELLARS",
    });
    expect(r.observations.brandName.geometry).toBeDefined();
    expect(r.observations.alcoholStatement.value).toBe("12.5% ALC./VOL.");
    expect(r.observations.provenance.derivativeSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps findings in registry order with the three actual-content rules not_run", () => {
    const r = assembled();
    expect(r.findings.map((f) => f.ruleId)).toEqual(r.profile.ruleManifest.map((x) => x.ruleId));
    for (const id of [
      "wine-alcohol-actual-content-tolerance",
      "wine-alcohol-class-type-boundary",
      "wine-alcohol-omission-eligibility",
    ]) {
      expect(r.findings.find((f) => f.ruleId === id)!.ruleExecutionStatus).toBe(
        "not_run_external_dependency",
      );
    }
  });

  it("keeps declared and observed brand/alcohol as separate records", () => {
    const r = assembled();
    expect(r.declaredFacts.applicationBrandName.value).toBe("M CELLARS");
    expect(r.observations.brandName.value).toBe("M CELLARS");
    // Separate objects, not aliases.
    expect(r.declaredFacts.applicationBrandName).not.toBe(r.observations.brandName);
    expect(r.declaredFacts.applicationAlcoholValue.value).toBe("12.5");
    expect(r.observations.alcoholStatement.value).toBe("12.5% ALC./VOL.");
  });

  it("carries the version manifest and advisory notice, and starts with empty disposition", () => {
    const r = assembled();
    expect(r.versionManifest.ruleProfileId).toBe("wine-precheck");
    expect(r.advisoryNotice.noticeId).toBe("precheck-advisory-notice");
    expect(r.humanDispositionHistory).toEqual([]);
  });

  it("produces a deeply immutable result", () => {
    const r = assembled();
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.findings)).toBe(true);
    expect(() => {
      (r.findings as unknown as unknown[]).push({});
    }).toThrow();
  });

  it("carries no overall status, percentage, or aggregate score", () => {
    const serialized = JSON.stringify(assembled());
    for (const banned of [
      "overallStatus",
      "compliancePercentage",
      "readinessScore",
      "aggregateScore",
      "durationMs",
    ]) {
      expect(serialized).not.toContain(banned);
    }
  });
});

describe("assemblePrecheckResult — integrity rejection", () => {
  it("rejects a profile mismatch", () => {
    const input = buildAssembleInput();
    const orchestration = { ...input.orchestration, profileVersion: "9.9.9" };
    const result = assemblePrecheckResult({ ...input, orchestration });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PROFILE_VERSION_MISMATCH");
  });

  it("rejects a rule-manifest mismatch", () => {
    const input = buildAssembleInput();
    const orchestration = {
      ...input.orchestration,
      ruleManifest: [...input.orchestration.ruleManifest].reverse(),
    };
    const result = assemblePrecheckResult({ ...input, orchestration });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RULE_VERSION_MISMATCH");
  });

  it("rejects an artifact-hash mismatch", () => {
    const analyzer = buildAnalyzer();
    const mismatched = {
      ...analyzer,
      provenance: { ...analyzer.provenance, derivativeSha256: "1".repeat(64) },
    };
    const input = buildAssembleInput({
      analyzer: mismatched,
      orchestration: buildOrchestration(buildAnalyzer()),
    });
    const result = assemblePrecheckResult(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DERIVATIVE_ARTIFACT_IDENTITY_MISMATCH");
  });

  it("rejects a declared-fact mismatch", () => {
    const input = buildAssembleInput({
      declaredFacts: {
        applicationBrandName: fact("OTHER BRAND"),
        applicationAlcoholValue: fact("12.5"),
      },
    });
    const result = assemblePrecheckResult(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DECLARED_FACT_MISMATCH");
  });

  it("rejects an unresolved evidence reference", () => {
    const input = buildAssembleInput();
    const findings = input.orchestration.findings.map((f) =>
      f.evidenceReferences.length
        ? {
            ...f,
            evidenceReferences: [
              { ...f.evidenceReferences[0], observationState: "NOT_OBSERVED" as const },
            ],
          }
        : f,
    );
    const result = assemblePrecheckResult({
      ...input,
      orchestration: { ...input.orchestration, findings },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNRESOLVED_EVIDENCE_REFERENCE");
  });

  it("rejects a malformed finding", () => {
    const input = buildAssembleInput();
    const findings = input.orchestration.findings.map((f, i) =>
      i === 0 ? { ...f, ruleVersion: "not-semver" } : f,
    );
    const result = assemblePrecheckResult({
      ...input,
      orchestration: { ...input.orchestration, findings },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_FINDING");
  });

  it("rejects unknown fields via the strict result schema", () => {
    const ok = assemblePrecheckResult(buildAssembleInput());
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const tampered = { ...ok.value, unexpectedField: true } as unknown;
    const check = validatePrecheckResult(tampered);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error.code).toBe("INVALID_RESULT_SHAPE");
  });
});
