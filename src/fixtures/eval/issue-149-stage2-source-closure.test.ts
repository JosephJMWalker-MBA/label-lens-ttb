/**
 * Issue #149 — the symbol-resolved Stage 2 source-closure analyzer.
 *
 * Non-OCR. Every closure here is synthetic source text; nothing is built or run.
 * Job A uses this same implementation, so the gate that will run before
 * acquisition is the gate these tests exercise.
 *
 * The previous version matched callee NAMES. These tests are written against the
 * ways that failed: a local function with the authorized name, an alias, a
 * namespace call, and an import from an unreviewed module.
 */
import { describe, expect, it } from "vitest";

import {
  AUTHORIZED_ADAPTER_MODULE,
  REQUIRED_ACQUISITION_CALL,
  RUNNER_ENTRY_PATH,
  analyzeStage2SourceClosure,
  type Stage2SourceFile,
} from "../../../scripts/eval/lib/issue-149-stage2-source-closure";

const ADAPTER: Stage2SourceFile = {
  path: AUTHORIZED_ADAPTER_MODULE,
  contents:
    'import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";\nexport async function acquireProductionBrandEvidence(input) { return extractLabelEvidenceDetailed(input); }',
};

const CLEAN_RUNNER = `
import { acquireProductionBrandEvidence } from "./lib/issue-149-candidate-adapter";
export async function acquireItem(extractionInput) {
  const evidence = await acquireProductionBrandEvidence(extractionInput);
  if (!evidence.ok) return persistFailure(evidence.error);
  persistPasses(evidence.value.detailed.debug.passes);
  persistCandidates(evidence.value.candidateRecords);
}
`;

const HASHING_HELPER = `
import { createHash } from "node:crypto";
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function writeManifest(files) {
  const entries = [];
  entries.push({ path: files[0].path });
  return entries;
}
`;

const runner = (contents: string): Stage2SourceFile => ({ path: RUNNER_ENTRY_PATH, contents });
const helper = (contents: string, name = "helper"): Stage2SourceFile => ({
  path: `scripts/eval/lib/${name}.ts`,
  contents,
});

const analyze = (files: Stage2SourceFile[]) =>
  analyzeStage2SourceClosure({ files: [ADAPTER, ...files] });
const rules = (report: ReturnType<typeof analyze>) => report.violations.map((v) => v.rule);

describe("Issue #149 Stage 2 source-closure analyzer", () => {
  it("passes an authorized awaited call plus helpers that never call the API", () => {
    const report = analyze([runner(CLEAN_RUNNER), helper(HASHING_HELPER, "hashing")]);
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.acquisitionCallSites).toEqual([RUNNER_ENTRY_PATH]);
  });

  describe("a name is not a binding", () => {
    it("rejects a LOCAL function with the authorized name", () => {
      const local = `
function acquireProductionBrandEvidence(input) { return { ok: true }; }
export async function acquireItem(extractionInput) {
  const evidence = await acquireProductionBrandEvidence(extractionInput);
  return evidence;
}
`;
      const report = analyze([runner(local)]);
      expect(rules(report)).toContain("RUNNER_DOES_NOT_IMPORT_ACQUISITION");
      expect(rules(report)).toContain("ACQUISITION_BINDING_SHADOWED");
      expect(rules(report)).toContain("RUNNER_DOES_NOT_INVOKE_ACQUISITION");
    });

    it("rejects an import from the wrong module", () => {
      const wrong = `
import { acquireProductionBrandEvidence } from "./unreviewed-helper";
export async function acquireItem(i) { return await acquireProductionBrandEvidence(i); }
`;
      expect(rules(analyze([runner(wrong)]))).toContain("ACQUISITION_BINDING_NOT_FROM_ADAPTER");
    });

    it("rejects a type-only adapter import", () => {
      const typeOnly = `
import type { acquireProductionBrandEvidence } from "./lib/issue-149-candidate-adapter";
export async function acquireItem(i) { return await acquireProductionBrandEvidence(i); }
`;
      expect(rules(analyze([runner(typeOnly)]))).toContain("ACQUISITION_IMPORT_IS_TYPE_ONLY");
    });

    it("rejects a locally shadowed authorized binding", () => {
      const shadowed = `
import { acquireProductionBrandEvidence } from "./lib/issue-149-candidate-adapter";
const acquireProductionBrandEvidence2 = acquireProductionBrandEvidence;
function acquireProductionBrandEvidence(i) { return { ok: true }; }
export async function acquireItem(i) { return await acquireProductionBrandEvidence(i); }
`;
      expect(rules(analyze([runner(shadowed)]))).toContain("ACQUISITION_BINDING_SHADOWED");
    });
  });

  describe("aliases and namespaces do not evade the prohibition", () => {
    it("rejects an ALIASED extractor call", () => {
      const aliased = `
import { extractLabelEvidenceDetailed as run } from "@/pipeline/extractor/extractor";
export const go = (i) => run(i);
`;
      const report = analyze([runner(CLEAN_RUNNER), helper(aliased, "aliased")]);
      expect(rules(report)).toContain("PROHIBITED_CALL");
      expect(report.violations.some((v) => v.detail.includes("through the alias run"))).toBe(true);
    });

    it("rejects a NAMESPACE extractor call", () => {
      const namespaced = `
import * as extractor from "@/pipeline/extractor/extractor";
export const go = (i) => extractor.extractLabelEvidenceDetailed(i);
`;
      const report = analyze([runner(CLEAN_RUNNER), helper(namespaced, "ns")]);
      expect(report.violations.some((v) => v.detail.includes("namespace import"))).toBe(true);
    });

    it("rejects an aliased selector call", () => {
      const aliased = `
import { selectBrandObservationWithCompleteFilterDiagnostics as pick } from "@/pipeline/extractor/field-selection";
export const s = (p) => pick(p);
`;
      const report = analyze([runner(CLEAN_RUNNER), helper(aliased, "sel")]);
      expect(rules(report)).toContain("PROHIBITED_CALL");
    });
  });

  describe("the required call's shape", () => {
    it("rejects an un-awaited call", () => {
      const notAwaited = `
import { acquireProductionBrandEvidence } from "./lib/issue-149-candidate-adapter";
export const go = (i) => { const p = acquireProductionBrandEvidence(i); return p; };
`;
      expect(rules(analyze([runner(notAwaited)]))).toContain("ACQUISITION_CALL_NOT_AWAITED");
    });

    it("rejects a literal or constructed argument", () => {
      for (const argument of ['{ artifactRef: "item-0001" }', '"item-0001"', "a, b"]) {
        const bad = `
import { acquireProductionBrandEvidence } from "./lib/issue-149-candidate-adapter";
export const go = async () => await acquireProductionBrandEvidence(${argument});
`;
        expect(rules(analyze([runner(bad)]))).toContain("ACQUISITION_CALL_ARGUMENT_INVALID");
      }
    });

    it("rejects a missing, duplicated or misplaced call", () => {
      expect(rules(analyze([runner("export const go = () => null;")]))).toContain(
        "RUNNER_DOES_NOT_INVOKE_ACQUISITION",
      );
      const twice = `${CLEAN_RUNNER}\nexport const again = async (i) => await acquireProductionBrandEvidence(i);`;
      expect(rules(analyze([runner(twice)]))).toContain(
        "RUNNER_INVOKES_ACQUISITION_MORE_THAN_ONCE",
      );
      const elsewhere = `
import { acquireProductionBrandEvidence } from "./issue-149-candidate-adapter";
export const go = async (i) => await acquireProductionBrandEvidence(i);
`;
      expect(rules(analyze([runner(CLEAN_RUNNER), helper(elsewhere, "sneaky")]))).toContain(
        "ACQUISITION_INVOKED_OUTSIDE_RUNNER",
      );
    });
  });

  describe("protected-evidence mutation, in every form", () => {
    const mutations: Array<[string, string]> = [
      ["direct assignment", "e.value.detailed.debug.passes = [];"],
      ["bracket assignment", 'e.value.detailed.debug["passes"] = [];'],
      ["compound assignment", "e.value.candidateRecords.length += 0;"],
      ["delete", "delete e.value.diagnosticSelection.brandDiagnostics;"],
      ["Object.assign", "Object.assign(e.value.diagnosticSelection.brandDiagnostics, {});"],
      ["Reflect.set", "Reflect.set(e.value.detailed.debug.passes, 0, null);"],
      ["push", "e.value.detailed.debug.passes.push(extra);"],
      ["splice", "e.value.candidateRecords.splice(0, 1);"],
      ["sort", "e.value.candidateRecords.sort(byScore);"],
      ["reverse", "e.value.detailed.debug.passes.reverse();"],
      ["fill", "e.value.candidateRecords.fill(null);"],
      ["shift", "e.value.detailed.debug.passes.shift();"],
    ];

    for (const [name, statement] of mutations) {
      it(`rejects ${name}`, () => {
        const report = analyze([
          runner(CLEAN_RUNNER),
          helper(
            `export function tamper(e, extra, byScore) { ${statement} }`,
            `m-${name.replace(/\W/g, "")}`,
          ),
        ]);
        expect(rules(report)).toContain("PROTECTED_EVIDENCE_MUTATED");
      });
    }

    it("permits reading, hashing and validating the evidence", () => {
      const reader = `
export function summarize(e) {
  const count = e.value.detailed.debug.passes.length;
  const texts = e.value.candidateRecords.map((r) => r.rawText);
  const first = e.value.diagnosticSelection.brandDiagnostics.candidates[0];
  return { count, texts, first };
}
`;
      const report = analyze([runner(CLEAN_RUNNER), helper(reader, "reader")]);
      expect(report.violations).toEqual([]);
    });

    it("permits unrelated objects that happen to use those property names", () => {
      // The previous detector rejected any object literal with a key named
      // `passes` or `candidates`, which would have failed ordinary helpers.
      const unrelated = `
export function summarizeRun(report) {
  const stats = { passes: 0, candidates: [] };
  stats.passes = report.total;
  stats.candidates.push(report.name);
  const config = { candidates: ["a"], passes: ["b"] };
  config.passes[0] = "c";
  return { stats, config };
}
`;
      const report = analyze([runner(CLEAN_RUNNER), helper(unrelated, "unrelated")]);
      expect(report.violations).toEqual([]);
    });
  });

  describe("closure hygiene", () => {
    it("rejects a duplicated file path", () => {
      const report = analyzeStage2SourceClosure({
        files: [ADAPTER, runner(CLEAN_RUNNER), runner(CLEAN_RUNNER)],
      });
      expect(rules(report)).toContain("DUPLICATE_FILE_PATH");
    });

    it("rejects malformed TypeScript", () => {
      const report = analyze([runner(CLEAN_RUNNER), helper("export function ( {{{", "broken")]);
      expect(rules(report)).toContain("PARSE_ERROR");
    });

    it("reports a missing runner or adapter", () => {
      expect(
        analyzeStage2SourceClosure({ files: [ADAPTER] }).violations.map((v) => v.rule),
      ).toContain("RUNNER_ENTRY_MISSING");
      expect(
        analyzeStage2SourceClosure({ files: [runner(CLEAN_RUNNER)] }).violations.map((v) => v.rule),
      ).toContain("ADAPTER_MODULE_MISSING");
    });

    it("exempts the adapter, which defines the machinery", () => {
      const report = analyze([runner(CLEAN_RUNNER)]);
      expect(report.violations).toEqual([]);
      expect(ADAPTER.contents).toContain("extractLabelEvidenceDetailed");
    });

    it("freezes the runner and adapter paths, with no caller override", () => {
      expect(RUNNER_ENTRY_PATH).toBe("scripts/eval/issue-149-brand-evidence-acquisition-run.ts");
      expect(AUTHORIZED_ADAPTER_MODULE).toBe("scripts/eval/lib/issue-149-candidate-adapter.ts");
      expect(REQUIRED_ACQUISITION_CALL).toBe("acquireProductionBrandEvidence");
      const analyzerSource = analyzeStage2SourceClosure.toString();
      expect(analyzerSource).not.toContain("adapterModulePath");
    });
  });
});
