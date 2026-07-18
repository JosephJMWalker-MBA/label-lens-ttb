// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { loadEvalManifest } from "./eval-loader";
import {
  PRODUCTION_ANALYZER_PARITY_SCHEMA_VERSION,
  PRODUCTION_PARITY_FIXTURE_PATH,
  productionParityBytes,
  productionParityDigest,
  type ProductionAnalyzerParityFixture,
} from "./production-parity";

function loadFixture(): ProductionAnalyzerParityFixture {
  return JSON.parse(readFileSync(PRODUCTION_PARITY_FIXTURE_PATH, "utf8"));
}

describe("production analyzer parity fixture", () => {
  it("covers every included case exactly once with verified bytes", () => {
    const fixture = loadFixture();
    const manifest = loadEvalManifest();
    expect(fixture.schemaVersion).toBe(PRODUCTION_ANALYZER_PARITY_SCHEMA_VERSION);
    expect(fixture.baseCommit).toBe("d54e3b2506de9220d2f0cd602d44b3a82c42fd58");
    expect(fixture.caseCount).toBe(manifest.cases.length);
    expect(new Set(fixture.records.map((record) => record.caseId)).size).toBe(fixture.caseCount);
    for (const record of fixture.records) {
      const bytes = productionParityBytes(record);
      expect(record.sha256, record.caseId).toBe(productionParityDigest(bytes));
      expect(record.byteLength, record.caseId).toBe(Buffer.byteLength(bytes));
    }
  });

  it("contains analyzer output only, without fixture truth or absolute paths", () => {
    const serialized = JSON.stringify(loadFixture());
    expect(serialized).not.toContain("acceptablePresentations");
    expect(serialized).not.toContain("acceptablePercents");
    expect(serialized).not.toContain(process.cwd());
  });
});
