/**
 * Issue #149 — the parsed Stage 2 source-closure analyzer.
 *
 * Non-OCR. Every closure here is synthetic source text; nothing is built or run.
 * Job A uses this same implementation, so the gate that will run before
 * acquisition is the gate these tests exercise.
 */
import { describe, expect, it } from "vitest";

import {
  AUTHORIZED_ADAPTER_MODULE,
  REQUIRED_ACQUISITION_CALL,
  analyzeStage2SourceClosure,
  type Stage2SourceFile,
} from "../../../scripts/eval/lib/issue-149-stage2-source-closure";

const RUNNER = "scripts/eval/issue-149-brand-evidence-acquisition-run.ts";

const CLEAN_RUNNER = `
import { acquireProductionBrandEvidence } from "./lib/issue-149-candidate-adapter";
export async function acquireItem(extractionInput) {
  const evidence = await acquireProductionBrandEvidence(extractionInput);
  if (!evidence.ok) return persistFailure(evidence.error);
  persistPasses(evidence.value.detailed.debug.passes);
  persistCandidates(evidence.value.candidateRecords);
}
`;

/** A legitimate helper: hashing and manifest writing, no acquisition call. */
const HASHING_HELPER = `
import { createHash } from "node:crypto";
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function writeManifest(files) {
  return files.map((file) => ({ path: file.path, sha256: sha256(file.bytes) }));
}
`;

/** Another legitimate helper: reads passes to validate them, writes nothing. */
const PASS_VALIDATION_HELPER = `
export function validatePasses(detailed) {
  const count = detailed.debug.passes.length;
  if (count === 0) throw new Error("PASS_EVIDENCE_TRUNCATED");
  return count;
}
`;

const analyze = (files: Stage2SourceFile[]) =>
  analyzeStage2SourceClosure({ runnerEntryPath: RUNNER, files });

const rules = (report: ReturnType<typeof analyze>) => report.violations.map((v) => v.rule);

describe("Issue #149 Stage 2 source-closure analyzer", () => {
  it("passes a clean runner plus legitimate helpers that never call the API", () => {
    // The Amendment 10 detector required EVERY inspected file to invoke the
    // acquisition API, which would have rejected both of these helpers.
    const report = analyze([
      { path: RUNNER, contents: CLEAN_RUNNER },
      { path: "scripts/eval/lib/hashing.ts", contents: HASHING_HELPER },
      { path: "scripts/eval/lib/pass-validation.ts", contents: PASS_VALIDATION_HELPER },
    ]);
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.haltCode).toBeNull();
    expect(report.acquisitionCallSites).toEqual([RUNNER]);
    expect(report.filesAnalyzed).toBe(3);
  });

  it("rejects a runner that never invokes the acquisition API", () => {
    const report = analyze([
      { path: RUNNER, contents: "export function acquireItem() { return null; }" },
    ]);
    expect(rules(report)).toContain("RUNNER_DOES_NOT_INVOKE_ACQUISITION");
    expect(report.haltCode).toBe("STAGE2_SOURCE_CLOSURE_VIOLATION");
  });

  it("rejects a second acquisition call", () => {
    const twice = `${CLEAN_RUNNER}\nexport const again = (i) => acquireProductionBrandEvidence(i);`;
    expect(rules(analyze([{ path: RUNNER, contents: twice }]))).toContain(
      "RUNNER_INVOKES_ACQUISITION_MORE_THAN_ONCE",
    );
  });

  it("rejects an acquisition call outside the runner entrypoint", () => {
    const report = analyze([
      { path: RUNNER, contents: CLEAN_RUNNER },
      {
        path: "scripts/eval/lib/sneaky.ts",
        contents: "export const go = (i) => acquireProductionBrandEvidence(i);",
      },
    ]);
    expect(rules(report)).toContain("ACQUISITION_INVOKED_OUTSIDE_RUNNER");
  });

  it("rejects a helper that calls the extractor directly", () => {
    const report = analyze([
      { path: RUNNER, contents: CLEAN_RUNNER },
      {
        path: "scripts/eval/lib/direct.ts",
        contents:
          'import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";\nexport const run = (i) => extractLabelEvidenceDetailed(i);',
      },
    ]);
    expect(rules(report)).toContain("PROHIBITED_CALL");
    expect(report.violations.some((v) => v.detail.includes("extractLabelEvidenceDetailed"))).toBe(
      true,
    );
  });

  it("rejects a helper that calls a selector directly", () => {
    for (const selector of [
      "selectBrandObservation",
      "selectBrandObservationWithCompleteFilterDiagnostics",
    ]) {
      const report = analyze([
        { path: RUNNER, contents: CLEAN_RUNNER },
        { path: "scripts/eval/lib/sel.ts", contents: `export const s = (p) => ${selector}(p);` },
      ]);
      expect(report.violations.some((v) => v.detail.includes(selector))).toBe(true);
    }
  });

  it("rejects a helper that filters or reorders the passes", () => {
    const report = analyze([
      { path: RUNNER, contents: CLEAN_RUNNER },
      {
        path: "scripts/eval/lib/reorder.ts",
        contents:
          "export function reorder(detailed) {\n  detailed.debug.passes = detailed.debug.passes.slice(0, 1);\n  return detailed;\n}",
      },
    ]);
    expect(rules(report)).toContain("PROHIBITED_WRITE");
    expect(report.violations.some((v) => v.detail.includes("passes"))).toBe(true);
  });

  it("rejects a helper that reconstructs the selections", () => {
    const report = analyze([
      { path: RUNNER, contents: CLEAN_RUNNER },
      {
        path: "scripts/eval/lib/rebuild.ts",
        contents:
          "export const rebuild = (d) => ({ ...d, primarySelections: d.primarySelections, finalSelections: rebuiltBrand });",
      },
    ]);
    expect(rules(report)).toContain("PROHIBITED_WRITE");
  });

  it("rejects a helper that replaces brandDiagnostics.candidates", () => {
    const report = analyze([
      { path: RUNNER, contents: CLEAN_RUNNER },
      {
        path: "scripts/eval/lib/filter.ts",
        contents:
          "export function narrow(selection) {\n  selection.brandDiagnostics.candidates = selection.brandDiagnostics.candidates.filter((c) => c.kept);\n  return selection;\n}",
      },
    ]);
    expect(rules(report)).toContain("PROHIBITED_WRITE");
    expect(report.violations.some((v) => v.detail.includes("candidates"))).toBe(true);
  });

  it("rejects a hidden candidate-finalization call", () => {
    for (const call of [
      "finalizeCandidateRecord",
      "toCandidateEvidenceRecord",
      "finalizeProductionCandidate",
      "finalizeProductionCandidateArray",
      "stableCandidateId",
    ]) {
      const report = analyze([
        { path: RUNNER, contents: CLEAN_RUNNER },
        { path: "scripts/eval/lib/emit.ts", contents: `export const e = (c) => ${call}(c);` },
      ]);
      expect(report.violations.some((v) => v.detail.includes(call))).toBe(true);
    }
  });

  it("distinguishes a call from a mention", () => {
    // A comment or a string naming a prohibited symbol is not a call. The
    // substring detector this replaces could not tell the difference.
    const report = analyze([
      { path: RUNNER, contents: CLEAN_RUNNER },
      {
        path: "scripts/eval/lib/docs.ts",
        contents:
          '// The runner must never call extractLabelEvidenceDetailed itself.\nexport const NOTE = "selectBrandObservationWithCompleteFilterDiagnostics is adapter-only";',
      },
    ]);
    expect(report.violations).toEqual([]);
  });

  it("exempts the adapter module, which defines the machinery", () => {
    const report = analyze([
      { path: RUNNER, contents: CLEAN_RUNNER },
      {
        path: AUTHORIZED_ADAPTER_MODULE,
        contents:
          "export const x = () => selectBrandObservationWithCompleteFilterDiagnostics(passes) && extractLabelEvidenceDetailed(i);",
      },
    ]);
    expect(report.violations).toEqual([]);
  });

  it("reports a missing runner entrypoint", () => {
    const report = analyze([{ path: "scripts/eval/lib/hashing.ts", contents: HASHING_HELPER }]);
    expect(rules(report)).toContain("RUNNER_ENTRY_MISSING");
  });

  it("names the one required call", () => {
    expect(REQUIRED_ACQUISITION_CALL).toBe("acquireProductionBrandEvidence");
    expect(AUTHORIZED_ADAPTER_MODULE).toBe("scripts/eval/lib/issue-149-candidate-adapter.ts");
  });
});
