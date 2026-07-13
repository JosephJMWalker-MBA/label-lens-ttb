import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "src/pipeline/extractor");
const SOURCE_FILES = readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

function sourceOf(file: string): string {
  return readFileSync(join(DIR, file), "utf8");
}

function importsOf(source: string): string[] {
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

describe("extractor boundary", () => {
  it("has source files to check", () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(0);
  });

  it("imports no cloud, external-AI, or network client", () => {
    for (const file of SOURCE_FILES) {
      for (const path of importsOf(sourceOf(file))) {
        expect(path).not.toMatch(
          /axios|node-fetch|undici|got|superagent|openai|@anthropic|@aws|aws-sdk|google-cloud|@azure|https?:\/\//,
        );
      }
    }
  });

  it("imports no report, UI, export, or disposition module", () => {
    for (const file of SOURCE_FILES) {
      for (const path of importsOf(sourceOf(file))) {
        expect(path).not.toMatch(/report|features|app\/|disposition|export|\/ui\b/);
      }
    }
  });

  it("emits no rule outcome from the extractor", () => {
    for (const file of SOURCE_FILES) {
      const source = sourceOf(file);
      expect(source).not.toMatch(/findingStatus|ruleExecutionStatus/);
      expect(source).not.toMatch(/["'](PASS|FAIL|NEEDS_REVIEW)["']/);
    }
  });

  it("contains no fixture-truth lookup or hash-to-answer mapping", () => {
    for (const file of SOURCE_FILES) {
      const source = sourceOf(file);
      // No expected answers hard-coded.
      expect(source).not.toMatch(/M\s*CELLARS/i);
      expect(source).not.toMatch(/12\.5/);
      // No manifest/truth lookup and no artifact-hash constant.
      expect(source).not.toMatch(/truthLabels|manifest\.json|0b0ccec1/i);
      expect(source).not.toMatch(
        /acceptablePresentations|declaredBrand|applicantDeclared|acceptablePercents|acceptableStatements|declaredAlcohol|applicationAlcoholValue/i,
      );
    }
  });
});
