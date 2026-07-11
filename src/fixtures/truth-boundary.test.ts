// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Architectural guard: fixture truth (the corpus index, its expectations, and
 * fixture manifests) is evaluation-only and must never be reachable from
 * production extraction or service code, nor accepted as an extractor input.
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
const isTest = (f: string) => f.includes(".test.");
/** The `src/fixtures` tree is test/evaluation tooling, not production code. */
const isFixtureTooling = (f: string) => f.includes(`${join("src", "fixtures")}${"/"}`);
const rel = (f: string) => f.slice(process.cwd().length + 1);

function importsOf(source: string): string[] {
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

const TRUTH_MODULE = /corpus-index|fixture-manifest/;

describe("truth-label boundary — production code never imports fixture truth", () => {
  const productionFiles = ALL.filter((f) => !isTest(f) && !isFixtureTooling(f));

  it("no production module imports the corpus index or fixture manifests", () => {
    for (const file of productionFiles) {
      for (const path of importsOf(readFileSync(file, "utf8"))) {
        expect(path, `${rel(file)} imports ${path}`).not.toMatch(TRUTH_MODULE);
      }
    }
  });

  it("the extractor and pre-check service do not import fixture truth", () => {
    const critical = productionFiles.filter(
      (f) =>
        f.includes(join("pipeline", "extractor")) ||
        f.includes(join("server", "precheck-service")) ||
        f.includes(join("pipeline", "precheck")),
    );
    expect(critical.length).toBeGreaterThan(0);
    for (const file of critical) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(TRUTH_MODULE);
      // Nor any expected-answer, corpus-tag, or fixture-id vocabulary.
      expect(source).not.toMatch(/expectedBrand|expectedAlcohol|corpusTags|fixtureTruth/);
    }
  });
});

describe("truth-label boundary — corpus truth is imported only by tests/evaluation", () => {
  it("every importer of the corpus index is a test or the fixtures tooling package", () => {
    for (const file of ALL) {
      const importsTruth = importsOf(readFileSync(file, "utf8")).some((p) =>
        /corpus-index/.test(p),
      );
      if (!importsTruth) continue;
      expect(isTest(file) || isFixtureTooling(file), `${rel(file)} imports corpus truth`).toBe(
        true,
      );
    }
  });
});

describe("truth-label boundary — the extractor signature carries no fixture truth", () => {
  it("ExtractionInput declares no expected-answer, id, hash-as-truth, or tag fields", () => {
    const types = readFileSync(join(SRC, "pipeline/extractor/extractor.types.ts"), "utf8");
    const start = types.indexOf("interface ExtractionInput");
    expect(start).toBeGreaterThan(-1);
    const block = types.slice(start, types.indexOf("}", start));
    for (const forbidden of [
      "expectedBrand",
      "expectedAlcohol",
      "expectedState",
      "fixtureId",
      "publicRecordId",
      "ttbId",
      "truthLabel",
      "corpusTag",
      "expectedEvidence",
    ]) {
      expect(block, `ExtractionInput must not accept ${forbidden}`).not.toContain(forbidden);
    }
  });
});
