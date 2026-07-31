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
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  EVAL_MANIFEST_PATH,
  FreezeError,
  PR217_PATH,
  PR218_PATH,
  compareGeneratedArtifacts,
  generateStageOneArtifacts,
} from "../../../scripts/eval/lib/issue-149-freeze-core.mjs";

const SCRIPT = "scripts/eval/issue-149-brand-evidence-acquisition-freeze.mjs";
const CORE = "scripts/eval/lib/issue-149-freeze-core.mjs";
const ROOT = "artifacts/issue-149-brand-complete-evidence-acquisition";
const REAL_STAGED = path.join(process.cwd(), ".local/issue-149-acquisition-inputs");

const read = (p: string): unknown => JSON.parse(readFileSync(path.join(process.cwd(), p), "utf8"));
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

  it("uses a unique temporary directory rather than one fixed scratch path", () => {
    const cli = readFileSync(path.join(process.cwd(), SCRIPT), "utf8");
    expect(cli).toContain("mkdtempSync");
    expect(cli).not.toContain(".local/issue-149-freeze-check");
    expect(existsSync(path.join(process.cwd(), ".local/issue-149-freeze-check"))).toBe(false);
  });

  it("uses one implementation for staging and for checking", () => {
    // Two separately maintained serializers would let the check pass while the
    // real staging path drifted. Both entry points call the shared core; the CLI
    // holds no generation logic of its own.
    const cli = readFileSync(path.join(process.cwd(), SCRIPT), "utf8");
    expect(cli).toContain("generateStageOneArtifacts");
    expect(cli.match(/generateStageOneArtifacts\(/g) ?? []).toHaveLength(2);
    expect(cli).not.toContain("writeJson");
    expect(cli).not.toContain("copyFileSync");

    const core = readFileSync(path.join(process.cwd(), CORE), "utf8");
    expect(core.match(/writeJson\(/g) ?? []).toHaveLength(3);
    expect(core).toMatch(/export function generateStageOneArtifacts/);
  });

  it("never calls process.exit from the core or the generation path", () => {
    // process.exit from inside a try terminates before finally can remove the
    // temporary staging tree, so cleanup was not actually guaranteed on failure.
    const core = readFileSync(path.join(process.cwd(), CORE), "utf8");
    // The call, not the word: the comment explains why the call is absent.
    expect(core).not.toContain("process.exit(");
    expect(core).toContain("throw new FreezeError");
    const cli = readFileSync(path.join(process.cwd(), SCRIPT), "utf8");
    expect(cli).not.toContain("process.exit(");
    expect(cli).toContain("process.exitCode = 1");
    expect(cli).toContain("mkdtempSync");
  });

  describe("intentional drift", () => {
    it("halts, reports the preregistered code, and still cleans up", () => {
      // A real failing check against deliberately mutated expected artifacts,
      // rather than a search for the halt-code string in the source.
      const scratch = mkdtempSync(path.join(tmpdir(), "issue-149-drift-expected-"));
      const before = GENERATED.map((file) => readFileSync(path.join(process.cwd(), file)));
      const stagedBefore = existsSync(REAL_STAGED) ? readdirSync(REAL_STAGED).sort() : "ABSENT";

      try {
        // Copy the committed artifacts, then flip one byte of one of them.
        const expected = {
          truthFreeInputManifest: path.join(scratch, "truth-free-input-manifest.json"),
          populationFreeze: path.join(scratch, "population-freeze.json"),
          idMap: path.join(scratch, "id-map.json"),
        };
        const sources = [
          `${ROOT}/truth-free-input-manifest.json`,
          `${ROOT}/population-freeze.json`,
          `${ROOT}/post-freeze/id-map.json`,
        ];
        Object.values(expected).forEach((destination, index) =>
          copyFileSync(path.join(process.cwd(), sources[index]), destination),
        );
        const mutated = readFileSync(expected.idMap);
        mutated[mutated.length - 2] = mutated[mutated.length - 2] === 0x20 ? 0x09 : 0x20;
        writeFileSync(expected.idMap, mutated);

        // Drive the REAL core and comparator, into their own temporary output.
        const generationRoot = mkdtempSync(path.join(tmpdir(), "issue-149-drift-generated-"));
        let thrown: unknown;
        try {
          const generated = generateStageOneArtifacts({
            pr217: read(PR217_PATH) as Parameters<typeof generateStageOneArtifacts>[0]["pr217"],
            pr218: read(PR218_PATH) as Parameters<typeof generateStageOneArtifacts>[0]["pr218"],
            evalManifest: read(EVAL_MANIFEST_PATH) as Parameters<
              typeof generateStageOneArtifacts
            >[0]["evalManifest"],
            loadSourceImage: (imagePath: string) =>
              readFileSync(path.join(process.cwd(), imagePath)),
            forbiddenEvidenceKeys: read(`${ROOT}/runtime/truth-key-inventory.json`) as string[],
            out: {
              root: path.join(generationRoot, "artifacts"),
              postFreeze: path.join(generationRoot, "artifacts/post-freeze"),
              staged: path.join(generationRoot, "staged"),
            },
          });
          compareGeneratedArtifacts({ generated: generated.written, expected });
        } catch (error) {
          thrown = error;
        } finally {
          rmSync(generationRoot, { recursive: true, force: true });
          expect(existsSync(generationRoot)).toBe(false);
        }

        expect(thrown).toBeInstanceOf(FreezeError);
        expect((thrown as InstanceType<typeof FreezeError>).code).toBe(
          "STAGE_1_GENERATED_ARTIFACT_DRIFT",
        );
        expect((thrown as InstanceType<typeof FreezeError>).ocrRun).toBe(false);
        const detail = (thrown as InstanceType<typeof FreezeError>).detail as Array<{
          artifact: string;
        }>;
        expect(detail.map((entry) => entry.artifact)).toEqual(["post-freeze/id-map.json"]);
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }

      // Tracked artifacts and the real staging directory are untouched.
      const after = GENERATED.map((file) => readFileSync(path.join(process.cwd(), file)));
      after.forEach((bytes, index) => expect(bytes.equals(before[index])).toBe(true));
      const stagedAfter = existsSync(REAL_STAGED) ? readdirSync(REAL_STAGED).sort() : "ABSENT";
      expect(stagedAfter).toEqual(stagedBefore);
    }, 180_000);

    it("returns a non-success status and exit code from the CLI on drift", () => {
      // The CLI boundary, exercised end to end against a mutated expected file.
      const backup = readFileSync(path.join(process.cwd(), `${ROOT}/population-freeze.json`));
      try {
        const mutated = Buffer.concat([backup, Buffer.from("\n")]);
        writeFileSync(path.join(process.cwd(), `${ROOT}/population-freeze.json`), mutated);

        let status = 0;
        let stderr = "";
        try {
          execFileSync("node", [SCRIPT, "--check"], {
            cwd: process.cwd(),
            encoding: "utf8",
            maxBuffer: 32 * 1024 * 1024,
            stdio: ["ignore", "pipe", "pipe"],
          });
        } catch (error) {
          const failure = error as { status?: number; stderr?: string };
          status = failure.status ?? 0;
          stderr = failure.stderr ?? "";
        }
        expect(status).toBe(1);
        const report = JSON.parse(stderr) as { status: string; reason: string; ocrRun: boolean };
        expect(report.status).toBe("HALTED");
        expect(report.reason).toBe("STAGE_1_GENERATED_ARTIFACT_DRIFT");
        expect(report.ocrRun).toBe(false);
      } finally {
        writeFileSync(path.join(process.cwd(), `${ROOT}/population-freeze.json`), backup);
      }
      // Restored byte-for-byte, so the success check still passes afterwards.
      expect(runCheck().status).toBe("STAGE_1_GENERATED_ARTIFACTS_REPRODUCIBLE");
    }, 300_000);
  });

  it("reads the forbidden-key inventory from the canonical asset", () => {
    // Not from a list maintained inside the script; a second list is a second
    // source of truth.
    const cli = readFileSync(path.join(process.cwd(), SCRIPT), "utf8");
    expect(cli).toContain('path.join(ROOT, "runtime/truth-key-inventory.json")');
    expect(cli).toContain("forbiddenEvidenceKeys");
    // The superseded inline substring list is gone.
    expect(cli).not.toContain('["truth", "acceptable", "brandPresent", "expected"');
  });

  it("generates the corrected id-map boundary and none of the obsolete aliases", () => {
    const source = readFileSync(path.join(process.cwd(), CORE), "utf8");
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
