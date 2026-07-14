// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src", "fixtures", "eval", "vision-observer", "local-vlm");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.") ? [full] : [];
  });
}

describe("local-vlm evaluation boundary", () => {
  it("imports no production OCR modules or selection logic", () => {
    for (const file of sourceFiles(ROOT)) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(
        /extractLabelEvidence|runOcrPass|createLocalOcrEngine|selectBrandObservation|selectAlcoholObservation/,
      );
    }
  });

  it("imports no evaluation truth or expected-answer vocabulary", () => {
    for (const file of sourceFiles(ROOT)) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(
        /expectedBrand|expectedAlcohol|fixtureTruth|corpus-index|ocr-region-benchmark.annotations|IncludedEvalRecord/,
      );
    }
  });
});
