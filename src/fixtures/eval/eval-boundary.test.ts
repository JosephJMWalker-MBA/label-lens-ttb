// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Architectural guard for the evaluation tooling: the extractor and production
 * service can neither import nor be influenced by the evaluation truth. This
 * complements `src/fixtures/truth-boundary.test.ts` (which covers the corpus
 * index and fixture manifests) with the eval-manifest modules.
 */

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") return [];
      return sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const ALL = sourceFiles(SRC);
const rel = (f: string) => f.slice(process.cwd().length + 1);
const isTest = (f: string) => f.includes(".test.");
const isEvalTooling = (f: string) => f.includes(join("src", "fixtures", "eval"));

function importsOf(source: string): string[] {
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

const EVAL_MODULE =
  /eval-manifest|eval-harness|eval-loader|eval-report|fixtures\/eval|live-baseline/;

describe("evaluation truth is imported only by the eval tooling and its tests", () => {
  it("no production module imports any evaluation module", () => {
    const production = ALL.filter((f) => !isTest(f) && !isEvalTooling(f));
    for (const file of production) {
      for (const path of importsOf(readFileSync(file, "utf8"))) {
        expect(path, `${rel(file)} imports evaluation module ${path}`).not.toMatch(EVAL_MODULE);
      }
    }
  });

  it("the extractor and pre-check service never reference the evaluation harness", () => {
    const critical = ALL.filter(
      (f) =>
        !isTest(f) &&
        (f.includes(join("pipeline", "extractor")) ||
          f.includes(join("server", "precheck-service")) ||
          f.includes(join("pipeline", "precheck"))),
    );
    expect(critical.length).toBeGreaterThan(0);
    for (const file of critical) {
      expect(readFileSync(file, "utf8")).not.toMatch(EVAL_MODULE);
    }
  });
});
