/**
 * Issue #149 — the symbol-resolved Stage 2 source-closure analyzer.
 *
 * Non-OCR. Every closure here is synthetic source text; nothing is built or run.
 * Job A uses this same implementation, so the gate that will run before
 * acquisition is the gate these tests exercise.
 *
 * The cases are written against the ways the previous versions failed: a callee
 * NAME was treated as an identity, so a local function, an alias, a namespace
 * member and a second import under a different name all got through.
 */
import { describe, expect, it } from "vitest";

import {
  AUTHORIZED_ADAPTER_MODULE,
  PROHIBITED_SEALED_PACKAGE_OPERATIONS,
  REQUIRED_ACQUISITION_CALL,
  RUNNER_ENTRY_PATH,
  analyzeStage2SourceClosure,
  type Stage2SourceFile,
} from "../../../scripts/eval/lib/issue-149-stage2-source-closure";

/** A stand-in adapter that genuinely EXPORTS the authorized function. */
const ADAPTER: Stage2SourceFile = {
  path: AUTHORIZED_ADAPTER_MODULE,
  contents: `
import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";
export async function acquireProductionBrandEvidence(input) {
  const detailed = await extractLabelEvidenceDetailed(input);
  return { itemId: input.artifactRef, files: [], fileCount: 0 };
}
export function writeSealedEvidencePackage(sealed, options) { return sealed.fileCount; }
`,
};

const CLEAN_RUNNER = `
import { acquireProductionBrandEvidence, writeSealedEvidencePackage } from "./lib/issue-149-candidate-adapter";
export async function acquireItem(extractionInput) {
  const sealed = await acquireProductionBrandEvidence(extractionInput);
  return writeSealedEvidencePackage(sealed, { directory: outputDirectory });
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
  it("passes an authorized awaited call plus helpers that never touch evidence", () => {
    const hashing = `
import { createHash } from "node:crypto";
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function report(sealed) {
  return { id: sealed.itemId, count: sealed.fileCount, digest: sealed.aggregateSha256 };
}
`;
    const report = analyze([runner(CLEAN_RUNNER), helper(hashing, "hashing")]);
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.acquisitionCallSites).toEqual([RUNNER_ENTRY_PATH]);
  });

  it("resolves the authorized call through the TypeChecker, to a declaration", () => {
    // The identity is a DECLARATION in the adapter module, not a string.
    const report = analyze([runner(CLEAN_RUNNER)]);
    expect(report.authorizedSymbolDeclaredIn).toBe(AUTHORIZED_ADAPTER_MODULE);
    expect(report.writerSymbolDeclaredIn).toBe(AUTHORIZED_ADAPTER_MODULE);
    expect(report.writerCallSites).toEqual([RUNNER_ENTRY_PATH]);

    // The analyzer's own source must actually ask the checker. A previous
    // version created a Program and then never used it.
    const source = analyzeStage2SourceClosure.toString();
    expect(source).not.toContain("adapterModulePath");
    expect(source).not.toContain("endsWith");
    // The always-true traversal condition is gone.
    expect(source).not.toContain(["isAdapter ", "|| true"].join(""));
  });

  describe("a name is not a binding", () => {
    it("rejects a LOCAL function with the authorized name", () => {
      const local = `
function acquireProductionBrandEvidence(input) { return { ok: true }; }
export async function acquireItem(extractionInput) {
  return await acquireProductionBrandEvidence(extractionInput);
}
`;
      const report = analyze([runner(local)]);
      expect(rules(report)).toContain("RUNNER_DOES_NOT_IMPORT_ACQUISITION");
      expect(rules(report)).toContain("ACQUISITION_BINDING_SHADOWED");
      expect(rules(report)).toContain("RUNNER_DOES_NOT_INVOKE_ACQUISITION");
    });

    it("rejects an import of the authorized name from the WRONG module", () => {
      const wrong = `
import { acquireProductionBrandEvidence } from "@/unreviewed/helper";
export async function acquireItem(i) { return await acquireProductionBrandEvidence(i); }
`;
      expect(rules(analyze([runner(wrong)]))).toContain("ACQUISITION_BINDING_NOT_FROM_ADAPTER");
    });

    it("rejects a module whose basename or suffix merely RESEMBLES the adapter", () => {
      for (const specifier of [
        "./lib/issue-149-candidate-adapter-v2",
        "@/vendor/scripts/eval/lib/issue-149-candidate-adapter",
        "./issue-149-candidate-adapter",
      ]) {
        const lookalike = `
import { acquireProductionBrandEvidence } from "${specifier}";
export const go = async (i) => await acquireProductionBrandEvidence(i);
`;
        const report = analyze([runner(lookalike)]);
        expect(rules(report)).toContain("ACQUISITION_BINDING_NOT_FROM_ADAPTER");
      }
    });

    it("rejects a type-only adapter import", () => {
      const typeOnly = `
import type { acquireProductionBrandEvidence } from "./lib/issue-149-candidate-adapter";
export const go = async (i) => await acquireProductionBrandEvidence(i);
`;
      expect(rules(analyze([runner(typeOnly)]))).toContain("ACQUISITION_IMPORT_IS_TYPE_ONLY");
    });

    describe("shadowing, in every binding position", () => {
      const shadows: Array<[string, string]> = [
        [
          "function parameter",
          "export const go = (acquireProductionBrandEvidence) => acquireProductionBrandEvidence(1);",
        ],
        [
          "catch binding",
          "export function go() { try { run(); } catch (acquireProductionBrandEvidence) { log(acquireProductionBrandEvidence); } }",
        ],
        [
          "block-local declaration",
          "export function go() { { const acquireProductionBrandEvidence = fake; use(acquireProductionBrandEvidence); } }",
        ],
        [
          "destructured declaration",
          "export function go(bag) { const { acquireProductionBrandEvidence } = bag; use(acquireProductionBrandEvidence); }",
        ],
      ];

      for (const [name, statement] of shadows) {
        it(`rejects ${name} shadowing`, () => {
          const shadowed = `
import { acquireProductionBrandEvidence } from "./lib/issue-149-candidate-adapter";
${statement}
export const acquire = async (i) => await acquireProductionBrandEvidence(i);
`;
          expect(rules(analyze([runner(shadowed)]))).toContain("ACQUISITION_BINDING_SHADOWED");
        });
      }
    });
  });

  describe("aliases, namespaces and re-exports do not change identity", () => {
    it("rejects an aliased ACQUISITION call outside the runner", () => {
      // The exact bypass the name map allowed: the callee text is `run`, which
      // is neither the authorized name nor a prohibited one.
      const aliased = `
import { acquireProductionBrandEvidence as run } from "./issue-149-candidate-adapter";
export const hidden = (input) => run(input);
`;
      const report = analyze([runner(CLEAN_RUNNER), helper(aliased, "hidden")]);
      expect(rules(report)).toContain("ACQUISITION_INVOKED_OUTSIDE_RUNNER");
    });

    it("counts TWO imports of the authorized function under different names", () => {
      // Previously reported as one call.
      const twice = `
import {
  acquireProductionBrandEvidence,
  acquireProductionBrandEvidence as again,
} from "./lib/issue-149-candidate-adapter";
export async function go(extractionInput) {
  await acquireProductionBrandEvidence(extractionInput);
  await again(extractionInput);
}
`;
      expect(rules(analyze([runner(twice)]))).toContain(
        "RUNNER_INVOKES_ACQUISITION_MORE_THAN_ONCE",
      );
    });

    it("rejects a re-export of the authorized function through a helper", () => {
      const reexport = `
export { acquireProductionBrandEvidence } from "./issue-149-candidate-adapter";
`;
      const caller = `
import { acquireProductionBrandEvidence } from "./reexport";
export const go = async (i) => await acquireProductionBrandEvidence(i);
`;
      const report = analyze([
        runner(CLEAN_RUNNER),
        helper(reexport, "reexport"),
        helper(caller, "caller"),
      ]);
      expect(rules(report)).toContain("ACQUISITION_INVOKED_OUTSIDE_RUNNER");
    });

    it("rejects an ALIASED extractor call", () => {
      const aliased = `
import { extractLabelEvidenceDetailed as run } from "@/pipeline/extractor/extractor";
export const go = (i) => run(i);
`;
      const report = analyze([runner(CLEAN_RUNNER), helper(aliased, "aliased")]);
      expect(rules(report)).toContain("PROHIBITED_CALL");
      expect(report.violations.some((v) => v.detail.includes("through the local name run"))).toBe(
        true,
      );
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
      expect(rules(analyze([runner(CLEAN_RUNNER), helper(aliased, "sel")]))).toContain(
        "PROHIBITED_CALL",
      );
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

    it("does not claim the identifier holds a valid ExtractionInput", () => {
      // The source gate proves the ARGUMENT is an identifier. Whether it holds a
      // well-formed, correctly identified input is a runtime property, checked
      // by the public API itself — which now also rejects a package-shaped
      // object at the writer. Two controls, stated separately.
      const anything = `
import { acquireProductionBrandEvidence, writeSealedEvidencePackage } from "./lib/issue-149-candidate-adapter";
export const go = async () => {
  const nonsense = 42;
  const sealed = await acquireProductionBrandEvidence(nonsense);
  return writeSealedEvidencePackage(sealed, { directory: outputDirectory });
};
`;
      expect(analyze([runner(anything)]).violations).toEqual([]);
    });

    it("rejects a missing call", () => {
      expect(rules(analyze([runner("export const go = () => null;")]))).toContain(
        "RUNNER_DOES_NOT_INVOKE_ACQUISITION",
      );
    });
  });

  describe("a sealed package is written whole or not at all", () => {
    const attempts: Array<[string, string, string]> = [
      [
        "filter",
        "return sealed.files.filter((f) => f.byteLength > 0);",
        "SEALED_PACKAGE_PROJECTED",
      ],
      ["slice", "return sealed.files.slice(0, 1);", "SEALED_PACKAGE_PROJECTED"],
      ["map", "return sealed.files.map((f) => f.path);", "SEALED_PACKAGE_PROJECTED"],
      ["spread and reverse", "return [...sealed.files].reverse();", "SEALED_PACKAGE_PROJECTED"],
      ["single-file write", "return write(sealed.files[0]);", "SEALED_PACKAGE_PROJECTED"],
      [
        "JSON.parse of sealed bytes",
        "return JSON.parse(sealed.files[0].bytes);",
        "SEALED_EVIDENCE_PARSED",
      ],
    ];

    for (const [name, statement, rule] of attempts) {
      it(`rejects ${name}`, () => {
        const report = analyze([
          runner(CLEAN_RUNNER),
          helper(
            `export function handle(sealed, write) { ${statement} }`,
            `p-${name.replace(/\W/g, "")}`,
          ),
        ]);
        expect(rules(report)).toContain(rule);
      });
    }

    it("permits reading counts, digests and status metadata", () => {
      const reader = `
export function summarize(sealed, logger) {
  logger.info("acquired", sealed.itemId, sealed.outcome);
  const total = sealed.fileCount + sealed.totalBytes;
  return { digest: sealed.aggregateSha256, total, failed: sealed.outcome !== "extracted" };
}
`;
      expect(analyze([runner(CLEAN_RUNNER), helper(reader, "reader")]).violations).toEqual([]);
    });

    it("rejects a writer call outside the runner, even passing the whole package", () => {
      // Delegating persistence to a helper is how a second, unauthenticated
      // write route gets introduced. The writer call stays in the runner.
      const passthrough = `
import { writeSealedEvidencePackage } from "./issue-149-candidate-adapter";
export const persist = (sealed, directory) => writeSealedEvidencePackage(sealed, { directory });
`;
      expect(rules(analyze([runner(CLEAN_RUNNER), helper(passthrough, "persist")]))).toContain(
        "WRITER_INVOKED_OUTSIDE_AUTHORIZED_LOCATION",
      );
    });

    it("permits unrelated helpers that happen to project their own arrays", () => {
      const unrelated = `
export function plan(items) {
  const chosen = items.filter((item) => item.enabled).map((item) => item.id);
  return [...chosen].sort();
}
`;
      expect(analyze([runner(CLEAN_RUNNER), helper(unrelated, "plan")]).violations).toEqual([]);
    });

    it("names the operations it rejects, rather than implying mutation is enough", () => {
      for (const operation of ["filter", "slice", "map", "concat"]) {
        expect(PROHIBITED_SEALED_PACKAGE_OPERATIONS).toContain(operation);
      }
    });
  });

  describe("the authenticated writer is the only persistence route", () => {
    it("requires the acquired package to be written, exactly once", () => {
      const neverWritten = `
import { acquireProductionBrandEvidence } from "./lib/issue-149-candidate-adapter";
export const go = async (extractionInput) => await acquireProductionBrandEvidence(extractionInput);
`;
      expect(rules(analyze([runner(neverWritten)]))).toContain(
        "RUNNER_DOES_NOT_WRITE_THE_SEALED_PACKAGE",
      );

      const twice = `${CLEAN_RUNNER}
export const again = (sealed) => writeSealedEvidencePackage(sealed, { directory: elsewhere });
`;
      expect(rules(analyze([runner(twice)]))).toContain("SEALED_PACKAGE_WRITTEN_MORE_THAN_ONCE");
    });

    it("resolves the writer by symbol: alias, namespace and re-export all fail", () => {
      const aliased = `
import { writeSealedEvidencePackage as put } from "./issue-149-candidate-adapter";
export const persist = (sealed) => put(sealed, { directory });
`;
      expect(rules(analyze([runner(CLEAN_RUNNER), helper(aliased, "walias")]))).toContain(
        "WRITER_INVOKED_OUTSIDE_AUTHORIZED_LOCATION",
      );

      const namespaced = `
import * as adapter from "./issue-149-candidate-adapter";
export const persist = (sealed) => adapter.writeSealedEvidencePackage(sealed, { directory });
`;
      const namespaceReport = analyze([runner(CLEAN_RUNNER), helper(namespaced, "wns")]);
      expect(rules(namespaceReport)).toContain("WRITER_INVOKED_OUTSIDE_AUTHORIZED_LOCATION");

      const reexport = `export { writeSealedEvidencePackage } from "./issue-149-candidate-adapter";`;
      const caller = `
import { writeSealedEvidencePackage } from "./wreexport";
export const persist = (sealed) => writeSealedEvidencePackage(sealed, { directory });
`;
      expect(
        rules(
          analyze([runner(CLEAN_RUNNER), helper(reexport, "wreexport"), helper(caller, "wcaller")]),
        ),
      ).toContain("WRITER_INVOKED_OUTSIDE_AUTHORIZED_LOCATION");
    });

    it("rejects a direct filesystem write, named or through a namespace", () => {
      const direct = `
import { writeFileSync } from "node:fs";
export const persist = (target, bytes) => writeFileSync(target, bytes);
`;
      expect(rules(analyze([runner(CLEAN_RUNNER), helper(direct, "fsdirect")]))).toContain(
        "UNAUTHENTICATED_EVIDENCE_WRITE",
      );

      const namespaced = `
import * as fs from "node:fs";
export const persist = (target, bytes) => fs.createWriteStream(target).end(bytes);
`;
      expect(rules(analyze([runner(CLEAN_RUNNER), helper(namespaced, "fsns")]))).toContain(
        "UNAUTHENTICATED_EVIDENCE_WRITE",
      );

      const aliased = `
import { writeFileSync as emit } from "node:fs";
export const persist = (target, bytes) => emit(target, bytes);
`;
      expect(rules(analyze([runner(CLEAN_RUNNER), helper(aliased, "fsalias")]))).toContain(
        "UNAUTHENTICATED_EVIDENCE_WRITE",
      );
    });

    it("follows a DESTRUCTURED alias of the sealed file list", () => {
      // The rename the property-name rule could not see.
      const destructured = `
export function handle(sealed) {
  const { files: parts } = sealed;
  return parts.slice(0, 1);
}
`;
      expect(
        rules(analyze([runner(CLEAN_RUNNER), helper(destructured, "destructured")])),
      ).toContain("SEALED_PACKAGE_PROJECTED");
    });

    it("does not claim source analysis proves data lineage", () => {
      // A renamed value passed through a function boundary is beyond what source
      // text can establish, and this is stated rather than papered over. The
      // control that catches it is RUNTIME package authenticity: a package-shaped
      // object is refused by the writer regardless of how it was constructed.
      const laundered = `
export const hide = (parts) => parts.slice(0, 1);
export function handle(sealed) { return hide(sealed.fileCount === 0 ? [] : takeList(sealed)); }
`;
      const report = analyze([runner(CLEAN_RUNNER), helper(laundered, "laundered")]);
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
      expect(
        rules(analyze([runner(CLEAN_RUNNER), helper("export function ( {{{", "broken")])),
      ).toContain("PARSE_ERROR");
    });

    it("reports a missing runner, adapter or adapter export", () => {
      expect(
        analyzeStage2SourceClosure({ files: [ADAPTER] }).violations.map((v) => v.rule),
      ).toContain("RUNNER_ENTRY_MISSING");
      expect(
        analyzeStage2SourceClosure({ files: [runner(CLEAN_RUNNER)] }).violations.map((v) => v.rule),
      ).toContain("ADAPTER_MODULE_MISSING");
      const noExports = analyzeStage2SourceClosure({
        files: [
          { path: AUTHORIZED_ADAPTER_MODULE, contents: "export const nothing = 1;" },
          runner(CLEAN_RUNNER),
        ],
      }).violations.map((v) => v.rule);
      expect(noExports).toContain("ADAPTER_EXPORT_MISSING");
      expect(noExports).toContain("WRITER_EXPORT_MISSING");
    });

    it("exempts the adapter, which defines the machinery", () => {
      expect(analyze([runner(CLEAN_RUNNER)]).violations).toEqual([]);
      expect(ADAPTER.contents).toContain("extractLabelEvidenceDetailed");
    });

    it("freezes the runner and adapter paths, with no caller override", () => {
      expect(RUNNER_ENTRY_PATH).toBe("scripts/eval/issue-149-brand-evidence-acquisition-run.ts");
      expect(AUTHORIZED_ADAPTER_MODULE).toBe("scripts/eval/lib/issue-149-candidate-adapter.ts");
      expect(REQUIRED_ACQUISITION_CALL).toBe("acquireProductionBrandEvidence");
    });
  });
});
