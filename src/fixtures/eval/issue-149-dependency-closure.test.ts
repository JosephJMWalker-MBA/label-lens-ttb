/**
 * Issue #149 — the dependency-closure gate must be implementable.
 *
 * Non-OCR. No bundle is built and no runtime runs. These tests read the frozen
 * contracts and the real production source, and assert the gate would not halt
 * on the exact incumbent extractor it is required to run.
 *
 * Amendment 5 prohibited every transitive dependency under `src/domain/rules/**`
 * while the frozen route imports `field-selection.ts`, which imports
 * `@/domain/rules/wine-alcohol-parse` on its first line. Host preparation would
 * therefore have halted with `BUNDLE_PROHIBITED_DEPENDENCY` while bundling the
 * incumbent itself.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = "artifacts/issue-149-brand-complete-evidence-acquisition";
const PARSER = "src/domain/rules/wine-alcohol-parse.ts";
const FIELD_SELECTION = "src/pipeline/extractor/field-selection.ts";

const read = (p: string): unknown => JSON.parse(readFileSync(path.join(process.cwd(), p), "utf8"));
const sha256 = (p: string): string =>
  createHash("sha256")
    .update(readFileSync(path.join(process.cwd(), p)))
    .digest("hex");

/** Every `from "..."`, `require(...)` and dynamic `import(...)` specifier. */
function moduleSpecifiers(source: string): string[] {
  const found: string[] = [];
  for (const pattern of [
    /\bfrom\s+["'`]([^"'`]+)["'`]/g,
    /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  ]) {
    for (const match of source.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

describe("Issue #149 runtime dependency closure", () => {
  const isolation = read(path.join(ROOT, "acquisition-runtime-isolation-contract.json")) as {
    runtimeBundle: {
      dependencyClosureGate: {
        failIfAnyTransitiveSourceInputIsUnderOrDerivedFrom: string[];
        frozenExceptions: Array<{
          path: string;
          sha256: string;
          reason: string;
          transitiveImports: string[];
          isTheOnlyExceptionUnder: string;
        }>;
        productionSourceBaseDriftGate: {
          everyProductionRuntimeSourceInputMustMatchItsBytesAt: string;
          haltCode: string;
        };
      };
    };
  };
  const gate = isolation.runtimeBundle.dependencyClosureGate;
  const exception = gate.frozenExceptions.find((entry) => entry.path === PARSER);

  it("still prohibits src/domain/rules as a class", () => {
    expect(gate.failIfAnyTransitiveSourceInputIsUnderOrDerivedFrom).toContain(
      "src/domain/rules/**",
    );
  });

  it("freezes exactly one exception, for the parser the incumbent actually imports", () => {
    expect(gate.frozenExceptions).toHaveLength(1);
    expect(exception).toBeDefined();
    expect(exception!.isTheOnlyExceptionUnder).toBe("src/domain/rules/**");
    expect(exception!.reason.toLowerCase()).toContain("incumbent");
  });

  it("proves field-selection.ts really imports that exact parser", () => {
    const source = readFileSync(path.join(process.cwd(), FIELD_SELECTION), "utf8");
    const specifiers = moduleSpecifiers(source);
    expect(specifiers).toContain("@/domain/rules/wine-alcohol-parse");

    // And that it imports NO other rules module, so one exception is enough.
    const otherRules = specifiers.filter(
      (specifier) =>
        /(?:^|\/)domain\/rules\//.test(specifier.replace(/^@\//, "")) &&
        specifier !== "@/domain/rules/wine-alcohol-parse",
    );
    expect(otherRules).toEqual([]);
  });

  it("matches the parser's frozen content hash at the base commit", () => {
    expect(exception!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256(PARSER)).toBe(exception!.sha256);
  });

  it("records that the parser has no imports of its own", () => {
    const source = readFileSync(path.join(process.cwd(), PARSER), "utf8");
    expect(moduleSpecifiers(source)).toEqual([]);
    expect(exception!.transitiveImports).toEqual([]);
  });

  it("would reject a second rules module under the same closure contract", () => {
    // The exception is a path-and-hash allowlist of length one, so any other
    // rules module is outside it by construction. Prove that against the real
    // directory rather than a hypothetical.
    const rulesDir = readdirSync(path.join(process.cwd(), "src/domain/rules"));
    const otherModules = rulesDir
      .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
      .map((entry) => `src/domain/rules/${entry}`)
      .filter((modulePath) => modulePath !== PARSER);
    expect(otherModules.length).toBeGreaterThan(0);

    const allowed = new Set(gate.frozenExceptions.map((entry) => entry.path));
    for (const modulePath of otherModules) {
      expect(allowed.has(modulePath)).toBe(false);
    }
  });

  it("freezes a production-source base-drift gate", () => {
    const drift = gate.productionSourceBaseDriftGate;
    expect(drift.everyProductionRuntimeSourceInputMustMatchItsBytesAt).toBe(
      "546c3f279ce431a1fd8c0203df7a83553ea866ef",
    );
    expect(drift.haltCode).toBe("PRODUCTION_SOURCE_DRIFTED_FROM_BASE");
  });

  it("names the parser in the invocation contract's permitted imports", () => {
    const invocation = read(path.join(ROOT, "acquisition-invocation-contract.json")) as {
      permittedImports: string[];
      prohibitedRoute: { modules: string[] };
    };
    expect(invocation.permittedImports).toContain("src/domain/rules/wine-alcohol-parse");
    // The class-level prohibition stays in place alongside the exception.
    expect(invocation.prohibitedRoute.modules).toContain("src/domain/rules/**");
  });

  it("pins the parser in the incumbent configuration freeze", () => {
    const incumbent = read(path.join(ROOT, "incumbent-configuration-freeze.json")) as {
      mandatoryProductionDependencies: Array<{ path: string; sha256: string }>;
    };
    const pinned = incumbent.mandatoryProductionDependencies.find((entry) => entry.path === PARSER);
    expect(pinned).toBeDefined();
    expect(pinned!.sha256).toBe(sha256(PARSER));
  });
});
