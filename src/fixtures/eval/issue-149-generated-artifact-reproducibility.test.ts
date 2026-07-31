/**
 * Issue #149 — the freeze script must reproduce its own committed artifacts.
 *
 * Non-OCR. Check mode writes only into `.local/`, touches no tracked artifact and
 * no real staging directory, and runs no recognizer.
 *
 * Job A is preregistered to rerun the freeze script and require bit-for-bit
 * reproduction of the committed outputs. Amendment 6 corrected the committed ID
 * map but not its generator, so Job A would have had to either fail or overwrite
 * reviewed artifacts with superseded metadata. This test is the standing guard
 * against that class of divergence.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT = "scripts/eval/issue-149-brand-evidence-acquisition-freeze.mjs";
const ROOT = "artifacts/issue-149-brand-complete-evidence-acquisition";
const GENERATED = [
  `${ROOT}/truth-free-input-manifest.json`,
  `${ROOT}/population-freeze.json`,
  `${ROOT}/post-freeze/id-map.json`,
];

function runCheck(): { status: string; [key: string]: unknown } {
  const stdout = execFileSync("node", [SCRIPT, "--check"], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout) as { status: string };
}

describe("Issue #149 Stage 1 generated-artifact reproducibility", () => {
  it("reproduces all three committed artifacts byte-for-byte", () => {
    const before = GENERATED.map((file) => readFileSync(path.join(process.cwd(), file)));

    const report = runCheck() as {
      status: string;
      artifactsCompared: string[];
      byteIdentical: boolean;
      trackedArtifactsModified: boolean;
      realStagingDirectoryModified: boolean;
      ocrRun: boolean;
    };

    expect(report.status).toBe("STAGE_1_GENERATED_ARTIFACTS_REPRODUCIBLE");
    expect(report.byteIdentical).toBe(true);
    expect(report.ocrRun).toBe(false);
    expect(report.artifactsCompared).toEqual([
      "truth-free-input-manifest.json",
      "population-freeze.json",
      "post-freeze/id-map.json",
    ]);

    // Check mode must not have rewritten what it was comparing against.
    const after = GENERATED.map((file) => readFileSync(path.join(process.cwd(), file)));
    after.forEach((bytes, index) => expect(bytes.equals(before[index])).toBe(true));
    expect(report.trackedArtifactsModified).toBe(false);
    expect(report.realStagingDirectoryModified).toBe(false);
  }, 180_000);

  it("leaves no scratch directory behind", () => {
    expect(existsSync(path.join(process.cwd(), ".local/issue-149-freeze-check"))).toBe(false);
  });

  it("uses one implementation for staging and for checking", () => {
    // Two separately maintained serializers would let the check pass while the
    // real staging path drifted. Both entry points call `generate(out)`; only the
    // output root differs.
    const source = readFileSync(path.join(process.cwd(), SCRIPT), "utf8");
    expect(source).toMatch(/function generate\(out\)/);
    expect(source.match(/generate\(\s*\{/g) ?? []).toHaveLength(1);
    expect(source).toMatch(/result = generate\(out\)/);
    expect(source.match(/writeJson\(/g) ?? []).toHaveLength(3);
    expect(source).toMatch(/if \(process\.argv\.includes\("--check"\)\) check\(\);/);
  });

  it("halts with the preregistered code on drift", () => {
    const source = readFileSync(path.join(process.cwd(), SCRIPT), "utf8");
    expect(source).toContain("STAGE_1_GENERATED_ARTIFACT_DRIFT");
  });

  it("reads the forbidden-key inventory from the canonical asset", () => {
    // Not from a list maintained inside the script; a second list is a second
    // source of truth.
    const source = readFileSync(path.join(process.cwd(), SCRIPT), "utf8");
    expect(source).toContain('path.join(ROOT, "runtime/truth-key-inventory.json")');
    expect(source).toContain("forbiddenEvidenceKeys()");
    // The superseded inline substring list is gone.
    expect(source).not.toContain('["truth", "acceptable", "brandPresent", "expected"');
  });

  it("generates the corrected id-map boundary and none of the obsolete aliases", () => {
    const source = readFileSync(path.join(process.cwd(), SCRIPT), "utf8");
    for (const key of [
      "trustedStagingMayReadGenerateAndVerify",
      "mountedIntoIsolatedDiscovery",
      "mountedIntoIsolatedExecution",
      "importedByAcquisitionCode",
      "physicalInaccessibilityClaimed",
    ]) {
      expect(source).toContain(key);
    }
    // The obsolete keys appear only inside the comment explaining their removal.
    const boundary = source.slice(
      source.indexOf("const ID_MAP_ACCESS_BOUNDARY = {"),
      source.indexOf("const sha256 ="),
    );
    for (const obsolete of [
      "readableOnlyAfter",
      "mountedIntoAcquisition",
      "importedByAcquisitionHarness",
    ]) {
      expect(boundary).not.toContain(obsolete);
    }
  });
});
