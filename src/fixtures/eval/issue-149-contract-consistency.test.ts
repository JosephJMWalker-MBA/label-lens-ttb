/**
 * Issue #149 — Stage 1 contract-consistency sweep.
 *
 * Non-OCR. Fails if a CURRENT, non-historical contract still describes the
 * superseded design. Historical amendment records are allowed to contain the old
 * language, because that is their job.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = "artifacts/issue-149-brand-complete-evidence-acquisition";

/** Records whose purpose is to preserve superseded language. */
const HISTORICAL_FILES = new Set([
  "preregistration-amendment.md",
  "preregistration-amendment-2.md",
  "amendment-linkage.json",
  "amendment-2-linkage.json",
  "git-sha.txt",
]);

/**
 * A line may mention a superseded term when it is explicitly marking it as
 * prohibited, corrected or historical. This is what separates "we still do
 * this" from "we must not do this".
 */
const ALLOWED_MARKERS = [
  "prohibit",
  "Prohibit",
  "never",
  "Never",
  "historical",
  "Historical",
  "historicalNote",
  "correctionOf",
  "corrected",
  "superseded",
  "not use",
  "notPresentIn",
  "priorClaim",
  "whyWrong",
  "PreviousStatement",
  "does not use",
];

const STALE_TERMS = [
  "runCaseArtifacts",
  "ExtractionDebug.finalSelections.brand.brandDiagnostics.candidates",
  "single recorded filterReason",
  "short-circuit blocker",
  "capability3 partially satisfied",
  "PARTIALLY satisfied",
  "raw/<run>/<caseId>",
  "per-pass caseId",
  "8f0c6a7ca7c271eed14d9084ed6da7fe11f897a9",
];

function walk(dir: string): string[] {
  return readdirSync(path.join(process.cwd(), dir)).flatMap((entry) => {
    const relative = path.join(dir, entry);
    return statSync(path.join(process.cwd(), relative)).isDirectory() ? walk(relative) : [relative];
  });
}

describe("Issue #149 Stage 1 contract consistency", () => {
  const files = walk(ROOT).filter((f) => /\.(json|md|sh|txt)$/.test(f));

  it("sweeps a non-trivial set of governed artifacts", () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  it("leaves no superseded design language in a current contract", () => {
    const offences: string[] = [];
    for (const file of files) {
      if (HISTORICAL_FILES.has(path.basename(file))) continue;
      const lines = readFileSync(path.join(process.cwd(), file), "utf8").split("\n");
      lines.forEach((line, index) => {
        for (const term of STALE_TERMS) {
          if (!line.includes(term)) continue;
          // Prose wraps and JSON arrays put the term on a bare line, so the
          // marker is looked for in a small window rather than on the exact
          // line. The window is deliberately tight: it admits a wrapped
          // prohibition, not a distant unrelated one.
          const window = lines.slice(Math.max(0, index - 2), index + 3).join(" ");
          if (ALLOWED_MARKERS.some((marker) => window.includes(marker))) continue;
          offences.push(`${file}:${index + 1} — "${term}"`);
        }
      });
    }
    expect(offences).toEqual([]);
  });

  it("states the current base everywhere it states a base", () => {
    const current = "546c3f279ce431a1fd8c0203df7a83553ea866ef";
    const freeze = JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "population-freeze.json"), "utf8"),
    );
    const incumbent = JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "incumbent-configuration-freeze.json"), "utf8"),
    );
    expect(freeze.base).toBe(current);
    expect(incumbent.base).toBe(current);
  });

  it("names the direct extractor route and prohibits the harness route", () => {
    const contract = JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "acquisition-invocation-contract.json"), "utf8"),
    );
    expect(contract.route).toBe("direct call to extractLabelEvidenceDetailed");
    expect(contract.prohibitedRoute.symbols).toContain("runCaseArtifacts");
    expect(contract.prohibitedRoute.modules).toContain("src/fixtures/eval/**");
    expect(contract.extractionInputBinding.artifactRef).toContain("opaqueItemId");
  });

  it("obtains complete diagnostics by an exact-pass-set call, not from debug", () => {
    const parity = JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "brand-diagnostic-parity-contract.json"), "utf8"),
    );
    expect(parity.howCompleteDiagnosticsAreObtained.unconditionalAllPassesProhibited).toBe(true);
    expect(parity.parityAssertion.haltCode).toBe("BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE");
    expect(parity.parityAssertion.authority).toContain("debug.finalSelections.brand");
    expect(parity.candidateEvidenceSource.isThe).toContain("diagnosticSelection");
  });

  it("records the first-reason-only limitation as resolved, not current", () => {
    const decision = JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "decision-rules.json"), "utf8"),
    );
    const capability =
      decision.evidenceCompletenessVerdict.expectedOutcomeStatedInAdvance.capability3;
    expect(capability).toContain("SATISFIED");
    expect(capability).not.toContain("PARTIALLY");
  });

  it("compares the complete diagnostics arrays for determinism", () => {
    const determinism = JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "determinism-rules.json"), "utf8"),
    );
    const candidateLevel = determinism.comparisonLevels.find(
      (level: { level: string }) => level.level === "candidate decisions",
    );
    expect(candidateLevel.compare).toContain("filterChecks");
    expect(candidateLevel.compare).toContain("activeRejectionReasons");
  });

  it("describes the Stage 1 isolation tests as static, not runtime proof", () => {
    const plan = JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "truth-isolation-plan.json"), "utf8"),
    );
    expect(plan.stage1TestsAre.isRuntimeProof).toBe(false);
    expect(plan.stage1TestsAre.kind).toContain("static");
  });

  it("uses retention-bound language for the 100 MB fallback", () => {
    const volume = JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "evidence-volume-rule.json"), "utf8"),
    );
    expect(volume.retentionLanguage.required).toBe("temporarily retained workflow artifact");
    expect(volume.retentionLanguage.prohibited).toBe("permanently preserved");
    expect(volume.above100MBProcedure.join(" ")).toContain("stop before post-freeze truth");
  });
});
